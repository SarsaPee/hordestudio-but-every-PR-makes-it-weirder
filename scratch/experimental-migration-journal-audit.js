const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');
const repository = fs.readFileSync('experiences/experimental-worlds/runtime/experimental-worlds-repository.js', 'utf8');

assert.match(repository, /legacyPreimageDigest: await digest\(preimage\)/,
    'the Experimental repository must checksum the exact legacy World preimage');
assert.match(repository, /legacyHostPreimageDigest: await digest\(hostPreimage\)/,
    'the Experimental repository must checksum the complete host preimage');
assert.match(repository, /const stagedDigest = await verifiedSnapshot\(preimage, 'legacy import'\)/,
    'legacy World data must be staged and read back before a cutover journal exists');
assert.match(app, /if \(experimentalJournal\?\.status === 'staged-and-verified'\) \{[\s\S]*?await finalizeExperimentalLegacyCutover\(\)[\s\S]*?Resumed the verified Experimental Worlds ownership cutover before host startup\./,
    'an interrupted ownership transition must resume before ordinary host startup reads World keys');
assert.match(app, /preservedWorldDigest !== journal\.legacyPreimageDigest/,
    'cutover must reject a changed Experimental preimage');
assert.match(app, /restoredDigest !== journal\.stagedDigest/,
    'cutover must require exact staged-copy readback, not merely a non-empty World list');
const removal = app.indexOf("await HordeDB.deleteMultiple(['worlds', 'worldRecoverySnapshots', 'worldInstances', 'activeWorldId', 'worldMediaAssets'])");
const journal = app.indexOf("status: 'legacy-host-records-removed'", removal);
assert(removal >= 0 && journal > removal,
    'legacy host World keys may be removed only after all preimage and stage validations');

console.log('Experimental migration journal audit passed.');
