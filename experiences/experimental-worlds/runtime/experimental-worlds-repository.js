/* Permanent root-file persistence authority for Experimental Worlds.
 *
 * The runtime and backup coordinator keep using this data-only facade, but
 * durable records live behind the local 17.4 bridge in
 * data/experimental-worlds/. Loading this file never starts World gameplay,
 * ScenePulse, or the Experimental UI. */
(function installExperimentalWorldsRepository(global) {
    'use strict';

    const AUTHORITY = 'root-files';
    const ENDPOINT = '/experimental-worlds/persistence';
    const ROOT_RELATIVE_PATH = 'data/experimental-worlds/state.json';
    const VERSION = 1;
    const RESTORE_STAGE_KEY = 'restoreStage';
    const RESTORE_JOURNAL_KEY = 'restoreJournal';
    const RESTORE_GENERATION_KEY = 'restoreGeneration';
    const SNAPSHOT_KEYS = Object.freeze([
        'worlds', 'worldInstances', 'activeWorldId', 'worldRecoverySnapshots',
        'worldMediaAssets', 'workspace', 'theme', 'savedModelCatalogs',
        'roleplayOSSources'
    ]);
    let records = null;
    let storeRevision = 0;
    let storageMetadata = null;
    let initPromise = null;

    const clone = value => value == null ? value : structuredClone(value);
    const isPlainObject = value => Object.prototype.toString.call(value) === '[object Object]';

    async function request(method = 'GET', body = null) {
        const response = await global.fetch(ENDPOINT, {
            method,
            cache: 'no-store',
            credentials: 'same-origin',
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined
        });
        let payload = null;
        try { payload = await response.json(); }
        catch (_) { /* The status below remains the useful failure. */ }
        if (!response.ok) {
            if (response.status === 409 && payload?.records) adopt(payload);
            throw new Error(payload?.error
                || `Experimental Worlds root-file service failed (HTTP ${response.status || 'unknown'}).`);
        }
        if (!payload || typeof payload !== 'object') {
            throw new Error('Experimental Worlds root-file service returned no data.');
        }
        return payload;
    }

    function adopt(payload) {
        if (payload?.authority !== AUTHORITY || !isPlainObject(payload.records)) {
            throw new Error('Experimental Worlds refused an unexpected persistence authority.');
        }
        records = clone(payload.records);
        storeRevision = Number(payload.revision) || 0;
        storageMetadata = Object.freeze({
            authority: payload.authority,
            format: String(payload.format || ''),
            version: Number(payload.version) || 0,
            revision: storeRevision,
            checksum: String(payload.checksum || ''),
            writtenAt: Number(payload.writtenAt) || 0,
            relativePath: String(payload.relativePath || ROOT_RELATIVE_PATH),
            recovery: clone(payload.recovery || null)
        });
        return records;
    }

    async function reload() {
        return adopt(await request('GET'));
    }

    async function init() {
        if (records) return records;
        if (!initPromise) {
            initPromise = reload().catch(error => {
                initPromise = null;
                throw error;
            });
        }
        return initPromise;
    }

    async function mutate(operation, extra = {}) {
        await init();
        return adopt(await request('POST', {
            operation,
            expectedRevision: storeRevision,
            ...extra
        }));
    }

    async function get(key) {
        await init();
        return clone(records[key]);
    }

    async function getMany(keys) {
        await init();
        return Object.fromEntries(keys.map(key => [key, clone(records[key])]));
    }

    async function setMany(nextRecords) {
        if (!isPlainObject(nextRecords)) throw new Error('Experimental Worlds root records must be an object.');
        await mutate('setMany', { records: clone(nextRecords) });
    }

    async function removeMany(keys) {
        if (!Array.isArray(keys)) throw new Error('Experimental Worlds root record keys must be an array.');
        await mutate('removeMany', { keys: keys.map(String) });
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
        if (value.roleplayOSSources !== undefined && !Array.isArray(value.roleplayOSSources)) {
            throw new Error(`Experimental Worlds ${label} roleplayOSSources must be an array.`);
        }
        for (const key of ['worldInstances', 'worldRecoverySnapshots', 'worldMediaAssets', 'workspace', 'savedModelCatalogs']) {
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
            savedModelCatalogs: clone(value.savedModelCatalogs || {}),
            roleplayOSSources: clone(value.roleplayOSSources || []),
            theme: value.theme || 'default'
        };
        assertPortable(normalized);
        return normalized;
    }

    async function snapshot() {
        // The bridge publishes a complete checksummed document atomically.
        // This in-memory copy changes only after that publication succeeds.
        const values = await getMany([...SNAPSHOT_KEYS, 'generation', RESTORE_GENERATION_KEY]);
        return {
            worlds: values.worlds || [],
            worldInstances: values.worldInstances || {},
            activeWorldId: values.activeWorldId || null,
            worldRecoverySnapshots: values.worldRecoverySnapshots || {},
            worldMediaAssets: values.worldMediaAssets || {},
            workspace: values.workspace || {},
            savedModelCatalogs: values.savedModelCatalogs || {},
            roleplayOSSources: values.roleplayOSSources || [],
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
        await mutate('publishSnapshot', {
            snapshot: data,
            reason: String(reason || 'save'),
            invalidateRestore: invalidateRestore === true
        });
        return snapshot();
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
        await init();
        const payload = await request('POST', {
            operation: 'purge',
            confirmation: 'DELETE EXPERIMENTAL WORLDS'
        });
        adopt(payload);
        initPromise = Promise.resolve(records);
    }

    global.ExperimentalWorldsRepository = Object.freeze({
        AUTHORITY, ENDPOINT, ROOT_RELATIVE_PATH, VERSION, SNAPSHOT_KEYS,
        init, reload, get, getMany, setMany, removeMany, snapshot, snapshotData, validateSnapshot,
        exportSnapshot, writeSnapshot, verifiedSnapshot, restoreGeneration,
        stageLegacyImport, stageRestore, beginStagedRestore, applyStagedRestore,
        rollbackRestore, noteRestorePhase, discardStagedRestore,
        restoreStatus, discardOrphanRestoreStage, recoverInterruptedRestore,
        recoverRestoreDecision, migrationJournal, digest,
        storageStatus: () => clone(storageMetadata),
        worldExportUrl: worldId => `/experimental-worlds/worlds/${encodeURIComponent(String(worldId || ''))}/export`,
        destroyForExplicitGlobalPurge
    });
})(window);
