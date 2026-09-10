#!/usr/bin/env node
// Pass-1 static guard: the Experimental core must remain usable if the stock
// Worlds package is removed. Runtime browser proof is recorded separately;
// this catches accidental source-level coupling before it reaches that gate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifestPath = 'docs/experimental-worlds/experimental-core-manifest.txt';
const files = readFileSync(manifestPath, 'utf8').split('\n')
    .map(line => line.trim()).filter(line => line && !line.startsWith('#'));
const forbidden = /StockWorlds17Pass0|stock-worlds-17-pass0|HordeStudioStockWorlds17Pass0DB/;
for (const file of files) {
    const source = readFileSync(file, 'utf8');
    assert(!forbidden.test(source), `${file} imports, names, or depends on the stock Worlds runtime`);
}

// The permanent split is stronger than removing the stock package: the
// relocated runtime must not fall back to the host whole-state writer or its
// active World fields.  Shared settings/provider/media services are allowed
// only through ExperimentalWorldsHost and ExperimentalWorldsState.
const ownedRuntime = files.filter(file => /\/(?:runtime|visuals|mechanics)\//.test(file));
const hostStateLeak = /\bstate\.(?:worlds|worldInstances|activeWorldId|worldRecoverySnapshots|editingWorld|lastWorldStudioId|lastWorldStudioTab)\b/;
const hostWholeSave = /\bsaveState\s*\(/;
const ambientExperimentalRuntime = /\b(?:HordeSidecar(?:Hooks|Mode|Timeline|Promotion|Traversal|MemoryGraph|Reader|ReaderBackfill)|HordeRpgMechanics|worldMediaDirty)\b|(?<![.\w])switchView\s*\(/;
for (const file of ownedRuntime) {
    const source = readFileSync(file, 'utf8');
    assert(!hostStateLeak.test(source), `${file} reaches Experimental World state through the host object`);
    assert(!hostWholeSave.test(source), `${file} reaches the host whole-state writer`);
    assert(!ambientExperimentalRuntime.test(source), `${file} reaches an ambient World runtime instead of its Experimental-owned implementation or adapter`);
}

const adapter = readFileSync('host-adapters/experimental-worlds/experimental-worlds-host-adapter.js', 'utf8');
assert(!forbidden.test(adapter), 'Experimental Worlds host adapter reaches stock Worlds');
const html = readFileSync('index.html', 'utf8');
assert.equal((html.match(/<script[^>]+src="app\.js/g) || []).length, 1,
    'the one application document must load exactly one app bootstrap');
assert(!/location\.assign\s*\(/.test(html), 'the document must not switch application location to enter Experimental Worlds');
assert(!/<iframe\b/i.test(html), 'Experimental Worlds must not be an iframe application');
const privateRpg = html.indexOf('experiences/experimental-worlds/runtime/experimental-rpg-mechanics.js');
const firstExperimentalCore = html.indexOf('experiences/experimental-worlds/runtime/dossier-claims.js');
assert(privateRpg >= 0 && privateRpg < firstExperimentalCore,
    'Experimental Worlds must load its pinned RPG mechanics before its dependent runtime');

console.log(`Experimental stock-removal guard passed for ${files.length} core files.`);
