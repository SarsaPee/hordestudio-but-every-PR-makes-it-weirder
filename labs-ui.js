(function () {
    'use strict';

    let host = null;
    let draft = null;
    let models = [];
    let embeddedInstalled = false;

    const byId = id => document.getElementById(id);
    const escapeHTML = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));

    function configFromForm() {
        return window.HordeLabs.normalizeConfig({
            enabled: byId('labs-enabled').checked,
            runtime: document.querySelector('input[name="labs-runtime"]:checked')?.value || 'connected',
            baseUrl: byId('labs-base-url').value,
            apiKey: byId('labs-api-key').value,
            model: byId('labs-model-search').value,
            embeddedDevice: byId('labs-embedded-device').value,
            budget: byId('labs-budget').value,
            policies: {
                chat: byId('labs-policy-chat').value,
                worlds: byId('labs-policy-worlds').value,
                humans: byId('labs-policy-humans').value
            },
            diagnosticsEnabled: byId('labs-diagnostics-enabled').checked,
            pauseWithLocalGeneration: true,
            maxBackgroundCallsPerHour: draft?.maxBackgroundCallsPerHour,
            foregroundDeadlineMs: draft?.foregroundDeadlineMs,
            backgroundDeadlineMs: draft?.backgroundDeadlineMs
        });
    }

    function fillForm(config) {
        draft = window.HordeLabs.normalizeConfig(config);
        byId('labs-enabled').checked = draft.enabled;
        byId('labs-base-url').value = draft.baseUrl;
        byId('labs-api-key').value = draft.apiKey;
        byId('labs-model-search').value = draft.model;
        byId('labs-embedded-device').value = draft.embeddedDevice;
        document.querySelectorAll('input[name="labs-runtime"]').forEach(input => { input.checked = input.value === draft.runtime; });
        byId('labs-budget').value = draft.budget;
        byId('labs-policy-chat').value = draft.policies.chat;
        byId('labs-policy-worlds').value = draft.policies.worlds;
        byId('labs-policy-humans').value = draft.policies.humans;
        byId('labs-diagnostics-enabled').checked = draft.diagnosticsEnabled;
        renderRuntime();
        renderStatus(draft);
    }

    function renderRuntime() {
        const embedded = (document.querySelector('input[name="labs-runtime"]:checked')?.value || 'connected') === 'embedded';
        ['labs-connected-setup', 'labs-connected-actions', 'labs-connected-model'].forEach(id => byId(id).classList.toggle('hidden', embedded));
        byId('labs-embedded-setup').classList.toggle('hidden', !embedded);
        document.querySelectorAll('.labs-runtime-card').forEach(card => card.classList.toggle('selected', card.querySelector('input')?.checked));
        renderStatus(configFromForm());
        if (embedded) void refreshEmbeddedStatus();
    }

    function renderStatus(config = configFromForm(), connection) {
        const enabled = config.enabled;
        const embedded = config.runtime === 'embedded';
        const configured = embedded ? embeddedInstalled : !!config.model;
        const dot = byId('labs-status-dot');
        dot.className = `labs-status-dot ${enabled && configured ? 'ready' : enabled ? 'waiting' : ''}`;
        byId('labs-status-label').textContent = !enabled ? 'Local cognition is off'
            : connection?.ok ? `Connected · ${connection.latencyMs} ms`
            : configured ? (embedded ? 'Embedded Tiny Brain is ready' : 'Ready to use local cognition')
            : embedded ? 'Install the Embedded Tiny Brain' : 'Choose a local model';
        byId('labs-status-copy').textContent = !enabled
            ? 'Normal Horde Studio behavior is unchanged.'
            : embedded ? 'Cognition stays on this device. Your main text, image and voice settings are untouched.'
            : 'Only enabled modes may call this local server. Cloud text, image and voice settings are untouched.';
        const tier = window.HordeLabs.capabilityTier(embedded ? 'smollm2-135m' : config.model);
        byId('labs-tier-badge').textContent = configured ? `${tier === 'unknown' ? 'Unrated' : tier} tier` : 'No model';
        byId('labs-sidebar-state').textContent = enabled ? (configured ? 'On' : 'Setup') : 'Off';
        byId('labs-sidebar-state').classList.toggle('active', enabled && configured);
    }

    function embeddedOptions() {
        const preference = byId('labs-embedded-device').value;
        return {
            model: 'HuggingFaceTB/SmolLM2-135M-Instruct', dtype: 'q4',
            device: preference === 'auto' ? (navigator.gpu ? 'webgpu' : 'wasm') : preference
        };
    }

    function showEmbeddedState(installed, copy) {
        embeddedInstalled = installed;
        byId('labs-embedded-state').textContent = installed ? 'Installed' : 'Not installed';
        byId('labs-embedded-install-btn').classList.toggle('hidden', installed);
        byId('labs-embedded-remove-btn').classList.toggle('hidden', !installed);
        if (copy) byId('labs-install-status').textContent = copy;
        renderStatus(configFromForm());
    }

    async function refreshEmbeddedStatus() {
        if (!window.HordeLabsEmbedded) return showEmbeddedState(false, 'This browser cannot start the embedded runtime.');
        try {
            const result = await window.HordeLabsEmbedded.status(embeddedOptions());
            showEmbeddedState(result.cached === true, result.cached
                ? 'Ready. The downloaded model is cached in this browser and can work without an inference server.'
                : 'Nothing downloads until you press Install. The model runs only narrow Labs tasks; it does not replace your main chat model.');
        } catch (error) {
            showEmbeddedState(false, `Could not inspect the browser model cache: ${error.message}`);
        }
    }

    async function installEmbedded() {
        const button = byId('labs-embedded-install-btn');
        busy(button, true, 'Installing…');
        byId('labs-install-status').textContent = 'Starting the on-device model download… keep Horde Studio open.';
        try {
            const result = await window.HordeLabsEmbedded.install(embeddedOptions(), progress => {
                const percent = Number(progress.percent) || 0;
                byId('labs-install-progress-fill').style.width = `${percent}%`;
                byId('labs-install-status').textContent = `${progress.status || 'Downloading'}${progress.file ? ` · ${progress.file}` : ''}${percent ? ` · ${percent}%` : ''}`;
            });
            byId('labs-install-progress-fill').style.width = '100%';
            showEmbeddedState(true, `Installed and loaded with ${result.device === 'webgpu' ? 'WebGPU' : 'CPU/WASM'}. It will remain cached in this browser.`);
            host.toast?.('Embedded Tiny Brain installed.', 'success');
        } catch (error) {
            showEmbeddedState(false, `Install failed: ${error.message}. Check your connection, browser storage and WebGPU/WASM support.`);
            host.toast?.(`Tiny Brain install failed: ${error.message}`, 'error');
        } finally { busy(button, false); }
    }

    async function removeEmbedded() {
        const button = byId('labs-embedded-remove-btn');
        busy(button, true, 'Removing…');
        try {
            await window.HordeLabsEmbedded.remove(embeddedOptions());
            byId('labs-install-progress-fill').style.width = '0%';
            showEmbeddedState(false, 'Downloaded model removed from this browser.');
            host.toast?.('Embedded Tiny Brain removed.', 'success');
        } catch (error) { host.toast?.(`Could not remove Tiny Brain: ${error.message}`, 'error'); }
        finally { busy(button, false); }
    }

    function setModels(nextModels) {
        models = [...new Set((nextModels || []).filter(Boolean))];
        byId('labs-model-list').innerHTML = models.map(model => `<option value="${escapeHTML(model)}"></option>`).join('');
        byId('labs-model-help').textContent = models.length
            ? `${models.length} local model${models.length === 1 ? '' : 's'} found. Small instruct models are ideal for these narrow tasks.`
            : 'No models reported. You may still enter an exact local model ID.';
    }

    function diagnostics() {
        return Array.isArray(host?.getDiagnostics?.()) ? host.getDiagnostics().slice(-100) : [];
    }

    function renderDiagnostics() {
        const rows = diagnostics();
        const completed = rows.filter(row => !row.skipped);
        const valid = completed.filter(row => row.valid).length;
        const accepted = completed.filter(row => row.accepted).length;
        const latencies = completed.map(row => Number(row.latencyMs)).filter(Number.isFinite).sort((a, b) => a - b);
        const median = latencies.length ? latencies[Math.floor(latencies.length / 2)] : 0;
        byId('labs-diagnostic-stats').innerHTML = [
            ['Runs', completed.length], ['Valid', completed.length ? `${Math.round(valid / completed.length * 100)}%` : '—'],
            ['Accepted', accepted], ['Median', latencies.length ? `${median} ms` : '—']
        ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('');
        byId('labs-diagnostic-list').innerHTML = rows.length ? rows.slice(-12).reverse().map(row => `
            <div class="labs-diagnostic-row">
                <span class="labs-result ${row.valid ? 'valid' : 'invalid'}">${row.valid ? '✓' : '×'}</span>
                <div><strong>${escapeHTML(String(row.task || 'task').replaceAll('_', ' '))}</strong><span>${escapeHTML(row.mode || '')} · ${escapeHTML(row.policy || '')} · ${Number(row.latencyMs) || 0} ms</span></div>
                <small title="${escapeHTML(row.reason || '')}">${escapeHTML(row.reason || '')}</small>
            </div>`).join('') : '<div class="labs-empty">No cognition receipts yet. Shadow mode is the safest way to collect them.</div>';
    }

    function busy(button, active, label) {
        if (!button.dataset.label) button.dataset.label = button.textContent;
        button.disabled = active;
        button.textContent = active ? label : button.dataset.label;
    }

    async function testConnection() {
        const button = byId('labs-test-btn');
        busy(button, true, 'Testing…');
        try {
            const result = await window.HordeLabs.health(configFromForm());
            if (!result.ok) throw new Error(result.reason || 'Could not connect.');
            setModels(result.models);
            if (!byId('labs-model-search').value && result.models[0]) byId('labs-model-search').value = result.models[0];
            renderStatus(configFromForm(), result);
            host.toast?.(`Local cognition connected in ${result.latencyMs} ms.`, 'success');
        } catch (error) {
            renderStatus(configFromForm());
            host.toast?.(`Labs connection failed: ${error.message}`, 'error');
        } finally { busy(button, false); }
    }

    async function discover() {
        const button = byId('labs-discover-btn');
        busy(button, true, 'Searching…');
        try {
            window.HordeLabs.configure(configFromForm());
            const results = await window.HordeLabs.discover();
            if (!results.length) throw new Error('No compatible server answered on the common local ports.');
            const best = results[0];
            byId('labs-base-url').value = best.baseUrl;
            setModels(best.models);
            if (!byId('labs-model-search').value && best.models[0]) byId('labs-model-search').value = best.models[0];
            renderStatus(configFromForm(), best);
            host.toast?.(`Found ${results.length} local server${results.length === 1 ? '' : 's'}.`, 'success');
        } catch (error) { host.toast?.(error.message, 'error'); }
        finally { busy(button, false); }
    }

    function close() {
        if (host) renderStatus(host.getConfig());
        byId('labs-overlay').classList.add('hidden');
        byId('labs-overlay').setAttribute('aria-hidden', 'true');
    }

    function open() {
        fillForm(host.getConfig());
        renderDiagnostics();
        byId('labs-overlay').classList.remove('hidden');
        byId('labs-overlay').setAttribute('aria-hidden', 'false');
        if (draft.runtime === 'embedded') void refreshEmbeddedStatus();
    }

    function mount(options) {
        host = options;
        fillForm(host.getConfig());
        byId('labs-close-btn').onclick = close;
        byId('labs-cancel-btn').onclick = close;
        byId('labs-test-btn').onclick = testConnection;
        byId('labs-discover-btn').onclick = discover;
        byId('labs-embedded-install-btn').onclick = installEmbedded;
        byId('labs-embedded-remove-btn').onclick = removeEmbedded;
        document.querySelectorAll('input[name="labs-runtime"]').forEach(input => input.onchange = renderRuntime);
        byId('labs-clear-diagnostics-btn').onclick = async () => {
            await host.clearDiagnostics?.();
            renderDiagnostics();
        };
        byId('labs-save-btn').onclick = async () => {
            const next = configFromForm();
            if (next.enabled && next.runtime === 'connected' && !next.model) return host.toast?.('Choose a local cognition model before enabling Labs.', 'error');
            if (next.enabled && next.runtime === 'embedded' && !embeddedInstalled) return host.toast?.('Install the Embedded Tiny Brain before enabling it.', 'error');
            await host.setConfig(next);
            draft = next;
            renderStatus(next);
            close();
        };
        ['labs-enabled', 'labs-model-search', 'labs-policy-chat', 'labs-policy-worlds', 'labs-policy-humans']
            .forEach(id => byId(id).addEventListener('change', () => renderStatus(configFromForm())));
        byId('labs-overlay').addEventListener('mousedown', event => {
            if (event.target === byId('labs-overlay')) close();
        });
    }

    window.HordeLabsUI = Object.freeze({ mount, open, close, renderDiagnostics, renderStatus });
})();
