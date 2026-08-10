(function () {
    'use strict';

    const VERSION = 2;
    const TASKS = new Map();
    const queue = [];
    let running = false;
    let config = null;
    let diagnosticSink = null;
    const callTimes = [];
    const cache = new Map();
    const diagnosticOnce = new Set();

    const DEFAULT_CONFIG = Object.freeze({
        enabled: false,
        runtime: 'connected',
        baseUrl: 'http://127.0.0.1:11434/v1',
        apiKey: '',
        model: '',
        embeddedModel: 'HuggingFaceTB/SmolLM2-135M-Instruct',
        embeddedDevice: 'auto',
        budget: 'balanced',
        policies: { chat: 'off', worlds: 'off', humans: 'off' },
        diagnosticsEnabled: true,
        pauseWithLocalGeneration: true,
        maxBackgroundCallsPerHour: 12,
        foregroundDeadlineMs: 900,
        backgroundDeadlineMs: 4000
    });

    const BUDGETS = Object.freeze({
        eco: { promptTokens: 320, outputTokens: 72, callsPerTurn: 1, callsPerHour: 6 },
        balanced: { promptTokens: 560, outputTokens: 120, callsPerTurn: 2, callsPerHour: 18 },
        responsive: { promptTokens: 900, outputTokens: 180, callsPerTurn: 3, callsPerHour: 40 }
    });

    function plainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function clamp(value, min, max) {
        const number = Number(value);
        return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min;
    }

    function isPrivateHost(hostname) {
        if (!hostname) return false;
        if (['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname)) return true;
        if (/^10\.\d+\.\d+\.\d+$/.test(hostname)) return true;
        if (/^172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(hostname)) return true;
        if (/^192\.168\.\d+\.\d+$/.test(hostname)) return true;
        return false;
    }

    function normalizeLoopbackBase(value) {
        let candidate = String(value || DEFAULT_CONFIG.baseUrl).trim().replace(/\/+$/, '');
        try {
            const parsed = new URL(candidate);
            if (!isPrivateHost(parsed.hostname)) {
                return DEFAULT_CONFIG.baseUrl;
            }
            if (!['http:', 'https:'].includes(parsed.protocol)) return DEFAULT_CONFIG.baseUrl;
            if (!/\/v1$/i.test(parsed.pathname)) candidate += '/v1';
            return candidate;
        } catch (error) {
            return DEFAULT_CONFIG.baseUrl;
        }
    }

    function normalizeConfig(raw) {
        const source = plainObject(raw) ? raw : {};
        const policies = plainObject(source.policies) ? source.policies : {};
        const policy = value => ['off', 'shadow', 'assist', 'audit'].includes(value) ? value : 'off';
        return {
            enabled: source.enabled === true,
            runtime: source.runtime === 'embedded' ? 'embedded' : 'connected',
            baseUrl: normalizeLoopbackBase(source.baseUrl),
            apiKey: String(source.apiKey || '').slice(0, 500),
            model: String(source.model || '').trim().slice(0, 300),
            embeddedModel: 'HuggingFaceTB/SmolLM2-135M-Instruct',
            embeddedDevice: ['auto', 'webgpu', 'wasm'].includes(source.embeddedDevice) ? source.embeddedDevice : 'auto',
            budget: ['eco', 'balanced', 'responsive'].includes(source.budget) ? source.budget : 'balanced',
            policies: {
                chat: policy(policies.chat),
                worlds: policy(policies.worlds),
                humans: policy(policies.humans)
            },
            diagnosticsEnabled: source.diagnosticsEnabled !== false,
            pauseWithLocalGeneration: source.pauseWithLocalGeneration !== false,
            maxBackgroundCallsPerHour: Math.round(clamp(source.maxBackgroundCallsPerHour || 12, 1, 120)),
            foregroundDeadlineMs: Math.round(clamp(source.foregroundDeadlineMs || 900, 250, 10000)),
            backgroundDeadlineMs: Math.round(clamp(source.backgroundDeadlineMs || 4000, 500, 30000))
        };
    }

    function configure(raw, options) {
        config = normalizeConfig(raw);
        diagnosticSink = typeof options?.onDiagnostic === 'function' ? options.onDiagnostic : diagnosticSink;
        return config;
    }

    function currentConfig() {
        return config || configure(DEFAULT_CONFIG);
    }

    function policyFor(mode, override) {
        if (['off', 'shadow', 'assist', 'audit'].includes(override)) return override;
        return currentConfig().policies[mode] || 'off';
    }

    function taskId(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 80);
    }

    function registerTask(name, definition) {
        const id = taskId(name);
        if (!id || !plainObject(definition) || !plainObject(definition.schema)) {
            throw new Error('Labs tasks require a safe name and JSON schema.');
        }
        TASKS.set(id, Object.freeze({
            id,
            mode: ['chat', 'worlds', 'humans', 'universal'].includes(definition.mode)
                ? definition.mode : 'universal',
            minimumTier: ['micro', 'small', 'extended'].includes(definition.minimumTier)
                ? definition.minimumTier : 'micro',
            system: String(definition.system || '').slice(0, 12000),
            embeddedSystem: String(definition.embeddedSystem || definition.system || '').slice(0, 12000),
            schema: definition.schema,
            maxInputChars: Math.round(clamp(definition.maxInputChars || 5000, 500, 20000)),
            maxOutputTokens: Math.round(clamp(definition.maxOutputTokens || 120, 24, 300)),
            cacheMs: Math.round(clamp(definition.cacheMs || 0, 0, 86400000)),
            background: definition.background === true,
            parseOutput: typeof definition.parseOutput === 'function' ? definition.parseOutput : null,
            validate: typeof definition.validate === 'function'
                ? definition.validate : (() => ({ ok: true, value: null }))
        }));
        return id;
    }

    function stableStringify(value) {
        if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
        if (plainObject(value)) return `{${Object.keys(value).sort().map(key =>
            `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
        return JSON.stringify(value);
    }

    function hash(value) {
        const text = stableStringify(value);
        let result = 2166136261;
        for (let index = 0; index < text.length; index += 1) {
            result ^= text.charCodeAt(index);
            result = Math.imul(result, 16777619);
        }
        return `labs_${(result >>> 0).toString(16)}_${text.length}`;
    }

    function parseJSON(text) {
        const source = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        try { return JSON.parse(source); } catch (error) { /* bounded recovery below */ }
        let depth = 0;
        let start = -1;
        let quoted = false;
        let escaped = false;
        for (let index = 0; index < source.length; index += 1) {
            const char = source[index];
            if (quoted) {
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === '"') quoted = false;
                continue;
            }
            if (char === '"') { quoted = true; continue; }
            if (char === '{') { if (depth === 0) start = index; depth += 1; }
            if (char === '}') {
                depth -= 1;
                if (depth === 0 && start >= 0) {
                    try { return JSON.parse(source.slice(start, index + 1)); }
                    catch (error) { start = -1; }
                }
            }
        }
        throw new Error('Local cognition returned malformed JSON.');
    }

    function contentFromResponse(data) {
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) return content.map(part => part?.text || '').join('');
        if (plainObject(content)) return JSON.stringify(content);
        return '';
    }

    function authHeaders() {
        const key = currentConfig().apiKey.trim();
        return key ? { Authorization: `Bearer ${key}` } : {};
    }

    function pruneCallTimes(now = Date.now()) {
        while (callTimes.length && now - callTimes[0] > 3600000) callTimes.shift();
    }

    function canSpendCall(background) {
        const settings = currentConfig();
        const budget = BUDGETS[settings.budget] || BUDGETS.balanced;
        pruneCallTimes();
        const limit = background
            ? Math.min(budget.callsPerHour, settings.maxBackgroundCallsPerHour)
            : budget.callsPerHour;
        return callTimes.length < limit;
    }

    function recordDiagnostic(entry) {
        if (!currentConfig().diagnosticsEnabled) return;
        const record = Object.freeze({
            id: `cog_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
            at: Date.now(), version: VERSION, ...entry
        });
        try { diagnosticSink?.(record); } catch (error) { /* diagnostics never break play */ }
    }

    async function requestStructured(task, envelope, signal) {
        const settings = currentConfig();
        const budget = BUDGETS[settings.budget] || BUDGETS.balanced;
        // Preserve envelope insertion order for inference. Stable sorting is
        // useful for cache hashes, but could push the actual player text behind
        // a large allowlist and then truncate the most important field.
        const input = JSON.stringify(envelope).slice(0, Math.min(task.maxInputChars, budget.promptTokens * 4));
        if (settings.runtime === 'embedded') {
            if (!window.HordeLabsEmbedded) throw new Error('Embedded Tiny Brain runtime is unavailable.');
            const result = await window.HordeLabsEmbedded.completeStructured({
                model: settings.embeddedModel,
                device: settings.embeddedDevice === 'auto' ? (navigator.gpu ? 'webgpu' : 'wasm') : settings.embeddedDevice,
                dtype: 'q4', system: task.embeddedSystem, input,
                maxTokens: Math.min(task.maxOutputTokens, budget.outputTokens)
            }, signal);
            return task.parseOutput ? task.parseOutput(result.text, envelope) : parseJSON(result.text);
        }
        const request = {
            model: settings.model,
            messages: [
                { role: 'system', content: task.system },
                { role: 'user', content: input }
            ],
            temperature: 0,
            max_tokens: Math.min(task.maxOutputTokens, budget.outputTokens),
            stream: false,
            response_format: {
                type: 'json_schema',
                json_schema: { name: `horde_${task.id}`, strict: true, schema: task.schema }
            }
        };
        const endpoint = currentConfig().baseUrl.replace(/\/+$/, '') + '/chat/completions';
        const send = body => fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(body), signal
        });
        let response = await send(request);
        let raw = await response.text();
        if (!response.ok && /response[_ ]format|json[_ ]schema|structured/i.test(raw)) {
            response = await send({ ...request, response_format: { type: 'json_object' } });
            raw = await response.text();
        }
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch (error) { data = {}; }
        if (!response.ok) throw new Error(data?.error?.message || data?.message || `Local cognition failed (${response.status}).`);
        const content = contentFromResponse(data);
        try { return parseJSON(content); }
        catch (error) {
            if (task.parseOutput) return task.parseOutput(content, envelope);
            throw error;
        }
    }

    function executeQueued(job) {
        return new Promise(resolve => {
            queue.push({ ...job, resolve });
            queue.sort((left, right) => right.priority - left.priority || left.queuedAt - right.queuedAt);
            drainQueue();
        });
    }

    async function drainQueue() {
        if (running) return;
        running = true;
        while (queue.length) {
            const job = queue.shift();
            try { job.resolve(await execute(job)); }
            catch (error) { job.resolve({ ok: false, skipped: false, reason: error.message || String(error) }); }
        }
        running = false;
    }

    async function execute(job) {
        const startedAt = Date.now();
        const settings = currentConfig();
        const task = TASKS.get(job.task);
        const configuredTimeout = job.background ? settings.backgroundDeadlineMs : settings.foregroundDeadlineMs;
        // A 135M browser model is cheap but not network-fast on every CPU. Give
        // the isolated worker a realistic deadline; failures still fall back.
        const timeoutMs = settings.runtime === 'embedded'
            ? Math.max(configuredTimeout, job.background ? 60000 : 30000)
            : configuredTimeout;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let candidate;
        let validation;
        let reason = '';
        try {
            callTimes.push(Date.now());
            candidate = await requestStructured(task, job.envelope, controller.signal);
            validation = task.validate(candidate, job.envelope);
            if (!plainObject(validation)) validation = { ok: false, reason: 'Task validator returned no decision.' };
            reason = String(validation.reason || (validation.ok ? 'Validated.' : 'Rejected by task validator.'));
            if (task.cacheMs > 0 && validation.ok) {
                cache.set(job.cacheKey, {
                    expiresAt: Date.now() + task.cacheMs,
                    candidate: validation.value === undefined ? candidate : validation.value
                });
            }
            const accepted = validation.ok === true && ['assist', 'audit'].includes(job.policy);
            recordDiagnostic({
                mode: job.mode, task: task.id, policy: job.policy, accepted,
                valid: validation.ok === true, reason, latencyMs: Date.now() - startedAt,
                inputHash: job.cacheKey, confidence: clamp(candidate?.confidence, 0, 1)
            });
            return {
                ok: validation.ok === true,
                accepted,
                shadow: job.policy === 'shadow',
                candidate: validation.value === undefined ? candidate : validation.value,
                reason,
                latencyMs: Date.now() - startedAt,
                source: 'local_cognition'
            };
        } catch (error) {
            reason = controller.signal.aborted ? `Timed out after ${timeoutMs} ms.` : (error.message || String(error));
            recordDiagnostic({
                mode: job.mode, task: task.id, policy: job.policy, accepted: false,
                valid: false, reason, latencyMs: Date.now() - startedAt, inputHash: job.cacheKey
            });
            return { ok: false, accepted: false, shadow: job.policy === 'shadow', reason, latencyMs: Date.now() - startedAt };
        } finally {
            clearTimeout(timer);
        }
    }

    async function propose(taskName, envelope, options) {
        const settings = currentConfig();
        const task = TASKS.get(taskId(taskName));
        const mode = options?.mode || task?.mode || 'universal';
        const policy = policyFor(mode, options?.policy);
        if (!task) return { ok: false, skipped: true, reason: 'Unknown cognition task.' };
        if (!settings.enabled || policy === 'off') return { ok: false, skipped: true, reason: 'Local cognition is off.' };
        if (settings.runtime === 'connected' && (!settings.model || !settings.baseUrl)) return { ok: false, skipped: true, reason: 'Local cognition is not configured.' };
        if (!plainObject(envelope)) return { ok: false, skipped: true, reason: 'Cognition envelope must be an object.' };
        // An unrecognised model is allowed to attempt Micro classifiers, but it
        // must never bypass the Small/Extended gates merely because its name is
        // unfamiliar. The previous `unknown: 99` made unknown mean strongest.
        const ranks = { unknown: 1, micro: 1, small: 2, extended: 3 };
        const effectiveModel = settings.runtime === 'embedded' ? 'smollm2-135m' : settings.model;
        const tier = capabilityTier(effectiveModel);
        if (ranks[tier] < ranks[task.minimumTier]) {
            const reason = `${task.id} needs a ${task.minimumTier}-tier model; ${effectiveModel} was detected as ${tier}.`;
            const diagnosticKey = `${mode}|${task.id}|${policy}|${effectiveModel}|${reason}`;
            if (!diagnosticOnce.has(diagnosticKey)) {
                diagnosticOnce.add(diagnosticKey);
                recordDiagnostic({ mode, task: task.id, policy, accepted: false, valid: false, skipped: true, reason, latencyMs: 0 });
            }
            return { ok: false, skipped: true, reason };
        }
        if (!canSpendCall(task.background || options?.background)) {
            return { ok: false, skipped: true, reason: 'Local cognition budget reached.' };
        }
        const cacheKey = hash({ task: task.id, envelope });
        const cached = cache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return { ok: true, accepted: policy !== 'shadow', shadow: policy === 'shadow', candidate: cached.candidate, source: 'cache', latencyMs: 0 };
        }
        return executeQueued({
            task: task.id, envelope, mode, policy, cacheKey,
            background: task.background || options?.background === true,
            priority: Number(options?.priority) || (task.background ? 10 : 100),
            queuedAt: Date.now()
        });
    }

    async function health(rawConfig) {
        const settings = normalizeConfig(rawConfig || currentConfig());
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const startedAt = Date.now();
        try {
            const response = await fetch(settings.baseUrl.replace(/\/+$/, '') + '/models', {
                headers: settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {},
                signal: controller.signal
            });
            const raw = await response.text();
            let data = {};
            try { data = raw ? JSON.parse(raw) : {}; } catch (error) { data = {}; }
            if (!response.ok) throw new Error(data?.error?.message || data?.message || `Server returned ${response.status}.`);
            const models = (Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [])
                .map(item => String(item?.id || item?.name || item?.model || '')).filter(Boolean).slice(0, 200);
            return { ok: true, models, latencyMs: Date.now() - startedAt, baseUrl: settings.baseUrl };
        } catch (error) {
            return { ok: false, models: [], latencyMs: Date.now() - startedAt,
                reason: controller.signal.aborted ? 'Connection timed out.' : (error.message || String(error)), baseUrl: settings.baseUrl };
        } finally {
            clearTimeout(timer);
        }
    }

    async function discover() {
        const candidates = [
            'http://127.0.0.1:11434/v1',
            'http://127.0.0.1:1234/v1',
            'http://127.0.0.1:8080/v1',
            'http://127.0.0.1:5001/v1',
            'http://192.168.1.100:11434/v1',
            'http://192.168.1.100:4000/v1',
            'http://192.168.2.16:11434/v1',
            'http://192.168.2.16:4000/v1',
            'http://192.168.10.65:4000/v1',
            'http://10.0.0.100:11434/v1',
            'http://10.0.0.100:4000/v1'
        ];
        const results = await Promise.all(candidates.map(baseUrl => health({ ...currentConfig(), baseUrl }))));
        return results.filter(result => result.ok);
    }

    async function completeText(options = {}) {
        const settings = normalizeConfig(options.config || currentConfig());
        if (settings.runtime === 'connected' && (!settings.model || !settings.baseUrl)) {
            throw new Error('Choose a local model before opening Tiny Guide.');
        }
        const system = String(options.system || '').slice(0, 10000);
        const input = String(options.input || '').slice(0, 6000);
        const maxTokens = Math.round(clamp(options.maxTokens || 160, 40, 240));
        const temperature = clamp(options.temperature ?? 0.35, 0, 1);
        const startedAt = Date.now();
        const controller = new AbortController();
        const timeoutMs = settings.runtime === 'embedded' ? 60000 : 15000;
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            let text = '';
            if (settings.runtime === 'embedded') {
                if (!window.HordeLabsEmbedded) throw new Error('Embedded Tiny Brain runtime is unavailable.');
                const result = await window.HordeLabsEmbedded.completeStructured({
                    model: settings.embeddedModel,
                    device: settings.embeddedDevice === 'auto' ? (navigator.gpu ? 'webgpu' : 'wasm') : settings.embeddedDevice,
                    dtype: 'q4', system, input, maxTokens, temperature
                }, controller.signal);
                text = String(result.text || '').trim();
            } else {
                const response = await fetch(settings.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
                    method: 'POST', signal: controller.signal,
                    headers: { 'Content-Type': 'application/json', ...(settings.apiKey.trim() ? { Authorization: `Bearer ${settings.apiKey.trim()}` } : {}) },
                    body: JSON.stringify({
                        model: settings.model,
                        messages: [{ role: 'system', content: system }, { role: 'user', content: input }],
                        temperature, max_tokens: maxTokens, stream: false
                    })
                });
                const raw = await response.text();
                let data = {};
                try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}
                if (!response.ok) throw new Error(data?.error?.message || data?.message || `Tiny Guide failed (${response.status}).`);
                text = contentFromResponse(data).trim();
            }
            if (!text) throw new Error('Tiny Guide returned an empty reply.');
            recordDiagnostic({ mode: 'universal', task: 'tiny_guide', policy: 'manual', accepted: true,
                valid: true, reason: 'Manual guide reply completed.', latencyMs: Date.now() - startedAt });
            return { text: text.slice(0, 4000), latencyMs: Date.now() - startedAt };
        } catch (error) {
            const reason = controller.signal.aborted ? `Timed out after ${timeoutMs} ms.` : (error.message || String(error));
            recordDiagnostic({ mode: 'universal', task: 'tiny_guide', policy: 'manual', accepted: false,
                valid: false, reason, latencyMs: Date.now() - startedAt });
            throw new Error(reason);
        } finally { clearTimeout(timer); }
    }

    function capabilityTier(model) {
        const id = String(model || '').toLowerCase();
        if (/135m|150m|160m|270m|350m|360m|0\.1b|0\.13b|0\.15b|0\.16b|0\.2b|0\.27b|0\.3b|0\.35b|0\.36b|0\.4b/.test(id)) return 'micro';
        if (/0\.5b|0\.6b|0\.7b|500m|600m|700m/.test(id)) return 'small';
        if (/1b|1\.5b|1\.7b|2b|3b|4b/.test(id)) return 'extended';
        return 'unknown';
    }

    function taskCapabilities(rawConfig) {
        const settings = normalizeConfig(rawConfig || currentConfig());
        const model = settings.runtime === 'embedded' ? 'smollm2-135m' : settings.model;
        const tier = capabilityTier(model);
        const ranks = { unknown: 1, micro: 1, small: 2, extended: 3 };
        return [...TASKS.values()].map(task => ({
            id: task.id, mode: task.mode, minimumTier: task.minimumTier,
            available: ranks[tier] >= ranks[task.minimumTier], tier
        }));
    }

    window.HordeLabs = Object.freeze({
        VERSION, BUDGETS, normalizeConfig, configure, currentConfig,
        registerTask, propose, health, discover, completeText, policyFor, capabilityTier, taskCapabilities,
        tasks: () => [...TASKS.values()].map(task => ({
            id: task.id, mode: task.mode, minimumTier: task.minimumTier, background: task.background
        }))
    });
})();
