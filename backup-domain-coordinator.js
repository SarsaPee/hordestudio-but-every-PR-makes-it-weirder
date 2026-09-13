/*
 * Host-level backup domain coordinator.
 *
 * Registered persistence domains remain opaque. The coordinator validates and
 * stages every participating domain before publishing any of them, and keeps a
 * tiny same-origin decision journal so an interrupted cross-database restore
 * has one unambiguous recovery outcome: roll back unless every commit and
 * readback finished and the coordinator durably recorded "commit".
 */
(function installBackupDomainCoordinator() {
    'use strict';

    const domains = new Map();
    const COORDINATOR_JOURNAL_KEY = 'horde_global_restore_coordinator_v1';
    let sealed = false;
    let activeOperation = null;

    function requireDomainDefinition(definition) {
        const id = String(definition?.id || '').trim();
        if (!/^[a-z][a-z0-9._-]{1,100}$/i.test(id)) throw new Error('Backup domain needs a safe id.');
        for (const name of [
            'serialize', 'validate', 'stage', 'quiesce', 'capturePreimage',
            'commit', 'rollback', 'readback', 'resume', 'recover'
        ]) {
            if (typeof definition?.[name] !== 'function') throw new Error(`Backup domain ${id} is missing ${name}().`);
        }
        return { ...definition, id, schemaVersion: Number(definition.schemaVersion) || 1 };
    }

    function readCoordinatorJournal() {
        try {
            const value = JSON.parse(localStorage.getItem(COORDINATOR_JOURNAL_KEY) || 'null');
            return value && value.version === 1 && typeof value.transactionId === 'string' ? value : null;
        } catch (error) {
            throw new Error(`The global restore decision journal cannot be read: ${error.message || error}`);
        }
    }

    function writeCoordinatorJournal(value) {
        try {
            localStorage.setItem(COORDINATOR_JOURNAL_KEY, JSON.stringify(value));
        } catch (error) {
            throw new Error(`The global restore decision journal cannot be persisted: ${error.message || error}`);
        }
    }

    function clearCoordinatorJournal() {
        try {
            localStorage.removeItem(COORDINATOR_JOURNAL_KEY);
        } catch (error) {
            throw new Error(`The global restore decision journal cannot be cleared: ${error.message || error}`);
        }
    }

    function requireIdle(action) {
        if (activeOperation) throw new Error(`Cannot ${action} while backup operation ${activeOperation} is active.`);
        if (readCoordinatorJournal()) throw new Error(`Cannot ${action} until the interrupted backup restore is recovered.`);
    }

    async function checksum(value) {
        const bytes = new TextEncoder().encode(JSON.stringify(value));
        const hash = await crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async function buildManifest(options = {}) {
        requireIdle('export a backup');
        activeOperation = 'export';
        try {
            const exportContext = Object.freeze({
                purpose: String(options?.purpose || 'portable-export').trim().slice(0, 80) || 'portable-export',
                includeCredentials: options?.includeCredentials === true
            });
            const payloads = {};
            for (const definition of domains.values()) {
                const payload = await definition.serialize(exportContext);
                payloads[definition.id] = {
                    schemaVersion: definition.schemaVersion,
                    checksum: await checksum(payload),
                    metadata: await definition.describe?.(payload, exportContext) || {},
                    payload
                };
            }
            return {
                _format: 'horde-studio-domain-backup',
                _version: 3,
                _exportedAt: new Date().toISOString(),
                backupId: crypto.randomUUID(),
                domains: payloads
            };
        } finally {
            activeOperation = null;
        }
    }

    async function prepare(manifest, { ids = null, diagnostic = false } = {}) {
        if (!manifest || manifest._format !== 'horde-studio-domain-backup' || ![2, 3].includes(Number(manifest._version))) {
            throw new Error('This is not a supported domain backup.');
        }
        const registeredIds = [...domains.keys()];
        const wantedIds = ids ? [...new Set(ids.map(id => String(id || '').trim()))] : registeredIds;
        if (!diagnostic) {
            const suppliedIds = Object.keys(manifest.domains || {}).sort();
            const expectedIds = [...registeredIds].sort();
            if (suppliedIds.length !== expectedIds.length || suppliedIds.some((id, index) => id !== expectedIds[index])) {
                throw new Error('A global restore must contain exactly every registered backup domain.');
            }
        }
        const prepared = [];
        for (const id of wantedIds) {
            const definition = domains.get(id);
            if (!definition) throw new Error(`This installation cannot restore backup domain ${id}.`);
            const entry = manifest.domains?.[id];
            if (!entry || Number(entry.schemaVersion) !== definition.schemaVersion) {
                throw new Error(`Backup domain ${id} is absent or uses an incompatible schema.`);
            }
            if (await checksum(entry.payload) !== entry.checksum) throw new Error(`Backup domain ${id} failed its integrity check.`);
            const validated = await definition.validate(entry.payload);
            prepared.push({ id, definition, payload: validated });
        }
        return prepared;
    }

    function transactionFromJournal(journal) {
        return {
            id: journal.transactionId,
            restoreGeneration: journal.restoreGeneration,
            startedAt: journal.startedAt,
            domains: [...journal.domains],
            diagnostic: journal.diagnostic === true,
            recovery: true
        };
    }

    async function recoverPending() {
        if (activeOperation) throw new Error(`Cannot recover a restore while backup operation ${activeOperation} is active.`);
        const journal = readCoordinatorJournal();
        if (!journal) return { recovered: false };
        const domainIds = Array.isArray(journal.domains) ? journal.domains.map(String) : [];
        if (!domainIds.length || domainIds.some(id => !domains.has(id))) {
            throw new Error('An interrupted restore references a persistence domain that is not registered.');
        }
        const decision = journal.decision === 'commit' ? 'commit' : 'rollback';
        const transaction = transactionFromJournal({ ...journal, domains: domainIds });
        const participating = domainIds.map(id => ({ id, definition: domains.get(id) }));
        const quiesced = [];
        activeOperation = `recovery:${transaction.id}`;
        try {
            for (const item of participating) {
                await item.definition.quiesce(transaction);
                quiesced.push(item);
            }
            for (const item of participating) await item.definition.recover(transaction, decision);
            clearCoordinatorJournal();
            return { recovered: true, decision, transactionId: transaction.id, domains: domainIds };
        } finally {
            for (const item of [...quiesced].reverse()) {
                try { await item.definition.resume(transaction); }
                catch (error) { console.error(`Backup resume failed for ${item.id}:`, error); }
            }
            activeOperation = null;
        }
    }

    async function restore(manifest, options = {}) {
        if (options.ids && options.diagnostic !== true) {
            throw new Error('Partial restore is diagnostic-only. Use restoreDomain() for an explicit domain recovery.');
        }
        requireIdle('restore a backup');
        activeOperation = 'restore:validation';
        let prepared;
        try {
            prepared = await prepare(manifest, options);
        } catch (error) {
            activeOperation = null;
            throw error;
        }
        const transaction = {
            id: crypto.randomUUID(),
            // A generation belongs to this restore attempt, not to the archive.
            // Restoring one file twice must still invalidate old work twice.
            restoreGeneration: crypto.randomUUID(),
            startedAt: new Date().toISOString(),
            domains: prepared.map(item => item.id),
            diagnostic: options.diagnostic === true
        };
        activeOperation = `restore:${transaction.id}`;
        const baseJournal = {
            version: 1,
            transactionId: transaction.id,
            restoreGeneration: transaction.restoreGeneration,
            startedAt: transaction.startedAt,
            domains: transaction.domains,
            diagnostic: transaction.diagnostic,
            decision: 'rollback',
            phase: 'preparing'
        };
        const quiesced = [];
        const staged = [];
        const preimages = new Map();
        let commitDecided = false;
        let failure = null;
        try {
            // This atomic same-origin write happens before any authority is
            // quiesced or mutated. Until the later commit decision exists,
            // startup recovery must restore every participating preimage.
            writeCoordinatorJournal(baseJournal);
            try {
                for (const item of prepared) {
                    await item.definition.quiesce(transaction);
                    quiesced.push(item);
                }
                for (const item of prepared) {
                    staged.push({ ...item, staged: await item.definition.stage(item.payload, transaction) });
                }
                for (const item of staged) preimages.set(item.id, await item.definition.capturePreimage(transaction));
                for (const item of staged) await item.definition.journal?.('prepared', transaction, preimages.get(item.id));
                writeCoordinatorJournal({ ...baseJournal, phase: 'prepared' });

                for (const item of staged) {
                    // A mutating commit that throws is still included in the
                    // rollback because every staged domain has a preimage.
                    await item.definition.commit(item.staged, transaction);
                    await item.definition.journal?.('committed', transaction, preimages.get(item.id));
                }
                for (const item of staged) await item.definition.readback(item.payload, transaction);

                // This is the sole global publication decision. Once durable,
                // recovery keeps every domain even if cleanup is interrupted.
                writeCoordinatorJournal({ ...baseJournal, decision: 'commit', phase: 'commit-decided' });
                commitDecided = true;
            } catch (error) {
                failure = error;
            }

            if (!commitDecided) {
                const rollbackErrors = [];
                for (const item of [...staged].reverse()) {
                    try {
                        if (preimages.has(item.id)) {
                            await item.definition.rollback(preimages.get(item.id), transaction);
                            await item.definition.journal?.('rolled-back', transaction, preimages.get(item.id));
                        } else {
                            await item.definition.discardStage?.(item.staged, transaction);
                        }
                    } catch (error) {
                        rollbackErrors.push({ id: item.id, error });
                        console.error(`Backup rollback failed for ${item.id}:`, error);
                    }
                }
                if (!rollbackErrors.length) clearCoordinatorJournal();
                if (rollbackErrors.length) {
                    const failedIds = rollbackErrors.map(item => item.id).join(', ');
                    failure = new AggregateError([failure, ...rollbackErrors.map(item => item.error)].filter(Boolean),
                        `Backup restore failed and rollback remains pending for: ${failedIds}`);
                }
            } else {
                let cleanupFailed = false;
                for (const item of staged) {
                    try { await item.definition.journal?.('complete', transaction, null); }
                    catch (error) {
                        cleanupFailed = true;
                        console.error(`Backup completion cleanup failed for ${item.id}:`, error);
                    }
                }
                if (!cleanupFailed) clearCoordinatorJournal();
            }

            if (failure) throw failure;
            return {
                transactionId: transaction.id,
                restoreGeneration: transaction.restoreGeneration,
                domains: staged.map(item => item.id),
                recoveryPending: Boolean(readCoordinatorJournal())
            };
        } finally {
            for (const item of [...quiesced].reverse()) {
                try { await item.definition.resume(transaction); }
                catch (error) { console.error(`Backup resume failed for ${item.id}:`, error); }
            }
            activeOperation = null;
        }
    }

    async function restoreDomain(manifest, id) {
        const domainId = String(id || '').trim();
        if (!domains.has(domainId)) throw new Error(`Unknown backup domain ${domainId || '(blank)'}.`);
        return restore(manifest, { ids: [domainId], diagnostic: true });
    }

    window.HordeBackupDomains = Object.freeze({
        register(definition) {
            if (sealed) throw new Error('Backup domain registration is already sealed for this application bootstrap.');
            if (activeOperation) throw new Error(`Cannot register a backup domain during ${activeOperation}.`);
            const normalized = requireDomainDefinition(definition);
            if (domains.has(normalized.id)) throw new Error(`Backup domain ${normalized.id} is already registered.`);
            domains.set(normalized.id, normalized);
            return () => {
                if (sealed || activeOperation) return false;
                return domains.delete(normalized.id);
            };
        },
        seal() { sealed = true; return [...domains.keys()]; },
        registered: () => [...domains.keys()],
        export: buildManifest,
        validate(manifest, options = {}) {
            requireIdle('validate a backup');
            return prepare(manifest, options);
        },
        restore,
        restoreDomain,
        recoverPending,
        pending: () => readCoordinatorJournal(),
        checksum
    });
})();
