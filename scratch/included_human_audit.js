const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { buildContext } = require('./app_source.js');

const bundleContext = { globalThis: {} };
vm.createContext(bundleContext);
vm.runInContext(fs.readFileSync('ashlyn-reynolds-human.js', 'utf8'), bundleContext);
vm.runInContext(fs.readFileSync('jane-harlow-human.js', 'utf8'), bundleContext);

const bundles = bundleContext.globalThis.HORDE_INCLUDED_HUMANS;
assert.equal(Array.isArray(bundles), true);
assert.equal(bundles.length, 2);
assert.deepEqual(Array.from(bundles, bundle => bundle.bundledId), [
    'ashlyn-reynolds-v1',
    'jane-harlow-v1'
]);

const appContext = { console };
buildContext(vm, [
    'validateCompanionArchiveData', 'normalizeCompanion',
    'livingClamp', 'livingId', 'isPlainObject', 'safeJsonClone',
    'requirePlainObject', 'requireString', 'requireSafeId', 'requireArray'
], appContext);

const archive = appContext.validateCompanionArchiveData(bundles[0]);
const ash = appContext.normalizeCompanion({
    ...archive.companion,
    bundledId: bundles[0].bundledId
});

assert.equal(ash.name, 'Ashlyn “Ash” Reynolds');
assert.equal(ash.bundledId, 'ashlyn-reynolds-v1');
assert.equal(ash.lifeProfile.weeklySchedule.length, 31);
assert.equal(ash.lifeProfile.wildcardDeck.length, 18);
assert(ash.profilePhoto.startsWith('data:image/jpeg;base64,'));
assert(ash.basePhoto.startsWith('data:image/jpeg;base64,'));
assert.equal(ash.allowVideoClips, true);
assert.equal(ash.startingVideoClips.length, 2);
assert.deepEqual(Array.from(ash.startingVideoClips, clip => clip.bundledSrc), [
    'assets/bundled/ashlyn-media/16.mp4',
    'assets/bundled/ashlyn-media/17.mp4'
]);
for (const clip of ash.startingVideoClips) {
    assert(fs.existsSync(clip.bundledSrc));
    assert.equal(fs.readFileSync(clip.bundledSrc).subarray(4, 8).toString('ascii'), 'ftyp');
}

const janeBundle = bundles[1];
const janeArchive = appContext.validateCompanionArchiveData(janeBundle);
const jane = appContext.normalizeCompanion({
    ...janeArchive.companion,
    bundledId: janeBundle.bundledId
});
assert.equal(jane.name, 'Jane Harlow');
assert.equal(jane.bundledId, 'jane-harlow-v1');
assert.equal(jane.lifeProfile.places.length, 9);
assert.equal(jane.lifeProfile.socialCircle.length, 8);
assert(jane.lifeProfile.weeklySchedule.length > 0);
assert(jane.profilePhoto.startsWith('data:image/jpeg;base64,'));
assert(jane.basePhoto.startsWith('data:image/jpeg;base64,'));
assert.deepEqual(Array.from(jane.memory.longTerm), []);
assert.deepEqual(Array.from(jane.lifeEvents), []);
assert.equal(jane.usage.textTurns, 0);

const html = fs.readFileSync('index.html', 'utf8');
assert.match(html, /ashlyn-reynolds-human\.js\?v=20260814-ashlyn-clips-v1/);
assert.match(html, /jane-harlow-human\.js\?v=20260814-bundled-humans-v1/);
assert(html.indexOf('ashlyn-reynolds-human.js') < html.indexOf('app.js?v='));
assert(html.indexOf('jane-harlow-human.js') < html.indexOf('app.js?v='));

const source = fs.readFileSync('app.js', 'utf8');
const portableBuilder = fs.readFileSync('scripts/build-portable.sh', 'utf8');
assert.match(source, /const HORDE_STUDIO_VERSION = '16\.0\.0'/);
assert.match(portableBuilder, /VERSION="\$\{1:-16\.0\.0\}"/);
assert.match(portableBuilder, /cp -R "\$ROOT_DIR\/assets\/bundled"/);
assert.match(source, /includedHumanReceipts/);
assert.match(source, /companion\.bundledId = bundleId/);
assert.match(source, /companion\?\.name === candidateName/);
assert.match(source, /function renderIncludedHumansCatalog\(\)/);
assert.match(source, /function installIncludedHuman\(bundleId\)/);

console.log('PASS included Virtual Human audit');
