#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const upstream = process.argv[2] || '520aa2155b02289f9db1c6740a48e494124d2cca';
const allowed = new Set([
    'app.js', 'index.html', 'horde_mcp_bridge.py', 'experimental-worlds-navigation.js',
    'scripts/build-portable.sh', 'scripts/migrate-experimental-worlds-mirror.py',
    'docs/experimental-worlds/UPSTREAM_UPDATE.md', 'docs/experimental-worlds/OWNERSHIP.md',
    'docs/experimental-worlds/PROGRESS.md', 'docs/experimental-worlds/CODEX_EXPERIMENTAL_WORLDS_SPLIT.md',
    'docs/experimental-worlds/ACCEPTANCE_LEDGER.md', 'docs/experimental-worlds/MIRROR_AUDIT.md',
    'scratch/experimental_worlds_mirror_migration_audit.py', 'scratch/experimental-worlds-acceptance-mock.py',
    'scripts/check-experimental-worlds-boundary.js',
]);
const required = [
    'experiences/experimental-worlds/manifest.json',
    'experiences/experimental-worlds/runtime/index.html',
    'experiences/experimental-worlds/runtime/app.js',
    'experiences/experimental-worlds/runtime/style.css',
    'experiences/experimental-worlds/runtime/scenepulse/horde/scenepulse-source-runtime.js',
];
for (const file of required) {
    if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing Experimental Worlds runtime file: ${file}`);
}
const output = execFileSync('git', ['diff', '--name-only', upstream, 'HEAD'], { cwd: root, encoding: 'utf8' });
const unexpected = output.trim().split('\n').filter(Boolean).filter(file => !file.startsWith('experiences/experimental-worlds/') && !allowed.has(file));
if (unexpected.length) throw new Error(`Unexpected host changes since ${upstream}:\n${unexpected.join('\n')}`);
console.log(`Experimental Worlds boundary check passed against ${upstream}.`);
