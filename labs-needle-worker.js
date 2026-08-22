/* TinyBrain 2 browser adapter for Cactus Needle 2.
 * The official browser runtime and Apache-2.0 model package are downloaded
 * from Cactus-Compute/needle2 only after the user presses Install. They remain
 * in this browser's Cache Storage. See THIRD_PARTY_NOTICES.md.
 */
'use strict';

const VERSION = '2.0.3';
const CACHE_NAME = `horde-tinybrain2-needle-${VERSION}`;
const BASE = 'https://huggingface.co/Cactus-Compute/needle2/resolve/main/';
const ASSETS = Object.freeze({
    script: `${BASE}wasm/needle.js`,
    wasm: `${BASE}wasm/needle.wasm`,
    weights: `${BASE}needle2.cact`
});
let moduleInstance = null;
let operationTail = Promise.resolve();

function reply(id, payload) { self.postMessage({ id, ...payload }); }
function report(id, stage, loaded = 0, total = 0) {
    self.postMessage({ id, progress: true, stage, loaded, total,
        percent: total > 0 ? Math.max(0, Math.min(100, Math.round(loaded / total * 100))) : 0 });
}

async function cache() {
    if (!self.caches) throw new Error('This browser does not provide Cache Storage.');
    return self.caches.open(CACHE_NAME);
}

async function cachedResponse(url) {
    return (await cache()).match(url, { ignoreVary: true });
}

async function fetchAndCache(id, key) {
    const url = ASSETS[key];
    const existing = await cachedResponse(url);
    if (existing) return existing;
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error(`Needle ${key} download failed (${response.status}).`);
    const total = Number(response.headers.get('content-length')) || 0;
    if (!response.body) {
        const blob = await response.blob();
        await (await cache()).put(url, new Response(blob, { headers: response.headers }));
        report(id, key, blob.size, blob.size);
        return new Response(blob);
    }
    const reader = response.body.getReader();
    const chunks = [];
    let loaded = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        report(id, key, loaded, total);
    }
    const bytes = new Uint8Array(loaded);
    let offset = 0;
    chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.byteLength; });
    const stored = new Response(bytes, { headers: { 'Content-Type': key === 'script' ? 'text/javascript' : 'application/octet-stream' } });
    await (await cache()).put(url, stored.clone());
    return stored;
}

async function installed() {
    const results = await Promise.all(Object.values(ASSETS).map(url => cachedResponse(url)));
    return results.every(Boolean);
}

async function load(id) {
    if (moduleInstance) return moduleInstance;
    const scriptResponse = await fetchAndCache(id, 'script');
    const wasmResponse = await fetchAndCache(id, 'wasm');
    const weightsResponse = await fetchAndCache(id, 'weights');
    const script = await scriptResponse.text();
    const wasmBinary = new Uint8Array(await wasmResponse.arrayBuffer());
    const weights = new Uint8Array(await weightsResponse.arrayBuffer());
    // The official Emscripten bundle is a classic-script factory rather than
    // an ES module. Evaluate the cached, pinned upstream artifact inside this
    // isolated worker and provide its WASM bytes explicitly.
    const factory = new Function(`${script}\nreturn createNeedle;`)();
    const runtime = await factory({ wasmBinary, noInitialRun: true });
    const pointer = runtime._malloc(weights.byteLength);
    if (!pointer) throw new Error('TinyBrain 2 could not allocate model memory.');
    try {
        runtime.HEAPU8.set(weights, pointer);
        const loaded = runtime._needle_load(pointer, BigInt(weights.byteLength));
        if (Number(loaded) !== 0) throw new Error(`Needle rejected its model weights (${loaded}).`);
    } finally { runtime._free(pointer); }
    moduleInstance = runtime;
    return runtime;
}

function needleSchema(value) {
    if (Array.isArray(value)) return value.map(needleSchema);
    if (!value || typeof value !== 'object') return value;
    // Needle's constrained grammar accepts the ordinary JSON-Schema subset
    // used by its public API, but its WASM compiler currently rejects
    // `additionalProperties`. Horde still rejects unknown keys in each task's
    // deterministic validator, so omitting this compiler-only keyword does not
    // weaken the execution boundary.
    return Object.fromEntries(Object.entries(value)
        .filter(([key]) => key !== 'additionalProperties')
        .map(([key, item]) => [key, needleSchema(item)]));
}

