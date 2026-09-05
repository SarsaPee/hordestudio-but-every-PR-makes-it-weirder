const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('style.css', 'utf8');

assert.match(css, /#app\s*\{[\s\S]*?height:\s*100dvh;/, 'app shell should follow the dynamic viewport');
assert.match(css, /\.main\s*\{[\s\S]*?min-height:\s*0;/, 'main flex child must be allowed to shrink');
assert.match(css, /\.view\s*\{[\s\S]*?overflow-y:\s*auto;/, 'ordinary views must scroll by default');
assert.match(css, /\.view\s*\{[\s\S]*?scrollbar-gutter:\s*stable;/, 'view scrollbars should not move the layout');
assert.match(css, /#chat-view,[\s\S]*?#multiplayer-session-view\s*\{\s*overflow:\s*hidden;/, 'immersive views should explicitly own their nested scrollers');
assert.match(css, /\.sidebar-nav\s*\{[\s\S]*?overflow-y:\s*auto;/, 'desktop navigation must remain reachable on short windows');

console.log('✓ shared scrolling contract is explicit and safe for new views');
