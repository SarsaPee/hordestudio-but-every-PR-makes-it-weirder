#!/usr/bin/env node
/**
 * Build the Experimental Worlds browser module from the reviewed, extracted
 * implementation units.  The source order is intentional: it is the same
 * order used by the accepted 17.0 behaviour oracle, but all declarations now
 * share one private ES-module factory instead of leaking through classic
 * scripts on `window`.
 *
 * This is a deterministic mechanical build.  Do not add stock Horde source to
 * this list and do not use it to paper over a missing host service.
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'experiences/experimental-worlds/experimental-worlds-core.generated.mjs');
const vendorSourceRoot = resolve(root, 'experiences/experimental-worlds/scenepulse/vendor/ScenePulse');
const generatedVendorRoot = resolve(root, 'experiences/experimental-worlds/scenepulse/generated/ScenePulse');
const generatedVendorSourceUrl = '/experiences/experimental-worlds/scenepulse/generated/ScenePulse/src';
const vendorContextModule = resolve(root, 'host-adapters/experimental-worlds/experimental-worlds-vendor-context.js');

const adapterSources = Object.freeze([
    'host-adapters/experimental-worlds/experimental-worlds-host-adapter.js',
    'host-adapters/experimental-worlds/experimental-worlds-state-adapter.js',
    'host-adapters/experimental-worlds/visual-media-host-adapter.js'
]);

export const coreSources = Object.freeze([
    'experiences/experimental-worlds/runtime/experimental-runtime-compat.js',
    'experiences/experimental-worlds/runtime/experimental-vector-memory.js',
    'experiences/experimental-worlds/runtime/experimental-rpg-mechanics.js',
    'experiences/experimental-worlds/runtime/world-message-input.js',
    'experiences/experimental-worlds/runtime/dossier-claims.js',
    'experiences/experimental-worlds/mechanics/world-mechanics.js',
    'experiences/experimental-worlds/visuals/world-portrait-prompt.js',
    'experiences/experimental-worlds/visuals/world-visual-media-core.js',
    'experiences/experimental-worlds/visuals/world-visual-provider-core.js',
    'experiences/experimental-worlds/visuals/world-visual-editor-core.js',
    'experiences/experimental-worlds/runtime/world-studio-core.js',
    'experiences/experimental-worlds/runtime/world-play-core.js',
    'experiences/experimental-worlds/runtime/world-session-core.js',
    'experiences/experimental-worlds/runtime/world-intelligence-core.js',
    'experiences/experimental-worlds/scenepulse/scene-pulse-worlds.js',
    'experiences/experimental-worlds/scenepulse/scenepulse-source-runtime.js',
    'experiences/experimental-worlds/runtime/world-protocol-core.js',
    'experiences/experimental-worlds/runtime/sidecar-core.js'
]);

const header = String.raw`/* GENERATED FILE. Run scripts/build-experimental-worlds-module.mjs. */
/* eslint-disable */

export const EXPERIMENTAL_WORLDS_CORE_SOURCES = Object.freeze(__SOURCE_LIST__);