function normalizeToolDefinition(tool, fallbackDescription) {
    const source = tool && typeof tool === 'object' ? tool : {};
    const name = String(source.name || 'horde_extract').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    return {
        name,
        description: String(source.description || fallbackDescription || 'Extract the supported structured event from the supplied text.').slice(0, 900),
        parameters: needleSchema(source.parameters && typeof source.parameters === 'object'
            ? source.parameters : { type: 'object', properties: {} })
    };
}

function normalizeTools(options) {
    if (Array.isArray(options.tools) && options.tools.length) {
        return options.tools.slice(0, 12).map(tool => normalizeToolDefinition(tool, options.description));
    }
    const name = String(options.name || 'horde_extract').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    return [{
        name,
        description: String(options.description || 'Extract the supported structured event from the supplied text.').slice(0, 900),
        parameters: needleSchema(options.schema && typeof options.schema === 'object'
            ? options.schema : { type: 'object', properties: {} })
    }];
}

async function complete(id, options) {
    const runtime = await load(id);
    runtime._needle_reset();
    const initCode = runtime.ccall('needle_init', 'number', ['string', 'string', 'string'], [
        String(options.systemFacts || '').slice(0, 300), JSON.stringify(normalizeTools(options)), ''
    ]);
    // Needle returns a positive size/count on success and a negative error
    // code on failure. Earlier adapters treated every non-zero value as an
    // error, which made every valid tool schema appear to fail compilation.
    if (Number(initCode) < 0) throw new Error(`Needle could not compile the task schema (${initCode}).`);
    const capacity = 65536;
    const outputPointer = runtime._malloc(capacity);
    if (!outputPointer) throw new Error('TinyBrain 2 could not allocate its output buffer.');
    try {
        const code = runtime.ccall('needle_complete', 'number', ['string', 'number', 'number', 'number'], [
            String(options.input || '').slice(0, 2200), Math.max(24, Math.min(256, Number(options.maxTokens) || 128)), outputPointer, capacity
        ]);
        if (Number(code) < 0) throw new Error(`Needle inference failed (${code}).`);
        const raw = runtime.UTF8ToString(outputPointer, capacity);
        let response;
        try { response = JSON.parse(raw); }
        catch (_) { throw new Error('Needle returned an unreadable response envelope.'); }
        const calls = Array.isArray(response?.function_calls) ? response.function_calls : [];
        if (!calls.length || !calls[0]?.arguments) {
            return { ok: true, matched: false, response, confidence: Number(response?.confidence) || 0 };
        }
        return {
            ok: true, matched: true, candidate: { ...calls[0].arguments, _needleTool: String(calls[0].name || '') },
            confidence: Number(response?.confidence) || 0,
            reasoning: String(response?.reasoning || '').slice(0, 800),
            performance: { prefillTps: Number(response?.prefill_tps) || 0, decodeTps: Number(response?.decode_tps) || 0, peakRamMb: Number(response?.peak_ram_mb) || 0 }
        };
    } finally { runtime._free(outputPointer); }
}

async function handle(event) {
    const { id, type, options = {} } = event.data || {};
    try {
        if (type === 'status') return reply(id, { ok: true, cached: await installed(), loaded: !!moduleInstance, version: VERSION });
        if (type === 'install') {
            await load(id);
            return reply(id, { ok: true, cached: true, loaded: true, version: VERSION });
        }
        if (type === 'remove') {
            moduleInstance = null;
            await self.caches?.delete(CACHE_NAME);
            return reply(id, { ok: true });
        }
        if (type === 'unload') { moduleInstance = null; return reply(id, { ok: true }); }
        if (type === 'complete') return reply(id, await complete(id, options));
        throw new Error('Unknown TinyBrain 2 operation.');
    } catch (error) { reply(id, { ok: false, error: error?.message || String(error) }); }
}

self.onmessage = event => {
    operationTail = operationTail.then(() => handle(event), () => handle(event));
};
