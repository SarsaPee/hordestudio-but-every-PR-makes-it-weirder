/**
 * Tool-schema ↔ handler contract audit.
 *
 * The npc_moves bug — schema said `target_location_id`, the model wrote
 * `location_id` (the convention every other field uses), and the engine
 * silently dropped the move — was invisible because nothing checked that the
 * contract held. This locks it: every field the model is told about must be
 * read by the handler, must be recoverable from text, and must not fail mute.
 *
 * Run with: node scratch/tool_contract_audit.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function balanced(source, from) {
    let depth = 0;
    let i = source.indexOf('{', from);
    const start = i;
    for (; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
    }
    throw new Error('unbalanced block');
}

const handler = balanced(app, app.indexOf('function processStructuredActions(args)'));
const validator = balanced(app, app.indexOf('function validateWorldTurnReceipt'));
const normalizer = balanced(app, app.indexOf('function normalizeWorldTurnReceipt'));
const contractSource = `${handler}\n${validator}\n${normalizer}`;
const schema = balanced(app, app.indexOf('properties: {', app.indexOf('name: "commit_world_turn"')));
const engineKeys = [...app.match(/const ENGINE_STATE_KEYS = Object\.freeze\(\[([\s\S]*?)\]\)/)[1]
    .matchAll(/'([^']+)'/g)].map(m => m[1]);

// Top-level field names declared in the tool schema.
const topFields = (() => {
    const found = [];
    let depth = 0;
    for (const m of schema.matchAll(/(\w+)\s*:\s*\{|\{|\}/g)) {
        const token = m[0];
        if (token === '{') depth++;
        else if (token === '}') depth--;
        else { if (depth === 1) found.push(m[1]); depth++; }
    }
    return [...new Set(found)];
})();

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('the schema advertises a meaningful number of fields', () => {
    assert(topFields.length >= 25, `only found ${topFields.length} schema fields — parser may be broken`);
});

test('every advertised field is actually read by the handler', () => {
    const unread = topFields.filter(field =>
        !new RegExp(`(?:args|source|receipt|sceneSource|stateUpdates|legacyArgs)\\.${field}\\b`).test(contractSource)
        && !contractSource.includes(`'${field}'`) && !contractSource.includes(`"${field}"`));
    assert.deepEqual(unread, [],
        `the model is told about fields the engine ignores: ${unread.join(', ')}`);
});

test('every advertised field can be recovered from a text payload', () => {
    // Without this, a model that prints its payload instead of calling the tool
    // loses exactly the fields missing from ENGINE_STATE_KEYS.
    const receiptFields = new Set(['summary', 'scene', 'events', 'entity_updates', 'state_updates']);
    const uncovered = topFields.filter(field => !receiptFields.has(field) && !engineKeys.includes(field));
    assert.deepEqual(uncovered, [],
        `inline rescue would silently drop: ${uncovered.join(', ')}`);
});

test('the rescue list does not claim fields the schema never offers', () => {
    const phantom = engineKeys.filter(key => !topFields.includes(key));
    assert.deepEqual(phantom, [],
        `ENGINE_STATE_KEYS lists fields no longer in the schema: ${phantom.join(', ')}`);
});

test('every declared sub-field is read somewhere in the engine', () => {
    const subs = new Set();
    let depth = 0;
    for (const m of schema.matchAll(/(\w+)\s*:\s*\{|\{|\}/g)) {
        const token = m[0];
        if (token === '{') depth++;
        else if (token === '}') depth--;
        else { if (depth >= 3) subs.add(m[1]); depth++; }
    }
    // JSON Schema vocabulary and container names, not payload fields.
    ['properties', 'items', 'type', 'description', 'enum', 'required', 'minimum',
     'maximum', 'additionalProperties', 'optional', 'failure_cost', 'rewards',
     'blocks', 'objectives', 'relations', 'stat_changes'].forEach(word => subs.delete(word));
    const orphaned = [...subs].filter(sub => !new RegExp(`(?<![\\w])${sub}(?![\\w])`).test(app));
    assert.deepEqual(orphaned, [],
        `sub-fields the model may send that nothing ever reads: ${orphaned.join(', ')}`);
});

test('npc_moves accepts the destination spelling every other field uses', () => {
    const block = handler.slice(handler.indexOf('args.npc_moves'));
    const scoped = block.slice(0, block.indexOf('args.npc_introduced'));
    assert(/target_location_id/.test(scoped), 'the documented spelling is no longer read');
    assert(/\blocation_id\b/.test(scoped),
        'npc_moves still ignores location_id — the exact bug that showed an empty room');
});

test('a directive that cannot be applied is never dropped in silence', () => {
    // The whole class of "it just did nothing and said nothing" bugs.
    const block = handler.slice(handler.indexOf('args.npc_moves'));
    const scoped = block.slice(0, block.indexOf('args.npc_introduced'));
    assert(/moduleRejections\.push|console\.warn/.test(scoped),
        'an unresolvable npc_move produces no rejection and no log');
});

test('the turn records how state arrived, so failure is visible', () => {
    assert(/lastTurnStateSource\s*=/.test(app), 'the turn does not record its state source');
    ['tool_call', 'inline_rescue'].forEach(source => {
        assert(app.includes(`'${source}'`), `state source "${source}" is not tracked`);
    });
    assert(/stateSource:\s*sess\.lastTurnStateSource/.test(app),
        'the state source never reaches the message metadata');
});

test('a model proven not to call tools is remembered across sessions', () => {
    assert(/toolShyModels/.test(app), 'nothing remembers a tool-shy model');
    const arming = app.slice(app.indexOf('knownToolShy'), app.indexOf('knownToolShy') + 500);
    assert(/toolShyModels\)\s*\n?\s*&&\s*state\.globalSettings\.toolShyModels\.includes\(modelId\)|includes\(modelId\)/.test(arming),
        'the remembered list is not consulted when arming the text channel');
    const learning = app.slice(app.indexOf('Track how often real action turns'));
    assert(/toolShyModels = \[\.\.\.shyList, modelId\]/.test(learning),
        'a repeatedly silent model is never added to the list');
    assert(/filter\(id => id !== modelId\)/.test(learning),
        'a model that starts calling tools is never forgiven');
});

let failures = 0;
for (const { name, fn } of tests) {
    try { fn(); console.log(`✓ ${name}`); }
    catch (error) { failures++; console.error(`✗ ${name}\n  ${error.message}`); }
}
if (failures) {
    console.error(`\n${failures} tool contract check(s) failed.`);
    process.exit(1);
}
console.log(`\n${tests.length} tool contract checks passed (${topFields.length} fields verified).`);
