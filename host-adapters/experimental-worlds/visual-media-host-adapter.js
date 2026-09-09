/*
 * The only host-facing bridge used by the relocated Experimental Worlds visual
 * core.  It deliberately exposes neither the host state object nor the stock
 * World writer: Experimental code can read shared visual presets and ask the
 * host to mark an owned World-media change for persistence.
 */
(function registerExperimentalWorldsVisualMediaHostAdapter(global) {
    let binding = null;

    const configuredBinding = () => {
        if (!binding) throw new Error('Experimental Worlds visual-media host adapter has not been configured.');
        return binding;
    };

    global.ExperimentalWorldsVisualMediaHost = Object.freeze({
        configure(nextBinding) {
            if (!nextBinding || typeof nextBinding.getGlobalSettings !== 'function'
                || typeof nextBinding.markExperimentalWorldMediaChanged !== 'function') {
                throw new Error('Experimental Worlds visual-media host adapter requires settings and media-change bindings.');
            }
            binding = Object.freeze({
                getGlobalSettings: nextBinding.getGlobalSettings,
                markExperimentalWorldMediaChanged: nextBinding.markExperimentalWorldMediaChanged
            });
        },
        globalSettings() {
            return configuredBinding().getGlobalSettings() || {};
        },
        markWorldMediaChanged(world) {
            configuredBinding().markExperimentalWorldMediaChanged(world);
        }
    });
})(globalThis);
