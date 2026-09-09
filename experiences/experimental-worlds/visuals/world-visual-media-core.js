// --- Portable World Presentation Media ------------------------------------
// World visuals are authored presentation, never simulation state. Assets live
// inside the world record so a .horde_world file remains a complete, portable
// artifact instead of a collection of expired provider URLs or machine-local
// paths. References keep locations/NPCs small and let one asset be reused.
const WORLD_MEDIA_SCHEMA_VERSION = 1;
const WORLD_MEDIA_ASSET_LIMIT = 10000;
const WORLD_MEDIA_ASSET_BYTES_LIMIT = 8_000_000;

// --- Fal Advanced Request Settings ----------------------------------------
// Optional fal request overrides authored per world in the Visuals tab.
// Deliberately a flat allowlist, NOT a per-model capability registry: some
// fal endpoints accept these fields and some do not, so a populated value
// passes through untouched and a blank value is omitted entirely, leaving the
// endpoint's own default in charge. Adding a field later means one entry
// here plus its bridge pass-through — no provider-layer rewrite.
const FAL_ADVANCED_REQUEST_FIELDS = Object.freeze([
    { key: 'safetyTolerance', requestKey: 'safetyTolerance', type: 'number' },
    { key: 'enableSafetyChecker', requestKey: 'enableSafetyChecker', type: 'boolean' },
    { key: 'seed', requestKey: 'seed', type: 'integer' }
]);

function normalizeFalAdvancedSettings(raw) {
    const source = isPlainObject(raw) ? raw : {};
    const settings = {};
    FAL_ADVANCED_REQUEST_FIELDS.forEach(field => {
        const value = source[field.key];
        if (value === undefined || value === null || String(value).trim() === '') {
            settings[field.key] = '';
            return;
        }
        if (field.type === 'boolean') {
            // The UI sends explicit strings, while imported worlds may already
            // carry a real boolean. Anything else is treated as unset so the
            // model's own default remains authoritative.
            settings[field.key] = value === true || value === 'true' ? true
                : value === false || value === 'false' ? false : '';
            return;
        }
        if (field.type === 'integer') {
            // A pinned seed opts out of the per-call random seed. Anything
            // outside the provider range normalizes back to blank.
            const whole = typeof value === 'number' ? value : Number(String(value).trim());
            settings[field.key] = Number.isInteger(whole) && whole >= 0 && whole <= 2147483647
                ? whole : '';
            return;
        }
        const numeric = typeof value === 'number' ? value : Number(String(value).trim());
        settings[field.key] = Number.isFinite(numeric) && numeric >= 0 && numeric <= 100
            ? numeric : '';
    });
    return settings;
}

function falAdvancedRequestBody(world) {
    // Request-body fragment for the world's authored fal overrides. Blank
    // fields are omitted so the endpoint default applies.
    const presentation = isPlainObject(world?.presentation) ? world.presentation : {};
    const settings = normalizeFalAdvancedSettings(presentation.falAdvancedSettings);
    const fragment = {};
    FAL_ADVANCED_REQUEST_FIELDS.forEach(field => {
        const value = settings[field.key];
        if (value !== '' && value !== undefined && value !== null) fragment[field.requestKey] = value;
    });
    return fragment;
}

function falAdvancedRequestFieldsFromBody(body) {
    // Generic forward of advanced fal fields from an image request body to
    // the bridge payload. Unknown or ill-typed values never travel.
    const forwarded = {};
    if (!isPlainObject(body)) return forwarded;
    FAL_ADVANCED_REQUEST_FIELDS.forEach(field => {
        const value = body[field.requestKey];
        if (field.type === 'boolean') {
            if (typeof value === 'boolean') forwarded[field.requestKey] = value;
        } else if (typeof value === 'number' && Number.isFinite(value)) {
            forwarded[field.requestKey] = value;
        }
    });
    return forwarded;
}

// --- Optional structured image guide (Fibo-compatible input medium) ---
// Authored image direction shared by every world visual generator. Blank
// fields are omitted everywhere: this is an optional guidebook, never an
// auto-filled template. Fibo endpoints receive it as their native
// structured prompt; every other model receives the same fields compiled
// into prompt prose. Per-character subject information never travels here.
const WORLD_IMAGE_GUIDE_FIELDS = Object.freeze([
    { key: 'styleMedium', max: 400, label: 'Style medium' },
    { key: 'artisticStyle', max: 400, label: 'Artistic style' },
    { key: 'lightingConditions', max: 400, label: 'Lighting conditions' },
    { key: 'lightingDirection', max: 300, label: 'Lighting direction' },
    { key: 'lightingShadows', max: 300, label: 'Shadows' },
    { key: 'composition', max: 400, label: 'Composition' },
    { key: 'colorScheme', max: 400, label: 'Color scheme' },
    { key: 'moodAtmosphere', max: 400, label: 'Mood and atmosphere' },
    { key: 'depthOfField', max: 300, label: 'Depth of field' },
    { key: 'focus', max: 300, label: 'Focus' },
    { key: 'cameraAngle', max: 300, label: 'Camera angle' },
    { key: 'lensFocalLength', max: 200, label: 'Lens focal length' },
    { key: 'backgroundSetting', max: 800, label: 'Background setting' },
    { key: 'context', max: 1200, label: 'Context' }
]);

function normalizeWorldImageGuide(raw) {
    const source = isPlainObject(raw) ? raw : {};
    const guide = {};
    WORLD_IMAGE_GUIDE_FIELDS.forEach(field => {
        guide[field.key] = String(source[field.key] || '').trim().slice(0, field.max);
    });
    return guide;
}

function worldImageGuide(world) {
    const presentation = normalizeWorldPresentation(world);
    const guide = normalizeWorldImageGuide(presentation.imageGuide);
    return WORLD_IMAGE_GUIDE_FIELDS.some(field => guide[field.key]) ? guide : null;
}

// A saved brief is a reusable global preset. The world guide remains the
// baseline; the visual editor may apply one preset to the current request
// without changing every other portrait or location in the world.
function worldImageGuideForTarget(world, target, kind = 'npc', briefIdOverride = '') {
    const base = worldImageGuide(world) || {};
    if (kind !== 'npc') return Object.keys(base).length ? base : null;
    const briefId = String(briefIdOverride || target?.visuals?.portraitBriefId || '').trim();
    const preset = briefId ? normalizeImageGuidePresets(ExperimentalWorldsVisualMediaHost.globalSettings().imageGuidePresets)[briefId] : null;
    if (!preset) return Object.keys(base).length ? base : null;
    const merged = { ...base };
    WORLD_IMAGE_GUIDE_FIELDS.forEach(field => {
        if (preset[field.key]) merged[field.key] = preset[field.key];
    });
    return WORLD_IMAGE_GUIDE_FIELDS.some(field => merged[field.key]) ? merged : null;
}

function flattenWorldImageGuide(guide) {
    if (!guide) return '';
    const lines = WORLD_IMAGE_GUIDE_FIELDS
        .map(field => guide[field.key] ? `${field.label}: ${guide[field.key]}` : '')
        .filter(Boolean);
    return lines.join('. ');
}

function imageGuideProseBlock(guide) {
    const prose = flattenWorldImageGuide(guide);
    return prose ? `[WORLD IMAGE GUIDE - authored image direction for this world's visuals]\n${prose}` : '';
}

