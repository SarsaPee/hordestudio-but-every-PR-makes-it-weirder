const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('style.css', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');

let passed = 0;
function test(name, fn) {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
}

test('Settings remains a modal with persistent navigation and search', () => {
    assert.match(html, /id="modal-overlay" class="modal-bg hidden"/);
    assert.match(html, /class="modal settings-modal"[^>]*role="dialog"[^>]*aria-modal="true"/);
    assert.match(html, /class="settings-nav"/);
    assert.match(html, /id="settings-search-input"/);
});

test('every Settings destination has a matching panel', () => {
    const targets = [...html.matchAll(/data-settings-target="([^"]+)"/g)].map(match => match[1]);
    const sections = [...html.matchAll(/data-settings-section="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(targets, ['models', 'accounts', 'images', 'behavior', 'memory', 'appearance', 'runtime', 'data']);
    assert.deepEqual(new Set(sections), new Set(targets));
});

test('the old feature controls are retained in the redesigned sections', () => {
    const requiredIds = [
        'global-api-provider', 'global-default-model', 'global-api-key', 'global-gptproto-key',
        'global-nanogpt-key', 'global-nvidia-key', 'global-bedrock-key', 'global-custom-api-key',
        'global-mcp-bridge-url', 'global-comfy-url', 'global-comfy-workflow',
        'global-immersion-mode', 'global-slop-stripper', 'open-regex-btn',
        'global-memory-threshold', 'global-memory-topk', 'global-consolidation-model',
        'global-embedding-model', 'edit-font-size', 'edit-font-color', 'edit-bg-color',
        'backup-all-btn', 'restore-all-btn', 'purge-data-btn', 'save-global-settings'
    ];
    for (const id of requiredIds) {
        assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} should exist exactly once`);
    }
});

test('navigation, search and keyboard access are wired', () => {
    assert.match(app, /function activateSettingsSection\(/);
    assert.match(app, /function searchSettings\(/);
    assert.match(app, /function setupSettingsNavigation\(/);
    assert.match(app, /event\.metaKey \|\| event\.ctrlKey/);
    assert.match(app, /cancel\.onclick = hideGlobalSettings/);
});

test('responsive Settings layouts cover sidebar, tablet and phone widths', () => {
    assert.match(css, /\.settings-layout\s*\{[^}]*grid-template-columns:\s*224px minmax\(0, 1fr\)/s);
    assert.match(css, /@media \(max-width: 780px\)[\s\S]*?\.settings-nav\s*\{[^}]*display:\s*flex/s);
    assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.settings-modal-footer > span/s);
});

console.log(`\n${passed} Settings modal UI checks passed.`);
