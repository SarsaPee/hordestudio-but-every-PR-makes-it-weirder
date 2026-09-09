/**
 * World toolbar cleanup regression audit.
 * Run with: node scratch/world_toolbar_cleanup_audit.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const retired = [
    'world-conversation-mode',
    'world-fork-session-btn',
    'world-context-refresh-btn',
    'world-promote-implied-btn',
    'world-v3-panel-btn',
    'world-backstage-btn'
];
retired.forEach(id => {
    assert(!html.includes(id), `${id} must not remain in the world toolbar`);
    assert(!app.includes(`'${id}'`), `${id} must not retain event wiring`);
});
assert.match(html, /world-v3-gm-btn/, 'World GM must remain the Sidecar entry point');
assert.match(app, /timeline-fork-btn/, 'selected-turn timeline forking must remain available');
assert.match(app, /protocol\.inputMode = 'sidecar';/, 'World GM must enter Sidecar conversation mode directly');
assert.match(app, /protocol\.inputMode = 'narrator';/, 'closing World GM must return input to the narrator');
assert.match(app, /function returnToWorldNarrator\(\)[\s\S]*?const activeSession = getCurrentWorldSession\(\);[\s\S]*?activeProtocol\.inputMode = 'narrator';[\s\S]*?activeProtocol\.workspace = \{\};[\s\S]*?renderWorldPlayState\(\);[\s\S]*?saveState\(\)\.catch/,
    'returning from World GM must resolve the active timeline, rerender narrator mode, then persist it');
assert.match(app, /closeSidecarConversation\.onclick = returnToWorldNarrator;/,
    'the return control must use the active-timeline transition handler');
assert.match(app, /inputMode === 'sidecar'/, 'sending must route from stored conversation mode, not a retired selector');
console.log('✓ world toolbar is consolidated around World GM and selected-turn forks');
