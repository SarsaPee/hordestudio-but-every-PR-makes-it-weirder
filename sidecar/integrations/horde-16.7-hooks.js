(function initHordeSidecarHooks(global) {
    'use strict';

    function normalizeWorldTimeline(world, timeline, options = {}) {
        const api = global.HordeSidecarMode;
        if (!api) return null;
        api.normalizeWorldConfig(world, options);
        return api.normalizeTimelineProtocol(world, timeline, options);
    }

    function isSidecarWorld(world, timeline) {
        const api = global.HordeSidecarMode;
        return !!api?.isSidecarTimeline(world, timeline);
    }

    global.HordeSidecarHooks = Object.freeze({
        normalizeWorldTimeline,
        isSidecarWorld
    });
})(window);
