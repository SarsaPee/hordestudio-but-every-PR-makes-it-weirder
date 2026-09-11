/* Permanent persistence authority for Experimental Worlds. This database is
 * deliberately separate from the upstream HordeStudioDB host database. The
 * repository is data-only: loading it never loads or starts the World runtime. */
(function installExperimentalWorldsRepository(global) {
    'use strict';

    const DB_NAME = 'HordeStudioExperimentalWorldsDB';
    const STORE_NAME = 'records';
    const VERSION = 1;
    const RESTORE_STAGE_KEY = 'restoreStage';
    const RESTORE_JOURNAL_KEY = 'restoreJournal';
    const RESTORE_GENERATION_KEY = 'restoreGeneration';
    const SNAPSHOT_KEYS = Object.freeze([
        'worlds', 'worldInstances', 'activeWorldId', 'worldRecoverySnapshots',
        'worldMediaAssets', 'workspace', 'theme'
    ]);
    let db = null;

    const clone = value => value == null ? value : structuredClone(value);
    const isPlainObject = value => Object.prototype.toString.call(value) === '[object Object]';

    function requestResult(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Experimental Worlds database error'));
        });
    }

    async function init() {
        if (db) return db;
        db = await new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, VERSION);
            request.onupgradeneeded = event => {
                const database = event.target.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
            };
            request.onsuccess = event => resolve(event.target.result);
            request.onerror = () => reject(request.error || new Error('Experimental Worlds database could not open'));
        });
        return db;
    }

    async function get(key) {
        await init();
        const transaction = db.transaction([STORE_NAME], 'readonly');
        return requestResult(transaction.objectStore(STORE_NAME).get(key));
    }

    async function getMany(keys) {
        await init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const values = {};
            keys.forEach(key => {
                const request = store.get(key);
                request.onsuccess = () => { values[key] = request.result; };
            });
            transaction.oncomplete = () => resolve(values);
            transaction.onerror = () => reject(transaction.error || new Error('Experimental Worlds read failed'));
            transaction.onabort = () => reject(transaction.error || new Error('Experimental Worlds read was aborted'));
        });
    }

    async function setMany(records) {
        await init();
        await new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            Object.entries(records).forEach(([key, value]) => store.put(clone(value), key));
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error || new Error('Experimental Worlds write failed'));
            transaction.onabort = () => reject(transaction.error || new Error('Experimental Worlds write was aborted'));
        });
    }

    async function removeMany(keys) {
        await init();
        await new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            keys.forEach(key => store.delete(key));
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error || new Error('Experimental Worlds delete failed'));
            transaction.onabort = () => reject(transaction.error || new Error('Experimental Worlds delete was aborted'));
        });
    }

    function assertPortable(value, path = 'snapshot', seen = new Set(), depth = 0) {
        if (depth > 256) throw new Error(`Experimental Worlds ${path} is nested too deeply.`);
        if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
        if (typeof value === 'number') {
            if (!Number.isFinite(value)) throw new Error(`Experimental Worlds ${path} contains a non-finite number.`);
            return;
        }
        if (typeof value !== 'object') {
            throw new Error(`Experimental Worlds ${path} is not portable JSON data.`);
        }
        if (seen.has(value)) throw new Error(`Experimental Worlds ${path} contains a circular reference.`);
        seen.add(value);
        if (Array.isArray(value)) {
            value.forEach((item, index) => assertPortable(item, `${path}[${index}]`, seen, depth + 1));
        } else {
            if (!isPlainObject(value)) throw new Error(`Experimental Worlds ${path} must be a plain object.`);
            for (const [key, item] of Object.entries(value)) {
                if (key === '__proto__' || key === 'prototype') {
                    throw new Error(`Experimental Worlds ${path} contains an unsafe key.`);
                }
                assertPortable(item, `${path}.${key}`, seen, depth + 1);
            }
        }
        seen.delete(value);
    }

    function validateSnapshot(value, label = 'backup payload') {
        if (!isPlainObject(value)) throw new Error(`Experimental Worlds ${label} must be an object.`);
        if (!Array.isArray(value.worlds)) throw new Error(`Experimental Worlds ${label} needs a worlds array.`);
        for (const key of ['worldInstances', 'worldRecoverySnapshots', 'worldMediaAssets', 'workspace']) {
            if (value[key] !== undefined && !isPlainObject(value[key])) {
                throw new Error(`Experimental Worlds ${label} ${key} must be an object.`);
            }
        }
        if (value.activeWorldId !== undefined && value.activeWorldId !== null
            && typeof value.activeWorldId !== 'string') {
            throw new Error(`Experimental Worlds ${label} activeWorldId must be a string or null.`);
        }
        if (value.theme !== undefined && typeof value.theme !== 'string') {
            throw new Error(`Experimental Worlds ${label} theme must be a string.`);
        }
        const normalized = {
            worlds: clone(value.worlds),
            worldInstances: clone(value.worldInstances || {}),
            activeWorldId: value.activeWorldId || null,
            worldRecoverySnapshots: clone(value.worldRecoverySnapshots || {}),
            worldMediaAssets: clone(value.worldMediaAssets || {}),
            workspace: clone(value.workspace || {}),
            theme: value.theme || 'default'
        };
        assertPortable(normalized);
        return normalized;
    }

    async function snapshot() {
        // One readonly transaction gives backup export a consistent cut even
        // if another tab begins a save while this snapshot is being captured.
        const values = await getMany([...SNAPSHOT_KEYS, 'generation', RESTORE_GENERATION_KEY]);
        return {
            worlds: values.worlds || [],
            worldInstances: values.worldInstances || {},
            activeWorldId: values.activeWorldId || null,
            worldRecoverySnapshots: values.worldRecoverySnapshots || {},
            worldMediaAssets: values.worldMediaAssets || {},
            workspace: values.workspace || {},
            theme: typeof values.theme === 'string' ? values.theme : 'default',
            generation: Number(values.generation) || 0,
            restoreGeneration: Number(values[RESTORE_GENERATION_KEY]) || 0
        };
    }

    function snapshotData(value) {
        return validateSnapshot(value, 'snapshot');
    }

    async function exportSnapshot() {
        return snapshotData(await snapshot());
    }

    async function publishSnapshot(value, reason, { invalidateRestore = false } = {}) {
        const data = snapshotData(value);
        await init();
        // Read the counters and publish the complete logical snapshot in one
        // readwrite transaction. IndexedDB serializes this transaction against
        // writers in other tabs, so generations cannot be lost by read/write
        // races across browsing contexts.
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const generationRequest = store.get('generation');
            const restoreRequest = store.get(RESTORE_GENERATION_KEY);
            let generationReady = false;
            let restoreReady = false;
            let next = null;
            const publish = () => {
                if (!generationReady || !restoreReady || next) return;
                next = {
                    ...data,
                    generation: (Number(generationRequest.result) || 0) + 1,
                    restoreGeneration: (Number(restoreRequest.result) || 0) + (invalidateRestore ? 1 : 0),
                    lastWrite: { reason, at: new Date().toISOString() }
                };
                Object.entries(next).forEach(([key, item]) => store.put(clone(item), key));
            };
            generationRequest.onsuccess = () => { generationReady = true; publish(); };
            restoreRequest.onsuccess = () => { restoreReady = true; publish(); };
            transaction.oncomplete = () => resolve(next);
            transaction.onerror = () => reject(transaction.error || new Error('Experimental Worlds snapshot write failed'));
            transaction.onabort = () => reject(transaction.error || new Error('Experimental Worlds snapshot write was aborted'));
        });
    }

    async function writeSnapshot(value, reason = 'save') {
        return publishSnapshot(value, reason, { invalidateRestore: false });
    }

    // JSON insertion order is not a recovery checksum. Experimental snapshots
    // are validated as data-only before backup/restore uses this digest.
    function canonical(value) {
        if (value === null) return 'null';
        if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
        if (typeof value === 'object') {
            return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
        }
        const encoded = JSON.stringify(value);
        if (encoded === undefined) throw new Error('Cannot checksum non-portable Experimental Worlds data.');
        return encoded;
    }

    async function digest(value) {
        if (!global.crypto?.subtle) throw new Error('Web Crypto is required to verify Experimental Worlds data.');
        const bytes = new TextEncoder().encode(canonical(value));
        const hash = await global.crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async function verifiedSnapshot(expected, label = 'restore') {
        const expectedData = snapshotData(expected);
        const actual = snapshotData(await snapshot());
        const [expectedDigest, actualDigest] = await Promise.all([digest(expectedData), digest(actual)]);
        if (expectedDigest !== actualDigest) {
            throw new Error(`Experimental Worlds ${label} did not read back exactly; the prior data remains recoverable.`);
        }
        return actualDigest;
    }

    async function restoreGeneration() {
        return Number(await get(RESTORE_GENERATION_KEY)) || 0;
    }

    function sameStage(stage, handle) {
        if (!stage || !handle) return false;
        const handleId = typeof handle === 'string' ? handle : handle.id;
        const handleDigest = typeof handle === 'object' ? handle.digest : null;
        return stage.id === handleId && (!handleDigest || stage.digest === handleDigest);
    }

    async function stageRestore(value, transaction = null) {
        const existingJournal = await get(RESTORE_JOURNAL_KEY);
        if (existingJournal) {
            throw new Error('Experimental Worlds has an unfinished restore journal; recover it before staging another restore.');
        }
        const next = validateSnapshot(value, 'restore payload');
        const stageDigest = await digest(next);
        const stage = {
            id: global.crypto?.randomUUID?.() || `experimental-restore-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            snapshot: next,
            digest: stageDigest,
            transactionId: transaction?.id || null,
            stagedAt: new Date().toISOString()
        };
        await setMany({ [RESTORE_STAGE_KEY]: stage });
        const readback = await get(RESTORE_STAGE_KEY);
        if (!sameStage(readback, stage) || await digest(readback.snapshot) !== stageDigest) {
            await removeMany([RESTORE_STAGE_KEY]).catch(() => {});
            throw new Error('Experimental Worlds restore stage failed verification; active data was not replaced.');
        }

        // Preserve the former direct stage/apply API for recovery tools that
        // do not use the host coordinator. The coordinator supplies its own
        // later, quiesced preimage through beginStagedRestore().
        if (!transaction) {
            await beginStagedRestore(stage, await exportSnapshot(), {
                id: stage.id, restoreGeneration: stage.id, domains: ['experimental-worlds']
            });
        }
        return { id: stage.id, digest: stage.digest, transactionId: stage.transactionId };
    }

    async function beginStagedRestore(stageHandle, preimage, transaction = {}) {
        const stage = await get(RESTORE_STAGE_KEY);
        if (!sameStage(stage, stageHandle)) throw new Error('Experimental Worlds restore stage no longer matches the prepared transaction.');
        if (await digest(stage.snapshot) !== stage.digest) throw new Error('Experimental Worlds restore stage checksum changed before prepare.');
        const prior = validateSnapshot(preimage, 'restore preimage');
        const journal = {
            version: 2,
            status: 'prepared',
            transactionId: String(transaction.id || ''),
            coordinatorRestoreGeneration: String(transaction.restoreGeneration || ''),
            stageId: stage.id,
            stageDigest: stage.digest,
            preimage: prior,
            preimageDigest: await digest(prior),
            updatedAt: new Date().toISOString()
        };
        await setMany({ [RESTORE_JOURNAL_KEY]: journal });
        return clone(journal);
    }

    async function applyStagedRestore(stageHandle = null, transaction = {}) {
        const stage = await get(RESTORE_STAGE_KEY);
        const journal = await get(RESTORE_JOURNAL_KEY);
        const handle = stageHandle || (stage && { id: stage.id, digest: stage.digest });
        if (!sameStage(stage, handle) || !journal || !['prepared', 'staged'].includes(journal.status)) {
            throw new Error('No verified Experimental Worlds restore stage is available.');
        }
        if (journal.transactionId && transaction.id && journal.transactionId !== String(transaction.id)) {
            throw new Error('Experimental Worlds restore transaction identity changed before commit.');
        }
        if (journal.stageId && journal.stageId !== stage.id) throw new Error('Experimental Worlds restore journal points to another stage.');
        if (await digest(stage.snapshot) !== stage.digest || (journal.stageDigest && journal.stageDigest !== stage.digest)) {
            throw new Error('Experimental Worlds restore stage checksum changed before commit.');
        }
        const applied = await publishSnapshot(stage.snapshot, 'global-backup-restore', { invalidateRestore: true });
        const readbackDigest = await verifiedSnapshot(stage.snapshot, 'restore');
        await setMany({ [RESTORE_JOURNAL_KEY]: {
            ...journal,
            status: 'applied-and-verified',
            appliedAt: new Date().toISOString(),
            appliedGeneration: applied.generation,
            restoreGeneration: applied.restoreGeneration,
            readbackDigest
        } });
        return {
            snapshot: await snapshot(), generation: applied.generation,
            restoreGeneration: applied.restoreGeneration, readbackDigest
        };
    }

    async function rollbackRestore(preimage = null, transaction = {}) {
        const journal = await get(RESTORE_JOURNAL_KEY);
        const prior = validateSnapshot(preimage || journal?.preimage, 'restore rollback preimage');
        if (journal?.preimageDigest && await digest(prior) !== journal.preimageDigest) {
            throw new Error('Experimental Worlds restore preimage checksum changed before rollback.');
        }
        if (journal?.transactionId && transaction.id && journal.transactionId !== String(transaction.id)) {
            throw new Error('Experimental Worlds rollback transaction identity changed.');
        }
        const current = await exportSnapshot();
        const [currentDigest, priorDigest] = await Promise.all([digest(current), digest(prior)]);
        let restored = await snapshot();
        if (currentDigest !== priorDigest) {
            restored = await publishSnapshot(prior, 'global-backup-rollback', { invalidateRestore: true });
            await verifiedSnapshot(prior, 'rollback');
        }
        await setMany({ [RESTORE_JOURNAL_KEY]: {
            ...(journal || {}),
            version: 2,
            status: 'rolled-back',
            transactionId: String(transaction.id || journal?.transactionId || ''),
            rolledBackAt: new Date().toISOString(),
            restoreGeneration: Number(restored.restoreGeneration) || 0
        } });
        return { snapshot: await snapshot(), restoreGeneration: Number(restored.restoreGeneration) || 0 };
    }

    async function noteRestorePhase(phase, transaction = {}, preimage = null, stageHandle = null) {
        if (phase === 'prepared') {
            return beginStagedRestore(stageHandle || await get(RESTORE_STAGE_KEY), preimage, transaction);
        }
        if (phase === 'complete' || phase === 'rolled-back') {
            await removeMany([RESTORE_STAGE_KEY, RESTORE_JOURNAL_KEY]);
            return null;
        }
        const journal = await get(RESTORE_JOURNAL_KEY);
        if (!journal) throw new Error(`Experimental Worlds cannot record restore phase ${phase} without a journal.`);
        if (journal.transactionId && transaction.id && journal.transactionId !== String(transaction.id)) {
            throw new Error('Experimental Worlds restore journal transaction identity changed.');
        }
        const status = phase === 'committed' ? 'coordinator-committed' : String(phase || journal.status);
        const next = { ...journal, status, updatedAt: new Date().toISOString() };
        await setMany({ [RESTORE_JOURNAL_KEY]: next });
        return clone(next);
    }

    async function discardStagedRestore(stageHandle = null) {
        const stage = await get(RESTORE_STAGE_KEY);
        if (stageHandle && stage && !sameStage(stage, stageHandle)) {
            throw new Error('Experimental Worlds refused to discard another restore stage.');
        }
        const journal = await get(RESTORE_JOURNAL_KEY);
        if (journal && journal.status !== 'rolled-back') {
            throw new Error('Experimental Worlds restore has a durable preimage; recover it instead of discarding it.');
        }
        await removeMany([RESTORE_STAGE_KEY, RESTORE_JOURNAL_KEY]);
    }

    async function restoreStatus() {
        const values = await getMany([RESTORE_STAGE_KEY, RESTORE_JOURNAL_KEY]);
        return {
            stage: clone(values[RESTORE_STAGE_KEY] || null),
            journal: clone(values[RESTORE_JOURNAL_KEY] || null)
        };
    }

    async function discardOrphanRestoreStage() {
        const { stage, journal } = await restoreStatus();
        if (!stage || journal) return { discarded: false, pendingDecision: Boolean(journal) };
        await removeMany([RESTORE_STAGE_KEY]);
        return { discarded: true, pendingDecision: false };
    }

    async function recoverInterruptedRestore(transaction = {}) {
        const [stage, journal] = await Promise.all([get(RESTORE_STAGE_KEY), get(RESTORE_JOURNAL_KEY)]);
        if (!stage && !journal) return { recovered: false };
        if (!journal) {
            await removeMany([RESTORE_STAGE_KEY]);
            return { recovered: true, action: 'discarded-orphan-stage', restoreGeneration: await restoreGeneration() };
        }
        if (!journal.preimage || !journal.preimageDigest) {
            throw new Error('Experimental Worlds has an interrupted restore without a verified preimage.');
        }
        if (journal.transactionId && transaction.id && journal.transactionId !== String(transaction.id)) {
            throw new Error('Experimental Worlds interrupted restore belongs to another transaction.');
        }
        const prior = validateSnapshot(journal.preimage, 'interrupted restore preimage');
        if (await digest(prior) !== journal.preimageDigest) {
            throw new Error('Experimental Worlds interrupted restore preimage failed verification.');
        }
        const current = await exportSnapshot();
        const [currentDigest, priorDigest] = await Promise.all([digest(current), digest(prior)]);
        let generation = await restoreGeneration();
        let action = 'discarded-uncommitted-stage';
        if (currentDigest !== priorDigest) {
            const restored = await publishSnapshot(prior, 'interrupted-restore-rollback', { invalidateRestore: true });
            generation = restored.restoreGeneration;
            await verifiedSnapshot(prior, 'interrupted restore rollback');
            action = 'rolled-back-interrupted-restore';
        }
        await removeMany([RESTORE_STAGE_KEY, RESTORE_JOURNAL_KEY]);
        return { recovered: true, action, restoreGeneration: generation, snapshot: await snapshot() };
    }

    async function recoverRestoreDecision(transaction = {}, decision = 'rollback') {
        if (decision !== 'commit' && decision !== 'rollback') {
            throw new Error('Experimental Worlds recovery decision must be commit or rollback.');
        }
        const { stage, journal } = await restoreStatus();
        if (!stage && !journal) {
            return { recovered: false, decision, restoreGeneration: await restoreGeneration() };
        }
        if (decision === 'rollback') return recoverInterruptedRestore(transaction);
        if (!stage || !journal) {
            throw new Error('Experimental Worlds cannot honor a committed restore without its verified stage and journal.');
        }
        if (journal.transactionId && transaction.id && journal.transactionId !== String(transaction.id)) {
            throw new Error('Experimental Worlds committed restore belongs to another transaction.');
        }
        if (!sameStage(stage, { id: journal.stageId || stage.id, digest: journal.stageDigest || stage.digest })
            || await digest(stage.snapshot) !== stage.digest) {
            throw new Error('Experimental Worlds committed restore stage failed verification.');
        }
        const current = await exportSnapshot();
        const [currentDigest, stageDigest] = await Promise.all([digest(current), digest(stage.snapshot)]);
        if (currentDigest !== stageDigest) {
            throw new Error('Experimental Worlds durable commit decision does not match active data.');
        }
        await removeMany([RESTORE_STAGE_KEY, RESTORE_JOURNAL_KEY]);
        return {
            recovered: true,
            action: 'kept-committed-restore',
            decision,
            restoreGeneration: await restoreGeneration(),
            snapshot: await snapshot()
        };
    }

    async function stageLegacyImport(legacy, legacyHostPreimage = {}) {
        const current = await snapshot();
        if (current.worlds.length || await get('migrationJournal')) return { imported: false, snapshot: current };
        const preimage = snapshotData(legacy);
        const staged = await writeSnapshot(preimage, 'legacy-import-stage');
        const stagedDigest = await verifiedSnapshot(preimage, 'legacy import');
        const hostPreimage = clone(legacyHostPreimage || {});
        await setMany({ migrationJournal: {
            version: 1, status: 'staged-and-verified', at: new Date().toISOString(),
            legacyPreimage: preimage, legacyPreimageDigest: await digest(preimage),
            legacyHostPreimage: hostPreimage,
            legacyHostPreimageDigest: await digest(hostPreimage),
            stagedDigest, importedGeneration: staged.generation
        } });
        return { imported: true, snapshot: staged };
    }

    async function migrationJournal() { return await get('migrationJournal') || null; }

    async function destroyForExplicitGlobalPurge() {
        // Only the host's explicit confirmed global purge calls this. Normal
        // startup and normal World deletion can never clear this authority.
        if (db) { db.close(); db = null; }
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(DB_NAME);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error || new Error('Experimental Worlds database deletion failed'));
            request.onblocked = () => reject(new Error('Close other Horde Studio tabs and try again'));
        });
    }

    global.ExperimentalWorldsRepository = Object.freeze({
        DB_NAME, STORE_NAME, VERSION, SNAPSHOT_KEYS,
        init, get, getMany, setMany, removeMany, snapshot, snapshotData, validateSnapshot,
        exportSnapshot, writeSnapshot, verifiedSnapshot, restoreGeneration,
        stageLegacyImport, stageRestore, beginStagedRestore, applyStagedRestore,
        rollbackRestore, noteRestorePhase, discardStagedRestore,
        restoreStatus, discardOrphanRestoreStage, recoverInterruptedRestore,
        recoverRestoreDecision, migrationJournal, digest,
        destroyForExplicitGlobalPurge
    });
})(window);
