#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const root = new URL('../', import.meta.url);
const sources = {
    coordinator: fs.readFileSync(new URL('backup-domain-coordinator.js', root), 'utf8'),
    repository: fs.readFileSync(new URL('experiences/experimental-worlds/runtime/experimental-worlds-repository.js', root), 'utf8'),
    state: fs.readFileSync(new URL('host-adapters/experimental-worlds/experimental-worlds-state-adapter.js', root), 'utf8'),
    host: fs.readFileSync(new URL('host-adapters/experimental-worlds/experimental-worlds-host-adapter.js', root), 'utf8'),
    bootstrap: fs.readFileSync(new URL('host-adapters/experimental-worlds/experimental-worlds-persistence-bootstrap.js', root), 'utf8')
};

function createIndexedDB() {
    const databases = new Map();
    const defer = callback => queueMicrotask(callback);

    function databaseFor(record) {
        return {
            objectStoreNames: { contains: name => record.stores.has(name) },
            createObjectStore(name) {
                if (!record.stores.has(name)) record.stores.set(name, new Map());
                return {};
            },
            transaction(names, mode) {
                const name = Array.isArray(names) ? names[0] : names;
                const records = record.stores.get(name);
                if (!records) throw new Error(`Unknown fake IndexedDB store ${name}`);
                const before = mode === 'readwrite' ? structuredClone([...records.entries()]) : null;
                let pending = 0;
                let finished = false;
                let completionQueued = false;
                const transaction = {
                    error: null,
                    oncomplete: null,
                    onerror: null,
                    onabort: null,
                    objectStore() {
                        const request = operation => {
                            const result = {};
                            pending += 1;
                            defer(() => {
                                if (finished) return;
                                try {
                                    result.result = operation();
                                    result.onsuccess?.({ target: result });
                                } catch (error) {
                                    transaction.error = error;
                                    finished = true;
                                    if (before) {
                                        records.clear();
                                        before.forEach(([key, value]) => records.set(key, value));
                                    }
                                    result.error = error;
                                    result.onerror?.({ target: result });
                                    transaction.onerror?.({ target: transaction });
                                    transaction.onabort?.({ target: transaction });
                                } finally {
                                    pending -= 1;
                                    queueCompletion();
                                }
                            });
                            return result;
                        };
                        return {
                            get: key => request(() => structuredClone(records.get(key))),
                            put: (value, key) => request(() => {
                                records.set(key, structuredClone(value));
                                return key;
                            }),
                            delete: key => request(() => records.delete(key))
                        };
                    }
                };
                const queueCompletion = () => {
                    if (finished || pending || completionQueued) return;
                    completionQueued = true;
                    defer(() => {
                        completionQueued = false;
                        if (!finished && pending === 0) {
                            finished = true;
                            transaction.oncomplete?.({ target: transaction });
                        }
                    });
                };
                defer(queueCompletion);
                return transaction;
            },
            close() {}
        };
    }

    return {
        open(name, version) {
            const request = {};
            defer(() => {
                const created = !databases.has(name);
                if (created) databases.set(name, { version, stores: new Map() });
                const record = databases.get(name);
                request.result = databaseFor(record);
                if (created) request.onupgradeneeded?.({ target: request });
                request.onsuccess?.({ target: request });
            });
            return request;
        },
        deleteDatabase(name) {
            const request = {};
            defer(() => {
                databases.delete(name);
                request.onsuccess?.({ target: request });
            });
            return request;
        },
        databases
    };
}

function createContext(indexedDB = createIndexedDB()) {
    let recoveryNotifications = 0;
    const localRecords = new Map();
    const context = vm.createContext({
        console,
        crypto: webcrypto,
        TextEncoder,
        Uint8Array,
        structuredClone,
        indexedDB,
        setTimeout,
        clearTimeout
    });
    context.window = context;
    context.localStorage = {
        getItem: key => localRecords.has(key) ? localRecords.get(key) : null,
        setItem: (key, value) => localRecords.set(key, String(value)),
        removeItem: key => localRecords.delete(key)
    };
    context.HordeRollingRecovery = {
        notePersisted() { recoveryNotifications += 1; }
    };
    for (const name of ['coordinator', 'repository', 'bootstrap']) {
        const source = sources[name];
        vm.runInContext(source, context, { filename: name });
    }
    const loadRuntimeAdapters = () => {
        for (const name of ['state', 'host']) vm.runInContext(sources[name], context, { filename: name });
    };
    return { context, indexedDB, loadRuntimeAdapters, recoveryNotifications: () => recoveryNotifications };
}

