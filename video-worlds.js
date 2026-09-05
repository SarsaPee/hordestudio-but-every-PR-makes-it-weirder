(function () {
    'use strict';

    const VIDEO_WORLD_VERSION = 3;
    const DEFAULT_DIRECTOR_MODEL = 'google/gemma-4-31b-it';
    const RESOLUTIONS = new Set(['480P', '768P']);
    const DURATIONS = new Set([5, 10, 15]);
    const ASPECTS = new Set(['21:9', '16:9', '4:3', '1:1', '3:4', '9:16']);
    const VIEWPOINTS = new Set(['third_person', 'first_person']);
    const VIDEO_RENDERERS = new Set(['minimax/h3-max', 'alibaba/wan-3.0', 'alibaba/wan-3.0-prime', 'fal-ai/ltx-2.3/fast']);
    const VIDEO_RENDERER_LABELS = Object.freeze({
        'minimax/h3-max': 'H3 Max',
        'alibaba/wan-3.0': 'Wan 3.0',
        'alibaba/wan-3.0-prime': 'Wan 3.0 Prime',
        'fal-ai/ltx-2.3/fast': 'LTX-2.3 Fast'
    });
    const VISUAL_PRESETS = [
        ['adult_2d', '2D adult animation', 'Bold adult television animation, graphic shapes, expressive acting, clean linework and limited but intentional motion.'],
        ['anime_2d', '2D anime', 'High-quality hand-drawn anime, expressive faces, cinematic composition, dynamic lighting and consistent character designs.'],
        ['claymation', 'Claymation', 'Handcrafted stop-motion clay animation, tactile sets, visible material texture and charming frame-by-frame movement.'],
        ['cinema_digital', 'High-budget film', 'Prestige live-action feature film shot on a digital cinema camera, cinematic lenses, controlled lighting and polished production design.'],
        ['sitcom_handheld', 'Handheld TV sitcom', 'Fast handheld single-camera television comedy, practical locations, natural lighting and reactive camera work.'],
        ['sitcom_stage', 'Studio sitcom', 'Multi-camera soundstage sitcom with warm set lighting, theatrical blocking and a lived-in ensemble set.'],
        ['documentary', 'Documentary', 'Observational documentary realism, available light, restrained camera movement and authentic environments.'],
        ['storybook', 'Illustrated storybook', 'Painterly illustrated storybook brought to life with layered depth, gentle movement and cohesive hand-painted design.'],
        ['retro_game', 'Retro game cinematic', 'Stylized late-1990s 3D game cinematic, deliberate low-poly forms, dramatic lighting and nostalgic texture work.'],
        ['custom', 'Custom look', 'Use the optional visual details below as the primary art direction.']
    ];
    let setupComplete = false;
    let generationToken = 0;
    let videoGenerationController = null;
    let generationClock = null;
    let generationStartedAt = 0;
    let generationPhase = '';
    const directorChoiceRequests = new Set();
    const resumedVideoJobs = new Set();

    const byId = id => document.getElementById(id);
    const html = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
    const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const clamp = (value, minimum, maximum, fallback) => {
        const number = Number(value);
        return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
    };
    const safeImage = value => /^data:image\/(?:jpeg|png|webp);base64,/i.test(String(value || ''))
        ? String(value).slice(0, 8 * 1024 * 1024) : '';

    function normalizeCharacter(source = {}) {
        return {
            id: String(source.id || uid('video_character')).slice(0, 100),
            name: String(source.name || '').trim().slice(0, 120),
            role: String(source.role || '').trim().slice(0, 240),
            personality: String(source.personality || '').trim().slice(0, 2000),
            appearance: String(source.appearance || '').trim().slice(0, 2000),
            referenceImage: safeImage(source.referenceImage)
        };
    }

    function normalizeWorld(source = {}) {
        const storedVersion = Number(source.version) || 0;
        return {
            version: VIDEO_WORLD_VERSION,
            id: String(source.id || uid('video_world')).slice(0, 100),
            name: String(source.name || 'Untitled Video Adventure').trim().slice(0, 120),
            tagline: String(source.tagline || '').trim().slice(0, 240),
            premise: String(source.premise || '').trim().slice(0, 4000),
            storyRules: String(source.storyRules || '').trim().slice(0, 4000),
            visualPreset: VISUAL_PRESETS.some(item => item[0] === source.visualPreset) ? source.visualPreset : 'cinema_digital',
            visualStyle: String(source.visualStyle || '').trim().slice(0, 4000),
            viewpoint: VIEWPOINTS.has(source.viewpoint) ? source.viewpoint : 'third_person',
            playerDescription: String(source.playerDescription || '').trim().slice(0, 3000),
            playerReferenceImage: safeImage(source.playerReferenceImage),
            characters: Array.isArray(source.characters) ? source.characters.slice(0, 40).map(normalizeCharacter).filter(item => item.name) : [],
            directorModel: String(source.directorModel || DEFAULT_DIRECTOR_MODEL).trim().slice(0, 500),
            openingShot: String(source.openingShot || '').trim().slice(0, 6000),
            resolution: RESOLUTIONS.has(source.resolution) ? source.resolution : '480P',
            duration: DURATIONS.has(Number(source.duration)) ? Number(source.duration) : 5,
            aspectRatio: ASPECTS.has(source.aspectRatio) ? source.aspectRatio : '16:9',
            falSafetyChecker: source.falSafetyChecker !== false,
            rendererPrimary: VIDEO_RENDERERS.has(source.rendererPrimary) ? source.rendererPrimary : 'minimax/h3-max',
            rendererFallback: source.rendererFallback === '' ? ''
                : VIDEO_RENDERERS.has(source.rendererFallback) ? source.rendererFallback : 'alibaba/wan-3.0',
            // v3 gives existing adventures a second resilience fallback. After
            // migration, an explicitly empty selection continues to mean None.
            rendererFallback2: source.rendererFallback2 === '' && storedVersion >= 3 ? ''
                : VIDEO_RENDERERS.has(source.rendererFallback2) ? source.rendererFallback2 : 'fal-ai/ltx-2.3/fast',
            sessionBudget: clamp(source.sessionBudget, 0.1, 10000, 5),
            createdAt: Number(source.createdAt) || Date.now(),
            updatedAt: Number(source.updatedAt) || Date.now()
        };
    }

    function normalizeShot(source = {}) {
        return {
            id: String(source.id || uid('video_shot')).slice(0, 100),
            index: Math.max(1, parseInt(source.index) || 1),
            action: String(source.action || '').slice(0, 3000),
            sceneSummary: String(source.sceneSummary || '').slice(0, 3000),
            directorPlan: source.directorPlan && typeof source.directorPlan === 'object' ? source.directorPlan : null,
            prompt: String(source.prompt || '').slice(0, 12000),
            mediaId: /^[a-f0-9]{32}$/.test(String(source.mediaId || '')) ? String(source.mediaId) : '',
            mediaPath: String(source.mediaPath || '').slice(0, 200),
            requestId: String(source.requestId || '').slice(0, 200),
            model: String(source.model || 'minimax/h3-max/text-to-video').slice(0, 200),
            resolution: RESOLUTIONS.has(source.resolution) ? source.resolution : '480P',
            duration: DURATIONS.has(Number(source.duration)) ? Number(source.duration) : 5,
            seed: Number(source.seed) || 0,
            cost: clamp(source.cost, 0, 10000, 0),
            inferenceSeconds: clamp(source.inferenceSeconds, 0, 3600, 0),
            createdAt: Number(source.createdAt) || Date.now(),
            continuityCaptured: source.continuityCaptured === true
        };
    }

    function normalizeSession(source = {}, index = 0) {
        const shots = Array.isArray(source.shots) ? source.shots.slice(0, 5000).map(normalizeShot) : [];
        const shotIds = new Set(shots.map(shot => shot.id));
        return {
            version: VIDEO_WORLD_VERSION,
            id: String(source.id || uid('video_run')).slice(0, 100),
            name: String(source.name || `Take ${index + 1}`).trim().slice(0, 120),
            createdAt: Number(source.createdAt) || Date.now(),
            updatedAt: Number(source.updatedAt) || Date.now(),
            shots,
            storyState: source.storyState && typeof source.storyState === 'object' ? source.storyState : { facts: [], relationships: [], threads: [] },
            directorChoices: Array.isArray(source.directorChoices) ? source.directorChoices.slice(0, 4) : [],
            playingShotId: shotIds.has(source.playingShotId) ? source.playingShotId : shots[shots.length - 1]?.id || '',
            queuedShotId: shotIds.has(source.queuedShotId) ? source.queuedShotId : '',
            pendingDirectorPlan: source.pendingDirectorPlan && typeof source.pendingDirectorPlan === 'object' ? source.pendingDirectorPlan : null,
            pendingVideoJob: source.pendingVideoJob && typeof source.pendingVideoJob === 'object'
                ? {
                    jobId: String(source.pendingVideoJob.jobId || '').slice(0, 100),
                    action: String(source.pendingVideoJob.action || '').slice(0, 3000),
                    prompt: String(source.pendingVideoJob.prompt || '').slice(0, 12000),
                    plan: source.pendingVideoJob.plan && typeof source.pendingVideoJob.plan === 'object' ? source.pendingVideoJob.plan : null,
                    cost: clamp(source.pendingVideoJob.cost, 0, 10000, 0),
                    transitionFrame: safeImage(source.pendingVideoJob.transitionFrame),
                    createdAt: Number(source.pendingVideoJob.createdAt) || Date.now()
                } : null,
            spent: shots.reduce((sum, shot) => sum + (Number(shot.cost) || 0), 0),
            lastFrame: /^data:image\/(?:jpeg|png|webp);base64,/i.test(String(source.lastFrame || ''))
                ? String(source.lastFrame).slice(0, 12 * 1024 * 1024) : ''
        };
    }

    function ensureState() {
        state.videoWorlds = Array.isArray(state.videoWorlds) ? state.videoWorlds.map(normalizeWorld) : [];
        state.videoWorldSessions = state.videoWorldSessions && typeof state.videoWorldSessions === 'object'
            && !Array.isArray(state.videoWorldSessions) ? state.videoWorldSessions : {};
        for (const world of state.videoWorlds) {
            const raw = state.videoWorldSessions[world.id] || {};
            const sessions = Array.isArray(raw.sessions)
                ? raw.sessions.slice(0, 1000).map((session, index) => normalizeSession(session, index)) : [];
            const activeExists = sessions.some(session => session.id === raw.activeSessionId);
            state.videoWorldSessions[world.id] = {
                activeSessionId: activeExists ? raw.activeSessionId : sessions[0]?.id || null,
                sessions
            };
        }
        if (!state.videoWorlds.some(world => world.id === state.activeVideoWorldId)) {
            state.activeVideoWorldId = state.videoWorlds[0]?.id || null;
        }
        state.editingVideoWorldId = state.videoWorlds.some(world => world.id === state.editingVideoWorldId)
            ? state.editingVideoWorldId : null;
    }

    function activeWorld() {
        return state.videoWorlds.find(world => world.id === state.activeVideoWorldId) || null;
    }

    function sessionStore(worldId) {
        const store = state.videoWorldSessions[worldId] ||= { activeSessionId: null, sessions: [] };
        if (!Array.isArray(store.sessions)) store.sessions = [];
        return store;
    }

    function activeSession(world, create = true) {
        if (!world) return null;
        const store = sessionStore(world.id);
        let session = store.sessions.find(item => item.id === store.activeSessionId);
        if (!session && create) {
            session = normalizeSession({ name: `Take ${store.sessions.length + 1}` }, store.sessions.length);
            store.sessions.unshift(session);
            store.activeSessionId = session.id;
        }
        return session || null;
    }

    function rateFor(resolution) {
        const key = resolution === '768P' ? 'falRate768' : 'falRate480';
        const fallback = resolution === '768P' ? 0.08 : 0.05;
        return clamp(state.globalSettings?.[key], 0, 100, fallback);
    }

    function rendererRate(renderer, resolution) {
        if (renderer === 'alibaba/wan-3.0') return resolution === '768P' ? 0.10 : 0.05;
        if (renderer === 'alibaba/wan-3.0-prime') return resolution === '768P' ? 0.14 : 0.068;
        if (renderer === 'fal-ai/ltx-2.3/fast') return 0.06;
        return rateFor(resolution);
    }

    function rendererChain(world) {
        return [world.rendererPrimary, world.rendererFallback, world.rendererFallback2]
            .filter((renderer, index, list) => VIDEO_RENDERERS.has(renderer) && list.indexOf(renderer) === index);
    }

    function rendererDuration(renderer, duration) {
        const requested = clamp(duration, 1, 30, 5);
        if (renderer !== 'fal-ai/ltx-2.3/fast') return requested;
        return [6, 8, 10, 12, 14, 16, 18, 20]
            .reduce((nearest, option) => Math.abs(option - requested) < Math.abs(nearest - requested) ? option : nearest, 6);
    }

    function rendererFamily(model) {
        const value = String(model || '');
        if (value.includes('ltx-2.3/') && value.endsWith('/fast')) return 'fal-ai/ltx-2.3/fast';
        return Object.keys(VIDEO_RENDERER_LABELS).find(renderer => value.startsWith(renderer)) || '';
    }

    function shotCost(world) {
        return Math.max(...rendererChain(world).map(renderer => rendererDuration(renderer, world.duration) * rendererRate(renderer, world.resolution)));
    }

    function money(value) {
        return `$${(Number(value) || 0).toFixed(3).replace(/0+$/, '').replace(/\.$/, '.00')}`;
    }

    function mediaUrl(shot) {
        if (!shot?.mediaId) return '';
        return `${mcpBridgeBase()}/video-world-media/${encodeURIComponent(shot.mediaId)}.mp4`;
    }

    function renderLibrary() {
        ensureState();
        const grid = byId('video-world-grid');
        if (!grid) return;
        if (!state.videoWorlds.length) {
            grid.innerHTML = `<div class="video-world-empty-library"><span>🎬</span><h2>Create your first playable film</h2><p>Video Adventures are independent cinematic role-playing experiences. Define the story, cast and visual language, then play one continuity-linked scene at a time.</p><button class="btn btn-primary" data-video-world-create type="button">Create Video Adventure</button></div>`;
        } else {
            grid.innerHTML = state.videoWorlds.map(world => {
                const store = sessionStore(world.id);
                const shots = store.sessions.reduce((sum, session) => sum + (session.shots?.length || 0), 0);
                return `<article class="char-card video-world-card" data-video-world-id="${html(world.id)}">
                    <div class="video-world-card-art"><span>▶</span><small>${html(world.aspectRatio)} · ${html(world.resolution.replace('P', 'p'))}</small></div>
                    <div class="char-card-body"><h3>${html(world.name)}</h3><p>${html(world.tagline || world.premise || 'A playable generated film.')}</p><div class="video-world-card-meta"><span>${store.sessions.length} timeline${store.sessions.length === 1 ? '' : 's'}</span><span>${shots} shot${shots === 1 ? '' : 's'}</span></div></div>
                    <div class="char-card-actions"><button class="btn btn-primary btn-small" data-video-world-play type="button">Play</button><button class="btn btn-ghost btn-small" data-video-world-edit type="button">Edit</button></div>
                </article>`;
            }).join('');
        }
        grid.querySelectorAll('[data-video-world-create]').forEach(button => button.onclick = openNewEditor);
        grid.querySelectorAll('[data-video-world-id]').forEach(card => {
            const id = card.dataset.videoWorldId;
            card.querySelector('[data-video-world-play]').onclick = event => { event.stopPropagation(); openPlay(id); };
            card.querySelector('[data-video-world-edit]').onclick = event => { event.stopPropagation(); openEditor(id); };
        });
    }

    function editorWorld() {
        return state.videoWorlds.find(world => world.id === state.editingVideoWorldId) || null;
    }

    function selectButtonValue(containerId, value) {
        const container = byId(containerId);
        if (!container) return;
        container.dataset.value = value;
        container.querySelectorAll('[data-value]').forEach(button => {
            const active = button.dataset.value === value;
            button.classList.toggle('active', active);
            button.setAttribute('aria-checked', String(active));
        });
    }

    function renderStylePresets(selected = 'cinema_digital') {
        const container = byId('video-world-style-presets');
        container.innerHTML = VISUAL_PRESETS.map(([id, label, description]) => `<button type="button" data-value="${html(id)}" role="radio"><strong>${html(label)}</strong><small>${html(description)}</small></button>`).join('');
        container.querySelectorAll('[data-value]').forEach(button => button.onclick = () => selectButtonValue('video-world-style-presets', button.dataset.value));
        selectButtonValue('video-world-style-presets', selected);
    }

    function characterCard(character = {}) {
        const item = normalizeCharacter(character);
        return `<article class="video-world-character-card" data-character-id="${html(item.id)}">
            <div class="video-world-character-reference">${item.referenceImage ? `<img src="${html(item.referenceImage)}" alt="">` : '<span>No image</span>'}<input type="file" accept="image/png,image/jpeg,image/webp" data-character-image></div>
            <div class="video-world-character-fields"><label class="form-field"><span>Name</span><input class="form-input" data-character-name maxlength="120" value="${html(item.name)}" placeholder="Martha Cole"></label><label class="form-field"><span>Role in the story</span><input class="form-input" data-character-role maxlength="240" value="${html(item.role)}" placeholder="Ranch owner and reluctant mentor"></label><label class="form-field"><span>Personality and voice</span><textarea class="form-textarea" data-character-personality rows="2" maxlength="2000" placeholder="Guarded, dry humor; speaks plainly...">${html(item.personality)}</textarea></label><label class="form-field"><span>Consistent appearance</span><textarea class="form-textarea" data-character-appearance rows="2" maxlength="2000" placeholder="Age, face, hair, body, signature wardrobe...">${html(item.appearance)}</textarea></label></div>
            <button class="video-world-character-remove" type="button" aria-label="Remove character">×</button>
        </article>`;
    }

    function bindImageInput(input, target, onReady) {
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            if (!/^image\/(?:jpeg|png|webp)$/i.test(file.type) || file.size > 6 * 1024 * 1024) return showToast('Use a JPEG, PNG or WebP image smaller than 6 MB.', 'error');
            const reader = new FileReader();
            reader.onload = () => {
                const data = safeImage(reader.result);
                if (!data) return showToast('That image could not be read.', 'error');
                onReady(data);
                if (target.contains(input)) {
                    target.querySelectorAll('img, span').forEach(item => item.remove());
                    input.insertAdjacentHTML('beforebegin', `<img src="${html(data)}" alt="Reference preview">`);
                } else target.innerHTML = `<img src="${html(data)}" alt="Reference preview">`;
            };
            reader.readAsDataURL(file);
        };
    }

    function bindCharacterCard(card) {
        card.querySelector('.video-world-character-remove').onclick = () => card.remove();
        const target = card.querySelector('.video-world-character-reference');
        const input = card.querySelector('[data-character-image]');
        bindImageInput(input, target, data => { card.dataset.referenceImage = data; });
    }

    function renderCharacters(characters = []) {
        const container = byId('video-world-characters');
        container.innerHTML = characters.map(characterCard).join('');
        container.querySelectorAll('.video-world-character-card').forEach((card, index) => {
            card.dataset.referenceImage = characters[index]?.referenceImage || '';
            bindCharacterCard(card);
        });
    }

    function readCharacters() {
        return [...byId('video-world-characters').querySelectorAll('.video-world-character-card')].map(card => normalizeCharacter({
            id: card.dataset.characterId,
            name: card.querySelector('[data-character-name]').value,
            role: card.querySelector('[data-character-role]').value,
            personality: card.querySelector('[data-character-personality]').value,
            appearance: card.querySelector('[data-character-appearance]').value,
            referenceImage: card.dataset.referenceImage
        })).filter(character => character.name);
    }

    function populateEditor(world = null) {
        const value = world || normalizeWorld({ name: '', tagline: '', premise: '', visualStyle: '', openingShot: '' });
        byId('video-world-studio-title').textContent = world ? `Edit ${world.name}` : 'Create Video Adventure';
        byId('video-world-name').value = world?.name || '';
        byId('video-world-tagline').value = value.tagline;
        byId('video-world-premise').value = value.premise;
        byId('video-world-story-rules').value = value.storyRules;
        renderStylePresets(value.visualPreset);
        byId('video-world-style').value = value.visualStyle;
        selectButtonValue('video-world-viewpoint', value.viewpoint);
        byId('video-world-player-description').value = value.playerDescription;
        const playerPreview = byId('video-world-player-reference-preview');
        playerPreview.dataset.image = value.playerReferenceImage;
        playerPreview.innerHTML = value.playerReferenceImage ? `<img src="${html(value.playerReferenceImage)}" alt="Player reference preview">` : '<span>No player reference added</span>';
        renderCharacters(value.characters);
        byId('video-world-opening').value = value.openingShot;
        byId('video-world-resolution').value = value.resolution;
        byId('video-world-duration').value = String(value.duration);
        byId('video-world-aspect').value = value.aspectRatio;
        byId('video-world-safety-checker').checked = state.globalSettings?.falSafetyChecker !== false
            && value.falSafetyChecker !== false;
        byId('video-world-renderer-primary').value = value.rendererPrimary;
        byId('video-world-renderer-fallback').value = value.rendererFallback === value.rendererPrimary ? '' : value.rendererFallback;
        byId('video-world-renderer-fallback-2').value = [value.rendererPrimary, value.rendererFallback].includes(value.rendererFallback2) ? '' : value.rendererFallback2;
        byId('video-world-budget').value = value.sessionBudget.toFixed(2);
        byId('video-world-director-model').value = value.directorModel || DEFAULT_DIRECTOR_MODEL;
        byId('video-world-director-status').textContent = `Provider: ${typeof cloudProviderName === 'function' ? cloudProviderName() : state.globalSettings?.apiProvider || 'default'} · Not tested`;
        byId('delete-video-world-btn').classList.toggle('hidden', !world);
        updateEditorCost();
    }

    function openNewEditor() {
        state.editingVideoWorldId = null;
        populateEditor(null);
        switchView('videoWorldStudio');
    }

    function openEditor(id) {
        const world = state.videoWorlds.find(item => item.id === id);
        if (!world) return;
        state.editingVideoWorldId = world.id;
        populateEditor(world);
        switchView('videoWorldStudio');
    }

    function readEditor() {
        const existing = editorWorld();
        return normalizeWorld({
            ...(existing || {}),
            version: VIDEO_WORLD_VERSION,
            name: byId('video-world-name').value,
            tagline: byId('video-world-tagline').value,
            premise: byId('video-world-premise').value,
            storyRules: byId('video-world-story-rules').value,
            visualPreset: byId('video-world-style-presets').dataset.value,
            visualStyle: byId('video-world-style').value,
            viewpoint: byId('video-world-viewpoint').dataset.value,
            playerDescription: byId('video-world-player-description').value,
            playerReferenceImage: byId('video-world-player-reference-preview').dataset.image,
            characters: readCharacters(),
            openingShot: byId('video-world-opening').value,
            resolution: byId('video-world-resolution').value,
            duration: Number(byId('video-world-duration').value),
            aspectRatio: byId('video-world-aspect').value,
            falSafetyChecker: byId('video-world-safety-checker').checked,
            rendererPrimary: byId('video-world-renderer-primary').value,
            rendererFallback: byId('video-world-renderer-fallback').value,
            rendererFallback2: byId('video-world-renderer-fallback-2').value,
            sessionBudget: Number(byId('video-world-budget').value),
            directorModel: byId('video-world-director-model').value,
            updatedAt: Date.now()
        });
    }

    function updateEditorCost() {
        const resolution = byId('video-world-resolution')?.value || '480P';
        const duration = Number(byId('video-world-duration')?.value) || 5;
        const primary = byId('video-world-renderer-primary')?.value || 'minimax/h3-max';
        const fallback = byId('video-world-renderer-fallback')?.value || '';
        const fallback2 = byId('video-world-renderer-fallback-2')?.value || '';
        const chain = [primary, fallback, fallback2].filter((item, index, list) => VIDEO_RENDERERS.has(item) && list.indexOf(item) === index);
        const estimates = chain.map(renderer => ({
            renderer,
            duration: rendererDuration(renderer, duration),
            cost: rendererDuration(renderer, duration) * rendererRate(renderer, resolution)
        }));
        const maximum = Math.max(...estimates.map(item => item.cost));
        const target = byId('video-world-cost-preview');
        if (target) target.innerHTML = `<span>Reserved shot budget</span><strong>${money(maximum)}</strong><small>${estimates.map(item => `${VIDEO_RENDERER_LABELS[item.renderer]} ${item.duration}s ${money(item.cost)}`).join(' · ')}. Only the renderer that completes is recorded; an upstream failed request may still be billable by Fal.</small>`;
        const note = byId('video-world-renderer-note');
        if (note) note.textContent = `Renderers: Fal · ${chain.map(renderer => VIDEO_RENDERER_LABELS[renderer]).join(' → ')}`;
    }

    async function saveEditor() {
        const world = readEditor();
        if (!world.name || ['Untitled Video World', 'Untitled Video Adventure'].includes(world.name)) return showToast('Name your Video Adventure first.', 'error');
        if (!world.premise) return showToast('Add a premise and player role.', 'error');
        if (!world.openingShot) return showToast('Describe the opening shot.', 'error');
        const existingIndex = state.videoWorlds.findIndex(item => item.id === state.editingVideoWorldId);
        if (existingIndex >= 0) state.videoWorlds[existingIndex] = world;
        else state.videoWorlds.unshift(world);
        state.activeVideoWorldId = world.id;
        state.editingVideoWorldId = world.id;
        sessionStore(world.id);
        await saveState();
        showToast(existingIndex >= 0 ? 'Video Adventure saved.' : 'Video Adventure created.', 'success');
        openPlay(world.id);
    }

    async function testEditorDirector() {
        const button = byId('video-world-test-director');
        const status = byId('video-world-director-status');
        const world = readEditor();
        if (!world.directorModel) {
            status.textContent = 'Choose a Director model first.';
            return;
        }
        const controller = new AbortController();
        const deadline = setTimeout(() => controller.abort(), 20000);
        const startedAt = performance.now();
        button.disabled = true;
        status.textContent = 'Testing story planning…';
        try {
            const session = normalizeSession({});
            const plan = await requestDirectorPlan(world, session, '', { signal: controller.signal });
            const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
            status.textContent = `Ready in ${elapsed}s · ${plan.choices.length} contextual choices`;
            showToast('World Director is ready.', 'success');
        } catch (error) {
            status.textContent = controller.signal.aborted
                ? 'Timed out after 20s — choose a faster model or check the provider.'
                : `Failed: ${error.message || 'Director request failed'}`;
        } finally {
            clearTimeout(deadline);
            button.disabled = false;
        }
    }

    async function deleteEditorWorld() {
        const world = editorWorld();
        if (!world) return;
        const store = sessionStore(world.id);
        const mediaIds = store.sessions.flatMap(session => session.shots || []).map(shot => shot.mediaId).filter(Boolean);
        showConfirmModal('Delete Video Adventure', `Delete “${world.name}” and its ${mediaIds.length} locally saved clip${mediaIds.length === 1 ? '' : 's'}? This cannot be undone.`, async () => {
            generationToken++;
            state.videoWorlds = state.videoWorlds.filter(item => item.id !== world.id);
            delete state.videoWorldSessions[world.id];
            if (state.activeVideoWorldId === world.id) state.activeVideoWorldId = state.videoWorlds[0]?.id || null;
            state.editingVideoWorldId = null;
            await saveState();
            if (mediaIds.length) {
                void mcpBridgeRequest('/fal/video/delete', { method: 'POST', body: { mediaIds }, timeoutMs: 30000 }).catch(error => console.warn('Could not remove Video Adventure media:', error));
            }
            switchView('videoWorlds');
            showToast('Video Adventure deleted.', 'success');
        }, 'Delete Video Adventure', 'Cancel');
    }

    function openPlay(id) {
        const world = state.videoWorlds.find(item => item.id === id);
        if (!world) return;
        state.activeVideoWorldId = world.id;
        activeSession(world, true);
        saveState().catch(error => console.error('Could not save active Video Adventure:', error));
        renderPlay();
        switchView('videoWorldPlay');
    }

    function renderPlay() {
        const world = activeWorld();
        const session = activeSession(world, false);
        if (!world || !session) {
            switchView('videoWorlds');
            return;
        }
        byId('video-world-play-title').textContent = world.name;
        byId('video-world-play-tagline').textContent = world.tagline || world.premise;
        const store = sessionStore(world.id);
        const runSelect = byId('video-world-run-name');
        runSelect.innerHTML = store.sessions.map(item => `<option value="${html(item.id)}">${html(item.name)}</option>`).join('');
        runSelect.value = session.id;
        byId('video-world-run-spend').textContent = `${money(session.spent)} / ${money(world.sessionBudget)}`;
        byId('video-world-next-cost').textContent = `Estimated shot: ${money(shotCost(world))}`;
        const isOpening = session.shots.length === 0;
        byId('video-world-action-label').textContent = isOpening ? 'Opening shot' : 'Choose your next beat';
        byId('video-world-generate').textContent = isOpening ? 'Film opening' : 'Generate next shot';
        byId('video-world-action').placeholder = isOpening
            ? 'Optional: add one detail to the authored opening shot…'
            : 'Describe what you attempt or what should happen next…';
        renderActionChoices(world, session);
        if (session.pendingVideoJob?.jobId) void resumeVideoJob(world, session);
        if (session.shots.length && !session.directorChoices.length) void ensureDirectorChoices(world, session);

        let current = session.shots.find(shot => shot.id === session.playingShotId) || session.shots[session.shots.length - 1];
        if (current && !session.playingShotId) session.playingShotId = current.id;
        const player = byId('video-world-player');
        byId('video-world-stage').classList.toggle('has-footage', !!current);
        byId('video-world-stage-empty').classList.toggle('hidden', !!current);
        player.classList.toggle('hidden', !current);
        if (current) {
            const url = mediaUrl(current);
            if (player.dataset.mediaId !== current.mediaId) {
                player.dataset.mediaId = current.mediaId;
                if (session.transitionFrame) player.poster = session.transitionFrame;
                player.src = url;
                player.load();
                player.onloadeddata = () => {
                    player.removeAttribute('poster');
                    session.transitionFrame = '';
                };
            }
        } else {
            player.removeAttribute('src');
            player.dataset.mediaId = '';
            player.load();
        }
        const queued = session.shots.find(shot => shot.id === session.queuedShotId);
        const preloader = byId('video-world-preloader');
        if (queued && preloader.dataset.mediaId !== queued.mediaId) {
            preloader.dataset.mediaId = queued.mediaId;
            preloader.src = mediaUrl(queued);
            preloader.load();
        } else if (!queued && preloader.dataset.mediaId) {
            preloader.removeAttribute('src');
            preloader.dataset.mediaId = '';
            preloader.load();
        }

        const timeline = byId('video-world-timeline');
        timeline.innerHTML = session.shots.length ? [...session.shots].reverse().map(shot => `
            <button class="video-world-shot-card${shot.id === current?.id ? ' active' : ''}" data-video-shot-id="${html(shot.id)}" type="button">
                <span>${String(shot.index).padStart(2, '0')}</span><div><strong>${html(shot.index === 1 ? 'Opening shot' : shot.action || 'Generated beat')}</strong><small>${shot.duration}s · ${html(shot.resolution.replace('P', 'p'))} · ${money(shot.cost)}${shot.continuityCaptured ? ' · chained' : ''}</small></div>
            </button>`).join('') : '<div class="video-world-empty-timeline"><strong>No footage yet</strong><span>Film the opening to begin this timeline.</span></div>';
        timeline.querySelectorAll('[data-video-shot-id]').forEach(button => {
            button.onclick = () => {
                const shot = session.shots.find(item => item.id === button.dataset.videoShotId);
                if (!shot) return;
                player.dataset.mediaId = shot.mediaId;
                player.src = mediaUrl(shot);
                player.load();
                player.play().catch(() => {});
                timeline.querySelectorAll('.video-world-shot-card').forEach(card => card.classList.toggle('active', card === button));
            };
        });
    }

    function renderActionChoices(world, session) {
        const container = byId('video-world-choices');
        const input = byId('video-world-action');
        if (!container || !input) return;
        const isOpening = !session.shots.length;
        container.classList.toggle('hidden', isOpening);
        if (isOpening) {
            input.classList.remove('hidden');
            input.dataset.customAction = '';
            return;
        }
        if (session.queuedShotId) {
            container.innerHTML = '<div class="video-world-choice-status"><strong>Continuation ready</strong><small>Finishing the current scene before the story advances…</small></div>';
            input.classList.add('hidden');
            return;
        }
        const options = Array.isArray(session.directorChoices) ? session.directorChoices : [];
        container.innerHTML = options.length
            ? options.map(option => `<button type="button" data-video-world-choice="${html(option.action)}"><strong>${html(option.label)}</strong><small>${html(option.consequenceHint || option.action)}</small></button>`).join('') + '<button type="button" class="video-world-custom-choice" data-video-world-custom>Write my own…</button>'
            : '<div class="video-world-choice-status"><strong>Director is preparing this scene…</strong><small>Story-aware choices will appear here.</small></div>';
        input.classList.toggle('hidden', input.dataset.customAction !== 'true');
        container.querySelectorAll('[data-video-world-choice]').forEach(button => {
            button.onclick = () => {
                input.value = button.dataset.videoWorldChoice || '';
                input.dataset.customAction = '';
                input.classList.add('hidden');
                container.querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
                queueMicrotask(() => generateShot());
            };
        });
        const custom = container.querySelector('[data-video-world-custom]');
        if (custom) custom.onclick = () => {
            input.value = '';
            input.dataset.customAction = 'true';
            input.classList.remove('hidden');
            container.querySelectorAll('button').forEach(item => item.classList.remove('active'));
            input.focus();
        };
    }

    function extractJson(text) {
        const cleaned = String(text || '').trim()
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        try { return JSON.parse(cleaned); } catch (_) {
            const repaired = typeof safeParseJSONRepair === 'function' ? safeParseJSONRepair(cleaned) : null;
            if (repaired && typeof repaired === 'object' && !Array.isArray(repaired)) return repaired;
            if (typeof extractJSON === 'function') {
                try {
                    const extracted = extractJSON(cleaned);
                    if (extracted && typeof extracted === 'object' && !Array.isArray(extracted)) return extracted;
                } catch (_) {}
            }
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            if (start >= 0 && end > start) {
                try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (_) {}
            }
            throw new Error('The Director returned an invalid story plan.');
        }
    }

    function directorMessageText(payload) {
        const content = payload?.choices?.[0]?.message?.content ?? payload?.output_text ?? '';
        if (Array.isArray(content)) return content.map(part => typeof part === 'string' ? part : part?.text || '').join('\n').trim();
        return String(content || '').trim();
    }

    async function fetchDirectorPayload(body, signal) {
        const call = requestBody => fetch(apiBase() + '/chat/completions', {
            method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json', ...attributionHeaders() },
            body: JSON.stringify(requestBody), signal
        });
        let response = await call(body);
        if (!response.ok) {
            const detail = await response.text();
            if (body.response_format && /response_format|json_object|json mode|not support|expected.*json/i.test(detail)) {
                const compatible = { ...body };
                delete compatible.response_format;
                response = await call(compatible);
                if (!response.ok) throw new Error(`World Director failed (${response.status}): ${(await response.text()).slice(0, 240)}`);
            } else {
                throw new Error(`World Director failed (${response.status}): ${detail.slice(0, 240)}`);
            }
        }
        const raw = await response.text();
        try { return JSON.parse(raw); }
        catch (_) { throw new Error('The text provider returned a non-JSON API response. Check its base URL and model compatibility.'); }
    }

    async function parseOrRepairDirectorPlan(payload, body, signal) {
        const raw = directorMessageText(payload);
        try { return normalizeDirectorPlan(extractJson(raw)); }
        catch (firstError) {
            if (!raw) throw new Error('The Director returned an empty response. Choose another text model and test it first.');
            setGenerationDetail('The Director returned malformed JSON. Repairing the story plan…');
            const repairBody = {
                model: body.model, stream: false, temperature: 0, max_tokens: 1000,
                response_format: { type: 'json_object' },
                messages: [{ role: 'system', content: 'Repair the supplied malformed JSON into one valid JSON object. Preserve its story content. Do not add commentary or markdown. The object must contain sceneSummary, videoPrompt, dialogue, exactly three choices, and statePatch. Every choice must contain label, action, consequenceHint, and nextBeat.' },
                    { role: 'user', content: raw.slice(0, 12000) }]
            };
            try {
                const repairedPayload = await fetchDirectorPayload(repairBody, signal);
                return normalizeDirectorPlan(extractJson(directorMessageText(repairedPayload)));
            } catch (repairError) {
                throw new Error(`The selected Director model returned malformed JSON twice. Choose a model with structured JSON support and run Test Director.`);
            }
        }
    }

    function normalizeBeatPlan(raw = {}) {
        return {
            sceneSummary: String(raw.sceneSummary || '').trim().slice(0, 3000),
            videoPrompt: String(raw.videoPrompt || '').trim().slice(0, 6000),
            dialogue: Array.isArray(raw.dialogue) ? raw.dialogue.slice(0, 6).map(line => ({ speaker: String(line?.speaker || '').slice(0, 120), line: String(line?.line || '').slice(0, 500), language: String(line?.language || 'English').slice(0, 40) })).filter(line => line.speaker && line.line) : [],
            statePatch: raw.statePatch && typeof raw.statePatch === 'object' ? raw.statePatch : {}
        };
    }

    function normalizeDirectorPlan(raw = {}) {
        const choices = Array.isArray(raw.choices) ? raw.choices.slice(0, 3).map((choice, index) => ({
            label: String(choice?.label || `Choice ${index + 1}`).trim().slice(0, 80),
            action: String(choice?.action || '').trim().slice(0, 600),
            consequenceHint: String(choice?.consequenceHint || '').trim().slice(0, 180),
            nextBeat: choice?.nextBeat && typeof choice.nextBeat === 'object' ? normalizeBeatPlan(choice.nextBeat) : null
        })).filter(choice => choice.action) : [];
        if (choices.length < 2) throw new Error('The Director did not provide enough playable choices.');
        return { ...normalizeBeatPlan(raw), choices };
    }

    function directorContext(world, session, action) {
        const cast = (world.characters || []).map(character => ({ name: character.name, role: character.role, personality: character.personality, appearance: character.appearance }));
        const recent = session.shots.slice(-6).map(shot => ({ action: shot.action, scene: shot.sceneSummary || shot.directorPlan?.sceneSummary || '' }));
        return { premise: world.premise, rules: world.storyRules, player: world.playerDescription, viewpoint: world.viewpoint, cast, storyState: session.storyState, recentBeats: recent, playerChoice: action || '', openingSituation: session.shots.length ? '' : world.openingShot };
    }

    async function requestDirectorPlan(world, session, action = '', options = {}) {
        const model = world.directorModel || DEFAULT_DIRECTOR_MODEL;
        if (!model) throw new Error('Choose a fast text model in Settings before playing. Video Adventures require a World Director.');
        const context = directorContext(world, session, action);
        if (options.plannedBeat) context.plannedBeatThatWillBeCurrent = normalizeBeatPlan(options.plannedBeat);
        const task = options.choicesOnly
            ? `The current clip already happened. Do not advance the top-level beat. Return the current sceneSummary, blank top-level videoPrompt, no top-level dialogue or state changes, and exactly three specific actions the player can choose NOW.`
            : `Continue causally from canonical state. Write a filmable next beat with at most two short spoken lines that fit inside the configured shot.`;
        const body = {
            model,
            stream: false,
            temperature: 0.72,
            max_tokens: 900,
            response_format: { type: 'json_object' },
            messages: [{ role: 'system', content: `You are the fast World Director for a playable role-playing story. Preserve causality, character voice and player agency. Never decide the player's feelings or actions. Adventure titles are private interface metadata: never invent, announce, quote or place a title, project name or episode name in dialogue. ${task} Return compact JSON only. Keep the entire response below 750 tokens: {"sceneSummary":"one sentence","videoPrompt":"under 90 words; concrete staging, acting, camera and sound","dialogue":[{"speaker":"name","line":"one short exact line","language":"English"}],"choices":[{"label":"2-6 specific words","action":"one sentence player intent","consequenceHint":"under 12 words","nextBeat":{"sceneSummary":"one sentence causal result","videoPrompt":"under 55 words, ready to render","dialogue":[{"speaker":"name","line":"one short exact line","language":"English"}]}}],"statePatch":{"facts":["at most two"],"relationships":["at most one"],"threads":["at most two"]}}. Return exactly three contextual choices with compact nextBeat render briefs. Never use generic labels such as Engage, Investigate, Continue or Take action.` }, { role: 'user', content: JSON.stringify(context) }]
        };
        const data = await fetchDirectorPayload(body, options.signal);
        return parseOrRepairDirectorPlan(data, body, options.signal);
    }

    async function ensureDirectorChoices(world, session) {
        if (!world || !session?.shots?.length || session.directorChoices?.length || directorChoiceRequests.has(session.id)) return;
        directorChoiceRequests.add(session.id);
        const controller = new AbortController();
        const deadline = setTimeout(() => controller.abort(), 60000);
        try {
            const plan = await requestDirectorPlan(world, session, '', { choicesOnly: true, signal: controller.signal });
            if (!state.videoWorldSessions[world.id]?.sessions.includes(session)) return;
            session.directorChoices = plan.choices;
            await saveState();
            if (activeWorld()?.id === world.id && activeSession(world, false)?.id === session.id) renderPlay();
        } catch (error) {
            console.error('World Director choice generation failed:', error);
            const container = byId('video-world-choices');
            if (container) {
                container.innerHTML = `<div class="video-world-choice-status error"><strong>World Director unavailable</strong><small>${html(error.message || 'Configure a text model in Settings.')}</small></div><button type="button" class="video-world-custom-choice" data-video-world-custom>Write my own…</button>`;
                container.querySelector('[data-video-world-custom]').onclick = () => {
                    const input = byId('video-world-action');
                    input.dataset.customAction = 'true';
                    input.classList.remove('hidden');
                    input.focus();
                };
            }
        } finally {
            clearTimeout(deadline);
            directorChoiceRequests.delete(session.id);
        }
    }

    function commitDirectorState(session, plan) {
        const stateNow = session.storyState ||= { facts: [], relationships: [], threads: [] };
        for (const key of ['facts', 'relationships', 'threads']) {
            const additions = Array.isArray(plan.statePatch?.[key]) ? plan.statePatch[key].map(String).filter(Boolean) : [];
            stateNow[key] = [...new Set([...(Array.isArray(stateNow[key]) ? stateNow[key] : []), ...additions])].slice(-120);
        }
        session.directorChoices = plan.choices;
    }

    async function activateQueuedShot(world = activeWorld(), session = activeSession(world, false)) {
        if (!world || !session?.queuedShotId) return false;
        const shot = session.shots.find(item => item.id === session.queuedShotId);
        if (!shot) {
            session.queuedShotId = '';
            session.pendingDirectorPlan = null;
            return false;
        }
        session.playingShotId = shot.id;
        session.queuedShotId = '';
        if (session.pendingDirectorPlan) commitDirectorState(session, session.pendingDirectorPlan);
        session.pendingDirectorPlan = null;
        await saveState();
        renderPlay();
        byId('video-world-player').play().catch(() => {});
        return true;
    }

    function buildPrompt(world, session, action, plan = null) {
        const preset = VISUAL_PRESETS.find(item => item[0] === world.visualPreset) || VISUAL_PRESETS[3];
        const cast = world.characters?.length ? world.characters.map(character => `${character.name} — ${character.role || 'recurring character'}. Personality/voice: ${character.personality || 'natural and distinctive'}. Fixed appearance: ${character.appearance || 'match the supplied canonical reference when available'}.`).join('\n') : 'No recurring cast has been authored yet.';
        const common = [
            `Premise and fixed canon: ${world.premise}`,
            world.storyRules ? `Story rules and tone: ${world.storyRules}` : '',
            `PLAYER ROLE: ${world.playerDescription || 'The player inhabits the protagonist and controls their decisions.'}`,
            world.viewpoint === 'first_person' ? 'VIEWPOINT: Strict first-person player point of view. The camera is the player’s eyes. Never show the player’s face or body except plausible hands, feet, reflections or shadows.' : 'VIEWPOINT: Third-person. The player character may appear on camera and must remain visually consistent.',
            `RECURRING CAST:\n${cast}`,
            `Visual style preset: ${preset[1]}. ${preset[2]}`,
            world.visualStyle ? `Additional visual direction: ${world.visualStyle}` : '',
            `Format: one continuous ${world.duration}-second shot with synchronized natural sound. No titles, captions, logos, UI, montage or hard cuts.`,
            'Adventure titles and project names are interface metadata, not story dialogue. Never make any character say or announce one.',
        ].filter(Boolean);
        if (plan?.sceneSummary) common.push(`STORY PURPOSE OF THIS BEAT: ${plan.sceneSummary}`);
        if (plan?.videoPrompt) common.push(`DIRECTOR'S SHOT PLAN: ${plan.videoPrompt}`);
        const dialogue = (plan?.dialogue || []).filter(line => !String(line.line || '').toLowerCase().includes(String(world.name || '').trim().toLowerCase()));
        if (dialogue.length) common.push(`Perform only this exact scripted dialogue with clear natural speech and accurate lip synchronization:\n${dialogue.map(line => `${line.speaker}: <d>[${line.language || 'English'}] ${line.line}</d>`).join('\n')}`);
        if (!session.shots.length) {
            if (!plan?.videoPrompt) common.push(`Opening shot: ${world.openingShot}`);
            if (action) common.push(`Additional opening detail: ${action}`);
        } else {
            common.push('The supplied image is the exact final frame of the previous canonical shot. Continue from it without resetting the scene, changing identities, teleporting subjects, or replacing visible clothing and objects.');
            if (!plan?.videoPrompt) common.push(`Next action or story beat: ${action}`);
            common.push('Show the consequence clearly, preserve physical continuity, and end on a stable frame suitable for continuing the film.');
        }
        return common.join('\n\n');
    }

    function rendererSafeText(value) {
        return String(value || '')
            .replace(/\b(?:very\s+large|huge|enormous)\s+(?:breasts?|boobs?|bust)\b/gi, 'distinctive formal costume')
            .replace(/\b(?:breasts?|boobs?|cleavage|busty)\b/gi, 'costume')
            .replace(/\b(?:sexy|seductive|erotic|provocative|suggestive|fetish(?:ized)?)\b/gi, 'playful romantic')
            .replace(/\b(?:nude|naked|topless|lingerie)\b/gi, 'fully clothed')
            .replace(/\s{2,}/g, ' ').trim();
    }

    function buildPolicyRestagedPrompt(world, action, plan) {
        const preset = VISUAL_PRESETS.find(item => item[0] === world.visualPreset) || VISUAL_PRESETS[3];
        const dialogue = (plan?.dialogue || [])
            .filter(line => !String(line.line || '').toLowerCase().includes(String(world.name || '').trim().toLowerCase()))
            .map(line => `${rendererSafeText(line.speaker)}: <d>[${line.language || 'English'}] ${rendererSafeText(line.line)}</d>`).join('\n');
        return [
            `PG-13 STORY CONTEXT: ${rendererSafeText(world.premise)}`,
            `PLAYER INTENT: ${rendererSafeText(action)}`,
            `SCENE: ${rendererSafeText(plan?.sceneSummary)}`,
            `SHOT PLAN: ${rendererSafeText(plan?.videoPrompt)}`,
            dialogue ? `SCRIPTED DIALOGUE:\n${dialogue}` : '',
            `VISUAL STYLE: ${preset[1]}. ${preset[2]}`,
            `Adventure titles and project names are interface metadata, not story dialogue. Never make any character say or announce one.`,
            `One continuous ${world.duration}-second scene with synchronized natural sound. All characters are adults and fully clothed. Keep the comedy non-explicit and non-sexualized. No nudity, fetish framing, explicit anatomy, sexual contact, graphic violence, titles, logos, captions or UI.`
        ].filter(Boolean).join('\n\n');
    }

    function setGenerationDetail(detail) {
        generationPhase = detail || '';
        const elapsed = generationStartedAt ? Math.floor((Date.now() - generationStartedAt) / 1000) : 0;
        byId('video-world-generating-detail').textContent = `${generationPhase}${elapsed ? ` · ${elapsed}s` : ''}`;
    }

    function setGenerating(active, detail = '') {
        const overlay = byId('video-world-generating');
        const hasFootage = !!activeSession(activeWorld(), false)?.shots?.length;
        overlay.classList.toggle('hidden', !active);
        overlay.classList.toggle('compact', active && hasFootage);
        if (active) byId('video-world-generating-title').textContent = hasFootage ? 'Preparing next scene…' : 'Creating opening scene…';
        byId('video-world-generate').disabled = active;
        byId('video-world-stage-generate').disabled = active;
        byId('video-world-new-run').disabled = active;
        byId('video-world-edit').disabled = active;
        byId('video-world-action').disabled = active;
        byId('video-world-choices').querySelectorAll('button').forEach(button => { button.disabled = active; });
        if (active) {
            generationStartedAt = Date.now();
            setGenerationDetail(detail || 'H3 Max is rendering and Horde will save the finished MP4 locally.');
            clearInterval(generationClock);
            generationClock = setInterval(() => setGenerationDetail(generationPhase), 1000);
        } else {
            clearInterval(generationClock);
            generationClock = null;
            generationStartedAt = 0;
            generationPhase = '';
        }
    }

    function cancelGeneration() {
        if (!videoGenerationController) return;
        const session = activeSession(activeWorld(), false);
        const jobId = session?.pendingVideoJob?.jobId;
        generationToken++;
        videoGenerationController.abort();
        videoGenerationController = null;
        if (jobId) {
            session.pendingVideoJob = null;
            void saveState();
            void mcpBridgeRequest(`/fal/video/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST', body: {}, timeoutMs: 10000 })
                .catch(error => console.warn('Could not mark video job cancelled:', error));
        }
        setGenerating(false);
        showToast('Generation cancelled. No scene or story state was committed; Fal may still bill work already started.', 'info');
    }

    async function captureLastFrame(url) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.crossOrigin = 'anonymous';
            video.muted = true;
            video.preload = 'auto';
            let settled = false;
            const finish = (fn, value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                video.removeAttribute('src');
                video.load();
                fn(value);
            };
            const timeout = setTimeout(() => finish(reject, new Error('Timed out reading the final video frame.')), 30000);
            video.onerror = () => finish(reject, new Error('The generated video could not be read for continuity.'));
            video.onloadedmetadata = () => {
                if (!Number.isFinite(video.duration) || video.duration <= 0) return finish(reject, new Error('The generated video has no readable duration.'));
                video.currentTime = Math.max(0, video.duration - 0.08);
            };
            video.onseeked = () => {
                try {
                    const maximumWidth = 1280;
                    const scale = Math.min(1, maximumWidth / Math.max(1, video.videoWidth));
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(2, Math.round(video.videoWidth * scale));
                    canvas.height = Math.max(2, Math.round(video.videoHeight * scale));
                    const context = canvas.getContext('2d', { alpha: false });
                    context.drawImage(video, 0, 0, canvas.width, canvas.height);
                    finish(resolve, canvas.toDataURL('image/jpeg', 0.86));
                } catch (error) {
                    finish(reject, error);
                }
            };
            video.src = url;
            video.load();
        });
    }

    async function waitForVideoJob(jobId, signal) {
        const deadline = Date.now() + 6 * 60 * 1000;
        while (Date.now() < deadline) {
            if (signal?.aborted) throw new DOMException('Generation cancelled.', 'AbortError');
            const job = await mcpBridgeRequest(`/fal/video/jobs/${encodeURIComponent(jobId)}`, { timeoutMs: 12000, signal });
            if (job.status === 'completed') return job.result;
            if (job.status === 'failed' || job.status === 'cancelled') {
                const error = new Error(job.error || `Video job ${job.status}.`);
                error.code = job.errorCode || '';
                error.fields = Array.isArray(job.errorFields) ? job.errorFields : [];
                throw error;
            }
            const attempt = job.currentModel ? ` ${VIDEO_RENDERER_LABELS[job.currentModel] || job.currentModel}` : '';
            setGenerationDetail(job.status === 'queued' ? 'Fal accepted the shot. Waiting for a renderer…' : `${attempt.trim() || 'Fal'} is filming the scripted scene…`);
            await new Promise((resolve, reject) => {
                const timer = setTimeout(resolve, 1200);
                signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Generation cancelled.', 'AbortError')); }, { once: true });
            });
        }
        throw new Error('Video generation exceeded six minutes. The job remains recoverable after reloading.');
    }

    async function requestVideoRender(session, pending, body, signal) {
        try {
            const submitted = await mcpBridgeRequest('/fal/video/jobs', {
                method: 'POST', timeoutMs: 15000, signal, body
            });
            session.pendingVideoJob = { ...pending, jobId: submitted.jobId, createdAt: Date.now() };
            await saveState();
            return await waitForVideoJob(submitted.jobId, signal);
        } catch (error) {
            if (!/Unknown MCP provider|Unknown bridge endpoint|request failed \(404\)/i.test(error.message || '')) throw error;
            session.pendingVideoJob = null;
            await saveState();
            if (body.enableSafetyChecker === false) {
                throw new Error('The running local bridge is from an older Horde build and cannot apply the Fal safety setting. Restart Horde Studio once, then retry.');
            }
            setGenerationDetail('The local bridge is from an older build. Using compatibility mode for this shot…');
            return mcpBridgeRequest('/fal/video/generate', {
                method: 'POST', timeoutMs: 360000, signal, body: { ...body, latencyMode: 'queue' }
            });
        }
    }

    async function finishVideoJob(world, session, pending, result) {
        if (!result?.mediaId || session.shots.some(shot => shot.mediaId === result.mediaId)) {
            session.pendingVideoJob = null;
            await saveState();
            return null;
        }
        const plan = pending.plan || normalizeBeatPlan({ sceneSummary: pending.action, videoPrompt: pending.prompt });
        const shot = normalizeShot({
            id: uid('video_shot'), index: session.shots.length + 1,
            action: session.shots.length ? pending.action : (pending.action || world.openingShot),
            sceneSummary: plan.sceneSummary, directorPlan: plan, prompt: pending.prompt,
            mediaId: result.mediaId, mediaPath: result.mediaUrl, requestId: result.requestId,
            model: result.model, resolution: world.resolution, duration: Number(result.duration) || world.duration,
            seed: result.seed,
            cost: (Number(result.duration) || world.duration) * rendererRate(rendererFamily(result.model) || world.rendererPrimary, world.resolution),
            inferenceSeconds: result.inferenceSeconds, createdAt: Date.now()
        });
        session.shots.push(shot);
        session.pendingVideoJob = null;
        session.transitionFrame = pending.transitionFrame || '';
        session.spent = session.shots.reduce((sum, item) => sum + item.cost, 0);
        session.updatedAt = Date.now();
        setGenerationDetail('Shot saved. Capturing its final continuity frame…');
        try {
            session.lastFrame = await captureLastFrame(`${mcpBridgeBase()}${result.mediaUrl}`);
            shot.continuityCaptured = true;
        } catch (error) {
            session.lastFrame = '';
            shot.continuityCaptured = false;
            console.warn('Video Adventure continuity frame capture failed:', error);
        }
        const hasPlayingScene = !!session.playingShotId && session.playingShotId !== shot.id;
        if (hasPlayingScene) {
            session.queuedShotId = shot.id;
            session.pendingDirectorPlan = plan;
        } else {
            session.playingShotId = shot.id;
            commitDirectorState(session, plan);
        }
        await saveState();
        return shot;
    }

    async function resumeVideoJob(world, session) {
        const pending = session?.pendingVideoJob;
        if (!pending?.jobId || resumedVideoJobs.has(pending.jobId)) return;
        resumedVideoJobs.add(pending.jobId);
        const controller = new AbortController();
        videoGenerationController = controller;
        setGenerating(true, 'Recovering the in-progress H3 Max shot…');
        try {
            const result = await waitForVideoJob(pending.jobId, controller.signal);
            const shot = await finishVideoJob(world, session, pending, result);
            renderPlay();
            if (shot) showToast(`Recovered shot ${shot.index}.`, 'success');
        } catch (error) {
            if (error.name !== 'AbortError') {
                session.pendingVideoJob = null;
                await saveState();
                showToast(error.message || 'Could not recover the video job.', 'error');
            }
        } finally {
            resumedVideoJobs.delete(pending.jobId);
            if (videoGenerationController === controller) videoGenerationController = null;
            setGenerating(false);
        }
    }

    async function generateShot() {
        const world = activeWorld();
        const session = activeSession(world, false);
        if (!world || !session) return;
        if (!state.falApiKey) {
            showToast('Add your Fal API key in Settings → Connections first.', 'error');
            showGlobalSettings();
            if (typeof activateSettingsSection === 'function') activateSettingsSection('accounts');
            return;
        }
        const action = byId('video-world-action').value.trim();
        if (session.shots.length && !action) return showToast('Describe your next action or story beat.', 'error');
        const cost = shotCost(world);
        if (session.spent + cost > world.sessionBudget + 0.000001) {
            return showToast(`This shot would exceed the ${money(world.sessionBudget)} timeline limit. Raise it in Video Adventure Studio or start a new timeline.`, 'error');
        }
        const token = ++generationToken;
        const transitionFrame = session.lastFrame || '';
        videoGenerationController?.abort();
        videoGenerationController = new AbortController();
        const controller = videoGenerationController;
        const deadline = setTimeout(() => controller.abort(), 370000);
        setGenerating(true, 'The World Director is writing the next story beat…');
        try {
            const selectedChoice = session.directorChoices.find(choice => choice.action === action);
            let plan = selectedChoice?.nextBeat ? { ...selectedChoice.nextBeat, choices: [] } : null;
            let futureChoicesPromise = null;
            if (plan) {
                setGenerationDetail('Branch prepared. H3 Max is filming immediately…');
                const futureController = new AbortController();
                const futureDeadline = setTimeout(() => futureController.abort(), 60000);
                futureChoicesPromise = requestDirectorPlan(world, session, action, { choicesOnly: true, plannedBeat: plan, signal: futureController.signal })
                    .catch(error => { console.warn('Background choice preparation failed:', error); return null; })
                    .finally(() => clearTimeout(futureDeadline));
            } else {
                plan = await requestDirectorPlan(world, session, action, { signal: controller.signal });
            }
            if (token !== generationToken) return;
            const prompt = buildPrompt(world, session, action, plan);
            if (!futureChoicesPromise) setGenerationDetail('Story beat written. H3 Max is filming the scripted scene…');
            const pending = { action, prompt, plan, cost, transitionFrame };
            const renderBody = {
                apiKey: state.falApiKey, prompt, duration: world.duration, resolution: world.resolution,
                aspectRatio: world.aspectRatio, imageDataUrl: session.lastFrame || '',
                enableSafetyChecker: state.globalSettings?.falSafetyChecker !== false
                    && world.falSafetyChecker !== false,
                models: rendererChain(world),
                seed: Math.floor(Math.random() * 2_000_000_000)
            };
            let result;
            let completedPending = pending;
            try {
                result = await requestVideoRender(session, pending, renderBody, controller.signal);
            } catch (error) {
                const policyRejected = error.code === 'content_policy_violation'
                    || /content_policy_violation|content checker/i.test(error.message || '');
                if (!policyRejected || state.globalSettings?.falSafetyChecker === false
                    || world.falSafetyChecker === false) throw error;
                const safePrompt = buildPolicyRestagedPrompt(world, action, plan);
                const rejectedFrame = error.fields?.includes('image_url') || /image_url/i.test(error.message || '');
                setGenerationDetail(`Fal rejected ${rejectedFrame ? 'the prompt and continuity frame' : 'the prompt'}. Restaging once as a PG-13 scene…`);
                showToast(`Fal's filter rejected ${rejectedFrame ? 'the scene and previous frame' : 'the scene'}. Retrying once with a non-explicit restaging${rejectedFrame ? ' without that frame' : ''}.`, 'info');
                const safePending = { ...pending, prompt: safePrompt, transitionFrame: rejectedFrame ? '' : transitionFrame };
                completedPending = safePending;
                result = await requestVideoRender(session, safePending, {
                    ...renderBody,
                    prompt: safePrompt,
                    imageDataUrl: rejectedFrame ? '' : renderBody.imageDataUrl,
                    seed: Math.floor(Math.random() * 2_000_000_000)
                }, controller.signal);
            }
            if (token !== generationToken || !state.videoWorldSessions[world.id]?.sessions.includes(session)) return;
            const shot = await finishVideoJob(world, session, completedPending, result);
            if (futureChoicesPromise) void futureChoicesPromise.then(async futurePlan => {
                if (!futurePlan || !state.videoWorldSessions[world.id]?.sessions.includes(session)) return;
                plan.choices = futurePlan.choices;
                shot.directorPlan = plan;
                if (session.playingShotId === shot.id) session.directorChoices = plan.choices;
                if (session.queuedShotId === shot.id) session.pendingDirectorPlan = plan;
                await saveState();
                if (activeWorld()?.id === world.id && activeSession(world, false)?.id === session.id) renderPlay();
            });
            await saveState();
            byId('video-world-action').value = '';
            renderPlay();
            const player = byId('video-world-player');
            if (session.queuedShotId && (player.ended || player.currentTime >= Math.max(0, player.duration - 0.12))) await activateQueuedShot(world, session);
            else player.play().catch(() => {});
            const renderedBy = VIDEO_RENDERER_LABELS[rendererFamily(shot.model)] || shot.model;
            showToast(`Shot ${shot.index} ready · ${renderedBy} · ${money(shot.cost)} estimated`, 'success');
        } catch (error) {
            if (token !== generationToken) return;
            console.error('Video Adventure generation failed:', error);
            const policyRejected = /content_policy_violation|content checker/i.test(error.message || '');
            const attemptedRenderers = rendererChain(world).map(renderer => VIDEO_RENDERER_LABELS[renderer]).join(' → ');
            const message = policyRejected
                ? `${attemptedRenderers} all rejected this scene after the configured safety setting. Fal or the hosted models applied mandatory filtering; revise the scene, change the reference frame, or choose another renderer.`
                : (error.message || 'Video generation failed.');
            showToast(controller.signal.aborted ? 'Generation stopped after its deadline. Your previous scene is unchanged; try again.' : message, 'error');
        } finally {
            clearTimeout(deadline);
            if (videoGenerationController === controller) videoGenerationController = null;
            if (token === generationToken) setGenerating(false);
        }
    }

    async function newTimeline() {
        const world = activeWorld();
        if (!world) return;
        const store = sessionStore(world.id);
        const session = normalizeSession({ name: `Take ${store.sessions.length + 1}` }, store.sessions.length);
        store.sessions.unshift(session);
        store.activeSessionId = session.id;
        generationToken++;
        videoGenerationController?.abort();
        await saveState();
        renderPlay();
        showToast('Fresh Video Adventure timeline started.', 'success');
    }

    async function renameTimeline() {
        const world = activeWorld();
        const session = activeSession(world, false);
        if (!session) return;
        const name = prompt('Timeline name', session.name);
        if (name === null) return;
        const cleaned = name.trim().slice(0, 120);
        if (!cleaned) return showToast('Timeline name cannot be empty.', 'error');
        session.name = cleaned;
        session.updatedAt = Date.now();
        await saveState();
        renderPlay();
    }

    function deleteTimeline() {
        const world = activeWorld();
        const session = activeSession(world, false);
        if (!world || !session) return;
        const mediaIds = session.shots.map(shot => shot.mediaId).filter(Boolean);
        showConfirmModal('Delete timeline', `Delete “${session.name}” and its ${mediaIds.length} saved clip${mediaIds.length === 1 ? '' : 's'}? This cannot be undone.`, async () => {
            generationToken++;
            videoGenerationController?.abort();
            videoGenerationController = null;
            setGenerating(false);
            const store = sessionStore(world.id);
            store.sessions = store.sessions.filter(item => item.id !== session.id);
            if (!store.sessions.length) store.sessions.push(normalizeSession({ name: 'Take 1' }, 0));
            store.activeSessionId = store.sessions[0].id;
            await saveState();
            renderPlay();
            if (mediaIds.length) void mcpBridgeRequest('/fal/video/delete', { method: 'POST', body: { mediaIds }, timeoutMs: 30000 })
                .catch(error => console.warn('Could not remove timeline media:', error));
            showToast('Timeline deleted.', 'success');
        }, 'Delete timeline', 'Cancel');
    }

    function setup() {
        if (setupComplete) return;
        setupComplete = true;
        ensureState();
        byId('create-video-world-btn').onclick = openNewEditor;
        byId('video-world-studio-back').onclick = () => switchView('videoWorlds');
        byId('video-world-play-back').onclick = () => switchView('videoWorlds');
        byId('save-video-world-btn').onclick = saveEditor;
        byId('delete-video-world-btn').onclick = deleteEditorWorld;
        byId('video-world-generate').onclick = generateShot;
        byId('video-world-stage-generate').onclick = generateShot;
        byId('video-world-cancel-generation').onclick = cancelGeneration;
        byId('video-world-player').onended = () => { void activateQueuedShot(); };
        byId('video-world-new-run').onclick = newTimeline;
        byId('video-world-rename-run').onclick = renameTimeline;
        byId('video-world-delete-run').onclick = deleteTimeline;
        byId('video-world-test-director').onclick = testEditorDirector;
        byId('video-world-director-model').addEventListener('input', event => {
            byId('video-world-director-status').textContent = event.target.value.trim()
                ? `Selected for ${typeof cloudProviderName === 'function' ? cloudProviderName() : 'current provider'} · Not tested`
                : 'Choose a Director model.';
        });
        byId('video-world-open-ai-settings').onclick = () => {
            showGlobalSettings();
            if (typeof activateSettingsSection === 'function') activateSettingsSection('models');
        };
        byId('video-world-run-name').onchange = async event => {
            const world = activeWorld();
            if (!world) return;
            const store = sessionStore(world.id);
            if (!store.sessions.some(session => session.id === event.target.value)) return;
            store.activeSessionId = event.target.value;
            generationToken++;
            videoGenerationController?.abort();
            videoGenerationController = null;
            setGenerating(false);
            await saveState();
            renderPlay();
        };
        byId('video-world-edit').onclick = () => activeWorld() && openEditor(activeWorld().id);
        ['video-world-resolution', 'video-world-duration', 'video-world-renderer-primary', 'video-world-renderer-fallback', 'video-world-renderer-fallback-2']
            .forEach(id => byId(id).onchange = updateEditorCost);
        byId('video-world-viewpoint').querySelectorAll('[data-value]').forEach(button => button.onclick = () => selectButtonValue('video-world-viewpoint', button.dataset.value));
        byId('video-world-add-character').onclick = () => {
            const container = byId('video-world-characters');
            container.insertAdjacentHTML('beforeend', characterCard());
            bindCharacterCard(container.lastElementChild);
            container.lastElementChild.querySelector('[data-character-name]').focus();
        };
        bindImageInput(byId('video-world-player-reference'), byId('video-world-player-reference-preview'), data => { byId('video-world-player-reference-preview').dataset.image = data; });
        byId('video-world-player').onerror = () => showToast('This clip is missing from the local Video Adventure media folder.', 'error');
        renderLibrary();
    }

    function onView(viewName) {
        if (!setupComplete) return;
        if (viewName === 'videoWorlds') renderLibrary();
        if (viewName === 'videoWorldStudio') populateEditor(editorWorld());
        if (viewName === 'videoWorldPlay') renderPlay();
    }

    window.HordeVideoWorlds = {
        setup,
        onView,
        normalizeWorld,
        normalizeSession,
        buildPrompt,
        shotCost
    };
})();
