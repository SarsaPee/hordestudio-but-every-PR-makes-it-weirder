#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, '..');
const sourceRoot = path.resolve(process.argv[2] || path.join(repositoryRoot, '..', 'hordestudio-17.0.0'));
const committedRoot = path.join(repositoryRoot, 'experiences', 'stock-worlds-17-pass0');
const generatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'horde-stock-worlds-pass0-'));
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

try {
    const build = spawnSync(process.execPath, [
        '--expose-internals',
        path.join(scriptDir, 'build-stock-worlds-pass0.mjs'),
        sourceRoot,
        generatedRoot
    ], { encoding: 'utf8' });
    if (build.status !== 0) {
        process.stderr.write(build.stderr || build.stdout);
        process.exit(build.status || 1);
    }

    const files = ['runtime.js', 'style.css', 'source-map.json'];
    for (const file of files) {
        const expected = fs.readFileSync(path.join(committedRoot, file));
        const generated = fs.readFileSync(path.join(generatedRoot, file));
        if (!expected.equals(generated)) {
            throw new Error(`${file} is not reproducible from the pristine local 17.0 source `
                + `(committed ${sha256(expected)}, generated ${sha256(generated)})`);
        }
    }

    const runtime = fs.readFileSync(path.join(committedRoot, 'runtime.js'), 'utf8');
    const required = [
        "const DB_NAME = 'HordeStudioStockWorlds17Pass0DB';",
        'function setupWorldsLogic(',
        'function setupWorldStudioLogic(',
        'function setupWorldPlayLogic(',
        'function setupPresetEditor(',
        'function renderPresetEditor(',
        'function setupCatalogModelSearchFields(',
        'function setupSearchableDropdown(',
        'const HordeVectorMemory = {',
        'async function ready(',
        'function listMultiplayerSources(',
        'async function purgeState(',
        "domainLabel: 'Worlds'",
        "sourceKey: 'stock-worlds-17-pass0:' + world.id",
        "template.source.domainLabel = 'Worlds'",
        'id="world-record-overlay"',
        'id="world-record-close"',
        'id="world-record-done"',
        'id="world-session-zero-overlay"'
    ];
    required.forEach(token => {
        if (!runtime.includes(token)) throw new Error(`Generated runtime is missing required pristine unit: ${token}`);
    });
    const forbidden = [
        "const DB_NAME = 'HordeStudioDB';",
        'function init()',
        'function setupMultiplayerHub(',
        'function setupChatLogic(',
        'function setupCompanionsLogic(',
        'state.chatContinuities',
        'state.editingChar',
        'state.activeCharId',
        'state.activeRoomId',
        'id="world-multiplayer-overlay"',
        'location.assign(',
        '<iframe'
    ];
    forbidden.forEach(token => {
        if (runtime.includes(token)) throw new Error(`Generated runtime contains forbidden host/bootstrap material: ${token}`);
    });

    const sourceMap = JSON.parse(fs.readFileSync(path.join(committedRoot, 'source-map.json'), 'utf8'));
    const adaptedNames = new Set((sourceMap.adaptedUnits || []).map(unit => unit.name));
    [
        'setupAIBuilderLogic', 'setupConfigSearchableDropdown', 'summarizeStory',
        'invalidateEpisodicFrom', 'consolidateSessionEpisodicMemoryRun',
        'setupVectorMemoryViewerEvents', 'renderVectorMemoryList',
        'multiplayerCurrentSession', 'buildWorldMultiplayerSnapshot',
        'buildMultiplayerCampaignTemplate', 'setupCatalogModelSearchFields',
        'setupPresetEditor', 'renderPresetEditor'
    ].forEach(name => {
        if (!adaptedNames.has(name)) throw new Error(`Source map is missing adapted pristine unit: ${name}`);
    });

    console.log(JSON.stringify({
        ok: true,
        sourceRoot: path.basename(sourceRoot),
        runtimeSha256: sha256(fs.readFileSync(path.join(committedRoot, 'runtime.js'))),
        styleSha256: sha256(fs.readFileSync(path.join(committedRoot, 'style.css'))),
        sourceMapSha256: sha256(fs.readFileSync(path.join(committedRoot, 'source-map.json')))
    }, null, 2));
} finally {
    fs.rmSync(generatedRoot, { recursive: true, force: true });
}
