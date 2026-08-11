const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('help-system.js', 'utf8');
const labs = fs.readFileSync('labs-ui.js', 'utf8');
const css = fs.readFileSync('style.css', 'utf8');

const registry = [...js.matchAll(/^\s*'([^']+)':\s*'/gm)].map(match => match[1]);
const missing = registry.filter(id => !html.includes(`id="${id}"`));

assert(registry.length >= 100, `expected broad help registry, found ${registry.length}`);
assert.deepEqual(missing, [], `help registry points at missing controls: ${missing.join(', ')}`);
assert(html.includes('help-system.js?v=20260811-emotion-architecture-v1'), 'help system is cache-busted and loaded');
assert(html.includes('style.css?v=20260811-emotion-architecture-v1'), 'tooltip and Pip styles have a fresh cache key');
assert(js.includes("document.addEventListener('mouseover', enter, true)"), 'mouse hover uses a capture-phase compatibility path');
assert(js.includes("document.addEventListener('pointerover'"), 'mouse/pointer discovery is supported');
assert(js.includes("document.addEventListener('focusin'"), 'keyboard discovery is supported');
assert(js.includes("event.key === 'Escape'"), 'tooltips can be dismissed');
assert(js.includes('MutationObserver'), 'dynamic cards and modal controls are enhanced');
assert(js.includes("setAttribute('aria-describedby'"), 'focused controls expose tooltip text to assistive technology');
assert(css.includes('.horde-context-tooltip'), 'custom tooltip is visibly styled');
assert(css.includes('label[data-help] > span:first-child::after'), 'guided fields expose a visible help affordance');
assert(html.includes('labs-policy-worlds-help'), 'Labs modes have persistent contextual explanations');
assert(labs.includes('renderPolicyHelp()'), 'Labs explanations update with selection');

console.log(`PASS context help audit (${registry.length} explicit explanations plus upgraded titles and nearby hints)`);
