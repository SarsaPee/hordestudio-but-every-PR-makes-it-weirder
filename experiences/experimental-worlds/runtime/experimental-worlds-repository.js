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
    global.ExperimentalWorldsRepository = Object.freeze({ DB_NAME, init, get, setMany, snapshot, writeSnapshot });
})(window);
