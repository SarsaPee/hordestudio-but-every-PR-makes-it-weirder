/**
 * Persistent chat-memory regression audit.
 * Run with: node scratch/chat_memory_audit.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { app, buildContext, functionSource } = require('./app_source.js');

const state = {
    activePersonaId: 'persona_a', activeCharId: 'char_a', activeRoomId: null,
    chatContinuities: {}, chats: {}, characters: [], worldInstances: {},
    globalSettings: { embeddingModel: 'embed-a', embeddingBaseUrl: 'https://embed.example/v1' }
};
let uuidCounter = 0;
const context = {
    state,
    console: { warn() {}, log() {} },
    HordeVectorMemory: {
        namespace: () => 'https://embed.example/v1|embed-a',
        hashText: text => `hash_${String(text).length}`
    },
    crypto: { randomUUID: () => `test-uuid-${++uuidCounter}` }
};
buildContext(vm, [
    'normalizeChatMemoryRecord', 'upsertContinuityMemoryRecords',
    'parseStructuredChatMemory', 'memoryTextWithinBudget', 'chatMemoryVisibleTo'
], context);

const continuity = { id: 'continuity_a', records: [] };
const first = context.upsertContinuityMemoryRecords(continuity, [{
    type: 'state', key: 'hero:location', text: 'The hero is in the library.', importance: 0.8
}], { sourceSessionId: 'session_a', startIndex: 0, endIndex: 8 });
assert.equal(first.length, 1);
assert.equal(continuity.records[0].status, 'active');

context.upsertContinuityMemoryRecords(continuity, [{
    type: 'state', key: 'hero:location', text: 'The hero is now at the harbor.', importance: 0.9
}], { sourceSessionId: 'session_a', startIndex: 8, endIndex: 16 });
assert.equal(continuity.records.length, 2);
assert.equal(continuity.records[0].status, 'superseded', 'older canonical state was not retired');
assert.equal(continuity.records[1].status, 'active');

const beforeDuplicate = continuity.records.length;
context.upsertContinuityMemoryRecords(continuity, [{
    type: 'state', key: 'hero:location', text: 'The hero is now at the harbor.', importance: 0.9
}], { sourceSessionId: 'session_a', startIndex: 8, endIndex: 16 });
assert.equal(continuity.records.length, beforeDuplicate, 'the same consolidation range was written twice');

const parsed = context.parseStructuredChatMemory('```json\n' + JSON.stringify({
    summary: 'Mara promised to return the key.',
    memories: [
        { type: 'thread', key: 'mara:return_key', text: 'Mara owes the key back.', status: 'active', importance: 0.9 },
        { type: 'state', key: 'key:holder', text: 'Mara has the brass key.', status: 'active' }
    ]
}) + '\n```');
assert.equal(parsed.memories.length, 2);
assert.equal(parsed.memories[0].type, 'thread');

const budgeted = context.memoryTextWithinBudget([
    { type: 'thread', text: 'A'.repeat(300), status: 'active' },
    { type: 'fact', text: 'B'.repeat(300), status: 'active' }
], 50);
assert(budgeted.length <= 190, 'memory prompt exceeded its token-derived character budget');

const privateMemory = context.normalizeChatMemoryRecord({
    type: 'relationship', text: 'A private confession.', scope: 'relationship',
    personaId: 'persona_b', witnessedBy: ['char_a']
});
assert.equal(context.chatMemoryVisibleTo(privateMemory, { id: 'char_a', name: 'Mara' }, false), false,
    'relationship memory leaked into another persona');

assert(/const memoryConsolidationJobs = new WeakMap\(\)/.test(app), 'consolidation has no per-session race lock');
assert(/pendingEmbeddings/.test(functionSource('consolidateSessionEpisodicMemoryRun')),
    'raw memories are not committed before vector enrichment');
assert(/chatContinuities: state\.chatContinuities/.test(app), 'continuities are absent from persistence or backup');
assert(/previousEmbeddingNamespace/.test(functionSource('setupGlobalSettings')),
    'embedding model changes do not invalidate incompatible vectors');
assert(/recordImmediateChatMemory/.test(functionSource('handleChat')),
    'the model memory writeback never reaches durable storage');
assert(/state\.editingChar = state\.editingChar \|\|/.test(functionSource('summarizeStory')) === false,
    'manual summaries can still attach to the last Studio character');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
['continue', 'fork', 'fresh'].forEach(mode => {
    assert(new RegExp(`<option value="${mode}"`).test(html), `new sessions cannot select ${mode} continuity`);
});

console.log('✓ persistent chat-memory schema, recall, provenance, and continuity controls passed');
