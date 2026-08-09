let generator = null;
let loadedKey = '';
let transformersPromise = null;

async function transformersRuntime() {
    if (!transformersPromise) {
        // Keep this import inside the request boundary. A failed static import
        // kills a module worker before it can report anything useful to the UI.
        transformersPromise = import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1')
            .catch(error => {
                transformersPromise = null;
                throw new Error(`Could not load the embedded inference runtime: ${error?.message || String(error)}`);
            });
    }
    return transformersPromise;
}

function reply(id, payload) { self.postMessage({ id, ...payload }); }
function progress(id, model, event) {
    const loaded = Number(event?.loaded) || 0;
    const total = Number(event?.total) || 0;
    const percent = total > 0 ? Math.max(0, Math.min(100, Math.round(loaded / total * 100))) : 0;
    self.postMessage({ id, progress: true, model, status: event?.status || 'loading', file: event?.file || '', loaded, total, percent });
}

async function browserCacheContainsModel(model) {
    if (!self.caches?.keys) return false;
    const needles = String(model || '').toLowerCase().split('/').filter(Boolean);
    try {
        const cacheNames = await self.caches.keys();
        let sawConfig = false;
        let sawTokenizer = false;
        let sawWeights = false;
        for (const cacheName of cacheNames) {
            const cache = await self.caches.open(cacheName);
            const requests = await cache.keys();
            for (const request of requests) {
                const url = decodeURIComponent(String(request.url || '')).toLowerCase();
                if (!needles.every(part => url.includes(part))) continue;
                if (/\/config\.json(?:$|[?#])/.test(url)) sawConfig = true;
                if (/tokenizer(?:_config)?\.json|tokenizer\.model/.test(url)) sawTokenizer = true;
                if (/\.onnx(?:$|[?#])|model.*\.(?:bin|safetensors)(?:$|[?#])/.test(url)) sawWeights = true;
            }
        }
        return sawConfig && sawTokenizer && sawWeights;
    } catch (_) {
        return false;
    }
}

async function removeModelFromBrowserCache(model) {
    if (!self.caches?.keys) return 0;
    const needles = String(model || '').toLowerCase().split('/').filter(Boolean);
    let deleted = 0;
    try {
        for (const cacheName of await self.caches.keys()) {
            const cache = await self.caches.open(cacheName);
            for (const request of await cache.keys()) {
                const url = decodeURIComponent(String(request.url || '')).toLowerCase();
                if (needles.every(part => url.includes(part)) && await cache.delete(request)) deleted++;
            }
        }
    } catch (_) {}
    return deleted;
}

async function loadModel(id, options = {}) {
    const Transformers = await transformersRuntime();
    const model = options.model || 'HuggingFaceTB/SmolLM2-135M-Instruct';
    const device = options.device === 'webgpu' && self.navigator?.gpu ? 'webgpu' : 'wasm';
    const dtype = options.dtype || 'q4';
    const key = `${model}|${device}|${dtype}`;
    if (generator && loadedKey === key) return { model, device, dtype, cached: true };
    generator?.dispose?.();
    generator = await Transformers.pipeline('text-generation', model, {
        device, dtype, progress_callback: event => progress(id, model, event)
    });
    loadedKey = key;
    return { model, device, dtype, cached: true };
}

function generatedText(output) {
    const value = output?.[0]?.generated_text;
    if (Array.isArray(value)) return String(value.at(-1)?.content || '');
    return String(value || output?.[0]?.text || '');
}

async function handleMessage(event) {
    const { id, type, options = {} } = event.data || {};
    try {
        if (type === 'install') return reply(id, { ok: true, ...(await loadModel(id, options)) });
        if (type === 'status') {
            const Transformers = await transformersRuntime();
            const model = options.model || 'HuggingFaceTB/SmolLM2-135M-Instruct';
            const registry = Transformers.ModelRegistry;
            let cached = loadedKey.startsWith(`${model}|`);
            if (!cached && registry?.is_pipeline_cached) {
                cached = await registry.is_pipeline_cached('text-generation', model, { dtype: options.dtype || 'q4' });
            } else if (!cached && registry?.is_cached) {
                cached = await registry.is_cached(model, { dtype: options.dtype || 'q4' });
            }
            if (!cached) cached = await browserCacheContainsModel(model);
            return reply(id, { ok: true, model, cached, loaded: loadedKey.startsWith(`${model}|`) });
        }
        if (type === 'remove') {
            const Transformers = await transformersRuntime();
            const model = options.model || 'HuggingFaceTB/SmolLM2-135M-Instruct';
            generator?.dispose?.(); generator = null; loadedKey = '';
            const registryResult = Transformers.ModelRegistry?.clear_pipeline_cache
                ? await Transformers.ModelRegistry.clear_pipeline_cache('text-generation', model, { dtype: options.dtype || 'q4' })
                : null;
            const browserFilesDeleted = registryResult ? 0 : await removeModelFromBrowserCache(model);
            return reply(id, { ok: true, result: registryResult, browserFilesDeleted });
        }
        if (type === 'unload') {
            generator?.dispose?.(); generator = null; loadedKey = '';
            return reply(id, { ok: true });
        }
        if (type === 'generate') {
            const loaded = await loadModel(id, options);
            const messages = [
                { role: 'system', content: String(options.system || '') },
                { role: 'user', content: String(options.input || '') }
            ];
            const temperature = Math.max(0, Math.min(1, Number(options.temperature) || 0));
            const output = await generator(messages, {
                max_new_tokens: Math.max(24, Math.min(240, Number(options.maxTokens) || 120)),
                do_sample: temperature > 0,
                ...(temperature > 0 ? { temperature: Math.max(.1, temperature), top_p: .9, repetition_penalty: 1.12 } : {}),
                return_full_text: false
            });
            return reply(id, { ok: true, text: generatedText(output), ...loaded });
        }
        throw new Error('Unknown embedded cognition operation.');
    } catch (error) {
        reply(id, { ok: false, error: error?.message || String(error) });
    }
}

// Transformers.js pipelines and their browser cache are not re-entrant. Keep
// install/status/generation operations ordered so a cache check cannot race a
// Pip reply or silently replace the active pipeline.
let operationTail = Promise.resolve();
self.onmessage = event => {
    operationTail = operationTail.then(
        () => handleMessage(event),
        () => handleMessage(event)
    );
};
