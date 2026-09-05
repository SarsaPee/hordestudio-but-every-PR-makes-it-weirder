const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

assert.strictEqual((html.match(/id="w-sidecar-mode"/g) || []).length, 1,
    'state pipeline must have one top-level mode selector');
assert.match(html, /Sidecar · canonical authority[\s\S]*?Inline Legacy · compatibility only/,
    'the top-level selector must identify Sidecar as authority and Legacy as compatibility');
assert.match(html, /id="w-sidecar-authority-settings"[^>]*data-pipeline-settings="sidecar"/,
    'Sidecar controls must be in the Sidecar-only mode section');
assert.match(html, /id="w-inline-legacy-settings"[^>]*data-pipeline-settings="inline_legacy"/,
    'Kernel and receipt-repair controls must be in the Legacy-only section');
assert.match(app, /function renderStatePipelineConfig[\s\S]*?data-pipeline-settings[\s\S]*?section\.dataset\.pipelineSettings === mode/,
    'the selected pipeline must exclusively show its own controls');
assert.match(app, /Sidecar is active\. It is the only canonical state authority/,
    'the UI must state Sidecar authority explicitly');
assert.match(app, /w-inline-legacy-migrate-btn[\s\S]*?openSidecarMigrationWizard/,
    'Legacy mode must retain an explicit migration route');

console.log('✓ State pipeline UI separates Sidecar authority from Inline Legacy');
