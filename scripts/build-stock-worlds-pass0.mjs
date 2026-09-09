#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const acorn = require('internal/deps/acorn/acorn/dist/acorn');

const [sourceRootArg, outputRootArg] = process.argv.slice(2);
if (!sourceRootArg || !outputRootArg) {
    console.error('Usage: node --expose-internals scripts/build-stock-worlds-pass0.mjs SOURCE_17_0 OUTPUT_DIR');
    process.exit(2);
}

const sourceRoot = path.resolve(sourceRootArg);
const outputRoot = path.resolve(outputRootArg);
const appPath = path.join(sourceRoot, 'app.js');
const indexPath = path.join(sourceRoot, 'index.html');
const stylePath = path.join(sourceRoot, 'style.css');
for (const file of [appPath, indexPath, stylePath]) {
    if (!fs.existsSync(file)) throw new Error(`Missing pristine source file: ${file}`);
}

const appSource = fs.readFileSync(appPath, 'utf8');
const indexSource = fs.readFileSync(indexPath, 'utf8');
const styleSource = fs.readFileSync(stylePath, 'utf8');
const appAst = acorn.parse(appSource, {
    ecmaVersion: 'latest', sourceType: 'script', locations: true, ranges: true
});

function patternNames(node, names = []) {
    if (!node) return names;
    if (node.type === 'Identifier') names.push(node.name);
    else if (node.type === 'RestElement') patternNames(node.argument, names);
    else if (node.type === 'AssignmentPattern') patternNames(node.left, names);
    else if (node.type === 'ArrayPattern') node.elements.forEach(item => patternNames(item, names));
    else if (node.type === 'ObjectPattern') node.properties.forEach(property => {
        if (property.type === 'RestElement') patternNames(property.argument, names);
        else patternNames(property.value, names);
    });
    return names;
}

const records = [];
const byName = new Map();
for (const node of appAst.body) {
    let names = [];
    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
        if (node.id) names = [node.id.name];
    } else if (node.type === 'VariableDeclaration') {
        names = node.declarations.flatMap(declaration => patternNames(declaration.id));
    }
    if (!names.length) continue;
    const record = {
        names,
        start: node.start,
        end: node.end,
        startLine: node.loc.start.line,
        endLine: node.loc.end.line,
        text: appSource.slice(node.start, node.end)
    };
    records.push(record);
    names.forEach(name => byName.set(name, record));
}

// These ranges were derived from the pristine local 17.0 tree. They select
// complete top-level declarations, never line fragments. Host services remain
// outside this generated runtime and are resolved through the single host.
const sourceRanges = [
    [1452, 1569, 'World import validation'],
    [2726, 3506, 'Bundled Worlds, schema migration and World media'],
    [4011, 4627, 'World AI Builder branch'],
    [8362, 9624, 'World receipt, transaction and ledger'],
    [11926, 32300, 'World editor, play, simulation, audits and memory'],
    [39684, 39807, 'World visual generation']
];

// This is the host Multiplayer hub from pristine 17.0, not the stock World
// engine. Pass 0 keeps the authoritative custom host's one Multiplayer runtime.
const hostOwnedRanges = [
    [17650, 18052, 'Multiplayer host implementation']
];

const explicitlyPrivate = new Set([
    'isPlainObject', 'safeJsonClone', 'requirePlainObject', 'requireString',
    'requireSafeId', 'requireArray', 'validateLorebook', 'getAllPresets',
    'applyPresetSampling', 'getPresetPromptDefaultEnabled',
    'isPresetPromptEnabled', 'getOrderedPresetPrompts',
    'validatePresetData', 'verifyModelCapabilities', 'dirtyJSONRepair',
    'extractJSON', 'safeParseJSONRepair', 'escapeHTML', 'cssUrl', 'cssColor',
    'parseHordeMarkdown', 'extractDirectorNotes',
    'HORDE_IMMERSION_DIRECTIVE', 'HORDE_NARRATIVE_RULES',
    'SLOP_SUBSTITUTIONS', 'stripSlop',
    'replaceMacros', 'normalizePersona', 'personaPromptText',
    'parseLoreKeywords', 'loreKeywordMatches',
    'setupSearchableDropdown', 'setupConfigSearchableDropdown', 'setBuilderStep',
    'displayJSONErrorDiagnostic', 'fetchModelData', 'getModelInfoElements',
    'populateModelInfoCard', 'updateReasoningVisibility', 'updateContextSliderUI',
    'configureContextSliderForModel', 'HordeVectorMemory',
    'memorySearchTerms', 'memoryLexicalScore', 'memoryDedupeKey', 'cosineSimilarity'
]);

// These pristine functions contain ordinary Character/Chat branches next
// to the World branch. Pass 0 copies the World statements verbatim instead of
// dragging a second Character Studio or Chat implementation into the stock
// room. The source lines are pinned by the complete app.js checksum above.
const worldOnlyReplacements = new Set([
    'setupAIBuilderLogic', 'setupConfigSearchableDropdown', 'summarizeStory',
    'invalidateEpisodicFrom', 'consolidateSessionEpisodicMemoryRun',
    'setupVectorMemoryViewerEvents', 'renderVectorMemoryList'
]);
const omittedHostModeDeclarations = new Set([
    'stripChatLedgerEntry', 'parseStructuredChatMemory'
]);

const selected = new Set();
for (const record of records) {
    if (hostOwnedRanges.some(([start, end]) => record.startLine >= start && record.startLine <= end)) continue;
    if (record.names.some(name => worldOnlyReplacements.has(name))) continue;
    if (sourceRanges.some(([start, end]) => record.startLine >= start && record.startLine <= end)
        || record.names.some(name => explicitlyPrivate.has(name))) {
        selected.add(record);
    }
}

