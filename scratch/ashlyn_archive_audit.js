const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { buildContext } = require('./app_source.js');

const context = { console, state: { companions: [], companionThreads: {}, companionTimelines: {} } };
buildContext(vm, [
    'validateCompanionArchiveData', 'normalizeCompanion',
    'livingClamp', 'livingId', 'isPlainObject', 'safeJsonClone',
    'requirePlainObject', 'requireString', 'requireSafeId', 'requireArray'
], context);

const archive = JSON.parse(fs.readFileSync('Ashlyn Reynolds.horde_human', 'utf8'));
const validated = context.validateCompanionArchiveData(archive);
const ash = context.normalizeCompanion(validated.companion);

assert.equal(validated._version, 2);
assert.equal(ash.name, 'Ashlyn “Ash” Reynolds');
assert.equal(ash.age, 21);
assert.match(ash.locationLabel, /University of Southern California/i);
assert.equal(ash.emotionExpression, 'performative');
assert.equal(ash.ruminationStyle, 'high');
assert.equal(ash.reactionTiming, 'mixed');
assert.equal(ash.emotionalGranularity, 'contradictory');
assert.equal(ash.libidoEnabled, true);
assert.equal(ash.allowPhotos, true);
assert.equal(ash.allowVoiceNotes, true);
assert.equal(ash.lifeProfile.places.length, 9);
assert.equal(ash.lifeProfile.socialCircle.length, 8);
assert.equal(ash.lifeProfile.wardrobe.length, 12);
assert.equal(ash.lifeProfile.weeklySchedule.length, 31);
assert.equal(ash.lifeProfile.wildcardDeck.length, 18);
assert(ash.profilePhoto.startsWith('data:image/jpeg;base64,'));
assert(ash.basePhoto.startsWith('data:image/jpeg;base64,'));
assert(ash.basePhoto.length > ash.profilePhoto.length);
assert.match(ash.relationshipContext, /complete stranger/i);
assert.match(ash.intimacyBoundaries, /does not accept coercion/i);
assert(!JSON.stringify(archive).includes('horde-studio-virtual-human-timelines'));

console.log('PASS Ashlyn archive audit');
