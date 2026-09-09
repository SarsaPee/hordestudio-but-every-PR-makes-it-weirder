const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const js = fs.readFileSync('help-system.js', 'utf8');
const labs = fs.readFileSync('labs-ui.js', 'utf8');
const css = fs.readFileSync('style.css', 'utf8');

const registry = [...js.matchAll(/^\s*'([^']+)':\s*'/gm)].map(match => match[1]);
const missing = registry.filter(id => !html.includes(`id="${id}"`) && !app.includes(`id="${id}"`));

assert(registry.length >= 100, `expected broad help registry, found ${registry.length}`);
assert.deepEqual(missing, [], `help registry points at missing controls: ${missing.join(', ')}`);
const helpVersion = html.match(/help-system\.js\?v=([^"']+)/)?.[1];
const styleVersion = html.match(/style\.css\?v=([^"']+)/)?.[1];
assert(helpVersion, 'help system is cache-busted and loaded');
assert.equal(styleVersion, helpVersion, 'tooltip and Pip styles share the current app cache key');
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