const selectedRecords = [...selected]
    .filter(record => !record.names.some(name => omittedHostModeDeclarations.has(name)))
    .sort((a, b) => a.start - b.start);
const selectedNames = new Set(selectedRecords.flatMap(record => record.names));
const forbidden = ['init', 'loadState', 'repairLoadedState', 'persistStateSnapshot',
    'setupNavigation', 'setupGlobalSettings', 'setupChatLogic', 'setupCompanionsLogic'];
for (const name of forbidden) {
    if (selectedNames.has(name)) throw new Error(`Generated stock closure accidentally contains host bootstrap declaration: ${name}`);
}

const appLines = appSource.split(/\r?\n/);
const sourceLines = (start, end) => appLines.slice(start - 1, end).join('\n');
const worldOnlyAIBuilder = `// pristine app.js:4052-4627 (World statements only)\nasync function setupAIBuilderLogic() {\n${[
    sourceLines(4054, 4054),
    sourceLines(4056, 4056),
    sourceLines(4064, 4068),
    sourceLines(4269, 4549),
    sourceLines(4583, 4626)
].join('\n\n')}\n}`;
const worldOnlyConfigSearchableDropdown = `// pristine app.js:3736-3809 (World statements only)\nasync function setupConfigSearchableDropdown(prefix) {\n${[
    "    if (prefix !== 'w-') throw new Error('Stock Worlds only configures the World model picker');",
    "    const inputId = 'w-studio-model';",
    "    const resultsId = 'w-studio-model-results';",
    sourceLines(3740, 3794),
    sourceLines(3797, 3798),
    sourceLines(3803, 3808)
].join('\n')}\n}`;
const worldOnlySummarizer = `// pristine app.js:11245-11277 (World branch only)\nasync function summarizeStory() {\n${sourceLines(11248, 11276)}\n}`;
const worldOnlyInvalidateEpisodicFrom = `// pristine app.js:31791-31850 (World statements only)\nfunction invalidateEpisodicFrom(session, msgIndex) {\n${[
    sourceLines(31792, 31813),
    sourceLines(31847, 31850)
].join('\n\n')}\n}`;
const worldMemorySystemPrompt = sourceLines(31989, 31991).replace(/^\s*:\s*/, '').trim();
const worldOnlyConsolidation = `// pristine app.js:31913-32078 (World statements only)\nasync function consolidateSessionEpisodicMemoryRun(session, config) {\n${[
    sourceLines(31914, 31918),
    '    const messages = session.history;',
    sourceLines(31920, 31940),
    sourceLines(31944, 31980),
    '                max_tokens: 500,',
    sourceLines(31982, 31984),
    `                        content: ${worldMemorySystemPrompt}`,
    sourceLines(31992, 32005),
    '        let summary = rawMemory;',
    sourceLines(32009, 32025),
    '        let totalMemories = 0;',
    sourceLines(32047, 32054),
    sourceLines(32056, 32058),
    sourceLines(32071, 32077)
].join('\n')}\n}`;
const worldOnlyVectorViewerEvents = `// pristine app.js:32086-32200 (World statements only)\nfunction setupVectorMemoryViewerEvents() {\n${[
    sourceLines(32088, 32097),
    sourceLines(32108, 32153),
    sourceLines(32155, 32161),
    sourceLines(32163, 32163),
    sourceLines(32165, 32174),
    sourceLines(32190, 32199)
].join('\n')}\n}`;
const worldOnlyVectorMemoryList = `// pristine app.js:32231-32526 (World statements only)\nasync function renderVectorMemoryList(filterQuery = "") {\n${[
    sourceLines(32232, 32235),
    '    let candidates = [];',
    sourceLines(32240, 32243),
    sourceLines(32245, 32249),
    '    } else {',
    sourceLines(32261, 32285),
    '    }',
    sourceLines(32332, 32525)
].join('\n')}\n}`;
const worldOnlyMultiplayerCurrentSession = `// pristine app.js:17797-17806 (World statements only)\nfunction multiplayerCurrentSession(context) {\n${[
    sourceLines(17798, 17798),
    sourceLines(17803, 17805)
].join('\n')}\n}`;
const pristineWorldMultiplayerSnapshot = `// pristine app.js:17927-17977 (World snapshot)\n${sourceLines(17927, 17977)}`;
const worldOnlyMultiplayerCampaignTemplate = `// pristine app.js:17826-17854 (World statements only)\nfunction buildMultiplayerCampaignTemplate(context) {\n${[
    sourceLines(17827, 17828),
    sourceLines(17844, 17853)
].join('\n')}\n}`;
const worldOnlyCatalogModelSearchFields = `// pristine app.js:41263-41322 (World definition only)\nfunction setupCatalogModelSearchFields() {
    const input = document.getElementById('w-agent-model');
    const results = document.getElementById('w-agent-model-results');
    if (!input || !results) return;
    const render = async () => {
        let rawModels = [];
        try { rawModels = await getOpenRouterModels(); }
        catch (error) { console.warn('Could not load models for w-agent-model:', error); }
        const models = rankCompanionTextModels(rawModels);
        const query = input.value.trim().toLowerCase();
        const options = [
            { value: '', label: 'Use this world’s DM model', meta: 'Automatic' },
            ...models.map(model => ({
                value: model.id,
                label: model.name || model.id,
                meta: model.id
            }))
        ].filter(option =>
            !query || (option.label + ' ' + option.meta).toLowerCase().includes(query)).slice(0, 60);
        renderCompanionSearchResults(results, options, option => {
            input.value = option.value;
            setCompanionSearchOpen(input, results, false);
        }, 'No text model matches. You can still enter an exact custom model ID.');
        input.setAttribute('aria-expanded', 'true');
    };
    input.addEventListener('focus', render);
    input.addEventListener('input', render);
    input.addEventListener('keydown', event => {
        if (event.key === 'Escape') setCompanionSearchOpen(input, results, false);
    });
    document.addEventListener('click', event => {
        if (!input.contains(event.target) && !results.contains(event.target)) {
            setCompanionSearchOpen(input, results, false);
        }
    });
}`;
const worldOnlyPresetEditor = `// pristine app.js:9844-9961 (World statements only)
function setupPresetEditor() {
    const overlay = document.getElementById('preset-editor-overlay');
    const closeBtn = document.getElementById('close-preset-editor-btn');
    const saveBtn = document.getElementById('save-preset-overrides-btn');
    const wBtn = document.getElementById('w-fine-tune-preset-btn');
    if (wBtn) {
        wBtn.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!state.editingWorld || !state.editingWorld.activePresetId) {
                showToast('Select a preset first!', 'warning');
                return;
            }
            renderPresetEditor();
            overlay.classList.remove('hidden');
        };
    }
    if (closeBtn) closeBtn.onclick = () => overlay.classList.add('hidden');
    if (saveBtn) saveBtn.onclick = async () => {
        const target = state.editingWorld;
        if (!target) return;
        const blocks = document.querySelectorAll('.preset-block-editor');
        const overrides = {};
        blocks.forEach(block => {
            const index = block.dataset.index;
            const enabled = block.querySelector('.preset-block-toggle').checked;
            const prompt = block.querySelector('.preset-block-text').value;
            overrides[index] = { enabled, prompt };
        });
        target.presetOverrides = overrides;
        target.presetOverridesFor = target.activePresetId;
        await saveWorld();
        overlay.classList.add('hidden');
        showToast('Preset overrides applied to world!', 'success');
    };
}

function renderPresetEditor() {
${sourceLines(9915, 9915)}
    overlay.dataset.mode = 'world';
    const c = state.editingWorld;
${sourceLines(9918, 9924)}
    document.getElementById('preset-editor-title').textContent = \`Fine-Tune: \${preset.name} (World)\`;
${sourceLines(9927, 9960)}
}`;

