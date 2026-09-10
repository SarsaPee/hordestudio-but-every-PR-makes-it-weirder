/*
 * The deliberately small host-facing contract for Experimental Worlds.
 * This file is excluded from the Experimental core hash: it is the only place
 * where a future Horde host version should need to adapt shared facilities.
 */
(function (global) {
    'use strict';
    let host = null;
    function requireHost() {
        if (!host) throw new Error('Experimental Worlds host adapter is not configured.');
        return host;
    }
    global.ExperimentalWorldsHost = Object.freeze({
        configure(nextHost) { host = Object.freeze({ ...nextHost }); },
        persistSharedContinuities: continuities => requireHost().persistSharedContinuities(continuities)
    });
})(window);
