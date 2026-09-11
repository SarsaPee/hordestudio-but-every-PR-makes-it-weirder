#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = fs.readFileSync(new URL('../backup-domain-coordinator.js', import.meta.url), 'utf8');
function createLocalStorage(seed = new Map()) {
    return {
        getItem: key => seed.has(key) ? seed.get(key) : null,
        setItem: (key, value) => seed.set(String(key), String(value)),
        removeItem: key => seed.delete(String(key)),
        _entries: seed
    };
}

const localStorage = createLocalStorage();
const context = {
    window: {},
    crypto: webcrypto,
    TextEncoder,
    console,
    localStorage,
    AggregateError
};
vm.runInNewContext(source, context, { filename: 'backup-domain-coordinator.js' });
const coordinator = context.window.HordeBackupDomains;

function domain(id, initial, { failCommit = false } = {}) {
    let authoritative = structuredClone(initial);
    let stage = null;
    let durablePreimage = null;
    let paused = false;
    const journal = [];
    return {
        definition: {
            id,
            schemaVersion: 1,
            serialize: async () => structuredClone(authoritative),
            validate: async value => {
                assert.equal(typeof value?.value, 'string');
                return structuredClone(value);
            },
            quiesce: async () => { paused = true; },
            stage: async value => (stage = structuredClone(value)),
            discardStage: async () => { stage = null; },
            capturePreimage: async () => structuredClone(authoritative),
            commit: async value => {
                assert.equal(paused, true);
                authoritative = structuredClone(value);
                if (failCommit) throw new Error(`${id} injected commit failure`);
            },
            rollback: async value => { authoritative = structuredClone(value); stage = null; },
            readback: async value => assert.deepEqual(authoritative, value),
            resume: async () => { paused = false; },
            journal: async (phase, _transaction, preimage) => {
                journal.push(phase);
                if (phase === 'prepared') durablePreimage = structuredClone(preimage);
                if (phase === 'complete' || phase === 'rolled-back') {
                    durablePreimage = null;
                    stage = null;
                }
            },
            recover: async (_transaction, decision) => {
                if (decision === 'rollback' && durablePreimage) authoritative = structuredClone(durablePreimage);
                if (decision === 'commit' && stage) assert.deepEqual(authoritative, stage);
                durablePreimage = null;
                stage = null;
            }
        },
        get: () => structuredClone(authoritative),
        journal
    };
}

const host = domain('host', { value: 'host-before' });
const experimental = domain('experimental', { value: 'experimental-before' });
coordinator.register(host.definition);
coordinator.register(experimental.definition);

const manifest = await coordinator.export();
assert.equal(manifest._version, 3);
assert.equal(typeof manifest.backupId, 'string');
assert.deepEqual(Array.from(coordinator.registered()), ['host', 'experimental']);

manifest.domains.host.payload.value = 'host-after';
manifest.domains.host.checksum = await coordinator.checksum(manifest.domains.host.payload);
manifest.domains.experimental.payload.value = 'experimental-after';
manifest.domains.experimental.checksum = await coordinator.checksum(manifest.domains.experimental.payload);
const firstRestore = await coordinator.restore(manifest);
assert.equal(host.get().value, 'host-after');
assert.equal(experimental.get().value, 'experimental-after');
const secondRestore = await coordinator.restore(manifest);
assert.notEqual(firstRestore.restoreGeneration, secondRestore.restoreGeneration);

const corrupt = structuredClone(manifest);
corrupt.domains.experimental.payload.value = 'tampered';
await assert.rejects(coordinator.restore(corrupt), /integrity/);
assert.equal(host.get().value, 'host-after');
assert.equal(experimental.get().value, 'experimental-after');

const failingContext = {
    window: {}, crypto: webcrypto, TextEncoder, console,
    localStorage: createLocalStorage(), AggregateError
};
vm.runInNewContext(source, failingContext, { filename: 'backup-domain-coordinator.js' });
const failingCoordinator = failingContext.window.HordeBackupDomains;
const stable = domain('stable', { value: 'stable-before' });
const broken = domain('broken', { value: 'broken-before' }, { failCommit: true });
failingCoordinator.register(stable.definition);
failingCoordinator.register(broken.definition);
const failingManifest = await failingCoordinator.export();
failingManifest.domains.stable.payload.value = 'stable-after';
failingManifest.domains.stable.checksum = await failingCoordinator.checksum(failingManifest.domains.stable.payload);
failingManifest.domains.broken.payload.value = 'broken-after';
failingManifest.domains.broken.checksum = await failingCoordinator.checksum(failingManifest.domains.broken.payload);
await assert.rejects(failingCoordinator.restore(failingManifest), /injected commit failure/);
assert.equal(stable.get().value, 'stable-before');
assert.equal(broken.get().value, 'broken-before');

await assert.rejects(coordinator.restore(manifest, { ids: ['host'] }), /diagnostic-only/);
await coordinator.restoreDomain(manifest, 'host');
assert.equal(host.get().value, 'host-after');

const missingDomain = structuredClone(manifest);
delete missingDomain.domains.experimental;
await assert.rejects(coordinator.restore(missingDomain), /exactly every registered/);

coordinator.seal();
assert.throws(() => coordinator.register(domain('late', { value: 'late' }).definition), /sealed/);
assert.equal(localStorage._entries.size, 0);

console.log('backup domain coordinator: atomic restore and diagnostic restore passed');
