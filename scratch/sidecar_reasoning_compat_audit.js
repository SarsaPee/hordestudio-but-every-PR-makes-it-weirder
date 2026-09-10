const assert = require('assert');
const fs = require('fs');

const root = require('path').join(__dirname, '..');
const app = [
    'app.js',
    'experiences/experimental-worlds/runtime/world-studio-core.js',
    'experiences/experimental-worlds/runtime/world-protocol-core.js'
].map(file => fs.readFileSync(require('path').join(root, file), 'utf8')).join('\n');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const policy = app.match(/function sidecarReasoningPolicy\(tracker = \{\}, world = \{\}\) \{[\s\S]*?\n\}/)?.[0] || '';
const helper = app.match(/function applySidecarReasoning\(body, provider, tracker = \{\}, world = \{\}, options = \{\}\) \{[\s\S]*?\n\}/)?.[0] || '';

assert.ok(policy, 'Sidecar reasoning policy helper must exist');
assert.ok(helper, 'Sidecar reasoning request helper must exist');
assert.match(policy, /mode === 'enabled' \|\| \(mode === 'inherit' && world\.reasoning === true\)/,
    'the default Sidecar policy must inherit the Narrator reasoning toggle');
assert.match(policy, /world\.reasoningEffort/,
    'the default Sidecar policy must inherit the Narrator reasoning effort');
assert.ok(!/enabled:\s*false/.test(helper),
    'Sidecar must not explicitly disable reasoning, because mandatory-reasoning models reject that request');
assert.match(helper, /options\.withoutReasoning === true/,
    'the retry path must omit optional reasoning');
assert.match(app, /runSidecarQuestionRepair[\s\S]*?fetchSidecarCompletion\(body,/,
    'narrow question repairs must use the compatibility-safe completion helper');
assert.match(app, /sidecarTokenLimitIncomplete\(payload\)[\s\S]*?ExperimentalWorldsHost\.notify\('Sidecar thought too hard, retrying without reasoning\.', 'info'\)[\s\S]*?return request\(true\);/,
    'an incomplete token-limited Sidecar reply must visibly retry once without reasoning');
assert.match(app, /w-sidecar-reasoning-mode/,
    'the Sidecar editor must expose narrator-inherited and explicit reasoning modes');
assert.match(html, /id="w-sidecar-reasoning-mode"[\s\S]*?value="inherit"[\s\S]*?value="enabled"[\s\S]*?value="disabled"/,
    'the Sidecar editor must offer Match Narrator, Always on, and no-optional-reasoning modes');

console.log('✓ Sidecar reasoning inherits Narrator settings and safely retries token limits');
