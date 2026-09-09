/** Bellwether 2005 scale, referential integrity and weekly-routine audit. */
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { buildContext } = require('./app_source.js');

const context = {
    console: { log() {}, warn() {}, error() {} },
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value),
    FACTION_WAR_AT: -70
};
buildContext(vm, [
    'createBellwether2005World', 'normalizeWorldSandboxConfig',
    'seedWorldSocietyState', 'normalizeWorldSocietyState', 'runSocietySimulationTick',
    'applyStartingLifeToSession', 'getWorldSocietyPrompt', 'getLocalSocietySettlement',
    'getWorldWeekday', 'isScheduleBlockForWorldDay', 'getWorldTimeData',
    'getLocationRef', 'stableWorldRoll', 'livingClamp', 'livingId', 'addWorldNews'
], context);

function buildWorld() {
    const world = context.createBellwether2005World();
    context.normalizeWorldSandboxConfig(world);
    return world;
}
function session(world) {
    return {
        id: 'bellwether_audit', turnCount: 1, bonusTimeMinutes: 0,
        playerLocation: world.startLocationId, inventory: [],
        playerStats: Object.fromEntries(world.hudConfig.stats.map(stat => [stat.id, stat.value])),
        factions: JSON.parse(JSON.stringify(world.factions.map(faction => ({
            ...faction, status: faction.status || 'active', goalProgress: 0, achievements: []
        })))),
        locationStates: Object.fromEntries(world.locations.map(location => [location.id, {
            conditions: [], controlFactionId: location.controlFactionId || '',
            danger: location.danger || 0, prosperity: location.prosperity == null ? 50 : location.prosperity,
            resources: {}
        }])),
        worldNews: [], legalStanding: {}
    };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('the world is genuinely town-scale', () => {
    const world = buildWorld();
    assert(world.locations.length >= 240, `only ${world.locations.length} locations`);
    assert(world.entities.length >= 290, `only ${world.entities.length} residents`);
    assert(world.locations.filter(location => location.id.startsWith('bw_home_')).length >= 120);
    assert(world.factions.length >= 12);
    assert(world.startingLives.length >= 15);
    assert(world.scheduledEvents.length >= 12);
    assert(world.lorebook.length >= 16);
});

test('every ID and resident name is unique', () => {
    const world = buildWorld();
    assert.equal(new Set(world.locations.map(location => location.id)).size, world.locations.length);
    assert.equal(new Set(world.entities.map(entity => entity.id)).size, world.entities.length);
    const names = world.entities.map(entity => entity.name.toLowerCase());
    assert.equal(new Set(names).size, names.length, 'duplicate exact NPC names make references ambiguous');
});

test('every exit resolves and the whole town is reachable', () => {
    const world = buildWorld();
    const byName = new Map(world.locations.map(location => [location.name.toLowerCase(), location.id]));
    const adjacency = new Map(world.locations.map(location => [location.id, []]));
    world.locations.forEach(location => (location.exits || []).forEach(exit => {
        const text = String(typeof exit === 'string' ? exit : exit.text || '');
        const targetName = text.replace(/^.*?\bto\s+/i, '').trim().toLowerCase();
        const target = byName.get(targetName);
        assert(target, `broken exit from ${location.name}: ${text}`);
        adjacency.get(location.id).push(target);
    }));
    const seen = new Set([world.startLocationId]);
    const queue = [world.startLocationId];
    while (queue.length) {
        for (const next of adjacency.get(queue.shift()) || []) {
            if (!seen.has(next)) { seen.add(next); queue.push(next); }
        }
    }
    assert.equal(seen.size, world.locations.length, `${world.locations.length - seen.size} unreachable locations`);
});

test('all homes, workplaces, schools and schedules resolve', () => {
    const world = buildWorld();
    const ids = new Set(world.locations.map(location => location.id));
    world.entities.forEach(entity => {
        assert(ids.has(entity.startLocation), `${entity.name} starts at missing ${entity.startLocation}`);
        if (entity.homeLocation) assert(ids.has(entity.homeLocation), `${entity.name} has missing home`);
        assert(entity.schedule?.length, `${entity.name} has no routine`);
        entity.schedule.forEach(block => {
            assert(ids.has(block.locationId), `${entity.name} schedule points to ${block.locationId}`);
            assert(/^([01]\d|2[0-3]):[0-5]\d$/.test(block.time), `${entity.name} has invalid time`);
        });
    });
    world.startingLives.forEach(life => assert(ids.has(life.startLocationId), `${life.name} starts nowhere`));
});

test('each authored house has its own household relationship', () => {
    const world = buildWorld();
    const homes = world.locations.filter(location => location.id.startsWith('bw_home_'));
    homes.forEach(home => {
        const residents = world.entities.filter(entity => entity.homeLocation === home.id);
        assert.equal(residents.length, 2, `${home.name} does not have its authored two-person household`);
        assert(world.relationships.some(rel => residents.some(r => r.id === rel.sourceNpcId)
            && residents.some(r => r.id === rel.targetNpcId)), `${home.name} household has no persistent bond`);
    });
});

test('weekday and weekend blocks do not bleed into each other', () => {
    const world = buildWorld();
    const resident = world.entities.find(entity => entity.id === 'bw_resident_1_a');
    const work = resident.schedule.find(block => block.activity.includes('working as'));
    const weekend = resident.schedule.find(block => block.activity.includes('weekend errands'));
    assert.equal(context.getWorldWeekday(world, 1), 'Monday');
    assert.equal(context.getWorldWeekday(world, 6), 'Saturday');
    assert.equal(context.isScheduleBlockForWorldDay(world, work, 1), true);
    assert.equal(context.isScheduleBlockForWorldDay(world, work, 6), false);
    assert.equal(context.isScheduleBlockForWorldDay(world, weekend, 1), false);
    assert.equal(context.isScheduleBlockForWorldDay(world, weekend, 6), true);
});

test('radically different lives seed radically different realities', () => {
    const world = buildWorld();
    const newKid = session(world), mayor = session(world), parent = session(world);
    context.applyStartingLifeToSession(world, newKid, 'bw_origin_newkid');
    context.applyStartingLifeToSession(world, mayor, 'bw_origin_mayor');
    context.applyStartingLifeToSession(world, parent, 'bw_origin_parent');
    assert.equal(newKid.playerIdentity.socialRank, 'student');
    assert.equal(mayor.playerIdentity.title, 'Mayor of Bellwether');
    assert(mayor.playerStats.cash > newKid.playerStats.cash);
    assert(parent.playerIdentity.holdings.includes('Family home with mortgage'));
    assert.notEqual(newKid.playerLocation, mayor.playerLocation);
});

test('large-town society remains bounded over a multi-year simulation', () => {
    const world = buildWorld();
    const timeline = session(world);
    context.applyStartingLifeToSession(world, timeline, 'bw_origin_reporter');
    context.normalizeWorldSocietyState(world, timeline);
    for (let turn = 1; turn <= 2200; turn++) {
        timeline.turnCount = turn;
        context.runSocietySimulationTick(world, timeline, turn);
    }
    Object.values(timeline.society.settlements).forEach(place => {
        ['food','wealth','security','unrest'].forEach(key => assert(place[key] >= 0 && place[key] <= 100));
        assert(place.population >= 1 && place.population <= 10000000);
    });
    assert(timeline.society.developments.length <= 80);
    assert(timeline.society.conflicts.length <= 60);
});

let failures = 0;
for (const { name, fn } of tests) {
    try { fn(); console.log(`✓ ${name}`); }
    catch (error) { failures++; console.error(`✗ ${name}\n  ${error.stack || error.message}`); }
}
if (failures) process.exit(1);
console.log(`\n${tests.length} Bellwether life-sim audits passed.`);
