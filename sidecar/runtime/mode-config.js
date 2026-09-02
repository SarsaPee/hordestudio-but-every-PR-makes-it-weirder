(function initHordeSidecarMode(global) {
    'use strict';

    const SCHEMA_VERSION = 1;
    const MODES = Object.freeze({
        INLINE_LEGACY: 'inline_legacy',
        SIDECAR: 'sidecar'
    });

    const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
    const text = (value, max = 160) => String(value || '').trim().slice(0, max);
    const positiveInt = (value, fallback, max) => {
        const parsed = Math.trunc(Number(value));
        return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, max) : fallback;
    };

    function normalizeMode(value, fallback = MODES.INLINE_LEGACY) {
        return value === MODES.SIDECAR || value === MODES.INLINE_LEGACY ? value : fallback;
    }

    function normalizeWorldConfig(world, options = {}) {
        if (!isObject(world)) return null;
        const existing = isObject(world.sidecarConfig) ? world.sidecarConfig : {};
        const defaultMode = options.newWorld === true ? MODES.SIDECAR : MODES.INLINE_LEGACY;
        const mode = normalizeMode(existing.mode, defaultMode);
        const tracker = isObject(existing.tracker) ? existing.tracker : {};
        const debug = isObject(existing.debug) ? existing.debug : {};
        world.sidecarConfig = {
            schemaVersion: SCHEMA_VERSION,
            mode,
            tracker: {
                inheritNarrator: tracker.inheritNarrator !== false,
                model: text(tracker.model),
                openRouterRouting: isObject(tracker.openRouterRouting) ? tracker.openRouterRouting : null,
                reasoning: tracker.reasoning === true,
                maxTokens: positiveInt(tracker.maxTokens, 0, 100000)
            },
            debug: {
                enabled: debug.enabled === true,
                retainTraceCount: positiveInt(debug.retainTraceCount, 20, 200)
            }
        };
        return world.sidecarConfig;
    }

    function emptyProtocol(mode) {
        return {
            schemaVersion: SCHEMA_VERSION,
            mode,
            activeSequenceId: '',
            sequences: [],
            activeSceneId: '',
            scenes: [],
            turns: [],
            takes: [],
            takeIndex: {},
            questions: [],
            requests: [],
            proposals: [],
            backgroundProposals: [],
            refinements: [],
            conversations: [],
            temporalState: {},
            provisionalLocations: [],
            provisionalEntities: [],
            traversalState: {},
            packet: null,
            memoryGraph: {},
            jobs: [],
            diagnostics: {},
            debug: { enabled: false, retainTraceCount: 20, traces: [] },
            migration: {}
        };
    }

    function normalizeTimelineProtocol(world, timeline, options = {}) {
        if (!isObject(timeline)) return null;
        const config = normalizeWorldConfig(world, options) || { mode: MODES.INLINE_LEGACY, debug: {} };
        const current = isObject(timeline.sidecar) ? timeline.sidecar : {};
        const protocol = { ...emptyProtocol(normalizeMode(config.mode)), ...current };
        protocol.schemaVersion = SCHEMA_VERSION;
        protocol.mode = normalizeMode(current.mode, normalizeMode(config.mode));
        ['sequences', 'scenes', 'turns', 'takes', 'questions', 'requests', 'proposals', 'backgroundProposals',
            'refinements', 'conversations', 'provisionalLocations', 'provisionalEntities', 'jobs']
            .forEach(key => { if (!Array.isArray(protocol[key])) protocol[key] = []; });
        ['takeIndex', 'temporalState', 'traversalState', 'memoryGraph', 'diagnostics', 'migration']
            .forEach(key => { if (!isObject(protocol[key])) protocol[key] = {}; });
        protocol.activeSequenceId = text(protocol.activeSequenceId, 120);
        protocol.activeSceneId = text(protocol.activeSceneId, 120);
        protocol.packet = isObject(protocol.packet) ? protocol.packet : null;
        const debug = isObject(protocol.debug) ? protocol.debug : {};
        protocol.debug = {
            enabled: debug.enabled === true || config.debug?.enabled === true,
            retainTraceCount: positiveInt(debug.retainTraceCount, config.debug?.retainTraceCount || 20, 200),
            traces: Array.isArray(debug.traces) ? debug.traces.slice(-200) : []
        };
        timeline.sidecar = protocol;
        return protocol;
    }

    function isSidecarTimeline(world, timeline) {
        return normalizeTimelineProtocol(world, timeline)?.mode === MODES.SIDECAR;
    }

    global.HordeSidecarMode = Object.freeze({
        SCHEMA_VERSION,
        MODES,
        normalizeMode,
        normalizeWorldConfig,
        normalizeTimelineProtocol,
        isSidecarTimeline
    });
})(window);