function json(value) {
    return JSON.parse(JSON.stringify(value));
}

function payload(id, workspace = {}) {
    return {
        worlds: [{ id, name: `World ${id}`, mediaAssets: [{ id: `${id}-image`, source: `data:image/png;base64,${id}` }] }],
        worldInstances: { [id]: [{ id: `${id}-session`, history: [{ role: 'assistant', text: id }] }] },
        activeWorldId: id,
        worldRecoverySnapshots: {},
        worldMediaAssets: {},
        workspace: {
            version: 1, route: 'play', worldId: id, timelineId: `${id}-session`,
            studioTab: 'presentation', subViews: [], revision: 7, take: 2, attempt: 1,
            futureOpaqueField: { keep: true }, ...workspace
        },
        theme: 'midnight'
    };
}

const harness = createContext();
const { context } = harness;
const bootstrap = context.ExperimentalWorldsPersistenceBootstrap;
const repository = context.ExperimentalWorldsRepository;

// Blank-page bootstrap: there is deliberately no document, fetch, gameplay,
// ScenePulse, or application state in this VM.
const initial = await bootstrap.start();
assert.equal(repository.DB_NAME, 'HordeStudioExperimentalWorldsDB');
assert.deepEqual(Array.from(context.HordeBackupDomains.registered()), ['experimental-worlds']);
assert.equal(initial.defaultEnabled, false);
assert.equal(initial.enabled, false);
assert.equal(initial.acknowledged, false);
assert.equal(initial.hasData, false);
assert.equal(context.ScenePulse, undefined);
assert.equal(context.ExperimentalWorldsStateAdapter, undefined);
assert.equal(bootstrap.descriptor.route, 'experimentalWorlds');
assert.equal(bootstrap.descriptor.routes, undefined);
const unopenedManifest = await context.HordeBackupDomains.export();
assert.deepEqual(Object.keys(unopenedManifest.domains), ['experimental-worlds']);
assert.deepEqual(json(unopenedManifest.domains['experimental-worlds'].payload.worlds), []);

// Runtime adapters attach later and are not an ordinary-bootstrap dependency.
harness.loadRuntimeAdapters();
const stateAdapter = context.ExperimentalWorldsStateAdapter;
let hostView = 'experimentalWorldPlay';
stateAdapter.configure({
    readShared: key => key === 'view' ? hostView : null,
    writeShared: (key, value) => { if (key === 'view') hostView = value; }
});
assert.equal(context.ExperimentalWorldsState.view, 'worlds');
context.ExperimentalWorldsState.view = 'worldStudio';
assert.equal(context.ExperimentalWorldsState.view, 'worldStudio');
assert.equal(hostView, 'experimentalWorldPlay');

bootstrap.configure({ lifecycle: {
    captureSnapshot: async () => stateAdapter.snapshot(),
    applySnapshot: async snapshot => stateAdapter.hydrate(snapshot)
} });

// Normal runtime persistence separates heavy media, retains exact workspace,
// and is the only path that marks rolling recovery dirty.
stateAdapter.hydrate(payload('before'));
await bootstrap.persist('test-save');
const saved = await repository.snapshot();
assert.deepEqual(json(saved.worlds[0].mediaAssets), []);
assert.equal(saved.worldMediaAssets.before[0].id, 'before-image');
assert.equal(saved.workspace.route, 'play');
assert.equal(saved.workspace.studioTab, 'presentation');
assert.deepEqual(json(saved.workspace.futureOpaqueField), { keep: true });
assert.equal(saved.theme, 'midnight');
const runtimeReadback = await bootstrap.runtimeRepository.snapshot();
assert.equal(runtimeReadback.worlds[0].mediaAssets[0].id, 'before-image');
await bootstrap.runtimeRepository.writeSnapshot({
    ...runtimeReadback,
    workspace: { ...runtimeReadback.workspace, futureOpaqueField: { keep: 'through-facade' } }
}, 'runtime-facade-save');
const facadeSaved = await repository.snapshot();
assert.deepEqual(json(facadeSaved.workspace.futureOpaqueField), { keep: 'through-facade' });
assert.equal(facadeSaved.worldMediaAssets.before[0].id, 'before-image');
await bootstrap.persistWorkspace({
    ...facadeSaved.workspace,
    subViews: ['inspector'],
    futureOpaqueField: { keep: 'workspace-only' }
});
const workspaceSaved = await repository.snapshot();
assert.deepEqual(json(workspaceSaved.workspace.subViews), ['inspector']);
assert.deepEqual(json(workspaceSaved.workspace.futureOpaqueField), { keep: 'workspace-only' });
assert.equal(workspaceSaved.worldMediaAssets.before[0].id, 'before-image');
assert.equal(harness.recoveryNotifications(), 3);
assert.equal((await bootstrap.discover()).worldCount, 1);

