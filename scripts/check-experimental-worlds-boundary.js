#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const upstream = process.argv[2] || '520aa2155b02289f9db1c6740a48e494124d2cca';
const allowed = new Set([
    'app.js', 'index.html', 'horde_mcp_bridge.py',
    'scripts/build-portable.sh', 'scripts/migrate-experimental-worlds-mirror.py',
    'docs/experimental-worlds/UPSTREAM_UPDATE.md', 'docs/experimental-worlds/OWNERSHIP.md',
    'docs/experimental-worlds/PROGRESS.md', 'docs/experimental-worlds/CODEX_EXPERIMENTAL_WORLDS_SPLIT.md',
    'docs/experimental-worlds/CODEX_ONE_APP_EXPERIMENTAL_WORLDS.md', 'docs/experimental-worlds/CUSTOMIZATION_INVENTORY.md',
    'docs/experimental-worlds/ACCEPTANCE_LEDGER.md', 'docs/experimental-worlds/ONE_APP_ACCEPTANCE_LEDGER.md', 'docs/experimental-worlds/MIRROR_AUDIT.md',
    'scratch/experimental_worlds_mirror_migration_audit.py', 'scratch/experimental-worlds-acceptance-mock.py',
    'scratch/cross_mode_deletion_browser_acceptance.js', 'scratch/f16_portrait_browser_acceptance.js',
    'scratch/late_response_world_switch_browser_acceptance.js', 'scratch/temporal_reroll_browser_acceptance.js',
    'scripts/check-experimental-worlds-boundary.js',
]);
const required = [
    'experiences/experimental-worlds/manifest.json',
    'experiences/experimental-worlds/bootstrap.js',
    'experiences/experimental-worlds/entry.js',
    'experiences/experimental-worlds/persistence/repository.js',
    'host-adapters/experimental-worlds.js',
    'shared/global-backup-coordinator.js',
    // The old runtime is retained for source comparison and rollback only.
    'experiences/experimental-worlds/runtime/index.html',
];
for (const file of required) {
    if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing Experimental Worlds runtime file: ${file}`);
}
const output = execFileSync('git', ['diff', '--name-only', upstream, 'HEAD'], { cwd: root, encoding: 'utf8' });
const unexpected = output.trim().split('\n').filter(Boolean)
    // A deleted retired workaround is not an executable host seam.
    .filter(file => fs.existsSync(path.join(root, file)))
    .filter(file => !file.startsWith('experiences/experimental-worlds/') && !file.startsWith('host-adapters/') && !file.startsWith('shared/') && !allowed.has(file));
if (unexpected.length) throw new Error(`Unexpected host changes since ${upstream}:\n${unexpected.join('\n')}`);
const checkedFiles = ['index.html', 'horde_mcp_bridge.py', 'scripts/build-portable.sh', 'experiences/experimental-worlds/entry.js']
    .map(file => ({ file, text: fs.readFileSync(path.join(root, file), 'utf8') }));
for (const { file, text } of checkedFiles) {
    if (/location\.assign\([^)]*localhost|serve_experimental_worlds_file|is_experimental_worlds_host/.test(text)) {
        throw new Error(`Retired dual-origin runtime path remains executable in ${file}.`);
    }
    if (file !== 'scripts/build-portable.sh' && /experimental-worlds\/runtime\/(?:app|index|style)\.js?/.test(text)) {
        throw new Error(`Native mode imports the preserved full runtime from ${file}.`);
    }
}
console.log(`Experimental Worlds boundary check passed against ${upstream}.`);
