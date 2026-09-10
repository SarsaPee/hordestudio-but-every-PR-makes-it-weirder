/*
 * Host-level backup domain coordinator.
 *
 * Domains remain opaque: this coordinator never reads their schemas.  A
 * domain supplies serialization, validation, staging, commit, rollback, and
 * readback.  That keeps stock data independent from optional feature data.
 */
(function installBackupDomainCoordinator() {
    const domains = new Map();

    function requireDomainDefinition(definition) {
        const id = String(definition?.id || '').trim();
        if (!/^[a-z][a-z0-9._-]{1,100}$/i.test(id)) throw new Error('Backup domain needs a safe id.');
        for (const name of ['serialize', 'validate', 'stage', 'capturePreimage', 'commit', 'rollback', 'readback']) {
            if (typeof definition?.[name] !== 'function') throw new Error(`Backup domain ${id} is missing ${name}().`);
        }
        return { ...definition, id, schemaVersion: Number(definition.schemaVersion) || 1 };
    }

    async function checksum(value) {
        const bytes = new TextEncoder().encode(JSON.stringify(value));
        const hash = await crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async function buildManifest() {
        const payloads = {};
        for (const definition of domains.values()) {
            const payload = await definition.serialize();
            payloads[definition.id] = {
                schemaVersion: definition.schemaVersion,
                checksum: await checksum(payload),
                payload
            };
        }
        return {
            _format: 'horde-studio-domain-backup',
            _version: 2,
            _exportedAt: new Date().toISOString(),
            domains: payloads
        };
    }

    async function prepare(manifest, { ids = null } = {}) {
        if (!manifest || manifest._format !== 'horde-studio-domain-backup' || manifest._version !== 2) {
            throw new Error('This is not a supported domain backup.');
        }
        const wanted = ids ? new Set(ids) : new Set(domains.keys());
        const prepared = [];
        for (const id of wanted) {
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

    async function restore(manifest, options = {}) {
        const prepared = await prepare(manifest, options);
        // Stage every domain and capture every preimage before publishing any
        // restored data. A validation/staging failure therefore changes nothing.
        const staged = [];
        for (const item of prepared) staged.push({ ...item, staged: await item.definition.stage(item.payload) });
        const transaction = { id: crypto.randomUUID(), startedAt: new Date().toISOString(), domains: staged.map(item => item.id) };
        const preimages = new Map();
        for (const item of staged) preimages.set(item.id, await item.definition.capturePreimage());
        for (const item of staged) await item.definition.journal?.('prepared', transaction, preimages.get(item.id));

        const committed = [];
        try {
            for (const item of staged) {
                await item.definition.commit(item.staged, transaction);
                committed.push(item);
                await item.definition.journal?.('committed', transaction, preimages.get(item.id));
            }
            for (const item of staged) await item.definition.readback(item.payload, transaction);
            for (const item of staged) await item.definition.journal?.('complete', transaction, null);
            return { transactionId: transaction.id, domains: staged.map(item => item.id) };
        } catch (error) {
            for (const item of [...committed].reverse()) {
                try {
                    await item.definition.rollback(preimages.get(item.id), transaction);
                    await item.definition.journal?.('rolled-back', transaction, preimages.get(item.id));
                } catch (rollbackError) {
                    console.error(`Backup rollback failed for ${item.id}:`, rollbackError);
                }
            }
            throw error;
        }
    }

    window.HordeBackupDomains = Object.freeze({
        register(definition) {
            const normalized = requireDomainDefinition(definition);
            if (domains.has(normalized.id)) throw new Error(`Backup domain ${normalized.id} is already registered.`);
            domains.set(normalized.id, normalized);
            return () => domains.delete(normalized.id);
        },
        registered: () => [...domains.keys()],
        export: buildManifest,
        validate: prepare,
        restore,
        checksum
    });
})();
