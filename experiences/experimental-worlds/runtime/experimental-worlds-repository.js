/* Permanent persistence authority for Experimental Worlds.  This database is
 * deliberately separate from the upstream HordeStudioDB host database. */
(function (global) {
    'use strict';
    const DB_NAME = 'HordeStudioExperimentalWorldsDB';
    const STORE_NAME = 'records';
    const VERSION = 1;
    let db = null;
    const clone = value => value == null ? value : structuredClone(value);
    function requestResult(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Experimental Worlds database error'));
        });
    }
    async function init() {
        if (db) return;
        db = await new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, VERSION);
            request.onupgradeneeded = event => {
                const database = event.target.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
            };
            request.onsuccess = event => resolve(event.target.result);
            request.onerror = () => reject(request.error || new Error('Experimental Worlds database could not open'));
        });
    }
    async function get(key) {
        await init();
        const transaction = db.transaction([STORE_NAME], 'readonly');
        return requestResult(transaction.objectStore(STORE_NAME).get(key));
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
    async function snapshot() {
        return {
            worlds: await get('worlds') || [],
            worldInstances: await get('worldInstances') || {},
            activeWorldId: await get('activeWorldId') || null,
            worldRecoverySnapshots: await get('worldRecoverySnapshots') || {},
            worldMediaAssets: await get('worldMediaAssets') || {},
            generation: Number(await get('generation')) || 0
        };
    }
    async function writeSnapshot(value, reason = 'save') {
        const prior = await snapshot();
        const next = {
            worlds: value.worlds || [],
            worldInstances: value.worldInstances || {},
            activeWorldId: value.activeWorldId || null,
            worldRecoverySnapshots: value.worldRecoverySnapshots || {},
            worldMediaAssets: value.worldMediaAssets || {},
            generation: prior.generation + 1,
            lastWrite: { reason, at: new Date().toISOString() }
        };
        await setMany(next);
        return next;
    }
    // JSON's insertion order is not a migration checksum.  The Worlds schema is
    // data-only, so a sorted recursive representation gives import/restore a
    // reproducible digest without changing the saved object itself.
    function canonical(value) {
        if (value === null) return 'null';
        if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
        if (typeof value === 'object') {
            return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
        }
        return JSON.stringify(value);
    }
    async function digest(value) {
        if (!global.crypto?.subtle) throw new Error('Web Crypto is required to verify Experimental Worlds migration data.');
        const bytes = new TextEncoder().encode(canonical(value));
        const hash = await global.crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    function snapshotData(value) {
        return {
            worlds: clone(value?.worlds || []),
            worldInstances: clone(value?.worldInstances || {}),
            activeWorldId: value?.activeWorldId || null,
            worldRecoverySnapshots: clone(value?.worldRecoverySnapshots || {}),
            worldMediaAssets: clone(value?.worldMediaAssets || {})
        };
    }
    async function verifiedSnapshot(expected, label) {
        const expectedData = snapshotData(expected);
        const actual = snapshotData(await snapshot());
        const [expectedDigest, actualDigest] = await Promise.all([digest(expectedData), digest(actual)]);
        if (expectedDigest !== actualDigest) {
            throw new Error(`Experimental Worlds ${label} did not read back exactly; the prior data remains recoverable.`);
        }
        return actualDigest;
    }
    async function stageLegacyImport(legacy) {
        const current = await snapshot();
        if (current.worlds.length || await get('migrationJournal')) return { imported: false, snapshot: current };
        const preimage = snapshotData(legacy);
        const staged = await writeSnapshot(preimage, 'legacy-import-stage');
        const stagedDigest = await verifiedSnapshot(preimage, 'legacy import');
        await setMany({ migrationJournal: {
            version: 1, status: 'staged-and-verified', at: new Date().toISOString(),
            legacyPreimage: preimage, legacyPreimageDigest: await digest(preimage),
            stagedDigest, importedGeneration: staged.generation
        } });
        return { imported: true, snapshot: staged };
    }
    async function stageRestore(value) {
        const next = snapshotData(value);
        const preimage = snapshotData(await snapshot());
        const stageDigest = await digest(next);
        await setMany({
            restoreStage: { snapshot: next, digest: stageDigest, stagedAt: new Date().toISOString() },
            restoreJournal: {
                version: 1, status: 'staged', at: new Date().toISOString(),
                preimage, preimageDigest: await digest(preimage), stageDigest
            }
        });
        const staged = await get('restoreStage');
        if (!staged || staged.digest !== stageDigest || await digest(staged.snapshot) !== stageDigest) {
            throw new Error('Experimental Worlds restore stage failed verification; active data was not replaced.');
        }
        return staged;
    }
    async function applyStagedRestore() {
        const stage = await get('restoreStage');
        const journal = await get('restoreJournal');
        if (!stage || !journal || journal.status !== 'staged') throw new Error('No verified Experimental Worlds restore stage is available.');
        if (await digest(stage.snapshot) !== stage.digest) throw new Error('Experimental Worlds restore stage checksum changed before apply.');
        const applied = await writeSnapshot(stage.snapshot, 'global-backup-restore');
        const readbackDigest = await verifiedSnapshot(stage.snapshot, 'restore');
        await setMany({ restoreJournal: {
            ...journal, status: 'applied-and-verified', appliedAt: new Date().toISOString(),
            appliedGeneration: applied.generation, readbackDigest
        } });
        await removeMany(['restoreStage']);
        return { snapshot: await snapshot(), generation: applied.generation, readbackDigest };
    }
    async function recoverInterruptedRestore() {
        const stage = await get('restoreStage');
        const journal = await get('restoreJournal');
        if (!stage || !journal || journal.status !== 'staged') return { recovered: false };
        return { recovered: true, ...(await applyStagedRestore()) };
    }
    async function migrationJournal() { return await get('migrationJournal') || null; }
    global.ExperimentalWorldsRepository = Object.freeze({
        DB_NAME, init, get, setMany, removeMany, snapshot, writeSnapshot, stageLegacyImport,
        stageRestore, applyStagedRestore, recoverInterruptedRestore, migrationJournal, digest
    });
})(window);
