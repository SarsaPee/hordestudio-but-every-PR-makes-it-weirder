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
const ambientExperimentalRuntime = /\b(?:HordeSidecar(?:Hooks|Mode|Timeline|Promotion|Traversal|MemoryGraph|Reader|ReaderBackfill)|HordeRpgMechanics|worldMediaDirty|resizeWorldMessageInput|resetWorldMessageInput|setWorldMessageInputManualHeight|installWorldMessageResizeHandle)\b|(?<![.\w])switchView\s*\(/;
const hostExperienceLeak = /\bExperimentalWorldsState\.(?:characters|chats|personas|activePersonaId|activeSessionId|activeCharId|activeRoomId|rooms)\b|\bwindow\.HordeMultiplayer(?:Engine)?\b|\bgetCurrentSession\s*\(/;
const hostUtilityLeak = /(?<![\w.])(?:escapeHTML|cssUrl|displayInitials|isPlainObject|safeJsonClone|normalizePersona|personaPromptText|extractJSON|safeParseJSONRepair|normalizeUploadedImage|optimizeImage)\s*\(/;
const hostWorldFlightLeak = /(?<![.\w])(?:worldGenController|worldTurnInProgress|sidecarRetryInProgress|scenePulseReaderRefreshController)\b/;
const ambiguousWorldSubsystemLeak = /\b(?:HordeDossierClaims|HordeCanonicalImageComposer)\b/;
for (const file of ownedRuntime) {
    const source = readFileSync(file, 'utf8');
    assert(!hostStateLeak.test(source), `${file} reaches Experimental World state through the host object`);
    assert(!hostWholeSave.test(source), `${file} reaches the host whole-state writer`);
    assert(!ambientExperimentalRuntime.test(source), `${file} reaches an ambient World runtime instead of its Experimental-owned implementation or adapter`);
    assert(!hostExperienceLeak.test(source), `${file} reaches a removed host experience instead of an optional adapter capability`);
    assert(!hostUtilityLeak.test(source), `${file} reaches a host utility instead of Experimental Worlds' private compatibility copy`);
    if (!file.endsWith('/experimental-runtime-compat.js')) {
        assert(!hostWorldFlightLeak.test(source), `${file} reaches a World request flag owned by the host bootstrap instead of Experimental Worlds' runtime coordinator`);
    }
    assert(!ambiguousWorldSubsystemLeak.test(source), `${file} leaves an Experimental World subsystem under an ambient Horde-global name`);
}

const adapter = readFileSync('host-adapters/experimental-worlds/experimental-worlds-host-adapter.js', 'utf8');
assert(!forbidden.test(adapter), 'Experimental Worlds host adapter reaches stock Worlds');
assert(adapter.includes('chatMultiplayerSources') && adapter.includes('chatMemoryContext'),
    'optional Chat and Multiplayer links are declared only at the host boundary');
const html = readFileSync('index.html', 'utf8');
assert.equal((html.match(/<script[^>]+src="app\.js/g) || []).length, 1,
    'the one application document must load exactly one app bootstrap');
assert(!/location\.assign\s*\(/.test(html), 'the document must not switch application location to enter Experimental Worlds');
assert(!/<iframe\b/i.test(html), 'Experimental Worlds must not be an iframe application');
const privateRpg = html.indexOf('experiences/experimental-worlds/runtime/experimental-rpg-mechanics.js');
const privateCompat = html.indexOf('experiences/experimental-worlds/runtime/experimental-runtime-compat.js');
const privateVectorMemory = html.indexOf('experiences/experimental-worlds/runtime/experimental-vector-memory.js');
const firstExperimentalCore = html.indexOf('experiences/experimental-worlds/runtime/dossier-claims.js');
assert(privateCompat >= 0 && privateVectorMemory >= 0 && privateRpg >= 0
    && privateCompat < privateVectorMemory && privateVectorMemory < privateRpg && privateRpg < firstExperimentalCore,
    'Experimental Worlds must load its private utilities, cognition cache, and pinned RPG mechanics before dependent runtime');
const runtimeCompat = readFileSync('experiences/experimental-worlds/runtime/experimental-runtime-compat.js', 'utf8');
assert(runtimeCompat.includes('ExperimentalWorldsRuntime') && runtimeCompat.includes('abortAll'),
    'Experimental Worlds must own its generation, retry, and Reader request lifecycle');
const vectorMemory = readFileSync('experiences/experimental-worlds/runtime/experimental-vector-memory.js', 'utf8');
assert(vectorMemory.includes('experimentalVectorEmbeddingCache') && !vectorMemory.includes('HordeVectorMemory'),
    'Experimental Worlds must own a separate embedding cache rather than reaching the host cache');

console.log(`Experimental stock-removal guard passed for ${files.length} core files.`);
