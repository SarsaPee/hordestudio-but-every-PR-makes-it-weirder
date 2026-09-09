const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.match(app, /memoryMode: \['ledger', 'semantic'\]\.includes\(raw\.memoryMode\) \? raw\.memoryMode : 'semantic'/,
    'new Kernel configs must default to semantic archives');
assert.match(app, /compactTools: raw\.compactTools === true/,
    'compact tool contracts must be opt-in');
assert.match(html, /id="w-kernel-compact-tools"(?![^>]*checked)/,
    'the compact-tool checkbox must be clear by default');
assert.match(app, /const sidecarTimeline = window\.HordeSidecarHooks\?\.isSidecarWorld\?\.\(world, sess\) === true;[\s\S]*?if \(sidecarTimeline \|\| !kernel\.enabled/,
    'Sidecar timelines must bypass older Kernel location-manifest compaction');
assert.match(app, /if \(!sidecarMode && !successfulStateCall && !inlineStateApplied && fullText\.trim\(\) && receiptRepairNeeded\)/,
    'missing-receipt policy must remain excluded from Sidecar reconciliation');
assert.match(app, /if \(!sidecarMode && normalizeWorldKernelConfig\(world\)\.enabled && normalizeWorldKernelConfig\(world\)\.compactTools\)/,
    'compact tool contracts must remain excluded from Sidecar requests');

console.log('✓ Kernel defaults and legacy repair paths are Sidecar-compatible');
