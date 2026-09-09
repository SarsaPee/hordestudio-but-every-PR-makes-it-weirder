const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { buildContext } = require('./app_source.js');

const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

let passed = 0;
function test(name, fn) {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
}

test('bundled Worlds do not pin provider-specific text models', () => {
    const starterStart = app.indexOf('function createThronefallSandboxWorld()');
    const starterEnd = app.indexOf('const LEGACY_PINNED_STARTER_CHARACTER_MODELS');
    assert(starterStart >= 0 && starterEnd > starterStart);
    const starterSource = app.slice(starterStart, starterEnd);
    assert(!/model\s*:\s*['"]openrouter\/auto['"]/.test(starterSource));
    assert(!/model\s*:\s*['"]deepseek\/deepseek-v4-pro['"]/.test(starterSource));
});

test('new Worlds inherit Settings until deliberately pinned', () => {
    const start = app.indexOf('function createNewWorld()');
    const end = app.indexOf('function setupWorldStudioTabs()', start);
    assert(start >= 0 && end > start);
    assert.match(app.slice(start, end), /model:\s*''/);
});

test('World Studio preserves blank inheritance rather than materializing the default', () => {
    const start = app.indexOf('function openWorldStudio(');
    const end = app.indexOf('async function saveWorld()', start);
    const source = app.slice(start, end);
    assert.match(source, /worldModelInput\.value\s*=\s*w\.model\s*\|\|\s*''/);
    assert.match(html, /Leave blank to follow the default text provider and model from Settings/);
});

test('World gameplay resolves an inherited model at request time', () => {
    assert.match(app, /const modelId\s*=\s*world\.model\s*\|\|\s*state\.globalSettings\.defaultModel/);
    assert.match(app, /model:\s*modelId,[\s\S]{0,500}?messages:\s*sanitizeMessagesForProvider/);
});

test('legacy migration clears only exact shipped pins and runs once', () => {
    const context = {
        isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value)
    };
    buildContext(vm, [
        'LEGACY_PINNED_STARTER_CHARACTER_MODELS',
        'LEGACY_PINNED_STARTER_WORLD_MODELS',
        'migrateStarterModelInheritance'
    ], context);
    const characters = [
        { id: 'char_aris_adv', model: 'aion-labs/aion-2.0' },
        { id: 'authored_character', model: 'aion-labs/aion-2.0' }
    ];
    const worlds = [
        { id: 'world_vaelora_living_realm', model: 'openrouter/auto' },
        { id: 'world_bellwether_2005', model: 'custom/my-model' },
        { id: 'world_aldenmere', model: 'deepseek/deepseek-v4-pro' },
        { id: 'authored_world', model: 'openrouter/auto' }
    ];
    const settings = {};
    assert.equal(context.migrateStarterModelInheritance(characters, worlds, settings), true);
    assert.equal(characters[0].model, '');
    assert.equal(characters[1].model, 'aion-labs/aion-2.0');
    assert.equal(worlds[0].model, '');
    assert.equal(worlds[1].model, 'custom/my-model');
    assert.equal(worlds[2].model, '');
    assert.equal(worlds[3].model, 'openrouter/auto');
    assert.equal(settings.starterWorldModelInheritanceV1, true);
    assert.equal(settings.starterModelInheritanceV2, true);

    worlds[0].model = 'deliberately/pinned-later';
    assert.equal(context.migrateStarterModelInheritance(characters, worlds, settings), false);
    assert.equal(worlds[0].model, 'deliberately/pinned-later');
});

console.log(`\n${passed} World model-inheritance checks passed.`);
