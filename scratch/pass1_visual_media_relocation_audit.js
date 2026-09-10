const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const sourceRevision = 'checkpoint/experimental-worlds-dual-inplace-17.0';
const acceptedApp = execFileSync('git', ['show', `${sourceRevision}:app.js`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const start = acceptedApp.indexOf('// --- Portable World Presentation Media ------------------------------------');
const end = acceptedApp.indexOf('// --- DOM References ---', start);
assert(start >= 0 && end > start, 'Pass-0 visual-media source unit is present');
const acceptedUnit = acceptedApp.slice(start, end);

// The core remains source-faithful, but its old ambient host calls are now
// explicit adapter calls.  Reconstitute only those call spellings when
// comparing it to the Pass-0 behavioral oracle; this does not hide a changed
// World reducer, prompt, renderer, or schema body.
const restoreHostContract = source => [
    ['experimentalIsPlainObject', 'isPlainObject'],
    ['experimentalSafeJsonClone', 'safeJsonClone'],
    ['experimentalEscapeHTML', 'escapeHTML'],
    ['experimentalCssUrl', 'cssUrl'],
    ['experimentalCssColor', 'cssColor'],
    ['experimentalParseHordeMarkdown', 'parseHordeMarkdown'],
    ['experimentalSetSearchOpen', 'setCompanionSearchOpen'],
    ['experimentalRenderSearchResults', 'renderCompanionSearchResults'],
    ['experimentalDisplayInitials', 'displayInitials'],
    ['experimentalNormalizePersona', 'normalizePersona'],
    ['experimentalPersonaPromptText', 'personaPromptText'],
    ['experimentalExtractJSON', 'extractJSON'],
    ['experimentalSafeParseJSONRepair', 'safeParseJSONRepair'],
    ['experimentalNormalizeUploadedImage', 'normalizeUploadedImage'],
    ['experimentalOptimizeImage', 'optimizeImage'],
    ['ExperimentalWorldsHost.navigate', 'switchView'],
    ['ExperimentalWorldsHost.markMediaChanged()', 'worldMediaDirty = true'],
    ['ExperimentalWorldsHost.mediaDirty()', 'worldMediaDirty'],
    ['ExperimentalWorldsHost.restoreMediaDirty', 'restoreWorldMediaDirty'],
    ['resizeExperimentalWorldMessageInput', 'resizeWorldMessageInput'],
    ['resetExperimentalWorldMessageInput', 'resetWorldMessageInput'],
    ['setExperimentalWorldMessageInputManualHeight', 'setWorldMessageInputManualHeight'],
    ['installExperimentalWorldMessageResizeHandle', 'installWorldMessageResizeHandle'],
    ['ExperimentalWorldsHost.notify', 'showToast'],
    ['ExperimentalWorldsHost.confirmModal', 'showConfirmModal'],
    ['ExperimentalWorldsHost.apiBase', 'apiBase'],
    ['ExperimentalWorldsHost.authHeaders', 'authHeaders'],
    ['ExperimentalWorldsHost.attributionHeaders', 'attributionHeaders'],
    ['ExperimentalWorldsHost.hasApiCredentials', 'hasApiCredentials'],
    ['ExperimentalWorldsHost.isLocalProvider', 'isLocalProvider'],
    ['ExperimentalWorldsHost.cloudProviderName', 'cloudProviderName'],
    ['ExperimentalWorldsHost.normalizedProviderId', 'normalizedProviderId'],
    ['ExperimentalWorldsHost.providerApiBase', 'providerApiBase'],
    ['ExperimentalWorldsHost.providerAuthHeaders', 'providerAuthHeaders'],
    ['ExperimentalWorldsHost.providerAttributionHeaders', 'providerAttributionHeaders'],
    ['ExperimentalWorldsHost.providerHasCredentials', 'providerHasCredentials'],
    ['ExperimentalWorldsHost.providerDisplayName', 'providerDisplayName'],
    ['ExperimentalWorldsHost.applyOpenRouterRouting', 'applyOpenRouterRouting'],
    ['ExperimentalWorldsHost.sanitizeMessagesForProvider', 'sanitizeMessagesForProvider'],
    ['ExperimentalWorldsHost.humanizeApiError', 'humanizeApiError'],
    ['ExperimentalWorldsHost.localGenerationIdleTimeoutMs', 'localGenerationIdleTimeoutMs'],
    ['ExperimentalWorldsHost.cloudGenerationIdleTimeoutMs', 'cloudGenerationIdleTimeoutMs'],
    ['ExperimentalWorldsHost.applyRegexScripts', 'applyRegexScripts'],
    ['ExperimentalWorldsHost.replaceMacros', 'replaceMacros'],
    ['ExperimentalWorldsHost.getAllPresets', 'getAllPresets'],
    ['ExperimentalWorldsHost.isPresetPromptEnabled', 'isPresetPromptEnabled'],
    ['ExperimentalWorldsHost.getOrderedPresetPrompts', 'getOrderedPresetPrompts'],
    ['ExperimentalWorldsHost.getEmbedding', 'getEmbedding'],
    ['ExperimentalWorldsHost.persistSharedSettings', 'persistGlobalSettingsOnly'],
    ['ExperimentalWorldsHost.ensureSharedLibraryFresh', 'ensureSharedLibraryFreshForGeneration'],
    ['ExperimentalWorldsHost.recordSharedLibraryAssistantTurn', 'recordSharedLibraryAssistantTurn'],
    ['ExperimentalWorldsVisualMediaHost.imageModelFallback', 'companionImageModelFallback'],
    ['ExperimentalWorldsVisualMediaHost.normalizeGeneratedImageSource', 'normalizeGeneratedImageSource'],
    ['ExperimentalWorldsVisualMediaHost.stabilizeGeneratedImageSource', 'stabilizeGeneratedImageSource'],
    ['ExperimentalWorldsVisualMediaHost.getImageOutputModels', 'getCompanionOutputModels'],
    ['ExperimentalWorldsVisualMediaHost.rankImageModels', 'rankCompanionImageModels'],
    ['ExperimentalWorldsVisualMediaHost.imageModelInfo', 'companionImageModelInfo'],
    ['ExperimentalWorldsVisualMediaHost.getImageEndpoints', 'getCompanionImageEndpoints'],
    ['ExperimentalWorldsVisualMediaHost.chooseImageEndpoint', 'chooseCompanionImageEndpoint'],
    ['ExperimentalWorldsVisualMediaHost.imageCapabilities', 'companionImageCapabilities'],
    ['ExperimentalWorldsVisualMediaHost.applyImageParameters', 'applyCompanionImageParameters'],
    ['ExperimentalWorldsHost.labsProposal', 'labsProposal'],
    ['ExperimentalWorldsHost.labsAvailable', 'window.HordeLabs'],
    ['ExperimentalWorldsHost.sharedPersonas()', 'state.personas'],
    ['ExperimentalWorldsRuntime.turnInProgress()', 'worldTurnInProgress'],
    ['ExperimentalWorldsRuntime.setTurnInProgress(true)', 'worldTurnInProgress = true'],
    ['ExperimentalWorldsRuntime.setTurnInProgress(false)', 'worldTurnInProgress = false'],
    ['ExperimentalWorldsRuntime.generationController()', 'worldGenController'],
    ['ExperimentalWorldsRuntime.setGenerationController(controller)', 'worldGenController = controller'],
    ['ExperimentalWorldsRuntime.setGenerationController(null)', 'worldGenController = null'],
    ['ExperimentalWorldsRuntime.sidecarRetryInProgress()', 'sidecarRetryInProgress'],
    ['ExperimentalWorldsRuntime.setSidecarRetryInProgress(true)', 'sidecarRetryInProgress = true'],
    ['ExperimentalWorldsRuntime.setSidecarRetryInProgress(false)', 'sidecarRetryInProgress = false'],
    ['ExperimentalWorldsRuntime.readerRefreshController()', 'scenePulseReaderRefreshController'],
    ['ExperimentalWorldsRuntime.setReaderRefreshController(controller)', 'scenePulseReaderRefreshController = controller'],
    ['ExperimentalWorldsRuntime.setReaderRefreshController(null)', 'scenePulseReaderRefreshController = null']
].reduce((next, [from, to]) => next.replaceAll(from, to), source)
    .replaceAll('globalThis.ExperimentalWorldsDom.portalRoot().appendChild', 'document.body.appendChild')
    .replaceAll('global.ExperimentalWorldsDom.portalRoot().appendChild', 'document.body.appendChild')
    .replaceAll('ExperimentalWorldsSidecar', 'HordeSidecar')
    .replaceAll('ExperimentalWorldsRpgMechanics', 'HordeRpgMechanics')
    .replaceAll('ExperimentalWorldsDossierClaims', 'HordeDossierClaims')
    .replaceAll('ExperimentalWorldsCanonicalImageComposer', 'HordeCanonicalImageComposer')
    .replaceAll('ExperimentalWorldsMechanicsRegistry', 'HordeWorldMechanicsRegistry')
    .replaceAll('ExperimentalWorldsMechanics', 'HordeWorldMechanics')
    .replaceAll('ExperimentalWorldsPortraitPromptCompiler', 'HordePortraitPromptCompiler')
    .replaceAll('ExperimentalWorldsScenePulseSourceRuntime', 'HordeScenePulseSourceRuntime')
    .replaceAll('ExperimentalWorldsScenePulseTour', 'HordeScenePulseTour')
    .replaceAll('ExperimentalWorldsScenePulse', 'HordeScenePulseWorlds')
    .replaceAll('ExperimentalWorldsVectorMemory', 'HordeVectorMemory')
    .replaceAll('ExperimentalWorldsState.', 'state.')
    .replaceAll('ExperimentalWorldsHost.persist()', 'saveState()')
    .replaceAll('window.HordeLabs()', 'window.HordeLabs');
const compareSource = source => source.replace(/[ \t]+$/gm, '').trimEnd();
const restoreExperimentalWarning = source => source.replace(
    /ExperimentalWorldsHost\.worldLoadWarning\(world\.id\) \? `<div class="world-library-warning">Needs repair · \$\{escapeHTML\(ExperimentalWorldsHost\.worldLoadWarning\(world\.id\)\)\}<\/div>` : ''/g,
    "worldLoadWarnings.has(world.id) ? `<div class=\"world-library-warning\">Needs repair · ${escapeHTML(worldLoadWarnings.get(world.id))}</div>` : ''"
).replace('restoreWorldMediaDirty(previousWorldMediaDirty);', 'worldMediaDirty = previousWorldMediaDirty;');
const restorePrivateUtilities = source => [
    ['experimentalIsPlainObject', 'isPlainObject'],
    ['experimentalSafeJsonClone', 'safeJsonClone'],
    ['experimentalEscapeHTML', 'escapeHTML'],
    ['experimentalCssUrl', 'cssUrl'],
    ['experimentalCssColor', 'cssColor'],
    ['experimentalDisplayInitials', 'displayInitials'],
    ['experimentalNormalizePersona', 'normalizePersona'],
    ['experimentalPersonaPromptText', 'personaPromptText'],
    ['experimentalExtractJSON', 'extractJSON'],
    ['experimentalSafeParseJSONRepair', 'safeParseJSONRepair'],
    ['experimentalNormalizeUploadedImage', 'normalizeUploadedImage'],
    ['experimentalOptimizeImage', 'optimizeImage'],
    ['ExperimentalWorldsDossierClaims', 'HordeDossierClaims'],
    ['ExperimentalWorldsCanonicalImageComposer', 'HordeCanonicalImageComposer'],
    ['ExperimentalWorldsMechanicsRegistry', 'HordeWorldMechanicsRegistry'],
    ['ExperimentalWorldsMechanics', 'HordeWorldMechanics'],
    ['ExperimentalWorldsPortraitPromptCompiler', 'HordePortraitPromptCompiler'],
    ['ExperimentalWorldsScenePulseSourceRuntime', 'HordeScenePulseSourceRuntime'],
    ['ExperimentalWorldsScenePulseTour', 'HordeScenePulseTour'],
    ['ExperimentalWorldsScenePulse', 'HordeScenePulseWorlds'],
    ['ExperimentalWorldsVectorMemory', 'HordeVectorMemory']
].reduce((next, [from, to]) => next.replaceAll(from, to), source);

const relocatedPath = 'experiences/experimental-worlds/visuals/world-visual-media-core.js';
const relocated = fs.readFileSync(relocatedPath, 'utf8');
const restored = restorePrivateUtilities(relocated)
    .replace('normalizeImageGuidePresets(ExperimentalWorldsVisualMediaHost.globalSettings().imageGuidePresets)', 'normalizeImageGuidePresets(state.globalSettings.imageGuidePresets)')
    .replace('if (removed) ExperimentalWorldsVisualMediaHost.markWorldMediaChanged(world);', 'if (removed && (state.worlds || []).includes(world)) worldMediaDirty = true;')
    .replace('ExperimentalWorldsVisualMediaHost.markWorldMediaChanged(world);', 'if ((state.worlds || []).includes(world)) worldMediaDirty = true;');

assert.equal(compareSource(restored), compareSource(acceptedUnit),
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
    compareSource(restorePrivateUtilities(restoreHostContract(relocatedProvider))
        .replace('normalizedProviderId(ExperimentalWorldsVisualMediaHost.globalSettings().apiProvider)', 'normalizedProviderId(state.globalSettings.apiProvider)')),
    compareSource(acceptedProviderUnit),
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
const acceptedStudio = acceptedApp.slice(studioStart, studioEnd);
const relocatedStudio = fs.readFileSync('experiences/experimental-worlds/runtime/world-studio-core.js', 'utf8');
const replaceOracleFunction = (source, name, oracle) => source.replace(extractedFunction(source, name), extractedFunction(oracle, name));
const restoreExperimentalRouteLifecycle = source => replaceOracleFunction(replaceOracleFunction(source
    .replace("if (!ExperimentalWorldsRuntime.hasRouteListener('sidecar-feature-guard-click')) {", 'if (!document.body.dataset.sidecarFeatureGuard) {')
    .replace("ExperimentalWorldsRuntime.bindRouteListener('sidecar-feature-guard-click', document, 'click', blockUnavailableSidecarFeature, true);", "document.addEventListener('click', blockUnavailableSidecarFeature, true);")
    .replace("ExperimentalWorldsRuntime.bindRouteListener('sidecar-feature-guard-pointer', document, 'pointerdown', blockUnavailableSidecarFeature, true);", "document.addEventListener('pointerdown', blockUnavailableSidecarFeature, true);")
    .replace("ExperimentalWorldsRuntime.bindRouteListener('sidecar-feature-guard-key', document, 'keydown', blockUnavailableSidecarFeature, true);", "document.addEventListener('keydown', blockUnavailableSidecarFeature, true);\n        document.body.dataset.sidecarFeatureGuard = 'true';")
    .replace("ExperimentalWorldsRuntime.bindRouteListener('sidecar-model-search-dismiss', document, 'click', event => {", "document.addEventListener('click', event => {"), 'setupWorldStudioLogic', acceptedStudio), 'setupSidecarModelSearch', acceptedStudio);
const restoredStudio = compareSource(restoreExperimentalWarning(restoreHostContract(restoreExperimentalRouteLifecycle(relocatedStudio)))
    .replace('            state.lastWorldStudioTab = target;\n            saveState();', '            state.lastWorldStudioTab = target;\n            persistWorkspaceSoon();')
    .replace('        state.lastWorldStudioId = worldId;\n        saveState();', '        state.lastWorldStudioId = worldId;\n        persistWorkspaceSoon();')
    .replace(`            // World recovery belongs to the Experimental authority.  Reading\n            // the host database here would make a stock-host cleanup or a\n            // future upstream store change silently break this mode.\n            const storedMedia = (await window.ExperimentalWorldsRepository?.snapshot?.())?.worldMediaAssets || {};`,
        "            const storedMedia = await HordeDB.get('worldMediaAssets') || {};")
    );
const expectedStudio = compareSource(acceptedStudio);
if (restoredStudio !== expectedStudio) {
    let difference = 0;
    while (restoredStudio[difference] === expectedStudio[difference]
        && difference < Math.max(restoredStudio.length, expectedStudio.length)) difference += 1;
    throw new Error(`World Studio oracle mismatch at ${difference}: actual=${JSON.stringify(restoredStudio.slice(difference - 160, difference + 280))} expected=${JSON.stringify(expectedStudio.slice(difference - 160, difference + 280))}`);
}
assert(!fs.readFileSync('app.js', 'utf8').includes('// --- World Engine ---'),
    'World Studio core is no longer ambiguously retained in the host bootstrap');
assert(relocatedStudio.includes("ExperimentalWorldsRuntime.bindRouteListener('sidecar-feature-guard-click'")
    && relocatedStudio.includes("ExperimentalWorldsRuntime.bindRouteListener('sidecar-model-search-dismiss'"),
    'World Studio document captures are lifecycle-owned and released on mode exit');
const studioIndex = html.indexOf('experiences/experimental-worlds/runtime/world-studio-core.js');
assert(studioIndex >= 0 && studioIndex < appIndex,
    'relocated World Studio core loads before the single host bootstrap');

const playStart = acceptedApp.indexOf('// --- World Play & Engine ---');
const playEnd = acceptedApp.indexOf('// --- Narrated outfit', playStart);
assert(playStart >= 0 && playEnd > playStart, 'Pass-0 World Play source unit is present');
const relocatedPlay = fs.readFileSync('experiences/experimental-worlds/runtime/world-play-core.js', 'utf8');
const acceptedPlay = acceptedApp.slice(playStart, playEnd)
    .replace("            })),\n            ...(window.StockWorlds17Pass0?.listMultiplayerSources?.() || [])", '            }))')
    .replace("        if (state.view === 'stockWorlds') {\n            const stockContext = window.StockWorlds17Pass0?.currentMultiplayerContext?.();\n            if (stockContext) return stockContext;\n        }\n", '')
    // Stock dispatch is a host boundary. The Experimental core accepts only
    // its own World context and must not carry either the stock marker or a
    // stock runtime call.
    .replace("    if (context.stockWorlds17Pass0) {\n        return window.StockWorlds17Pass0?.multiplayerCampaignTemplate?.(context) || null;\n    }\n", '');
function extractedFunction(source, name) {
    const start = source.indexOf(`function ${name}(`);
    assert(start >= 0, `Pass-0 source contains ${name}`);
    const brace = source.indexOf('{', start);
    let depth = 0;
    for (let index = brace; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        else if (source[index] === '}') {
            depth -= 1;
            if (!depth) return source.slice(start, index + 1);
        }
    }
    throw new Error(`Unclosed Pass-0 function ${name}`);
}
function restoreOptionalMultiplayerHostContract(source) {
    // These functions are unchanged in behaviour, but their host-owned Chat
    // and Multiplayer lookups now cross the explicit adapter.  Reconstitute
    // precisely their Pass-0 bodies for the source-faithfulness comparison;
    // the assertions below independently ensure the relocated copies use
    // only that adapter and retain their Experimental World branch.
    const names = [
        'multiplayerSources', 'renderMultiplayerHub', 'setupMultiplayerHub',
        'currentMultiplayerPersona', 'currentMultiplayerContext',
        'multiplayerCurrentSession', 'buildChatMultiplayerSnapshot',
        'buildMultiplayerSnapshot', 'buildMultiplayerCampaignTemplate',
        'applyMultiplayerSnapshot', 'leaveMultiplayerExperience',
        'executeIsolatedMultiplayerTurn'
    ];
    return names.reduce((next, name) => next.replace(extractedFunction(next, name), extractedFunction(acceptedPlay, name)), source);
}
const restoredPlay = restoreOptionalMultiplayerHostContract(restoreHostContract(relocatedPlay))
    // Explicit Pass-1 lifecycle seam: provider work captures Experimental
    // ownership and cannot publish after a mode/world/timeline/restore change.
    // Strip it only for the source-body comparison below.
    .replace(/\n\/\/ Provider output belongs to the World\/timeline\/revision[\s\S]*?\n}\n\nfunction trustedWorldMicroMove/, '\nfunction trustedWorldMicroMove')
    .replace('    let turnOwner = null;\n', '')
    .replace('        turnOwner = captureExperimentalTurnOwner(world, sess);\n', '')
    .replace(/^\s*assertExperimentalTurnOwner\(turnOwner\);\n/gm, '')
    .replace('        saveState().catch(() => {});\n        saveState();', '        saveState().catch(() => {});\n        persistWorkspaceSoon();')
    .replace(`    document.getElementById('world-persona-btn').onclick = () => {
        if (ExperimentalWorldsHost.openSharedPersonaManager()) {
            showToast('Create or select a Persona, then choose “Set as Active” to bind it to this timeline.', 'info');
        } else {
            showToast('No shared Persona manager is installed in this Experimental-only host.', 'info');
        }
    };`, `    document.getElementById('world-persona-btn').onclick = () => {
        const overlay = document.getElementById('personas-modal-overlay');
        if (!overlay) return;
        renderPersonasList();
        overlay.classList.remove('hidden');
        showToast('Create or select a Persona, then choose “Set as Active” to bind it to this timeline.', 'info');
    };`)
    .replace(/(state\.worldInstances\[state\.activeWorldId\]\.activeSessionId = e\.target\.value;\n\s*saveState\(\)\.catch\(\(\) => \{\}\);)(\n\s*renderWorldPlayState\(\);)/, '$1\n        persistWorkspaceSoon();$2');
const comparedRestoredPlay = compareSource(restoredPlay);
const comparedAcceptedPlay = compareSource(acceptedPlay);
if (comparedRestoredPlay !== comparedAcceptedPlay) {
    let firstDifference = 0;
    while (comparedRestoredPlay[firstDifference] === comparedAcceptedPlay[firstDifference]
        && firstDifference < Math.max(comparedRestoredPlay.length, comparedAcceptedPlay.length)) firstDifference += 1;
    const start = Math.max(0, firstDifference - 180);
    const end = firstDifference + 280;
    throw new Error(`World Play oracle mismatch at ${firstDifference}: actualChar=${JSON.stringify(comparedRestoredPlay[firstDifference])} expectedChar=${JSON.stringify(comparedAcceptedPlay[firstDifference])} actual=${JSON.stringify(comparedRestoredPlay.slice(start, end))} expected=${JSON.stringify(comparedAcceptedPlay.slice(start, end))}`);
}
assert(relocatedPlay.includes('captureExperimentalTurnOwner') && relocatedPlay.includes('assertExperimentalTurnOwner'),
    'Experimental World Play must capture and validate owner identity around provider completion');
assert(!relocatedPlay.includes('StockWorlds17Pass0'),
    'Experimental World Play must not require a stock Worlds helper or record');
assert(!/ExperimentalWorldsState\.(?:characters|rooms|chats|activeCharId|activeRoomId|personas|activePersonaId|activeSessionId)/.test(relocatedPlay),
    'Experimental World Play must not read Chat or Persona host state directly');
assert(!/window\.HordeMultiplayer(?:Engine)?/.test(relocatedPlay),
    'Experimental World Play must reach optional Multiplayer only through its host adapter');
assert(relocatedPlay.includes('ExperimentalWorldsHost.chatMultiplayerSources')
    && relocatedPlay.includes('ExperimentalWorldsHost.multiplayerPromptState'),
    'Experimental World Play records both optional Multiplayer adapter seams');
assert(!fs.readFileSync('app.js', 'utf8').includes('// --- World Play & Engine ---'),
    'World Play core is no longer ambiguously retained in the host bootstrap');
const playIndex = html.indexOf('experiences/experimental-worlds/runtime/world-play-core.js');
assert(playIndex >= 0 && playIndex < appIndex,
    'relocated World Play core loads before the single host bootstrap');

const sessionStart = acceptedApp.indexOf('// --- Narrated outfit');
const sessionEnd = acceptedApp.indexOf('// --- World Agent', sessionStart);
assert(sessionStart >= 0 && sessionEnd > sessionStart, 'Pass-0 World session source unit is present');
const relocatedSession = fs.readFileSync('experiences/experimental-worlds/runtime/world-session-core.js', 'utf8');
const hostBootstrapCall = `// Start\ninit().catch(error => {\n    console.error('Initialization failed:', error);\n    window.__hordeRuntimeErrors.push({ message: \`Initialization failed: \${String(error?.message || error)}\`, stack: String(error?.stack || '') });\n    showToast(\`Unable to start Horde Studio: \${error.message || error}\`, 'error');\n});`;
assert.equal(compareSource(restoreHostContract(relocatedSession)), compareSource(acceptedApp.slice(sessionStart, sessionEnd).replace(`${hostBootstrapCall}\n\n`, '')),
    'World session core differs from the Pass-0 oracle beyond moving the sole host bootstrap to app.js');
assert(fs.readFileSync('app.js', 'utf8').includes(hostBootstrapCall),
    'the one host bootstrap runs only after the current host file has loaded');
assert(!fs.readFileSync('app.js', 'utf8').includes('// --- Narrated outfit'),
    'World session core is no longer ambiguously retained in the host bootstrap');
const sessionIndex = html.indexOf('experiences/experimental-worlds/runtime/world-session-core.js');
assert(sessionIndex >= 0 && sessionIndex < appIndex,
    'relocated World session core loads before the single host bootstrap');

const intelligenceStart = acceptedApp.indexOf('// --- World Agent');
const intelligenceEnd = acceptedApp.indexOf('// --- Data model', intelligenceStart);
assert(intelligenceStart >= 0 && intelligenceEnd > intelligenceStart, 'Pass-0 World intelligence source unit is present');
const relocatedIntelligence = fs.readFileSync('experiences/experimental-worlds/runtime/world-intelligence-core.js', 'utf8');
const restoredIntelligence = compareSource(restoreExperimentalWarning(restoreHostContract(relocatedIntelligence))
    .replace('await window.ExperimentalWorldsHost?.persistSharedContinuities?.(state.chatContinuities);', "await HordeDB.set('chatContinuities', state.chatContinuities);")
    .replace(`                const name = ExperimentalWorldsHost.chatMemoryParticipantName(m.charId);
                if (name) prefix = name;`, `                const char = state.characters.find(c => c.id === m.charId);
                if (char) prefix = char.name;`)
    .replace('personaId: ExperimentalWorldsHost.activeSharedPersonaId()', "personaId: state.activePersonaId || ''")
    .replace(`                    const chatMemory = ExperimentalWorldsHost.chatMemoryContext();
                    const session = chatMemory?.session;
                    const config = chatMemory?.config;`, `                    const session = getCurrentSession();
                    const config = state.characters.find(c => c.id === state.activeCharId)
                                || state.rooms.find(r => r.id === state.activeRoomId);`)
    .replace('const session = ExperimentalWorldsHost.chatMemoryContext()?.session;', 'const session = getCurrentSession();')
    .replace(`            const chatMemory = ExperimentalWorldsHost.chatMemoryContext();
            const session = chatMemory?.session;
            if (session) {
                const config = chatMemory?.config;
                if (config) {
                    if (chatMemory.isRoom) {`, `            const session = getCurrentSession();
            if (session) {
                const config = state.characters.find(c => c.id === state.activeCharId) ||
                               state.rooms.find(r => r.id === state.activeRoomId);
                if (config) {
                    if (state.activeRoomId) {`)
    .replace(`                        (chatMemory.participants || []).forEach(tc => {
                            if (tc) {`, `                        (config.characterIds || []).forEach(cid => {
                            const tc = state.characters.find(c => c.id === cid);
                            if (tc) {`)
    );
const acceptedIntelligence = compareSource(acceptedApp.slice(intelligenceStart, intelligenceEnd));
if (restoredIntelligence !== acceptedIntelligence) {
    let firstDifference = 0;
    while (restoredIntelligence[firstDifference] === acceptedIntelligence[firstDifference]
        && firstDifference < Math.max(restoredIntelligence.length, acceptedIntelligence.length)) firstDifference += 1;
    const windowStart = Math.max(0, firstDifference - 180);
    const windowEnd = firstDifference + 280;
    throw new Error(`World intelligence oracle mismatch at ${firstDifference}: actual=${JSON.stringify(restoredIntelligence.slice(windowStart, windowEnd))} expected=${JSON.stringify(acceptedIntelligence.slice(windowStart, windowEnd))}`);
}
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
const pass0VisualStyles = acceptedStyle.slice(visualStyleStart, visualStyleEnd).trimEnd();
assert(relocatedVisualStyles.startsWith(pass0VisualStyles),
    'the original visual, outfit, Scene Inspector and Sidecar CSS must remain byte-identical at the Experimental stylesheet head');
assert(relocatedVisualStyles.includes('Pass 1 mechanical CSS closure'),
    'the complete World Engine CSS closure is not recorded as Experimental-owned');
assert(html.includes('experiences/experimental-worlds/styles/world-visuals-and-sidecar.css'),
    'relocated visual and Sidecar stylesheet is registered by the same document');

const scenePulseStyleStart = acceptedStyle.indexOf('/* ScenePulse-inspired in-place Scene Intelligence Workspace.');
assert(scenePulseStyleStart >= 0, 'Pass-0 ScenePulse/Sidecar stylesheet source unit is present');
const relocatedScenePulseStyles = fs.readFileSync('experiences/experimental-worlds/styles/scene-pulse-worlds.css', 'utf8');
assert(relocatedScenePulseStyles.includes(acceptedStyle.slice(scenePulseStyleStart).trimEnd()),
    'the complete Pass-0 ScenePulse/Sidecar/Thoughts stylesheet tail is Experimental-owned');
assert(!fs.readFileSync('style.css', 'utf8').includes('/* ScenePulse-inspired in-place Scene Intelligence Workspace.'),
    'the host stylesheet no longer retains the relocated ScenePulse/Sidecar/Thoughts CSS');

const visualEditorStart = acceptedApp.indexOf('const WORLD_VISUAL_ASPECTS');
const visualEditorEnd = acceptedApp.indexOf('// --- Voice notes and calls', visualEditorStart);
assert(visualEditorStart >= 0 && visualEditorEnd > visualEditorStart, 'Pass-0 visual editor source unit is present');
const relocatedVisualEditor = fs.readFileSync('experiences/experimental-worlds/visuals/world-visual-editor-core.js', 'utf8');
const restoreVisualEditorImageAdapter = source => source
    .replace(`        const ranked = ExperimentalWorldsVisualMediaHost.rankImageModels(await ExperimentalWorldsVisualMediaHost.getImageOutputModels('image', false, provider), provider);
        modelInfo = ranked.find(item => item.id === model) || null;`, `        const ranked = ExperimentalWorldsVisualMediaHost.rankImageModels(await ExperimentalWorldsVisualMediaHost.getImageOutputModels('image', false, provider), provider);
        companionImageModelCatalog = ranked;
        modelInfo = ranked.find(item => item.id === model) || null;`)
    .replace(`    let generated;
    let providerResult = {};
    try {
        const response = await ExperimentalWorldsVisualMediaHost.requestImage(buildBody(canUseReference), provider);
        generated = response.image;
        providerResult = response.result || {};
    } catch (error) {
        if (requireReference || !canUseReference
            || (!error.referencePrivacyRejected && !error.referenceTransportRejected)) throw error;
        const response = await ExperimentalWorldsVisualMediaHost.requestImage(buildBody(false), provider);
        generated = response.image;
        providerResult = response.result || {};
    }
    const portable = await makeWorldVisualPortable(generated, maxDimension, quality);`, `    let generated;
    requestCompanionPhoto.lastResult = null;
    try {
        generated = await requestCompanionPhoto(buildBody(canUseReference), provider);
    } catch (error) {
        if (requireReference || !canUseReference
            || (!error.referencePrivacyRejected && !error.referenceTransportRejected)) throw error;
        generated = await requestCompanionPhoto(buildBody(false), provider);
    }
    const portable = await makeWorldVisualPortable(generated, maxDimension, quality);`)
    .replace(`    const providerResponseMetadata = experimentalIsPlainObject(providerResult)`, `    const providerResult = requestCompanionPhoto.lastResult || {};
    const providerResponseMetadata = experimentalIsPlainObject(providerResult)`);
const restoredVisualEditor = compareSource(restoreHostContract(restoreVisualEditorImageAdapter(relocatedVisualEditor)));
const acceptedVisualEditor = compareSource(acceptedApp.slice(visualEditorStart, visualEditorEnd));
if (restoredVisualEditor !== acceptedVisualEditor) {
    let difference = 0;
    while (restoredVisualEditor[difference] === acceptedVisualEditor[difference]
        && difference < Math.max(restoredVisualEditor.length, acceptedVisualEditor.length)) difference += 1;
    throw new Error(`Visual editor oracle mismatch at ${difference}: actual=${JSON.stringify(restoredVisualEditor.slice(difference - 160, difference + 280))} expected=${JSON.stringify(acceptedVisualEditor.slice(difference - 160, difference + 280))}`);
}
assert(!fs.readFileSync('app.js', 'utf8').includes('const WORLD_VISUAL_ASPECTS'),
    'visual editor core is no longer ambiguously retained in the host bootstrap');
const visualEditorIndex = html.indexOf('experiences/experimental-worlds/visuals/world-visual-editor-core.js');
assert(visualEditorIndex >= 0 && visualEditorIndex < appIndex,
    'relocated visual editor core loads before the single host bootstrap');

const protocolStart = acceptedApp.indexOf('function normalizeWorldTurnReceipt');
const protocolEnd = acceptedApp.indexOf('async function impersonateUser()', protocolStart);
assert(protocolStart >= 0 && protocolEnd > protocolStart, 'Pass-0 Sidecar/ScenePulse protocol source unit is present');
const acceptedProtocol = acceptedApp.slice(protocolStart, protocolEnd);
const restoreExperimentalWorkspaceListener = source => {
    // This is the one deliberate lifecycle change in the source-shaped
    // workspace renderer: Pass 0 used a durable window/document bridge for
    // generated tab controls, whereas the detached mode binds the equivalent
    // handlers directly to its freshly mounted DOM. Reconstitute only that
    // exact control-binding span for the source-faithfulness comparison.
    const startMarker = '    const rerender = () => { renderSidecarWorkspace(world, sess); };';
    const endMarker = "    host.querySelectorAll('[data-si-section-toggle]')";
    const acceptedStart = acceptedProtocol.indexOf(startMarker);
    const acceptedEnd = acceptedProtocol.indexOf(endMarker, acceptedStart);
    const currentStart = source.indexOf(startMarker);
    const currentEnd = source.indexOf(endMarker, currentStart);
    assert(acceptedStart >= 0 && acceptedEnd > acceptedStart,
        'Pass-0 protocol contains the generated-workspace listener span');
    assert(currentStart >= 0 && currentEnd > currentStart,
        'detached protocol contains the generated-workspace listener span');
    return source.slice(0, currentStart)
        + acceptedProtocol.slice(acceptedStart, acceptedEnd)
        + source.slice(currentEnd);
};
const relocatedProtocol = fs.readFileSync('experiences/experimental-worlds/runtime/world-protocol-core.js', 'utf8');
const restoredProtocol = restoreExperimentalWorkspaceListener(restoreHostContract(relocatedProtocol))
    // Explicit Pass-1 lifecycle seam: all user-invoked Sidecar provider work
    // captures Experimental ownership and cannot attach a late result after a
    // mode/world/timeline/restore change. Strip only that small guard when
    // comparing the preserved protocol body with the Pass-0 oracle.
    .replace(/\n\/\/ A Sidecar request is a World operation,[\s\S]*?\n}\n\nasync function runSidecarQuestionRepair/, '\nasync function runSidecarQuestionRepair')
    .replaceAll('    const requestOwner = captureExperimentalSidecarOwner(world, sess);\n', '')
    .replace(/^\s*assertExperimentalSidecarOwner\(requestOwner\);\n/gm, '')
    .replace(/\n    \/\/ Do this before Reader evidence is attached to the protocol\.[\s\S]*?\n    \/\/ that the author has left while the transport was in flight\./, '')
    .replace(/\n        \/\/ The old owner may no longer be current\.[\s\S]*?if \(error\?\.code === 'experimental_world_owner_changed'\) throw error;\n/, '\n');
const comparedRestoredProtocol = compareSource(restoredProtocol);
const comparedAcceptedProtocol = compareSource(acceptedProtocol);
if (comparedRestoredProtocol !== comparedAcceptedProtocol) {
    let difference = 0;
    while (comparedRestoredProtocol[difference] === comparedAcceptedProtocol[difference]
        && difference < Math.max(comparedRestoredProtocol.length, comparedAcceptedProtocol.length)) difference += 1;
    const start = Math.max(0, difference - 180);
    const end = difference + 280;
    throw new Error(`Sidecar/ScenePulse protocol oracle mismatch at ${difference}: actual=${JSON.stringify(comparedRestoredProtocol.slice(start, end))} expected=${JSON.stringify(comparedAcceptedProtocol.slice(start, end))}`);
}
assert(relocatedProtocol.includes('captureExperimentalSidecarOwner') && relocatedProtocol.includes('assertExperimentalSidecarOwner'),
    'Sidecar provider paths must capture and validate Experimental ownership around completion');
assert(!fs.readFileSync('app.js', 'utf8').includes('function normalizeWorldTurnReceipt'),
    'Sidecar/ScenePulse protocol core is no longer ambiguously retained in the host bootstrap');
const protocolIndex = html.indexOf('experiences/experimental-worlds/runtime/world-protocol-core.js');
const sidecarIndex = html.indexOf('experiences/experimental-worlds/runtime/sidecar-core.js');
assert(protocolIndex >= 0 && protocolIndex < sidecarIndex && sidecarIndex < appIndex,
    'relocated Sidecar/ScenePulse protocol loads before the Sidecar bridge and single host bootstrap');

console.log('Pass-1 visual/media relocation audit passed.');