const lines = indexSource.split(/\r?\n/);
const htmlRanges = [
    [168, 196, 'World library'],
    [481, 700, 'World play, check and map'],
    [703, 1575, 'World Studio'],
    [4361, 4550, 'World play overlays and memory inspector'],
    [4556, 4592, 'World preset and scheduler overlays'],
    [4613, 4714, 'World dossier and session setup overlays'],
    [4749, 4820, 'World audit and clock overlays'],
    [4888, 4905, 'World directory record inspector']
];
const stockMarkup = htmlRanges.map(([start, end]) => lines.slice(start - 1, end).join('\n')).join('\n\n');
const escapedMarkup = stockMarkup.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const dbStart = appSource.indexOf('// --- Horde Persistence (IndexedDB) ---');
const dbEnd = appSource.indexOf('// --- Vector Memory Engine with Cache & Fallback ---');
if (dbStart < 0 || dbEnd < 0) throw new Error('Could not locate pristine IndexedDB source block');
const dbSource = appSource.slice(dbStart, dbEnd)
    .replace("const DB_NAME = 'HordeStudioDB';", "const DB_NAME = 'HordeStudioStockWorlds17Pass0DB';")
    .replace(/const SETTINGS_MIRROR_KEY[^\n]*\n/, '')
    .replace(/\/\/ Bump this[\s\S]*?const HORDE_STUDIO_RELEASES_URL[^\n]*\n/, '')
    .replace('let worldMediaDirty = false;\n\n', '');

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const generatedHeader = `/*
 * GENERATED FROM PRISTINE LOCAL HORDE STUDIO 17.0.0.
 * Source app.js SHA-256: ${sha256(appSource)}
 * Source index.html SHA-256: ${sha256(indexSource)}
 * Source style.css SHA-256: ${sha256(styleSource)}
 *
 * This is the temporary Pass-0 stock Worlds room. It contains no Horde app
 * bootstrap and owns only stock World state in HordeStudioStockWorlds17Pass0DB.
 * Rebuild with scripts/build-stock-worlds-pass0.mjs; do not hand-reconstruct
 * pristine declarations.
 */
`;

