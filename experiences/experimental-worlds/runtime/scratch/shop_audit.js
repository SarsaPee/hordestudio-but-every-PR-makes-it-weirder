/**
 * Shops and vendors audit.
 *
 * Markets used to be timeline-only state that only the AI could create, so an
 * author had no way to say "the baker sells bread". Shops are now authored on
 * the location, seeded into every timeline, kept in step with live play, and
 * surfaced to the DM with whoever trades there.
 *
 * Run with: node scratch/shop_audit.js
 */
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { app, functionSource, buildContext } = require('./app_source.js');

const context = { console: { warn() {}, log() {} } };
buildContext(vm, ['normalizeShopStock', 'normalizeWorldShops', 'shopStockKey',
    'readWorldShop', 'seedMarketsFromWorld', 'syncMarketsWithWorldShops', 'questTextKey'], context);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function shopWorld() {
    return {
        id: 'w', name: 'Ashford',
        locations: [
            { id: 'l_bakery', name: 'Bakery', exits: [],
              shop: [{ item: 'loaf of bread', price: 3, quantity: 8, maxQuantity: 12, regenPerTurn: 2 }] },
            { id: 'l_square', name: 'Village Square', exits: [] }
        ],
        entities: [{ id: 'e_baker', name: 'Baker', type: 'npc', vendorFor: 'l_bakery' }]
    };
}

test('an authored shop seeds a timeline market', () => {
    const markets = context.seedMarketsFromWorld(shopWorld());
    assert.deepEqual(Object.keys(markets), ['l_bakery'], 'the shop did not become a market');
    const bread = Object.values(markets.l_bakery)[0];
    assert.equal(bread.item, 'loaf of bread');
    assert.equal(bread.price, 3);
    assert.equal(bread.quantity, 8);
    assert.equal(bread.regenPerTurn, 2);
});

test('the seeded market is a copy, so play cannot rewrite the author', () => {
    const world = shopWorld();
    const markets = context.seedMarketsFromWorld(world);
    Object.values(markets.l_bakery)[0].quantity = 0;   // the player buys the lot
    assert.equal(world.locations[0].shop[0].quantity, 8, 'play mutated the authored shop');
});

test('seeding never edits the world the author is still working on', () => {
    // A row added in the editor but not yet named is a normal mid-edit state.
    const world = shopWorld();
    world.locations[1].shop = [{ item: '', price: 1, quantity: 1 }];
    context.seedMarketsFromWorld(world);
    context.syncMarketsWithWorldShops(world, { economy: { markets: {} } });
    assert.equal(world.locations[1].shop.length, 1,
        'starting a session deleted a half-written shop row from the author\'s world');
    assert.equal(world.locations[0].shop[0].quantity, 8, 'seeding rewrote authored stock');
});

test('a half-written row is skipped rather than sold', () => {
    const world = shopWorld();
    world.locations[1].shop = [{ item: '   ', price: 1 }];
    assert.equal(context.seedMarketsFromWorld(world).l_square, undefined,
        'an unnamed item became purchasable stock');
});

test('a stock key matches how transactions look items up', () => {
    const markets = context.seedMarketsFromWorld(shopWorld());
    const key = Object.keys(markets.l_bakery)[0];
    assert.equal(key, context.questTextKey('loaf of bread'),
        'the market key will not match a purchase of the same item');
});

test('base price is captured so drift oscillates around the author\'s figure', () => {
    const stock = context.normalizeShopStock({ item: 'rope', price: 20 }, 0);
    assert.equal(stock.basePrice, 20);
    // An explicit base survives.
    assert.equal(context.normalizeShopStock({ item: 'rope', price: 31, basePrice: 20 }, 0).basePrice, 20);
});

test('nonsense stock is repaired rather than trusted', () => {
    const world = { locations: [{ id: 'l', name: 'L', shop: [
        { item: '   ', price: 5 },                        // no name — dropped
        { item: 'rope', price: -9, quantity: -3 },        // negatives clamped
        { item: 'axe', price: 10, quantity: 9, maxQuantity: 2 }
    ] }], entities: [] };
    context.normalizeWorldShops(world);
    const items = world.locations[0].shop.map(s => s.item);
    assert.deepEqual(items, ['rope', 'axe'], 'a nameless item survived');
    const rope = world.locations[0].shop[0];
    assert.equal(rope.price, 0);
    assert.equal(rope.quantity, 0);
});

test('an empty shop is removed rather than left as clutter', () => {
    const world = { locations: [{ id: 'l', name: 'L', shop: [] }], entities: [] };
    context.normalizeWorldShops(world);
    assert.equal('shop' in world.locations[0], false);
});

