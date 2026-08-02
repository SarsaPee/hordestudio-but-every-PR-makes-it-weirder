/**
 * Contextual intent + provider tool reliability regression audit.
 * Run with: node scratch/world_intent_reliability_audit.js
 */
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { buildContext } = require('./app_source.js');

const context = { console: { log() {}, warn() {}, error() {} } };
buildContext(vm, [
    'extractUserMovementTarget', 'resolveWorldMovementTarget',
    'detectPlayerOutfitIntent', 'applyPlayerOutfitIntent',
    'accumulateWorldToolCall', 'parseWorldToolArguments',
    'findReferencedWorldNpcs', 'resolveNpcId',
    'applyNarratedPresence'
], context);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function movementWorld(twoBuildings = false) {
    return {
        locations: [
            { id: 'street', name: 'Rainy Street', mapType: 'outdoor',
                exits: twoBuildings ? ['to Old Library', 'to Copper Inn'] : ['to Old Library'] },
            { id: 'library', name: 'Old Library', mapType: 'building',
                description: 'An old stone building with oak doors.', parentLocationId: 'street', exits: ['to Rainy Street', 'to Reading Room'] },
            { id: 'reading', name: 'Reading Room', mapType: 'room',
                parentLocationId: 'library', exits: ['to Old Library'] },
            ...(twoBuildings ? [{ id: 'inn', name: 'Copper Inn', mapType: 'building',
                parentLocationId: 'street', exits: ['to Rainy Street'] }] : [])
        ]
    };
}

function resolveMovement(world, input, from = 'street') {
    const phrase = context.extractUserMovementTarget(input);
    return { phrase, target: phrase ? context.resolveWorldMovementTarget(world, from, phrase) : null };
}

test('generic building movement resolves against the unique local scene', () => {
    const result = resolveMovement(movementWorld(), 'I walk into a building');
    assert.equal(result.phrase.toLowerCase(), 'a building');
    assert.equal(result.target?.id, 'library');
});

test('step inside and through the door use the same contextual resolver', () => {
    assert.equal(resolveMovement(movementWorld(), 'I step inside').target?.id, 'library');
    assert.equal(resolveMovement(movementWorld(), 'I go through the door').target?.id, 'library');
});

test('a generic building never guesses between two plausible doors', () => {
    assert.equal(resolveMovement(movementWorld(true), 'I enter the building').target, null);
});

test('proper authored names beat generic map categories', () => {
    assert.equal(resolveMovement(movementWorld(true), 'I enter the Copper Inn').target?.id, 'inn');
});

test('player outfit replacement, addition and removal preserve the right state', () => {
    const session = { outfit: 'white shirt, black trousers' };
    let result = context.applyPlayerOutfitIntent(session, 'I put on the red coat.');
    assert.equal(result.mode, 'add');
    assert.match(session.outfit, /white shirt/);
    assert.match(session.outfit, /red coat/i);

    result = context.applyPlayerOutfitIntent(session, 'I take off the red coat.');
    assert.equal(result.mode, 'remove');
    assert.doesNotMatch(session.outfit, /red coat/i);
    assert.match(session.outfit, /white shirt/);

    result = context.applyPlayerOutfitIntent(session, 'I change into a blue evening dress and silver shoes.');
    assert.equal(result.mode, 'replace');
    assert.match(session.outfit, /blue evening dress/i);
});

test('natural first-person outfit declarations update state without a model tool call', () => {
    const exactReport = {
        outfit: 'Standard attire.'
    };
    const result = context.applyPlayerOutfitIntent(
        exactReport,
        'I get up and stretch as i step out of the bed, my hair are shaggy, my morning erection is hard, im wearing a thin pair of boxer shorts and an old tshirt.'
    );
    assert.equal(result.mode, 'replace');
    assert.equal(exactReport.outfit, 'thin pair of boxer shorts and an old tshirt');

    const curly = { outfit: '' };
    context.applyPlayerOutfitIntent(curly, 'I’m wearing a grey hoodie and jeans.');
    assert.equal(curly.outfit, 'grey hoodie and jeans');

    const haveOn = { outfit: '' };
    context.applyPlayerOutfitIntent(haveOn, 'I have my work uniform on.');
    assert.equal(haveOn.outfit, 'work uniform');
});