const lifecycle = [];
let pendingWorkspaceFlush = null;
bootstrap.configure({
    readFeatureState: () => ({ enabled: true, acknowledgementVersion: 1 }),
    lifecycle: {
        flush: async ({ reason }) => {
            lifecycle.push(`flush:${reason}`);
            if (pendingWorkspaceFlush) {
                const workspace = pendingWorkspaceFlush;
                pendingWorkspaceFlush = null;
                await bootstrap.persistWorkspace(workspace, 'pending-workspace-flush');
            }
        },
        quiesce: async transaction => { lifecycle.push(`quiesce:${transaction.id}`); return 'runtime-token'; },
        resume: async (transaction, token) => lifecycle.push(`resume:${transaction.id}:${token}`)
    }
});

// Full coordinator restore uses the real hook order. The local monotonic
// generation changes even if the same manifest is deliberately restored twice.
const manifest = await context.HordeBackupDomains.export();
manifest.domains['experimental-worlds'].payload = json(payload('after', { studioTab: 'people' }));
manifest.domains['experimental-worlds'].checksum = await context.HordeBackupDomains.checksum(
    manifest.domains['experimental-worlds'].payload);
pendingWorkspaceFlush = { ...workspaceSaved.workspace, studioTab: 'flushed-before-quiesce' };
const generationBeforeRestore = bootstrap.captureRestoreGeneration();
await context.HordeBackupDomains.restore(manifest);
const firstRestoreGeneration = bootstrap.captureRestoreGeneration();
assert.ok(firstRestoreGeneration > generationBeforeRestore);
assert.equal(bootstrap.isRestoreGenerationCurrent(generationBeforeRestore), false);
assert.equal((await repository.snapshot()).activeWorldId, 'after');
assert.equal(stateAdapter.snapshot().worlds[0].mediaAssets[0].id, 'after-image');
assert.equal(stateAdapter.workspace().studioTab, 'people');
await context.HordeBackupDomains.restore(manifest);
assert.ok(bootstrap.captureRestoreGeneration() > firstRestoreGeneration);
assert.equal(harness.recoveryNotifications(), 4, 'restore must not masquerade as a normal persisted edit');
assert.ok(lifecycle.findIndex(event => event === 'flush:restore-quiesce')
    < lifecycle.findIndex(event => event.startsWith('quiesce:')));
assert.ok(lifecycle.some(event => event.startsWith('quiesce:')));
assert.ok(lifecycle.some(event => event.includes(':runtime-token')));

// Invalid input is rejected during validation, before quiescence or mutation.
const invalid = structuredClone(manifest);
invalid.domains['experimental-worlds'].payload.worlds = {};
invalid.domains['experimental-worlds'].checksum = await context.HordeBackupDomains.checksum(
    invalid.domains['experimental-worlds'].payload);
const lifecycleCount = lifecycle.length;
await assert.rejects(context.HordeBackupDomains.restore(invalid), /worlds array/);
assert.equal(lifecycle.length, lifecycleCount);
assert.equal((await repository.snapshot()).activeWorldId, 'after');

// A later domain that mutates and throws forces Experimental back to its exact
// preimage. Commit and rollback each invalidate old async ownership tokens.
let laterValue = 'stable';
context.HordeBackupDomains.register({
    id: 'later-failure', schemaVersion: 1,
    serialize: async () => ({ value: laterValue }),
    validate: async value => structuredClone(value),
    quiesce: async () => {},
    stage: async value => structuredClone(value),
    discardStage: async () => {},
    capturePreimage: async () => ({ value: laterValue }),
    journal: async () => {},
    commit: async value => { laterValue = value.value; throw new Error('injected later-domain failure'); },
    rollback: async value => { laterValue = value.value; },
    readback: async () => {},
    recover: async () => {},
    resume: async () => {}
});
const failing = await context.HordeBackupDomains.export();
failing.domains['experimental-worlds'].payload = json(payload('must-rollback'));
failing.domains['experimental-worlds'].checksum = await context.HordeBackupDomains.checksum(
    failing.domains['experimental-worlds'].payload);