test('a shop authored mid-campaign starts trading in an existing timeline', () => {
    const world = shopWorld();
    const sess = { economy: { currency: 'coin', markets: context.seedMarketsFromWorld(world) } };
    // The author opens a second shop after play began.
    world.locations[1].shop = [{ item: 'apple', price: 1, quantity: 5, maxQuantity: 5, regenPerTurn: 1 }];
    const added = context.syncMarketsWithWorldShops(world, sess);
    assert.equal(added, 1, 'the new shop never opened in the running timeline');
    assert(sess.economy.markets.l_square, 'the new market is missing');
});

test('syncing never overwrites what play has already changed', () => {
    const world = shopWorld();
    const sess = { economy: { currency: 'coin', markets: context.seedMarketsFromWorld(world) } };
    const key = Object.keys(sess.economy.markets.l_bakery)[0];
    sess.economy.markets.l_bakery[key].quantity = 1;   // the player bought seven loaves
    sess.economy.markets.l_bakery[key].price = 9;      // and prices rose under siege
    context.syncMarketsWithWorldShops(world, sess);
    assert.equal(sess.economy.markets.l_bakery[key].quantity, 1, 'stock was reset under the player');
    assert.equal(sess.economy.markets.l_bakery[key].price, 9, 'a drifted price was reset');
});

test('syncing is idempotent', () => {
    const world = shopWorld();
    const sess = { economy: { currency: 'coin', markets: {} } };
    assert.equal(context.syncMarketsWithWorldShops(world, sess), 1);
    assert.equal(context.syncMarketsWithWorldShops(world, sess), 0, 'the same stock was added twice');
});

test('malformed worlds and sessions do not throw', () => {
    [{}, { locations: null }, { locations: [{}] }, { locations: [{ id: 'x', shop: 'nope' }] },
     { locations: [{ id: 'x', shop: [null, 42] }] }].forEach(world => {
        assert.doesNotThrow(() => context.seedMarketsFromWorld(world), `seed threw on ${JSON.stringify(world)}`);
    });
    assert.doesNotThrow(() => context.syncMarketsWithWorldShops(shopWorld(), null));
    assert.doesNotThrow(() => context.syncMarketsWithWorldShops(shopWorld(), { economy: null }));
});

// --- wiring: the parts that make it reach play ------------------------------

test('new timelines are seeded from the world', () => {
    assert(/economy: \{ currency: gameRules\.currencyName, markets: seedMarketsFromWorld\(world\) \}/.test(app),
        'a new session starts with no markets even when shops are authored');
});

test('running timelines are kept in step', () => {
    const normalize = functionSource('normalizeLivingWorldState');
    assert(/syncMarketsWithWorldShops\(world, sess\)/.test(normalize),
        'shops authored mid-campaign never reach a running timeline');
});

test('shops survive load, and dead vendor links are cleared', () => {
    assert(/normalizeWorldShops\(world\);/.test(functionSource('normalizeAuthoredWorld')),
        'stored shops are never normalized');
    assert(/normalizeAuthoredWorld\(world\)/.test(functionSource('repairLoadedState')),
        'the repair never runs on load');
    assert(/entity\.vendorFor && !world\.locations\.some/.test(app),
        'a vendor bound to a deleted location is left dangling');
});

test('the DM is told what is for sale and who sells it', () => {
    const prompt = functionSource('getLivingWorldPrompt');
    assert(/Local market:/.test(prompt), 'stock is never described to the DM');
    assert(/vendorFor === sess\.playerLocation/.test(prompt), 'the trader is never named');
    assert(/transactions field/.test(prompt),
        'nothing reminds the DM to record the sale, so money would not move');
});

test('the editor exists for both shop and vendor', () => {
    ['shop-item', 'shop-price', 'shop-qty', 'shop-max', 'shop-regen',
     'add-shop-item-btn', 'del-shop-item', 'ent-vendor'].forEach(control => {
        assert(app.includes(control), `the ${control} control is missing from the editor`);
    });
    assert(/ent\.vendorFor = e\.target\.value/.test(app), 'choosing a vendor does not persist');
});

let failures = 0;
for (const { name, fn } of tests) {
    try { fn(); console.log(`✓ ${name}`); }
    catch (error) { failures++; console.error(`✗ ${name}\n  ${error.message}`); }
}
if (failures) {
    console.error(`\n${failures} shop check(s) failed.`);
    process.exit(1);
}
console.log(`\n${tests.length} shop checks passed.`);