// Canonical image specification.  The legacy imageGuide fields remain
// readable for migration, but every new request is composed from these four
// authoring domains.  Provider output is stored separately and may only
// project deterministic fields back into Framing/Look.
const WORLD_IMAGE_LOOK_ADVANCED_FIELDS = Object.freeze([
    'captureFormat', 'emulsionOrSensor', 'lensCharacter', 'exposureTreatment',
    'motionRendering', 'grainCharacter', 'opticalArtifacts',
    'processingTreatment', 'tonalTreatment'
]);
const WORLD_IMAGE_LOOK_NATIVE_FIELDS = Object.freeze([
    'styleMedium', 'artisticStyle', 'lightingConditions', 'lightingDirection',
    'lightingShadows', 'colorScheme', 'moodAtmosphere', 'depthOfField',
    'focus', 'lensFocalLength'
]);
const WORLD_IMAGE_FRAMING_FIELDS = Object.freeze([
    'mode', 'shotComposition', 'cameraAngle', 'backgroundSetting',
    'placementInFrame', 'relativeSizeInFrame', 'pose', 'orientation',
    'action', 'expression', 'relationships'
]);

function normalizeWorldImageIntent(raw, fallbackPrompt = '', fallbackContext = '') {
    const source = isPlainObject(raw) ? raw : {};
    return {
        authoredPrompt: String(source.authoredPrompt ?? fallbackPrompt ?? '').trim().slice(0, 12000),
        context: String(source.context ?? fallbackContext ?? '').trim().slice(0, 3000),
        revision: Math.max(0, Number(source.revision) || 0)
    };
}

function normalizeWorldImageFraming(raw, legacy = {}, subject = null) {
    const source = isPlainObject(raw) ? raw : {};
    const value = key => String(source[key] ?? legacy[key] ?? subject?.[key] ?? '').trim().slice(0, 1200);
    return {
        mode: value('mode') || value('framing') || 'auto',
        shotComposition: value('shotComposition') || value('composition'),
        cameraAngle: value('cameraAngle'),
        backgroundSetting: value('backgroundSetting'),
        placementInFrame: value('placementInFrame') || value('location'),
        relativeSizeInFrame: value('relativeSizeInFrame') || value('relativeSize'),
        pose: value('pose'), orientation: value('orientation'),
        action: value('action'), expression: value('expression'),
        relationships: value('relationships')
    };
}

function normalizeWorldImageLook(raw, legacy = {}) {
    const source = isPlainObject(raw) ? raw : {};
    const look = {};
    [...WORLD_IMAGE_LOOK_NATIVE_FIELDS, ...WORLD_IMAGE_LOOK_ADVANCED_FIELDS].forEach(key => {
        look[key] = String(source[key] ?? legacy[key] ?? '').trim().slice(0, 1200);
    });
    return look;
}

function resolvedWorldImageOutfit(subject = null) {
    if (!isPlainObject(subject)) return null;
    const outfit = isPlainObject(subject.outfit) ? subject.outfit : null;
    const description = String(subject.outfitSnapshot || outfit?.description || subject.clothing || '').trim();
    if (!description) return null;
    return {
        id: String(outfit?.id || subject.outfitId || '').slice(0, 160),
        name: String(outfit?.name || subject.outfitName || '').trim().slice(0, 160),
        description: description.slice(0, 1200),
        revision: Number(outfit?.revision || subject.outfitRevision || 0) || 0
    };
}

function sidecarReaderVisualProjection(world, sess, entityId = '') {
    const protocol = protocolForSidecarTimeline(world, sess);
    const snapshot = protocol?.readerSnapshots?.filter(item => item.status === 'active' && item.settlementStatus === 'settled').at(-1);
    const envelope = snapshot?.envelope || null;
    if (!envelope) return null;
    const candidates = activeReaderCandidates(protocol, { sceneId: snapshot?.sceneId || protocol.activeSceneId || '' });
    const selectedId = String(entityId || '');
    const character = candidates.find(candidate => candidate.candidateType === 'character' && (!selectedId || String(candidate.canonicalMatchId || '') === selectedId));
    const outfit = candidates.find(candidate => candidate.candidateType === 'outfit' && (!selectedId || [candidate.wearerEntityId, candidate.details?.wearerEntityId, candidate.details?.characterEntityId, candidate.subjectEntityId].some(value => String(value || '') === selectedId)));
    const scene = envelope.scene || {};
    const presence = Object.values(envelope.presence || {}).flat().filter(item => isPlainObject(item));
    const castEntry = presence.find(item => String(item?.entityId || item?.canonicalEntityId || item?.id || '') === selectedId) || null;
    const characterEvidence = candidates.filter(candidate => candidate.candidateType === 'character' && (!selectedId || String(candidate.canonicalMatchId || '') === selectedId));
    const outfitEvidence = candidates.filter(candidate => candidate.candidateType === 'outfit' && (!selectedId || [candidate.wearerEntityId, candidate.details?.wearerEntityId, candidate.details?.characterEntityId, candidate.subjectEntityId].some(value => String(value || '') === selectedId)));
    return {
        nonCanonical: true,
        snapshotId: snapshot.id,
        appearance: character?.description || character?.details?.appearance || castEntry?.appearance || '',
        outfit: outfit ? { id: outfit.canonicalMatchId || outfit.candidateId, name: outfit.label, description: outfit.clothingDescription || outfit.description } : null,
        pose: character?.details?.pose || castEntry?.pose || '',
        expression: character?.details?.expression || castEntry?.expression || '',
        action: character?.details?.action || castEntry?.action || '',
        orientation: character?.details?.orientation || castEntry?.orientation || '',
        environment: scene.environment || '',
        backgroundSetting: scene.environment || '',
        evidence: [...characterEvidence, ...outfitEvidence].slice(-12)
    };
}

function compileWorldImageAdvancedLook(look) {
    const labels = {
        captureFormat: 'capture format', emulsionOrSensor: 'emulsion or sensor',
        lensCharacter: 'lens character', exposureTreatment: 'exposure treatment',
        motionRendering: 'motion rendering', grainCharacter: 'grain character',
        opticalArtifacts: 'optical artifacts', processingTreatment: 'processing treatment',
        tonalTreatment: 'tonal treatment'
    };
    return WORLD_IMAGE_LOOK_ADVANCED_FIELDS
        .filter(key => look?.[key])
        .map(key => `${labels[key] || key}: ${look[key]}`)
        .join('; ');
}

// --- Structured visual documents -----------------------------------------
// The provider-shaped document is the only mutable visual truth.  Horde
// metadata (stable object ids, bindings, salience and kind) lives beside it so
// the exact FIBO JSON can be submitted without a cleanup pass.
const STRUCTURED_VISUAL_DOCUMENT_SCHEMA_VERSION = 3;
const STRUCTURED_VISUAL_TARGET_KINDS = new Set(['character', 'location', 'scene', 'ad_hoc']);
const STRUCTURED_VISUAL_OBJECT_SALIENCE = new Set(['primary', 'secondary', 'tertiary']);
const STRUCTURED_VISUAL_OBJECT_KINDS = new Set(['subject', 'scene_object', 'integrated_component', 'background_detail']);
const STRUCTURED_VISUAL_MAX_OBJECTS = 20;

function normalizeStructuredVisualTargetKind(value, fallback = 'ad_hoc') {
    const kind = String(value || '').trim().toLowerCase();
    return STRUCTURED_VISUAL_TARGET_KINDS.has(kind) ? kind : fallback;
}

function visualProjectTarget(world, target, kind = '') {
    const inferred = String(kind || (target?.type === 'npc' ? 'character' : target?.type === 'location' ? 'location' : 'ad_hoc'));
    return { kind: normalizeStructuredVisualTargetKind(inferred), id: target?.id ? String(target.id) : null };
}

