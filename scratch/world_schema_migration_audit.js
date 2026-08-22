/**
 * Regression checks for the schema-4 world migration.
 * Run with: node scratch/world_schema_migration_audit.js
 */
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { app, buildContext } = require('./app_source.js');

const context = {
    console: { warn() {}, log() {}, error() {} },
    crypto: { randomUUID: () => 'test-uuid' }
};
buildContext(vm, ['upgradeWorldSchemaData', 'worldSchemaVersion'], context);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function legacyWorld() {
    return {
        id: 'legacy_world', name: 'Old Roads',
        places: [
            { id: 'house', name: 'Smith House', region: 'Greenfield', mapType: 'building', exits: [{ target: 'road', transport: 'horse', minutes: 12 }] },
            { id: 'room', name: 'Kitchen', region: 'Greenfield', mapType: 'room', inside: 'Smith House', exits: [{ text: '' }] },
            { id: 'road', name: 'Old Road', region: 'Greenfield', exits: ['back to Smith House'] }
        ],
        people: [{ id: 'smith', name: 'Mara Smith', homeLocation: 'Smith House', startLocation: 'Kitchen' }],
        items: [{ id: 'key', name: 'Iron Key', startLocation: 'Kitchen' }],
        families: [{ id: 'smiths', name: 'The Smiths', homeLocation: 'Smith House' }]
    };
}

test('migration is pure and stamps the current schema', () => {
    const source = legacyWorld();
    const before = JSON.stringify(source);
    const result = context.upgradeWorldSchemaData(source, { source: 'test' });
    assert.equal(JSON.stringify(source), before, 'preview mutated its source world');
    assert.equal(context.worldSchemaVersion(result.world), 4);
    assert.equal(result.world.schemaLabel, 'Roles, knowledge provenance & consequence lifecycle');
    assert(result.world.gameRules?.capabilities, 'world-defined capabilities were not normalized');
    assert.equal(result.world.gameRules?.consequences?.enabled, true);
});

test('legacy places, people, items and families move to separate directories', () => {
    const world = context.upgradeWorldSchemaData(legacyWorld()).world;
    assert.equal(world.locations.length, 3);
    assert.equal(JSON.stringify(world.entities.map(entity => entity.type).sort()), JSON.stringify(['item', 'npc']));
    assert.equal(world.groups[0].type, 'family');
    ['places', 'people', 'items', 'families'].forEach(key => assert.equal(key in world, false));
});

test('regions and room containment become canonical ids', () => {
    const world = context.upgradeWorldSchemaData(legacyWorld()).world;
    const region = world.regions.find(entry => entry.name === 'Greenfield');
    const house = world.locations.find(entry => entry.name === 'Smith House');
    const room = world.locations.find(entry => entry.name === 'Kitchen');
    assert(region, 'Greenfield was not promoted to a first-class region');
    assert.equal(house.regionId, region.id);
    assert.equal(room.parentLocationId, house.id);
    assert.equal(room.regionId, region.id);
});

test('custom and fantasy transport survives canonical travel conversion', () => {
    const world = context.upgradeWorldSchemaData(legacyWorld()).world;
    const exit = world.locations.find(entry => entry.id === 'house').exits[0];
    assert.equal(exit.targetLocationId, 'road');
    assert.equal(exit.mode, 'horse');
    assert.equal(exit.travelTime, 12);
});

test('blank and unresolved exits remain reviewable instead of blocking migration', () => {
    const source = legacyWorld();
    source.places[1].exits.push({ target: 'Dragon Gate', mode: 'dragon' });
    const result = context.upgradeWorldSchemaData(source);
    const exits = result.world.locations.find(entry => entry.id === 'room').exits;
    assert(exits.every(exit => String(exit.text || '').trim()), 'migration left a blank exit label');
    assert(exits.some(exit => exit.mode === 'dragon'), 'custom transport was discarded');
    assert(result.warnings.some(item => /Dragon Gate/.test(item.detail)), 'unresolved route was not reported');
});

test('linked homes and placements use canonical location ids', () => {
    const world = context.upgradeWorldSchemaData(legacyWorld()).world;
    const person = world.entities.find(entity => entity.type === 'npc');
    const item = world.entities.find(entity => entity.type === 'item');
    assert.equal(person.homeLocation, 'house');
    assert.equal(person.startLocation, 'room');
    assert.equal(item.startLocation, 'room');
    assert.equal(world.groups[0].homeLocationId, 'house');
});

test('running the upgrader twice is structurally idempotent', () => {
    const once = context.upgradeWorldSchemaData(legacyWorld()).world;
    const twice = context.upgradeWorldSchemaData(once).world;
    const stable = value => JSON.stringify(value, (key, item) => key === 'migrationHistory' ? undefined : item);
    assert.equal(stable(twice), stable(once));
    assert.equal(twice.migrationHistory.length, once.migrationHistory.length);
});

test('product wiring upgrades definitions, installed built-ins and exposes rollback UI', () => {
    assert(/STARTER_WORLDS\[index\]\s*=\s*upgradeBundledWorldDefinition/.test(app));
    assert(/HORDE_INCLUDED_WORLDS[\s\S]{0,160}?\.map\(upgradeBundledWorldDefinition\)/.test(app));
    assert(/source:\s*'bundled-install'/.test(app));
    assert(/Download original/.test(app) && /Upgrade &amp; save/.test(app));
    assert(/World migration rolled back/.test(app));
});

let passed = 0;
for (const { name, fn } of tests) {
    try {
        fn();
        passed++;
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        throw error;
    }
}
console.log(`\n${passed} world schema migration checks passed.`);
