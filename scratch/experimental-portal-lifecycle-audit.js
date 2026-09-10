#!/usr/bin/env node
// Pass-1 ownership regression guard. This is intentionally source-level; the
// browser route check records that the real UI still opens after these seams.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const root = 'experiences/experimental-worlds';
const bodyAppend = /document\.body\.(?:appendChild|append|insertBefore|removeChild)\s*\(/;
const customFiles = globSync(`${root}/{runtime,visuals,scenepulse}/**/*.js`, {
    exclude: [`${root}/scenepulse/vendor/**`]
});
for (const file of customFiles) {
    if (file.endsWith('experimental-runtime-compat.js')) continue;
    assert(!bodyAppend.test(readFileSync(file, 'utf8')), `${file} escapes the Experimental Worlds portal`);
}
for (const file of globSync(`${root}/scenepulse/vendor/ScenePulse/src/**/*.js`)) {
    assert(!bodyAppend.test(readFileSync(file, 'utf8')), `${file} lets a pinned ScenePulse surface escape the Experimental Worlds portal`);
}

const compat = readFileSync(`${root}/runtime/experimental-runtime-compat.js`, 'utf8');
assert(compat.includes("experimental-worlds-portal-root"), 'private compatibility closure does not own an Experimental portal root');
assert(compat.includes('clearPortal'), 'private compatibility closure cannot clear Experimental route surfaces');

const html = readFileSync('index.html', 'utf8');
assert(html.includes('experimental-worlds-isolated.css'), 'Experimental Worlds does not load its private stylesheet');
for (const viewId of ['worlds-view', 'world-studio-view', 'world-play-view']) {
    assert(new RegExp(`<section id="${viewId}"[^>]*experimental-worlds-view`).test(html), `${viewId} lacks the mode-owned CSS root`);
}

const css = readFileSync(`${root}/styles/experimental-worlds-isolated.css`, 'utf8');
assert(css.includes('@scope (:is(.experimental-worlds-view, #experimental-worlds-portal-root))'), 'private Experimental stylesheet is not scoped to its views and portal');
const app = readFileSync('app.js', 'utf8');
assert(app.includes('function teardownExperimentalWorldsRoute()'), 'host has no explicit Experimental route teardown');
assert(app.includes('window.ExperimentalWorldsDom?.clearPortal?.()'), 'host teardown does not clear Experimental portal surfaces');
assert(app.includes('isExperimentalWorldsView(state.view) && !isExperimentalWorldsView(viewName)'), 'host does not teardown Experimental surfaces on mode exit');

console.log(`Experimental portal ownership guard passed for ${customFiles.length} custom and ${globSync(`${root}/scenepulse/vendor/ScenePulse/src/**/*.js`).length} pinned source files.`);
