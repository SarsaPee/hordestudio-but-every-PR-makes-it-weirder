#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    createExperimentalWorldsCoreRuntime,
    EXPERIMENTAL_WORLDS_CORE_SOURCES
} from '../experiences/experimental-worlds/experimental-worlds-core.generated.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatedCorePath = resolve(root, 'experiences/experimental-worlds/experimental-worlds-core.generated.mjs');
const modePath = resolve(root, 'host-adapters/experimental-worlds/experimental-worlds-mode.js');
const generatedScenePulseRoot = resolve(root, 'experiences/experimental-worlds/scenepulse/generated/ScenePulse/src');
const generatedCore = readFileSync(generatedCorePath, 'utf8');
const modeSource = readFileSync(modePath, 'utf8');

const emptyElement = Object.freeze({
    classList: Object.freeze({ add() {}, remove() {}, toggle() {} }),
    dataset: Object.freeze({}),
    style: Object.freeze({ setProperty() {}, removeProperty() {} }),
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    replaceChildren() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    setAttribute() {},
    contains: () => false
});
const documentFacade = Object.freeze({
    body: emptyElement,
    head: emptyElement,
    documentElement: emptyElement,
    activeElement: null,
    createElement: () => ({ ...emptyElement }),
    createElementNS: () => ({ ...emptyElement }),
    createDocumentFragment: () => ({ appendChild() {} }),
    createRange: () => ({}),
    createTreeWalker: () => ({}),
    getAnimations: () => [],
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {}
});
const noopObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};
const storage = Object.freeze({ length: 0, key: () => null, getItem: () => null, setItem() {}, removeItem() {}, clear() {} });
const platformWindow = Object.freeze({
    addEventListener() {},
    removeEventListener() {},
    getSelection: () => null,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
});
const beforeGlobals = new Set(Object.getOwnPropertyNames(globalThis));
const core = createExperimentalWorldsCoreRuntime({
    window: platformWindow,
    document: documentFacade,
    fetch: async () => new Response('{}', { status: 200 }),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: callback => setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: clearTimeout,
    queueMicrotask,
    MutationObserver: noopObserver,
    ResizeObserver: noopObserver,
    IntersectionObserver: noopObserver,
    URL: Object.freeze({ createObjectURL: () => 'blob:test', revokeObjectURL() {} }),
    URLConstructor: URL,
    localStorage: storage,
    navigator: Object.freeze({}),
    confirm: () => false,
    prompt: () => null,
    services: Object.freeze({}),
    repository: Object.freeze({}),
    bindVendorContext: () => () => {},
    restoreGeneration: () => 0,
    abortOwnedOperations() {}
});
const afterGlobals = Object.getOwnPropertyNames(globalThis).filter(name => !beforeGlobals.has(name));

assert.deepEqual(Object.keys(core).sort(), [
    'abortOwnedOperations', 'activate', 'captureWorkspace', 'deactivate',
    'initialize', 'persist', 'restoreWorkspace', 'snapshot'
].sort());
assert.equal(EXPERIMENTAL_WORLDS_CORE_SOURCES.length, 18);
assert.deepEqual(afterGlobals, [], `core factory leaked browser globals: ${afterGlobals.join(', ')}`);
assert.match(generatedCore, /scenepulse\/generated\/ScenePulse\/src/);
assert.doesNotMatch(generatedCore, /\n\s*setupMultiplayerHub\(\);/);
assert.match(modeSource, /async function deactivate\(\{ persist = true \} = \{\}\)/);
assert.match(modeSource, /if \(persist\) \{\s*try \{\s*await state\.core\?\.persist\?\.\('workspace-deactivate'\)/s);
assert.equal(
    [...modeSource.matchAll(/destination\.appendChild\(ledger\.patchElement\(element\)\)/g)].length,
    1,
    'shell nodes must be appended exactly once'
);

function allFiles(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = resolve(directory, entry.name);
        return entry.isDirectory() ? allFiles(path) : [path];
    });
}
const generatedModules = allFiles(generatedScenePulseRoot).filter(path => /\.(?:m?js)$/i.test(path));
assert.equal(generatedModules.length, 77);
generatedModules.forEach(path => {
    const source = readFileSync(path, 'utf8');
    assert.match(source, /^import \{ experimentalWorldsVendorGlobals as __experimentalWorldsVendorGlobals \}/);
    assert.doesNotMatch(source, /import\(['"]\/(?:scripts\/chat|script)\.js['"]\)/);
});

console.log(`Experimental module boundary verified: ${EXPERIMENTAL_WORLDS_CORE_SOURCES.length} private core units, ${generatedModules.length} scoped ScenePulse modules, zero new globals.`);
