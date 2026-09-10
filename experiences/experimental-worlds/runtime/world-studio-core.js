// --- World Engine ---
function setupWorldsLogic() {
    const createBtn = document.getElementById('create-new-world-btn');
    if (createBtn) {
        createBtn.onclick = () => {
            createNewWorld();
            // ExperimentalWorldsHost.navigate('world-studio'); // To be implemented
        };
    }
    
    const search = document.getElementById('world-search');
    if (search) {
        search.oninput = () => renderWorlds();
    }
}

function createNewWorld() {
    ExperimentalWorldsState.editingWorld = {
        id: 'world_' + Date.now(),
        name: 'New World',
        description: 'A new persistent realm...',
        dmPrompt: 'You are the Dungeon Master. Maintain the physics and lore of this world. Narrate in the second person.',
        locations: [{
            id: 'loc_start_' + Date.now(),
            name: 'The Void',
            description: 'A blank canvas waiting for your creation.',
            exits: []
        }],
        entities: [],
        lorebook: [],
        authorNote: '',
        // Blank means "inherit Settings". A World pins a model only when its
        // creator explicitly chooses one in AI Configuration.
        model: '',
        temp: 0.9,
        minP: 0.0,
        topP: 1.0,
        topK: 0,
        freqPenalty: 0.0,
        presPenalty: 0.0,
        repPenalty: 1.0,
        maxTokens: 2048,
        reasoning: false,
        reasoningEffort: 'auto',
        sidecarConfig: {
            schemaVersion: 1,
            mode: 'sidecar',
            tracker: { inheritNarrator: true, provider: '', model: '', openRouterRouting: null, reasoning: false, maxTokens: 0 },
            debug: { enabled: false, retainTraceCount: 20 }
        },
        dossierClaims: { version: 1, enabled: true },
        hudConfig: {
            showClock: true,
            showQuests: true,
            showLedger: true,
            showInventory: true,
            timeStep: 5,
            startTimeHours: 8,
            showDays: false,
            enableSchedules: false,
            stats: [
                { id: 'hp', name: 'HP', value: 100, min: 0, max: 100, color: 'var(--red)' },
                { id: 'gold', name: 'Gold', value: 0, min: 0, max: 0, color: 'var(--yellow)' }
            ]
        },
        gameRules: {
            profileId: 'adventure',
            vitalStatId: 'hp',
            zeroHpMode: 'fail_forward',
            currencyStatId: 'gold',
            currencyName: 'gold'
        }
    };
    applyWorldRuleProfile(ExperimentalWorldsState.editingWorld, 'adventure');
    openWorldStudio();
    document.querySelector('.world-studio-tab[data-tab="w-overview"]')?.click();
}

const SIDECAR_PIPELINE_DISABLED_MESSAGE = "disabled because the current state pipeline doesn't utilise this feature";

function worldUsesSidecarPipeline(world = ExperimentalWorldsState.editingWorld) {
    return window.ExperimentalWorldsSidecarMode?.normalizeWorldConfig?.(world)?.mode === 'sidecar';
}

function renderStatePipelineConfig(world = ExperimentalWorldsState.editingWorld) {
    const mode = worldUsesSidecarPipeline(world) ? 'sidecar' : 'inline_legacy';
    document.querySelectorAll('[data-pipeline-settings]').forEach(section => {
        const visible = section.dataset.pipelineSettings === mode;
        section.classList.toggle('hidden', !visible);
        section.setAttribute('aria-hidden', visible ? 'false' : 'true');
    });
    const hint = document.getElementById('w-state-pipeline-hint');
    if (hint) hint.textContent = mode === 'sidecar'
        ? 'Sidecar is active. It is the only canonical state authority for this world.'
        : 'Compatibility mode for existing timelines. Inline Legacy owns its receipt repair and classifier paths.';
}

// Sidecar is deliberately visible in Studio before migration: authors should
// be able to discover what the new pipeline unlocks.  It must not, however,
// look editable while Inline Legacy still owns state, otherwise a world can be
// configured with mechanics that its active turn pipeline will never consume.
function setSidecarStudioFeatureAvailability(world = ExperimentalWorldsState.editingWorld) {
    const sidecarActive = worldUsesSidecarPipeline(world);
    renderStatePipelineConfig(world);
    document.querySelectorAll('[data-sidecar-feature]').forEach(feature => {
        const unavailable = !sidecarActive;
        feature.classList.toggle('sidecar-feature-disabled', unavailable);
        feature.setAttribute('aria-disabled', unavailable ? 'true' : 'false');
        if (unavailable) {
            feature.setAttribute('title', SIDECAR_PIPELINE_DISABLED_MESSAGE);
        } else if (feature.getAttribute('title') === SIDECAR_PIPELINE_DISABLED_MESSAGE) {
            feature.removeAttribute('title');
        }
    });
    // In Sidecar mode the FF 5.4 Roleplay OS owns the narrator prompt, so the
    // legacy world preset selector has nothing left to contribute there.
    const legacyPresetSection = document.getElementById('w-legacy-preset-section');
    if (legacyPresetSection) legacyPresetSection.classList.toggle('hidden', sidecarActive);
}

function renderWorldOverviewSidecarMigration(world = ExperimentalWorldsState.editingWorld) {
    const host = document.getElementById('w-overview-sidecar-migration');
    if (!host) return;
    const inlineLegacy = !!world && !worldUsesSidecarPipeline(world);
    host.classList.toggle('hidden', !inlineLegacy);
    if (!inlineLegacy) {
        host.innerHTML = '';
        return;
    }
    const sessions = ExperimentalWorldsState.worldInstances?.[world.id]?.sessions || [];
    const timelineLabel = sessions.length
        ? `${sessions.length} existing timeline${sessions.length === 1 ? '' : 's'} will be reviewed before migration.`
        : 'This world has no timeline yet, so the wizard will simply enable Sidecar for its first session.';
    host.innerHTML = `
        <div class="world-overview-sidecar-migration-head">
            <div>
                <span class="vh-eyebrow">STATE PIPELINE</span>
                <h3>This world is using Inline Legacy</h3>
                <p>Move this world to Sidecar before authoring Sidecar-only travel, vehicle, and reconciliation features. The migration wizard creates a recoverable backup and retains raw roleplay and canonical records. ${escapeHTML(timelineLabel)}</p>
            </div>
            <button id="w-overview-sidecar-migrate-btn" type="button" class="btn btn-primary">Review Sidecar migration</button>
        </div>`;
    document.getElementById('w-overview-sidecar-migrate-btn')?.addEventListener('click', () => openSidecarMigrationWizard(world.id));
}

function setupWorldStudioTabs() {
    const tabs = document.querySelectorAll('.world-studio-tab');
    const panels = document.querySelectorAll('#world-studio-view .studio-panel');

    tabs.forEach(tab => {
        tab.onclick = () => {
            if (tab.classList.contains('sidecar-feature-disabled')) {
                ExperimentalWorldsHost.notify('This feature is available after the world is migrated to the Sidecar state pipeline.', 'info');
                return;
            }
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            
            panels.forEach(p => {
                p.classList.add('hidden');
                if (p.id === 'tab-' + target) p.classList.remove('hidden');
            });

            // Large authored worlds can contain hundreds of locations and NPCs.
            // Rendering every editor (including all of its relationship/location
            // options) before the Studio is even visible can lock the browser and
            // makes a perfectly editable starter look read-only. Build only the
            // panel the author actually opens.
            renderWorldStudioPanel(target);
            ExperimentalWorldsState.lastWorldStudioTab = target;
            ExperimentalWorldsHost.persist();
        };
    });
    document.querySelectorAll('[data-world-studio-target]').forEach(button => {
        button.onclick = () => document.querySelector(`.world-studio-tab[data-tab="${button.dataset.worldStudioTarget}"]`)?.click();
    });
}

function renderWorldStudioPanel(target) {
    if (!ExperimentalWorldsState.editingWorld) return;
    const renderers = {
        'w-overview': () => renderWorldOverviewSidecarMigration(ExperimentalWorldsState.editingWorld),
        'w-visuals': renderWorldVisuals,
        'w-locations': renderWorldLocations,
        'w-entities': renderWorldEntities,
        'w-items': renderWorldItems,
        'w-travel': renderWorldTravel,
        'w-factions': renderWorldFactions,
        'w-sandbox': renderWorldSandboxStudio,
        'w-lore': renderWorldLore,
        'w-visual-map': renderWorldArchitectMap,
        'w-ai': () => renderWorldSidecarConfigEditor(ExperimentalWorldsState.editingWorld)
    };
    if (renderers[target]) renderers[target]();
    setSidecarStudioFeatureAvailability(ExperimentalWorldsState.editingWorld);
}

function setupWorldStudioLogic() {

    // Do not merely make Sidecar controls look inactive: prevent pointer and
    // keyboard changes while Inline Legacy is the selected pipeline.  The
    // migration card and pipeline selector are intentionally outside these
    // marked surfaces so an author always has a clear route forward.
    if (!document.body.dataset.sidecarFeatureGuard) {
        const blockUnavailableSidecarFeature = event => {
            const feature = event.target instanceof Element
                ? event.target.closest('[data-sidecar-feature].sidecar-feature-disabled')
                : null;
            if (!feature) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.type === 'click') ExperimentalWorldsHost.notify('This feature is available after the world is migrated to the Sidecar state pipeline.', 'info');
        };
        document.addEventListener('click', blockUnavailableSidecarFeature, true);
        document.addEventListener('pointerdown', blockUnavailableSidecarFeature, true);
        document.addEventListener('keydown', blockUnavailableSidecarFeature, true);
        document.body.dataset.sidecarFeatureGuard = 'true';
    }

    const recordOverlay = document.getElementById('world-record-overlay');
    document.getElementById('world-record-close').onclick = closeWorldRecordInspector;
    document.getElementById('world-record-done').onclick = closeWorldRecordInspector;
    recordOverlay.onclick = event => { if (event.target === recordOverlay) closeWorldRecordInspector(); };

    document.getElementById('close-world-studio-btn').onclick = () => ExperimentalWorldsHost.navigate('worlds');
    document.getElementById('save-world-btn').onclick = saveWorld;
    document.getElementById('save-play-world-btn').onclick = async () => {
        await saveWorld();
        if (ExperimentalWorldsState.editingWorld?.id) enterWorld(ExperimentalWorldsState.editingWorld.id);
    };
    document.getElementById('delete-world-btn').onclick = deleteWorld;
    
    document.getElementById('open-scheduler-btn').onclick = () => {
        document.getElementById('world-scheduler-overlay').classList.remove('hidden');
        renderWorldScheduler();
    };
    document.getElementById('close-scheduler-btn').onclick = () => document.getElementById('world-scheduler-overlay').classList.add('hidden');
    document.getElementById('save-scheduler-btn').onclick = () => {
        document.getElementById('world-scheduler-overlay').classList.add('hidden');
        ExperimentalWorldsHost.notify('Schedules saved to world configuration.', 'success');
    };

    document.getElementById('gen-all-schedules-btn').onclick = async (e) => {
        const btn = e.target;
        const world = ExperimentalWorldsState.editingWorld;
        if (!world) return;
        const missing = world.entities.filter(n => n.type === 'npc' && (!n.schedule || n.schedule.length === 0));
        if (missing.length === 0) return ExperimentalWorldsHost.notify('Every NPC already has a schedule. Use per-NPC ✨ to regenerate one.', 'info');

        btn.disabled = true;
        let done = 0;
        try {
            for (const npc of missing) {
                btn.textContent = `⏳ Designing ${npc.name}... (${done + 1}/${missing.length})`;
                try {
                    await generateNpcSchedule(npc, world);
                    done++;
                    renderWorldScheduler();
                } catch (err) {
                    console.warn(`Schedule generation failed for ${npc.name}:`, err.message);
                }
            }
            ExperimentalWorldsHost.notify(`Generated schedules for ${done}/${missing.length} NPCs`, done > 0 ? 'success' : 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '✨ Auto-Generate All Missing Schedules (AI)';
        }
    };

    document.getElementById('run-world-audit-btn').onclick = () => {
        document.getElementById('world-audit-overlay').classList.remove('hidden');
        renderWorldAudit();
    };
    document.getElementById('close-audit-btn').onclick = () => document.getElementById('world-audit-overlay').classList.add('hidden');
    
    document.getElementById('export-world-btn').onclick = () => {
        if (!ExperimentalWorldsState.editingWorld) return;
        // Never hand someone a world carrying references to things that are gone.
        normalizeAuthoredWorld(ExperimentalWorldsState.editingWorld);
        const exportedWorld = safeJsonClone(ExperimentalWorldsState.editingWorld);
        pruneWorldMediaAssets(exportedWorld);
        const media = worldMediaSummary(exportedWorld);
        exportedWorld._format = 'horde-world';
        exportedWorld._version = 2;
        exportedWorld._mediaManifest = {
            schema: WORLD_MEDIA_SCHEMA_VERSION,
            count: media.count,
            embedded: true
        };
        const data = JSON.stringify(exportedWorld, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${ExperimentalWorldsState.editingWorld.name.replace(/\s+/g, '_')}.horde_world`;
        a.click();
        URL.revokeObjectURL(url);
        ExperimentalWorldsHost.notify(`World exported with ${media.count} embedded media asset${media.count === 1 ? '' : 's'} (${formatByteSize(media.bytes)}).`, 'success');
    };
    document.getElementById('add-location-btn')?.addEventListener('click', () => addWorldLocation('top'));
    document.getElementById('add-location-btn-bottom')?.addEventListener('click', () => addWorldLocation('bottom'));
    // Do not assign addWorldEntity directly as an event handler. Browsers pass
    // the click event as the first argument, which used to become `entity.type`
    // and produced records that were neither people nor items.
    document.getElementById('add-entity-btn').onclick = () => addWorldEntity('npc');
    document.getElementById('add-entity-btn-bottom').onclick = () => addWorldEntity('npc');
    document.getElementById('add-item-btn').onclick = addWorldItem;
    document.getElementById('add-item-btn-bottom').onclick = addWorldItem;
    document.getElementById('add-vehicle-btn').onclick = () => addWorldEntity('vehicle');
    document.getElementById('add-vehicle-btn-bottom').onclick = () => addWorldEntity('vehicle');
    document.getElementById('add-traversal-method-btn')?.addEventListener('click', () => addWorldTraversalMethod());
    document.getElementById('add-faction-btn').onclick = () => addWorldFaction('top');
    document.getElementById('add-faction-btn-bottom').onclick = () => addWorldFaction('bottom');
    document.getElementById('add-world-origin-btn').onclick = addWorldStartingLife;
    document.getElementById('add-w-lore-btn').onclick = () => { addWorldLore(); updateWorldTokenCount(); };
    document.getElementById('add-world-stat-btn').onclick = addWorldStat;
    document.getElementById('w-fetch-model-btn').onclick = fetchWorldModelSettings;
    document.getElementById('w-sidecar-mode').onchange = event => {
        if (!ExperimentalWorldsState.editingWorld) return;
        const config = window.ExperimentalWorldsSidecarMode?.normalizeWorldConfig?.(ExperimentalWorldsState.editingWorld);
        if (!config) return;
        config.mode = event.target.value === 'sidecar' ? 'sidecar' : 'inline_legacy';
        renderWorldSidecarConfigEditor(ExperimentalWorldsState.editingWorld);
        renderWorldOverviewSidecarMigration(ExperimentalWorldsState.editingWorld);
        setSidecarStudioFeatureAvailability(ExperimentalWorldsState.editingWorld);
    };
    document.getElementById('w-inline-legacy-migrate-btn').onclick = () => {
        if (ExperimentalWorldsState.editingWorld?.id) openSidecarMigrationWizard(ExperimentalWorldsState.editingWorld.id);
    };
    document.getElementById('w-sidecar-inherit-narrator').onchange = event => {
        if (!ExperimentalWorldsState.editingWorld) return;
        const config = window.ExperimentalWorldsSidecarMode?.normalizeWorldConfig?.(ExperimentalWorldsState.editingWorld);
        if (!config) return;
        config.tracker.inheritNarrator = event.target.checked;
        renderWorldSidecarConfigEditor(ExperimentalWorldsState.editingWorld);
    };
    document.getElementById('w-sidecar-reader-enabled').onchange = event => {
        if (!ExperimentalWorldsState.editingWorld) return;
        const config = window.ExperimentalWorldsSidecarMode?.normalizeWorldConfig?.(ExperimentalWorldsState.editingWorld);
        if (!config) return;
        config.tracker.readerEnabled = event.target.checked;
        renderWorldSidecarConfigEditor(ExperimentalWorldsState.editingWorld);
    };
    document.getElementById('w-sidecar-reader-profile-inherit').onchange = event => {
        if (!ExperimentalWorldsState.editingWorld) return;
        const config = window.ExperimentalWorldsSidecarMode?.normalizeWorldConfig?.(ExperimentalWorldsState.editingWorld);
        if (!config) return;
        config.tracker.readerProfileInherit = event.target.checked;
        renderWorldSidecarConfigEditor(ExperimentalWorldsState.editingWorld);
    };
    document.getElementById('w-sidecar-reasoning-mode').onchange = event => {
        document.getElementById('w-sidecar-reasoning-effort-row')?.classList.toggle('hidden', event.target.value === 'disabled');
    };
    document.getElementById('w-sidecar-provider').onchange = () => {
        renderSidecarModelOptions(ExperimentalWorldsHost.normalizedProviderId(document.getElementById('w-sidecar-provider').value));
        updateSidecarOverrideVisibility();
    };
    document.getElementById('w-sidecar-fetch-model-btn').onclick = fetchSidecarModelSettings;
    setupSidecarModelSearch();
    setupRoleplayOSConfigHandlers();
    document.getElementById('w-sidecar-memory-inherit').onchange = event => {
        if (!ExperimentalWorldsState.editingWorld) return;
        const config = window.ExperimentalWorldsSidecarMode?.normalizeWorldConfig?.(ExperimentalWorldsState.editingWorld);
        if (!config) return;
        config.memory.inheritGlobal = event.target.checked;
        renderWorldSidecarConfigEditor(ExperimentalWorldsState.editingWorld);
    };

    const sandboxBindings = {
        'w-sandbox-enabled': ['enabled', 'checked'],
        'w-sandbox-politics': ['politics', 'checked'],
        'w-sandbox-conflict': ['conflict', 'checked'],
        'w-sandbox-law': ['law', 'checked'],
        'w-sandbox-seasons': ['seasons', 'checked'],
        'w-sandbox-growth': ['growth', 'checked'],
        'w-sandbox-scale': ['scale', 'value'],
        'w-sandbox-calendar': ['calendar', 'value'],
        'w-sandbox-season-days': ['seasonDays', 'value'],
        'w-sandbox-principles': ['principles', 'value']
    };
    Object.entries(sandboxBindings).forEach(([id, [field, property]]) => {
        const input = document.getElementById(id);
        if (!input) return;
        const handler = event => {
            const world = ExperimentalWorldsState.editingWorld;
            if (!world) return;
            const config = normalizeWorldSandboxConfig(world);
            config[field] = property === 'checked' ? event.target.checked : event.target.value;
            if (field === 'seasonDays') config[field] = livingClamp(config[field], 1, 365);
            if (field === 'principles') config[field] = String(config[field]).slice(0, 4000);
            updateWorldTokenCount();
        };
        input[property === 'checked' || input.tagName === 'SELECT' ? 'onchange' : 'oninput'] = handler;
    });

    // Token Count Triggers
    ['w-studio-name', 'w-studio-desc', 'w-studio-dm-prompt', 'w-studio-intro', 'w-studio-note'].forEach(id => {
        document.getElementById(id).oninput = updateWorldTokenCount;
    });
    
    document.getElementById('w-studio-reasoning').onchange = (e) => {
        document.getElementById('w-reasoning-effort-row').classList.toggle('hidden', !e.target.checked);
    };

    const wUnlockBtn = document.getElementById('w-unlock-all-params-btn');
    if (wUnlockBtn) {
        wUnlockBtn.onclick = () => {
            updateReasoningVisibility([], '', true, 'w-');
            ExperimentalWorldsHost.notify('All parameters unlocked for this world session.', 'success');
        };
    }

    // HUD Config Hooks
    document.getElementById('w-hud-show-clock').onchange = (e) => ExperimentalWorldsState.editingWorld.hudConfig.showClock = e.target.checked;
    document.getElementById('w-hud-show-quests').onchange = (e) => ExperimentalWorldsState.editingWorld.hudConfig.showQuests = e.target.checked;
    document.getElementById('w-hud-show-ledger').onchange = (e) => ExperimentalWorldsState.editingWorld.hudConfig.showLedger = e.target.checked;
    document.getElementById('w-hud-show-inventory').onchange = (e) => ExperimentalWorldsState.editingWorld.hudConfig.showInventory = e.target.checked;
    document.getElementById('w-hud-enable-schedules').onchange = (e) => {
        const world = ExperimentalWorldsState.editingWorld;
        if (!world) return;
        const rules = normalizeWorldGameRules(world);
        rules.profileId = 'custom';
        rules.modules.schedules = e.target.checked;
        world.hudConfig.enableSchedules = e.target.checked;
        loadWorldGameRuleControls(world);
    };
    document.getElementById('w-rules-profile').onchange = (e) => {
        const world = ExperimentalWorldsState.editingWorld;
        if (!world) return;
        if (e.target.value === 'custom') {
            normalizeWorldGameRules(world).profileId = 'custom';
        } else {
            applyWorldRuleProfile(world, e.target.value);
        }
        document.getElementById('w-hud-show-quests').checked = !!world.hudConfig.showQuests;
        document.getElementById('w-hud-show-inventory').checked = !!world.hudConfig.showInventory;
        loadWorldGameRuleControls(world);
    };
    document.querySelectorAll('#w-rules-modules-grid [data-rule-module]').forEach(input => {
        input.onchange = () => {
            const world = ExperimentalWorldsState.editingWorld;
            if (!world) return;
            const rules = normalizeWorldGameRules(world);
            rules.profileId = 'custom';
            const key = input.dataset.ruleModule;
            rules.modules[key] = input.checked;
            if (key === 'health' && input.checked) rules.modules.stats = true;
            if (key === 'commerce' && input.checked) {
                rules.modules.stats = true;
                rules.modules.inventory = true;
            }
            if (key === 'stats' && !input.checked) {
                rules.modules.health = false;
                rules.modules.commerce = false;
            }
            if (key === 'inventory' && !input.checked) rules.modules.commerce = false;
            normalizeWorldGameRules(world);
            world.hudConfig.enableSchedules = !!rules.modules.schedules;
            if (!rules.modules.quests) world.hudConfig.showQuests = false;
            if (!rules.modules.inventory) world.hudConfig.showInventory = false;
            document.getElementById('w-hud-show-quests').checked = !!world.hudConfig.showQuests;
            document.getElementById('w-hud-show-inventory').checked = !!world.hudConfig.showInventory;
            loadWorldGameRuleControls(world);
        };
    });
    document.getElementById('w-hud-start-time').oninput = (e) => {
        if (!ExperimentalWorldsState.editingWorld.hudConfig) ExperimentalWorldsState.editingWorld.hudConfig = {};
        const parsed = parseInt(e.target.value, 10);
        ExperimentalWorldsState.editingWorld.hudConfig.startTimeHours = Number.isFinite(parsed) ? Math.max(0, Math.min(23, parsed)) : 8;
    };
    document.getElementById('w-hud-start-minute').oninput = (e) => {
        if (!ExperimentalWorldsState.editingWorld.hudConfig) ExperimentalWorldsState.editingWorld.hudConfig = {};
        const parsed = parseInt(e.target.value, 10);
        ExperimentalWorldsState.editingWorld.hudConfig.startTimeMinutes = Number.isFinite(parsed) ? Math.max(0, Math.min(59, parsed)) : 0;
    };
    document.getElementById('w-hud-time-step').oninput = (e) => {
        if (!ExperimentalWorldsState.editingWorld.hudConfig) ExperimentalWorldsState.editingWorld.hudConfig = {};
        ExperimentalWorldsState.editingWorld.hudConfig.timeStep = isNaN(parseInt(e.target.value)) ? 5 : parseInt(e.target.value);
    };
    document.getElementById('w-hud-start-weekday').onchange = (e) => {
        if (!ExperimentalWorldsState.editingWorld.hudConfig) ExperimentalWorldsState.editingWorld.hudConfig = {};
        ExperimentalWorldsState.editingWorld.hudConfig.startWeekday = WORLD_WEEKDAYS.includes(e.target.value) ? e.target.value : 'Monday';
    };
    document.getElementById('w-hud-show-days').onchange = (e) => {
        if (!ExperimentalWorldsState.editingWorld.hudConfig) ExperimentalWorldsState.editingWorld.hudConfig = {};
        ExperimentalWorldsState.editingWorld.hudConfig.showDays = e.target.checked;
    };

    // World Banner Uploader
    const bannerArea = document.getElementById('w-banner-upload-area');
    const bannerInput = document.getElementById('w-banner-input');
    if (bannerArea && bannerInput) {
        bannerArea.onclick = () => bannerInput.click();
        bannerInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                // Optimize like character images do — banners are used full-bleed
                // as the chat background, so 1280px wide at 0.7 quality is plenty.
                const optimized = await normalizeUploadedImage(file, 1280, 0.7);
                ExperimentalWorldsState.editingWorld.banner = optimized;
                const preview = document.getElementById('w-banner-preview');
                preview.style.backgroundImage = `url('${optimized}')`;
                preview.innerHTML = '';
                renderWorlds(); // Update the card in library
                ExperimentalWorldsHost.notify('World banner normalized and ready.', 'success');
            } catch (error) {
                ExperimentalWorldsHost.notify(`Image upload failed: ${error.message}`, 'error');
            } finally { e.target.value = ''; }
        };
    }

    // World System Presets
    const wPresetSelect = document.getElementById('w-studio-system-preset');
    if (wPresetSelect) {
        wPresetSelect.onchange = (e) => {
            const val = e.target.value;
            const ftBtn = document.getElementById('w-fine-tune-preset-btn');
            if (ftBtn) ftBtn.style.display = val ? 'block' : 'none';
            if (ExperimentalWorldsState.editingWorld) {
                if (ExperimentalWorldsState.editingWorld.activePresetId !== val) ExperimentalWorldsState.editingWorld.presetOverrides = {};
                ExperimentalWorldsState.editingWorld.activePresetId = val;
                ExperimentalWorldsState.editingWorld.presetOverridesFor = val;
            }
        };
    }

    const wImportBtn = document.getElementById('w-import-preset-btn');
    const wPresetInput = document.getElementById('w-preset-file-input');
    if (wImportBtn && wPresetInput) {
        wImportBtn.onclick = () => wPresetInput.click();
        wPresetInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const json = validatePresetData(JSON.parse(event.target.result));
                    const preset = { id: 'preset_' + Date.now(), name: json.name || file.name.replace('.json', ''), data: json };
                    ExperimentalWorldsState.systemPresets.push(preset);
                    await ExperimentalWorldsHost.persist();
                    ExperimentalWorldsHost.notify('World Preset Imported!', 'success');
                    if (ExperimentalWorldsState.view === 'worldStudio') populateWorldPresetDropdown();
                } catch (err) {
                    ExperimentalWorldsHost.notify('Import failed: ' + err.message, 'error');
                }
            };
            reader.readAsText(file);
        };
    }
}

// Rebuild the World Studio system-preset dropdown from the current preset list,
// keeping the given selection. Used on studio open and after preset import.
function populateWorldPresetDropdown(activePresetId) {
    const presetSelect = document.getElementById('w-studio-system-preset');
    if (!presetSelect) return;
    const keep = activePresetId !== undefined ? activePresetId : presetSelect.value;
    presetSelect.innerHTML = '<option value="">None (Custom DM Persona Only)</option>';
    ExperimentalWorldsHost.getAllPresets().forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        opt.selected = p.id === keep;
        presetSelect.appendChild(opt);
    });
    const ftBtn = document.getElementById('w-fine-tune-preset-btn');
    if (ftBtn) ftBtn.style.display = keep ? 'block' : 'none';
}

function setupWorldImport() {
    const btn = document.getElementById('import-world-btn');
    if (!btn) return;

    btn.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.horde_world,.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 512 * 1024 * 1024) {
                ExperimentalWorldsHost.notify('Import failed: the portable world is larger than 512 MB.', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const rawWorld = JSON.parse(ev.target.result);

                    // Shrink oversized images BEFORE validation — genAI-sized
                    // banners (1024px+) must be resized, not rejected
                    if (rawWorld && typeof rawWorld.banner === 'string' && rawWorld.banner.length > 400_000) {
                        try { rawWorld.banner = await optimizeImage(rawWorld.banner, 1280, 0.8); }
                        catch (e) { console.warn('Banner re-optimization failed on import:', e); }
                    }

                    const world = validateWorldData(rawWorld);

                    // Legacy Melbourne exports ran the bundled Melbourne
                    // mechanics; the FF 5.4 OS world mechanics engine is its
                    // universal successor. Remap the profile id at import so
                    // the engine seams activate for these worlds.
                    if (world.mechanicsProfile === 'melbourne_v1') {
                        world.mechanicsProfile = 'world_mechanics_v1';
                    }

                    // A portable export can also repair an orphaned library
                    // entry. If sessions still exist for its original ID and
                    // no visible world owns that ID, keep it so timelines,
                    // state and media reconnect. Ordinary imports still get a
                    // fresh ID to avoid collisions.
                    const originalId = world.id;
                    const hasVisibleCollision = ExperimentalWorldsState.worlds.some(item => item.id === originalId);
                    const hasOrphanedRuntime = !!(originalId && (ExperimentalWorldsState.worldInstances?.[originalId]
                        || ExperimentalWorldsState.activeWorldId === originalId
                        || ExperimentalWorldsState.worldRecoverySnapshots?.[originalId]));
                    world.id = hasOrphanedRuntime && !hasVisibleCollision
                        ? originalId : 'world_' + Date.now();
                    world.locations.forEach((location, index) => {
                        if (!location.id) location.id = `loc_${Date.now()}_${index}`;
                        location.exits = Array.isArray(location.exits) ? location.exits : [];
                    });
                    (world.entities || []).forEach((entity, index) => {
                        if (!entity.id) entity.id = `ent_${Date.now()}_${index}`;
                    });
                    world.entities = Array.isArray(world.entities) ? world.entities : [];
                    world.lorebook = Array.isArray(world.lorebook) ? world.lorebook : [];
                    // An imported file is the least trustworthy world there is:
                    // shops, factions and standings are not validated above, and
                    // a half-formed one used to crash the Studio the moment it
                    // was opened. Repair rather than reject — the fiction is
                    // still the author's, only the shape is wrong.
                    normalizeAuthoredWorld(world);
                    const importedMedia = worldMediaSummary(world);
                    ExperimentalWorldsState.worlds.push(world);
                    if (ExperimentalWorldsState.worldRecoverySnapshots?.[world.id]) delete ExperimentalWorldsState.worldRecoverySnapshots[world.id];
                    ExperimentalWorldsHost.markMediaChanged();
                    await ExperimentalWorldsHost.persist();
                    renderWorlds();
                    const recovered = world.id === originalId && hasOrphanedRuntime;
                    ExperimentalWorldsHost.notify(`${recovered ? 'Recovered' : 'Imported'} "${world.name}"${recovered ? ' and reconnected its existing sessions' : ''} with ${importedMedia.count} media asset${importedMedia.count === 1 ? '' : 's'}.`, 'success');
                } catch (err) {
                    ExperimentalWorldsHost.notify('Failed to import world: ' + err.message, 'error');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };
}

async function fetchWorldModelSettings() {
    const modelInput = document.getElementById('w-studio-model').value.trim();
    await fetchModelData(modelInput, 'w-', ExperimentalWorldsState.editingWorld);
}

const sidecarProviderModelCatalogs = new Map();

function updateSidecarProviderConnectionHint(providerId) {
    const hint = document.getElementById('w-sidecar-provider-connection-hint');
    if (!hint) return;
    const provider = ExperimentalWorldsHost.normalizedProviderId(providerId);
    const configured = ExperimentalWorldsHost.providerHasCredentials(provider);
    hint.textContent = `${ExperimentalWorldsHost.providerDisplayName(provider)} uses its global Settings connection: endpoint, credentials, and provider-specific headers. ${configured ? 'Connection settings are configured.' : 'Configure this provider in Settings before fetching models or running Sidecar.'}`;
    hint.classList.toggle('form-warning', !configured);
}

function renderSidecarModelOptions(provider, selected = '') {
    const input = document.getElementById('w-sidecar-model');
    if (!input) return;
    const models = sidecarProviderModelCatalogs.get(provider) || [];
    input.value = String(selected || '').trim();
    input.placeholder = models.length ? 'Search provider models or type an exact ID' : 'Fetch models or type an exact model ID';
    input.setAttribute('aria-expanded', 'false');
    document.getElementById('w-sidecar-model-results')?.classList.add('hidden');
}

function renderSidecarModelSearchResults() {
    const input = document.getElementById('w-sidecar-model');
    const results = document.getElementById('w-sidecar-model-results');
    if (!input || !results) return;
    const provider = ExperimentalWorldsHost.normalizedProviderId(document.getElementById('w-sidecar-provider')?.value);
    const query = input.value.trim().toLowerCase();
    const models = (sidecarProviderModelCatalogs.get(provider) || []).filter(model =>
        !query || `${model.name || ''} ${model.id || ''}`.toLowerCase().includes(query)
    ).slice(0, 60);
    results.innerHTML = '';
    if (!models.length) {
        const empty = document.createElement('div');
        empty.className = 'vh-search-empty';
        empty.textContent = sidecarProviderModelCatalogs.has(provider)
            ? 'No provider model matches. You can still enter an exact model ID.'
            : 'Fetch this provider’s models, or enter an exact model ID.';
        results.appendChild(empty);
    } else {
        models.forEach(model => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'searchable-dropdown-item';
            option.setAttribute('role', 'option');
            option.innerHTML = `<span class="model-display-name">${escapeHTML(model.name || model.id)}</span><span class="model-display-id">${escapeHTML(model.id)}</span>`;
            option.onclick = () => {
                input.value = model.id;
                results.classList.add('hidden');
                input.setAttribute('aria-expanded', 'false');
                applySidecarSelectedModelMetadata();
            };
            results.appendChild(option);
        });
    }
    results.classList.remove('hidden');
    input.setAttribute('aria-expanded', 'true');
}

function setupSidecarModelSearch() {
    const input = document.getElementById('w-sidecar-model');
    const results = document.getElementById('w-sidecar-model-results');
    if (!input || !results || input.dataset.sidecarSearchReady === 'true') return;
    input.dataset.sidecarSearchReady = 'true';
    input.addEventListener('focus', renderSidecarModelSearchResults);
    input.addEventListener('input', renderSidecarModelSearchResults);
    input.addEventListener('change', applySidecarSelectedModelMetadata);
    input.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            results.classList.add('hidden');
            input.setAttribute('aria-expanded', 'false');
        }
    });
    document.addEventListener('click', event => {
        if (!input.contains(event.target) && !results.contains(event.target)) {
            results.classList.add('hidden');
            input.setAttribute('aria-expanded', 'false');
        }
    });
}

function applySidecarSelectedModelMetadata() {
    const world = ExperimentalWorldsState.editingWorld;
    const provider = ExperimentalWorldsHost.normalizedProviderId(document.getElementById('w-sidecar-provider')?.value);
    const model = document.getElementById('w-sidecar-model')?.value || '';
    const match = (sidecarProviderModelCatalogs.get(provider) || []).find(item => item.id === model);
    const config = world && window.ExperimentalWorldsSidecarMode?.normalizeWorldConfig?.(world);
    if (config && match) config.tracker.supportedParams = Array.isArray(match.supported_parameters)
        ? match.supported_parameters : [];
    else if (config && model !== String(config.tracker.model || '').trim()) config.tracker.supportedParams = [];
    const status = document.getElementById('w-sidecar-model-status');
    if (status && model) status.textContent = match
        ? `${match.name || match.id} selected${config?.tracker?.supportedParams?.length ? ` · ${config.tracker.supportedParams.join(', ')}` : ''}`
        : `${model} will be sent as an exact custom model ID.`;
}

async function fetchSidecarModelSettings() {
    const world = ExperimentalWorldsState.editingWorld;
    const provider = ExperimentalWorldsHost.normalizedProviderId(document.getElementById('w-sidecar-provider')?.value);
    const status = document.getElementById('w-sidecar-model-status');
    const button = document.getElementById('w-sidecar-fetch-model-btn');
    if (!world) return;
    if (status) status.textContent = `Fetching ${provider} model metadata…`;
    if (button) { button.disabled = true; button.textContent = 'Fetching…'; }
    try {
        const response = await fetch(`${ExperimentalWorldsHost.providerApiBase(provider)}/models`, {
            headers: { ...ExperimentalWorldsHost.providerAuthHeaders(provider), ...ExperimentalWorldsHost.providerAttributionHeaders(provider) }
        });
        if (!response.ok) throw new Error(`Model catalog request failed (${response.status})`);
        const data = await response.json();
        const models = (Array.isArray(data) ? data : data?.data || data?.models || [])
            .filter(item => item?.id).map(item => ({ ...item, id: String(item.id), name: String(item.name || item.id) }))
            .sort((left, right) => left.name.localeCompare(right.name));
        if (!models.length) throw new Error(`${provider} did not return any usable models.`);
        const selected = document.getElementById('w-sidecar-model')?.value || '';
        sidecarProviderModelCatalogs.set(provider, models);
        renderSidecarModelOptions(provider, selected);
        applySidecarSelectedModelMetadata();
        if (document.activeElement === document.getElementById('w-sidecar-model')) renderSidecarModelSearchResults();
        if (status) status.textContent = `${models.length} ${provider} models available. Choose one to use it for Sidecar.`;
        ExperimentalWorldsHost.notify(`${models.length} Sidecar models loaded from ${provider}.`, 'success');
    } catch (error) {
        if (status) status.textContent = `Could not fetch metadata: ${error.message}`;
        ExperimentalWorldsHost.notify(`Sidecar model metadata failed: ${error.message}`, 'error');
    } finally {
        if (button) { button.disabled = false; button.textContent = 'Fetch models'; }
    }
}

function updateSidecarOverrideVisibility() {
    const inheriting = document.getElementById('w-sidecar-inherit-narrator')?.checked !== false;
    document.getElementById('w-sidecar-override-config')?.classList.toggle('hidden', inheriting);
    document.getElementById('world-sidecar-openrouter-routing')?.classList.toggle('hidden',
        inheriting || ExperimentalWorldsHost.normalizedProviderId(document.getElementById('w-sidecar-provider')?.value) !== 'openrouter');
    if (!inheriting) {
        const provider = ExperimentalWorldsHost.normalizedProviderId(document.getElementById('w-sidecar-provider')?.value);
        renderSidecarModelOptions(provider, document.getElementById('w-sidecar-model')?.value || '');
        updateSidecarProviderConnectionHint(provider);
        initializeOpenRouterRoutingPanel('sidecar', { force: false });
    }
}

// ---------------------------------------------------------------------------
// Narrator Roleplay OS (FF 5.4 Agentic) config surface.
// The installed source's own choiceBlocks are the real setting surface: every
// option stays selectable, unknown upstream choices survive visibly, and the
// two architectural facts of the Sidecar adaptation are shown as annotations
// rather than removals. state_mode is pinned (Sidecar is the state authority)
// and the upstream Internal States tracking modules are replaced by native
// Sidecar receipts and the compiled context block.
// ---------------------------------------------------------------------------
const FF54_CHOICE_ANNOTATIONS = Object.freeze({
    state_mode: {
        pinned: true,
        note: 'Pinned to AGENTS: Horde Sidecar is the canonical state authority, so the upstream Internal States backend, macro persistence and regex state machinery are architecturally replaced. Every other choice resolves through the preset\'s own gating.'
    },
    internal_states: {
        replaced: true,
        note: 'Replaced by Sidecar native state: these upstream tracking modules are covered by Sidecar receipts and the compiled context. Selections are kept and still gate matching sections for compatibility.'
    },
    nsfw_mode: {
        requiresSource: true,
        note: 'Resolves only from an imported source preset; the built-in adapted registry does not include the upstream NSFW sections.'
    },
    bypass_mode: {
        requiresSource: true,
        note: 'Resolves only from an imported source preset; the built-in adapted registry does not include the upstream jailbreak and bypass sections.'
    }
});

function roleplayOSDraft(world) {
    if (!isPlainObject(world.sidecarConfig)) world.sidecarConfig = {};
    if (!isPlainObject(world.sidecarConfig.roleplayOS)) world.sidecarConfig.roleplayOS = {};
    return world.sidecarConfig.roleplayOS;
}

function roleplayOSChoiceNotes(variable, hasSource) {
    const annotation = FF54_CHOICE_ANNOTATIONS[variable];
    if (!annotation) return [];
    if ((annotation.pinned || annotation.replaced) || (annotation.requiresSource && !hasSource)) return [annotation.note];
    return [];
}

function renderRoleplayOSChoiceChipRow(variable, options, effective, { multi = false, locked = false, replaced = false } = {}) {
    const chips = options.map(option => {
        const value = String(option.value || '');
        const active = multi ? effective.indexOf(value) !== -1 : effective === value;
        const classes = ['os-chip'];
        if (active) classes.push('active');
        if (locked) classes.push('locked');
        if (replaced) classes.push('replaced');
        if (option.stray) classes.push('preserved');
        return '<button type="button" class="' + classes.join(' ') + '" data-os-variable="' + escapeHTML(variable) + '" data-os-value="' + escapeHTML(value) + '"'
            + (locked ? ' disabled' : '')
            + ' title="' + escapeHTML(value) + '">' + escapeHTML(option.label || value) + '</button>';
    });
    return '<div class="os-chip-row">' + chips.join('') + '</div>';
}

function renderRoleplayOSChoiceBlock(block, os, hasSource) {
    const annotation = FF54_CHOICE_ANNOTATIONS[block.variableName] || {};
    const locked = annotation.pinned === true;
    const replaced = annotation.replaced === true;
    const raw = os.choices[block.variableName];
    const multi = block.multiSelect === true;
    const effective = multi
        ? (Array.isArray(raw) ? raw : [])
        : (raw === undefined || raw === null ? '' : String(raw));
    // Stray values: stored selections that this source no longer offers. They
    // survive leniently and still gate whatever references them, so they stay
    // on the surface as removable preserved chips.
    const knownValues = block.options.map(option => String(option.value || ''));
    const strays = (multi ? effective : (effective ? [effective] : [])).filter(value => knownValues.indexOf(value) === -1);
    const tags = [];
    if (locked) tags.push('<span class="os-tag os-tag-pinned">pinned</span>');
    if (replaced) tags.push('<span class="os-tag os-tag-replaced">replaced</span>');
    if (multi) tags.push('<span class="os-tag">multi-select</span>');
    if (strays.length) tags.push('<span class="os-tag">preserved</span>');
    const options = block.options.concat(strays.map(value => ({ value, label: value, stray: true })));
    const chipRow = renderRoleplayOSChoiceChipRow(block.variableName, options, effective, { multi, locked, replaced });
    const notes = roleplayOSChoiceNotes(block.variableName, hasSource);
    return '<div class="os-choice-row">'
        + '<div class="os-choice-head"><span class="os-choice-label">' + escapeHTML(block.question || block.variableName) + '</span>' + tags.join('') + '</div>'
        + chipRow
        + (notes.length ? '<div class="form-hint os-choice-note">' + notes.map(escapeHTML).join(' ') + '</div>' : '')
        + (strays.length ? '<div class="form-hint os-choice-note">Preserved values are kept from an earlier source; they still gate any sections that reference them.</div>' : '')
        + '</div>';
}

function renderRoleplayOSConfigEditor(world) {
    const host = document.getElementById('w-roleplay-os-choices');
    const sourceSelect = document.getElementById('w-roleplay-os-source');
    if (!host || !sourceSelect || !world) return;
    const registry = getInstalledRoleplayOSSources();
    const stored = isPlainObject(world?.sidecarConfig?.roleplayOS) ? world.sidecarConfig.roleplayOS : {};
    const os = worldRoleplayOS(world);
    const source = os.sourcePreset || null;
    const hasSource = !!source;

    // Source dropdown. FF versions coexist in the registry; each world pins
    // one. 'builtin' is an explicit pin to the built-in adapted registry; an
    // empty sourceId keeps auto-detection of the installed FF source.
    const selected = stored.sourceId || (source ? source.id : 'builtin');
    const options = ['<option value="builtin"' + (selected === 'builtin' ? ' selected' : '') + '>Built-in adapted registry</option>'];
    registry.forEach(entry => {
        options.push('<option value="' + escapeHTML(entry.id) + '"' + (selected === entry.id ? ' selected' : '') + '>'
            + escapeHTML(entry.presetName) + ' &middot; ' + entry.sections.length + ' sections</option>');
    });
    if (stored.sourceId && stored.sourceId !== 'builtin' && !registry.some(entry => entry.id === stored.sourceId)) {
        options.push('<option value="' + escapeHTML(stored.sourceId) + '" selected disabled>Missing pinned source &middot; ' + escapeHTML(stored.sourceId.slice(0, 48)) + '</option>');
    }
    sourceSelect.innerHTML = options.join('');

    const info = document.getElementById('w-roleplay-os-source-info');
    if (info) {
        if (source) {
            const label = stored.sourceId && stored.sourceId !== 'builtin' ? 'Source active' : 'Auto-detected source';
            info.innerHTML = '<strong>' + label + ':</strong> ' + escapeHTML(source.presetName)
                + ' &middot; ' + source.sections.length + ' sections resolved verbatim through the preset\'s own gating'
                + ' &middot; content hash <code>' + escapeHTML(source.provenance.contentHash.slice(0, 12)) + '</code>'
                + ' &middot; adapter v' + escapeHTML(String(source.provenance.adapter));
        } else {
            info.innerHTML = '<strong>Built-in adapted registry active.</strong> Import the author\'s Marinara export to resolve the full upstream stack &mdash; including its policy, NSFW and bypass sections &mdash; verbatim, with every choice exposed below.';
        }
    }

    const stateBadge = document.getElementById('w-roleplay-os-state');
    if (stateBadge) {
        const customCount = Object.keys(isPlainObject(stored.choices) ? stored.choices : {}).filter(key => key !== 'state_mode').length;
        stateBadge.textContent = customCount ? 'Customized · ' + customCount + ' choice' + (customCount === 1 ? '' : 's') : 'Defaults active';
    }

    // Choice surface: the source's own choiceBlocks when a source resolves,
    // otherwise an informational view of the adapter-curated built-in defaults.
    const blocks = hasSource && Array.isArray(source.choiceBlocks)
        ? source.choiceBlocks.slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        : [];
    const html = [];
    if (!blocks.length) {
        html.push('<div class="os-choice-row">'
            + '<div class="os-choice-head"><span class="os-choice-label">state_mode</span><span class="os-tag os-tag-pinned">pinned</span></div>'
            + renderRoleplayOSChoiceChipRow('state_mode', [{ value: FF54_STATE_MODE_PIN, label: FF54_STATE_MODE_PIN }], FF54_STATE_MODE_PIN, { locked: true })
            + '<div class="form-hint os-choice-note">' + escapeHTML(FF54_CHOICE_ANNOTATIONS.state_mode.note) + '</div>'
            + '</div>');
        html.push('<div class="form-hint" style="margin:8px 0 0;">Built-in defaults (adapter-curated). Import a source preset to configure the complete choice surface.</div>');
        Object.keys(FF54_BUILT_IN_DEFAULTS).filter(key => key !== 'state_mode').forEach(variable => {
            const value = FF54_BUILT_IN_DEFAULTS[variable];
            const shown = Array.isArray(value) ? value.join(', ') : String(value);
            const notes = roleplayOSChoiceNotes(variable, hasSource);
            const annotation = FF54_CHOICE_ANNOTATIONS[variable] || {};
            html.push('<div class="os-choice-row">'
                + '<div class="os-choice-head"><span class="os-choice-label">' + escapeHTML(variable) + '</span>'
                + (annotation.pinned ? '<span class="os-tag os-tag-pinned">pinned</span>' : '')
                + (annotation.replaced ? '<span class="os-tag os-tag-replaced">replaced</span>' : '') + '</div>'
                + '<code class="os-builtin-value">' + escapeHTML(shown || '&mdash;') + '</code>'
                + (notes.length ? '<div class="form-hint os-choice-note">' + notes.map(escapeHTML).join(' ') + '</div>' : '')
                + '</div>');
        });
    } else {
        const seen = new Set(['state_mode']);
        blocks.forEach(block => {
            seen.add(block.variableName);
            html.push(renderRoleplayOSChoiceBlock(block, os, hasSource));
        });
        // Lenient survival: stored choices without a matching block still gate
        // whatever sections reference them, so they stay visible and removable.
        Object.keys(os.choices).filter(variable => !seen.has(variable)).forEach(variable => {
            const value = os.choices[variable];
            if (Array.isArray(value)) {
                if (!value.length) return;
                html.push('<div class="os-choice-row">'
                    + '<div class="os-choice-head"><span class="os-choice-label">' + escapeHTML(variable) + '</span><span class="os-tag">preserved</span><span class="os-tag">multi-select</span></div>'
                    + renderRoleplayOSChoiceChipRow(variable, value.map(item => ({ value: item, label: item })), value.slice(), { multi: true })
                    + '<div class="form-hint os-choice-note">Kept from an earlier source; it still gates any sections that reference it.</div>'
                    + '</div>');
            } else if (value !== undefined && value !== null && String(value)) {
                html.push('<div class="os-choice-row">'
                    + '<div class="os-choice-head"><span class="os-choice-label">' + escapeHTML(variable) + '</span><span class="os-tag">preserved</span></div>'
                    + renderRoleplayOSChoiceChipRow(variable, [{ value: String(value), label: String(value) }], String(value), {})
                    + '<div class="form-hint os-choice-note">Kept from an earlier source; it still gates any sections that reference it.</div>'
                    + '</div>');
            }
        });
    }
    host.innerHTML = html.join('');
    renderRoleplayOSMigration(world);
}

function renderRoleplayOSMigration(world) {
    const host = document.getElementById('w-roleplay-os-migration');
    if (!host) return;
    const migration = isPlainObject(world?.sidecarConfig?.roleplayOS?.lastMigration) ? world.sidecarConfig.roleplayOS.lastMigration : null;
    const notes = migration ? (Array.isArray(migration.notes) ? migration.notes : []) : [];
    if (!notes.length) {
        host.innerHTML = '';
        return;
    }
    host.innerHTML = '<div class="os-migration-report"><strong>Selection reconciliation</strong>'
        + '<ul>' + notes.map(note => '<li>' + escapeHTML(note) + '</li>').join('') + '</ul>'
        + '<button type="button" id="w-roleplay-os-migration-dismiss" class="btn btn-ghost" style="font-size:0.7rem; padding:2px 10px;">Dismiss</button></div>';
}

function setRoleplayOSChoice(world, variable, value) {
    if (!world || variable === 'state_mode') return;
    const os = worldRoleplayOS(world);
    const block = os.sourcePreset && Array.isArray(os.sourcePreset.choiceBlocks)
        ? os.sourcePreset.choiceBlocks.find(item => item.variableName === variable) : null;
    const multi = block ? block.multiSelect === true : Array.isArray(os.choices[variable]);
    const draft = roleplayOSDraft(world);
    const stored = { ...(isPlainObject(draft.choices) ? draft.choices : {}) };
    if (multi) {
        const effective = Array.isArray(os.choices[variable]) ? os.choices[variable].slice() : [];
        const next = effective.indexOf(value) !== -1
            ? effective.filter(item => item !== value)
            : effective.concat([value]);
        const defaults = os.sourcePreset && isPlainObject(os.sourcePreset.defaults) ? os.sourcePreset.defaults : FF54_BUILT_IN_DEFAULTS;
        const defaultList = Array.isArray(defaults[variable]) ? defaults[variable] : [];
        const sameAsDefault = next.length === defaultList.length && next.every(item => defaultList.indexOf(item) !== -1);
        if (sameAsDefault) delete stored[variable];
        else stored[variable] = next;
    } else if (stored[variable] === value) {
        delete stored[variable];
    } else {
        stored[variable] = value;
    }
    draft.choices = stored;
    renderRoleplayOSConfigEditor(world);
}

async function pinRoleplayOSSource(world, sourceId) {
    if (!world) return;
    const registry = getInstalledRoleplayOSSources();
    const entry = registry.find(item => item.id === sourceId) || null;
    const draft = roleplayOSDraft(world);
    const stored = isPlainObject(draft.choices) ? draft.choices : {};
    if (entry) {
        const reconciled = reconcileFF54WorldChoices(stored, entry);
        draft.sourceId = entry.id;
        draft.choices = reconciled.choices;
        draft.lastMigration = reconciled.migration.length
            ? { at: new Date().toISOString(), sourceId: entry.id, notes: reconciled.migration.map(item => item.note) }
            : null;
    } else {
        // 'builtin' (or an id that is no longer installed) pins the built-in
        // adapted registry. Stored selections are kept: they still gate the
        // built-in sections, and a future repoint reconciles them.
        draft.sourceId = 'builtin';
    }
    await ExperimentalWorldsHost.persist();
    renderRoleplayOSConfigEditor(world);
    ExperimentalWorldsHost.notify(entry
        ? 'World pinned to Roleplay OS source "' + entry.presetName + '".' + (draft.lastMigration ? ' Selections reconciled; see the migration notes.' : '')
        : 'World pinned to the built-in adapted Roleplay OS registry.', 'info');
}

async function importRoleplayOSourcePreset(raw) {
    const entry = installRoleplayOSSource(raw);
    if (!entry) {
        ExperimentalWorldsHost.notify('Roleplay OS import failed: no sections found in that file (expected a Marinara or SillyTavern preset export).', 'error');
        return;
    }
    await ExperimentalWorldsHost.persist();
    const world = ExperimentalWorldsState.editingWorld;
    if (world) await pinRoleplayOSSource(world, entry.id);
    ExperimentalWorldsHost.notify('Installed Roleplay OS source "' + entry.presetName + '" (' + entry.sections.length + ' sections' + (entry.choiceBlocks.length ? ', ' + entry.choiceBlocks.length + ' choice blocks' : '') + ').', 'success');
}

function setupRoleplayOSConfigHandlers() {
    const host = document.getElementById('w-roleplay-os-choices');
    if (host) host.onclick = event => {
        const chip = event.target.closest('[data-os-variable]');
        if (!chip || chip.disabled) return;
        setRoleplayOSChoice(ExperimentalWorldsState.editingWorld, chip.dataset.osVariable, chip.dataset.osValue);
    };
    const sourceSelect = document.getElementById('w-roleplay-os-source');
    if (sourceSelect) sourceSelect.onchange = event => pinRoleplayOSSource(ExperimentalWorldsState.editingWorld, event.target.value);
    const importBtn = document.getElementById('w-roleplay-os-import-btn');
    const fileInput = document.getElementById('w-roleplay-os-file-input');
    if (importBtn && fileInput) {
        importBtn.onclick = () => fileInput.click();
        fileInput.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async event => {
                try {
                    await importRoleplayOSourcePreset(JSON.parse(event.target.result));
                } catch (err) {
                    ExperimentalWorldsHost.notify('Roleplay OS import failed: ' + err.message, 'error');
                } finally {
                    e.target.value = '';
                }
            };
            reader.readAsText(file);
        };
    }
    const migrationHost = document.getElementById('w-roleplay-os-migration');
    if (migrationHost) migrationHost.onclick = async event => {
        if (!event.target.closest('#w-roleplay-os-migration-dismiss')) return;
        const world = ExperimentalWorldsState.editingWorld;
        if (!world) return;
        delete roleplayOSDraft(world).lastMigration;
        await ExperimentalWorldsHost.persist();
        renderRoleplayOSConfigEditor(world);
    };
}

function renderWorldSidecarConfigEditor(world) {
    if (!world) return;
    const config = window.ExperimentalWorldsSidecarMode?.normalizeWorldConfig?.(world);
    if (!config) return;
    renderStatePipelineConfig(world);
    const tracker = config.tracker || {};
    const debug = config.debug || {};
    document.getElementById('w-sidecar-mode').value = config.mode;
    document.getElementById('w-sidecar-inherit-narrator').checked = tracker.inheritNarrator !== false;
    document.getElementById('w-sidecar-reader-enabled').checked = tracker.readerEnabled !== false;
    document.getElementById('w-sidecar-reader-profile-inherit').checked = tracker.readerProfileInherit !== false;
    const readerProfile = effectiveSidecarReaderProfile(world);
    document.getElementById('w-sidecar-reader-timeout').value = readerProfile.timeoutSeconds;
    document.getElementById('w-sidecar-reader-refresh').value = readerProfile.fullRefreshCadence;
    document.getElementById('w-sidecar-reader-tools').value = readerProfile.maxToolCalls;
    document.getElementById('w-sidecar-reader-provider').value = readerProfile.provider || '';
    document.getElementById('w-sidecar-reader-model').value = readerProfile.model || '';
    document.getElementById('w-sidecar-reader-profile-max-tokens').value = readerProfile.maxTokens || '';
    document.getElementById('w-sidecar-reader-context-budget').value = readerProfile.contextBudget || 24000;
    document.getElementById('w-sidecar-reader-lookup-budget').value = readerProfile.maxLookupPayload || 12000;
    document.getElementById('w-sidecar-reader-reasoning').value = readerProfile.reasoningMode || 'inherit';
    document.getElementById('w-sidecar-reader-reasoning-effort').value = readerProfile.reasoningEffort || 'auto';
    document.getElementById('w-sidecar-reader-retry').value = readerProfile.retryPolicy || 'bounded';
    document.querySelectorAll('#w-sidecar-reader-timeout, #w-sidecar-reader-refresh, #w-sidecar-reader-tools, #w-sidecar-reader-provider, #w-sidecar-reader-model, #w-sidecar-reader-profile-max-tokens, #w-sidecar-reader-context-budget, #w-sidecar-reader-lookup-budget, #w-sidecar-reader-reasoning, #w-sidecar-reader-reasoning-effort, #w-sidecar-reader-retry').forEach(input => input.disabled = tracker.readerProfileInherit !== false);
    document.getElementById('w-sidecar-provider').value = tracker.provider || '';
    renderSidecarModelOptions(ExperimentalWorldsHost.normalizedProviderId(tracker.provider), tracker.model || '');
    document.getElementById('w-sidecar-reasoning-mode').value = tracker.reasoningMode || (tracker.reasoning === true ? 'enabled' : 'inherit');
    document.getElementById('w-sidecar-reasoning-effort').value = tracker.reasoningEffort || 'auto';
    document.getElementById('w-sidecar-reasoning-effort-row').classList.toggle('hidden',
        (tracker.reasoningMode || (tracker.reasoning === true ? 'enabled' : 'inherit')) === 'disabled');
    const reasoningEnabled = sidecarReasoningPolicy(tracker, world).enabled;
    const readerTokens = Number(tracker.readerMaxTokens) || 0;
    const receiptTokens = Number(tracker.maxTokens) || 0;
    const readerInput = document.getElementById('w-sidecar-reader-max-tokens');
    const receiptInput = document.getElementById('w-sidecar-max-tokens');
    readerInput.value = readerTokens || '';
    receiptInput.value = receiptTokens || '';
    readerInput.placeholder = `Adaptive default · ${(reasoningEnabled ? 5000 : 3000).toLocaleString()}`;
    receiptInput.placeholder = `Adaptive default · ${(reasoningEnabled ? 8000 : 6000).toLocaleString()}`;
    document.getElementById('w-sidecar-debug').checked = debug.enabled === true;
    document.getElementById('w-sidecar-trace-count').value = Number(debug.retainTraceCount) || 20;
    const memory = config.memory || {};
    const effectiveMemory = effectiveSidecarMemoryConfig(world);
    document.getElementById('w-sidecar-memory-inherit').checked = memory.inheritGlobal !== false;
    document.getElementById('w-sidecar-episode-size').value = effectiveMemory.episodeChunkTurns;
    document.getElementById('w-sidecar-episode-cadence').value = effectiveMemory.episodeCadenceTurns;
    document.getElementById('w-sidecar-verbatim-window').value = effectiveMemory.verbatimTurnWindow;
    document.getElementById('w-sidecar-retrieval-limit').value = effectiveMemory.retrievalLimit;
    document.getElementById('w-sidecar-job-concurrency').value = effectiveMemory.consolidationConcurrency;
    document.getElementById('w-sidecar-provider-concurrency').value = effectiveMemory.backgroundProviderConcurrency;
    document.querySelectorAll('#w-sidecar-memory-grid input').forEach(input => input.disabled = memory.inheritGlobal !== false);
    const memoryStatus = document.getElementById('w-sidecar-memory-status');
    if (memoryStatus) memoryStatus.textContent = memory.inheritGlobal !== false
        ? `Using global controls · ${effectiveMemory.episodeChunkTurns}-turn Episodes · ${effectiveMemory.verbatimTurnWindow} active verbatim turns · ${effectiveMemory.consolidationConcurrency}/${effectiveMemory.backgroundProviderConcurrency} jobs · ${effectiveMemory.consolidationModel || 'default consolidation model'} / ${effectiveMemory.consolidationMaxTokens} tokens.`
        : `World override active · ${effectiveMemory.episodeChunkTurns}-turn Episodes · ${effectiveMemory.verbatimTurnWindow} active verbatim turns · ${effectiveMemory.consolidationConcurrency}/${effectiveMemory.backgroundProviderConcurrency} jobs · ${effectiveMemory.consolidationModel || 'global model'} / ${effectiveMemory.consolidationMaxTokens} tokens.`;
    const inheriting = tracker.inheritNarrator !== false;
    updateSidecarOverrideVisibility();
    const hint = document.getElementById('w-sidecar-mode-hint');
    hint.textContent = config.mode === 'sidecar'
        ? 'Active: Narrator writes visible prose and hidden handoff notes; Sidecar performs one native canonical commit. Legacy repair and Chronicle classifier paths are bypassed.'
        : 'Inline Legacy is retained for compatibility. It uses the existing receipt/classifier adapters; migrate a selected world deliberately before switching a live timeline to Sidecar.';
    const restore = document.getElementById('w-sidecar-restore-backup');
    const migrate = document.getElementById('w-sidecar-migrate-btn');
    const backups = Array.isArray(world.sidecarMigrationBackups) ? world.sidecarMigrationBackups : [];
    if (restore) {
        restore.classList.toggle('hidden', !backups.length);
        restore.textContent = backups.length ? `Restore latest Inline backup · ${new Date(backups.at(-1).createdAt).toLocaleString()}` : 'Restore latest Inline backup';
        restore.onclick = async () => {
            const backup = backups.at(-1);
            if (!backup?.world || !confirm('Restore this selected world and its saved runtime to the pre-Sidecar Inline backup? Current Sidecar-only derived data will be replaced.')) return;
            const restored = safeJsonClone(backup.world);
            const index = ExperimentalWorldsState.worlds.findIndex(item => item.id === world.id);
            if (index >= 0) ExperimentalWorldsState.worlds[index] = restored;
            ExperimentalWorldsState.editingWorld = safeJsonClone(restored);
            if (backup.runtime) ExperimentalWorldsState.worldInstances[restored.id] = safeJsonClone(backup.runtime);
            await ExperimentalWorldsHost.persist();
            openWorldStudio(restored.id);
            ExperimentalWorldsHost.notify('Restored the selected pre-Sidecar migration backup.', 'success');
        };
    }
    if (migrate) {
        const sessions = ExperimentalWorldsState.worldInstances?.[world.id]?.sessions || [];
        const inlineSessions = sessions.filter(session => window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, session)?.mode !== 'sidecar');
        migrate.classList.remove('hidden');
        migrate.disabled = false;
        if (!sessions.length && config.mode !== 'sidecar') migrate.textContent = 'Enable Sidecar for this world';
        else if (inlineSessions.length) migrate.textContent = config.mode === 'sidecar' ? 'Review & migrate Inline timelines' : 'Review & migrate this world';
        else migrate.textContent = 'Review Sidecar migration';
        migrate.onclick = () => openSidecarMigrationWizard(world.id);
    }
    const report = document.getElementById('w-sidecar-migration-report');
    if (report) {
        const sessions = ExperimentalWorldsState.worldInstances?.[world.id]?.sessions || [];
        const inlineSessions = sessions.filter(session => window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, session)?.mode !== 'sidecar');
        const migrations = sessions.map(session => session.sidecar?.migration).filter(Boolean);
        const warnings = migrations.flatMap(migration => migration.warnings || []);
        if (migrations.length) {
            report.innerHTML = `<strong>Migration readiness:</strong> ${migrations.length}/${sessions.length || migrations.length} timeline${migrations.length === 1 ? '' : 's'} prepared · raw history and canonical receipts retained · derived vector caches cleared.${warnings.length ? `<br><span style="color:var(--warning)">${escapeHTML(warnings.join(' · '))}</span>` : ''}`;
        } else if (inlineSessions.length) {
            report.innerHTML = `<strong>Migration readiness:</strong> ${inlineSessions.length} Inline timeline${inlineSessions.length === 1 ? '' : 's'} can be backed up and switched to Sidecar without rewriting raw history.`;
        } else if (sessions.length) {
            report.innerHTML = '<strong>Migration readiness:</strong> every existing timeline is already on Sidecar.';
        } else if (config.mode === 'sidecar') {
            report.innerHTML = 'This world is already set to Sidecar. New play sessions will use the Sidecar pipeline.';
        } else {
            report.innerHTML = 'This world is still on Inline Legacy. Enable Sidecar here to switch the world; existing play sessions, if any, stay Inline until you migrate them.';
        }
    }
    initializeOpenRouterRoutingPanel('sidecar');
    renderWorldOverviewSidecarMigration(world);
    setSidecarStudioFeatureAvailability(world);
    renderRoleplayOSConfigEditor(world);
}

function openWorldStudio(worldId = null, options = {}) {
    if (worldId) {
        const world = ExperimentalWorldsState.worlds.find(w => w.id === worldId);
        if (!world) return;
        // Proposals belong to the world they were generated for.
        if (calibrationPassState && calibrationPassState.worldId !== worldId) calibrationPassState = null;
        ExperimentalWorldsState.editingWorld = JSON.parse(JSON.stringify(world));
        ExperimentalWorldsState.lastWorldStudioId = worldId;
        ExperimentalWorldsHost.persist();
    }

    const w = ExperimentalWorldsState.editingWorld;
    document.getElementById('w-studio-name').value = w.name || '';
    document.getElementById('w-studio-desc').value = w.description || '';
    document.getElementById('w-studio-dm-prompt').value = w.dmPrompt || '';
    document.getElementById('w-studio-intro').value = w.intro || '';
    document.getElementById('w-studio-note').value = w.authorNote || '';
    
    const bannerPreview = document.getElementById('w-banner-preview');
    if (w.banner) {
        bannerPreview.style.backgroundImage = `url('${cssUrl(w.banner)}')`;
        bannerPreview.innerHTML = '';
    } else {
        bannerPreview.style.backgroundImage = 'none';
        bannerPreview.innerHTML = '<span>Click to upload</span>';
    }

    // Populate Presets
    populateWorldPresetDropdown(w.activePresetId);

    const worldModelInput = document.getElementById('w-studio-model');
    worldModelInput.value = w.model || '';
    worldModelInput.placeholder = w.model
        ? 'Search provider models…'
        : `Use Settings default · ${ExperimentalWorldsState.globalSettings.defaultModel || 'choose a model in Settings'}`;

    const agentConfig = normalizeWorldAgentConfig(w);
    document.getElementById('w-agent-enabled').checked = agentConfig.enabled;
    document.getElementById('w-agent-interval').value = agentConfig.intervalTurns;
    document.getElementById('w-agent-model').value = agentConfig.model;
    document.getElementById('w-agent-proposal-only').checked = agentConfig.proposalOnly === true;
    initializeOpenRouterRoutingPanel('world');
    initializeOpenRouterRoutingPanel('worldAgent');
    const kernelConfig = normalizeWorldKernelConfig(w);
    document.getElementById('w-kernel-enabled').checked = kernelConfig.enabled;
    document.getElementById('w-kernel-location-limit').value = kernelConfig.sceneLocationLimit;
    document.getElementById('w-kernel-memory-mode').value = kernelConfig.memoryMode;
    document.getElementById('w-kernel-repair-mode').value = kernelConfig.repairMode;
    document.getElementById('w-kernel-compact-tools').checked = kernelConfig.compactTools;
    renderWorldSidecarConfigEditor(w);

    document.getElementById('w-studio-temp').value = w.temp ?? 0.9;
    document.getElementById('w-studio-min-p').value = w.minP ?? 0.0;
    document.getElementById('w-studio-top-p').value = w.topP ?? 1.0;
    document.getElementById('w-studio-top-k').value = w.topK ?? 0;
    document.getElementById('w-studio-freq-penalty').value = w.freqPenalty ?? 0.0;
    document.getElementById('w-studio-pres-penalty').value = w.presPenalty ?? 0.0;
    document.getElementById('w-studio-rep-penalty').value = w.repPenalty ?? 1.0;
    document.getElementById('w-studio-max-tokens').value = w.maxTokens ?? 2048;
    
    const contextSizeInput = document.getElementById('w-studio-context-size');
    if (contextSizeInput) {
        configureContextSliderForModel('w-studio-context-size', w.model || ExperimentalWorldsState.globalSettings.defaultModel);
        contextSizeInput.value = w.contextSize ?? 8192;
        updateContextSliderUI('w-studio-context-size', 'w-studio-context-size-val', 'w-studio-context-size-badge');
    }

    document.getElementById('w-studio-reasoning').checked = w.reasoning || false;
    document.getElementById('w-studio-reasoning-effort').value = w.reasoningEffort || 'auto';
    document.getElementById('w-reasoning-effort-row').classList.toggle('hidden', !w.reasoning);

    // Load HUD Config
    if (!w.hudConfig) w.hudConfig = { showClock: true, showQuests: true, showLedger: true, showInventory: true, timeStep: 5, startTimeHours: 8, showDays: false, stats: [{id:'hp', name:'HP', value:100, min:0, max:100, color:'var(--red)'}, {id:'gold', name:'Gold', value:0, min:0, max:0, color:'var(--yellow)'}] };
    normalizeWorldGameRules(w);
    document.getElementById('w-hud-show-clock').checked = w.hudConfig.showClock;
    document.getElementById('w-hud-show-quests').checked = w.hudConfig.showQuests;
    document.getElementById('w-hud-show-ledger').checked = w.hudConfig.showLedger;
    document.getElementById('w-hud-show-inventory').checked = w.hudConfig.showInventory;
    document.getElementById('w-hud-start-time').value = w.hudConfig.startTimeHours !== undefined ? w.hudConfig.startTimeHours : 8;
    document.getElementById('w-hud-start-minute').value = w.hudConfig.startTimeMinutes !== undefined ? w.hudConfig.startTimeMinutes : 0;
    document.getElementById('w-hud-time-step').value = w.hudConfig.timeStep !== undefined ? w.hudConfig.timeStep : 5;
    document.getElementById('w-hud-start-weekday').value = WORLD_WEEKDAYS.includes(w.hudConfig.startWeekday) ? w.hudConfig.startWeekday : 'Monday';
    document.getElementById('w-hud-show-days').checked = w.hudConfig.showDays || false;
    document.getElementById('w-hud-enable-schedules').checked = !!w.hudConfig.enableSchedules;
    renderWorldStudioStats();
    loadWorldGameRuleControls(w);

    updateWorldTokenCount();
    ExperimentalWorldsHost.navigate('worldStudio');

    const preferredTab = options.tab
        || (workspaceRestoring ? ExperimentalWorldsState.lastWorldStudioTab : null)
        || (worldId ? 'w-overview' : null);
    if (preferredTab) document.querySelector(`.world-studio-tab[data-tab="${preferredTab}"]`)?.click();

    // Preserve the selected authoring tab, but hydrate only that tab. Basics,
    // AI Config, HUD and notes are plain controls already populated above.
    const activeTab = document.querySelector('.world-studio-tab.active')?.dataset.tab || 'w-basics';
    renderWorldStudioPanel(activeTab);

    const cachedWorldModel = openRouterModels.find(model => model.id === w.model);
    if (cachedWorldModel) {
        populateModelInfoCard(cachedWorldModel, 'w-');
        updateReasoningVisibility(cachedWorldModel.supported_parameters || [], w.model, false, 'w-');
    }
}

function migrateWorldTimelinesToSidecar(world, legacyConfig = null, options = {}) {
    const instance = ExperimentalWorldsState.worldInstances?.[world?.id];
    const sessions = Array.isArray(instance?.sessions) ? instance.sessions : [];
    const selected = Array.isArray(options.selectedSessionIds) ? new Set(options.selectedSessionIds.map(String)) : null;
    const reports = [];
    sessions.forEach(sess => {
        if (selected && !selected.has(String(sess.id))) return;
        const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
        if (!protocol || protocol.mode === 'sidecar') return;
        const warnings = [];
        if ((sess.pendingChecks || []).length) warnings.push('pending checks require narration before their outcome can commit');
        if (sess.unresolvedDestination) warnings.push('an unresolved destination is already queued');
        if ((sess.worldTurnReceipts || []).some(entry => entry?.audit?.rejected?.length)) warnings.push('prior legacy receipts contain rejected proposals');
        protocol.migration = {
            from: 'inline_legacy', to: 'sidecar', migratedAt: new Date().toISOString(),
            sourceHistoryCount: (sess.history || []).length,
            sourceReceiptCount: (sess.worldTurnReceipts || []).length,
            warnings,
            // Canonical source history and receipts remain in their existing
            // stores. This compact audit supports a future rollback/import UI.
            legacyConfig: safeJsonClone(legacyConfig || world.sidecarConfig || {})
        };
        protocol.mode = 'sidecar';
        (sess.history || []).forEach(message => { delete message.embedding; });
        delete sess.vectorMemory;
        delete sess.embeddingCache;
        // These are derived retrieval material; raw turns and canonical
        // receipts remain, then rebuild under Sidecar when requested.
        sess.episodicMemories = [];
        // Migration does not retroactively fabricate Sidecar handoffs for
        // Legacy turns. It does make existing raw history available as pinned
        // evidence and prepares a real Sidecar packet for the next turn.
        window.ExperimentalWorldsSidecarMemoryGraph?.backfillWorldHistory?.(protocol, sess);
        protocol.packet = buildSidecarScenePacket(world, sess);
        reports.push({ id: sess.id, warnings });
    });
    return reports;
}

function openSidecarMigrationWizard(worldId = ExperimentalWorldsState.editingWorld?.id) {
    const world = ExperimentalWorldsState.worlds.find(item => item.id === worldId) || ExperimentalWorldsState.editingWorld;
    const overlay = document.getElementById('sidecar-migration-wizard-overlay');
    const list = document.getElementById('sidecar-migration-wizard-list');
    const status = document.getElementById('sidecar-migration-wizard-status');
    if (!world || !overlay || !list) return;
    const sessions = ExperimentalWorldsState.worldInstances?.[world.id]?.sessions || [];
    const inline = sessions.filter(sess => {
        const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
        return protocol?.mode !== 'sidecar';
    });
    const alreadySidecar = world.sidecarConfig?.mode === 'sidecar';
    list.innerHTML = inline.length ? inline.map(sess => {
        const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
        const warnings = [
            (sess.pendingChecks || []).length ? 'pending checks' : '',
            sess.unresolvedDestination ? 'unresolved destination' : '',
            (sess.worldTurnReceipts || []).some(entry => entry?.audit?.rejected?.length) ? 'rejected legacy proposals' : ''
        ].filter(Boolean);
        return `<label class="world-migration-card" style="display:flex; align-items:flex-start; gap:10px; padding:10px; cursor:pointer;"><input type="checkbox" class="sidecar-migration-session" data-session-id="${escapeHTML(sess.id)}" checked><span style="flex:1;"><strong>${escapeHTML(sess.name || sess.id)}</strong><small style="display:block; color:var(--text-3);">${sess.history?.length || 0} messages · ${sess.worldTurnReceipts?.length || 0} receipts · ${protocol?.mode === 'sidecar' ? 'already Sidecar' : 'Inline Legacy'}${warnings.length ? ` · <span style="color:var(--warning)">${escapeHTML(warnings.join(', '))}</span>` : ''}</small></span></label>`;
    }).join('') : (sessions.length
        ? '<div class="form-hint">No Inline Legacy timelines are waiting for migration.</div>'
        : `<div class="form-hint">${alreadySidecar ? 'This world is already set to Sidecar. New play sessions will use the Sidecar pipeline.' : 'This world has no play sessions yet. Enabling Sidecar switches the world so the next session uses the new pipeline.'}</div>`);
    status.textContent = inline.length
        ? `${inline.length} timeline${inline.length === 1 ? '' : 's'} available. Select the timelines to migrate.`
        : (sessions.length ? 'Every existing timeline is already on Sidecar.' : (alreadySidecar ? 'The world is already on Sidecar.' : 'No timelines to migrate. You can still enable Sidecar for this world.'));
    const runBtn = document.getElementById('run-sidecar-migration-btn');
    if (runBtn) {
        runBtn.disabled = alreadySidecar && !inline.length;
        runBtn.textContent = inline.length ? 'Back up & migrate selected' : 'Back up & enable Sidecar';
    }
    overlay.classList.remove('hidden');
    const close = () => overlay.classList.add('hidden');
    document.getElementById('close-sidecar-migration-wizard-btn').onclick = close;
    document.getElementById('cancel-sidecar-migration-btn').onclick = close;
    document.getElementById('sidecar-migration-select-all-btn').onclick = () => {
        const boxes = [...list.querySelectorAll('.sidecar-migration-session')];
        const shouldSelect = boxes.some(box => !box.checked);
        boxes.forEach(box => { box.checked = shouldSelect; });
    };
    document.getElementById('run-sidecar-migration-btn').onclick = async () => {
        const selectedIds = [...list.querySelectorAll('.sidecar-migration-session:checked')].map(box => box.dataset.sessionId);
        if (inline.length && !selectedIds.length) return ExperimentalWorldsHost.notify('Select at least one Inline timeline to migrate.', 'info');
        if (!inline.length && world.sidecarConfig?.mode === 'sidecar') return ExperimentalWorldsHost.notify('This world is already on Sidecar.', 'info');
        const backupList = Array.isArray(world.sidecarMigrationBackups) ? world.sidecarMigrationBackups : [];
        backupList.push({ id: `sidecar_migration_${Date.now().toString(36)}`, createdAt: new Date().toISOString(), from: 'inline_legacy', to: 'sidecar', selectedSessionIds: selectedIds.slice(), world: cloneSidecarMigrationRollbackWorld(world), runtime: safeJsonClone(ExperimentalWorldsState.worldInstances?.[world.id] || null), note: inline.length ? 'Selected-timeline migration backup.' : 'World-level Sidecar enablement backup.' });
        world.sidecarMigrationBackups = backupList.slice(-5);
        world.sidecarConfig = window.ExperimentalWorldsSidecarMode?.normalizeWorldConfig?.({ ...world, sidecarConfig: { ...(world.sidecarConfig || {}), mode: 'sidecar' } }) || { ...(world.sidecarConfig || {}), mode: 'sidecar' };
        const reports = inline.length ? migrateWorldTimelinesToSidecar(world, world.sidecarConfig, { selectedSessionIds: selectedIds }) : [];
        const index = ExperimentalWorldsState.worlds.findIndex(item => item.id === world.id);
        if (index >= 0) ExperimentalWorldsState.worlds[index] = safeJsonClone(world);
        if (ExperimentalWorldsState.editingWorld?.id === world.id) {
            ExperimentalWorldsState.editingWorld = safeJsonClone(world);
            const modeSelect = document.getElementById('w-sidecar-mode');
            if (modeSelect) modeSelect.value = 'sidecar';
        }
        await ExperimentalWorldsHost.persist();
        close();
        renderWorlds();
        if (ExperimentalWorldsState.activeWorldId === world.id) renderWorldPlayState();
        if (ExperimentalWorldsState.editingWorld?.id === world.id) { renderWorldSidecarConfigEditor(ExperimentalWorldsState.editingWorld); }
        ExperimentalWorldsHost.notify(reports.length
            ? `Migrated ${reports.length} timeline${reports.length === 1 ? '' : 's'} to Sidecar.`
            : 'Sidecar enabled for this world.', 'success');
    };
}

async function saveWorld() {
    const w = ExperimentalWorldsState.editingWorld;
    if (!w) return;
    const storedBeforeSave = ExperimentalWorldsState.worlds.find(world => world.id === w.id);
    const wasSidecar = storedBeforeSave?.sidecarConfig?.mode === 'sidecar';

    w.name = document.getElementById('w-studio-name').value.trim();
    w.description = document.getElementById('w-studio-desc').value.trim();
    w.dmPrompt = document.getElementById('w-studio-dm-prompt').value.trim();
    w.intro = document.getElementById('w-studio-intro').value.trim();
    w.authorNote = document.getElementById('w-studio-note').value.trim();
    w.model = document.getElementById('w-studio-model').value.trim();
    w.openRouterRouting = readOpenRouterRoutingPanel('world');
    w.worldAgent = normalizeWorldAgentConfig({
        worldAgent: {
            enabled: document.getElementById('w-agent-enabled').checked,
            intervalTurns: document.getElementById('w-agent-interval').value,
            model: document.getElementById('w-agent-model').value,
            proposalOnly: document.getElementById('w-agent-proposal-only').checked,
            openRouterRouting: readOpenRouterRoutingPanel('worldAgent')
        }
    });
    w.kernel = normalizeWorldKernelConfig({ kernel: {
        enabled: document.getElementById('w-kernel-enabled').checked,
        sceneLocationLimit: document.getElementById('w-kernel-location-limit').value,
        memoryMode: document.getElementById('w-kernel-memory-mode').value,
        repairMode: document.getElementById('w-kernel-repair-mode').value,
        compactTools: document.getElementById('w-kernel-compact-tools').checked
    } });
    const priorSidecarConfig = window.ExperimentalWorldsSidecarMode?.normalizeWorldConfig?.(w) || {};
    const sidecarDraftWorld = {
        ...w,
        sidecarConfig: {
            ...priorSidecarConfig,
            mode: document.getElementById('w-sidecar-mode').value,
            tracker: {
                ...(priorSidecarConfig.tracker || {}),
                inheritNarrator: document.getElementById('w-sidecar-inherit-narrator').checked,
                provider: document.getElementById('w-sidecar-provider').value,
                model: document.getElementById('w-sidecar-model').value.trim(),
                openRouterRouting: readOpenRouterRoutingPanel('sidecar'),
                reasoningMode: document.getElementById('w-sidecar-reasoning-mode').value,
                reasoning: document.getElementById('w-sidecar-reasoning-mode').value === 'enabled',
                reasoningEffort: document.getElementById('w-sidecar-reasoning-effort').value,
                readerEnabled: document.getElementById('w-sidecar-reader-enabled').checked,
                readerProfileInherit: document.getElementById('w-sidecar-reader-profile-inherit').checked,
                readerProfile: deriveSidecarReaderProfileRevision({
                    ...(priorSidecarConfig.tracker?.readerProfile || {}),
                    provider: document.getElementById('w-sidecar-reader-provider').value,
                    model: document.getElementById('w-sidecar-reader-model').value.trim(),
                    maxTokens: document.getElementById('w-sidecar-reader-profile-max-tokens').value,
                    timeoutSeconds: document.getElementById('w-sidecar-reader-timeout').value,
                    fullRefreshCadence: document.getElementById('w-sidecar-reader-refresh').value,
                    maxToolCalls: document.getElementById('w-sidecar-reader-tools').value,
                    maxLookupPayload: document.getElementById('w-sidecar-reader-lookup-budget').value,
                    contextBudget: document.getElementById('w-sidecar-reader-context-budget').value,
                    reasoningMode: document.getElementById('w-sidecar-reader-reasoning').value,
                    reasoningEffort: document.getElementById('w-sidecar-reader-reasoning-effort').value,
                    retryPolicy: document.getElementById('w-sidecar-reader-retry').value
                }),
                readerMaxTokens: document.getElementById('w-sidecar-reader-max-tokens').value,
                maxTokens: document.getElementById('w-sidecar-max-tokens').value
            },
            debug: {
                ...(priorSidecarConfig.debug || {}),
                enabled: document.getElementById('w-sidecar-debug').checked,
                retainTraceCount: document.getElementById('w-sidecar-trace-count').value
            },
            memory: {
                ...(priorSidecarConfig.memory || {}),
                inheritGlobal: document.getElementById('w-sidecar-memory-inherit').checked,
                episodeChunkTurns: document.getElementById('w-sidecar-episode-size').value,
                episodeCadenceTurns: document.getElementById('w-sidecar-episode-cadence').value,
                verbatimTurnWindow: document.getElementById('w-sidecar-verbatim-window').value,
                retrievalLimit: document.getElementById('w-sidecar-retrieval-limit').value,
                consolidationConcurrency: document.getElementById('w-sidecar-job-concurrency').value,
                backgroundProviderConcurrency: document.getElementById('w-sidecar-provider-concurrency').value
            }
        }
    };
    w.sidecarConfig = window.ExperimentalWorldsSidecarMode?.normalizeWorldConfig?.(sidecarDraftWorld) || priorSidecarConfig;
    const switchingToSidecar = !!storedBeforeSave && w.sidecarConfig?.mode === 'sidecar' && !wasSidecar;
    if (switchingToSidecar && !confirm(
        'Enable Sidecar for this world? Existing timelines remain Inline Legacy until you choose them in the migration wizard. Horde Studio will preserve raw roleplay and canonical receipts and create a local backup.'
    )) return;
    if (switchingToSidecar) {
        // A Sidecar migration must be both deliberate and recoverable. Keep a
        // compact, per-world backup rather than using the orphan-world rescue
        // store (which is reserved for worlds that disappear from the library).
        const backups = Array.isArray(w.sidecarMigrationBackups) ? w.sidecarMigrationBackups : [];
        backups.push({
            id: `sidecar_migration_${Date.now().toString(36)}`,
            createdAt: new Date().toISOString(),
            from: 'inline_legacy', to: 'sidecar',
            world: cloneSidecarMigrationRollbackWorld(storedBeforeSave),
            runtime: safeJsonClone(ExperimentalWorldsState.worldInstances?.[w.id] || null),
            note: 'Raw history and canonical receipts are preserved in the migrated runtime; this backup exists for explicit rollback/re-import.'
        });
        w.sidecarMigrationBackups = backups.slice(-3);
    }
    w.temp = parseFloat(document.getElementById('w-studio-temp').value) || 0.9;
    w.minP = parseFloat(document.getElementById('w-studio-min-p').value) || 0.0;
    w.topP = parseFloat(document.getElementById('w-studio-top-p').value) || 1.0;
    w.topK = parseInt(document.getElementById('w-studio-top-k').value) || 0;
    w.freqPenalty = parseFloat(document.getElementById('w-studio-freq-penalty').value) || 0.0;
    w.presPenalty = parseFloat(document.getElementById('w-studio-pres-penalty').value) || 0.0;
    w.repPenalty = parseFloat(document.getElementById('w-studio-rep-penalty').value) || 1.0;
    w.maxTokens = parseInt(document.getElementById('w-studio-max-tokens').value) || 2048;
    w.contextSize = parseInt(document.getElementById('w-studio-context-size').value) || 8192;
    w.reasoning = document.getElementById('w-studio-reasoning').checked;
    w.reasoningEffort = document.getElementById('w-studio-reasoning-effort').value;
    w.activePresetId = document.getElementById('w-studio-system-preset').value;
    
    // Save HUD Config
    w.hudConfig = w.hudConfig || {};
    w.hudConfig.showClock = document.getElementById('w-hud-show-clock').checked;
    w.hudConfig.showQuests = document.getElementById('w-hud-show-quests').checked;
    w.hudConfig.showLedger = document.getElementById('w-hud-show-ledger').checked;
    w.hudConfig.showInventory = document.getElementById('w-hud-show-inventory').checked;
    const startHour = parseInt(document.getElementById('w-hud-start-time').value, 10);
    w.hudConfig.startTimeHours = Number.isFinite(startHour) ? Math.max(0, Math.min(23, startHour)) : 8;
    const startMinute = parseInt(document.getElementById('w-hud-start-minute').value, 10);
    w.hudConfig.startTimeMinutes = Number.isFinite(startMinute) ? Math.max(0, Math.min(59, startMinute)) : 0;
    w.hudConfig.timeStep = isNaN(parseInt(document.getElementById('w-hud-time-step').value)) ? 5 : parseInt(document.getElementById('w-hud-time-step').value);
    w.hudConfig.startWeekday = WORLD_WEEKDAYS.includes(document.getElementById('w-hud-start-weekday').value)
        ? document.getElementById('w-hud-start-weekday').value : 'Monday';
    w.hudConfig.showDays = document.getElementById('w-hud-show-days').checked;
    w.hudConfig.enableSchedules = document.getElementById('w-hud-enable-schedules').checked;
    const statIdRenames = syncWorldStudioStatsFromDOM(w);
    saveWorldGameRuleControls(w, statIdRenames);
    // Half-written rows and references to things deleted this session must not
    // reach storage — otherwise the world is only repaired at the next reload,
    // and an export taken before then carries the damage to whoever opens it.
    normalizeAuthoredWorld(w);

    const idx = ExperimentalWorldsState.worlds.findIndex(world => world.id === w.id);
    if (idx !== -1) {
        ExperimentalWorldsState.worlds[idx] = JSON.parse(JSON.stringify(w));
    } else {
        ExperimentalWorldsState.worlds.push(JSON.parse(JSON.stringify(w)));
    }

    const savedWorld = ExperimentalWorldsState.worlds[idx !== -1 ? idx : ExperimentalWorldsState.worlds.length - 1];
    // Changing the world-level mode never silently migrates established
    // timelines. The migration wizard performs the explicit per-timeline
    // selection, backup, and import step instead.
    const migrationReports = [];

    ExperimentalWorldsHost.markMediaChanged();
    await ExperimentalWorldsHost.persist();
    renderWorlds();
    // Never leave a world-looking Sidecar-enabled while its existing play
    // timelines silently remain on the Legacy path. The wizard still owns
    // selection, backup and the actual migration; opening it makes that
    // required next action visible at the moment the setting changes.
    const inlineTimelines = (ExperimentalWorldsState.worldInstances?.[savedWorld.id]?.sessions || []).filter(session =>
        window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(savedWorld, session)?.mode !== 'sidecar');
    if (switchingToSidecar && inlineTimelines.length) {
        ExperimentalWorldsHost.notify('Sidecar is configured. Select the existing timeline(s) to migrate before generating another turn.', 'info');
        openSidecarMigrationWizard(savedWorld.id);
    } else {
        ExperimentalWorldsHost.notify(migrationReports.length
            ? `World saved; ${migrationReports.length} timeline${migrationReports.length === 1 ? '' : 's'} prepared for Sidecar.`
            : 'World Saved!', 'success');
    }
}

async function deleteWorld() {
    if (!ExperimentalWorldsState.editingWorld) return;
    if (!confirm(`Are you sure you want to delete "${ExperimentalWorldsState.editingWorld.name}"? This cannot be undone.`)) return;

    ExperimentalWorldsState.worlds = ExperimentalWorldsState.worlds.filter(w => w.id !== ExperimentalWorldsState.editingWorld.id);
    ExperimentalWorldsHost.markMediaChanged();
    if (ExperimentalWorldsState.worldInstances[ExperimentalWorldsState.editingWorld.id]) {
        delete ExperimentalWorldsState.worldInstances[ExperimentalWorldsState.editingWorld.id];
    }
    
    await ExperimentalWorldsHost.persist();
    ExperimentalWorldsHost.notify('World Deleted', 'success');
    renderWorlds();
    ExperimentalWorldsHost.navigate('worlds');
}

function addWorldLocation(position = 'bottom', regionId = '', parentLocationId = '', mapType = '') {
    const region = (ExperimentalWorldsState.editingWorld?.regions || []).find(item => item.id === regionId);
    const loc = {
        id: 'loc_' + Date.now(),
        name: '',
        regionId: region?.id || '',
        region: region?.name || '',
        mapType,
        parentLocationId,
        mapFloor: '',
        description: '',
        hiddenDescription: '',
        exits: [],
        secrets: []
    };
    if (position === 'top') {
        ExperimentalWorldsState.editingWorld.locations.unshift(loc);
    } else {
        ExperimentalWorldsState.editingWorld.locations.push(loc);
    }
    worldStudioListState.locations.query = '';
    worldStudioListState.locations.page = 0;
    openWorldRecordInspector('location', loc.id);
    ExperimentalWorldsHost.notify('New location ready to define.', 'success');
}

function addWorldRegion() {
    const world = ExperimentalWorldsState.editingWorld;
    if (!world) return;
    normalizeWorldDirectoryData(world);
    let id = `reg_${Date.now()}`;
    while (world.regions.some(region => region.id === id)) id = `reg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    world.regions.push({ id, name: 'New region', description: '', tags: [] });
    openWorldRecordInspector('region', id);
    ExperimentalWorldsHost.notify('New region ready. Add its first location when you are ready.', 'success');
}

function isExitFormat(val) {
    const v = (val || "").trim().toLowerCase();
    return v.startsWith("to ") || v.includes(" to ");
}

function validateLocationRef(val) {
    if (!ExperimentalWorldsState.editingWorld) return false;
    const v = (val || "").trim().toLowerCase();
    if (!v) return false;
    return ExperimentalWorldsState.editingWorld.locations.some(l => {
        const id = (l.id || "").trim().toLowerCase();
        const name = (l.name || "").trim().toLowerCase();
        return id === v || name === v;
    });
}

function getExitTargetName(exit) {
    let text = "";
    if (typeof exit === 'string') {
        text = exit;
    } else if (exit && typeof exit === 'object') {
        if (exit.targetLocationId) return String(exit.targetLocationId).trim();
        text = typeof exit.text === 'string' ? exit.text : (exit.text !== undefined && exit.text !== null ? String(exit.text) : "");
    }
    const cleanStr = text.trim();
    if (cleanStr.toLowerCase().startsWith('to ')) {
        return cleanStr.substring(3).trim();
    } else if (cleanStr.toLowerCase().includes(' to ')) {
        const parts = cleanStr.split(/\s+[tT][oO]\s+/);
        if (parts.length > 1) {
            // Only the first "to" separates direction from destination.
            // Names such as "The Road to Ruin" and "Gate to Hell" must remain
            // intact or movement, validation, and map links resolve differently.
            return parts.slice(1).join(' to ').trim();
        }
    }
    return cleanStr;
}

function getExitDirection(exit) {
    if (exit && typeof exit === 'object' && exit.direction) return String(exit.direction).trim();
    const text = typeof exit === 'string' ? exit : String(exit?.text || '');
    const clean = text.trim();
    if (!clean || /^to\s+/i.test(clean)) return '';
    const splitIndex = clean.search(/\s+to\s+/i);
    return splitIndex > 0 ? clean.slice(0, splitIndex).trim() : '';
}

function normalizeLocationSearchText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[’']/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/^(?:the|a|an)\s+/, '')
        .trim();
}

function findFuzzyLocation(query, locations) {
    if (!query || !Array.isArray(locations)) return null;
    const raw = String(query).trim().toLowerCase();
    const q = normalizeLocationSearchText(query);
    if (!q) return null;

    // IDs are authoritative and may be less human-readable than names.
    const idMatches = locations.filter(location =>
        String(location?.id || '').trim().toLowerCase() === raw);
    if (idMatches.length === 1) return idMatches[0];

    // A duplicate exact name is genuinely ambiguous. Returning the first one
    // made imported worlds appear to move the player at random.
    const exactNameMatches = locations.filter(location =>
        normalizeLocationSearchText(location?.name) === q);
    if (exactNameMatches.length === 1) return exactNameMatches[0];
    if (exactNameMatches.length > 1) return null;

    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'of', 'for', 'with', 'area', 'room', 'zone', 'place', 'location']);
    const getKeywords = value => String(value || '').toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w && !stopWords.has(w));
    const queryKeywords = getKeywords(q);
    const scored = locations.map(location => {
        const name = normalizeLocationSearchText(location?.name);
        const id = normalizeLocationSearchText(location?.id);
        if (!name && !id) return { location, score: 0 };
        let score = 0;
        const paddedQuery = ` ${q} `;
        if (name && paddedQuery.includes(` ${name} `)) score = Math.max(score, 800 + name.length);
        if (id && paddedQuery.includes(` ${id} `)) score = Math.max(score, 760 + id.length);
        // Partial lookup must begin at a word boundary. Arbitrary interior
        // substrings made ordinary pronouns dangerous: "her" matched the
        // middle of "Sheriff's office" and could become a destination.
        const prefixMatch = value => q.length >= 4 && (value.startsWith(q)
            || value.split(/\s+/).some(word => word.startsWith(q)));
        if (name && prefixMatch(name)) score = Math.max(score, 520 + q.length);
        if (id && prefixMatch(id)) score = Math.max(score, 500 + q.length);
        const locationKeywords = getKeywords(name);
        const overlap = queryKeywords.filter(word => locationKeywords.includes(word)).length;
        const coverage = overlap / Math.max(1, Math.min(queryKeywords.length, locationKeywords.length));
        if (overlap && coverage >= 0.6) score = Math.max(score, 300 + overlap * 20 + Math.round(coverage * 10));
        return { location, score };
    }).filter(result => result.score > 0)
        .sort((a, b) => b.score - a.score || String(a.location.id).localeCompare(String(b.location.id)));

    if (!scored.length) return null;
    if (scored[1] && scored[1].score === scored[0].score) return null;
    return scored[0].location;
}

function canTravelDirectly(world, fromLocationId, toLocation) {
    if (!world || !toLocation) return false;
    if (fromLocationId === toLocation.id) return true;
    const from = world.locations.find(location => location.id === fromLocationId);
    if (!from) return false;
    return (from.exits || []).some(exit => {
        const target = getExitTargetName(exit);
        if (!target) return false;
        const normalized = target.trim().toLowerCase();
        return normalized === String(toLocation.id || '').toLowerCase()
            || normalized === String(toLocation.name || '').trim().toLowerCase();
    });
}

function resolveWorldExitTarget(world, exit) {
    if (!world || !Array.isArray(world.locations)) return null;
    const target = getExitTargetName(exit);
    if (!target) return null;
    const normalized = String(target).trim().toLowerCase();
    const idMatches = world.locations.filter(location =>
        String(location.id || '').trim().toLowerCase() === normalized);
    if (idMatches.length === 1) return idMatches[0];
    const nameMatches = world.locations.filter(location =>
        String(location.name || '').trim().toLowerCase() === normalized);
    if (nameMatches.length === 1) return nameMatches[0];
    if (nameMatches.length > 1) return null;
    return findFuzzyLocation(target, world.locations);
}

function resolveWorldContainmentParent(world, location) {
    if (!world || !location || !Array.isArray(world.locations)) return null;
    const resolveExact = ref => {
        const key = String(ref || '').trim().toLowerCase();
        if (!key) return null;
        const idMatches = world.locations.filter(candidate =>
            String(candidate?.id || '').trim().toLowerCase() === key);
        if (idMatches.length === 1) return idMatches[0];
        const nameMatches = world.locations.filter(candidate =>
            String(candidate?.name || '').trim().toLowerCase() === key);
        return nameMatches.length === 1 ? nameMatches[0] : null;
    };

    // parentLocationId is the authoritative "inside / attached to" field.
    // Older worlds commonly stored the containing building in `region`, so
    // retain that exact-reference fallback without fuzzy global guessing.
    for (const ref of [location.parentLocationId, location.region]) {
        const parent = resolveExact(ref);
        if (parent && parent.id !== location.id) return parent;
    }
    return null;
}

function findWorldTravelPath(world, fromLocationId, toLocationId) {
    if (!world || !Array.isArray(world.locations)) return null;
    const locationById = new Map();
    const locationsByName = new Map();
    world.locations.forEach(location => {
        locationById.set(String(location.id || '').trim().toLowerCase(), location);
        const name = String(location.name || '').trim().toLowerCase();
        if (!name) return;
        if (!locationsByName.has(name)) locationsByName.set(name, location);
        else locationsByName.set(name, null);
    });
    const from = locationById.get(String(fromLocationId || '').trim().toLowerCase())
        || findFuzzyLocation(fromLocationId, world.locations);
    const to = locationById.get(String(toLocationId || '').trim().toLowerCase())
        || findFuzzyLocation(toLocationId, world.locations);
    if (!from || !to) return null;
    if (from.id === to.id) return [from.id];

    // Containment index, built once. Uses the same maps as the walk, so name
    // collisions resolve to null exactly as resolveWorldContainmentParent does,
    // and the whole thing stays O(n) instead of scanning per location.
    const parentOf = location => {
        for (const ref of [location.parentLocationId, location.region]) {
            const key = String(ref || '').trim().toLowerCase();
            if (!key) continue;
            const parent = locationById.get(key) || locationsByName.get(key);
            if (parent && parent.id !== location.id) return parent;
        }
        return null;
    };
    const childrenOf = new Map();
    world.locations.forEach(location => {
        const parent = parentOf(location);
        if (!parent) return;
        if (!childrenOf.has(parent.id)) childrenOf.set(parent.id, []);
        childrenOf.get(parent.id).push(location);
    });

    const previous = new Map([[from.id, null]]);
    const queue = [from.id];
    for (let cursor = 0; cursor < queue.length && cursor < 2000; cursor++) {
        const currentId = queue[cursor];
        const current = locationById.get(String(currentId || '').trim().toLowerCase());
        if (!current) continue;
        const nextLocations = [];
        for (const exit of current.exits || []) {
            const targetRef = getExitTargetName(exit);
            const targetKey = String(targetRef || '').trim().toLowerCase();
            const target = locationById.get(targetKey)
                || locationsByName.get(targetKey)
                || resolveWorldExitTarget(world, exit);
            if (target) nextLocations.push(target);
        }

        // Containment is a real route in BOTH directions. A room that sits
        // inside a building can be walked out of *and into* — "the bathroom is
        // inside the house" means you can enter it from the house, whether or
        // not the author remembered to add the reciprocal exit by hand. Treating
        // this as exit-only made rooms one-way traps: you could leave the
        // bathroom forever but never walk back in.
        const parent = parentOf(current);
        if (parent) nextLocations.push(parent);
        (childrenOf.get(current.id) || []).forEach(child => nextLocations.push(child));

        for (const target of nextLocations) {
            if (previous.has(target.id)) continue;
            previous.set(target.id, currentId);
            if (target.id === to.id) {
                const path = [to.id];
                let step = currentId;
                while (step) {
                    path.push(step);
                    step = previous.get(step);
                }
                return path.reverse();
            }
            queue.push(target.id);
        }
    }
    return null;
}

function resolveWorldMovementTarget(world, fromLocationId, targetPhrase, allowPrefixRetry = true) {
    if (!world || !targetPhrase) return null;
    const fromKey = String(fromLocationId || '').trim().toLowerCase();
    const from = world.locations.find(location =>
        String(location?.id || '').trim().toLowerCase() === fromKey)
        || findFuzzyLocation(fromLocationId, world.locations);
    if (!from) return null;
    const query = normalizeLocationSearchText(targetPhrase);
    if (!query) return null;
    // Proper authored names always beat semantic category inference. Without
    // this, "Karsholm Keep" was reduced to the generic word "keep" and became
    // ambiguous with whichever buildings happened to be nearby.
    const isPureDirection = /^(?:north|south|east|west|northeast|northwest|southeast|southwest|up|down|upstairs|downstairs|inside|outside|in|out|enter|exit|leave)$/.test(query);
    if (!isPureDirection) {
        const authoredDirectTarget = findFuzzyLocation(targetPhrase, (from.exits || [])
            .map(exit => resolveWorldExitTarget(world, exit)).filter(Boolean));
        if (authoredDirectTarget) return authoredDirectTarget;
        const authoredGlobalTarget = findFuzzyLocation(targetPhrase, world.locations);
        if (authoredGlobalTarget && authoredGlobalTarget.id !== from.id
            && findWorldTravelPath(world, from.id, authoredGlobalTarget.id)) {
            return authoredGlobalTarget;
        }
    }

    // Natural movement often names a kind of place rather than its authored
    // proper name: "I walk into the building", "step inside", "go through the
    // door". Resolve those phrases against the *local scene graph*. This is
    // intentionally conservative: one locally plausible destination is smart;
    // choosing between two buildings is a hallucination.
    const contextualTargets = (() => {
        const candidates = [];
        const add = location => {
            if (location && location.id !== from.id && !candidates.some(item => item.id === location.id)) {
                candidates.push(location);
            }
        };
        (from.exits || []).forEach(exit => add(resolveWorldExitTarget(world, exit)));
        (world.locations || []).forEach(location => {
            const parent = resolveWorldContainmentParent(world, location);
            if (parent?.id === from.id) add(location);
        });
        return candidates;
    })();
    const genericWords = new Set(query.split(/\s+/).filter(Boolean));
    const wantsInside = /\b(?:in|inside|indoors?|enter|through (?:the )?(?:door|doorway|entrance|gate))\b/.test(query);
    const requestedKinds = [
        ['building', /\b(?:building|house|home|inn|tavern|shop|store|forge|chapel|temple|keep|tower|hall|library|school|office|warehouse|barn)\b/],
        ['room', /\b(?:room|chamber|bedroom|bathroom|kitchen|cellar|basement|hallway|office)\b/],
        ['outdoor', /\b(?:outside|outdoors?|street|road|square|garden|yard|courtyard|field|forest|woods|park)\b/]
    ].filter(([, pattern]) => pattern.test(query)).map(([kind]) => kind);
    if (wantsInside && requestedKinds.length === 0) requestedKinds.push('building', 'room');

    if (requestedKinds.length || /^(?:the |a |an )?(?:door|doorway|entrance|way in|inside|indoors?)$/.test(query)) {
        const kindMatches = contextualTargets.filter(location => {
            const haystack = normalizeLocationSearchText([
                location.name, location.mapType, location.description, location.region
            ].filter(Boolean).join(' '));
            const mapType = normalizeLocationSearchText(location.mapType);
            return requestedKinds.some(kind => {
                if (kind === 'building') {
                    return mapType === 'building'
                        || /\b(?:building|house|home|inn|tavern|shop|store|forge|chapel|temple|keep|tower|library|school|office|warehouse|barn)\b/.test(haystack);
                }
                if (kind === 'room') {
                    return mapType === 'room'
                        || /\b(?:room|chamber|bedroom|bathroom|kitchen|cellar|basement|hallway|office)\b/.test(haystack);
                }
                return mapType === 'outdoor'
                    || /\b(?:street|road|square|garden|yard|courtyard|field|forest|woods|park|outside|outdoor)\b/.test(haystack);
            });
        });
        if (kindMatches.length === 1) return kindMatches[0];
        if (kindMatches.length > 1) {
            // A generic noun plus one distinguishing authored word ("the old
            // stone building") can still select a unique local destination.
            const noise = new Set(['the', 'a', 'an', 'into', 'inside', 'in', 'through', 'door', 'doorway',
                'entrance', 'building', 'room', 'place', 'nearby', 'next']);
            const clues = [...genericWords].filter(word => word.length > 2 && !noise.has(word));
            const scored = kindMatches.map(location => ({
                location,
                score: clues.filter(word => normalizeLocationSearchText(`${location.name} ${location.description || ''}`).includes(word)).length
            })).sort((a, b) => b.score - a.score);
            if (scored[0]?.score > 0 && scored[0].score > (scored[1]?.score || 0)) return scored[0].location;
            return null;
        }
        // "through the door" with one local continuation is deterministic even
        // when an older world has no mapType metadata.
        if (contextualTargets.length === 1
            && /\b(?:inside|indoors?|door|doorway|entrance|way in)\b/.test(query)) {
            return contextualTargets[0];
        }
    }

    // Direction-only movement ("go north", "head outside") must resolve from
    // the current exits, never by globally guessing a location.
    const directionAliases = new Set([
        'north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest',
        'up', 'down', 'upstairs', 'downstairs', 'inside', 'outside', 'in', 'out', 'enter', 'exit', 'leave'
    ]);
    if (directionAliases.has(query)) {
        const outwardAliases = new Set(['out', 'outside', 'exit', 'leave']);
        const isOutwardQuery = outwardAliases.has(query);
        const matches = (from.exits || []).filter(exit => {
            const direction = normalizeLocationSearchText(getExitDirection(exit));
            if (direction === query) return true;
            if (query === 'upstairs') return direction === 'up';
            if (query === 'downstairs') return direction === 'down';
            if (isOutwardQuery) return outwardAliases.has(direction);
            return false;
        }).map(exit => resolveWorldExitTarget(world, exit)).filter(Boolean);
        if (matches.length === 1) return matches[0];
        if (matches.length > 1) return null;

        if (isOutwardQuery) {
            const parent = resolveWorldContainmentParent(world, from);
            if (parent) return parent;

            // Legacy rooms often have one plain "to Hallway" exit with no
            // direction or hierarchy metadata. A sole valid exit is safe and
            // deterministic; multiple exits remain intentionally ambiguous.
            const soleTargets = [...new Map((from.exits || [])
                .map(exit => resolveWorldExitTarget(world, exit))
                .filter(Boolean)
                .map(location => [location.id, location])).values()];
            if (soleTargets.length === 1) return soleTargets[0];
        }
        return null;
    }

    // Prefer direct neighbors for short/partial descriptions, then allow a
    // unique reachable destination elsewhere in the graph.
    const directTargets = [...new Map((from.exits || [])
        .map(exit => resolveWorldExitTarget(world, exit))
        .filter(Boolean)
        .map(location => [location.id, location])).values()];
    const direct = findFuzzyLocation(targetPhrase, directTargets);
    if (direct) return direct;
    const directionalMatches = (from.exits || []).filter(exit => {
        const direction = normalizeLocationSearchText(getExitDirection(exit));
        if (!direction || !query.startsWith(`${direction} `)) return false;
        const rest = query.slice(direction.length).trim();
        return /^(?:and|then|door|exit|way|path|passage|stairs)\b/.test(rest);
    }).map(exit => resolveWorldExitTarget(world, exit)).filter(Boolean);
    if (directionalMatches.length === 1) return directionalMatches[0];
    const global = findFuzzyLocation(targetPhrase, world.locations);
    // "I leave the taproom" names the place being LEFT, not a destination:
    // when the phrase resolves to where the player already stands, treat it
    // as outward intent instead of a zero-step trip.
    if (global && global.id === from.id) {
        const parent = resolveWorldContainmentParent(world, from);
        if (parent) return parent;
        const soleTargets = [...new Map((from.exits || [])
            .map(exit => resolveWorldExitTarget(world, exit))
            .filter(Boolean)
            .map(location => [location.id, location])).values()];
        return soleTargets.length === 1 ? soleTargets[0] : null;
    }
    if (global && findWorldTravelPath(world, from.id, global.id)) return global;

    // Trailing words the trimmer could not know were noise ("the bathroom on
    // the left", "the hall past the stairs"). Fall back to the longest leading
    // phrase that names somewhere real, rather than failing on the whole blob.
    if (allowPrefixRetry) {
        // Bounded: a destination is a short noun phrase, so only the leading
        // words can name one. Retrying every prefix of a pasted paragraph cost
        // seconds of blocked UI for a match that could never be there.
        const words = query.split(' ').filter(Boolean).slice(0, 12);
        for (let length = words.length - 1; length >= 1; length--) {
            const candidate = resolveWorldMovementTarget(world, fromLocationId, words.slice(0, length).join(' '), false);
            if (candidate) return candidate;
        }
    }
    return null;
}

function checkExitTarget(exitStr) {
    const target = getExitTargetName(exitStr);
    if (!target) return false;
    const cleanTarget = target.trim().toLowerCase();
    return ExperimentalWorldsState.editingWorld.locations.some(l => {
        const id = (l.id || "").trim().toLowerCase();
        const name = (l.name || "").trim().toLowerCase();
        return id === cleanTarget || name === cleanTarget;
    });
}

function updateExitAutocomplete(inputEl, loc) {
    const val = inputEl.value;
    const container = inputEl.parentElement;
    if (!container || !container.classList.contains('exit-autocomplete-container')) return;
    
    // Remove existing dropdown if any
    let dropdown = container.querySelector('.exit-autocomplete-dropdown');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.className = 'exit-autocomplete-dropdown';
        container.appendChild(dropdown);
    }
    
    // Find suggestions based on input value
    const trimmedVal = val.trim();
    const valLower = val.toLowerCase();
    
    let directionPrefix = "";
    let searchTerm = "";
    
    if (valLower.startsWith("to ")) {
        directionPrefix = "to ";
        searchTerm = val.substring(3);
    } else if (valLower === "to") {
        directionPrefix = "to ";
        searchTerm = "";
    } else if (valLower.includes(" to ")) {
        const parts = val.split(/\s+[tT][oO]\s+/);
        directionPrefix = parts[0] + " to ";
        searchTerm = parts.slice(1).join(" to ");
    } else if (valLower.match(/\s+to$/i)) {
        const parts = val.split(/\s+[tT][oO]$/i);
        directionPrefix = parts[0] + " to ";
        searchTerm = "";
    } else {
        // Check if a direction has been typed
        const directions = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'up', 'down', 'inside', 'outside', 'in', 'out', 'enter', 'exit'];
        if (directions.includes(trimmedVal.toLowerCase())) {
            directionPrefix = trimmedVal + " to ";
            searchTerm = "";
        } else {
            // Implicit "to " prefix for typing target location directly
            directionPrefix = "to ";
            searchTerm = val;
        }
    }
    
    const locations = (ExperimentalWorldsState.editingWorld && ExperimentalWorldsState.editingWorld.locations) || [];
    const searchLower = searchTerm.toLowerCase();
    
    // Filter matching locations
    const matches = locations.filter(l => {
        // don't suggest exiting to the same location
        if (l.id === loc.id) return false;
        
        return l.name.toLowerCase().includes(searchLower) || l.id.toLowerCase().includes(searchLower);
    });
    
    dropdown.innerHTML = '';
    
    if (matches.length === 0) {
        dropdown.remove();
        return;
    }
    
    matches.forEach((m, idx) => {
        const item = document.createElement('div');
        item.className = 'exit-autocomplete-item';
        if (idx === 0) item.classList.add('active'); // default active first item
        
        const finalVal = directionPrefix + m.name;
        
        item.innerHTML = `
            <span class="direction-part">${escapeHTML(directionPrefix)}</span>
            <span class="location-part">${escapeHTML(m.name)}</span>
        `;
        
        item.onmousedown = (ev) => {
            ev.preventDefault(); // Prevent input blur before click
            
            const exIdx = inputEl.dataset.idx;
            const oldVal = inputEl.dataset.oldVal || "";
            const newVal = finalVal;
            if (oldVal !== newVal) {
                const isOneWay = typeof loc.exits[exIdx] === 'object' && loc.exits[exIdx].isOneWay;
                const travelTime = typeof loc.exits[exIdx] === 'object' ? loc.exits[exIdx].travelTime : 0;
                
                if (oldVal) syncExitConnection(loc, oldVal, false, 0, true);
                syncExitConnection(loc, newVal, isOneWay, travelTime, false);
                inputEl.dataset.oldVal = newVal;
            }

            inputEl.value = finalVal;
            if (typeof loc.exits[exIdx] === 'string') loc.exits[exIdx] = finalVal;
            else loc.exits[exIdx].text = finalVal;
            
            const isValid = checkExitTarget(finalVal);
            inputEl.className = `form-input exit-val ${isValid ? 'valid-ref' : (isExitFormat(finalVal) ? 'invalid-ref' : '')}`;
            
            const rowDiv = inputEl.parentElement.parentElement;
            const hintSpan = rowDiv.nextElementSibling;
            if (hintSpan && hintSpan.classList.contains('ref-hint')) {
                hintSpan.className = `ref-hint ${isValid ? 'valid' : 'invalid'}`;
                hintSpan.textContent = isValid ? '✓ Verified Connection' : (isExitFormat(finalVal) ? '⚠ Broken Connection' : 'Hint: Use "Direction to Location"');
            }
            
            dropdown.remove();
            
            // Re-render to persist and update architect map/warnings
            renderWorldLocations();
            if (typeof renderWorldArchitectMap === 'function') renderWorldArchitectMap();
        };
        
        dropdown.appendChild(item);
    });
}

function getOppositeDirection(dir) {
    // Called wherever an exit's direction is read back, and an exit written as
    // a bare object or a stray null has no direction at all. Throwing here took
    // the whole caller down with it.
    if (dir == null) return '';
    const opposites = {
        'north': 'south',
        'south': 'north',
        'east': 'west',
        'west': 'east',
        'northeast': 'southwest',
        'southwest': 'northeast',
        'northwest': 'southeast',
        'southeast': 'northwest',
        'up': 'down',
        'down': 'up',
        'inside': 'outside',
        'outside': 'inside',
        'in': 'out',
        'out': 'in',
        'enter': 'exit',
        'exit': 'enter'
    };
    return opposites[dir.toLowerCase()] || null;
}

function syncExitConnection(sourceLoc, exitText, isOneWay, travelTime, isDeleted = false) {
    if (!ExperimentalWorldsState.editingWorld || !sourceLoc) return;
    
    const direction = getExitDirection(exitText);
    const targetName = getExitTargetName(exitText);
    
    if (!targetName) return;
    const cleanTargetName = targetName.toLowerCase();
    
    const targetLoc = ExperimentalWorldsState.editingWorld.locations.find(l =>
        (l.id && l.id.toLowerCase() === cleanTargetName) || 
        (l.name && l.name.toLowerCase() === cleanTargetName)
    );
    if (!targetLoc) return;
    const sourceExit = (sourceLoc.exits || []).find(exit => {
        const linked = getLocationRef(ExperimentalWorldsState.editingWorld, exit?.targetLocationId || getExitTargetName(exit));
        return linked?.id === targetLoc.id;
    });
    
    let oppDir = direction ? getOppositeDirection(direction) : null;
    const sourceName = sourceLoc.name || "";
    const reverseExitText = oppDir ? `${oppDir} to ${sourceName}` : `to ${sourceName}`;
    
    targetLoc.exits = targetLoc.exits || [];
    const existingIndex = targetLoc.exits.findIndex(ex => {
        const target = getExitTargetName(ex);
        if (!target) return false;
        const cleanTarget = target.toLowerCase();
        const sourceLocName = (sourceLoc.name || "").toLowerCase();
        const sourceLocId = (sourceLoc.id || "").toLowerCase();
        return (sourceLocName && cleanTarget === sourceLocName) || 
               (sourceLocId && cleanTarget === sourceLocId);
    });
    
    if (isDeleted || isOneWay) {
        if (existingIndex !== -1) {
            targetLoc.exits.splice(existingIndex, 1);
        }
    } else {
        const reverseExitObj = {
            text: reverseExitText,
            targetLocationId: sourceLoc.id,
            travelTime: travelTime || 0,
            mode: normalizeWorldTravelMode(sourceExit?.mode),
            routeName: String(sourceExit?.routeName || '').slice(0, 160),
            cost: String(sourceExit?.cost || '').slice(0, 120),
            isOneWay: false
        };
        
        if (existingIndex === -1) {
            targetLoc.exits.push(reverseExitObj);
        } else {
            if (typeof targetLoc.exits[existingIndex] === 'string') {
                targetLoc.exits[existingIndex] = reverseExitObj;
            } else {
                targetLoc.exits[existingIndex].text = reverseExitText;
                targetLoc.exits[existingIndex].targetLocationId = sourceLoc.id;
                targetLoc.exits[existingIndex].travelTime = travelTime || 0;
                targetLoc.exits[existingIndex].mode = reverseExitObj.mode;
                targetLoc.exits[existingIndex].routeName = reverseExitObj.routeName;
                targetLoc.exits[existingIndex].cost = reverseExitObj.cost;
            }
        }
    }
}


function renderWorldStudio() {
    // Refresh the visible data panel after an audit fix. Hidden panels hydrate
    // when opened; eagerly rebuilding all of them defeats the large-world fix.
    const world = ExperimentalWorldsState.editingWorld;
    if (!world) return;
    const activeTab = document.querySelector('.world-studio-tab.active')?.dataset.tab || 'w-basics';
    renderWorldStudioPanel(activeTab);
    updateWorldTokenCount();
}

const WORLD_VISUAL_PIPELINE_UI = Object.freeze({
    new: {
        provider: 'w-visual-new-image-provider', model: 'w-visual-new-image-model',
        results: 'w-visual-new-image-model-results', status: 'w-visual-new-image-model-status',
        refresh: 'w-visual-new-refresh-models', providerField: 'newImageProvider',
        modelField: 'newImageModel', label: 'new image'
    },
    revision: {
        provider: 'w-visual-revision-image-provider', model: 'w-visual-revision-image-model',
        results: 'w-visual-revision-image-model-results', status: 'w-visual-revision-image-model-status',
        refresh: 'w-visual-revision-refresh-models', providerField: 'revisionImageProvider',
        modelField: 'revisionImageModel', label: 'revision image'
    }
});

const worldVisualModelSearchRenderId = { new: 0, revision: 0 };

async function renderWorldVisualModelSearch(world, pipeline = 'new', force = false) {
    const ui = WORLD_VISUAL_PIPELINE_UI[pipeline] || WORLD_VISUAL_PIPELINE_UI.new;
    const input = document.getElementById(ui.model);
    const results = document.getElementById(ui.results);
    const status = document.getElementById(ui.status);
    if (!world || !input || !results || !status) return;
    const renderId = ++worldVisualModelSearchRenderId[pipeline];
    const provider = worldVisualProvider(world, pipeline);
    if (!['openrouter', 'gptproto', 'nanogpt', 'fal'].includes(provider)) {
        status.textContent = 'The inherited provider does not expose a cloud image catalog. Choose OpenRouter, GPTProto, NanoGPT or Fal, or enter the exact model ID used by your provider.';
        results.innerHTML = '<div class="smart-input-empty">Choose a catalog-backed image provider to browse compatible models.</div>';
        setCompanionSearchOpen(input, results, true);
        return;
    }
    status.textContent = `Loading ${pipeline === 'revision' ? 'reference-capable ' : ''}image models from ${ExperimentalWorldsHost.providerDisplayName(provider)}…`;
    // The live fal catalog can take a few seconds on first load. Open the
    // results box with a loading placeholder immediately so the dropdown is
    // visibly working instead of silently absent — clicks during the gap
    // used to land on nothing and look like dead options.
    setCompanionSearchOpen(input, results, true);
    renderCompanionSearchResults(results, [], () => {}, `Loading ${pipeline === 'revision' ? 'reference-capable ' : ''}image models…`);
    let models = [];
    try {
        models = rankCompanionImageModels(
            await getCompanionOutputModels('image', force, provider), provider);
    } catch (error) {
        console.warn('Could not load the World Visuals image catalog:', error);
    }
    if (renderId !== worldVisualModelSearchRenderId[pipeline] || ExperimentalWorldsState.editingWorld?.id !== world.id) return;
    // A render that completes after the user picked an option (or clicked
    // away) must not rebuild and force the closed list back open.
    if (document.activeElement !== input && results.classList.contains('hidden')) return;
    // Revision generation is deliberately an image-reference operation. A
    // catalogue model which explicitly lacks that capability is not offered
    // here; exact custom IDs remain available for providers whose catalogue
    // cannot describe an endpoint yet.
    if (pipeline === 'revision') models = models.filter(model => model.supportsReference === true);
    const query = input.value.trim().toLowerCase();
    const matches = models.filter(model => !query
        || `${model.name || ''} ${model.id || ''}`.toLowerCase().includes(query)).slice(0, 60);
    const options = matches.map(model => ({
        value: model.id,
        label: model.name || model.id,
        meta: [model.id, model.supportsReference === true ? 'reference capable' : '',
            Number.isFinite(model.price) ? `$${model.price.toFixed(5)}/image` : '']
            .filter(Boolean).join(' · ')
    }));
    renderCompanionSearchResults(results, options, option => {
        const liveWorld = ExperimentalWorldsState.editingWorld;
        if (!liveWorld) return;
        const presentation = normalizeWorldPresentation(liveWorld);
        presentation[ui.modelField] = option.value;
        if (pipeline === 'new') presentation.imageModel = option.value;
        input.value = option.value;
        setCompanionSearchOpen(input, results, false);
        status.textContent = `${option.label} selected · ${ExperimentalWorldsHost.providerDisplayName(provider)}`;
    }, models.length
        ? 'No compatible model matches. Keep typing to use an exact custom model ID.'
        : `No ${pipeline === 'revision' ? 'reference-capable ' : ''}image models were returned by ${ExperimentalWorldsHost.providerDisplayName(provider)}. You may still enter an exact model ID.`);
    input.setAttribute('aria-expanded', 'true');
    const selected = models.find(model => model.id === input.value.trim());
    status.textContent = selected
        ? `${selected.name || selected.id} · ${selected.supportsReference === true ? 'reference capable' : 'reference support not advertised'} · ${ExperimentalWorldsHost.providerDisplayName(provider)}`
        : `${models.length} ${pipeline === 'revision' ? 'reference-capable ' : ''}image model${models.length === 1 ? '' : 's'} available from ${ExperimentalWorldsHost.providerDisplayName(provider)}${input.value.trim() ? ' · custom ID entered' : (pipeline === 'revision' ? ' · blank uses the new-image model when it supports revision' : '')}.`;
}

const AI_FIELD_DESCRIPTORS = Object.freeze({
    'ent-desc': {
        label: 'Basic description',
        guidance: 'Two or three sentences of stable physical identity: build, colouring, face, habitual dress. Present tense, no scene-specific action, no backstory.'
    },
    'ent-persona': {
        label: 'Persona / backstory',
        guidance: 'One dense paragraph on temperament, competence, what they want and what they protect. Third person. Reveal private truths only if the transcript already established them.'
    },
    'ent-goal': {
        label: 'Living-world agenda',
        guidance: 'A single sentence naming one persistent thing this character pursues off-screen. Concrete and ongoing, not a plot beat.'
    },
    'ent-image-prompt': {
        label: 'Portrait image prompt',
        guidance: 'A single image-generation prompt describing this character\'s appearance for a portrait: age, build, colouring, hair, face, characteristic clothing and expression. Obey the world art bible. No camera brand names, no negative prompts, no narrative.'
    },
    'world-visual-primary': {
        label: 'Appearance & public impression',
        guidance: 'Two or three sentences of how this character looks and presents themselves: age, build, colouring, hair, face, how they habitually dress and carry themselves in public. A general impression, not one specific outfit or scene. No pose, no lighting.'
    },
    'world-outfit-description': {
        label: 'Outfit description',
        guidance: 'One to three sentences describing everything worn in this single outfit: garments and layers, footwear, accessories, jewellery, colours, materials and condition. Third person, present tense. No pose, no lighting, no scene, no camera language.'
    },
    // Dossier fields. These write authored claims, so the user always reviews
    // before Save — but identity fields (name, age, pronouns) are deliberately
    // absent: those are the player's to decide, never the model's.
    'dossier-description': {
        label: 'Physical description',
        guidance: 'Two or three sentences of stable appearance: build, colouring, face, habitual dress. Present tense, no scene-specific action.'
    },
    'dossier-persona': {
        label: 'Personality and persona',
        guidance: 'One dense paragraph on voice, temperament, competence, needs and what they protect. Third person.'
    },
    'dossier-values': {
        label: 'Values',
        guidance: 'Three to five short lines, ONE PER LINE, no bullets or numbering. Each names something this person actually protects or believes.'
    },
    'dossier-vulnerabilities': {
        label: 'Vulnerabilities',
        guidance: 'Three to five short lines, ONE PER LINE, no bullets or numbering. Each names a real pressure point — fear, need, blind spot. Not weaknesses as flaws-list filler.'
    },
    'dossier-boundaries': {
        label: 'Hard and personal boundaries',
        guidance: 'Three to five short lines, ONE PER LINE, no bullets. What this person will not do or will not accept. Character boundaries, not content policy.'
    },
    'dossier-current-outfit': {
        label: 'Current outfit',
        guidance: 'One or two sentences describing what they are wearing right now, consistent with the current scene and time of day in the transcript.'
    },
    'dossier-affiliations': {
        label: 'Affiliations',
        guidance: 'Short lines, ONE PER LINE, no bullets. Groups, workplaces or scenes this person genuinely belongs to. Only ones established elsewhere.'
    },
    'dossier-routines': {
        label: 'Routines and ordinary schedule',
        guidance: 'Short lines, ONE PER LINE, no bullets. What this person ordinarily does and when. Everyday rhythm, not plot.'
    },
    'loc-desc': {
        label: 'Location description',
        guidance: 'Two or three sentences on what is physically present and how the place feels to stand in. No characters by name, no events.'
    },
    'fac-desc': {
        label: 'Faction description',
        guidance: 'Two sentences on who belongs to this group and what holds them together. No invented leaders.'
    }
});

// Engine placeholders read as populated but carry no information. Treating
// them as filled meant the sparkle button offered "embellish" on the string
// "A person you just met." — so they count as empty everywhere.
const AI_FIELD_PLACEHOLDERS = Object.freeze([
    'a person you just met.',
    'a person you just met',
    'an unremarkable place.',
    'nothing specified.',
    'unknown'
]);

function isPlaceholderFieldValue(value) {
    const clean = String(value || '').trim().toLowerCase();
    if (!clean) return true;
    return AI_FIELD_PLACEHOLDERS.includes(clean);
}

function aiFieldWorldContext(world, entity) {
    const parts = [];
    if (world?.name) parts.push(`World: ${world.name}`);
    if (world?.description) parts.push(`Premise: ${String(world.description).slice(0, 400)}`);
    if (world?.artBible) parts.push(`Art direction: ${String(world.artBible).slice(0, 400)}`);
    if (entity) {
        const sib = ['name', 'role', 'description', 'persona', 'goal', 'appearance']
            .map(key => (entity[key] && !isPlaceholderFieldValue(entity[key]))
                ? `${key}: ${String(entity[key]).slice(0, 400)}` : null)
            .filter(Boolean);
        if (sib.length) parts.push(`Known about this subject:\n${sib.join('\n')}`);
    }
    return parts.join('\n\n');
}

// Only the transcript that actually mentions the subject. Sending the whole
// history would bury the few lines that describe them.
function aiFieldTranscriptContext(entity, limit = 14) {
    const sess = getCurrentWorldSession();
    if (!sess || !entity?.name) return '';
    const names = String(entity.name).split(/\s+/).filter(n => n.length > 2).concat([entity.name]);
    const hits = (sess.history || [])
        .filter(m => m.role === 'dm' || m.role === 'user')
        .filter(m => names.some(n => String(m.text || '').toLowerCase().includes(n.toLowerCase())))
        .slice(-limit)
        .map(m => `${m.role === 'user' ? 'Player' : 'Narrator'}: ${String(m.text || '').slice(0, 600)}`);
    return hits.length ? `Recent transcript mentioning them:\n${hits.join('\n\n')}` : '';
}

async function completeFieldWithAI(fieldKey, currentValue, entity, world, mode, instruction = '') {
    const descriptor = AI_FIELD_DESCRIPTORS[fieldKey];
    if (!descriptor) throw new Error(`No descriptor for field "${fieldKey}"`);
    if (isPlaceholderFieldValue(currentValue)) { currentValue = ''; mode = 'fill'; }
    // An author instruction is the highest-priority input: honor it exactly
    // where it is specific and fill out the rest of the field consistently
    // with it. Without one the fill works from world and transcript context.
    const authored = String(instruction || '').trim().slice(0, 2000);
    const intent = authored
        ? 'The author gave an instruction for this field. Honor every specific request in it, and complete the remaining parts of the field consistently with those requests and the established context.'
        : mode === 'rewrite'
        ? 'The subject has changed during play. Rewrite this field to match who they are NOW, preserving anything still true.'
        : mode === 'embellish'
            ? 'Enrich the existing text. Keep every fact already written and add specificity. Never contradict it.'
            : 'This field is empty. Write it from scratch using only what is established below.';
    const model = String(ExperimentalWorldsState.globalSettings?.structuredModel || '').trim()
        || world?.model || ExperimentalWorldsState.globalSettings?.defaultModel;
    const body = ExperimentalWorldsHost.applyOpenRouterRouting({
        model,
        max_tokens: 700,
        messages: [
            {
                role: 'system',
                content: `You write a single field of a roleplay world's character/location database.\n\nFIELD: ${descriptor.label}\nREQUIREMENT: ${descriptor.guidance}\n\n${intent}\n\nReturn ONLY the field's new text. No preamble, no quotes, no markdown headings, no explanation.`
            },
            {
                role: 'user',
                content: [
                    authored ? `AUTHOR INSTRUCTION (highest priority):\n${authored}` : '',
                    aiFieldWorldContext(world, entity),
                    aiFieldTranscriptContext(entity),
                    currentValue ? `Current value of this field:\n${currentValue}` : 'This field is currently empty.'
                ].filter(Boolean).join('\n\n---\n\n')
            }
        ]
    }, world, { scope: 'utility' });
    const response = await fetch(ExperimentalWorldsHost.apiBase() + '/chat/completions', {
        method: 'POST',
        headers: { ...ExperimentalWorldsHost.authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`${response.status}: ${(await response.text()).slice(0, 160)}`);
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
        const reasoning = Number(data.usage?.completion_tokens_details?.reasoning_tokens) || 0;
        throw new Error(reasoning
            ? `model returned nothing after ${reasoning} reasoning tokens — pick a non-reasoning model for structured fields`
            : 'model returned an empty field');
    }
    return text.replace(/^["'`]+|["'`]+$/g, '').trim();
}

// Empty fields offer "write it"; populated fields offer "embellish" and
// "rewrite", because a character who changed across 40 turns needs replacing,
// not padding.
function aiFieldButtonMarkup(fieldKey, isEmpty, targetId = '') {
    if (!AI_FIELD_DESCRIPTORS[fieldKey]) return '';
    if (typeof isEmpty === 'string') isEmpty = isPlaceholderFieldValue(isEmpty);
    const t = targetId ? ` data-ai-target="${targetId}"` : '';
    return isEmpty
        ? `<button type="button" class="ai-field-btn" data-ai-field="${fieldKey}"${t} data-ai-mode="fill" title="Write this field from the rest of the world and the transcript">✨</button>`
        : `<button type="button" class="ai-field-btn" data-ai-field="${fieldKey}"${t} data-ai-mode="embellish" title="Embellish: keep what is written, add specificity">✨</button>
           <button type="button" class="ai-field-btn" data-ai-field="${fieldKey}"${t} data-ai-mode="rewrite" title="Rewrite to match who they have become in play">↻</button>`;
}

function bindAiFieldButtons(root, getEntity, world, getInstruction = null) {
    root.querySelectorAll('.ai-field-btn').forEach(btn => {
        if (btn.dataset.aiBound === '1') return;
        btn.dataset.aiBound = '1';
        btn.onclick = async (event) => {
            // These buttons sometimes sit inside a <label> that wraps the field;
            // without this the click also activates the label and re-focuses it.
            event.preventDefault();
            event.stopPropagation();
            const wrap = btn.closest('[data-ai-field-wrap]') || btn.parentElement?.parentElement;
            const input = btn.dataset.aiTarget
                ? document.getElementById(btn.dataset.aiTarget)
                : (wrap?.querySelector(`.${btn.dataset.aiField}`)
                    || document.getElementById(btn.dataset.aiField));
            if (!input) return ExperimentalWorldsHost.notify('Could not find the field to fill.', 'error');
            const original = input.value;
            btn.disabled = true;
            const label = btn.textContent;
            btn.textContent = '⏳';
            try {
                const text = await completeFieldWithAI(
                    btn.dataset.aiField, original, getEntity(), world, btn.dataset.aiMode,
                    getInstruction ? String(getInstruction() || '') : '');
                input.value = text;
                input.dispatchEvent(new Event('change', { bubbles: true }));
                ExperimentalWorldsHost.notify('Field written. Review it, then Save World.', 'success');
            } catch (error) {
                ExperimentalWorldsHost.notify(`AI fill failed — ${error.message}`, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = label;
            }
        };
    });
}

function renderWorldVisuals() {
    const world = ExperimentalWorldsState.editingWorld;
    if (!world) return;
    const presentation = normalizeWorldPresentation(world);
    const byId = id => document.getElementById(id);
    byId('w-visual-enabled').checked = presentation.enabled;
    byId('w-visual-player-override').checked = presentation.playerCanOverride;
    byId('w-visual-mode').value = presentation.mode;
    byId('w-visual-art-style').value = presentation.artStyle;
    byId('w-visual-art-direction').value = presentation.artDirection;
    Object.entries(WORLD_VISUAL_PIPELINE_UI).forEach(([pipeline, ui]) => {
        byId(ui.provider).value = presentation[ui.providerField];
        byId(ui.model).value = presentation[ui.modelField];
    });
    // Fal advanced request settings: visible only when the resolved image
    // provider is fal (including inherit falling back to a fal global).
    const falAdvancedSection = byId('w-visual-fal-advanced');
    const falToleranceInput = byId('w-visual-fal-safety-tolerance');
    const falSafetyCheckerInput = byId('w-visual-fal-enable-safety-checker');
    const syncFalAdvancedVisibility = () => {
        falAdvancedSection?.classList.toggle('hidden', worldVisualProvider(world, 'new') !== 'fal'
            && worldVisualProvider(world, 'revision') !== 'fal');
    };
    const advancedSettings = normalizeFalAdvancedSettings(presentation.falAdvancedSettings);
    if (falToleranceInput) {
        falToleranceInput.value = advancedSettings.safetyTolerance === ''
            ? '' : String(advancedSettings.safetyTolerance);
        falToleranceInput.onchange = event => {
            // Blank means "use the endpoint default": the value is omitted
            // from the fal request entirely. Invalid text normalizes back
            // to blank rather than travelling to the provider.
            presentation.falAdvancedSettings = normalizeFalAdvancedSettings({
                ...presentation.falAdvancedSettings,
                safetyTolerance: event.target.value
            });
            const next = presentation.falAdvancedSettings.safetyTolerance;
            falToleranceInput.value = next === '' ? '' : String(next);
        };
    }
    if (falSafetyCheckerInput) {
        falSafetyCheckerInput.value = advancedSettings.enableSafetyChecker === ''
            ? '' : String(advancedSettings.enableSafetyChecker);
        falSafetyCheckerInput.onchange = event => {
            presentation.falAdvancedSettings = normalizeFalAdvancedSettings({
                ...presentation.falAdvancedSettings,
                enableSafetyChecker: event.target.value
            });
            const next = presentation.falAdvancedSettings.enableSafetyChecker;
            falSafetyCheckerInput.value = next === '' ? '' : String(next);
        };
    }
    const falSeedInput = byId('w-visual-fal-seed');
    if (falSeedInput) {
        falSeedInput.value = advancedSettings.seed === '' ? '' : String(advancedSettings.seed);
        falSeedInput.onchange = event => {
            // Blank keeps the per-call random seed the bridge always rolls.
            // Out-of-range text normalizes back to blank rather than
            // travelling to the provider.
            presentation.falAdvancedSettings = normalizeFalAdvancedSettings({
                ...presentation.falAdvancedSettings,
                seed: event.target.value
            });
            const next = presentation.falAdvancedSettings.seed;
            falSeedInput.value = next === '' ? '' : String(next);
        };
    }
    syncFalAdvancedVisibility();
    // Optional structured image guide: authored direction shared by every
    // generator. Blank fields are omitted everywhere; presets fill the guide
    // fields on demand and never carry subject or character data.
    const guide = normalizeWorldImageGuide(presentation.imageGuide);
    document.querySelectorAll('[data-image-guide-field]').forEach(input => {
        const field = WORLD_IMAGE_GUIDE_FIELDS.find(item => item.key === input.dataset.imageGuideField);
        if (!field) return;
        input.value = guide[field.key];
        input.onchange = () => {
            presentation.imageGuide = normalizeWorldImageGuide({
                ...presentation.imageGuide, [field.key]: input.value
            });
            input.value = presentation.imageGuide[field.key];
        };
    });
    const presetSelect = byId('w-visual-guide-preset');
    const presetNameInput = byId('w-visual-guide-preset-name');
    const refreshGuidePresets = () => {
        const presets = normalizeImageGuidePresets(ExperimentalWorldsState.globalSettings.imageGuidePresets);
        const names = Object.keys(presets).sort((a, b) => a.localeCompare(b));
        presetSelect.innerHTML = `<option value="">${names.length ? 'Choose a saved preset…' : 'No saved presets yet'}</option>`
            + names.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join('');
        return presets;
    };
    if (presetSelect) {
        let presets = refreshGuidePresets();
        // The preset authoring controls carry the brief's own aspect and
        // framing so a saved preset is a complete generation setup.
        const presetAspect = byId('w-visual-guide-preset-aspect');
        const presetFraming = byId('w-visual-guide-preset-framing');
        const presetDescription = byId('w-visual-guide-preset-description');
        presetSelect.onchange = () => {
            const name = presetSelect.value;
            if (!name || !presets[name]) return;
            const preset = presets[name];
            presentation.imageGuide = normalizeWorldImageGuide(preset);
            document.querySelectorAll('[data-image-guide-field]').forEach(input => {
                const field = WORLD_IMAGE_GUIDE_FIELDS.find(item => item.key === input.dataset.imageGuideField);
                if (field) input.value = presentation.imageGuide[field.key];
            });
            if (presetDescription) presetDescription.value = preset.description || '';
            if (presetAspect) presetAspect.value = preset.aspectRatio || '';
            if (presetFraming) presetFraming.value = preset.framing || '';
            ExperimentalWorldsHost.notify(`Applied visual brief “${name}”. Aspect and framing apply per visual in the image editor.`, 'success');
        };
        const savePresetButton = byId('w-visual-guide-preset-save');
        if (savePresetButton) savePresetButton.onclick = () => {
            const name = String(presetNameInput?.value || '').trim().slice(0, 80);
            if (!name) return ExperimentalWorldsHost.notify('Name the preset before saving it.', 'error');
            ExperimentalWorldsState.globalSettings.imageGuidePresets = {
                ...normalizeImageGuidePresets(ExperimentalWorldsState.globalSettings.imageGuidePresets),
                [name]: normalizeImageBriefPreset({
                    ...normalizeWorldImageGuide(presentation.imageGuide),
                    description: presetDescription?.value || '',
                    aspectRatio: presetAspect?.value || '',
                    framing: presetFraming?.value || ''
                })
            };
            ExperimentalWorldsHost.persistSharedSettings().catch(() => {});
            presets = refreshGuidePresets();
            presetSelect.value = name;
            presetNameInput.value = '';
            ExperimentalWorldsHost.notify(`Saved visual brief “${name}” — look only, character data stays with the character.`, 'success');
        };
        const deletePresetButton = byId('w-visual-guide-preset-delete');
        if (deletePresetButton) deletePresetButton.onclick = () => {
            const name = presetSelect.value;
            const next = normalizeImageGuidePresets(ExperimentalWorldsState.globalSettings.imageGuidePresets);
            if (!name || !next[name]) return ExperimentalWorldsHost.notify('Choose a saved preset to delete.', 'error');
            delete next[name];
            ExperimentalWorldsState.globalSettings.imageGuidePresets = next;
            ExperimentalWorldsHost.persistSharedSettings().catch(() => {});
            presets = refreshGuidePresets();
            ExperimentalWorldsHost.notify(`Deleted visual brief “${name}”.`, 'success');
        };
    }
    byId('w-visual-accent').value = presentation.accent;
    byId('w-visual-background-dim').value = presentation.backgroundDim;
    byId('w-visual-panel-opacity').value = presentation.panelOpacity;
    byId('w-visual-dim-value').textContent = `${presentation.backgroundDim}%`;
    byId('w-visual-opacity-value').textContent = `${presentation.panelOpacity}%`;
    const summary = worldMediaSummary(world);
    byId('w-visual-media-summary').textContent = `${summary.count} asset${summary.count === 1 ? '' : 's'} · ${formatByteSize(summary.bytes)}`;
    const mapSkin = worldMediaSource(world, presentation.mapSkinAssetId);
    const mapPreview = byId('w-visual-map-skin-preview');
    mapPreview.style.backgroundImage = mapSkin ? `url('${cssUrl(mapSkin)}')` : 'none';
    mapPreview.textContent = mapSkin ? '' : 'No map skin';
    byId('w-visual-map-skin-clear').disabled = !mapSkin;

    const mapInput = byId('w-visual-map-skin-input');
    byId('w-visual-map-skin-upload').onclick = () => mapInput.click();
    mapInput.onchange = async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const image = await normalizeUploadedImage(file, 1600, 0.76);
            presentation.mapSkinAssetId = addWorldMediaAsset(world, image, 'map_skin', `${world.name} map skin`);
            pruneWorldMediaAssets(world);
            renderWorldVisuals();
            ExperimentalWorldsHost.notify('Map skin embedded in this world.', 'success');
        } catch (error) {
            ExperimentalWorldsHost.notify(`Map skin upload failed: ${error.message}`, 'error');
        } finally { event.target.value = ''; }
    };
    byId('w-visual-map-skin-generate').onclick = async event => {
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = 'Generating…';
        try {
            presentation.mapSkinAssetId = await generateWorldMapSkin(world);
            pruneWorldMediaAssets(world);
            renderWorldVisuals();
            ExperimentalWorldsHost.notify('Generated map skin embedded in this world.', 'success');
        } catch (error) {
            ExperimentalWorldsHost.notify(`Map skin generation failed: ${error.message}`, 'error');
        } finally {
            button.disabled = false;
            button.textContent = '✨ Generate';
        }
    };
    byId('w-visual-map-skin-clear').onclick = () => {
        presentation.mapSkinAssetId = '';
        pruneWorldMediaAssets(world);
        renderWorldVisuals();
    };

    const assign = (id, field, property = 'value') => {
        const input = byId(id);
        input.onchange = event => {
            presentation[field] = property === 'checked' ? event.target.checked : event.target.value;
        };
    };
    assign('w-visual-enabled', 'enabled', 'checked');
    assign('w-visual-player-override', 'playerCanOverride', 'checked');
    assign('w-visual-mode', 'mode');
    assign('w-visual-art-style', 'artStyle');
    assign('w-visual-art-direction', 'artDirection');
    assign('w-visual-accent', 'accent');
    const bindPipeline = pipeline => {
        const ui = WORLD_VISUAL_PIPELINE_UI[pipeline];
        const providerInput = byId(ui.provider);
        const modelInput = byId(ui.model);
        const modelResults = byId(ui.results);
        providerInput.onchange = event => {
            const previous = presentation[ui.providerField];
            presentation[ui.providerField] = event.target.value;
            let nextModel = presentation[ui.modelField];
            if (presentation[ui.providerField] === 'gptproto' && nextModel === 'google/gemini-3.1-flash-lite-image') {
                nextModel = 'gemini-3.1-flash-lite-image';
            } else if (previous === 'gptproto' && nextModel === 'gemini-3.1-flash-lite-image') {
                nextModel = 'google/gemini-3.1-flash-lite-image';
            } else if (pipeline === 'new' && previous !== presentation[ui.providerField]) {
                nextModel = companionImageModelFallback(worldVisualProvider(world, pipeline));
            }
            presentation[ui.modelField] = nextModel;
            if (pipeline === 'new') {
                // Compatibility aliases remain the fresh pipeline for old
                // exports and integrations that still read these fields.
                presentation.imageProvider = presentation.newImageProvider;
                presentation.imageModel = nextModel;
            }
            modelInput.value = nextModel;
            syncFalAdvancedVisibility();
            void renderWorldVisualModelSearch(world, pipeline);
        };
        modelInput.onfocus = () => void renderWorldVisualModelSearch(world, pipeline);
        modelInput.oninput = event => {
            presentation[ui.modelField] = event.target.value.trim().slice(0, 500);
            if (pipeline === 'new') presentation.imageModel = presentation[ui.modelField];
            void renderWorldVisualModelSearch(world, pipeline);
        };
        modelInput.onkeydown = event => {
            if (event.key === 'Escape') setCompanionSearchOpen(modelInput, modelResults, false);
        };
        modelInput.onblur = () => setTimeout(() =>
            setCompanionSearchOpen(modelInput, modelResults, false), 120);
        byId(ui.refresh).onclick = async event => {
            const button = event.currentTarget;
            const provider = worldVisualProvider(world, pipeline);
            if (!['openrouter', 'gptproto', 'nanogpt', 'fal'].includes(provider)) {
                return ExperimentalWorldsHost.notify('Choose OpenRouter, GPTProto, NanoGPT or Fal to browse cloud image models.', 'info');
            }
            button.disabled = true;
            button.textContent = '↻ Loading…';
            try {
                await renderWorldVisualModelSearch(world, pipeline, true);
                modelInput.focus();
                ExperimentalWorldsHost.notify(`${pipeline === 'revision' ? 'Reference-capable' : 'New image'} model catalog refreshed.`, 'success');
            } catch (error) {
                ExperimentalWorldsHost.notify(`Image model catalog failed: ${error.message}`, 'error');
            } finally {
                button.disabled = false;
                button.textContent = '↻ Refresh';
            }
        };
    };
    bindPipeline('new');
    bindPipeline('revision');
    byId('w-visual-background-dim').oninput = event => {
        presentation.backgroundDim = livingClamp(event.target.value, 0, 95);
        byId('w-visual-dim-value').textContent = `${presentation.backgroundDim}%`;
    };
    byId('w-visual-panel-opacity').oninput = event => {
        presentation.panelOpacity = livingClamp(event.target.value, 35, 100);
        byId('w-visual-opacity-value').textContent = `${presentation.panelOpacity}%`;
    };
    // Opening the panel should be enough to discover compatible models; users
    // should never have to know that a catalog exists or press Refresh first.
    void renderWorldVisualModelSearch(world, 'new');
    void renderWorldVisualModelSearch(world, 'revision');
}

const WORLD_STUDIO_PAGE_SIZE = 24;
const WORLD_DIRECTORY_DEPTHS = ['background', 'recurring', 'core'];
const WORLD_SCHEMA_VERSION = 4;
const WORLD_SCHEMA_LABEL = 'Roles, knowledge provenance & consequence lifecycle';
const WORLD_TRAVEL_MODES = Object.freeze({
    walk: 'Walk', road: 'Road', bus: 'Bus', train: 'Train', boat: 'Boat',
    horse: 'Horse', carriage: 'Carriage', caravan: 'Caravan', air: 'Air',
    dragon: 'Dragon', portal: 'Portal', custom: 'Custom'
});

function normalizeWorldTravelMode(value, fallback = 'walk') {
    const mode = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    return mode || fallback;
}

function formatWorldTravelMode(value) {
    const mode = normalizeWorldTravelMode(value);
    return WORLD_TRAVEL_MODES[mode] || mode.replace(/(^|[\s_-])\S/g, match => match.toUpperCase());
}
const worldRecordInspector = { kind: '', id: '', tab: 'overview', directory: '' };

function worldDirectorySlug(value, fallback = 'record') {
    return String(value || fallback).trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 70) || fallback;
}

function worldSchemaVersion(world) {
    const value = Number(world?.schemaVersion || world?.directoryVersion || 0);
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function uniqueWorldRecordId(records, preferred, prefix, name, reserved = new Set()) {
    const source = String(preferred || '').trim().slice(0, 100);
    const base = source || `${prefix}_${worldDirectorySlug(name, prefix)}`;
    let id = base;
    let suffix = 2;
    while (reserved.has(id)) id = `${base}_${suffix++}`.slice(0, 100);
    reserved.add(id);
    return id;
}

/**
 * Convert a playable compatibility world into the authored directory schema.
 * This is deliberately pure: callers receive a clone plus a report, so a
 * failed validation can never leave half a migration in the live world.
 */
function upgradeWorldSchemaData(sourceWorld, { source = 'manual' } = {}) {
    const before = safeJsonClone(sourceWorld || {});
    const world = safeJsonClone(sourceWorld || {});
    const fromVersion = worldSchemaVersion(world);
    const changes = [];
    const warnings = [];
    const idMaps = { regions: {}, locations: {}, entities: {}, groups: {} };
    const note = (area, detail, count = 1) => changes.push({ area, detail, count });
    const warn = (area, detail) => warnings.push({ area, detail });

    // Older exports sometimes used parallel people/items/places collections.
    // Fold them into the canonical arrays without discarding the source fields
    // until the replacement has validated successfully.
    const legacyPlaces = Array.isArray(world.places) ? world.places.filter(isPlainObject) : [];
    world.locations = (Array.isArray(world.locations) ? world.locations : []).filter(isPlainObject);
    if (legacyPlaces.length) {
        world.locations.push(...legacyPlaces.map(place => ({ ...place })));
        note('Locations', `Moved ${legacyPlaces.length} legacy place${legacyPlaces.length === 1 ? '' : 's'} into the location directory.`, legacyPlaces.length);
    }
    const legacyPeople = [
        ...(Array.isArray(world.people) ? world.people : []),
        ...(Array.isArray(world.npcs) ? world.npcs : [])
    ].filter(isPlainObject).map(person => ({ ...person, type: 'npc' }));
    const legacyItems = (Array.isArray(world.items) ? world.items : [])
        .filter(isPlainObject).map(item => ({ ...item, type: 'item' }));
    world.entities = (Array.isArray(world.entities) ? world.entities : []).filter(isPlainObject);
    if (legacyPeople.length || legacyItems.length) {
        world.entities.push(...legacyPeople, ...legacyItems);
        if (legacyPeople.length) note('People', `Moved ${legacyPeople.length} legacy character${legacyPeople.length === 1 ? '' : 's'} into People.`, legacyPeople.length);
        if (legacyItems.length) note('Items', `Moved ${legacyItems.length} legacy object${legacyItems.length === 1 ? '' : 's'} into Items.`, legacyItems.length);
    }

    const legacyGroups = [
        ...(Array.isArray(world.groups) ? world.groups : []),
        ...(Array.isArray(world.households) ? world.households.map(group => ({ ...group, type: 'household' })) : []),
        ...(Array.isArray(world.families) ? world.families.map(group => ({ ...group, type: 'family' })) : [])
    ].filter(isPlainObject);
    world.groups = legacyGroups;

    // IDs are stable links. Keep the first valid occurrence and give missing or
    // duplicate records deterministic new IDs. Existing references continue to
    // resolve to the first record instead of being unpredictably redirected.
    const assignIds = (records, prefix, mapName) => {
        const used = new Set();
        let repaired = 0;
        records.forEach(record => {
            const oldId = String(record.id || '').trim();
            const id = uniqueWorldRecordId(records, oldId, prefix, record.name, used);
            record.id = id;
            if (oldId && !idMaps[mapName][oldId]) idMaps[mapName][oldId] = id;
            if (!oldId || oldId !== id) {
                repaired++;
                if (oldId && oldId !== id) warn('Canonical IDs', `Duplicate ID “${oldId}” was retained by the first record; “${record.name || id}” received “${id}”. Review references if both records were intentional.`);
            }
        });
        if (repaired) note('Canonical IDs', `Assigned ${repaired} missing or duplicate ${mapName} ID${repaired === 1 ? '' : 's'}.`, repaired);
    };
    assignIds(world.locations, 'loc', 'locations');
    assignIds(world.entities, 'ent', 'entities');
    assignIds(world.groups, 'grp', 'groups');

    // Build first-class geography from every legacy region label.
    world.regions = (Array.isArray(world.regions) ? world.regions : []).filter(isPlainObject);
    assignIds(world.regions, 'reg', 'regions');
    const regionByName = new Map(world.regions.map(region => [String(region.name || '').trim().toLowerCase(), region]));
    let createdRegions = 0;
    world.locations.forEach(location => {
        const legacyRegion = String(location.region || location.area || '').trim();
        let region = world.regions.find(entry => entry.id === location.regionId)
            || regionByName.get(legacyRegion.toLowerCase());
        if (!region && legacyRegion) {
            const used = new Set(world.regions.map(entry => entry.id));
            region = {
                id: uniqueWorldRecordId(world.regions, '', 'reg', legacyRegion, used),
                name: legacyRegion,
                description: '',
                tags: []
            };
            world.regions.push(region);
            regionByName.set(legacyRegion.toLowerCase(), region);
            createdRegions++;
        }
        location.regionId = region?.id || '';
        location.region = region?.name || legacyRegion;
    });
    if (createdRegions) note('Regions', `Created ${createdRegions} first-class region${createdRegions === 1 ? '' : 's'} from legacy location labels.`, createdRegions);

    const resolveLocation = value => {
        const raw = String(value || '').trim();
        if (!raw) return null;
        const mapped = idMaps.locations[raw] || raw;
        return world.locations.find(location => location.id === mapped)
            || findFuzzyLocation(raw, world.locations);
    };
    let mapRoles = 0;
    let containment = 0;
    let canonicalExits = 0;
    world.locations.forEach(location => {
        if (!location.mapType) {
            location.mapType = inferWorldMapType(location);
            mapRoles++;
        }
        const legacyParent = location.parentLocationId || location.insideLocationId
            || location.inside || location.parentId || location.parent || location.buildingId || location.attachedTo;
        const parent = resolveLocation(legacyParent);
        if (!location.parentLocationId && parent && parent.id !== location.id) {
            location.parentLocationId = parent.id;
            containment++;
        }
        // A room whose old “region” was actually the exact name of a building
        // can be upgraded safely. Anything less exact remains a review warning.
        if (!location.parentLocationId && location.mapType === 'room') {
            const exactBuilding = world.locations.find(candidate => candidate.id !== location.id
                && ['building', 'area'].includes(candidate.mapType || inferWorldMapType(candidate))
                && String(candidate.name || '').trim().toLowerCase() === String(location.region || '').trim().toLowerCase());
            if (exactBuilding) {
                location.parentLocationId = exactBuilding.id;
                location.regionId = exactBuilding.regionId || location.regionId;
                location.region = world.regions.find(region => region.id === location.regionId)?.name || location.region;
                containment++;
            }
        }
        if (location.parentLocationId) {
            const canonicalParent = resolveLocation(location.parentLocationId);
            if (!canonicalParent || canonicalParent.id === location.id) {
                warn('Containment', `“${location.name || location.id}” has an invalid parent and needs a manual containment choice.`);
                location.parentLocationId = '';
            } else {
                location.parentLocationId = canonicalParent.id;
                if (canonicalParent.regionId) {
                    location.regionId = canonicalParent.regionId;
                    location.region = world.regions.find(region => region.id === canonicalParent.regionId)?.name || location.region;
                }
            }
        }
        location.exits = (Array.isArray(location.exits) ? location.exits : []).map(exit => {
            const record = typeof exit === 'string' ? { text: exit } : { ...(exit || {}) };
            const unresolvedTarget = String(record.targetLocationId || record.target || getExitTargetName(record) || '').trim();
            const target = resolveLocation(unresolvedTarget);
            if (target) {
                if (record.targetLocationId !== target.id) canonicalExits++;
                record.targetLocationId = target.id;
                if (!record.text) record.text = `${record.direction ? `${record.direction} ` : ''}to ${target.name}`;
            } else if (unresolvedTarget) {
                // Keep the route usable and visible even when its legacy target
                // cannot be linked automatically. The audit warning lets the
                // creator repair it without a blank label failing migration.
                if (!record.text) record.text = `${record.direction ? `${record.direction} ` : ''}to ${unresolvedTarget}`;
                warn('Travel', `Exit from “${location.name || location.id}” to “${unresolvedTarget}” could not be linked to a location.`);
            } else if (!String(record.text || '').trim()) {
                record.text = 'Unlinked exit';
                warn('Travel', `A blank exit on “${location.name || location.id}” was preserved as “Unlinked exit” and needs a destination.`);
            }
            record.mode = normalizeWorldTravelMode(record.mode || record.transport || record.travelMode);
            record.travelTime = Math.max(0, Math.min(100000, Number(record.travelTime ?? record.minutes ?? record.duration) || 0));
            record.routeName = String(record.routeName || record.route || '').slice(0, 160);
            record.cost = String(record.cost || record.fare || '').slice(0, 120);
            record.isOneWay = record.isOneWay === true || record.oneWay === true;
            return record;
        });
    });
    if (mapRoles) note('Locations', `Assigned map roles to ${mapRoles} location${mapRoles === 1 ? '' : 's'}.`, mapRoles);
    if (containment) note('Containment', `Linked ${containment} room or attached place${containment === 1 ? '' : 's'} to a parent location.`, containment);
    if (canonicalExits) note('Travel', `Converted ${canonicalExits} exit${canonicalExits === 1 ? '' : 's'} to canonical location links while preserving custom transport.`, canonicalExits);

    let canonicalEntityRefs = 0;
    world.entities.forEach(entity => {
        entity.type = entity.type === 'item' ? 'item' : entity.type === 'vehicle' ? 'vehicle' : 'npc';
        if (entity.type === 'vehicle') window.ExperimentalWorldsSidecarTraversal?.normalizeVehicle(entity);
        ['startLocation', 'homeLocation', 'vendorFor'].forEach(field => {
            const target = resolveLocation(entity[field]);
            if (target && entity[field] !== target.id) {
                entity[field] = target.id;
                canonicalEntityRefs++;
            }
        });
        (Array.isArray(entity.schedule) ? entity.schedule : []).forEach(block => {
            const target = resolveLocation(block.locationId || block.location);
            if (target && block.locationId !== target.id) {
                block.locationId = target.id;
                canonicalEntityRefs++;
            }
        });
    });
    (world.groups || []).forEach(group => {
        group.type = ['household', 'family', 'organization', 'crew', 'other'].includes(group.type) ? group.type : 'other';
        const home = resolveLocation(group.homeLocationId || group.homeLocation);
        if (home) group.homeLocationId = home.id;
    });
    if (canonicalEntityRefs) note('People & items', `Re-linked ${canonicalEntityRefs} homes, placements, vendors or schedule stops to canonical location IDs.`, canonicalEntityRefs);

    const previousRules = JSON.stringify(world.gameRules || {});
    normalizeWorldGameRules(world);
    if (JSON.stringify(world.gameRules || {}) !== previousRules) {
        note('Rules & player role', 'Normalized world-defined checks, role capabilities, progression and roll visibility without changing authored values.');
    }
    world.gameRules.consequences = {
        enabled: world.gameRules?.consequences?.enabled !== false,
        maxActive: Math.max(10, Math.min(300, parseInt(world.gameRules?.consequences?.maxActive) || 120)),
        escalationTurns: Math.max(0, Math.min(1000, parseInt(world.gameRules?.consequences?.escalationTurns) || 4)),
        decayTurns: Math.max(0, Math.min(1000, parseInt(world.gameRules?.consequences?.decayTurns) || 8))
    };

    // These collections have now been copied into their canonical homes.
    ['places', 'people', 'npcs', 'items', 'households', 'families'].forEach(key => { delete world[key]; });
    world.schemaVersion = WORLD_SCHEMA_VERSION;
    world.directoryVersion = WORLD_SCHEMA_VERSION;
    world.schemaLabel = WORLD_SCHEMA_LABEL;
    world.migrationHistory = (Array.isArray(world.migrationHistory) ? world.migrationHistory : []).slice(-9);
    if (fromVersion < WORLD_SCHEMA_VERSION) {
        world.migrationHistory.push({
            from: fromVersion,
            to: WORLD_SCHEMA_VERSION,
            source: String(source || 'manual').slice(0, 40),
            migratedAt: new Date().toISOString()
        });
    }
    normalizeAuthoredWorld(world);

    // Validation is the commit gate. Callers may show the error, but the source
    // object remains byte-for-byte untouched.
    validateWorldData(world, `Upgraded world “${world.name || 'Untitled'}”`);
    return { world, before, fromVersion, toVersion: WORLD_SCHEMA_VERSION, changes, warnings, idMaps };
}

function upgradeBundledWorldDefinition(world) {
    try {
        return upgradeWorldSchemaData(world, { source: 'bundled' }).world;
    } catch (error) {
        console.error(`Bundled world “${world?.name || 'Untitled'}” could not be upgraded:`, error);
        return world;
    }
}

function normalizeWorldDirectoryData(world) {
    if (!world) return world;
    world.regions = (Array.isArray(world.regions) ? world.regions : [])
        .filter(isPlainObject).map((region, index) => ({
            id: String(region.id || `reg_${worldDirectorySlug(region.name, String(index + 1))}`).slice(0, 100),
            name: String(region.name || 'Unnamed region').slice(0, 120),
            description: String(region.description || '').slice(0, 1200),
            tags: (Array.isArray(region.tags) ? region.tags : []).map(String).filter(Boolean).slice(0, 30)
        }));
    const regionByName = new Map(world.regions.map(region => [region.name.trim().toLowerCase(), region]));
    (world.locations || []).forEach(location => {
        const legacyName = String(location.region || '').trim();
        let region = world.regions.find(item => item.id === location.regionId)
            || regionByName.get(legacyName.toLowerCase());
        if (!region && legacyName) {
            const base = `reg_${worldDirectorySlug(legacyName, 'region')}`;
            let id = base;
            let suffix = 2;
            while (world.regions.some(item => item.id === id)) id = `${base}_${suffix++}`;
            region = { id, name: legacyName.slice(0, 120), description: '', tags: [] };
            world.regions.push(region);
            regionByName.set(legacyName.toLowerCase(), region);
        }
        location.regionId = region?.id || '';
        location.region = region?.name || legacyName;
        location.tags = (Array.isArray(location.tags) ? location.tags : []).map(String).filter(Boolean).slice(0, 30);
        location.exits = (Array.isArray(location.exits) ? location.exits : []).map(exit => {
            const record = typeof exit === 'string' ? { text: exit } : { ...(exit || {}) };
            const target = getLocationRef(world, record.targetLocationId || getExitTargetName(record));
            if (target) record.targetLocationId = target.id;
            if (!record.text && target) record.text = `${record.direction ? `${record.direction} ` : ''}to ${target.name}`;
            record.mode = normalizeWorldTravelMode(record.mode);
            record.travelTime = Math.max(0, Math.min(100000, Number(record.travelTime) || 0));
            record.routeName = String(record.routeName || '').slice(0, 160);
            record.cost = String(record.cost || '').slice(0, 120);
            record.isOneWay = record.isOneWay === true;
            return record;
        });
    });

    world.groups = (Array.isArray(world.groups) ? world.groups : [])
        .filter(isPlainObject).map((group, index) => ({
            id: String(group.id || `grp_${worldDirectorySlug(group.name, String(index + 1))}`).slice(0, 100),
            name: String(group.name || 'Unnamed group').slice(0, 120),
            type: ['household', 'family', 'organization', 'crew', 'other'].includes(group.type) ? group.type : 'household',
            description: String(group.description || '').slice(0, 1200),
            homeLocationId: getLocationRef(world, group.homeLocationId)?.id || '',
            tags: (Array.isArray(group.tags) ? group.tags : []).map(String).filter(Boolean).slice(0, 30)
        }));
    const groupIds = new Set(world.groups.map(group => group.id));
    (world.entities || []).forEach(entity => {
        // Repair malformed legacy records, including the v16 New Person click
        // regression where a PointerEvent was serialized into `type`.
        const authoredType = typeof entity.type === 'string' ? entity.type.trim().toLowerCase() : '';
        entity.type = ['item', 'object', 'prop'].includes(authoredType) ? 'item' : authoredType === 'vehicle' ? 'vehicle' : 'npc';
        if (entity.type === 'vehicle') window.ExperimentalWorldsSidecarTraversal?.normalizeVehicle(entity);
        entity.persona = String(entity.persona || '').slice(0, 6000);
        const inferredDepth = entity.isMajor ? 'core'
            : (entity.persona || entity.goal || (entity.schedule || []).length ? 'recurring' : 'background');
        entity.simulationDepth = WORLD_DIRECTORY_DEPTHS.includes(entity.simulationDepth)
            ? entity.simulationDepth : inferredDepth;
        // Keep the old engine flag as a compatibility projection. Persona is no
        // longer gated by it; the tier only controls context priority.
        entity.isMajor = entity.simulationDepth === 'core';
        entity.groupIds = [...new Set((Array.isArray(entity.groupIds) ? entity.groupIds : [])
            .map(String).filter(id => groupIds.has(id)))].slice(0, 30);
        if (entity.householdId && groupIds.has(entity.householdId) && !entity.groupIds.includes(entity.householdId)) {
            entity.groupIds.unshift(entity.householdId);
        }
        entity.householdId = entity.groupIds.find(id => world.groups.find(group => group.id === id)?.type === 'household') || '';
        entity.tags = (Array.isArray(entity.tags) ? entity.tags : []).map(String).filter(Boolean).slice(0, 30);
    });
    return world;
}

function worldDirectoryRecord(kind, id) {
    const world = ExperimentalWorldsState.editingWorld;
    if (kind === 'region') return (world?.regions || []).find(item => item.id === id);
    if (kind === 'location') return (world?.locations || []).find(item => item.id === id);
    return (world?.entities || []).find(item => item.id === id);
}

function worldLocationLineage(world, location) {
    const path = [];
    const seen = new Set([location?.id]);
    let cursor = location;
    while (cursor?.parentLocationId) {
        const parent = getLocationRef(world, cursor.parentLocationId);
        if (!parent || seen.has(parent.id)) break;
        path.unshift(parent);
        seen.add(parent.id);
        cursor = parent;
    }
    return path;
}

function worldLocationDirectChildren(world, locationId) {
    return (world?.locations || []).filter(location => location.parentLocationId === locationId)
        .sort((a, b) => String(a.mapFloor || '').localeCompare(String(b.mapFloor || ''), undefined, { numeric: true })
            || String(a.name || '').localeCompare(String(b.name || '')));
}

function worldDirectoryUsedBy(kind, id) {
    const world = ExperimentalWorldsState.editingWorld;
    if (!world || !id) return [];
    const found = [];
    if (kind === 'region') {
        (world.locations || []).forEach(location => {
            if (location.regionId === id) found.push(`Contains ${location.name || location.id}`);
        });
    } else if (kind === 'location') {
        (world.locations || []).forEach(location => {
            if (location.id !== id && location.parentLocationId === id) found.push(`Contains ${location.name}`);
            if ((location.exits || []).some(exit => getLocationRef(world, exit?.targetLocationId || getExitTargetName(exit))?.id === id)) found.push(`Exit from ${location.name}`);
        });
        (world.entities || []).forEach(entity => {
            if (entity.homeLocation === id) found.push(`Home of ${entity.name}`);
            if (entity.startLocation === id) found.push(`Starting place of ${entity.name}`);
            if ((entity.schedule || []).some(block => block.locationId === id)) found.push(`Schedule for ${entity.name}`);
        });
        (world.startingLives || []).forEach(life => { if (life.startLocationId === id) found.push(`Starting life: ${life.name}`); });
    } else {
        (world.relationships || []).forEach(relation => {
            if (relation.a === id || relation.b === id) {
                const otherId = relation.a === id ? relation.b : relation.a;
                found.push(`Relationship with ${(world.entities || []).find(entity => entity.id === otherId)?.name || otherId}`);
            }
        });
    }
    return [...new Set(found)];
}

function setWorldInspectorTab(tab) {
    worldRecordInspector.tab = tab;
    document.querySelectorAll('#world-record-tabs .world-record-tab').forEach(button => {
        const active = button.dataset.tab === tab;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
    });
    // One continuous scroll: every authored section stays visible, the first
    // section of each kind carries a heading, and visuals sit at the top.
    // The tab strip is anchor navigation, not a segmentation control.
    const labels = worldRecordInspector.sections || {};
    const headed = new Set();
    document.querySelectorAll('#world-record-body [data-inspector-section]').forEach(section => {
        section.classList.remove('hidden-by-inspector');
        section.hidden = false;
        const id = section.dataset.inspectorSection;
        if (labels[id] && !headed.has(id)
            && !(section.previousElementSibling
                && section.previousElementSibling.classList.contains('world-inspector-section-heading'))) {
            // The heading is a previous sibling, never a child: sections like
            // the media editor are exact two-cell grids whose layout would
            // shift if an extra child landed inside them.
            const heading = document.createElement('div');
            heading.className = 'world-inspector-section-heading';
            heading.innerHTML = `<h3>${escapeHTML(labels[id])}</h3>`;
            section.parentElement.insertBefore(heading, section);
        }
        headed.add(id);
    });
    const body = document.getElementById('world-record-body');
    if (!body) return;
    const visuals = body.querySelector('[data-inspector-section="visuals"]');
    if (visuals) {
        // Sections can nest inside inner wrappers; move visuals to the top of
        // its record card so it leads the scroll.
        const card = visuals.closest('.studio-card') || visuals.parentElement;
        if (card && card.firstElementChild !== visuals) card.insertBefore(visuals, card.firstElementChild);
    }
    const target = tab ? body.querySelector(`[data-inspector-section="${tab}"]`) : null;
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else body.scrollTop = 0;
}

function renderWorldInspectorTabs(kind, record) {
    // Visuals first, then overview, then the remaining sections in place.
    const tabs = kind === 'region'
        ? [['overview', 'Overview'], ['locations', 'Locations'], ['travel', 'Travel links']]
        : kind === 'location'
        ? [['visuals', 'Visuals'], ['overview', 'Overview'], ['map', 'Rooms & map'], ['connections', 'Connections'], ['simulation', 'Opening state'], ['commerce', 'Commerce'], ['secrets', 'Secrets']]
        : record?.type === 'item'
            ? [['overview', 'Overview'], ['placement', 'Placement'], ['secrets', 'Knowledge & secrets']]
            : [['visuals', 'Visuals'], ['overview', 'Overview'], ['persona', 'Persona & voice'], ['relationships', 'Relationships'], ['simulation', 'Life & autonomy'], ['secrets', 'Knowledge & secrets']];
    worldRecordInspector.sections = Object.fromEntries(tabs);
    const host = document.getElementById('world-record-tabs');
    if (!tabs.some(([id]) => id === worldRecordInspector.tab)) worldRecordInspector.tab = tabs[0][0];
    host.setAttribute('role', 'tablist');
    host.innerHTML = tabs.map(([id, label]) => `<button type="button" role="tab" aria-selected="${worldRecordInspector.tab === id}" class="world-record-tab ${worldRecordInspector.tab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('');
    host.querySelectorAll('.world-record-tab').forEach(button => button.onclick = () => setWorldInspectorTab(button.dataset.tab));
}

function openWorldRecordInspector(kind, id, tab = '', directory = '') {
    const record = worldDirectoryRecord(kind, id);
    if (!record) return;
    worldRecordInspector.kind = kind;
    worldRecordInspector.id = id;
    worldRecordInspector.tab = tab;
    worldRecordInspector.directory = directory || (kind === 'entity' && record.type === 'item' ? 'items' : kind === 'entity' ? 'people' : 'locations');
    const overlay = document.getElementById('world-record-overlay');
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    document.getElementById('world-record-kicker').textContent = kind === 'region' ? 'REGION' : kind === 'location' ? 'LOCATION' : record.type === 'item' ? 'ITEM' : 'PERSON';
    document.getElementById('world-record-title').textContent = record.name || (kind === 'region' ? 'New region' : kind === 'location' ? 'New location' : record.type === 'item' ? 'New item' : 'New person');
    const locationLineage = kind === 'location' ? worldLocationLineage(ExperimentalWorldsState.editingWorld, record) : [];
    document.getElementById('world-record-subtitle').textContent = kind === 'region'
        ? `${(ExperimentalWorldsState.editingWorld?.locations || []).filter(location => location.regionId === record.id).length} locations · canonical link ${record.id}`
        : kind === 'location'
        ? `${locationLineage.length ? `${locationLineage.map(place => place.name || place.id).join(' › ')} › ` : ''}${formatWorldMapType(record.mapType || inferWorldMapType(record))} · canonical link ${record.id}`
        : `${record.type === 'npc' ? 'Character' : 'World item'} · canonical link ${record.id}`;
    renderWorldInspectorTabs(kind, record);
    if (kind === 'region') renderWorldRegionInspector();
    else if (kind === 'location') renderWorldLocations(); else renderWorldEntities();
}

function closeWorldRecordInspector() {
    const kind = worldRecordInspector.kind;
    const directory = worldRecordInspector.directory;
    worldRecordInspector.kind = '';
    worldRecordInspector.id = '';
    const overlay = document.getElementById('world-record-overlay');
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    document.getElementById('world-record-body').innerHTML = '';
    if (kind === 'location' || kind === 'region') renderWorldLocations();
    if (kind === 'entity' && directory === 'items') renderWorldItems();
    else if (kind === 'entity') renderWorldEntities();
}

const worldStudioListState = {
    worldId: '',
    locations: { query: '', page: 0, filter: 'all' },
    people: { query: '', page: 0, filter: 'all', groupBy: 'household' },
    items: { query: '', page: 0, filter: 'all', groupBy: 'location' }
};

function ensureWorldDirectoryState(world) {
    if (worldStudioListState.worldId === world?.id) return;
    worldStudioListState.worldId = world?.id || '';
    worldStudioListState.locations = { query: '', page: 0, filter: 'all' };
    worldStudioListState.people = { query: '', page: 0, filter: 'all', groupBy: 'household' };
    worldStudioListState.items = { query: '', page: 0, filter: 'all', groupBy: 'location' };
}

function getWorldStudioListPage(kind, items, searchText) {
    const worldId = ExperimentalWorldsState.editingWorld?.id || '';
    if (worldStudioListState.worldId !== worldId) {
        worldStudioListState.worldId = worldId;
        worldStudioListState.locations = { query: '', page: 0 };
        worldStudioListState.people = { query: '', page: 0, filter: 'all', groupBy: 'household' };
        worldStudioListState.items = { query: '', page: 0, filter: 'all', groupBy: 'location' };
    }
    const view = worldStudioListState[kind];
    const query = view.query.trim().toLowerCase();
    const filtered = query ? items.filter(item => searchText(item).toLowerCase().includes(query)) : items;
    const pages = Math.max(1, Math.ceil(filtered.length / WORLD_STUDIO_PAGE_SIZE));
    view.page = Math.max(0, Math.min(view.page, pages - 1));
    return { view, filtered, pages, items: filtered.slice(view.page * WORLD_STUDIO_PAGE_SIZE, (view.page + 1) * WORLD_STUDIO_PAGE_SIZE) };
}

function appendWorldStudioListToolbar(container, kind, pageData, rerender, noun) {
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;gap:8px;align-items:center;position:sticky;top:0;z-index:4;padding:10px;margin-bottom:12px;background:var(--surface);border:1px solid var(--border);border-radius:10px;';
    toolbar.innerHTML = `
        <input class="form-input studio-list-search" style="flex:1" value="${escapeHTML(pageData.view.query)}" placeholder="Search ${escapeHTML(noun)}…">
        <span class="form-hint" style="white-space:nowrap">${pageData.filtered.length} / ${ExperimentalWorldsState.editingWorld[kind].length}</span>
        <button class="tool-btn studio-page-prev" ${pageData.view.page === 0 ? 'disabled' : ''}>←</button>
        <span class="form-hint" style="white-space:nowrap">${pageData.view.page + 1} / ${pageData.pages}</span>
        <button class="tool-btn studio-page-next" ${pageData.view.page >= pageData.pages - 1 ? 'disabled' : ''}>→</button>`;
    toolbar.querySelector('.studio-list-search').oninput = event => {
        worldStudioListState[kind].query = event.target.value;
        worldStudioListState[kind].page = 0;
        rerender();
        requestAnimationFrame(() => {
            const input = container.querySelector('.studio-list-search');
            if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
        });
    };
    toolbar.querySelector('.studio-page-prev').onclick = () => { worldStudioListState[kind].page--; rerender(); };
    toolbar.querySelector('.studio-page-next').onclick = () => { worldStudioListState[kind].page++; rerender(); };
    container.appendChild(toolbar);
}

function renameWorldLocationId(world, location, requestedId) {
    const oldId = String(location?.id || '').trim();
    const newId = String(requestedId || '').trim().replace(/\s+/g, '_').slice(0, 120);
    if (!oldId || !newId || oldId === newId) return oldId;
    if ((world.locations || []).some(other => other !== location && other.id === newId)) {
        throw new Error(`Another location already uses “${newId}”.`);
    }
    location.id = newId;
    if (world.startLocationId === oldId) world.startLocationId = newId;
    (world.locations || []).forEach(candidate => {
        if (candidate.parentLocationId === oldId) candidate.parentLocationId = newId;
        candidate.exits = (candidate.exits || []).map(exit => {
            if (exit && typeof exit === 'object' && exit.targetLocationId === oldId) {
                return { ...exit, targetLocationId: newId };
            }
            const text = typeof exit === 'string' ? exit : String(exit?.text || '');
            if (String(getExitTargetName(text) || '').trim() !== oldId) return exit;
            const direction = getExitDirection(text);
            const nextText = direction ? `${direction} to ${newId}` : `to ${newId}`;
            return typeof exit === 'string' ? nextText : { ...exit, text: nextText };
        });
    });
    (world.entities || []).forEach(entity => {
        if (entity.startLocation === oldId) entity.startLocation = newId;
        if (entity.homeLocation === oldId) entity.homeLocation = newId;
        (entity.schedule || []).forEach(block => {
            if (block.locationId === oldId) block.locationId = newId;
        });
    });
    (world.startingLives || []).forEach(life => {
        if (life.startLocationId === oldId) life.startLocationId = newId;
        life.holdings = (life.holdings || []).map(holding => holding === oldId ? newId : holding);
    });
    (world.factions || []).forEach(faction => {
        faction.territory = (faction.territory || []).map(id => id === oldId ? newId : id);
    });
    return newId;
}

function removeWorldLocationRecord(world, locationId) {
    if (!world || !locationId) return;
    world.locations = (world.locations || []).filter(location => location.id !== locationId);
    world.locations.forEach(location => {
        if (location.parentLocationId === locationId) location.parentLocationId = '';
        location.exits = (location.exits || []).filter(exit => {
            const linked = getLocationRef(world, exit?.targetLocationId || getExitTargetName(exit));
            return exit?.targetLocationId !== locationId && linked?.id !== locationId;
        });
    });
    (world.entities || []).forEach(entity => {
        if (entity.startLocation === locationId) entity.startLocation = '';
        if (entity.homeLocation === locationId) entity.homeLocation = '';
        entity.schedule = (entity.schedule || []).filter(block => block.locationId !== locationId);
    });
    (world.groups || []).forEach(group => {
        if (group.homeLocationId === locationId) group.homeLocationId = '';
    });
    (world.startingLives || []).forEach(life => {
        if (life.startLocationId === locationId) life.startLocationId = '';
        life.holdings = (life.holdings || []).filter(holding => holding !== locationId);
    });
    (world.factions || []).forEach(faction => {
        faction.territory = (faction.territory || []).filter(id => id !== locationId);
    });
    if (world.startLocationId === locationId) world.startLocationId = world.locations[0]?.id || '';
}

function worldRegionTravelLinks(world, regionId) {
    const links = [];
    (world.locations || []).filter(location => location.regionId === regionId).forEach(origin => {
        (origin.exits || []).forEach((exit, exitIndex) => {
            const target = getLocationRef(world, exit?.targetLocationId || getExitTargetName(exit));
            if (target && target.regionId && target.regionId !== regionId) links.push({ origin, target, exit, exitIndex });
        });
    });
    return links;
}

function upsertWorldTravelConnection(world, origin, target, details = {}) {
    if (!world || !origin || !target || origin.id === target.id) return;
    const mode = normalizeWorldTravelMode(details.mode);
    const travelTime = Math.max(0, Math.min(100000, Number(details.travelTime) || 0));
    const makeExit = (from, to) => ({
        targetLocationId: to.id,
        text: `to ${to.name || to.id}`,
        direction: '', mode, travelTime,
        routeName: String(details.routeName || '').slice(0, 160),
        cost: String(details.cost || '').slice(0, 120),
        isOneWay: details.isOneWay === true
    });
    const existing = (origin.exits || []).find(exit => getLocationRef(world, exit?.targetLocationId || getExitTargetName(exit))?.id === target.id);
    if (existing && typeof existing === 'object') Object.assign(existing, makeExit(origin, target));
    else (origin.exits ||= []).push(makeExit(origin, target));
    if (!details.isOneWay) {
        const reverse = (target.exits || []).find(exit => getLocationRef(world, exit?.targetLocationId || getExitTargetName(exit))?.id === origin.id);
        if (reverse && typeof reverse === 'object') Object.assign(reverse, makeExit(target, origin), { isOneWay: false });
        else (target.exits ||= []).push({ ...makeExit(target, origin), isOneWay: false });
    }
}

function renderWorldRegionLocationTreeHTML(world, locations) {
    const records = Array.isArray(locations) ? locations : [];
    const localIds = new Set(records.map(location => location.id));
    const rendered = new Set();
    const renderNode = (location, depth = 0, ancestry = new Set()) => {
        if (!location || rendered.has(location.id) || ancestry.has(location.id)) return '';
        rendered.add(location.id);
        const children = records.filter(candidate => candidate.parentLocationId === location.id)
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        const next = new Set(ancestry).add(location.id);
        return `<div class="world-location-tree-node ${depth ? 'is-child' : ''}">
            <button type="button" class="world-directory-card ${depth ? 'is-contained-location' : ''}" data-region-location="${escapeHTML(location.id)}">
                <div class="world-directory-card-copy"><h3>${escapeHTML(location.name || 'Unnamed location')}</h3><p>${escapeHTML(location.description || 'No description yet.')}</p>
                <div class="world-directory-badges"><span class="world-directory-badge">${escapeHTML(formatWorldMapType(location.mapType || inferWorldMapType(location)))}</span>${depth ? `<span class="world-directory-badge is-containment">↳ contained place</span>` : ''}${children.length ? `<span class="world-directory-badge">contains ${children.length}</span>` : ''}<span class="world-directory-badge">${(location.exits || []).length} exits</span></div></div>
            </button>${children.length ? `<div class="world-location-tree-children">${children.map(child => renderNode(child, depth + 1, next)).join('')}</div>` : ''}
        </div>`;
    };
    const roots = records.filter(location => !location.parentLocationId || !localIds.has(location.parentLocationId))
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    let html = roots.map(location => renderNode(location)).join('');
    html += records.filter(location => !rendered.has(location.id)).map(location => renderNode(location)).join('');
    return html;
}

function renderWorldRegionInspector() {
    const world = ExperimentalWorldsState.editingWorld;
    const region = worldDirectoryRecord('region', worldRecordInspector.id);
    const container = document.getElementById('world-record-body');
    if (!world || !region || !container) return closeWorldRecordInspector();
    const locations = (world.locations || []).filter(location => location.regionId === region.id);
    const otherLocations = (world.locations || []).filter(location => location.regionId !== region.id);
    const travelLinks = worldRegionTravelLinks(world, region.id);
    container.innerHTML = `<div class="world-region-inspector">
        <section class="world-inspector-section" data-inspector-section="overview">
            <div class="world-region-form-grid"><label><span class="form-label">Region name</span><input class="form-input region-name" value="${escapeHTML(region.name)}"></label>
            <label><span class="form-label">Tags</span><input class="form-input region-tags" value="${escapeHTML((region.tags || []).join(', '))}" placeholder="coastal, urban, dangerous…"></label></div>
            <label><span class="form-label">Description</span><textarea class="form-textarea region-description" rows="7" placeholder="What makes this region distinct?">${escapeHTML(region.description || '')}</textarea></label>
            <div class="world-region-stat-row"><span><b>${locations.length}</b> locations</span><span><b>${travelLinks.length}</b> outgoing travel links</span></div>
            <button type="button" class="btn btn-danger region-delete">Delete region</button>
        </section>
        <section class="world-inspector-section" data-inspector-section="locations">
            <div class="world-region-section-head"><div><h3>Locations in ${escapeHTML(region.name)}</h3><p>Playable places live inside a stable region. Their canonical links survive renames.</p></div><button type="button" class="btn btn-primary region-add-location">+ New location</button></div>
            <div class="world-directory-grid world-location-tree-grid region-location-grid">${renderWorldRegionLocationTreeHTML(world, locations) || '<div class="world-directory-empty">No locations yet. Create the first place players can actually visit.</div>'}</div>
        </section>
        <section class="world-inspector-section" data-inspector-section="travel">
            <div class="world-region-section-head"><div><h3>Cross-region travel</h3><p>Connect actual departure and arrival places. Transport is author-defined: walking, horse, dragon, train, starship—or anything your world supports.</p></div></div>
            <div class="world-travel-builder">
                <label><span>Depart from</span><select class="form-select travel-origin"><option value="">Choose a location…</option>${locations.map(location => `<option value="${escapeHTML(location.id)}">${escapeHTML(location.name || location.id)}</option>`).join('')}</select></label>
                <label><span>Arrive at</span><select class="form-select travel-target"><option value="">Choose another region's location…</option>${otherLocations.map(location => { const targetRegion = world.regions.find(item => item.id === location.regionId); return `<option value="${escapeHTML(location.id)}">${escapeHTML(targetRegion?.name || 'Unassigned')} · ${escapeHTML(location.name || location.id)}</option>`; }).join('')}</select></label>
                <label><span>Transport</span><input class="form-input travel-mode" list="world-transport-suggestions" value="walk" placeholder="horse, dragon, train…"><datalist id="world-transport-suggestions">${Object.entries(WORLD_TRAVEL_MODES).map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</datalist></label>
                <label><span>Minutes</span><input type="number" min="0" class="form-input travel-minutes" value="15"></label>
                <label><span>Route / service</span><input class="form-input travel-route" placeholder="A12, Red Line, Ferry 4…"></label>
                <label><span>Cost (optional)</span><input class="form-input travel-cost" placeholder="$3, two tokens…"></label>
                <label class="travel-one-way"><input type="checkbox"> One way only</label>
                <button type="button" class="btn btn-primary travel-connect">Connect locations</button>
            </div>
            <div class="world-travel-list">${travelLinks.map(({ origin, target, exit, exitIndex }) => `<article><div><strong>${escapeHTML(origin.name || origin.id)} → ${escapeHTML(target.name || target.id)}</strong><span>${escapeHTML(formatWorldTravelMode(exit.mode))} · ${Number(exit.travelTime) || 0} min${exit.routeName ? ` · ${escapeHTML(exit.routeName)}` : ''}${exit.cost ? ` · ${escapeHTML(exit.cost)}` : ''}</span></div><button type="button" class="tool-btn" data-remove-region-travel="${escapeHTML(origin.id)}:${exitIndex}">Remove</button></article>`).join('') || '<div class="world-directory-empty">No cross-region travel yet. Players cannot naturally leave this region until you connect it.</div>'}</div>
        </section>
    </div>`;
    container.querySelector('.region-name').onchange = event => {
        const oldName = region.name;
        region.name = event.target.value.trim() || 'Unnamed region';
        locations.forEach(location => { if (location.region === oldName || location.regionId === region.id) location.region = region.name; });
        document.getElementById('world-record-title').textContent = region.name;
    };
    container.querySelector('.region-tags').onchange = event => { region.tags = event.target.value.split(',').map(value => value.trim()).filter(Boolean).slice(0, 30); };
    container.querySelector('.region-description').onchange = event => { region.description = event.target.value.slice(0, 1200); };
    container.querySelector('.region-add-location').onclick = () => addWorldLocation('bottom', region.id);
    container.querySelectorAll('[data-region-location]').forEach(button => button.onclick = () => openWorldRecordInspector('location', button.dataset.regionLocation, '', 'locations'));
    container.querySelector('.travel-connect').onclick = () => {
        const origin = getLocationRef(world, container.querySelector('.travel-origin').value);
        const target = getLocationRef(world, container.querySelector('.travel-target').value);
        if (!origin || !target) return ExperimentalWorldsHost.notify('Choose both a departure and destination location.', 'error');
        upsertWorldTravelConnection(world, origin, target, {
            mode: container.querySelector('.travel-mode').value,
            travelTime: container.querySelector('.travel-minutes').value,
            routeName: container.querySelector('.travel-route').value,
            cost: container.querySelector('.travel-cost').value,
            isOneWay: container.querySelector('.travel-one-way input').checked
        });
        renderWorldRegionInspector(); setWorldInspectorTab('travel');
        ExperimentalWorldsHost.notify('Travel connection added.', 'success');
    };
    container.querySelectorAll('[data-remove-region-travel]').forEach(button => button.onclick = () => {
        const [originId, index] = button.dataset.removeRegionTravel.split(':');
        const origin = getLocationRef(world, originId);
        if (origin) {
            const exit = origin.exits[Number(index)];
            const target = getLocationRef(world, exit?.targetLocationId || getExitTargetName(exit));
            origin.exits.splice(Number(index), 1);
            if (target && !exit?.isOneWay) {
                target.exits = (target.exits || []).filter(reverse => {
                    const reverseTarget = getLocationRef(world, reverse?.targetLocationId || getExitTargetName(reverse));
                    return reverseTarget?.id !== origin.id;
                });
            }
        }
        renderWorldRegionInspector(); setWorldInspectorTab('travel');
    });
    container.querySelector('.region-delete').onclick = () => {
        if (!confirm(`Delete “${region.name}”? Its ${locations.length} location${locations.length === 1 ? '' : 's'} will remain but become unassigned.`)) return;
        locations.forEach(location => { location.regionId = ''; location.region = ''; });
        world.regions = world.regions.filter(item => item.id !== region.id);
        closeWorldRecordInspector();
    };
    setWorldInspectorTab(worldRecordInspector.tab);
}

function renderWorldLocationDirectory(world, container) {
    ensureWorldDirectoryState(world);
    const view = worldStudioListState.locations;
    const query = view.query.trim().toLowerCase();
    const filter = view.filter || 'all';
    const matches = world.locations.filter(location => {
        const region = world.regions.find(item => item.id === location.regionId);
        const search = [location.name, location.id, location.region, location.mapType, location.description, ...(location.tags || []), region?.name, region?.description, ...(region?.tags || [])].join(' ').toLowerCase();
        return (!query || search.includes(query)) && (filter === 'all' || inferWorldMapType(location) === filter);
    });
    const typeOptions = ['all', 'transit', 'building', 'room', 'outdoor', 'route', 'area'];
    const directory = document.createElement('div');
    directory.className = 'world-directory';
    directory.innerHTML = `<div class="world-directory-toolbar">
        <input type="search" class="form-input world-directory-search" value="${escapeHTML(view.query)}" placeholder="Search names, regions, descriptions or tags…" aria-label="Search locations">
        <select class="form-select world-directory-filter" aria-label="Filter location type">${typeOptions.map(type => `<option value="${type}" ${filter === type ? 'selected' : ''}>${type === 'all' ? 'All types' : formatWorldMapType(type)}</option>`).join('')}</select>
        <span class="world-directory-summary">${matches.length} of ${world.locations.length} locations</span>
        <button type="button" class="btn btn-ghost world-new-region">+ Region</button>
        <button type="button" class="btn btn-primary world-new-location">+ Location</button>
    </div>
    <section class="world-region-shelf"><div class="world-region-shelf-head"><div><h3>Regions</h3><p>Organize large worlds, then connect their locations with explicit travel.</p></div></div><div class="world-region-card-grid">${world.regions.map(region => {
        const regionLocations = world.locations.filter(location => location.regionId === region.id);
        const links = worldRegionTravelLinks(world, region.id);
        return `<article class="world-region-card" data-region-card="${escapeHTML(region.id)}"><button type="button" class="world-region-card-main"><span class="world-region-icon">⌖</span><div><h3>${escapeHTML(region.name)}</h3><p>${escapeHTML(region.description || 'No regional description yet.')}</p><div class="world-directory-badges"><span class="world-directory-badge">${regionLocations.length} places</span><span class="world-directory-badge">${links.length} travel links</span></div></div></button><button type="button" class="tool-btn world-region-add-place" title="Add a location inside ${escapeHTML(region.name)}">＋ Location</button></article>`;
    }).join('') || '<div class="world-directory-empty">No regions yet. Create one to organize locations and cross-region travel.</div>'}</div></section>`;
    directory.querySelector('.world-new-region').onclick = addWorldRegion;
    directory.querySelector('.world-new-location').onclick = () => addWorldLocation();
    directory.querySelectorAll('[data-region-card]').forEach(card => {
        card.querySelector('.world-region-card-main').onclick = () => openWorldRecordInspector('region', card.dataset.regionCard);
        card.querySelector('.world-region-add-place').onclick = () => addWorldLocation('bottom', card.dataset.regionCard);
    });
    const byRegion = new Map();
    matches.forEach(location => {
        const region = world.regions.find(item => item.id === location.regionId);
        const key = region?.name || location.region || 'Unassigned';
        if (!byRegion.has(key)) byRegion.set(key, []);
        byRegion.get(key).push(location);
    });
    const regionEntries = [...byRegion.entries()].sort(([a], [b]) => a.localeCompare(b));
    regionEntries.forEach(([regionName, locations], regionIndex) => {
        const section = document.createElement('details');
        section.className = 'world-directory-section';
        // A large world should scan like a directory, not render as another
        // endless wall. Searches expand every matching region; otherwise the
        // first region opens as an orientation point and the rest stay compact.
        section.open = Boolean(query) || regionEntries.length <= 8 || regionIndex === 0;
        section.innerHTML = `<summary><strong>${escapeHTML(regionName)}</strong><span>${locations.length} location${locations.length === 1 ? '' : 's'}</span></summary><div class="world-directory-grid"></div>`;
        const grid = section.querySelector('.world-directory-grid');
        const makeLocationCard = (location, nested = false) => {
            const parent = getLocationRef(world, location.parentLocationId);
            const used = worldDirectoryUsedBy('location', location.id);
            const image = worldMediaSource(world, location.visuals?.backgroundAssetId);
            const card = document.createElement('button');
            card.type = 'button';
            card.className = `world-directory-card${nested ? ' is-contained-location' : ''}`;
            card.dataset.recordId = location.id;
            card.innerHTML = `<div class="world-directory-card-media" ${image ? `style="background-image:url('${cssUrl(image)}')"` : ''}>${image ? '' : '⌖'}</div>
                <div class="world-directory-card-copy"><h3>${escapeHTML(location.name || 'Unnamed location')}</h3>
                <p>${escapeHTML(location.description || 'No player-facing description yet.')}</p>
                <div class="world-directory-badges">
                    <span class="world-directory-badge">${escapeHTML(formatWorldMapType(location.mapType || inferWorldMapType(location)))}</span>
                    ${parent ? `<span class="world-directory-badge is-containment">↳ inside ${escapeHTML(parent.name)}</span>` : ''}
                    ${world.startLocationId === location.id ? '<span class="world-directory-badge is-core">★ start</span>' : ''}
                    <span class="world-directory-badge">${(location.exits || []).length} exits</span>
                    ${used.length ? `<span class="world-directory-badge">${used.length} links</span>` : ''}
                </div></div>`;
            card.onclick = () => openWorldRecordInspector('location', location.id);
            return card;
        };
        const hierarchyMode = !query && filter === 'all';
        if (hierarchyMode) {
            grid.classList.add('world-location-tree-grid');
            const localIds = new Set(locations.map(location => location.id));
            const rendered = new Set();
            const renderNode = (location, depth = 0, ancestry = new Set()) => {
                if (!location || rendered.has(location.id) || ancestry.has(location.id)) return null;
                rendered.add(location.id);
                const node = document.createElement('div');
                node.className = `world-location-tree-node${depth ? ' is-child' : ''}`;
                node.appendChild(makeLocationCard(location, depth > 0));
                const nextAncestry = new Set(ancestry).add(location.id);
                const children = locations.filter(candidate => candidate.parentLocationId === location.id)
                    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
                if (children.length) {
                    const branch = document.createElement('div');
                    branch.className = 'world-location-tree-children';
                    children.forEach(child => {
                        const childNode = renderNode(child, depth + 1, nextAncestry);
                        if (childNode) branch.appendChild(childNode);
                    });
                    if (branch.childElementCount) node.appendChild(branch);
                }
                return node;
            };
            locations.filter(location => !location.parentLocationId || !localIds.has(location.parentLocationId))
                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
                .forEach(location => { const node = renderNode(location); if (node) grid.appendChild(node); });
            // Damaged containment cycles still remain editable instead of
            // disappearing from the directory.
            locations.filter(location => !rendered.has(location.id)).forEach(location => {
                const node = renderNode(location); if (node) grid.appendChild(node);
            });
        } else {
            locations.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
                .forEach(location => grid.appendChild(makeLocationCard(location, Boolean(location.parentLocationId))));
        }
        directory.appendChild(section);
    });
    if (!matches.length) directory.insertAdjacentHTML('beforeend', '<div class="world-directory-empty">No locations match these filters.</div>');
    const search = directory.querySelector('.world-directory-search');
    search.oninput = event => {
        view.query = event.target.value;
        renderWorldLocations();
        requestAnimationFrame(() => {
            const next = container.querySelector('.world-directory-search');
            if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
        });
    };
    directory.querySelector('.world-directory-filter').onchange = event => { view.filter = event.target.value; renderWorldLocations(); };
    container.appendChild(directory);
}

function renderWorldLocations() {
    const world = ExperimentalWorldsState.editingWorld;
    if (!world) return;
    normalizeAuthoredWorld(world);   // a malformed shop must not break the panel
    const inspecting = worldRecordInspector.kind === 'location' && worldRecordInspector.id;
    const container = inspecting ? document.getElementById('world-record-body') : document.getElementById('w-locations-list');
    container.innerHTML = '';
    if (!inspecting) {
        renderWorldLocationDirectory(world, container);
        return;
    }
    const selected = world.locations.find(location => location.id === worldRecordInspector.id);
    if (!selected) return closeWorldRecordInspector();
    const pageData = { view: worldStudioListState.locations, filtered: [selected], pages: 1, items: [selected] };
    
    // Update global datalist for location references across the entire app
    let datalist = document.getElementById('world-location-datalist');
    if (!datalist) {
        datalist = document.createElement('datalist');
        datalist.id = 'world-location-datalist';
        document.body.appendChild(datalist);
    }
    datalist.innerHTML = '';
    world.locations.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l.name;
        datalist.appendChild(opt);
    });
    let regionDatalist = document.getElementById('world-region-datalist');
    if (!regionDatalist) {
        regionDatalist = document.createElement('datalist');
        regionDatalist.id = 'world-region-datalist';
        document.body.appendChild(regionDatalist);
    }
    regionDatalist.innerHTML = (world.regions || []).slice().sort((a, b) => a.name.localeCompare(b.name))
        .map(region => `<option value="${escapeHTML(region.name)}"></option>`).join('');
    let floorDatalist = document.getElementById('world-floor-datalist');
    if (!floorDatalist) {
        floorDatalist = document.createElement('datalist');
        floorDatalist.id = 'world-floor-datalist';
        document.body.appendChild(floorDatalist);
    }
    floorDatalist.innerHTML = ['Auto', 'Outside', 'Basement', 'Lower ground', 'Ground', 'Mezzanine', '1', '2', '3', 'Roof']
        .map(floor => `<option value="${floor}"></option>`).join('');
    
    // The directory groups locations by Region. The inspector deliberately
    // renders one complete record at a time.
    const regions = {};
    pageData.items.forEach(loc => {
        const r = loc.region || 'No Region';
        if (!regions[r]) regions[r] = [];
        regions[r].push(loc);
    });

    if (!pageData.items.length) {
        container.insertAdjacentHTML('beforeend', '<div class="form-hint" style="padding:20px;text-align:center">No locations match this search.</div>');
    }
    Object.keys(regions).sort().forEach(regionName => {
        if (!inspecting && regionName !== 'No Region') {
            const header = document.createElement('div');
            header.className = 'region-group-header';
            header.textContent = regionName;
            container.appendChild(header);
        }

        regions[regionName].forEach((loc, idx) => {
            const parentLocation = getLocationRef(world, loc.parentLocationId);
            const childLocations = worldLocationDirectChildren(world, loc.id);
            const div = document.createElement('div');
            div.id = `loc-card-${loc.id}`;
            div.className = 'studio-card';
            div.style.padding = '16px';
            div.style.background = 'var(--surface2)';
            div.style.borderRadius = '12px';
            div.style.border = '1px solid var(--border)';
            div.style.marginBottom = '16px';

            div.innerHTML = `
                <div class="world-inspector-section" data-inspector-section="overview" style="display:flex; gap:12px; margin-bottom:12px;">
                    <div style="flex:1">
                        <label class="form-label" style="font-size:0.7rem; opacity:0.6; display:flex; justify-content:space-between; gap:8px;">Location ID <button type="button" class="inline-link-btn edit-loc-id">Edit carefully</button></label>
                        <input type="text" class="form-input loc-id" value="${escapeHTML(loc.id)}" placeholder="Generated automatically" readonly title="Horde Studio generates this stable link. Use Edit carefully only when repairing imported data.">
                    </div>
                    <div style="flex:1.5">
                        <label class="form-label" style="font-size:0.7rem; opacity:0.6;">Display Name</label>
                        <input type="text" class="form-input loc-name" value="${escapeHTML(loc.name)}" placeholder="e.g. Tavern">
                    </div>
                    <div style="flex:1">
                        <label class="form-label" style="font-size:0.7rem; opacity:0.6;">Region</label>
                        <input type="text" list="world-region-datalist" class="form-input loc-region" value="${escapeHTML(loc.region || '')}" placeholder="Search existing or create a region…">
                    </div>
                    <div style="display:flex; flex-direction:column; gap:4px; align-self:flex-end;">
                        <button class="tool-btn set-start-btn ${world.startLocationId === loc.id ? 'btn-success' : ''}" style="width:100%; white-space:nowrap; font-size:10px;" title="Set as player starting point">
                            ${world.startLocationId === loc.id ? '★ Start' : '☆ Set Start'}
                        </button>
                        <button class="tool-btn tool-btn-danger del-loc" style="width:100%;">✕</button>
                    </div>
                </div>
                
                <div class="world-inspector-section" data-inspector-section="overview">
                    <div>
                        <label class="form-label" style="font-size:0.75rem;">Visible Description (to Player)</label>
                        <textarea class="form-textarea loc-desc" rows="3" placeholder="What the player sees...">${escapeHTML(loc.description)}</textarea>
                    </div>
                </div>
                <div class="world-inspector-section" data-inspector-section="secrets">
                    <div>
                        <label class="form-label" style="font-size:0.75rem;">Hidden Details (DM Only)</label>
                        <textarea class="form-textarea loc-hidden-desc" rows="3" placeholder="Secret info, list of items, vibes...">${escapeHTML(loc.hiddenDescription || '')}</textarea>
                    </div>
                </div>
                <div class="world-inspector-section" data-inspector-section="overview" style="margin-top:10px;">
                    <label class="form-label" style="font-size:.72rem;">Search tags <span class="form-hint">(comma separated; classification only—not links)</span></label>
                    <input class="form-input loc-tags" value="${escapeHTML((loc.tags || []).join(', '))}" placeholder="residential, restricted, haunted…">
                </div>

                <div class="world-media-editor world-inspector-section" data-inspector-section="visuals">
                    <div class="world-media-preview" style="${worldMediaSource(world, loc.visuals?.backgroundAssetId) ? `background-image:url('${cssUrl(worldMediaSource(world, loc.visuals.backgroundAssetId))}')` : ''}">
                        ${worldMediaSource(world, loc.visuals?.backgroundAssetId) ? '' : 'No location background'}
                    </div>
                    <div>
                        <label class="form-label" style="font-size:.75rem;">Location Background</label>
                        <p class="form-hint" style="margin:0 0 8px;">Used only in Cinematic mode. It never changes location state.</p>
                        <div class="world-media-actions">
                            <input class="loc-background-input" type="file" accept="image/*" hidden>
                            <button class="tool-btn loc-background-upload" type="button">Upload</button>
                            <button class="tool-btn loc-background-generate" type="button">✨ Generate</button>
                            <button class="tool-btn loc-background-clear" type="button" ${loc.visuals?.backgroundAssetId ? '' : 'disabled'}>Clear</button>
                        </div>
                    </div>
                </div>

                <div class="location-map-metadata world-inspector-section" data-inspector-section="map">
                    <div class="world-containment-guide">
                        <strong>Geography vs containment</strong>
                        <span>A region is a broad geographic area (for example Greenfield). A building is a location in that region; its rooms are child locations inside the building.</span>
                    </div>
                    ${parentLocation ? `<button type="button" class="world-containment-parent" data-open-parent="${escapeHTML(parentLocation.id)}">
                        <span class="world-containment-parent-icon">↰</span><span><small>This place is inside</small><strong>${escapeHTML(parentLocation.name || parentLocation.id)}</strong></span><span>Open parent</span>
                    </button>` : ''}
                    <div>
                        <label class="form-label" style="font-size:0.7rem;">Map Role</label>
                        <select class="form-select loc-map-type">
                            <option value="" ${!loc.mapType ? 'selected' : ''}>Auto-detect (${escapeHTML(formatWorldMapType(inferWorldMapType(loc)))})</option>
                            ${['transit', 'route', 'building', 'outdoor', 'room', 'area'].map(type =>
                                `<option value="${type}" ${loc.mapType === type ? 'selected' : ''}>${escapeHTML(formatWorldMapType(type))}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="form-label" style="font-size:0.7rem;">Inside / Attached To</label>
                        <select class="form-select loc-map-parent">
                            <option value="">Auto-detect</option>
                            ${world.locations.filter(candidate => candidate.id !== loc.id
                                && !worldLocationLineage(world, candidate).some(ancestor => ancestor.id === loc.id)).map(candidate =>
                                `<option value="${escapeHTML(candidate.id)}" ${loc.parentLocationId === candidate.id ? 'selected' : ''}>${escapeHTML(candidate.name || candidate.id)}</option>`).join('')}
                        </select>
                        <small class="form-hint">Use this for rooms, floors, shops inside a mall, or places attached to another place.</small>
                    </div>
                    <div>
                        <label class="form-label" style="font-size:0.7rem;">Floor / Level</label>
                        <input type="text" list="world-floor-datalist" class="form-input loc-map-floor" value="${escapeHTML(loc.mapFloor || '')}" placeholder="Choose or enter a floor…">
                    </div>
                    <div class="world-contained-places">
                        <div class="world-contained-places-head">
                            <div><strong>Inside ${escapeHTML(loc.name || 'this place')}</strong><span>Rooms and contained places belong to this location. Open one to edit its full record.</span></div>
                            <button type="button" class="tool-btn loc-add-child-room">+ Add room</button>
                        </div>
                        <div class="world-contained-place-grid">
                            ${childLocations.map(child => `<button type="button" class="world-contained-place-card" data-open-child="${escapeHTML(child.id)}">
                                <span class="world-contained-place-icon">${inferWorldMapType(child) === 'room' ? '▦' : '⌖'}</span>
                                <span class="world-contained-place-copy"><strong>${escapeHTML(child.name || 'Unnamed room')}</strong><small>${escapeHTML(formatWorldMapType(child.mapType || inferWorldMapType(child)))}${child.mapFloor ? ` · ${escapeHTML(child.mapFloor)}` : ''}</small><em>${escapeHTML(child.description || 'No description yet.')}</em></span>
                                <span class="world-contained-place-open">Edit →</span>
                            </button>`).join('') || `<div class="world-contained-place-empty">No rooms yet. Add one here and it will remain visibly nested under this location.</div>`}
                        </div>
                    </div>
                </div>
                
                <div class="world-inspector-section" data-inspector-section="connections" style="margin-top:12px;">
                    <label class="form-label" style="font-size:0.75rem;">Exits</label>
                    <div class="exits-container" style="display:flex; flex-direction:column; gap:8px;">
                        ${(loc.exits || []).map((ex, exIdx) => {
                            const isString = typeof ex === 'string';
                            const linkedTarget = !isString ? getLocationRef(world, ex.targetLocationId) : null;
                            const val = linkedTarget
                                ? `${getExitDirection(ex) ? `${getExitDirection(ex)} ` : ''}to ${linkedTarget.name}`
                                : (isString ? ex : (ex.text || ""));
                            const time = isString ? 0 : (ex.travelTime || 0);
                            const oneWay = isString ? false : (ex.isOneWay || false);
                            const mode = isString ? 'walk' : (ex.mode || 'walk');
                            const routeName = isString ? '' : (ex.routeName || '');
                            const cost = isString ? '' : (ex.cost || '');

                            return `
                                <div class="world-exit-row">
                                    <div style="flex:2" class="exit-autocomplete-container">
                                        <input type="text" class="form-input exit-val ${checkExitTarget(val) ? 'valid-ref' : (isExitFormat(val) ? 'invalid-ref' : '')}" data-idx="${exIdx}" value="${escapeHTML(val)}" placeholder="e.g. North to The Gate">
                                    </div>
                                    <input class="form-input exit-mode" data-idx="${exIdx}" aria-label="Transport" value="${escapeHTML(mode)}" placeholder="walk, horse, dragon…">
                                    <div style="display:flex; align-items:center; gap:4px; flex:1">
                                        <label style="font-size:10px; color:var(--text-3);">Time:</label>
                                        <input type="number" class="form-input exit-time" style="width:50px; padding:4px;" value="${time}" data-idx="${exIdx}">
                                        <label style="font-size:10px; color:var(--text-3);">min</label>
                                    </div>
                                    <div style="display:flex; align-items:center; gap:4px;">
                                        <label style="font-size:10px; color:var(--text-3);">1-Way:</label>
                                        <input type="checkbox" class="exit-oneway" ${oneWay ? 'checked' : ''} data-idx="${exIdx}">
                                    </div>
                                    <button class="tool-btn del-exit" data-idx="${exIdx}">✕</button>
                                </div>
                                <div class="world-exit-details"><input class="form-input exit-route" data-idx="${exIdx}" value="${escapeHTML(routeName)}" placeholder="Route or service name (optional)"><input class="form-input exit-cost" data-idx="${exIdx}" value="${escapeHTML(cost)}" placeholder="Cost (optional)"></div>
                                <span class="ref-hint ${checkExitTarget(val) ? 'valid' : 'invalid'}" style="margin-top:-6px; margin-bottom:4px; display:block;">${checkExitTarget(val) ? '✓ Verified Connection' : (isExitFormat(val) ? '⚠ Broken Connection' : 'Hint: Use \"Direction to Location\"')}</span>
                            `;
                        }).join('')}
                    </div>
                    <button class="btn btn-ghost btn-full add-exit-btn" style="margin-top:8px; font-size:0.75rem;">+ Add Exit</button>
                </div>

                <div class="secret-group world-inspector-section" data-inspector-section="simulation" style="border-color:var(--border);">
                    <div class="secret-title" style="color:var(--text-2); margin-bottom:6px;">🌡️ Opening state — how this place reads before anything happens</div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                        <div>
                            <label style="display:block; font-size:10px; color:var(--text-3);">Danger <span class="loc-danger-out" style="color:var(--accent);">${loc.danger == null || loc.danger === '' ? 'unset' : loc.danger}</span></label>
                            <input type="range" class="loc-danger" min="0" max="100" value="${escapeHTML(String(loc.danger == null || loc.danger === '' ? 0 : loc.danger))}" style="width:100%;">
                        </div>
                        <div>
                            <label style="display:block; font-size:10px; color:var(--text-3);">Prosperity <span class="loc-prosperity-out" style="color:var(--accent);">${loc.prosperity == null || loc.prosperity === '' ? 'unset' : loc.prosperity}</span></label>
                            <input type="range" class="loc-prosperity" min="0" max="100" value="${escapeHTML(String(loc.prosperity == null || loc.prosperity === '' ? 50 : loc.prosperity))}" style="width:100%;">
                        </div>
                    </div>
                    <label style="display:block; font-size:10px; color:var(--text-3); margin-top:8px;">Standing conditions <span style="opacity:0.7;">— one per line, e.g. "under curfew"</span></label>
                    <textarea class="form-textarea loc-conditions" rows="2" placeholder="under curfew">${escapeHTML((Array.isArray(loc.conditions) ? loc.conditions : []).map(c => typeof c === 'string' ? c : (c && c.label) || '').filter(Boolean).join('\n'))}</textarea>
                    <details class="loc-community-settings" ${loc.simulateSettlement === true ? 'open' : ''}>
                        <summary><span><strong>Living population</strong><small>Advanced · usually leave on Automatic</small></span><span class="world-setting-state">${loc.simulateSettlement === true ? 'Enabled' : loc.simulateSettlement === false ? 'Disabled' : 'Automatic'}</span></summary>
                        <p class="form-hint">This creates an independent population, economy and political simulation for a town, district, camp or similarly important community. Do not enable it for every building or room—contained places inherit the nearest simulated parent.</p>
                        <label class="world-community-mode-label"><span>Population simulation</span><select class="form-select loc-community-mode">
                            <option value="auto" ${loc.simulateSettlement == null ? 'selected' : ''}>Automatic (recommended)</option>
                            <option value="enabled" ${loc.simulateSettlement === true ? 'selected' : ''}>Enable for this place</option>
                            <option value="disabled" ${loc.simulateSettlement === false ? 'selected' : ''}>Never simulate this place</option>
                        </select></label>
                        <div class="loc-society-seed ${loc.simulateSettlement === true ? '' : 'hidden'}" style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:7px; margin-top:8px;">
                            <label style="font-size:10px; color:var(--text-3);">Population<input type="number" class="form-input loc-population" min="1" value="${escapeHTML(String(loc.population ?? 100))}"></label>
                            <label style="font-size:10px; color:var(--text-3);">Food 0–100<input type="number" class="form-input loc-food" min="0" max="100" value="${escapeHTML(String(loc.food ?? 60))}"></label>
                            <label style="font-size:10px; color:var(--text-3);">Unrest 0–100<input type="number" class="form-input loc-unrest" min="0" max="100" value="${escapeHTML(String(loc.unrest ?? 10))}"></label>
                            <label style="font-size:10px; color:var(--text-3);">Starting ruler
                                <select class="form-select loc-control-faction">
                                    <option value="">No single controller</option>
                                    ${(world.factions || []).map(faction => `<option value="${escapeHTML(faction.id)}" ${loc.controlFactionId === faction.id ? 'selected' : ''}>${escapeHTML(faction.name)}</option>`).join('')}
                                </select>
                            </label>
                        </div>
                    </details>
                    ${loc.danger == null || loc.danger === '' ? `<div class="form-hint" style="margin-top:4px;">Unset — this place opens unremarkable. Run Calibrate → Society to have these judged from the fiction rather than filling in every location by hand.</div>` : `<button class="btn btn-ghost clear-loc-state" style="margin-top:6px; font-size:0.7rem; padding:3px 8px;">Clear opening state</button>`}
                </div>

                <div class="secret-group world-inspector-section" data-inspector-section="commerce" style="border-color:var(--border);">
                    <div class="secret-header">
                        <div class="secret-title" style="color:var(--text-2);">🏪 Shop — what can be bought here</div>
                        <button class="tool-btn add-shop-item-btn" style="padding:2px 8px; font-size:10px;">+ Add Item</button>
                    </div>
                    ${(loc.shop || []).length ? `
                        <div style="display:grid; grid-template-columns:2fr 1fr 1fr 1fr 1fr auto; gap:6px; align-items:end; font-size:10px; color:var(--text-3); margin-bottom:4px;">
                            <div>Item</div><div>Price</div><div>Stock</div><div>Max</div><div>Restock/turn</div><div></div>
                        </div>` : `<div class="form-hint" style="margin-bottom:6px;">Nothing sold here. Without stock, buying anything at this location fails.</div>`}
                    ${(loc.shop || []).map((stock, shopIdx) => `
                        <div style="display:grid; grid-template-columns:2fr 1fr 1fr 1fr 1fr auto; gap:6px; margin-bottom:5px;">
                            <input type="text" class="form-input shop-item" data-shop="${shopIdx}" value="${escapeHTML(stock.item || '')}" placeholder="loaf of bread">
                            <input type="number" class="form-input shop-price" data-shop="${shopIdx}" min="0" value="${escapeHTML(String(stock.price ?? 0))}">
                            <input type="number" class="form-input shop-qty" data-shop="${shopIdx}" min="0" value="${escapeHTML(String(stock.quantity ?? 0))}">
                            <input type="number" class="form-input shop-max" data-shop="${shopIdx}" min="0" value="${escapeHTML(String(stock.maxQuantity ?? 0))}">
                            <input type="number" class="form-input shop-regen" data-shop="${shopIdx}" min="0" value="${escapeHTML(String(stock.regenPerTurn ?? 0))}">
                            <button class="tool-btn del-shop-item" data-shop="${shopIdx}" style="padding:2px 8px;">✕</button>
                        </div>`).join('')}
                </div>

                <div class="secret-group world-inspector-section" data-inspector-section="secrets">
                    <div class="secret-header">
                        <div class="secret-title">Shadow Ledger (Secrets)</div>
                        <button class="tool-btn add-secret-btn" style="padding:2px 8px; font-size:10px;">+ Add Secret</button>
                    </div>
                    <div class="secrets-list-container"></div>
                </div>
            `;

            const secretsList = div.querySelector('.secrets-list-container');
            renderWorldSecrets(loc, secretsList);

            div.querySelector('.add-secret-btn').onclick = () => {
                if (!loc.secrets) loc.secrets = [];
                loc.secrets.push({ label: '', hint: '', truth: '' });
                renderWorldSecrets(loc, secretsList);
            };

            const backgroundInput = div.querySelector('.loc-background-input');
            div.querySelector('.loc-background-upload').onclick = () => backgroundInput.click();
            backgroundInput.onchange = async event => {
                const file = event.target.files?.[0];
                if (!file) return;
                try {
                    const image = await normalizeUploadedImage(file, 2048, 0.86);
                    registerWorldVisualVariant(world, loc, 'location',
                        addWorldMediaAsset(world, image, 'location_background', loc.name));
                    pruneWorldMediaAssets(world);
                    renderWorldLocations();
                    openWorldVisualEditor(world, loc, 'location');
                    ExperimentalWorldsHost.notify(`Background added to ${loc.name}. Frame and crop it before closing the editor.`, 'success');
                } catch (error) {
                    ExperimentalWorldsHost.notify(`Background upload failed: ${error.message}`, 'error');
                } finally { event.target.value = ''; }
            };
            div.querySelector('.loc-background-generate').onclick = () => openWorldVisualEditor(world, loc, 'location');
            div.querySelector('.loc-background-clear').onclick = () => {
                clearWorldVisualVariants(loc, 'location');
                pruneWorldMediaAssets(world);
                renderWorldLocations();
            };

            // --- Opening state ---
            // Touching either slider commits both, so a place never ends up
            // dangerous-but-unset — the pair is what the engine reads.
            [['danger', 0], ['prosperity', 50]].forEach(([field, fallback]) => {
                const slider = div.querySelector(`.loc-${field}`);
                const output = div.querySelector(`.loc-${field}-out`);
                slider.oninput = () => {
                    loc[field] = livingClamp(parseInt(slider.value) || 0, 0, 100);
                    const other = field === 'danger' ? 'prosperity' : 'danger';
                    if (loc[other] == null || loc[other] === '') {
                        loc[other] = field === 'danger' ? 50 : 0;
                    }
                    output.textContent = loc[field];
                };
                slider.onchange = () => renderWorldLocations();   // reveal the clear button
                if (loc[field] == null || loc[field] === '') slider.value = fallback;
            });
            div.querySelector('.loc-conditions').oninput = (e) => {
                const lines = String(e.target.value || '').split('\n')
                    .map(line => line.trim().slice(0, 120)).filter(Boolean).slice(0, 20);
                if (lines.length) loc.conditions = lines;
                else delete loc.conditions;
                updateWorldTokenCount();
            };
            div.querySelector('.loc-community-mode').onchange = event => {
                if (event.target.value === 'enabled') loc.simulateSettlement = true;
                else if (event.target.value === 'disabled') loc.simulateSettlement = false;
                else delete loc.simulateSettlement;
                div.querySelector('.loc-society-seed').classList.toggle('hidden', loc.simulateSettlement !== true);
                div.querySelector('.world-setting-state').textContent = loc.simulateSettlement === true
                    ? 'Enabled' : loc.simulateSettlement === false ? 'Disabled' : 'Automatic';
                updateWorldTokenCount();
            };
            const bindSocietyNumber = (selector, field, min, max) => {
                div.querySelector(selector).onchange = event => {
                    loc[field] = livingClamp(event.target.value, min, max);
                    event.target.value = loc[field];
                    updateWorldTokenCount();
                };
            };
            bindSocietyNumber('.loc-population', 'population', 1, 10000000);
            bindSocietyNumber('.loc-food', 'food', 0, 100);
            bindSocietyNumber('.loc-unrest', 'unrest', 0, 100);
            div.querySelector('.loc-control-faction').onchange = event => {
                loc.controlFactionId = event.target.value;
                updateWorldTokenCount();
            };
            const clearState = div.querySelector('.clear-loc-state');
            if (clearState) {
                clearState.onclick = () => {
                    delete loc.danger;
                    delete loc.prosperity;
                    delete loc.conditions;
                    renderWorldLocations();
                    updateWorldTokenCount();
                };
            }

            // --- Shop ---
            div.querySelector('.add-shop-item-btn').onclick = () => {
                loc.shop = Array.isArray(loc.shop) ? loc.shop : [];
                loc.shop.push({ item: '', price: 1, quantity: 1, maxQuantity: 1, regenPerTurn: 0 });
                renderWorldLocations();
            };
            const shopField = (selector, apply) => div.querySelectorAll(selector).forEach(input => {
                input.onchange = (event) => {
                    const stock = (loc.shop || [])[Number(event.target.dataset.shop)];
                    if (!stock) return;
                    apply(stock, event.target);
                    updateWorldTokenCount();
                };
            });
            const asNumber = (value, max = 999999) =>
                Math.max(0, Math.min(max, parseInt(value) || 0));
            shopField('.shop-item', (stock, input) => { stock.item = input.value.trim().slice(0, 100); });
            shopField('.shop-price', (stock, input) => {
                stock.price = asNumber(input.value);
                // Re-anchor drift to the author's figure rather than an old one.
                stock.basePrice = stock.price;
                input.value = stock.price;
            });
            shopField('.shop-qty', (stock, input) => {
                stock.quantity = asNumber(input.value);
                if (stock.maxQuantity < stock.quantity) stock.maxQuantity = stock.quantity;
                input.value = stock.quantity;
            });
            shopField('.shop-max', (stock, input) => {
                stock.maxQuantity = asNumber(input.value);
                input.value = stock.maxQuantity;
            });
            shopField('.shop-regen', (stock, input) => {
                stock.regenPerTurn = asNumber(input.value, 9999);
                input.value = stock.regenPerTurn;
            });
            div.querySelectorAll('.del-shop-item').forEach(button => {
                button.onclick = () => {
                    (loc.shop || []).splice(Number(button.dataset.shop), 1);
                    if (!loc.shop.length) delete loc.shop;
                    renderWorldLocations();
                };
            });

            const locationIdInput = div.querySelector('.loc-id');
            div.querySelector('.edit-loc-id').onclick = () => {
                locationIdInput.readOnly = false;
                locationIdInput.focus();
                locationIdInput.select();
                ExperimentalWorldsHost.notify('Changing an internal ID can affect saved sessions. Linked world records will be updated automatically.', 'info');
            };
            locationIdInput.onchange = (e) => {
                const oldId = (loc.id || "").trim();
                const newId = e.target.value.trim();
                if (!newId || oldId === newId) {
                    e.target.value = oldId;
                    e.target.readOnly = true;
                    return;
                }
                try {
                    renameWorldLocationId(world, loc, newId);
                } catch (error) {
                    ExperimentalWorldsHost.notify(error.message, 'error');
                    e.target.value = oldId;
                    e.target.readOnly = true;
                    return;
                }
                renderWorldStudio();
            };
            div.querySelector('.loc-name').onchange = (e) => { loc.name = e.target.value; renderWorldStudio(); };
            div.querySelector('.loc-region').onchange = (e) => {
                const name = e.target.value.trim();
                let region = (world.regions || []).find(item => item.name.toLowerCase() === name.toLowerCase());
                if (!region && name) {
                    let id = `reg_${worldDirectorySlug(name, Date.now())}`;
                    let suffix = 2;
                    while (world.regions.some(item => item.id === id)) id = `${id}_${suffix++}`;
                    region = { id, name: name.slice(0, 120), description: '', tags: [] };
                    world.regions.push(region);
                }
                loc.regionId = region?.id || '';
                loc.region = region?.name || '';
                renderWorldLocations();
            };
            div.querySelector('.loc-map-type').onchange = (e) => {
                loc.mapType = e.target.value;
                renderWorldLocations();
                renderWorldArchitectMap();
            };
            div.querySelector('.loc-map-parent').onchange = (e) => {
                loc.parentLocationId = e.target.value;
                const parent = getLocationRef(world, loc.parentLocationId);
                if (parent?.regionId) {
                    const region = (world.regions || []).find(item => item.id === parent.regionId);
                    loc.regionId = parent.regionId;
                    loc.region = region?.name || parent.region || loc.region;
                }
                renderWorldLocations();
                renderWorldArchitectMap();
            };
            div.querySelector('.loc-add-child-room').onclick = () => {
                addWorldLocation('bottom', loc.regionId, loc.id, 'room');
            };
            div.querySelector('[data-open-parent]')?.addEventListener('click', event => {
                openWorldRecordInspector('location', event.currentTarget.dataset.openParent, 'map', 'locations');
            });
            div.querySelectorAll('[data-open-child]').forEach(button => button.onclick = () => {
                openWorldRecordInspector('location', button.dataset.openChild, '', 'locations');
            });
            div.querySelector('.loc-map-floor').onchange = (e) => {
                loc.mapFloor = e.target.value.trim();
                renderWorldArchitectMap();
            };
            div.querySelector('.loc-desc').oninput = (e) => { loc.description = e.target.value; updateWorldTokenCount(); };
            div.querySelector('.loc-hidden-desc').oninput = (e) => { loc.hiddenDescription = e.target.value; updateWorldTokenCount(); };
            div.querySelector('.loc-tags').onchange = e => {
                loc.tags = [...new Set(e.target.value.split(',').map(tag => tag.trim()).filter(Boolean))].slice(0, 30);
                updateWorldTokenCount();
            };
            
            div.querySelectorAll('.exit-val').forEach(inp => {
                inp.oninput = (e) => {
                    const idx = e.target.dataset.idx;
                    const val = e.target.value;
                    if (typeof loc.exits[idx] === 'string') loc.exits[idx] = val;
                    else {
                        loc.exits[idx].text = val;
                        // While the label is being edited it must not continue
                        // resolving to the previous canonical destination.
                        loc.exits[idx].targetLocationId = '';
                    }
                    
                    const isValid = checkExitTarget(val);
                    e.target.className = `form-input exit-val ${isValid ? 'valid-ref' : (isExitFormat(val) ? 'invalid-ref' : '')}`;
                    
                    const rowDiv = e.target.parentElement.parentElement;
                    const hintSpan = rowDiv.nextElementSibling;
                    if (hintSpan && hintSpan.classList.contains('ref-hint')) {
                        hintSpan.className = `ref-hint ${isValid ? 'valid' : 'invalid'}`;
                        hintSpan.textContent = isValid ? '✓ Verified Connection' : (isExitFormat(val) ? '⚠ Broken Connection' : 'Hint: Use "Direction to Location"');
                    }
                    
                    updateExitAutocomplete(e.target, loc);
                };
                inp.onfocus = (e) => {
                    e.target.dataset.oldVal = e.target.value;
                    updateExitAutocomplete(e.target, loc);
                };
                inp.onblur = (e) => {
                    setTimeout(() => {
                        const dropdown = e.target.parentElement.querySelector('.exit-autocomplete-dropdown');
                        if (dropdown) dropdown.remove();
                    }, 150);
                };
                inp.onkeydown = (e) => {
                    const container = e.target.parentElement;
                    const dropdown = container.querySelector('.exit-autocomplete-dropdown');
                    if (!dropdown) return;
                    
                    const items = dropdown.querySelectorAll('.exit-autocomplete-item');
                    if (items.length === 0) return;
                    
                    let activeIdx = -1;
                    items.forEach((item, i) => {
                        if (item.classList.contains('active')) activeIdx = i;
                    });
                    
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        if (activeIdx !== -1) items[activeIdx].classList.remove('active');
                        activeIdx = (activeIdx + 1) % items.length;
                        items[activeIdx].classList.add('active');
                        items[activeIdx].scrollIntoView({ block: 'nearest' });
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        if (activeIdx !== -1) items[activeIdx].classList.remove('active');
                        activeIdx = (activeIdx - 1 + items.length) % items.length;
                        items[activeIdx].classList.add('active');
                        items[activeIdx].scrollIntoView({ block: 'nearest' });
                    } else if (e.key === 'Enter') {
                        if (activeIdx !== -1) {
                            e.preventDefault();
                            items[activeIdx].dispatchEvent(new MouseEvent('mousedown'));
                        }
                    }
                };
                inp.onchange = (e) => {
                    const oldVal = e.target.dataset.oldVal || "";
                    const newVal = e.target.value;
                    if (oldVal !== newVal) {
                        const idx = e.target.dataset.idx;
                        const isOneWay = typeof loc.exits[idx] === 'object' && loc.exits[idx].isOneWay;
                        const travelTime = typeof loc.exits[idx] === 'object' ? loc.exits[idx].travelTime : 0;
                        
                        if (oldVal) syncExitConnection(loc, oldVal, false, 0, true);
                        if (newVal) syncExitConnection(loc, newVal, isOneWay, travelTime, false);
                        if (loc.exits[idx] && typeof loc.exits[idx] === 'object') {
                            const linked = getLocationRef(world, getExitTargetName(newVal));
                            loc.exits[idx].targetLocationId = linked?.id || '';
                            loc.exits[idx].direction = getExitDirection(newVal);
                            loc.exits[idx].text = newVal;
                        }
                        e.target.dataset.oldVal = newVal;
                    }
                    renderWorldLocations();
                    if (typeof renderWorldArchitectMap === 'function') renderWorldArchitectMap();
                };
            });
            div.querySelectorAll('.exit-time').forEach(inp => {
                inp.onchange = (e) => {
                    const idx = e.target.dataset.idx;
                    const travelTime = parseInt(e.target.value) || 0;
                    const text = typeof loc.exits[idx] === 'string' ? loc.exits[idx] : (loc.exits[idx].text || "");
                    const isOneWay = typeof loc.exits[idx] === 'object' ? loc.exits[idx].isOneWay : false;
                    
                    if (typeof loc.exits[idx] === 'string') {
                        loc.exits[idx] = { text: loc.exits[idx], travelTime: travelTime };
                    } else {
                        loc.exits[idx].travelTime = travelTime;
                    }
                    
                    syncExitConnection(loc, text, isOneWay, travelTime, false);
                    renderWorldLocations();
                };
            });
            div.querySelectorAll('.exit-mode').forEach(input => {
                input.onchange = event => {
                    const index = Number(event.target.dataset.idx);
                    if (typeof loc.exits[index] === 'string') loc.exits[index] = { text: loc.exits[index] };
                    loc.exits[index].mode = normalizeWorldTravelMode(event.target.value);
                    syncExitConnection(loc, loc.exits[index].text, loc.exits[index].isOneWay, loc.exits[index].travelTime, false);
                };
            });
            div.querySelectorAll('.exit-route').forEach(input => {
                input.onchange = event => {
                    const index = Number(event.target.dataset.idx);
                    if (typeof loc.exits[index] === 'string') loc.exits[index] = { text: loc.exits[index] };
                    loc.exits[index].routeName = event.target.value.slice(0, 160);
                    syncExitConnection(loc, loc.exits[index].text, loc.exits[index].isOneWay, loc.exits[index].travelTime, false);
                };
            });
            div.querySelectorAll('.exit-cost').forEach(input => {
                input.onchange = event => {
                    const index = Number(event.target.dataset.idx);
                    if (typeof loc.exits[index] === 'string') loc.exits[index] = { text: loc.exits[index] };
                    loc.exits[index].cost = event.target.value.slice(0, 120);
                    syncExitConnection(loc, loc.exits[index].text, loc.exits[index].isOneWay, loc.exits[index].travelTime, false);
                };
            });
            div.querySelectorAll('.exit-oneway').forEach(inp => {
                inp.onchange = (e) => {
                    const idx = e.target.dataset.idx;
                    const isOneWay = e.target.checked;
                    const text = typeof loc.exits[idx] === 'string' ? loc.exits[idx] : (loc.exits[idx].text || "");
                    const travelTime = typeof loc.exits[idx] === 'object' ? loc.exits[idx].travelTime : 0;
                    
                    if (typeof loc.exits[idx] === 'string') {
                        loc.exits[idx] = { text: loc.exits[idx], isOneWay: isOneWay };
                    } else {
                        loc.exits[idx].isOneWay = isOneWay;
                    }
                    
                    syncExitConnection(loc, text, isOneWay, travelTime, false);
                    renderWorldLocations();
                    renderWorldArchitectMap();
                };
            });

            div.querySelectorAll('.del-exit').forEach(btn => {
                btn.onclick = () => {
                    const idx = btn.dataset.idx;
                    const exitObj = loc.exits[idx];
                    const text = typeof exitObj === 'string' ? exitObj : (exitObj.text || "");
                    const isOneWay = typeof exitObj === 'object' ? exitObj.isOneWay : false;
                    const travelTime = typeof exitObj === 'object' ? exitObj.travelTime : 0;
                    
                    syncExitConnection(loc, text, isOneWay, travelTime, true);
                    loc.exits.splice(idx, 1);
                    renderWorldLocations();
                };
            });

            div.querySelector('.add-exit-btn').onclick = () => {
                loc.exits = loc.exits || [];
                loc.exits.push("");
                renderWorldLocations();
            };

            div.querySelector('.del-loc').onclick = () => {
                const usedBy = worldDirectoryUsedBy('location', loc.id);
                if (usedBy.length && !confirm(`“${loc.name || loc.id}” is linked from ${usedBy.length} world record${usedBy.length === 1 ? '' : 's'}:\n\n${usedBy.slice(0, 8).join('\n')}\n\nDelete it and clear those links?`)) return;
                removeWorldLocationRecord(ExperimentalWorldsState.editingWorld, loc.id);
                // Nobody holds ground that no longer exists, and nobody sells there.
                normalizeAuthoredWorld(ExperimentalWorldsState.editingWorld);
                closeWorldRecordInspector();
                renderWorldLocations();
                renderWorldEntities();
                renderWorldFactions();
                updateWorldTokenCount();
            };

            div.querySelector('.set-start-btn').onclick = () => {
                ExperimentalWorldsState.editingWorld.startLocationId = loc.id;
                renderWorldLocations();
            };

            container.appendChild(div);
        });
    });
    if (inspecting) {
        const links = worldDirectoryUsedBy('location', selected.id);
        document.getElementById('world-record-reference-status').textContent = links.length
            ? `Canon Links · used by ${links.slice(0, 3).join(', ')}${links.length > 3 ? ` and ${links.length - 3} more` : ''}.`
            : 'Canon Links · this location has no incoming references yet.';
        setWorldInspectorTab(worldRecordInspector.tab);
    }
}

function addWorldEntity(type = 'npc') {
    // Only canonical authored entity types are valid. This also makes
    // the function safe if it is ever called by an event listener directly.
    const entityType = ['item', 'vehicle'].includes(type) ? type : 'npc';
    const ent = {
        id: 'ent_' + Date.now(),
        name: '',
        type: entityType,
        isMajor: false,
        simulationDepth: 'recurring',
        description: '',
        persona: '',
        goal: '',
        goalAutonomy: 'medium',
        startLocation: '',
        homeLocation: '',
        secrets: [],
        schedule: []
    };
    if (entityType === 'vehicle') {
        ent.vehicle = { persistent: true, parkedAnchorId: '', owners: [], access: [], runtimeContainer: false };
        window.ExperimentalWorldsSidecarTraversal?.normalizeVehicle(ent);
    }
    ExperimentalWorldsState.editingWorld.entities.push(ent);
    const directory = entityType === 'npc' ? 'people' : 'items';
    worldStudioListState[directory].query = '';
    worldStudioListState[directory].page = 0;
    openWorldRecordInspector('entity', ent.id, '', directory);
    updateWorldTokenCount();
}

function addWorldItem() {
    addWorldEntity('item');
}

function renderWorldSecrets(owner, container) {
    container.innerHTML = '';
    const secrets = owner.secrets || [];

    secrets.forEach((s, idx) => {
        const div = document.createElement('div');
        div.className = 'secret-card';
        div.innerHTML = `
            <div class="secret-label-row">
                <input type="text" class="form-input secret-label" style="flex:1" value="${escapeHTML(s.label || '')}" placeholder="Secret ID (e.g. secret_wall)">
                <button class="tool-btn tool-btn-danger del-secret">✕</button>
            </div>
            <textarea class="form-textarea secret-hint secret-input-hint" rows="2" placeholder="AI HINT: What can the AI mention? (e.g. 'A draft comes from the shelf')">${escapeHTML(s.hint || '')}</textarea>
            <textarea class="form-textarea secret-truth secret-input-truth" style="margin-top:8px;" rows="2" placeholder="LOCKED TRUTH: AI only sees this after investigate_secret call!">${escapeHTML(s.truth || '')}</textarea>
        `;

        div.querySelector('.secret-label').oninput = (e) => { s.label = e.target.value; updateWorldTokenCount(); };
        div.querySelector('.secret-hint').oninput = (e) => { s.hint = e.target.value; updateWorldTokenCount(); };
        div.querySelector('.secret-truth').oninput = (e) => { s.truth = e.target.value; updateWorldTokenCount(); };
        div.querySelector('.del-secret').onclick = () => {
            owner.secrets.splice(idx, 1);
            renderWorldSecrets(owner, container);
        };

        container.appendChild(div);
    });
}

function updateWorldTokenCount() {
    const w = ExperimentalWorldsState.editingWorld;
    if (!w) return;
    
    const name = document.getElementById('w-studio-name').value;
    const desc = document.getElementById('w-studio-desc').value;
    const prompt = document.getElementById('w-studio-dm-prompt').value;
    const intro = document.getElementById('w-studio-intro').value;
    const note = document.getElementById('w-studio-note').value;

    // Estimate based on current state + inputs
    const lore = (w.lorebook || []).map(l => (l.keyword || '') + (l.text || '')).join('');
    const locations = (w.locations || []).map(l => (l.name || '') + (l.description || '') + (l.hiddenDescription || '')).join('');
    const entities = (w.entities || []).map(e => (e.name || '') + (e.description || '') + (e.persona || '')).join('');

    // The shop, faction and standing editors all call this, so what they add
    // has to move the number — otherwise the counter silently under-reports.
    const society = (w.factions || []).map(f => (f.name || '') + (f.description || '') + (f.goal || '')).join('')
        + (w.relationships || []).map(r => (r.label || '') + (r.reason || '')).join('')
        + (w.locations || []).map(l => (l.shop || []).map(s => s.item || '').join('')).join('')
        + (w.startingLives || []).map(origin => `${origin.name || ''}${origin.description || ''}${origin.intro || ''}`).join('')
        + (w.sandboxConfig?.principles || '');

    const totalChars = name.length + desc.length + prompt.length + intro.length + note.length + lore.length + locations.length + entities.length + society.length;
    const estTokens = Math.ceil(totalChars / 3.5);
    
    const el = document.getElementById('w-studio-token-count');
    if (el) el.textContent = estTokens.toLocaleString();
}

const WORLD_MAP_TYPES = new Set(['region', 'transit', 'route', 'building', 'outdoor', 'room', 'area']);

function formatWorldMapType(type) {
    return ({
        region: 'Region / Settlement',
        transit: 'Transit hub',
        route: 'Street / Path',
        building: 'Building',
        outdoor: 'Yard / Outdoor',
        room: 'Room / Interior',
        area: 'Area'
    })[type] || 'Area';
}

function inferWorldMapType(location) {
    if (WORLD_MAP_TYPES.has(location?.mapType)) return location.mapType;
    const text = `${location?.name || ''} ${location?.description || ''}`.toLowerCase();
    if (/\b(street|road|lane|avenue|boulevard|highway|trail|path|passageway|alley|bridge|canal|river|rail|route)\b/.test(text)) return 'route';
    if (/\b(bus stop|train station|railway station|metro station|subway station|airport|airfield|ferry terminal|coach station|transit hub)\b/.test(text)) return 'transit';
    if (/\b(house|home|hall|hotel|inn|tavern|shop|store|market|school|hospital|temple|church|cathedral|tower|castle|palace|manor|fort|station|warehouse|factory|library|museum|theatre|theater|building|cottage|cabin|farmhouse|apartment|citadel)\b/.test(text)) return 'building';
    if (/\b(bedroom|bathroom|kitchen|office|study|nursery|cellar|basement|attic|foyer|lobby|corridor|hallway|closet|pantry|dining room|living room|guest room|chamber|suite|workshop|laboratory|lab|room)\b/.test(text)) return 'room';
    if (/\b(backyard|front yard|yard|garden|courtyard|patio|porch|terrace|grounds|balcony|rooftop|park|field|plaza|square|beach|dock|harbor|forest|woods|clearing)\b/.test(text)) return 'outdoor';
    if (/\b(city|town|village|district|quarter|neighborhood|neighbourhood|kingdom|province|county|region|realm|island|continent)\b/.test(text)) return 'region';
    return 'area';
}

function inferWorldMapFloor(location) {
    if (location?.mapFloor) return String(location.mapFloor).trim();
    const text = `${location?.name || ''} ${location?.description || ''}`.toLowerCase();
    const match = text.match(/\b(basement|cellar|ground(?: floor)?|first floor|second floor|third floor|upper floor|lower floor|attic|rooftop|level\s*-?\d+|\d+(?:st|nd|rd|th) floor)\b/);
    return match ? match[1] : '';
}

function worldMapNameTokens(name) {
    const generic = new Set([
        'the', 'a', 'an', 'of', 'at', 'in', 'on', 'and', 's',
        'house', 'home', 'building', 'room', 'bedroom', 'bathroom', 'kitchen',
        'yard', 'backyard', 'garden', 'garage', 'hall', 'floor', 'level'
    ]);
    return String(name || '').toLowerCase()
        .replace(/['’]s\b/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .split(/\s+/)
        .filter(token => token && !generic.has(token));
}

function getWorldMapContainerId(node, nodeById) {
    if (!node || ['region', 'route', 'building', 'area'].includes(node.type)) return '';
    const visited = new Set([node.id]);
    let parent = nodeById.get(node.parentId);
    while (parent && !visited.has(parent.id)) {
        if (parent.type === 'building' || parent.type === 'area') return parent.id;
        visited.add(parent.id);
        parent = nodeById.get(parent.parentId);
    }
    return '';
}

function buildSemanticWorldGraph(world) {
    const locations = Array.isArray(world?.locations) ? world.locations : [];
    locations.forEach((location, index) => {
        if (!location.id) location.id = `loc_${String(location.name || index).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    });
    const nodes = locations.map(location => ({
        id: location.id,
        location,
        type: inferWorldMapType(location),
        floor: inferWorldMapFloor(location),
        parentId: '',
        regionKey: '',
        explicitType: WORLD_MAP_TYPES.has(location.mapType)
    }));
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const byIdKey = new Map(nodes.map(node => [String(node.id || '').trim().toLowerCase(), node]));
    const nameGroups = new Map();
    nodes.forEach(node => {
        const key = String(node.location.name || '').trim().toLowerCase();
        if (!key) return;
        if (!nameGroups.has(key)) nameGroups.set(key, []);
        nameGroups.get(key).push(node);
    });
    const byName = new Map([...nameGroups.entries()]
        .filter(([, matches]) => matches.length === 1)
        .map(([key, matches]) => [key, matches[0]]));
    const resolveTarget = ref => {
        const query = String(ref || '').trim().toLowerCase();
        return nodeById.get(ref) || byIdKey.get(query) || byName.get(query) || null;
    };
    const unresolved = [];
    const exitEntries = [];
    nodes.forEach(node => {
        (node.location.exits || []).forEach(exit => {
            const targetRef = getExitTargetName(exit);
            const target = resolveTarget(targetRef);
            if (!target || target.id === node.id) {
                if (targetRef) unresolved.push({ sourceId: node.id, target: targetRef });
                return;
            }
            const text = typeof exit === 'string' ? exit : (exit.text || '');
            const direction = String(text).split(/\s+to\s+/i)[0].trim();
            exitEntries.push({
                sourceId: node.id,
                targetId: target.id,
                isOneWay: !!(exit && typeof exit === 'object' && exit.isOneWay),
                travelTime: Math.max(0, parseInt(typeof exit === 'object' ? exit.travelTime : 0) || 0),
                direction: /^to$/i.test(direction) ? '' : direction
            });
        });
    });

    const pairMap = new Map();
    exitEntries.forEach(entry => {
        const ordered = [entry.sourceId, entry.targetId].sort();
        const key = ordered.join('|');
        if (!pairMap.has(key)) pairMap.set(key, { a: ordered[0], b: ordered[1], entries: [] });
        pairMap.get(key).entries.push(entry);
    });
    const edges = [...pairMap.values()].map(pair => {
        const directions = new Set(pair.entries.map(entry => `${entry.sourceId}>${entry.targetId}`));
        const explicit = pair.entries.find(entry => entry.isOneWay);
        const hasReverse = directions.has(`${pair.a}>${pair.b}`) && directions.has(`${pair.b}>${pair.a}`);
        const isOneWay = !!explicit && !hasReverse;
        const times = pair.entries.map(entry => entry.travelTime).filter(Boolean);
        return {
            sourceId: isOneWay ? explicit.sourceId : pair.a,
            targetId: isOneWay ? explicit.targetId : pair.b,
            isOneWay,
            travelTime: times.length ? Math.min(...times) : 0,
            directions: [...new Set(pair.entries.map(entry => entry.direction).filter(Boolean))],
            originalCount: pair.entries.length
        };
    });

    const adjacency = new Map(nodes.map(node => [node.id, new Set()]));
    edges.forEach(edge => {
        adjacency.get(edge.sourceId)?.add(edge.targetId);
        adjacency.get(edge.targetId)?.add(edge.sourceId);
    });

    // Explicit hierarchy wins. A region field that names a building is also a
    // strong containment signal (common in imported worlds).
    nodes.forEach(node => {
        const explicitParent = nodeById.get(node.location.parentLocationId)
            || byName.get(String(node.location.parentLocationId || '').toLowerCase());
        if (explicitParent && explicitParent.id !== node.id) {
            node.parentId = explicitParent.id;
            return;
        }
        const regionMatch = nodeById.get(node.location.region)
            || byName.get(String(node.location.region || '').trim().toLowerCase());
        if (regionMatch && regionMatch.id !== node.id && regionMatch.type === 'building'
            && ['room', 'outdoor', 'area'].includes(node.type)) {
            node.parentId = regionMatch.id;
        }
    });

    const buildings = nodes.filter(node => node.type === 'building').sort((a, b) =>
        String(a.location.name).localeCompare(String(b.location.name)));
    const buildingsByToken = new Map();
    buildings.forEach(building => {
        worldMapNameTokens(building.location.name).forEach(token => {
            if (!buildingsByToken.has(token)) buildingsByToken.set(token, []);
            buildingsByToken.get(token).push(building);
        });
    });
    const attachedOutdoor = node => /\b(yard|backyard|garden|courtyard|patio|porch|terrace|grounds|balcony|rooftop|garage)\b/i.test(node.location.name || '');
    const autoParentScores = new Map();

    nodes.forEach(node => {
        if (node.parentId || !['room', 'outdoor'].includes(node.type)) return;
        if (node.type === 'outdoor' && !attachedOutdoor(node)) return;
        const directBuildings = [...(adjacency.get(node.id) || [])].map(id => nodeById.get(id)).filter(candidate => candidate?.type === 'building');
        const nodeTokens = worldMapNameTokens(node.location.name);
        const tokenBuildings = [...new Set(nodeTokens.flatMap(token => buildingsByToken.get(token) || []))];
        const scores = new Map();
        directBuildings.forEach(building => scores.set(building.id, (scores.get(building.id) || 0) + 12));
        tokenBuildings.forEach(building => {
            const sharedTokens = worldMapNameTokens(building.location.name).filter(token => nodeTokens.includes(token)).length;
            scores.set(building.id, (scores.get(building.id) || 0) + sharedTokens * 40);
        });
        autoParentScores.set(node.id, scores);
        const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        if (ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1])) {
            node.parentId = ranked[0][0];
        }
    });

    // Resolve ambiguous rooms using already-classified neighboring rooms. This
    // prevents a heavily interconnected location from falling into whichever
    // building happened to sort first.
    for (let pass = 0; pass < nodes.length; pass++) {
        let changed = false;
        nodes.forEach(node => {
            if (node.parentId || !['room', 'outdoor'].includes(node.type)) return;
            if (node.type === 'outdoor' && !attachedOutdoor(node)) return;
            const scores = new Map(autoParentScores.get(node.id) || []);
            for (const neighborId of adjacency.get(node.id) || []) {
                const neighborParent = nodeById.get(neighborId)?.parentId;
                if (neighborParent && nodeById.get(neighborParent)?.type === 'building') {
                    scores.set(neighborParent, (scores.get(neighborParent) || 0) + 24);
                }
            }
            const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
            if (ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1])) {
                node.parentId = ranked[0][0];
                changed = true;
            }
        });
        if (!changed) break;
    }

    // Multi-source graph walk attaches interior rooms that connect through
    // other rooms rather than directly to the building node.
    const owner = new Map();
    const queue = [];
    buildings.forEach(building => {
        owner.set(building.id, building.id);
        queue.push(building.id);
    });
    nodes.forEach(node => {
        if (!node.parentId || nodeById.get(node.parentId)?.type !== 'building') return;
        owner.set(node.id, node.parentId);
        queue.push(node.id);
    });
    for (let cursor = 0; cursor < queue.length; cursor++) {
        const currentId = queue[cursor];
        const buildingId = owner.get(currentId);
        const building = nodeById.get(buildingId);
        for (const nextId of adjacency.get(currentId) || []) {
            const next = nodeById.get(nextId);
            if (!next || owner.has(nextId) || (next.type === 'building' && next.id !== buildingId)) continue;
            if (next.type !== 'room' && !(next.type === 'outdoor' && attachedOutdoor(next))) continue;
            if (next.parentId && next.parentId !== buildingId) continue;
            const directBuildings = [...(adjacency.get(nextId) || [])]
                .map(id => nodeById.get(id))
                .filter(candidate => candidate?.type === 'building');
            if (!next.parentId && directBuildings.length > 1) continue;
            const buildingRegion = String(building.location.region || '').trim().toLowerCase();
            const nextRegion = String(next.location.region || '').trim().toLowerCase();
            if (buildingRegion && nextRegion && buildingRegion !== nextRegion) continue;
            owner.set(nextId, buildingId);
            queue.push(nextId);
        }
    }
    nodes.forEach(node => {
        if (!node.parentId && node.type === 'room' && owner.has(node.id)) node.parentId = owner.get(node.id);
    });

    nodes.forEach(node => {
        const visited = new Set();
        let cursor = node;
        let regionName = '';
        while (cursor && !visited.has(cursor.id)) {
            visited.add(cursor.id);
            if (cursor.type === 'region') {
                regionName = String(cursor.location.name || cursor.location.region || 'World').trim();
                break;
            }
            const declaredRegion = String(cursor.location.region || '').trim();
            if (declaredRegion) {
                const regionMatch = byName.get(declaredRegion.toLowerCase());
                regionName = regionMatch?.type === 'region'
                    ? String(regionMatch.location.name || declaredRegion)
                    : declaredRegion;
            }
            cursor = nodeById.get(cursor.parentId);
        }
        node.regionKey = regionName || 'World';
    });

    const collapsed = new Map();
    edges.forEach(edge => {
        const source = nodeById.get(edge.sourceId);
        const target = nodeById.get(edge.targetId);
        if (!source || !target) return;
        const sourceContainerId = getWorldMapContainerId(source, nodeById);
        const targetContainerId = getWorldMapContainerId(target, nodeById);
        if (sourceContainerId === target.id || targetContainerId === source.id) return; // visible containment already communicates this
        let sourceId = source.id;
        let targetId = target.id;
        if (sourceContainerId && sourceContainerId !== targetContainerId) sourceId = sourceContainerId;
        if (targetContainerId && targetContainerId !== sourceContainerId) targetId = targetContainerId;
        if (sourceId === targetId) return;
        const ordered = [sourceId, targetId].sort();
        const key = ordered.join('|');
        let aggregate = collapsed.get(key);
        if (!aggregate) {
            aggregate = {
                sourceId: edge.isOneWay ? sourceId : ordered[0],
                targetId: edge.isOneWay ? targetId : ordered[1],
                isOneWay: edge.isOneWay,
                hasTwoWaySource: !edge.isOneWay,
                oneWayDirections: new Set(edge.isOneWay ? [`${sourceId}>${targetId}`] : []),
                travelTime: edge.travelTime,
                count: 0,
                internalParentId: sourceContainerId && sourceContainerId === targetContainerId
                    ? sourceContainerId : ''
            };
            collapsed.set(key, aggregate);
        }
        aggregate.count += edge.originalCount || 1;
        aggregate.hasTwoWaySource = aggregate.hasTwoWaySource || !edge.isOneWay;
        if (edge.isOneWay) aggregate.oneWayDirections.add(`${sourceId}>${targetId}`);
        aggregate.isOneWay = !aggregate.hasTwoWaySource && aggregate.oneWayDirections.size === 1;
        if (aggregate.isOneWay) {
            [aggregate.sourceId, aggregate.targetId] = [...aggregate.oneWayDirections][0].split('>');
        } else {
            [aggregate.sourceId, aggregate.targetId] = ordered;
        }
        if (!aggregate.travelTime || (edge.travelTime && edge.travelTime < aggregate.travelTime)) aggregate.travelTime = edge.travelTime;
    });

    // Dense room meshes are reduced to a spanning network; one-way and timed
    // links remain even when redundant because they carry gameplay meaning.
    const externalEdges = [];
    const internalGroups = new Map();
    [...collapsed.values()].forEach(edge => {
        if (!edge.internalParentId) externalEdges.push(edge);
        else {
            if (!internalGroups.has(edge.internalParentId)) internalGroups.set(edge.internalParentId, []);
            internalGroups.get(edge.internalParentId).push(edge);
        }
    });
    const displayEdges = [...externalEdges];
    internalGroups.forEach(group => {
        const parent = new Map();
        const root = id => {
            if (!parent.has(id)) parent.set(id, id);
            let value = id;
            while (parent.get(value) !== value) value = parent.get(value);
            return value;
        };
        const union = (a, b) => {
            const ra = root(a), rb = root(b);
            if (ra !== rb) parent.set(ra, rb);
        };
        group.sort((a, b) => Number(b.isOneWay || !!b.travelTime) - Number(a.isOneWay || !!a.travelTime));
        group.forEach(edge => {
            const special = edge.isOneWay || edge.travelTime;
            if (special || root(edge.sourceId) !== root(edge.targetId)) {
                displayEdges.push(edge);
                union(edge.sourceId, edge.targetId);
            }
        });
    });

    return {
        nodes,
        nodeById,
        edges,
        displayEdges,
        unresolved,
        originalExitCount: exitEntries.length,
        collapsedConnectionCount: collapsed.size
    };
}

function layoutSemanticWorldGraph(graph, currentLocationId = '') {
    const positions = new Map();
    const regionBoxes = [];
    const clusterBoxes = [];
    const childrenByParent = new Map();
    graph.nodes.forEach(node => {
        const containerId = getWorldMapContainerId(node, graph.nodeById);
        if (!containerId) return;
        if (!childrenByParent.has(containerId)) childrenByParent.set(containerId, []);
        childrenByParent.get(containerId).push(node);
    });
    const regions = new Map();
    graph.nodes.forEach(node => {
        if (!regions.has(node.regionKey)) regions.set(node.regionKey, []);
        regions.get(node.regionKey).push(node);
    });
    const currentRegion = graph.nodeById.get(currentLocationId)?.regionKey;
    const orderedRegions = [...regions.entries()].sort((a, b) => {
        if (a[0] === currentRegion) return -1;
        if (b[0] === currentRegion) return 1;
        return a[0].localeCompare(b[0]);
    });

    let regionY = 24;
    let overallWidth = 820;
    orderedRegions.forEach(([regionName, regionNodes]) => {
        const contentWidth = Math.max(760, Math.min(1500, Math.ceil(Math.sqrt(regionNodes.length || 1)) * 250));
        const regionTop = regionY;
        // A route or region may be a semantic parent, but it is not a visual
        // container. Its buildings remain full map units; only rooms/yards
        // collapse into the nearest building/area cluster.
        const topNodes = regionNodes.filter(node => !getWorldMapContainerId(node, graph.nodeById));
        const routes = topNodes.filter(node => node.type === 'route');
        const units = topNodes.filter(node => node.type !== 'route');
        let cursorY = regionTop + 60;

        if (routes.length) {
            const columns = Math.max(1, Math.floor((contentWidth - 40) / 210));
            routes.forEach((node, index) => {
                const col = index % columns;
                const row = Math.floor(index / columns);
                positions.set(node.id, {
                    x: 70 + col * 210 + 90,
                    y: cursorY + row * 70 + 26,
                    width: 180,
                    height: 46
                });
            });
            cursorY += Math.ceil(routes.length / columns) * 70 + 18;
        }

        let cursorX = 60;
        let rowHeight = 0;
        units.forEach(unit => {
            const children = (childrenByParent.get(unit.id) || []).sort((a, b) =>
                String(a.floor).localeCompare(String(b.floor)) || String(a.location.name).localeCompare(String(b.location.name)));
            const childColumns = children.length ? Math.min(6, Math.max(1, Math.ceil(Math.sqrt(children.length)))) : 0;
            const unitWidth = children.length ? Math.max(240, childColumns * 170 + 34) : 210;
            const childRows = childColumns ? Math.ceil(children.length / childColumns) : 0;
            const unitHeight = children.length ? 104 + childRows * 68 + 24 : 92;
            if (cursorX > 60 && cursorX + unitWidth > contentWidth) {
                cursorX = 60;
                cursorY += rowHeight + 24;
                rowHeight = 0;
            }
            if (children.length) {
                clusterBoxes.push({
                    id: unit.id,
                    label: unit.location.name || 'Unnamed building',
                    x: cursorX,
                    y: cursorY,
                    width: unitWidth,
                    height: unitHeight,
                    type: unit.type
                });
                positions.set(unit.id, {
                    x: cursorX + unitWidth / 2,
                    y: cursorY + 42,
                    width: Math.min(210, unitWidth - 30),
                    height: 56
                });
                children.forEach((child, index) => {
                    const col = index % childColumns;
                    const row = Math.floor(index / childColumns);
                    positions.set(child.id, {
                        x: cursorX + 17 + col * 170 + 75,
                        y: cursorY + 104 + row * 68 + 23,
                        width: 150,
                        height: 46
                    });
                });
            } else {
                positions.set(unit.id, {
                    x: cursorX + unitWidth / 2,
                    y: cursorY + unitHeight / 2,
                    width: unit.type === 'region' ? 190 : 180,
                    height: unit.type === 'outdoor' ? 48 : 54
                });
            }
            cursorX += unitWidth + 24;
            rowHeight = Math.max(rowHeight, unitHeight);
        });
        const regionHeight = Math.max(150, cursorY + rowHeight + 34 - regionTop);
        regionBoxes.push({ label: regionName, x: 24, y: regionTop, width: contentWidth + 56, height: regionHeight });
        regionY = regionTop + regionHeight + 26;
        overallWidth = Math.max(overallWidth, contentWidth + 104);
    });

    return {
        positions,
        regionBoxes,
        clusterBoxes,
        width: overallWidth,
        height: Math.max(260, regionY)
    };
}

function simplifySemanticMapPolyline(points) {
    const clean = [];
    points.forEach(point => {
        const normalized = { x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 };
        const previous = clean[clean.length - 1];
        if (!previous || previous.x !== normalized.x || previous.y !== normalized.y) clean.push(normalized);
    });
    for (let index = clean.length - 2; index > 0; index--) {
        const before = clean[index - 1];
        const current = clean[index];
        const after = clean[index + 1];
        if ((before.x === current.x && current.x === after.x)
            || (before.y === current.y && current.y === after.y)) {
            clean.splice(index, 1);
        }
    }
    return clean;
}

function semanticMapBoundaryPoint(position, toward) {
    const dx = toward.x - position.x;
    const dy = toward.y - position.y;
    const halfWidth = Math.max(1, position.width / 2);
    const halfHeight = Math.max(1, position.height / 2);
    if (Math.abs(dx) / halfWidth >= Math.abs(dy) / halfHeight) {
        return { x: position.x + Math.sign(dx || 1) * halfWidth, y: position.y };
    }
    return { x: position.x, y: position.y + Math.sign(dy || 1) * halfHeight };
}

function semanticMapRoundedPath(points, radius = 13) {
    const clean = simplifySemanticMapPolyline(points);
    if (clean.length < 2) return '';
    let path = `M ${clean[0].x} ${clean[0].y}`;
    for (let index = 1; index < clean.length - 1; index++) {
        const previous = clean[index - 1];
        const corner = clean[index];
        const next = clean[index + 1];
        const incoming = Math.hypot(corner.x - previous.x, corner.y - previous.y);
        const outgoing = Math.hypot(next.x - corner.x, next.y - corner.y);
        const bend = Math.min(radius, incoming / 2, outgoing / 2);
        const before = {
            x: corner.x - Math.sign(corner.x - previous.x) * bend,
            y: corner.y - Math.sign(corner.y - previous.y) * bend
        };
        const after = {
            x: corner.x + Math.sign(next.x - corner.x) * bend,
            y: corner.y + Math.sign(next.y - corner.y) * bend
        };
        path += ` L ${before.x} ${before.y} Q ${corner.x} ${corner.y} ${after.x} ${after.y}`;
    }
    const end = clean[clean.length - 1];
    return `${path} L ${end.x} ${end.y}`;
}

function semanticMapSegmentIntersection(a, b, rect) {
    const epsilon = 0.5;
    if (Math.abs(a.y - b.y) < epsilon) {
        const left = Math.min(a.x, b.x);
        const right = Math.max(a.x, b.x);
        return a.y >= rect.top && a.y <= rect.bottom && right >= rect.left && left <= rect.right;
    }
    if (Math.abs(a.x - b.x) < epsilon) {
        const top = Math.min(a.y, b.y);
        const bottom = Math.max(a.y, b.y);
        return a.x >= rect.left && a.x <= rect.right && bottom >= rect.top && top <= rect.bottom;
    }
    return false;
}

function routeSemanticMapEdges(graph, layout) {
    const cellSize = 180;
    const obstacles = [];
    graph.nodes.forEach(node => {
        const position = layout.positions.get(node.id);
        if (!position) return;
        const padding = node.type === 'room' ? 7 : 11;
        obstacles.push({
            id: node.id,
            kind: 'node',
            left: position.x - position.width / 2 - padding,
            right: position.x + position.width / 2 + padding,
            top: position.y - position.height / 2 - padding,
            bottom: position.y + position.height / 2 + padding
        });
    });
    layout.clusterBoxes.forEach(box => {
        obstacles.push({
            id: box.id,
            kind: 'cluster',
            left: box.x - 9,
            right: box.x + box.width + 9,
            top: box.y - 9,
            bottom: box.y + box.height + 9
        });
    });

    const obstacleGrid = new Map();
    obstacles.forEach((obstacle, obstacleIndex) => {
        const minX = Math.floor(obstacle.left / cellSize);
        const maxX = Math.floor(obstacle.right / cellSize);
        const minY = Math.floor(obstacle.top / cellSize);
        const maxY = Math.floor(obstacle.bottom / cellSize);
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                const key = `${x}:${y}`;
                if (!obstacleGrid.has(key)) obstacleGrid.set(key, []);
                obstacleGrid.get(key).push(obstacleIndex);
            }
        }
    });
    const obstaclesForSegment = (a, b) => {
        const minX = Math.floor((Math.min(a.x, b.x) - 2) / cellSize);
        const maxX = Math.floor((Math.max(a.x, b.x) + 2) / cellSize);
        const minY = Math.floor((Math.min(a.y, b.y) - 2) / cellSize);
        const maxY = Math.floor((Math.max(a.y, b.y) + 2) / cellSize);
        const indexes = new Set();
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                (obstacleGrid.get(`${x}:${y}`) || []).forEach(index => indexes.add(index));
            }
        }
        return [...indexes].map(index => obstacles[index]);
    };
    const hashEdge = edge => {
        const text = `${edge.sourceId}>${edge.targetId}`;
        let hash = 0;
        for (let index = 0; index < text.length; index++) hash = (Math.imul(hash, 31) + text.charCodeAt(index)) | 0;
        return Math.abs(hash);
    };
    const detailedOverlapRouting = graph.displayEdges.length <= 1200;
    const usedSegments = [];
    const orderedEdges = [...graph.displayEdges].sort((a, b) =>
        Number(!!a.internalParentId) - Number(!!b.internalParentId)
        || `${a.sourceId}|${a.targetId}`.localeCompare(`${b.sourceId}|${b.targetId}`));
    const routes = [];

    orderedEdges.forEach(edge => {
        const from = layout.positions.get(edge.sourceId);
        const to = layout.positions.get(edge.targetId);
        if (!from || !to) return;
        const lane = ((hashEdge(edge) % 9) - 4) * 10;
        const midX = Math.max(16, Math.min(layout.width - 16, (from.x + to.x) / 2 + lane));
        const midY = Math.max(16, Math.min(layout.height - 16, (from.y + to.y) / 2 + lane));
        const top = Math.max(16, Math.min(from.y, to.y) - 34 - Math.abs(lane));
        const bottom = Math.min(layout.height - 16, Math.max(from.y, to.y) + 34 + Math.abs(lane));
        const left = Math.max(16, Math.min(from.x, to.x) - 34 - Math.abs(lane));
        const right = Math.min(layout.width - 16, Math.max(from.x, to.x) + 34 + Math.abs(lane));
        const candidates = [
            [{ x: from.x, y: from.y }, { x: to.x, y: from.y }, { x: to.x, y: to.y }],
            [{ x: from.x, y: from.y }, { x: from.x, y: to.y }, { x: to.x, y: to.y }],
            [{ x: from.x, y: from.y }, { x: midX, y: from.y }, { x: midX, y: to.y }, { x: to.x, y: to.y }],
            [{ x: from.x, y: from.y }, { x: from.x, y: midY }, { x: to.x, y: midY }, { x: to.x, y: to.y }],
            [{ x: from.x, y: from.y }, { x: from.x, y: top }, { x: to.x, y: top }, { x: to.x, y: to.y }],
            [{ x: from.x, y: from.y }, { x: from.x, y: bottom }, { x: to.x, y: bottom }, { x: to.x, y: to.y }],
            [{ x: from.x, y: from.y }, { x: left, y: from.y }, { x: left, y: to.y }, { x: to.x, y: to.y }],
            [{ x: from.x, y: from.y }, { x: right, y: from.y }, { x: right, y: to.y }, { x: to.x, y: to.y }],
            [{ x: from.x, y: from.y }, { x: from.x, y: 16 }, { x: to.x, y: 16 }, { x: to.x, y: to.y }],
            [{ x: from.x, y: from.y }, { x: from.x, y: layout.height - 16 }, { x: to.x, y: layout.height - 16 }, { x: to.x, y: to.y }],
            [{ x: from.x, y: from.y }, { x: 16, y: from.y }, { x: 16, y: to.y }, { x: to.x, y: to.y }],
            [{ x: from.x, y: from.y }, { x: layout.width - 16, y: from.y }, { x: layout.width - 16, y: to.y }, { x: to.x, y: to.y }]
        ];
        if (Math.abs(from.y - to.y) < 1 || Math.abs(from.x - to.x) < 1) {
            candidates.unshift([{ x: from.x, y: from.y }, { x: to.x, y: to.y }]);
        }
        const sourceContainer = getWorldMapContainerId(graph.nodeById.get(edge.sourceId), graph.nodeById);
        const targetContainer = getWorldMapContainerId(graph.nodeById.get(edge.targetId), graph.nodeById);
        const ignoredObstacles = new Set([edge.sourceId, edge.targetId, sourceContainer, targetContainer].filter(Boolean));
        let best = null;
        candidates.forEach((candidate, candidateIndex) => {
            let points = simplifySemanticMapPolyline(candidate);
            if (points.length < 2) return;
            points[0] = semanticMapBoundaryPoint(from, points[1]);
            points[points.length - 1] = semanticMapBoundaryPoint(to, points[points.length - 2]);
            points = simplifySemanticMapPolyline(points);
            let score = (points.length - 2) * 7 + candidateIndex * 0.01;
            let collisions = 0;
            const segments = [];
            for (let index = 1; index < points.length; index++) {
                const a = points[index - 1];
                const b = points[index];
                const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
                score += length * 0.002;
                obstaclesForSegment(a, b).forEach(obstacle => {
                    if (ignoredObstacles.has(obstacle.id)) return;
                    if (semanticMapSegmentIntersection(a, b, obstacle)) {
                        collisions++;
                        score += obstacle.kind === 'cluster' ? 16000 : 9000;
                    }
                });
                if (detailedOverlapRouting) {
                    usedSegments.forEach(existing => {
                        const currentHorizontal = a.y === b.y;
                        const existingHorizontal = existing.a.y === existing.b.y;
                        if (currentHorizontal && existingHorizontal && a.y === existing.a.y) {
                            const overlap = Math.min(Math.max(a.x, b.x), Math.max(existing.a.x, existing.b.x))
                                - Math.max(Math.min(a.x, b.x), Math.min(existing.a.x, existing.b.x));
                            if (overlap > 0) score += 500 + overlap;
                        } else if (!currentHorizontal && !existingHorizontal && a.x === existing.a.x) {
                            const overlap = Math.min(Math.max(a.y, b.y), Math.max(existing.a.y, existing.b.y))
                                - Math.max(Math.min(a.y, b.y), Math.min(existing.a.y, existing.b.y));
                            if (overlap > 0) score += 500 + overlap;
                        } else if (currentHorizontal !== existingHorizontal) {
                            const horizontalSegment = currentHorizontal ? { a, b } : existing;
                            const verticalSegment = currentHorizontal ? existing : { a, b };
                            const crosses = verticalSegment.a.x > Math.min(horizontalSegment.a.x, horizontalSegment.b.x)
                                && verticalSegment.a.x < Math.max(horizontalSegment.a.x, horizontalSegment.b.x)
                                && horizontalSegment.a.y > Math.min(verticalSegment.a.y, verticalSegment.b.y)
                                && horizontalSegment.a.y < Math.max(verticalSegment.a.y, verticalSegment.b.y);
                            if (crosses) score += 45;
                        }
                    });
                }
                segments.push({ a, b });
            }
            if (!best || score < best.score) best = { points, segments, score, collisions };
        });
        if (!best) return;
        usedSegments.push(...best.segments);
        const middleIndex = Math.floor((best.points.length - 1) / 2);
        const labelStart = best.points[middleIndex];
        const labelEnd = best.points[Math.min(best.points.length - 1, middleIndex + 1)];
        routes.push({
            edge,
            points: best.points,
            d: semanticMapRoundedPath(best.points),
            collisions: best.collisions,
            labelPoint: {
                x: (labelStart.x + labelEnd.x) / 2,
                y: (labelStart.y + labelEnd.y) / 2
            }
        });
    });
    return routes;
}

function wrapWorldMapLabel(label, max = 20) {
    const words = String(label || 'Unnamed').split(/\s+/);
    if (String(label || '').length <= max) return [String(label || 'Unnamed')];
    const lines = ['', ''];
    words.forEach(word => {
        const index = (!lines[0] || `${lines[0]} ${word}`.length <= max) ? 0 : 1;
        lines[index] = `${lines[index]} ${word}`.trim();
    });
    if (lines[1].length > max + 6) lines[1] = `${lines[1].slice(0, max + 3).trim()}…`;
    return lines.filter(Boolean);
}

function focusWorldLocationCard(locationId) {
    // Search directly for the selected map node so paging cannot hide it.
    worldStudioListState.locations.query = locationId;
    worldStudioListState.locations.page = 0;
    const tabButton = document.querySelector('.world-studio-tab[data-tab="w-locations"]');
    if (tabButton) tabButton.click();
    setTimeout(() => {
        const card = document.getElementById(`loc-card-${locationId}`);
        if (!card) return;
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.style.outline = '2px solid var(--red)';
        setTimeout(() => { card.style.outline = ''; }, 1800);
    }, 100);
}

function renderSemanticWorldMap(container, world, options = {}) {
    if (!container || !world) return null;
    const ns = 'http://www.w3.org/2000/svg';
    const mode = options.mode || container.dataset.mapMode || 'map';
    const graph = buildSemanticWorldGraph(world);
    const layout = layoutSemanticWorldGraph(graph, options.currentLocationId || '');
    container.replaceChildren();
    container.classList.add('semantic-map-host');
    container.classList.toggle('is-cartographic', mode === 'map');
    container.dataset.mapMode = mode;

    const toolbar = document.createElement('div');
    toolbar.className = 'semantic-map-toolbar';
    const summary = document.createElement('div');
    summary.className = 'semantic-map-summary';
    const hiddenLinks = Math.max(0, graph.collapsedConnectionCount - graph.displayEdges.length);
    summary.textContent = `${graph.nodes.length} location${graph.nodes.length === 1 ? '' : 's'}`
        + ` · ${layout.regionBoxes.length} region${layout.regionBoxes.length === 1 ? '' : 's'}`
        + ` · ${graph.displayEdges.length} readable path${graph.displayEdges.length === 1 ? '' : 's'}`
        + (hiddenLinks ? ` · ${hiddenLinks} redundant links simplified` : '');
    const legend = document.createElement('div');
    legend.className = 'semantic-map-legend';
    const typeOrder = ['region', 'route', 'building', 'outdoor', 'room', 'area'];
    const presentTypes = new Set(graph.nodes.map(node => node.type));
    typeOrder.filter(type => presentTypes.has(type)).forEach(type => {
        const item = document.createElement('span');
        item.className = `semantic-map-legend-item type-${type}`;
        item.textContent = formatWorldMapType(type);
        legend.appendChild(item);
    });
    const controls = document.createElement('div');
    controls.className = 'semantic-map-toolbar-controls';
    const modeControls = document.createElement('div');
    modeControls.className = 'semantic-map-modes';
    [['map', 'Map'], ['graph', 'Graph']].forEach(([targetMode, label]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tool-btn semantic-map-mode-btn';
        button.textContent = label;
        button.setAttribute('aria-pressed', String(mode === targetMode));
        button.setAttribute('aria-label', `Show ${label.toLowerCase()} view`);
        button.onclick = () => {
            if (targetMode === mode) return;
            renderSemanticWorldMap(container, world, { ...options, mode: targetMode });
        };
        modeControls.appendChild(button);
    });
    controls.append(modeControls, legend);
    toolbar.append(summary, controls);

    const detail = document.createElement('div');
    detail.className = 'semantic-map-detail';
    if (graph.unresolved.length) {
        detail.textContent = `⚠ ${graph.unresolved.length} exit${graph.unresolved.length === 1 ? '' : 's'} point to missing locations.`;
        detail.classList.add('has-warning');
    } else {
        detail.textContent = options.architect
            ? `${mode === 'map' ? 'Paths route around places. ' : ''}Select a location to edit its map role, parent, floor, or exits.`
            : `${mode === 'map' ? 'Paths route around places. ' : ''}Select a location for details.`;
    }

    const scroll = document.createElement('div');
    scroll.className = `semantic-map-scroll mode-${mode}`;
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Semantic map of ${world.name || 'world'}`);
    svg.setAttribute('class', `semantic-world-svg${mode === 'map' ? ' is-cartographic' : ''}`);
    svg.style.width = `${layout.width}px`;
    svg.style.height = `${layout.height}px`;

    const defs = document.createElementNS(ns, 'defs');
    const marker = document.createElementNS(ns, 'marker');
    marker.setAttribute('id', options.architect ? 'semantic-arrow-architect' : 'semantic-arrow-play');
    marker.setAttribute('markerWidth', '9');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '8');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');
    const arrow = document.createElementNS(ns, 'path');
    arrow.setAttribute('d', 'M0,0 L9,3.5 L0,7 Z');
    arrow.setAttribute('fill', 'var(--red)');
    marker.appendChild(arrow);
    defs.appendChild(marker);
    svg.appendChild(defs);

    layout.regionBoxes.forEach(box => {
        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('class', 'semantic-region-box');
        rect.setAttribute('x', box.x);
        rect.setAttribute('y', box.y);
        rect.setAttribute('width', box.width);
        rect.setAttribute('height', box.height);
        rect.setAttribute('rx', mode === 'map' ? '10' : '18');
        const label = document.createElementNS(ns, 'text');
        label.setAttribute('class', 'semantic-region-label');
        label.setAttribute('x', box.x + 18);
        label.setAttribute('y', box.y + 27);
        label.textContent = box.label;
        svg.append(rect, label);
    });
    layout.clusterBoxes.forEach(box => {
        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('class', `semantic-cluster-box type-${box.type}`);
        rect.setAttribute('x', box.x);
        rect.setAttribute('y', box.y);
        rect.setAttribute('width', box.width);
        rect.setAttribute('height', box.height);
        rect.setAttribute('rx', mode === 'map' && box.type === 'building' ? '4' : '14');
        svg.appendChild(rect);
    });

    const routedEdges = mode === 'map' ? routeSemanticMapEdges(graph, layout) : null;
    const edgesToRender = routedEdges || graph.displayEdges.map(edge => ({ edge }));
    edgesToRender.forEach(route => {
        const edge = route.edge;
        const from = layout.positions.get(edge.sourceId);
        const to = layout.positions.get(edge.targetId);
        if (!from || !to) return;
        let d = route.d;
        if (!d) {
            const sameRow = Math.abs(to.y - from.y) < 24;
            if (sameRow) {
                const fromX = from.x + (to.x > from.x ? from.width / 2 : -from.width / 2);
                const toX = to.x + (to.x > from.x ? -to.width / 2 : to.width / 2);
                const bend = Math.max(24, Math.abs(toX - fromX) * 0.35);
                d = `M ${fromX} ${from.y} C ${fromX + Math.sign(toX - fromX) * bend} ${from.y}, ${toX - Math.sign(toX - fromX) * bend} ${to.y}, ${toX} ${to.y}`;
            } else {
                const down = to.y > from.y;
                const fromY = from.y + (down ? from.height / 2 : -from.height / 2);
                const toY = to.y + (down ? -to.height / 2 : to.height / 2);
                const midY = (fromY + toY) / 2;
                d = `M ${from.x} ${fromY} V ${midY} H ${to.x} V ${toY}`;
            }
        }
        const sourceType = graph.nodeById.get(edge.sourceId)?.type;
        const targetType = graph.nodeById.get(edge.targetId)?.type;
        const isRoad = sourceType === 'route' || targetType === 'route';
        if (mode === 'map' && !edge.internalParentId) {
            const casing = document.createElementNS(ns, 'path');
            casing.setAttribute('class', `cartographic-map-edge-casing ${isRoad ? 'is-road' : 'is-trail'}`);
            casing.setAttribute('d', d);
            svg.appendChild(casing);
        }
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('class', `semantic-map-edge${mode === 'map' ? ` cartographic-map-edge ${isRoad ? 'is-road' : 'is-trail'}` : ''}${edge.isOneWay ? ' is-one-way' : ''}${edge.internalParentId ? ' is-internal' : ''}`);
        path.setAttribute('d', d);
        if (edge.isOneWay) path.setAttribute('marker-end', `url(#${options.architect ? 'semantic-arrow-architect' : 'semantic-arrow-play'})`);
        const title = document.createElementNS(ns, 'title');
        const sourceName = graph.nodeById.get(edge.sourceId)?.location.name || edge.sourceId;
        const targetName = graph.nodeById.get(edge.targetId)?.location.name || edge.targetId;
        title.textContent = `${sourceName} ${edge.isOneWay ? '→' : '↔'} ${targetName}${edge.travelTime ? ` · ${edge.travelTime} min` : ''}${edge.count > 2 ? ` · ${edge.count} source links combined` : ''}`;
        path.appendChild(title);
        svg.appendChild(path);
        if (edge.travelTime || edge.count > 2) {
            const label = document.createElementNS(ns, 'text');
            label.setAttribute('class', 'semantic-edge-label');
            label.setAttribute('x', route.labelPoint?.x ?? (from.x + to.x) / 2);
            label.setAttribute('y', (route.labelPoint?.y ?? (from.y + to.y) / 2) - 5);
            label.textContent = edge.travelTime ? `${edge.travelTime}m` : `${edge.count} links`;
            svg.appendChild(label);
        }
    });

    if (mode === 'map') {
        const compass = document.createElementNS(ns, 'g');
        compass.setAttribute('class', 'semantic-map-compass');
        compass.setAttribute('transform', `translate(${layout.width - 54} 54)`);
        compass.setAttribute('aria-hidden', 'true');
        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('r', '22');
        const vertical = document.createElementNS(ns, 'path');
        vertical.setAttribute('d', 'M 0 -14 V 14 M -4 -7 L 0 -15 L 4 -7');
        const horizontal = document.createElementNS(ns, 'path');
        horizontal.setAttribute('d', 'M -14 0 H 14');
        const north = document.createElementNS(ns, 'text');
        north.setAttribute('x', '0');
        north.setAttribute('y', '-27');
        north.setAttribute('text-anchor', 'middle');
        north.textContent = 'N';
        compass.append(circle, vertical, horizontal, north);
        svg.appendChild(compass);
    }

    graph.nodes.forEach(node => {
        const pos = layout.positions.get(node.id);
        if (!pos) return;
        const group = document.createElementNS(ns, 'g');
        group.setAttribute('class', `semantic-map-node type-${node.type}${node.id === options.currentLocationId ? ' is-current' : ''}`);
        group.setAttribute('role', 'button');
        group.setAttribute('tabindex', '0');
        group.setAttribute('aria-label', `${node.location.name || 'Unnamed'}, ${formatWorldMapType(node.type)}`);
        group.dataset.id = node.id;
        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('x', pos.x - pos.width / 2);
        rect.setAttribute('y', pos.y - pos.height / 2);
        rect.setAttribute('width', pos.width);
        rect.setAttribute('height', pos.height);
        rect.setAttribute('rx', node.type === 'route' || node.type === 'outdoor'
            ? String(pos.height / 2)
            : (mode === 'map' ? (node.type === 'room' ? '3' : '5') : '10'));
        rect.setAttribute('class', 'semantic-node-shape');
        group.appendChild(rect);

        const lines = wrapWorldMapLabel(node.location.name, node.parentId ? 18 : 22);
        const baseY = pos.y - ((lines.length - 1) * 8) + (node.floor ? -3 : 3);
        const text = document.createElementNS(ns, 'text');
        text.setAttribute('class', 'semantic-node-label');
        text.setAttribute('x', pos.x);
        text.setAttribute('y', baseY);
        text.setAttribute('text-anchor', 'middle');
        lines.forEach((line, index) => {
            const span = document.createElementNS(ns, 'tspan');
            span.setAttribute('x', pos.x);
            span.setAttribute('dy', index === 0 ? '0' : '15');
            span.textContent = line;
            text.appendChild(span);
        });
        group.appendChild(text);
        if (node.floor) {
            const floor = document.createElementNS(ns, 'text');
            floor.setAttribute('class', 'semantic-node-meta');
            floor.setAttribute('x', pos.x);
            floor.setAttribute('y', pos.y + pos.height / 2 - 6);
            floor.setAttribute('text-anchor', 'middle');
            floor.textContent = node.floor;
            group.appendChild(floor);
        }
        const title = document.createElementNS(ns, 'title');
        title.textContent = `${formatWorldMapType(node.type)}${node.floor ? ` · ${node.floor}` : ''}\n${node.location.description || ''}`;
        group.appendChild(title);

        const selectNode = () => {
            const exitNames = (node.location.exits || []).map(getExitTargetName).filter(Boolean);
            detail.classList.remove('has-warning');
            detail.textContent = `${node.location.name || 'Unnamed'} · ${formatWorldMapType(node.type)}`
                + (node.floor ? ` · ${node.floor}` : '')
                + (node.parentId ? ` · inside ${graph.nodeById.get(node.parentId)?.location.name || node.parentId}` : '')
                + (exitNames.length ? ` · connects to ${exitNames.slice(0, 6).join(', ')}${exitNames.length > 6 ? '…' : ''}` : ' · no exits');
            container.querySelectorAll('.semantic-map-node.is-selected').forEach(item => item.classList.remove('is-selected'));
            group.classList.add('is-selected');
            if (options.onNodeSelect) options.onNodeSelect(node);
        };
        group.onclick = selectNode;
        group.onkeydown = event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectNode();
            }
        };
        svg.appendChild(group);
    });

    scroll.appendChild(svg);
    container.append(toolbar, detail, scroll);
    const currentPosition = layout.positions.get(options.currentLocationId);
    if (currentPosition) {
        requestAnimationFrame(() => {
            scroll.scrollLeft = Math.max(0, currentPosition.x - scroll.clientWidth / 2 + 12);
            scroll.scrollTop = Math.max(0, currentPosition.y - scroll.clientHeight / 2 + 12);
        });
    }
    return { graph, layout, svg, routes: routedEdges || [] };
}

function renderWorldArchitectMap() {
    const world = ExperimentalWorldsState.editingWorld;
    const container = document.getElementById('world-visual-canvas');
    if (!world || !container) return;
    renderSemanticWorldMap(container, world, {
        architect: true,
        onNodeSelect: node => focusWorldLocationCard(node.id)
    });
}

function worldEntityDirectoryGroups(world, entities, groupBy, mode = 'people') {
    const groups = new Map();
    const add = (label, entity) => {
        const key = label || 'Unassigned';
        if (!groups.has(key)) groups.set(key, []);
        if (!groups.get(key).includes(entity)) groups.get(key).push(entity);
    };
    entities.forEach(entity => {
        if (groupBy === 'all') return add(mode === 'items' ? 'All items' : 'All people', entity);
        if (groupBy === 'depth') return add(`${entity.simulationDepth || 'background'} cast`, entity);
        if (groupBy === 'location') return add(getLocationRef(world, entity.homeLocation || entity.startLocation)?.name || (mode === 'items' ? 'Unplaced items' : 'No linked location'), entity);
        if (groupBy === 'organization') {
            const memberships = (entity.groupIds || []).map(id => world.groups.find(group => group.id === id)).filter(group => group && group.type !== 'household');
            const faction = (world.factions || []).find(item => item.id === entity.factionId);
            if (memberships.length) memberships.forEach(group => add(group.name, entity));
            else if (faction) add(faction.name, entity);
            else add('Unaffiliated', entity);
            return;
        }
        const household = world.groups.find(group => group.id === entity.householdId && group.type === 'household');
        if (household) return add(household.name, entity);
        const home = getLocationRef(world, entity.homeLocation);
        add(home ? `${home.name} household` : 'No household', entity);
    });
    return groups;
}

function renderWorldEntityDirectory(world, container, mode = 'people') {
    ensureWorldDirectoryState(world);
    const isItems = mode === 'items';
    const view = worldStudioListState[mode];
    const query = view.query.trim().toLowerCase();
    const filter = view.filter || 'all';
    const groupBy = view.groupBy || (isItems ? 'location' : 'household');
    const source = world.entities.filter(entity => isItems ? ['item', 'vehicle'].includes(entity.type) : entity.type === 'npc');
    const matches = source.filter(entity => {
        const linkedGroups = (entity.groupIds || []).map(id => world.groups.find(group => group.id === id)?.name || '').join(' ');
        const search = [entity.name, entity.id, entity.type, entity.description, entity.persona, entity.goal, linkedGroups, ...(entity.tags || [])].join(' ').toLowerCase();
        return (!query || search.includes(query))
            && (filter === 'all' || entity.simulationDepth === filter);
    });
    const directory = document.createElement('div');
    directory.className = 'world-directory';
    directory.innerHTML = `<div class="world-directory-toolbar">
        <input type="search" class="form-input world-directory-search" value="${escapeHTML(view.query)}" placeholder="${isItems ? 'Search item names, descriptions, locations or tags…' : 'Search names, personas, groups, goals or tags…'}" aria-label="Search ${isItems ? 'items' : 'people'}">
        ${isItems ? '' : `<select class="form-select world-directory-filter" aria-label="Filter people"><option value="all">All people</option><option value="core" ${filter === 'core' ? 'selected' : ''}>Core cast</option><option value="recurring" ${filter === 'recurring' ? 'selected' : ''}>Recurring</option><option value="background" ${filter === 'background' ? 'selected' : ''}>Background</option></select>`}
        <select class="form-select world-directory-group" aria-label="Group ${isItems ? 'items' : 'people'} by">${isItems ? `<option value="location" ${groupBy === 'location' ? 'selected' : ''}>Group: location</option>` : `<option value="household" ${groupBy === 'household' ? 'selected' : ''}>Group: households</option><option value="organization" ${groupBy === 'organization' ? 'selected' : ''}>Group: organizations</option><option value="location" ${groupBy === 'location' ? 'selected' : ''}>Group: home</option><option value="depth" ${groupBy === 'depth' ? 'selected' : ''}>Group: simulation depth</option>`}<option value="all" ${groupBy === 'all' ? 'selected' : ''}>No grouping</option></select>
        <span class="world-directory-summary">${matches.length} of ${source.length} ${isItems ? 'items' : 'people'}</span>
    </div>`;
    const grouped = worldEntityDirectoryGroups(world, matches, groupBy, mode);
    const groupEntries = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
    groupEntries.forEach(([label, entities], groupIndex) => {
        const section = document.createElement('details');
        section.className = 'world-directory-section';
        section.open = Boolean(query) || groupEntries.length <= 8 || groupIndex === 0;
        section.innerHTML = `<summary><strong>${escapeHTML(label.replace(/^./, char => char.toUpperCase()))}</strong><span>${entities.length} ${isItems ? 'item' : 'person'}${entities.length === 1 ? '' : 's'}</span></summary><div class="world-directory-grid"></div>`;
        const grid = section.querySelector('.world-directory-grid');
        entities.sort((a, b) => String(a.name).localeCompare(String(b.name))).forEach(entity => {
            const image = worldNpcPortraitSource(world, entity);
            const home = getLocationRef(world, entity.homeLocation || entity.startLocation);
            const depth = entity.simulationDepth || 'background';
            const card = document.createElement('button');
            card.type = 'button';
            card.className = `world-directory-card ${entity.type === 'npc' ? 'is-person' : ''}`;
            card.innerHTML = `<div class="world-directory-card-media" ${image ? `style="background-image:url('${cssUrl(image)}')"` : ''}>${image ? '' : escapeHTML((entity.name || '?').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase())}</div>
                <div class="world-directory-card-copy"><h3>${escapeHTML(entity.name || 'Unnamed record')}</h3>
                <p>${escapeHTML(isItems ? (entity.description || 'No item description yet.') : (entity.persona || entity.description || 'No personality or description yet.'))}</p>
                <div class="world-directory-badges"><span class="world-directory-badge ${depth === 'core' ? 'is-core' : ''}">${escapeHTML(isItems ? 'item' : depth)}</span>${home ? `<span class="world-directory-badge">⌂ ${escapeHTML(home.name)}</span>` : ''}${!isItems && !entity.persona ? '<span class="world-directory-badge is-warning">persona missing</span>' : ''}</div></div>`;
            card.onclick = () => openWorldRecordInspector('entity', entity.id, '', mode);
            grid.appendChild(card);
        });
        directory.appendChild(section);
    });
    if (!matches.length) directory.insertAdjacentHTML('beforeend', `<div class="world-directory-empty">No ${isItems ? 'items' : 'people'} match these filters.</div>`);
    const search = directory.querySelector('.world-directory-search');
    search.oninput = event => {
        view.query = event.target.value;
        if (isItems) renderWorldItems(); else renderWorldEntities();
        requestAnimationFrame(() => {
            const next = container.querySelector('.world-directory-search');
            if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
        });
    };
    const filterControl = directory.querySelector('.world-directory-filter');
    if (filterControl) filterControl.onchange = event => { view.filter = event.target.value; if (isItems) renderWorldItems(); else renderWorldEntities(); };
    directory.querySelector('.world-directory-group').onchange = event => { view.groupBy = event.target.value; if (isItems) renderWorldItems(); else renderWorldEntities(); };
    container.appendChild(directory);
}

function ensureWorldTraversalConfig(world) {
    const config = window.ExperimentalWorldsSidecarTraversal?.normalizeWorldTraversal?.(world);
    if (config) return config;
    if (!world.traversalConfig || typeof world.traversalConfig !== 'object') {
        world.traversalConfig = { schemaVersion: 1, methods: [] };
    }
    if (!Array.isArray(world.traversalConfig.methods)) world.traversalConfig.methods = [];
    return world.traversalConfig;
}

function addWorldTraversalMethod() {
    const world = ExperimentalWorldsState.editingWorld;
    if (!world) return;
    const config = ensureWorldTraversalConfig(world);
    config.methods.push({
        id: `traversal_${Date.now().toString(36)}`,
        name: 'New traversal method', enabled: true, coverageType: 'point_to_point',
        exclusions: [], routeStops: [], tags: [], provider: '', notes: ''
    });
    renderWorldTravel();
}

function renderWorldTravel() {
    const world = ExperimentalWorldsState.editingWorld;
    if (!world) return;
    const methodsHost = document.getElementById('w-traversal-methods-list');
    const vehiclesHost = document.getElementById('w-vehicles-list');
    const journeysHost = document.getElementById('w-journeys-list');
    const config = ensureWorldTraversalConfig(world);
    const locations = Array.isArray(world.locations) ? world.locations : [];
    const locationName = id => locations.find(location => location.id === id)?.name || id || '—';
    const lines = value => String(value || '').split('\n').map(item => item.trim()).filter(Boolean);

    if (methodsHost) {
        methodsHost.innerHTML = config.methods.length ? config.methods.map((method, index) => `
            <div class="world-inspector-section" data-traversal-index="${index}" style="padding:14px; border:1px solid var(--border); border-radius:10px;">
                <div style="display:grid; grid-template-columns:minmax(0,1fr) 180px auto auto; gap:8px; align-items:center;">
                    <input class="form-input traversal-name" value="${escapeHTML(method.name)}" placeholder="Train, walking, Uber…">
                    <select class="form-select traversal-type"><option value="point_to_point" ${method.coverageType === 'point_to_point' ? 'selected' : ''}>Point-to-point</option><option value="route_based" ${method.coverageType === 'route_based' ? 'selected' : ''}>Route-based</option></select>
                    <label class="vh-test-check"><input type="checkbox" class="traversal-enabled" ${method.enabled ? 'checked' : ''}> Enabled</label>
                    <button class="tool-btn tool-btn-danger traversal-delete" type="button">Delete</button>
                </div>
                <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin-top:10px;">
                    <label><span class="form-label">Provider / mode tag</span><input class="form-input traversal-provider" value="${escapeHTML(method.provider || '')}" placeholder="Metro, rideshare, bicycle…"></label>
                    <label><span class="form-label">Tags</span><input class="form-input traversal-tags" value="${escapeHTML((method.tags || []).join(', '))}" placeholder="public, accessible, fast"></label>
                    <label><span class="form-label">Exclusions</span><textarea class="form-textarea traversal-exclusions" rows="2" placeholder="One location ID or name per line">${escapeHTML((method.exclusions || []).join('\n'))}</textarea></label>
                    <label class="traversal-route-wrap ${method.coverageType === 'route_based' ? '' : 'hidden'}"><span class="form-label">Ordered route stops</span><textarea class="form-textarea traversal-stops" rows="2" placeholder="One stop ID or name per line">${escapeHTML((method.routeStops || []).join('\n'))}</textarea></label>
                </div>
                <label style="display:block; margin-top:10px;"><span class="form-label">Author notes</span><textarea class="form-textarea traversal-notes" rows="2" placeholder="Legality, accessibility, or operating notes">${escapeHTML(method.notes || '')}</textarea></label>
                <p class="form-hint" style="margin:8px 0 0;">${method.coverageType === 'route_based' ? 'Default-deny: only the ordered stops above are traversable.' : 'Default-allow across eligible external spatial scopes, subject to exclusions.'}</p>
            </div>`).join('') : '<div class="form-hint">No traversal methods yet. Add one to author trains, buses, walking, bicycles, elevators, or rideshare coverage.</div>';
        methodsHost.querySelectorAll('[data-traversal-index]').forEach(card => {
            const index = Number(card.dataset.traversalIndex);
            const method = config.methods[index];
            const update = () => {
                method.name = card.querySelector('.traversal-name').value.trim().slice(0, 140) || `Traversal ${index + 1}`;
                method.coverageType = card.querySelector('.traversal-type').value === 'route_based' ? 'route_based' : 'point_to_point';
                method.enabled = card.querySelector('.traversal-enabled').checked;
                method.provider = card.querySelector('.traversal-provider').value.trim().slice(0, 140);
                method.tags = [...new Set(card.querySelector('.traversal-tags').value.split(',').map(value => value.trim()).filter(Boolean))].slice(0, 32);
                method.exclusions = lines(card.querySelector('.traversal-exclusions').value).slice(0, 100);
                const stopsInput = card.querySelector('.traversal-stops');
                method.routeStops = method.coverageType === 'route_based' && stopsInput ? lines(stopsInput.value).slice(0, 500) : [];
                method.notes = card.querySelector('.traversal-notes').value.trim().slice(0, 1200);
                card.querySelector('.traversal-route-wrap').classList.toggle('hidden', method.coverageType !== 'route_based');
                updateWorldTokenCount();
            };
            card.querySelectorAll('input, textarea, select').forEach(input => input.addEventListener(input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input', update));
            card.querySelector('.traversal-delete').onclick = () => { config.methods.splice(index, 1); renderWorldTravel(); };
        });
    }
    const vehicles = (world.entities || []).filter(entity => entity.type === 'vehicle');
    if (vehiclesHost) {
        vehiclesHost.innerHTML = vehicles.length ? vehicles.map((vehicle, index) => {
            const data = window.ExperimentalWorldsSidecarTraversal?.normalizeVehicle?.(vehicle) || vehicle.vehicle || {};
            const owner = (world.entities || []).find(entity => entity.id === data.ownerEntityId);
            return `<div class="world-inspector-section" data-vehicle-index="${index}" style="padding:14px; border:1px solid var(--border); border-radius:10px;">
                <div style="display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr) 180px; gap:8px; align-items:center;"><strong>${escapeHTML(vehicle.name || 'Unnamed vehicle')}</strong><span class="form-hint">${data.persistent === false ? 'Runtime/staged' : 'Persistent entity'}</span><span class="form-hint">Owner: ${escapeHTML(owner?.name || data.ownerEntityId || 'none')}</span></div>
                <div style="display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-top:10px;">
                    <label><span class="form-label">Parked anchor</span><select class="form-select vehicle-anchor"><option value="">No parked anchor</option>${locations.map(location => `<option value="${escapeHTML(location.id)}" ${data.parkedAnchorId === location.id ? 'selected' : ''}>${escapeHTML(location.name || location.id)}</option>`).join('')}</select></label>
                    <label><span class="form-label">Owner entity ID</span><input class="form-input vehicle-owner" value="${escapeHTML(data.ownerEntityId || '')}" placeholder="ent_…"></label>
                    <label><span class="form-label">Access entity IDs</span><input class="form-input vehicle-access" value="${escapeHTML((data.access || []).map(entry => entry.entityId || entry).join(', '))}" placeholder="comma separated"></label>
                </div>
                <div style="display:grid; grid-template-columns:minmax(0,1fr) 180px; gap:10px; margin-top:10px;">
                    <label><span class="form-label">Interior / runtime hint</span><textarea class="form-textarea vehicle-interior" rows="2">${escapeHTML(data.interiorHint || '')}</textarea></label>
                    <label><span class="form-label">Vehicle tags</span><input class="form-input vehicle-tags" value="${escapeHTML((data.tags || []).join(', '))}" placeholder="car, taxi, bicycle"></label>
                </div>
                <label class="vh-test-check" style="margin-top:8px;"><input type="checkbox" class="vehicle-persistent" ${data.persistent !== false ? 'checked' : ''}> Persistent vehicle (uncheck only for authored staged/runtime fixtures)</label>
            </div>`;
        }).join('') : '<div class="form-hint">No vehicle entities yet. Use Items &amp; Objects → + Vehicle to create one, then configure ownership and its parked anchor here.</div>';
        vehiclesHost.querySelectorAll('[data-vehicle-index]').forEach(card => {
            const vehicle = vehicles[Number(card.dataset.vehicleIndex)];
            const update = () => {
                const data = window.ExperimentalWorldsSidecarTraversal?.normalizeVehicle?.(vehicle) || (vehicle.vehicle = {});
                data.parkedAnchorId = card.querySelector('.vehicle-anchor').value;
                data.ownerEntityId = card.querySelector('.vehicle-owner').value.trim().slice(0, 160);
                data.access = card.querySelector('.vehicle-access').value.split(',').map(value => value.trim()).filter(Boolean).slice(0, 80).map(entityId => ({ entityId, role: entityId === data.ownerEntityId ? 'owner' : 'guest' }));
                if (data.ownerEntityId && !data.access.some(entry => entry.entityId === data.ownerEntityId)) data.access.unshift({ entityId: data.ownerEntityId, role: 'owner' });
                data.interiorHint = card.querySelector('.vehicle-interior').value.trim().slice(0, 1800);
                data.tags = [...new Set(card.querySelector('.vehicle-tags').value.split(',').map(value => value.trim()).filter(Boolean))].slice(0, 32);
                data.persistent = card.querySelector('.vehicle-persistent').checked;
                vehicle.startLocation = data.parkedAnchorId;
                updateWorldTokenCount();
            };
            card.querySelectorAll('input, textarea, select').forEach(input => input.addEventListener(input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input', update));
        });
    }
    const sessions = ExperimentalWorldsState.worldInstances?.[world.id]?.sessions || [];
    const journeys = sessions.flatMap(session => ((window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, session)?.traversalState?.journeys) || []).map(journey => ({ ...journey, sessionName: session.name || session.id }))).slice(-40).reverse();
    if (journeysHost) journeysHost.innerHTML = journeys.length ? journeys.map(journey => `<div style="padding:10px 12px; border:1px solid var(--border); border-radius:8px;"><strong>${escapeHTML(journey.status || 'prepared')}</strong> · ${escapeHTML(journey.sessionName)} · ${escapeHTML(journey.methodId || 'untyped journey')}<br><span class="form-hint">${escapeHTML(locationName(journey.originAnchorId))} → ${escapeHTML(locationName(journey.destinationAnchorId))} · occupants: ${escapeHTML((journey.occupants || []).join(', ') || 'none')} ${journey.runtimeContainer ? `· runtime ${escapeHTML(journey.runtimeContainer.kind || 'vehicle')}` : ''}</span></div>`).join('') : '<div class="form-hint">No journeys have been staged or completed in this world yet.</div>';
}

function renderWorldItems() {
    renderWorldEntities('items');
}

function renderWorldEntities(mode = 'people') {
    const world = ExperimentalWorldsState.editingWorld;
    if (!world) return;
    normalizeAuthoredWorld(world);   // a malformed relationship list must not break the panel
    const inspecting = worldRecordInspector.kind === 'entity' && worldRecordInspector.id;
    const activeMode = inspecting ? (worldRecordInspector.directory || (world.entities.find(entity => entity.id === worldRecordInspector.id)?.type === 'item' ? 'items' : 'people')) : mode;
    const container = inspecting ? document.getElementById('world-record-body') : document.getElementById(activeMode === 'items' ? 'w-items-list' : 'w-entities-list');
    container.innerHTML = '';
    if (!inspecting) {
        renderWorldEntityDirectory(world, container, activeMode);
        return;
    }
    const selected = world.entities.find(entity => entity.id === worldRecordInspector.id);
    if (!selected) return closeWorldRecordInspector();
    const pageData = { view: worldStudioListState[activeMode], filtered: [selected], pages: 1, items: [selected] };
    if (!pageData.items.length) {
        container.insertAdjacentHTML('beforeend', '<div class="form-hint" style="padding:20px;text-align:center">No entities match this search.</div>');
    }
    pageData.items.forEach(ent => {
        const idx = world.entities.indexOf(ent);
        const div = document.createElement('div');
        div.className = 'studio-card';
        div.style.padding = '16px';
        div.style.background = 'var(--surface2)';
        div.style.borderRadius = '12px';
        div.style.border = '1px solid var(--border)';

        div.innerHTML = `
            <div class="world-inspector-section" data-inspector-section="overview" style="display:flex; gap:12px; margin-bottom:12px; align-items:center;">
                <input type="text" class="form-input ent-name" style="flex:1" value="${escapeHTML(ent.name)}" placeholder="${ent.type === 'vehicle' ? 'Vehicle name' : ent.type === 'item' ? 'Item name' : 'Person name'}">
                <span class="mini-tag" style="padding:8px 12px;">${ent.type === 'vehicle' ? 'Vehicle' : ent.type === 'item' ? 'Object' : 'Person'}</span>
                ${ent.type === 'npc' ? `
                    <select class="form-select ent-simulation-depth" style="width:170px;" title="Controls simulation and context priority; every person keeps a persona.">
                        <option value="background" ${ent.simulationDepth === 'background' ? 'selected' : ''}>Background</option>
                        <option value="recurring" ${ent.simulationDepth === 'recurring' ? 'selected' : ''}>Recurring</option>
                        <option value="core" ${ent.simulationDepth === 'core' ? 'selected' : ''}>Core cast</option>
                    </select>
                ` : ''}
                <button class="tool-btn tool-btn-danger del-ent">✕</button>
            </div>

            <div style="display:flex; flex-direction:column; gap:12px;">
                <div class="world-inspector-section" data-inspector-section="overview">
                    <label class="form-label" style="font-size:0.75rem;">${ent.type === 'item' ? 'Description & purpose' : 'Appearance & public impression'}</label>
                    <textarea class="form-textarea ent-desc" rows="2" placeholder="${ent.type === 'item' ? 'What the object looks like, what it does and why it matters…' : 'What another person notices: appearance, role, visible condition and reputation…'}">${escapeHTML(ent.description)}</textarea>
                    ${ent.type === 'npc' ? `<label class="form-label" style="font-size:0.75rem; margin-top:10px;">Gender <span class="help-glyph" title="Stable dossier information used by visual generation and character context. Leave blank when the world has not established it; a name alone is not evidence.">?</span></label><input class="form-input ent-gender" value="${escapeHTML(ent.gender || ent.visuals?.portraitIdentityGuide?.gender || '')}" placeholder="woman, man, non-binary, or another authored description…" autocomplete="off">` : ''}
                    <label class="form-label" style="font-size:.72rem;margin-top:10px;">Search tags <span class="form-hint">(classification only—not relationships)</span></label>
                    <input class="form-input ent-tags" value="${escapeHTML((ent.tags || []).join(', '))}" placeholder="${ent.type === 'item' ? 'evidence, key, weapon, fragile…' : 'student, wealthy, guard, suspicious…'}">
                </div>

                ${ent.type === 'npc' ? `
                    <div class="world-media-editor world-inspector-section" data-inspector-section="visuals">
                        <div class="world-media-preview is-portrait" style="${worldNpcPortraitSource(world, ent) ? `background-image:url('${cssUrl(worldNpcPortraitSource(world, ent))}')` : ''}">
                            ${worldNpcPortraitSource(world, ent) ? '' : escapeHTML((ent.name || '?').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase())}
                        </div>
                        <div>
                            <label class="form-label" style="font-size:.75rem;">NPC Portrait</label>
                            <p class="form-hint" style="margin:0 0 8px;">Optional. Missing portraits use initials and never block play.</p>
                            <div class="world-media-actions">
                                <input class="ent-portrait-input" type="file" accept="image/*" hidden>
                                <button class="tool-btn ent-portrait-upload" type="button">Upload</button>
                                <button class="tool-btn ent-portrait-generate" type="button">✨ Generate</button>
                                <button class="tool-btn ent-outfit-manager" type="button" hidden>Outfits</button>
                                <button class="tool-btn ent-portrait-clear" type="button" ${ent.visuals?.portraitAssetId ? '' : 'disabled'}>Clear</button>
                            </div>
                        </div>
                        <div class="world-inline-outfits" data-entity-id="${escapeHTML(ent.id)}">
                            <div class="world-inline-outfits-head"><span class="form-label">Active outfits <span class="help-glyph" title="Select the outfit used for this character's next image generation and current visible presentation. Images stay grouped with the outfit.">?</span></span></div>
                            <div class="world-inline-outfit-list">${worldOutfits(ent).length ? worldOutfits(ent).map(outfit => {
                                const imageIds = (outfit.imageAssetIds || []).filter(id => worldMediaSource(world, id));
                                const imageId = imageIds.includes(String(ent.visuals?.portraitAssetId || ''))
                                    ? String(ent.visuals.portraitAssetId)
                                    : (imageIds[imageIds.length - 1] || '');
                                const image = imageId ? worldMediaSource(world, imageId) : '';
                                const active = outfit.id === ent.visuals?.currentOutfitId;
                                const selectedIndex = Math.max(0, imageIds.indexOf(String(ent.visuals?.portraitAssetId || '')));
                                const imagePicker = imageIds.length
                                    ? `<span class="world-inline-outfit-image-picker"><button type="button" class="world-inline-outfit-image-prev" aria-label="Previous ${escapeHTML(outfit.name)} image">‹</button><span class="world-inline-outfit-image-count">${selectedIndex + 1} / ${imageIds.length}</span><button type="button" class="world-inline-outfit-image-next" aria-label="Next ${escapeHTML(outfit.name)} image">›</button></span>`
                                    : `<span class="world-inline-outfit-image-picker is-empty"><button type="button" class="world-inline-outfit-image-prev" aria-label="Previous image" disabled>‹</button><span class="world-inline-outfit-image-count">0 / 0</span><button type="button" class="world-inline-outfit-image-next" aria-label="Next image" disabled>›</button></span>`;
                                return `<div class="world-inline-outfit-editor ${active ? 'is-active' : ''}" data-outfit-id="${escapeHTML(outfit.id)}">
                                    <div class="world-inline-outfit-image-column"><button type="button" class="world-inline-outfit-thumb world-inline-outfit-image-open" title="Open ${escapeHTML(outfit.name)} images" ${image ? `style="background-image:url('${cssUrl(image)}')"` : ''}>${image ? '' : '＋'}</button>${imagePicker}</div>
                                    <div class="world-inline-outfit-copy"><input class="world-inline-outfit-name-input" value="${escapeHTML(outfit.name)}" aria-label="Outfit name" placeholder="Outfit name…">
                                    <textarea class="world-inline-outfit-description-input" rows="2" aria-label="Outfit description" placeholder="What they are wearing…">${escapeHTML(outfit.description)}</textarea>
                                    <div class="world-inline-outfit-meta"><span class="world-inline-outfit-actions"><button type="button" class="world-inline-outfit-select ${active ? 'is-current' : ''}">${active ? 'Current outfit' : 'Wear this outfit'}</button><button type="button" class="world-inline-outfit-generate">Generate</button><button type="button" class="world-inline-outfit-delete">Delete</button></span></div></div>
                                </div>`;
                            }).join('') : ''}<button type="button" class="world-inline-new-outfit ent-add-outfit">+ New outfit</button></div>
                        </div>
                    </div>
                    <div class="world-inspector-section" data-inspector-section="visuals" style="display:grid; grid-template-columns:72px minmax(0,1fr); gap:12px; align-items:end;">
                        <div>
                            <label class="form-label" style="font-size:.75rem;">Dialogue Color</label>
                            <input class="ent-dialogue-color" type="color" value="${escapeHTML(ent.visuals?.dialogueColor || '#E63946')}" style="width:100%; height:42px; padding:3px; border:1px solid var(--border); border-radius:9px; background:var(--surface);">
                        </div>
                        <p class="form-hint" style="margin:0 0 8px;">Colors this NPC’s name, border and dialogue panel in Cinematic mode. Stored with the world.</p>
                    </div>
                ` : ''}
                
                ${ent.type === 'npc' ? `
                    <div class="world-inspector-section" data-inspector-section="persona">
                        <label class="form-label" style="font-size:0.75rem; color:var(--red);">Persona &amp; voice</label>
                        <textarea class="form-textarea ent-persona" rows="6" placeholder="Temperament, values, contradictions, mannerisms, speech rhythm, boundaries and how they behave under pressure…">${escapeHTML(ent.persona || '')}</textarea>
                        <p class="form-hint">Every person has a persona. Simulation depth controls priority—not whether their personality exists.</p>
                    </div>
                ` : ''}
                ${ent.type === 'npc' ? `
                    <div class="world-inspector-section" data-inspector-section="simulation" style="display:grid; grid-template-columns:minmax(0, 1fr) 150px; gap:12px;">
                        <div>
                            <label class="form-label" style="font-size:0.75rem; color:var(--accent);">Starting Living World Agenda</label>
                            <textarea class="form-textarea ent-goal" rows="2" placeholder="A persistent goal this character pursues off-screen...">${escapeHTML(ent.goal || ent.agenda || '')}</textarea>
                        </div>
                        <div>
                            <label class="form-label" style="font-size:0.75rem;">Autonomy</label>
                            <select class="form-select ent-goal-autonomy">
                                <option value="paused" ${ent.goalAutonomy === 'paused' ? 'selected' : ''}>Paused</option>
                                <option value="low" ${ent.goalAutonomy === 'low' ? 'selected' : ''}>Low</option>
                                <option value="medium" ${!ent.goalAutonomy || ent.goalAutonomy === 'medium' ? 'selected' : ''}>Medium</option>
                                <option value="high" ${ent.goalAutonomy === 'high' ? 'selected' : ''}>High</option>
                            </select>
                        </div>
                    </div>

                    <!-- Agenda depth: the fields the living world actually
                         simulates. Written by calibration, but never invisible. -->
                    <div class="world-inspector-section" data-inspector-section="simulation" style="margin-top:10px; padding:10px 12px; background:var(--surface2); border-radius:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                            <label class="form-label" style="font-size:0.72rem; margin:0;">Beats — the concrete things they do, one per line</label>
                            <button class="btn btn-ghost ent-generate-beats" data-idx="${idx}" style="font-size:0.65rem; padding:3px 8px; white-space:nowrap;">✨ Generate</button>
                        </div>
                        <textarea class="form-textarea ent-goal-steps" rows="4" placeholder="asked the mason about the old seal&#10;copied the seal onto wax&#10;bought a crowbar and told no one">${escapeHTML((ent.goalSteps || []).join('\n'))}</textarea>
                        <div class="form-hint" style="margin-top:4px;">Each beat is reported once, in order, as something the player can later discover. Without these the world can only say "made progress".</div>

                        <label class="form-label" style="font-size:0.72rem; margin-top:10px;">What they turn to next, one per line</label>
                        <textarea class="form-textarea ent-goal-pool" rows="2" placeholder="Stand watch over the village&#10;Find out who paid the rider">${escapeHTML((ent.goalPool || []).map(entry => typeof entry === 'string' ? entry : (entry?.goal || '')).filter(Boolean).join('\n'))}</textarea>
                        <div class="form-hint" style="margin-top:4px;">When this agenda resolves they take the next one up, instead of going inert for the rest of the campaign.</div>

                        <div style="display:flex; gap:12px; margin-top:10px;">
                            <div style="flex:1;">
                                <label class="form-label" style="font-size:0.72rem;">Difficulty (0–100)</label>
                                <input type="number" class="form-input ent-goal-difficulty" min="0" max="100" step="5"
                                       value="${ent.goalDifficulty == null ? 50 : escapeHTML(String(ent.goalDifficulty))}">
                                <div class="form-hint">Higher is slower going.</div>
                            </div>
                            <div style="flex:1;">
                                <label class="form-label" style="font-size:0.72rem;">Deadline turn <span class="form-hint">(optional)</span></label>
                                <input type="number" class="form-input ent-goal-deadline" min="1" step="1"
                                       value="${ent.goalDeadlineTurn ? escapeHTML(String(ent.goalDeadlineTurn)) : ''}" placeholder="none">
                                <div class="form-hint">Miss it and the agenda fails.</div>
                            </div>
                        </div>
                    </div>
                ` : ''}
            </div>

            ${ent.type === 'npc' ? `<div class="world-inspector-section" data-inspector-section="overview" style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-top:12px;">
                <div style="flex:1;">
                    <label style="display:block; font-size: 10px; color: var(--text-3); margin-bottom: 2px;">Sells at <span style="opacity:0.7;">(vendor)</span></label>
                    <select class="form-select ent-vendor">
                        <option value="">Not a vendor</option>
                        ${(ExperimentalWorldsState.editingWorld.locations || []).map(location => `
                            <option value="${escapeHTML(location.id)}" ${ent.vendorFor === location.id ? 'selected' : ''}>${escapeHTML(location.name || location.id)}${(location.shop || []).length ? ` (${location.shop.length})` : ' — no shop yet'}</option>`).join('')}
                    </select>
                </div>
                <div style="flex:1;">
                    <label style="display:block; font-size: 10px; color: var(--text-3); margin-bottom: 2px;">Belongs to <span style="opacity:0.7;">(faction)</span></label>
                    <select class="form-select ent-faction">
                        <option value="">Unaffiliated</option>
                        ${(ExperimentalWorldsState.editingWorld.factions || []).map(faction => `
                            <option value="${escapeHTML(faction.id)}" ${ent.factionId === faction.id ? 'selected' : ''}>${escapeHTML(faction.name || faction.id)}</option>`).join('')}
                    </select>
                </div>
                <div style="flex:1;">
                    <label style="display:block; font-size: 10px; color: var(--text-3); margin-bottom: 2px;">Initial Location · Canon Link</label>
                    <select class="form-select ent-loc"><option value="">No initial location</option>${world.locations.map(location => `<option value="${escapeHTML(location.id)}" ${getLocationRef(world, ent.startLocation)?.id === location.id ? 'selected' : ''}>${escapeHTML(location.name || location.id)}</option>`).join('')}</select>
                </div>
                <div style="flex:1;">
                    <label style="display:block; font-size: 10px; color: var(--text-3); margin-bottom: 2px;">Home Location · Canon Link</label>
                    <select class="form-select ent-home"><option value="">No home location</option>${world.locations.map(location => `<option value="${escapeHTML(location.id)}" ${getLocationRef(world, ent.homeLocation)?.id === location.id ? 'selected' : ''}>${escapeHTML(location.name || location.id)}</option>`).join('')}</select>
                </div>
            </div>` : `<div class="world-inspector-section" data-inspector-section="placement" style="margin-top:12px;">
                <label class="form-label">Located at · Canon Link</label>
                <select class="form-select ent-loc"><option value="">Unplaced item</option>${world.locations.map(location => `<option value="${escapeHTML(location.id)}" ${getLocationRef(world, ent.startLocation)?.id === location.id ? 'selected' : ''}>${escapeHTML(location.name || location.id)}</option>`).join('')}</select>
                <p class="form-hint">This is where the object exists at the start of a new session. It is not a person, household member or autonomous actor.</p>
            </div>`}
            ${ent.type === 'npc' ? `<div class="world-inspector-section" data-inspector-section="overview" style="margin-top:12px;">
                <label class="form-label">Vehicles this character can use</label>
                <div class="canon-link-row">${world.entities.filter(vehicle => vehicle.type === 'vehicle').length ? world.entities.filter(vehicle => vehicle.type === 'vehicle').map(vehicle => {
                    const access = Array.isArray(vehicle.vehicle?.access) ? vehicle.vehicle.access : [];
                    const owners = Array.isArray(vehicle.vehicle?.owners) ? vehicle.vehicle.owners : [];
                    const hasAccess = access.some(entry => (entry.entityId || entry) === ent.id);
                    const owns = owners.some(entry => (entry.entityId || entry) === ent.id);
                    return `<label class="canon-link"><input type="checkbox" class="ent-vehicle-owned" data-vehicle-id="${escapeHTML(vehicle.id)}" ${owns ? 'checked' : ''}> Owns ${escapeHTML(vehicle.name || vehicle.id)}</label><label class="canon-link"><input type="checkbox" class="ent-vehicle-access-grant" data-vehicle-id="${escapeHTML(vehicle.id)}" ${hasAccess ? 'checked' : ''}> Access</label>`;
                }).join('') : '<span class="form-hint">Create a Vehicle in Items & Objects first.</span>'}</div>
                <p class="form-hint">Ownership persists across parked and moving states. Access grants use the same vehicle entity; rideshares remain temporary runtime containers.</p>
            </div>` : ''}
            ${ent.type === 'vehicle' ? `<div class="world-inspector-section" data-inspector-section="placement" style="margin-top:12px; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px;">
                <div><label class="form-label">Parked anchor · Canon Link</label><select class="form-select ent-vehicle-anchor"><option value="">No parked anchor</option>${world.locations.map(location => `<option value="${escapeHTML(location.id)}" ${ent.vehicle?.parkedAnchorId === location.id ? 'selected' : ''}>${escapeHTML(location.name || location.id)}</option>`).join('')}</select></div>
                <div><label class="form-label">Owners & access</label><input class="form-input ent-vehicle-access" value="${escapeHTML((ent.vehicle?.access || []).map(entry => entry.entityId || entry).join(', '))}" placeholder="entity IDs with access"></div>
                <label class="vh-test-check"><input class="ent-vehicle-persistent" type="checkbox" ${ent.vehicle?.persistent !== false ? 'checked' : ''}> Persistent personal vehicle</label>
                <p class="form-hint" style="margin:0;">Moving vehicles become runtime journey containers. They are not authored map locations.</p>
            </div>` : ''}
            ${ent.type === 'npc' ? `<div class="world-inspector-section" data-inspector-section="relationships" style="margin-top:12px; padding:12px; border:1px solid var(--border); border-radius:12px;">
                <label class="form-label">Households, families &amp; organizations</label>
                <div class="canon-link-row ent-group-links">${world.groups.length ? world.groups.map(group => `<label class="canon-link"><input type="checkbox" class="ent-group" value="${escapeHTML(group.id)}" ${(ent.groupIds || []).includes(group.id) ? 'checked' : ''}> ${escapeHTML(group.name)} · ${escapeHTML(group.type)}</label>`).join('') : '<span class="form-hint">No groups yet. Create one below, then reuse it across the cast.</span>'}</div>
                <div style="display:grid;grid-template-columns:minmax(0,1fr) 150px auto;gap:8px;margin-top:10px;"><input class="form-input ent-new-group-name" placeholder="New household or group name"><select class="form-select ent-new-group-type"><option value="household">Household</option><option value="family">Family</option><option value="organization">Organization</option><option value="crew">Crew / team</option><option value="other">Other</option></select><button type="button" class="tool-btn ent-create-group">+ Create</button></div>
            </div>` : ''}
            ${ent.type === 'npc' ? `
            <div class="secret-group world-inspector-section" data-inspector-section="relationships" style="border-color:var(--border);">
                <div class="secret-header">
                    <div class="secret-title" style="color:var(--text-2);">🫱 Standing with others</div>
                    <select class="form-select ent-add-relation" style="max-width:200px; font-size:11px; padding:3px 6px;">
                        <option value="">+ Add someone…</option>
                        ${(ExperimentalWorldsState.editingWorld.entities || [])
                            .filter(other => other.type === 'npc' && other.id !== ent.id
                                && !(ExperimentalWorldsState.editingWorld.relationships || []).some(rel =>
                                    relationshipKey(rel.a, rel.b) === relationshipKey(ent.id, other.id)))
                            .map(other => `<option value="${escapeHTML(other.id)}">${escapeHTML(other.name || other.id)}</option>`).join('')}
                    </select>
                </div>
                ${(() => {
                    const mine = (ExperimentalWorldsState.editingWorld.relationships || [])
                        .map((rel, relIdx) => ({ rel, relIdx }))
                        .filter(({ rel }) => rel.a === ent.id || rel.b === ent.id);
                    if (!mine.length) {
                        return `<div class="form-hint">Nobody yet. With a large cast, run Calibrate → Society instead of adding these one at a time — it judges the pairs that matter from what you have already written.</div>`;
                    }
                    return mine.map(({ rel, relIdx }) => {
                        const otherId = rel.a === ent.id ? rel.b : rel.a;
                        const other = (ExperimentalWorldsState.editingWorld.entities || []).find(e => e.id === otherId);
                        return `
                        <div style="display:grid; grid-template-columns:1.1fr 1fr 1.6fr 70px auto; gap:6px; align-items:center; margin-bottom:5px;">
                            <div style="font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(other?.name || otherId)}</div>
                            <input type="text" class="form-input rel-label" data-rel="${relIdx}" value="${escapeHTML(rel.label || '')}" placeholder="wife, rival…" style="font-size:11px;">
                            <input type="range" class="rel-score" data-rel="${relIdx}" min="-100" max="100" value="${escapeHTML(String(rel.score ?? 0))}">
                            <div class="rel-score-out" data-rel="${relIdx}" style="font-size:10px; color:var(--text-3); text-align:right;">${escapeHTML(String(rel.score ?? 0))}</div>
                            <button class="tool-btn del-rel" data-rel="${relIdx}" style="padding:2px 8px;">✕</button>
                        </div>`;
                    }).join('');
                })()}
            </div>` : ''}

            <div class="secret-group world-inspector-section" data-inspector-section="secrets">
                <div class="secret-header">
                    <div class="secret-title">Shadow Ledger (Secrets)</div>
                    <button class="tool-btn add-secret-btn" style="padding:2px 8px; font-size:10px;">+ Add Secret</button>
                </div>
                <div class="secrets-list-container"></div>
            </div>
        `;

        const secretsList = div.querySelector('.secrets-list-container');
        renderWorldSecrets(ent, secretsList);

        div.querySelector('.add-secret-btn').onclick = () => {
            if (!ent.secrets) ent.secrets = [];
            ent.secrets.push({ label: '', hint: '', truth: '' });
            renderWorldSecrets(ent, secretsList);
        };

        div.querySelector('.ent-name').oninput = (e) => { ent.name = e.target.value; updateWorldTokenCount(); };
        div.querySelector('.ent-desc').oninput = (e) => { ent.description = e.target.value; updateWorldTokenCount(); };
        div.querySelector('.ent-gender')?.addEventListener('input', event => {
            ent.gender = String(event.target.value || '').trim().slice(0, 100);
            ent.visuals = isPlainObject(ent.visuals) ? ent.visuals : {};
            const identity = normalizeWorldVisualIdentityGuide(ent.visuals.portraitIdentityGuide);
            if (!identity.gender || identity.gender === ent.gender || !ent.gender) identity.gender = ent.gender;
            ent.visuals.portraitIdentityGuide = identity;
            updateWorldTokenCount();
        });
        div.querySelector('.ent-tags').onchange = e => {
            ent.tags = [...new Set(e.target.value.split(',').map(tag => tag.trim()).filter(Boolean))].slice(0, 30);
            updateWorldTokenCount();
        };
        
        if (ent.type === 'npc') {
            ent.visuals = isPlainObject(ent.visuals) ? ent.visuals : {};
            div.querySelector('.ent-dialogue-color').oninput = event => {
                ent.visuals.dialogueColor = /^#[0-9a-f]{6}$/i.test(event.target.value)
                    ? event.target.value.toUpperCase() : '';
            };
            const portraitInput = div.querySelector('.ent-portrait-input');
            div.querySelector('.ent-portrait-upload').onclick = () => portraitInput.click();
            portraitInput.onchange = async event => {
                const file = event.target.files?.[0];
                if (!file) return;
                try {
                    const image = await normalizeUploadedImage(file, 2048, 0.88);
                    registerWorldVisualVariant(world, ent, 'npc',
                        addWorldMediaAsset(world, image, 'npc_portrait', ent.name));
                    // Uploads can arrive at any aspect ratio: derive a
                    // centered 1:1 profile frame so the record renders
                    // deliberately even if the editor is closed without
                    // further framing.
                    await deriveWorldNpcPortraitDisplay(world, ent);
                    pruneWorldMediaAssets(world);
                    renderWorldEntities();
                    openWorldVisualEditor(world, ent, 'npc');
                    ExperimentalWorldsHost.notify(`Portrait added to ${ent.name}. Frame and crop it before closing the editor.`, 'success');
                } catch (error) {
                    ExperimentalWorldsHost.notify(`Portrait upload failed: ${error.message}`, 'error');
                } finally { event.target.value = ''; }
            };
            div.querySelector('.ent-portrait-generate').onclick = () => openWorldVisualEditor(world, ent, 'npc');
            div.querySelectorAll('.ent-add-outfit').forEach(button => button.onclick = () => {
                const outfit = createBlankWorldOutfit(ent);
                if (!outfit) return ExperimentalWorldsHost.notify('This character already has the maximum number of outfits.', 'error');
                renderWorldEntities();
                const outfitRegion = [...document.querySelectorAll('.world-inline-outfits')].find(node => node.dataset.entityId === ent.id);
                const outfitList = outfitRegion?.querySelector('.world-inline-outfit-list');
                scrollWorldOutfitListToEnd(outfitList, 'horizontal');
                focusWorldOutfitName(outfitList, outfit.id, 'horizontal');
                ExperimentalWorldsHost.notify('Blank outfit added. Fill in its title and description inline.', 'success');
            });
            div.querySelectorAll('.world-inline-outfit-editor').forEach(card => {
                const outfit = worldOutfits(ent).find(entry => entry.id === card.dataset.outfitId);
                if (!outfit) return;
                card.querySelector('.world-inline-outfit-select').onclick = () => {
                    selectWorldOutfit(world, ent, outfit.id, { preferImage: true });
                    refreshWorldInlineOutfitCards(div.querySelector('.world-inline-outfits'), ent);
                    refreshWorldEntityPortraitPreview(div, world, ent);
                    updateWorldTokenCount();
                };
                card.querySelector('.world-inline-outfit-image-open').onclick = () => {
                    selectWorldOutfit(world, ent, outfit.id, { preferImage: false });
                    refreshWorldInlineOutfitCards(div.querySelector('.world-inline-outfits'), ent);
                    refreshWorldEntityPortraitPreview(div, world, ent);
                    openWorldVisualEditor(world, ent, 'npc');
                };
                const chooseOutfitImage = direction => {
                    const imageIds = (outfit.imageAssetIds || []).filter(id => worldMediaSource(world, id));
                    if (!imageIds.length) return;
                    const currentIndex = imageIds.indexOf(String(ent.visuals?.portraitAssetId || ''));
                    const nextIndex = (Math.max(0, currentIndex) + direction + imageIds.length) % imageIds.length;
                    selectWorldOutfit(world, ent, outfit.id, { preferImage: false });
                    ent.visuals.portraitAssetId = imageIds[nextIndex];
                    ent.visuals.portraitDisplayAssetId = '';
                    refreshWorldInlineOutfitCards(div.querySelector('.world-inline-outfits'), ent);
                    refreshWorldEntityPortraitPreview(div, world, ent);
                    const imageButton = card.querySelector('.world-inline-outfit-image-open');
                    const source = worldMediaSource(world, imageIds[nextIndex]);
                    if (imageButton) {
                        imageButton.style.backgroundImage = source ? `url('${cssUrl(source)}')` : '';
                        imageButton.textContent = source ? '' : '＋';
                    }
                    const count = card.querySelector('.world-inline-outfit-image-count');
                    if (count) count.textContent = `${nextIndex + 1} / ${imageIds.length}`;
                    updateWorldTokenCount();
                };
                card.querySelector('.world-inline-outfit-image-prev').onclick = event => {
                    event.stopPropagation();
                    chooseOutfitImage(-1);
                };
                card.querySelector('.world-inline-outfit-image-next').onclick = event => {
                    event.stopPropagation();
                    chooseOutfitImage(1);
                };
                card.querySelector('.world-inline-outfit-name-input').onchange = event => {
                    outfit.name = String(event.target.value || '').trim().slice(0, 80) || 'Untitled outfit';
                    ent.visuals.outfits = worldOutfits(ent).map(entry => entry.id === outfit.id ? outfit : entry);
                    updateWorldTokenCount();
                };
                card.querySelector('.world-inline-outfit-description-input').onchange = event => {
                    outfit.description = String(event.target.value || '').trim().slice(0, 1200);
                    ent.visuals.outfits = worldOutfits(ent).map(entry => entry.id === outfit.id ? outfit : entry);
                    if (ent.visuals.currentOutfitId === outfit.id) ent.currentOutfit = outfit.description;
                    updateWorldTokenCount();
                };
                card.querySelector('.world-inline-outfit-generate').onclick = () => {
                    selectWorldOutfit(world, ent, outfit.id, { preferImage: false });
                    openWorldVisualEditor(world, ent, 'npc');
                };
                bindWorldOutfitDelete(card.querySelector('.world-inline-outfit-delete'), () => {
                    ent.visuals.outfits = worldOutfits(ent).filter(entry => entry.id !== outfit.id);
                    if (ent.visuals.currentOutfitId === outfit.id) {
                        ent.visuals.currentOutfitId = ent.visuals.outfits[0]?.id || '';
                        ent.currentOutfit = ent.visuals.outfits[0]?.description || '';
                    }
                    renderWorldEntities();
                });
            });
            div.querySelector('.ent-portrait-clear').onclick = () => {
                clearWorldVisualVariants(ent, 'npc');
                pruneWorldMediaAssets(world);
                renderWorldEntities();
            };

div.querySelector('.ent-simulation-depth').onchange = (e) => {
                ent.simulationDepth = WORLD_DIRECTORY_DEPTHS.includes(e.target.value) ? e.target.value : 'background';
                ent.isMajor = ent.simulationDepth === 'core';
                updateWorldTokenCount();
            };
            div.querySelector('.ent-persona').oninput = (e) => { ent.persona = e.target.value; updateWorldTokenCount(); };
            div.querySelector('.ent-goal').oninput = (e) => { ent.goal = e.target.value; updateWorldTokenCount(); };
            div.querySelector('.ent-goal-autonomy').onchange = (e) => { ent.goalAutonomy = e.target.value; };

            // Agenda depth. Stored as arrays, edited as one-per-line text.
            const linesToArray = value => String(value || '').split('\n')
                .map(line => line.trim()).filter(Boolean).slice(0, 20);
            div.querySelector('.ent-goal-steps').oninput = (e) => {
                ent.goalSteps = linesToArray(e.target.value);
                updateWorldTokenCount();
            };
            div.querySelector('.ent-goal-pool').oninput = (e) => {
                ent.goalPool = linesToArray(e.target.value);
                updateWorldTokenCount();
            };
            div.querySelector('.ent-goal-difficulty').onchange = (e) => {
                const value = parseInt(e.target.value);
                ent.goalDifficulty = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 50;
                e.target.value = ent.goalDifficulty;
            };
            div.querySelector('.ent-goal-deadline').onchange = (e) => {
                const value = parseInt(e.target.value);
                if (Number.isFinite(value) && value > 0) ent.goalDeadlineTurn = value;
                else { delete ent.goalDeadlineTurn; e.target.value = ''; }
            };
            div.querySelector('.ent-generate-beats').onclick = (event) =>
                generateAgendaBeats(ent, event.currentTarget);
            div.querySelectorAll('.ent-vehicle-owned').forEach(input => input.onchange = event => {
                const vehicle = world.entities.find(candidate => candidate.id === event.target.dataset.vehicleId && candidate.type === 'vehicle');
                if (!vehicle) return;
                window.ExperimentalWorldsSidecarTraversal?.normalizeVehicle(vehicle);
                const owners = Array.isArray(vehicle.vehicle.owners) ? vehicle.vehicle.owners : [];
                vehicle.vehicle.owners = event.target.checked
                    ? [...owners.filter(entry => (entry.entityId || entry) !== ent.id), { entityId: ent.id, role: 'owner' }]
                    : owners.filter(entry => (entry.entityId || entry) !== ent.id);
                if (event.target.checked && !vehicle.vehicle.access.some(entry => (entry.entityId || entry) === ent.id)) vehicle.vehicle.access.push({ entityId: ent.id, role: 'owner' });
                updateWorldTokenCount();
            });
            div.querySelectorAll('.ent-vehicle-access-grant').forEach(input => input.onchange = event => {
                const vehicle = world.entities.find(candidate => candidate.id === event.target.dataset.vehicleId && candidate.type === 'vehicle');
                if (!vehicle) return;
                window.ExperimentalWorldsSidecarTraversal?.normalizeVehicle(vehicle);
                const access = Array.isArray(vehicle.vehicle.access) ? vehicle.vehicle.access : [];
                vehicle.vehicle.access = event.target.checked
                    ? [...access.filter(entry => (entry.entityId || entry) !== ent.id), { entityId: ent.id, role: 'granted' }]
                    : access.filter(entry => (entry.entityId || entry) !== ent.id);
                updateWorldTokenCount();
            });
        }
        
        const vendorControl = div.querySelector('.ent-vendor');
        if (vendorControl) vendorControl.onchange = (e) => {
            if (e.target.value) ent.vendorFor = e.target.value;
            else delete ent.vendorFor;
        };
        if (ent.type === 'npc') {
            div.querySelectorAll('.ent-group').forEach(input => {
                input.onchange = () => {
                    ent.groupIds = [...div.querySelectorAll('.ent-group:checked')].map(item => item.value);
                    ent.householdId = ent.groupIds.find(id => world.groups.find(group => group.id === id)?.type === 'household') || '';
                    updateWorldTokenCount();
                };
            });
            div.querySelector('.ent-create-group').onclick = () => {
                const nameInput = div.querySelector('.ent-new-group-name');
                const name = nameInput.value.trim();
                if (!name) return ExperimentalWorldsHost.notify('Name the household or group first.', 'info');
                const type = div.querySelector('.ent-new-group-type').value;
                const base = `grp_${worldDirectorySlug(name, 'group')}`;
                let id = base;
                let suffix = 2;
                while (world.groups.some(group => group.id === id)) id = `${base}_${suffix++}`;
                world.groups.push({ id, name: name.slice(0, 120), type, description: '', homeLocationId: ent.homeLocation || '', tags: [] });
                ent.groupIds = [...new Set([...(ent.groupIds || []), id])];
                if (type === 'household') ent.householdId = id;
                renderWorldEntities();
                updateWorldTokenCount();
            };
            div.querySelector('.ent-add-relation').onchange = (e) => {
                const otherId = e.target.value;
                if (!otherId) return;
                if (!Array.isArray(ExperimentalWorldsState.editingWorld.relationships)) ExperimentalWorldsState.editingWorld.relationships = [];
                ExperimentalWorldsState.editingWorld.relationships.push({ a: ent.id, b: otherId, label: '', score: 0, reason: '' });
                renderWorldEntities();   // the pair now shows on both cards
                updateWorldTokenCount();
            };
            const relationAt = event => (ExperimentalWorldsState.editingWorld.relationships || [])[Number(event.target.dataset.rel)];
            div.querySelectorAll('.rel-label').forEach(input => {
                input.oninput = (e) => {
                    const relation = relationAt(e);
                    if (relation) relation.label = e.target.value.slice(0, 80);
                    updateWorldTokenCount();
                };
            });
            div.querySelectorAll('.rel-score').forEach(slider => {
                slider.oninput = (e) => {
                    const relation = relationAt(e);
                    if (!relation) return;
                    relation.score = livingClamp(parseInt(e.target.value) || 0, -100, 100);
                    div.querySelector(`.rel-score-out[data-rel="${e.target.dataset.rel}"]`).textContent = relation.score;
                };
            });
            div.querySelectorAll('.del-rel').forEach(button => {
                button.onclick = () => {
                    (ExperimentalWorldsState.editingWorld.relationships || []).splice(Number(button.dataset.rel), 1);
                    if (!ExperimentalWorldsState.editingWorld.relationships.length) delete ExperimentalWorldsState.editingWorld.relationships;
                    renderWorldEntities();
                    updateWorldTokenCount();
                };
            });
        }

        const factionControl = div.querySelector('.ent-faction');
        if (factionControl) factionControl.onchange = (e) => {
            if (e.target.value) ent.factionId = e.target.value;
            else delete ent.factionId;
            renderWorldFactions();   // member counts on the faction cards
        };
        div.querySelector('.ent-loc').onchange = (e) => { ent.startLocation = e.target.value; updateWorldTokenCount(); };
        const homeControl = div.querySelector('.ent-home');
        if (homeControl) homeControl.onchange = (e) => { ent.homeLocation = e.target.value; updateWorldTokenCount(); };
        if (ent.type === 'vehicle') {
            const normalizeVehicle = () => window.ExperimentalWorldsSidecarTraversal?.normalizeVehicle(ent);
            div.querySelector('.ent-vehicle-anchor').onchange = event => { ent.vehicle.parkedAnchorId = event.target.value; ent.startLocation = event.target.value; normalizeVehicle(); };
            div.querySelector('.ent-vehicle-access').onchange = event => {
                ent.vehicle.access = [...new Set(event.target.value.split(',').map(value => value.trim()).filter(Boolean))].slice(0, 30).map(entityId => ({ entityId, role: 'owner_or_granted' }));
                normalizeVehicle();
            };
            div.querySelector('.ent-vehicle-persistent').onchange = event => { ent.vehicle.persistent = event.target.checked; normalizeVehicle(); };
        }
        div.querySelector('.del-ent').onclick = () => {
            const usedBy = worldDirectoryUsedBy('entity', ent.id);
            if (usedBy.length && !confirm(`“${ent.name || ent.id}” has ${usedBy.length} authored connection${usedBy.length === 1 ? '' : 's'}:\n\n${usedBy.slice(0, 8).join('\n')}\n\nDelete this record and clear those connections?`)) return;
            ExperimentalWorldsState.editingWorld.entities.splice(idx, 1);
            // Their standings and their faction membership go with them, or the
            // other cards would list a relationship with a raw id.
            normalizeAuthoredWorld(ExperimentalWorldsState.editingWorld);
            closeWorldRecordInspector();
            renderWorldEntities();
            renderWorldFactions();
            updateWorldTokenCount();
        };

        container.appendChild(div);
    });
    if (inspecting) {
        const links = worldDirectoryUsedBy('entity', selected.id);
        document.getElementById('world-record-reference-status').textContent = links.length
            ? `Canon Links · ${links.slice(0, 3).join(', ')}${links.length > 3 ? ` and ${links.length - 3} more` : ''}.`
            : 'Canon Links · no authored relationships reference this record yet.';
        setWorldInspectorTab(worldRecordInspector.tab);
    }
}

// A score read back as words, using the same thresholds the living world uses
// to decide who is an ally and who is an enemy — so the editor and the engine
// never disagree about what a number means.
function factionRelationLabel(score) {
    if (score >= 70) return 'Sworn allies';
    if (score >= FACTION_ALLY_AT) return 'Allied';
    if (score > 10) return 'Friendly';
    if (score >= -10) return 'Neutral';
    if (score > FACTION_HOSTILE_AT) return 'Wary';
    if (score > -70) return 'Hostile';
    return 'At war';
}

function addWorldFaction(position = 'top') {
    const world = ExperimentalWorldsState.editingWorld;
    if (!world) return;
    if (!Array.isArray(world.factions)) world.factions = [];
    if (world.factions.length >= 200) {
        ExperimentalWorldsHost.notify('200 factions is the limit for one world.', 'error');
        return;
    }
    const faction = normalizeWorldFaction({ name: `New Faction ${world.factions.length + 1}` }, world.factions.length);
    if (position === 'bottom') world.factions.push(faction);
    else world.factions.unshift(faction);
    // Entity rendering normalizes the authored world and can replace faction
    // records. Run it first so faction controls always bind to the canonical
    // objects that Save World will persist.
    renderWorldEntities();   // the membership dropdowns gain the new faction
    renderWorldFactions();
    updateWorldTokenCount();
}

function renderWorldFactions() {
    const world = ExperimentalWorldsState.editingWorld;
    const container = document.getElementById('w-factions-list');
    if (!world || !container) return;
    // The editor draws whatever is in memory, and that can arrive from an
    // import or an older save. Repair before drawing rather than trusting the
    // shape — a faction without a territory array used to throw here and take
    // the whole panel down.
    normalizeAuthoredWorld(world);
    container.innerHTML = '';
    const factions = Array.isArray(world.factions) ? world.factions : [];

    if (!factions.length) {
        container.innerHTML = `
            <div class="form-hint" style="padding:18px; border:1px dashed var(--border); border-radius:10px; text-align:center;">
                No factions yet. Without them, the world has no organised powers to hold ground,
                pursue aims off-screen, or take sides — the AI can still invent factions mid-play,
                but nothing you write here will be waiting at turn one.
            </div>`;
        return;
    }

    factions.forEach((faction, index) => {
        const members = (world.entities || []).filter(entity => entity.factionId === faction.id);
        const territoryNames = faction.territory
            .map(id => (world.locations || []).find(location => location.id === id))
            .filter(Boolean);
        const others = factions.filter(other => other.id !== faction.id);

        const div = document.createElement('div');
        div.className = 'loc-card';
        div.innerHTML = `
            <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
                <input type="text" class="form-input faction-name" value="${escapeHTML(faction.name || '')}" placeholder="The Ashen Hand" style="font-weight:700;">
                <select class="form-select faction-status" style="max-width:140px;">
                    ${FACTION_STATUSES.map(status => `
                        <option value="${status}" ${faction.status === status ? 'selected' : ''}>${status[0].toUpperCase()}${status.slice(1)}</option>`).join('')}
                </select>
                <button class="tool-btn del-faction" title="Delete faction">✕</button>
            </div>
            <div class="form-hint" style="margin:-4px 0 8px;">
                id <code>${escapeHTML(faction.id)}</code> ·
                ${members.length ? `${members.length} member${members.length === 1 ? '' : 's'}` : 'no members yet'} ·
                ${territoryNames.length ? `${territoryNames.length} holding${territoryNames.length === 1 ? '' : 's'}` : 'holds no ground'}
            </div>

            <textarea class="form-textarea faction-desc" rows="2" placeholder="Who they are and how the world sees them.">${escapeHTML(faction.description || '')}</textarea>

            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-top:10px;">
                <div>
                    <label style="display:block; font-size:10px; color:var(--text-3);">Influence <span class="faction-influence-out" style="color:var(--accent);">${faction.influence}</span> <span style="opacity:0.7;">/100 — what they can make happen</span></label>
                    <input type="range" class="faction-influence" min="0" max="100" value="${faction.influence}" style="width:100%;">
                </div>
                <div>
                    <label style="display:block; font-size:10px; color:var(--text-3);">Reputation <span class="faction-reputation-out" style="color:var(--accent);">${faction.reputation}</span> <span style="opacity:0.7;">−100..100 — how the public regards them</span></label>
                    <input type="range" class="faction-reputation" min="-100" max="100" value="${faction.reputation}" style="width:100%;">
                </div>
                <div>
                    <label style="display:block; font-size:10px; color:var(--text-3);">Resources <span style="opacity:0.7;">— coin, arms, supply</span></label>
                    <input type="number" class="form-input faction-resources" min="0" value="${escapeHTML(String(faction.resources))}">
                </div>
            </div>

            <div style="margin-top:10px;">
                <label style="display:block; font-size:10px; color:var(--text-3);">Current aim</label>
                <input type="text" class="form-input faction-goal" value="${escapeHTML(faction.goal || '')}" placeholder="Seize the river crossing before the thaw">
                <label style="display:block; font-size:10px; color:var(--text-3); margin-top:8px;">Later aims <span style="opacity:0.7;">— one per line; taken up when the current one is won or lost</span></label>
                <textarea class="form-textarea faction-goal-pool" rows="2" placeholder="Buy the toll rights&#10;Put their own claimant on the seat">${escapeHTML((faction.goalPool || []).join('\n'))}</textarea>
            </div>

            <div class="secret-group" style="border-color:var(--border);">
                <div class="secret-header">
                    <div class="secret-title" style="color:var(--text-2);">🗺️ Territory — ground they hold</div>
                    <input type="text" class="form-input faction-territory-filter" placeholder="Filter locations…" style="max-width:180px; font-size:11px; padding:3px 6px;">
                </div>
                <div class="faction-territory-list" style="max-height:180px; overflow-y:auto; border:1px solid var(--border); border-radius:8px; padding:6px;"></div>
            </div>

            <div class="secret-group" style="border-color:var(--border);">
                <div class="secret-title" style="color:var(--text-2); margin-bottom:6px;">🤝 Standing with other factions</div>
                ${others.length ? others.map(other => {
                    const score = (faction.relations.find(relation => relation.factionId === other.id) || {}).score || 0;
                    return `
                    <div style="display:grid; grid-template-columns:1fr 2fr 90px; gap:8px; align-items:center; margin-bottom:5px;">
                        <div style="font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(other.name || other.id)}</div>
                        <input type="range" class="faction-relation" data-other="${escapeHTML(other.id)}" min="-100" max="100" value="${score}">
                        <div class="faction-relation-out" data-other="${escapeHTML(other.id)}" style="font-size:10px; color:var(--text-3); text-align:right;">${factionRelationLabel(score)} (${score})</div>
                    </div>`;
                }).join('') + `<div class="form-hint" style="margin-top:4px;">Standing is mutual — setting it here sets it on both sides, which is how the world then drifts it.</div>`
                : `<div class="form-hint">Add a second faction to set who stands with whom.</div>`}
            </div>
        `;

        // --- Territory ---
        const territoryList = div.querySelector('.faction-territory-list');
        const renderTerritory = (filter = '') => {
            const needle = filter.trim().toLowerCase();
            const regions = {};
            (world.locations || []).forEach(location => {
                const label = `${location.name || ''} ${location.id}`.toLowerCase();
                if (needle && !label.includes(needle)) return;
                const region = location.region || 'No Region';
                (regions[region] = regions[region] || []).push(location);
            });
            const names = Object.keys(regions).sort();
            if (!names.length) {
                territoryList.innerHTML = `<div class="form-hint">No location matches that filter.</div>`;
                return;
            }
            territoryList.innerHTML = names.map(region => {
                const inRegion = regions[region];
                const allHeld = inRegion.every(location => faction.territory.includes(location.id));
                return `
                <div style="margin-bottom:6px;">
                    <label style="display:flex; align-items:center; gap:6px; font-size:10px; color:var(--text-3); text-transform:uppercase; letter-spacing:0.04em;">
                        <input type="checkbox" class="faction-region-all" data-region="${escapeHTML(region)}" ${allHeld ? 'checked' : ''}>
                        ${escapeHTML(region)}
                    </label>
                    ${inRegion.map(location => `
                        <label style="display:flex; align-items:center; gap:6px; font-size:11px; padding-left:14px;">
                            <input type="checkbox" class="faction-territory" data-loc="${escapeHTML(location.id)}" ${faction.territory.includes(location.id) ? 'checked' : ''}>
                            ${escapeHTML(location.name || location.id)}
                        </label>`).join('')}
                </div>`;
            }).join('');

            territoryList.querySelectorAll('.faction-territory').forEach(box => {
                box.onchange = () => {
                    const id = box.dataset.loc;
                    if (box.checked) {
                        if (!faction.territory.includes(id)) faction.territory.push(id);
                    } else {
                        faction.territory = faction.territory.filter(held => held !== id);
                    }
                    renderTerritory(filter);
                    updateWorldTokenCount();
                };
            });
            territoryList.querySelectorAll('.faction-region-all').forEach(box => {
                box.onchange = () => {
                    const ids = regions[box.dataset.region].map(location => location.id);
                    if (box.checked) {
                        ids.forEach(id => { if (!faction.territory.includes(id)) faction.territory.push(id); });
                    } else {
                        faction.territory = faction.territory.filter(held => !ids.includes(held));
                    }
                    renderTerritory(filter);
                    updateWorldTokenCount();
                };
            });
        };
        renderTerritory();
        div.querySelector('.faction-territory-filter').oninput = (e) => renderTerritory(e.target.value);

        // --- Identity and standing ---
        div.querySelector('.faction-name').oninput = (e) => {
            faction.name = e.target.value.slice(0, 120);
            updateWorldTokenCount();
        };
        // Renaming changes the label everywhere it is referenced, so redraw once
        // the author is done rather than on every keystroke.
        div.querySelector('.faction-name').onchange = () => { renderWorldEntities(); renderWorldFactions(); };
        div.querySelector('.faction-status').onchange = (e) => { faction.status = e.target.value; };
        div.querySelector('.faction-desc').oninput = (e) => {
            faction.description = e.target.value.slice(0, 600);
            updateWorldTokenCount();
        };
        div.querySelector('.faction-goal').oninput = (e) => {
            faction.goal = e.target.value.slice(0, 240);
            updateWorldTokenCount();
        };
        div.querySelector('.faction-goal-pool').oninput = (e) => {
            faction.goalPool = String(e.target.value || '').split('\n')
                .map(line => line.trim().slice(0, 240)).filter(Boolean).slice(0, 20);
            updateWorldTokenCount();
        };
        div.querySelector('.faction-resources').onchange = (e) => {
            faction.resources = livingClamp(parseInt(e.target.value) || 0, 0, 999999);
            e.target.value = faction.resources;
        };
        [['influence', 0, 100], ['reputation', -100, 100]].forEach(([field, min, max]) => {
            const slider = div.querySelector(`.faction-${field}`);
            const output = div.querySelector(`.faction-${field}-out`);
            slider.oninput = () => {
                faction[field] = livingClamp(parseInt(slider.value) || 0, min, max);
                output.textContent = faction[field];
            };
        });

        div.querySelectorAll('.faction-relation').forEach(slider => {
            slider.oninput = () => {
                const otherId = slider.dataset.other;
                const other = factions.find(item => item.id === otherId);
                const score = livingClamp(parseInt(slider.value) || 0, -100, 100);
                // Both sides, because the living world treats standing as mutual.
                [[faction, other], [other, faction]].forEach(([from, to]) => {
                    if (!from || !to) return;
                    if (!Array.isArray(from.relations)) from.relations = [];
                    const relation = from.relations.find(item => item.factionId === to.id);
                    if (relation) relation.score = score;
                    else from.relations.push({ factionId: to.id, score });
                });
                div.querySelector(`.faction-relation-out[data-other="${otherId}"]`).textContent =
                    `${factionRelationLabel(score)} (${score})`;
            };
            // The other faction's own card must show the change too.
            slider.onchange = () => renderWorldFactions();
        });

        div.querySelector('.del-faction').onclick = () => {
            if (!confirm(`Delete "${faction.name || faction.id}"? Members and holdings lose their link to it.`)) return;
            world.factions.splice(index, 1);
            // Nothing may be left pointing at a faction that no longer exists.
            world.factions.forEach(other => {
                other.relations = (other.relations || []).filter(relation => relation.factionId !== faction.id);
            });
            (world.entities || []).forEach(entity => {
                if (entity.factionId === faction.id) delete entity.factionId;
            });
            if (!world.factions.length) delete world.factions;
            renderWorldEntities();
            renderWorldFactions();
            updateWorldTokenCount();
        };

        container.appendChild(div);
    });
}

function addWorldStartingLife() {
    const world = ExperimentalWorldsState.editingWorld;
    if (!world) return;
    normalizeWorldSandboxConfig(world);
    world.startingLives.push({
        id: `origin_${Date.now()}`,
        name: `New Starting Life ${world.startingLives.length + 1}`,
        icon: '◈',
        role: 'wanderer',
        socialRank: 'commoner',
        description: '',
        startLocationId: world.startLocationId || world.locations?.[0]?.id || '',
        factionId: '',
        factionReputation: 0,
        title: '',
        outfit: '',
        inventory: [],
        obligations: [],
        privileges: [],
        skills: [],
        perks: [],
        legalStatus: 'free',
        holdings: [],
        statOverrides: {},
        intro: ''
    });
    renderWorldSandboxStudio();
}

function renderWorldSandboxStudio() {
    const world = ExperimentalWorldsState.editingWorld;
    const list = document.getElementById('w-world-origins-list');
    if (!world || !list) return;
    const config = normalizeWorldSandboxConfig(world);
    const setChecked = (id, value) => { const input = document.getElementById(id); if (input) input.checked = !!value; };
    setChecked('w-sandbox-enabled', config.enabled);
    setChecked('w-sandbox-politics', config.politics);
    setChecked('w-sandbox-conflict', config.conflict);
    setChecked('w-sandbox-law', config.law);
    setChecked('w-sandbox-seasons', config.seasons);
    setChecked('w-sandbox-growth', config.growth);
    document.getElementById('w-sandbox-scale').value = config.scale;
    document.getElementById('w-sandbox-calendar').value = config.calendar;
    document.getElementById('w-sandbox-season-days').value = config.seasonDays;
    document.getElementById('w-sandbox-principles').value = config.principles;
    list.innerHTML = '';
    if (!world.startingLives.length) {
        list.innerHTML = '<div class="form-hint" style="padding:18px; text-align:center; border:1px dashed var(--border); border-radius:12px;">No starting lives yet. The world will use its single default start.</div>';
        return;
    }
    const locationOptions = (world.locations || []).map(location =>
        `<option value="${escapeHTML(location.id)}">${escapeHTML(location.name)}</option>`).join('');
    const factionOptions = (world.factions || []).map(faction =>
        `<option value="${escapeHTML(faction.id)}">${escapeHTML(faction.name)}</option>`).join('');
    const ensureOptions = (id, values) => {
        let datalist = document.getElementById(id);
        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = id;
            document.body.appendChild(datalist);
        }
        datalist.innerHTML = [...new Set(values.filter(Boolean))]
            .map(value => `<option value="${escapeHTML(value)}"></option>`).join('');
    };
    ensureOptions('world-origin-icons', ['◈', '⚔️', '👑', '🛡️', '🏹', '🪓', '🧙', '🎭', '🔧', '📚', '🌾', '💰', '🕵️', '💉', '🚀']);
    ensureOptions('world-origin-roles', ['wanderer', 'peasant', 'student', 'merchant', 'guard', 'knight', 'healer', 'criminal', 'noble', 'ruler',
        ...world.startingLives.map(life => life.role)]);
    ensureOptions('world-origin-ranks', ['outcast', 'enslaved', 'commoner', 'artisan', 'retainer', 'gentry', 'nobility', 'royalty',
        ...world.startingLives.map(life => life.socialRank)]);
    ensureOptions('world-origin-legal', ['free', 'citizen', 'resident', 'visitor', 'indentured', 'wanted', 'imprisoned', 'exiled', 'protected',
        ...world.startingLives.map(life => life.legalStatus)]);
    world.startingLives.forEach((life, index) => {
        const statDefinitions = [...(world.hudConfig?.stats || [])];
        Object.keys(life.statOverrides || {}).forEach(id => {
            if (!statDefinitions.some(stat => stat.id === id)) statDefinitions.push({ id, name: id });
        });
        const statControls = statDefinitions.length
            ? `<div class="origin-wide smart-field-group"><span class="smart-field-label">Starting stat overrides <small>Leave blank to use the world's default</small></span><div class="origin-stat-grid">${statDefinitions.map(stat => `<label><span>${escapeHTML(stat.name || stat.id)}</span><input class="form-input origin-stat-override" type="number" data-stat-id="${escapeHTML(stat.id)}" value="${life.statOverrides?.[stat.id] == null ? '' : escapeHTML(String(life.statOverrides[stat.id]))}" placeholder="Default"></label>`).join('')}</div></div>`
            : '<div class="origin-wide form-hint">Add HUD stats under Systems to configure starting stat overrides here.</div>';
        const card = document.createElement('div');
        card.className = 'sandbox-origin-editor';
        card.innerHTML = `
            <div class="sandbox-origin-editor-grid">
                <input class="form-input origin-name" value="${escapeHTML(life.name)}" placeholder="Starting life name">
                <input class="form-input origin-icon" list="world-origin-icons" value="${escapeHTML(life.icon)}" placeholder="Choose an icon">
                <input class="form-input origin-role" list="world-origin-roles" value="${escapeHTML(life.role)}" placeholder="Choose or enter a role">
                <input class="form-input origin-rank" list="world-origin-ranks" value="${escapeHTML(life.socialRank)}" placeholder="Choose or enter a social rank">
                <input class="form-input origin-title" value="${escapeHTML(life.title)}" placeholder="Title (optional)">
                <input class="form-input origin-legal" list="world-origin-legal" value="${escapeHTML(life.legalStatus)}" placeholder="Choose or enter legal status">
                <select class="form-select origin-location"><option value="">Default starting location</option>${locationOptions}</select>
                <select class="form-select origin-faction"><option value="">No starting allegiance</option>${factionOptions}</select>
                <input class="form-input origin-faction-rep" type="number" min="-100" max="100" value="${life.factionReputation}" placeholder="Faction reputation">
                <textarea class="form-textarea origin-desc origin-wide" rows="2" placeholder="What this life feels like and what makes its opening distinct.">${escapeHTML(life.description)}</textarea>
                <input class="form-input origin-inventory origin-wide" value="${escapeHTML((life.inventory || []).map(item => globalThis.ExperimentalWorldsRpgMechanics?.itemName(item) || String(item || '')).filter(Boolean).join(', '))}" placeholder="Starting possessions, comma separated">
                ${statControls}
                <textarea class="form-textarea origin-obligations" rows="3" placeholder="Obligations, one per line">${escapeHTML((life.obligations || []).join('\n'))}</textarea>
                <textarea class="form-textarea origin-privileges" rows="3" placeholder="Privileges, one per line">${escapeHTML((life.privileges || []).join('\n'))}</textarea>
                <textarea class="form-textarea origin-skills" rows="3" placeholder="World-specific skills, one per line">${escapeHTML((life.skills || []).join('\n'))}</textarea>
                <textarea class="form-textarea origin-perks" rows="3" placeholder="Starting perks, one per line">${escapeHTML((life.perks || []).join('\n'))}</textarea>
                <textarea class="form-textarea origin-holdings" rows="3" placeholder="Holdings, comma separated">${escapeHTML((life.holdings || []).join(', '))}</textarea>
                <textarea class="form-textarea origin-outfit origin-wide" rows="2" placeholder="Starting clothing / visible status">${escapeHTML(life.outfit || '')}</textarea>
                <textarea class="form-textarea origin-intro origin-wide" rows="4" placeholder="Optional exact opening narration for this life">${escapeHTML(life.intro || '')}</textarea>
            </div>
            <div class="sandbox-origin-editor-actions"><button class="btn btn-danger delete-origin">Delete starting life</button></div>`;
        card.querySelector('.origin-location').value = life.startLocationId || '';
        card.querySelector('.origin-faction').value = life.factionId || '';
        const bind = (selector, field, transform = value => value) => {
            card.querySelector(selector).oninput = event => { life[field] = transform(event.target.value); updateWorldTokenCount(); };
        };
        bind('.origin-name', 'name', value => value.slice(0, 100));
        bind('.origin-icon', 'icon', value => value.slice(0, 8));
        bind('.origin-role', 'role', value => value.slice(0, 100));
        bind('.origin-rank', 'socialRank', value => value.slice(0, 80));
        bind('.origin-title', 'title', value => value.slice(0, 120));
        bind('.origin-legal', 'legalStatus', value => value.slice(0, 100));
        bind('.origin-desc', 'description', value => value.slice(0, 500));
        bind('.origin-inventory', 'inventory', value => value.split(',').map(item => item.trim()).filter(Boolean).slice(0, 60));
        bind('.origin-obligations', 'obligations', value => value.split('\n').map(item => item.trim()).filter(Boolean).slice(0, 30));
        bind('.origin-privileges', 'privileges', value => value.split('\n').map(item => item.trim()).filter(Boolean).slice(0, 30));
        bind('.origin-skills', 'skills', value => value.split('\n').map(item => item.trim()).filter(Boolean).slice(0, 40));
        bind('.origin-perks', 'perks', value => value.split('\n').map(item => item.trim()).filter(Boolean).slice(0, 40));
        bind('.origin-holdings', 'holdings', value => value.split(',').map(item => item.trim()).filter(Boolean).slice(0, 30));
        bind('.origin-outfit', 'outfit', value => value.slice(0, 300));
        bind('.origin-intro', 'intro', value => value.slice(0, 6000));
        card.querySelector('.origin-location').onchange = event => { life.startLocationId = event.target.value; };
        card.querySelector('.origin-faction').onchange = event => { life.factionId = event.target.value; };
        card.querySelector('.origin-faction-rep').onchange = event => {
            life.factionReputation = livingClamp(event.target.value, -100, 100);
            event.target.value = life.factionReputation;
        };
        card.querySelectorAll('.origin-stat-override').forEach(input => {
            input.onchange = event => {
                const id = event.target.dataset.statId;
                const raw = event.target.value.trim();
                life.statOverrides = isPlainObject(life.statOverrides) ? life.statOverrides : {};
                if (!raw || !Number.isFinite(Number(raw))) {
                    delete life.statOverrides[id];
                    event.target.value = '';
                } else {
                    life.statOverrides[id] = Number(raw);
                    event.target.value = String(life.statOverrides[id]);
                }
                updateWorldTokenCount();
            };
        });
        card.querySelector('.delete-origin').onclick = () => {
            world.startingLives.splice(index, 1);
            renderWorldSandboxStudio();
            updateWorldTokenCount();
        };
        list.appendChild(card);
    });
}

function importStWorldInfoPack(world, rawData) {
    // SillyTavern world-info import: ST entries become ordinary world
    // lorebook entries. Angle-bracket routing keys (<ROUTER:...>, <BSM:...>)
    // are preserved verbatim — they do not collide with prose keyword
    // triggers and stay addressable for mechanics reference routing.
    if (!isPlainObject(rawData)) return { added: 0, skipped: 0, error: 'not a JSON object' };
    const rawEntries = Array.isArray(rawData.entries)
        ? rawData.entries
        : (isPlainObject(rawData.entries) ? Object.values(rawData.entries) : null);
    if (!rawEntries) return { added: 0, skipped: 0, error: 'no "entries" field — not a SillyTavern world-info pack' };
    const packName = String(rawData.name || 'pack').replace(/[^a-z0-9_-]+/gi, '_')
        .replace(/^_+|_+$/g, '').slice(0, 40) || 'pack';
    const existing = new Set((world.lorebook || []).map(entry => String(entry.id || '')));
    const added = [];
    let skipped = 0;
    rawEntries.forEach((raw, index) => {
        if (!isPlainObject(raw)) { skipped += 1; return; }
        const text = String(raw.content || '').trim();
        if (!text || raw.disable === true) { skipped += 1; return; }
        if ((world.lorebook || []).length + added.length >= 2000) { skipped += 1; return; }
        const keys = (Array.isArray(raw.key) ? raw.key : [raw.key])
            .map(key => String(key || '').trim()).filter(Boolean);
        let keyword = keys.join(',').slice(0, 2000);
        if (!keyword) {
            // Keyless entries: derive trigger words from their comment so
            // they remain reachable in the lore keyword scan.
            keyword = String(raw.comment || '').replace(/[^A-Za-z0-9 ]+/g, ' ')
                .split(/\s+/).filter(Boolean).slice(0, 5).join(',').slice(0, 2000);
        }
        let id = `st_${packName}_${Number.isFinite(Number(raw.uid)) ? raw.uid : index}`;
        id = id.replace(/[^a-zA-Z0-9_-]/g, '_');
        while (existing.has(id)) id += '_';
        existing.add(id);
        const entry = { id, keyword, text };
        if (raw.constant === true) entry.constant = true;
        if (typeof raw.probability === 'number' && raw.probability >= 0 && raw.probability <= 100) {
            entry.probability = raw.probability;
        }
        added.push(entry);
    });
    world.lorebook = (Array.isArray(world.lorebook) ? world.lorebook : []).concat(added);
    return { added: added.length, skipped };
}

function addWorldLore() {
    const entry = {
        id: 'lore_' + Date.now(),
        keyword: 'New Topic',
        text: 'Information about this topic...'
    };
    ExperimentalWorldsState.editingWorld.lorebook = ExperimentalWorldsState.editingWorld.lorebook || [];
    ExperimentalWorldsState.editingWorld.lorebook.push(entry);
    renderWorldLore();
}

function renderWorldLore() {
    const container = document.getElementById('w-lore-list');
    if (!container) return;
    container.innerHTML = '';

    const importBar = document.createElement('div');
    importBar.style.cssText = 'display:flex; justify-content:flex-end; margin-bottom:8px;';
    importBar.innerHTML = `<button class="tool-btn" id="w-lore-import-btn">Import SillyTavern Pack</button>`;
    importBar.querySelector('#w-lore-import-btn').onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const result = importStWorldInfoPack(ExperimentalWorldsState.editingWorld, JSON.parse(ev.target.result));
                    if (result.error) {
                        ExperimentalWorldsHost.notify(`Import failed: ${result.error}`, 'error');
                        return;
                    }
                    ExperimentalWorldsHost.notify(`Imported ${result.added} lore entries (${result.skipped} skipped).`, 'success');
                    renderWorldLore();
                    updateWorldTokenCount();
                } catch (err) {
                    ExperimentalWorldsHost.notify(`Import failed: ${err.message}`, 'error');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };
    container.appendChild(importBar);
    
    const entries = ExperimentalWorldsState.editingWorld.lorebook || [];
    entries.forEach((entry, idx) => {
        const div = document.createElement('div');
        div.className = 'studio-card';
        div.style.padding = '12px';
        div.style.marginBottom = '12px';
        
        div.innerHTML = `
            <div style="display:flex; gap:8px; margin-bottom:8px;">
                <input type="text" class="form-input lore-key" style="flex:1" value="${escapeHTML(entry.keyword)}" placeholder="Keywords...">
                <button class="tool-btn del-lore">✕</button>
            </div>
            <textarea class="form-textarea lore-text" rows="3" placeholder="Lore details...">${escapeHTML(entry.text)}</textarea>
        `;

        div.querySelector('.lore-key').oninput = (e) => entry.keyword = e.target.value;
        div.querySelector('.lore-text').oninput = (e) => entry.text = e.target.value;
        div.querySelector('.del-lore').onclick = () => {
            ExperimentalWorldsState.editingWorld.lorebook.splice(idx, 1);
            renderWorldLore();
        };

        container.appendChild(div);
    });
}

function addWorldStat() {
    const w = ExperimentalWorldsState.editingWorld;
    if (!w) return;
    w.hudConfig.stats = w.hudConfig.stats || [];
    w.hudConfig.stats.push({
        id: 'stat_' + Date.now(), name: 'New Stat', value: 0, min: 0, max: 0,
        color: 'var(--accent)',
        roll: { enabled: false, mode: 'normalized', direction: 'higher', scale: 10, fixedModifier: 0 }
    });
    renderWorldStudioStats();
    loadWorldGameRuleControls(w);
}

function worldItemModifierLines(item) {
    const modifiers = globalThis.ExperimentalWorldsRpgMechanics?.modifiers(item?.modifiers || {}) || {};
    const lines = [];
    ['checks', 'damage', 'armor'].forEach(key => { if (Number(modifiers[key])) lines.push(`${key}=${modifiers[key]}`); });
    ['attributes', 'skills', 'stats', 'defenses', 'resources'].forEach(group => {
        Object.entries(modifiers[group] || {}).forEach(([key, value]) => lines.push(`${group}:${key}=${value}`));
    });
    return lines.join('\n');
}

function parseWorldItemModifiers(value) {
    const result = { checks: 0, damage: 0, armor: 0, attributes: {}, skills: {}, stats: {}, defenses: {}, resources: {} };
    String(value || '').split('\n').map(line => line.trim()).filter(Boolean).forEach(line => {
        const match = line.match(/^([a-z]+)(?::([^=]+))?\s*=\s*(-?\d+(?:\.\d+)?)$/i);
        if (!match) return;
        const group = match[1].toLowerCase(); const key = String(match[2] || '').trim(); const amount = Number(match[3]);
        if (['checks', 'damage', 'armor'].includes(group) && !key) result[group] = amount;
        else if (result[group] && key) result[group][key] = amount;
    });
    return result;
}

function parseSequencePlanningPacket(content, fallback = {}) {
    const raw = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const parsed = safeParseJSONRepair(raw);
    const packet = isPlainObject(parsed) ? parsed : {};
    return {
        title: String(packet.title || fallback.title || 'New sequence').trim().slice(0, 180),
        sceneTitle: String(packet.sceneTitle || packet.scene_title || fallback.sceneTitle || 'New scene').trim().slice(0, 180),
        transitionMode: packet.transitionMode === 'discontinuous' || packet.transition_mode === 'discontinuous' ? 'discontinuous' : 'continuous',
        continuity: String(packet.continuity || '').trim().slice(0, 2400),
        constraints: Array.isArray(packet.constraints) ? packet.constraints.map(item => String(item || '').trim().slice(0, 360)).filter(Boolean).slice(0, 16) : [],
        openQuestions: Array.isArray(packet.openQuestions || packet.open_questions) ? (packet.openQuestions || packet.open_questions)
            .map(item => String(item || '').trim().slice(0, 360)).filter(Boolean).slice(0, 16) : []
    };
}

async function requestSequencePlanningPacket(world, sess, authorIntent, options = {}) {
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    if (!protocol) throw new Error('Sidecar protocol is unavailable for this timeline.');
    const planning = window.ExperimentalWorldsSidecarTimeline?.beginPlanning(protocol, sess, authorIntent);
    if (!planning) throw new Error('Sequence planning is unavailable.');
    const currentPacket = buildSidecarScenePacket(world, sess);
    const model = world.model || ExperimentalWorldsState.globalSettings.defaultModel;
    const prompt = `[SEQUENCE PLANNING — OUT OF WORLD]\nYou are helping the author plan the next sequence in an ongoing roleplay world. This is not narration and must not advance time, move actors, create state, or resolve open questions. Reconstruct only the constraints that matter for the requested cut. A continuous transition keeps the current dramatic beat; a discontinuous transition requires an establishing beat. Return one JSON object only:\n{\n  "title":"short sequence title",\n  "sceneTitle":"short immediate scene title",\n  "transitionMode":"continuous|discontinuous",\n  "continuity":"compact narrator-facing continuity direction",\n  "constraints":["established facts to preserve"],\n  "openQuestions":["relevant unresolved questions"]\n}\n\nCURRENT CANONICAL SCENE PACKET:\n${JSON.stringify(currentPacket)}\n\nOPEN QUESTIONS:\n${JSON.stringify((protocol.questions || []).filter(question => question.status === 'open').slice(-20))}\n\nAUTHOR'S DESIRED CUT:\n${JSON.stringify(String(authorIntent || '').slice(0, 4000))}`;
    const body = {
        model, stream: false, max_tokens: Math.max(500, Number(world.maxTokens) || 1200), temperature: 0.2,
        messages: [{ role: 'system', content: prompt }, { role: 'user', content: 'Prepare the sequence planning packet.' }]
    };
    const response = await fetch(ExperimentalWorldsHost.apiBase() + '/chat/completions', {
        method: 'POST', signal: options.signal,
        headers: { ...ExperimentalWorldsHost.authHeaders(), 'Content-Type': 'application/json', ...ExperimentalWorldsHost.attributionHeaders() },
        body: JSON.stringify(ExperimentalWorldsHost.applyOpenRouterRouting(body, world, { scope: 'world' }))
    });
    if (!response.ok) throw new Error((await response.text()).slice(0, 800) || `Sequence planning failed (${response.status})`);
    const reply = (await response.json())?.choices?.[0]?.message?.content || '';
    const packet = parseSequencePlanningPacket(reply, { title: 'New sequence', sceneTitle: 'New scene' });
    planning.proposedStartPacket = packet;
    planning.constraints = packet.constraints;
    planning.status = 'ready_for_author';
    planning.narratorModel = model;
    planning.generatedAt = new Date().toISOString();
    recordSidecarTrace(world, sess, { kind: 'sequence_planning', prompt, reply, model });
    return { planning, packet };
}

async function requestSequenceClosureReconciliation(world, sess, options = {}) {
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    const hierarchy = protocol && window.ExperimentalWorldsSidecarTimeline?.ensureHierarchy(protocol, sess, { createWhenMissing: false });
    if (!protocol || !hierarchy?.sequence) throw new Error('No active Sidecar sequence.');
    const sequence = hierarchy.sequence;
    const packet = buildSidecarScenePacket(world, sess);
    const questions = (protocol.questions || []).filter(question => ['open', 'deferred'].includes(question.status));
    const prompt = `[SEQUENCE CLOSURE RECONCILIATION]\nReview whether the active sequence can close without inventing facts. Return JSON only: {"status":"ready|blocked|needs_author","summary":"short reconciliation result","blockingQuestionIds":["stable IDs"],"questions":[{"id":"stable ID","prompt":"authorial question","blocking":true}],"provisionalReview":"what remains implicit"}. A closure must preserve canonical state, unresolved questions, provisional entities/locations, and pending jobs. Do not mutate state.\n\nSEQUENCE: ${JSON.stringify(sequence)}\nSCENE PACKET: ${JSON.stringify(packet)}\nOPEN QUESTIONS: ${JSON.stringify(questions.slice(-30))}`;
    const model = world.model || ExperimentalWorldsState.globalSettings.defaultModel;
    const response = await fetch(ExperimentalWorldsHost.apiBase() + '/chat/completions', { method: 'POST', signal: options.signal, headers: { ...ExperimentalWorldsHost.authHeaders(), 'Content-Type': 'application/json', ...ExperimentalWorldsHost.attributionHeaders() }, body: JSON.stringify(ExperimentalWorldsHost.applyOpenRouterRouting({ model, max_tokens: 1000, temperature: 0, messages: [{ role: 'system', content: prompt }, { role: 'user', content: 'Reconcile sequence closure.' }] }, world, { scope: 'sidecar' })) });
    if (!response.ok) throw new Error((await response.text()).slice(0, 800) || `Sequence closure failed (${response.status})`);
    const parsed = safeParseJSONRepair((await response.json())?.choices?.[0]?.message?.content || '{}') || {};
    const reconciliation = { status: ['ready', 'blocked', 'needs_author'].includes(parsed.status) ? parsed.status : 'needs_author', summary: String(parsed.summary || '').slice(0, 2000), blockingQuestionIds: Array.isArray(parsed.blockingQuestionIds) ? parsed.blockingQuestionIds.slice(0, 30) : [], provisionalReview: String(parsed.provisionalReview || '').slice(0, 1200), generatedAt: new Date().toISOString(), provenance: { source: 'sequence_closure_reconciliation', model } };
    sequence.closure = { ...(sequence.closure || {}), reconciliation };
    (Array.isArray(parsed.questions) ? parsed.questions : []).slice(0, 8).forEach(question => queueSidecarQuestion(world, sess, question.prompt || 'Closure clarification required.', reconciliation.summary, { id: question.id || '', origin: 'sequence_closure', target: 'user', priority: question.blocking ? 'high' : 'medium', blocking: question.blocking === true, scope: 'sequence', sequenceId: sequence.id }));
    recordSidecarTrace(world, sess, { kind: 'sequence_closure_reconciliation', prompt, reply: parsed, model });
    await ExperimentalWorldsHost.persist();
    return reconciliation;
}

async function requestSceneBoundaryReview(world, sess, options = {}) {
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    const hierarchy = protocol && window.ExperimentalWorldsSidecarTimeline?.ensureHierarchy(protocol, sess, { createWhenMissing: false });
    if (!protocol || !hierarchy?.scene) throw new Error('No active Sidecar scene.');
    const packet = buildSidecarScenePacket(world, sess);
    const model = world.model || ExperimentalWorldsState.globalSettings.defaultModel;
    const prompt = `[SCENE BOUNDARY REVIEW]\nDetermine whether a material circumstance change warrants proposing a new scene. Do not mutate canon. Return JSON only: {"shouldClose":true|false,"title":"short title","mode":"continuous|discontinuous","evidence":"why","questionIds":["existing IDs"]}. A scene boundary is a proposal for author review, never an automatic close.\nREASON: ${String(options.reason || 'author requested review').slice(0, 500)}\nPACKET: ${JSON.stringify(packet)}\nRECENT TURNS: ${JSON.stringify((protocol.turns || []).slice(-8).map(turn => ({ id: turn.id, narration: String(turn.narration || '').slice(0, 1000), sceneId: turn.sceneId })))} `;
    const response = await fetch(ExperimentalWorldsHost.apiBase() + '/chat/completions', { method: 'POST', signal: options.signal, headers: { ...ExperimentalWorldsHost.authHeaders(), 'Content-Type': 'application/json', ...ExperimentalWorldsHost.attributionHeaders() }, body: JSON.stringify(ExperimentalWorldsHost.applyOpenRouterRouting({ model, max_tokens: 700, temperature: 0, messages: [{ role: 'system', content: prompt }, { role: 'user', content: 'Review the current scene boundary.' }] }, world, { scope: 'sidecar' })) });
    if (!response.ok) throw new Error((await response.text()).slice(0, 800) || `Scene review failed (${response.status})`);
    const parsed = safeParseJSONRepair((await response.json())?.choices?.[0]?.message?.content || '{}') || {};
    const review = { id: `scene_review_${Date.now().toString(36)}`, sceneId: hierarchy.scene.id, shouldClose: parsed.shouldClose === true, title: String(parsed.title || 'New scene').slice(0, 180), mode: parsed.mode === 'discontinuous' ? 'discontinuous' : 'continuous', evidence: String(parsed.evidence || '').slice(0, 1600), questionIds: Array.isArray(parsed.questionIds) ? parsed.questionIds.slice(0, 12) : [], status: 'proposed', createdAt: new Date().toISOString(), provenance: { source: 'scene_boundary_review', model, reason: options.reason || 'author_requested' } };
    protocol.sceneBoundaryReviews = Array.isArray(protocol.sceneBoundaryReviews) ? protocol.sceneBoundaryReviews : [];
    protocol.sceneBoundaryReviews.push(review); protocol.sceneBoundaryReviews = protocol.sceneBoundaryReviews.slice(-40);
    hierarchy.scene.provisionalReview = { ...(hierarchy.scene.provisionalReview || {}), ...review };
    recordSidecarTrace(world, sess, { kind: 'scene_boundary_review', prompt, reply: parsed, model });
    await ExperimentalWorldsHost.persist();
    return review;
}

async function planAndApproveWorldSequence() {
    const world = ExperimentalWorldsState.worlds.find(item => item.id === ExperimentalWorldsState.activeWorldId);
    const sess = getCurrentWorldSession();
    if (!world || !sess || !window.ExperimentalWorldsSidecarHooks?.isSidecarWorld?.(world, sess)) {
        ExperimentalWorldsHost.notify('Sequence planning is available in Sidecar worlds.', 'info');
        return;
    }
    const authorIntent = prompt('What cut or continuation do you want for the next sequence?\n\nThis is an authorial planning request, not in-character dialogue.', '');
    if (!authorIntent?.trim()) return;
    const typing = document.getElementById('world-dm-typing');
    const label = document.getElementById('world-dm-typing-label');
    if (typing) typing.style.display = 'flex';
    if (label) label.textContent = 'The Narrator is preparing the next scene…';
    try {
        const { packet } = await requestSequencePlanningPacket(world, sess, authorIntent.trim());
        const detail = [
            `Transition: ${packet.transitionMode === 'continuous' ? 'continuous — preserve the current beat' : 'discontinuous — allow an establishing beat'}`,
            packet.continuity || 'No additional continuity direction was required.',
            packet.constraints.length ? `\nPreserve:\n• ${packet.constraints.join('\n• ')}` : '',
            packet.openQuestions.length ? `\nStill open:\n• ${packet.openQuestions.join('\n• ')}` : ''
        ].filter(Boolean).join('\n');
        ExperimentalWorldsHost.confirmModal('Approve new sequence', detail, async () => {
            const protocol = window.ExperimentalWorldsSidecarHooks.normalizeWorldTimeline(world, sess);
            const result = window.ExperimentalWorldsSidecarTimeline?.approvePlanning(protocol, sess, packet, {
                transitionMode: packet.transitionMode,
                title: packet.title,
                closePriorScene: packet.transitionMode === 'discontinuous'
            });
            if (!result) throw new Error('Sequence plan could not be approved.');
            protocol.packet = buildSidecarScenePacket(world, sess);
            await ExperimentalWorldsHost.persist();
            renderWorldPlayState();
            ExperimentalWorldsHost.notify('New sequence approved. The next narrator turn receives its planned starting packet.', 'success');
        });
    } catch (error) {
        ExperimentalWorldsHost.notify(`Sequence planning failed: ${ExperimentalWorldsHost.humanizeApiError(error) || error.message || error}`, 'error');
    } finally {
        if (typing) typing.style.display = 'none';
    }
}

async function promoteImpliedWorldRecord(options = {}) {
    const world = ExperimentalWorldsState.worlds.find(item => item.id === ExperimentalWorldsState.activeWorldId);
    const sess = getCurrentWorldSession();
    if (!world || !sess || !window.ExperimentalWorldsSidecarHooks?.isSidecarWorld?.(world, sess)) {
        ExperimentalWorldsHost.notify('Implied-record promotion is available in Sidecar worlds.', 'info');
        return;
    }
    const protocol = window.ExperimentalWorldsSidecarHooks.normalizeWorldTimeline(world, sess);
    window.ExperimentalWorldsSidecarPromotion?.ensure(protocol);
    const candidates = [...protocol.provisionalLocations, ...protocol.provisionalEntities]
        .filter(record => !['promoted', 'resolved'].includes(record.status));
    if (!candidates.length) {
        ExperimentalWorldsHost.notify('There are no implied locations or characters awaiting review.', 'info');
        return { status: 'empty' };
    }
    const requestedId = String(options.provisionalId || '').trim();
    let record = requestedId ? candidates.find(item => String(item.id || '') === requestedId) : null;
    if (!record && requestedId) throw new Error('That ScenePulse review record is no longer available for promotion.');
    if (!record) {
        const menu = candidates.map((entry, index) => `${index + 1}. ${entry.kind === 'location' ? 'Place' : 'Character'} — ${entry.name}`).join('\n');
        const choice = Number(prompt(`Promote which implied record?\n\n${menu}\n\nEnter a number.`, ''));
        record = candidates[choice - 1];
    }
    if (!record) return { status: 'cancelled' };
    const expectedCandidateId = String(options.candidateId || '').trim();
    if (expectedCandidateId && String(record.scenePulseCandidateId || '') !== expectedCandidateId) {
        throw new Error('The requested ScenePulse candidate no longer matches this review record.');
    }
    const readerCandidate = record.scenePulseCandidateId
        ? protocol.readerCandidates?.find(item => String(item?.candidateId || '') === String(record.scenePulseCandidateId || ''))
        : null;
    const eligibility = readerCandidate ? scenePulseCandidatePromotionEligibility(protocol, readerCandidate) : null;
    // A source candidate may be staged as a visible scaffold immediately,
    // but it only becomes a durable record after recurrent/closed-scene
    // evidence (or a later explicit World resolution). This protects the
    // source surface from shrinking merely because Horde has not caught up.
    if (readerCandidate && !eligibility?.ready && options.allowEarly !== true) {
        record.status = 'awaiting_evidence';
        record.scenePulseDisposition = 'awaiting_scene_evidence';
        record.promotionEligibility = safeJsonClone(eligibility);
        protocol.packet = buildSidecarScenePacket(world, sess);
        await ExperimentalWorldsHost.persist();
        renderWorldPlayState();
        ExperimentalWorldsHost.notify(`${record.name} remains a ScenePulse candidate until it recurs, its scene closes, or World review explicitly resolves it.`, 'info');
        return { status: 'awaiting_evidence', provisionalId: record.id, eligibility };
    }
    const visibleLocations = sessionLocations(world, sess);
    const locationMatch = record.kind === 'location' ? findFuzzyLocation(record.name, visibleLocations) : null;
    const entityMatch = record.kind === 'entity'
        ? world.entities.find(entity => isVisibleToSession(entity, sess) && String(entity.name || '').trim().toLowerCase() === record.name.toLowerCase())
        : null;
    if ((locationMatch || entityMatch) && options.allowDuplicate !== true) {
        const existing = locationMatch || entityMatch;
        record.candidateCanonicalIds = [...new Set([...(record.candidateCanonicalIds || []), existing.id])];
        record.duplicateCanonicalCandidates = [...(Array.isArray(record.duplicateCanonicalCandidates) ? record.duplicateCanonicalCandidates : [])
            .filter(entry => String(entry?.id || '') !== String(existing.id || '')), {
            id: String(existing.id || ''), name: String(existing.name || ''), kind: record.kind,
            detectedAt: new Date().toISOString(), detectedBy: record.kind === 'location' ? 'location comparison' : 'exact character-name comparison'
        }].slice(-8);
        record.status = 'needs_resolution';
        record.scenePulseDisposition = 'duplicate_requires_author_choice';
        await ExperimentalWorldsHost.persist();
        renderWorldPlayState();
        ExperimentalWorldsHost.notify('A possible duplicate is available in ScenePulse Inspect for an explicit author choice.', 'info');
        return { status: 'needs_resolution', provisionalId: record.id, canonicalId: existing.id };
    }
    const earlyDecisionNotice = readerCandidate && !eligibility?.ready
        ? ' This candidate has not yet met the normal repeat-or-scene-closure threshold; this is an explicit author decision, not an automatic promotion.'
        : '';
    ExperimentalWorldsHost.confirmModal(`Promote ${record.name}`, `Create a persistent ${record.kind === 'location' ? 'location' : 'character'} from the details established in recent narration? This does not retroactively change the scene.${earlyDecisionNotice}`, async () => {
        window.ExperimentalWorldsSidecarPromotion?.markPromotionRequested(protocol, record.id);
        const explicitSeparatePromotionId = options.allowDuplicate === true ? String(record.id || '') : '';
        const introducedId = record.kind === 'location'
            ? `loc_${record.id.replace(/^provisional_location_/, '').replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, 100)
            : `ent_${record.id.replace(/^provisional_entity_/, '').replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, 100);
        const frame = buildWorldSceneFrame(world, sess);
        const receipt = {
            summary: `Promoted implied ${record.kind} ${record.name} from established narrative evidence.`,
            scene: { player_location_id: frame.player_location_id, player_location_changed: false, present_character_ids: frame.present_character_ids },
            events: [], entity_updates: [], state_updates: {}
        };
        if (record.kind === 'location') {
            receipt.location_introduced = [{
                id: introducedId,
                name: record.name, description: record.description || 'A location established in recent narration.', region: record.region || '',
                map_type: record.mapType || undefined, parent_location_id: record.parentHint || undefined,
                connects_to: record.parentHint || undefined, floor: record.floor || undefined,
                scenePulseSeparatePromotionId: explicitSeparatePromotionId || undefined
            }];
        } else {
            receipt.npc_introduced = [{ id: introducedId, name: record.name, description: record.description || 'A character established in recent narration.', persona: record.persona || '', home_location: record.parentHint || undefined,
                scenePulseSeparatePromotionId: explicitSeparatePromotionId || undefined }];
        }
        const commit = commitWorldTurnReceipt(world, sess, receipt, {
            playerStartLocationId: sess.playerLocation,
            playerMovementAuthorized: false,
            narrativeText: '', scenePulseSeparatePromotionId: explicitSeparatePromotionId
        }, 'sidecar_conversation');
        const canonical = record.kind === 'location'
            ? world.locations.find(location => location.id === introducedId)
            : world.entities.find(entity => entity.id === introducedId);
        if (!canonical) throw new Error('The native reducer did not create the requested record.');
        window.ExperimentalWorldsSidecarPromotion?.markPromoted(protocol, record.id, canonical.id);
        const visualOutcome = {
            ...(applyScenePulsePromotionAppearance(canonical, record) || {}),
            ...(applyScenePulsePromotionLocation(canonical, record) || {})
        };
        if (readerCandidate) markScenePulseCandidatePromotionOutcome(protocol, record, canonical, 'promoted');
        protocol.refinements.push({ id: `promotion_${Date.now().toString(36)}`, createdAt: new Date().toISOString(), source: 'direct_user_refinement',
            userText: `Promoted implied ${record.kind}: ${record.name}`, committed: true, audit: safeJsonClone(commit.audit), provisionalId: record.id, canonicalId: canonical.id,
            candidateId: String(record.scenePulseCandidateId || ''), visualOutcome: safeJsonClone(visualOutcome || {}) });
        protocol.refinements = protocol.refinements.slice(-200);
        protocol.packet = buildSidecarScenePacket(world, sess);
        await ExperimentalWorldsHost.persist();
        renderWorldPlayState();
        ExperimentalWorldsHost.notify(`${record.name} is now a persistent ${record.kind === 'location' ? 'location' : 'character'}.`, 'success');
    });
    return { status: 'confirmation_required', provisionalId: record.id, eligibility };
}

function renderWorldItemCatalogControls(world = ExperimentalWorldsState.editingWorld) {
    const container = document.getElementById('w-rules-item-catalog');
    if (!container || !world || !globalThis.ExperimentalWorldsRpgMechanics) return;
    const rules = normalizeWorldGameRules(world);
    container.innerHTML = rules.itemCatalog.length ? rules.itemCatalog.map(item => `
        <article class="world-item-card" data-world-item-id="${escapeHTML(item.id)}">
            <div><span>${escapeHTML(item.type)}${item.slot ? ` · ${escapeHTML(item.slot)}` : ''}</span><strong>${escapeHTML(item.name)}</strong>
            <small>${escapeHTML([item.damage && `Damage ${item.damage}`, item.armor && `Armor ${item.armor}`, globalThis.ExperimentalWorldsRpgMechanics.describeModifiers(item)].filter(Boolean).join(' · ') || item.description || 'Narrative item')}</small></div>
            <div><button class="btn btn-ghost btn-small" data-world-item-edit type="button">Edit</button><button class="btn btn-ghost btn-small" data-world-item-delete type="button">Remove</button></div>
        </article>`).join('') : '<div class="form-hint">No authored items yet. Old text inventories still work; add cards when equipment needs real stats or bonuses.</div>';
    container.querySelectorAll('[data-world-item-id]').forEach(card => {
        const item = rules.itemCatalog.find(entry => entry.id === card.dataset.worldItemId);
        card.querySelector('[data-world-item-edit]').onclick = () => openWorldItemEditor(world, item);
        card.querySelector('[data-world-item-delete]').onclick = () => {
            rules.itemCatalog = rules.itemCatalog.filter(entry => entry.id !== item.id);
            world.gameRules.itemCatalog = rules.itemCatalog;
            renderWorldItemCatalogControls(world); updateWorldTokenCount();
        };
    });
    const add = document.getElementById('w-rules-add-item');
    if (add) add.onclick = () => openWorldItemEditor(world);
}

function openWorldItemEditor(world, value = null) {
    if (!world || !globalThis.ExperimentalWorldsRpgMechanics) return;
    const rules = normalizeWorldGameRules(world);
    const item = globalThis.ExperimentalWorldsRpgMechanics.normalizeItem(value || { name: 'New item', type: 'custom' });
    let overlay = document.getElementById('world-item-editor-overlay');
    if (!overlay) { overlay = document.createElement('div'); overlay.id = 'world-item-editor-overlay'; overlay.className = 'modal-overlay'; document.body.appendChild(overlay); }
    const options = globalThis.ExperimentalWorldsRpgMechanics.TYPES.map(type => `<option value="${type}" ${item.type === type ? 'selected' : ''}>${type}</option>`).join('');
    const slots = [...new Set(['', ...(rules.equipmentSlots || []), item.slot].filter(value => value !== undefined))]
        .map(slot => `<option value="${escapeHTML(slot)}" ${item.slot === slot ? 'selected' : ''}>${escapeHTML(slot || 'Not equipable')}</option>`).join('');
    overlay.innerHTML = `<div class="modal world-item-editor-modal" role="dialog" aria-modal="true"><header><div><span class="vh-eyebrow">WORLD ITEM</span><h2>${value ? 'Edit item' : 'Create item'}</h2><p>One reusable definition for inventories, shops, rewards and loadouts.</p></div><button class="labs-close-btn" data-item-close type="button">✕</button></header><div class="world-item-editor-grid">
        <label><span>Name</span><input class="form-input" data-item-name value="${escapeHTML(item.name)}"></label><label><span>Type</span><select class="form-select" data-item-type>${options}</select></label>
        <label><span>Equipment slot</span><select class="form-select" data-item-slot>${slots}</select></label><label><span>Quantity</span><input class="form-input" data-item-quantity type="number" min="1" value="${item.quantity}"></label>
        <label><span>Damage dice</span><input class="form-input" data-item-damage value="${escapeHTML(item.damage)}" placeholder="1d8+2"></label><label><span>Damage type</span><input class="form-input" data-item-damage-type value="${escapeHTML(item.damageType)}" placeholder="slashing, fire…"></label>
        <label><span>Armor</span><input class="form-input" data-item-armor type="number" value="${item.armor}"></label><label><span>Value / price</span><input class="form-input" data-item-value type="number" min="0" value="${item.value}"></label>
        <label><span>Weight</span><input class="form-input" data-item-weight type="number" min="0" step="0.1" value="${item.weight}"></label><label><span>Rarity</span><input class="form-input" data-item-rarity value="${escapeHTML(item.rarity)}"></label>
        <label class="world-item-wide"><span>Description</span><textarea class="form-textarea" data-item-description rows="3">${escapeHTML(item.description)}</textarea></label>
        <label class="world-item-wide"><span>Mechanical bonuses · one per line</span><textarea class="form-textarea" data-item-modifiers rows="6" placeholder="checks=1&#10;stats:hp=5&#10;skills:stealth=2">${escapeHTML(worldItemModifierLines(item))}</textarea><small>checks, damage, armor, attributes:Name, skills:Name, stats:ID, defenses:Name and resources:Name are supported.</small></label>
        <label class="world-item-wide"><span>Requirements</span><div class="world-item-inline"><input class="form-input" data-item-level type="number" min="0" value="${item.requirements?.level || 0}" placeholder="Level"><input class="form-input" data-item-requirement-text value="${escapeHTML(item.requirements?.text || '')}" placeholder="Narrative requirement"></div></label>
    </div><footer><button class="btn btn-ghost" data-item-cancel type="button">Cancel</button><button class="btn btn-primary" data-item-save type="button">Save item</button></footer></div>`;
    overlay.classList.remove('hidden');
    const close = () => overlay.classList.add('hidden');
    overlay.querySelector('[data-item-close]').onclick = close; overlay.querySelector('[data-item-cancel]').onclick = close;
    overlay.querySelector('[data-item-save]').onclick = () => {
        const read = selector => overlay.querySelector(selector)?.value;
        const name = String(read('[data-item-name]') || '').trim();
        if (!name) return ExperimentalWorldsHost.notify('Give the item a name.', 'error');
        const saved = globalThis.ExperimentalWorldsRpgMechanics.normalizeItem({ ...item, name, type: read('[data-item-type]'), slot: read('[data-item-slot]'), quantity: read('[data-item-quantity]'), damage: read('[data-item-damage]'), damageType: read('[data-item-damage-type]'), armor: read('[data-item-armor]'), value: read('[data-item-value]'), weight: read('[data-item-weight]'), rarity: read('[data-item-rarity]'), description: read('[data-item-description]'), modifiers: parseWorldItemModifiers(read('[data-item-modifiers]')), requirements: { ...item.requirements, level: read('[data-item-level]'), text: read('[data-item-requirement-text]') } });
        const index = rules.itemCatalog.findIndex(entry => entry.id === item.id);
        if (index >= 0) rules.itemCatalog[index] = saved; else rules.itemCatalog.push(saved);
        world.gameRules.itemCatalog = rules.itemCatalog; close(); renderWorldItemCatalogControls(world); updateWorldTokenCount();
    };
}

function loadWorldGameRuleControls(world) {
    if (!world) return;
    const rules = normalizeWorldGameRules(world);
    const profile = document.getElementById('w-rules-profile');
    if (profile) profile.value = rules.profileId;
    const profileDescription = document.getElementById('w-rules-profile-description');
    if (profileDescription) profileDescription.textContent = worldRuleProfileDescription(rules.profileId);
    document.querySelectorAll('#w-rules-modules-grid [data-rule-module]').forEach(input => {
        input.checked = !!rules.modules[input.dataset.ruleModule];
    });
    const vital = document.getElementById('w-rules-vital-stat');
    const currency = document.getElementById('w-rules-currency-stat');
    if (!vital || !currency) return;
    const options = (world.hudConfig?.stats || [])
        .map(stat => `<option value="${escapeHTML(stat.id)}">${escapeHTML(stat.name || stat.id)}</option>`).join('');
    vital.innerHTML = `<option value="">None</option>${options}`;
    currency.innerHTML = `<option value="">None</option>${options}`;
    vital.value = rules.vitalStatId;
    currency.value = rules.currencyStatId;
    document.getElementById('w-rules-zero-hp-mode').value = rules.zeroHpMode;
    document.getElementById('w-rules-currency-name').value = rules.currencyName;
    if (document.getElementById('w-rules-equipment-slots')) document.getElementById('w-rules-equipment-slots').value = rules.equipmentSlots.join(', ');
    renderWorldItemCatalogControls(world);
    const dice = normalizeWorldDiceConfig(world);
    if (document.getElementById('w-dice-resolution')) document.getElementById('w-dice-resolution').value = dice.resolution;
    if (document.getElementById('w-dice-sides')) document.getElementById('w-dice-sides').value = String(dice.sides);
    if (document.getElementById('w-dice-modifier-mode')) document.getElementById('w-dice-modifier-mode').value = dice.modifierMode;
    if (document.getElementById('w-dice-default-difficulty')) document.getElementById('w-dice-default-difficulty').value = dice.defaultDifficulty;
    if (document.getElementById('w-dice-visibility')) document.getElementById('w-dice-visibility').value = dice.visibility;
    if (document.getElementById('w-dice-criticals')) document.getElementById('w-dice-criticals').checked = dice.criticals;
    const capabilities = normalizeWorldCapabilities(world);
    if (document.getElementById('w-capabilities-customizable')) document.getElementById('w-capabilities-customizable').checked = capabilities.customizable;
    if (document.getElementById('w-capability-budget')) document.getElementById('w-capability-budget').value = capabilities.startingPointBudget;
    if (document.getElementById('w-capability-skills')) document.getElementById('w-capability-skills').value = worldCapabilityLines(capabilities.skills);
    if (document.getElementById('w-capability-perks')) document.getElementById('w-capability-perks').value = worldCapabilityLines(capabilities.perks);
    if (document.getElementById('w-capability-flaws')) document.getElementById('w-capability-flaws').value = worldCapabilityLines(capabilities.flaws);
    if (document.getElementById('w-progression-enabled')) document.getElementById('w-progression-enabled').checked = capabilities.progression.enabled;
    if (document.getElementById('w-progression-method')) document.getElementById('w-progression-method').value = capabilities.progression.method;
    const consequencePolicy = rules.consequences || {};
    if (document.getElementById('w-consequences-enabled')) document.getElementById('w-consequences-enabled').checked = consequencePolicy.enabled !== false;
    if (document.getElementById('w-consequences-max')) document.getElementById('w-consequences-max').value = consequencePolicy.maxActive || 120;
    if (document.getElementById('w-consequences-escalation')) document.getElementById('w-consequences-escalation').value = consequencePolicy.escalationTurns ?? 4;
    if (document.getElementById('w-consequences-decay')) document.getElementById('w-consequences-decay').value = consequencePolicy.decayTurns ?? 8;
    document.querySelectorAll('[data-rule-detail]').forEach(container => {
        const enabled = !!rules.modules[container.dataset.ruleDetail];
        container.style.opacity = enabled ? '1' : '0.42';
        container.querySelectorAll('input, select, button').forEach(control => {
            control.disabled = !enabled;
        });
    });
    const schedulesControl = document.getElementById('w-hud-enable-schedules');
    if (schedulesControl) schedulesControl.checked = !!rules.modules.schedules;
    const questHudControl = document.getElementById('w-hud-show-quests');
    if (questHudControl) questHudControl.disabled = !rules.modules.quests;
    const inventoryHudControl = document.getElementById('w-hud-show-inventory');
    if (inventoryHudControl) inventoryHudControl.disabled = !rules.modules.inventory;
}

function saveWorldGameRuleControls(world, statIdRenames = new Map()) {
    if (!world) return;
    const vitalControl = document.getElementById('w-rules-vital-stat');
    const currencyControl = document.getElementById('w-rules-currency-stat');
    const requestedVital = statIdRenames.get(vitalControl?.value || '') || vitalControl?.value || '';
    const requestedCurrency = statIdRenames.get(currencyControl?.value || '') || currencyControl?.value || '';
    world.gameRules = isPlainObject(world.gameRules) ? world.gameRules : {};
    world.gameRules.profileId = document.getElementById('w-rules-profile')?.value || 'custom';
    world.gameRules.modules = {};
    document.querySelectorAll('#w-rules-modules-grid [data-rule-module]').forEach(input => {
        world.gameRules.modules[input.dataset.ruleModule] = !!input.checked;
    });
    const selectedProfile = WORLD_RULE_PROFILES[world.gameRules.profileId];
    if (selectedProfile && WORLD_RULE_MODULE_KEYS.some(key =>
        world.gameRules.modules[key] !== selectedProfile.modules[key])) {
        world.gameRules.profileId = 'custom';
    }
    normalizeWorldGameRules(world);
    const statIds = new Set((world.hudConfig?.stats || []).map(stat => stat.id));
    world.gameRules.vitalStatId = statIds.has(requestedVital) ? requestedVital : '';
    world.gameRules.currencyStatId = statIds.has(requestedCurrency) ? requestedCurrency : '';
    world.gameRules.zeroHpMode = document.getElementById('w-rules-zero-hp-mode')?.value === 'lethal'
        ? 'lethal' : 'fail_forward';
    world.gameRules.currencyName = String(document.getElementById('w-rules-currency-name')?.value || 'coin').trim().slice(0, 60) || 'coin';
    world.gameRules.equipmentSlots = [...new Set(String(document.getElementById('w-rules-equipment-slots')?.value || '')
        .split(',').map(slot => slot.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean))].slice(0, 30);
    world.gameRules.dice = normalizeWorldDiceConfig({ gameRules: { dice: {
        resolution: document.getElementById('w-dice-visibility')?.value === 'player_triggered'
            ? 'player' : document.getElementById('w-dice-resolution')?.value,
        sides: document.getElementById('w-dice-sides')?.value,
        modifierMode: document.getElementById('w-dice-modifier-mode')?.value,
        defaultDifficulty: document.getElementById('w-dice-default-difficulty')?.value,
        visibility: document.getElementById('w-dice-visibility')?.value,
        criticals: document.getElementById('w-dice-criticals')?.checked !== false
    } } });
    world.gameRules.capabilities = {
        customizable: document.getElementById('w-capabilities-customizable')?.checked !== false,
        startingPointBudget: document.getElementById('w-capability-budget')?.value,
        skills: parseWorldCapabilityLines(document.getElementById('w-capability-skills')?.value, 'skill'),
        perks: parseWorldCapabilityLines(document.getElementById('w-capability-perks')?.value, 'perk'),
        flaws: parseWorldCapabilityLines(document.getElementById('w-capability-flaws')?.value, 'flaw'),
        progression: {
            enabled: document.getElementById('w-progression-enabled')?.checked === true,
            method: document.getElementById('w-progression-method')?.value || ''
        }
    };
    normalizeWorldCapabilities(world);
    world.gameRules.consequences = {
        enabled: document.getElementById('w-consequences-enabled')?.checked !== false,
        maxActive: document.getElementById('w-consequences-max')?.value,
        escalationTurns: document.getElementById('w-consequences-escalation')?.value,
        decayTurns: document.getElementById('w-consequences-decay')?.value
    };
    normalizeWorldGameRules(world);
    world.hudConfig.enableSchedules = !!world.gameRules.modules.schedules;
}

function syncWorldStudioStatsFromDOM(world) {
    const renames = new Map();
    if (!world?.hudConfig || !Array.isArray(world.hudConfig.stats)) return renames;
    const cards = [...document.querySelectorAll('#w-hud-stats-list .studio-card')];
    cards.forEach((card, index) => {
        const stat = world.hudConfig.stats[index];
        if (!stat) return;
        const oldId = stat.id;
        const requestedId = String(card.querySelector('.stat-id')?.value || oldId).trim().slice(0, 80);
        stat.id = requestedId || oldId;
        stat.name = String(card.querySelector('.stat-name')?.value || stat.name || stat.id).trim().slice(0, 120) || stat.id;
        const value = Number(card.querySelector('.stat-val')?.value);
        const min = Number(card.querySelector('.stat-min')?.value);
        const max = Number(card.querySelector('.stat-max')?.value);
        stat.value = Number.isFinite(value) ? value : 0;
        stat.min = Number.isFinite(min) ? min : 0;
        stat.max = Number.isFinite(max) ? Math.max(0, max) : 0;
        stat.color = String(card.querySelector('.stat-color')?.value || stat.color || 'var(--accent)').trim();
        stat.roll = {
            enabled: !!card.querySelector('.stat-roll-enabled')?.checked,
            mode: card.querySelector('.stat-roll-mode')?.value || 'normalized',
            direction: card.querySelector('.stat-roll-direction')?.value === 'lower' ? 'lower' : 'higher',
            scale: Math.max(1, Number(card.querySelector('.stat-roll-scale')?.value) || 10),
            fixedModifier: Math.max(-10, Math.min(10, Math.trunc(Number(card.querySelector('.stat-roll-fixed')?.value) || 0)))
        };
        if (oldId !== stat.id) renames.set(oldId, stat.id);
    });
    return renames;
}

function worldStatColorHex(value) {
    const raw = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
    const named = {
        'var(--red)': '#e63946', 'var(--accent)': '#e63946', 'var(--success)': '#30d158',
        'var(--warning)': '#ffb020', 'var(--cyan)': '#00f5ff', 'var(--purple)': '#b892ff'
    };
    if (named[raw.toLowerCase()]) return named[raw.toLowerCase()];
    const short = raw.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
    return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : '#e63946';
}

function renderWorldStudioStats() {
    const w = ExperimentalWorldsState.editingWorld;
    if (!w) return;
    const container = document.getElementById('w-hud-stats-list');
    if (!container) return;
    container.innerHTML = '';

    w.hudConfig.stats.forEach((stat, idx) => {
        const rollConfig = worldStatRollConfig(stat);
        const div = document.createElement('div');
        div.className = 'studio-card';
        div.style.padding = '12px';
        div.style.display = 'grid';
        div.style.gridTemplateColumns = 'repeat(auto-fit, minmax(110px, 1fr))';
        div.style.gap = '10px';
        div.style.alignItems = 'center';

        div.innerHTML = `
            <div>
                <label style="font-size:0.6rem; opacity:0.6;">Internal ID</label>
                <input type="text" class="form-input stat-id" value="${escapeHTML(stat.id)}" placeholder="hp">
            </div>
            <div>
                <label style="font-size:0.6rem; opacity:0.6;">Display Name</label>
                <input type="text" class="form-input stat-name" value="${escapeHTML(stat.name)}" placeholder="Health">
            </div>
            <div>
                <label style="font-size:0.6rem; opacity:0.6;">Initial Value</label>
                <input type="number" class="form-input stat-val" value="${escapeHTML(String(stat.value))}">
            </div>
            <div>
                <label style="font-size:0.6rem; opacity:0.6;">Minimum</label>
                <input type="number" class="form-input stat-min" value="${escapeHTML(String(stat.min ?? 0))}">
            </div>
            <div>
                <label style="font-size:0.6rem; opacity:0.6;">Maximum (0 = none)</label>
                <input type="number" class="form-input stat-max" value="${escapeHTML(String(stat.max ?? 0))}" min="0">
            </div>
            <div>
                <label style="font-size:0.6rem; opacity:0.6;">Color</label>
                <input type="color" class="form-input stat-color smart-color-input" value="${escapeHTML(worldStatColorHex(stat.color))}" title="Choose the HUD color">
            </div>
            <label class="stat-roll-toggle">
                <input type="checkbox" class="stat-roll-enabled" ${rollConfig.enabled ? 'checked' : ''}>
                <span><strong>Usable in checks</strong><small>Resources such as health, money and XP should normally stay off.</small></span>
            </label>
            <div>
                <label style="font-size:0.6rem; opacity:0.6;">Roll formula</label>
                <select class="form-select stat-roll-mode">
                    <option value="normalized" ${rollConfig.mode === 'normalized' ? 'selected' : ''}>Normalized to −3…+3</option>
                    <option value="ability" ${rollConfig.mode === 'ability' ? 'selected' : ''}>Ability: floor((value−10)/2)</option>
                    <option value="direct" ${rollConfig.mode === 'direct' ? 'selected' : ''}>Value ÷ scale</option>
                    <option value="fixed" ${rollConfig.mode === 'fixed' ? 'selected' : ''}>Fixed modifier</option>
                </select>
            </div>
            <div>
                <label style="font-size:0.6rem; opacity:0.6;">Direction</label>
                <select class="form-select stat-roll-direction"><option value="higher" ${rollConfig.direction !== 'lower' ? 'selected' : ''}>Higher is better</option><option value="lower" ${rollConfig.direction === 'lower' ? 'selected' : ''}>Lower is better</option></select>
            </div>
            <div>
                <label style="font-size:0.6rem; opacity:0.6;">Direct scale</label>
                <input type="number" class="form-input stat-roll-scale" min="1" value="${escapeHTML(String(rollConfig.scale))}">
            </div>
            <div>
                <label style="font-size:0.6rem; opacity:0.6;">Fixed modifier</label>
                <input type="number" class="form-input stat-roll-fixed" min="-10" max="10" value="${escapeHTML(String(rollConfig.fixedModifier))}">
            </div>
            <button class="tool-btn tool-btn-danger del-stat" style="margin-top:15px;">✕</button>
        `;

        div.querySelector('.stat-id').oninput = (e) => {
            const oldId = stat.id;
            stat.id = e.target.value.trim();
            if (w.gameRules?.vitalStatId === oldId) w.gameRules.vitalStatId = stat.id;
            if (w.gameRules?.currencyStatId === oldId) w.gameRules.currencyStatId = stat.id;
            loadWorldGameRuleControls(w);
        };
        div.querySelector('.stat-name').oninput = (e) => {
            stat.name = e.target.value;
            loadWorldGameRuleControls(w);
        };
        div.querySelector('.stat-val').oninput = (e) => stat.value = Number(e.target.value) || 0;
        div.querySelector('.stat-min').oninput = (e) => stat.min = Number(e.target.value) || 0;
        div.querySelector('.stat-max').oninput = (e) => stat.max = Math.max(0, Number(e.target.value) || 0);
        div.querySelector('.stat-color').oninput = (e) => stat.color = e.target.value;
        const ensureRoll = () => (stat.roll ||= { ...rollConfig });
        div.querySelector('.stat-roll-enabled').onchange = (e) => { ensureRoll().enabled = e.target.checked; };
        div.querySelector('.stat-roll-mode').onchange = (e) => { ensureRoll().mode = e.target.value; };
        div.querySelector('.stat-roll-direction').onchange = (e) => { ensureRoll().direction = e.target.value; };
        div.querySelector('.stat-roll-scale').oninput = (e) => { ensureRoll().scale = Math.max(1, Number(e.target.value) || 10); };
        div.querySelector('.stat-roll-fixed').oninput = (e) => { ensureRoll().fixedModifier = Math.max(-10, Math.min(10, Number(e.target.value) || 0)); };
        div.querySelector('.del-stat').onclick = () => {
            if (w.gameRules?.vitalStatId === stat.id) w.gameRules.vitalStatId = '';
            if (w.gameRules?.currencyStatId === stat.id) w.gameRules.currencyStatId = '';
            w.hudConfig.stats.splice(idx, 1);
            renderWorldStudioStats();
            loadWorldGameRuleControls(w);
        };

        container.appendChild(div);
    });
}

function renderWorlds() {
    const grid = document.getElementById('world-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    const searchVal = document.getElementById('world-search')?.value.toLowerCase() || '';
    let list = ExperimentalWorldsState.worlds.filter(w => String(w.name || '').toLowerCase().includes(searchVal));
    const visibleCount = document.getElementById('world-visible-count');
    const totalCount = document.getElementById('world-total-count');
    if (visibleCount) visibleCount.textContent = list.length;
    if (totalCount) totalCount.textContent = ExperimentalWorldsState.worlds.length;

    list.forEach(world => {
        const card = document.createElement('div');
        card.className = 'char-card';
        const timelines = ExperimentalWorldsState.worldInstances?.[world.id]?.sessions || [];
        const selectedTimelineId = ExperimentalWorldsState.worldInstances?.[world.id]?.activeSessionId || timelines[0]?.id || '';
        const timelineOptions = timelines.map(session =>
            `<option value="${escapeHTML(session.id)}"${session.id === selectedTimelineId ? ' selected' : ''}>${escapeHTML(session.name || session.id)} · ${Number(session.turnCount || 0)} turns</option>`
        ).join('');
        const bannerStyle = world.banner ? `background-image: url('${cssUrl(world.banner)}'); background-size: cover; background-position: center;` : `background: linear-gradient(135deg, var(--red), var(--surface));`;
        card.innerHTML = `
            <div class="char-card-banner" style="height: 100px; ${bannerStyle}"></div>
            <div class="char-card-body">
                <div class="char-card-name">${escapeHTML(world.name)}</div>
                ${ExperimentalWorldsHost.worldLoadWarning(world.id) ? `<div class="world-library-warning">Needs repair · ${escapeHTML(ExperimentalWorldsHost.worldLoadWarning(world.id))}</div>` : ''}
                <div class="char-card-desc">${escapeHTML(world.description || 'No description')}</div>
                <div style="display:flex; gap:8px; margin-top:12px;">
                    <button class="btn btn-ghost btn-full enter-world-btn">Enter World →</button>
                    <button class="btn btn-ghost edit-world-btn" title="Open this world in World Studio">Edit</button>
                </div>
                <div style="display:flex; gap:8px; margin-top:8px; align-items:center;">
                    <select class="form-select world-hub-timeline-select" ${timelines.length ? '' : 'disabled'} style="min-width:0; flex:1;"><option value="">${timelines.length ? 'Choose timeline…' : 'No timelines yet'}</option>${timelineOptions}</select>
                    <button class="btn btn-ghost world-hub-enter-timeline-btn" ${timelines.length ? '' : 'disabled'} title="Enter the selected timeline">Enter timeline</button>
                </div>
            </div>
        `;
        card.querySelector('.edit-world-btn').onclick = (e) => {
            e.stopPropagation();
            openWorldStudio(world.id);
        };
        card.querySelector('.enter-world-btn').onclick = (e) => {
            e.stopPropagation();
            enterWorld(world.id);
        };
        card.querySelector('.world-hub-enter-timeline-btn').onclick = (e) => {
            e.stopPropagation();
            const sessionId = card.querySelector('.world-hub-timeline-select').value;
            if (sessionId) enterWorld(world.id, sessionId);
        };
        grid.appendChild(card);
    });

    const recoverable = Object.values(ExperimentalWorldsState.worldRecoverySnapshots || {})
        .filter(snapshot => isPlainObject(snapshot?.world)
            && !ExperimentalWorldsState.worlds.some(world => world.id === snapshot.world.id)
            && String(snapshot.world.name || '').toLowerCase().includes(searchVal));
    recoverable.forEach(snapshot => {
        const world = snapshot.world;
        const card = document.createElement('div');
        card.className = 'char-card world-recovery-card';
        card.innerHTML = `<div class="char-card-banner world-recovery-banner">↶</div>
            <div class="char-card-body">
                <div class="char-card-name">${escapeHTML(world.name || 'Recovered World')}</div>
                <div class="char-card-desc">Safety copy from ${escapeHTML(snapshot.capturedAt ? new Date(snapshot.capturedAt).toLocaleString() : 'an earlier save')}.</div>
                <button class="btn btn-primary btn-full recover-world-card-btn">Restore World</button>
            </div>`;
        card.querySelector('.recover-world-card-btn').onclick = async () => {
            if (ExperimentalWorldsState.worlds.some(item => item.id === world.id)) return;
            const restored = safeJsonClone(world);
            // World recovery belongs to the Experimental authority.  Reading
            // the host database here would make a stock-host cleanup or a
            // future upstream store change silently break this mode.
            const storedMedia = (await window.ExperimentalWorldsRepository?.snapshot?.())?.worldMediaAssets || {};
            if (Array.isArray(storedMedia[restored.id])) restored.mediaAssets = storedMedia[restored.id];
            ExperimentalWorldsState.worlds.push(restored);
            delete ExperimentalWorldsState.worldRecoverySnapshots[restored.id];
            ExperimentalWorldsHost.markMediaChanged();
            await ExperimentalWorldsHost.persist();
            renderWorlds();
            ExperimentalWorldsHost.notify(`Restored "${restored.name}" and reconnected its existing sessions.`, 'success');
        };
        grid.appendChild(card);
    });

    if (list.length === 0 && recoverable.length === 0) {
        const hasFilter = !!searchVal.trim();
        grid.innerHTML = `<div class="empty-state"><h3>${hasFilter ? 'No Worlds Match This Search' : 'No Worlds Found'}</h3><p>${hasFilter ? 'Clear the search to show every saved world.' : 'Import a world or click "+ Create New World" to begin.'}</p>${hasFilter ? '<button class="btn btn-ghost clear-world-search-btn">Clear Search</button>' : ''}</div>`;
        const clear = grid.querySelector('.clear-world-search-btn');
        if (clear) clear.onclick = () => { document.getElementById('world-search').value = ''; renderWorlds(); };
    }
}