function blankStructuredVisualDocument() {
    return {
        short_description: '',
        objects: [],
        background_setting: '',
        lighting: { conditions: '', direction: '', shadows: '' },
        aesthetics: {
            composition: '', color_scheme: '', mood_atmosphere: '',
            aesthetic_score: 'very high', preference_score: 'very high'
        },
        photographic_characteristics: {
            depth_of_field: '', focus: '', camera_angle: '', lens_focal_length: ''
        },
        style_medium: '',
        context: '',
        artistic_style: ''
    };
}

function normalizeStructuredVisualDocument(raw) {
    const source = isPlainObject(raw) ? raw : {};
    const blank = blankStructuredVisualDocument();
    const doc = {
        ...blank,
        short_description: String(source.short_description || '').trim().slice(0, 1200),
        background_setting: String(source.background_setting || '').trim().slice(0, 1200),
        style_medium: String(source.style_medium || '').trim().slice(0, 600),
        context: String(source.context || '').trim().slice(0, 1600),
        artistic_style: String(source.artistic_style || '').trim().slice(0, 900)
    };
    ['lighting', 'aesthetics', 'photographic_characteristics'].forEach(section => {
        const values = isPlainObject(source[section]) ? source[section] : {};
        Object.keys(blank[section]).forEach(key => {
            if (values[key] === undefined || values[key] === null) return;
            if (section === 'aesthetics' && (key === 'aesthetic_score' || key === 'preference_score')) {
                doc[section][key] = String(values[key] || '').trim().slice(0, 120) || 'very high';
            } else doc[section][key] = String(values[key] || '').trim().slice(0, 1200);
        });
    });
    // text_render is deliberately opaque until the provider schema is verified.
    if (source.text_render !== undefined && source.text_render !== null) {
        doc.text_render = safeJsonClone(source.text_render);
    } else delete doc.text_render;
    const objects = Array.isArray(source.objects) ? source.objects.slice(0, STRUCTURED_VISUAL_MAX_OBJECTS) : [];
    doc.objects = objects.map(rawObject => {
        const object = isPlainObject(rawObject) ? rawObject : {};
        const normalized = {};
        const fields = ['description', 'location', 'relationship', 'relative_size', 'shape_and_color',
            'texture', 'appearance_details', 'pose', 'expression', 'clothing', 'action', 'gender',
            'skin_tone_and_texture', 'orientation'];
        fields.forEach(field => {
            if (object[field] !== undefined && object[field] !== null && String(object[field]).trim()) {
                normalized[field] = String(object[field]).trim().slice(0, 1600);
            }
        });
        if (Number.isInteger(object.number_of_objects) && object.number_of_objects >= 1) {
            normalized.number_of_objects = Math.min(100, object.number_of_objects);
        }
        if (!normalized.relationship) normalized.relationship = 'Primary subject and focal point of the image.';
        return normalized;
    });
    return doc;
}

function newStructuredVisualObjectId(prefix = 'obj') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeStructuredVisualObjectMetadata(raw, objectOrder = []) {
    const source = isPlainObject(raw) ? raw : {};
    const metadata = {};
    objectOrder.forEach((id, index) => {
        const item = isPlainObject(source[id]) ? source[id] : {};
        const salience = STRUCTURED_VISUAL_OBJECT_SALIENCE.has(item.salience) ? item.salience : (index === 0 ? 'primary' : 'secondary');
        const kind = STRUCTURED_VISUAL_OBJECT_KINDS.has(item.kind) ? item.kind : (index === 0 ? 'subject' : 'scene_object');
        metadata[id] = {
            salience, kind,
            binding: {
                characterId: String(item.binding?.characterId || '').slice(0, 160),
                outfitId: String(item.binding?.outfitId || '').slice(0, 160),
                source: String(item.binding?.source || '').slice(0, 160)
            }
        };
    });
    return metadata;
}

function legacyStructuredVisualDocument(world, target, kind = '') {
    const targetKind = normalizeStructuredVisualTargetKind(kind, target?.type === 'npc' ? 'character' : 'location');
    const guide = normalizeWorldImageGuide(worldImageGuideForTarget(world, target, targetKind === 'character' ? 'npc' : 'location'));
    const intent = normalizeWorldImageIntent(target?.visuals?.imageIntent, target?.imagePrompt || '', guide.context || '');
    const framing = normalizeWorldImageFraming(target?.visuals?.framing, guide, target || {});
    const look = normalizeWorldImageLook(target?.visuals?.look, guide);
    const document = blankStructuredVisualDocument();
    document.short_description = String(intent.authoredPrompt || target?.imagePrompt || target?.name || '').trim().slice(0, 1200);
    document.context = String(intent.context || '').trim().slice(0, 1600);
    document.background_setting = String(framing.backgroundSetting || target?.visualDescription || target?.description || '').trim().slice(0, 1200);
    document.lighting = {
        conditions: String(look.lightingConditions || '').trim().slice(0, 1200),
        direction: String(look.lightingDirection || '').trim().slice(0, 1200),
        shadows: String(look.lightingShadows || '').trim().slice(0, 1200)
    };
    document.aesthetics = {
        composition: String(framing.shotComposition || '').trim().slice(0, 1200),
        color_scheme: String(look.colorScheme || '').trim().slice(0, 1200),
        mood_atmosphere: String(look.moodAtmosphere || '').trim().slice(0, 1200),
        aesthetic_score: 'very high', preference_score: 'very high'
    };
    document.photographic_characteristics = {
        depth_of_field: String(look.depthOfField || '').trim().slice(0, 1200),
        focus: String(look.focus || '').trim().slice(0, 1200),
        camera_angle: String(framing.cameraAngle || '').trim().slice(0, 1200),
        lens_focal_length: String(look.lensFocalLength || '').trim().slice(0, 1200)
    };
    document.style_medium = String(look.styleMedium || '').trim().slice(0, 600);
    document.artistic_style = [String(look.artisticStyle || '').trim(), compileWorldImageAdvancedLook(look)].filter(Boolean).join('; ').slice(0, 900);
    const objectOrder = [];
    const metadata = {};
    if (targetKind === 'character' || target?.type === 'npc') {
        const outfit = worldCurrentOutfit(target);
        const objectId = newStructuredVisualObjectId('obj_subject');
        objectOrder.push(objectId);
        metadata[objectId] = {
            salience: 'primary', kind: 'subject',
            binding: { characterId: String(target?.id || ''), outfitId: String(outfit?.id || ''), source: 'legacy_character' }
        };
        document.objects.push(normalizeStructuredVisualDocument({ objects: [{
            description: target?.appearance || target?.description || '',
            relationship: framing.relationships || 'Primary subject and focal point of the image.',
            location: framing.placementInFrame,
            relative_size: framing.relativeSizeInFrame,
            pose: framing.pose, expression: framing.expression, action: framing.action,
            orientation: framing.orientation,
            clothing: outfit?.description || '',
            gender: target?.visuals?.portraitIdentityGuide?.gender || target?.gender || '',
            skin_tone_and_texture: target?.visuals?.portraitIdentityGuide?.skinToneAndTexture || '',
            shape_and_color: target?.visuals?.portraitIdentityGuide?.shapeAndColor || '',
            texture: target?.visuals?.portraitIdentityGuide?.texture || '',
            appearance_details: target?.visuals?.portraitIdentityGuide?.appearanceDetails || ''
        }]}).objects[0]);
    }
    return { document, objectOrder, metadata };
}

