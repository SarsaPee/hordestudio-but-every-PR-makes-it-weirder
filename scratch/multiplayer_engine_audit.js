/* Release audit for the deterministic multiplayer RPG kernel. */
'use strict';

global.window = global;
require('../rpg-mechanics.js');
require('../multiplayer-engine.js');
const Engine = global.HordeMultiplayerEngine;
const assert = require('node:assert/strict');

const rules = Engine.pack('d20');
let state = Engine.createState(rules, { location: 'Old Keep' });
const hero = Engine.createSheet(rules, { name: 'Mara', archetype: 'Warden' }, 'Mara');
state.characters.p1 = hero;

let result = Engine.applyReceiptRecovering(state, {
  baseRevision: state.revision,
  advanceRound: false,
  operations: [
    { type: 'resource', playerId: 'p1', resource: 'hp', delta: -4 },
    { type: 'effect-add', playerId: 'p1', effect: { name: 'Blessed', kind: 'buff', duration: 2, modifiers: { checks: 2 } } },
    { type: 'inventory-add', playerId: 'p1', item: { id: 'blade', name: 'Knight blade', slot: 'main-hand', modifiers: { checks: 1 } } },
    { type: 'equip', playerId: 'p1', itemId: 'blade', slot: 'main-hand' },
    { type: 'xp', playerId: 'p1', delta: 400 },
    { type: 'npc-add', npcId: 'wolf', name: 'Dire wolf', sheet: { resources: { hp: { id: 'hp', name: 'HP', value: 9, min: 0, max: 9 } } } },
    { type: 'encounter-start', name: 'Courtyard ambush', initiative: ['p1', 'wolf'] },
  ], checks: [], summary: 'GM setup'
}, 'host');

state = result.state;
assert.equal(state.characters.p1.resources.hp.value, 8);
assert.equal(state.characters.p1.level, 2);
assert.equal(state.characters.p1.effects[0].duration, 2, 'manual corrections must not consume a buff round');
assert.equal(state.characters.p1.equipment['main-hand'], 'blade');
assert.equal(state.npcs.wolf.name, 'Dire wolf');
assert.deepEqual(state.encounters[0].initiative, ['p1', 'wolf']);

// Use a non-d20 die here so the engine's intentional natural-1 fumble rule
// cannot make this bonus-wiring audit randomly fail one run in twenty.
const checkResult = Engine.check(state, 'p1', { attribute: 'Strength', skill: 'Athletics', difficulty: 1, dice: 'd2' });
assert.equal(checkResult.effectBonus, 2);
assert.equal(checkResult.equipmentBonus, 1);
assert.equal(checkResult.success, true);

result = Engine.applyReceiptRecovering(state, {
  baseRevision: state.revision,
  operations: [
    { type: 'initiative-next' },
    { type: 'resource', playerId: 'p1', resource: 'missing', delta: -1 },
    { type: 'clock', name: 'Alarm', max: 4, delta: 1 },
  ], checks: [], summary: 'Resolved turn'
}, 'host');
state = result.state;
assert.equal(result.rejected.length, 1, 'one bad operation should not discard the valid transaction');
assert.equal(state.characters.p1.effects[0].duration, 1);
assert.equal(state.encounters[0].turn, 1);
assert.equal(state.clocks[0].value, 1);

const poolRules = Engine.pack('dice-pool');
const poolState = Engine.createState(poolRules, {});
poolState.characters.scout = Engine.createSheet(poolRules, { name: 'Scout' }, 'Scout');
poolState.characters.scout.attributes.Finesse = 2;
poolState.characters.scout.skills.Notice = 3;
const poolRoll = Engine.check(poolState, 'scout', { attribute: 'Finesse', skill: 'Notice', difficulty: 5 });
assert.equal(poolRoll.poolSize, 5, 'dice-pool stats must build the number of dice, not become a flat total bonus');
assert.equal(poolRoll.dice.length, 5);

result = Engine.applyReceiptRecovering(state, {
  baseRevision: state.revision,
  operations: [
    { type: 'effect-add', playerId: 'p1', effect: { name: 'Staggered', kind: 'debuff', duration: 1, modifiers: { checks: -1 } } },
    { type: 'currency', playerId: 'p1', key: 'gold', delta: 25 },
    { type: 'shared-inventory-add', item: { id: 'rope', name: 'Rope', quantity: 2 } },
    { type: 'quest', questId: 'gate', title: 'Open the gate', status: 'active' },
  ], checks: [], summary: 'Consequences begin'
}, 'host');
state = result.state;
assert.equal(state.characters.p1.effects.find(entry => entry.name === 'Staggered').duration, 1, 'new one-round effects must survive the turn that creates them');
assert.equal(state.characters.p1.currencies.gold, 25);
assert.equal(state.sharedInventory[0].quantity, 2);
assert.equal(state.quests[0].status, 'active');

