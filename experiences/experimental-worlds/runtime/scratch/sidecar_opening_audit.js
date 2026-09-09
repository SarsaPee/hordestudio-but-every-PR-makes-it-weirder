/**
 * Sidecar opening-turn regression audit.
 * Run with: node scratch/sidecar_opening_audit.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function sourceOf(name, prefix = 'function') {
    const start = app.indexOf(`${prefix} ${name}(`);
    assert(start >= 0, `missing ${name}`);
    const open = app.indexOf('{', app.indexOf(') {', start));
    let depth = 0;
    for (let index = open; index < app.length; index++) {
        if (app[index] === '{') depth++;
        if (app[index] === '}' && --depth === 0) return app.slice(start, index + 1);
    }
    throw new Error(`unclosed ${name}`);
}

const handoff = sourceOf('buildSidecarOpeningHandoff');
const bootstrap = sourceOf('bootstrapSidecarOpeningTurn', 'async function');
const turn = sourceOf('executeWorldTurn', 'async function');

assert.match(handoff, /SCENE READING/, 'opening handoff must describe the completed narrator beat');
assert.match(handoff, /ANSWER core\.time/, 'opening handoff must establish temporal evidence');
assert.match(handoff, /ANSWER core\.location/, 'opening handoff must establish starting location evidence');
assert.match(handoff, /ANSWER core\.cast/, 'opening handoff must establish cast evidence');
assert.match(bootstrap, /runSidecarReconciliation\(world, sess/, 'opening must invoke the normal Sidecar receipt pipeline');
assert.match(bootstrap, /sidecar_opening_reconciliation_failed/, 'opening failures must remain visible Sidecar attempts');
assert.match(turn, /await bootstrapSidecarOpeningTurn\(world, sess, authoredOpening\)/,
    'authored opening must generate a Sidecar handoff and receipt');
assert.match(turn, /await bootstrapSidecarOpeningTurn\(world, sess, fallbackIntro\)/,
    'engine fallback opening must generate a Sidecar handoff and receipt');
assert.match(turn, /!protocol\?\.turns\?\.length/,
    'only legacy orphaned openings may be repaired automatically');
assert.match(turn, /ensureHierarchy\(protocol, sess, \{ createWhenMissing: true \}\)/,
    'an orphaned opening must reopen a usable Sidecar hierarchy before reconciliation');
assert.match(turn, /await bootstrapSidecarOpeningTurn\(world, sess, String\(opening\.text \|\| ''\)\)/,
    'an orphaned opening must be reconciled before the next player action');
const conversation = sourceOf('runSidecarConversation', 'async function');
assert.match(conversation, /const next = window\.HordeSidecarTimeline\?\.ensureHierarchy\(protocol, sess, \{ createWhenMissing: true \}\)/,
    'closing a scene must create its replacement while retaining the sequence');
assert.match(conversation, /nextSceneId: next\?\.scene\?\.id \|\| ''/,
    'the scene transition receipt must identify the replacement scene');
assert.match(app, /current\(protocol, 'sequences', protocol\.activeSequenceId\)\s*\n\s*\|\| \(protocol\.sequences \|\| \[\]\)\.find\(item => item\?\.status === 'active'\)/,
    'blank active sequence pointers must recover the existing active sequence');
assert.match(app, /current\(protocol, 'scenes', protocol\.activeSceneId\)\s*\n\s*\|\| \(protocol\.scenes \|\| \[\]\)\.find\(item => item\?\.status === 'active'/,
    'blank active scene pointers must recover the existing active scene');
console.log('✓ Sidecar opening handoff and reconciliation bootstrap verified');