function ensureWorldVisualProject(world, target, kind = '') {
    if (!target) return null;
    if (target.visuals && isPlainObject(target.visuals.visualProject)) {
        const project = target.visuals.visualProject;
        project.schemaVersion = STRUCTURED_VISUAL_DOCUMENT_SCHEMA_VERSION;
        project.target = visualProjectTarget(world, target, kind);
        project.structuredDocument = normalizeStructuredVisualDocument(project.structuredDocument);
        project.objectOrder = Array.isArray(project.objectOrder) ? project.objectOrder.map(String) : [];
        while (project.objectOrder.length < project.structuredDocument.objects.length) project.objectOrder.push(newStructuredVisualObjectId('obj'));
        if (project.objectOrder.length > project.structuredDocument.objects.length) project.objectOrder.length = project.structuredDocument.objects.length;
        project.hordeObjectMetadata = normalizeStructuredVisualObjectMetadata(project.hordeObjectMetadata, project.objectOrder);
        project.imageIntent = normalizeWorldImageIntent(project.imageIntent, '', '');
        project.providerControls = isPlainObject(project.providerControls) ? project.providerControls : {};
        project.revisions = Array.isArray(project.revisions) ? project.revisions : [];
        return project;
    }
    const legacy = legacyStructuredVisualDocument(world, target, kind);
    const project = {
        schemaVersion: STRUCTURED_VISUAL_DOCUMENT_SCHEMA_VERSION,
        target: visualProjectTarget(world, target, kind),
        imageIntent: normalizeWorldImageIntent(target.visuals?.imageIntent, target.imagePrompt || '', ''),
        structuredDocument: normalizeStructuredVisualDocument(legacy.document),
        objectOrder: legacy.objectOrder,
        hordeObjectMetadata: legacy.metadata,
        providerControls: {
            provider: '', model: '', aspectRatio: '', resolution: '', seed: null,
            syncMode: false, providerSettings: {}
        },
        authoredRevisionId: '', activeRevisionId: '', revisions: []
    };
    target.visuals = isPlainObject(target.visuals) ? target.visuals : {};
    target.visuals.visualProject = project;
    return project;
}

function migrateWorldVisualProjects(world) {
    if (!world) return { changed: false, migrated: 0 };
    let migrated = 0;
    (Array.isArray(world.entities) ? world.entities : []).forEach(entity => {
        if (entity?.type !== 'npc') return;
        if (!entity.visuals?.visualProject) { ensureWorldVisualProject(world, entity, 'character'); migrated += 1; }
    });
    (Array.isArray(world.locations) ? world.locations : []).forEach(location => {
        if (!location.visuals?.visualProject) { ensureWorldVisualProject(world, location, 'location'); migrated += 1; }
    });
    return { changed: migrated > 0, migrated };
}

function structuredVisualDocumentWithBindings(project) {
    if (!project) return { document: blankStructuredVisualDocument(), objectOrder: [], metadata: {} };
    const document = normalizeStructuredVisualDocument(project.structuredDocument);
    const objectOrder = Array.isArray(project.objectOrder) ? project.objectOrder.slice(0, document.objects.length) : [];
    while (objectOrder.length < document.objects.length) objectOrder.push(newStructuredVisualObjectId('obj'));
    project.objectOrder = objectOrder;
    project.hordeObjectMetadata = normalizeStructuredVisualObjectMetadata(project.hordeObjectMetadata, objectOrder);
    return { document, objectOrder, metadata: project.hordeObjectMetadata };
}

function deterministicGenericVisualPrompt(document, objectOrder = [], metadata = {}) {
    const doc = normalizeStructuredVisualDocument(document);
    const ids = Array.isArray(objectOrder) ? objectOrder : [];
    const objectEntries = doc.objects.map((object, index) => ({
        object,
        id: ids[index] || `obj_${index + 1}`,
        metadata: metadata[ids[index]] || { salience: index ? 'secondary' : 'primary', kind: index ? 'scene_object' : 'subject' }
    }));
    const ordered = [...objectEntries].sort((a, b) => {
        const rank = { primary: 0, secondary: 1, tertiary: 2 };
        return (rank[a.metadata.salience] ?? 2) - (rank[b.metadata.salience] ?? 2);
    });
    const integrated = new Map();
    const standalone = [];
    ordered.forEach(entry => {
        const kind = entry.metadata.kind;
        if (kind === 'integrated_component' && standalone.length) {
            const parent = standalone.find(candidate => candidate.metadata.salience === 'primary') || standalone[0];
            integrated.set(parent.id, [...(integrated.get(parent.id) || []), entry.object]);
        } else standalone.push(entry);
    });
    const objectText = standalone.map(entry => {
        const object = entry.object;
        const parts = [object.description, object.clothing ? `wearing ${object.clothing}` : '', object.location ? `located ${object.location}` : '', object.relationship, object.relative_size ? `relative size: ${object.relative_size}` : '', object.shape_and_color, object.texture, object.appearance_details, object.pose ? `pose: ${object.pose}` : '', object.expression ? `expression: ${object.expression}` : '', object.action ? `action: ${object.action}` : '', object.orientation ? `orientation: ${object.orientation}` : ''].filter(Boolean);
        const additions = integrated.get(entry.id) || [];
        additions.forEach(component => parts.push([component.description, component.relationship, component.shape_and_color, component.texture].filter(Boolean).join(', ')));
        return parts.join(', ');
    });
    const photo = doc.photographic_characteristics;
    return [
        doc.short_description,
        objectText.length ? `Subjects and scene objects: ${objectText.join('. ')}` : '',
        doc.background_setting ? `Background setting: ${doc.background_setting}` : '',
        doc.aesthetics.composition ? `Composition: ${doc.aesthetics.composition}` : '',
        Object.values(doc.lighting).filter(Boolean).length ? `Lighting: ${Object.values(doc.lighting).filter(Boolean).join('; ')}` : '',
        [doc.aesthetics.color_scheme, doc.aesthetics.mood_atmosphere].filter(Boolean).length ? `Colour and mood: ${[doc.aesthetics.color_scheme, doc.aesthetics.mood_atmosphere].filter(Boolean).join('; ')}` : '',
        Object.values(photo).filter(Boolean).length ? `Photographic characteristics: ${Object.values(photo).filter(Boolean).join('; ')}` : '',
        [doc.style_medium, doc.artistic_style].filter(Boolean).length ? `Style: ${[doc.style_medium, doc.artistic_style].filter(Boolean).join('; ')}` : '',
        doc.context ? `Context: ${doc.context}` : ''
    ].filter(Boolean).join('\n\n');
}

