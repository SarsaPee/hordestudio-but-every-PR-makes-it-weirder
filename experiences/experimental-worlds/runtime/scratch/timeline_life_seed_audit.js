/** Timeline-scoped Persona and active-life initialization audit. */
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { app, buildContext, functionSource } = require('./app_source.js');

const context = { console };
buildContext(vm, ['stableWorldRoll', 'lifeSeedSlug', 'chooseTimelineHome', 'fallbackTimelineLifePlan'], context);

const world = {
    id: 'town', name: '2005 Suburbia', description: 'A suburban school life simulation.',
    locations: [
        { id: 'small_flat', name: 'Westgate Flat', mapType: 'building', prosperity: 25, description: 'A modest apartment home.' },
        { id: 'lake_house', name: 'Lakeview House', mapType: 'building', prosperity: 94, description: 'An affluent family home.' },
        { id: 'high_school', name: 'Bellwether High School', mapType: 'area', prosperity: 55, description: 'The public high school.' },
        { id: 'hospital', name: 'Bellwether General Hospital', mapType: 'building', prosperity: 70, description: 'The medical campus.' }
    ]
};
const session = { id: 'timeline_1', playerLocation: 'high_school' };
const persona = { id: 'p1', name: 'Jamie Mercer', text: 'A new high-school student. Both parents are doctors and the family lives in a rich part of town.' };
const origin = { id: 'new_kid', name: 'The New Kid', role: 'high-school junior', description: 'Moved here yesterday.' };
const plan = context.fallbackTimelineLifePlan(world, session, persona, origin);

assert.equal(plan.home.location_id, 'lake_house', 'wealth did not select the affluent home');
assert.equal(plan.people.filter(person => /parent/.test(person.relationship_to_player)).length, 2, 'student did not receive a household');
assert(plan.people.filter(person => /parent/.test(person.relationship_to_player)).every(person => person.role === 'doctor'), 'doctor parents were reduced to flavor text');
assert(plan.people.filter(person => /parent/.test(person.relationship_to_player)).every(person => person.day_location_id === 'hospital'), 'doctor parents were not assigned a workplace');
assert(plan.people.some(person => /classmate|friend|rival/.test(person.relationship_to_player)), 'student received no persistent peers');

const createSession = functionSource('createNewWorldSession');
assert(/personaId:\s*state\.activePersonaId/.test(createSession), 'new timelines do not capture the active Persona');
assert(/lifeSeed:\s*null/.test(createSession), 'new timelines lack explicit life initialization state');
assert(/s\.personaId\s*=\s*personaSelect\.value/.test(functionSource('openSessionZero')), 'Session Zero Persona choice is not persisted');
assert(/closeButton\.onclick\s*=\s*dismiss/.test(functionSource('openSessionZero')), 'the modal X still commits instead of dismissing');
assert(/Object\.assign\(sess,[\s\S]*sessionSetupSnapshot/.test(functionSource('openSessionZero')), 'dismissing does not restore the uncommitted timeline preview');
assert(/New Session Setup/.test(app), 'the old Session Zero name is still exposed');
assert(/getTimelinePersona\(sess\)/.test(app), 'world narration still reads only the mutable global Persona');
assert(/relationshipToPlayer/.test(functionSource('applyTimelineLifePlan')), 'seeded relationships are not committed as structured state');
assert(/homeLocationId/.test(functionSource('applyTimelineLifePlan')), 'seeded home is not committed to player identity');

console.log('✓ rich household resolution');
console.log('✓ parent professions and workplace');
console.log('✓ persistent school social anchors');
console.log('✓ timeline-scoped Persona selection');
console.log('✓ structured home and relationship commit');
console.log('✓ reversible New Session Setup dismissal');
console.log('\n6 timeline life-seed audits passed.');
