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
 * instead. Normal Worlds play therefore has one semantic reading pass; an
 * upstream extractor can only ever be an explicit diagnostic, never a second
 * foreground producer racing the accepted ScenePulse projection.
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
            'state.js', 'i18n.js', 'ui/loading.js', 'ui/diff-viewer.js', 'ui/analytics.js',
            'settings-ui/custom-panels.js', 'settings-ui/profiles-manager.js',
            'settings-ui/guided-tour.js', 'ui/prompt-editor.js',
            'ui/preset-browser.js', 'ui/debug-inspector.js', 'macros.js',
            'slash-commands.js', 'presets/built-in.js'
        ])
    });
    const ROOT = '/scenepulse/vendor/ScenePulse/src';
    const RUNTIME_ROOT_ID = 'sp-horde-source-runtime-root';
    // Source utilities are deliberately loaded after the panel is alive.  The
    // foreground must remain the actual ScenePulse panel even if an optional
    // authoring or diagnostic surface acquires a new upstream dependency.
    // This is not a replacement implementation: the eventual overlay is
    // still the vendored ScenePulse module.
    const OPTIONAL_SOURCE_MODULES = Object.freeze({
        diffViewer: 'ui/diff-viewer.js',
        analytics: 'ui/analytics.js',
        profileManager: 'settings-ui/profiles-manager.js',
        setupGuide: 'settings-ui/setup-guide.js',
        guidedTour: 'settings-ui/guided-tour.js',
        promptEditor: 'ui/prompt-editor.js',
        presetBrowser: 'ui/preset-browser.js',
        debugInspector: 'ui/debug-inspector.js',
        macros: 'macros.js'
    });
    // These names and aliases are the vendored ScenePulse slash vocabulary.
    // Worlds deliberately adapts their *host actions* rather than registering
    // the upstream SillyTavern parser, whose refresh handler would independently
    // call ScenePulse's generation engine.
    const SOURCE_MACRO_FALLBACK_NAMES = Object.freeze([
        'sp_location', 'sp_time', 'sp_date', 'sp_mood', 'sp_tension',
        'sp_weather', 'sp_topic', 'sp_summary', 'sp_temperature',
        'sp_northstar', 'sp_characters', 'sp_char_count', 'sp_relationships',
        'sp_quests', 'sp_main_quests', 'sp_side_quests', 'sp_quest_count',
        'sp_active_profile'
    ]);
    const SOURCE_MACRO_DESCRIPTIONS = Object.freeze({
        sp_location: 'Current scene location', sp_time: 'Current scene time', sp_date: 'Current scene date',
        sp_mood: 'Current scene mood', sp_tension: 'Current scene tension', sp_weather: 'Current weather',
        sp_topic: 'Current scene topic', sp_summary: 'Current scene summary', sp_temperature: 'Current temperature',
        sp_northstar: 'Current North Star', sp_characters: 'Characters in this scene',
        sp_char_count: 'Number of characters in this scene', sp_relationships: 'Relationship summaries',
        sp_quests: 'Active quests', sp_main_quests: 'Active main quests', sp_side_quests: 'Active side quests',
        sp_quest_count: 'Number of active quests', sp_active_profile: 'Selected ScenePulse profile'
    });
    const SOURCE_SECTION_ALIASES = Object.freeze({
        dashboard: 'dashboard', scene: 'scene', quests: 'quests', relationships: 'relationships',
        characters: 'characters', branches: 'branches', storyideas: 'branches', 'story-ideas': 'branches'
    });
    // Keep the source locale labels (and its complete shipped locale set)
    // rather than inventing a smaller Horde-only language menu.
    const SOURCE_LANGUAGE_OPTIONS = Object.freeze([
        ['English', 'English'], ['Chinese (Simplified)', '简体中文 — Chinese (Simplified)'],
        ['Chinese (Traditional)', '繁體中文 — Chinese (Traditional)'], ['Spanish', 'Español — Spanish'],
        ['Hindi', 'हिन्दी — Hindi'], ['Arabic', 'العربية — Arabic'], ['Portuguese', 'Português — Portuguese'],
        ['Russian', 'Русский — Russian'], ['Japanese', '日本語 — Japanese'], ['French', 'Français — French'],
        ['German', 'Deutsch — German'], ['Korean', '한국어 — Korean'], ['Turkish', 'Türkçe — Turkish'],
        ['Vietnamese', 'Tiếng Việt — Vietnamese'], ['Italian', 'Italiano — Italian'], ['Thai', 'ไทย — Thai'],
        ['Polish', 'Polski — Polish'], ['Ukrainian', 'Українська — Ukrainian'], ['Indonesian', 'Bahasa Indonesia — Indonesian'],
        ['Dutch', 'Nederlands — Dutch'], ['Romanian', 'Română — Romanian'], ['Czech', 'Čeština — Czech'],
        ['Greek', 'Ελληνικά — Greek'], ['Hungarian', 'Magyar — Hungarian'], ['Swedish', 'Svenska — Swedish'],
        ['Malay', 'Bahasa Melayu — Malay'], ['Finnish', 'Suomi — Finnish'], ['Danish', 'Dansk — Danish'],
        ['Norwegian', 'Norsk — Norwegian'], ['Hebrew', 'עברית — Hebrew']
    ].map(([value, label]) => Object.freeze({ value, label })));
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
        optionalLoads: {},
        originalSillyTavern: Object.getOwnPropertyDescriptor(global, 'SillyTavern'),
        originalToastr: Object.getOwnPropertyDescriptor(global, 'toastr'),
        facadeInstalled: false,
        panelCaptureInstalled: false,
        portraitCaptureInstalled: false,
        thoughtRefreshCaptureInstalled: false,
        historySelectionCaptureInstalled: false,
        historySelectionTimer: null,
        resizeObserver: null,
        commandOverlayCleanup: null,
        // One active UI flight represents one Reader reread of an existing
        // authored beat.  It is intentionally distinct from source tracker
        // generation and from the World's narrator generation controller.
        readerRefresh: null
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
        // The host has already resolved the exact active ScenePulse schema
        // (including the upstream tour panel when no profile overrides it).
        // Do not recreate a Horde-local copy here: a schema is foreground
        // source configuration, while any values remain tracker evidence.
        const customPanels = Array.isArray(prefs.customPanels) ? clone(prefs.customPanels) : [];
        const tracker = materializeNativeTracker(handoff);
        const portraitSources = plain(prefs.portraitSources) ? prefs.portraitSources : {};
        const charPortraits = {};
        (Array.isArray(tracker.characters) ? tracker.characters : []).forEach((character, index) => {
            const source = portraitSources[portraitIdentityForCharacter(handoff, character, index)];
            if (!source) return;
            [character?.name, ...(Array.isArray(character?.aliases) ? character.aliases : [])]
                .map(name => String(name || '').toLowerCase().trim())
                .filter(Boolean)
                .forEach(name => { charPortraits[name] = source; });
        });
        const defaultProfile = {
            id: 'worlds-source-default', name: 'World default', description: '', schema: null, systemPrompt: null,
            promptOverrides: {}, systemPromptRole: 'system', appliedPresetId: null, schemaVersion: 1,
            panels: {}, fieldToggles: {}, dashCards: {}, customPanels: clone(customPanels)
        };
        const profiles = Array.isArray(prefs.sourceProfiles) && prefs.sourceProfiles.length
            ? clone(prefs.sourceProfiles) : [defaultProfile];
        const activeProfileId = profiles.some(profile => profile?.id === prefs.sourceActiveProfileId)
            ? prefs.sourceActiveProfileId : profiles[0].id;
        return {
            enabled: true,
            // Horde owns turn dispatch. Native source refresh controls are
            // intercepted below and dispatched through the named host action.
            autoGenerate: false,
            deltaMode: true,
            deltaRefreshInterval: 15,
            promptMode: 'json',
            // Keep the actual vendored Relationship Web affordance visible.
            // In Worlds its generate action is intercepted by the narrow
            // Sidecar Reader hook below; it never starts the source's own
            // autonomous provider path.
            npcRelationshipGraph: true,
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
            language: String(prefs.language || ''),
            setupDismissed: prefs.setupDismissed === true,
            showEmptyFields: prefs.showEmpty === true,
            dashCards: clone(prefs.dashCards || { date: true, time: true, weather: true, temperature: true, location: true }),
            fieldToggles: clone(prefs.fieldToggles || {}),
            thoughtPanelTruncate: prefs.thoughtTruncate === true,
            thoughtPanelFit: prefs.thoughtFit === true,
            thoughtGhost: prefs.thoughtGhost !== false,
            thoughtSnapLeft: prefs.thoughtSnap !== false,
            thoughtPos: { x: Number(prefs.thoughtX) || 8, y: Number(prefs.thoughtY) || 68 },
            thoughtSize: { w: Number(prefs.thoughtWidth) || 340, h: Number(prefs.thoughtHeight) || 400 },
            openSections: clone(prefs.openSections || { scene: true, quests: true, relationships: true, characters: true, branches: false }),
            customPanels,
            // Source portrait rendering remains name/alias compatible, while
            // this map is derived only from portable Horde assets keyed by a
            // stable ScenePulse identity.  No registry avatar is exposed as a
            // fallback source.
            charPortraits,
            wikiNotes: clone(prefs.wikiNotes || {}),
            // These are source-shaped World configuration bundles.  Source
            // Profile Manager and Prompt Editor mutate them directly; the
            // bridge saves them through the same scoped preference action.
            profiles,
            activeProfileId,
            // Prevent the source's one-time ST preset migration from
            // mistaking a read-only compatibility context for a user edit.
            _fallbackPresetMigrationDone: true
        };
    }

    function nativeFieldAuthority(handoff) {
        // Field ownership is declared by Worlds V2's integration policy.  A
        // legacy persisted preference is retained only as a backwards-safe
        // fallback for an older handoff; it is not a user-controlled route to
        // make arbitrary Horde state appear in the native source panel.
        return new Set((Array.isArray(handoff?.nativeFieldAuthority)
            ? handoff.nativeFieldAuthority
            : (Array.isArray(handoff?.uiPreferences?.nativeFieldAuthority)
                ? handoff.uiPreferences.nativeFieldAuthority : []))
            .map(String).filter(key => /^[A-Za-z][A-Za-z0-9_]{0,100}$/.test(key)));
    }

    function portraitIdentityForCharacter(handoff, character = {}, index = 0) {
        const supplied = String(character?.characterId || character?.id || '').trim();
        const fallback = String(character?.name || `character-${index + 1}`)
            .toLowerCase().replace(/[^a-z0-9_.:-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 140);
        const token = (supplied || fallback || `character-${index + 1}`)
            .replace(/[^A-Za-z0-9_.:-]/g, '-').slice(0, 180);
        return `${handoff?.status === 'accepted_fixture' ? 'fixture' : 'reader'}:${token}`;
    }

    function nativeFieldHasAcceptedValue(handoff, key) {
        if (handoff?.status !== 'accepted_live') return false;
        const live = plain(handoff?.scenePulse) ? handoff.scenePulse : {};
        if (!nativeFieldAuthority(handoff).has(key) || !own(live, key)) return false;
        const clear = new Set([...(handoff?.clearFields || []), ...(live.clearFields || [])].map(String));
        const replace = new Set([...(handoff?.replaceCollections || []), ...(live.replaceCollections || [])].map(String));
        if (clear.has(key) || replace.has(key)) return true;
        const fixture = plain(handoff?.fixtureScenePulse) ? handoff.fixtureScenePulse : {};
        // A sparse packet's accidental blank must never erase a populated
        // source feature. A named clear or collection replacement is the
        // handoff's explicit decision to replace it with an empty value.
        return !own(fixture, key) || hasValue(live[key]);
    }

    function nativeFieldSource(handoff, key) {
        if (handoff?.status === 'accepted_fixture') return 'example';
        if (handoff?.status === 'accepted_human') return 'authored';
        return nativeFieldHasAcceptedValue(handoff, key) ? 'reader' : 'example';
    }

    // ScenePulse's fixture is a complete source tracker. Worlds declares the
    // scene-facing field families that a settled Sidecar packet may support,
    // but this function still adopts them one field at a time: omission or an
    // unnamed blank leaves the source value visibly in place. It is not a
    // blanket "live mode" replacement and never reaches into a Horde registry.
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
        const analytics = plain(extras.analytics) ? extras.analytics : {};
        const elapsedMs = Number(analytics.elapsedMs);
        const promptTokens = Number(analytics.promptTokens);
        const completionTokens = Number(analytics.completionTokens);
        return {
            hordeScenePulseBridge: true,
            hordeSource: kind,
            hordeSnapshotId: String(extras.snapshotId || handoff?.provenance?.snapshotId || handoff?.id || ''),
            hordeTurnId: String(extras.turnId || handoff?.provenance?.turnId || ''),
            hordeLabel: String(extras.label || ''),
            hordeCreatedAt: String(extras.createdAt || now()),
            hordeHistoryIndex: index,
            // These source-compatible values are copied only from measured
            // Sidecar Reader metadata.  Missing provider usage remains zero
            // here and is rendered as unavailable by the bridge analytics
            // summary rather than being invented as a real token count.
            promptTokens: Number.isFinite(promptTokens) && promptTokens > 0 ? promptTokens : 0,
            completionTokens: Number.isFinite(completionTokens) && completionTokens > 0 ? completionTokens : 0,
            elapsed: Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs / 1000 : 0,
            source: String(analytics.model || analytics.provider || '').trim() ? 'reader' : '',
            injectionMethod: String(analytics.mode || '') === 'delta' ? 'inline' : '',
            deltaMode: String(analytics.mode || '') === 'delta',
            savedAt: String(extras.createdAt || now())
        };
    }

    function addSnapshot(target, key, data, meta) {
        const snapshot = clone(data);
        snapshot._spMeta = { ...(plain(snapshot._spMeta) ? snapshot._spMeta : {}), ...meta };
        target[String(key)] = snapshot;
    }

    // Mirror the vendored relationship-graph cache key exactly.  The source
    // overlay will reject a cache whose roster does not describe the tracker
    // it is showing, which is the desired scaffold behaviour: keep the
    // graph absent until the source character field is genuinely supported.
    function sourceRelationshipGraphFingerprint(tracker) {
        const parts = [];
        (Array.isArray(tracker?.characters) ? tracker.characters : []).forEach(character => {
            const name = String(character?.name || '').trim();
            if (!name) return;
            const archetype = String(character?.archetype || '').trim().toLowerCase();
            const role = String(character?.role || '').trim().toLowerCase().slice(0, 40);
            parts.push(`${name.toLowerCase()}|${archetype}|${role}`);
        });
        parts.sort();
        const joined = parts.join(';');
        let hash = 5381;
        for (let index = 0; index < joined.length; index += 1) hash = ((hash << 5) + hash + joined.charCodeAt(index)) | 0;
        return (hash >>> 0).toString(36);
    }

    function sourceRelationshipGraphCache(handoff, tracker) {
        const graph = plain(handoff?.npcRelationshipGraph) ? handoff.npcRelationshipGraph : null;
        if (!graph) return null;
        const normalizeName = value => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 180);
        const sourceRoster = [...new Set((Array.isArray(tracker?.characters) ? tracker.characters : [])
            .map(character => normalizeName(character?.name)).filter(Boolean))];
        const readerRoster = [...new Set((Array.isArray(graph.roster) ? graph.roster : [])
            .map(normalizeName).filter(Boolean))];
        const sourceByLower = new Map(sourceRoster.map(name => [name.toLowerCase(), name]));
        if (sourceRoster.length < 2 || readerRoster.length !== sourceRoster.length
            || readerRoster.some(name => !sourceByLower.has(name.toLowerCase()))) return null;
        const edgeTypes = new Set(['family', 'friend', 'ally', 'rival', 'antagonist', 'mentor', 'authority', 'lover', 'lust', 'acquaintance', 'unknown']);
        const edges = (Array.isArray(graph.edges) ? graph.edges : []).map(raw => {
            if (!plain(raw)) return null;
            const from = sourceByLower.get(normalizeName(raw.from).toLowerCase()) || '';
            const to = sourceByLower.get(normalizeName(raw.to).toLowerCase()) || '';
            const type = String(raw.type || '').trim().toLowerCase();
            if (!from || !to || from.toLowerCase() === to.toLowerCase() || !edgeTypes.has(type)) return null;
            return {
                from, to, type,
                label: normalizeName(raw.label || type).slice(0, 180),
                direction: String(raw.direction || '').toLowerCase() === 'reciprocal' ? 'reciprocal' : 'from-to'
            };
        }).filter(Boolean).slice(0, 30);
        const organizations = (Array.isArray(graph.organizations) ? graph.organizations : []).map(raw => {
            if (!plain(raw)) return null;
            const members = [...new Set((Array.isArray(raw.members) ? raw.members : [])
                .map(member => sourceByLower.get(normalizeName(member).toLowerCase()) || '').filter(Boolean))].slice(0, 48);
            const name = normalizeName(raw.name).slice(0, 120);
            if (!name || members.length < 2) return null;
            return { name, kind: normalizeName(raw.kind || 'group').slice(0, 48) || 'group', members };
        }).filter(Boolean).slice(0, 24);
        return {
            fingerprint: sourceRelationshipGraphFingerprint(tracker), generatedAt: Date.now(),
            // The source overlay displays this cache, but it remains visibly
            // attributed to the Sidecar Reader and never writes Horde state.
            source: 'sidecar_reader',
            sourceSnapshotId: String(handoff?.provenance?.snapshotId || handoff?.id || ''),
            sourceTurnId: String(handoff?.provenance?.turnId || ''),
            edges, organizations
        };
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
                    snapshotId: entry?.id, analytics: entry?.analytics,
                    turnId: entry?.turnId,
                    createdAt: entry?.createdAt
                }));
            });
        }
        const currentKey = Object.keys(snapshots).map(Number).sort((a, b) => a - b).at(-1);
        const current = snapshots[String(currentKey)] || {};
        const latestHistory = history.at(-1) || null;
        const graphCache = sourceRelationshipGraphCache({
            ...handoff,
            npcRelationshipGraph: latestHistory?.npcRelationshipGraph || handoff?.npcRelationshipGraph || null,
            provenance: latestHistory?.turnId || latestHistory?.id
                ? { ...(handoff?.provenance || {}), snapshotId: latestHistory?.id || handoff?.provenance?.snapshotId || '', turnId: latestHistory?.turnId || handoff?.provenance?.turnId || '' }
                : handoff?.provenance
        }, current);
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
                chatPanels: clone((handoff?.uiPreferences?.customPanels || [])),
                ...(graphCache ? { relationshipGraph: graphCache } : {})
            },
            __hordeCurrentKey: currentKey,
            __hordeCurrentSnapshot: clone(current)
        };
    }

    function makeContext(host, handoff) {
        const metadata = sourceMetadata(handoff);
        const nativeSettings = sourceSettings(handoff);
        // ScenePulse's manager uses a timeline-local copy of the World
        // schema. Seed a new timeline from the selected native source
        // Profile first (then the World default) so Profile Manager, Prompt
        // Editor and the Reader see the same visible custom fields.
        if (!metadata.scenepulse.chatPanels.length) {
            const activeProfile = (nativeSettings.profiles || []).find(profile => profile?.id === nativeSettings.activeProfileId);
            metadata.scenepulse.chatPanels = clone(activeProfile?.customPanels?.length ? activeProfile.customPanels : (nativeSettings.customPanels || []));
        }
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
            // setup-guide.js keeps its original ScenePulse overlay and calls
            // this one Worlds-specific replacement only when mounted here.
            // The upstream SillyTavern setup path remains unchanged.
            showScenePulseWorldsSetup: () => showWorldsSetupGuide(),
            // Vendored relationship-graph.js checks this narrow capability
            // before its ordinary quiet-prompt path.  A click in the source
            // Relationship Web therefore rereads the exact settled authored
            // beat through Sidecar, then consumes the accepted graph cache.
            // It is not a second ScenePulse model loop.
            requestScenePulseRelationshipGraph: async () => {
                const before = active();
                if (!before || before.handoff?.status === 'accepted_fixture') {
                    throw new Error('The guided tutorial has no live scene graph yet. Play a scene first.');
                }
                if (before.selectedHandoff?.provenance?.snapshotId
                    && before.handoff?.provenance?.snapshotId
                    && before.selectedHandoff.provenance.snapshotId !== before.handoff.provenance.snapshotId) {
                    throw new Error('Return ScenePulse history to the current scene before refreshing its NPC graph.');
                }
                await dispatch('refresh-scene-pulse', {
                    section: 'relationships', forceFull: false, sourceCommand: 'relationship-web'
                });
                const refreshed = active();
                const graph = refreshed?.context?.chatMetadata?.scenepulse?.relationshipGraph;
                if (!plain(graph) || graph.source !== 'sidecar_reader') {
                    throw new Error('The current scene does not yet support a graph for this character roster.');
                }
                return clone(graph);
            },
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
            import(`${ROOT}/ui/time-tint.js`),
            import(`${ROOT}/state.js`),
            import(`${ROOT}/i18n.js`),
            import(`${ROOT}/ui/loading.js`)
        ]).then(([settings, normalize, panel, updatePanel, timeline, thoughts, wiki, relationshipWeb, weather, timeTint, state, i18n, loading]) => {
            runtime.modules = { settings, normalize, panel, updatePanel, timeline, thoughts, wiki, relationshipWeb, weather, timeTint, state, i18n, loading };
            return runtime.modules;
        }).catch(error => {
            runtime.loading = null;
            throw error;
        });
        return runtime.loading;
    }

    function loadOptionalSourceModule(name) {
        const relative = OPTIONAL_SOURCE_MODULES[name];
        if (!relative) return Promise.reject(new Error(`Unknown ScenePulse utility: ${name}`));
        if (runtime.modules?.[name]) return Promise.resolve(runtime.modules[name]);
        if (runtime.optionalLoads[name]) return runtime.optionalLoads[name];
        const pending = import(`${ROOT}/${relative}`).then(module => {
            if (runtime.modules) runtime.modules[name] = module;
            delete runtime.optionalLoads[name];
            return module;
        }).catch(error => {
            delete runtime.optionalLoads[name];
            throw error;
        });
        runtime.optionalLoads[name] = pending;
        return pending;
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
        if (status) status.textContent = dirty ? 'Changes pending' : 'ScenePulse';
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
            language: String(settings?.language || ''),
            setupDismissed: settings?.setupDismissed === true,
            showEmpty: settings?.showEmptyFields === true,
            dashCards: clone(settings?.dashCards || {}),
            fieldToggles: clone(settings?.fieldToggles || {}),
            thoughtTruncate: settings?.thoughtPanelTruncate === true,
            thoughtFit: settings?.thoughtPanelFit === true,
            thoughtGhost: settings?.thoughtGhost !== false,
            thoughtSnap: settings?.thoughtSnapLeft !== false,
            thoughtWidth: Number(settings?.thoughtSize?.w) || 340,
            thoughtHeight: Number(settings?.thoughtSize?.h) || 400,
            thoughtX: Number(settings?.thoughtPos?.x) || 8,
            thoughtY: Number(settings?.thoughtPos?.y) || 68,
            openSections: clone(settings?.openSections || {}),
            customPanels: clone(settings?.customPanels || []),
            sourceProfiles: clone(settings?.profiles || []),
            sourceActiveProfileId: String(settings?.activeProfileId || '')
        };
    }

    function persistSettings() {
        const current = active();
        if (!current) return;
        runtime.modules?.i18n?.resetI18nCache?.();
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

    function snapshotKeys(current) {
        return Object.keys(current?.context?.chatMetadata?.scenepulse?.snapshots || {})
            .map(Number).filter(Number.isFinite).sort((left, right) => left - right);
    }

    function handoffForCurrentSnapshot(current) {
        const history = Array.isArray(current?.handoff?.history) ? current.handoff.history : [];
        const key = Number(current?.currentKey);
        const index = snapshotKeys(current).indexOf(key);
        const entry = index >= 0 ? history[index] : null;
        if (!entry) return current?.handoff || {};
        const human = String(entry?.id || '').startsWith('scene-pulse-human-edit-');
        return {
            ...current.handoff,
            id: human ? `${current.handoff?.id || 'scenepulse'}:${entry.id}` : current.handoff?.id,
            status: human ? 'accepted_human' : 'accepted_live',
            scenePulse: clone(entry.scenePulse || {}),
            previousScenePulse: clone(entry.previousScenePulse || {}),
            deltaScenePulse: clone(entry.deltaScenePulse || {}),
            clearFields: clone(entry.clearFields || []),
            replaceCollections: clone(entry.replaceCollections || []),
            npcRelationshipGraph: clone(entry.npcRelationshipGraph || current.handoff?.npcRelationshipGraph || null),
            candidateReview: clone(entry.candidateReview || current.handoff?.candidateReview || []),
            questReview: clone(entry.questReview || current.handoff?.questReview || []),
            provenance: {
                ...(current.handoff?.provenance || {}),
                snapshotId: String(entry.id || current.handoff?.provenance?.snapshotId || ''),
                turnId: String(entry.turnId || current.handoff?.provenance?.turnId || '')
            }
        };
    }

    function syncCurrentSourceSnapshot() {
        const current = active();
        const selected = Number(runtime.modules?.state?.currentSnapshotMesIdx);
        if (!current || !Number.isFinite(selected)
            || !current.context?.chatMetadata?.scenepulse?.snapshots?.[String(selected)]) return;
        current.currentKey = selected;
        current.nativeTracker = currentSnapshot(current);
        current.selectedHandoff = handoffForCurrentSnapshot(current);
        current.sidecarTracker = clone(current.selectedHandoff?.status === 'accepted_human'
            ? (current.handoff?.sidecarScenePulse || {})
            : (current.selectedHandoff?.scenePulse || {}));
        // Source relationship-graph.js always keys its cache to the newest
        // raw source snapshot. Do not let it accidentally show that current
        // graph while the user is inspecting a historical ScenePulse beat.
        // The graph returns when they return to current; no stale data is
        // relabelled as history in the meantime.
        const latestKey = snapshotKeys(current).at(-1);
        const graphCache = Number(current.currentKey) === Number(latestKey)
            ? sourceRelationshipGraphCache(current.selectedHandoff, current.nativeTracker) : null;
        if (graphCache) current.context.chatMetadata.scenepulse.relationshipGraph = graphCache;
        else delete current.context.chatMetadata.scenepulse.relationshipGraph;
        const panel = document.getElementById('sp-panel');
        if (panel?.dataset.hordeSourceRuntime) {
            injectComparisonStrip(panel);
            injectFieldProvenance(panel);
        }
    }

    function scheduleSourceHistorySelectionSync() {
        global.clearTimeout(runtime.historySelectionTimer);
        // Source timeline selection redraws on a deliberate 200 ms debounce.
        // Synchronise only after that real source redraw; do not recreate its
        // history flow or guess a Horde message index from a visible label.
        runtime.historySelectionTimer = global.setTimeout(syncCurrentSourceSnapshot, 260);
    }

    function installHistorySelectionCapture() {
        if (runtime.historySelectionCaptureInstalled) return;
        document.addEventListener('click', event => {
            const target = event.target instanceof Element ? event.target : null;
            if (!target || !active()) return;
            if (target.closest('#sp-timeline .sp-tl-node, #sp-timeline .sp-tl-disc-btn, .sp-browse-item')) {
                scheduleSourceHistorySelectionSync();
            }
        }, true);
        runtime.historySelectionCaptureInstalled = true;
    }

    function injectBridgeControls(panel) {
        if (panel.querySelector('[data-horde-source-status]')) return;
        const toolbar = panel.querySelector('.sp-toolbar');
        if (!toolbar) return;
        const bridge = document.createElement('div');
        bridge.className = 'sp-horde-source-bridge-controls';
        bridge.innerHTML = '<span class="sp-horde-source-status" data-horde-source-status>ScenePulse</span><button type="button" class="sp-toolbar-btn sp-horde-bridge-save" data-horde-source-save title="Save ScenePulse edits" disabled>Save</button><button type="button" class="sp-toolbar-btn sp-horde-bridge-discard" data-horde-source-discard title="Discard ScenePulse edits" disabled>Discard</button>';
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

    // The inspection route is intentionally a real comparison, not a census
    // of field counts.  A field can stay fixture-backed while Sidecar offers
    // a competing accepted value, so reviewers need the compact values that
    // caused that branch of the scaffold to remain in place.  This data is
    // already present in the narrow handoff and never reaches the World
    // registry, draft, narration transcript, or provider request body.
    function comparisonValueMarkup(value, source) {
        const summary = formatValue(value);
        const normalized = compactValue(value);
        let serialized = '';
        try { serialized = JSON.stringify(normalized, null, 2); } catch { serialized = String(normalized ?? ''); }
        if (!serialized || serialized === '{}') {
            return `<span class="sp-horde-compare-value"><small>${escapeHtml(source)}</small>${escapeHtml(summary)}</span>`;
        }
        const bounded = serialized.length > 12_000
            ? `${serialized.slice(0, 12_000)}\n… truncated in the comparison view (${serialized.length.toLocaleString()} characters total)`
            : serialized;
        return `<details class="sp-horde-compare-value"><summary><small>${escapeHtml(source)}</small>${escapeHtml(summary)}</summary><pre>${escapeHtml(bounded)}</pre></details>`;
    }

    function fieldHandoffReview(handoff, native, sidecar, key) {
        const same = semanticEqual(native[key], sidecar[key]);
        const scenePulseHas = own(native, key);
        const sidecarHas = own(sidecar, key);
        const delta = plain(handoff?.deltaScenePulse) ? handoff.deltaScenePulse : {};
        const suppliedNow = own(delta, key)
            || [...(handoff?.clearFields || []), ...(handoff?.replaceCollections || [])].map(String).includes(key);
        if (handoff?.status === 'accepted_fixture') {
            return { route: 'Tutorial support', tone: 'fixture', reason: 'The sealed ScenePulse tutorial is carrying this feature while no authored handoff is selected.' };
        }
        if (handoff?.status === 'accepted_human') {
            return {
                route: same ? 'Authored state agrees' : 'Authored state retained',
                tone: same ? 'authored' : 'review',
                reason: same ? 'The direct ScenePulse edit and the last accepted Sidecar state agree for this field.' : 'A direct ScenePulse edit is visible here; the prior Sidecar state remains alongside it until a later authored turn resolves the difference.'
            };
        }
        const source = nativeFieldSource(handoff, key);
        if (source === 'reader') {
            return {
                route: same ? 'Settled handoff adopted' : 'Adapter review',
                tone: same ? 'adopted' : 'review',
                reason: same
                    ? (suppliedNow ? 'This settled handoff supplied the field and ScenePulse adopted it.' : 'This value is retained from an earlier accepted Sidecar handoff.')
                    : 'ScenePulse’s source normalization differs from the settled Sidecar value; retain both until the mapping is reviewed.'
            };
        }
        if (sidecarHas) {
            return {
                route: 'Tutorial support retained',
                tone: 'fixture',
                reason: suppliedNow
                    ? 'The handoff named an empty or incomplete value without an explicit clear, so the populated ScenePulse tutorial value remains visible.'
                    : 'This Sidecar value is not adopted for the selected ScenePulse field; the source value stays visible until its handoff route is complete.'
            };
        }
        if (scenePulseHas) return { route: 'Tutorial support retained', tone: 'fixture', reason: 'Sidecar has not supplied this field yet, so ScenePulse remains fully supported by its tutorial state.' };
        return { route: 'Sidecar-only', tone: 'review', reason: 'Sidecar has a field ScenePulse is not currently showing. Keep both visible while its source mapping is decided.' };
    }

    function candidateReviewMarkup(candidates) {
        if (!Array.isArray(candidates) || !candidates.length) return '';
        const cards = candidates.map(candidate => {
            const id = String(candidate?.candidateId || '').trim();
            if (!id) return '';
            const eligibility = plain(candidate?.eligibility) ? candidate.eligibility : {};
            const staged = plain(candidate?.staged) ? candidate.staged : null;
            const canonical = plain(candidate?.canonical) ? candidate.canonical : null;
            const promoted = ['promoted', 'matched'].includes(String(candidate?.candidateStatus || '').toLowerCase())
                || ['promoted', 'resolved'].includes(String(staged?.status || '').toLowerCase());
            const source = [
                candidate?.candidateType || 'candidate',
                candidate?.sourceTurnIds?.length ? `${candidate.sourceTurnIds.length} settled turn${candidate.sourceTurnIds.length === 1 ? '' : 's'}` : '',
                Number.isFinite(Number(candidate?.confidence)) ? `${Math.round(Number(candidate.confidence) * 100)}% Reader confidence` : ''
            ].filter(Boolean).join(' · ');
            const standing = canonical
                ? (promoted ? `Linked to Horde ${canonical.kind || 'record'} “${canonical.name || canonical.id}”.`
                    : `Reader has a specific Horde identity candidate: “${canonical.name || canonical.id}”.`)
                : staged
                    ? (staged.disposition === 'scene_only_by_author' ? 'Kept as ScenePulse-only by author choice.'
                        : eligibility.ready ? 'World review is staged; it can now be promoted explicitly.'
                            : 'World review is staged, but more scene evidence is needed before promotion.')
                    : 'ScenePulse evidence only; Horde has not been asked to create or link a durable record.';
            const actions = [];
            if (canonical && !promoted && String(candidate.readerCanonicalMatchId || '') === String(canonical.id || '')) {
                actions.push(`<button type="button" data-horde-candidate-match="${escapeHtml(id)}">Link verified identity</button>`);
            }
            if (!canonical && (!staged || staged.disposition === 'scene_only_by_author')) {
                actions.push(`<button type="button" data-horde-candidate-stage="${escapeHtml(id)}">Stage World review</button>`);
            }
            if (!canonical && staged && eligibility.ready && !promoted) {
                actions.push(`<button type="button" data-horde-candidate-promote="${escapeHtml(id)}">Create durable record</button>`);
            }
            if (!canonical && staged && !eligibility.ready && !promoted) {
                actions.push(`<button type="button" class="sp-horde-candidate-secondary" data-horde-candidate-resolve="${escapeHtml(id)}">Create with author decision</button>`);
            }
            if (!canonical && !promoted) {
                actions.push(`<button type="button" class="sp-horde-candidate-secondary" data-horde-candidate-scene-only="${escapeHtml(id)}">Keep ScenePulse-only</button>`);
            }
            return `<article class="sp-horde-candidate-review-card"><header><span><strong>${escapeHtml(candidate.label || 'Scene candidate')}</strong><small>${escapeHtml(source)}</small></span><span class="sp-horde-candidate-state ${eligibility.ready ? 'is-ready' : ''}">${escapeHtml(promoted ? 'linked' : staged ? staged.disposition || staged.status || 'staged' : 'scene-only')}</span></header>${candidate.description ? `<p>${escapeHtml(String(candidate.description).slice(0, 700))}</p>` : ''}<div class="sp-horde-candidate-standing">${escapeHtml(standing)}</div>${eligibility.reason ? `<small class="sp-horde-candidate-reason">${escapeHtml(eligibility.reason)}</small>` : ''}${actions.length ? `<div class="sp-horde-candidate-actions">${actions.join('')}</div>` : ''}</article>`;
        }).filter(Boolean).join('');
        return cards ? `<section class="sp-horde-candidate-review"><header><strong>Scene identity handoffs</strong><small>These are the settled Reader candidates beside the visible ScenePulse scene. Review actions are explicit: a candidate stays visible here until a Horde record is actually linked or created.</small></header><div>${cards}</div></section>` : '';
    }

    // Quest changes retain the source journal as their home. This small
    // Inspect-only record confirms whether a saved source action reached the
    // linked World quest, stayed ScenePulse-only, or needs a real choice for
    // a title collision. It never feeds a World quest back into the panel.
    function questTranslationMarkup(records) {
        if (!Array.isArray(records) || !records.length) return '';
        const cards = records.map(record => {
            const source = plain(record?.sourceQuest) ? record.sourceQuest : {};
            const title = String(source?.name || record?.sourceKey || 'Quest').trim();
            const operation = String(record?.operation || 'update').replace(/_/g, ' ');
            const status = String(record?.status || 'unresolved');
            const labels = {
                applied: 'World updated',
                scene_only: 'Scene-only',
                unresolved: 'Unresolved',
                resolved: 'Resolved'
            };
            const actions = status === 'unresolved' && record?.collisionQuestId
                ? `<div class="sp-horde-quest-translation-actions"><button type="button" data-horde-quest-translation-link="${escapeHtml(record.id || '')}">Link matching World quest</button><button type="button" class="sp-horde-candidate-secondary" data-horde-quest-translation-create="${escapeHtml(record.id || '')}">Create separately</button></div>`
                : '';
            return `<article class="sp-horde-quest-translation-card is-${escapeHtml(status)}"><header><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(operation)} · ${escapeHtml(source?.tier === 'mainQuests' ? 'Main quest' : 'Side quest')}</small></span><span>${escapeHtml(labels[status] || status)}</span></header>${source?.detail ? `<p>${escapeHtml(String(source.detail).slice(0, 700))}</p>` : ''}${record?.reason ? `<small class="sp-horde-quest-translation-reason">${escapeHtml(record.reason)}</small>` : ''}${actions}</article>`;
        }).join('');
        return cards ? `<section class="sp-horde-quest-translation-review"><header><strong>Quest Journal actions</strong><small>Saved ScenePulse quest actions update their established World quest directly. Only an identical title without a link needs a choice here.</small></header><div>${cards}</div></section>` : '';
    }

    // Relationship meters stay owned by the source panel. Inspect only
    // reports an explicit saved translation: its current five-dimensional
    // state and the compact deltas Horde retained below the linked People
    // record. An unlinked source identity stays visibly ScenePulse-only;
    // this display never manufactures a person from a name.
    function relationshipTranslationMarkup(records) {
        if (!Array.isArray(records) || !records.length) return '';
        const meterNames = {
            affection: 'Affection', trust: 'Trust', desire: 'Desire', stress: 'Stress', compatibility: 'Compatibility'
        };
        const cards = records.map(record => {
            const source = plain(record?.sourceRelationship) ? record.sourceRelationship : {};
            const title = String(source?.name || record?.sourceKey || 'Relationship').trim();
            const status = String(record?.status || 'scene_only');
            const labels = { applied: 'People updated', scene_only: 'Scene-only', unresolved: 'Unresolved' };
            const deltas = plain(record?.meterDeltas) ? Object.entries(record.meterDeltas)
                .filter(([key, value]) => meterNames[key] && Number.isFinite(Number(value)) && Number(value) !== 0)
                .map(([key, value]) => `${meterNames[key]} ${Number(value) > 0 ? '+' : ''}${Number(value)}`) : [];
            const metadata = [source?.relType, source?.relPhase, source?.timeTogether].filter(Boolean).join(' · ');
            const destination = record?.targetName ? `Linked person: ${record.targetName}` : '';
            return `<article class="sp-horde-relationship-translation-card is-${escapeHtml(status)}"><header><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(String(record?.operation || 'update').replace(/_/g, ' '))}${metadata ? ` · ${escapeHtml(metadata)}` : ''}</small></span><span>${escapeHtml(labels[status] || status)}</span></header>${deltas.length ? `<p class="sp-horde-relationship-deltas">${escapeHtml(deltas.join(' · '))}</p>` : ''}${destination ? `<small class="sp-horde-relationship-destination">${escapeHtml(destination)}</small>` : ''}${record?.reason ? `<small class="sp-horde-relationship-translation-reason">${escapeHtml(record.reason)}</small>` : ''}</article>`;
        }).join('');
        return cards ? `<section class="sp-horde-relationship-translation-review"><header><strong>Relationship actions</strong><small>Saved source meter changes retain their five dimensions and only changed values as deltas. Unlinked records remain fully visible in ScenePulse.</small></header><div>${cards}</div></section>` : '';
    }

    function relationshipGraphReviewMarkup(handoff, native) {
        const graph = plain(handoff?.npcRelationshipGraph) ? handoff.npcRelationshipGraph : null;
        if (!graph) {
            return `<section class="sp-horde-graph-review is-scaffolded"><header><strong>NPC relationship web</strong><span>Source control retained</span></header><p>ScenePulse keeps its native relationship-web surface available. Sidecar has not supplied a settled graph for this visible character roster, so no canonical relationship state has been inferred or substituted.</p></section>`;
        }
        const cache = sourceRelationshipGraphCache(handoff, native);
        const edgeCount = Array.isArray(graph.edges) ? graph.edges.length : 0;
        const organizationCount = Array.isArray(graph.organizations) ? graph.organizations.length : 0;
        const rosterCount = Array.isArray(graph.roster) ? graph.roster.length : 0;
        return `<section class="sp-horde-graph-review ${cache ? 'is-ready' : 'is-scaffolded'}"><header><strong>NPC relationship web</strong><span>${cache ? 'Reader graph mounted' : 'Roster mapping held'}</span></header><p>${cache ? `The source web is displaying ${edgeCount} Reader-derived edge${edgeCount === 1 ? '' : 's'} across ${rosterCount} scene character${rosterCount === 1 ? '' : 's'}${organizationCount ? ` and ${organizationCount} organization${organizationCount === 1 ? '' : 's'}` : ''}. It remains a scene interpretation beside Horde, not a canonical relationship mutation.` : 'Sidecar supplied a graph packet, but ScenePulse is still showing a different or incomplete character roster. The graph stays withheld until that source field is supported; neither system is silently rewritten.'}</p><details><summary>Reader graph packet</summary><pre>${escapeHtml(JSON.stringify(compactValue(graph), null, 2))}</pre></details></section>`;
    }

    function showComparison() {
        const current = active();
        if (!current) return;
        document.querySelector('.sp-horde-compare-overlay')?.remove();
        const native = compactValue(current.nativeTracker || {});
        const sidecar = compactValue(current.sidecarTracker || {});
        const handoff = current.selectedHandoff || current.handoff || {};
        const keys = new Set([...Object.keys(native), ...Object.keys(sidecar)]);
        const reviews = [...keys].sort().map(key => {
            const same = semanticEqual(native[key], sidecar[key]);
            const state = same ? 'agrees' : !own(sidecar, key) ? 'native-only' : !own(native, key) ? 'sidecar-only' : 'disagrees';
            return { key, state, review: fieldHandoffReview(handoff, native, sidecar, key) };
        });
        const rows = reviews.map(({ key, state, review }) => {
            const source = nativeFieldSource(handoff, key);
            const sourceLabel = source === 'reader' ? 'settled Reader field'
                : source === 'authored' ? 'direct authored state' : 'sealed tutorial support';
            return `<tr class="sp-horde-compare-${state} sp-horde-compare-route-${escapeHtml(review.tone)}"><th>${escapeHtml(key)}</th><td>${comparisonValueMarkup(native[key], sourceLabel)}</td><td>${comparisonValueMarkup(sidecar[key], 'Sidecar accepted projection')}</td><td><strong>${escapeHtml(review.route)}</strong><small>${escapeHtml(review.reason)}</small></td><td>${escapeHtml(state)}</td></tr>`;
        }).join('');
        const reviewCount = reviews.filter(item => item.review.tone === 'review').length;
        const fixtureCount = reviews.filter(item => item.review.tone === 'fixture').length;
        const rawDelta = compactValue(handoff?.deltaScenePulse || {});
        const clearFields = Array.isArray(handoff?.clearFields) ? handoff.clearFields : [];
        const replaceCollections = Array.isArray(handoff?.replaceCollections) ? handoff.replaceCollections : [];
        const candidateReview = Array.isArray(handoff?.candidateReview) ? handoff.candidateReview : [];
        const candidateMarkup = candidateReviewMarkup(candidateReview);
        const questReview = Array.isArray(handoff?.questReview) ? handoff.questReview : [];
        const questMarkup = questTranslationMarkup(questReview);
        const relationshipReview = Array.isArray(handoff?.relationshipReview) ? handoff.relationshipReview : [];
        const relationshipMarkup = relationshipTranslationMarkup(relationshipReview);
        const graphMarkup = relationshipGraphReviewMarkup(handoff, native);
        const deltaSummary = Object.keys(rawDelta).length || clearFields.length || replaceCollections.length
            ? `<details class="sp-horde-compare-delta"><summary>Accepted compact delta for this selection</summary><pre>${escapeHtml(JSON.stringify({ scenePulse: rawDelta, clearFields, replaceCollections }, null, 2))}</pre></details>`
            : '<p class="sp-horde-compare-delta-empty">No accepted compact Reader delta is attached to this selection.</p>';
        const overlay = document.createElement('div');
        overlay.className = 'sp-horde-compare-overlay';
        overlay.innerHTML = `<section class="sp-horde-compare-dialog" role="dialog" aria-modal="true" aria-label="ScenePulse and Sidecar handoff review"><header><span><strong>ScenePulse handoff review</strong><small>ScenePulse remains complete in the foreground while Sidecar’s accepted state is retained beside it. A difference is evidence to review, not a cue to erase either system. Open a value to see the exact handoff that produced the difference; this view makes no authority change by itself.</small></span><button type="button" aria-label="Close comparison">×</button></header><div class="sp-horde-compare-provenance"><span>ScenePulse: ${escapeHtml(handoff?.status === 'accepted_fixture' ? 'sealed TOUR_EXAMPLE_DATA' : handoff?.status === 'accepted_human' ? 'direct authored scene state' : 'source materialization')}</span><span>Sidecar: ${escapeHtml(handoff?.provenance?.snapshotId ? `settled ${handoff.provenance.snapshotId}` : 'no settled Reader packet')}</span><span>Tutorial-supported fields: ${fixtureCount}</span><span>Needs mapping review: ${reviewCount}</span>${candidateReview.length ? `<span>Identity handoffs: ${candidateReview.length}</span>` : ''}${questReview.length ? `<span>Quest actions: ${questReview.length}</span>` : ''}${relationshipReview.length ? `<span>Relationship actions: ${relationshipReview.length}</span>` : ''}</div>${candidateMarkup}${questMarkup}${relationshipMarkup}${graphMarkup}<div class="sp-horde-compare-table-wrap"><table><thead><tr><th>Field</th><th>ScenePulse showing</th><th>Sidecar state</th><th>Scaffold status</th><th>Comparison</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No tracker fields.</td></tr>'}</tbody></table></div><footer>${deltaSummary}</footer></section>`;
        overlay.querySelector('button').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
        const bindCandidateAction = (selector, action, successMessage, extra = {}) => {
            overlay.querySelectorAll(selector).forEach(button => button.addEventListener('click', async () => {
                button.disabled = true;
                try {
                    const result = await dispatch(action, {
                        ...extra,
                        candidateId: button.dataset.hordeCandidateStage || button.dataset.hordeCandidatePromote || button.dataset.hordeCandidateResolve || button.dataset.hordeCandidateMatch || button.dataset.hordeCandidateSceneOnly || ''
                    });
                    overlay.remove();
                    const message = result?.status === 'awaiting_evidence'
                        ? 'The candidate remains visibly ScenePulse-backed while it gathers more evidence.'
                        : successMessage;
                    makeToast('success', message, 'ScenePulse review');
                } catch (error) {
                    button.disabled = false;
                    makeToast('error', error?.message || error, 'ScenePulse review');
                }
            }));
        };
        bindCandidateAction('[data-horde-candidate-stage]', 'stage-scenepulse-candidate-review', 'World review staged; ScenePulse remains unchanged.');
        bindCandidateAction('[data-horde-candidate-promote]', 'promote-scenepulse-candidate', 'Promotion is awaiting your explicit confirmation.');
        bindCandidateAction('[data-horde-candidate-resolve]', 'promote-scenepulse-candidate', 'Promotion is awaiting your explicit confirmation.', { allowEarly: true });
        bindCandidateAction('[data-horde-candidate-match]', 'link-scenepulse-candidate', 'Identity link is awaiting your explicit confirmation.');
        bindCandidateAction('[data-horde-candidate-scene-only]', 'keep-scenepulse-candidate-scene-only', 'The candidate remains visible in ScenePulse only.');
        const bindQuestTranslation = (selector, choice, message) => {
            overlay.querySelectorAll(selector).forEach(button => button.addEventListener('click', async () => {
                button.disabled = true;
                try {
                    await dispatch('resolve-scenepulse-quest-translation', { translationId: button.dataset.hordeQuestTranslationLink || button.dataset.hordeQuestTranslationCreate || '', choice });
                    overlay.remove();
                    makeToast('success', message, 'Quest Journal');
                } catch (error) {
                    button.disabled = false;
                    makeToast('error', error?.message || error, 'Quest Journal');
                }
            }));
        };
        bindQuestTranslation('[data-horde-quest-translation-link]', 'link', 'The ScenePulse quest is now linked to the matching World quest.');
        bindQuestTranslation('[data-horde-quest-translation-create]', 'create', 'A separate World quest was created from the ScenePulse action.');
        document.body.appendChild(overlay);
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    }

    // The source macro module resolves from ScenePulse's latest ST snapshot.
    // That would include the visible tutorial scaffold in Worlds, so do not
    // call its handlers for a live prompt preview.  Reproduce its small,
    // public value contract against the accepted Sidecar projection instead:
    // fixture values are useful in the sealed tour, but never leak into a
    // live macro or a Reader prompt merely because they look complete.
    function sourceMacroProjection(current) {
        const handoff = current?.selectedHandoff || current?.handoff || {};
        if (handoff.status === 'accepted_fixture') return clone(current?.nativeTracker || {});
        return clone(current?.sidecarTracker || {});
    }

    function sourceMacroRows(value) {
        if (Array.isArray(value)) return value;
        return plain(value) ? Object.values(value) : [];
    }

    function sourceMacroValues(current) {
        const source = plain(sourceMacroProjection(current)) ? sourceMacroProjection(current) : {};
        const scalar = key => {
            const value = source[key];
            if (value === undefined || value === null) return '';
            if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean).join(', ');
            return String(value).trim();
        };
        const characters = sourceMacroRows(source.characters);
        const characterName = value => {
            if (plain(value)) return String(value.name || value.displayName || value.characterId || value.id || '').trim();
            const raw = String(value || '').trim();
            const found = characters.find(item => [item?.id, item?.characterId, item?.candidateId]
                .map(key => String(key || '').trim()).includes(raw));
            return String(found?.name || raw).trim();
        };
        const present = sourceMacroRows(source.charactersPresent).map(characterName).filter(Boolean);
        const characterNames = present.length ? present : characters.map(item => String(item?.name || '').trim()).filter(Boolean);
        const relationships = sourceMacroRows(source.relationships).map(relationship => {
            const name = String(relationship?.name || '').trim();
            if (!name) return '';
            const parts = [];
            if (relationship.relType) parts.push(String(relationship.relType).trim());
            if (Number.isFinite(Number(relationship.affection))) parts.push(`aff:${Number(relationship.affection)}`);
            return `${name}${parts.length ? ` (${parts.join(', ')})` : ''}`;
        }).filter(Boolean);
        const activeQuests = rows => sourceMacroRows(rows)
            .filter(item => String(item?.urgency || item?.status || '').toLowerCase() !== 'resolved')
            .map(item => String(item?.name || item?.title || '').trim()).filter(Boolean);
        const mainQuests = activeQuests(source.mainQuests);
        const sideQuests = activeQuests(source.sideQuests);
        const settings = current?.context?.extensionSettings?.scenepulse || {};
        const activeProfile = sourceMacroRows(settings.profiles)
            .find(profile => String(profile?.id || '') === String(settings.activeProfileId || '')) || null;
        return Object.freeze({
            sp_location: scalar('location'), sp_time: scalar('time'), sp_date: scalar('date'),
            sp_mood: scalar('sceneMood'), sp_tension: scalar('sceneTension'), sp_weather: scalar('weather'),
            sp_topic: scalar('sceneTopic'), sp_summary: scalar('sceneSummary'), sp_temperature: scalar('temperature'),
            sp_northstar: scalar('northStar'), sp_characters: characterNames.join(', '),
            sp_char_count: String(characterNames.length), sp_relationships: relationships.join(', '),
            sp_quests: [...mainQuests, ...sideQuests].join(', '), sp_main_quests: mainQuests.join(', '),
            sp_side_quests: sideQuests.join(', '), sp_quest_count: String(mainQuests.length + sideQuests.length),
            sp_active_profile: String(activeProfile?.name || '').trim()
        });
    }

    function sourceMacroOrigin(current) {
        const handoff = current?.selectedHandoff || current?.handoff || {};
        if (handoff.status === 'accepted_fixture') return 'sealed tutorial scene';
        if (handoff.status === 'accepted_human') return 'last accepted scene (direct edit kept separate)';
        return 'accepted scene projection';
    }

    function sourceReaderSnapshotCount(current) {
        const handoff = current?.handoff || {};
        if (handoff.status === 'accepted_fixture') return 0;
        return (Array.isArray(handoff.history) ? handoff.history : [])
            .filter(entry => !String(entry?.id || '').startsWith('scene-pulse-human-edit-')).length;
    }

    function sourceCommandHelp() {
        return [
            `ScenePulse v${SOURCE.version} — Commands`,
            '  /sp status — show the current scene projection',
            '  /sp regen [section] — reread the current scene (dashboard, scene, quests, relationships, characters, branches)',
            '  /sp refresh — reread the complete current scene',
            '  /sp clear — clear ScenePulse scene history after confirmation',
            '  /sp toggle <panel> — toggle a built-in or custom panel',
            '  /sp profile [name] — list or select a source profile',
            '  /sp export — export ScenePulse history',
            '  /sp debug — open ScenePulse diagnostics',
            '  /sp help — show this help',
            '',
            'Shortcuts: /sp-status, /sp-regen, /sp-refresh, /sp-clear, /sp-toggle, /sp-profile, /sp-export, /sp-debug, /sp-help',
            'Alias: /scenepulse <command>'
        ].join('\n');
    }

    function sourceCommandStatus(current) {
        const values = sourceMacroValues(current);
        const handoff = current?.selectedHandoff || current?.handoff || {};
        const settings = current?.context?.extensionSettings?.scenepulse || {};
        const enabled = Object.entries(settings.panels || {}).filter(([, value]) => value !== false).map(([key]) => key);
        const projection = sourceMacroProjection(current);
        const characters = sourceMacroRows(projection.characters);
        const relationships = sourceMacroRows(projection.relationships);
        return [
            `ScenePulse v${SOURCE.version} — Status`,
            `Scene data: ${sourceMacroOrigin(current)}`,
            `Profile: ${values.sp_active_profile || '(none)'}`,
            `Snapshots: ${sourceReaderSnapshotCount(current)} scene snapshot${sourceReaderSnapshotCount(current) === 1 ? '' : 's'}`,
            `Panels: ${enabled.join(', ') || 'none'}`,
            '',
            `Time: ${values.sp_time || '—'} | Date: ${values.sp_date || '—'}`,
            `Location: ${values.sp_location || '—'}`,
            `Weather: ${values.sp_weather || '—'} | Temp: ${values.sp_temperature || '—'}`,
            `Mood: ${values.sp_mood || '—'} | Tension: ${values.sp_tension || '—'}`,
            `Topic: ${values.sp_topic || '—'}`,
            '',
            `Characters (${characters.length}): ${values.sp_characters || 'none'}`,
            `Relationships (${relationships.length}): ${values.sp_relationships || 'none'}`,
            `Quests: ${values.sp_quest_count || '0'} active`,
            `North Star: ${values.sp_northstar || 'Not revealed'}`,
            handoff.status === 'accepted_fixture' ? '\nExample tutorial only — no Reader call has been made.' : ''
        ].filter(Boolean).join('\n');
    }

    function parseSourceCommand(input) {
        const parts = String(input || '').trim().replace(/^\//, '').split(/\s+/).filter(Boolean);
        if (!parts.length) return { command: 'help', argument: '' };
        let head = String(parts.shift() || '').toLowerCase();
        let command = '';
        if (head === 'sp' || head === 'scenepulse') command = String(parts.shift() || 'help').toLowerCase();
        else if (head.startsWith('sp-')) command = head.slice(3);
        else if (head.startsWith('scenepulse-')) command = head.slice('scenepulse-'.length);
        else return { command: 'unknown', argument: [head, ...parts].join(' ') };
        const aliases = { regenerate: 'regen', profiles: 'profile' };
        return { command: aliases[command] || command || 'help', argument: parts.join(' ').trim() };
    }

    async function persistSourceCommandSettings(current) {
        if (!current) return;
        current.dirtySettings = true;
        current.dirtyMetadata = true;
        updateBridgeControls();
        await dispatch('persist-scenepulse-source-settings', {
            preferences: sourcePreferencePatch(current.context.extensionSettings.scenepulse),
            chatPanels: clone(current.context.chatMetadata?.scenepulse?.chatPanels || [])
        });
        current.baseSettings = clone(current.context.extensionSettings.scenepulse);
        current.baseMetadata = clone(current.context.chatMetadata);
        current.dirtySettings = false;
        current.dirtyMetadata = false;
        updateBridgeControls();
    }

    async function sourceCommandToggle(current, rawPanel) {
        const requested = String(rawPanel || '').trim();
        const wanted = requested.toLowerCase().replace(/[ _-]+/g, '');
        const settings = current?.context?.extensionSettings?.scenepulse;
        if (!settings) throw new Error('ScenePulse settings are unavailable.');
        if (!requested) {
            const builtins = Object.entries(settings.panels || {}).map(([key, value]) => `  ${key}: ${value !== false ? 'ON' : 'OFF'}`);
            const custom = sourceMacroRows(current.context?.chatMetadata?.scenepulse?.chatPanels)
                .map(panel => `  ${panel.name}: ${panel.enabled !== false ? 'ON' : 'OFF'}`);
            return `ScenePulse panels:\n${[...builtins, ...(custom.length ? ['Custom panels:', ...custom] : [])].join('\n')}\n\nUsage: /sp toggle <panel>`;
        }
        const builtInAliases = { storyideas: 'storyIdeas', branches: 'storyIdeas' };
        const builtIn = Object.keys(settings.panels || {}).find(key => key.toLowerCase().replace(/[ _-]+/g, '') === wanted)
            || builtInAliases[wanted] || '';
        if (builtIn && Object.prototype.hasOwnProperty.call(settings.panels || {}, builtIn)) {
            settings.panels[builtIn] = settings.panels[builtIn] === false;
            await persistSourceCommandSettings(current);
            await renderActive();
            return `${builtIn === 'storyIdeas' ? 'Story Ideas' : builtIn}: ${settings.panels[builtIn] ? 'ON' : 'OFF'}`;
        }
        const panels = sourceMacroRows(current.context?.chatMetadata?.scenepulse?.chatPanels);
        const custom = panels.find(panel => String(panel?.name || '').toLowerCase() === requested.toLowerCase());
        if (custom) {
            custom.enabled = custom.enabled === false;
            await persistSourceCommandSettings(current);
            await renderActive();
            return `${custom.name} (custom): ${custom.enabled ? 'ON' : 'OFF'}`;
        }
        const choices = [...Object.keys(settings.panels || {}), ...panels.map(panel => panel.name)].filter(Boolean).join(', ');
        return `Unknown panel: ${requested}. Valid: ${choices || '(none)'}`;
    }

    async function sourceCommandProfile(current, rawProfile) {
        const settings = current?.context?.extensionSettings?.scenepulse;
        if (!settings) throw new Error('ScenePulse settings are unavailable.');
        const profiles = sourceMacroRows(settings.profiles);
        const activeProfile = profiles.find(profile => String(profile?.id || '') === String(settings.activeProfileId || '')) || null;
        const target = String(rawProfile || '').trim();
        if (!target) {
            if (!profiles.length) return 'No ScenePulse profiles are defined.';
            const rows = profiles.map(profile => {
                const tags = [profile?.systemPrompt ? 'prompt' : '', profile?.schema ? 'schema' : '',
                    sourceMacroRows(profile?.customPanels).length ? `${sourceMacroRows(profile.customPanels).length} panels` : ''].filter(Boolean);
                return `${activeProfile?.id === profile?.id ? '* ' : '  '}${profile?.name || profile?.id}${tags.length ? ` (${tags.join(', ')})` : ''}`;
            });
            return `ScenePulse profiles:\n${rows.join('\n')}\n\nUsage: /sp profile <name>`;
        }
        const next = profiles.find(profile => String(profile?.name || '').toLowerCase() === target.toLowerCase());
        if (!next) return `Unknown profile: "${target}". Available: ${profiles.map(profile => profile?.name).filter(Boolean).join(', ') || '(none)'}`;
        if (activeProfile?.id === next.id) return `Already using profile: ${next.name}`;
        settings.activeProfileId = next.id;
        await persistSourceCommandSettings(current);
        runtime.modules?.settings?.invalidateSettingsCache?.();
        await renderActive();
        return `Switched to profile: ${next.name}. The next Reader pass will use this ScenePulse prompt and field configuration.`;
    }

    async function runSourceCommand(current, input, options = {}) {
        const parsed = parseSourceCommand(input);
        const handoff = current?.selectedHandoff || current?.handoff || {};
        const live = handoff.status === 'accepted_live' || handoff.status === 'accepted_human';
        const section = SOURCE_SECTION_ALIASES[String(parsed.argument || '').toLowerCase()];
        switch (parsed.command) {
        case 'status': return { text: sourceCommandStatus(current) };
        case 'help': return { text: sourceCommandHelp() };
        case 'regen':
            if (parsed.argument && !section) return { text: `Unknown section: ${parsed.argument}. Valid: ${Object.keys(SOURCE_SECTION_ALIASES).join(', ')}` };
            if (!live) return { text: 'The sealed tutorial has no authored beat to reread. Send an authored World turn first.' };
            const regenerated = await runSourceReaderRefresh(section || '', { forceFull: false, sourceCommand: 'regen' });
            if (regenerated?.status === 'stopped') return { text: 'ScenePulse reread stopped. The current scene is unchanged.' };
            return { text: `ScenePulse ${section ? `${section} ` : ''}reread completed for the current scene.` };
        case 'refresh':
            if (!live) return { text: 'The guided tutorial has no live scene to refresh. Play a scene first.' };
            const refreshed = await runSourceReaderRefresh('', { forceFull: true, sourceCommand: 'refresh' });
            if (refreshed?.status === 'stopped') return { text: 'Complete ScenePulse reread stopped. The current scene is unchanged.' };
            return { text: 'Complete ScenePulse reread completed for the current scene.' };
        case 'clear':
            if (!live) return { text: 'The guided tutorial has no saved scene history to clear.' };
            if (!options.confirmed) return { confirmClear: true, text: `Clear ${sourceReaderSnapshotCount(current)} ScenePulse scene snapshot${sourceReaderSnapshotCount(current) === 1 ? '' : 's'}? The story stays intact.` };
            {
                const result = await dispatch('clear-scenepulse-history');
                return { text: result?.message || 'ScenePulse Reader history cleared.' };
            }
        case 'toggle': return { text: await sourceCommandToggle(current, parsed.argument) };
        case 'export':
            if (!live) return { text: 'The sealed tutorial is not exportable World Reader history. Send an authored World turn first.' };
            {
                const result = await dispatch('export-scenepulse-history');
                return { text: result?.message || 'ScenePulse Reader history exported.' };
            }
        case 'debug':
            await loadOptionalSourceModule('debugInspector').then(module => module.openDebugInspector?.('activity'));
            return { text: 'Opened ScenePulse diagnostics.' };
        case 'profile': return { text: await sourceCommandProfile(current, parsed.argument) };
        default: return { text: `Unknown command: ${String(input || '').trim()}. Use /sp help.` };
        }
    }

    function copySourceMacro(name, value) {
        const text = `{{${name}}}`;
        if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
            .then(() => `Copied ${text}${value ? ` → ${value}` : ''}.`)
            .catch(() => `${text}${value ? ` → ${value}` : ''}`);
        return Promise.resolve(`${text}${value ? ` → ${value}` : ''}`);
    }

    function closeSourceCommandOverlay() {
        const cleanup = runtime.commandOverlayCleanup;
        runtime.commandOverlayCleanup = null;
        if (typeof cleanup === 'function') cleanup();
        else document.querySelector('.sp-horde-command-overlay')?.remove();
    }

    function showSourceCommandOverlay() {
        const initial = active();
        if (!initial) return;
        closeSourceCommandOverlay();
        const overlay = document.createElement('div');
        overlay.className = 'sp-horde-command-overlay';
        const state = { input: '/sp status', output: '', pendingClear: false, busy: false, macroNames: [...SOURCE_MACRO_FALLBACK_NAMES] };
        const close = () => {
            document.removeEventListener('keydown', onKeydown, true);
            overlay.remove();
            if (runtime.commandOverlayCleanup === close) runtime.commandOverlayCleanup = null;
        };
        const execute = async (input, confirmed = false) => {
            const current = active();
            if (!current) { close(); return; }
            state.input = input;
            state.busy = true;
            state.pendingClear = false;
            render();
            try {
                const result = await runSourceCommand(current, input, { confirmed });
                state.output = result?.text || '';
                state.pendingClear = result?.confirmClear === true;
            } catch (error) {
                state.output = `Could not run ScenePulse command: ${error?.message || error}`;
            } finally {
                state.busy = false;
                if (overlay.isConnected) render();
            }
        };
        const render = () => {
            const current = active();
            if (!current) { close(); return; }
            const values = sourceMacroValues(current);
            const macroCards = state.macroNames.map(name => `<button type="button" class="sp-horde-command-macro" data-horde-source-macro="${escapeHtml(name)}" title="Copy {{${escapeHtml(name)}}}"><code>{{${escapeHtml(name)}}}</code><span>${escapeHtml(values[name] || '—')}</span><small>${escapeHtml(SOURCE_MACRO_DESCRIPTIONS[name] || 'ScenePulse macro')}</small></button>`).join('');
            const confirmation = state.pendingClear
                ? '<div class="sp-horde-command-confirm"><strong>Clear ScenePulse history?</strong><span>This removes only ScenePulse snapshots. The story stays intact.</span><span><button type="button" data-horde-source-command-confirm>Clear snapshots</button><button type="button" data-horde-source-command-cancel>Cancel</button></span></div>' : '';
            overlay.innerHTML = `<section class="sp-horde-command-dialog" role="dialog" aria-modal="true" aria-label="ScenePulse commands and macros"><header><span><strong>ScenePulse commands</strong><small>Source command vocabulary, routed through the current World. ${escapeHtml(sourceMacroOrigin(current))} powers these macro previews.</small></span><button type="button" aria-label="Close ScenePulse commands" data-horde-source-command-close>×</button></header><div class="sp-horde-command-body"><section class="sp-horde-command-runner"><form data-horde-source-command-form><label for="sp-horde-command-input">Command</label><span><input id="sp-horde-command-input" type="text" value="${escapeHtml(state.input)}" autocomplete="off" spellcheck="false" placeholder="/sp status" ${state.busy ? 'disabled' : ''}><button type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Working…' : 'Run'}</button></span></form><div class="sp-horde-command-shortcuts"><button type="button" data-horde-source-command-shortcut="/sp status">status</button><button type="button" data-horde-source-command-shortcut="/sp regen">regen</button><button type="button" data-horde-source-command-shortcut="/sp refresh">refresh</button><button type="button" data-horde-source-command-shortcut="/sp profile">profile</button><button type="button" data-horde-source-command-shortcut="/sp export">export</button><button type="button" data-horde-source-command-shortcut="/sp help">help</button></div>${confirmation}${state.output ? `<pre class="sp-horde-command-output">${escapeHtml(state.output)}</pre>` : '<p class="sp-horde-command-hint">Try <code>/sp status</code>, or click a macro to copy its source token.</p>'}</section><section class="sp-horde-command-macros"><header><strong>Source macros</strong><small>${escapeHtml(sourceMacroOrigin(current))} · ${state.macroNames.length} available</small></header><div>${macroCards}</div></section></div></section>`;
            overlay.querySelector('[data-horde-source-command-close]')?.addEventListener('click', close);
            overlay.querySelector('[data-horde-source-command-form]')?.addEventListener('submit', event => {
                event.preventDefault();
                execute(overlay.querySelector('#sp-horde-command-input')?.value || '/sp help');
            });
            overlay.querySelectorAll('[data-horde-source-command-shortcut]').forEach(button => button.addEventListener('click', () => execute(button.dataset.hordeSourceCommandShortcut || '/sp help')));
            overlay.querySelector('[data-horde-source-command-confirm]')?.addEventListener('click', () => execute('/sp clear', true));
            overlay.querySelector('[data-horde-source-command-cancel]')?.addEventListener('click', () => { state.pendingClear = false; state.output = 'Clear cancelled.'; render(); });
            overlay.querySelectorAll('[data-horde-source-macro]').forEach(button => button.addEventListener('click', () => {
                const name = button.dataset.hordeSourceMacro || '';
                copySourceMacro(name, values[name] || '').then(message => { state.output = message; render(); });
            }));
        };
        const onKeydown = event => { if (event.key === 'Escape') { event.preventDefault(); close(); } };
        runtime.commandOverlayCleanup = close;
        overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
        document.body.appendChild(overlay);
        render();
        global.setTimeout(() => overlay.querySelector('#sp-horde-command-input')?.focus(), 0);
        loadOptionalSourceModule('macros').then(module => {
            const names = Object.keys(module?.HANDLERS || {}).filter(name => /^sp_[a-z_]+$/.test(name));
            if (names.length && overlay.isConnected) { state.macroNames = names; render(); }
        }).catch(() => {});
        document.addEventListener('keydown', onKeydown, true);
    }

    // Source setup-guide.js delegates here only in Worlds. The overlay keeps
    // the source wizard's markup and navigation rhythm, but replaces every
    // SillyTavern/fallback instruction with a truthful World action. It is a
    // configuration guide, not an alternate scene surface.
    function showWorldsSetupGuide() {
        const current = active();
        const settings = current?.context?.extensionSettings?.scenepulse;
        if (!current || !settings) return;
        document.getElementById('sp-setup-overlay')?.remove();
        const profiles = sourceMacroRows(settings.profiles);
        const activeProfile = profiles.find(profile => String(profile?.id || '') === String(settings.activeProfileId || '')) || profiles[0] || null;
        const preset = current.handoff?.readerPreset?.displayName || current.handoff?.readerPreset?.name || current.handoff?.readerPreset?.id || '';
        const overlay = document.createElement('div');
        overlay.id = 'sp-setup-overlay';
        overlay.className = 'sp-setup-overlay';
        overlay.innerHTML = `<div class="sp-setup-dialog"><div class="sp-setup-header"><div class="sp-setup-icon">✦</div><div class="sp-setup-title">Scene<span style="color:var(--sp-accent)">Pulse</span> Setup</div><button class="sp-setup-close" title="Close">✕</button></div><div class="sp-setup-body" id="sp-setup-body"><div class="sp-setup-step sp-setup-active" data-step="1"><div class="sp-setup-step-num">1</div><div class="sp-setup-step-content"><div class="sp-setup-step-title">How ScenePulse Works Here</div><p>ScenePulse is the scene surface for this World. After a story response, it receives one complete reading of the current moment: people, thoughts, relationships, environment, quests and story directions.</p><p>The source panel stays intact. Refresh checks the current scene again; it does not rerun the story response or move the scene forward.</p><div class="sp-setup-nav"><button class="sp-setup-btn sp-setup-btn-primary" data-goto="2">Next →</button><button class="sp-setup-btn sp-setup-btn-skip" data-dismiss="true">Skip setup</button></div></div></div><div class="sp-setup-step" data-step="2"><div class="sp-setup-step-num">2</div><div class="sp-setup-step-content"><div class="sp-setup-step-title">Choose ScenePulse Fields</div><p>Profiles define the ScenePulse prompt, the compact scene fields and any custom panels. The active profile is <strong>${escapeHtml(activeProfile?.name || 'World default')}</strong>${preset ? `, using ${escapeHtml(preset)} as its selected reader preset.` : '.'}</p><div class="sp-setup-instructions"><div class="sp-setup-inst">1. Open <strong>Profiles</strong> to create, import or select a ScenePulse profile.</div><div class="sp-setup-inst">2. Use <strong>Prompt editor</strong> to inspect or shape the source field instructions.</div><div class="sp-setup-inst">3. Use <strong>Presets</strong> to choose a Reader-focused source template.</div></div><div class="sp-setup-nav"><button class="sp-setup-btn" data-goto="1">← Back</button><button class="sp-setup-btn" data-horde-worlds-setup-tool="profiles">Profiles</button><button class="sp-setup-btn" data-horde-worlds-setup-tool="prompt">Prompt editor</button><button class="sp-setup-btn sp-setup-btn-primary" data-goto="3">Next →</button></div></div></div><div class="sp-setup-step" data-step="3"><div class="sp-setup-step-num">3</div><div class="sp-setup-step-content"><div class="sp-setup-step-title">Refresh and Recovery</div><p>Use the source ⟳ controls or <strong>/sp regen</strong> when a current field needs another look. Use <strong>/sp refresh</strong> for one complete scene frame.</p><p>These controls work on the current scene only. Historical scenes remain read-only, so their history stays trustworthy.</p><div class="sp-setup-nav"><button class="sp-setup-btn" data-goto="2">← Back</button><button class="sp-setup-btn" data-horde-worlds-setup-tool="presets">Reader presets</button><button class="sp-setup-btn sp-setup-btn-primary" data-goto="4">Next →</button></div></div></div><div class="sp-setup-step" data-step="4"><div class="sp-setup-step-num">4</div><div class="sp-setup-step-content"><div class="sp-setup-step-title">Ready to Play</div><div class="sp-setup-tips"><div class="sp-setup-tips-title">Useful ScenePulse controls</div><div class="sp-setup-tip">Open <strong>Character Wiki</strong> for full dossiers and encounter history.</div><div class="sp-setup-tip">Open <strong>Panel Manager</strong> to tailor visibility, themes and custom panels.</div><div class="sp-setup-tip">Use <strong>/sp help</strong> for ScenePulse commands and macros.</div><div class="sp-setup-tip">The <strong>Inspect</strong> control is available when you need to compare development state; it stays out of normal play.</div></div><div class="sp-setup-nav"><button class="sp-setup-btn" data-goto="3">← Back</button><button class="sp-setup-btn sp-setup-btn-primary" data-finish="true">✓ Finish Setup</button></div><div style="text-align:center;margin-top:8px"><button class="sp-setup-btn sp-setup-btn-tour" data-tour="true">✦ Take a Guided Tour</button></div></div></div></div><div class="sp-setup-progress"><div class="sp-setup-dots"><span class="sp-setup-dot sp-dot-active" data-dot="1"></span><span class="sp-setup-dot" data-dot="2"></span><span class="sp-setup-dot" data-dot="3"></span><span class="sp-setup-dot" data-dot="4"></span></div></div></div>`;
        const close = () => overlay.remove();
        const persistDismissal = async () => {
            settings.setupDismissed = true;
            await persistSourceCommandSettings(current);
        };
        const goto = step => {
            overlay.querySelectorAll('.sp-setup-step').forEach(node => node.classList.toggle('sp-setup-active', Number(node.dataset.step) === step));
            overlay.querySelectorAll('.sp-setup-dot').forEach(node => node.classList.toggle('sp-dot-active', Number(node.dataset.dot) === step));
        };
        overlay.addEventListener('click', async event => {
            const gotoButton = event.target.closest('[data-goto]');
            if (gotoButton) { goto(Number(gotoButton.dataset.goto)); return; }
            const tool = event.target.closest('[data-horde-worlds-setup-tool]')?.dataset.hordeWorldsSetupTool;
            if (tool) {
                const name = ({ profiles: 'profileManager', prompt: 'promptEditor', presets: 'presetBrowser' })[tool];
                if (!name) return;
                try {
                    if (tool === 'profiles') (await loadOptionalSourceModule(name)).openProfilesManager?.(() => persistSettings());
                    if (tool === 'prompt') (await loadOptionalSourceModule(name)).openPromptEditor?.();
                    if (tool === 'presets') (await loadOptionalSourceModule(name)).openPresetBrowser?.();
                } catch (error) { makeToast('error', error?.message || error, 'ScenePulse setup'); }
                return;
            }
            if (event.target.closest('[data-tour]')) {
                try {
                    await persistDismissal();
                    close();
                    (await loadOptionalSourceModule('guidedTour')).startGuidedTour?.();
                } catch (error) { makeToast('error', error?.message || error, 'ScenePulse setup'); }
                return;
            }
            if (event.target.closest('[data-finish]') || event.target.closest('[data-dismiss]') || event.target.closest('.sp-setup-close')) {
                try { await persistDismissal(); close(); }
                catch (error) { makeToast('error', error?.message || error, 'ScenePulse setup'); }
            }
        });
        overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
        document.body.appendChild(overlay);
    }

    function showSourceLanguagePicker() {
        const current = active();
        const settings = current?.context?.extensionSettings?.scenepulse;
        if (!current || !settings) return;
        document.querySelector('.sp-horde-language-overlay')?.remove();
        const overlay = document.createElement('div');
        overlay.className = 'sp-horde-command-overlay sp-horde-language-overlay';
        const selected = String(settings.language || '');
        const options = [`<option value="">Auto-detect</option>`, ...SOURCE_LANGUAGE_OPTIONS.map(language =>
            `<option value="${escapeHtml(language.value)}"${selected === language.value ? ' selected' : ''}>${escapeHtml(language.label)}</option>`)].join('');
        overlay.innerHTML = `<section class="sp-horde-command-dialog sp-horde-language-dialog" role="dialog" aria-modal="true" aria-label="ScenePulse language"><header><span><strong>ScenePulse language</strong><small>Uses the original ScenePulse locale files. This changes ScenePulse interface text only.</small></span><button type="button" aria-label="Close ScenePulse language">×</button></header><div class="sp-horde-command-body"><section class="sp-horde-command-runner"><label class="sp-fs" for="sp-horde-language-select"><span>Language</span><select id="sp-horde-language-select">${options}</select></label><p class="sp-horde-command-hint">Auto-detect follows the browser preference when ScenePulse has no saved language.</p><div class="sp-horde-command-shortcuts"><button type="button" data-horde-source-language-save>Apply language</button></div></section></div></section>`;
        const close = () => overlay.remove();
        const apply = async () => {
            const value = overlay.querySelector('#sp-horde-language-select')?.value || '';
            settings.language = value;
            runtime.modules?.i18n?.resetI18nCache?.();
            try {
                await persistSourceCommandSettings(current);
                await renderActive();
                close();
                makeToast('success', value ? `Language changed to ${value}.` : 'Language follows browser preference.', 'ScenePulse');
            } catch (error) {
                makeToast('error', error?.message || error, 'ScenePulse language');
            }
        };
        overlay.querySelector('header button')?.addEventListener('click', close);
        overlay.querySelector('[data-horde-source-language-save]')?.addEventListener('click', apply);
        overlay.querySelector('#sp-horde-language-select')?.addEventListener('change', () => {});
        overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
        document.body.appendChild(overlay);
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
        const sourceText = fixture ? 'Example scene' : current.handoff?.status === 'accepted_human' ? 'Authored scene state' : 'Current scene';
        // The comparison is deliberately available, but its implementation
        // vocabulary stays inside the on-demand development overlay.  Normal
        // roleplay UI should read as ScenePulse, not as a backend dashboard.
        strip.innerHTML = `<span class="sp-horde-runtime-native">${escapeHtml(sourceText)}</span><button type="button" data-horde-source-compare>Inspect</button>`;
        strip.querySelector('[data-horde-source-compare]').addEventListener('click', showComparison);
    }

    function injectSourceUtilities(panel) {
        if (panel.querySelector('[data-horde-source-utilities]')) return;
        const toolbar = panel.querySelector('.sp-toolbar');
        if (!toolbar) return;
        const utilities = document.createElement('span');
        utilities.className = 'sp-horde-source-utilities';
        utilities.dataset.hordeSourceUtilities = 'true';
        // These are source feature entry points.  The markup uses the same
        // source toolbar class; the implementation delegates to the vendored
        // ScenePulse overlays rather than recreating a host inspector.
        utilities.innerHTML = '<button type="button" class="sp-toolbar-btn" data-horde-source-diff title="Inspect ScenePulse changes" aria-label="Inspect ScenePulse changes">Δ</button><button type="button" class="sp-toolbar-btn" data-horde-source-analytics title="ScenePulse activity and timing" aria-label="ScenePulse activity and timing">◷</button><button type="button" class="sp-toolbar-btn" data-horde-source-tools title="ScenePulse tools" aria-label="ScenePulse tools">⋯</button><span class="sp-horde-source-tools-menu" hidden><button type="button" data-horde-source-tool="setup">Setup</button><button type="button" data-horde-source-tool="profiles">Profiles</button><button type="button" data-horde-source-tool="prompt">Prompt editor</button><button type="button" data-horde-source-tool="presets">Presets</button><button type="button" data-horde-source-tool="language">Language</button><button type="button" data-horde-source-tool="commands">Commands &amp; macros</button><button type="button" data-horde-source-tool="debug">Debug inspector</button><button type="button" data-horde-source-tool="tour">Guided tour</button></span>';
        toolbar.appendChild(utilities);
        utilities.querySelector('[data-horde-source-diff]').addEventListener('click', () => {
            const current = active();
            if (!current) return;
            loadOptionalSourceModule('diffViewer')
                .then(module => module.openDiffViewer?.(Number(current.currentKey)))
                .catch(error => makeToast('error', error?.message || error, 'ScenePulse changes'));
        });
        utilities.querySelector('[data-horde-source-analytics]').addEventListener('click', () => {
            loadOptionalSourceModule('analytics')
                .then(module => module.openAnalytics?.())
                .catch(error => makeToast('error', error?.message || error, 'ScenePulse activity'));
        });
        const menu = utilities.querySelector('.sp-horde-source-tools-menu');
        utilities.querySelector('[data-horde-source-tools]').addEventListener('click', () => {
            if (menu) menu.hidden = !menu.hidden;
        });
        utilities.querySelectorAll('[data-horde-source-tool]').forEach(button => button.addEventListener('click', () => {
            if (menu) menu.hidden = true;
            const tool = button.dataset.hordeSourceTool;
            if (tool === 'commands') { showSourceCommandOverlay(); return; }
            if (tool === 'language') { showSourceLanguagePicker(); return; }
            const utility = ({ setup: 'setupGuide', profiles: 'profileManager', prompt: 'promptEditor', presets: 'presetBrowser', debug: 'debugInspector', tour: 'guidedTour' })[tool];
            if (!utility) return;
            loadOptionalSourceModule(utility).then(module => {
                if (tool === 'setup') module.showSetupGuide?.();
                if (tool === 'profiles') module.openProfilesManager?.(() => persistSettings());
                if (tool === 'prompt') module.openPromptEditor?.();
                if (tool === 'presets') module.openPresetBrowser?.();
                if (tool === 'debug') module.openDebugInspector?.('activity');
                if (tool === 'tour') module.startGuidedTour?.();
            }).catch(error => makeToast('error', error?.message || error, 'ScenePulse tools'));
        }));
    }

    function injectFieldProvenance(panel) {
        const current = active();
        if (!current || current.handoff?.status === 'accepted_fixture') return;
        const sections = {
            scene: ['sceneSummary', 'sceneTension', 'sceneTopic', 'sceneMood', 'sceneInteraction', 'elapsed', 'soundEnvironment', 'witnesses'],
            quests: ['northStar', 'mainQuests', 'sideQuests'],
            relationships: ['relationships'],
            characters: ['characters', 'charactersPresent'],
            branches: ['plotBranches']
        };
        Object.entries(sections).forEach(([sectionKey, fields]) => {
            const section = panel.querySelector(`.sp-section[data-key="${sectionKey}"]`);
            if (!section) return;
            const fallbackCount = fields.filter(field => nativeFieldSource(current.handoff, field) === 'example').length;
            section.querySelector('.sp-horde-example-badge')?.remove();
            if (!fallbackCount) return;
            const header = section.querySelector('.sp-section-header');
            if (!header) return;
            const badge = document.createElement('span');
            badge.className = 'sp-horde-example-badge';
            badge.title = fallbackCount === fields.length
                ? 'This section is showing source example values until the current scene provides them.'
                : 'Some values in this section are still source example values.';
            badge.textContent = fallbackCount === fields.length ? 'Example' : 'Some example values';
            header.appendChild(badge);
        });
        const dashboardFields = ['time', 'date', 'location', 'weather', 'temperature'];
        const dashboardFallback = dashboardFields.some(field => nativeFieldSource(current.handoff, field) === 'example');
        const environment = panel.querySelector('.sp-env-permanent');
        environment?.querySelector('.sp-horde-example-badge')?.remove();
        if (environment && dashboardFallback) {
            const badge = document.createElement('span');
            badge.className = 'sp-horde-example-badge sp-horde-dashboard-example-badge';
            badge.textContent = 'Example values';
            badge.title = 'One or more environment values are still source example values.';
            environment.appendChild(badge);
        }
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

    function readerSectionTitle(section) {
        return ({
            dashboard: 'Dashboard', scene: 'Scene Details', quests: 'Quest Journal',
            relationships: 'Relationships', characters: 'Characters', branches: 'Story Ideas',
            thoughts: 'Inner Thoughts'
        })[String(section || '')] || 'ScenePulse';
    }

    function readerSectionContent(section) {
        const panel = document.getElementById('sp-panel');
        if (section) {
            const sourceSection = [...(panel?.querySelectorAll('.sp-section') || [])]
                .find(item => item.dataset.key === String(section));
            return sourceSection?.querySelector('.sp-section-content') || sourceSection || null;
        }
        return document.getElementById('sp-panel-body') || panel || null;
    }

    function removeReaderStopButton() {
        document.getElementById('sp-horde-reader-stop')?.remove();
    }

    function installReaderStopButton(flight) {
        removeReaderStopButton();
        const panel = document.getElementById('sp-panel');
        const button = document.createElement('button');
        button.id = 'sp-horde-reader-stop';
        // This is the original source stop-button skin, but its operation is
        // deliberately owned by the named Reader refresh boundary below.
        button.className = 'sp-stop-btn';
        button.type = 'button';
        button.textContent = 'Stop Update';
        const rect = panel?.getBoundingClientRect();
        if (rect) {
            button.style.left = `${rect.left}px`;
            button.style.width = `${rect.width}px`;
        }
        button.style.display = 'flex';
        button.addEventListener('click', () => {
            if (flight !== runtime.readerRefresh || flight.stopRequested) return;
            flight.stopRequested = true;
            button.disabled = true;
            button.textContent = 'Stopping…';
            dispatch('stop-scene-pulse-refresh').then(result => {
                if (!result?.stopped && flight === runtime.readerRefresh) {
                    flight.stopRequested = false;
                    button.disabled = false;
                    button.textContent = 'Stop Update';
                }
            }).catch(error => {
                if (flight !== runtime.readerRefresh) return;
                flight.stopRequested = false;
                button.disabled = false;
                button.textContent = 'Stop Update';
                makeToast('error', error?.message || error, 'ScenePulse update');
            });
        });
        document.body.appendChild(button);
    }

    function clearReaderRefreshUi(flight) {
        const loading = runtime.modules?.loading;
        // These are the upstream ScenePulse loading primitives. Do not call
        // its showStopButton(): that one is bound to the vendored autonomous
        // generator rather than this World's single Sidecar Reader pass.
        loading?.clearLoadingOverlay?.(flight?.container || readerSectionContent(flight?.section));
        loading?.clearThoughtLoading?.();
        loading?.stopElapsedTimer?.();
        removeReaderStopButton();
    }

    function showReaderRecovery(flight, error) {
        const container = flight?.container || readerSectionContent(flight?.section);
        if (!container || flight?.stopRequested) return;
        container.querySelector('.sp-horde-reader-recovery')?.remove();
        const recovery = document.createElement('div');
        // Reuse the source recovery-card structure and stylesheet instead of
        // introducing a Horde-flavoured failure card into the foreground.
        recovery.className = 'sp-recovery-card sp-horde-reader-recovery';
        const icon = document.createElement('div');
        icon.className = 'sp-recovery-icon';
        icon.textContent = '↻';
        const title = document.createElement('div');
        title.className = 'sp-recovery-title';
        title.textContent = 'ScenePulse update could not complete';
        const detail = document.createElement('div');
        detail.className = 'sp-recovery-sub';
        detail.textContent = `${String(error?.message || error || 'The scene could not be reread.')} The current scene is unchanged.`;
        const actions = document.createElement('div');
        actions.className = 'sp-recovery-actions';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'sp-btn sp-recovery-retry sp-horde-reader-retry';
        retry.textContent = 'Try again';
        retry.addEventListener('click', () => runSourceReaderRefresh(flight.section));
        actions.appendChild(retry);
        recovery.append(icon, title, detail, actions);
        container.appendChild(recovery);
    }

    function beginReaderRefresh(section) {
        if (runtime.readerRefresh) return null;
        const thoughtRefresh = section === 'thoughts';
        const container = readerSectionContent(section);
        const flight = { section: String(section || ''), thoughtRefresh, container, stopRequested: false };
        runtime.readerRefresh = flight;
        const loading = runtime.modules?.loading;
        const title = readerSectionTitle(section);
        if (thoughtRefresh) loading?.showThoughtLoading?.('Updating Inner Thoughts', 'Reading the accepted turn');
        else loading?.showLoadingOverlay?.(container, `Updating ${title}`, 'Reading the accepted turn', !!section);
        if (!thoughtRefresh && !section) loading?.startElapsedTimer?.();
        if (section && !thoughtRefresh) {
            const sourceSection = [...document.querySelectorAll('#sp-panel .sp-section')]
                .find(item => item.dataset.key === section);
            sourceSection?.classList.add('sp-open');
        }
        installReaderStopButton(flight);
        return flight;
    }

    async function runSourceReaderRefresh(section = '', options = {}) {
        const current = active();
        if (!current) return null;
        if (current.handoff?.status === 'accepted_fixture') {
            makeToast('info', 'The guided tutorial has no authored turn to reread.', 'ScenePulse');
            return { status: 'fixture' };
        }
        const flight = beginReaderRefresh(String(section || ''));
        if (!flight) {
            makeToast('info', 'ScenePulse is already updating this scene.', 'ScenePulse');
            return { status: 'busy' };
        }
        try {
            const result = await dispatch('refresh-scene-pulse', {
                section: flight.section,
                forceFull: options.forceFull === true,
                sourceCommand: options.sourceCommand || ''
            });
            if (result?.status === 'stopped') {
                makeToast('info', 'ScenePulse update stopped. The current scene is unchanged.', 'ScenePulse');
            }
            return result;
        } catch (error) {
            showReaderRecovery(flight, error);
            makeToast('error', error?.message || error, 'ScenePulse update');
            throw error;
        } finally {
            clearReaderRefreshUi(flight);
            if (runtime.readerRefresh === flight) runtime.readerRefresh = null;
        }
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
                runSourceReaderRefresh(section).catch(() => {});
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

    function installThoughtRefreshCapture() {
        if (runtime.thoughtRefreshCaptureInstalled) return;
        // Thoughts live in the source's body-level floating panel, outside
        // #sp-panel. Route its native refresh affordance through the same
        // exact-turn Reader boundary as the source toolbar instead of letting
        // the vendored extension begin an independent provider pipeline.
        document.addEventListener('click', event => {
            const target = event.target instanceof Element ? event.target : null;
            const refresh = target?.closest?.('#sp-thought-panel .sp-tp-regen');
            if (!refresh || !active()) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            refresh.disabled = true;
            refresh.classList.add('sp-spinning');
            runSourceReaderRefresh('thoughts')
                .catch(() => {})
                .finally(() => { refresh.disabled = false; refresh.classList.remove('sp-spinning'); });
        }, true);
        runtime.thoughtRefreshCaptureInstalled = true;
    }

    function nativeCharacterForName(name) {
        const current = active();
        const wanted = String(name || '').trim().toLowerCase();
        if (!current || !wanted) return { character: null, index: -1 };
        const characters = Array.isArray(current.nativeTracker?.characters) ? current.nativeTracker.characters : [];
        const index = characters.findIndex(character => {
            const labels = [character?.name, ...(Array.isArray(character?.aliases) ? character.aliases : [])]
                .map(label => String(label || '').trim().toLowerCase());
            return labels.includes(wanted);
        });
        return { character: index >= 0 ? characters[index] : { name }, index };
    }

    function portraitNameFromTarget(target) {
        const portrait = target?.closest?.('.sp-char-portrait,.sp-wiki-avatar-slot,.sp-wiki-avatar');
        if (!portrait) return '';
        const card = portrait.closest('.sp-char-card,.sp-rel-block,.sp-wiki-entry,.sp-char-offscene-stub,.sp-tp-card,.sp-tp-name,.sp-wiki-grid-inner');
        const name = card?.querySelector?.('.sp-char-name,.sp-rel-name,.sp-wiki-name,.sp-char-offscene-name,.sp-tp-name-text,.sp-wiki-grid-name')?.textContent;
        return String(name || '').trim();
    }

    function applyPortraitSource(identity, name, source) {
        const current = active();
        if (!current) return;
        const prefs = current.handoff?.uiPreferences;
        if (prefs) {
            prefs.portraitSources = plain(prefs.portraitSources) ? prefs.portraitSources : {};
            if (source) prefs.portraitSources[identity] = source;
            else delete prefs.portraitSources[identity];
        }
        const settings = current.context?.extensionSettings?.scenepulse;
        if (settings) {
            settings.charPortraits = plain(settings.charPortraits) ? settings.charPortraits : {};
            if (source) settings.charPortraits[String(name || '').toLowerCase().trim()] = source;
            else delete settings.charPortraits[String(name || '').toLowerCase().trim()];
        }
    }

    function openHostPortraitPicker(name) {
        const current = active();
        if (!current || !name) return;
        const { character, index } = nativeCharacterForName(name);
        const identity = portraitIdentityForCharacter(current.handoff, character, index);
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        input.addEventListener('change', () => {
            const file = input.files?.[0];
            input.remove();
            if (!file) return;
            if (file.size > 8 * 1024 * 1024) {
                makeToast('warning', 'Choose an image smaller than 8 MB.', 'Portrait');
                return;
            }
            const reader = new FileReader();
            reader.onload = async () => {
                const data = typeof reader.result === 'string' ? reader.result : '';
                if (!data) { makeToast('error', 'The image could not be read.', 'Portrait'); return; }
                try {
                    const saved = await dispatch('save-scenepulse-portrait', { identity, data, label: name });
                    applyPortraitSource(identity, name, saved?.source || data);
                    await renderActive();
                    makeToast('success', 'Portrait saved.', name);
                } catch (error) {
                    makeToast('error', error?.message || error, 'Portrait');
                }
            };
            reader.onerror = () => makeToast('error', 'The image could not be read.', 'Portrait');
            reader.readAsDataURL(file);
        }, { once: true });
        document.body.appendChild(input);
        input.click();
    }

    function installPortraitCapture() {
        if (runtime.portraitCaptureInstalled) return;
        document.addEventListener('click', event => {
            const target = event.target instanceof Element ? event.target : null;
            const name = portraitNameFromTarget(target);
            if (!name || !active()) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            openHostPortraitPicker(name);
        }, true);
        document.addEventListener('contextmenu', event => {
            const target = event.target instanceof Element ? event.target : null;
            const name = portraitNameFromTarget(target);
            const current = active();
            if (!name || !current) return;
            const { character, index } = nativeCharacterForName(name);
            const identity = portraitIdentityForCharacter(current.handoff, character, index);
            const source = current.handoff?.uiPreferences?.portraitSources?.[identity];
            if (!source) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            dispatch('clear-scenepulse-portrait', { identity }).then(async () => {
                applyPortraitSource(identity, name, '');
                await renderActive();
                makeToast('info', 'Portrait cleared.', name);
            }).catch(error => makeToast('error', error?.message || error, 'Portrait'));
        }, true);
        runtime.portraitCaptureInstalled = true;
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
        injectSourceUtilities(panel);
        installPanelCapture(panel);
        installThoughtRefreshCapture();
        installPortraitCapture();
        installHistorySelectionCapture();
        return panel;
    }

    async function renderActive() {
        const current = active();
        const modules = runtime.modules;
        if (!current || !modules || current.epoch !== runtime.epoch) return;
        modules.settings.invalidateSettingsCache?.();
        // Source UI strings remain sourced from its 29 shipped locale files.
        // The active World preference is the only locale input; importing a
        // panel or profile never changes it behind the user's back.
        await modules.i18n?.initI18n?.();
        const panel = ensurePanel();
        const snapshot = currentSnapshot(current);
        // Source meters, changed-field dots, sparklines, diff inspector and
        // timeline all resolve their predecessor through this source state.
        // Use the exact native snapshot key rather than a Horde turn index.
        modules.state?.setCurrentSnapshotMesIdx?.(Number(current.currentKey));
        modules.state?.setLastDeltaPayload?.(clone(current.handoff?.deltaScenePulse || null));
        const normalized = modules.normalize.normalizeTracker(snapshot);
        modules.updatePanel.updatePanel(normalized, true);
        modules.timeline.renderTimeline();
        modules.thoughts.updateThoughts(normalized);
        current.nativeTracker = clone(snapshot);
        current.selectedHandoff = handoffForCurrentSnapshot(current);
        current.sidecarTracker = clone(current.selectedHandoff?.status === 'accepted_human'
            ? (current.handoff?.sidecarScenePulse || {})
            : (current.selectedHandoff?.scenePulse || {}));
        injectComparisonStrip(panel);
        injectFieldProvenance(panel);
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
        global.clearTimeout(runtime.historySelectionTimer);
        runtime.historySelectionTimer = null;
        runtime.current = null;
        const panel = document.getElementById('sp-panel');
        if (panel?.dataset.hordeSourceRuntime) panel.classList.remove('sp-visible');
        document.querySelector('.sp-wiki-overlay')?.remove();
        document.querySelector('.sp-web-overlay')?.remove();
        document.querySelector('.sp-horde-compare-overlay')?.remove();
        closeSourceCommandOverlay();
        document.getElementById('sp-weather-overlay')?.remove();
        document.getElementById('sp-time-tint')?.remove();
        if (host) host.replaceChildren();
    }

    global.HordeScenePulseSourceRuntime = Object.freeze({ mount, unmount, SOURCE, materializeNativeTracker });
})(window);
