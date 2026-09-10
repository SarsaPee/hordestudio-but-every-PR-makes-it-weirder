/**
 * Pass-1 boundary check: stock Worlds remains a reproducible 17.0 import;
 * global backup staging belongs to the one host coordinator.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const stock = fs.readFileSync(path.join(root, 'experiences', 'stock-worlds-17-pass0', 'runtime.js'), 'utf8');

assert.doesNotMatch(stock, /function stageRestore\(|function applyStagedRestore\(|function recoverInterruptedRestore\(/,
    'the clean stock runtime must not acquire host recovery semantics');
assert.match(stock, /async function exportState\(/);
assert.match(stock, /async function importState\(/);

assert.match(app, /async function stageStockWorldsPass0Restore\([\s\S]*?stock\.exportState\([\s\S]*?HordeDB\.setMultiple/,
    'the host must capture the stock preimage before staging');
assert.match(app, /async function applyStagedStockWorldsPass0Restore\([\s\S]*?stock\.importState\([\s\S]*?stock\.exportState\(/,
    'the host must apply and read back the stock partition through its explicit contract');
assert.match(app, /const interruptedStockRestore = await recoverInterruptedStockWorldsPass0Restore\(\)/,
    'startup must replay only a verified host-owned stock restore stage');
assert.match(app, /await stageStockWorldsPass0Restore\(stockSnapshot\)[\s\S]*?await applyStagedStockWorldsPass0Restore\(\)/,
    'full backup restore must stage before it applies the stock partition');

console.log('✓ stock runtime remains exact; host coordinates its recovery stage');
