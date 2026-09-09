(function initHordeSidecarHooks(global) {
    'use strict';

    function normalizeWorldTimeline(world, timeline, options = {}) {
        const api = global.HordeSidecarMode;
        if (!api) return null;
        api.normalizeWorldConfig(world, options);
        global.HordeSidecarTraversal?.normalizeWorldTraversal(world);
        (world?.entities || []).forEach(entity => global.HordeSidecarTraversal?.normalizeVehicle(entity));
        return api.normalizeTimelineProtocol(world, timeline, options);
    }

    function isSidecarWorld(world, timeline) {
        const api = global.HordeSidecarMode;
        return !!api?.isSidecarTimeline(world, timeline);
    }

    function ensureNarrativeHierarchy(world, timeline) {
        const protocol = normalizeWorldTimeline(world, timeline);
        if (!protocol || !isSidecarWorld(world, timeline)) return null;
        return global.HordeSidecarTimeline?.ensureHierarchy(protocol, timeline) || null;
    }

    global.HordeSidecarHooks = Object.freeze({
        normalizeWorldTimeline,
        isSidecarWorld,
        ensureNarrativeHierarchy
    });
})(window);
