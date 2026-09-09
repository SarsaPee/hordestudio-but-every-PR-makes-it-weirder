/**
 * Reusable starting-life and macro-society audit.
 * Run with: node scratch/sandbox_world_audit.js
 */
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { buildContext } = require('./app_source.js');

const context = {
    console: { log() {}, warn() {}, error() {} },
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value),
    FACTION_WAR_AT: -70
};
buildContext(vm, [
    'createThronefallSandboxWorld',
    'normalizeWorldSandboxConfig',
    'seedWorldSocietyState',
    'normalizeWorldSocietyState',
    'applyStartingLifeToSession',
    'runSocietySimulationTick',
    'getLocalSocietySettlement',
    'getWorldSocietyPrompt',
    'stableWorldRoll',
    'livingClamp',
    'livingId',
    'getLocationRef',
    'getWorldTimeData',
    'addWorldNews'
], context);

function world() {
    const value = context.createThronefallSandboxWorld();
    context.normalizeWorldSandboxConfig(value);
    return value;
}

function session(value) {
    return {
        id: 'audit_timeline',
        turnCount: 1,
        bonusTimeMinutes: 0,
        playerLocation: value.startLocationId,
        inventory: [],
        playerStats: Object.fromEntries(value.hudConfig.stats.map(stat => [stat.id, stat.value])),
        factions: JSON.parse(JSON.stringify(value.factions.map(faction => ({
            ...faction,
            status: faction.status || 'active',
            goalProgress: faction.goalProgress || 0,
            achievements: []
        })))),
        locationStates: Object.fromEntries(value.locations.map(location => [location.id, {
            conditions: [],
            controlFactionId: location.controlFactionId || '',
            danger: location.danger || 0,
            prosperity: location.prosperity == null ? 50 : location.prosperity,
            resources: {}
        }])),
        worldNews: [],
        legalStanding: {}
    };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('flagship world is broad, connected and socially populated', () => {
    const value = world();
    assert(value.locations.length >= 28, 'world is not geographically broad');
    assert(value.entities.length >= 15, 'world lacks an off-screen cast');
    assert(value.factions.length >= 8, 'world lacks competing powers');
    assert(value.startingLives.length >= 12, 'world lacks genuinely different starts');
    const ids = new Set(value.locations.map(location => location.id));
    value.startingLives.forEach(life => assert(ids.has(life.startLocationId), `${life.name} starts nowhere`));
});

test('peasant and sovereign are materially different timeline states', () => {
    const value = world();
    const peasant = session(value);
    const sovereign = session(value);
    context.applyStartingLifeToSession(value, peasant, 'origin_peasant');
    context.applyStartingLifeToSession(value, sovereign, 'origin_queen');
    assert.equal(peasant.playerLocation, 'vs_field');
    assert.equal(sovereign.playerLocation, 'vs_council');
    assert.equal(peasant.playerIdentity.socialRank, 'peasant');
    assert.equal(sovereign.playerIdentity.socialRank, 'sovereign');
    assert(sovereign.playerStats.gold > peasant.playerStats.gold);
    assert(sovereign.playerIdentity.privileges.length > peasant.playerIdentity.privileges.length);
    assert(!peasant.inventory.includes('Great Seal of the Realm'));
    assert(sovereign.inventory.includes('Great Seal of the Realm'));
});

test('starting life never mutates the authored template', () => {
    const value = world();
    const before = JSON.stringify(value.startingLives.find(life => life.id === 'origin_outlaw'));
    const timeline = session(value);
    context.applyStartingLifeToSession(value, timeline, 'origin_outlaw');
    timeline.inventory.push('stolen crown');
    timeline.playerIdentity.obligations.push('invented duty');
    assert.equal(JSON.stringify(value.startingLives.find(life => life.id === 'origin_outlaw')), before);
});

test('a hand-made world can author and persist its own starting life', () => {
    const value = {
        id: 'custom_world', name: 'Custom World',
        locations: [{ id: 'custom_home', name: 'Custom Home' }],
        factions: [],
        startingLives: [{
            id: 'custom_life', name: 'Night-shift Clerk', role: 'clerk',
            startLocationId: 'custom_home', inventory: ['store keys'],
            obligations: ['open at midnight'], statOverrides: { cash: 12 }
        }]
    };
    context.normalizeWorldSandboxConfig(value);
    const reloaded = JSON.parse(JSON.stringify(value));
    context.normalizeWorldSandboxConfig(reloaded);
    assert.equal(reloaded.startingLives.length, 1);
    assert.equal(reloaded.startingLives[0].startLocationId, 'custom_home');
    assert.deepEqual(reloaded.startingLives[0].inventory, ['store keys']);
    assert.equal(reloaded.startingLives[0].statOverrides.cash, 12);
});

test('previewing several lives does not accumulate their wealth or allegiance', () => {
    const value = world();
    const timeline = session(value);
    context.applyStartingLifeToSession(value, timeline, 'origin_queen');
    context.applyStartingLifeToSession(value, timeline, 'origin_peasant');
    assert.equal(timeline.playerStats.gold, 1);
    assert.equal(timeline.playerIdentity.factionId, '');
    assert(!timeline.inventory.includes('Great Seal of the Realm'));
    assert.equal(timeline.factions.find(faction => faction.id === 'fac_crown').reputation,
        value.factions.find(faction => faction.id === 'fac_crown').reputation);
});

test('society simulation stays bounded across a long campaign', () => {
    const value = world();
    const timeline = session(value);
    context.applyStartingLifeToSession(value, timeline, 'origin_wanderer');
    context.normalizeWorldSocietyState(value, timeline);
    for (let turn = 1; turn <= 720; turn++) {
        timeline.turnCount = turn;
        context.runSocietySimulationTick(value, timeline, turn);
    }
    Object.values(timeline.society.settlements).forEach(settlement => {
        ['food', 'wealth', 'security', 'unrest'].forEach(key => {
            assert(settlement[key] >= 0 && settlement[key] <= 100, `${key} escaped bounds`);
        });
        assert(settlement.population >= 1 && settlement.population <= 10000000);
    });
    assert(timeline.society.developments.length <= 80);
    assert(timeline.society.conflicts.length <= 60);
    assert(timeline.society.year >= 1);
});

test('open faction hostility becomes persistent conflict without moving the player', () => {
    const value = world();
    const timeline = session(value);
    const start = timeline.playerLocation;
    context.normalizeWorldSocietyState(value, timeline);
    for (let turn = 1; turn <= 60 && !timeline.society.conflicts.length; turn++) {
        timeline.turnCount = turn;
        context.runSocietySimulationTick(value, timeline, turn);
    }
    assert(timeline.society.conflicts.length > 0, 'authored war-level hostility never became conflict');
    assert.equal(timeline.playerLocation, start, 'off-screen conflict moved the player');
});

test('prompt exposes identity and causal local state, not a generic class label', () => {
    const value = world();
    const timeline = session(value);
    context.applyStartingLifeToSession(value, timeline, 'origin_queen');
    context.normalizeWorldSocietyState(value, timeline);
    const prompt = context.getWorldSocietyPrompt(value, timeline);
    assert(prompt.includes('Sovereign of the Realm') || prompt.includes('reigning monarch'));
    assert(prompt.includes('Obligations:'));
    assert(prompt.includes('Local society:'));
    assert(prompt.includes('not destiny'));
});

let failed = 0;
for (const { name, fn } of tests) {
    try {
        fn();
        console.log(`✓ ${name}`);
    } catch (error) {
        failed++;
        console.error(`✗ ${name}\n  ${error.stack || error.message}`);
    }
}
if (failed) process.exit(1);
console.log(`\n${tests.length} sandbox-world audits passed.`);