test('quoted clothing dialogue does not alter player state', () => {
    assert.equal(context.detectPlayerOutfitIntent('"I put on the coat," she says.'), null);
});

test('attempted, refused and negated clothing actions never become canon', () => {
    assert.equal(context.detectPlayerOutfitIntent('I try to change into the uniform.'), null);
    assert.equal(context.detectPlayerOutfitIntent('I refuse to put on the coat.'), null);
    assert.equal(context.detectPlayerOutfitIntent("I don't take off my jacket."), null);
});

test('stream chunks without indexes keep distinct provider tool-call ids', () => {
    const calls = new Map();
    context.accumulateWorldToolCall(calls, { id: 'one', function: { name: 'update_world_state', arguments: '{"location_' } });
    context.accumulateWorldToolCall(calls, { id: 'two', function: { name: 'investigate_secret', arguments: '{"label":"Bell"}' } });
    context.accumulateWorldToolCall(calls, { id: 'one', function: { arguments: 'id":"library"}' } });
    assert.equal(calls.size, 2);
    const byId = Object.fromEntries([...calls.values()].map(call => [call.id, call]));
    assert.equal(context.parseWorldToolArguments(byId.one.function.arguments).location_id, 'library');
    assert.equal(context.parseWorldToolArguments(byId.two.function.arguments).label, 'Bell');
});

test('complete argument objects and slightly truncated JSON are repaired', () => {
    const calls = new Map();
    context.accumulateWorldToolCall(calls, {
        id: 'one', function: { name: 'update_world_state', arguments: { outfit_update: 'red coat' } }
    });
    assert.equal(context.parseWorldToolArguments([...calls.values()][0].function.arguments).outfit_update, 'red coat');
    assert.equal(context.parseWorldToolArguments('{"location_id":"library"').location_id, 'library');
});

function castWorld() {
    return {
        locations: [{ id: 'hall', name: 'Hall' }, { id: 'forge', name: 'Forge' }],
        entities: [
            { id: 'rowena', name: 'Sister Rowena', type: 'npc', aliases: ['The Priestess'] },
            { id: 'ent_brannoc', name: 'Brannoc Ironvein', type: 'npc' }
        ]
    };
}

test('mentioned absent characters are pulled by title, first name, surname and alias', () => {
    const world = castWorld();
    const session = { id: 's', playerLocation: 'hall', entityStates: {
        rowena: { location: 'forge' }, ent_brannoc: { location: 'forge' }
    } };
    for (const text of ['I ask Sister Rowena for help', 'Where is Rowena?', 'Find the priestess']) {
        assert.equal(context.findReferencedWorldNpcs(world, session, text)[0]?.id, 'rowena', text);
    }
    assert.equal(context.resolveNpcId(world, 'Ironvein', session), 'ent_brannoc');
    assert.equal(context.resolveNpcId(world, 'ent_brannoc', session), 'ent_brannoc');
});

test('narrated arrival is pinned so schedules cannot immediately remove it', () => {
    const world = castWorld();
    const session = { id: 's', turnCount: 4, playerLocation: 'hall', entityStates: {
        rowena: { location: 'forge' }, ent_brannoc: { location: 'forge' }
    } };
    const hits = context.applyNarratedPresence(world, session, 'Sister Rowena steps into the hall.');
    assert.equal(hits[0]?.id, 'rowena');
    assert.equal(session.entityStates.rowena.location, 'hall');
    assert.equal(session.entityStates.rowena.pinnedUntilTurn, 10);
});

let failures = 0;
for (const { name, fn } of tests) {
    try { fn(); console.log(`✓ ${name}`); }
    catch (error) { failures++; console.error(`✗ ${name}\n  ${error.stack || error.message}`); }
}
if (failures) process.exit(1);
console.log(`\n${tests.length} contextual intent + tool reliability checks passed.`);