const preamble = `${generatedHeader}(function installStockWorlds17Pass0(global) {
    'use strict';

    const SOURCE = Object.freeze({
        version: '17.0.0',
        appSha256: '${sha256(appSource)}',
        indexSha256: '${sha256(indexSource)}',
        styleSha256: '${sha256(styleSource)}'
    });
    const STOCK_MARKUP = String.raw\`${escapedMarkup}\`;
    const realDocument = global.document;
    let pristineIncludedWorlds = [];
    let DEFAULT_SYSTEM_PRESETS = [];
    let host = null;
    let mountElement = null;
    let shadowRoot = null;
    let initialized = false;
    let active = false;
    let stateLoadedPromise = null;
    let loadPromise = null;
    let saveStateInFlight = null;
    let saveStateQueued = false;
    let hostSettingsDirty = false;
    let worldMediaDirty = false;
    let worldGenController = null;
    let worldTurnInProgress = false;
    let lastPresetContextWarningKey = '';
    let lastPersistedWorldManifests = [];
    const worldLoadWarnings = new Map();
    const stockSettings = {};
    let openRouterModels = [];
    let modelCatalogSource = null;
    let modelCatalogLoadedOnce = false;
    let companionImageModelCatalog = [];
    const window = Object.freeze({
        get HordeLabs() { return host?.labs || null; }
    });
    const globalThis = Object.freeze({
        get HordeRpgMechanics() { return host?.rpgMechanics || null; },
        crypto: global.crypto
    });
    const STOCK_SETTING_KEYS = new Set([
        'seededWorldIds', 'includedWorldReceipts', 'starterAgendaBackfillV1',
        'starterAgendaStepsBackfillV1', 'starterGoalPoolBackfillV1',
        'starterWorldModelInheritanceV1', 'starterModelInheritanceV2'
    ]);
    const stockGlobalSettings = new Proxy(stockSettings, {
        get(target, property) {
            if (Reflect.has(target, property)) return Reflect.get(target, property);
            return host?.getHostState?.()?.globalSettings?.[property];
        },
        set(target, property, value) {
            if (STOCK_SETTING_KEYS.has(property)) Reflect.set(target, property, value);
            else if (host?.getHostState?.()?.globalSettings) {
                host.getHostState().globalSettings[property] = value;
                hostSettingsDirty = true;
            }
            else Reflect.set(target, property, value);
            return true;
        },
        ownKeys(target) {
            return [...new Set([...Reflect.ownKeys(host?.getHostState?.()?.globalSettings || {}), ...Reflect.ownKeys(target)])];
        },
        getOwnPropertyDescriptor() { return { enumerable: true, configurable: true }; }
    });
    const stockState = {
        view: 'worlds',
        worlds: [],
        worldRecoverySnapshots: {},
        activeWorldId: null,
        worldInstances: {},
        editingWorld: null,
        generatedWorld: null,
        globalSettings: stockGlobalSettings
    };
    const STOCK_STATE_KEYS = new Set(Object.keys(stockState));
    const SHARED_HOST_STATE_KEYS = new Set([
        'activePersonaId', 'characters', 'personas', 'systemPresets'
    ]);
    let sharedHostStateRead = false;
    const state = new Proxy(stockState, {
        get(target, property) {
            if (STOCK_STATE_KEYS.has(property)) return Reflect.get(target, property);
            if (SHARED_HOST_STATE_KEYS.has(property)) {
                sharedHostStateRead = true;
                return host?.getHostState?.()?.[property];
            }
            throw new Error('Stock Worlds attempted to read unowned host state: ' + String(property));
        },
        set(target, property, value) {
            if (STOCK_STATE_KEYS.has(property)) Reflect.set(target, property, value);
            else throw new Error('Stock Worlds attempted to write unowned host state: ' + String(property));
            return true;
        }
    });

    function stockDocumentTarget() {
        if (!shadowRoot) throw new Error('Stock Worlds DOM has not mounted');
        return shadowRoot;
    }

    const document = new Proxy(realDocument, {
        get(target, property) {
            if (property === 'getElementById') return id => stockDocumentTarget().getElementById(id);
            if (property === 'querySelector') return selector => stockDocumentTarget().querySelector(selector);
            if (property === 'querySelectorAll') return selector => stockDocumentTarget().querySelectorAll(selector);
            if (property === 'body' || property === 'documentElement') {
                return stockDocumentTarget().getElementById('stock-worlds-pass0-portals') || mountElement;
            }
            if (property === 'addEventListener') return stockDocumentTarget().addEventListener.bind(stockDocumentTarget());
            if (property === 'removeEventListener') return stockDocumentTarget().removeEventListener.bind(stockDocumentTarget());
            const value = Reflect.get(target, property);
            return typeof value === 'function' ? value.bind(target) : value;
        }
    });

    function requireHostService(name) {
        const service = host?.services?.[name];
        if (typeof service !== 'function') {
            throw new Error('Stock Worlds host service is unavailable: ' + name);
        }
        return service;
    }

    function callHostService(name, ...args) {
        return requireHostService(name)(...args);
    }

    // Deliberate global-host contracts. These names match pristine 17.0 call
    // sites so copied World bodies remain unchanged, but none can resolve by
    // accident through the surrounding classic-script global environment.
    function apiBase(...args) { return callHostService('apiBase', ...args); }
    function attributionHeaders(...args) { return callHostService('attributionHeaders', ...args); }
    function authHeaders(...args) { return callHostService('authHeaders', ...args); }
    function cloudProviderName(...args) { return callHostService('cloudProviderName', ...args); }
    function getEmbedding(...args) { return callHostService('getEmbedding', ...args); }
    function hasApiCredentials(...args) { return callHostService('hasApiCredentials', ...args); }
    function humanizeApiError(...args) { return callHostService('humanizeApiError', ...args); }
    function isLocalProvider(...args) { return callHostService('isLocalProvider', ...args); }
    function localGenerationIdleTimeoutMs(...args) { return callHostService('localGenerationIdleTimeoutMs', ...args); }
    function normalizedProviderId(...args) { return callHostService('normalizedProviderId', ...args); }
    function providerDisplayName(...args) { return callHostService('providerDisplayName', ...args); }
    function providerHasCredentials(...args) { return callHostService('providerHasCredentials', ...args); }
    function sanitizeMessagesForProvider(...args) { return callHostService('sanitizeMessagesForProvider', ...args); }
    function applyRegexScripts(...args) { return callHostService('applyRegexScripts', ...args); }
    function labsProposal(...args) { return callHostService('labsProposal', ...args); }
    function showConfirmModal(...args) { return callHostService('showConfirmModal', ...args); }
    function showToast(...args) { return callHostService('showToast', ...args); }
    function confirm(...args) { return callHostService('confirm', ...args); }
    function prompt(...args) { return callHostService('prompt', ...args); }

    function applyCompanionImageParameters(...args) { return callHostService('applyCompanionImageParameters', ...args); }
    function chooseCompanionImageEndpoint(...args) { return callHostService('chooseCompanionImageEndpoint', ...args); }
    function companionImageCapabilities(...args) { return callHostService('companionImageCapabilities', ...args); }
    function companionImageModelFallback(...args) { return callHostService('companionImageModelFallback', ...args); }
    function companionImageModelInfo(...args) { return callHostService('companionImageModelInfo', ...args); }
    function getCompanionImageEndpoints(...args) { return callHostService('getCompanionImageEndpoints', ...args); }
    function getCompanionOutputModels(...args) { return callHostService('getCompanionOutputModels', ...args); }
    function normalizeGeneratedImageSource(...args) { return callHostService('normalizeGeneratedImageSource', ...args); }
    function rankCompanionTextModels(...args) { return callHostService('rankCompanionTextModels', ...args); }
    function rankCompanionImageModels(...args) {
        const models = callHostService('rankCompanionImageModels', ...args);
        host?.setCompanionImageModelCatalog?.(models);
        return models;
    }
    function renderCompanionSearchResults(...args) { return callHostService('renderCompanionSearchResults', ...args); }
    function requestCompanionPhoto(...args) { return callHostService('requestCompanionPhoto', ...args); }
    function setCompanionSearchOpen(...args) { return callHostService('setCompanionSearchOpen', ...args); }
    function stabilizeGeneratedImageSource(...args) { return callHostService('stabilizeGeneratedImageSource', ...args); }

    // Pristine replaceMacros asks for the last ordinary Chat message even when
    // called by Worlds. Preserve that read behavior without allowing its
    // legacy getCurrentSession repair path to mutate the authoritative host.
    function getCurrentSession() {
        const session = host?.peekCurrentChatSession?.() || null;
        return session ? safeJsonClone(session) : null;
    }

    async function getOpenRouterModels() {
        if (!host?.getModelCatalog) throw new Error('Stock Worlds host model catalog is unavailable');
        const force = modelCatalogLoadedOnce && openRouterModels.length === 0 && modelCatalogSource === null;
        const models = await host.getModelCatalog({ force });
        openRouterModels = Array.isArray(models) ? models : [];
        modelCatalogSource = host?.getModelCatalogSource?.() || null;
        modelCatalogLoadedOnce = true;
        return openRouterModels;
    }

${dbSource.trimEnd()}

    async function persistStockStateSnapshot() {
        const savingWorldMedia = worldMediaDirty;
        const storedWorlds = (state.worlds || []).map(world => ({ ...world, mediaAssets: [] }));
        const visibleWorldIds = new Set(storedWorlds.map(world => world.id));
        const recovery = isPlainObject(state.worldRecoverySnapshots) ? state.worldRecoverySnapshots : {};
        lastPersistedWorldManifests.forEach(previous => {
            if (!isPlainObject(previous) || !previous.id || visibleWorldIds.has(previous.id)) return;
            recovery[previous.id] = {
                capturedAt: new Date().toISOString(),
                reason: 'World was absent from a later save',
                world: safeJsonClone(previous)
            };
        });
        state.worldRecoverySnapshots = Object.fromEntries(Object.entries(recovery)
            .sort((a, b) => String(b[1]?.capturedAt || '').localeCompare(String(a[1]?.capturedAt || '')))
            .slice(0, 30));
        const records = {
            worlds: storedWorlds,
            worldRecoverySnapshots: state.worldRecoverySnapshots,
            worldInstances: state.worldInstances,
            activeWorldId: state.activeWorldId,
            stockSettings: { ...stockSettings }
        };
        if (savingWorldMedia) {
            records.worldMediaAssets = Object.fromEntries((state.worlds || []).map(world => [
                world.id,
                safeJsonClone(Array.isArray(world.mediaAssets) ? world.mediaAssets : [])
            ]));
            worldMediaDirty = false;
        }
        try {
            await HordeDB.setMultiple(records);
            lastPersistedWorldManifests = safeJsonClone(storedWorlds);
            if (hostSettingsDirty || sharedHostStateRead) {
                await host?.persistHostState?.();
                hostSettingsDirty = false;
                sharedHostStateRead = false;
            }
        } catch (error) {
            if (savingWorldMedia) worldMediaDirty = true;
            throw error;
        }
    }

    async function saveState() {
        saveStateQueued = true;
        if (saveStateInFlight) return saveStateInFlight;
        saveStateInFlight = (async () => {
            do {
                saveStateQueued = false;
                await persistStockStateSnapshot();
            } while (saveStateQueued);
        })();
        try { await saveStateInFlight; }
        finally { saveStateInFlight = null; }
    }

    function repairStockWorldState() {
        worldLoadWarnings.clear();
        state.worldInstances = isPlainObject(state.worldInstances) ? state.worldInstances : {};
        state.worldRecoverySnapshots = isPlainObject(state.worldRecoverySnapshots) ? state.worldRecoverySnapshots : {};
        state.worlds = Array.isArray(state.worlds) ? state.worlds.filter(isPlainObject) : [];
        state.worlds.forEach((world, index) => {
            if (typeof world.id !== 'string' || !world.id.trim()) world.id = \`world_recovered_\${Date.now()}_\${index}\`;
            if (typeof world.name !== 'string' || !world.name.trim()) world.name = \`Recovered World \${index + 1}\`;
            world.locations = Array.isArray(world.locations) ? world.locations.filter(isPlainObject) : [];
            world.entities = Array.isArray(world.entities) ? world.entities.filter(isPlainObject) : [];
            world.lorebook = Array.isArray(world.lorebook) ? world.lorebook.filter(isPlainObject) : [];
            try { validateWorldData(world); }
            catch (error) { worldLoadWarnings.set(world.id, error.message || 'This world needs repair.'); }
            world.hudConfig = {
                showClock: true, showQuests: true, showLedger: true, showInventory: true,
                timeStep: 5, startTimeHours: 8, startTimeMinutes: 0,
                showDays: false, enableSchedules: false,
                ...(isPlainObject(world.hudConfig) ? world.hudConfig : {})
            };
            world.hudConfig.stats = Array.isArray(world.hudConfig.stats) ? world.hudConfig.stats : [];
            normalizeWorldGameRules(world);
            world.locations.forEach(location => { location.exits = location.exits || []; });
            world.entities.forEach(entity => {
                entity.secrets = entity.secrets || [];
                entity.schedule = entity.schedule || [];
            });
            normalizeAuthoredWorld(world);
        });
    }

    async function loadStockState() {
        await HordeDB.init();
        await HordeVectorMemory.init();
        STARTER_WORLDS.forEach((world, index) => { STARTER_WORLDS[index] = upgradeBundledWorldDefinition(world); });
        state.worlds = await HordeDB.get('worlds') || [];
        state.worldRecoverySnapshots = await HordeDB.get('worldRecoverySnapshots') || {};
        state.worldInstances = await HordeDB.get('worldInstances') || {};
        state.activeWorldId = await HordeDB.get('activeWorldId') || null;
        Object.assign(stockSettings, await HordeDB.get('stockSettings') || {});
        const storedWorldMedia = await HordeDB.get('worldMediaAssets') || {};
        state.worlds.forEach(world => {
            const separateAssets = Array.isArray(storedWorldMedia[world.id]) ? storedWorldMedia[world.id] : null;
            if (separateAssets) world.mediaAssets = separateAssets;
            else if ((world.mediaAssets || []).length) worldMediaDirty = true;
        });
        repairStockWorldState();
        lastPersistedWorldManifests = safeJsonClone(state.worlds.map(world => ({ ...world, mediaAssets: [] })));

        let changed = false;
        if (!state.worlds.length) {
            state.worlds = safeJsonClone(STARTER_WORLDS);
            stockSettings.seededWorldIds = STARTER_WORLDS.map(world => world.id);
            changed = true;
        }
        const offered = Array.isArray(stockSettings.includedWorldReceipts) ? stockSettings.includedWorldReceipts : [];
        for (const rawCandidate of pristineIncludedWorlds) {
            const candidate = upgradeBundledWorldDefinition(rawCandidate);
            const bundleId = String(candidate?.bundledId || '').trim();
            if (!bundleId || offered.includes(bundleId)) continue;
            if (!state.worlds.some(world => world?.bundledId === bundleId || world?.id === candidate.id)) {
                state.worlds.push(validateWorldData(candidate, \`Included world \${bundleId}\`));
                worldMediaDirty = true;
            }
            offered.push(bundleId);
            changed = true;
        }
        stockSettings.includedWorldReceipts = [...new Set(offered)];
        if (migrateStarterModelInheritance([], state.worlds, stockGlobalSettings)) changed = true;
        repairStockWorldState();
        if (changed || worldMediaDirty) await saveState();
    }

    function switchView(viewName) {
        if (!['worlds', 'worldStudio', 'worldPlay'].includes(viewName)) {
            host?.navigateHost?.(viewName);
            return;
        }
        state.view = viewName;
        ['worlds', 'worldStudio', 'worldPlay'].forEach(name => {
            document.getElementById(name === 'worlds' ? 'worlds-view' : name === 'worldStudio' ? 'world-studio-view' : 'world-play-view')
                ?.classList.toggle('hidden', name !== viewName);
        });
        if (viewName === 'worlds') renderWorlds();
        if (viewName === 'worldStudio' && !state.editingWorld) {
            if (state.activeWorldId) openWorldStudio(state.activeWorldId);
            else if (state.worlds.length) openWorldStudio(state.worlds[0].id);
            else createNewWorld();
        }
    }
`;

