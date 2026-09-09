/**
 * Inline state-payload rescue audit.
 *
 * Reproduces the reported failure: the DM narrates a character entering the
 * room, but the HUD shows "No one here" and the World Ledger never moves —
 * because the model printed its state payload as text instead of emitting a
 * tool call, and the engine scrubbed it away instead of applying it.
 *
 * Run with: node scratch/inline_state_rescue_audit.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function matchSpan(startIndex, openChar, closeChar, label, searchFrom = startIndex) {
    const open = app.indexOf(openChar, searchFrom);
    assert(open >= 0, `No opening ${openChar} for ${label}`);
    let depth = 0;
    let lastSignificant = '';
    for (let i = open; i < app.length; i++) {
        const char = app[i];
        const next = app[i + 1];
        if (char === '/' && next === '/') { i = app.indexOf('\n', i); if (i < 0) break; continue; }
        if (char === '/' && next === '*') { i = app.indexOf('*/', i + 2) + 1; continue; }
        if (char === '"' || char === "'" || char === '`') {
            for (i++; i < app.length; i++) {
                if (app[i] === '\\') { i++; continue; }
                if (app[i] === char) break;
            }
            lastSignificant = char;
            continue;
        }
        if (char === '/' && /[(,=:[!&|?{};\n+\-*%^~<>]/.test(lastSignificant || '\n')) {
            let inClass = false;
            for (i++; i < app.length; i++) {
                if (app[i] === '\\') { i++; continue; }
                if (app[i] === '[') inClass = true;
                else if (app[i] === ']') inClass = false;
                else if (app[i] === '/' && !inClass) break;
            }
            lastSignificant = '/';
            continue;
        }
        if (!/\s/.test(char)) lastSignificant = char;
        if (char === openChar) depth++;
        else if (char === closeChar && --depth === 0) return app.slice(startIndex, i + 1);
    }
    throw new Error(`Unclosed ${label}`);
}
function functionSource(name) {
    const start = app.indexOf(`function ${name}(`);
    assert(start >= 0, `Missing function: ${name}`);
    const params = matchSpan(start, '(', ')', `params of ${name}`);
    return matchSpan(start, '{', '}', `function ${name}`, start + params.length);
}
function frozenArrayConstSource(name) {
    const start = app.indexOf(`const ${name} = Object.freeze([`);
    assert(start >= 0, `Missing frozen const: ${name}`);
    return matchSpan(start, '(', ')', `const ${name}`) + ';';
}

const context = {};
vm.createContext(context);
vm.runInContext(
    frozenArrayConstSource('ENGINE_STATE_KEYS') + '\n' +
    functionSource('dirtyJSONRepair') + '\n' +
    functionSource('safeParseJSONRepair') + '\n' +
    functionSource('extractInlineWorldStatePayload') + '\n' +
    functionSource('scrubNarrativeArtifacts') + '\n' +
    'this.extractInlineWorldStatePayload = extractInlineWorldStatePayload;' +
    'this.scrubNarrativeArtifacts = scrubNarrativeArtifacts;' +
    'this.ENGINE_STATE_KEYS = ENGINE_STATE_KEYS;',
    context
);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const extract = text => context.extractInlineWorldStatePayload(text);

// The exact reported failure -----------------------------------------------

test('the reported case: an NPC narrated entering the room is recovered', () => {
    const reply = `The door swings inward and Maera Thistledown steps through, flour still on her forearms.

\`\`\`json
{"npc_moves":[{"npc_id":"ent_maera","location_id":"loc_square"}],"ledger_update":"Maera sought the player out in the square."}
\`\`\``;
    const payload = extract(reply);
    assert(payload, 'the narrated arrival was not recovered — the room would read as empty');
    assert.equal(payload.npc_moves[0].npc_id, 'ent_maera');
    assert.equal(payload.npc_moves[0].location_id, 'loc_square');
    assert.equal(payload.ledger_update, 'Maera sought the player out in the square.');
});

test('the payload the engine recovers is exactly what the scrubber removes', () => {
    const reply = `Brannoc sets down his hammer.

{"npc_moves":[{"npc_id":"ent_brannoc","location_id":"loc_forge"}]}`;
    assert(extract(reply), 'payload not recovered');
    const scrubbed = context.scrubNarrativeArtifacts(reply);
    assert(!scrubbed.includes('npc_moves'), 'the scrubber left engine JSON in the prose');
    assert(scrubbed.includes('Brannoc sets down his hammer.'), 'the scrubber ate the narration');
});