result = Engine.applyReceiptRecovering(state, {
  baseRevision: state.revision,
  operations: [
    { type: 'resource', playerId: 'p1', resource: 'hp', set: 0 },
    { type: 'quest', questId: 'gate', status: 'complete' },
  ], checks: [], summary: 'Hero falls'
}, 'host');
state = result.state;
assert.equal(state.characters.p1.status, 'Unconscious');
assert.ok(state.characters.p1.conditions.some(entry => entry.name === 'Unconscious'));
assert.equal(state.characters.p1.effects.some(entry => entry.name === 'Staggered'), false, 'one-round effects expire on the following resolved turn');
assert.equal(state.quests.length, 1, 'quest updates must not duplicate the quest');
assert.equal(state.quests[0].status, 'complete');

result = Engine.applyReceiptRecovering(state, {
  baseRevision: state.revision,
  advanceRound: false,
  operations: [{ type: 'npc-add', npcId: 'late_arrival', name: 'Late arrival' }],
  checks: [{ playerId: 'late_arrival', difficulty: 10, attribute: 'Strength' }],
  summary: 'No retroactive checks'
}, 'host');
assert.equal(result.state.npcs.late_arrival.name, 'Late arrival');
assert.equal(result.rejected.length, 1, 'an entity created by a receipt cannot retroactively make a check in that receipt');

const stressState = Engine.createState(poolRules, {});
stressState.characters.scout = Engine.createSheet(poolRules, { name: 'Scout' }, 'Scout');
let stressResult = Engine.applyReceipt(stressState, { baseRevision: stressState.revision, advanceRound: false, checks: [], operations: [
  { type: 'resource', playerId: 'scout', resource: 'stress', set: 6 },
  { type: 'resource', playerId: 'scout', resource: 'health', set: 0 },
  { type: 'effect-add', playerId: 'scout', effect: { name: 'Inspired', kind: 'buff', stacks: 1, duration: 3, modifiers: { checks: 1 } } },
  { type: 'effect-add', playerId: 'scout', effect: { name: 'Inspired', kind: 'buff', stacks: 1, duration: 2, modifiers: { checks: 1 } } },
] }, 'host');
assert.ok(stressResult.state.characters.scout.conditions.some(entry => entry.name === 'Overwhelmed'));
assert.ok(stressResult.state.characters.scout.conditions.some(entry => entry.name === 'Incapacitated'));
assert.equal(stressResult.state.characters.scout.effects.find(entry => entry.name === 'Inspired').stacks, 2);
assert.equal(Engine.check(stressResult.state, 'scout', { attribute: 'Body', skill: 'Athletics', difficulty: 99 }).effectBonus, 2,
  'stacked effects must multiply their check modifier');
stressResult = Engine.applyReceipt(stressResult.state, { baseRevision: stressResult.state.revision, advanceRound: false, checks: [], operations: [
  { type: 'resource', playerId: 'scout', resource: 'health', set: 6 }
] }, 'host');
assert.ok(stressResult.state.characters.scout.conditions.some(entry => entry.name === 'Overwhelmed'), 'recovering one resource must not clear a different critical resource status');
assert.equal(stressResult.state.characters.scout.conditions.some(entry => entry.name === 'Incapacitated'), false);

const optionalRules = Engine.pack('d20', { mechanicsMode: 'off' });
let optionalState = Engine.createState(optionalRules, {});
optionalState.characters.player = Engine.createSheet(optionalRules, { name: 'No-rules hero' }, 'No-rules hero');
let optionalResult = Engine.applyReceiptRecovering(optionalState, { baseRevision: optionalState.revision, operations: [
  { type: 'inventory-add', playerId: 'player', item: 'Old key' },
  { type: 'resource', playerId: 'player', resource: 'hp', delta: -5 },
] }, 'host');
assert.equal(optionalResult.state.characters.player.inventory[0].name, 'Old key', 'legacy string inventory must migrate while mechanics are off');
assert.equal(optionalResult.state.characters.player.resources.hp.value, 12, 'mechanics off must pause resource mutations');
assert.equal(optionalResult.rejected.length, 0, 'paused mechanical mutations are harmless no-ops, not broken turns');
assert.throws(() => Engine.check(optionalResult.state, 'player', { difficulty: 10 }), /disabled/);

optionalResult.state.rules.mechanicsMode = 'full';
optionalResult = Engine.applyReceiptRecovering(optionalResult.state, { baseRevision: optionalResult.state.revision, advanceRound: false, operations: [
  { type: 'inventory-add', playerId: 'player', item: { id: 'coat', name: 'Armored coat', type: 'clothing', slot: 'body', armor: 2, modifiers: { checks: 1 } } },
  { type: 'equip', playerId: 'player', itemId: 'coat', slot: 'body' },
] }, 'host');
assert.equal(optionalResult.state.characters.player.equipment.body, 'coat');
assert.equal(Engine.check(optionalResult.state, 'player', { difficulty: -99 }).equipmentBonus, 1, 're-enabled gear bonuses must use preserved items');

console.log('multiplayer_engine_audit: ok');
