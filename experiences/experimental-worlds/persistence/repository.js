const DB_NAME = 'HordeStudioExperimentalWorldsDB';
const STORE = 'experimental-worlds';
const RECORD = 'snapshot';
const JOURNAL = 'restore-journal';
const clone = value => value == null ? value : structuredClone(value);

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Could not open Experimental Worlds storage.'));
    });
}

function defaultSnapshot() {
    return {
        schemaVersion: 1,
        revision: 0,
        worlds: [],
        worldInstances: {},
        mediaAssets: {},
        legacyArchives: [],
        migrationHistory: [],
        mirrorAlternatives: []
    };
}

function validateSnapshot(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Experimental Worlds data is not an object.');
    if (!Array.isArray(value.worlds) || !value.worlds.every(world => world && typeof world === 'object' && typeof world.id === 'string')) {
        throw new Error('Experimental Worlds data has invalid worlds.');
    }
    if (!value.worldInstances || typeof value.worldInstances !== 'object' || Array.isArray(value.worldInstances)) {
        throw new Error('Experimental Worlds data has invalid sessions.');
    }
    if (!value.mediaAssets || typeof value.mediaAssets !== 'object' || Array.isArray(value.mediaAssets)) {
        throw new Error('Experimental Worlds data has invalid media.');
    }
    return true;
}

export class ExperimentalWorldsRepository {
    constructor() { this.db = null; }
    async init() {
        this.db = await openDatabase();
        const journal = await this.get(JOURNAL);
        if (journal?.status === 'staged' && journal.preimage) {
            await this.put(RECORD, journal.preimage);
            await this.put(JOURNAL, { ...journal, status: 'recovered', recoveredAt: new Date().toISOString() });
        }
        if (!await this.get(RECORD)) await this.put(RECORD, defaultSnapshot());
    }
    async get(key) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE, 'readonly');
            const request = tx.objectStore(STORE).get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || tx.error);
        });
    }
    async put(key, value) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(clone(value), key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('Experimental Worlds write failed.'));
            tx.onabort = () => reject(tx.error || new Error('Experimental Worlds write aborted.'));
        });
    }
    async snapshot() { return clone(await this.get(RECORD) || defaultSnapshot()); }
    async replace(next) {
        validateSnapshot(next);
        const current = await this.snapshot();
        const value = { ...clone(next), revision: Number(current.revision || 0) + 1, savedAt: new Date().toISOString() };
        await this.put(RECORD, value);
        return value;
    }
    async addSyntheticWorld() {
        const current = await this.snapshot();
        const id = `experimental-synthetic-${Date.now().toString(36)}`;
        current.worlds.push({ id, name: 'Synthetic Experimental World', createdAt: new Date().toISOString(), synthetic: true, locations: [], entities: [], mediaAssets: [] });
        current.worldInstances[id] = { activeSessionId: `session-${id}`, sessions: [{ id: `session-${id}`, history: [], createdAt: new Date().toISOString() }] };
        return this.replace(current);
    }
    async archiveLegacyOrigin(origin, source) {
        const current = await this.snapshot();
        const archive = { origin, capturedAt: new Date().toISOString(), source, worlds: source.worlds || [], worldInstances: source.worldInstances || {}, mediaAssets: source.worldMediaAssets || {} };
        current.legacyArchives = [...(current.legacyArchives || []), archive].slice(-12);
        // A legacy import never overwrites established experimental records.
        const existing = new Set(current.worlds.map(world => world.id));
        for (const world of archive.worlds) if (!existing.has(world.id)) current.worlds.push(clone(world));
        for (const [id, instance] of Object.entries(archive.worldInstances)) if (!(id in current.worldInstances)) current.worldInstances[id] = clone(instance);
        for (const [id, media] of Object.entries(archive.mediaAssets)) if (!(id in current.mediaAssets)) current.mediaAssets[id] = clone(media);
        current.migrationHistory.push({ origin, importedAt: new Date().toISOString(), outcome: 'copied-nonconflicting; alternatives-retained' });
        return this.replace(current);
    }
    async readLegacySameOrigin() {
        // Avoid creating an empty legacy database merely by checking for one.
        // A missing inventory is treated as an explicit-import-only case.
        if (typeof indexedDB.databases !== 'function') return null;
        const databases = await indexedDB.databases();
        if (!databases.some(database => database.name === 'HordeStudioDB')) return null;
        const legacy = await new Promise((resolve, reject) => {
            const request = indexedDB.open('HordeStudioDB');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Legacy database cannot be opened.'));
            request.onupgradeneeded = () => { request.transaction.abort(); resolve(null); };
        });
        if (!legacy || !legacy.objectStoreNames.contains('state')) return null;
        const keys = ['worlds', 'worldInstances', 'worldMediaAssets'];
        const source = await new Promise((resolve, reject) => {
            const tx = legacy.transaction('state', 'readonly'); const store = tx.objectStore('state'); const output = {};
            let remaining = keys.length;
            keys.forEach(key => { const request = store.get(key); request.onsuccess = () => { output[key] = request.result; if (!--remaining) resolve(output); }; request.onerror = () => reject(request.error || tx.error); });
        });
        legacy.close();
        return source;
    }
    backupPartition() {
        return {
            id: 'experimental-worlds', schemaVersion: 1,
            exportData: () => this.snapshot(),
            validate: async value => validateSnapshot(value),
            stageRestore: async ({ generation, preimage }) => this.put(JOURNAL, { status: 'staged', generation, preimage, stagedAt: new Date().toISOString() }),
            applyRestore: async value => { validateSnapshot(value); await this.replace(value); },
            rollbackRestore: async preimage => this.replace(preimage),
            completeRestore: async ({ generation }) => this.put(JOURNAL, { status: 'complete', generation, completedAt: new Date().toISOString() })
        };
    }
}
