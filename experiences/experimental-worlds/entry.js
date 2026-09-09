import '../../shared/global-backup-coordinator.js';
import { createExperimentalWorldsHost } from '../../host-adapters/experimental-worlds.js';
import { ExperimentalWorldsRepository } from './persistence/repository.js';

const ACKNOWLEDGEMENT_VERSION = 1;
let runtime = null;

function settingsEnabled(settings) {
    const experiment = settings?.experimentalWorlds || {};
    return experiment.enabled === true && Number(experiment.acknowledgementVersion || 0) >= ACKNOWLEDGEMENT_VERSION;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

async function render() {
    const root = runtime.root;
    const snapshot = await runtime.repository.snapshot();
    const enabled = settingsEnabled(runtime.host.getSettings());
    root.innerHTML = `
        <div class="experimental-worlds-shell">
            <header class="experimental-worlds-header"><div><span class="experimental-worlds-badge">EXPERIMENTAL</span><h1>Experimental Worlds</h1><p>Alternative World semantics with separate saves, shared Horde Studio services, and no replacement of ordinary Worlds.</p></div><button class="btn btn-ghost" data-experimental-action="backup">Create full backup</button></header>
            ${enabled ? `<section class="experimental-worlds-library"><div class="experimental-worlds-library-head"><h2>Experimental library</h2><div><button class="btn btn-ghost" data-experimental-action="import-legacy">Import this origin's preserved Worlds</button><button class="btn btn-primary" data-experimental-action="synthetic">Create synthetic test world</button></div></div><p class="experimental-worlds-note">World IDs are retained within this domain. Ordinary Worlds cannot read, prune, or overwrite these records.</p><div class="experimental-worlds-grid">${snapshot.worlds.length ? snapshot.worlds.map(world => `<article class="experimental-world-card"><span>Experimental World</span><h3>${escapeHtml(world.name || world.id)}</h3><p>${escapeHtml(world.id)}</p><small>${world.synthetic ? 'Synthetic acceptance fixture' : 'Preserved world record'}</small></article>`).join('') : '<p class="experimental-worlds-empty">No imported Experimental Worlds yet. Import a controlled legacy export or create a synthetic test fixture.</p>'}</div></section>` : `<section class="experimental-worlds-onboarding"><span class="experimental-worlds-badge">EXPERIMENTAL</span><h2>Experimental Worlds is off</h2><p>This alternative Worlds mode changes quickly and saved worlds can break. Keep full backups and share feedback carefully on Discord. Declining does not affect ordinary modes or remove any saved Experimental Worlds.</p><label class="experimental-worlds-ack"><input type="checkbox" data-experimental-ack> I understand that Experimental Worlds may become incompatible or break.</label><div><button class="btn btn-primary" data-experimental-action="enable" disabled>Enable Experimental Worlds</button><button class="btn btn-ghost" data-experimental-action="decline">Not now</button></div></section>`}
        </div>`;
    root.querySelector('[data-experimental-ack]')?.addEventListener('change', event => { root.querySelector('[data-experimental-action="enable"]').disabled = !event.target.checked; });
    root.querySelector('[data-experimental-action="enable"]')?.addEventListener('click', async () => { await runtime.host.updateSettings({ experimentalWorlds: { enabled: true, acknowledgementVersion: ACKNOWLEDGEMENT_VERSION } }); runtime.host.notify('Experimental Worlds enabled. Create a full backup before important work.', 'warning'); await render(); });
    root.querySelector('[data-experimental-action="decline"]')?.addEventListener('click', () => runtime.host.notify('Experimental Worlds remains off. Your saved data was not changed.', 'info'));
    root.querySelector('[data-experimental-action="synthetic"]')?.addEventListener('click', async () => { await runtime.repository.addSyntheticWorld(); await render(); });
    root.querySelector('[data-experimental-action="import-legacy"]')?.addEventListener('click', async () => { try { const legacy = await runtime.repository.readLegacySameOrigin(); if (!legacy) throw new Error('No same-origin legacy HordeStudioDB was found. Use the controlled archive importer for the other origin.'); await runtime.repository.archiveLegacyOrigin(location.origin, legacy); runtime.host.notify('Copied non-conflicting legacy Experimental Worlds; original records remain untouched.', 'success'); await render(); } catch (error) { runtime.host.notify(error.message, 'error'); } });
    root.querySelector('[data-experimental-action="backup"]')?.addEventListener('click', () => document.getElementById('backup-all-btn')?.click());
}

export async function registerExperimentalWorlds(hostCapabilities) {
    const host = createExperimentalWorldsHost(hostCapabilities);
    const root = document.getElementById('experimental-worlds-view');
    if (!root) throw new Error('Experimental Worlds mount root is missing.');
    const repository = new ExperimentalWorldsRepository();
    await repository.init();
    host.backupCoordinator.registerPartition(repository.backupPartition());
    runtime = { host, repository, root, active: false, operationGeneration: 0 };
    await render();
    return Object.freeze({
        async activate() { runtime.active = true; runtime.operationGeneration += 1; await render(); },
        deactivate() { runtime.active = false; runtime.operationGeneration += 1; root.replaceChildren(); },
        get operationGeneration() { return runtime.operationGeneration; },
        repository
    });
}