function composeWorldImageSpecification(world, subject = null, guideOverride = null, options = {}) {
    const guide = normalizeWorldImageGuide(guideOverride || worldImageGuide(world) || {});
    const source = isPlainObject(subject) ? subject : {};
    const legacyFraming = {
        composition: guide.composition, cameraAngle: guide.cameraAngle,
        backgroundSetting: guide.backgroundSetting, framing: source.framing
    };
    const imageIntent = normalizeWorldImageIntent(source.imageIntent, source.authoredPrompt || source.imagePrompt, guide.context);
    const sceneProjection = isPlainObject(source.sceneProjection) ? source.sceneProjection : null;
    const sceneFraming = sceneProjection ? {
        ...(sceneProjection.pose ? { pose: sceneProjection.pose } : {}),
        ...(sceneProjection.expression ? { expression: sceneProjection.expression } : {}),
        ...(sceneProjection.action ? { action: sceneProjection.action } : {}),
        ...(sceneProjection.orientation ? { orientation: sceneProjection.orientation } : {}),
        ...(sceneProjection.backgroundSetting ? { backgroundSetting: sceneProjection.backgroundSetting } : {})
    } : {};
    const framing = normalizeWorldImageFraming(source.framing, { ...legacyFraming, ...sceneFraming }, source);
    const look = normalizeWorldImageLook(source.look, guide);
    const outfit = resolvedWorldImageOutfit(source) || resolvedWorldImageOutfit({ outfit: sceneProjection?.outfit });
    const visualDescription = [String(source.visualDescription || source.description || '').trim(), String(sceneProjection?.appearance || '').trim()].filter(Boolean).join('. ');
    const character = {
        name: String(source.name || '').trim(),
        visualDescription: visualDescription.slice(0, 1600),
        gender: String(source.gender || '').trim().slice(0, 120),
        skinToneAndTexture: String(source.skinToneAndTexture || '').trim().slice(0, 400),
        shapeAndColor: String(source.shapeAndColor || '').trim().slice(0, 500),
        texture: String(source.texture || '').trim().slice(0, 400),
        appearanceDetails: String(source.appearanceDetails || '').trim().slice(0, 700)
    };
    let structuredDocument = isPlainObject(options.visualProject?.structuredDocument)
        ? normalizeStructuredVisualDocument(options.visualProject.structuredDocument)
        : isPlainObject(source.structuredDocument)
            ? normalizeStructuredVisualDocument(source.structuredDocument)
            : null;
    let objectOrder = Array.isArray(options.visualProject?.objectOrder)
        ? options.visualProject.objectOrder.slice(0, STRUCTURED_VISUAL_MAX_OBJECTS).map(String) : [];
    let hordeObjectMetadata = isPlainObject(options.visualProject?.hordeObjectMetadata)
        ? safeJsonClone(options.visualProject.hordeObjectMetadata) : {};
    if (!structuredDocument) {
        const legacy = blankStructuredVisualDocument();
        legacy.short_description = String(imageIntent.authoredPrompt || character.visualDescription || '').trim().slice(0, 1200);
        legacy.context = String(imageIntent.context || '').trim().slice(0, 1600);
        legacy.background_setting = String(framing.backgroundSetting || '').trim().slice(0, 1200);
        legacy.lighting = {
            conditions: String(look.lightingConditions || '').trim(),
            direction: String(look.lightingDirection || '').trim(),
            shadows: String(look.lightingShadows || '').trim()
        };
        legacy.aesthetics = {
            composition: String(framing.shotComposition || '').trim(),
            color_scheme: String(look.colorScheme || '').trim(),
            mood_atmosphere: String(look.moodAtmosphere || '').trim(),
            aesthetic_score: 'very high', preference_score: 'very high'
        };
        legacy.photographic_characteristics = {
            depth_of_field: String(look.depthOfField || '').trim(),
            focus: String(look.focus || '').trim(),
            camera_angle: String(framing.cameraAngle || '').trim(),
            lens_focal_length: String(look.lensFocalLength || '').trim()
        };
        legacy.style_medium = String(look.styleMedium || '').trim();
        legacy.artistic_style = [String(look.artisticStyle || '').trim(), compileWorldImageAdvancedLook(look)].filter(Boolean).join('; ');
        if (character.visualDescription || outfit || Object.values(framing).some(Boolean)) {
            legacy.objects = [{
                description: character.visualDescription,
                relationship: framing.relationships || 'Primary subject and focal point of the image.',
                location: framing.placementInFrame,
                relative_size: framing.relativeSizeInFrame,
                shape_and_color: character.shapeAndColor,
                texture: character.texture,
                appearance_details: character.appearanceDetails,
                pose: framing.pose,
                expression: framing.expression,
                clothing: outfit?.description || '',
                action: framing.action,
                gender: character.gender,
                skin_tone_and_texture: character.skinToneAndTexture,
                orientation: framing.orientation
            }];
            objectOrder = [newStructuredVisualObjectId('obj_subject')];
            hordeObjectMetadata = {
                [objectOrder[0]]: { salience: 'primary', kind: 'subject', binding: { characterId: String(source.characterId || ''), outfitId: String(outfit?.id || ''), source: 'composition_subject' } }
            };
        }
        structuredDocument = normalizeStructuredVisualDocument(legacy);
    }
    if (outfit && structuredDocument.objects.length) {
        structuredDocument.objects[0].clothing = String(outfit.description || '').trim().slice(0, 1600);
        if (objectOrder[0]) {
            hordeObjectMetadata[objectOrder[0]] = {
                ...(hordeObjectMetadata[objectOrder[0]] || {}),
                salience: hordeObjectMetadata[objectOrder[0]]?.salience || 'primary',
                kind: hordeObjectMetadata[objectOrder[0]]?.kind || 'subject',
                binding: {
                    ...(hordeObjectMetadata[objectOrder[0]]?.binding || {}),
                    characterId: String(source.characterId || hordeObjectMetadata[objectOrder[0]]?.binding?.characterId || ''),
                    outfitId: String(outfit.id || '')
                }
            };
        }
    }
    while (objectOrder.length < structuredDocument.objects.length) objectOrder.push(newStructuredVisualObjectId('obj'));
    objectOrder.length = structuredDocument.objects.length;
    hordeObjectMetadata = normalizeStructuredVisualObjectMetadata(hordeObjectMetadata, objectOrder);
    return {
        character, imageIntent, framing, look, outfit,
        structuredDocument, objectOrder, hordeObjectMetadata,
        revision: Number(options.revision || 0) || 0
    };
}

function fiboStructuredPromptFromSpecification(specification, { includeObjects = true } = {}) {
    const spec = specification || {};
    const document = normalizeStructuredVisualDocument(spec.structuredDocument || {});
    if (!includeObjects) delete document.objects;
    // Provider metadata is deliberately not part of this object.  The bridge
    // receives a clean FIBO-shaped document with no Horde ids or bindings.
    return Object.keys(document).some(key => key === 'text_render' || document[key]) ? document : null;
}

function composeWorldImageRequest(world, subject = null, guideOverride = null, options = {}) {
    const specification = composeWorldImageSpecification(world, subject, guideOverride, options);
    const structuredPrompt = fiboStructuredPromptFromSpecification(specification);
    const prose = deterministicGenericVisualPrompt(specification.structuredDocument, specification.objectOrder, specification.hordeObjectMetadata);
    return {
        specification,
        plainPrompt: prose,
        structuredPrompt,
        requestMetadata: {
            operation: options.operation || 'generate',
            target: options.visualProject?.target || null,
            objectOrder: specification.objectOrder.slice(),
            compiledDeterministically: true
        }
    };
}

// Compatibility bridge for the historical helper script.  The helper may
// still be loaded by older exports, but it must never become a second prompt
// architecture.
globalThis.HordeCanonicalImageComposer = Object.freeze({
    composeWorldImageRequest,
    composeWorldImageSpecification,
    fiboStructuredPromptFromSpecification
});

function projectFiboResolvedState(resolved, current = {}) {
    const raw = isPlainObject(resolved) ? resolved : {};
    const next = { ...current };
    const direct = {
        'lighting.conditions': ['lighting', 'conditions', 'lightingConditions'],
        'lighting.direction': ['lighting', 'direction', 'lightingDirection'],
        'lighting.shadows': ['lighting', 'shadows', 'lightingShadows'],
        'aesthetics.color_scheme': ['aesthetics', 'color_scheme', 'colorScheme'],
        'aesthetics.mood_atmosphere': ['aesthetics', 'mood_atmosphere', 'moodAtmosphere'],
        'photographic_characteristics.depth_of_field': ['photographic_characteristics', 'depth_of_field', 'depthOfField'],
        'photographic_characteristics.focus': ['photographic_characteristics', 'focus', 'focus'],
        'photographic_characteristics.lens_focal_length': ['photographic_characteristics', 'lens_focal_length', 'lensFocalLength'],
        style_medium: [null, 'style_medium', 'styleMedium'],
        artistic_style: [null, 'artistic_style', 'artisticStyle']
    };
    Object.entries(direct).forEach(([key, [, child, output]]) => {
        const value = child ? (key.includes('.') ? raw[key.split('.')[0]]?.[child] : raw[child]) : raw[key];
        if (typeof value === 'string' && value.trim()) next[output] = value.trim().slice(0, 1200);
    });
    return next;
}