export function createExperimentalWorldsCoreRuntime(environment) {
    if (!environment || typeof environment !== 'object') {
        throw new TypeError('Experimental Worlds core requires an environment.');
    }
    const platformWindow = environment.window;
    const document = environment.document;
    const fetch = environment.fetch;
    const setTimeout = environment.setTimeout;
    const clearTimeout = environment.clearTimeout;
    const setInterval = environment.setInterval;
    const clearInterval = environment.clearInterval;
    const requestAnimationFrame = environment.requestAnimationFrame;
    const cancelAnimationFrame = environment.cancelAnimationFrame;
    const queueMicrotask = environment.queueMicrotask;
    const MutationObserver = environment.MutationObserver;
    const ResizeObserver = environment.ResizeObserver;
    const IntersectionObserver = environment.IntersectionObserver;
    const URL = environment.URL;
    const localStorage = environment.localStorage;
    const navigator = environment.navigator;
    const confirm = environment.confirm;
    const prompt = environment.prompt;

    if (!platformWindow || !document || typeof fetch !== 'function') {
        throw new TypeError('Experimental Worlds core requires scoped window, document and fetch services.');
    }

    let ExperimentalWorldsCanonicalImageComposer;
    let ExperimentalWorldsDossierClaims;
    let ExperimentalWorldsDom;
    let ExperimentalWorldsHost;
    let ExperimentalWorldsMechanics;
    let ExperimentalWorldsMechanicsRegistry;
    let ExperimentalWorldsRpgMechanics;
    let ExperimentalWorldsRuntime;
    let ExperimentalWorldsScenePulse;
    let ExperimentalWorldsScenePulseSourceRuntime;
    let ExperimentalWorldsScenePulseTour;
    let ExperimentalWorldsSidecarHooks;
    let ExperimentalWorldsSidecarMemoryGraph;
    let ExperimentalWorldsSidecarMode;
    let ExperimentalWorldsSidecarPromotion;
    let ExperimentalWorldsSidecarReader;
    let ExperimentalWorldsSidecarReaderBackfill;
    let ExperimentalWorldsSidecarTimeline;
    let ExperimentalWorldsSidecarTraversal;
    let ExperimentalWorldsState;
    let ExperimentalWorldsStateAdapter;
    let ExperimentalWorldsVectorMemory;
    let ExperimentalWorldsVisualMediaHost;
    let __experimentalWorldsCommitTool;
    let experimentalCssColor;
    let experimentalCssUrl;
    let experimentalDirtyJSONRepair;
    let experimentalDisplayInitials;
    let experimentalEscapeHTML;
    let experimentalExtractJSON;
    let experimentalIsPlainObject;
    let experimentalLoreKeywordMatches;
    let experimentalNormalizePersona;
    let experimentalNormalizeUploadedImage;
    let experimentalOptimizeImage;
    let experimentalParseHordeMarkdown;
    let experimentalParseLoreKeywords;
    let experimentalPersonaPromptText;
    let experimentalReadImageFile;
    let experimentalRenderSearchResults;
    let experimentalSafeJsonClone;
    let experimentalSafeParseJSONRepair;
    let experimentalSetSearchOpen;
    let workspaceRestoring = false;
    let internalRoute = 'library';
    let initialized = false;

    const privateGlobals = Object.create(null);
    const publishPrivate = (key, value) => {
        privateGlobals[key] = value;
        switch (key) {
            case 'ExperimentalWorldsCanonicalImageComposer': ExperimentalWorldsCanonicalImageComposer = value; break;
            case 'ExperimentalWorldsDossierClaims': ExperimentalWorldsDossierClaims = value; break;
            case 'ExperimentalWorldsDom': ExperimentalWorldsDom = value; break;
            case 'ExperimentalWorldsHost': ExperimentalWorldsHost = value; break;
            case 'ExperimentalWorldsMechanics': ExperimentalWorldsMechanics = value; break;
            case 'ExperimentalWorldsMechanicsRegistry': ExperimentalWorldsMechanicsRegistry = value; break;
            case 'ExperimentalWorldsRpgMechanics': ExperimentalWorldsRpgMechanics = value; break;
            case 'ExperimentalWorldsRuntime': ExperimentalWorldsRuntime = value; break;
            case 'ExperimentalWorldsScenePulse': ExperimentalWorldsScenePulse = value; break;
            case 'ExperimentalWorldsScenePulseSourceRuntime': ExperimentalWorldsScenePulseSourceRuntime = value; break;
            case 'ExperimentalWorldsScenePulseTour': ExperimentalWorldsScenePulseTour = value; break;
            case 'ExperimentalWorldsSidecarHooks': ExperimentalWorldsSidecarHooks = value; break;
            case 'ExperimentalWorldsSidecarMemoryGraph': ExperimentalWorldsSidecarMemoryGraph = value; break;
            case 'ExperimentalWorldsSidecarMode': ExperimentalWorldsSidecarMode = value; break;
            case 'ExperimentalWorldsSidecarPromotion': ExperimentalWorldsSidecarPromotion = value; break;
            case 'ExperimentalWorldsSidecarReader': ExperimentalWorldsSidecarReader = value; break;
            case 'ExperimentalWorldsSidecarReaderBackfill': ExperimentalWorldsSidecarReaderBackfill = value; break;
            case 'ExperimentalWorldsSidecarTimeline': ExperimentalWorldsSidecarTimeline = value; break;
            case 'ExperimentalWorldsSidecarTraversal': ExperimentalWorldsSidecarTraversal = value; break;
            case 'ExperimentalWorldsState': ExperimentalWorldsState = value; break;
            case 'ExperimentalWorldsStateAdapter': ExperimentalWorldsStateAdapter = value; break;
            case 'ExperimentalWorldsVectorMemory': ExperimentalWorldsVectorMemory = value; break;
            case 'ExperimentalWorldsVisualMediaHost': ExperimentalWorldsVisualMediaHost = value; break;
            case '__experimentalWorldsCommitTool': __experimentalWorldsCommitTool = value; break;
            case 'experimentalCssColor': experimentalCssColor = value; break;
            case 'experimentalCssUrl': experimentalCssUrl = value; break;
            case 'experimentalDirtyJSONRepair': experimentalDirtyJSONRepair = value; break;
            case 'experimentalDisplayInitials': experimentalDisplayInitials = value; break;
            case 'experimentalEscapeHTML': experimentalEscapeHTML = value; break;
            case 'experimentalExtractJSON': experimentalExtractJSON = value; break;
            case 'experimentalIsPlainObject': experimentalIsPlainObject = value; break;
            case 'experimentalLoreKeywordMatches': experimentalLoreKeywordMatches = value; break;
            case 'experimentalNormalizePersona': experimentalNormalizePersona = value; break;
            case 'experimentalNormalizeUploadedImage': experimentalNormalizeUploadedImage = value; break;
            case 'experimentalOptimizeImage': experimentalOptimizeImage = value; break;
            case 'experimentalParseHordeMarkdown': experimentalParseHordeMarkdown = value; break;
            case 'experimentalParseLoreKeywords': experimentalParseLoreKeywords = value; break;
            case 'experimentalPersonaPromptText': experimentalPersonaPromptText = value; break;
            case 'experimentalReadImageFile': experimentalReadImageFile = value; break;
            case 'experimentalRenderSearchResults': experimentalRenderSearchResults = value; break;
            case 'experimentalSafeJsonClone': experimentalSafeJsonClone = value; break;
            case 'experimentalSafeParseJSONRepair': experimentalSafeParseJSONRepair = value; break;
            case 'experimentalSetSearchOpen': experimentalSetSearchOpen = value; break;
            default: break;
        }
        return true;
    };

    const window = new Proxy(privateGlobals, {
        get(target, key) {
            if (Reflect.has(target, key)) return Reflect.get(target, key);
            const value = platformWindow[key];
            return typeof value === 'function' ? value.bind(platformWindow) : value;
        },
        set(_target, key, value) { return publishPrivate(key, value); },
        has(target, key) { return Reflect.has(target, key) || key in platformWindow; },
        ownKeys(target) { return Reflect.ownKeys(target); },
        getOwnPropertyDescriptor(target, key) {
            return Reflect.getOwnPropertyDescriptor(target, key) || { configurable: true, enumerable: false, writable: true, value: undefined };
        }
    });
    const globalThis = window;

    environment.bindVendorContext?.({
        window,
        document,
        fetch,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        requestAnimationFrame,
        cancelAnimationFrame,
        queueMicrotask,
        MutationObserver,
        ResizeObserver,
        IntersectionObserver,
        URLConstructor: environment.URLConstructor,
        createObjectURL: environment.URL.createObjectURL,
        revokeObjectURL: environment.URL.revokeObjectURL,
        localStorage,
        navigator
    });

    publishPrivate('ExperimentalWorldsRestoreGeneration', Number(environment.restoreGeneration?.() || 0));

`;

const footer = String.raw`

    // A small number of preserved units intentionally use their private
    // global facade for cross-unit lookup.  Publish those module-local
    // declarations only to that facade, never to the browser window.
    publishPrivate('getWorldTimeData', getWorldTimeData);

    const routeIds = Object.freeze({
        library: 'ew-worlds-view',
        studio: 'ew-world-studio-view',
        play: 'ew-world-play-view'
    });
    const coreRoutes = Object.freeze({
        worlds: 'library',
        worldStudio: 'studio',
        worldPlay: 'play'
    });
    const stateRoute = Object.freeze({
        library: 'worlds',
        studio: 'worldStudio',
        play: 'worldPlay'
    });

    const clone = value => value == null ? value : structuredClone(value);
    const activeInstance = () => ExperimentalWorldsState?.worldInstances?.[ExperimentalWorldsState?.activeWorldId] || null;
    const activeTimeline = () => {
        const instance = activeInstance();
        return instance?.sessions?.find(session => session.id === instance.activeSessionId) || null;
    };
    const normalizeRoute = route => coreRoutes[String(route || '')] || (routeIds[route] ? route : 'library');

    function captureWorkspace() {
        const timeline = activeTimeline();
        const visibleSubViews = document.querySelectorAll('.modal-overlay:not(.hidden), [role="dialog"]:not(.hidden)')
            .map(element => element.id).filter(Boolean);
        return {
            version: 1,
            route: internalRoute,
            worldId: ExperimentalWorldsState?.activeWorldId || ExperimentalWorldsState?.lastWorldStudioId || null,
            timelineId: activeInstance()?.activeSessionId || null,
            studioTab: ExperimentalWorldsState?.lastWorldStudioTab || null,
            subViews: [...new Set(visibleSubViews)],
            revision: timeline?.revision ?? timeline?.sidecar?.revision ?? null,
            take: timeline?.take ?? timeline?.sidecar?.take ?? null,
            attempt: timeline?.attempt ?? timeline?.sidecar?.attempt ?? null
        };
    }

    async function persist(reason = 'experimental-runtime') {
        const snapshot = ExperimentalWorldsStateAdapter.snapshot();
        const workspace = captureWorkspace();
        environment.onWorkspaceChange?.(clone(workspace));
        if (typeof environment.repository?.writeSnapshot === 'function') {
            return environment.repository.writeSnapshot({ ...snapshot, workspace }, reason);
        }
        if (typeof environment.repository?.save === 'function') {
            return environment.repository.save({ ...snapshot, workspace }, reason);
        }
        throw new Error('Experimental Worlds repository does not expose a snapshot writer.');
    }

    function showRoute(route, { render = true } = {}) {
        internalRoute = normalizeRoute(route);
        ExperimentalWorldsState.view = stateRoute[internalRoute];
        Object.entries(routeIds).forEach(([candidate, id]) => {
            document.getElementById(id)?.classList.toggle('hidden', candidate !== internalRoute);
        });
        if (render) {
            if (internalRoute === 'library') renderWorlds();
            else if (internalRoute === 'studio') renderWorldStudio();
            else if (internalRoute === 'play') renderWorldPlayState();
        }
        environment.onWorkspaceChange?.(captureWorkspace());
        return internalRoute;
    }

    function navigateFromCore(destination, ...args) {
        const internal = coreRoutes[String(destination || '')];
        if (internal) return showRoute(internal, { render: false });
        return environment.services?.navigateHost?.(destination, ...args);
    }

    function visualBinding() {
        const visual = environment.services?.visualMedia || {};
        return {
            getGlobalSettings: () => ExperimentalWorldsState?.globalSettings || {},
            markExperimentalWorldMediaChanged: world => {
                visual.markExperimentalWorldMediaChanged?.(world);
                environment.services?.markMediaChanged?.(world);
            },
            imageModelFallback: visual.imageModelFallback,
            getImageOutputModels: visual.getImageOutputModels,
            rankImageModels: visual.rankImageModels,
            imageModelInfo: visual.imageModelInfo,
            getImageEndpoints: visual.getImageEndpoints,
            chooseImageEndpoint: visual.chooseImageEndpoint,
            imageCapabilities: visual.imageCapabilities,
            applyImageParameters: visual.applyImageParameters,
            requestImage: visual.requestImage,
            normalizeGeneratedImageSource: visual.normalizeGeneratedImageSource,
            stabilizeGeneratedImageSource: visual.stabilizeGeneratedImageSource
        };
    }

    function hostBinding() {
        const services = environment.services || {};
        const noOp = () => undefined;
        const asyncEmpty = async () => [];
        return {
            persistSharedContinuities: services.persistSharedContinuities || (async () => undefined),
            persist,
            navigate: navigateFromCore,
            markMediaChanged: services.markMediaChanged || noOp,
            mediaDirty: services.mediaDirty || (() => false),
            restoreMediaDirty: services.restoreMediaDirty || noOp,
            worldLoadWarning: services.worldLoadWarning || (() => ''),
            notify: services.notify || noOp,
            confirmModal: services.confirmModal || (async () => false),
            apiBase: services.apiBase || (() => ''),
            authHeaders: services.authHeaders || (() => ({})),
            attributionHeaders: services.attributionHeaders || (() => ({})),
            hasApiCredentials: services.hasApiCredentials || (() => false),
            isLocalProvider: services.isLocalProvider || (() => false),
            cloudProviderName: services.cloudProviderName || (() => 'provider'),
            normalizedProviderId: services.normalizedProviderId || (value => String(value || '')),
            providerApiBase: services.providerApiBase || (() => ''),
            providerAuthHeaders: services.providerAuthHeaders || (() => ({})),
            providerAttributionHeaders: services.providerAttributionHeaders || (() => ({})),
            providerHasCredentials: services.providerHasCredentials || (() => false),
            providerDisplayName: services.providerDisplayName || (value => String(value || 'provider')),
            applyOpenRouterRouting: services.applyOpenRouterRouting || (value => value),
            sanitizeMessagesForProvider: services.sanitizeMessagesForProvider || (value => value),
            humanizeApiError: services.humanizeApiError || (error => error?.message || String(error || 'Provider request failed')),
            localGenerationIdleTimeoutMs: services.localGenerationIdleTimeoutMs || (() => 0),
            cloudGenerationIdleTimeoutMs: services.cloudGenerationIdleTimeoutMs || (() => 45000),
            diagnostics: services.diagnostics || (() => ({ apiCalls: [], runtimeErrors: [] })),
            applyRegexScripts: services.applyRegexScripts || (value => value),
            replaceMacros: services.replaceMacros || (value => value),
            getAllPresets: services.getAllPresets || (() => []),
            isPresetPromptEnabled: services.isPresetPromptEnabled || (() => false),
            getOrderedPresetPrompts: services.getOrderedPresetPrompts || (() => []),
            getEmbedding: services.getEmbedding || (async () => []),
            persistSharedSettings: services.persistSharedSettings || (async () => undefined),
            modelCatalog: services.modelCatalog || (() => []),
            getModelCatalog: services.getModelCatalog || asyncEmpty,
            ensureSharedLibraryFresh: services.ensureSharedLibraryFresh || (async () => undefined),
            recordSharedLibraryAssistantTurn: services.recordSharedLibraryAssistantTurn || (async () => undefined),
            labsAvailable: services.labsAvailable || (() => false),
            labsPolicy: services.labsPolicy || (() => 'off'),
            labsTaskCapabilities: services.labsTaskCapabilities || (() => []),
            labsProposal: services.labsProposal || (async () => null),
            sharedPersonas: services.sharedPersonas || (() => []),
            chatMultiplayerSources: services.chatMultiplayerSources || (() => []),
            chatMultiplayerContext: services.chatMultiplayerContext || (() => null),
            chatMultiplayerSession: services.chatMultiplayerSession || (() => null),
            chatMultiplayerSnapshot: services.chatMultiplayerSnapshot || (() => ({})),
            chatMultiplayerCampaignTemplate: services.chatMultiplayerCampaignTemplate || (() => null),
            multiplayerCampaigns: services.multiplayerCampaigns || (() => []),
            prepareMultiplayerCampaign: services.prepareMultiplayerCampaign || (async () => null),
            prepareMultiplayerSource: services.prepareMultiplayerSource || (async () => null),
            joinMultiplayerInvite: services.joinMultiplayerInvite || (async () => null),
            multiplayerPromptState: services.multiplayerPromptState || (() => ''),
            currentMultiplayerPersona: services.currentMultiplayerPersona || (() => null),
            renderHostChatMultiplayerSnapshot: services.renderHostChatMultiplayerSnapshot || (() => false),
            clearHostChatMultiplayerPresentation: services.clearHostChatMultiplayerPresentation || noOp,
            openSharedPersonaManager: services.openSharedPersonaManager || (() => false),
            chatMemoryParticipantName: services.chatMemoryParticipantName || (() => ''),
            chatMemoryContext: services.chatMemoryContext || (() => null),
            activeSharedPersonaId: services.activeSharedPersonaId || (() => '')
        };
    }

    function setupOnce() {
        if (initialized) return;
        setupWorldsLogic();
        setupWorldStudioTabs();
        setupWorldStudioLogic();
        setupWorldImport();
        setupWorldPlayLogic();
        // The host multiplayer hub belongs to native 17.4. Experimental
        // Worlds never binds its host-owned DOM or installs a parallel hub.
        setupVectorMemoryViewerEvents();
        initialized = true;
    }

    async function initialize(initialSnapshot = {}) {
        if (!ExperimentalWorldsStateAdapter || !ExperimentalWorldsHost || !ExperimentalWorldsVisualMediaHost) {
            throw new Error('Experimental Worlds private adapters did not initialize.');
        }
        const sharedFallback = { ...(environment.services?.sharedState || {}) };
        ExperimentalWorldsStateAdapter.configure({
            readShared: key => environment.services?.readShared?.(key) ?? sharedFallback[key],
            writeShared: (key, value) => {
                sharedFallback[key] = value;
                environment.services?.writeShared?.(key, value);
            }
        });
        ExperimentalWorldsStateAdapter.hydrate(initialSnapshot);
        ExperimentalWorldsVisualMediaHost.configure(visualBinding());
        ExperimentalWorldsHost.configure(hostBinding());
        setupOnce();
        return captureWorkspace();
    }

    async function restoreWorkspace(workspace = {}) {
        const candidate = workspace && typeof workspace === 'object' ? workspace : {};
        const route = normalizeRoute(candidate.route);
        const worldId = String(candidate.worldId || '');
        const timelineId = String(candidate.timelineId || '');
        workspaceRestoring = true;
        try {
            if (route === 'studio' && worldId && ExperimentalWorldsState.worlds.some(world => world.id === worldId)) {
                openWorldStudio(worldId, { tab: candidate.studioTab || undefined });
            } else if (route === 'play' && worldId && ExperimentalWorldsState.worlds.some(world => world.id === worldId)) {
                enterWorld(worldId, timelineId || null);
            } else {
                showRoute('library');
            }
            (Array.isArray(candidate.subViews) ? candidate.subViews : []).forEach(id => {
                const element = document.getElementById(id);
                if (!element) return;
                element.classList.remove('hidden');
                element.setAttribute('aria-hidden', 'false');
            });
        } finally {
            workspaceRestoring = false;
        }
        return captureWorkspace();
    }

    function abortOwnedOperations() {
        ExperimentalWorldsRuntime?.abortAll?.();
        environment.abortOwnedOperations?.();
    }

    function deactivate() {
        abortOwnedOperations();
        const workspace = document.getElementById('ew-world-sidecar-workspace');
        unbindScenePulseWorldsHostActions?.(workspace);
        ExperimentalWorldsScenePulseSourceRuntime?.unmount?.(workspace);
        ExperimentalWorldsScenePulse?.unmount?.(workspace);
        ExperimentalWorldsDom?.clearPortal?.();
        return captureWorkspace();
    }

    return Object.freeze({
        initialize,
        activate: showRoute,
        deactivate,
        captureWorkspace,
        restoreWorkspace,
        abortOwnedOperations,
        snapshot: () => ExperimentalWorldsStateAdapter.snapshot(),
        persist
    });
}
`;

const sections = [...adapterSources, ...coreSources].map(file => {
    let source = readFileSync(resolve(root, file), 'utf8').trimEnd();
    if (file === 'experiences/experimental-worlds/scenepulse/scenepulse-source-runtime.js') {
        source = source.replace(
            "const ROOT = '/experiences/experimental-worlds/scenepulse/vendor/ScenePulse/src';",
            `const ROOT = '${generatedVendorSourceUrl}';`
        );
    }
    if (file === 'experiences/experimental-worlds/scenepulse/scene-pulse-worlds.js') {
        source = source.replace(
            "const SOURCE_PRESET_MODULE = '/experiences/experimental-worlds/scenepulse/vendor/ScenePulse/src/presets/built-in.js';",
            `const SOURCE_PRESET_MODULE = '${generatedVendorSourceUrl}/presets/built-in.js';`
        );
    }
    return `\n/* BEGIN ${file} */\n${source}\n/* END ${file} */\n`;
});
const sourceList = JSON.stringify(coreSources, null, 4);
const generated = `${header.replace('__SOURCE_LIST__', sourceList)}${sections.join('')}${footer}`;

function vendorPrelude(path) {
    let contextImport = relative(dirname(path), vendorContextModule).replaceAll('\\', '/');
    if (!contextImport.startsWith('.')) contextImport = `./${contextImport}`;
    return `import { experimentalWorldsVendorGlobals as __experimentalWorldsVendorGlobals } from '${contextImport}';\n`
        + `const { window, document, SillyTavern, toastr, fetch, localStorage, navigator, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, queueMicrotask, MutationObserver, ResizeObserver, IntersectionObserver, URL } = __experimentalWorldsVendorGlobals;\n\n`;
}

// Build a source-faithful ScenePulse ESM mirror whose browser dependencies are
// imported from the active mode's scoped context.  The pinned vendored source
// remains byte-identical; this generated surface is integration glue.
rmSync(generatedVendorRoot, { recursive: true, force: true });
cpSync(resolve(vendorSourceRoot, 'src'), resolve(generatedVendorRoot, 'src'), { recursive: true });
cpSync(resolve(vendorSourceRoot, 'locales'), resolve(generatedVendorRoot, 'locales'), { recursive: true });
mkdirSync(resolve(generatedVendorRoot, 'presets'), { recursive: true });
cpSync(resolve(vendorSourceRoot, 'presets/or-stats.json'), resolve(generatedVendorRoot, 'presets/or-stats.json'));

const generatedModuleFiles = [];
function instrumentGeneratedModules(directory) {
    const entries = readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name));
    entries.forEach(entry => {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) return instrumentGeneratedModules(path);
        if (!/\.(?:m?js)$/i.test(entry.name)) return;
        let source = readFileSync(path, 'utf8');
        // These are SillyTavern application entry points, not ScenePulse
        // modules.  Horde's generated integration mirror must never try to
        // resolve them from the 17.4 origin.  The scoped SillyTavern facade
        // already supplies the same optional save/history capabilities, so
        // keep the vendored fallback shape while resolving it locally.
        source = source
            .replace(
                "const chatModule=await import('/scripts/chat.js');",
                'const chatModule=SillyTavern.getContext();'
            )
            .replace(
                "const stScript = await import('/script.js');",
                'const stScript = SillyTavern.getContext();'
            );
        writeFileSync(path, vendorPrelude(path) + source);
        generatedModuleFiles.push(relative(root, path));
    });
}
instrumentGeneratedModules(resolve(generatedVendorRoot, 'src'));

// Parse the exact body in a single ordinary function too.  This catches the
// duplicate lexical declarations that caused the old global-loading attempt
// to become order-dependent, before a browser ever sees the generated file.
const parseBody = sections.join('\n');
try {
    Function(parseBody);
} catch (error) {
    throw new Error(`Experimental Worlds source units do not share one lexical scope: ${error.message}`);
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, generated);
console.log(`Built ${relative(root, output)} from ${coreSources.length} core units, ${adapterSources.length} private adapters and ${generatedModuleFiles.length} scoped ScenePulse modules.`);