const declarations = [
    worldOnlyAIBuilder,
    worldOnlyConfigSearchableDropdown,
    worldOnlySummarizer,
    worldOnlyInvalidateEpisodicFrom,
    worldOnlyConsolidation,
    worldOnlyVectorViewerEvents,
    worldOnlyVectorMemoryList,
    worldOnlyMultiplayerCurrentSession,
    pristineWorldMultiplayerSnapshot,
    worldOnlyMultiplayerCampaignTemplate,
    worldOnlyCatalogModelSearchFields,
    worldOnlyPresetEditor,
    ...selectedRecords.map(record => `// pristine app.js:${record.startLine}-${record.endLine}\n${record.text}`)
].map(text => `\n${text}\n`).join('');

const footer = `
    async function initializeRuntime() {
        if (initialized) return;
        stateLoadedPromise ||= loadStockState();
        await stateLoadedPromise;
        setupWorldsLogic();
        setupWorldStudioTabs();
        setupWorldStudioLogic();
        setupPresetEditor();
        setupCatalogModelSearchFields();
        await setupAIBuilderLogic();
        setupWorldPlayLogic();
        setupWorldImport();
        setupVectorMemoryViewerEvents();
        document.querySelectorAll('[data-dismiss-fallback]').forEach(button => {
            button.onclick = () => document.getElementById(button.dataset.dismissFallback)?.classList.add('hidden');
        });
        const contextSlider = document.getElementById('w-studio-context-size');
        if (contextSlider) {
            contextSlider.addEventListener('input', () => updateContextSliderUI(
                'w-studio-context-size', 'w-studio-context-size-val', 'w-studio-context-size-badge'));
        }
        shadowRoot.addEventListener('click', event => {
            if (!event.target.classList?.contains('thinking-block-toggle')) return;
            const block = event.target.closest('.thinking-block');
            if (!block) return;
            const collapsed = block.classList.toggle('collapsed');
            event.target.textContent = collapsed ? 'Show full reasoning' : 'Hide reasoning';
        });
        initialized = true;
    }

    async function mount(element) {
        if (!host) throw new Error('Stock Worlds host bindings were not configured');
        mountElement = element || mountElement;
        if (!mountElement) throw new Error('Stock Worlds mount element is missing');
        if (!shadowRoot) {
            shadowRoot = mountElement.attachShadow({ mode: 'open' });
            const boundaryStyle = realDocument.createElement('style');
            boundaryStyle.textContent = ':host { display: block; position: absolute; inset: 0; min-width: 0; min-height: 0; overflow: hidden; } #stock-worlds-pass0-shell { position: relative; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; }';
            const stylesheet = realDocument.createElement('link');
            stylesheet.rel = 'stylesheet';
            stylesheet.href = 'experiences/stock-worlds-17-pass0/style.css?v=${sha256(styleSource).slice(0, 12)}';
            const shell = realDocument.createElement('div');
            shell.id = 'stock-worlds-pass0-shell';
            shell.innerHTML = STOCK_MARKUP + '<div id="stock-worlds-pass0-portals"></div>';
            shadowRoot.append(boundaryStyle, stylesheet, shell);
        }
        active = true;
        loadPromise ||= initializeRuntime();
        await loadPromise;
        switchView(state.view || 'worlds');
    }

    function unmount() {
        active = false;
        if (worldGenController) {
            worldGenController.abort();
            worldGenController = null;
        }
    }

    async function quiesceForImport({ timeoutMs = 30000 } = {}) {
        active = false;
        if (worldGenController) {
            worldGenController.abort();
            worldGenController = null;
        }
        const deadline = Date.now() + timeoutMs;
        while (worldTurnInProgress && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        if (worldTurnInProgress) {
            throw new Error('Stock Worlds could not quiesce before restore. No restore data was applied.');
        }
        if (saveStateInFlight) await saveStateInFlight;
    }

    async function exportState() {
        stateLoadedPromise ||= loadStockState();
        await stateLoadedPromise;
        await saveState();
        const worldMediaAssets = await HordeDB.get('worldMediaAssets') || {};
        return safeJsonClone({
            schemaVersion: 1,
            database: DB_NAME,
            worlds: state.worlds,
            worldRecoverySnapshots: state.worldRecoverySnapshots,
            worldInstances: state.worldInstances,
            activeWorldId: state.activeWorldId,
            stockSettings: { ...stockSettings },
            worldMediaAssets
        });
    }

    async function importState(payload) {
        if (!isPlainObject(payload) || !Array.isArray(payload.worlds) || !isPlainObject(payload.worldInstances || {})) {
            throw new Error('Invalid Pass-0 stock Worlds backup payload');
        }
        const remountAfterImport = active;
        await quiesceForImport();
        stateLoadedPromise ||= loadStockState();
        await stateLoadedPromise;
        state.worlds = safeJsonClone(payload.worlds);
        state.worldRecoverySnapshots = safeJsonClone(payload.worldRecoverySnapshots || {});
        state.worldInstances = safeJsonClone(payload.worldInstances || {});
        state.activeWorldId = payload.activeWorldId || null;
        Object.keys(stockSettings).forEach(key => delete stockSettings[key]);
        Object.assign(stockSettings, safeJsonClone(payload.stockSettings || {}));
        repairStockWorldState();
        await HordeDB.setMultiple({
            worlds: state.worlds.map(world => ({ ...world, mediaAssets: [] })),
            worldRecoverySnapshots: state.worldRecoverySnapshots,
            worldInstances: state.worldInstances,
            activeWorldId: state.activeWorldId,
            stockSettings: { ...stockSettings },
            worldMediaAssets: safeJsonClone(payload.worldMediaAssets || {})
        });
        lastPersistedWorldManifests = safeJsonClone(state.worlds.map(world => ({ ...world, mediaAssets: [] })));
        if (remountAfterImport) {
            active = true;
            switchView('worlds');
        }
    }

    async function purgeState() {
        await quiesceForImport();
        clearTimeout(HordeVectorMemory.saveTimer);
        HordeDB.close();
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(DB_NAME);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error || new Error('Stock Worlds database deletion failed'));
            request.onblocked = () => reject(new Error('Close other Horde Studio tabs and try again'));
        });
    }

    async function ready() {
        stateLoadedPromise ||= loadStockState();
        await stateLoadedPromise;
    }

    function listMultiplayerSources() {
        return safeJsonClone((state.worlds || []).map(world => ({
            type: 'world', stockWorlds17Pass0: true, id: world.id,
            domain: 'stock-worlds-17-pass0', domainLabel: 'Worlds',
            sourceKey: 'stock-worlds-17-pass0:' + world.id,
            name: world.name || 'Untitled World',
            description: world.description || 'Persistent World',
            image: world.image || world.banner || ''
        })));
    }

    function currentMultiplayerContext() {
        const world = state.worlds.find(item => item.id === state.activeWorldId);
        return world ? { type: 'world', stockWorlds17Pass0: true, id: world.id, name: world.name || 'Shared World' } : null;
    }

    function multiplayerCampaignTemplate(context) {
        const template = buildMultiplayerCampaignTemplate(context);
        if (template?.source) {
            template.source.stockWorlds17Pass0 = true;
            template.source.domain = 'stock-worlds-17-pass0';
            template.source.domainLabel = 'Worlds';
            template.source.sourceKey = 'stock-worlds-17-pass0:' + template.source.id;
        }
        return template ? safeJsonClone(template) : null;
    }

    global.StockWorlds17Pass0 = Object.freeze({
        source: SOURCE,
        databaseName: DB_NAME,
        configure(bindings) {
            host = Object.freeze({
                ...bindings,
                services: Object.freeze({ ...(bindings?.services || {}) })
            });
            pristineIncludedWorlds = safeJsonClone(bindings?.getIncludedWorlds?.() || []);
            DEFAULT_SYSTEM_PRESETS = safeJsonClone(bindings?.getBuiltinPresets?.() || []);
        },
        mount,
        unmount,
        quiesceForImport,
        exportState,
        importState,
        purgeState,
        ready,
        listMultiplayerSources,
        currentMultiplayerContext,
        multiplayerCampaignTemplate,
        isActive: () => active,
        diagnostics: () => ({
            active,
            initialized,
            view: state.view,
            worldCount: state.worlds.length,
            activeWorldId: state.activeWorldId,
            database: DB_NAME,
            hostBootstrapGeneration: host?.getBootstrapGeneration?.() || null,
            source: SOURCE
        })
    });
})(window);
`;

