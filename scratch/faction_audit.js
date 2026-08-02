/**
 * Authored factions audit.
 *
 * Factions used to exist only inside a timeline and only the AI could create
 * one, so an author could write a war into the lore and the engine would know
 * nothing of the sides fighting it. Factions are now authored on the world,
 * seeded into every timeline, kept in step with running ones, hold territory,
 * stand in declared relation to each other, and have NPCs who belong to them.
 *
 * Run with: node scratch/faction_audit.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { app, functionSource, buildContext } = require('./app_source.js');

const context = { console: { warn() {}, log() {} } };
buildContext(vm, ['normalizeWorldFaction', 'normalizeWorldFactions', 'readWorldFactions',
    'livingFactionFromWorld', 'seedFactionsFromWorld', 'syncFactionsWithWorld',
    'factionRelationLabel'], context);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function factionWorld() {
    return {
        id: 'w', name: 'Aldenmere',
        locations: [
            { id: 'l_keep', name: 'Ravensmoor Keep', region: 'North', exits: [] },
            { id: 'l_ford', name: 'Grey Ford', region: 'North', exits: [] },
            { id: 'l_port', name: 'Saltmere Port', region: 'Coast', exits: [] }
        ],
        entities: [
            { id: 'e_captain', name: 'Captain Aurel', type: 'npc', factionId: 'f_crown' },
            { id: 'e_smuggler', name: 'Vess', type: 'npc', factionId: 'f_hand' }
        ],
        factions: [
            { id: 'f_crown', name: 'The Crown', influence: 80, reputation: 20, goal: 'Hold the ford',
              territory: ['l_keep', 'l_ford'], relations: [{ factionId: 'f_hand', score: -60 }] },
            { id: 'f_hand', name: 'The Ashen Hand', influence: 35, reputation: -40,
              territory: ['l_port'], relations: [{ factionId: 'f_crown', score: -60 }] }
        ]
    };
}

test('authored factions seed a timeline', () => {
    const factions = context.seedFactionsFromWorld(factionWorld());
    assert.deepEqual(factions.map(f => f.id), ['f_crown', 'f_hand'], 'the factions did not reach play');
    const crown = factions[0];
    assert.equal(crown.influence, 80);
    assert.equal(crown.reputation, 20);
    assert.deepEqual(crown.territory, ['l_keep', 'l_ford']);
    assert.equal(crown.relations[0].score, -60);
});

test('a faction enters play with no history behind it', () => {
    // Authored progress would mean the war was half-won before turn one.
    const crown = context.seedFactionsFromWorld(factionWorld())[0];
    assert.equal(crown.goalProgress, 0, 'an authored aim started part-done');
    assert.deepEqual(crown.achievements, [], 'a faction entered play with a past it never lived');
    assert.equal(crown.status, 'active');
});

test('seeding never edits the world the author is still working on', () => {
    const world = factionWorld();
    // Mid-edit states: an unnamed faction and territory not yet pointing anywhere.
    world.factions.push({ id: 'f_new', name: '', territory: ['l_nowhere'] });
    const before = JSON.stringify(world);
    context.seedFactionsFromWorld(world);
    context.syncFactionsWithWorld(world, { factions: [] });
    assert.equal(JSON.stringify(world), before, 'starting a session rewrote the author\'s world');
});

test('an unnamed faction is not pushed into play half-written', () => {
    const world = factionWorld();
    world.factions.push({ id: 'f_new', name: '   ' });
    assert.equal(context.seedFactionsFromWorld(world).length, 2, 'a nameless faction entered play');
});

test('territory that points nowhere is not carried into play', () => {
    const world = factionWorld();
    world.factions[0].territory.push('l_deleted');
    const crown = context.seedFactionsFromWorld(world)[0];
    assert.deepEqual(crown.territory, ['l_keep', 'l_ford'], 'a deleted location was still held');
});

test('territory may be authored by name as well as id', () => {
    const world = factionWorld();
    world.factions[1].territory = ['Saltmere Port'];
    assert.deepEqual(context.seedFactionsFromWorld(world)[1].territory, ['l_port'],
        'a location written by name was dropped instead of resolved');
});

test('a relation naming nobody, or itself, is dropped', () => {
    const world = factionWorld();
    world.factions[0].relations.push({ factionId: 'f_gone', score: 50 });
    world.factions[0].relations.push({ factionId: 'f_crown', score: 90 });
    const crown = context.seedFactionsFromWorld(world)[0];
    assert.deepEqual(crown.relations.map(r => r.factionId), ['f_hand'],
        'a dangling or self-directed relation survived');
});

test('out-of-range figures are clamped, not trusted', () => {
    const faction = context.normalizeWorldFaction(
        { name: 'X', influence: 500, reputation: -999, resources: -5, status: 'ascendant' }, 0);
    assert.equal(faction.influence, 100);
    assert.equal(faction.reputation, -100);
    assert.equal(faction.resources, 0);
    assert.equal(faction.status, 'active', 'an invented status was accepted');
});

test('duplicate ids are made unique so relations cannot be ambiguous', () => {
    const world = { locations: [], entities: [],
        factions: [{ id: 'f_a', name: 'A' }, { id: 'f_a', name: 'B' }] };
    context.normalizeWorldFactions(world);
    assert.equal(new Set(world.factions.map(f => f.id)).size, 2, 'two factions share one id');
});

test('deleting a faction clears every reference to it', () => {
    const world = factionWorld();
    world.factions = world.factions.filter(f => f.id !== 'f_hand');
    context.normalizeWorldFactions(world);
    assert.deepEqual(world.factions[0].relations, [], 'a relation to a deleted faction survived');
    assert.equal('factionId' in world.entities[1], false, 'an NPC still belongs to a deleted faction');
    assert.equal(world.entities[0].factionId, 'f_crown', 'a valid membership was wrongly cleared');
});

test('a faction authored mid-campaign joins a running timeline', () => {
    const world = factionWorld();
    const sess = { factions: context.seedFactionsFromWorld(world) };
    world.factions.push({ id: 'f_guild', name: 'The Ferrymen', influence: 20 });
    assert.equal(context.syncFactionsWithWorld(world, sess), 1, 'the new faction never appeared');
    assert.equal(sess.factions.length, 3);
});

test('syncing never overwrites a faction already living its story', () => {
    const world = factionWorld();
    const sess = { factions: context.seedFactionsFromWorld(world) };
    Object.assign(sess.factions[0], { influence: 12, status: 'weakened', goalProgress: 70 });
    context.syncFactionsWithWorld(world, sess);
    assert.equal(sess.factions[0].influence, 12, 'play was reset to the authored figure');
    assert.equal(sess.factions[0].status, 'weakened', 'a defeated power was restored by an editor sync');
    assert.equal(sess.factions[0].goalProgress, 70);
});

test('syncing is idempotent', () => {
    const world = factionWorld();
    const sess = { factions: [] };
    assert.equal(context.syncFactionsWithWorld(world, sess), 2);
    assert.equal(context.syncFactionsWithWorld(world, sess), 0, 'the same faction joined twice');
});

test('malformed worlds and sessions do not throw', () => {
    [{}, { factions: null }, { factions: 'nope' }, { factions: [null, 42] },
     { locations: null, factions: [{ name: 'A', territory: null, relations: 7 }] }].forEach(world => {
        assert.doesNotThrow(() => context.seedFactionsFromWorld(world),
            `seed threw on ${JSON.stringify(world)}`);
        assert.doesNotThrow(() => context.normalizeWorldFactions(world),
            `normalize threw on ${JSON.stringify(world)}`);
    });
    assert.doesNotThrow(() => context.syncFactionsWithWorld(factionWorld(), null));
});

test('the editor and the engine agree on what a score means', () => {
    // The label must flip exactly where the simulation starts treating a
    // faction as an ally or an enemy, or the author is misled by the UI.
    assert.equal(context.factionRelationLabel(context.FACTION_ALLY_AT ?? 30), 'Allied');
    assert.equal(context.factionRelationLabel(29), 'Friendly');
    assert.equal(context.factionRelationLabel(-30), 'Hostile');
    assert.equal(context.factionRelationLabel(-29), 'Wary');
    assert.equal(context.factionRelationLabel(0), 'Neutral');
});

// --- wiring: the parts that make it reach play ------------------------------

test('new timelines are seeded from the world', () => {
    assert(/factions: seedFactionsFromWorld\(world\)/.test(app),
        'a new session starts with no factions even when they are authored');
});

test('running timelines are kept in step', () => {
    assert(/syncFactionsWithWorld\(world, sess\)/.test(functionSource('normalizeLivingWorldState')),
        'factions authored mid-campaign never reach a running timeline');
});

test('stored factions are repaired on load', () => {
    assert(/normalizeWorldFactions\(world\);/.test(functionSource('normalizeAuthoredWorld')),
        'a corrupt or stale faction is never repaired');
    assert(/normalizeAuthoredWorld\(world\)/.test(functionSource('repairLoadedState')),
        'the repair never runs on load');
});

test('the DM is told who in the room belongs to whom', () => {
    const prompt = functionSource('getLivingWorldPrompt');
    assert(/Affiliations present:/.test(prompt),
        'a faction can never reach a scene through the people in it');
    assert(/entity\.factionId/.test(prompt), 'membership is not read from the world');
});

test('the whole editor is present and reachable', () => {
    ['faction-name', 'faction-status', 'faction-desc', 'faction-influence', 'faction-reputation',
     'faction-resources', 'faction-goal', 'faction-goal-pool', 'faction-territory',
     'faction-region-all', 'faction-territory-filter', 'faction-relation', 'del-faction',
     'ent-faction'].forEach(control => {
        assert(app.includes(control), `the ${control} control is missing from the editor`);
    });
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert(/data-tab="w-factions"/.test(html), 'there is no Factions tab to click');
    assert(/id="w-factions-list"/.test(html), 'the tab has nowhere to render factions');
    assert(/id="add-faction-btn"/.test(html) && /id="add-faction-btn-bottom"/.test(html),
        'a faction cannot be created');
    assert(/renderWorldFactions\(\);/.test(functionSource('renderWorldStudio')),
        'the panel is never drawn when the studio refreshes');
    assert(/add-faction-btn'\)\.onclick/.test(app), 'the create button is never wired');
});

test('choosing a membership persists it, and clearing it removes the field', () => {
    assert(/ent\.factionId = e\.target\.value/.test(app), 'membership does not persist');
    assert(/delete ent\.factionId/.test(app), 'clearing membership leaves a stale id behind');
});

let failures = 0;
for (const { name, fn } of tests) {
    try { fn(); console.log(`✓ ${name}`); }
    catch (error) { failures++; console.error(`✗ ${name}\n  ${error.message}`); }
}
if (failures) {
    console.error(`\n${failures} faction check(s) failed.`);
    process.exit(1);
}
console.log(`\n${tests.length} faction checks passed.`);
