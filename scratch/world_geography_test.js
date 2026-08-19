// Geography, transit nodes and movement intent.
//
// Extracts the real slices from app.js rather than restating them as stubs.
// Runs against the real bundled Policy Panic world (ships with the repo)
// rather than a synthetic fixture: the topology, transit flags and exit
// shapes are what's under test, and a clean checkout of this repo can
// actually load this world without needing any private content.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

const slice = (startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);
    assert(start >= 0 && end > start, `slice not found: ${startMarker}`);
    return source.slice(start, end);
};

const geography = slice('function getExitTargetName', 'function checkExitTarget');
const intent = slice('function extractUserMovementTarget', 'function buildWorldMicroFrameEnvelope');
const traversal = slice('function getExitTravelTime', 'function isNpcPinned');

const context = {
    console: { log() {}, warn() {}, error: console.error },
    Math, Date, Map, Set, Object, Array, String, Number, RegExp, JSON,
    parseInt, parseFloat, isFinite,
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value),
    showToast() {},
    worldForSession: (world) => world,
    normalizePlayerRulesState: () => ({ status: 'active', conditions: [] }),
    rollForScenePopulation() {},
    getWorldPresentCharacterIds: () => [],
    trustedWorldMicroMove: () => null,
    applyPlayerOutfitIntent: () => null
};
vm.createContext(context);
vm.runInContext(geography, context, { filename: 'geography.js' });
vm.runInContext(intent, context, { filename: 'movement-intent.js' });
vm.runInContext(traversal, context, { filename: 'traversal.js' });

// Real bundled world (ships with the repo), not synthetic and not private
// content: Policy Panic at Bramble & Pike. Its town/street nodes are natural
// routing hubs — 8 home locations converge on 'Maplebridge', 5 venues
// converge on 'Rainier Main Street' — so they're marked transit for this
// test the way a world author would opt in. One exit gets an explicit
// travelTime — no synthetic data is injected; every leg used below is what
// the world's author actually wrote.
globalThis.HORDE_INCLUDED_WORLDS = [];
require(path.join(root, 'policy-panic-world.js'));
const bundled = globalThis.HORDE_INCLUDED_WORLDS[0];
assert(bundled && bundled.locations.length > 0, 'Policy Panic world did not load');

const world = { locations: JSON.parse(JSON.stringify(bundled.locations)) };
const setTransit = id => { const l = world.locations.find(x => x.id === id); l.transit = true; };
setTransit('loc_maplebridge');
setTransit('loc_main_street');

const byId = id => world.locations.find(l => l.id === id);
const ids = list => list.map(l => (typeof l === 'string' ? l : l.id));

// --- Transit flags -----------------------------------------------------
{
    const flagged = world.locations.filter(l => l.transit === true).map(l => l.id).sort();
    assert.deepEqual(flagged, ['loc_main_street', 'loc_maplebridge'],
        'exactly the two routing waypoints carry the transit flag');

    // loc_office shares its region with 8 rooms (bullpen, reception, claims,
    // HR, break, supply, records, Denton's office). If containment alone
    // were ever mistaken for transit, this is what would trip first.
    assert(!context.isTransitLocation(byId('loc_office')),
        'a real building is not a waypoint just because rooms share its region');
    assert(!context.isTransitLocation(byId('loc_diner')));
    assert(context.isTransitLocation(byId('loc_maplebridge')));
    console.log('PASS transit flags: 2 waypoints, a real contained building correctly excluded');
}

// --- Hints name real places, never other waypoints -----------------------
{
    const hints = context.transitDestinationHints(world, byId('loc_main_street'));
    assert.deepEqual(JSON.parse(JSON.stringify(hints)), [
        '"Bramble & Pike Parking Lot" [loc_parking]',
        `"Millie's Diner" [loc_diner]`,
        '"Maplebridge Town Hall" [loc_townhall]',
        '"The Bent Stapler" [loc_bar]'
    ], 'hints list the real venues behind the waypoint');
    // Main Street also exits back to Maplebridge, which is itself transit.
    assert(!hints.some(h => h.includes('loc_maplebridge')), 'hints must not chain to another waypoint');
    assert.equal(context.transitDestinationHints(world, null).length, 0);
    console.log('PASS transit hints: real venues only, no waypoint chaining');
}

// --- Waypoints stay traversable -------------------------------------------
{
    const path1 = context.findWorldTravelPath(world, 'loc_gloria_home', 'loc_diner');
    assert.deepEqual(JSON.parse(JSON.stringify(path1)),
        ['loc_gloria_home', 'loc_maplebridge', 'loc_main_street', 'loc_diner'],
        'the route still runs THROUGH both waypoints');

    const minutes = context.getWorldPathTravelTime(world, path1);
    assert.equal(minutes, 23, 'the three authored legs (10 + 8 + 5) sum correctly across both waypoints');

    // Cross-hub in the other direction, and confirm a same-building hop
    // still costs whatever the author declared for it (1 minute per room).
    assert(context.findWorldTravelPath(world, 'loc_bar', 'loc_denton_home'),
        'downtown -> residential must route back through both waypoints');
    assert.equal(context.getWorldPathTravelTime(world,
        context.findWorldTravelPath(world, 'loc_bullpen', 'loc_break')), 1,
        'a same-building hop still costs its own declared time, unrelated to transit');
    console.log('PASS traversal: waypoints route through, authored costs sum correctly');
}

// --- Movement intent, including hailing a ride ------------------------------
{
    const cases = [
        ['we get an uber to Rainier Main Street', 'Rainier Main Street'],
        ["I take an uber to Millie's Diner", 'Millie'],
        ["let's grab a cab to the Bent Stapler", 'the Bent Stapler'],
        ['we catch the tram to Maplebridge', 'Maplebridge'],
        ['I head to Rainier Main Street', 'Rainier Main Street'],
        ["we walk to Millie's Diner", 'Millie'],
        ['I follow her inside, sitting down on the couch', ''],
        ['"Get an uber to Maplebridge," I tell Denton', '']
    ];
    for (const [input, expected] of cases) {
        assert.equal(context.extractUserMovementTarget(input), expected,
            `movement intent for ${JSON.stringify(input)}`);
    }
    console.log(`PASS movement intent: ${cases.length} cases incl. rideshare and dialogue exclusion`);
}

// --- Naming an area resolves to the waypoint, which is never an arrival ----
{
    const target = context.resolveWorldMovementTarget(world, 'loc_gloria_home', 'Rainier Main Street');
    assert.equal(target && target.id, 'loc_main_street');
    assert(context.isTransitLocation(target),
        'naming an area lands on a waypoint, so callers must redirect rather than park the player');

    const real = context.resolveWorldMovementTarget(world, 'loc_gloria_home', "Millie's Diner");
    assert.equal(real && real.id, 'loc_diner');
    assert(!context.isTransitLocation(real));
    console.log('PASS area resolution: area -> waypoint, place -> place');
}

console.log('PASS world geography suite');
