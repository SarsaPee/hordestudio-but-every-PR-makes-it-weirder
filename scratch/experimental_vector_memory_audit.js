/**
 * Experimental Worlds vector-memory ownership audit.
 * Run with: node scratch/experimental_vector_memory_audit.js
 *
 * This is deliberately a small runtime exercise of the relocated cache, not
 * a substitute for browser acceptance. It proves the cache's two dependencies
 * are the Experimental repository and the explicit embedding adapter.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'experiences', 'experimental-worlds', 'runtime', 'experimental-vector-memory.js'), 'utf8');
assert(!source.includes('HordeVectorMemory') && !source.includes('HordeDB'),
    'Experimental vector memory must not import or name the host cache/database');

const records = new Map();
const writes = [];
let embeddingRequests = 0;
const context = {
    console: { log() {}, warn() {}, error() {} },
    Date,
    Map,
    Set,
    Math,
    BigInt,
    Array,
    Object,
    String,
    Number,
    RegExp,
    clearTimeout() {},
    setTimeout(callback) { callback(); return 1; },
    document: { getElementById() { return null; } },
    ExperimentalWorldsState: {
        globalSettings: {
            embeddingBaseUrl: 'https://embeddings.example/v1',
            embeddingModel: 'test-embed',
            embeddingCacheLimit: 100
        }
    },
    ExperimentalWorldsRepository: {
        async get(key) { return records.get(key); },
        async setMany(values) {
            writes.push(values);
            Object.entries(values).forEach(([key, value]) => records.set(key, value));
        }
    },
    ExperimentalWorldsHost: {
        async getEmbedding(text) {
            embeddingRequests += 1;
            return /harbor/i.test(text) ? [0, 1] : [1, 0];
        }
    }
};
context.globalThis = context;
vm.runInNewContext(source, context);
const memory = context.ExperimentalWorldsVectorMemory;

(async () => {
    const first = await memory.getCachedEmbedding('The library door is locked.');
    const second = await memory.getCachedEmbedding('The library door is locked.');
    assert.deepEqual(Array.from(first), [1, 0]);
    assert.deepEqual(Array.from(second), [1, 0]);
    assert.equal(embeddingRequests, 1, 'the private cache did not prevent a duplicate host embedding request');
    assert.equal(writes.length, 1, 'the private cache did not persist through its repository');
    assert.deepEqual(Object.keys(writes[0]), ['experimentalVectorEmbeddingCache'],
        'the private cache persisted through an unrelated host record');

    const recalled = await memory.search([
        { key: 'library', type: 'state', text: 'The library door is locked.', embedding: [1, 0], embeddingNamespace: memory.namespace(), importance: 0.8, status: 'active' },
        { key: 'harbor', type: 'fact', text: 'The harbor is foggy.', embedding: [0, 1], embeddingNamespace: memory.namespace(), importance: 0.6, status: 'active' }
    ], 'Where is the library door?', 1);
    assert.equal(recalled.length, 1);
    assert.equal(recalled[0].key, 'library', 'semantic/lexical recall changed while relocating the cache');
    assert.equal(memory.namespace(), 'https://embeddings.example/v1|test-embed');
    console.log('Experimental vector-memory ownership audit passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
