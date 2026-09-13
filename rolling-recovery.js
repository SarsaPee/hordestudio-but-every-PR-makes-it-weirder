/*
 * Current-host rolling recovery library.
 *
 * This deliberately transports opaque domain-backup manifests through the
 * current bridge. It never probes a legacy origin, selects an authority, or
 * automatically replaces browser state. Unlike downloadable/shareable
 * exports, this trusted-device recovery channel intentionally carries the
 * configured provider credentials needed to resume work after restore.
 */
(() => {
    'use strict';

    const PREFIX = 'hordeRollingRecovery:';
    const keys = {
        deviceId: `${PREFIX}deviceId`,
        label: `${PREFIX}deviceLabel`,
        meta: `${PREFIX}meta`,
        policy: `${PREFIX}policy`
    };
    const runtime = { ready: false, dirty: false, publishing: false, revision: 0, timer: null, history: [] };

    const clone = value => JSON.parse(JSON.stringify(value));
    const escapeHTML = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[char]);
    const local = {
        get(key, fallback = '') { try { return localStorage.getItem(key) || fallback; } catch (_) { return fallback; } },
        set(key, value) { try { localStorage.setItem(key, value); } catch (_) { /* Browser storage is optional. */ } }
    };
    const defaultLabel = () => /Mac/i.test(navigator.platform || navigator.userAgent) ? 'Mac browser' : 'Horde browser';
    const deviceId = () => {
        let id = local.get(keys.deviceId);
        if (!id) {
            id = crypto.randomUUID?.() || `horde-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            local.set(keys.deviceId, id);
        }
        return id;
    };
    const deviceLabel = () => local.get(keys.label, defaultLabel()).trim().slice(0, 80) || defaultLabel();
    const meta = () => { try { return JSON.parse(local.get(keys.meta, '{}')); } catch (_) { return {}; } };
    const saveMeta = patch => {
        const next = { ...meta(), ...patch };
        runtime.revision = Number(next.revision) || 0;
        local.set(keys.meta, JSON.stringify(next));
    };
    const policy = () => {
        try {
            const saved = JSON.parse(local.get(keys.policy, '{}'));
            return {
                periodic: saved.periodic !== false,
                minutes: Math.max(1, Math.min(1440, Number(saved.minutes) || 5)),
                afterChange: saved.afterChange === true
            };
        } catch (_) { return { periodic: true, minutes: 5, afterChange: false }; }
    };
    const savePolicy = patch => {
        const next = { ...policy(), ...patch };
        next.minutes = Math.max(1, Math.min(1440, Number(next.minutes) || 5));
        next.periodic = next.periodic !== false;
        next.afterChange = next.afterChange === true;
        local.set(keys.policy, JSON.stringify(next));
        configureTimer();
        renderPolicy();
    };
    const query = () => new URLSearchParams({ deviceId: deviceId(), label: deviceLabel() });
    const request = async (path, options = {}) => {
        const response = await fetch(`${location.origin}${path}`, {
            method: options.method || 'GET', cache: 'no-store',
            headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
            body: options.body ? JSON.stringify(options.body) : undefined
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.error || `Recovery bridge request failed (${response.status}).`);
            error.status = response.status;
            error.data = data;
            throw error;
        }
        return data;
    };
    const setStatus = message => {
        const node = document.getElementById('rolling-recovery-status');
        if (node) node.textContent = message;
    };
    const applyStatus = data => {
        runtime.revision = Number(data?.revision) || runtime.revision;
        saveMeta({ revision: runtime.revision, updatedAt: Number(data?.updatedAt) || 0 });
        const updated = data?.updatedAt ? new Date(data.updatedAt).toLocaleString() : 'not yet';
        setStatus(data?.available
            ? `Recovery point r${runtime.revision} published by ${data.updatedBy || 'an unknown device'} at ${updated}. Pulling or restoring is always explicit.`
            : 'No rolling recovery point has been published yet.');
    };
    const formatPoint = point => {
        const at = point?.archivedAt ? new Date(point.archivedAt).toLocaleString() : 'Unknown time';
        const size = Number(point?.bytes) ? `${(Number(point.bytes) / 1024 / 1024).toFixed(1)} MB` : 'size unknown';
        return `r${point?.revision ?? '?'} · ${at} · ${point?.updatedBy || 'unknown device'} · ${size} · ${String(point?.trigger || 'publish').replaceAll('_', ' ')}`;
    };
    const renderHistory = () => {
        const select = document.getElementById('rolling-recovery-history');
        const restore = document.getElementById('rolling-recovery-restore');
        if (!select || !restore) return;
        select.innerHTML = runtime.history.length
            ? runtime.history.map(point => `<option value="${escapeHTML(point.id)}">${escapeHTML(formatPoint(point))}</option>`).join('')
            : '<option value="">No prior recovery points yet</option>';
        select.disabled = !runtime.history.length;
        restore.disabled = !runtime.history.length;
    };
    const renderPolicy = () => {
        const current = policy();
        const periodic = document.getElementById('rolling-recovery-periodic');
        const minutes = document.getElementById('rolling-recovery-minutes');
        const change = document.getElementById('rolling-recovery-on-change');
        if (periodic) periodic.checked = current.periodic;
        if (minutes) { minutes.value = current.minutes; minutes.disabled = !current.periodic; }
        if (change) change.checked = current.afterChange;
    };
    const refresh = async () => {
        const data = await request(`/recovery/status?${query()}`);
        applyStatus(data);
        return data;
    };
    const refreshHistory = async () => {
        const data = await request(`/recovery/history?${query()}`);
        applyStatus(data);
        runtime.history = Array.isArray(data.history) ? data.history : [];
        renderHistory();
        return runtime.history;
    };
    const publish = async ({ manual = false, trigger = 'manual' } = {}) => {
        if (!runtime.ready || runtime.publishing || !window.HordeBackupDomains) return null;
        runtime.publishing = true;
        try {
            const snapshot = await window.HordeBackupDomains.export({
                purpose: 'rolling-recovery',
                includeCredentials: true
            });
            const data = await request('/recovery/publish', {
                method: 'POST',
                body: { deviceId: deviceId(), label: deviceLabel(), baseRevision: runtime.revision, snapshot, trigger }
            });
            applyStatus(data);
            runtime.dirty = false;
            if (manual) window.showToast?.(data.unchanged ? 'This recovery point is already current.' : `Recovery point r${data.revision} published.`, 'success');
            return data;
        } catch (error) {
            if (error.status === 409) {
                applyStatus(error.data || {});
                setStatus('Another browser published a newer recovery point. This browser was not overwritten; pull it explicitly or publish after refreshing.');
            } else if (manual) {
                window.showToast?.(`Could not publish recovery point: ${error.message}`, 'error');
            } else {
                console.warn('Rolling recovery publish failed:', error);
            }
            return null;
        } finally { runtime.publishing = false; }
    };
    const restoreManifest = async (manifest, description) => {
        await window.HordeBackupDomains.validate(manifest);
        window.showConfirmModal('Restore Rolling Recovery Point',
            `${description} will atomically replace every registered data domain on this browser. Rolling recovery points include configured API keys and authentication headers and will remember them on this trusted device. Continue?`,
            async () => {
                await window.HordeBackupDomains.restore(manifest);
                window.showToast?.('Recovery point restored. Reloading…', 'success');
                setTimeout(() => location.reload(), 600);
            }, 'Restore & Reload', 'Cancel');
    };
    const pullCurrent = async () => {
        const data = await request(`/recovery/current?${query()}`);
        applyStatus(data);
        if (!data.available || !data.snapshot) throw new Error('No recovery point has been published yet.');
        await restoreManifest(data.snapshot, `Recovery point r${data.revision} from ${data.updatedBy || 'another device'}`);
    };
    const restoreSelected = async () => {
        const id = document.getElementById('rolling-recovery-history')?.value;
        if (!id) return;
        const data = await request(`/recovery/history/${encodeURIComponent(id)}?${query()}`);
        await restoreManifest(data.snapshot, `Selected recovery point r${data.recoveryPoint?.revision ?? '?'}`);
    };
    const configureTimer = () => {
        clearInterval(runtime.timer);
        runtime.timer = null;
        const current = policy();
        if (!runtime.ready || !current.periodic) return;
        runtime.timer = setInterval(() => {
            if (runtime.dirty) void publish({ trigger: 'periodic' });
        }, current.minutes * 60 * 1000);
    };
    const notePersisted = () => {
        if (!runtime.ready) return;
        runtime.dirty = true;
        if (policy().afterChange) {
            clearTimeout(runtime.changeTimer);
            runtime.changeTimer = setTimeout(() => void publish({ trigger: 'persisted_change' }), 300);
        }
    };
    const setup = async () => {
        if (runtime.ready || !window.HordeBackupDomains?.registered?.().includes('horde-studio-host')) return;
        runtime.revision = Number(meta().revision) || 0;
        runtime.ready = true;
        document.getElementById('rolling-recovery-device-label')?.addEventListener('change', event => {
            local.set(keys.label, event.target.value.trim().slice(0, 80) || defaultLabel());
            void refresh();
        });
        document.getElementById('rolling-recovery-publish')?.addEventListener('click', () => void publish({ manual: true }));
        document.getElementById('rolling-recovery-pull')?.addEventListener('click', () => void pullCurrent().catch(error => window.showToast?.(error.message, 'error')));
        document.getElementById('rolling-recovery-check')?.addEventListener('click', () => void refresh().catch(error => setStatus(`Bridge unavailable: ${error.message}`)));
        document.getElementById('rolling-recovery-history-refresh')?.addEventListener('click', () => void refreshHistory().catch(error => window.showToast?.(error.message, 'error')));
        document.getElementById('rolling-recovery-restore')?.addEventListener('click', () => void restoreSelected().catch(error => window.showToast?.(error.message, 'error')));
        document.getElementById('rolling-recovery-periodic')?.addEventListener('change', event => savePolicy({ periodic: event.target.checked }));
        document.getElementById('rolling-recovery-minutes')?.addEventListener('change', event => savePolicy({ minutes: event.target.value }));
        document.getElementById('rolling-recovery-on-change')?.addEventListener('change', event => savePolicy({ afterChange: event.target.checked }));
        const label = document.getElementById('rolling-recovery-device-label');
        if (label) label.value = deviceLabel();
        renderPolicy(); renderHistory(); configureTimer();
        await refresh().catch(error => setStatus(`Bridge unavailable: ${error.message}`));
    };
    window.HordeRollingRecovery = Object.freeze({ setup, notePersisted, publish: () => publish({ manual: true }), pullCurrent, refreshHistory });
})();
