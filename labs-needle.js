(function () {
    'use strict';

    let worker = null;
    let sequence = 0;
    const pending = new Map();

    function localServerError() {
        const error = new Error(
            'TinyBrain 2 needs Horde Studio’s local app server. Run “Start Horde Studio”, then open the http://127.0.0.1 page.'
        );
        error.code = 'HORDE_FILE_WORKER_BLOCKED';
        return error;
    }

    function ensureWorker() {
        if (worker) return worker;
        if (location.protocol === 'file:') throw localServerError();
        const workerUrl = new URL('labs-needle-worker.js?v=20260822-v161', document.baseURI);
        worker = new Worker(workerUrl, { name: 'horde-tinybrain2' });
        worker.onmessage = event => {
            const message = event.data || {};
            const job = pending.get(message.id);
            if (!job) return;
            if (message.progress) { job.onProgress?.(message); return; }
            pending.delete(message.id);
            message.ok ? job.resolve(message) : job.reject(new Error(message.error || 'TinyBrain 2 failed.'));
        };
        worker.onerror = event => {
            const error = new Error(event.message || 'TinyBrain 2 worker could not start.');
            pending.forEach(job => job.reject(error));
            pending.clear();
            worker?.terminate();
            worker = null;
        };
        return worker;
    }

    function request(type, options = {}, onProgress, signal) {
        return new Promise((resolve, reject) => {
            const id = `needle_${Date.now().toString(36)}_${++sequence}`;
            const abort = () => {
                const error = new DOMException('TinyBrain 2 timed out.', 'AbortError');
                const jobs = [...pending.values()];
                pending.clear();
                worker?.terminate();
                worker = null;
                jobs.forEach(job => job.reject(error));
            };
            if (signal?.aborted) return abort();
            signal?.addEventListener('abort', abort, { once: true });
            pending.set(id, {
                onProgress,
                resolve: value => { signal?.removeEventListener('abort', abort); resolve(value); },
                reject: error => { signal?.removeEventListener('abort', abort); reject(error); }
            });
            try { ensureWorker().postMessage({ id, type, options }); }
            catch (error) {
                pending.delete(id);
                signal?.removeEventListener('abort', abort);
                reject(error);
            }
        });
    }

    const install = (options, onProgress) => request('install', options, onProgress);
    const status = options => request('status', options);
    const remove = options => request('remove', options);
    const completeStructured = (options, signal) => request('complete', options, null, signal);
    async function unload() {
        if (!worker) return;
        try { await request('unload'); } finally { worker.terminate(); worker = null; }
    }

    window.HordeLabsNeedle = Object.freeze({ install, status, remove, completeStructured, unload });
})();
