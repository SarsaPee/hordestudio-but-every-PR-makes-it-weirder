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

const adapter = readFileSync('host-adapters/experimental-worlds/experimental-worlds-host-adapter.js', 'utf8');
assert(!forbidden.test(adapter), 'Experimental Worlds host adapter reaches stock Worlds');
const html = readFileSync('index.html', 'utf8');
assert.equal((html.match(/<script[^>]+src="app\.js/g) || []).length, 1,
    'the one application document must load exactly one app bootstrap');
assert(!/location\.assign\s*\(/.test(html), 'the document must not switch application location to enter Experimental Worlds');
assert(!/<iframe\b/i.test(html), 'Experimental Worlds must not be an iframe application');

console.log(`Experimental stock-removal guard passed for ${files.length} core files.`);