function projectFiboResolvedFraming(resolved, current = {}) {
    const raw = isPlainObject(resolved) ? resolved : {};
    const next = { ...current };
    if (raw.background_setting) next.backgroundSetting = String(raw.background_setting).slice(0, 1200);
    if (raw.aesthetics?.composition) next.shotComposition = String(raw.aesthetics.composition).slice(0, 1200);
    if (raw.photographic_characteristics?.camera_angle) next.cameraAngle = String(raw.photographic_characteristics.camera_angle).slice(0, 1200);
    const object = Array.isArray(raw.objects) ? raw.objects[0] : null;
    if (object) {
        if (object.location) next.placementInFrame = String(object.location).slice(0, 1200);
        if (object.relative_size) next.relativeSizeInFrame = String(object.relative_size).slice(0, 1200);
        if (object.pose) next.pose = String(object.pose).slice(0, 1200);
        if (object.expression) next.expression = String(object.expression).slice(0, 1200);
        if (object.action) next.action = String(object.action).slice(0, 1200);
        if (object.orientation) next.orientation = String(object.orientation).slice(0, 1200);
    }
    return next;
}

function isFiboImageEndpoint(model) {
    const id = String(model || '').trim().toLowerCase();
    return id === 'bria/fibo-gen-1.5/text-to-image' || id.startsWith('bria/fibo-edit');
}

// Builds the Fibo-native structured prompt (or, with an edit instruction,
// structured instruction) from the authored guide plus optional subject
// data. Only populated fields travel; the neutral relationship default
// exists because Fibo's schema demands the field whenever an object is sent.
function fiboStructuredImageGuide(world, subject = null, editInstruction = '', guideOverride = null) {
    // Kept as a compatibility symbol for existing callers.  Revision
    // wording travels in the provider operation/envelope, never inside the
    // FIBO generation JSON itself.
    const request = composeWorldImageRequest(world, {
        ...(isPlainObject(subject) ? subject : {}),
        authoredPrompt: String(subject?.authoredPrompt || subject?.imagePrompt || '').trim(),
        outfitSnapshot: subject?.outfitSnapshot || subject?.clothing || ''
    }, guideOverride, { operation: editInstruction ? 'revise' : 'generate' });
    return request.structuredPrompt;
}

// Stable per-character identity fields (Fibo PromptObject vocabulary).
// These belong to the person and never to a preset or an outfit: they change
// what is IN the image, not how the photo looks. Blank fields are omitted.
const WORLD_VISUAL_IDENTITY_FIELDS = Object.freeze([
    { key: 'gender', max: 100 },
    { key: 'skinToneAndTexture', max: 300 },
    { key: 'shapeAndColor', max: 300 },
    { key: 'texture', max: 300 },
    { key: 'appearanceDetails', max: 600 },
    { key: 'relativeSize', max: 200 }
]);

function normalizeWorldVisualIdentityGuide(raw) {
    const source = isPlainObject(raw) ? raw : {};
    const identity = {};
    WORLD_VISUAL_IDENTITY_FIELDS.forEach(field => {
        identity[field.key] = String(source[field.key] || '').trim().slice(0, field.max);
    });
    return identity;
}

// Per-visual authored staging fields (pose/expression/action for THIS image).
// Clothing intentionally lives on outfits instead: what a character wears is
// wardrobe state, not framing.
const WORLD_VISUAL_SUBJECT_FIELDS = Object.freeze([
    { key: 'pose', max: 400 },
    { key: 'expression', max: 300 },
    { key: 'action', max: 400 },
    { key: 'orientation', max: 200 },
    { key: 'location', max: 400 }
]);

function normalizeWorldVisualSubjectGuide(raw) {
    const source = isPlainObject(raw) ? raw : {};
    const subject = {};
    WORLD_VISUAL_SUBJECT_FIELDS.forEach(field => {
        subject[field.key] = String(source[field.key] || '').trim().slice(0, field.max);
    });
    return subject;
}