// Shapes models actually emit ----------------------------------------------

test('a bare JSON object with no fence is recovered', () => {
    const payload = extract('She leaves.\n{"location_id": "loc_hall", "time_skip_minutes": 30}');
    assert.equal(payload.location_id, 'loc_hall');
    assert.equal(payload.time_skip_minutes, 30);
});

test('a provider-style function wrapper is unwrapped', () => {
    const payload = extract('{"name":"update_world_state","arguments":{"ledger_update":"The bell rang thirteen times."}}');
    assert.equal(payload.ledger_update, 'The bell rang thirteen times.');
});

test('a wrapper whose arguments are a JSON string is unwrapped', () => {
    const payload = extract('{"name":"update_world_state","arguments":"{\\"npc_moves\\":[{\\"npc_id\\":\\"a\\",\\"location_id\\":\\"b\\"}]}"}');
    assert.equal(payload.npc_moves[0].npc_id, 'a');
});

test('prose containing braces before the real payload does not derail it', () => {
    const reply = 'He mutters "{something}" under his breath, then {shrugs}.\n\n{"stat_changes":[{"id":"hp","change":-2}]}';
    const payload = extract(reply);
    assert(payload, 'a brace in the prose blocked recovery');
    assert.equal(payload.stat_changes[0].change, -2);
});

test('a payload with strings containing braces and quotes survives', () => {
    const payload = extract('{"ledger_update":"She said \\"go {now}\\" and left."}');
    assert.equal(payload.ledger_update, 'She said "go {now}" and left.');
});

test('a multi-line pretty-printed payload is recovered', () => {
    const payload = extract(`Rain starts.

{
  "npc_moves": [
    { "npc_id": "ent_pip", "location_id": "loc_square" }
  ],
  "world_events": []
}`);
    assert.equal(payload.npc_moves[0].npc_id, 'ent_pip');
});

// It must not fire when it shouldn't ---------------------------------------

test('ordinary narration yields nothing', () => {
    assert.equal(extract('The fire crackles. Nobody speaks.'), null);
    assert.equal(extract(''), null);
    assert.equal(extract(null), null);
});

test('unrelated JSON in the prose is not mistaken for a payload', () => {
    assert.equal(extract('He shows you a note: {"price": 12, "seller": "Quill"}'), null,
        'a non-engine object was applied as world state');
});

test('truncated inline JSON is refused rather than half-applied', () => {
    assert.equal(extract('{"npc_moves":[{"npc_id":'), null, 'a truncated payload was accepted');
    assert.equal(extract('{"location_id":"loc_hall"'), null, 'an unterminated inline object was accepted');
});

test('every engine field the tool accepts is recognised inline', () => {
    context.ENGINE_STATE_KEYS.forEach(key => {
        const payload = extract(JSON.stringify({ [key]: [] }));
        assert(payload, `inline "${key}" would be discarded`);
        assert(Object.prototype.hasOwnProperty.call(payload, key));
    });
});

test('the rescue runs whenever no valid state call was successfully applied', () => {
    const turn = app.slice(app.indexOf('--- TURN RECEIPT RESCUE ---'));
    const block = turn.slice(0, turn.indexOf('--- FOLLOW-UP LOOP ---'));
    assert(/if \(!successfulStateCall\)/.test(block),
        'a malformed or empty tool call prevents the textual rescue from running');
    assert(block.includes('extractInlineWorldTurnReceipt(fullText)'),
        'the canonical tagged receipt is never read');
    assert(block.includes('commitWorldTurnReceipt'),
        'the recovered receipt bypasses the validator/reducer');
    assert(/lastTurnStateSource/.test(turn.slice(0, turn.indexOf('--- FOLLOW-UP LOOP ---') + 400)),
        'the turn does not record how (or whether) state landed');
});

// The tool-free text channel ------------------------------------------------

test('a tagged world_state_json block is recovered and hidden from the player', () => {
    const reply = `Maera pushes the door open and steps in out of the rain.

<world_state_json>{"npc_moves":[{"npc_id":"ent_maera","target_location_id":"loc_crypt"}],"ledger_update":"Maera found the player."}</world_state_json>`;
    const payload = extract(reply);
    assert(payload, 'the explicit state channel was not read');
    assert.equal(payload.npc_moves[0].npc_id, 'ent_maera');
    const shown = context.scrubNarrativeArtifacts(reply);
    assert(!shown.includes('world_state_json'), 'the state block leaked into the narration');
    assert(!shown.includes('npc_moves'), 'the payload leaked into the narration');
    assert(shown.includes('out of the rain.'), 'the scrubber ate the prose');
});

