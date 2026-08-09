(function () {
    'use strict';
    let worker = null;
    let sequence = 0;
    const pending = new Map();

    function ensureWorker() {
        if (worker) return worker;
        worker = new Worker('labs-embedded-worker.js?v=20260809-embedded-hud-v2', { type: 'module', name: 'horde-tiny-brain' });
        worker.onmessage = event => {
            const message = event.data || {};
            const job = pending.get(message.id);
            if (!job) return;
            if (message.progress) { job.onProgress?.(message); return; }
            pending.delete(message.id);
            message.ok ? job.resolve(message) : job.reject(new Error(message.error || 'Embedded cognition failed.'));
        };
        worker.onerror = event => {
            const error = new Error(event.message || 'The Embedded Tiny Brain worker could not start.');
            pending.forEach(job => job.reject(error)); pending.clear();
            worker?.terminate(); worker = null;
        };
        return worker;
    }

    function request(type, options = {}, onProgress, signal) {
        return new Promise((resolve, reject) => {
            const id = `embedded_${Date.now().toString(36)}_${++sequence}`;
            const abort = () => {
                // Generation cannot be interrupted safely in place. The worker
                // is the cancellation boundary; cached model weights survive.
                // Reject every request attached to that worker so a concurrent
                // cache-status check cannot remain pending forever.
                const error = new DOMException('Embedded cognition timed out.', 'AbortError');
                if (!pending.has(id)) { reject(error); return; }
                const jobs = [...pending.values()];
                pending.clear();
                worker?.terminate(); worker = null;
                jobs.forEach(job => job.reject(error));
            };
            if (signal?.aborted) return abort();
            signal?.addEventListener('abort', abort, { once: true });
            pending.set(id, {
                onProgress,
                resolve: value => { signal?.removeEventListener('abort', abort); resolve(value); },
                reject: error => { signal?.removeEventListener('abort', abort); reject(error); }
            });
            ensureWorker().postMessage({ id, type, options });
        });
    }

    async function install(options, onProgress) { return request('install', options, onProgress); }
    async function status(options) { return request('status', options); }
    async function remove(options) { return request('remove', options); }
    async function completeStructured(options, signal) { return request('generate', options, null, signal); }
    async function unload() {
        if (!worker) return;
        try { await request('unload'); } finally { worker.terminate(); worker = null; }
    }

    window.HordeLabsEmbedded = Object.freeze({ install, status, remove, completeStructured, unload });
})();
