const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const sourceRevision = 'checkpoint/experimental-worlds-dual-inplace-17.0';
const acceptedApp = execFileSync('git', ['show', `${sourceRevision}:app.js`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const start = acceptedApp.indexOf('// --- Portable World Presentation Media ------------------------------------');
const end = acceptedApp.indexOf('// --- DOM References ---', start);
assert(start >= 0 && end > start, 'Pass-0 visual-media source unit is present');
const acceptedUnit = acceptedApp.slice(start, end);

const relocatedPath = 'experiences/experimental-worlds/visuals/world-visual-media-core.js';
const relocated = fs.readFileSync(relocatedPath, 'utf8');
const restored = relocated
    .replace('normalizeImageGuidePresets(ExperimentalWorldsVisualMediaHost.globalSettings().imageGuidePresets)', 'normalizeImageGuidePresets(state.globalSettings.imageGuidePresets)')
    .replace('ExperimentalWorldsVisualMediaHost.markWorldMediaChanged(world);', 'if ((state.worlds || []).includes(world)) worldMediaDirty = true;')
    .replace('if (removed) ExperimentalWorldsVisualMediaHost.markWorldMediaChanged(world);', 'if (removed && (state.worlds || []).includes(world)) worldMediaDirty = true;');

assert.equal(restored.trimEnd(), acceptedUnit.trimEnd(),
    'visual/media core differs from the Pass-0 oracle only at the three explicit host seams');
assert(!relocated.includes('state.globalSettings') && !relocated.includes('state.worlds') && !relocated.includes('worldMediaDirty'),
    'relocated visual core has no direct host-state or host-writer access');

const adapter = fs.readFileSync('host-adapters/experimental-worlds/visual-media-host-adapter.js', 'utf8');
assert(adapter.includes('getGlobalSettings') && adapter.includes('markExperimentalWorldMediaChanged'),
    'adapter exports only the explicit visual settings and media-dirty bindings');
assert(!adapter.includes('state.'), 'adapter source does not reach into host state itself');

const providerStart = acceptedApp.indexOf("function worldVisualProvider(world, pipeline = 'new')");
const providerEnd = acceptedApp.indexOf("const WORLD_VISUAL_ASPECTS = new Set", providerStart);
assert(providerStart >= 0 && providerEnd > providerStart, 'Pass-0 visual provider source unit is present');
const acceptedProviderUnit = acceptedApp.slice(providerStart, providerEnd);
const relocatedProvider = fs.readFileSync('experiences/experimental-worlds/visuals/world-visual-provider-core.js', 'utf8');
assert.equal(
    relocatedProvider.replace('normalizedProviderId(ExperimentalWorldsVisualMediaHost.globalSettings().apiProvider)', 'normalizedProviderId(state.globalSettings.apiProvider)').trimEnd(),
    acceptedProviderUnit.trimEnd(),
    'visual provider core differs from the Pass-0 oracle only at the explicit effective-settings seam'
);
assert(!relocatedProvider.includes('state.globalSettings'), 'visual provider core has no direct host settings access');

const html = fs.readFileSync('index.html', 'utf8');
const adapterIndex = html.indexOf('host-adapters/experimental-worlds/visual-media-host-adapter.js');
const coreIndex = html.indexOf(relocatedPath);
const providerIndex = html.indexOf('experiences/experimental-worlds/visuals/world-visual-provider-core.js');
const appIndex = html.indexOf('src="app.js');
assert(adapterIndex >= 0 && adapterIndex < coreIndex && coreIndex < providerIndex && providerIndex < appIndex,
    'adapter and relocated core load before the single host bootstrap');

const studioStart = acceptedApp.indexOf('// --- World Engine ---');
const studioEnd = acceptedApp.indexOf('// --- World Play & Engine ---', studioStart);
assert(studioStart >= 0 && studioEnd > studioStart, 'Pass-0 World Studio source unit is present');
const relocatedStudio = fs.readFileSync('experiences/experimental-worlds/runtime/world-studio-core.js', 'utf8');
assert.equal(relocatedStudio
    .replace(`            // World recovery belongs to the Experimental authority.  Reading\n            // the host database here would make a stock-host cleanup or a\n            // future upstream store change silently break this mode.\n            const storedMedia = (await window.ExperimentalWorldsRepository?.snapshot?.())?.worldMediaAssets || {};`,
        "            const storedMedia = await HordeDB.get('worldMediaAssets') || {};")
    .trimEnd(), acceptedApp.slice(studioStart, studioEnd).trimEnd(),
    'World Studio core differs from the Pass-0 oracle beyond the explicit Experimental-repository recovery seam');
assert(!fs.readFileSync('app.js', 'utf8').includes('// --- World Engine ---'),
    'World Studio core is no longer ambiguously retained in the host bootstrap');
const studioIndex = html.indexOf('experiences/experimental-worlds/runtime/world-studio-core.js');
assert(studioIndex >= 0 && studioIndex < appIndex,
    'relocated World Studio core loads before the single host bootstrap');

const playStart = acceptedApp.indexOf('// --- World Play & Engine ---');
const playEnd = acceptedApp.indexOf('// --- Narrated outfit', playStart);
assert(playStart >= 0 && playEnd > playStart, 'Pass-0 World Play source unit is present');
const relocatedPlay = fs.readFileSync('experiences/experimental-worlds/runtime/world-play-core.js', 'utf8');
assert.equal(relocatedPlay
    .replace('window.ExperimentalWorldsHost?.listStockMultiplayerSources?.() || []', 'window.StockWorlds17Pass0?.listMultiplayerSources?.() || []')
    .replace('window.ExperimentalWorldsHost?.currentStockMultiplayerContext?.()', 'window.StockWorlds17Pass0?.currentMultiplayerContext?.()')
    .replace('window.ExperimentalWorldsHost?.stockMultiplayerCampaignTemplate?.(context)', 'window.StockWorlds17Pass0?.multiplayerCampaignTemplate?.(context)').trimEnd(), acceptedApp.slice(playStart, playEnd).trimEnd(),
    'World Play core differs from the Pass-0 oracle beyond the explicit host multiplayer contract');
assert(!fs.readFileSync('app.js', 'utf8').includes('// --- World Play & Engine ---'),
    'World Play core is no longer ambiguously retained in the host bootstrap');
const playIndex = html.indexOf('experiences/experimental-worlds/runtime/world-play-core.js');
assert(playIndex >= 0 && playIndex < appIndex,
    'relocated World Play core loads before the single host bootstrap');

const sessionStart = acceptedApp.indexOf('// --- Narrated outfit');
const sessionEnd = acceptedApp.indexOf('// --- World Agent', sessionStart);
assert(sessionStart >= 0 && sessionEnd > sessionStart, 'Pass-0 World session source unit is present');
const relocatedSession = fs.readFileSync('experiences/experimental-worlds/runtime/world-session-core.js', 'utf8');
assert.equal(relocatedSession.trimEnd(), acceptedApp.slice(sessionStart, sessionEnd).trimEnd(),
    'World session core differs from the Pass-0 oracle');
assert(!fs.readFileSync('app.js', 'utf8').includes('// --- Narrated outfit'),
    'World session core is no longer ambiguously retained in the host bootstrap');
const sessionIndex = html.indexOf('experiences/experimental-worlds/runtime/world-session-core.js');
assert(sessionIndex >= 0 && sessionIndex < appIndex,
    'relocated World session core loads before the single host bootstrap');

const intelligenceStart = acceptedApp.indexOf('// --- World Agent');
const intelligenceEnd = acceptedApp.indexOf('// --- Data model', intelligenceStart);
assert(intelligenceStart >= 0 && intelligenceEnd > intelligenceStart, 'Pass-0 World intelligence source unit is present');
const relocatedIntelligence = fs.readFileSync('experiences/experimental-worlds/runtime/world-intelligence-core.js', 'utf8');
assert.equal(relocatedIntelligence
    .replace('await window.ExperimentalWorldsHost?.persistSharedContinuities?.(state.chatContinuities);', "await HordeDB.set('chatContinuities', state.chatContinuities);")
    .trimEnd(), acceptedApp.slice(intelligenceStart, intelligenceEnd).trimEnd(),
    'World intelligence core differs from the Pass-0 oracle beyond the explicit shared-continuity host seam');
assert(!fs.readFileSync('app.js', 'utf8').includes('// --- World Agent'),
    'World intelligence core is no longer ambiguously retained in the host bootstrap');
const intelligenceIndex = html.indexOf('experiences/experimental-worlds/runtime/world-intelligence-core.js');
assert(intelligenceIndex >= 0 && intelligenceIndex < appIndex,
    'relocated World intelligence core loads before the single host bootstrap');

const acceptedStyle = execFileSync('git', ['show', `${sourceRevision}:style.css`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const visualStyleStart = acceptedStyle.lastIndexOf('/* ─── WORLD ENGINE ─── */');
const visualStyleEnd = acceptedStyle.indexOf('/* ScenePulse-inspired in-place Scene Intelligence Workspace.', visualStyleStart);
assert(visualStyleStart >= 0 && visualStyleEnd > visualStyleStart, 'Pass-0 visual/Sidecar stylesheet source unit is present');
const relocatedVisualStyles = fs.readFileSync('experiences/experimental-worlds/styles/world-visuals-and-sidecar.css', 'utf8');
assert.equal(relocatedVisualStyles.trimEnd(), acceptedStyle.slice(visualStyleStart, visualStyleEnd).trimEnd(),
    'visual, outfit, Scene Inspector and Sidecar styles differ from the Pass-0 oracle');
assert(html.includes('experiences/experimental-worlds/styles/world-visuals-and-sidecar.css'),
    'relocated visual and Sidecar stylesheet is registered by the same document');

const visualEditorStart = acceptedApp.indexOf('const WORLD_VISUAL_ASPECTS');
const visualEditorEnd = acceptedApp.indexOf('// --- Voice notes and calls', visualEditorStart);
assert(visualEditorStart >= 0 && visualEditorEnd > visualEditorStart, 'Pass-0 visual editor source unit is present');
const relocatedVisualEditor = fs.readFileSync('experiences/experimental-worlds/visuals/world-visual-editor-core.js', 'utf8');
assert.equal(relocatedVisualEditor.trimEnd(), acceptedApp.slice(visualEditorStart, visualEditorEnd).trimEnd(),
    'visual editor core differs from the Pass-0 oracle');
assert(!fs.readFileSync('app.js', 'utf8').includes('const WORLD_VISUAL_ASPECTS'),
    'visual editor core is no longer ambiguously retained in the host bootstrap');
const visualEditorIndex = html.indexOf('experiences/experimental-worlds/visuals/world-visual-editor-core.js');
assert(visualEditorIndex >= 0 && visualEditorIndex < appIndex,
    'relocated visual editor core loads before the single host bootstrap');

const protocolStart = acceptedApp.indexOf('function normalizeWorldTurnReceipt');
const protocolEnd = acceptedApp.indexOf('async function impersonateUser()', protocolStart);
assert(protocolStart >= 0 && protocolEnd > protocolStart, 'Pass-0 Sidecar/ScenePulse protocol source unit is present');
const relocatedProtocol = fs.readFileSync('experiences/experimental-worlds/runtime/world-protocol-core.js', 'utf8');
assert.equal(relocatedProtocol.trimEnd(), acceptedApp.slice(protocolStart, protocolEnd).trimEnd(),
    'Sidecar/ScenePulse protocol core differs from the Pass-0 oracle');
assert(!fs.readFileSync('app.js', 'utf8').includes('function normalizeWorldTurnReceipt'),
    'Sidecar/ScenePulse protocol core is no longer ambiguously retained in the host bootstrap');
const protocolIndex = html.indexOf('experiences/experimental-worlds/runtime/world-protocol-core.js');
const sidecarIndex = html.indexOf('experiences/experimental-worlds/runtime/sidecar-core.js');
assert(protocolIndex >= 0 && protocolIndex < sidecarIndex && sidecarIndex < appIndex,
    'relocated Sidecar/ScenePulse protocol loads before the Sidecar bridge and single host bootstrap');

console.log('Pass-1 visual/media relocation audit passed.');
