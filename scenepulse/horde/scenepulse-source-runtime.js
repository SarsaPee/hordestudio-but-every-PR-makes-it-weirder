/*
 * ScenePulse native runtime bridge for Horde Worlds.
 *
 * This is deliberately a compatibility scaffold, not a replacement renderer.
 * The vendored ScenePulse modules below create their own panel, dashboard,
 * history scrubber, thoughts, wiki, relationship web, effects and edit-mode
 * DOM. Horde supplies a narrow SillyTavern-shaped context for that one active
 * World surface. Sidecar remains the persisted turn/provider authority.
 *
 * Do not import ScenePulse's index.js here. Its event interceptor owns an ST
 * conversation and independently invokes provider generation. In Worlds,
 * source refresh controls are routed to the existing Sidecar Reader boundary
 * instead, so the two systems can be compared without silently racing calls.
 */
(function hordeScenePulseSourceRuntime(global) {
    'use strict';

    const SOURCE = Object.freeze({
        revision: '2888d0d748033c5b16eac410f5396af055142483',
        version: '6.27.20',
        runtime: 'native-source-modules-via-horde-compatibility-scaffold',
        modules: Object.freeze([
            'settings.js', 'normalize.js', 'ui/panel.js', 'ui/update-panel.js',
            'ui/timeline.js', 'ui/thoughts.js', 'ui/character-wiki.js',
            'ui/relationship-web.js', 'ui/weather.js', 'ui/time-tint.js',
            'settings-ui/custom-panels.js', 'presets/built-in.js'
        ])
    });
    const ROOT = '/scenepulse/vendor/ScenePulse/src';
    const RUNTIME_ROOT_ID = 'sp-horde-source-runtime-root';
    const clone = value => JSON.parse(JSON.stringify(value ?? {}));
    const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
    const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
    const emptyCollectionKeys = new Set(['characters', 'relationships', 'mainQuests', 'sideQuests', 'plotBranches', 'charactersPresent', 'witnesses']);
    const hasValue = value => Array.isArray(value) ? value.length > 0 : plain(value) ? Object.keys(value).length > 0 : value !== undefined && value !== null && String(value).trim() !== '';
    const now = () => new Date().toISOString();

    const runtime = {
        epoch: 0,
        current: null,
        modules: null,
        loading: null,
        originalSillyTavern: Object.getOwnPropertyDescriptor(global, 'SillyTavern'),
        originalToastr: Object.getOwnPropertyDescriptor(global, 'toastr'),
        facadeInstalled: false,
        panelCaptureInstalled: false,
        resizeObserver: null
    };

    function compactValue(value) {
        if (Array.isArray(value)) return value.map(compactValue);
        if (plain(value)) return Object.fromEntries(Object.entries(value)
            .filter(([key]) => !['_spMeta', 'savedAt'].includes(key))
            .map(([key, item]) => [key, compactValue(item)]));
        return value;
    }

    function semanticEqual(left, right) {
        return JSON.stringify(compactValue(left)) === JSON.stringify(compactValue(right));
    }

    function topLevelDiff(before, after) {
        const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
        return [...keys].filter(key => !semanticEqual(before?.[key], after?.[key])).map(key => ({
            key,
            before: compactValue(before?.[key]),
            after: compactValue(after?.[key])
        }));
    }

    function sourceSettings(handoff) {
        const prefs = handoff?.uiPreferences || {};
        const panels = prefs.panels || {};
        const features = prefs.features || {};
        const customPanels = Array.isArray(prefs.customPanels) && prefs.customPanels.length ? clone(prefs.customPanels) : [
            { name: 'RPG Stats (Tour Example)', enabled: true, fields: [
                { key: 'health', label: 'Health', type: 'meter', desc: "{{user}}'s health 0-100", enabled: true },
                { key: 'mana', label: 'Mana', type: 'meter', desc: 'Mana remaining after spellcasting', enabled: true },
                { key: 'reputation', label: 'Reputation', type: 'text', desc: 'Standing with the local guild', enabled: true }
            ] }
        ];
        return {
            enabled: true,
            // Horde owns turn dispatch. Native source refresh controls are
            // intercepted below and dispatched through the named host action.
            autoGenerate: false,
            deltaMode: true,
            deltaRefreshInterval: 15,
            promptMode: 'json',
            panels: {
                dashboard: panels.dashboard !== false,
                scene: panels.scene !== false,
                quests: panels.quests !== false,
                relationships: panels.relationships !== false,
                characters: panels.characters !== false,
                storyIdeas: panels.branches !== false
            },
            showThoughts: features.thoughts !== false,
            weatherOverlay: features.weather !== false,
            timeTint: features.timeTint !== false,
            sceneTransitions: features.transitions !== false,
            reduceVisualEffects: prefs.reduceEffects === true,
            theme: prefs.theme || 'default',
            fontScale: Number(prefs.fontScale) || 1,
            showEmptyFields: prefs.showEmpty === true,
            openSections: clone(prefs.openSections || { scene: true, quests: true, relationships: true, characters: true, branches: false }),
            customPanels,
            // The bridge writes name-keyed source portrait values only from
            // portable Horde presentation assets; no character registry is
            // exposed as an implicit source of visual data.
            charPortraits: {},
            wikiNotes: clone(prefs.wikiNotes || {}),
            profiles: [],
            activeProfileId: '',
            // Prevent the source's one-time ST preset migration from
            // mistaking a read-only compatibility context for a user edit.
            _fallbackPresetMigrationDone: true
        };
    }

    function nativeFieldAuthority(handoff) {
        return new Set((Array.isArray(handoff?.uiPreferences?.nativeFieldAuthority)
            ? handoff.uiPreferences.nativeFieldAuthority : [])
            .map(String).filter(key => /^[A-Za-z][A-Za-z0-9_]{0,100}$/.test(key)));
    }

    // ScenePulse's fixture is a complete source tracker. The compatibility
    // scaffold begins with *no* Sidecar field authority: every fixture feature
    // stays visibly working until that exact native-to-Sidecar route has been
    // accepted. A future field can be granted authority one at a time; this
    // function is intentionally not a blanket "live mode" replacement.
    function materializeNativeTracker(handoff) {
        const fixture = clone(handoff?.fixtureScenePulse || handoff?.scenePulse || {});
        if (handoff?.status === 'accepted_fixture') return fixture;
        if (handoff?.status === 'accepted_human') return clone(handoff?.scenePulse || fixture);
        const authority = nativeFieldAuthority(handoff);
        if (!authority.size) return fixture;
        const live = plain(handoff?.scenePulse) ? handoff.scenePulse : {};
        const clear = new Set([...(handoff?.clearFields || []), ...(live.clearFields || [])].map(String));
        const replace = new Set([...(handoff?.replaceCollections || []), ...(live.replaceCollections || [])].map(String));
        Object.entries(live).forEach(([key, value]) => {
            if (key === 'clearFields' || key === 'replaceCollections' || value === undefined || !authority.has(key)) return;
            if (own(fixture, key) && !clear.has(key) && !replace.has(key) && !hasValue(value)) return;
            fixture[key] = clone(value);
        });
        clear.forEach(key => {
            if (key.includes('.') || !authority.has(key)) return;
            fixture[key] = emptyCollectionKeys.has(key) ? [] : '';
        });
        return fixture;
    }

    function snapshotMeta(kind, handoff, index, extras = {}) {
        return {
            hordeScenePulseBridge: true,
            hordeSource: kind,
            hordeSnapshotId: String(extras.snapshotId || handoff?.provenance?.snapshotId || handoff?.id || ''),
            hordeTurnId: String(extras.turnId || handoff?.provenance?.turnId || ''),
            hordeLabel: String(extras.label || ''),
            hordeCreatedAt: String(extras.createdAt || now()),
            hordeHistoryIndex: index,
            savedAt: String(extras.createdAt || now())
        };
    }

    function addSnapshot(target, key, data, meta) {
        const snapshot = clone(data);
        snapshot._spMeta = { ...(plain(snapshot._spMeta) ? snapshot._spMeta : {}), ...meta };
        target[String(key)] = snapshot;
    }

    function sourceMetadata(handoff) {
        const snapshots = {};
        const history = Array.isArray(handoff?.history) ? handoff.history : [];
        if (handoff?.status === 'accepted_fixture' || !history.length
            || (handoff?.status !== 'accepted_human' && !nativeFieldAuthority(handoff).size)) {
            const fixture = materializeNativeTracker(handoff);
            // Native ScenePulse's guided tour has a populated history. The
            // tutorial therefore exercises its own timeline from the first
            // fixture-only mount without borrowing a Horde message index.
            for (let index = 0; index < 12; index += 1) {
                addSnapshot(snapshots, 15 + index, fixture, snapshotMeta('fixture', handoff, index, {
                    label: `Tutorial ${index + 1} of 12`, snapshotId: `tour-${15 + index}`
                }));
            }
        } else {
            history.forEach((entry, index) => {
                const humanHistory = String(entry?.id || '').startsWith('scene-pulse-human-edit-');
                const historical = materializeNativeTracker({
                    ...handoff,
                    status: humanHistory ? 'accepted_human' : 'accepted_live',
                    scenePulse: entry?.scenePulse || {},
                    clearFields: entry?.clearFields || [],
                    replaceCollections: entry?.replaceCollections || []
                });
                addSnapshot(snapshots, 1000 + index, historical, snapshotMeta('sidecar-materialization', handoff, index, {
                    label: entry?.label || `Reader turn ${index + 1}`,
                    snapshotId: entry?.id,
                    turnId: entry?.turnId,
                    createdAt: entry?.createdAt
                }));
            });
        }
        const currentKey = Object.keys(snapshots).map(Number).sort((a, b) => a - b).at(-1);
        const current = snapshots[String(currentKey)] || {};
        return {
            scenepulse: {
                snapshots,
                // These flags make the vendored source's historical data
                // migrations explicit no-ops. A compatibility render must
                // never turn a read into a hidden persistent rewrite.
                _spActiveTasksMigrated: true,
                _spQuestDedupMigrated: true,
                _spWikiArchiveBackfilled: true,
                _spUserStripMigrated: true,
                _spAliasesInitMigrated: true,
                _spCharTrimMigrated: true,
                _spNameCanonMigrated: true,
                chatPanels: clone((handoff?.uiPreferences?.customPanels || []))
            },
            __hordeCurrentKey: currentKey,
            __hordeCurrentSnapshot: clone(current)
        };
    }

    function makeContext(host, handoff) {
        const metadata = sourceMetadata(handoff);
        const nativeSettings = sourceSettings(handoff);
        // ScenePulse's manager uses a timeline-local copy of the World
        // schema. Seed a new timeline from the World schema so the populated
        // tutorial panel is still complete before any source manager save.
        if (!metadata.scenepulse.chatPanels.length) metadata.scenepulse.chatPanels = clone(nativeSettings.customPanels || []);
        const extensionSettings = { scenepulse: nativeSettings };
        const nativeTracker = materializeNativeTracker(handoff);
        // ScenePulse's normalizer already knows how to omit the controlled
        // player from NPC relationship/character lists. Give it only an
        // explicit ScenePulse tracker role—not a Horde registry lookup.
        const playerName = (nativeTracker.characters || []).find(character => /^(?:protagonist|player|user)$/i.test(String(character?.role || '').trim()))?.name || 'Player';
        const baseMetadata = clone(metadata);
        const baseSettings = clone(extensionSettings.scenepulse);
        const context = {
            extensionSettings,
            chatMetadata: metadata,
            chat: Object.keys(metadata.scenepulse?.snapshots || {}).map((key, index) => ({
                mes: `ScenePulse ${index + 1}`,
                is_user: index % 2 === 0,
                swipes: [],
                extra: { hordeScenePulseSnapshot: key }
            })),
            name1: String(playerName || 'Player'),
            name2: '',
            characters: [],
            groups: [],
            groupId: null,
            saveMetadata: () => markMetadataDirty(),
            saveSettingsDebounced: () => persistSettings(),
            saveChat: async () => {},
            setChatMessage: () => {},
            sendMessage: () => {},
            eventSource: { on: () => {}, once: () => {}, emit: () => {} }
        };
        return {
            host,
            handoff,
            context,
            baseMetadata,
            baseSettings,
            dirtyMetadata: false,
            dirtySettings: false,
            mountedAt: now(),
            nativeTracker,
            sidecarTracker: clone(handoff?.sidecarScenePulse || handoff?.scenePulse || {}),
            currentKey: metadata.__hordeCurrentKey,
            epoch: runtime.epoch
        };
    }

    function active() { return runtime.current; }

    function makeToast(level, message, title = 'ScenePulse') {
        const root = document.getElementById(RUNTIME_ROOT_ID) || document.body;
        const node = document.createElement('div');
        node.className = `sp-horde-native-toast sp-horde-native-toast-${level}`;
        node.setAttribute('role', 'status');
        node.textContent = `${title ? `${title}: ` : ''}${String(message || '')}`;
        root.appendChild(node);
        global.setTimeout(() => node.remove(), 3600);
    }

    function installFacade() {
        if (runtime.facadeInstalled) return;
        const facade = {
            getContext: () => active()?.context || { extensionSettings: {}, chatMetadata: {}, chat: [] }
        };
        Object.defineProperty(global, 'SillyTavern', { configurable: true, writable: true, value: facade });
        Object.defineProperty(global, 'toastr', {
            configurable: true,
            writable: true,
            value: Object.freeze({
                success: (message, title) => makeToast('success', message, title),
                info: (message, title) => makeToast('info', message, title),
                warning: (message, title) => makeToast('warning', message, title),
                error: (message, title) => makeToast('error', message, title)
            })
        });
        runtime.facadeInstalled = true;
    }

    async function loadModules() {
        if (runtime.modules) return runtime.modules;
        if (runtime.loading) return runtime.loading;
        installFacade();
        runtime.loading = Promise.all([
            import(`${ROOT}/settings.js`),
            import(`${ROOT}/normalize.js`),
            import(`${ROOT}/ui/panel.js`),
            import(`${ROOT}/ui/update-panel.js`),
            import(`${ROOT}/ui/timeline.js`),
            import(`${ROOT}/ui/thoughts.js`),
            import(`${ROOT}/ui/character-wiki.js`),
            import(`${ROOT}/ui/relationship-web.js`),
            import(`${ROOT}/ui/weather.js`),
            import(`${ROOT}/ui/time-tint.js`)
        ]).then(([settings, normalize, panel, updatePanel, timeline, thoughts, wiki, relationshipWeb, weather, timeTint]) => {
            runtime.modules = { settings, normalize, panel, updatePanel, timeline, thoughts, wiki, relationshipWeb, weather, timeTint };
            return runtime.modules;
        });
        return runtime.loading;
    }

    function dispatch(action, extra = {}) {
        const current = active();
        if (!current?.host) return Promise.reject(new Error('ScenePulse source bridge has no active Horde workspace.'));
        const detail = { action, ...extra };
        current.host.dispatchEvent(new CustomEvent('horde-scenepulse-action', { bubbles: false, cancelable: true, detail }));
        return detail.promise || Promise.resolve(null);
    }

    function updateBridgeControls() {
        const current = active();
        const panel = document.getElementById('sp-panel');
        if (!current || !panel?.dataset.hordeSourceRuntime) return;
        const dirty = current.dirtyMetadata || current.dirtySettings;
        const save = panel.querySelector('[data-horde-source-save]');
        const discard = panel.querySelector('[data-horde-source-discard]');
        const status = panel.querySelector('[data-horde-source-status]');
        if (save) { save.disabled = !dirty; save.classList.toggle('sp-horde-bridge-dirty', dirty); }
        if (discard) discard.disabled = !dirty;
        if (status) status.textContent = dirty ? 'Native draft pending' : 'Native source runtime';
    }

    function sourcePreferencePatch(settings) {
        return {
            panels: {
                dashboard: settings?.panels?.dashboard !== false,
                scene: settings?.panels?.scene !== false,
                quests: settings?.panels?.quests !== false,
                relationships: settings?.panels?.relationships !== false,
                characters: settings?.panels?.characters !== false,
                branches: settings?.panels?.storyIdeas !== false
            },
            features: {
                thoughts: settings?.showThoughts !== false,
                weather: settings?.weatherOverlay !== false,
                timeTint: settings?.timeTint !== false,
                transitions: settings?.sceneTransitions !== false
            },
            reduceEffects: settings?.reduceVisualEffects === true,
            theme: settings?.theme || 'default',
            fontScale: Number(settings?.fontScale) || 1,
            showEmpty: settings?.showEmptyFields === true,
            openSections: clone(settings?.openSections || {}),
            customPanels: clone(settings?.customPanels || [])
        };
    }

    function persistSettings() {
        const current = active();
        if (!current) return;
        current.dirtySettings = true;
        updateBridgeControls();
        // Preference saves are not tracker evidence. Persist them through a
        // distinct host action so they cannot masquerade as a Reader update.
        dispatch('persist-scenepulse-source-settings', {
            preferences: sourcePreferencePatch(current.context.extensionSettings.scenepulse),
            chatPanels: clone(current.context.chatMetadata?.scenepulse?.chatPanels || [])
        }).catch(error => makeToast('error', error?.message || error, 'ScenePulse preferences'));
    }

    function markMetadataDirty() {
        const current = active();
        if (!current) return;
        const before = current.baseMetadata?.scenepulse || {};
        const after = current.context.chatMetadata?.scenepulse || {};
        const metadataChanged = !semanticEqual(before, after);
        current.dirtyMetadata = metadataChanged;
        updateBridgeControls();
    }

    function currentSnapshot(current) {
        const snapshots = current?.context?.chatMetadata?.scenepulse?.snapshots || {};
        const key = String(current?.currentKey ?? '');
        return clone(snapshots[key] || {});
    }

    function injectBridgeControls(panel) {
        if (panel.querySelector('[data-horde-source-status]')) return;
        const toolbar = panel.querySelector('.sp-toolbar');
        if (!toolbar) return;
        const bridge = document.createElement('div');
        bridge.className = 'sp-horde-source-bridge-controls';
        bridge.innerHTML = '<span class="sp-horde-source-status" data-horde-source-status>Native source runtime</span><button type="button" class="sp-toolbar-btn sp-horde-bridge-save" data-horde-source-save title="Save native ScenePulse edits" disabled>Save</button><button type="button" class="sp-toolbar-btn sp-horde-bridge-discard" data-horde-source-discard title="Discard native ScenePulse edits" disabled>Discard</button>';
        toolbar.appendChild(bridge);
        bridge.querySelector('[data-horde-source-save]').addEventListener('click', async () => {
            const current = active();
            if (!current || (!current.dirtyMetadata && !current.dirtySettings)) return;
            const before = clone(current.baseMetadata?.scenepulse?.snapshots?.[String(current.currentKey)] || {});
            const after = currentSnapshot(current);
            const patch = topLevelDiff(before, after);
            try {
                if (patch.length) {
                    await dispatch('commit-scenepulse-source-edit', {
                        source: SOURCE,
                        handoffId: current.handoff?.id || '',
                        targetSnapshotId: current.handoff?.provenance?.snapshotId || current.handoff?.id || 'fixture',
                        targetTurnId: current.handoff?.provenance?.turnId || '',
                        before: compactValue(before),
                        after: compactValue(after),
                        patch
                    });
                }
                current.baseMetadata = clone(current.context.chatMetadata);
                current.baseSettings = clone(current.context.extensionSettings.scenepulse);
                current.dirtyMetadata = false;
                current.dirtySettings = false;
                updateBridgeControls();
                makeToast('success', patch.length ? 'Human ScenePulse edit saved as a history node.' : 'Source preferences saved.', 'ScenePulse');
            } catch (error) {
                makeToast('error', error?.message || error, 'ScenePulse save');
            }
        });
        bridge.querySelector('[data-horde-source-discard]').addEventListener('click', () => {
            const current = active();
            if (!current) return;
            current.context.chatMetadata = clone(current.baseMetadata);
            current.context.extensionSettings.scenepulse = clone(current.baseSettings);
            current.dirtyMetadata = false;
            current.dirtySettings = false;
            runtime.modules?.settings?.invalidateSettingsCache?.();
            renderActive().catch(error => makeToast('error', error?.message || error, 'ScenePulse discard'));
        });
    }

    function formatValue(value) {
        if (Array.isArray(value)) return value.length ? `${value.length} item${value.length === 1 ? '' : 's'}` : 'empty';
        if (plain(value)) return Object.keys(value).length ? `${Object.keys(value).length} field${Object.keys(value).length === 1 ? '' : 's'}` : 'empty';
        const text = String(value ?? '').trim();
        return text ? text.slice(0, 120) : 'empty';
    }

    function showComparison() {
        const current = active();
        if (!current) return;
        document.querySelector('.sp-horde-compare-overlay')?.remove();
        const native = compactValue(current.nativeTracker || {});
        const sidecar = compactValue(current.sidecarTracker || {});
        const keys = new Set([...Object.keys(native), ...Object.keys(sidecar)]);
        const rows = [...keys].sort().map(key => {
            const same = semanticEqual(native[key], sidecar[key]);
            const state = same ? 'agrees' : !own(sidecar, key) ? 'native-only' : !own(native, key) ? 'sidecar-only' : 'disagrees';
            return `<tr class="sp-horde-compare-${state}"><th>${escapeHtml(key)}</th><td>${escapeHtml(formatValue(native[key]))}</td><td>${escapeHtml(formatValue(sidecar[key]))}</td><td>${escapeHtml(state)}</td></tr>`;
        }).join('');
        const overlay = document.createElement('div');
        overlay.className = 'sp-horde-compare-overlay';
        overlay.innerHTML = `<section class="sp-horde-compare-dialog" role="dialog" aria-modal="true" aria-label="ScenePulse and Sidecar comparison"><header><span><strong>Two live readings</strong><small>ScenePulse source materialization beside Sidecar’s settled handoff. Disagreement is retained for review; neither column is silently overwritten.</small></span><button type="button" aria-label="Close comparison">×</button></header><div class="sp-horde-compare-provenance"><span>Native: ${escapeHtml(current.handoff?.status === 'accepted_fixture' ? 'sealed TOUR_EXAMPLE_DATA' : 'ScenePulse source tracker')}</span><span>Sidecar: ${escapeHtml(current.handoff?.provenance?.snapshotId ? `settled ${current.handoff.provenance.snapshotId}` : 'no settled Reader packet')}</span></div><div class="sp-horde-compare-table-wrap"><table><thead><tr><th>Field</th><th>ScenePulse</th><th>Sidecar</th><th>Comparison</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No tracker fields.</td></tr>'}</tbody></table></div></section>`;
        overlay.querySelector('button').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    }

    function injectComparisonStrip(panel) {
        const current = active();
        if (!current) return;
        let strip = panel.querySelector('.sp-horde-runtime-strip');
        if (!strip) {
            strip = document.createElement('div');
            strip.className = 'sp-horde-runtime-strip';
            const body = panel.querySelector('#sp-panel-body');
            panel.insertBefore(strip, body || null);
        }
        const fixture = current.handoff?.status === 'accepted_fixture';
        const sourceText = fixture || !nativeFieldAuthority(current.handoff).size ? 'ScenePulse: sealed tutorial state' : 'ScenePulse: native materialized tracker';
        const sidecarText = fixture ? 'Sidecar: not consulted' : `Sidecar: settled ${current.handoff?.provenance?.snapshotId || 'handoff'}`;
        strip.innerHTML = `<span class="sp-horde-runtime-native">${escapeHtml(sourceText)}</span><span class="sp-horde-runtime-divider">↔</span><span class="sp-horde-runtime-sidecar">${escapeHtml(sidecarText)}</span><button type="button" data-horde-source-compare>Compare</button>`;
        strip.querySelector('[data-horde-source-compare]').addEventListener('click', showComparison);
    }

    function storyIdeaFromTarget(target) {
        const card = target.closest('.sp-idea-card');
        if (!card) return null;
        const className = [...card.classList].find(name => name.startsWith('sp-idea-')) || '';
        return {
            type: className.replace('sp-idea-', '') || 'exploratory',
            name: card.querySelector('.sp-idea-name')?.textContent?.trim() || 'Story direction',
            hook: card.querySelector('.sp-idea-hook')?.textContent?.trim() || ''
        };
    }

    function installPanelCapture(panel) {
        if (runtime.panelCaptureInstalled) return;
        panel.addEventListener('click', event => {
            const target = event.target instanceof Element ? event.target : null;
            if (!target) return;
            const refresh = target.closest('#sp-tb-regen,.sp-section-refresh');
            if (refresh) {
                event.preventDefault(); event.stopImmediatePropagation();
                const section = refresh.closest('.sp-section')?.dataset?.key || '';
                dispatch('refresh-scene-pulse', { section }).catch(error => makeToast('error', error?.message || error, 'ScenePulse refresh'));
                return;
            }
            const paste = target.closest('.sp-idea-paste');
            const inject = target.closest('.sp-idea-inject');
            if (paste || inject) {
                event.preventDefault(); event.stopImmediatePropagation();
                const direction = storyIdeaFromTarget(target);
                if (direction) dispatch('stage-story-idea', { direction, inject: !!inject }).catch(error => makeToast('error', error?.message || error, 'Story idea'));
            }
        }, true);
        runtime.panelCaptureInstalled = true;
    }

    function ensurePanel() {
        const existing = document.getElementById('sp-panel');
        if (existing && !existing.dataset.hordeSourceRuntime) existing.remove();
        runtime.modules.panel.createPanel();
        const panel = document.getElementById('sp-panel');
        if (!panel) throw new Error('ScenePulse source panel did not create its DOM root.');
        panel.dataset.hordeSourceRuntime = 'true';
        panel.dataset.hordeSourceRevision = SOURCE.revision;
        injectBridgeControls(panel);
        injectComparisonStrip(panel);
        installPanelCapture(panel);
        return panel;
    }

    async function renderActive() {
        const current = active();
        const modules = runtime.modules;
        if (!current || !modules || current.epoch !== runtime.epoch) return;
        modules.settings.invalidateSettingsCache?.();
        const panel = ensurePanel();
        const snapshot = currentSnapshot(current);
        const normalized = modules.normalize.normalizeTracker(snapshot);
        modules.updatePanel.updatePanel(normalized, true);
        modules.timeline.renderTimeline();
        modules.thoughts.updateThoughts(normalized);
        injectComparisonStrip(panel);
        updateBridgeControls();
        modules.panel.showPanel();
        document.getElementById(RUNTIME_ROOT_ID)?.setAttribute('data-mounted', 'true');
    }

    async function mount(host, handoff) {
        runtime.epoch += 1;
        const epoch = runtime.epoch;
        runtime.current = makeContext(host, handoff);
        host.replaceChildren();
        const anchor = document.createElement('div');
        anchor.id = RUNTIME_ROOT_ID;
        anchor.className = 'sp-horde-source-runtime-anchor';
        anchor.dataset.sourceRevision = SOURCE.revision;
        anchor.innerHTML = '<div class="sp-horde-source-loading">Mounting native ScenePulse runtime…</div>';
        host.appendChild(anchor);
        try {
            await loadModules();
            if (epoch !== runtime.epoch) return;
            await renderActive();
            anchor.replaceChildren();
        } catch (error) {
            if (epoch !== runtime.epoch) return;
            anchor.innerHTML = `<div class="sp-empty-state"><strong class="sp-empty-title">Native ScenePulse runtime could not mount</strong><span>${escapeHtml(error?.message || error)}</span></div>`;
            throw error;
        }
    }

    function unmount(host) {
        runtime.epoch += 1;
        runtime.current = null;
        const panel = document.getElementById('sp-panel');
        if (panel?.dataset.hordeSourceRuntime) panel.classList.remove('sp-visible');
        document.querySelector('.sp-wiki-overlay')?.remove();
        document.querySelector('.sp-web-overlay')?.remove();
        document.querySelector('.sp-horde-compare-overlay')?.remove();
        document.getElementById('sp-weather-overlay')?.remove();
        document.getElementById('sp-time-tint')?.remove();
        if (host) host.replaceChildren();
    }

    global.HordeScenePulseSourceRuntime = Object.freeze({ mount, unmount, SOURCE, materializeNativeTracker });
})(window);