fs.mkdirSync(outputRoot, { recursive: true });
fs.writeFileSync(path.join(outputRoot, 'runtime.js'), preamble + declarations + footer);
fs.writeFileSync(path.join(outputRoot, 'style.css'), styleSource);
fs.writeFileSync(path.join(outputRoot, 'source-map.json'), JSON.stringify({
    generatedAt: null,
    source: {
        root: path.basename(sourceRoot),
        appSha256: sha256(appSource),
        indexSha256: sha256(indexSource),
        styleSha256: sha256(styleSource)
    },
    database: 'HordeStudioStockWorlds17Pass0DB',
    htmlRanges: htmlRanges.map(([start, end, purpose]) => ({ start, end, purpose })),
    declarationRanges: sourceRanges.map(([start, end, purpose]) => ({ start, end, purpose })),
    adaptedUnits: [
        { name: 'setupAIBuilderLogic', sourceRanges: [[4054, 4054], [4056, 4056], [4064, 4068], [4269, 4549], [4583, 4626]], purpose: 'World statements copied verbatim; Character builder branches omitted' },
        { name: 'setupConfigSearchableDropdown', sourceRanges: [[3740, 3794], [3797, 3798], [3803, 3808]], purpose: 'World model picker statements copied; Character picker branch omitted' },
        { name: 'summarizeStory', sourceRanges: [[11248, 11276]], purpose: 'World branch copied verbatim; Chat branch omitted' },
        { name: 'invalidateEpisodicFrom', sourceRanges: [[31792, 31813], [31847, 31850]], purpose: 'World episodic invalidation copied; Chat continuity-store mutation omitted' },
        { name: 'consolidateSessionEpisodicMemoryRun', sourceRanges: [[31914, 31940], [31944, 32025], [32047, 32054], [32056, 32058], [32071, 32077]], purpose: 'World memory branch copied; Chat continuity and enrichment branches omitted' },
        { name: 'setupVectorMemoryViewerEvents', sourceRanges: [[32088, 32097], [32108, 32174], [32190, 32199]], purpose: 'World memory inspector wiring copied; Chat force-archive path omitted' },
        { name: 'renderVectorMemoryList', sourceRanges: [[32232, 32249], [32261, 32285], [32332, 32525]], purpose: 'World episodic and biography branches copied; Chat and Room sources omitted' },
        { name: 'multiplayerCurrentSession', sourceRanges: [[17798, 17798], [17803, 17805]], purpose: 'Stock World session lookup copied; Chat session branch omitted' },
        { name: 'buildWorldMultiplayerSnapshot', sourceRanges: [[17927, 17977]], purpose: 'Pristine stock World multiplayer snapshot retained behind an ownership-marked host seam' },
        { name: 'buildMultiplayerCampaignTemplate', sourceRanges: [[17827, 17828], [17844, 17853]], purpose: 'Stock World campaign template copied; Chat campaign branch omitted' },
        { name: 'setupCatalogModelSearchFields', sourceRanges: [[41263, 41322]], purpose: 'World agent model definition retained; Video, Settings, embedding and Room definitions remain host-owned' },
        { name: 'setupPresetEditor', sourceRanges: [[9844, 9910]], purpose: 'World preset editor statements copied; Character preset editor wiring omitted' },
        { name: 'renderPresetEditor', sourceRanges: [[9915, 9960]], purpose: 'World preset rendering copied; Character target branch omitted' }
    ],
    declarations: selectedRecords.map(record => ({ names: record.names, startLine: record.startLine, endLine: record.endLine }))
}, null, 2) + '\n');

console.log(JSON.stringify({
    outputRoot,
    declarations: selectedRecords.length,
    declarationLines: selectedRecords.reduce((sum, record) => sum + record.endLine - record.startLine + 1, 0),
    markupLines: stockMarkup.split('\n').length,
    source: { app: sha256(appSource), index: sha256(indexSource), style: sha256(styleSource) }
}, null, 2));
