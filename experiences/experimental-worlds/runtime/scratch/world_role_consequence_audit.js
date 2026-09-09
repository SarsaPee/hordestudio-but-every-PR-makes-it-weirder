/** Regression checks for world-defined roles, knowledge provenance and consequences. */
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { app, buildContext } = require('./app_source.js');

const context = { console: { log() {}, warn() {}, error() {} } };
buildContext(vm, [
    'normalizeWorldGameRules', 'resolveWorldCheckCapability', 'applyWorldCapabilityProgress', 'normalizeNpcKnowledgeEntry', 'addNpcKnowledge',
    'createWorldConsequence', 'advanceWorldConsequences', 'simulateWorldAutonomyHealth'
], context);

const world = {
    id: 'w', name: 'Test', startLocationId: 'a',
    locations: [
        { id: 'a', name: 'A', regionId: 'r', mapType: 'area', exits: [{ text: 'to B', targetLocationId: 'b', mode: 'walk', travelTime: 5 }] },
        { id: 'b', name: 'B', regionId: 'r', mapType: 'area', exits: [{ text: 'to A', targetLocationId: 'a', mode: 'walk', travelTime: 5 }] }
    ],
    regions: [{ id: 'r', name: 'R', description: 'Region', tags: ['test'] }],
    entities: [{ id: 'n', name: 'N', type: 'npc', description: 'Person', persona: 'Careful', startLocation: 'a', homeLocation: 'a',
        schedule: [{ time: '08:00', locationId: 'a' }, { time: '09:00', locationId: 'b' }], goal: 'Work', goalSteps: ['Leave', 'Arrive'] }],
    groups: [], hudConfig: { stats: [{ id: 'grit', name: 'Grit', value: 2, min: 0, max: 10 }] },
    gameRules: { modules: { checks: true }, dice: { visibility: 'player_triggered', sides: 12 }, capabilities: {
        startingPointBudget: 3, skills: [{ id: 's', name: 'Sneak', cost: 1 }], perks: [], flaws: [], progression: { enabled: true, method: 'milestones' }
    } }
};

const rules = context.normalizeWorldGameRules(world);
assert.equal(rules.dice.resolution, 'player');
assert.equal(rules.dice.visibility, 'player_triggered');
assert.equal(rules.capabilities.startingPointBudget, 3);
assert.equal(rules.capabilities.skills[0].name, 'Sneak');
const chosenSkill = context.resolveWorldCheckCapability(world, { playerIdentity: { skills: ['Sneak'] } }, 's');
assert.equal(chosenSkill.selected, true);
assert.equal(chosenSkill.appliedModifier, 2);
assert.equal(context.resolveWorldCheckCapability(world, { playerIdentity: { skills: [] } }, 's').appliedModifier, 0);
const progressionSession = { playerIdentity: { skills: ['Sneak'], capabilityRanks: {} } };
assert.equal(context.applyWorldCapabilityProgress(world, progressionSession, [{ capability_id: 's', change: 1, reason: 'Training' }])[0].rank, 2);

const direct = context.normalizeNpcKnowledgeEntry({ text: 'Saw it', sourceType: 'witnessed', confidence: 1, turn: 2 });
assert.equal(direct.source, 'witnessed');
assert.equal(direct.evidenceMode, 'direct');
assert.equal(direct.learnedAt.turn, 2);

const sess = { id: 's', turnCount: 2, entityStates: { n: { location: 'a', observations: [] } }, consequences: [] };
context.addNpcKnowledge(world, sess, 'n', { text: 'A rumor', sourceType: 'told', confidence: 0.6, eventId: 'e' });
context.addNpcKnowledge(world, sess, 'n', { text: 'A rumor', sourceType: 'witnessed', confidence: 1, eventId: 'e' });
assert.equal(sess.entityStates.n.observations.length, 1);
assert.equal(sess.entityStates.n.observations[0].sourceType, 'witnessed');

context.createWorldConsequence(world, sess, { title: 'A wound', type: 'condition', severity: 70, escalateAfterTurns: 2, sourceEventId: 'injury' });
context.advanceWorldConsequences(world, sess, 2);
assert.equal(sess.consequences[0].state, 'active');
context.advanceWorldConsequences(world, sess, 4);
assert.equal(sess.consequences[0].state, 'escalating');

const health = context.simulateWorldAutonomyHealth(world, 7);
assert.equal(health.days, 7);
assert.equal(health.stats.providerCalls, 0);
assert.equal(health.stats.impossibleMoves, 0);
assert(health.score > 80);
assert(/(?:sess|s)\.personaSnapshot\s*=/.test(app), 'New Session does not freeze the selected global persona');
assert(/(?:sess|s)\.setupSnapshot\s*=/.test(app), 'New Session does not freeze the world-specific role setup');
assert(/Autonomy Health/.test(app) && /Simulate 7 days/.test(app), 'creator-facing autonomy preflight is missing');

console.log('✓ world-defined roles normalize and selected capabilities affect checks');
console.log('✓ NPC facts retain provenance and upgrade duplicate confidence');
console.log('✓ consequences advance through explicit lifecycle states');
console.log('✓ seven-day autonomy health is deterministic and model-free');
console.log('✓ New Session freezes persona and role setup snapshots');
