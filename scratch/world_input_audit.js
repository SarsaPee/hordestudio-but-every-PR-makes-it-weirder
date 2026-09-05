/**
 * World message input sizing regression audit.
 * Run with: node scratch/world_input_audit.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

assert.match(app, /function resizeWorldMessageInput\(input = document\.getElementById\('world-user-input'\)\)/,
    'world input must have a dedicated auto-grow helper');
assert.match(app, /const maximumHeight = defaultHeight \* 5;/,
    'auto-grow must stop at five times the default height');
assert.match(app, /function resetWorldMessageInput\(input = document\.getElementById\('world-user-input'\)\)/,
    'world input must have a dedicated reset helper');
assert.match(app, /input\.addEventListener\('input', \(\) => resizeWorldMessageInput\(input\)\)/,
    'typing must resize the world input');
assert.match(app, /function installWorldMessageResizeHandle\(input, handle\)/,
    'world input must have a dedicated top-edge drag handler');
assert.match(app, /drag\.startHeight \+ drag\.startY - event\.clientY/,
    'dragging upward from the top edge must increase composer height');
assert.match(app, /delete input\.dataset\.manualHeight;/,
    'sending must clear a manual resize');
assert.match(app, /resetWorldMessageInput\(input\);/,
    'Sidecar message send must reset the input');
assert.match(app, /if \(!command\) resetWorldMessageInput\(\);/,
    'narrator message send must reset the input');
assert.match(css, /\.world-message-resize-handle\s*\{[^}]*top:\s*-8px;[^}]*cursor:\s*ns-resize;/s,
    'the world input must expose a dedicated top-edge drag anchor');
assert.match(css, /#world-user-input\.msg-input\s*\{[^}]*resize:\s*none;[^}]*max-height:\s*70vh;/s,
    'the native corner handle must be replaced with the expandable top anchor');
console.log('✓ world input auto-grow, resize, and reset contract verified');
