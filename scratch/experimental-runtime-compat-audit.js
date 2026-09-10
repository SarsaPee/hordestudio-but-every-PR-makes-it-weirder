const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('experiences/experimental-worlds/runtime/experimental-runtime-compat.js', 'utf8');
const context = { Date, JSON, Object, Array, String, Number, RegExp, Math };
context.globalThis = context;
vm.runInNewContext(source, context);

assert.equal(context.experimentalEscapeHTML(`<img src=x onerror="nope">`), '&lt;img src=x onerror=&quot;nope&quot;&gt;');
assert.equal(context.experimentalCssUrl(`x');background:url(javascript:alert(1))`), 'x;background:urljavascript:alert1');
assert.equal(context.experimentalCssUrl('javascript:alert(1)'), '');
assert.equal(context.experimentalDisplayInitials('Éowyn of Rohan'), 'OO');
assert.equal(context.experimentalIsPlainObject({ value: 1 }), true);
assert.equal(context.experimentalIsPlainObject([]), false);
assert.equal(context.experimentalIsPlainObject(null), false);
const clone = context.experimentalSafeJsonClone({ safe: 1, nested: { constructor: 'drop', kept: 'yes' } });
assert.deepEqual(JSON.parse(JSON.stringify(clone)), { safe: 1, nested: { kept: 'yes' } });
assert.deepEqual(JSON.parse(JSON.stringify(context.experimentalNormalizePersona({ id: 'p', name: 'Ari', color: '#c0ffee', pronouns: 'they/them' }))), {
    id: 'p', name: 'Ari', text: '', age: '', pronouns: 'they/them', appearance: '', publicIdentity: '', reputation: '', color: '#C0FFEE'
});
assert.equal(context.experimentalPersonaPromptText({ name: 'Ari', appearance: 'raincoat' }), 'Name: Ari\nVisible appearance: raincoat');
assert.deepEqual(JSON.parse(JSON.stringify(context.experimentalExtractJSON('intro\n```json\n{"scene":"dock",}\n```'))), { scene: 'dock' });
assert.equal(context.experimentalSafeParseJSONRepair('{"broken":'), null);
assert.equal(context.experimentalSafeParseJSONRepair('not json'), null);

const standaloneFixture = fs.readFileSync('scratch/experimental-worlds-alone-library.html', 'utf8');
assert(!/window\.(?:escapeHTML|cssUrl|isPlainObject|safeJsonClone)\s*=/.test(standaloneFixture),
    'the standalone fixture must not provide host utility globals');
assert(standaloneFixture.includes('experimental-runtime-compat.js'),
    'the standalone fixture must load the Experimental utility closure itself');

const portable = fs.readFileSync('scripts/build-portable.sh', 'utf8');
[
    'experimental-runtime-compat.js',
    'experimental-vector-memory.js',
    'experimental-rpg-mechanics.js',
    'world-message-input.js',
    'experimental-worlds-state-adapter.js',
    'experimental-worlds-isolated.css'
].forEach(file => assert(portable.includes(file),
    `portable build must include the Experimental boot asset ${file}`));

console.log('Experimental private utility closure audit passed.');