// Outfits: named, described wardrobe entries per character. An outfit is one
// description containing everything worn; portrait generation reads the worn
// outfit's description as Fibo's clothing string (and as the prose "current
// visible look"). Generated source images may belong to the outfit as well as
// the character's general variant history.
function normalizeWorldOutfits(raw) {
    const list = Array.isArray(raw) ? raw.slice(0, 30) : [];
    const outfits = [];
    const seen = new Set();
    list.forEach(entry => {
        if (!isPlainObject(entry)) return;
        const id = String(entry.id || '').trim().slice(0, 80);
        const name = String(entry.name || '').trim().slice(0, 80) || 'Untitled outfit';
        const description = String(entry.description || '').trim().slice(0, 1200);
        // A newly authored outfit is allowed to start blank.  The description
        // becomes useful once the author fills it, but its empty state still
        // needs a stable id so the image editor can select it immediately.
        const key = id || name;
        if (seen.has(key)) return;
        seen.add(key);
        const imageAssetIds = [...new Set((Array.isArray(entry.imageAssetIds) ? entry.imageAssetIds : [])
            .map(value => String(value || '').trim().slice(0, 160)).filter(Boolean))].slice(0, 30);
        outfits.push({ id: id || `outfit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, name, description, imageAssetIds });
    });
    return outfits;
}

function worldOutfits(entity) {
    return normalizeWorldOutfits(entity?.visuals?.outfits);
}

function createBlankWorldOutfit(entity, name = 'New outfit') {
    if (!entity || entity.type !== 'npc') return null;
    entity.visuals = isPlainObject(entity.visuals) ? entity.visuals : {};
    const outfits = worldOutfits(entity);
    if (outfits.length >= 30) return null;
    const outfit = {
        id: `outfit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        name: String(name || 'New outfit').trim().slice(0, 80) || 'New outfit',
        description: '',
        imageAssetIds: []
    };
    outfits.push(outfit);
    entity.visuals.outfits = outfits;
    if (!entity.visuals.currentOutfitId) {
        entity.visuals.currentOutfitId = outfit.id;
        entity.currentOutfit = '';
    }
    return outfit;
}

function scrollWorldOutfitListToEnd(list, axis = 'vertical') {
    if (!list) return;
    list.scrollTo(axis === 'horizontal'
        ? { left: list.scrollWidth, behavior: 'auto' }
        : { top: list.scrollHeight, behavior: 'auto' });
}

function focusWorldOutfitName(list, outfitId, axis = 'vertical') {
    if (!list) return;
    requestAnimationFrame(() => {
        const card = [...list.querySelectorAll('.world-inline-outfit-editor')]
            .find(node => node.dataset.outfitId === String(outfitId));
        if (!card) return;
        card.querySelector('.world-inline-outfit-name-input')?.focus({ preventScroll: true });
    });
}

function scrollWorldOutfitCardIntoView(list, outfitId, axis = 'vertical') {
    if (!list) return;
    const card = [...list.querySelectorAll('.world-inline-outfit-editor')]
        .find(node => node.dataset.outfitId === String(outfitId));
    card?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: axis === 'horizontal' ? 'nearest' : 'nearest' });
}

function refreshWorldInlineOutfitCards(container, entity) {
    if (!container || !entity) return;
    const activeId = String(entity.visuals?.currentOutfitId || '');
    container.querySelectorAll('.world-inline-outfit-editor').forEach(card => {
        const active = card.dataset.outfitId === activeId;
        card.classList.toggle('is-active', active);
        const selectButton = card.querySelector('.world-inline-outfit-select');
        if (selectButton) {
            selectButton.classList.toggle('is-current', active);
            selectButton.textContent = active ? 'Current outfit' : 'Wear this outfit';
        }
    });
}

function refreshWorldEntityPortraitPreview(container, world, entity) {
    const preview = container?.querySelector('.world-media-preview.is-portrait');
    if (!preview || !world || !entity) return;
    const source = worldNpcPortraitSource(world, entity);
    preview.style.backgroundImage = source ? `url('${cssUrl(source)}')` : '';
    preview.textContent = source ? '' : (entity.name || '?').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

function bindWorldOutfitDelete(button, onDelete) {
    if (!button) return;
    let armed = false;
    let resetTimer = 0;
    const reset = () => {
        armed = false;
        button.classList.remove('is-confirm');
        button.textContent = 'Delete';
    };
    button.onclick = event => {
        event.stopPropagation();
        if (!armed) {
            armed = true;
            button.classList.add('is-confirm');
            button.textContent = 'Confirm?';
            clearTimeout(resetTimer);
            resetTimer = setTimeout(reset, 2600);
            return;
        }
        clearTimeout(resetTimer);
        onDelete();
    };
}

function worldCurrentOutfit(entity) {
    const outfits = worldOutfits(entity);
    if (!outfits.length) return null;
    const id = String(entity?.visuals?.currentOutfitId || '');
    return outfits.find(outfit => outfit.id === id) || null;
}

function worldOutfitForAsset(entity, assetId) {
    const id = String(assetId || '');
    if (!id) return null;
    return worldOutfits(entity).find(outfit => (outfit.imageAssetIds || []).includes(id)) || null;
}

// Wearing an outfit is a canonical presentation change, not merely a text
// field edit.  If that outfit already has images, make its newest source the
// character's active visual while preserving the full image history.  The
// square profile frame is deliberately invalidated here and rebuilt lazily by
// the existing display-frame path; this prevents an old outfit's crop from
// being shown over the newly selected source.
function selectWorldOutfit(world, entity, outfitId, { preferImage = true } = {}) {
    if (!entity || entity.type !== 'npc') return null;
    entity.visuals = isPlainObject(entity.visuals) ? entity.visuals : {};
    const outfit = worldOutfits(entity).find(entry => entry.id === String(outfitId || ''));
    if (!outfit) return null;
    entity.visuals.outfits = worldOutfits(entity);
    entity.visuals.currentOutfitId = outfit.id;
    entity.currentOutfit = outfit.description;
    if (preferImage) {
        const imageId = [...(outfit.imageAssetIds || [])].reverse()
            .find(id => worldMediaSource(world, id));
        if (imageId) {
            entity.visuals.portraitAssetId = imageId;
            entity.visuals.portraitDisplayAssetId = '';
        }
    }
    return outfit;
}

function attachWorldVisualToOutfit(entity, assetId, outfitId = '') {
    if (!entity || entity.type !== 'npc' || !assetId) return null;
    entity.visuals = isPlainObject(entity.visuals) ? entity.visuals : {};
    const outfits = worldOutfits(entity);
    const selectedId = String(outfitId || '').trim()
        || String(entity.visuals.currentOutfitId || '').trim();
    const outfit = outfits.find(entry => entry.id === selectedId);
    if (!outfit) return null;
    outfit.imageAssetIds = [...new Set([...(outfit.imageAssetIds || []), String(assetId)])].slice(-30);
    entity.visuals.outfits = outfits;
    return outfit;
}

const WORLD_IMAGE_PRESET_ASPECTS = Object.freeze(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9']);
const WORLD_IMAGE_PRESET_FRAMINGS = Object.freeze(['auto', 'close-up', 'waist-up', 'three-quarter', 'full-body']);

// A saved preset is a complete visual brief: everything that changes HOW the
// photo looks (lighting, aesthetics, camera, style, aspect, framing) plus a
// title (its name) and a general description. Nothing that changes WHAT is
// in the photo ever enters a preset — that stays with the character.
function normalizeImageBriefPreset(raw) {
    const source = isPlainObject(raw) ? raw : {};
    const legacyGuide = normalizeWorldImageGuide(source);
    const category = source.category === 'framing' || source.category === 'look' ? source.category : 'look';
    return {
        ...legacyGuide,
        category,
        framingSpec: isPlainObject(source.framing) ? normalizeWorldImageFraming(source.framing, legacyGuide) : normalizeWorldImageFraming({
            mode: source.framing, shotComposition: legacyGuide.composition,
            cameraAngle: legacyGuide.cameraAngle, backgroundSetting: legacyGuide.backgroundSetting
        }, {}, {}),
        look: normalizeWorldImageLook(source.look, legacyGuide),
        description: String(source.description || '').trim().slice(0, 800),
        aspectRatio: WORLD_IMAGE_PRESET_ASPECTS.includes(String(source.aspectRatio || '')) ? String(source.aspectRatio) : '',
        framing: WORLD_IMAGE_PRESET_FRAMINGS.includes(String(source.framing || '')) ? String(source.framing) : '',
        structuredPatch: isPlainObject(source.structuredPatch) ? safeJsonClone(source.structuredPatch) : null
    };
}

// Saved visual-brief presets live with global settings so they can be imported
// into any world or selected for an individual visual. Old guide-only presets
// upgrade in place.
function normalizeImageGuidePresets(raw) {
    const source = isPlainObject(raw) ? raw : {};
    const presets = {};
    Object.entries(source).slice(0, 60).forEach(([name, value]) => {
        const label = String(name || '').trim().slice(0, 80);
        if (label && isPlainObject(value)) presets[label] = normalizeImageBriefPreset(value);
    });
    return presets;
}

function normalizeWorldPresentation(world) {
    if (!world || typeof world !== 'object') return null;
    const raw = isPlainObject(world.presentation) ? world.presentation : {};
    const mode = raw.mode === 'visual_novel' ? 'cinematic'
        : (['classic', 'cinematic'].includes(raw.mode) ? raw.mode : 'classic');
    // Preserve the object identity. World Studio controls keep a live reference
    // to this object while helpers such as worldMediaSummary() normalize it.
    // Replacing the object on every read orphaned those controls: a checked
    // toggle or generated map skin was written into the old object and then
    // silently disappeared on save/re-open.
    Object.assign(raw, {
        version: 1,
        enabled: raw.enabled === true,
        mode,
        playerCanOverride: raw.playerCanOverride !== false,
        artStyle: String(raw.artStyle || 'cinematic').slice(0, 80),
        artDirection: String(raw.artDirection || '').slice(0, 4000),
        accent: cssColor(raw.accent, '#E63946'),
        panelOpacity: livingClamp(raw.panelOpacity == null ? 88 : raw.panelOpacity, 35, 100),
        backgroundDim: livingClamp(raw.backgroundDim == null ? 68 : raw.backgroundDim, 0, 95),
        mapSkinAssetId: String(raw.mapSkinAssetId || '').slice(0, 160),
        // Legacy imageProvider/imageModel are the fresh-image pipeline. Keep
        // the aliases populated so existing world exports and integrations
        // remain readable while revisions gain their own explicit pipeline.
        newImageProvider: ['inherit', 'openrouter', 'gptproto', 'nanogpt', 'fal'].includes(raw.newImageProvider)
            ? raw.newImageProvider
            : (['inherit', 'openrouter', 'gptproto', 'nanogpt', 'fal'].includes(raw.imageProvider) ? raw.imageProvider : 'inherit'),
        newImageModel: String(raw.newImageModel || raw.imageModel || 'google/gemini-3.1-flash-lite-image').slice(0, 500),
        revisionImageProvider: ['same_as_new', 'inherit', 'openrouter', 'gptproto', 'nanogpt', 'fal'].includes(raw.revisionImageProvider)
            ? raw.revisionImageProvider
            : 'same_as_new',
        // Blank intentionally means "reuse the fresh-image model if it can
        // accept a source image". A separate revision model is only needed
        // when the fresh model is text-only or the author prefers another
        // image-to-image endpoint.
        revisionImageModel: String(raw.revisionImageModel || '').slice(0, 500),
        imageProvider: ['inherit', 'openrouter', 'gptproto', 'nanogpt', 'fal'].includes(raw.newImageProvider)
            ? raw.newImageProvider
            : (['inherit', 'openrouter', 'gptproto', 'nanogpt', 'fal'].includes(raw.imageProvider) ? raw.imageProvider : 'inherit'),
        imageModel: String(raw.newImageModel || raw.imageModel || 'google/gemini-3.1-flash-lite-image').slice(0, 500),
        falAdvancedSettings: normalizeFalAdvancedSettings(raw.falAdvancedSettings),
        imageGuide: normalizeWorldImageGuide(raw.imageGuide),
        imageIntent: normalizeWorldImageIntent(raw.imageIntent, '', ''),
        framing: normalizeWorldImageFraming(raw.framing, raw.imageGuide || {}, {}),
        look: normalizeWorldImageLook(raw.look, raw.imageGuide || {})
    });
    world.presentation = raw;
    if (!Array.isArray(world.mediaAssets)) world.mediaAssets = [];
    world.mediaAssets = world.mediaAssets.filter(asset => isPlainObject(asset)
        && typeof asset.id === 'string' && typeof asset.data === 'string').slice(0, WORLD_MEDIA_ASSET_LIMIT);
    return raw;
}

function worldMediaAsset(world, assetId) {
    if (!assetId) return null;
    normalizeWorldPresentation(world);
    return world.mediaAssets.find(asset => asset.id === assetId) || null;
}

function worldMediaSource(world, assetId) {
    return worldMediaAsset(world, assetId)?.data || '';
}

function worldMediaHash(data) {
    const text = String(data || '');
    let hash = 2166136261;
    const stride = Math.max(1, Math.floor(text.length / 4096));
    for (let i = 0; i < text.length; i += stride) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return `${text.length.toString(36)}_${(hash >>> 0).toString(36)}`;
}

function addWorldMediaAsset(world, data, kind, label = '', metadata = {}) {
    normalizeWorldPresentation(world);
    const source = String(data || '');
    if (!/^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i.test(source)) {
        throw new Error('World media must be embedded image data so exported worlds remain portable.');
    }
    if (source.length > WORLD_MEDIA_ASSET_BYTES_LIMIT) {
        throw new Error('The normalized image is still too large for a portable world asset.');
    }
    const hash = worldMediaHash(source);
    const existing = world.mediaAssets.find(asset => asset.hash === hash);
    if (existing) return existing.id;
    if (world.mediaAssets.length >= WORLD_MEDIA_ASSET_LIMIT) {
        throw new Error(`This world has reached the ${WORLD_MEDIA_ASSET_LIMIT.toLocaleString()} media-asset limit.`);
    }
    const existingBytes = world.mediaAssets.reduce((sum, asset) => sum + String(asset.data || '').length, 0);
    if (existingBytes + source.length > 512_000_000) {
        throw new Error('This world has reached the 512 MB portable-media limit. Remove unused visuals before adding more.');
    }
    const id = `media_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
    world.mediaAssets.push({
        id,
        kind: String(kind || 'image').slice(0, 80),
        label: String(label || '').slice(0, 240),
        data: source,
        hash,
        createdAt: Date.now(),
        generated: metadata.generated === true,
        model: String(metadata.model || '').slice(0, 500),
        prompt: String(metadata.prompt || '').slice(0, 8000),
        requestMetadata: isPlainObject(metadata.requestMetadata) ? safeJsonClone(metadata.requestMetadata) : null,
        exactRequest: isPlainObject(metadata.exactRequest) ? safeJsonClone(metadata.exactRequest) : null,
        resolvedStructuredPrompt: isPlainObject(metadata.resolvedStructuredPrompt)
            ? safeJsonClone(metadata.resolvedStructuredPrompt) : null,
        exactResolvedStructuredPrompt: isPlainObject(metadata.resolvedStructuredPrompt)
            ? safeJsonClone(metadata.resolvedStructuredPrompt) : null,
        providerResponseMetadata: isPlainObject(metadata.providerResponseMetadata)
            ? safeJsonClone(metadata.providerResponseMetadata) : null,
        authoredDocument: isPlainObject(metadata.authoredDocument)
            ? safeJsonClone(metadata.authoredDocument) : null,
        resolvedOutputPolicy: String(metadata.resolvedOutputPolicy || '').slice(0, 80),
        visualProjectId: String(metadata.visualProjectId || '').slice(0, 160),
        visualRevisionId: String(metadata.visualRevisionId || '').slice(0, 160),
        resolvedContext: String(metadata.resolvedContext || '').slice(0, 3000),
        outfitSnapshot: isPlainObject(metadata.outfitSnapshot) ? safeJsonClone(metadata.outfitSnapshot) : null,
        seed: Number.isInteger(metadata.seed) ? metadata.seed : null,
        generationOutcome: isPlainObject(metadata.generationOutcome)
            ? safeJsonClone(metadata.generationOutcome) : { transportStatus: 'completed', providerModeration: 'unknown', fulfillment: 'unknown', providerError: null, userMarkedMismatch: false },
        entityId: String(metadata.entityId || '').slice(0, 160),
        outfitId: String(metadata.outfitId || '').slice(0, 160),
        sourceAssetId: String(metadata.sourceAssetId || '').slice(0, 160)
    });
    ExperimentalWorldsVisualMediaHost.markWorldMediaChanged(world);
    return id;
}

function worldMediaReferenceIds(world) {
    const ids = new Set();
    const add = value => { if (typeof value === 'string' && value) ids.add(value); };
    add(world?.presentation?.mapSkinAssetId);
    (world?.locations || []).forEach(location => add(location?.visuals?.backgroundAssetId));
    (world?.entities || []).forEach(entity => {
        add(entity?.visuals?.portraitAssetId);
        add(entity?.visuals?.portraitDisplayAssetId);
        (entity?.visuals?.outfits || []).forEach(outfit =>
            (outfit?.imageAssetIds || []).forEach(add));
    });
    return ids;
}

function pruneWorldMediaAssets(world) {
    normalizeWorldPresentation(world);
    const referenced = worldMediaReferenceIds(world);
    const before = world.mediaAssets.length;
    world.mediaAssets = world.mediaAssets.filter(asset => referenced.has(asset.id));
    const removed = before - world.mediaAssets.length;
    if (removed) ExperimentalWorldsVisualMediaHost.markWorldMediaChanged(world);
    return removed;
}

function worldMediaSummary(world) {
    normalizeWorldPresentation(world);
    const bytes = world.mediaAssets.reduce((sum, asset) => sum + String(asset.data || '').length, 0);
    return { count: world.mediaAssets.length, bytes };
}

function formatByteSize(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}