test('the tagged block wins over unrelated JSON elsewhere in the prose', () => {
    const reply = `He shows a receipt: {"npc_moves":[{"npc_id":"WRONG","target_location_id":"nowhere"}]}

<world_state_json>{"ledger_update":"The real one."}</world_state_json>`;
    assert.equal(extract(reply).ledger_update, 'The real one.');
});

test('an unterminated state block is still scrubbed from the narration', () => {
    const shown = context.scrubNarrativeArtifacts('She leaves.\n<world_state_json>{"ledger_update":"cut off"');
    assert(!shown.includes('world_state_json'), 'a truncated block was shown to the player');
    assert(shown.includes('She leaves.'));
});

test('the state failsafe is available on the first action turn and closes on success', () => {
    const turn = app.slice(app.indexOf('[TURN RECEIPT DELIVERY FAILSAFE]') - 900);
    const armBlock = turn.slice(0, 1200);
    assert(/command !== 'look' && command !== 'init'/.test(armBlock),
        'the channel opens on turns that are not real player actions');
    assert(/if and only if this provider cannot emit/i.test(armBlock),
        'proper tool callers are not told when the text failsafe is appropriate');

    const tracker = app.slice(app.indexOf('Track how often real action turns produce no state'));
    const trackBlock = tracker.slice(0, 1600);
    assert(/successfulStateCall \|\| inlineStateApplied \|\| repairedReceiptApplied/.test(trackBlock),
        'a successful tool or rescued state payload does not reset the streak');
    assert(/command !== 'continue'/.test(trackBlock),
        'silent continue turns are counted as misses');
});

// npc_moves: the field that silently swallowed arrivals ----------------------

test('npc_moves accepts location_id, the convention every other field uses', () => {
    const handler = app.slice(app.indexOf('if (args.npc_moves && Array.isArray(args.npc_moves))'));
    const block = handler.slice(0, handler.indexOf('if (args.npc_introduced'));
    assert(/move\?\.target_location_id/.test(block), 'the documented field name is no longer read');
    assert(/move\?\.location_id/.test(block),
        'a move written as location_id is still dropped — the room would read as empty');
    ['to_location_id', 'destination_id', 'destination'].forEach(alias => {
        assert(block.includes(alias), `the natural alias "${alias}" is not accepted`);
    });
});

test('an unresolvable npc_move is reported, never swallowed', () => {
    const handler = app.slice(app.indexOf('if (args.npc_moves && Array.isArray(args.npc_moves))'));
    const block = handler.slice(0, handler.indexOf('if (args.npc_introduced'));
    assert(/else\s*\{/.test(block), 'there is no failure branch at all');
    assert(block.includes('moduleRejections.push'), 'a failed move is not reported back to the turn');
    assert(/console\.warn/.test(block), 'a failed move leaves no diagnostic');
    assert(/unknown_npc/.test(block) && /unknown_destination/.test(block),
        'the two distinct failure causes are not distinguished');
});

test('the npc_moves schema demands a destination and says why it matters', () => {
    const schema = app.slice(app.indexOf('npc_moves: {'), app.indexOf('npc_moves: {') + 1400);
    assert(/required:\s*\["npc_id",\s*"target_location_id"\]/.test(schema),
        'the destination is still optional, so the model may omit it');
    assert(/arriving, entering, joining, or leaving/i.test(schema),
        'the schema does not tell the model when this call is mandatory');
    assert(/show the room as empty/i.test(schema),
        'the schema does not state the consequence of skipping it');
});

test('the mandate tells the DM that narrated presence must be recorded', () => {
    const mandate = app.slice(app.indexOf('[FINAL MANDATE]'), app.indexOf('[FINAL MANDATE]') + 4000);
    assert(/Presence Is State/i.test(mandate), 'nothing tells the DM that arrivals must be recorded');
    assert(/actor-scoped movement events/i.test(mandate), 'the mandate never names the canonical event to use');
    assert(/Never print the receipt as ordinary prose/i.test(mandate),
        'the mandate does not forbid printing the receipt as visible prose');
});

let failures = 0;
for (const { name, fn } of tests) {
    try { fn(); console.log(`✓ ${name}`); }
    catch (error) { failures++; console.error(`✗ ${name}\n  ${error.message}`); }
}
if (failures) {
    console.error(`\n${failures} inline-rescue check(s) failed.`);
    process.exit(1);
}
console.log(`\n${tests.length} inline state rescue checks passed.`);