failing.domains['later-failure'].payload = { value: 'broken' };
failing.domains['later-failure'].checksum = await context.HordeBackupDomains.checksum(
    failing.domains['later-failure'].payload);
const beforeFailedRestore = await repository.exportSnapshot();
const generationBeforeFailure = bootstrap.captureRestoreGeneration();
await assert.rejects(context.HordeBackupDomains.restore(failing), /injected later-domain failure/);
assert.deepEqual(json(await repository.exportSnapshot()), json(beforeFailedRestore));
assert.ok(bootstrap.captureRestoreGeneration() > generationBeforeFailure);
assert.equal(await repository.get('restoreStage'), undefined);
assert.equal(await repository.get('restoreJournal'), undefined);

// A durable coordinator decision is resolved opaquely and idempotently. The
// commit path keeps verified active data; the rollback path restores preimage.
const domain = bootstrap.domainDefinition;
const commitTransaction = { id: 'crash-commit', restoreGeneration: 'snapshot-id', domains: ['experimental-worlds'] };
await domain.quiesce(commitTransaction);
const commitStage = await domain.stage(json(payload('durable-commit')), commitTransaction);
const commitPreimage = await domain.capturePreimage(commitTransaction);
await domain.journal('prepared', commitTransaction, commitPreimage);
await domain.commit(commitStage, commitTransaction);
await domain.journal('committed', commitTransaction, commitPreimage);
await domain.resume(commitTransaction);
assert.equal((await repository.restoreStatus()).journal.status, 'coordinator-committed');
context.localStorage.setItem('horde_global_restore_coordinator_v1', JSON.stringify({
    version: 1, transactionId: commitTransaction.id,
    restoreGeneration: commitTransaction.restoreGeneration,
    startedAt: new Date().toISOString(), domains: commitTransaction.domains,
    diagnostic: false, decision: 'commit', phase: 'commit-decided'
}));
const committedRecovery = await context.HordeBackupDomains.recoverPending();
assert.equal(committedRecovery.decision, 'commit');
assert.equal((await repository.snapshot()).activeWorldId, 'durable-commit');
assert.equal((await repository.restoreStatus()).journal, null);
assert.equal((await domain.recover(commitTransaction, 'commit')).recovered, false);

const rollbackTransaction = { id: 'crash-rollback', restoreGeneration: 'another-snapshot-id', domains: ['experimental-worlds'] };
await domain.quiesce(rollbackTransaction);
const rollbackStage = await domain.stage(json(payload('durable-rollback')), rollbackTransaction);
const rollbackPreimage = await domain.capturePreimage(rollbackTransaction);
await domain.journal('prepared', rollbackTransaction, rollbackPreimage);
await domain.commit(rollbackStage, rollbackTransaction);
await domain.resume(rollbackTransaction);
context.localStorage.setItem('horde_global_restore_coordinator_v1', JSON.stringify({
    version: 1, transactionId: rollbackTransaction.id,
    restoreGeneration: rollbackTransaction.restoreGeneration,
    startedAt: new Date().toISOString(), domains: rollbackTransaction.domains,
    diagnostic: false, decision: 'rollback', phase: 'prepared'
}));
const rolledBackRecovery = await context.HordeBackupDomains.recoverPending();
assert.equal(rolledBackRecovery.decision, 'rollback');
assert.equal((await repository.snapshot()).activeWorldId, 'durable-commit');
assert.equal((await repository.restoreStatus()).journal, null);

// The integration must never smuggle an archival origin into startup.
for (const [name, source] of Object.entries({ repository: sources.repository, bootstrap: sources.bootstrap })) {
    assert.equal(source.includes('43127'), false, `${name} contains an archival-origin reference`);
}

const discoverable = await bootstrap.discover();
assert.equal(discoverable.enabled, true);
assert.equal(discoverable.acknowledged, true);
assert.equal(discoverable.recoveryPending, false);

console.log('Experimental Worlds persistence: bootstrap, workspace, restore, rollback, recovery, and fencing passed');
