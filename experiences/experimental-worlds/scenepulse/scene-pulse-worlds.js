/*
 * ScenePulse for Horde Worlds V2
 *
 * Source-derived integration surface for xenofei/SillyTavern-ScenePulse
 * revision 2888d0d748033c5b16eac410f5396af055142483 (v6.27.20).
 *
 * This is deliberately a host bridge, not an extension emulator.  It keeps
 * the source panel's DOM vocabulary, component hierarchy, source stylesheet,
 * and demo-tour behaviours, while accepting one explicit Horde handoff:
 *     { status: 'accepted_fixture', scenePulse: TOUR_EXAMPLE_DATA }
 * or  { status: 'accepted_live', fixtureScenePulse, scenePulse }
 *
 * Gate A consumes no Horde scene/timeline/character data and performs no
 * model call. Gate B layers an accepted, Reader-sourced ScenePulse projection
 * over that sealed fixture. Missing source fields stay visibly fixture-backed;
 * this module never fills them from Horde's registry or old sidebar model.
 */
(function scenePulseWorldsModule(global) {
    'use strict';

    const SOURCE = Object.freeze({
        revision: '2888d0d748033c5b16eac410f5396af055142483', version: '6.27.20',
        files: ['src/ui/panel.js', 'src/ui/section.js', 'src/ui/update-panel.js', 'src/ui/thoughts.js', 'src/ui/timeline.js', 'src/ui/character-wiki.js', 'src/ui/relationship-web.js', 'src/ui/diff-viewer.js', 'src/ui/debug-inspector.js', 'src/ui/preset-browser.js', 'src/macros.js', 'src/slash-commands.js', 'src/presets/built-in.js', 'src/settings-ui/guided-tour.js', 'style.css']
    });
    const MASCOT = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.2" opacity=".25"/><circle cx="12" cy="12" r="6.5" stroke="currentColor" stroke-width="1" opacity=".4"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width=".8" opacity=".6"/><circle cx="12" cy="12" r="1.4" fill="currentColor" opacity=".9"/><path d="M12 5.5 14 10 12 8.5 10 10Z" fill="currentColor" opacity=".5"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="8s" repeatCount="indefinite"/></path></svg>';
    const ICON = Object.freeze({
        refresh: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none"><path d="M13.5 8a5.5 5.5 0 1 1-1.3-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M13.5 3v2.5h-2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        panels: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none"><rect x="1" y="2" width="6" height="4" rx="1" stroke="currentColor" stroke-width="1.1" opacity=".6"/><rect x="9" y="2" width="6" height="4" rx="1" stroke="currentColor" stroke-width="1.1" opacity=".6"/><rect x="1" y="8" width="6" height="4" rx="1" stroke="currentColor" stroke-width="1.1" fill="currentColor" opacity=".15"/><rect x="9" y="8" width="6" height="4" rx="1" stroke="currentColor" stroke-width="1.1"/></svg>',
        wiki: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none"><path d="M2 2.5A1.5 1.5 0 0 1 3.5 1h3A1.5 1.5 0 0 1 8 2.5v11A1.5 1.5 0 0 0 6.5 12h-3A1.5 1.5 0 0 1 2 10.5v-8zM14 2.5A1.5 1.5 0 0 0 12.5 1h-3A1.5 1.5 0 0 0 8 2.5v11A1.5 1.5 0 0 1 9.5 12h3a1.5 1.5 0 0 0 1.5-1.5v-8z" stroke="currentColor" stroke-width="1.1"/></svg>',
        toggle: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none"><rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/></svg>',
        compact: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none"><rect x="2" y="2" width="12" height="2.5" rx="1" fill="currentColor" opacity=".3"/><rect x="2" y="6" width="9" height="2" rx=".8" fill="currentColor" opacity=".2"/><rect x="2" y="9.5" width="11" height="2" rx=".8" fill="currentColor" opacity=".15"/><path d="M14 5.5v6.5" stroke="currentColor" stroke-width="1" opacity=".3"/></svg>',
        feature: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none"><path d="m8 1.5 1.1 2.3 2.5.4-1.8 1.8.4 2.5L8 7.2 5.8 8.5l.4-2.5-1.8-1.8 2.5-.4z" stroke="currentColor" stroke-width="1.1" fill="currentColor" opacity=".15"/><path d="M3 11h10M4 13.5h8" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity=".5"/></svg>',
        edit: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none"><path d="m11.5 1.5 3 3L6 13H3v-3l8.5-8.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
        empty: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none"><rect x="2" y="3" width="12" height="2" rx=".8" stroke="currentColor" stroke-width="1" opacity=".6"/><rect x="2" y="7" width="12" height="2" rx=".8" stroke="currentColor" stroke-width="1" opacity=".3" stroke-dasharray="2 1.5"/><rect x="2" y="11" width="12" height="2" rx=".8" stroke="currentColor" stroke-width="1" opacity=".6"/></svg>',
        web: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none"><circle cx="8" cy="3" r="2" stroke="currentColor"/><circle cx="3" cy="12" r="2" stroke="currentColor"/><circle cx="13" cy="12" r="2" stroke="currentColor"/><path d="M7 4.8 4.1 10.1M9 4.8l2.9 5.3M5 12h6" stroke="currentColor" stroke-width="1"/></svg>'
    });
    const SECTION_ICON = Object.freeze({ scene: '◷', quests: '▣', relationships: '↔', characters: '♙', branches: '✦', history: '◷', custom: '◇' });
    const COLORS = ['#d46a7e', '#4aaa60', '#6f9bda', '#b060a0', '#c47040', '#40a0c4'];
    const TOUR_TIMELINE = Object.freeze(Array.from({ length: 12 }, (_, index) => ({ id: `tour-${15 + index}`, label: `#${15 + index}`, current: index === 11 })));
    const BUILTIN_PANELS = Object.freeze([
        ['dashboard', 'Dashboard', 'Time, date, location, weather, temperature'],
        ['scene', 'Scene Details', 'Topic, mood, interaction, tension, sounds'],
        ['quests', 'Quest Journal', 'North Star, main quests, side quests'],
        ['relationships', 'Relationships', 'Five relationship dimensions'],
        ['characters', 'Characters', 'Detailed current character state'],
        ['branches', 'Story Ideas', 'Five plot directions']
    ]);
    const SOURCE_PRESET_MODULE = '/experiences/experimental-worlds/scenepulse/vendor/ScenePulse/src/presets/built-in.js';
    // Directly lifted from src/macros.js and src/slash-commands.js.  The
    // console exposes the literal source vocabulary instead of inventing a
    // second command grammar for Worlds.
    const SOURCE_MACROS = Object.freeze([
        ['sp_location', 'Current scene location from ScenePulse tracker'], ['sp_time', 'Current scene time from ScenePulse tracker'],
        ['sp_date', 'Current scene date from ScenePulse tracker'], ['sp_mood', 'Current scene mood from ScenePulse tracker'],
        ['sp_tension', 'Current scene tension level from ScenePulse tracker'], ['sp_weather', 'Current weather from ScenePulse tracker'],
        ['sp_topic', 'Current scene topic from ScenePulse tracker'], ['sp_summary', 'Current scene summary from ScenePulse tracker'],
        ['sp_temperature', 'Current temperature from ScenePulse tracker'], ['sp_northstar', "User's north star / driving purpose from ScenePulse tracker"],
        ['sp_characters', 'Comma-separated names of characters present in the current scene'], ['sp_char_count', 'Number of characters present in the current scene'],
        ['sp_relationships', 'Comma-separated relationship summaries (name, type, affection)'], ['sp_quests', 'Active quest names (main + side) from ScenePulse tracker'],
        ['sp_main_quests', 'Active main quest names only'], ['sp_side_quests', 'Active side quest names only'],
        ['sp_quest_count', 'Total count of active (non-resolved) quests'], ['sp_active_profile', 'Name of the currently active ScenePulse profile']
    ]);
    const SOURCE_COMMANDS = Object.freeze([
        ['/sp status', 'Show tracker state summary'], ['/sp regen [section]', 'Regenerate tracker; dashboard, scene, quests, relationships, characters, or branches'],
        ['/sp refresh', 'Force a full-state Reader refresh'], ['/sp clear', 'Clear ScenePulse tracker snapshots for this World'],
        ['/sp toggle <panel>', 'Toggle a ScenePulse panel'], ['/sp profile [name]', 'List or select a ScenePulse source preset'],
        ['/sp export', 'Export ScenePulse reader history'], ['/sp debug', 'Open diagnostics'], ['/sp help', 'Show this command reference']
    ]);
    // Exact guided-tour schema from settings-ui/guided-tour.js. It is only a
    // UI schema: TOUR_EXAMPLE_DATA deliberately has no invented health, mana
    // or reputation values. Those keys remain blank until a Reader delta has
    // evidence to populate them.
    const TOUR_CUSTOM_PANELS = Object.freeze([{ name: 'RPG Stats (Tour Example)', fields: [
        { key: 'health', label: 'Health', type: 'meter', desc: "{{user}}'s health 0-100" },
        { key: 'mana', label: 'Mana', type: 'meter', desc: 'Mana remaining after spellcasting' },
        { key: 'reputation', label: 'Reputation', type: 'text', desc: 'Standing with the local guild' }
    ] }]);

    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const clone = value => JSON.parse(JSON.stringify(value));
    const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
    const SCENEPULSE_COLLECTIONS = Object.freeze(['characters', 'relationships', 'mainQuests', 'sideQuests', 'plotBranches', 'charactersPresent', 'witnesses']);
    function emptyScenePulseField(key) { return SCENEPULSE_COLLECTIONS.includes(key) ? [] : ''; }
    function hasLiveScenePulseValue(value) {
        if (Array.isArray(value)) return value.length > 0;
        if (value && typeof value === 'object') return Object.keys(value).length > 0;
        return value !== undefined && value !== null && String(value).trim() !== '';
    }
    // A settled Horde projection has already applied the model's compact
    // deltas.  Layer only its explicit source fields over the sealed tutorial
    // object; do not manufacture values from a different Horde data model.
    function composeFixtureBackedScenePulse(accepted) {
        const fixture = clone(accepted?.fixtureScenePulse || accepted?.scenePulse || {});
        if (accepted?.status !== 'accepted_live') return { data: fixture, origins: Object.fromEntries(Object.keys(fixture).map(key => [key, 'fixture'])) };
        const live = accepted?.scenePulse && typeof accepted.scenePulse === 'object' ? accepted.scenePulse : {};
        const clear = new Set([...(Array.isArray(live.clearFields) ? live.clearFields : []), ...(Array.isArray(accepted?.clearFields) ? accepted.clearFields : [])].map(String));
        const replace = new Set([...(Array.isArray(live.replaceCollections) ? live.replaceCollections : []), ...(Array.isArray(accepted?.replaceCollections) ? accepted.replaceCollections : [])].map(String));
        const data = clone(fixture); const origins = Object.fromEntries(Object.keys(fixture).map(key => [key, 'fixture']));
        Object.keys(live).forEach(key => {
            if (key === 'clearFields' || key === 'replaceCollections') return;
            if (live[key] === undefined) return;
            // An empty collection/string in a model response is not useful
            // scene data by itself. Preserve the complete source field until
            // the Reader explicitly declares a clear or replacement; this is
            // the no-shrinking rule for the tutorial as golden checklist.
            if (hasOwn(fixture, key) && !clear.has(key) && !replace.has(key) && !hasLiveScenePulseValue(live[key])) return;
            data[key] = clone(live[key]); origins[key] = 'live';
        });
        clear.forEach(key => {
            // A declared clear is an accepted live value, not a request to
            // resurrect the tutorial data. Nested clears are handled by the
            // Reader merger before this presentation boundary.
            if (key.includes('.')) return;
            data[key] = emptyScenePulseField(key); origins[key] = 'live';
        });
        return { data, origins };
    }
    function fixtureChip(state, key) {
        if (state.mode !== 'accepted_live' || state.origins[key] !== 'fixture') return '';
        return '<span class="sp-origin-chip sp-origin-fixture" title="This ScenePulse field is still supplied by the sealed tutorial fixture while its Horde Reader sync path is incomplete">Fixture</span>';
    }
    function downloadFixture(filename, text, type = 'application/json') { const url = URL.createObjectURL(new Blob([text], { type })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }
    const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const monogram = name => String(name || '?').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
    // A portrait is a user-selected presentation asset, never Reader
    // evidence.  Keep its association on the Reader's stable identity so a
    // compact name reveal or history selection cannot lose the image or
    // attach it to a same-named person.  The sealed tutorial has no stable
    // IDs of its own, so its fixed source-order keys remain explicitly
    // fixture-scoped rather than pretending to be Horde identities.
    function characterIdentity(state, character, index) {
        const raw = [character?.id, character?.characterId, character?.candidateId, character?.subjectRef]
            .map(value => String(value || '').trim()).find(Boolean);
        if (raw) return `${state.mode === 'accepted_live' ? 'reader' : 'fixture'}:${raw}`;
        // Gate B may still visibly render the sealed Characters field while
        // the Reader has not supplied it. That is a real fixture-backed
        // source object, so its explicit fixture key remains a safe manual
        // override target; an unidentifiable live-only record does not.
        return state.mode !== 'accepted_live' || state.origins?.characters === 'fixture' ? `fixture:${Number(index) || 0}` : '';
    }
    function portraitSource(state, character, index) {
        const identity = characterIdentity(state, character, index);
        return identity ? String(state.portraitOverrides?.[identity] || '') : '';
    }
    const pct = value => Math.max(0, Math.min(100, Number(value) || 0));
    const colorFor = (name, data) => COLORS[Math.max(0, (data.characters || []).findIndex(char => char.name === name)) % COLORS.length];
    const METER_COLORS = Object.freeze({ affection: '#f472b6', trust: '#60a5fa', desire: '#a78bfa', stress: '#facc15', compatibility: '#34d399' });

    function sourceMacroValues(state) {
        // The fixture is a valid source tracker snapshot in Gate A.  Gate B
        // intentionally chooses the raw accepted Reader projection instead
        // of state.data, which has presentation-only fixture fallback.
        const d = state.macroSource && typeof state.macroSource === 'object' ? state.macroSource : {};
        const value = key => {
            const raw = d[key];
            if (raw === undefined || raw === null) return '';
            return Array.isArray(raw) ? raw.map(item => String(item || '').trim()).filter(Boolean).join(', ') : String(raw).trim();
        };
        const chars = Array.isArray(d.characters) ? d.characters : [];
        const nameFor = record => {
            if (record && typeof record === 'object') return String(record.name || record.displayName || record.id || '').trim();
            const raw = String(record || '').trim();
            return String(chars.find(item => String(item?.id || item?.characterId || item?.candidateId || '') === raw)?.name || raw).trim();
        };
        const presentRaw = Array.isArray(d.charactersPresent) ? d.charactersPresent : [];
        const present = presentRaw.map(nameFor).filter(Boolean);
        const characterNames = present.length ? present : chars.map(item => String(item?.name || '').trim()).filter(Boolean);
        const relationships = (Array.isArray(d.relationships) ? d.relationships : []).map(item => {
            const name = String(item?.name || '').trim(); if (!name) return '';
            const parts = []; if (item.relType) parts.push(String(item.relType)); if (Number.isFinite(Number(item.affection))) parts.push(`aff:${Number(item.affection)}`);
            return `${name}${parts.length ? ` (${parts.join(', ')})` : ''}`;
        }).filter(Boolean);
        const active = rows => (Array.isArray(rows) ? rows : []).filter(item => String(item?.urgency || item?.status || '').toLowerCase() !== 'resolved').map(item => String(item?.name || item?.title || '').trim()).filter(Boolean);
        const main = active(d.mainQuests), side = active(d.sideQuests);
        const applied = (state.sourcePresets || []).find(item => item.id === state.appliedPresetId);
        return {
            sp_location: value('location'), sp_time: value('time'), sp_date: value('date'), sp_mood: value('sceneMood'), sp_tension: value('sceneTension'),
            sp_weather: value('weather'), sp_topic: value('sceneTopic'), sp_summary: value('sceneSummary'), sp_temperature: value('temperature'), sp_northstar: value('northStar'),
            sp_characters: characterNames.join(', '), sp_char_count: String(characterNames.length), sp_relationships: relationships.join(', '),
            sp_quests: [...main, ...side].join(', '), sp_main_quests: main.join(', '), sp_side_quests: side.join(', '), sp_quest_count: String(main.length + side.length),
            sp_active_profile: String(applied?.displayName || state.appliedPresetId || '')
        };
    }
    // Source-style delta faces make the compact signed value readable at a
    // glance.  They are a presentation of an accepted comparison only—not a
    // second emotional interpretation or an inferred relationship change.
    const METER_DELTA_FACES = Object.freeze({
        affection: {
            up: '<path d="M7 12C4 9.5 2 7.8 2 5.8 2 4.2 3.2 3 4.6 3c.8 0 1.6.4 2.4 1.2C7.8 3.4 8.6 3 9.4 3 10.8 3 12 4.2 12 5.8 12 7.8 10 9.5 7 12z" fill="#4ade80"/>',
            down: '<path d="M7 12C4 9.5 2 7.8 2 5.8 2 4.2 3.2 3 4.6 3c.8 0 1.6.4 2.4 1.2C7.8 3.4 8.6 3 9.4 3 10.8 3 12 4.2 12 5.8 12 7.8 10 9.5 7 12z" fill="#f87171"/><path d="m4 4 6 6" stroke="#111827" stroke-width="1.2"/>'
        },
        trust: {
            up: '<path d="m7 1.5 1.8 3.6 4 .6-2.9 2.8.7 3.9L7 10.5l-3.6 1.9.7-3.9L1.2 5.7l4-.6z" fill="#4ade80"/>',
            down: '<path d="m7 1.5 1.8 3.6 4 .6-2.9 2.8.7 3.9L7 10.5l-3.6 1.9.7-3.9L1.2 5.7l4-.6z" fill="#f87171"/><path d="m4 4 6 6" stroke="#111827" stroke-width="1.1"/>'
        },
        desire: {
            up: '<circle cx="7" cy="7" r="5.5" fill="none" stroke="#4ade80" stroke-width="1.2"/><path d="m7 3.3-1.4 3.1L7 9.5l1.4-3.1z" fill="#4ade80"/>',
            down: '<circle cx="7" cy="7" r="5.5" fill="none" stroke="#f87171" stroke-width="1.2"/><path d="m3.5 3.5 7 7m0-7-7 7" stroke="#f87171" stroke-width="1.2"/>'
        },
        stress: {
            up: '<path d="M8.5 1.5 6.5 6H9l-3.5 6.5" fill="none" stroke="#facc15" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
            down: '<path d="M7 1.5C4.5 2.5 3 4 3 6.5c0 2.2 1.5 3.8 4 5 2.5-1.2 4-2.8 4-5C11 4 9.5 2.5 7 1.5Z" fill="#4ade80"/><path d="M5.2 7.3Q7 5.7 8.8 7.3" fill="none" stroke="#111827" stroke-width=".9" stroke-linecap="round"/>'
        },
        compatibility: {
            up: '<circle cx="5.5" cy="7" r="3" fill="none" stroke="#4ade80" stroke-width="1.4"/><circle cx="8.5" cy="7" r="3" fill="none" stroke="#4ade80" stroke-width="1.4"/>',
            down: '<circle cx="4.5" cy="7" r="3" fill="none" stroke="#f87171" stroke-width="1.3"/><circle cx="9.5" cy="7" r="3" fill="none" stroke="#f87171" stroke-width="1.3"/>'
        }
    });
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const OVERLAY_ROOT_ID = 'sp-worlds-overlay-root';
    const SOURCE_PROFILE_ASSETS = Object.freeze({
        prompt: '/experiences/experimental-worlds/scenepulse/vendor/ScenePulse/src/builtins/prompt.js',
        schema: '/experiences/experimental-worlds/scenepulse/vendor/ScenePulse/src/builtins/schema.js',
        slots: '/experiences/experimental-worlds/scenepulse/vendor/ScenePulse/src/prompts/slots.js'
    });
    const SOURCE_DASHBOARD_ASSET = '/experiences/experimental-worlds/scenepulse/vendor/ScenePulse/src/ui/update-panel.js';

    // Source ScenePulse deliberately appends focused views (wiki, web, graph,
    // diff and tour) above its narrow side panel.  Worlds keeps that contract:
    // the right column owns the panel, while one application-owned DOM root
    // owns viewport overlays.  It is not a second runtime or a data store.
    function overlayRoot() {
        let root = document.getElementById(OVERLAY_ROOT_ID);
        if (!root) { root = document.createElement('div'); root.id = OVERLAY_ROOT_ID; root.dataset.owner = 'scenepulse-worlds'; global.ExperimentalWorldsDom.portalRoot().appendChild(root); }
        return root;
    }

    // The source inserts weather/tint at the start of body, behind its panel.
    // Keep that paint order here as well.  This root is structural only
    // (`display: contents` in the adapter); it does not own another runtime.
    const EFFECTS_ROOT_ID = 'sp-worlds-effects-root';
    function effectsRoot() {
        let root = document.getElementById(EFFECTS_ROOT_ID);
        if (!root) {
            root = document.createElement('div'); root.id = EFFECTS_ROOT_ID; root.dataset.owner = 'scenepulse-worlds';
            global.ExperimentalWorldsDom.portalRoot().prepend(root);
        }
        return root;
    }

    // ScenePulse's source stylesheet is intentionally class-driven rather
    // than merely responsive.  Preserve that contract in Worlds so narrow
    // screens get its usable full-scene surface instead of a squeezed sidebar.
    function sourceViewportMode() {
        const width = Number(global.innerWidth || document.documentElement?.clientWidth || 1280);
        if (width <= 600) return 'mobile';
        if (width <= 1024) return 'tablet';
        return 'desktop';
    }
    function mobileChrome(state, mode) {
        if (mode === 'desktop') return '';
        if (state.mobileMinimized) return `<button type="button" class="sp-mobile-fab sp-fab-visible" data-action="mobile-restore" aria-label="Restore ScenePulse">${MASCOT}</button>`;
        return `<div class="sp-mobile-topbar sp-mt-visible"><div class="sp-mt-brand">${MASCOT}<span>Scene<span class="sp-brand-accent">Pulse</span></span></div><button type="button" class="sp-mt-minimize" data-action="mobile-minimize" aria-label="Minimize ScenePulse">⌄</button></div>`;
    }

    function meterDeltaFace(key, delta) {
        if (!delta) return '';
        const direction = delta > 0 ? 'up' : 'down';
        const art = METER_DELTA_FACES[key]?.[direction];
        if (!art) return '';
        const semantic = key === 'stress'
            ? (delta > 0 ? 'stress increased' : 'stress eased')
            : (delta > 0 ? `${key} increased` : `${key} decreased`);
        return `<span class="sp-meter-face" title="${esc(semantic)} since the previous accepted scene"><svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">${art}</svg></span>`;
    }

    const QUEST_ACTION_ICON = Object.freeze({
        complete: '<svg viewBox="0 0 14 14" width="12" height="12" fill="none" aria-hidden="true"><path d="m3 7.5 3 3 5.5-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        restore: '<svg viewBox="0 0 14 14" width="12" height="12" fill="none" aria-hidden="true"><path d="M3 7h4a3.5 3.5 0 0 1 0 7H5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M5.5 4.5 3 7l2.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        remove: '<svg viewBox="0 0 14 14" width="12" height="12" fill="none" aria-hidden="true"><path d="m3 3 8 8m0-8-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
        add: '<svg viewBox="0 0 14 14" width="11" height="11" fill="none" aria-hidden="true"><path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
    });

    // Direct adaptation of ScenePulse's seeded force layout.  The fixture has
    // no NPC-to-NPC analysis, so the graph intentionally contains only the
    // explicit user-to-character relationship records in TOUR_EXAMPLE_DATA.
    function seededRandom(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let value = Math.imul(seed ^ seed >>> 15, 1 | seed); value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value; return ((value ^ value >>> 14) >>> 0) / 4294967296; }; }
    function seedFromNames(names) { let seed = 0x811C9DC5; for (const name of names) for (let index = 0; index < name.length; index++) { seed ^= name.charCodeAt(index); seed = Math.imul(seed, 0x01000193); } return seed >>> 0; }
    function webEdgeColor(affection) { return affection >= 80 ? '#f472b6' : affection >= 60 ? '#a78bfa' : affection >= 40 ? '#60a5fa' : affection >= 20 ? '#facc15' : '#6b7280'; }
    function webPositions(rels, classic) {
        const W = 1000, H = 700, center = { x: W / 2, y: H / 2 };
        if (classic) return [center, ...rels.map((_, index) => { const angle = (2 * Math.PI * index / Math.max(1, rels.length)) - Math.PI / 2; return { x: center.x + 245 * Math.cos(angle), y: center.y + 245 * Math.sin(angle) }; })];
        const rng = seededRandom(seedFromNames(['You', ...rels.map(rel => rel.name || '')]));
        const positions = [center, ...rels.map(() => ({ x: 90 + rng() * (W - 180), y: 90 + rng() * (H - 180) }))];
        const n = positions.length, k = Math.max(120, Math.sqrt((W * H) / n) * 1.05), k2 = k * k;
        let temperature = Math.min(W, H) * .18;
        for (let iteration = 0; iteration < 200; iteration++) {
            const displacement = positions.map(() => ({ x: 0, y: 0 }));
            for (let left = 0; left < n; left++) for (let right = left + 1; right < n; right++) {
                let dx = positions[left].x - positions[right].x, dy = positions[left].y - positions[right].y, d2 = dx * dx + dy * dy;
                if (d2 < .01) { dx = rng() - .5; dy = rng() - .5; d2 = 1; }
                const distance = Math.sqrt(d2), force = k2 / distance, fx = (dx / distance) * force, fy = (dy / distance) * force;
                displacement[left].x += fx; displacement[left].y += fy; displacement[right].x -= fx; displacement[right].y -= fy;
            }
            // Fixture relations are all user-facing, so their only attractive
            // edges run between node zero and each source relationship.
            for (let index = 1; index < n; index++) {
                const dx = positions[0].x - positions[index].x, dy = positions[0].y - positions[index].y, distance = Math.sqrt(dx * dx + dy * dy) || .01, force = (distance * distance) / k;
                const fx = (dx / distance) * force, fy = (dy / distance) * force;
                displacement[0].x -= fx; displacement[0].y -= fy; displacement[index].x += fx; displacement[index].y += fy;
            }
            for (let index = 1; index < n; index++) {
                const dx = displacement[index].x, dy = displacement[index].y, distance = Math.sqrt(dx * dx + dy * dy) || .01;
                positions[index].x = clamp(positions[index].x + (dx / distance) * Math.min(distance, temperature), 52, W - 52);
                positions[index].y = clamp(positions[index].y + (dy / distance) * Math.min(distance, temperature), 52, H - 52);
            }
            temperature = Math.max(temperature - (Math.min(W, H) * .18 / 200), .1);
        }
        return positions;
    }

    function createState(accepted) {
        if (!accepted || !['accepted_fixture', 'accepted_live'].includes(accepted.status) || !accepted.scenePulse) {
            throw new Error('ScenePulse Worlds requires an accepted ScenePulse handoff.');
        }
        const composed = composeFixtureBackedScenePulse(accepted);
        const stored = accepted?.uiPreferences && typeof accepted.uiPreferences === 'object' ? accepted.uiPreferences : {};
        const storedPanels = stored.panels && typeof stored.panels === 'object' ? stored.panels : {};
        const storedFeatures = stored.features && typeof stored.features === 'object' ? stored.features : {};
        const sourceCustomPanels = Array.isArray(stored.customPanels) && stored.customPanels.length ? clone(stored.customPanels) : null;
        const state = {
            accepted, mode: accepted.status, data: composed.data, origins: composed.origins,
            // Keep the non-composed source projection for macros.  In live
            // mode this must never see the tutorial fallback used by render.
            macroSource: clone(accepted.scenePulse || {}),
            // Gate A intentionally has no predecessor.  Gate B may provide a
            // separately settled previous projection after its compact model
            // delta has been deterministically merged into `scenePulse`.
            previousData: accepted.status === 'accepted_live' && accepted.previousScenePulse ? clone(accepted.previousScenePulse) : null,
            deltaData: accepted.status === 'accepted_live' && accepted.deltaScenePulse ? clone(accepted.deltaScenePulse) : null,
            history: accepted.status === 'accepted_live' && Array.isArray(accepted.history) ? clone(accepted.history) : [],
            open: { scene: true, quests: true, relationships: true, characters: true, branches: false, history: false },
            cards: {}, tiers: { main: true, side: true }, featureMenu: false, panelManager: false,
            features: { thoughts: storedFeatures.thoughts !== false, weather: storedFeatures.weather !== false, timeTint: storedFeatures.timeTint !== false, transitions: storedFeatures.transitions !== false },
            panels: { dashboard: storedPanels.dashboard !== false, scene: storedPanels.scene !== false, quests: storedPanels.quests !== false, relationships: storedPanels.relationships !== false, characters: storedPanels.characters !== false, branches: storedPanels.branches !== false },
            compact: stored.compact === true, edit: false, showEmpty: stored.showEmpty === true, thoughtsOpen: stored.thoughtsOpen !== false, thoughtGhost: stored.thoughtGhost === true, thoughtSnap: stored.thoughtSnap !== false,
            thoughtFit: stored.thoughtFit === true, thoughtWidth: clamp(Number(stored.thoughtWidth) || 340, 220, 1400), thoughtHeight: clamp(Number(stored.thoughtHeight) || 400, 160, 1200), thoughtX: clamp(Number(stored.thoughtX) || 8, 0, 12000), thoughtY: clamp(Number(stored.thoughtY) || 68, 0, 12000),
            theme: ['default', 'midnight', 'fantasy', 'cyberpunk', 'minimal'].includes(stored.theme) ? stored.theme : 'default', fontScale: clamp(Number(stored.fontScale) || 1, .7, 1.5), selectedTimeline: accepted.status === 'accepted_live' ? String(accepted.provenance?.snapshotId || '') : 'tour-26', viewingHistory: false, selectedDossier: '', wikiSearch: '', wikiSort: 'recent', wikiFilter: 'all', wikiGrid: false, wikiNotes: clone(stored.wikiNotes || {}), portraitAssetIds: clone(stored.portraitAssetIds || {}), portraitOverrides: clone(stored.portraitSources || {}), sourceProfileAssets: null, sourceProfileLoading: false, dashboardCalendar: '', dashboardLoading: false,
            webClassic: false, webFocused: null, showWeb: false, showWiki: false, showDiff: false, showBrowse: false, showHistoryGraph: false, historyIdentity: '', showAnalytics: false, showDebug: false, debugTab: 'activity', debugQuery: '', debugLevel: 'all', debugSnapshot: '', debugCapture: null, debugCaptureResult: null, showPresets: false, presetSearch: '', presetFamily: 'all', sourcePresets: null, sourcePresetsLoading: false, appliedPresetId: String(accepted.readerPreset?.id || ''), stagnationDismissed: {}, showTour: false, showProfiles: false, showCommands: false, commandInput: '', commandResult: '', commandConfirm: null,
            diffMode: 'changes', profileTab: 'profile', fixtureProfiles: [{ name: 'ScenePulse Built-in' }], activeFixtureProfile: 0, historyCharacter: 0, historyMeter: 'affection',
            customPanels: sourceCustomPanels || clone(TOUR_CUSTOM_PANELS),
            draft: '', toast: '', tourStep: 0, activeCustomPanel: 0, sceneTransition: null, mobileMinimized: false, viewportListener: null, viewportTimer: null, viewPreferenceTimer: null,
            questDialog: null, questConfirm: null
        };
        state.customPanels.forEach((panel, index) => { state.open[customPanelKey(panel, index)] = true; });
        if (state.mode === 'accepted_live') applyHistorySelection(state, state.selectedTimeline);
        return state;
    }

    // History is a read-only projection switch.  It must replace every
    // visible source field together (including its raw compact delta and
    // predecessor for meter markers), while leaving Horde's current Turn and
    // draft untouched.  A snapshot remains fixture-backed field by field
    // where its own accepted Reader payload did not provide a value.
    function applyHistorySelection(state, snapshotId) {
        if (state.mode !== 'accepted_live') { state.selectedTimeline = snapshotId; return; }
        const currentId = String(state.accepted?.provenance?.snapshotId || '');
        const entry = (state.history || []).find(item => String(item?.id || '') === String(snapshotId || ''))
            || (state.history || []).find(item => String(item?.id || '') === currentId)
            || (state.history || []).at(-1);
        if (!entry) return;
        const selectedAccepted = entry.scenePulse && typeof entry.scenePulse === 'object'
            ? { ...state.accepted, scenePulse: entry.scenePulse, clearFields: entry.clearFields || [], replaceCollections: entry.replaceCollections || [] }
            : state.accepted;
        const composed = composeFixtureBackedScenePulse(selectedAccepted);
        state.data = composed.data;
        state.origins = composed.origins;
        state.macroSource = clone(entry.scenePulse || {});
        state.deltaData = entry.deltaScenePulse && typeof entry.deltaScenePulse === 'object' ? clone(entry.deltaScenePulse) : null;
        if (entry.previousScenePulse && typeof entry.previousScenePulse === 'object') {
            state.previousData = composeFixtureBackedScenePulse({ ...state.accepted, scenePulse: entry.previousScenePulse }).data;
        } else state.previousData = null;
        state.selectedTimeline = String(entry.id || currentId);
        state.viewingHistory = state.selectedTimeline !== currentId;
    }

    function scenePulseViewPreferences(state) {
        return {
            panels: clone(state.panels || {}), features: clone(state.features || {}), compact: state.compact === true, showEmpty: state.showEmpty === true,
            thoughtsOpen: state.thoughtsOpen !== false, thoughtGhost: state.thoughtGhost === true, thoughtSnap: state.thoughtSnap !== false, thoughtFit: state.thoughtFit === true,
            thoughtWidth: Number(state.thoughtWidth) || 340, thoughtHeight: Number(state.thoughtHeight) || 400, thoughtX: Number(state.thoughtX) || 8, thoughtY: Number(state.thoughtY) || 68,
            theme: ExperimentalWorldsState.theme || 'default', fontScale: Number(state.fontScale) || 1, customPanels: clone(state.customPanels || []),
            // Asset IDs and author notes are UI-only, stable-identity keyed
            // Wiki preferences. Their image bytes remain in Horde media
            // storage; neither becomes ScenePulse tracker evidence.
            portraitAssetIds: clone(state.portraitAssetIds || {}), wikiNotes: clone(state.wikiNotes || {})
        };
    }

    // This is the source meter contract: colour is the current accepted value;
    // the white vertical marker is a *different*, previous accepted value.  It
    // is deliberately absent for the one-reading TOUR_EXAMPLE_DATA baseline.
    function meter(label, rawValue, tag, historyTarget = null, previousValue = undefined) {
        const value = pct(rawValue); const key = slug(label);
        const labelText = String(tag || ''); const labelLow = labelText.toLowerCase();
        const isUnknown = /unknown|unclear|unreadable|\?\?\?|not yet/.test(labelLow);
        const isNA = rawValue === -1 || (key !== 'desire' && labelText === 'N/A');
        const hasTag = Boolean(labelText && labelText !== 'N/A' && !isUnknown);
        const priorNumeric = Number(previousValue);
        const hasPrior = Number.isFinite(priorNumeric) && priorNumeric >= 0 && priorNumeric <= 100;
        const delta = hasPrior && value !== pct(priorNumeric) ? value - pct(priorNumeric) : null;
        const tagMarkup = (hasTag || (isUnknown && labelText)) ? `<span class="sp-meter-tag" title="${esc(labelText)}">${esc(labelText)}</span>` : '';
        const marker = delta !== null ? `<b class="sp-meter-bar-prev" style="left:${pct(priorNumeric)}%" aria-label="Previous accepted value: ${pct(priorNumeric)}"></b>` : '';
        const bar = isNA ? '<div class="sp-meter-bar-na"></div>' : `<div class="sp-meter-bar-wrap"><div class="sp-meter-bar-track"><div class="sp-meter-bar-fill" style="width:${key === 'desire' && (rawValue === 0 || labelText === 'N/A') ? 0 : value}%"></div></div>${marker}</div>`;
        const deltaText = delta === null ? '' : `<span class="sp-meter-delta ${key === 'stress' ? (delta > 0 ? 'sp-meter-delta-stress-up' : 'sp-meter-delta-stress-down') : (delta > 0 ? 'sp-meter-delta-up' : 'sp-meter-delta-down')}">${delta > 0 ? '+' : ''}${delta}</span>${meterDeltaFace(key, delta)}`;
        const result = isUnknown ? '<span class="sp-meter-value-na">?</span>' : isNA ? '<span class="sp-meter-value-na">N/A</span>' : `<span class="sp-meter-value" title="${delta === null ? 'Current accepted value' : `Current accepted value; ${delta > 0 ? '+' : ''}${delta} since previous accepted scene`}">${key === 'desire' && (rawValue === 0 || labelText === 'N/A') ? 0 : value}${deltaText}</span>`;
        // A one-state tutorial packet can open the source history view, but it
        // must not draw a synthetic trend.  The point is intentionally the
        // current accepted reading; a prior marker and signed delta appear
        // only when Gate B supplies a separately accepted predecessor.
        const spark = historyTarget ? `<button type="button" class="sp-sparkline sp-sparkline-fixture" data-action="history-graph" data-character="${historyTarget.character}" data-identity="${esc(historyTarget.identity || '')}" data-meter="${key}" data-fixture-samples="1" aria-label="${esc(label)} history for ${historyTarget.name}: one accepted fixture reading; no prior value or delta"><svg viewBox="0 0 40 16" aria-hidden="true"><circle cx="20" cy="8" r="2" fill="${METER_COLORS[key] || '#aaa'}"/></svg></button>` : '';
        return `<div class="sp-meter-row sp-meter-${key}${tagMarkup ? ' sp-meter-has-tag' : ''}">${tagMarkup}<span class="sp-meter-label">${esc(label)}</span>${bar}${result}${spark}</div>`;
    }
    // Gate A's source fixture has display names only.  When Gate B starts
    // replacing fields it must carry a stable Horde relationship/character ID
    // beside that name, so a reveal or rename cannot make a genuine delta look
    // like an unrelated new relationship.
    function relationshipIdentity(record) {
        return String(record?.id || record?.relationshipId || record?.characterId || record?.character_id || record?.name || '').trim().toLowerCase();
    }
    function previousRelationship(state, relationship) {
        const identity = relationshipIdentity(relationship);
        return (state.previousData?.relationships || []).find(item => relationshipIdentity(item) === identity) || null;
    }
    function sourceTemplate(text, symbol) {
        const escapedSymbol = String(symbol).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = String(text || '').match(new RegExp('(?:export\\s+)?const\\s+' + escapedSymbol + '\\s*=\\s*`([\\s\\S]*?)`;'));
        if (!match) return '';
        // Source files contain JavaScript template escapes.  The profile view
        // shows the effective prompt text, not its escaped source literal.
        return match[1].replace(/\\u\{([\da-f]+)\}/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16))).replace(/\\u([\da-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\`/g, '`').replace(/\\\\/g, '\\');
    }
    function timePeriod(value) {
        const hours = Number(String(value || '').match(/(\d{1,2}):/)?.[1]);
        if (!Number.isFinite(hours)) return 'day';
        if (hours >= 5 && hours < 7) return 'dawn';
        if (hours >= 7 && hours < 11) return 'morning';
        if (hours >= 11 && hours < 14) return 'day';
        if (hours >= 14 && hours < 17) return 'afternoon';
        if (hours >= 17 && hours < 20) return 'dusk';
        if (hours >= 20 && hours < 22) return 'evening';
        return 'night';
    }
    // Source `scene-transition.js` deliberately has a coarser transition
    // cadence than the visual tint.  Keep that distinction: a tint shift is
    // not automatically a narrated scene change.
    function transitionPeriod(value) {
        const hours = Number(String(value || '').match(/(\d{1,2}):/)?.[1]);
        if (!Number.isFinite(hours)) return '';
        if (hours >= 5 && hours < 12) return 'morning';
        if (hours >= 12 && hours < 17) return 'afternoon';
        if (hours >= 17 && hours < 21) return 'evening';
        return 'night';
    }
    function weatherTypes(value) {
        const weather = String(value || '').toLowerCase(); const types = [];
        if (/snow|blizzard|sleet|ice|frost/.test(weather)) types.push('snow');
        if (/hail|ice storm|ice pellet/.test(weather)) types.push('hail');
        if (/sand|dust/.test(weather)) types.push('sandstorm');
        if (/ash|volcanic|eruption|cinder|soot/.test(weather)) types.push('ash');
        if (/thunder|lightning|storm/.test(weather)) types.push('storm');
        if (/rain|drizzle|shower|downpour/.test(weather)) types.push('rain');
        if (/fog|mist|haze/.test(weather)) types.push('fog');
        if (/wind|breez|gust/.test(weather)) types.push('wind');
        if (/aurora|northern light/.test(weather)) types.push('aurora');
        return types;
    }
    // The source generates random weather particles.  A deterministic fixture
    // seed preserves that visual language without making a local rerender look
    // like a newly accepted weather event.
    const effectNoise = (seed, min, max) => min + (((Math.sin((seed + 1) * 9277.13) * 43758.5453) % 1 + 1) % 1) * (max - min);
    const effectStyle = values => Object.entries(values).map(([key, value]) => `${key}:${value}`).join(';');
    const effectParticle = (kind, style) => `<i class="${kind}" style="${effectStyle(style)}" aria-hidden="true"></i>`;
    function sourceWeatherParticles(types) {
        const particles = [];
        const many = (count, build) => { for (let index = 0; index < count; index++) particles.push(build(index)); };
        const rain = (count, offset = 0, heavy = false) => many(count, index => effectParticle(`sp-wx-drop${heavy && index < count / 4 ? ' sp-wx-drop-heavy' : ''}`, { left: `${effectNoise(index + offset, -5, 105)}%`, height: `${effectNoise(index + offset + 30, heavy ? 18 : 10, heavy ? 35 : 26)}px`, opacity: effectNoise(index + offset + 50, .12, heavy ? .6 : .4).toFixed(2), 'animation-duration': `${effectNoise(index + offset + 70, heavy ? .25 : .45, heavy ? .6 : .95).toFixed(2)}s`, 'animation-delay': `${effectNoise(index + offset + 90, 0, 3).toFixed(2)}s`, '--wx-drift': `${effectNoise(index + offset + 110, -8, 8).toFixed(1)}px` }));
        if (types.includes('rain')) { rain(90); many(4, index => particles.push(effectParticle('sp-wx-rain-mist', { left: `${effectNoise(index + 150, -10, 80)}%`, opacity: effectNoise(index + 160, .03, .08).toFixed(2), 'animation-duration': `${effectNoise(index + 170, 12, 20).toFixed(1)}s`, 'animation-delay': `${effectNoise(index + 180, 0, 8).toFixed(1)}s` }))); }
        if (types.includes('storm')) { rain(100, 190, true); many(5, index => particles.push(effectParticle('sp-wx-lightning', { 'animation-delay': `${effectNoise(index + 230, 1, 6).toFixed(1)}s`, 'animation-duration': `${effectNoise(index + 240, 4, 9).toFixed(1)}s` }))); many(15, index => particles.push(effectParticle('sp-wx-wind-streak', { top: `${effectNoise(index + 250, 0, 100)}%`, width: `${effectNoise(index + 270, 60, 160).toFixed(0)}px`, opacity: effectNoise(index + 290, .06, .14).toFixed(2), 'animation-duration': `${effectNoise(index + 310, .4, 1.2).toFixed(2)}s`, 'animation-delay': `${effectNoise(index + 330, 0, 3).toFixed(1)}s` }))); particles.push('<i class="sp-wx-rumble" aria-hidden="true"></i>'); }
        if (types.includes('snow')) { many(80, index => { const size = effectNoise(index + 360, 1.5, 7); const bright = size > 4.5; return effectParticle(`sp-wx-flake${bright ? ' sp-wx-flake-bright' : ''}`, { left: `${effectNoise(index + 380, 0, 100)}%`, width: `${size.toFixed(1)}px`, height: `${size.toFixed(1)}px`, opacity: effectNoise(index + 400, .15, bright ? .85 : .6).toFixed(2), 'animation-duration': `${effectNoise(index + 420, 4, 16).toFixed(1)}s`, 'animation-delay': `${effectNoise(index + 440, 0, 10).toFixed(1)}s`, '--wx-drift': `${effectNoise(index + 460, -100, 100).toFixed(0)}px`, '--wx-drift2': `${effectNoise(index + 480, -60, 60).toFixed(0)}px` }); }); particles.push('<i class="sp-wx-snow-glow" aria-hidden="true"></i>'); }
        if (types.includes('hail')) { rain(50, 500); many(30, index => { const size = effectNoise(index + 530, 5, 11); return effectParticle('sp-wx-hail', { left: `${effectNoise(index + 550, 0, 100)}%`, width: `${size.toFixed(1)}px`, height: `${size.toFixed(1)}px`, opacity: effectNoise(index + 570, .45, .85).toFixed(2), 'animation-duration': `${effectNoise(index + 590, .5, .9).toFixed(2)}s`, 'animation-delay': `${effectNoise(index + 610, 0, 3).toFixed(1)}s` }); }); }
        if (types.includes('fog')) { many(10, index => particles.push(effectParticle('sp-wx-fog-layer', { top: `${effectNoise(index + 630, 0, 90).toFixed(0)}%`, height: `${effectNoise(index + 650, 18, 40).toFixed(0)}%`, opacity: effectNoise(index + 670, .06, .2).toFixed(2), 'animation-duration': `${effectNoise(index + 690, 15, 35).toFixed(1)}s`, 'animation-delay': `${effectNoise(index + 710, 0, 12).toFixed(1)}s` }))); many(3, index => particles.push(effectParticle('sp-wx-fog-ground', { opacity: effectNoise(index + 730, .08, .18).toFixed(2), 'animation-duration': `${effectNoise(index + 750, 25, 45).toFixed(1)}s`, 'animation-delay': `${effectNoise(index + 770, 0, 10).toFixed(1)}s` }))); particles.push('<i class="sp-wx-fog-haze" aria-hidden="true"></i>'); }
        if (types.includes('sandstorm')) { many(8, index => particles.push(effectParticle('sp-wx-dust-cloud', { top: `${effectNoise(index + 790, 0, 80).toFixed(0)}%`, height: `${effectNoise(index + 810, 15, 35).toFixed(0)}%`, opacity: effectNoise(index + 830, .08, .2).toFixed(2), 'animation-duration': `${effectNoise(index + 850, 10, 25).toFixed(1)}s`, 'animation-delay': `${effectNoise(index + 870, 0, 10).toFixed(1)}s` }))); many(80, index => { const size = effectNoise(index + 890, 1, 4); return effectParticle('sp-wx-dust-particle', { top: `${effectNoise(index + 910, 0, 100).toFixed(0)}%`, width: `${size.toFixed(1)}px`, height: `${size.toFixed(1)}px`, opacity: effectNoise(index + 930, .15, .5).toFixed(2), 'animation-duration': `${effectNoise(index + 950, .6, 2).toFixed(2)}s`, 'animation-delay': `${effectNoise(index + 970, 0, 6).toFixed(1)}s`, '--wx-sand-drift': `${effectNoise(index + 990, -50, 50).toFixed(0)}px` }); }); particles.push('<i class="sp-wx-sand-haze" aria-hidden="true"></i>'); }
        if (types.includes('wind')) { many(55, index => particles.push(effectParticle('sp-wx-wind-streak', { top: `${effectNoise(index + 1010, 0, 100).toFixed(0)}%`, width: `${effectNoise(index + 1030, 50, 180).toFixed(0)}px`, opacity: effectNoise(index + 1050, .06, .22).toFixed(2), 'animation-duration': `${effectNoise(index + 1070, .4, 1.6).toFixed(2)}s`, 'animation-delay': `${effectNoise(index + 1090, 0, 5).toFixed(1)}s` }))); many(25, index => { const size = effectNoise(index + 1110, 1, 3); return effectParticle('sp-wx-wind-dust', { top: `${effectNoise(index + 1130, 0, 100).toFixed(0)}%`, width: `${size.toFixed(1)}px`, height: `${size.toFixed(1)}px`, opacity: effectNoise(index + 1150, .1, .35).toFixed(2), 'animation-duration': `${effectNoise(index + 1170, 1, 3).toFixed(1)}s`, 'animation-delay': `${effectNoise(index + 1190, 0, 4).toFixed(1)}s` }); }); particles.push('<i class="sp-wx-wind-sway" aria-hidden="true"></i>'); }
        if (types.includes('aurora')) { many(10, index => { const hue = effectNoise(index + 1210, 100, 300); return effectParticle('sp-wx-aurora-ribbon', { top: `${effectNoise(index + 1230, 0, 35).toFixed(0)}%`, height: `${effectNoise(index + 1250, 10, 25).toFixed(0)}%`, opacity: effectNoise(index + 1270, .12, .3).toFixed(2), 'animation-duration': `${effectNoise(index + 1290, 6, 14).toFixed(1)}s`, 'animation-delay': `${effectNoise(index + 1310, 0, 8).toFixed(1)}s`, '--wx-hue1': hue.toFixed(0), '--wx-hue2': (hue + effectNoise(index + 1330, 40, 100)).toFixed(0) }); }); particles.push('<i class="sp-wx-aurora-curtain" aria-hidden="true"></i>'); many(35, index => { const size = effectNoise(index + 1350, 1, 3); return effectParticle('sp-wx-star', { left: `${effectNoise(index + 1370, 0, 100).toFixed(0)}%`, top: `${effectNoise(index + 1390, 0, 60).toFixed(0)}%`, width: `${size.toFixed(1)}px`, height: `${size.toFixed(1)}px`, 'animation-duration': `${effectNoise(index + 1410, 1.5, 4).toFixed(1)}s`, 'animation-delay': `${effectNoise(index + 1430, 0, 5).toFixed(1)}s` }); }); particles.push('<i class="sp-wx-aurora-glow" aria-hidden="true"></i>'); }
        if (types.includes('ash')) { many(95, index => { const size = effectNoise(index + 1450, 2, 7); return effectParticle('sp-wx-ash-flake', { left: `${effectNoise(index + 1470, 0, 100).toFixed(0)}%`, width: `${size.toFixed(1)}px`, height: `${size.toFixed(1)}px`, opacity: effectNoise(index + 1490, .2, .65).toFixed(2), 'animation-duration': `${effectNoise(index + 1510, 3, 10).toFixed(1)}s`, 'animation-delay': `${effectNoise(index + 1530, 0, 8).toFixed(1)}s`, '--wx-drift': `${effectNoise(index + 1550, -70, 70).toFixed(0)}px`, '--wx-drift2': `${effectNoise(index + 1570, -35, 35).toFixed(0)}px` }); }); many(25, index => { const size = effectNoise(index + 1590, 1.5, 4); return effectParticle('sp-wx-ember', { left: `${effectNoise(index + 1610, 0, 100).toFixed(0)}%`, width: `${size.toFixed(1)}px`, height: `${size.toFixed(1)}px`, opacity: effectNoise(index + 1630, .35, .8).toFixed(2), 'animation-duration': `${effectNoise(index + 1650, 3, 7).toFixed(1)}s`, 'animation-delay': `${effectNoise(index + 1670, 0, 6).toFixed(1)}s` }); }); particles.push('<i class="sp-wx-ash-haze" aria-hidden="true"></i>'); }
        return particles.join('');
    }
    function ambientEffects(state, mode = sourceViewportMode()) {
        const effects = [];
        // This exactly follows the source update modules: weather and tint
        // are desktop ambience, while the mobile panel keeps its rich local
        // dashboard and does not pay for full-viewport particle layers.
        if (mode === 'desktop' && state.features.timeTint) effects.push(`<div id="sp-time-tint" class="sp-time-tint sp-time-${timePeriod(state.data.time)}" aria-hidden="true"></div>`);
        if (mode === 'desktop' && state.features.weather) { const types = weatherTypes(state.data.weather); if (types.length) effects.push(`<div id="sp-weather-overlay" class="sp-wx-ov ${types.map(type => `sp-wx-ov-${type}`).join(' ')}" aria-hidden="true">${sourceWeatherParticles(types)}</div>`); }
        if (state.sceneTransition?.lines?.length && state.features.transitions) effects.push(`<div id="sp-scene-transition" class="sp-st-show" aria-hidden="true"><div class="sp-st-rule"></div>${state.sceneTransition.lines.map(line => `<span><b>${esc(line)}</b></span>`).join('<span class="sp-st-sep">›</span>')}<div class="sp-st-rule"></div></div>`);
        return effects.join('');
    }
    function triggerFixtureTransition(state, previous) {
        if (!state.features.transitions) return;
        const before = previous || {}; const lines = [];
        const oldLocation = String(before.location || '').split('>')[0].trim().toLowerCase(); const nextLocation = String(state.data.location || '').split('>')[0].trim().toLowerCase();
        if (oldLocation && nextLocation && oldLocation !== nextLocation) lines.push(...String(state.data.location || '').split('>').map(value => value.trim()).filter(Boolean));
        const oldPeriod = transitionPeriod(before.time); const nextPeriod = transitionPeriod(state.data.time);
        if (before.time && oldPeriod && nextPeriod && oldPeriod !== nextPeriod) lines.push({ morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Night' }[nextPeriod]);
        if (!lines.length) return;
        const id = `fixture-transition-${Date.now()}`; state.sceneTransition = { id, lines };
        setTimeout(() => { if (state.sceneTransition?.id === id) { state.sceneTransition = null; state.rerender?.(); } }, 4600);
    }
    function hydrateSourceProfileAssets(state) {
        if (state.sourceProfileAssets || state.sourceProfileLoading) return;
        state.sourceProfileLoading = true;
        Promise.all(Object.values(SOURCE_PROFILE_ASSETS).map(url => fetch(url).then(response => {
            if (!response.ok) throw new Error(`${url} returned ${response.status}`);
            return response.text();
        }))).then(([prompt, schema, slots]) => {
            state.sourceProfileAssets = Object.freeze({
                prompt: sourceTemplate(prompt, 'BUILTIN_PROMPT'),
                schema: schema.replace(/^\/\/[^\n]*(?:\n\/\/[^\n]*)*\n\n?/, '').trim(),
                delta: sourceTemplate(slots, '_DELTA_MODE')
            });
            state.sourceProfileLoading = false;
            state.rerender?.();
        }).catch(() => { state.sourceProfileAssets = Object.freeze({ error: 'Pinned source prompt assets could not be loaded.' }); state.sourceProfileLoading = false; state.rerender?.(); });
    }
    function hydrateSourcePresets(state) {
        if (state.sourcePresets || state.sourcePresetsLoading) return;
        state.sourcePresetsLoading = true;
        import(SOURCE_PRESET_MODULE).then(module => {
            const presets = Array.isArray(module.BUILT_IN_PRESETS) ? module.BUILT_IN_PRESETS : [];
            // Keep the actual source bundle fields that affect a Reader prompt;
            // sampler hints remain display-only exactly as upstream intends.
            state.sourcePresets = presets.map(preset => ({
                id: String(preset.id || ''), displayName: String(preset.displayName || preset.id || ''), family: String(preset.family || 'other'), provider: String(preset.provider || ''), contextWindow: Number(preset.contextWindow) || 0,
                strength: String(preset.strength || ''), notes: String(preset.notes || ''), systemPromptRole: ['system', 'user', 'assistant'].includes(preset.systemPromptRole) ? preset.systemPromptRole : null,
                promptOverrides: preset.promptOverrides && typeof preset.promptOverrides === 'object' ? clone(preset.promptOverrides) : {}, samplerHints: preset.samplerHints && typeof preset.samplerHints === 'object' ? clone(preset.samplerHints) : {}
            })).filter(preset => preset.id);
            state.sourcePresetsLoading = false; state.rerender?.();
        }).catch(() => { state.sourcePresets = []; state.sourcePresetsLoading = false; state.rerender?.(); });
    }
    function hydrateDashboardAssets(state) {
        if (state.dashboardCalendar || state.dashboardLoading) return;
        state.dashboardLoading = true;
        fetch(SOURCE_DASHBOARD_ASSET).then(response => {
            if (!response.ok) throw new Error(`dashboard source returned ${response.status}`);
            return response.text();
        }).then(source => {
            state.dashboardCalendar = sourceTemplate(source, 'calSvg');
            state.dashboardLoading = false;
            state.rerender?.();
        }).catch(() => { state.dashboardLoading = false; });
    }
    function dashboard(state) {
        const d = state.data;
        const dateParts = String(d.date || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4}).*?\(([^)]+)\)/);
        const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = dateParts ? months[Number(dateParts[1])] || dateParts[1] : '';
        const day = dateParts?.[2] || ''; const year = dateParts?.[3] || ''; const dayName = dateParts?.[4] || '';
        const weatherClass = /rain/i.test(d.weather) ? 'sp-wxc-rain' : /snow/i.test(d.weather) ? 'sp-wxc-snow' : 'sp-wxc-afternoon';
        const time = String(d.time || ''), match = time.match(/(\d{1,2}):(\d{2})/), hours = Number(match?.[1] || 0), minutes = Number(match?.[2] || 0), hour12 = hours % 12 || 12;
        const timeDisplay = match ? `${hour12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}` : time;
        const hAngle = ((hours % 12) + minutes / 60) * 30 - 90, mAngle = minutes * 6 - 90;
        const hRad = hAngle * Math.PI / 180, mRad = mAngle * Math.PI / 180;
        const ticks = Array.from({ length: 12 }, (_, index) => { const angle = (index * 30 - 90) * Math.PI / 180, major = index % 3 === 0, inner = major ? 13 : 14.5, outer = 16; return `<line x1="${(20 + Math.cos(angle) * inner).toFixed(1)}" y1="${(20 + Math.sin(angle) * inner).toFixed(1)}" x2="${(20 + Math.cos(angle) * outer).toFixed(1)}" y2="${(20 + Math.sin(angle) * outer).toFixed(1)}" stroke="var(--sp-text-dim)" stroke-width="${major ? '1.8' : '.7'}" stroke-linecap="round" opacity="${major ? '.8' : '.35'}"/>`; }).join('');
        const clock = `<svg viewBox="0 0 40 40" width="60" height="60" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="spClkBg" cx="50%" cy="40%"><stop offset="0%" stop-color="rgba(77,184,164,.08)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient></defs><circle cx="20" cy="20" r="18" fill="rgba(6,9,18,.85)"/><circle cx="20" cy="20" r="17" fill="url(#spClkBg)" stroke="var(--sp-text-dim)" stroke-width=".5" opacity=".4"/><circle cx="20" cy="20" r="17" fill="none" stroke="var(--sp-accent)" stroke-width=".6" opacity=".3"/>${ticks}<line x1="20" y1="20" x2="${20 + Math.cos(hRad) * 9}" y2="${20 + Math.sin(hRad) * 9}" stroke="var(--sp-text-bright)" stroke-width="2" stroke-linecap="round"/><line x1="20" y1="20" x2="${20 + Math.cos(mRad) * 13}" y2="${20 + Math.sin(mRad) * 13}" stroke="var(--sp-accent)" stroke-width="1.2" stroke-linecap="round"/><circle cx="20" cy="20" r="2" fill="var(--sp-accent)" opacity=".6"/><circle cx="20" cy="20" r="1" fill="var(--sp-text-bright)"/></svg>`;
        const temperature = String(d.temperature || '—'); const degree = temperature.match(/-?\d+\.?\d*\s*[°º]\s*[FCfc]?/); let tempF = null;
        if (degree) { const numeric = Number.parseFloat(degree[0]); tempF = /[°º]\s*c/i.test(degree[0]) ? numeric * 9 / 5 + 32 : numeric; }
        const tempPct = tempF === null ? 38 : clamp((tempF + 10) / 130 * 100, 2, 98), chevron = 4 + (192 * tempPct / 100);
        const tempDisplay = tempF === null ? temperature : `${Math.round(tempF)}°F / ${Math.round((tempF - 32) * 5 / 9)}°C`;
        const dashValue = (field, display, classes) => `<div class="${classes} sp-editable"${state.edit ? ` data-action="edit-dashboard-field" data-field="${field}" role="button" tabindex="0" title="Edit ${field} in the isolated tutorial state"` : ''}>${esc(display)}${fixtureChip(state, field)}</div>`;
        const tempBar = `<div class="sp-temp-bar-wrap"><svg class="sp-temp-bar-svg" viewBox="0 0 200 22" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><defs><linearGradient id="spTempGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#4a3fa0"/><stop offset="12%" stop-color="#3060c8"/><stop offset="24%" stop-color="#2898d8"/><stop offset="38%" stop-color="#28b8b0"/><stop offset="50%" stop-color="#38c878"/><stop offset="60%" stop-color="#4dbd5c"/><stop offset="70%" stop-color="#a0c830"/><stop offset="80%" stop-color="#e8b020"/><stop offset="88%" stop-color="#e07828"/><stop offset="96%" stop-color="#c83030"/><stop offset="100%" stop-color="#901818"/></linearGradient></defs><rect x="4" y="6" width="192" height="6" rx="3" fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.06)" stroke-width=".4"/><rect x="4" y="6" width="192" height="6" rx="3" fill="url(#spTempGrad)" opacity=".85"/><polygon points="${chevron - 4},1.5 ${chevron + 4},1.5 ${chevron},6" fill="var(--sp-text-bright)" opacity=".85"/><line x1="${chevron}" y1="6" x2="${chevron}" y2="12" stroke="var(--sp-text-bright)" stroke-width=".8" opacity=".5"/></svg>${dashValue('temperature', tempDisplay, 'sp-temp-bar-label')}</div>`;
        const weather = `<svg class="sp-wx-svg" viewBox="0 0 48 48" aria-hidden="true"><path d="M12 28h23a8 8 0 0 0 0-16 12 12 0 0 0-22 5A6 6 0 0 0 12 28Z" fill="rgba(184,196,214,.16)" stroke="rgba(203,215,232,.55)" stroke-width="1.2"/><path d="M16 34l-2 6m9-6-2 6m9-6-2 6m9-6-2 6" stroke="#77b5e8" stroke-width="1.4" stroke-linecap="round"/></svg>`;
        const location = `<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M14 3 6 14h4l-4 6h16l-4-6h4L14 3Z" fill="currentColor" opacity=".72"/><path d="M14 11v13M9 24h10" stroke="currentColor" stroke-width="1.2" opacity=".9"/></svg>`;
        return `<div class="sp-env-permanent"><div class="sp-dashboard"><article class="sp-dash-card sp-dash-card-date" data-card="date">${state.dashboardCalendar}<div class="sp-cal-shimmer-overlay"></div><div class="sp-cal-particles"><div class="sp-cal-particle"></div><div class="sp-cal-particle"></div><div class="sp-cal-particle"></div><div class="sp-cal-particle"></div><div class="sp-cal-particle"></div><div class="sp-cal-particle"></div></div><div class="sp-dash-sub">${esc(month)} ${esc(day)}</div>${dashValue('date', dayName, 'sp-dash-day')}<div class="sp-dash-sub">${esc(year)}</div></article><article class="sp-dash-card sp-dash-card-time" data-card="time"><div class="sp-clock-shimmer"></div><div class="sp-clock-particles"><div class="sp-clock-particle"></div><div class="sp-clock-particle"></div><div class="sp-clock-particle"></div><div class="sp-clock-particle"></div><div class="sp-clock-particle"></div></div><div class="sp-clock-backing"></div><div class="sp-dash-clock">${clock}</div>${dashValue('time', timeDisplay, 'sp-dash-value sp-time-value')}</article><article class="sp-dash-card sp-dash-card-temp" data-card="temperature">${tempBar}</article><article class="sp-dash-card sp-dash-card-weather ${weatherClass}" data-card="weather">${weather}${dashValue('weather', d.weather || '—', 'sp-dash-value')}</article></div><div class="sp-dash-location"><span class="sp-dash-loc-icon">${location}</span>${dashValue('location', d.location || '', 'sp-dash-loc-text')}</div></div>`;
    }
    function section(state, key, title, content, badge = '') {
        if (state.panels[key] === false) return '';
        const isOpen = state.open[key] !== false;
        const origin = ({ scene: 'sceneSummary', quests: 'mainQuests', relationships: 'relationships', characters: 'characters', branches: 'plotBranches' })[key] || '';
        return `<section class="sp-section${isOpen ? ' sp-open' : ''}" data-sp-section="${key}"><header class="sp-section-header" data-action="section" data-key="${key}" role="button" tabindex="0" aria-expanded="${isOpen}"><span class="sp-section-chevron">▸</span><span class="sp-section-icon">${SECTION_ICON[key] || SECTION_ICON.custom}</span><span class="sp-section-title">${esc(title)}</span>${badge !== '' ? `<span class="sp-section-badge">${esc(badge)}</span>` : ''}${fixtureChip(state, origin)}<span class="sp-section-spacer"></span><button type="button" class="sp-section-refresh" data-action="fixture-refresh" data-section="${key}" title="Refresh ${esc(title)}">${ICON.refresh}</button></header><div class="sp-section-body"><div class="sp-section-content">${content}</div></div></section>`;
    }
    function sceneDetails(state) {
        const d = state.data; const rows = [
            ['Summary', 'sceneSummary', d.sceneSummary, 'sp-scene-summary sp-scene-summary-row'], ['Tension', 'sceneTension', d.sceneTension, `sp-scene-tension-row sp-tension-${slug(d.sceneTension || 'calm')}`], ['Topic', 'sceneTopic', d.sceneTopic], ['Mood', 'sceneMood', d.sceneMood], ['Interaction', 'sceneInteraction', d.sceneInteraction], ['Elapsed', 'elapsed', d.elapsed], ['Sounds', 'soundEnvironment', d.soundEnvironment, 'sp-scene-sounds-row'], ['Witnesses', 'witnesses', Array.isArray(d.witnesses) ? d.witnesses.join(', ') : d.witnesses]
        ];
        return rows.map(([label, field, value, classes]) => {
            const known = value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0);
            if (!known && !state.showEmpty && !state.edit) return '';
            const editor = state.edit ? ` data-action="edit-scene-field" data-field="${esc(field)}" title="Edit ${esc(label)} in the isolated tutorial state"` : '';
            return `<div class="sp-row ${classes || ''}${known ? '' : ' sp-empty-field'}"><span class="sp-row-label">${esc(label)}</span><span class="sp-row-value sp-editable${known ? '' : ' sp-empty-field'}"${editor}>${known ? esc(value) : '—'}${fixtureChip(state, field)}</span></div>`;
        }).join('');
    }
    // Source stagnation diagnostics are useful only when their inputs are
    // actual accepted readings. Never analyse the sealed fixture fallback as
    // if it were four real beats; that would pressure the story to change for
    // presentation's sake instead of revealing stale tracking honestly.
    function detectAcceptedScenePulseStagnation(state) {
        if (state.mode !== 'accepted_live' || state.viewingHistory) return null;
        const recent = (state.history || []).slice(-4);
        if (recent.length < 4) return null;
        const readings = recent.map(entry => entry?.scenePulse || null);
        if (readings.some(reading => !reading || typeof reading !== 'object')) return null;
        const same = field => {
            const values = readings.map(reading => String(reading[field] || '').trim().toLowerCase());
            return values[0] && values.every(value => value === values[0]) ? values[0] : '';
        };
        const tension = same('sceneTension');
        if (tension) {
            const rank = ({ calm: 0, low: 1, moderate: 2, high: 3, critical: 4 })[tension] ?? 2;
            return {
                type: 'tension', snapshotId: String(recent.at(-1)?.id || ''),
                suggestion: rank <= 1
                    ? 'Scene tension has been low for several accepted readings. Consider conflict, a revelation, or a time-sensitive event.'
                    : rank >= 3
                        ? 'Tension has been high for several accepted readings. Consider a resolution beat, comic relief, or time to process.'
                        : 'The accepted scene readings have settled into a pattern. Consider a twist, new entrance, or location change.'
            };
        }
        const mood = same('sceneMood');
        if (mood) return { type: 'mood', snapshotId: String(recent.at(-1)?.id || ''), suggestion: 'The emotional tone has been static across accepted readings. A shift in mood could re-engage the scene.' };
        const topics = readings.map(reading => String(reading.sceneTopic || '').toLowerCase().split(/\s+/).filter(word => word.length > 3));
        if (topics.every(words => words.length)) {
            const seed = new Set(topics[0]);
            const overlaps = topics.slice(1).filter(words => words.filter(word => seed.has(word)).length >= Math.floor(seed.size * .5));
            if (overlaps.length === 3) return { type: 'topic', snapshotId: String(recent.at(-1)?.id || ''), suggestion: 'The topic has stayed similar across accepted readings. A new question, complication, or discovery may open the scene.' };
        }
        return null;
    }
    function stagnationBanner(state) {
        const result = detectAcceptedScenePulseStagnation(state);
        if (!result || state.stagnationDismissed?.[result.snapshotId]) return '';
        return `<aside class="sp-stagnation-banner" data-stagnation="${esc(result.snapshotId)}"><span class="sp-stag-icon">💤</span><span class="sp-stag-text">${esc(result.suggestion)}</span><button type="button" class="sp-stag-dismiss" data-action="stagnation-dismiss" data-snapshot="${esc(result.snapshotId)}" title="Dismiss">✕</button></aside>`;
    }
    const CHAR_SECTION_ICON = Object.freeze({
        now: '<svg viewBox="0 0 12 12" width="11" height="11" fill="none" aria-hidden="true"><path d="M7 1 3 7h3l-1 4 4-6H6l1-4z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" fill="currentColor" fill-opacity=".25"/></svg>',
        appearance: '<svg viewBox="0 0 12 12" width="11" height="11" fill="none" aria-hidden="true"><path d="M1 6Q6 1.8 11 6 6 10.2 1 6Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><circle cx="6" cy="6" r="1.6" fill="currentColor"/></svg>',
        carrying: '<svg viewBox="0 0 12 12" width="11" height="11" fill="none" aria-hidden="true"><path d="M2.5 4.5h7V11h-7zM4 4.5Q4 1.5 6 1.5t2 3" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M4 7h4" stroke="currentColor" stroke-width=".8" opacity=".5"/></svg>',
        goals: '<svg viewBox="0 0 12 12" width="11" height="11" fill="none" aria-hidden="true"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.1"/><circle cx="6" cy="6" r="2.5" stroke="currentColor" stroke-width=".9" opacity=".7"/><circle cx="6" cy="6" r=".9" fill="currentColor"/></svg>',
        fertility: '<svg viewBox="0 0 12 12" width="11" height="11" fill="none" aria-hidden="true"><path d="M6 1.5C3 3 2 6 3.5 9 6 10 9 9 10 6 9.5 3 8 1.5 6 1.5Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M4 8.5Q6 5.5 9 4" stroke="currentColor" stroke-width=".9" stroke-linecap="round" opacity=".65"/></svg>'
    });
    function characterSubsection(label, icon) {
        return `<div class="sp-char-subsection-label"><span class="sp-char-subsection-icon">${icon}</span><span class="sp-char-subsection-text">${esc(label)}</span></div>`;
    }
    function characterGrid(state, character, index, fields) {
        return `<div class="sp-char-grid">${fields.map(([label, key]) => {
            const value = character[key];
            const known = value !== undefined && value !== null && value !== '';
            if (!known && !state.showEmpty && !state.edit) return '';
            const editor = state.edit ? ` data-action="edit-character-field" data-character="${index}" data-field="${esc(key)}" title="Edit ${esc(label)} in the isolated tutorial state"` : '';
            return `<span class="sp-char-field${known ? '' : ' sp-empty-field'}">${esc(label)}</span><span class="sp-char-val${known ? ' sp-editable' : ' sp-empty-field'}"${editor}>${known ? esc(value) : '—'}</span>`;
        }).join('')}</div>`;
    }
    function characterCard(state, char, index) {
        const id = `char-${index}`; const open = state.cards[id] !== false; const color = COLORS[index % COLORS.length];
        const portrait = portraitSource(state, char, index);
        const appearance = [['Hair', char.hair], ['Face', char.face], ['Outfit', char.outfit], ['Posture', char.posture], ['Proximity', char.proximity], ['Notable details', char.notableDetails]];
        const inventory = Array.isArray(char.inventory) ? char.inventory.filter(Boolean) : [];
        const fertilityVisible = (char.fertStatus && char.fertStatus !== 'N/A') || state.showEmpty || state.edit;
        const carrying = inventory.length || state.showEmpty || state.edit
            ? `${characterSubsection('Carrying', CHAR_SECTION_ICON.carrying)}<div class="sp-char-inventory${inventory.length ? '' : ' sp-empty-field'}">${inventory.length ? inventory.map(item => `<span class="sp-char-inventory-item">${esc(item)}</span>`).join('') : '<span class="sp-char-inventory-item sp-char-inventory-empty">(no items)</span>'}</div>`
            : '';
        const fertility = fertilityVisible
            ? `${characterSubsection('Fertility', CHAR_SECTION_ICON.fertility)}<div class="sp-fert-section">${char.fertStatus === 'N/A' && !state.showEmpty && !state.edit ? '<div class="sp-fert-na">Fertility: N/A</div>' : characterGrid(state, char, index, [['Status', 'fertStatus'], ['Notes', 'fertNotes']])}</div>`
            : '';
        const thoughtEditor = state.edit ? ` data-action="edit-character-field" data-character="${index}" data-field="innerThought" title="Edit Inner Thought in the isolated tutorial state"` : '';
        return `<article class="sp-char-card${open ? ' sp-card-open' : ''}" data-char="${id}" style="--char-accent:${color};--char-border:${color}"><header class="sp-char-header" data-action="card" data-card="${id}" role="button" tabindex="0" aria-expanded="${open}"><button type="button" class="sp-char-portrait" data-action="portrait" data-character="${index}" title="Set portrait">${portrait ? `<img src="${portrait}" alt="">` : `<span class="sp-char-portrait-monogram">${esc(monogram(char.name))}</span>`}</button><span class="sp-char-chevron">▸</span><span class="sp-char-name-col"><span class="sp-char-name-row"><strong class="sp-char-name">${esc(char.name)}</strong><span class="sp-char-archetype">Present</span>${fixtureChip(state, 'characters')}</span><small class="sp-char-meta">${esc(char.role)}</small></span><button type="button" class="sp-char-wiki-link" data-action="wiki-character" data-character="${index}">Wiki</button></header><div class="sp-char-body"><div class="sp-char-role-row">${characterGrid(state, char, index, [['Role', 'role']])}</div>${characterSubsection('Right Now', CHAR_SECTION_ICON.now)}<blockquote class="sp-char-thought-block${state.edit ? ' sp-editable' : ''}"${thoughtEditor}>${esc(char.innerThought || '—')}</blockquote>${characterGrid(state, char, index, [['Needs', 'immediateNeed']])}${characterSubsection('Appearance', CHAR_SECTION_ICON.appearance)}${characterGrid(state, char, index, [['Hair', 'hair'], ['Face', 'face'], ['Outfit', 'outfit'], ['Posture', 'posture'], ['Proximity', 'proximity'], ['Notable details', 'notableDetails']])}${carrying}${characterSubsection('Goals', CHAR_SECTION_ICON.goals)}${characterGrid(state, char, index, [['Short-Term', 'shortTermGoal'], ['Long-Term', 'longTermGoal']])}${fertility}</div></article>`;
    }
    function characters(state) { return (state.data.characters || []).map((char, index) => characterCard(state, char, index)).join(''); }
    function relationshipCard(state, rel, index) {
        const id = `rel-${index}`; const open = state.cards[id] !== false; const color = colorFor(rel.name, state.data);
        const historyTarget = { character: index, identity: relationshipIdentity(rel), name: rel.name }; const previous = previousRelationship(state, rel);
        const relValue = (field, value) => `<span class="sp-editable"${state.edit ? ` data-action="edit-relationship-field" data-character="${index}" data-field="${field}" title="Edit ${field} in the isolated tutorial state"` : ''}>${esc(value || '—')}</span>`;
        return `<article class="sp-rel-block${open ? ' sp-card-open' : ''}" data-rel="${id}" style="--char-accent:${color};--char-border:${color};--char-bg:color-mix(in srgb,${color} 9%,transparent)"><header class="sp-rel-header" data-action="card" data-card="${id}" role="button" tabindex="0" aria-expanded="${open}"><span class="sp-rel-chevron">▸</span><span class="sp-char-portrait"><span class="sp-char-portrait-monogram">${esc(monogram(rel.name))}</span></span><strong class="sp-rel-name">${esc(rel.name)}</strong><span class="sp-rel-type-badge">${esc(rel.relType)}</span><span class="sp-rel-phase-badge">${esc(rel.relPhase)}</span>${fixtureChip(state, 'relationships')}</header><div class="sp-rel-body"><div class="sp-rel-meta"><div class="sp-rel-meta-item"><span class="sp-rel-meta-label">Known</span>${relValue('timeTogether', rel.timeTogether)}</div><div class="sp-rel-meta-item"><span class="sp-rel-meta-label">Milestone</span>${relValue('milestone', rel.milestone)}</div></div>${meter('Affection', rel.affection, rel.affectionLabel, historyTarget, previous?.affection)}${meter('Trust', rel.trust, rel.trustLabel, historyTarget, previous?.trust)}${meter('Desire', rel.desire, rel.desireLabel, historyTarget, previous?.desire)}${meter('Stress', rel.stress, rel.stressLabel, historyTarget, previous?.stress)}${meter('Compatibility', rel.compatibility, rel.compatibilityLabel, historyTarget, previous?.compatibility)}</div></article>`;
    }
    function relationships(state) { return (state.data.relationships || []).map((rel, index) => relationshipCard(state, rel, index)).join(''); }
    function questEntry(state, quest, index, tier) {
        const id = `quest-${tier}-${index}`; const open = state.cards[id] !== false;
        const resolved = String(quest.urgency || '').toLowerCase() === 'resolved';
        const status = resolved ? '<span class="sp-quest-status sp-quest-status-done">Resolved</span>' : '';
        const primaryAction = resolved
            ? `<button type="button" class="sp-quest-action sp-quest-undo" data-action="quest-restore" data-quest-tier="${esc(tier)}" data-quest-index="${index}" title="Restore quest">${QUEST_ACTION_ICON.restore}</button>`
            : `<button type="button" class="sp-quest-action sp-quest-complete" data-action="quest-complete" data-quest-tier="${esc(tier)}" data-quest-index="${index}" title="Mark as completed">${QUEST_ACTION_ICON.complete}</button>`;
        const urgency = resolved ? '' : `<span class="sp-plot-status sp-urgency-${esc(slug(quest.urgency || 'moderate'))}">${esc(quest.urgency || 'moderate')}</span>`;
        const editable = (field, classes, value) => `<${field === 'name' ? 'strong' : 'div'} class="${classes} sp-editable"${state.edit ? ` data-action="edit-quest-field" data-quest-tier="${esc(tier)}" data-quest-index="${index}" data-field="${field}" title="Edit quest ${field} in the isolated tutorial state"` : ''}>${esc(value || '—')}</${field === 'name' ? 'strong' : 'div'}>`;
        return `<article class="sp-plot-entry${open ? ' sp-card-open' : ''}${resolved ? ' sp-quest-resolved' : ''}" data-quest="${id}"><header class="sp-quest-header" data-action="card" data-card="${id}" role="button" tabindex="0" aria-expanded="${open}"><span class="sp-quest-chevron">▸</span>${urgency}${editable('name', 'sp-plot-name', quest.name)}<span class="sp-quest-right">${status}<span class="sp-quest-actions">${primaryAction}<button type="button" class="sp-quest-action sp-quest-remove" data-action="quest-remove" data-quest-tier="${esc(tier)}" data-quest-index="${index}" title="Remove quest">${QUEST_ACTION_ICON.remove}</button></span></span></header>${editable('detail', 'sp-quest-detail', quest.detail)}</article>`;
    }
    function questTier(state, key, title, quests, style) {
        const open = state.tiers[key] !== false;
        return `<div class="sp-plot-tier ${style}${open ? ' sp-tier-open' : ''}"><div class="sp-plot-tier-title" data-action="tier" data-tier="${key}" role="button" tabindex="0" aria-expanded="${open}"><span class="sp-tier-chevron">▸</span><span>${esc(title)}</span><span class="sp-section-badge">${quests.length}</span></div><div class="sp-tier-body">${quests.map((quest, index) => questEntry(state, quest, index, key)).join('')}<button type="button" class="sp-quest-add" data-action="quest-add" data-quest-tier="${esc(key)}" data-quest-title="${esc(title)}">${QUEST_ACTION_ICON.add} Add quest</button></div></div>`;
    }
    function quests(state) {
        const d = state.data;
        const northStar = `<div class="sp-quest-star sp-editable"${state.edit ? ' data-action="edit-quest-field" data-quest-tier="northStar" data-field="northStar" title="Edit North Star in the isolated tutorial state"' : ''}>${esc(d.northStar || '—')}</div>`;
        return `<div class="sp-plot-tier sp-tier-star sp-tier-open"><div class="sp-plot-tier-title"><span class="sp-tier-chevron">▸</span><span>North Star</span></div><div class="sp-tier-body">${northStar}</div></div>${questTier(state, 'mainQuests', 'Main Quests', d.mainQuests || [], 'sp-tier-main')}${questTier(state, 'sideQuests', 'Side Quests', d.sideQuests || [], 'sp-tier-side')}`;
    }
    function questDialog(state) {
        if (state.questDialog) {
            const dialog = state.questDialog;
            return `<div class="sp-confirm-overlay sp-confirm-visible" role="presentation"><section class="sp-confirm-dialog sp-quest-dialog" role="dialog" aria-modal="true" aria-labelledby="sp-quest-dialog-title"><div id="sp-quest-dialog-title" class="sp-confirm-title">Add Quest — ${esc(dialog.title)}</div><div class="sp-quest-dialog-form"><label class="sp-quest-dialog-label" for="sp-qd-name">Name</label><input type="text" class="sp-quest-dialog-input" id="sp-qd-name" placeholder="Quest name" autofocus><label class="sp-quest-dialog-label" for="sp-qd-urgency">Urgency</label><select class="sp-quest-dialog-select" id="sp-qd-urgency"><option value="critical">Critical</option><option value="high">High</option><option value="moderate" selected>Moderate</option><option value="low">Low</option></select><label class="sp-quest-dialog-label" for="sp-qd-detail">Details <span style="opacity:.4">(optional)</span></label><textarea class="sp-quest-dialog-textarea" id="sp-qd-detail" placeholder="1–2 sentences from your perspective" rows="3"></textarea></div><div class="sp-confirm-actions"><button type="button" class="sp-confirm-btn sp-confirm-cancel" data-action="quest-dialog-cancel">Cancel</button><button type="button" class="sp-confirm-btn sp-quest-dialog-ok" data-action="quest-dialog-submit">Add Quest</button></div></section></div>`;
        }
        if (state.questConfirm) {
            const quest = state.questConfirm;
            return `<div class="sp-confirm-overlay sp-confirm-visible" role="presentation"><section class="sp-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="sp-quest-confirm-title"><div id="sp-quest-confirm-title" class="sp-confirm-title">Remove Quest</div><div class="sp-confirm-msg">Remove “${esc(quest.name)}” from this isolated tutorial state?</div><div class="sp-confirm-actions"><button type="button" class="sp-confirm-btn sp-confirm-cancel" data-action="quest-confirm-cancel">Cancel</button><button type="button" class="sp-confirm-btn sp-confirm-ok" data-action="quest-confirm-remove">Remove</button></div></section></div>`;
        }
        return '';
    }
    const IDEA_CATEGORY = Object.freeze({
        dramatic: { label: 'Dramatic', color: '#c47a9a', icon: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2C5 2 3 5 3 8c0 2 1.5 4 3.5 5L8 14.5 9.5 13C11.5 12 13 10 13 8c0-3-2-6-5-6z" fill="currentColor" opacity=".2" stroke="currentColor" stroke-width="1.1"/><path d="M6.5 7.5Q7 6 8 6q1 0 1.5 1.5" stroke="currentColor" stroke-width=".8" stroke-linecap="round" opacity=".6"/></svg>' },
        intense: { label: 'Intense', color: '#d45050', icon: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><polygon points="8,1 10,6 15,6.5 11,10 12.5,15 8,12 3.5,15 5,10 1,6.5 6,6" fill="currentColor" opacity=".2" stroke="currentColor" stroke-width="1"/></svg>' },
        comedic: { label: 'Comedic', color: '#d4a855', icon: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="currentColor" opacity=".15" stroke="currentColor" stroke-width="1.1"/><circle cx="5.8" cy="6.5" r=".8" fill="currentColor" opacity=".5"/><circle cx="10.2" cy="6.5" r=".8" fill="currentColor" opacity=".5"/><path d="M5.5 9.5Q8 12.5 10.5 9.5" stroke="currentColor" stroke-width=".9" stroke-linecap="round" fill="none"/></svg>' },
        twist: { label: 'Twist', color: '#9070c0', icon: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 12 4-8 4 8" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="8" cy="10" r="1.2" fill="currentColor" opacity=".4"/><path d="M8 5.5v2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".6"/></svg>' },
        exploratory: { label: 'Exploratory', color: '#5b9cc4', icon: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.1"/><path d="M8 2v2M8 12v2M2 8h2M12 8h2" stroke="currentColor" stroke-width=".8" opacity=".4" stroke-linecap="round"/><polygon points="8,5 9.5,7.5 8,7 6.5,7.5" fill="currentColor" opacity=".5"/><circle cx="8" cy="8" r="1" fill="currentColor" opacity=".3"/></svg>' }
    });
    const IDEA_ACTION_ICON = Object.freeze({
        paste: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true"><rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M6 1.5h4a1 1 0 0 1 1 1V3H5v-.5a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width=".8" opacity=".6"/><path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" stroke="currentColor" stroke-width=".8" opacity=".5"/></svg>',
        inject: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true"><path d="M3 2.5 13 8 3 13.5V9.5L9 8 3 6.5z" fill="currentColor" opacity=".7" stroke="currentColor" stroke-width=".8" stroke-linejoin="round"/></svg>'
    });
    // Source profiles call these `type`, `name` and `hook`; the compact
    // Reader delta uses the equally source-semantic `branchType` and
    // `description`. Adapt only that spelling difference so live ideas retain
    // their source cards and the two original actions.
    function storyIdeaShape(idea = {}) {
        const source = idea && typeof idea === 'object' ? idea : {};
        const type = String(source.type || source.branchType || 'exploratory').toLowerCase();
        const hook = String(source.hook || source.description || source.name || '').trim();
        return { ...source, type: IDEA_CATEGORY[type] ? type : 'exploratory', name: String(source.name || source.title || hook || 'Story direction').trim(), hook };
    }
    function storyIdeaDirection(idea = {}) {
        const source = storyIdeaShape(idea);
        // Compact Reader branches commonly have one authoritative
        // `description` rather than separate source `name` and `hook` fields.
        // Do not repeat that same model-authored text in the next prompt.
        const extra = source.hook && source.hook !== source.name ? ` ${source.hook}` : '';
        return `[OOC: Take the story in a ${source.type} direction — "${source.name}".${extra}]`;
    }
    function ideaCard(state, idea, index) {
        const source = storyIdeaShape(idea); const id = `idea-${index}`; const open = state.cards[id] === true; const category = IDEA_CATEGORY[source.type] || IDEA_CATEGORY.exploratory;
        const live = state.mode === 'accepted_live';
        return `<article class="sp-idea-card sp-idea-${esc(slug(source.type || 'exploratory'))}${open ? ' sp-card-open' : ''}" style="--idea-color:${category.color}"><header class="sp-idea-header" data-action="card" data-card="${id}" role="button" tabindex="0" aria-expanded="${open}"><span class="sp-idea-chevron">▸</span><span class="sp-idea-icon">${category.icon}</span><span class="sp-idea-type">${esc(category.label)}</span><strong class="sp-idea-name">${esc(source.name)}</strong>${fixtureChip(state, 'plotBranches')}<span class="sp-idea-spacer"></span><button type="button" class="sp-idea-paste" data-action="paste" data-idea="${index}" title="${live ? 'Paste to Horde draft (edit before sending)' : 'Paste to isolated tour draft'}">${IDEA_ACTION_ICON.paste}</button><button type="button" class="sp-idea-inject" data-action="inject" data-idea="${index}" title="${live ? 'Send immediately and generate' : 'Stage injection in isolated tour draft'}">${IDEA_ACTION_ICON.inject}</button></header><div class="sp-idea-body"><div class="sp-idea-hook">${esc(source.hook)}</div></div></article>`;
    }
    function ideas(state) { return `<div class="sp-ideas-list">${(state.data.plotBranches || []).map((idea, index) => ideaCard(state, idea, index)).join('')}</div>${state.draft ? `<div class="sp-tour-draft"><strong>Tour draft</strong><p>${esc(state.draft)}</p><button type="button" data-action="clear-draft">Clear</button></div>` : ''}`; }
    function history(state) {
        if (state.mode !== 'accepted_live') {
            const selected = TOUR_TIMELINE.find(item => item.id === state.selectedTimeline) || TOUR_TIMELINE.at(-1);
            return `<div class="sp-timeline" id="sp-timeline"><div class="sp-timeline-bar">${TOUR_TIMELINE.map((item, index) => `<button type="button" class="sp-tl-node-wrap" style="left:${4 + (index / (TOUR_TIMELINE.length - 1)) * 92}%" data-action="timeline" data-snapshot="${item.id}" aria-label="${item.label}"><span class="sp-tl-dot${item.current ? ' sp-tl-dot-active' : ''}${state.selectedTimeline === item.id ? ' sp-tl-dot-selected' : ''}"></span>${item.current || state.selectedTimeline === item.id ? `<span class="sp-tl-label">${item.label}</span>` : ''}</button>`).join('')}</div><div class="sp-tour-history-note"><strong>${esc(selected.label)}</strong> · Source guided-tour snapshot index. The complete accepted café handoff remains selected; these guide nodes do not invent prior story data.</div><div class="sp-timeline-actions"><button type="button" data-action="browse">Browse All</button><button type="button" data-action="diff">Inspect payload / diff</button></div></div>`;
        }
        const samples = state.history.length ? state.history : [{ id: state.accepted?.provenance?.snapshotId || 'current', label: 'Turn 1', current: true, summary: 'Accepted ScenePulse reading' }];
        const selected = samples.find(item => item.id === state.selectedTimeline) || samples.at(-1);
        const denom = Math.max(1, samples.length - 1);
        const current = samples.find(item => item.current) || samples.at(-1);
        return `<div class="sp-timeline" id="sp-timeline"><div class="sp-timeline-bar">${samples.map((item, index) => `<button type="button" class="sp-tl-node-wrap" style="left:${samples.length === 1 ? 50 : 4 + (index / denom) * 92}%" data-action="timeline" data-snapshot="${esc(item.id)}" aria-label="${esc(item.label)}"><span class="sp-tl-dot${item.current ? ' sp-tl-dot-active' : ''}${selected.id === item.id ? ' sp-tl-dot-selected' : ''}"></span>${item.current || selected.id === item.id ? `<span class="sp-tl-label">${esc(item.label)}</span>` : ''}</button>`).join('')}</div><div class="sp-tour-history-note"><strong>${esc(selected.label)}</strong> · Accepted Horde Reader snapshot${samples.length === 1 ? '' : ` ${samples.findIndex(item => item.id === selected.id) + 1} of ${samples.length}`}. ${esc(selected.summary || 'No summary supplied.')}</div><div class="sp-timeline-actions">${state.viewingHistory ? `<button type="button" data-action="timeline" data-snapshot="${esc(current.id)}">Return to current</button>` : ''}<button type="button" data-action="browse">Browse accepted</button><button type="button" data-action="analytics">Analytics</button><button type="button" data-action="diff">Inspect payload / diff</button></div></div>`;
    }
    function customPanelManager(state, panel, index) {
        const open = state.activeCustomPanel === index;
        const fields = Array.isArray(panel?.fields) ? panel.fields : [];
        const fieldRows = fields.map((field, fieldIndex) => {
            const options = Array.isArray(field.options) ? field.options.join(', ') : '';
            const enumOptions = field.type === 'enum' ? `<label class="sp-cp-setting sp-cp-options"><span>Enum options</span><input type="text" data-action="custom-field-options" data-panel="${index}" data-field="${fieldIndex}" value="${esc(options)}" placeholder="low, medium, high"></label>` : '';
            const meterInvert = field.type === 'meter' ? `<label class="sp-cp-check"><input type="checkbox" data-action="custom-field-invert" data-panel="${index}" data-field="${fieldIndex}" ${field.invert ? 'checked' : ''}> High is adverse</label>` : '';
            return `<div class="sp-custom-field" data-custom-drop-panel="${index}" data-custom-drop-field="${fieldIndex}"><span class="sp-custom-drag" draggable="true" data-custom-drag-panel="${index}" data-custom-drag-field="${fieldIndex}" title="Drag to reorder or move to another custom panel">⠿</span><div class="sp-cp-field-head"><label class="sp-cp-check" title="Enable or disable this tracked field"><input type="checkbox" data-action="custom-field-enabled" data-panel="${index}" data-field="${fieldIndex}" ${field.enabled !== false ? 'checked' : ''}> Enabled</label><button type="button" data-action="custom-field-delete" data-panel="${index}" data-field="${fieldIndex}" title="Remove field">×</button></div><div class="sp-cp-field-grid"><label class="sp-cp-setting"><span>Key</span><input type="text" data-action="custom-field-key" data-panel="${index}" data-field="${fieldIndex}" value="${esc(field.key || '')}" placeholder="lowercase_snake_case"></label><label class="sp-cp-setting"><span>Label</span><input type="text" data-action="custom-field-label" data-panel="${index}" data-field="${fieldIndex}" value="${esc(field.label || '')}" placeholder="Display label"></label><label class="sp-cp-setting"><span>Type</span><select data-action="custom-field-type" data-panel="${index}" data-field="${fieldIndex}">${['text', 'number', 'meter', 'list', 'enum'].map(type => `<option value="${type}" ${field.type === type ? 'selected' : ''}>${type}</option>`).join('')}</select></label></div><label class="sp-cp-setting"><span>LLM hint</span><input type="text" data-action="custom-field-desc" data-panel="${index}" data-field="${fieldIndex}" value="${esc(field.desc || '')}" placeholder="Describe the value the Reader may track"></label>${enumOptions}${meterInvert}</div>`;
        }).join('');
        return `<article class="sp-custom-panel${open ? ' sp-custom-open' : ''}${panel.enabled === false ? ' sp-custom-disabled' : ''}"><header data-action="custom-select" data-panel="${index}"><span>◇</span><strong>${esc(panel.name)}</strong><span>${fields.length} fields</span><button type="button" data-action="custom-duplicate" data-panel="${index}" title="Duplicate">⧉</button><button type="button" data-action="custom-delete" data-panel="${index}" title="Delete">×</button></header>${open ? `<div class="sp-custom-fields"><div class="sp-cp-panel-settings"><label class="sp-cp-check" title="Disable this panel without deleting its schema"><input type="checkbox" data-action="custom-panel-enabled" data-panel="${index}" ${panel.enabled !== false ? 'checked' : ''}> Track this panel</label><label class="sp-cp-setting"><span>Panel name</span><input type="text" data-action="custom-panel-name" data-panel="${index}" value="${esc(panel.name || '')}" placeholder="Panel name"></label></div>${fieldRows || '<p class="sp-cp-empty">No fields yet.</p>'}<button type="button" data-action="custom-add-field" data-panel="${index}">＋ Add field</button></div>` : ''}</article>`;
    }
    function customPanelKey(panel, index) { return `custom-${slug(panel?.name || 'panel') || 'panel'}-${index}`; }
    function sanitizeCustomPanels(rawPanels) {
        return (Array.isArray(rawPanels) ? rawPanels : []).slice(0, 20).map(panel => ({
            name: String(panel?.name || 'Custom Panel').trim().slice(0, 120) || 'Custom Panel', enabled: panel?.enabled !== false,
            fields: (Array.isArray(panel?.fields) ? panel.fields : []).slice(0, 80).map(field => ({
                key: String(field?.key || 'field').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/^[0-9]/, '_$&').replace(/_+/g, '_').slice(0, 80) || 'field',
                label: String(field?.label || field?.key || 'Field').trim().slice(0, 120) || 'Field',
                type: ['text', 'number', 'meter', 'list', 'enum'].includes(String(field?.type || '')) ? field.type : 'text',
                desc: String(field?.desc || '').slice(0, 600), enabled: field?.enabled !== false,
                options: Array.isArray(field?.options) ? field.options.slice(0, 48).map(option => String(option || '').trim().slice(0, 120)).filter(Boolean) : [],
                invert: field?.invert === true
            }))
        }));
    }
    function customFieldValue(state, field) {
        const key = String(field?.key || '');
        const hasValue = key && hasOwn(state.data, key);
        const value = hasValue ? state.data[key] : undefined;
        const cleared = hasValue && (value === '' || value === null || (Array.isArray(value) && value.length === 0));
        const source = hasValue && state.origins?.[key] === 'live' ? 'accepted Reader delta' : cleared ? 'accepted Reader clear' : 'awaiting Reader delta';
        if (field.type === 'meter') {
            const number = Number(value); const valid = hasValue && Number.isFinite(number);
            const percent = valid ? clamp(number, 0, 100) : 0;
            const effective = field.invert ? 100 - percent : percent;
            const danger = effective < 25 ? 'low' : effective < 50 ? 'mid' : 'ok';
            return `<div class="sp-cp-meter-wrap"><div class="sp-cp-meter" title="${valid ? `${percent}/100 · ${source}` : source}"><div class="sp-cp-meter-fill" data-danger="${danger}" style="width:${valid ? Math.max(percent, 0) : 0}%"></div></div><span class="sp-cp-meter-val${valid ? '' : ' sp-cp-value-empty'}">${valid ? percent : '—'}</span></div>`;
        }
        if (field.type === 'enum') return `<span class="sp-cp-enum-chip${hasValue && String(value).trim() ? '' : ' sp-cp-value-empty'}">${hasValue && String(value).trim() ? esc(value) : '—'}</span>`;
        if (field.type === 'list') {
            const items = Array.isArray(value) ? value.filter(item => String(item || '').trim()) : [];
            return `<span class="sp-cp-list-chips">${items.length ? items.map(item => `<i class="sp-cp-list-chip">${esc(item)}</i>`).join('') : '<em class="sp-cp-value-empty">—</em>'}</span>`;
        }
        if (field.type === 'number') return `<span class="sp-cp-number-val${hasValue && value !== '' && value !== null ? '' : ' sp-cp-value-empty'}">${hasValue && value !== '' && value !== null ? esc(value) : '—'}</span>`;
        return `<span class="sp-cp-text-val${hasValue && String(value || '').trim() ? '' : ' sp-cp-value-empty'}">${hasValue && String(value || '').trim() ? esc(value) : '—'}</span>`;
    }
    function customPanelData(state, panel, index) {
        const fields = (Array.isArray(panel?.fields) ? panel.fields : []).filter(field => field?.enabled !== false && String(field?.key || '').trim());
        const hasReaderValue = fields.some(field => hasOwn(state.data, field.key));
        const rows = fields.map(field => `<div class="sp-row sp-custom-data-row"><span class="sp-row-label">${esc(field.label || field.key)}</span><span class="sp-row-value">${customFieldValue(state, field)}</span></div>`).join('');
        const note = hasReaderValue
            ? 'Values shown above came from the accepted Reader projection; each update is a compact field delta.'
            : 'Source panel schema is visible. This tutorial has no invented values; fields remain blank until an accepted Reader delta names their exact keys.';
        return `${rows || '<div class="sp-cp-empty">No enabled custom fields.</div>'}<p class="sp-custom-data-note">${esc(note)}</p>`;
    }
    function sourceCommandHelp() {
        return ['ScenePulse v6.27.20 — Slash Commands:', ...SOURCE_COMMANDS.map(([command, description]) => `  ${command} — ${description}`), '', 'Alias: /scenepulse <subcommand>'].join('\n');
    }
    function sourceCommandStatus(state) {
        const values = sourceMacroValues(state), data = state.macroSource || {};
        const enabledPanels = BUILTIN_PANELS.filter(([key]) => state.panels[key] !== false).map(([, name]) => name);
        const relationshipCount = Array.isArray(data.relationships) ? data.relationships.length : 0;
        const snapshotCount = state.mode === 'accepted_live' ? state.history.length : 1;
        return [
            'ScenePulse v6.27.20 — Status',
            `Mode: ${state.mode === 'accepted_live' ? 'accepted Horde Reader projection' : 'sealed TOUR_EXAMPLE_DATA fixture'}`,
            `Profile: ${values.sp_active_profile || '(built-in source profile)'}`,
            `Snapshots: ${snapshotCount}`,
            '', `Time: ${values.sp_time || '?'} | Date: ${values.sp_date || '?'}`,
            `Location: ${values.sp_location || '?'}`, `Weather: ${values.sp_weather || '?'} | Temp: ${values.sp_temperature || '?'}`,
            `Mood: ${values.sp_mood || '?'} | Tension: ${values.sp_tension || '?'}`,
            `Characters (${values.sp_char_count}): ${values.sp_characters || 'none'}`,
            `Relationships (${relationshipCount}): ${values.sp_relationships || 'none'}`,
            `Quests: ${values.sp_quest_count}`, `Panels: ${enabledPanels.join(', ') || 'none'}`
        ].join('\n');
    }
    function sourceCommandPanel(raw) {
        const normalized = String(raw || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
        const aliases = { storyideas: 'branches', ideas: 'branches', quest: 'quests', journal: 'quests', relationship: 'relationships', character: 'characters' };
        return BUILTIN_PANELS.find(([key, name]) => key === normalized || name.toLowerCase().replace(/\s+/g, '') === normalized)?.[0] || aliases[normalized] || '';
    }
    async function executeSourceCommand(host, state, raw) {
        const input = String(raw || '').trim();
        const parts = input.replace(/^\/(?:sp|scenepulse)(?:-)?/i, '').trim().split(/\s+/).filter(Boolean);
        const standalone = input.match(/^\/sp-(status|regen|refresh|clear|toggle|profile|export|debug|help)\b\s*(.*)$/i);
        const subcommand = String(standalone?.[1] || parts.shift() || 'help').toLowerCase();
        const argument = String(standalone?.[2] || parts.join(' ') || '').trim();
        if (!/^\/(?:sp|scenepulse)/i.test(input)) return { message: 'Use a ScenePulse command, for example: /sp status' };
        if (subcommand === 'help' || !subcommand) return { message: sourceCommandHelp() };
        if (subcommand === 'status') return { message: sourceCommandStatus(state) };
        if (subcommand === 'debug') { state.showDebug = true; return { message: 'Opened the source-derived ScenePulse Debug Inspector.' }; }
        if (subcommand === 'toggle') {
            if (!argument) return { message: `ScenePulse panels:\n${BUILTIN_PANELS.map(([key, name]) => `  ${key}: ${state.panels[key] !== false ? 'ON' : 'OFF'} (${name})`).join('\n')}\n\nUsage: /sp toggle <panel>` };
            const panel = sourceCommandPanel(argument);
            if (!panel || !Object.prototype.hasOwnProperty.call(state.panels, panel)) return { message: `Unknown panel: ${argument}. Valid: ${BUILTIN_PANELS.map(([key]) => key).join(', ')}` };
            state.panels[panel] = state.panels[panel] === false;
            return { message: `${BUILTIN_PANELS.find(([key]) => key === panel)?.[1] || panel}: ${state.panels[panel] ? 'ON' : 'OFF'}` };
        }
        if (subcommand === 'profile' || subcommand === 'profiles') {
            hydrateSourcePresets(state);
            if (!argument) { state.showPresets = true; return { message: 'Opened the exact ScenePulse source preset browser. Use an explicit card Apply to change only this World Reader profile.' }; }
            const normalized = argument.toLowerCase();
            const preset = (state.sourcePresets || []).find(item => item.id.toLowerCase() === normalized || item.displayName.toLowerCase() === normalized);
            if (!preset) return { message: `Unknown source preset: ${argument}. Open /sp profile to browse the bundled source catalogue.` };
            await requestHostAction(host, 'apply-scenepulse-preset', { preset });
            state.appliedPresetId = preset.id;
            return { message: `Applied source preset: ${preset.displayName}. It changes only future Reader prompts.`, hostRendered: true };
        }
        if (subcommand === 'regen' || subcommand === 'regenerate' || subcommand === 'refresh') {
            const valid = new Set(['', 'dashboard', 'scene', 'quests', 'relationships', 'characters', 'branches', 'storyideas']);
            if (subcommand !== 'refresh' && !valid.has(argument.toLowerCase())) return { message: `Unknown section: ${argument}. Valid: dashboard, scene, quests, relationships, characters, branches` };
            if (state.mode !== 'accepted_live') return { message: 'The sealed source tutorial has no live Reader call. Its complete fixture surface remains unchanged.' };
            if (state.viewingHistory) return { message: 'History is read-only. Return to current before regenerating a ScenePulse reading.' };
            await requestHostAction(host, 'refresh-scene-pulse', { section: subcommand === 'refresh' ? '' : argument.toLowerCase() });
            return { message: subcommand === 'refresh' ? 'Full Reader refresh accepted for the current authored beat.' : 'Reader refresh accepted for the current authored beat.', hostRendered: true };
        }
        if (subcommand === 'export') {
            if (state.mode !== 'accepted_live') {
                downloadFixture('scenepulse-tour-export.json', JSON.stringify({ extension: 'ScenePulse', version: SOURCE.version, mode: 'accepted_fixture', scenePulse: state.macroSource }, null, 2));
                return { message: 'Exported the sealed ScenePulse tutorial fixture.' };
            }
            const result = await requestHostAction(host, 'export-scenepulse-history');
            return { message: result?.message || 'Exported accepted ScenePulse Reader history.' };
        }
        if (subcommand === 'clear') {
            const count = state.mode === 'accepted_live' ? state.history.length : 1;
            state.commandConfirm = { kind: 'clear', count };
            return { message: `Confirmation required before clearing ${count} ScenePulse tracker snapshot${count === 1 ? '' : 's'}.` };
        }
        return { message: `Unknown subcommand: ${subcommand}.\n\n${sourceCommandHelp()}` };
    }
    function commandConsole(state) {
        if (!state.showCommands) return '';
        const values = sourceMacroValues(state);
        const sourceLabel = state.mode === 'accepted_live'
            ? 'Values resolve from the selected accepted Reader projection only. Tutorial fallback and Horde registry values are excluded.'
            : 'Values resolve from the sealed TOUR_EXAMPLE_DATA tracker snapshot.';
        const confirmation = state.commandConfirm?.kind === 'clear'
            ? `<aside class="sp-command-confirm"><strong>Clear ScenePulse tracker data?</strong><p>This removes ${state.commandConfirm.count} accepted Reader snapshot${state.commandConfirm.count === 1 ? '' : 's'} and ScenePulse projections only. Narration, canonical state, World entities, and the current draft are not touched.</p><button type="button" data-action="command-clear-cancel">Cancel</button><button type="button" data-action="command-clear-confirm">Clear snapshots</button></aside>` : '';
        return `<div class="sp-command-overlay"><section class="sp-command-console"><header><span><strong>ScenePulse Commands & Macros</strong><small>Source-derived slash commands and live tracker macros</small></span><button type="button" data-action="commands">×</button></header><div class="sp-command-body"><aside><h3>Slash commands</h3>${SOURCE_COMMANDS.map(([command, description]) => `<button type="button" data-action="command-example" data-command="${esc(command.replace(/ \[.*$/, ''))}"><code>${esc(command)}</code><small>${esc(description)}</small></button>`).join('')}</aside><main><p class="sp-command-boundary">${esc(sourceLabel)}</p><div class="sp-command-entry"><input type="text" data-action="command-input" value="${esc(state.commandInput)}" placeholder="/sp status" aria-label="ScenePulse command"><button type="button" data-action="command-run">Run</button></div>${state.commandResult ? `<pre class="sp-command-result">${esc(state.commandResult)}</pre>` : '<div class="sp-command-empty">Run <code>/sp status</code> to inspect the accepted ScenePulse tracker state.</div>'}<h3>Prompt macros</h3><div class="sp-macro-list">${SOURCE_MACROS.map(([name, description]) => `<article><code>{{${esc(name)}}}</code><span>${esc(values[name] || '—')}</span><small>${esc(description)}</small></article>`).join('')}</div></main></div>${confirmation}</section></div>`;
    }
    function panelManager(state) {
        return `<aside class="sp-panel-mgr" id="sp-panel-mgr"><header><span><strong>Panel Manager</strong><small>ScenePulse source panel and field controls</small></span><button type="button" data-action="panels">×</button></header><div class="sp-pm-section"><h4>Built-in Panels</h4>${BUILTIN_PANELS.map(([key, name, desc]) => `<label class="sp-pm-toggle"><input type="checkbox" data-action="panel-toggle" data-panel-key="${key}" ${state.panels[key] !== false ? 'checked' : ''}><span><strong>${esc(name)}</strong><small>${esc(desc)}</small></span></label>`).join('')}</div><div class="sp-pm-section"><h4>Custom Panels</h4><div id="sp-panel-mgr-custom">${state.customPanels.map((panel, index) => customPanelManager(state, panel, index)).join('')}</div><button type="button" class="sp-pm-add" data-action="custom-add">＋ Create custom panel</button><div class="sp-cp-transfer"><button type="button" data-action="custom-export">Export schemas</button><button type="button" data-action="custom-import-trigger">Import schemas</button><input type="file" data-action="custom-import" accept="application/json,.json" hidden></div><p class="sp-cp-transfer-note">Schemas only — no tutorial values, Reader data, narration or World state.</p></div><div class="sp-pm-section"><h4>Appearance</h4><label>Theme <select data-action="theme"><option value="default" ${ExperimentalWorldsState.theme === 'default' ? 'selected' : ''}>Default</option><option value="midnight" ${ExperimentalWorldsState.theme === 'midnight' ? 'selected' : ''}>Midnight</option><option value="fantasy" ${ExperimentalWorldsState.theme === 'fantasy' ? 'selected' : ''}>Fantasy</option><option value="cyberpunk" ${ExperimentalWorldsState.theme === 'cyberpunk' ? 'selected' : ''}>Cyberpunk</option><option value="minimal" ${ExperimentalWorldsState.theme === 'minimal' ? 'selected' : ''}>Minimal</option></select></label><label>Font scale <input type="range" min=".7" max="1.5" step=".1" value="${state.fontScale}" data-action="font-scale"></label></div><div class="sp-pm-section"><button type="button" data-action="profiles">Profiles, prompt & schema</button><button type="button" data-action="presets">Browse source presets</button><button type="button" data-action="commands">Commands & macros</button><button type="button" data-action="debug">Debug Inspector</button><button type="button" data-action="tour">Replay guided tour</button></div></aside>`;
    }
    function toolbar(state) {
        const active = Object.values(state.features).filter(Boolean).length;
        const fallbackCount = Object.values(state.origins || {}).filter(value => value === 'fixture').length;
        const selectedHistory = state.viewingHistory ? (state.history || []).find(item => item.id === state.selectedTimeline) : null;
        const subtitle = state.mode === 'accepted_live'
            ? (selectedHistory ? `History · ${selectedHistory.label}` : `Accepted Horde Reader handoff · ${fallbackCount} source field${fallbackCount === 1 ? '' : 's'} fixture-backed`)
            : 'Demo scene · accepted TOUR_EXAMPLE_DATA handoff';
        return `<div class="sp-toolbar"><div class="sp-brand-icon-wrap"><button type="button" class="sp-brand-icon" data-action="tour" title="ScenePulse guided tour">${MASCOT}</button></div><div class="sp-brand-title-wrap"><div class="sp-brand-title">Scene<span class="sp-brand-accent">Pulse</span></div><div class="sp-brand-subtitle">${esc(subtitle)}</div></div><span class="sp-toolbar-spacer"></span><button type="button" class="sp-toolbar-btn" data-action="fixture-refresh" title="Regenerate all">${ICON.refresh}</button><span class="sp-toolbar-sep"></span><div class="sp-toolbar-group"><button type="button" class="sp-toolbar-btn" data-action="panels" title="Panel Manager">${ICON.panels}</button><button type="button" class="sp-toolbar-btn" data-action="wiki" title="Character Wiki">${ICON.wiki}</button><button type="button" class="sp-toolbar-btn" data-action="expand" title="Expand/Collapse sections">${ICON.toggle}</button><button type="button" class="sp-toolbar-btn${state.compact ? ' sp-tb-active' : ''}" data-action="compact" title="Condense view">${ICON.compact}</button></div><div class="sp-toolbar-group"><div class="sp-feat-wrap"><button type="button" class="sp-toolbar-btn${active ? ' sp-tb-active' : ''}" data-action="features" title="Feature toggles">${ICON.feature}<span class="sp-feat-badge">${active}/4</span></button>${state.featureMenu ? `<div class="sp-feat-dropdown sp-feat-open">${[['thoughts', 'Thoughts'], ['weather', 'Weather'], ['timeTint', 'Time Tint'], ['transitions', 'Scene Transitions']].map(([key, label]) => `<label class="sp-feat-item" data-action="feature" data-feature="${key}"><input type="checkbox" ${state.features[key] ? 'checked' : ''}>${esc(label)}</label>`).join('')}</div>` : ''}</div><button type="button" class="sp-toolbar-btn${state.edit ? ' sp-tb-active' : ''}" data-action="edit" title="Toggle edit mode">${ICON.edit}</button><button type="button" class="sp-toolbar-btn${state.showEmpty ? ' sp-tb-active' : ''}" data-action="empty" title="Show empty fields">${ICON.empty}</button></div></div>`;
    }
    function thoughts(state) {
        if (!state.features.thoughts || !state.thoughtsOpen) return '';
        return `<aside id="sp-thought-panel" class="sp-tp-visible${state.thoughtGhost ? ' sp-tp-ghost-mode' : ''}" style="left:${state.thoughtX}px;top:${state.thoughtY}px;width:${state.thoughtWidth}px;height:${state.thoughtHeight}px"><header class="sp-tp-header" data-drag-handle><span class="sp-tp-drag-grip">══</span><strong class="sp-tp-title">Inner Thoughts</strong><span class="sp-tp-header-spacer"></span><button type="button" class="sp-tp-snapleft${state.thoughtSnap ? ' sp-tb-active' : ''}" data-action="thought-snap" title="Snap to left">⇤</button><button type="button" class="sp-tp-ghost${state.thoughtGhost ? ' sp-tb-active' : ''}" data-action="thought-ghost" title="Ghost mode">◌</button><button type="button" class="sp-tp-fit${state.thoughtFit ? ' sp-tb-active' : ''}" data-action="thought-fit" title="Auto-fit">⊞</button><button type="button" class="sp-tp-regen" data-action="fixture-refresh" data-section="thoughts" title="Regenerate thoughts">${ICON.refresh}</button><button type="button" class="sp-tp-close" data-action="thought-close" title="Hide thoughts">×</button></header><div id="sp-tp-body">${(state.data.characters || []).map((char, index) => `<article class="sp-tp-card" style="--char-accent:${COLORS[index % COLORS.length]}"><span class="sp-char-portrait"><span class="sp-char-portrait-monogram">${esc(monogram(char.name))}</span></span><div><strong class="sp-tp-name">${esc(char.name)}</strong><small>${esc(char.role)}</small><blockquote>${esc(char.innerThought)}</blockquote></div></article>`).join('')}</div><span class="sp-tp-resize" data-resize-handle>◢</span></aside>`;
    }
    function wiki(state) {
        if (!state.showWiki) return '';
        let people = (state.data.characters || []).map((character, index) => ({ character, index }));
        const query = state.wikiSearch.trim().toLowerCase(); if (query) people = people.filter(({ character }) => `${character.name} ${character.role}`.toLowerCase().includes(query));
        if (state.wikiFilter === 'present') people = people.filter(() => true);
        if (state.wikiFilter === 'absent') people = [];
        if (state.wikiSort === 'name') people.sort((a, b) => a.character.name.localeCompare(b.character.name));
        const relationshipFor = name => (state.data.relationships || []).find(rel => rel.name === name);
        const entry = ({ character, index }) => {
            const open = state.selectedDossier === index || state.selectedDossier === String(index);
            const relationship = relationshipFor(character.name), accent = COLORS[index % COLORS.length];
            const identity = characterIdentity(state, character, index);
            const note = state.wikiNotes[identity] || '';
            const portrait = portraitSource(state, character, index);
            const avatar = portrait ? `<img class="sp-wiki-avatar" src="${portrait}" alt="">` : `<span class="sp-wiki-avatar sp-wiki-avatar-monogram" style="--char-accent:${accent}">${esc(monogram(character.name))}</span>`;
            const grid = [['Role', character.role], ['Need', character.immediateNeed], ['Short term', character.shortTermGoal], ['Long term', character.longTermGoal], ['Hair', character.hair], ['Face', character.face], ['Outfit', character.outfit], ['Posture', character.posture], ['Proximity', character.proximity], ['Notable details', character.notableDetails], ['Fertility', [character.fertStatus, character.fertNotes].filter(Boolean).join(' · ')]];
            const previous = relationship ? previousRelationship(state, relationship) : null;
            const relationshipBlock = relationship ? `<div class="sp-wiki-section-label">↔ Relationship with you</div><div class="sp-wiki-meters">${meter('Affection', relationship.affection, relationship.affectionLabel, { character: index, identity: relationshipIdentity(relationship), name: character.name }, previous?.affection)}${meter('Trust', relationship.trust, relationship.trustLabel, { character: index, identity: relationshipIdentity(relationship), name: character.name }, previous?.trust)}${meter('Desire', relationship.desire, relationship.desireLabel, { character: index, identity: relationshipIdentity(relationship), name: character.name }, previous?.desire)}${meter('Stress', relationship.stress, relationship.stressLabel, { character: index, identity: relationshipIdentity(relationship), name: character.name }, previous?.stress)}${meter('Compatibility', relationship.compatibility, relationship.compatibilityLabel, { character: index, identity: relationshipIdentity(relationship), name: character.name }, previous?.compatibility)}</div>` : '';
            const portraitActions = `<button type="button" data-action="portrait" data-character="${index}">Portrait</button>${portrait ? `<button type="button" data-action="portrait-clear" data-character="${index}" data-portrait-id="${esc(identity)}">Clear portrait</button>` : ''}`;
            return `<article class="sp-wiki-entry${open ? ' sp-card-open' : ''}" style="--char-accent:${accent};--char-border:${accent}"><header class="sp-wiki-entry-header" data-action="wiki-character" data-character="${index}" role="button" tabindex="0" aria-expanded="${open}"><span class="sp-wiki-chevron">▸</span>${avatar}<span class="sp-wiki-header-text"><span class="sp-wiki-header-top"><strong class="sp-wiki-name">${esc(character.name)}</strong><span class="sp-wiki-role">${esc(character.role)}</span></span><span class="sp-wiki-preview">${esc(character.innerThought)}</span></span><span class="sp-wiki-status sp-wiki-status-in">PRESENT</span></header><div class="sp-wiki-entry-body"><div class="sp-wiki-section-label">◌ Inner Thought</div><blockquote class="sp-wiki-thought">${esc(character.innerThought)}</blockquote><div class="sp-wiki-section-label">♙ Current character</div><div class="sp-wiki-grid">${grid.map(([label, value]) => `<span class="sp-wiki-field">${esc(label)}</span><span class="sp-wiki-val">${esc(value || '—')}</span>`).join('')}</div><div class="sp-wiki-section-label">▣ Carried</div><div class="sp-wiki-inventory">${(character.inventory || []).map(item => `<span class="sp-wiki-inventory-item">${esc(item)}</span>`).join('') || '<span class="sp-wiki-val">—</span>'}</div>${relationshipBlock}<div class="sp-wiki-section-label">◷ Encounter history</div><div class="sp-wiki-meta"><span class="sp-wiki-meta-item">First seen <strong>Tour fixture</strong></span><span class="sp-wiki-meta-item">Last seen <strong>Cafe Lune</strong></span><span class="sp-wiki-meta-item">Appearances <strong>1 accepted reading</strong></span></div><button type="button" class="sp-wiki-history" data-action="timeline" data-snapshot="tour-26">View accepted café-scene observation</button><div class="sp-wiki-section-label">✎ Notes</div><textarea class="sp-wiki-notes" data-action="wiki-notes" data-note-id="${esc(identity)}" placeholder="Personal notes about ${esc(character.name)}">${esc(note)}</textarea><div class="sp-card-actions">${portraitActions}<button type="button" data-action="history-graph" data-character="${index}" data-meter="affection">Relationship history</button></div></div></article>`;
        };
        return `<div class="sp-wiki-overlay"><section class="sp-wiki-container"><header class="sp-wiki-header"><span class="sp-wiki-title">Character Wiki <span>Encounter browser · tour fixture</span></span><button type="button" class="sp-wiki-export-btn" data-action="relationship-web" title="Relationship Web">⌘</button><button type="button" class="sp-wiki-export-btn" data-action="wiki-export-json" title="Export fixture JSON">JSON</button><button type="button" class="sp-wiki-export-btn" data-action="wiki-export-md" title="Export fixture Markdown">MD</button><button type="button" class="sp-wiki-close" data-action="wiki">×</button></header><div class="sp-wiki-toolbar"><input class="sp-wiki-search" type="search" value="${esc(state.wikiSearch)}" data-action="wiki-search" placeholder="Search characters"><div class="sp-wiki-filters"><button type="button" class="sp-wiki-filter${state.wikiFilter === 'all' ? ' sp-wiki-filter-active' : ''}" data-action="wiki-filter" data-filter="all">All</button><button type="button" class="sp-wiki-filter${state.wikiFilter === 'present' ? ' sp-wiki-filter-active' : ''}" data-action="wiki-filter" data-filter="present">Present</button><button type="button" class="sp-wiki-filter${state.wikiFilter === 'absent' ? ' sp-wiki-filter-active' : ''}" data-action="wiki-filter" data-filter="absent">Absent</button></div><div class="sp-wiki-toolbar-right"><button type="button" class="sp-wiki-expand-btn" data-action="wiki-grid" title="${state.wikiGrid ? 'List view' : 'Grid view'}">${state.wikiGrid ? '☷' : '▦'}</button><select class="sp-wiki-sort" data-action="wiki-sort"><option value="recent" ${state.wikiSort === 'recent' ? 'selected' : ''}>Most recent</option><option value="name" ${state.wikiSort === 'name' ? 'selected' : ''}>Name</option></select></div></div><div class="sp-wiki-list${state.wikiGrid ? ' sp-wiki-list-grid' : ''}">${people.length ? people.map(entry).join('') : '<div class="sp-wiki-empty">No characters match this view. The fixture contains only present Café Lune participants.</div>'}</div><footer class="sp-wiki-footer">${people.length} fixture character${people.length === 1 ? '' : 's'} · no live registry records are shown</footer></section></div>`;
    }
    function dossierDetail(state, char, index) { const portrait = portraitSource(state, char, index); return `<article class="sp-wiki-profile"><header><span class="sp-wiki-avatar">${portrait ? `<img src="${portrait}" alt="">` : esc(monogram(char.name))}</span><div><h3>${esc(char.name)}</h3><p>${esc(char.role)}</p></div><button type="button" data-action="portrait" data-character="${index}">Portrait</button></header><div class="sp-wiki-stats"><span>First seen <b>Tour fixture</b></span><span>Last seen <b>Cafe Lune</b></span><span>Appearances <b>1 accepted reading</b></span></div><blockquote>${esc(char.innerThought)}</blockquote><dl><dt>Need</dt><dd>${esc(char.immediateNeed)}</dd><dt>Goals</dt><dd>${esc(char.shortTermGoal)}<br>${esc(char.longTermGoal)}</dd><dt>Appearance</dt><dd>${esc(char.face)}<br>${esc(char.hair)}</dd><dt>Current outfit</dt><dd>${esc(char.outfit)}</dd><dt>Location</dt><dd>${esc(char.proximity)}</dd></dl><h4>Scene history</h4><button type="button" class="sp-wiki-history" data-action="timeline" data-snapshot="tour-26">Accepted café-scene observation · ${esc(char.innerThought)}</button></article>`; }
    function web(state) {
        if (!state.showWeb) return '';
        const rels = state.data.relationships || [], positions = webPositions(rels, state.webClassic), center = positions[0], focused = Number.isInteger(state.webFocused) ? state.webFocused : null;
        const edges = rels.map((rel, index) => {
            const to = positions[index + 1], dx = to.x - center.x, dy = to.y - center.y, len = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / len, ny = dx / len, control = { x: (center.x + to.x) / 2 + nx * (24 + index * 8) * (index % 2 ? -1 : 1), y: (center.y + to.y) / 2 + ny * (24 + index * 8) * (index % 2 ? -1 : 1) }, color = webEdgeColor(Number(rel.affection));
            const dim = focused !== null && focused !== index;
            return `<path class="sp-web-edge sp-web-edge-user" d="M${center.x},${center.y} Q${control.x},${control.y} ${to.x},${to.y}" fill="none" stroke="${color}" stroke-width="${clamp(Number(rel.trust) / 25, 1, 4)}" opacity="${dim ? '.15' : Number(rel.stress) > 70 ? '.4' : '.7'}" stroke-linecap="round"/>${Number(rel.stress) > 60 ? `<path d="M${center.x},${center.y} Q${control.x},${control.y} ${to.x},${to.y}" fill="none" stroke="${METER_COLORS.stress}" stroke-width="1" opacity="${dim ? '.08' : '.3'}" stroke-dasharray="4 4"/>` : ''}${dim ? '' : `<g class="sp-web-edge-label"><rect x="${control.x - 36}" y="${control.y - 10}" width="72" height="18" rx="8" fill="#0c0e14" stroke="${color}" stroke-width=".6"/><text x="${control.x}" y="${control.y + 3}" text-anchor="middle" font-size="10" fill="${color}">${esc(rel.relType || 'unspecified')}</text></g>`}`;
        }).join('');
        const node = (name, point, index, color, user = false) => `<g class="sp-web-node${user ? ' sp-web-node-user' : ''}" ${user ? '' : `data-action="web-detail" data-character="${index}"`} role="button" tabindex="0" opacity="${!user && focused !== null && focused !== index ? '.15' : '1'}" aria-label="${esc(user ? 'You' : `${name} relationship details`)}"><circle cx="${point.x}" cy="${point.y}" r="${user ? 35 : 28}" fill="#121722" stroke="${color}" stroke-width="${focused === index ? '3' : '2'}"/><text x="${point.x}" y="${point.y + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="${color}">${esc(user ? 'YOU' : monogram(name))}</text><text x="${point.x}" y="${point.y + (user ? 53 : 46)}" text-anchor="middle" font-size="11" font-weight="600" fill="#d8dce7">${esc(user ? 'You' : name.split(' ')[0])}</text></g>`;
        const focusedRel = focused === null ? null : rels[focused];
        const previous = focusedRel ? previousRelationship(state, focusedRel) : null;
        const detail = focusedRel ? `<strong>${esc(focusedRel.name)}</strong>${meter('Affection', focusedRel.affection, focusedRel.affectionLabel, null, previous?.affection)}${meter('Trust', focusedRel.trust, focusedRel.trustLabel, null, previous?.trust)}${meter('Desire', focusedRel.desire, focusedRel.desireLabel, null, previous?.desire)}${meter('Stress', focusedRel.stress, focusedRel.stressLabel, null, previous?.stress)}${meter('Compatibility', focusedRel.compatibility, focusedRel.compatibilityLabel, null, previous?.compatibility)}` : 'Select a source relationship node to inspect its five meters.';
        return `<div class="sp-web-overlay"><section class="sp-web sp-web-container"><header class="sp-web-header"><span><strong>Relationship Web</strong><small>Seeded ${state.webClassic ? 'Classic' : 'force-directed'} source view · tour fixture</small></span><div class="sp-web-toolbar"><button type="button" class="sp-web-layout-toggle" data-action="web-classic">${state.webClassic ? 'Force-directed' : 'Classic view'}</button><button type="button" data-action="relationship-web">×</button></div></header><div class="sp-web-body"><div class="sp-web-svg-wrap"><svg viewBox="0 0 1000 700" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Fixture relationship web"><rect width="1000" height="700" fill="#0c0e14" rx="8"/>${[80, 160, 240, 320].map(radius => `<circle cx="${center.x}" cy="${center.y}" r="${radius}" fill="none" stroke="#1a1e2a" stroke-width=".5"/>`).join('')}${edges}${node('You', center, -1, '#4db8a4', true)}${rels.map((rel, index) => node(rel.name, positions[index + 1], index, colorFor(rel.name, state.data))).join('')}</svg></div><aside class="sp-web-legend-panel"><strong class="sp-web-legend-header">Relationship types</strong><button type="button" class="sp-web-legend-row sp-web-legend-all" data-action="web-clear-focus">All source ties</button>${rels.map((rel, index) => `<button type="button" class="sp-web-legend-row${focused === index ? ' sp-web-legend-active' : ''}" data-action="web-detail" data-character="${index}"><span class="sp-web-legend-swatch" style="background:${webEdgeColor(Number(rel.affection))}"></span><span class="sp-web-legend-label">${esc(rel.relType || 'unspecified')}</span><span class="sp-web-legend-count">1</span></button>`).join('')}<p class="sp-web-fixture-note">No NPC-to-NPC analysis is fabricated for this accepted tutorial state.</p></aside></div><div class="sp-web-detail" id="sp-web-detail">${detail}</div><footer class="sp-web-footer">${rels.length} characters · ${rels.length} user ties${focusedRel ? ` · focused on ${esc(focusedRel.name)}` : ''} · accepted tutorial fixture</footer></section></div>`;
    }
    function diffViewer(state) {
        if (!state.showDiff) return '';
        const json = esc(JSON.stringify(state.data, null, 2));
        const isLive = state.mode === 'accepted_live';
        const predecessor = state.previousData ? esc(JSON.stringify(state.previousData, null, 2)) : '';
        const delta = state.deltaData && Object.keys(state.deltaData).length ? esc(JSON.stringify(state.deltaData, null, 2)) : '';
        const modes = [['changes', 'Changes Only'], ['full', 'Full Diff'], ['side', 'Side by Side'], ['delta', 'Delta Payload']];
        const content = state.diffMode === 'side'
            ? (predecessor ? `<div class="sp-diff-side"><pre aria-label="Previous accepted Horde Reader projection">${predecessor}</pre><pre aria-label="Current accepted Horde Reader projection">${json}</pre></div>` : `<div class="sp-diff-side"><pre aria-label="Current accepted projection">${json}</pre><div class="sp-diff-missing"><strong>No accepted predecessor</strong><span>The current live handoff has no prior settled Reader projection. No visual delta is inferred.</span></div></div>`)
            : state.diffMode === 'delta'
                ? (delta ? `<pre aria-label="Reader ScenePulse delta">${delta}</pre>` : '<div class="sp-diff-empty"><strong>∅ No ScenePulse delta payload</strong><span>The accepted full projection is shown without inventing a patch.</span></div>')
                : `<pre>${json}</pre>`;
        const meta = isLive ? 'Accepted Horde Reader projection · fixture fallback remains explicit' : 'Accepted source fixture · no invented previous delta';
        const summary = !isLive ? (state.diffMode === 'changes' ? 'Fixture baseline' : state.diffMode === 'full' ? 'Full accepted fixture' : state.diffMode === 'side' ? 'Accepted fixture / predecessor' : 'Fixture delta') : (state.diffMode === 'delta' ? 'Reader compact delta' : state.diffMode === 'side' ? 'Accepted predecessor / current projection' : 'Current accepted projection');
        const note = isLive ? 'Only values delivered by the settled Reader replace the sealed tutorial fields.' : 'This source inspector remains truthful until a second accepted Horde snapshot exists.';
        return `<div class="sp-diff-overlay sp-diff-visible"><section class="sp-diff-container"><header class="sp-diff-header"><span><strong class="sp-diff-title">Payload & Diff Inspector</strong><small class="sp-diff-meta">${meta}</small></span><button type="button" class="sp-diff-close-float" data-action="diff" aria-label="Close inspector">×</button></header><div class="sp-diff-tabs">${modes.map(([key, label]) => `<button type="button" data-action="diff-mode" data-mode="${key}" class="${state.diffMode === key ? 'sp-active' : ''}">${label}</button>`).join('')}</div><div class="sp-diff-summary"><strong>${summary}</strong><span>${note}</span></div><div class="sp-diff-body">${content}</div><footer><button type="button" data-action="copy-payload">Copy payload</button><button type="button" data-action="timeline" data-snapshot="${esc(state.mode === 'accepted_live' ? state.accepted?.provenance?.snapshotId : 'tour-26')}">Go to accepted snapshot</button></footer></section></div>`;
    }
    function analytics(state) {
        if (!state.showAnalytics) return '';
        const rows = state.mode === 'accepted_live' ? state.history || [] : [];
        const reported = rows.filter(row => row.analytics?.providerReportedUsage);
        const totalTokens = reported.reduce((sum, row) => sum + (Number(row.analytics?.totalTokens) || 0), 0);
        const timed = rows.filter(row => Number.isFinite(Number(row.analytics?.elapsedMs)) && Number(row.analytics.elapsedMs) >= 0);
        const totalElapsed = timed.reduce((sum, row) => sum + Number(row.analytics.elapsedMs), 0);
        const payloadRows = rows.map(row => {
            const deltaBytes = Number(row.analytics?.deltaBytes);
            const fullBytes = JSON.stringify(row.scenePulse || {}).length;
            return Number.isFinite(deltaBytes) && fullBytes > 0 ? Math.round((1 - (deltaBytes / fullBytes)) * 100) : null;
        }).filter(value => value !== null);
        const averageReduction = payloadRows.length ? Math.round(payloadRows.reduce((sum, value) => sum + value, 0) / payloadRows.length) : null;
        const duration = milliseconds => {
            const value = Number(milliseconds);
            if (!Number.isFinite(value) || value <= 0) return '—';
            return value < 100 ? '<0.1s' : `${(value / 1000).toFixed(1)}s`;
        };
        const deltaReductionText = averageReduction === null ? '—' : averageReduction >= 0 ? `${averageReduction}% smaller` : `${Math.abs(averageReduction)}% larger`;
        const tokenText = row => row.analytics?.providerReportedUsage ? Number(row.analytics.totalTokens || 0).toLocaleString() : 'Not reported';
        const tableRows = rows.length ? rows.map(row => {
            const a = row.analytics || {}, delta = Number.isFinite(Number(a.deltaBytes)) ? `${Number(a.deltaBytes).toLocaleString()} B` : '—';
            return `<tr data-action="timeline" data-snapshot="${esc(row.id)}" tabindex="0" role="button" title="Open ${esc(row.label)}"><td>${esc(row.label)}</td><td>${esc(a.mode || 'delta')}</td><td>${esc([a.provider, a.model].filter(Boolean).join(' / ') || 'Provider not recorded')}</td><td>${esc(tokenText(row))}</td><td>${duration(a.elapsedMs)}</td><td>${esc(delta)}</td><td>${Number.isFinite(Number(a.changedFields)) ? a.changedFields : '—'}</td></tr>`;
        }).join('') : '<tr><td colspan="7">No accepted Reader snapshots yet.</td></tr>';
        const fixtureNote = state.mode === 'accepted_live' ? '' : '<p class="sp-analytics-note">The guided tour is a sealed display fixture; it contains no provider call metrics.</p>';
        return `<div class="sp-analytics-overlay"><section class="sp-analytics-container"><header class="sp-analytics-header"><span class="sp-analytics-title">ScenePulse Reader Analytics</span><button type="button" class="sp-analytics-close" data-action="analytics">×</button></header>${fixtureNote}<div class="sp-analytics-summary"><div class="sp-analytics-card"><div class="sp-analytics-card-value">${reported.length ? totalTokens.toLocaleString() : '—'}</div><div class="sp-analytics-card-label">Provider-reported tokens</div></div><div class="sp-analytics-card"><div class="sp-analytics-card-value">${rows.length}</div><div class="sp-analytics-card-label">Accepted snapshots</div></div><div class="sp-analytics-card"><div class="sp-analytics-card-value">${timed.length ? duration(totalElapsed / timed.length) : '—'}</div><div class="sp-analytics-card-label">Average Reader time</div></div><div class="sp-analytics-card"><div class="sp-analytics-card-value">${deltaReductionText}</div><div class="sp-analytics-card-label">ScenePulse delta bytes</div></div></div><p class="sp-analytics-note">Token values appear only when the provider returned usage. Delta savings compare the real compact ScenePulse patch to that accepted snapshot’s full ScenePulse projection; they are not estimated model-token savings.</p><div class="sp-analytics-table-wrap"><table class="sp-analytics-table"><thead><tr><th>Snapshot</th><th>Mode</th><th>Provider / model</th><th>Tokens</th><th>Reader time</th><th>Delta bytes</th><th>Changed fields</th></tr></thead><tbody>${tableRows}</tbody></table></div></section></div>`;
    }
    // Source Debug Inspector surfaces real local evidence only.  It does not
    // peek at world registries, drafts, prompts, or arbitrary provider bodies:
    // those are neither ScenePulse presentation data nor safe diagnostics to
    // place behind a broad copy button.
    const debugRedact = value => String(value ?? '')
        .replace(/(Bearer\s+)[A-Za-z0-9._\-]{12,}/gi, '$1[REDACTED]')
        .replace(/\b(sk|gsk|pk_(?:live|test))[_-][A-Za-z0-9_\-]{12,}\b/gi, '[REDACTED:api_key]')
        .replace(/([?&](?:api[_-]?key|token|authorization)=)[^&\s]*/gi, '$1[REDACTED]')
        .replace(/\/(?:Users|home)\/[^\s"'<>]+/g, '[REDACTED:user_path]')
        .replace(/\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b/gi, '[REDACTED:email]');
    const debugNow = () => typeof global.performance?.now === 'function' ? global.performance.now() : Date.now();
    const debugDuration = value => {
        const milliseconds = Number(value);
        if (!Number.isFinite(milliseconds) || milliseconds < 0) return '—';
        if (milliseconds < 100) return '<0.1s';
        return `${(milliseconds / 1000).toFixed(1)}s`;
    };
    function debugRows(state) {
        const rows = [];
        if (state.mode !== 'accepted_live') rows.push({ level: 'info', text: '[INFO] Accepted ScenePulse TOUR_EXAMPLE_DATA fixture mounted; no Reader, provider, or Horde registry field was read.' });
        (state.history || []).forEach(item => {
            const a = item.analytics || {};
            rows.push({ level: 'audit', text: `[AUDIT] ${item.createdAt || item.label} · ${item.label} accepted · ${a.mode || 'delta'} · ${a.changedFields ?? '—'} changed fields · ${Number.isFinite(Number(a.deltaBytes)) ? `${a.deltaBytes} B` : 'delta bytes unavailable'}` });
        });
        (global.__hordeApiCallTraces || []).slice(-20).forEach(trace => {
            const request = trace?.request || {}, response = trace?.response || {};
            rows.push({ level: trace?.status === 'ok' ? 'info' : 'warn', text: `[${trace?.status === 'ok' ? 'INFO' : 'WARN'}] Provider call · ${trace?.completedAt || trace?.startedAt || 'time unavailable'} · ${request.method || 'REQUEST'} ${debugRedact(request.url || 'endpoint unavailable')} · ${response.status || trace?.status || 'pending'}` });
        });
        (global.__hordeRuntimeErrors || []).slice(-20).forEach(error => {
            const message = typeof error === 'string' ? error : error?.message || JSON.stringify(error);
            rows.push({ level: 'error', text: `[ERROR] ${debugRedact(message)}` });
        });
        return rows.reverse();
    }
    function debugPacket(state) {
        const rows = state.mode === 'accepted_live' ? state.history || [] : [];
        const selected = rows.find(row => String(row.id) === String(state.debugSnapshot)) || rows.at(-1) || null;
        return { selected, payload: selected?.deltaScenePulse || null };
    }
    function debugDiagnostics(state) {
        const current = state.accepted?.provenance || {};
        const activity = debugRows(state).slice(0, 50).map(row => row.text).join('\n');
        return debugRedact([
            `# ScenePulse Diagnostics — ${new Date().toISOString()}`,
            `- Source: ScenePulse v${SOURCE.version} (${SOURCE.revision.slice(0, 12)})`,
            `- Mode: ${state.mode}`,
            `- Accepted turn: ${current.turnId || 'fixture only'}`,
            `- Accepted snapshot: ${current.snapshotId || 'fixture only'}`,
            `- Viewport: ${global.innerWidth || '—'}×${global.innerHeight || '—'}`,
            `- Fixture-backed root fields: ${Object.values(state.origins || {}).filter(value => value === 'fixture').length}`,
            '', '## Activity (bounded, redacted)', '```', activity || '(no entries)', '```'
        ].join('\n'));
    }
    function debugInspector(state) {
        if (!state.showDebug) return '';
        const tabs = [['activity', 'Activity'], ['packet', 'Last Reader Packet'], ['calls', 'Calls'], ['performance', 'Performance'], ['crashes', 'Crashes'], ['diagnostics', 'Diagnostics']];
        const rows = debugRows(state);
        const query = String(state.debugQuery || '').trim().toLowerCase();
        const filtered = rows.filter(row => (state.debugLevel === 'all' || row.level === state.debugLevel) && (!query || row.text.toLowerCase().includes(query)));
        const packet = debugPacket(state);
        const calls = (global.__hordeApiCallTraces || []).slice(-30).reverse();
        const crashes = (global.__hordeRuntimeErrors || []).slice(-30).reverse();
        const capture = state.debugCaptureResult;
        const animationCount = (() => { try { return document.getAnimations?.().length || 0; } catch (_) { return 0; } })();
        const sceneLayerCount = document.querySelectorAll('#sp-panel [style*="transform"], #sp-thought-panel, #sp-weather-overlay, #sp-time-tint').length;
        const content = state.debugTab === 'activity'
            ? `<div class="sp-debug-toolbar"><input type="search" data-action="debug-query" value="${esc(state.debugQuery)}" placeholder="Search bounded activity"><select data-action="debug-level"><option value="all" ${state.debugLevel === 'all' ? 'selected' : ''}>All levels</option><option value="info" ${state.debugLevel === 'info' ? 'selected' : ''}>Info</option><option value="audit" ${state.debugLevel === 'audit' ? 'selected' : ''}>Audit</option><option value="warn" ${state.debugLevel === 'warn' ? 'selected' : ''}>Warnings</option><option value="error" ${state.debugLevel === 'error' ? 'selected' : ''}>Errors</option></select><span>${filtered.length} entries</span></div><div class="sp-debug-log">${filtered.length ? filtered.map(row => `<div class="sp-debug-line sp-debug-${esc(row.level)}">${esc(row.text)}</div>`).join('') : '<div class="sp-debug-empty">No local diagnostic entries match this filter.</div>'}</div>`
            : state.debugTab === 'packet'
                ? `<div class="sp-debug-toolbar"><label>Accepted snapshot <select data-action="debug-snapshot">${(state.history || []).map(row => `<option value="${esc(row.id)}" ${String(row.id) === String(packet.selected?.id) ? 'selected' : ''}>${esc(row.label)}</option>`).join('') || '<option>None</option>'}</select></label><span>Raw compact Reader ScenePulse patch only</span></div>${packet.payload ? `<pre class="sp-debug-payload">${esc(JSON.stringify(packet.payload, null, 2))}</pre>` : '<div class="sp-debug-empty">No accepted Reader packet exists for the sealed tutorial fixture.</div>'}`
                : state.debugTab === 'calls'
                    ? `<div class="sp-debug-call-list">${calls.length ? calls.map(trace => { const request = trace?.request || {}, response = trace?.response || {}; return `<article><strong>${esc(request.method || 'REQUEST')} ${esc(debugRedact(request.url || 'endpoint unavailable'))}</strong><span>${esc(trace?.completedAt || trace?.startedAt || 'time unavailable')} · ${esc(String(response.status || trace?.status || 'pending'))}</span></article>`; }).join('') : '<div class="sp-debug-empty">No remote provider-call headers have been recorded in this browser session.</div>'}</div>`
                    : state.debugTab === 'performance'
                        ? `<div class="sp-debug-performance"><p>Proxy metrics only: browsers do not expose actual GPU load. Capture is local and records ScenePulse panel-render durations plus animation/layer counts; it never starts a model call.</p><div class="sp-debug-metrics"><span><b>${animationCount}</b> active animations</span><span><b>${sceneLayerCount}</b> ScenePulse layers</span><span><b>${state.debugCapture ? 'capturing' : capture ? debugDuration(capture.elapsedMs) : 'idle'}</b> capture state</span></div><div class="sp-debug-actions"><button type="button" data-action="debug-capture">${state.debugCapture ? 'Stop capture' : 'Start capture'}</button>${capture ? `<button type="button" data-action="debug-capture-clear">Clear result</button>` : ''}</div>${capture ? `<table class="sp-debug-perf-table"><thead><tr><th>Measured component</th><th>Renders</th><th>Total</th><th>Max</th></tr></thead><tbody>${capture.samples.length ? `<tr><td>ScenePulse panel update</td><td>${capture.samples.length}</td><td>${capture.samples.reduce((sum, sample) => sum + sample.durationMs, 0).toFixed(2)} ms</td><td>${Math.max(...capture.samples.map(sample => sample.durationMs)).toFixed(2)} ms</td></tr>` : '<tr><td colspan="4">No ScenePulse render occurred during this capture.</td></tr>'}</tbody></table>` : ''}</div>`
                        : state.debugTab === 'crashes'
                            ? `<div class="sp-debug-log">${crashes.length ? crashes.map(error => `<div class="sp-debug-line sp-debug-error">${esc(debugRedact(typeof error === 'string' ? error : error?.stack || error?.message || JSON.stringify(error)))}</div>`).join('') : '<div class="sp-debug-empty">No Horde runtime errors are recorded in this browser session.</div>'}</div>`
                            : `<div class="sp-debug-diagnostics"><p>Paste-ready local diagnostics. API keys, URLs containing credentials, local paths, and email addresses are redacted. Player prose and provider request/response bodies are intentionally excluded.</p><textarea readonly aria-label="Redacted ScenePulse diagnostics">${esc(debugDiagnostics(state))}</textarea></div>`;
        return `<div class="sp-debug-overlay"><section class="sp-debug-inspector"><header><span><strong>ScenePulse Debug Inspector</strong><small>Source-derived local diagnostics · accepted packets only</small></span><div><button type="button" data-action="debug-copy">Copy</button><button type="button" data-action="debug-export">Export TXT</button><button type="button" data-action="debug">×</button></div></header><nav>${tabs.map(([key, label]) => `<button type="button" data-action="debug-tab" data-tab="${key}" class="${state.debugTab === key ? 'sp-active' : ''}">${label}</button>`).join('')}</nav><main>${content}</main></section></div>`;
    }
    function presetBrowser(state) {
        if (!state.showPresets) return '';
        const presets = state.sourcePresets || [];
        const families = ['all', ...new Set(presets.map(preset => preset.family).filter(Boolean))].sort();
        const query = state.presetSearch.trim().toLowerCase();
        const filtered = presets.filter(preset => (state.presetFamily === 'all' || preset.family === state.presetFamily)
            && (!query || `${preset.displayName} ${preset.family} ${preset.provider} ${preset.strength} ${preset.notes}`.toLowerCase().includes(query)));
        const compactNumber = value => Number(value) >= 1e6 ? `${Math.round(Number(value) / 1e6)}M` : Number(value) >= 1e3 ? `${Math.round(Number(value) / 1e3)}K` : value ? String(value) : '—';
        const hint = preset => {
            const values = Object.entries(preset.samplerHints || {}).filter(([key, value]) => typeof value === 'number' && ['temperature', 'top_p', 'top_k', 'min_p', 'frequency_penalty', 'presence_penalty', 'repetition_penalty'].includes(key));
            return values.length ? `<div class="sp-preset-samplers">${values.map(([key, value]) => `<span>${esc(key)} <b>${esc(value)}</b></span>`).join('')}</div>` : preset.samplerHints?.guidance ? `<p class="sp-preset-guidance">${esc(preset.samplerHints.guidance)}</p>` : '';
        };
        const cards = filtered.map(preset => `<article class="sp-preset-card${preset.id === state.appliedPresetId ? ' sp-preset-applied' : ''}"><header><span><strong>${esc(preset.displayName)}</strong><small>${esc(preset.family)} · ${esc(preset.provider || 'provider-neutral')}</small></span>${preset.id === state.appliedPresetId ? '<em>Applied to Reader</em>' : ''}</header><p>${esc(preset.strength)}</p><div class="sp-preset-meta"><span>${esc(compactNumber(preset.contextWindow))} context</span><span>system role: ${esc(preset.systemPromptRole || 'unchanged')}</span></div>${hint(preset)}<small class="sp-preset-note">${esc(preset.notes)}</small><footer><button type="button" data-action="preset-apply" data-preset="${esc(preset.id)}">Apply to Reader</button></footer></article>`).join('');
        const body = state.sourcePresetsLoading ? '<div class="sp-debug-empty">Loading the pinned ScenePulse preset catalogue…</div>' : !state.sourcePresets ? '<div class="sp-debug-empty">Preparing the pinned source preset catalogue…</div>' : cards || '<div class="sp-debug-empty">No bundled ScenePulse presets match this filter.</div>';
        return `<div class="sp-preset-overlay"><section class="sp-preset-browser"><header><span><strong>Configure Reader Prompts</strong><small>Actual ScenePulse bundled model presets · sampler hints are advisory only</small></span><button type="button" data-action="presets">×</button></header><div class="sp-preset-controls"><input type="search" data-action="preset-search" value="${esc(state.presetSearch)}" placeholder="Search source presets"><select data-action="preset-family">${families.map(family => `<option value="${esc(family)}" ${family === state.presetFamily ? 'selected' : ''}>${esc(family === 'all' ? 'All model families' : family)}</option>`).join('')}</select><span>${filtered.length || (state.sourcePresetsLoading ? '…' : 0)} source presets</span></div><div class="sp-preset-list">${body}</div><footer>Apply changes only the selected World Reader profile; it never changes the Narrator model, provider routing, samplers, or an already accepted turn.</footer></section></div>`;
    }
    function profiles(state) {
        if (!state.showProfiles) return '';
        const tabs = [['profile', 'ScenePulse Built-in'], ['schema', 'Schema'], ['slots', 'Prompt Slots'], ['prompt', 'Effective Prompt']];
        const assets = state.sourceProfileAssets;
        const profiles = state.fixtureProfiles || [{ name: 'ScenePulse Built-in' }];
        const activeProfile = profiles[state.activeFixtureProfile] || profiles[0];
        const loading = state.sourceProfileLoading ? 'Loading the pinned ScenePulse source asset…' : 'Pinned ScenePulse source asset is unavailable.';
        const descriptions = {
            profile: `<h3>${esc(activeProfile.name)}</h3><p>${state.mode === 'accepted_live' ? 'The accepted Reader projection overlays the pinned source vocabulary field by field; unprovided fields remain visibly fixture-backed.' : 'Demo fixture uses the pinned source vocabulary: environment, scene details, quests, five relationship meters, character interiority and five plot directions.'}</p><dl><dt>Profile</dt><dd>${esc(activeProfile.name)}</dd><dt>Mode</dt><dd>${state.mode === 'accepted_live' ? 'Accepted Horde Reader delta with fixture fallback' : 'Accepted fixture, no Reader call'}</dd><dt>Schema change</dt><dd>Requires a full read before an incompatible delta can merge.</dd></dl>`,
            schema: '<h3>Scene schema</h3><p>The pinned source schema is shown verbatim. Gate A keeps the accepted source shape intact; it does not substitute a Horde schema.</p>',
            slots: '<h3>Prompt slots</h3><p>The actual source delta slot is shown verbatim. It is appended only after a predecessor has been accepted.</p>',
            prompt: '<h3>Effective prompt</h3><p>The pinned ScenePulse built-in prompt is shown verbatim. The tutorial fixture has not made a model call.</p>'
        };
        const sourceText = state.profileTab === 'schema' ? assets?.schema : state.profileTab === 'slots' ? assets?.delta : state.profileTab === 'prompt' ? assets?.prompt : state.mode === 'accepted_live' ? 'TOUR_EXAMPLE_DATA + accepted Reader scenePulse delta → source panel\n\nOnly settled Reader fields replace fixture fields. No registry or legacy sidebar fallback is permitted.' : 'TOUR_EXAMPLE_DATA → accepted.scenePulse\n\nFixture status: accepted baseline only.\nNo live registry or active Horde session field is used.';
        return `<div class="sp-profile-overlay"><section class="sp-profile-dialog"><header><span><strong>Profiles, Prompt & Schema</strong><small>Source profile bundle surface · ${state.mode === 'accepted_live' ? 'accepted live delta' : 'fixture mode'}</small></span><label class="sp-profile-select">Active <select data-action="fixture-profile-select">${profiles.map((profile, index) => `<option value="${index}" ${index === state.activeFixtureProfile ? 'selected' : ''}>${esc(profile.name)}</option>`).join('')}</select></label><button type="button" data-action="profiles">×</button></header><div class="sp-profile-tabs">${tabs.map(([key, label]) => `<button type="button" data-action="profile-tab" data-tab="${key}" class="${state.profileTab === key ? 'sp-active' : ''}">${label}</button>`).join('')}</div><div class="sp-profile-content">${descriptions[state.profileTab] || descriptions.profile}<textarea readonly aria-label="Source profile text">${esc(sourceText || loading)}</textarea><footer><button type="button" data-action="fixture-profile-export">Export profile</button><button type="button" data-action="fixture-profile-duplicate">Duplicate</button></footer></div></section></div>`;
    }
    function browseTimeline(state) {
        if (!state.showBrowse) return '';
        if (state.mode === 'accepted_live') {
            const samples = state.history.length ? state.history : [];
            const selected = samples.find(item => item.id === state.selectedTimeline) || samples.at(-1);
            return `<div class="sp-browse-overlay"><section class="sp-browse-container"><header class="sp-browse-header"><span><strong>Accepted Snapshots</strong><small>Settled Horde Reader history only</small></span><button type="button" data-action="browse">×</button></header><div class="sp-browse-list">${samples.map(item => `<button type="button" class="sp-browse-item${item.id === selected?.id ? ' sp-browse-selected' : ''}" data-action="timeline" data-snapshot="${esc(item.id)}"><span class="sp-browse-idx">${esc(item.label)}</span><span><strong>${esc(item.summary || 'Accepted ScenePulse reading')}</strong><small>${esc(item.createdAt || 'Accepted')}</small></span><span class="sp-browse-tension">accepted</span></button>`).join('')}</div><footer>${samples.length} accepted snapshot${samples.length === 1 ? '' : 's'} · no tour nodes are presented as history</footer></section></div>`;
        }
        const selected = TOUR_TIMELINE.find(item => item.id === state.selectedTimeline) || TOUR_TIMELINE.at(-1);
        return `<div class="sp-browse-overlay"><section class="sp-browse-container"><header class="sp-browse-header"><span><strong>All Snapshots</strong><small>Source guided-tour index · not fabricated story history</small></span><button type="button" data-action="browse">×</button></header><div class="sp-browse-fixture-note">The tutorial supplies one accepted Café Lune handoff. These twelve source tour positions exercise navigation without claiming twelve prior messages.</div><div class="sp-browse-list">${TOUR_TIMELINE.map(item => `<button type="button" class="sp-browse-item${item.id === selected.id ? ' sp-browse-selected' : ''}" data-action="timeline" data-snapshot="${item.id}"><span class="sp-browse-idx">${esc(item.label)}</span><span><strong>${item.current ? 'Accepted Cafe Lune handoff' : 'Guided-tour navigation index'}</strong><small>${item.current ? 'Current fixture baseline' : 'No fictional scene record is invented for this guide node.'}</small></span><span class="sp-browse-tension">${item.current ? 'accepted' : 'guide'}</span></button>`).join('')}</div><footer>1 accepted fixture reading · ${esc(selected.label)} selected</footer></section></div>`;
    }
    function fixtureHistoryGraph(state) {
        if (!state.showHistoryGraph) return '';
        const rel = (state.data.relationships || [])[state.historyCharacter] || state.data.relationships?.[0];
        const meterName = String(state.historyMeter || 'affection').toLowerCase(), current = rel?.[meterName], label = meterName.charAt(0).toUpperCase() + meterName.slice(1), color = METER_COLORS[meterName] || '#aaa';
        return `<div class="sp-graph-overlay"><section class="sp-graph-container"><header class="sp-graph-header"><span><strong>${esc(rel?.name || 'Relationship')} — Relationship History</strong><small>Fixture baseline · one accepted reading</small></span><button type="button" data-action="history-graph">×</button></header><div class="sp-graph-legend">${Object.keys(METER_COLORS).map(key => `<button type="button" class="sp-graph-legend-btn${key === meterName ? ' sp-graph-legend-active' : ''}" data-action="history-meter" data-meter="${key}"><i style="background:${METER_COLORS[key]}"></i>${esc(key)}</button>`).join('')}</div><div class="sp-graph-empty"><svg viewBox="0 0 560 210" role="img" aria-label="${esc(label)} has one fixture baseline"><path d="M54 18V172H530" fill="none" stroke="rgba(255,255,255,.22)"/><path d="M54 172H530" fill="none" stroke="rgba(255,255,255,.08)" stroke-dasharray="4 5"/><circle cx="292" cy="${172 - (pct(current) * 1.54)}" r="6" fill="${color}"/><text x="292" y="196" text-anchor="middle" fill="#aeb7c8" font-size="12">accepted fixture</text><text x="308" y="${168 - (pct(current) * 1.54)}" fill="${color}" font-size="13" font-weight="700">${esc(label)} ${current === undefined ? 'N/A' : pct(current)}</text></svg><p>No trend line is drawn: a single accepted tutorial reading is not history. The same graph receives settled samples, gaps and deltas when Gate B is wired.</p></div><div class="sp-graph-stats"><span>Snapshots: 1</span><span>Data points: ${current === undefined ? 0 : 1}</span><span>Current: ${current === undefined ? 'N/A' : pct(current)}</span><span>Average: ${current === undefined ? 'N/A' : pct(current)}</span></div></section></div>`;
    }
    // Unlike the visible fixture fallback, Reader history contains only
    // actually accepted ScenePulse projections. That distinction matters for
    // relationship graphs: repeating a fixture meter across Turns would look
    // like a trend that the model never supplied. Once the Reader supplies a
    // relationship, its merged accepted projection gives a compact-but-real
    // sample at each subsequent settled snapshot.
    function acceptedRelationshipGraphSamples(state, relation) {
        const identity = relationshipIdentity(relation);
        if (state.mode !== 'accepted_live') return [{ id: 'tour-26', label: 'Accepted fixture', values: relation || {} }];
        return (state.history || []).map(entry => {
            const rows = Array.isArray(entry?.scenePulse?.relationships) ? entry.scenePulse.relationships : [];
            const match = rows.find(item => relationshipIdentity(item) === identity) || null;
            return {
                id: String(entry?.id || ''), label: String(entry?.label || 'Accepted snapshot'),
                time: String(entry?.scenePulse?.time || ''), location: String(entry?.scenePulse?.location || ''),
                values: match || null
            };
        });
    }
    function relationshipGraphSvg(samples, activeMeter) {
        const cap = 30, visible = samples.slice(-cap), meters = Object.keys(METER_COLORS);
        const W = 1000, H = 420, padL = 52, padR = 22, padT = 24, padB = 54, plotW = W - padL - padR, plotH = H - padT - padB;
        if (visible.length < 2) return '';
        const x = index => padL + (index / (visible.length - 1)) * plotW;
        const y = value => padT + plotH - (pct(value) / 100) * plotH;
        const grid = [0, 20, 40, 60, 80, 100].map(value => `<line x1="${padL}" y1="${y(value).toFixed(1)}" x2="${W - padR}" y2="${y(value).toFixed(1)}" stroke="${value === 0 || value === 100 ? '#303647' : '#202534'}" stroke-width="${value % 40 === 0 ? '.9' : '.5'}"/><text x="${padL - 10}" y="${(y(value) + 4).toFixed(1)}" fill="#9098b0" font-size="12" text-anchor="end">${value}</text>`).join('');
        const labels = visible.map((sample, index) => `<g class="sp-graph-xlabel" data-action="timeline" data-snapshot="${esc(sample.id)}" role="button" tabindex="0"><line x1="${x(index).toFixed(1)}" y1="${padT}" x2="${x(index).toFixed(1)}" y2="${padT + plotH}" stroke="#1e2230" stroke-width=".7"/><text x="${x(index).toFixed(1)}" y="${padT + plotH + 23}" fill="#7880a0" font-size="11" text-anchor="middle">${esc(sample.label)}</text></g>`).join('');
        const ordered = [...meters].sort((a, b) => Number(a === activeMeter) - Number(b === activeMeter));
        const paths = ordered.map(meterName => {
            const points = visible.map((sample, index) => {
                const value = Number(sample?.values?.[meterName]);
                return Number.isFinite(value) && value >= 0 ? { index, value } : null;
            });
            let drawing = false;
            const path = points.map(point => {
                if (!point) { drawing = false; return ''; }
                const command = drawing ? 'L' : 'M'; drawing = true;
                return `${command}${x(point.index).toFixed(1)},${y(point.value).toFixed(1)}`;
            }).join(' ');
            const color = METER_COLORS[meterName]; const focused = meterName === activeMeter;
            const dots = points.map(point => point ? `<circle class="sp-graph-dot-hit" data-action="timeline" data-snapshot="${esc(visible[point.index].id)}" cx="${x(point.index).toFixed(1)}" cy="${y(point.value).toFixed(1)}" r="${focused ? '5' : '3.5'}" fill="${color}"><title>${esc(`${visible[point.index].label} · ${meterName} ${pct(point.value)}${visible[point.index].time ? ` · ${visible[point.index].time}` : ''}`)}</title></circle>` : '').join('');
            return path ? `<path class="sp-graph-line-hit" d="${path}" fill="none" stroke="${color}" stroke-width="${focused ? '3' : '1.3'}" opacity="${focused ? '1' : '.42'}" stroke-linecap="round" stroke-linejoin="round"/>${dots}` : '';
        }).join('');
        return `<div class="sp-graph-svg-wrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Accepted relationship meter history"><rect width="${W}" height="${H}" rx="5" fill="#0c0e16"/>${grid}${labels}${paths}</svg></div>`;
    }
    function historyGraph(state) {
        if (!state.showHistoryGraph) return '';
        const relation = (state.data.relationships || []).find(item => relationshipIdentity(item) === String(state.historyIdentity || ''))
            || (state.data.relationships || [])[state.historyCharacter] || state.data.relationships?.[0];
        if (state.mode !== 'accepted_live') return fixtureHistoryGraph(state);
        const meterName = String(state.historyMeter || 'affection').toLowerCase(), label = meterName.charAt(0).toUpperCase() + meterName.slice(1), color = METER_COLORS[meterName] || '#aaa';
        const samples = acceptedRelationshipGraphSamples(state, relation);
        const values = samples.map(sample => Number(sample?.values?.[meterName])).filter(value => Number.isFinite(value) && value >= 0);
        const current = values.at(-1), average = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
        const actual = samples.some(sample => sample.values);
        const graph = actual ? relationshipGraphSvg(samples, meterName) : '';
        const subtitle = actual ? `${samples.length} settled Reader snapshots · select a point to inspect that complete scene` : 'No settled Reader relationship samples yet · fixture meters remain visibly fixture-backed';
        const empty = `<div class="sp-graph-empty"><svg viewBox="0 0 560 210" role="img" aria-label="No accepted Reader ${esc(label)} history"><path d="M54 18V172H530" fill="none" stroke="rgba(255,255,255,.22)"/><path d="M54 172H530" fill="none" stroke="rgba(255,255,255,.08)" stroke-dasharray="4 5"/><text x="292" y="96" text-anchor="middle" fill="#aeb7c8" font-size="14">No accepted Reader relationship samples</text><text x="292" y="120" text-anchor="middle" fill="#6f7788" font-size="12">Fixture fallback is not plotted as story history.</text></svg></div>`;
        return `<div class="sp-graph-overlay"><section class="sp-graph-container"><header class="sp-graph-header"><span><strong>${esc(relation?.name || 'Relationship')} — Relationship History</strong><small>${esc(subtitle)}</small></span><button type="button" data-action="history-graph">×</button></header><div class="sp-graph-legend">${Object.keys(METER_COLORS).map(key => `<button type="button" class="sp-graph-legend-btn${key === meterName ? ' sp-graph-legend-active' : ''}" data-action="history-meter" data-meter="${key}"><i style="background:${METER_COLORS[key]}"></i>${esc(key)}</button>`).join('')}</div>${graph || empty}<div class="sp-graph-stats"><span>Snapshots: ${samples.length}</span><span>Data points: ${values.length}</span><span>Current: ${current === undefined ? '—' : pct(current)}</span><span>Average: ${average === null ? '—' : average}</span>${actual ? '' : '<span>Fixture values are not counted.</span>'}</div></section></div>`;
    }
    const TOUR_STEPS = Object.freeze([
        ['Welcome to ScenePulse', 'ScenePulse is an AI-powered scene intelligence dashboard. This accepted source fixture populates every main rendering surface without touching a Horde story.'],
        ['The Dashboard', 'Time, date, location, weather and temperature each have their own visual treatment.'],
        ['Toolbar Controls', 'Refresh, Panel Manager, Character Wiki, expand/collapse, compact mode, feature toggles, edit mode and empty-field display are all source controls.'],
        ['Scene Details', 'Mood, tension, topic, interaction, summary and sounds stay distinct.'],
        ['Quest Journal', 'North Star, main arcs and side arcs are independent collapsible levels.'],
        ['Relationships', 'Affection, trust, desire, stress and compatibility retain separate meters.'],
        ['Characters', 'Each present character has appearance, outfit, posture, proximity, belongings, immediate need and personal goals.'],
        ['Story Ideas', 'Five source categories have explicit Paste and Inject affordances. In the fixture they stage only a tour draft.'],
        ['Inner Thoughts', 'The floating panel uses literal first-person monologue, with drag, resize, snap, ghost and close controls.'],
        ['Timeline Scrubber', 'The twelve tour nodes are source guide indices. They do not fabricate twelve real story snapshots.'],
        ['Panel Manager', 'Built-in panel visibility and custom-panel configuration are source features.'],
        ['Custom Panels', 'RPG Stats is the source guide’s temporary custom panel configuration.'],
        ['Finish', 'The fixture is now visually complete. The next gate is replacing only its accepted payload with a real accepted Horde turn.']
    ]);
    function tour(state) {
        if (!state.showTour) return '';
        const [title, description] = TOUR_STEPS[state.tourStep]; const final = state.tourStep === TOUR_STEPS.length - 1;
        return `<div class="sp-tour-spotlight"></div><section class="sp-tour-card"><div class="sp-tour-step-label">Step ${state.tourStep + 1} of ${TOUR_STEPS.length}</div><h2>${esc(title)}</h2><p>${esc(description)}</p><div class="sp-tour-nav"><button type="button" data-action="tour-close">Skip</button><span class="sp-tour-progress">${TOUR_STEPS.map((_, index) => `<i class="${index === state.tourStep ? 'sp-active' : ''}"></i>`).join('')}</span>${state.tourStep ? '<button type="button" data-action="tour-prev">← Back</button>' : ''}${final ? '<button type="button" data-action="tour-close">✓ Finish</button>' : '<button type="button" data-action="tour-next">Next →</button>'}</div></section>`;
    }
    function render(host, state) {
        const renderStartedAt = state.debugCapture ? debugNow() : 0;
        const d = state.data;
        const mode = sourceViewportMode(); const panelVisible = mode === 'desktop' || !state.mobileMinimized;
        host.dataset.scenepulseSource = state.mode === 'accepted_live' ? 'accepted_horde_reader_with_fixture_fallback' : 'TOUR_EXAMPLE_DATA'; host.dataset.scenePulseMode = state.mode; host.dataset.fixtureFallbackFields = Object.keys(state.origins || {}).filter(key => state.origins[key] === 'fixture').join(','); host.dataset.spTheme = ExperimentalWorldsState.theme;
        host.dataset.spViewport = mode;
        host.classList.toggle('spw-compact', state.compact); host.classList.toggle('spw-no-weather', !state.features.weather); host.classList.toggle('spw-no-tint', !state.features.timeTint); host.classList.toggle('spw-no-transitions', !state.features.transitions); host.style.setProperty('--sp-fs-base', `${Math.round(12 * state.fontScale)}px`);
        const historyCount = state.mode === 'accepted_live' ? state.history.length : TOUR_TIMELINE.length;
        const customSections = (state.customPanels || []).filter(panel => panel?.enabled !== false).map((panel, index) => {
            const key = customPanelKey(panel, index);
            return section(state, key, panel.name || 'Custom Panel', customPanelData(state, panel, index), String((panel.fields || []).filter(field => field?.enabled !== false).length));
        }).join('');
        const body = `${state.panels.dashboard !== false ? dashboard(state) : ''}${stagnationBanner(state)}${section(state, 'scene', 'Scene Details', sceneDetails(state), d.sceneMood || '')}${section(state, 'quests', 'Quest Journal', quests(state))}${section(state, 'relationships', 'Relationships', relationships(state), String((d.relationships || []).length))}${section(state, 'characters', 'Characters', characters(state), String((d.characters || []).length))}${section(state, 'branches', 'Story Ideas', ideas(state), String((d.plotBranches || []).length))}${customSections}${section(state, 'history', 'Timeline', history(state), String(historyCount))}`;
        const overlays = `${wiki(state)}${web(state)}${browseTimeline(state)}${historyGraph(state)}${diffViewer(state)}${analytics(state)}${debugInspector(state)}${presetBrowser(state)}${commandConsole(state)}${profiles(state)}${tour(state)}${questDialog(state)}`;
        host.innerHTML = `<div id="sp-panel" class="${panelVisible ? 'sp-visible' : ''}${mode === 'desktop' ? '' : ` sp-mode-${mode}`}${state.edit ? ' sp-edit-mode' : ''}${state.showEmpty ? ' sp-show-empty' : ''}">${toolbar(state)}<main id="sp-panel-body">${body}</main>${state.panelManager ? panelManager(state) : ''}</div>${mobileChrome(state, mode)}${thoughts(state)}${state.toast ? `<div class="sp-horde-toast" role="status">${esc(state.toast)}</div>` : ''}<input class="sp-portrait-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>`;
        const effectRoot = effectsRoot(); effectRoot.dataset.spTheme = ExperimentalWorldsState.theme; effectRoot.style.setProperty('--sp-fs-base', `${Math.round(12 * state.fontScale)}px`); effectRoot.innerHTML = ambientEffects(state, mode);
        const root = overlayRoot(); root.dataset.spTheme = ExperimentalWorldsState.theme; root.style.setProperty('--sp-fs-base', `${Math.round(12 * state.fontScale)}px`); root.innerHTML = overlays;
        bind(host, state, root);
        if (state.debugCapture && renderStartedAt) state.debugCapture.samples.push({ durationMs: Math.max(0, debugNow() - renderStartedAt) });
    }
    function fixtureNotice(state, text) { state.toast = text; setTimeout(() => { if (state.toast === text) { state.toast = ''; state.rerender?.(); } }, 3200); }
    // Horde integration deliberately crosses this boundary by a named DOM
    // event rather than letting the imported source surface know about the
    // World composer or session model.  The host synchronously claims the
    // request and supplies a promise so source controls preserve their normal
    // async action semantics without smuggling a second application runtime
    // into the panel.
    async function requestHostAction(host, action, payload = {}) {
        const detail = { action, ...payload, promise: null };
        const event = new CustomEvent('horde-scenepulse-action', { bubbles: false, cancelable: true, detail });
        host.dispatchEvent(event);
        if (!event.defaultPrevented || !detail.promise) throw new Error(`The Horde handler for “${action}” is unavailable.`);
        return await detail.promise;
    }
    function bind(host, state, root) {
        const rerender = () => render(host, state); state.rerender = rerender;
        const scheduleViewPreferenceSave = () => {
            clearTimeout(state.viewPreferenceTimer);
            state.viewPreferenceTimer = setTimeout(() => {
                requestHostAction(host, 'persist-scenepulse-view-preferences', { preferences: scenePulseViewPreferences(state) })
                    .catch(error => fixtureNotice(state, `Could not save ScenePulse view preference: ${error?.message || error}`));
            }, 180);
        };
        const persistentAction = new Set(['compact', 'empty', 'expand', 'feature', 'thought-close', 'thought-ghost', 'thought-snap', 'thought-fit', 'mobile-minimize', 'mobile-restore', 'custom-select', 'custom-add', 'custom-duplicate', 'custom-delete', 'custom-add-field', 'custom-field-delete', 'custom-field-type', 'custom-panel-enabled', 'custom-panel-name', 'custom-field-enabled', 'custom-field-key', 'custom-field-label', 'custom-field-desc', 'custom-field-options', 'custom-field-invert', 'command-run']);
        const input = host.querySelector('.sp-portrait-input');
        const customPanelAt = index => state.customPanels?.[Number(index)];
        const customFieldAt = (panelIndex, fieldIndex) => customPanelAt(panelIndex)?.fields?.[Number(fieldIndex)];
        // Story Ideas deliberately use the source control pattern: direct
        // listeners stop their parent card's expand/collapse interaction,
        // while the source surface still delegates the actual Horde work over
        // the named host event.  This is particularly important in Worlds,
        // whose surrounding cards also own click behavior.
        const performStoryIdeaAction = async target => {
            const action = target.dataset.action;
            const idea = state.data.plotBranches[Number(target.dataset.idea)];
            if (!idea) return false;
            if (state.mode === 'accepted_live') {
                try {
                    await requestHostAction(host, 'stage-story-idea', { direction: storyIdeaDirection(idea), inject: action === 'inject' });
                } catch (error) {
                    fixtureNotice(state, `Could not ${action === 'inject' ? 'inject' : 'paste'} story direction: ${error?.message || error}`);
                    rerender();
                }
                // The host owns its composer and renders the succeeding turn.
                // Do not redraw this older accepted projection over that host update.
                return false;
            }
            const source = storyIdeaShape(idea);
            state.draft = `${source.name}\n\n${source.hook}`.trim();
            fixtureNotice(state, action === 'paste' ? 'Pasted into the isolated tour draft.' : 'Inject staged in the isolated tour draft; no Horde turn was sent.');
            return true;
        };
        const onChange = event => {
            const target = event.target; if (!target.matches('[data-action="theme"], [data-action="font-scale"], [data-action="wiki-search"], [data-action="wiki-sort"], [data-action="wiki-notes"], [data-action="panel-toggle"], [data-action="fixture-profile-select"], [data-action="debug-query"], [data-action="debug-level"], [data-action="debug-snapshot"], [data-action="preset-search"], [data-action="preset-family"], [data-action="custom-panel-enabled"], [data-action="custom-panel-name"], [data-action="custom-field-enabled"], [data-action="custom-field-key"], [data-action="custom-field-label"], [data-action="custom-field-type"], [data-action="custom-field-desc"], [data-action="custom-field-options"], [data-action="custom-field-invert"], [data-action="custom-import"], .sp-portrait-input')) return;
            if (target.matches('.sp-portrait-input')) {
                const file = target.files?.[0]; const index = Number(target.dataset.character);
                const character = state.data.characters?.[index]; const identity = characterIdentity(state, character, index);
                if (!file || !character || !identity) { fixtureNotice(state, 'This ScenePulse character has no stable identity for a persistent portrait override.'); return; }
                const reader = new FileReader();
                reader.onload = async () => {
                    try {
                        const result = await requestHostAction(host, 'save-scenepulse-portrait', { identity, label: String(character.name || ''), data: String(reader.result || '') });
                        if (!result?.assetId || !result?.source) throw new Error('Horde did not return a stored portrait asset.');
                        state.portraitAssetIds[identity] = result.assetId;
                        state.portraitOverrides[identity] = result.source;
                        fixtureNotice(state, `Portrait saved for ${character.name}. It remains a presentation override, not ScenePulse evidence.`);
                    } catch (error) { fixtureNotice(state, `Could not save portrait: ${error?.message || error}`); }
                    rerender();
                };
                reader.readAsDataURL(file); return;
            }
            if (target.dataset.action === 'custom-import') {
                const file = target.files?.[0]; if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const parsed = JSON.parse(String(reader.result || ''));
                        const imported = sanitizeCustomPanels(Array.isArray(parsed) ? parsed : parsed?.customPanels);
                        if (!imported.length) throw new Error('No valid ScenePulse custom-panel schemas were found.');
                        const room = Math.max(0, 20 - state.customPanels.length);
                        if (!room) throw new Error('This World already has the 20-panel safety limit.');
                        state.customPanels.push(...imported.slice(0, room)); state.activeCustomPanel = state.customPanels.length - 1;
                        scheduleViewPreferenceSave(); fixtureNotice(state, `Imported ${Math.min(imported.length, room)} custom-panel schema${Math.min(imported.length, room) === 1 ? '' : 's'}; existing panels and all Reader values were left unchanged.`);
                    } catch (error) { fixtureNotice(state, `Could not import custom panels: ${error?.message || error}`); }
                    rerender();
                };
                reader.readAsText(file); return;
            }
            if (target.dataset.action === 'theme') ExperimentalWorldsState.theme = target.value;
            if (target.dataset.action === 'font-scale') state.fontScale = Number(target.value);
            if (target.dataset.action === 'wiki-search') state.wikiSearch = target.value;
            if (target.dataset.action === 'wiki-sort') state.wikiSort = target.value;
            if (target.dataset.action === 'wiki-notes') {
                const identity = String(target.dataset.noteId || '');
                if (identity) state.wikiNotes[identity] = String(target.value || '');
            }
            if (target.dataset.action === 'panel-toggle') state.panels[target.dataset.panelKey] = target.checked;
            if (target.dataset.action === 'fixture-profile-select') state.activeFixtureProfile = Number(target.value) || 0;
            if (target.dataset.action === 'debug-query') state.debugQuery = target.value;
            if (target.dataset.action === 'debug-level') state.debugLevel = target.value || 'all';
            if (target.dataset.action === 'debug-snapshot') state.debugSnapshot = target.value || '';
            if (target.dataset.action === 'preset-search') state.presetSearch = target.value;
            if (target.dataset.action === 'preset-family') state.presetFamily = target.value || 'all';
            if (target.dataset.action === 'custom-panel-enabled') {
                const panel = customPanelAt(target.dataset.panel); if (!panel) return;
                panel.enabled = target.checked;
            }
            if (target.dataset.action === 'custom-panel-name') {
                const panel = customPanelAt(target.dataset.panel); if (!panel) return;
                panel.name = String(target.value || '').trim().slice(0, 120) || 'Untitled';
            }
            if (String(target.dataset.action || '').startsWith('custom-field-')) {
                const field = customFieldAt(target.dataset.panel, target.dataset.field); if (!field) return;
                if (target.dataset.action === 'custom-field-enabled') field.enabled = target.checked;
                if (target.dataset.action === 'custom-field-key') field.key = String(target.value || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/^[0-9]/, '_$&').replace(/_+/g, '_').slice(0, 80) || 'field';
                if (target.dataset.action === 'custom-field-label') field.label = String(target.value || '').trim().slice(0, 120) || field.key || 'Field';
                if (target.dataset.action === 'custom-field-type') field.type = ['text', 'number', 'meter', 'list', 'enum'].includes(target.value) ? target.value : 'text';
                if (target.dataset.action === 'custom-field-desc') field.desc = String(target.value || '').slice(0, 600);
                if (target.dataset.action === 'custom-field-options') field.options = String(target.value || '').split(',').map(value => value.trim().slice(0, 120)).filter(Boolean).slice(0, 48);
                if (target.dataset.action === 'custom-field-invert') field.invert = target.checked;
            }
            scheduleViewPreferenceSave();
            rerender();
        };
        // The source preset catalogue is intentionally a discovery surface:
        // filtering must react while the user is typing, without requiring a
        // blur that could look like an unapplied selector.  Keep focus and the
        // caret across the source-overlay redraw; changing a filter still does
        // not select or persist a Reader preset.
        const onInput = event => {
            const target = event.target;
            if (target.dataset.action === 'command-input') { state.commandInput = target.value; return; }
            if (target.dataset.action !== 'preset-search') return;
            const caret = target.selectionStart ?? String(target.value || '').length;
            state.presetSearch = target.value;
            rerender();
            const next = root.querySelector('[data-action="preset-search"]');
            if (next) {
                next.focus();
                next.setSelectionRange?.(caret, caret);
            }
        };
        const onClick = async event => {
            const target = event.target.closest('[data-action]'); if (!target) return; const action = target.dataset.action;
            // Native source form controls commit on change.  Delegated clicks
            // must not redraw their parent overlay first, or the checkbox /
            // select never reaches its own handler.
            if (['theme', 'font-scale', 'wiki-search', 'wiki-sort', 'wiki-notes', 'panel-toggle', 'fixture-profile-select', 'debug-query', 'debug-level', 'debug-snapshot', 'preset-search', 'preset-family', 'custom-panel-enabled', 'custom-panel-name', 'custom-field-enabled', 'custom-field-key', 'custom-field-label', 'custom-field-type', 'custom-field-desc', 'custom-field-options', 'custom-field-invert', 'custom-import'].includes(action)) return;
            if (action === 'edit-quest-field') {
                if (!state.edit) return;
                const tier = target.dataset.questTier; const field = target.dataset.field;
                const quest = tier === 'northStar' ? state.data : state.data[tier]?.[Number(target.dataset.questIndex)];
                if (!quest || !field) return;
                const prior = String(quest[field] ?? '');
                if (target.textContent.trim() === '—' && !prior) target.textContent = '';
                target.contentEditable = 'true'; target.classList.add('sp-editing'); target.focus();
                const range = document.createRange(); range.selectNodeContents(target);
                const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
                const commit = () => {
                    if (target.dataset.committed) return;
                    target.dataset.committed = 'true'; const next = target.textContent.trim();
                    if (next !== prior) {
                        quest[field] = next;
                        const label = tier === 'northStar' ? 'North Star' : `“${quest.name || 'quest'}” ${field}`;
                        fixtureNotice(state, `Updated ${label} in the isolated tutorial state; no Horde quest changed.`);
                    }
                    rerender();
                };
                target.addEventListener('blur', commit, { once: true });
                target.addEventListener('keydown', keyEvent => { if (keyEvent.key === 'Escape') { target.textContent = prior; target.blur(); } if (keyEvent.key === 'Enter' && !keyEvent.shiftKey) { keyEvent.preventDefault(); target.blur(); } });
                return;
            }
            if (action === 'edit-relationship-field') {
                if (!state.edit) return;
                const index = Number(target.dataset.character); const field = target.dataset.field; const relationship = state.data.relationships?.[index];
                if (!relationship || !field) return;
                const prior = String(relationship[field] ?? '');
                if (target.textContent.trim() === '—' && !prior) target.textContent = '';
                target.contentEditable = 'true'; target.classList.add('sp-editing'); target.focus();
                const range = document.createRange(); range.selectNodeContents(target);
                const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
                const commit = () => {
                    if (target.dataset.committed) return;
                    target.dataset.committed = 'true'; const next = target.textContent.trim();
                    if (next !== prior) { relationship[field] = next; fixtureNotice(state, `Updated ${relationship.name}'s ${field} in the isolated tutorial state; no Horde relationship changed.`); }
                    rerender();
                };
                target.addEventListener('blur', commit, { once: true });
                target.addEventListener('keydown', keyEvent => { if (keyEvent.key === 'Escape') { target.textContent = prior; target.blur(); } if (keyEvent.key === 'Enter' && !keyEvent.shiftKey) { keyEvent.preventDefault(); target.blur(); } });
                return;
            }
            if (action === 'edit-dashboard-field') {
                if (!state.edit) return;
                const field = target.dataset.field; if (!field) return;
                const prior = String(state.data[field] ?? '');
                // Dashboard cards deliberately display human-friendly forms
                // (Monday, 2:32 PM, converted temperature).  Editing always
                // begins with the accepted fixture's original field value.
                target.textContent = prior;
                target.contentEditable = 'true'; target.classList.add('sp-editing'); target.focus();
                const range = document.createRange(); range.selectNodeContents(target);
                const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
                const commit = () => {
                    if (target.dataset.committed) return;
                    target.dataset.committed = 'true'; const next = target.textContent.trim();
                    if (next !== prior) {
                        const previous = { location: state.data.location, time: state.data.time };
                        state.data[field] = next;
                        // This is the source transition behavior exercised
                        // against an isolated tutorial edit—never a fabricated
                        // historical turn and never a Horde state change.
                        if (field === 'location' || field === 'time') triggerFixtureTransition(state, previous);
                        fixtureNotice(state, `Updated dashboard ${field} in the isolated tutorial state; no Horde scene record changed.`);
                    }
                    rerender();
                };
                target.addEventListener('blur', commit, { once: true });
                target.addEventListener('keydown', keyEvent => { if (keyEvent.key === 'Escape') { target.textContent = prior; target.blur(); } if (keyEvent.key === 'Enter' && !keyEvent.shiftKey) { keyEvent.preventDefault(); target.blur(); } });
                return;
            }
            if (action === 'edit-scene-field') {
                if (!state.edit) return;
                const field = target.dataset.field; if (!field) return;
                const original = state.data[field]; const prior = Array.isArray(original) ? original.join(', ') : String(original ?? '');
                if (target.textContent.trim() === '—' && !prior) target.textContent = '';
                target.contentEditable = 'true'; target.classList.add('sp-editing'); target.focus();
                const range = document.createRange(); range.selectNodeContents(target);
                const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
                const commit = () => {
                    if (target.dataset.committed) return;
                    target.dataset.committed = 'true'; const next = target.textContent.trim();
                    if (next !== prior) {
                        state.data[field] = field === 'witnesses' ? next.split(',').map(value => value.trim()).filter(Boolean) : next;
                        fixtureNotice(state, `Updated scene ${field} in the isolated tutorial state; no Horde scene record changed.`);
                    }
                    rerender();
                };
                target.addEventListener('blur', commit, { once: true });
                target.addEventListener('keydown', keyEvent => { if (keyEvent.key === 'Escape') { target.textContent = prior; target.blur(); } if (keyEvent.key === 'Enter' && !keyEvent.shiftKey) { keyEvent.preventDefault(); target.blur(); } });
                return;
            }
            if (action === 'edit-character-field') {
                if (!state.edit) return;
                const index = Number(target.dataset.character); const field = target.dataset.field; const character = state.data.characters?.[index];
                if (!character || !field) return;
                const prior = String(character[field] ?? '');
                // Source edit mode selects the complete current value.  An
                // empty fixture field is displayed as an em dash, but that
                // display fallback must never become a literal saved value.
                if (target.textContent.trim() === '—' && !prior) target.textContent = '';
                target.contentEditable = 'true'; target.classList.add('sp-editing'); target.focus();
                const range = document.createRange(); range.selectNodeContents(target);
                const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
                const commit = () => {
                    if (target.dataset.committed) return;
                    target.dataset.committed = 'true'; const next = target.textContent.trim();
                    if (next !== prior) { character[field] = next; fixtureNotice(state, `Updated ${character.name}'s ${field} in the isolated tutorial state; no Horde record changed.`); }
                    rerender();
                };
                target.addEventListener('blur', commit, { once: true });
                target.addEventListener('keydown', keyEvent => { if (keyEvent.key === 'Escape') { target.textContent = prior; target.blur(); } if (keyEvent.key === 'Enter' && !keyEvent.shiftKey) { keyEvent.preventDefault(); target.blur(); } });
                return;
            }
            if (action === 'section') { const key = target.dataset.key; state.open[key] = !(state.open[key] !== false); }
            else if (action === 'card') {
                const key = target.dataset.card;
                // Source Story Ideas start collapsed; character, quest and
                // relationship records start expanded.  Toggle from each
                // component's real default instead of treating every absent
                // state entry as an open card.
                const open = String(key || '').startsWith('idea-') ? state.cards[key] === true : state.cards[key] !== false;
                state.cards[key] = !open;
            }
            else if (action === 'tier') { const key = target.dataset.tier; state.tiers[key] = !(state.tiers[key] !== false); }
            else if (action === 'quest-add') { state.questDialog = { tier: target.dataset.questTier, title: target.dataset.questTitle }; }
            else if (action === 'quest-dialog-cancel') state.questDialog = null;
            else if (action === 'quest-dialog-submit') {
                const dialog = root.querySelector('.sp-quest-dialog'); const name = dialog?.querySelector('#sp-qd-name')?.value.trim() || '';
                if (!name) { dialog?.querySelector('#sp-qd-name')?.focus(); return; }
                const tier = state.questDialog?.tier; if (!tier || !Array.isArray(state.data[tier])) return;
                state.data[tier].push({ name, urgency: dialog.querySelector('#sp-qd-urgency')?.value || 'moderate', detail: dialog.querySelector('#sp-qd-detail')?.value.trim() || '' });
                state.questDialog = null; fixtureNotice(state, `Added “${name}” to the isolated tutorial state; no Horde quest changed.`);
            }
            else if (action === 'quest-complete' || action === 'quest-restore') {
                const tier = target.dataset.questTier; const quest = state.data[tier]?.[Number(target.dataset.questIndex)]; if (!quest) return;
                if (action === 'quest-complete') { quest._fixturePreviousUrgency = quest.urgency || 'moderate'; quest.urgency = 'resolved'; fixtureNotice(state, `Completed “${quest.name}” in the isolated tutorial state; no Horde quest changed.`); }
                else { quest.urgency = quest._fixturePreviousUrgency || 'moderate'; delete quest._fixturePreviousUrgency; fixtureNotice(state, `Restored “${quest.name}” in the isolated tutorial state; no Horde quest changed.`); }
            }
            else if (action === 'quest-remove') { const tier = target.dataset.questTier; const quest = state.data[tier]?.[Number(target.dataset.questIndex)]; if (quest) state.questConfirm = { tier, index: Number(target.dataset.questIndex), name: quest.name }; }
            else if (action === 'quest-confirm-cancel') state.questConfirm = null;
            else if (action === 'quest-confirm-remove') { const pending = state.questConfirm; const quest = pending && state.data[pending.tier]?.[pending.index]; if (pending && quest) { state.data[pending.tier].splice(pending.index, 1); fixtureNotice(state, `Removed “${quest.name}” from the isolated tutorial state; no Horde quest changed.`); } state.questConfirm = null; }
            else if (action === 'features') state.featureMenu = !state.featureMenu;
            else if (action === 'feature') {
                // Own the label click so the source checkbox menu remains
                // reliable when embedded in Horde's delegated surface.
                event.preventDefault();
                const enabled = !state.features[target.dataset.feature];
                state.features[target.dataset.feature] = enabled;
                // ScenePulse's floating panel close persists showThoughts=false.
                // Turning the matching source feature back on is the recovery path.
                if (target.dataset.feature === 'thoughts') state.thoughtsOpen = enabled;
            }
            else if (action === 'mobile-minimize') state.mobileMinimized = true;
            else if (action === 'mobile-restore') state.mobileMinimized = false;
            else if (action === 'panels') state.panelManager = !state.panelManager;
            else if (action === 'compact') state.compact = !state.compact;
            else if (action === 'edit') {
                if (state.mode === 'accepted_live') { fixtureNotice(state, 'Accepted live ScenePulse data is read-only here; edit controls remain fixture-local until a deliberate Horde write path is wired.'); }
                else { state.edit = !state.edit; fixtureNotice(state, state.edit ? 'Edit mode is active for the isolated tour fixture.' : 'Edit mode closed.'); }
            }
            else if (action === 'empty') state.showEmpty = !state.showEmpty;
            else if (action === 'expand') { const anyOpen = Object.values(state.open).some(Boolean); Object.keys(state.open).forEach(key => { state.open[key] = !anyOpen; }); }
            else if (action === 'wiki') state.showWiki = !state.showWiki;
            else if (action === 'wiki-character') { const character = Number(target.dataset.character); state.showWiki = true; state.selectedDossier = state.selectedDossier === character ? '' : character; }
            else if (action === 'wiki-filter') state.wikiFilter = target.dataset.filter || 'all';
            else if (action === 'wiki-grid') state.wikiGrid = !state.wikiGrid;
            else if (action === 'wiki-export-json') { downloadFixture('scenepulse-tour-wiki.json', JSON.stringify(state.data.characters || [], null, 2)); fixtureNotice(state, 'Fixture wiki JSON exported.'); }
            else if (action === 'wiki-export-md') { downloadFixture('scenepulse-tour-wiki.md', (state.data.characters || []).map(character => `# ${character.name}\n\n${character.role}\n\n> ${character.innerThought}\n\nNeed: ${character.immediateNeed}\n\n`).join(''), 'text/markdown'); fixtureNotice(state, 'Fixture wiki Markdown exported.'); }
            else if (action === 'relationship-web') { state.showWeb = !state.showWeb; if (!state.showWeb) state.webFocused = null; }
            else if (action === 'web-classic') state.webClassic = !state.webClassic;
            else if (action === 'web-clear-focus') state.webFocused = null;
            else if (action === 'web-detail') { const index = Number(target.dataset.character); state.webFocused = state.webFocused === index ? null : index; }
            else if (action === 'timeline') { applyHistorySelection(state, target.dataset.snapshot); state.open.history = true; if (state.showBrowse) state.showBrowse = false; if (target.closest('.sp-graph-overlay')) state.showHistoryGraph = false; if (target.closest('.sp-analytics-overlay')) state.showAnalytics = false; }
            else if (action === 'browse') { state.showBrowse = !state.showBrowse; state.open.history = true; }
            else if (action === 'diff') state.showDiff = !state.showDiff;
            else if (action === 'analytics') state.showAnalytics = !state.showAnalytics;
            else if (action === 'debug') state.showDebug = !state.showDebug;
            else if (action === 'commands') state.showCommands = !state.showCommands;
            else if (action === 'command-input') return;
            else if (action === 'command-example') state.commandInput = target.dataset.command || '/sp status';
            else if (action === 'command-run') {
                state.commandInput = root.querySelector('[data-action="command-input"]')?.value || state.commandInput;
                try {
                    const result = await executeSourceCommand(host, state, state.commandInput);
                    state.commandResult = result?.message || '';
                    if (result?.hostRendered) return;
                } catch (error) { state.commandResult = `Command failed: ${error?.message || error}`; }
            }
            else if (action === 'command-clear-cancel') { state.commandConfirm = null; state.commandResult = 'Clear cancelled.'; }
            else if (action === 'command-clear-confirm') {
                if (state.commandConfirm?.kind !== 'clear') return;
                const count = Number(state.commandConfirm.count || 0);
                state.commandConfirm = null;
                if (state.mode !== 'accepted_live') {
                    state.data = {}; state.origins = {}; state.macroSource = {};
                    state.commandResult = 'Cleared the local tutorial clone. Reload restores the sealed TOUR_EXAMPLE_DATA handoff.';
                } else {
                    try {
                        await requestHostAction(host, 'clear-scenepulse-history');
                        return;
                    } catch (error) { state.commandResult = `Could not clear ${count} ScenePulse snapshot${count === 1 ? '' : 's'}: ${error?.message || error}`; }
                }
            }
            else if (action === 'debug-tab') state.debugTab = target.dataset.tab || 'activity';
            else if (action === 'debug-copy') {
                navigator.clipboard?.writeText(debugDiagnostics(state));
                fixtureNotice(state, 'Redacted ScenePulse diagnostics copied.');
            }
            else if (action === 'debug-export') {
                downloadFixture(`scenepulse-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`, debugDiagnostics(state), 'text/plain');
                fixtureNotice(state, 'Redacted ScenePulse diagnostics exported.');
            }
            else if (action === 'debug-capture') {
                if (state.debugCapture) {
                    const capture = state.debugCapture;
                    state.debugCaptureResult = { elapsedMs: Math.max(0, debugNow() - capture.startedAt), samples: capture.samples.slice() };
                    state.debugCapture = null;
                } else state.debugCapture = { startedAt: debugNow(), samples: [] };
            }
            else if (action === 'debug-capture-clear') state.debugCaptureResult = null;
            else if (action === 'presets') { state.showPresets = !state.showPresets; hydrateSourcePresets(state); }
            else if (action === 'preset-apply') {
                const preset = (state.sourcePresets || []).find(item => item.id === target.dataset.preset);
                if (!preset) { fixtureNotice(state, 'The selected pinned source preset is unavailable.'); }
                else {
                    target.disabled = true;
                    try {
                        await requestHostAction(host, 'apply-scenepulse-preset', { preset });
                        state.appliedPresetId = preset.id;
                        fixtureNotice(state, `Applied ScenePulse preset “${preset.displayName}” to this World Reader. Existing accepted turns are unchanged.`);
                    } catch (error) { fixtureNotice(state, `Could not apply source preset: ${error?.message || error}`); }
                }
            }
            else if (action === 'diff-mode') state.diffMode = target.dataset.mode || 'changes';
            else if (action === 'copy-payload') {
                const rawDelta = state.mode === 'accepted_live' && state.diffMode === 'delta' && state.deltaData && Object.keys(state.deltaData).length;
                navigator.clipboard?.writeText(JSON.stringify(rawDelta ? state.deltaData : state.data, null, 2));
                fixtureNotice(state, rawDelta ? 'Compact Reader delta copied.' : state.mode === 'accepted_live' ? 'Accepted Reader projection copied.' : 'Accepted fixture payload copied.');
            }
            else if (action === 'paste' || action === 'inject') { if (!await performStoryIdeaAction(target)) return; }
            else if (action === 'clear-draft') state.draft = '';
            else if (action === 'history-graph') { if (target.dataset.character === undefined) state.showHistoryGraph = false; else { const identity = String(target.dataset.identity || ''); const isSame = state.showHistoryGraph && state.historyCharacter === Number(target.dataset.character) && state.historyIdentity === identity && state.historyMeter === target.dataset.meter; state.showHistoryGraph = !isSame; state.historyCharacter = Number(target.dataset.character || 0); state.historyIdentity = identity; state.historyMeter = target.dataset.meter || 'affection'; } }
            else if (action === 'history-meter') state.historyMeter = target.dataset.meter || 'affection';
            else if (action === 'stagnation-dismiss') { state.stagnationDismissed[target.dataset.snapshot || 'current'] = true; }
            else if (action === 'thought-close') state.thoughtsOpen = false;
            else if (action === 'thought-ghost') state.thoughtGhost = !state.thoughtGhost;
            else if (action === 'thought-snap') { state.thoughtSnap = !state.thoughtSnap; state.thoughtX = state.thoughtSnap ? 8 : 30; }
            else if (action === 'thought-fit') { state.thoughtFit = !state.thoughtFit; state.thoughtWidth = state.thoughtFit ? 280 : 340; }
            else if (action === 'portrait') { input.dataset.character = target.dataset.character; input.click(); return; }
            else if (action === 'portrait-clear') {
                const index = Number(target.dataset.character); const character = state.data.characters?.[index];
                const identity = String(target.dataset.portraitId || characterIdentity(state, character, index) || '');
                if (!identity) { fixtureNotice(state, 'This ScenePulse character has no stable portrait identity to clear.'); }
                else {
                    try {
                        await requestHostAction(host, 'clear-scenepulse-portrait', { identity });
                        delete state.portraitAssetIds[identity]; delete state.portraitOverrides[identity];
                        fixtureNotice(state, `Portrait override cleared for ${character?.name || 'this character'}; the stored media asset was retained.`);
                    } catch (error) { fixtureNotice(state, `Could not clear portrait override: ${error?.message || error}`); }
                }
            }
            else if (action === 'custom-select') state.activeCustomPanel = Number(target.dataset.panel);
            else if (action === 'custom-add') { state.customPanels.push({ name: `Custom Panel ${state.customPanels.length + 1}`, enabled: true, fields: [] }); state.activeCustomPanel = state.customPanels.length - 1; }
            else if (action === 'custom-duplicate') { const panel = clone(state.customPanels[Number(target.dataset.panel)]); panel.name += ' Copy'; state.customPanels.push(panel); state.activeCustomPanel = state.customPanels.length - 1; }
            else if (action === 'custom-delete') { state.customPanels.splice(Number(target.dataset.panel), 1); state.activeCustomPanel = Math.max(0, state.activeCustomPanel - 1); }
            else if (action === 'custom-add-field') { const panel = customPanelAt(target.dataset.panel); if (!panel) return; panel.fields.push({ key: 'new_field', label: 'New Field', type: 'text', desc: 'Describe the field for ScenePulse.', enabled: true, options: [], invert: false }); }
            else if (action === 'custom-field-delete') { const panel = customPanelAt(target.dataset.panel); if (!panel) return; panel.fields.splice(Number(target.dataset.field), 1); }
            else if (action === 'custom-export') { downloadFixture('scenepulse-custom-panels.json', JSON.stringify({ source: 'ScenePulse v6.27.20', schemaVersion: 1, customPanels: sanitizeCustomPanels(state.customPanels) }, null, 2)); fixtureNotice(state, 'Exported custom-panel schemas only; no tutorial or accepted Reader values were included.'); }
            else if (action === 'custom-import-trigger') { host.querySelector('[data-action="custom-import"]')?.click(); return; }
            else if (action === 'profiles') state.showProfiles = !state.showProfiles;
            else if (action === 'profile-tab') state.profileTab = target.dataset.tab || 'profile';
            else if (action === 'fixture-profile-duplicate') {
                const active = state.fixtureProfiles[state.activeFixtureProfile] || { name: 'ScenePulse Built-in' };
                const stem = active.name.replace(/ Copy(?: \d+)?$/, '');
                const copies = state.fixtureProfiles.filter(profile => profile.name.startsWith(`${stem} Copy`)).length;
                state.fixtureProfiles.push({ name: `${stem} Copy${copies ? ` ${copies + 1}` : ''}` });
                state.activeFixtureProfile = state.fixtureProfiles.length - 1;
                fixtureNotice(state, `Created local fixture profile “${state.fixtureProfiles[state.activeFixtureProfile].name}”; no Horde profile changed.`);
            }
            else if (action === 'fixture-profile-export') {
                const active = state.fixtureProfiles[state.activeFixtureProfile] || { name: 'ScenePulse Built-in' };
                downloadFixture(`${slug(active.name) || 'scenepulse-profile'}.json`, JSON.stringify({ name: active.name, source: 'ScenePulse v6.27.20', mode: 'accepted_fixture', prompt: state.sourceProfileAssets?.prompt || '', schema: state.sourceProfileAssets?.schema || '', slots: state.sourceProfileAssets?.delta || '' }, null, 2));
                fixtureNotice(state, `Exported local fixture profile “${active.name}”.`);
            }
            else if (action === 'tour') { state.showTour = true; state.tourStep = 0; }
            else if (action === 'tour-next') state.tourStep = Math.min(TOUR_STEPS.length - 1, state.tourStep + 1);
            else if (action === 'tour-prev') state.tourStep = Math.max(0, state.tourStep - 1);
            else if (action === 'tour-close') state.showTour = false;
            else if (action === 'fixture-refresh') {
                if (state.mode !== 'accepted_live') fixtureNotice(state, 'This is the accepted source fixture. Its surface is complete; a live Reader action belongs to the next integration gate.');
                else if (state.viewingHistory) fixtureNotice(state, 'History is read-only. Return to current before refreshing this scene.');
                else {
                    target.disabled = true;
                    try { await requestHostAction(host, 'refresh-scene-pulse', { section: target.dataset.section || '' }); }
                    catch (error) { fixtureNotice(state, `Could not refresh ScenePulse: ${error?.message || error}`); rerender(); }
                    // A successful host refresh accepts its derived Reader
                    // snapshot and performs the definitive host redraw.
                    return;
                }
            }
            if (persistentAction.has(action)) scheduleViewPreferenceSave();
            rerender();
        };
        const onKeydown = event => {
            if (event.key === 'Enter' && !event.shiftKey && event.target.matches('[data-action="command-input"]')) {
                event.preventDefault(); root.querySelector('[data-action="command-run"]')?.click(); return;
            }
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const target = event.target.closest('[data-action="section"], [data-action="card"], [data-action="tier"], [data-action="web-detail"], [data-action="edit-dashboard-field"], [data-action="timeline"]');
            if (!target) return;
            event.preventDefault();
            target.click();
        };
        host.onchange = onChange; root.onchange = onChange; root.oninput = onInput;
        host.onclick = onClick; root.onclick = onClick;
        host.onkeydown = onKeydown; root.onkeydown = onKeydown;
        host.querySelectorAll('.sp-idea-paste, .sp-idea-inject').forEach(button => button.addEventListener('click', async event => {
            event.preventDefault(); event.stopPropagation();
            if (await performStoryIdeaAction(event.currentTarget)) rerender();
        }));
        // The source manager uses native drag/drop to reorder fields within
        // or between panels. Keep that interaction on the source surface
        // rather than reducing field ordering to a static JSON preference.
        host.querySelectorAll('[data-custom-drag-panel]').forEach(handle => {
            handle.addEventListener('dragstart', event => {
                state.customDrag = { panel: Number(handle.dataset.customDragPanel), field: Number(handle.dataset.customDragField) };
                event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', `${state.customDrag.panel}:${state.customDrag.field}`);
                handle.closest('.sp-custom-field')?.classList.add('sp-cp-dragging');
            });
            handle.addEventListener('dragend', () => {
                state.customDrag = null;
                host.querySelectorAll('.sp-cp-dragging, .sp-cp-drag-over').forEach(node => node.classList.remove('sp-cp-dragging', 'sp-cp-drag-over'));
            });
        });
        host.querySelectorAll('[data-custom-drop-panel]').forEach(destination => {
            destination.addEventListener('dragover', event => { if (state.customDrag) { event.preventDefault(); destination.classList.add('sp-cp-drag-over'); } });
            destination.addEventListener('dragleave', () => destination.classList.remove('sp-cp-drag-over'));
            destination.addEventListener('drop', event => {
                event.preventDefault(); destination.classList.remove('sp-cp-drag-over');
                const source = state.customDrag; state.customDrag = null;
                const sourcePanel = customPanelAt(source?.panel), targetPanel = customPanelAt(destination.dataset.customDropPanel);
                if (!sourcePanel || !targetPanel || !Number.isInteger(source?.field)) return;
                const [field] = sourcePanel.fields.splice(source.field, 1); if (!field) return;
                let targetIndex = Number(destination.dataset.customDropField);
                if (sourcePanel === targetPanel && source.field < targetIndex) targetIndex--;
                targetPanel.fields.splice(Math.max(0, targetIndex), 0, field);
                state.activeCustomPanel = Number(destination.dataset.customDropPanel);
                scheduleViewPreferenceSave(); rerender();
            });
        });
        const panel = host.querySelector('#sp-thought-panel'); const drag = panel?.querySelector('[data-drag-handle]'); const resize = panel?.querySelector('[data-resize-handle]');
        if (drag && panel) {
            let moving = null; drag.addEventListener('pointerdown', event => { if (event.target.closest('button')) return; moving = { x: event.clientX - panel.offsetLeft, y: event.clientY - panel.offsetTop }; drag.setPointerCapture(event.pointerId); });
            drag.addEventListener('pointermove', event => { if (!moving) return; state.thoughtSnap = false; state.thoughtX = Math.max(0, event.clientX - moving.x); state.thoughtY = Math.max(0, event.clientY - moving.y); panel.style.left = `${state.thoughtX}px`; panel.style.top = `${state.thoughtY}px`; });
            drag.addEventListener('pointerup', () => { moving = null; scheduleViewPreferenceSave(); });
        }
        if (resize && panel) {
            let sizing = null; resize.addEventListener('pointerdown', event => { sizing = { x: event.clientX, y: event.clientY, width: panel.offsetWidth, height: panel.offsetHeight }; resize.setPointerCapture(event.pointerId); });
            resize.addEventListener('pointermove', event => { if (!sizing) return; state.thoughtWidth = Math.max(220, sizing.width + event.clientX - sizing.x); state.thoughtHeight = Math.max(160, sizing.height + event.clientY - sizing.y); panel.style.width = `${state.thoughtWidth}px`; panel.style.height = `${state.thoughtHeight}px`; });
            resize.addEventListener('pointerup', () => { sizing = null; scheduleViewPreferenceSave(); });
        }
    }
    function mount(host, accepted) {
        let state = host.__scenePulseWorldsState;
        if (!state || state.accepted?.id !== accepted?.id) { state = createState(accepted); host.__scenePulseWorldsState = state; }
        else if (state.mode === 'accepted_live') {
            // A host redraw can refresh snapshot metadata without changing the
            // current accepted snapshot ID. Preserve a user's historical
            // selection when it still exists; otherwise return them safely to
            // current rather than rendering stale cached fields.
            state.accepted = accepted;
            state.history = Array.isArray(accepted.history) ? clone(accepted.history) : [];
            state.appliedPresetId = String(accepted.readerPreset?.id || state.appliedPresetId || '');
            applyHistorySelection(state, state.selectedTimeline);
        }
        if (!state.viewportListener) {
            state.viewportListener = () => {
                clearTimeout(state.viewportTimer);
                state.viewportTimer = setTimeout(() => state.rerender?.(), 80);
            };
            global.addEventListener('resize', state.viewportListener, { passive: true });
        }
        hydrateSourceProfileAssets(state); hydrateSourcePresets(state); hydrateDashboardAssets(state); render(host, state); return state;
    }
    function unmount(host) {
        const root = document.getElementById(OVERLAY_ROOT_ID); if (root?.dataset.owner === 'scenepulse-worlds') root.replaceChildren();
        const effects = document.getElementById(EFFECTS_ROOT_ID); if (effects?.dataset.owner === 'scenepulse-worlds') effects.replaceChildren();
        const state = host?.__scenePulseWorldsState;
        if (state?.viewportListener) global.removeEventListener('resize', state.viewportListener);
        if (state?.viewportTimer) clearTimeout(state.viewportTimer);
        if (host) delete host.__scenePulseWorldsState;
    }
    global.ExperimentalWorldsScenePulse = Object.freeze({ mount, unmount, SOURCE, TOUR_TIMELINE });
})(window);
