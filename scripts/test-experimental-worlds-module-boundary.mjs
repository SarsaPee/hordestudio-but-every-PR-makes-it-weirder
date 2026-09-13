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
assert.equal(EXPERIMENTAL_WORLDS_CORE_SOURCES.length, 20);
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

// No Experimental unit may resolve a call into the 17.4 host script.  A free
// identifier that app.js also defines is an ambient host reference: outside a
// browser it throws, inside one it silently runs stock host code against
// Experimental data.  This static gate covers that isolation defect class.
{
    const appSource = readFileSync(resolve(root, 'app.js'), 'utf8');
    const appDefined = new Set();
    for (const m of appSource.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) appDefined.add(m[1]);
    for (const m of appSource.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) appDefined.add(m[1]);

    const moduleDefined = new Set();
    for (const m of generatedCore.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) moduleDefined.add(m[1]);
    for (const m of generatedCore.matchAll(/\b(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) moduleDefined.add(m[1]);
    for (const m of generatedCore.matchAll(/\bimport\s*\{([^}]+)\}/g)) {
        for (const part of m[1].split(',')) {
            const name = part.trim().split(/\s+as\s+/).pop().trim();
            if (name) moduleDefined.add(name);
        }
    }
    // Approximate the remaining binding positions (function/arrow parameters,
    // catch bindings, for-of heads, object-method shorthand) so local helper
    // names are not mistaken for host references.
    const collectParams = (text) => {
        for (const part of text.split(',')) {
            const name = part.trim().split(/[:=]/)[0].replace(/^[.{[\s]+/, '').replace(/[\s}\]]+$/, '');
            if (/^[A-Za-z_$][\w$]*$/.test(name)) moduleDefined.add(name);
        }
    };
    for (const m of generatedCore.matchAll(/function\s+[A-Za-z_$][\w$]*\s*\(([^)]*)\)/g)) collectParams(m[1]);
    for (const m of generatedCore.matchAll(/\(([^()]*)\)\s*=>/g)) collectParams(m[1]);
    for (const m of generatedCore.matchAll(/(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)) moduleDefined.add(m[1]);
    for (const m of generatedCore.matchAll(/\bfor\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) moduleDefined.add(m[1]);
    for (const m of generatedCore.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)) moduleDefined.add(m[1]);

    // Scan call positions with a small line lexer: strings, template prose
    // and comments are skipped in one left-to-right pass, so an apostrophe in
    // template prose can never swallow a backtick and corrupt template
    // parity.  Regex literals containing quotes and ${...} interpolations
    // inside templates are not scanned (documented approximation).
    const JAVASCRIPT_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'typeof', 'new', 'delete', 'in', 'of', 'do', 'else', 'await', 'async', 'with', 'yield', 'void', 'instanceof', 'case', 'try', 'finally', 'throw', 'class', 'extends', 'super', 'this']);
    let inBlockComment = false;
    let inTemplate = false;
    let currentLine = 0;
    const ambientHostReferences = new Map();
    const scanCalls = (code) => {
        for (const m of code.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
            const name = m[1];
            if (JAVASCRIPT_KEYWORDS.has(name) || moduleDefined.has(name) || !appDefined.has(name)) continue;
            if (!ambientHostReferences.has(name)) ambientHostReferences.set(name, []);
            ambientHostReferences.get(name).push(currentLine);
        }
    };
    for (const rawLine of generatedCore.split('\n')) {
        currentLine += 1;
        let index = 0;
        let state = inTemplate ? 'template' : (inBlockComment ? 'block' : 'code');
        if (state === 'block') {
            const close = rawLine.indexOf('*/');
            if (close === -1) continue;
            index = close + 2;
            state = 'code';
            inBlockComment = false;
        }
        let code = '';
        let segment = '';
        for (; index < rawLine.length; index++) {
            const ch = rawLine[index];
            const next = rawLine[index + 1];
            if (state === 'code') {
                if (ch === "'") { code += segment; segment = ''; state = 'single'; continue; }
                if (ch === '"') { code += segment; segment = ''; state = 'double'; continue; }
                if (ch === '`') { code += segment; segment = ''; state = 'template'; inTemplate = true; continue; }
                if (ch === '/' && next === '/') break;              // line comment: rest of line skipped
                if (ch === '/' && next === '*') {
                    code += segment; segment = '';
                    const close = rawLine.indexOf('*/', index + 2);
                    if (close === -1) { inBlockComment = true; break; }
                    index = close + 1;
                    continue;
                }
                segment += ch;
            } else if (state === 'single') {
                if (ch === '\\') index += 1;
                else if (ch === "'") state = 'code';
            } else if (state === 'double') {
                if (ch === '\\') index += 1;
                else if (ch === '"') state = 'code';
            } else if (state === 'template') {
                if (ch === '\\') index += 1;
                else if (ch === '`') { state = 'code'; inTemplate = false; }
            }
        }
        if (state === 'code') code += segment;
        scanCalls(code);
    }
    assert.deepEqual([...ambientHostReferences.keys()].sort(), [],
        `Experimental module still resolves calls into the host script: ${[...ambientHostReferences.entries()].map(([name, lines]) => `${name}@${lines.slice(0, 3).join(',')}`).join(', ')}`);
}

console.log(`Experimental module boundary verified: ${EXPERIMENTAL_WORLDS_CORE_SOURCES.length} private core units, ${generatedModules.length} scoped ScenePulse modules, zero new globals.`);
