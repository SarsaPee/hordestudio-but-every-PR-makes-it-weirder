const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

let passed = 0;
function test(name, fn) {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
}

test('Settings use a dedicated small persistence transaction', () => {
    assert.match(app, /async function persistGlobalSettingsOnly\(\)[\s\S]*?HordeDB\.setMultiple\(\{[\s\S]*?globalSettings: persistedSettings/);
    const handler = app.match(/document\.getElementById\('save-global-settings'\)\.onclick = async \(\) => \{([\s\S]*?)\n    \};/);
    assert.ok(handler, 'Settings save handler should exist');
    assert.match(handler[1], /await persistGlobalSettingsOnly\(\)/);
    assert.doesNotMatch(handler[1], /await saveState\(\)/);
});

test('saved settings are timestamped and restored from the newest store', () => {
    assert.match(app, /state\.globalSettings\.settingsSavedAt = Date\.now\(\)/);
    assert.match(app, /storedSettingsTime >= mirroredSettingsTime/);
    assert.match(app, /Recovered Settings from the local fallback snapshot/);
});

test('recovery storage is written before the database transaction', () => {
    const fn = app.match(/async function persistGlobalSettingsOnly\(\) \{([\s\S]*?)\n\}/);
    assert.ok(fn, 'dedicated Settings persistence function should exist');
    assert.ok(fn[1].indexOf('writeGlobalSettingsMirror(persistedSettings)') < fn[1].indexOf('await HordeDB.setMultiple'),
        'recovery snapshot must precede IndexedDB so it survives a failed transaction');
});

test('recovery storage excludes credentials and heavyweight workflows', () => {
    assert.match(app, /const mirror = redactGlobalSettingsCredentials\(settings\)/);
    assert.match(app, /mirror\.comfyWorkflowProfiles = mirror\.comfyWorkflowProfiles\.map/);
    assert.match(app, /mirror\.comfyWorkflow = \{\}/);
    assert.match(app, /delete copy\.localApiKey/);
    assert.match(app, /delete copy\.embeddingApiKey/);
    assert.match(app, /delete copy\.localTtsApiKey/);
    assert.match(app, /delete copy\.localImageApiKey/);
});

test('cloud-key session behavior is clearly reported', () => {
    assert.match(app, /API keys remain in this tab only/);
    assert.match(app, /Settings saved for future sessions/);
});

test('the changed persistence bundle is cache-busted consistently', () => {
    const versions = [...html.matchAll(/(?:style\.css|help-system\.js|app\.js)\?v=([^"']+)/g)].map(match => match[1]);
    assert.equal(versions.length, 3);
    assert.deepEqual(new Set(versions), new Set(['20260816-v1591-memory-hotfix-v1']));
});

console.log(`\n${passed} Settings persistence checks passed.`);
