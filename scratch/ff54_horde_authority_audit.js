/**
 * FF5.4 Horde Authority preset and regex suite regression audit.
 * Run with: node scratch/ff54_horde_authority_audit.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'presets.js'), 'utf8'), context);
const assets = vm.runInContext('({ presets: DEFAULT_SYSTEM_PRESETS, suites: DEFAULT_REGEX_SUITES })', context);

const preset = assets.presets.find(item => item.id === 'freaky_frankenstein_54_horde_authority');
assert(preset, 'FF5.4 Horde Authority must be registered');
assert.equal(preset.data.prompts.length, 17, 'preset must keep its compact, marker-aware prompt set');
assert(preset.data.prompts.every(prompt => !/\{\{(?:setvar|getvar|roll)::/i.test(prompt.content || '')),
    'preset must not restore SillyTavern mutable macros');
assert(preset.data.prompts.some(prompt => /commit_world_turn/i.test(prompt.content || '')),
    'preset must retain the Horde receipt authority contract');
assert(preset.data.prompts.some(prompt => prompt.identifier === 'worldInfoBefore' && prompt.marker),
    'preset must retain native world truth placement');

const suite = assets.suites.find(item => item.id === 'ff5_context_cleanup');
assert(suite, 'FF5 cleanup suite must be registered');
assert.equal(suite.scripts.length, 4);
assert(suite.scripts.every(script => script.target === 'context' && script.enabled),
    'FF5 cleanup scripts must affect model context only and be enabled when installed');

assert.match(index, /<script src="presets\.js"><\/script>[\s\S]*?<script src="policy-panic-world\.js">/,
    'the existing presets asset must load before app.js');
assert.match(app, /function getBundledRegexSuites\(\)/, 'bundled regex suites must be discoverable');
assert.match(app, /function installBundledRegexSuite\(suiteId\)/, 'bundled regex suites must be installable');
assert.match(app, /applyRegexScripts\(content, 'context'\)/, 'context regex must run before history is sent');
assert.match(app, /value="context"/, 'regex manager must expose the model-context target');

console.log('✓ FF5.4 Horde Authority preset and context cleanup suite verified');
