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
                markExperimentalWorldMediaChanged: nextBinding.markExperimentalWorldMediaChanged,
                imageModelFallback: nextBinding.imageModelFallback,
                getImageOutputModels: nextBinding.getImageOutputModels,
                rankImageModels: nextBinding.rankImageModels,
                imageModelInfo: nextBinding.imageModelInfo,
                getImageEndpoints: nextBinding.getImageEndpoints,
                chooseImageEndpoint: nextBinding.chooseImageEndpoint,
                imageCapabilities: nextBinding.imageCapabilities,
                applyImageParameters: nextBinding.applyImageParameters,
                requestImage: nextBinding.requestImage,
                normalizeGeneratedImageSource: nextBinding.normalizeGeneratedImageSource,
                stabilizeGeneratedImageSource: nextBinding.stabilizeGeneratedImageSource
            });
        },
        globalSettings() {
            return configuredBinding().getGlobalSettings() || {};
        },
        markWorldMediaChanged(world) {
            configuredBinding().markExperimentalWorldMediaChanged(world);
        },
        imageModelFallback(provider) {
            return configuredBinding().imageModelFallback?.(provider) || '';
        },
        getImageOutputModels(...args) {
            return configuredBinding().getImageOutputModels?.(...args) || Promise.resolve([]);
        },
        rankImageModels(...args) {
            return configuredBinding().rankImageModels?.(...args) || [];
        },
        imageModelInfo(...args) {
            return configuredBinding().imageModelInfo?.(...args) || null;
        },
        getImageEndpoints(...args) {
            return configuredBinding().getImageEndpoints?.(...args) || Promise.resolve([]);
        },
        chooseImageEndpoint(...args) {
            return configuredBinding().chooseImageEndpoint?.(...args) || null;
        },
        imageCapabilities(...args) {
            return configuredBinding().imageCapabilities?.(...args) || {};
        },
        applyImageParameters(...args) {
            return configuredBinding().applyImageParameters?.(...args) || args[0] || {};
        },
        requestImage(...args) {
            if (typeof configuredBinding().requestImage !== 'function') {
                return Promise.reject(new Error('Image generation is not available in this Experimental Worlds host.'));
            }
            return configuredBinding().requestImage(...args);
        },
        normalizeGeneratedImageSource(...args) {
            return configuredBinding().normalizeGeneratedImageSource?.(...args) || '';
        },
        stabilizeGeneratedImageSource(...args) {
            return configuredBinding().stabilizeGeneratedImageSource?.(...args) || Promise.resolve('');
        }
    });
})(globalThis);
