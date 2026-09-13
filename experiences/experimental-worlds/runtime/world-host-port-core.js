/*
 * Host helper port for the Experimental Worlds module runtime.
 *
 * In the 17.0 one-app runtime these functions were top-level app.js globals
 * that the Experimental units called ambiently.  The isolated 17.4 module
 * owns its whole call graph instead: every unit resolves these names inside
 * the module, never into the host script.  Bodies are ported verbatim from the
 * accepted 17.4 host baseline; the only deliberate changes are the module's
 * injected services and the ew- DOM namespace:
 *
 *   - state.chatContinuities / state.activePersonaId
 *       -> ExperimentalWorldsState / ExperimentalWorldsHost.activeSharedPersonaId()
 *   - chatOwnerId(): the host's opt-in chatMemoryContext service supplies the
 *       owner identity ({ ownerId, session }); without host wiring there is no
 *       chat linkage and the owner resolves to ''.
 *   - HordeVectorMemory  -> ExperimentalWorldsVectorMemory (module twin, same API)
 *   - openRouterModels   -> ExperimentalWorldsHost.modelCatalog()
 *   - stock w-model-info-* / w-reasoning-* DOM ids -> ew-w-* namespaced ids
 *
 * JSON clone/repair reuse the module's reviewed twins via call-time aliases.
 */

// --- shared chat-memory constants (stock app.js port) ---
const CHAT_MEMORY_VERSION = 2;
const CHAT_MEMORY_TYPES = new Set(['episode', 'fact', 'relationship', 'state', 'thread', 'biography', 'manual_summary']);
const CHAT_MEMORY_STATUSES = new Set(['active', 'resolved', 'superseded', 'disputed']);

// --- engine state extraction (stock app.js port) ---
const ENGINE_STATE_KEYS = Object.freeze([
    'location_id', 'location_introduced', 'location_state_updates', 'npc_moves', 'stat_changes',
    'stat_change_cause', 'capability_progress', 'transactions', 'checks', 'player_condition_updates', 'inventory_add',
    'inventory_remove', 'npc_observations', 'npc_introduced', 'npc_goal_updates',
    'npc_disposition_changes', 'npc_relationship_updates', 'npc_status_changes', 'schedule_updates',
    'world_events', 'faction_updates', 'economy_updates', 'player_preference_updates',
    'player_identity_update', 'threads_update', 'time_skip_minutes', 'ledger_update', 'quests_update', 'outfit_update'
]);

// --- slop substitution table (stock app.js port) ---
const SLOP_SUBSTITUTIONS = [
    [/\bministrations\b/gi, 'attentions'],
    [/\bbarely above a whisper\b/gi, 'low and quiet'],
    [/\ba testament to\b/gi, 'proof of'],
    [/\bunbeknownst to\b/gi, 'unknown to'],
    [/\bin that moment\b/gi, 'then'],
    [/\bfor what felt like an eternity\b/gi, 'for a long moment'],
    [/\b(?:let out|released) a breath (?:he|she|they) didn'?t (?:know|realize) (?:he|she|they) (?:was|were|had been) holding\b/gi, 'exhaled'],
    [/\bknuckles (?:turning|turned|went|whitened to) white\b/gi, 'grip tightening'],
    [/\b(emerald|sapphire|azure|amber|chocolate|obsidian|golden) orbs\b/gi, '$1 eyes'],
    [/\bmaybe, just maybe\b/gi, 'maybe'],
    [/\bthe air (?:was|grew|hung) thick with\b/gi, 'the air filled with'],
    [/\bheavy with anticipation\b/gi, 'tense'],
    [/\ba (?:mix|mixture|blend) of (\w+) and (\w+)/gi, '$1 and $2'],
    // Case-aware: sentence-initial "A shiver..." must yield "Her spine tingled."
    [/\b(a|A) shiver (?:ran|raced|shot|went) (?:up|down) (her|his|their|my|your) spine\b/g,
        (m, art, pron) => (art === 'A' ? pron.charAt(0).toUpperCase() + pron.slice(1) : pron) + ' spine tingled'],
    [/\ban unreadable expression\b/gi, 'a guarded expression']
];

// --- nanoGPT reference profile sets (stock app.js port) ---
const NANOGPT_SINGLE_REFERENCE_MODELS = new Set([
    'flux-dev-image-to-image', 'ghiblify', 'gemini-flash-edit', 'hidream-edit',
    'bagel', 'sdxl-arlimix-v1', 'upscaler'
]);

const NANOGPT_MULTI_REFERENCE_MODELS = new Set([
    'flux-kontext', 'flux-kontext/dev', 'gpt-4o-image', 'gpt-image-1'
]);

// Module-local continuity migration flag (read by persistence owners).
let chatMemoryMigrationDirty = false;

// --- reviewed module twins, exposed under their stock names for the ported
//     bodies (call-time resolution, so unit order never matters). ---
function safeJsonClone(value) { return experimentalSafeJsonClone(value); }
function safeParseJSONRepair(raw) { return experimentalSafeParseJSONRepair(raw); }
function dirtyJSONRepair(raw) { return experimentalDirtyJSONRepair(raw); }

function memoryDedupeKey(memory) {
    if (memory?.key) return `${memory.type || 'memory'}:${String(memory.key).toLocaleLowerCase()}`;
    return String(memory?.text || memory?.summary || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 240);
}

function requirePlainObject(value, label) {
    if (!experimentalIsPlainObject(value)) throw new Error(`${label} must be an object`);
}

function requireString(value, label, { optional = false, max = 200000 } = {}) {
    if (optional && (value === undefined || value === null)) return;
    if (typeof value !== 'string') throw new Error(`${label} must be text`);
    if (value.length > max) throw new Error(`${label} is too large`);
}

function requireSafeId(value, label, { optional = false } = {}) {
    if (optional && (value === undefined || value === null || value === '')) return;
    requireString(value, label, { max: 160 });
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`${label} contains unsupported characters`);
}

function requireArray(value, label, { optional = false, max = 5000 } = {}) {
    if (optional && (value === undefined || value === null)) return;
    if (!Array.isArray(value)) throw new Error(`${label} must be a list`);
    if (value.length > max) throw new Error(`${label} contains too many entries`);
}

function validateLorebook(value, label = 'Lorebook') {
    requireArray(value, label, { optional: true, max: 2000 });
    (value || []).forEach((entry, index) => {
        requirePlainObject(entry, `${label} entry ${index + 1}`);
        requireString(entry.keyword, `${label} entry ${index + 1} keyword`, { optional: true, max: 2000 });
        requireString(entry.text, `${label} entry ${index + 1} text`, { optional: true });
    });
}

function validatePresetData(value, label = 'Preset') {
    requirePlainObject(value, label);
    requireArray(value.prompts, `${label} prompts`, { max: 1000 });
    value.prompts.forEach((prompt, index) => {
        requirePlainObject(prompt, `${label} prompt ${index + 1}`);
        ['name', 'content', 'prompt', 'identifier', 'role'].forEach(key =>
            requireString(prompt[key], `${label} prompt ${index + 1} ${key}`, { optional: true }));
    });
    return safeJsonClone(value);
}

function validateWorldData(value, label = 'World') {
    requirePlainObject(value, label);
    requireString(value.name, `${label} name`, { max: 300 });
    requireSafeId(value.id, `${label} id`, { optional: true });
    ['description', 'dmPrompt', 'intro', 'model', 'authorNote'].forEach(key =>
        requireString(value[key], `${label} ${key}`, { optional: true }));
    requireString(value.banner, `${label} banner`, { optional: true, max: 2_000_000 });
    requireArray(value.locations, `${label} locations`, { max: 2000 });
    if (!value.locations.length) throw new Error(`${label} needs at least one location`);
    value.locations.forEach((loc, index) => {
        requirePlainObject(loc, `${label} location ${index + 1}`);
        requireString(loc.name, `${label} location ${index + 1} name`, { max: 300 });
        requireSafeId(loc.id, `${label} location ${index + 1} id`, { optional: true });
        ['description', 'region', 'mapType', 'parentLocationId', 'mapFloor'].forEach(key =>
            requireString(loc[key], `${label} location ${index + 1} ${key}`, { optional: true }));
        if (loc.visuals !== undefined) {
            requirePlainObject(loc.visuals, `${label} location ${index + 1} visuals`);
            ['backgroundAssetId', 'backgroundPosition'].forEach(key =>
                requireString(loc.visuals[key], `${label} location ${index + 1} visuals ${key}`, { optional: true, max: 200 }));
        }
        requireArray(loc.exits, `${label} location ${index + 1} exits`, { optional: true, max: 500 });
        (loc.exits || []).forEach((exit, exitIndex) => {
            if (typeof exit === 'string') return requireString(exit, `${label} location ${index + 1} exit ${exitIndex + 1}`, { max: 1000 });
            requirePlainObject(exit, `${label} location ${index + 1} exit ${exitIndex + 1}`);
            requireString(exit.text, `${label} location ${index + 1} exit ${exitIndex + 1} text`, { max: 1000 });
            if (exit.travelTime !== undefined && (!Number.isFinite(Number(exit.travelTime)) || Number(exit.travelTime) < 0)) {
                throw new Error(`${label} location ${index + 1} exit ${exitIndex + 1} travel time is invalid`);
            }
        });
    });
    requireArray(value.entities, `${label} entities`, { optional: true, max: 5000 });
    (value.entities || []).forEach((entity, index) => {
        requirePlainObject(entity, `${label} entity ${index + 1}`);
        requireString(entity.name, `${label} entity ${index + 1} name`, { max: 300 });
        requireSafeId(entity.id, `${label} entity ${index + 1} id`, { optional: true });
        ['description', 'persona', 'type', 'startLocation', 'homeLocation', 'goal', 'agenda', 'goalAutonomy'].forEach(key =>
            requireString(entity[key], `${label} entity ${index + 1} ${key}`, { optional: true }));
        if (entity.visuals !== undefined) {
            requirePlainObject(entity.visuals, `${label} entity ${index + 1} visuals`);
            ['portraitAssetId', 'portraitPosition', 'dialogueColor'].forEach(key =>
                requireString(entity.visuals[key], `${label} entity ${index + 1} visuals ${key}`, { optional: true, max: 200 }));
        }
        requireArray(entity.goalSteps, `${label} entity ${index + 1} goal steps`, { optional: true, max: 20 });
        (entity.goalSteps || []).forEach((step, stepIndex) =>
            requireString(step, `${label} entity ${index + 1} goal step ${stepIndex + 1}`, { max: 1000 }));
        requireArray(entity.secrets, `${label} entity ${index + 1} secrets`, { optional: true, max: 1000 });
        (entity.secrets || []).forEach((secret, secretIndex) => {
            requirePlainObject(secret, `${label} entity ${index + 1} secret ${secretIndex + 1}`);
            ['label', 'hint', 'truth'].forEach(key => requireString(secret[key], `${label} entity ${index + 1} secret ${secretIndex + 1} ${key}`, { optional: true }));
        });
        requireArray(entity.schedule, `${label} entity ${index + 1} schedule`, { optional: true, max: 1000 });
        (entity.schedule || []).forEach((block, blockIndex) => {
            requirePlainObject(block, `${label} entity ${index + 1} schedule ${blockIndex + 1}`);
            ['time', 'locationId', 'activity'].forEach(key => requireString(block[key], `${label} entity ${index + 1} schedule ${blockIndex + 1} ${key}`, { optional: true, max: 1000 }));
        });
    });
    if (value.presentation !== undefined) {
        requirePlainObject(value.presentation, `${label} presentation`);
        ['mode', 'artStyle', 'artDirection', 'accent', 'mapSkinAssetId', 'imageProvider', 'imageModel'].forEach(key =>
            requireString(value.presentation[key], `${label} presentation ${key}`, { optional: true, max: key === 'artDirection' ? 4000 : 500 }));
        if (value.presentation.enabled !== undefined && typeof value.presentation.enabled !== 'boolean') {
            throw new Error(`${label} presentation enabled setting is invalid`);
        }
    }
    requireArray(value.mediaAssets, `${label} media assets`, { optional: true, max: WORLD_MEDIA_ASSET_LIMIT });
    let mediaBytes = 0;
    (value.mediaAssets || []).forEach((asset, index) => {
        requirePlainObject(asset, `${label} media asset ${index + 1}`);
        requireSafeId(asset.id, `${label} media asset ${index + 1} id`);
        ['kind', 'label', 'hash', 'model', 'prompt'].forEach(key =>
            requireString(asset[key], `${label} media asset ${index + 1} ${key}`, { optional: true, max: key === 'prompt' ? 8000 : 500 }));
        requireString(asset.data, `${label} media asset ${index + 1} image data`, { max: WORLD_MEDIA_ASSET_BYTES_LIMIT });
        if (!/^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i.test(asset.data)) {
            throw new Error(`${label} media asset ${index + 1} is not an embedded image`);
        }
        mediaBytes += asset.data.length;
        if (mediaBytes > 512_000_000) throw new Error(`${label} embedded media is larger than 512 MB`);
    });
    validateLorebook(value.lorebook, `${label} lorebook`);
    if (value.hudConfig !== undefined) {
        requirePlainObject(value.hudConfig, `${label} HUD settings`);
        requireArray(value.hudConfig.stats, `${label} HUD stats`, { optional: true, max: 500 });
        (value.hudConfig.stats || []).forEach((stat, index) => {
            requirePlainObject(stat, `${label} HUD stat ${index + 1}`);
            requireSafeId(stat.id, `${label} HUD stat ${index + 1} id`);
            requireString(stat.name, `${label} HUD stat ${index + 1} name`, { max: 300 });
            requireString(stat.color, `${label} HUD stat ${index + 1} color`, { optional: true, max: 100 });
            ['value', 'min', 'max'].forEach(key => {
                if (stat[key] !== undefined && (!Number.isFinite(Number(stat[key])) || Math.abs(Number(stat[key])) > 1e12)) {
                    throw new Error(`${label} HUD stat ${index + 1} ${key} is invalid`);
                }
            });
        });
    }
    if (value.gameRules !== undefined) {
        requirePlainObject(value.gameRules, `${label} game rules`);
        ['profileId', 'vitalStatId', 'currencyStatId', 'currencyName', 'zeroHpMode'].forEach(key =>
            requireString(value.gameRules[key], `${label} game rules ${key}`, { optional: true, max: 100 }));
        if (value.gameRules.profileId !== undefined
            && value.gameRules.profileId !== 'custom'
            && !Object.prototype.hasOwnProperty.call(WORLD_RULE_PROFILES, value.gameRules.profileId)) {
            throw new Error(`${label} game rules profile is invalid`);
        }
        if (value.gameRules.modules !== undefined) {
            requirePlainObject(value.gameRules.modules, `${label} game rule modules`);
            Object.entries(value.gameRules.modules).forEach(([key, enabled]) => {
                if (!WORLD_RULE_MODULE_KEYS.includes(key) || typeof enabled !== 'boolean') {
                    throw new Error(`${label} game rule module ${key} is invalid`);
                }
            });
        }
        if (value.gameRules.zeroHpMode !== undefined && !['fail_forward', 'lethal'].includes(value.gameRules.zeroHpMode)) {
            throw new Error(`${label} game rules zero HP mode is invalid`);
        }
    }
    return safeJsonClone(value);
}

function updateContextSliderUI(sliderId, valId, badgeId) {
    const slider = document.getElementById(sliderId);
    const valSpan = document.getElementById(valId);
    const badgeSpan = document.getElementById(badgeId);
    if (!slider || !valSpan || !badgeSpan) return;

    const val = parseInt(slider.value);
    valSpan.textContent = val.toLocaleString();

    const maxVal = parseInt(slider.max) || 102400;

    let badgeText = '';
    let badgeColor = '';
    if (val <= 8192) {
        badgeText = '♻️ Eco / Cost Saver';
        badgeColor = 'var(--success)';
    } else if (val <= Math.max(16384, Math.round(maxVal * 0.15))) {
        badgeText = '⚖️ Balanced (Recommended)';
        badgeColor = 'var(--chat-italic-color, #FF8C42)';
    } else if (val <= Math.max(32768, Math.round(maxVal * 0.5))) {
        badgeText = '📖 Deep Narrative';
        badgeColor = '#60A5FA';
    } else {
        badgeText = '🧠 Maximum Context (Expensive)';
        badgeColor = 'var(--red)';
    }
    badgeSpan.textContent = badgeText;
    badgeSpan.style.color = badgeColor;
}

function populateModelInfoCard(model, prefix = '') {
    const els = getModelInfoElements(prefix);
    if (!els.card) return;
    els.card.classList.remove('hidden');

    if (els.nameEl) els.nameEl.textContent = model.name || model.id;
    if (els.idEl) els.idEl.textContent = model.id;

    // Run dynamic verification layer
    if (els.badge) {
        const context = model.context_length || 8192;
        const params = model.supported_parameters || [];
        const pricing = model.pricing || {};
        const promptPrice = Number.isFinite(parseFloat(pricing.prompt)) ? (parseFloat(pricing.prompt) * 1000000).toFixed(2) : '—';
        const completionPrice = Number.isFinite(parseFloat(pricing.completion)) ? (parseFloat(pricing.completion) * 1000000).toFixed(2) : '—';

        const hasTools = params.includes('tools') || params.includes('tool_choice');
        const hasJson = params.includes('response_format') || params.includes('structured_outputs');

        if (els.detailsContext) els.detailsContext.textContent = `👁️ Context: ${Math.round(context / 1000)}k tokens`;
        if (els.detailsPrice) els.detailsPrice.textContent = `💰 $${promptPrice} / $${completionPrice} (per M)`;

        if (els.detailsTools) {
            if (hasTools) {
                els.detailsTools.textContent = "✅ Tool Calling";
                els.detailsTools.className = "verification-detail-item supported";
            } else {
                els.detailsTools.textContent = "❌ Tool Calling";
                els.detailsTools.className = "verification-detail-item unsupported";
            }
        }

        if (els.detailsJson) {
            if (hasJson) {
                els.detailsJson.textContent = "✅ Structured JSON";
                els.detailsJson.className = "verification-detail-item supported";
            } else {
                els.detailsJson.textContent = "❌ Structured JSON";
                els.detailsJson.className = "verification-detail-item unsupported";
            }
        }

        // Tier Grade Styling
        els.card.classList.remove('tier-elite', 'tier-capable', 'tier-weak');
        if (hasTools && hasJson && context >= 32000) {
            els.badge.textContent = "Elite Agent (Class S)";
            els.badge.className = "verification-badge badge-elite";
            els.card.classList.add('tier-elite');
        } else if (hasTools || hasJson) {
            els.badge.textContent = "Capable (Class A)";
            els.badge.className = "verification-badge badge-capable";
            els.card.classList.add('tier-capable');
        } else {
            els.badge.textContent = "Not Recommended (Class C)";
            els.badge.className = "verification-badge badge-weak";
            els.card.classList.add('tier-weak');
        }
    }

    if (els.badges) {
        els.badges.innerHTML = '';
        const supportedParams = model.supported_parameters || [];
        if (supportedParams.includes('reasoning')) {
            els.badges.innerHTML += '<span class="model-badge model-badge-reasoning">🧠 Reasoning</span>';
        }
        if (model.architecture?.input_modalities?.includes('image')) {
            els.badges.innerHTML += '<span class="model-badge model-badge-vision">👁 Vision</span>';
        }
        if (model.top_provider?.is_moderated) {
            els.badges.innerHTML += '<span class="model-badge model-badge-moderated">Moderated</span>';
        } else {
            els.badges.innerHTML += '<span class="model-badge model-badge-unmoderated">Unmoderated</span>';
        }
    }

    if (els.paramsList) {
        els.paramsList.innerHTML = '';
        const supportedParams = model.supported_parameters || [];
        const relevantParams = ['temperature', 'top_p', 'top_k', 'min_p', 'frequency_penalty', 'presence_penalty', 'repetition_penalty', 'max_tokens', 'reasoning', 'reasoning_effort', 'include_reasoning', 'seed', 'stop'];
        relevantParams.forEach(p => {
            const tag = document.createElement('span');
            tag.className = 'model-param-tag' + (supportedParams.includes(p) ? ' active' : ' unsupported');
            tag.textContent = p;
            els.paramsList.appendChild(tag);
        });
    }
}

function newChatMemoryId(prefix = 'memory') {
    const uuid = globalThis.crypto?.randomUUID?.();
    return uuid ? `${prefix}_${uuid}` : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeMemoryStringList(value, max = 100) {
    return [...new Set((Array.isArray(value) ? value : [])
        .map(item => String(item || '').trim()).filter(Boolean))].slice(0, max);
}

function continuityIdFor(ownerId) {
    return newChatMemoryId(`continuity_${String(ownerId || 'chat').replace(/[^A-Za-z0-9_-]/g, '_')}`);
}

function normalizeChatMemoryRecord(raw, defaults = {}) {
    const source = experimentalIsPlainObject(raw) ? raw : { text: String(raw || '') };
    const text = String(source.text || source.summary || defaults.text || '').trim().slice(0, 12000);
    const type = CHAT_MEMORY_TYPES.has(source.type) ? source.type
        : CHAT_MEMORY_TYPES.has(defaults.type) ? defaults.type : 'episode';
    const status = CHAT_MEMORY_STATUSES.has(source.status) ? source.status : 'active';
    const createdAt = Math.max(0, Number(source.createdAt) || Number(defaults.createdAt) || Date.now());
    const record = {
        id: String(source.id || defaults.id || newChatMemoryId('memory')).slice(0, 180),
        type,
        key: String(source.key || defaults.key || '').trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}:._-]+/gu, '_').slice(0, 240),
        text,
        scope: ['timeline', 'relationship', 'character', 'canon'].includes(source.scope)
            ? source.scope : (defaults.scope || 'timeline'),
        status,
        importance: Math.max(0, Math.min(1, Number(source.importance ?? defaults.importance ?? 0.55))),
        confidence: Math.max(0, Math.min(1, Number(source.confidence ?? defaults.confidence ?? 0.85))),
        pinned: source.pinned === true,
        continuityId: String(source.continuityId || defaults.continuityId || '').slice(0, 180),
        personaId: String(source.personaId || defaults.personaId || '').slice(0, 180),
        characterIds: normalizeMemoryStringList(source.characterIds || defaults.characterIds),
        witnessedBy: normalizeMemoryStringList(source.witnessedBy || defaults.witnessedBy),
        sourceSessionId: String(source.sourceSessionId || defaults.sourceSessionId || '').slice(0, 180),
        sourceMessageIds: normalizeMemoryStringList(source.sourceMessageIds || defaults.sourceMessageIds, 500),
        startIndex: Number.isFinite(Number(source.startIndex)) ? Math.max(0, Number(source.startIndex)) : defaults.startIndex,
        endIndex: Number.isFinite(Number(source.endIndex)) ? Math.max(0, Number(source.endIndex)) : defaults.endIndex,
        createdAt,
        updatedAt: Math.max(createdAt, Number(source.updatedAt) || createdAt)
    };
    if (Array.isArray(source.embedding) && source.embedding.length) {
        record.embedding = source.embedding;
        record.embeddingNamespace = String(source.embeddingNamespace || defaults.embeddingNamespace || ExperimentalWorldsVectorMemory.namespace());
    }
    return record;
}

function ensureChatMessageIds(session) {
    if (!session || !Array.isArray(session.messages)) return;
    session.messages.forEach((message, index) => {
        if (!message.id) {
            message.id = `${session.id || 'session'}_message_${index}_${Date.now().toString(36)}`;
            chatMemoryMigrationDirty = true;
        }
    });
}

function ensureChatContinuity(session, ownerId = chatOwnerId()) {
    if (!session) return null;
    if (!experimentalIsPlainObject(ExperimentalWorldsState.chatContinuities)) ExperimentalWorldsState.chatContinuities = {};
    if (!session.continuityId) {
        session.continuityId = continuityIdFor(ownerId);
        chatMemoryMigrationDirty = true;
    }
    let continuity = ExperimentalWorldsState.chatContinuities[session.continuityId];
    if (!experimentalIsPlainObject(continuity)) {
        continuity = {
            id: session.continuityId,
            version: CHAT_MEMORY_VERSION,
            ownerId: String(ownerId || ''),
            personaId: String(ExperimentalWorldsHost.activeSharedPersonaId() || ''),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            records: []
        };
        ExperimentalWorldsState.chatContinuities[session.continuityId] = continuity;
        chatMemoryMigrationDirty = true;
    }
    continuity.version = CHAT_MEMORY_VERSION;
    continuity.ownerId = String(continuity.ownerId || ownerId || '');
    continuity.records = (Array.isArray(continuity.records) ? continuity.records : [])
        .map(record => normalizeChatMemoryRecord(record, { continuityId: continuity.id }))
        .filter(record => record.text);
    return continuity;
}

function upsertContinuityMemoryRecords(continuity, inputs, defaults = {}) {
    if (!continuity) return [];
    const inserted = [];
    continuity.records = Array.isArray(continuity.records) ? continuity.records : [];
    for (const input of inputs || []) {
        const record = normalizeChatMemoryRecord(input, { ...defaults, continuityId: continuity.id });
        if (!record.text) continue;
        const duplicate = continuity.records.find(existing =>
            existing.id === record.id
            || (existing.sourceSessionId === record.sourceSessionId
                && existing.startIndex === record.startIndex && existing.endIndex === record.endIndex
                && memoryDedupeKey(existing) === memoryDedupeKey(record)));
        if (duplicate) continue;

        if (record.key && ['fact', 'relationship', 'state', 'thread'].includes(record.type)) {
            continuity.records.forEach(existing => {
                if (existing.status === 'active' && existing.type === record.type && existing.key === record.key) {
                    existing.status = 'superseded';
                    existing.updatedAt = record.updatedAt;
                }
            });
        }
        continuity.records.push(record);
        inserted.push(record);
    }
    continuity.updatedAt = Date.now();
    return inserted;
}

function extractDirectorNotes(text) {
    if (!text) return '';
    const source = String(text);
    const details = [...source.matchAll(/<details(?:\s[^>]*)?>[\s\S]*?(?:<\/details>|$)/gi)]
        .map(match => match[0])
        .reverse()
        .find(block => /<summary>\s*(?:🎬\s*)?Plot Momentum\s*<\/summary>/i.test(block));
    if (details) return details.slice(0, 5000);
    const tracked = source.match(/<plot_tracking_module\b[^>]*>[\s\S]*?(?:<\/plot_tracking_module>|$)/i);
    return tracked ? tracked[0].slice(0, 5000) : '';
}

function extractInlineWorldStatePayload(text) {
    const source = String(text || '');
    if (!source) return null;
    const hasEngineKey = value => value && typeof value === 'object' && !Array.isArray(value)
        && ENGINE_STATE_KEYS.some(key => Object.prototype.hasOwnProperty.call(value, key));

    // The explicit channel opened for models that never emit tool calls. It is
    // unambiguous, so it wins over anything found loose in the prose.
    const tagged = source.match(/<world_state_json>\s*([\s\S]*?)\s*<\/world_state_json>/i);
    if (tagged) {
        const parsed = safeParseJSONRepair(tagged[1]);
        if (hasEngineKey(parsed)) return parsed;
    }

    // Walk every '{' and take the first balanced object that parses and carries
    // engine keys. String-aware so braces inside prose values don't derail it.
    for (let start = source.indexOf('{'); start >= 0; start = source.indexOf('{', start + 1)) {
        let depth = 0;
        let quote = null;
        let escaped = false;
        for (let i = start; i < source.length; i++) {
            const char = source[i];
            if (quote) {
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === quote) quote = null;
                continue;
            }
            if (char === '"' || char === "'") { quote = char; continue; }
            if (char === '{') depth++;
            else if (char === '}' && --depth === 0) {
                const candidate = source.slice(start, i + 1);
                try {
                    const parsed = safeParseJSONRepair(candidate);
                    if (!parsed) throw new Error('Not JSON');
                    if (hasEngineKey(parsed)) return parsed;
                    // Providers sometimes wrap it: {"name":"update_world_state","arguments":{...}}
                    const nested = parsed?.arguments ?? parsed?.parameters ?? parsed?.args;
                    if (typeof nested === 'string') {
                        const inner = safeParseJSONRepair(nested);
                        if (hasEngineKey(inner)) return inner;
                    } else if (hasEngineKey(nested)) {
                        return nested;
                    }
                } catch (error) { /* not valid JSON — keep scanning */ }
                break;
            }
        }
    }
    return null;
}

function accumulateWorldToolCall(streamedToolCalls, tc) {
    if (!tc || typeof tc !== 'object') return;
    let key = Number.isInteger(tc.index) ? `index:${tc.index}` : '';
    if (!key && tc.id) {
        const existingById = [...streamedToolCalls.entries()].find(([, call]) => call.id === tc.id);
        key = existingById?.[0] || `id:${tc.id}`;
    }
    if (!key) {
        const calls = [...streamedToolCalls.entries()];
        if (calls.length === 1) key = calls[0][0];
        else {
            const name = String(tc.function?.name || '');
            const compatible = calls.filter(([, call]) => !name || !call.function.name || call.function.name === name);
            key = compatible.length === 1 ? compatible[0][0] : `anonymous:${streamedToolCalls.size}`;
        }
    }
    const existing = streamedToolCalls.get(key) || {
        id: tc.id || `call_${streamedToolCalls.size + 1}`,
        type: 'function',
        function: { name: '', arguments: '' }
    };
    if (tc.id) existing.id = tc.id;
    if (tc.function?.name) existing.function.name = tc.function.name;
    if (tc.function?.arguments !== undefined && tc.function?.arguments !== null) {
        const fragment = typeof tc.function.arguments === 'string'
            ? tc.function.arguments : JSON.stringify(tc.function.arguments);
        // Some OpenAI-compatible providers resend the entire arguments object
        // on every delta instead of sending fragments. Prefer the complete
        // object rather than producing `{"x":1}{"x":1}`.
        if (fragment && existing.function.arguments && safeParseJSONRepair(fragment)
            && fragment.trim().startsWith('{')) {
            existing.function.arguments = fragment;
        } else if (fragment && fragment !== existing.function.arguments) {
            existing.function.arguments += fragment;
        }
    }
    streamedToolCalls.set(key, existing);
}

function parseWorldToolArguments(raw) {
    let parsed = raw && typeof raw === 'object' ? raw : safeParseJSONRepair(raw || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Tool arguments were not a valid JSON object.');
    }
    const nested = parsed.arguments ?? parsed.parameters ?? parsed.args;
    if (!ENGINE_STATE_KEYS.some(key => Object.prototype.hasOwnProperty.call(parsed, key)) && nested) {
        const unwrapped = typeof nested === 'string' ? safeParseJSONRepair(nested) : nested;
        if (unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped)) parsed = unwrapped;
    }
    return parsed;
}

function resolveWorldActorId(world, sess, actorRef) {
    const raw = String(actorRef || '').trim();
    if (!raw) return null;
    if (/^(?:player|user|pc|protagonist)$/i.test(raw)) return 'player';
    return resolveNpcId(world, raw, sess);
}

function buildWorldSceneFrame(world, sess) {
    const present = sessionNpcs(world, sess)
        .filter(npc => isNpcActive(sess.entityStates?.[npc.id])
            && sess.entityStates?.[npc.id]?.location === sess.playerLocation)
        .map(npc => npc.id)
        .sort();
    const activities = {
        player: {
            activity: String(sess.playerActivity || '').slice(0, 180),
            interacting_with: []
        }
    };
    present.forEach(id => {
        const entState = sess.entityStates?.[id] || {};
        activities[id] = {
            activity: String(entState.currentActivity || entState.activity || '').slice(0, 180),
            interacting_with: (Array.isArray(entState.interactingWith) ? entState.interactingWith : [])
                .map(ref => resolveWorldActorId(world, sess, ref)).filter(Boolean).slice(0, 12)
        };
    });
    return {
        player_location_id: String(sess.playerLocation || ''),
        present_character_ids: present,
        activities
    };
}

function buildKernelLocationManifest(world, sess, userInput) {
    const view = typeof worldForSession === 'function' ? worldForSession(world, sess) : world;
    const locations = view.locations;
    const kernel = normalizeWorldKernelConfig(world);
    if (!kernel.enabled || locations.length <= kernel.sceneLocationLimit) {
        return locations.map(location => `  - "${location.name}" → id: "${location.id}"`).join('\n');
    }
    const selected = new Map();
    const add = (location, priority, reason) => {
        if (!location?.id) return;
        const prior = selected.get(location.id);
        if (!prior || priority > prior.priority) selected.set(location.id, { location, priority, reason });
    };
    const current = getLocationRef(view, sess?.playerLocation);
    add(current, 1000, 'current');

    // Two-hop graph neighborhood: enough for sensible movement without shipping
    // a 300-place town bible on a conversation inside one kitchen.
    let frontier = current ? [current] : [];
    const visited = new Set(frontier.map(location => location.id));
    for (let depth = 1; depth <= 2; depth++) {
        const next = [];
        frontier.forEach(location => {
            (location.exits || []).forEach(exit => {
                const target = resolveWorldExitTarget(view, exit);
                if (!target) return;
                add(target, 850 - depth * 100, `hop_${depth}`);
                if (!visited.has(target.id)) { visited.add(target.id); next.push(target); }
            });
            const parent = resolveWorldContainmentParent(view, location);
            if (parent) add(parent, 820 - depth * 80, 'container');
            locations.filter(candidate => candidate.parentLocationId === location.id)
                .slice(0, 12).forEach(child => add(child, 760 - depth * 60, 'contained'));
        });
        frontier = next;
    }

    const input = normalizeLocationSearchText(userInput);
    if (input) {
        locations.forEach(location => {
            const name = normalizeLocationSearchText(location.name);
            const id = normalizeLocationSearchText(location.id);
            if ((name.length > 2 && ` ${input} `.includes(` ${name} `))
                || (id.length > 2 && ` ${input} `.includes(` ${id} `))) add(location, 980, 'player_reference');
        });
        const movementPhrase = extractUserMovementTarget(userInput);
        const movementTarget = movementPhrase
            ? resolveWorldMovementTarget(typeof worldForSession === 'function' ? worldForSession(world, sess) : world, sess.playerLocation, movementPhrase) : null;
        if (movementTarget) add(movementTarget, 990, 'movement_target');
    }

    (sess?.quests || []).filter(quest => quest.status === 'active').slice(0, 12).forEach(quest => {
        (quest.objectives || []).forEach(objective => {
            const target = getLocationRef(view, objective.target || objective.locationId || objective.location_id);
            if (target) add(target, 620, 'quest');
        });
    });
    (sess?.scheduledEvents || []).filter(event => event.status === 'scheduled').slice(0, 10).forEach(event => {
        const location = getLocationRef(view, event.locationId || event.location_id);
        if (location) add(location, 590, 'scheduled');
    });

    const chosen = [...selected.values()]
        .sort((a, b) => b.priority - a.priority || String(a.location.name).localeCompare(String(b.location.name)))
        .slice(0, kernel.sceneLocationLimit);
    const omitted = Math.max(0, locations.length - chosen.length);
    return chosen.map(({ location, reason }) => `  - "${location.name}" → id: "${location.id}" [${reason}]`).join('\n')
        + (omitted ? `\n  - … ${omitted} distant locations omitted by World Kernel; referenced places are loaded on demand.` : '');
}

function compactWorldToolContract(tools) {
    const strip = value => {
        if (Array.isArray(value)) return value.forEach(strip);
        if (!experimentalIsPlainObject(value)) return;
        delete value.description;
        delete value.examples;
        delete value.default;
        Object.values(value).forEach(strip);
    };
    tools.forEach(tool => {
        const name = tool.function?.name;
        strip(tool.function?.parameters);
        if (tool.function) tool.function.description = name === 'commit_world_turn'
            ? 'Commit the canonical ending scene and only completed durable changes.'
            : 'Reveal one gated secret that the player actually investigated.';
    });
    return tools;
}

function stripSlop(text) {
    if (!text) return text;
    let t = text;
    let hits = 0;
    for (const [pattern, replacement] of SLOP_SUBSTITUTIONS) {
        if (typeof replacement === 'function') {
            t = t.replace(pattern, (...args) => { hits++; return replacement(...args); });
        } else {
            t = t.replace(pattern, (...args) => { hits++; return replacement.replace(/\$(\d)/g, (_, n) => args[n] || ''); });
        }
    }
    if (hits > 0) console.log(`Slop Stripper: ${hits} substitution(s)`);
    return t.replace(/ {2,}/g, ' ');
}

function gptProtoImageReferenceProfile(model) {
    const id = String(model?.id || model || '').toLowerCase();
    const evidence = [
        model?.description,
        model?.task,
        model?.type,
        ...(Array.isArray(model?.tasks) ? model.tasks : []),
        ...(Array.isArray(model?.capabilities) ? model.capabilities : [])
    ].map(value => String(value || '').toLowerCase()).join(' ');
    if (/^gpt-image-(?:1|2)(?:[.-]|$)/.test(id)) return { max: 16, transport: 'openai-edit' };
    if (/^gpt-4o-image(?:-vip)?$/.test(id)) return { max: 1, transport: 'openai-edit' };
    if (id === 'grok-imagine-image' || /grok.*imagine.*image/.test(id)) return { max: 1, transport: 'openai-generation' };
    if (/^wan-2\.5(?:-preview)?$/.test(id)) return { max: 1, transport: 'seedream-async', vendor: 'alibaba' };
    if (/dola-seedream-5-0-pro/.test(id)) return { max: 10, transport: 'seedream-async', vendor: 'doubao' };
    if (/(?:doubao-)?seedream-5-0/.test(id)) return { max: 10, transport: 'seedream-async', vendor: 'bytedance' };
    if (/(?:doubao-)?seedream-(?:4|3)[-.]/.test(id) || /seededit/.test(id)) {
        return { max: 10, transport: 'seedream-v3' };
    }
    if (/gemini-3(?:\.1)?-.*image/.test(id)) return { max: 14, transport: 'gemini-native' };
    if (/gemini-2\.5-.*image/.test(id)) return { max: 3, transport: 'gemini-native' };
    if (/flux.*(?:kontext|fill|redux)/.test(id)) return { max: 1, transport: 'public-url-prompt' };
    if (/(?:image[-_ ]?edit|img2img|i2i)/.test(id)
        || /multi-reference|reference images?|image[- ]to[- ]image|image edit/.test(evidence)) {
        return { max: 1, transport: 'documented-edit' };
    }
    return null;
}

function nanoGPTImageReferenceMode(modelId) {
    const id = String(modelId || '').toLowerCase();
    if (NANOGPT_MULTI_REFERENCE_MODELS.has(id)) return 'multiple';
    if (NANOGPT_SINGLE_REFERENCE_MODELS.has(id)) return 'single';
    return '';
}

function updateReasoningVisibility(supportedParams, modelId = '', forceShow = false, prefix = '') {
    const reasoningSection = document.getElementById('ew-' + prefix + 'reasoning-section');
    const effortRow = document.getElementById('ew-' + prefix + 'reasoning-effort-row');
    if (!reasoningSection || !effortRow) return;

    if (forceShow) {
        reasoningSection.classList.remove('hidden');
        effortRow.classList.remove('hidden');
        effortRow.style.display = 'flex';
        return;
    }

    const lowerId = (modelId || '').toLowerCase();
    const reasoningKeywords = ['deepseek', 'r1', 'v3', 'v4', 'o1', 'o3', 'o4', 'aion', 'reason', 'think', 'thought', 'qwq', 'kimi', 'minimax'];
    
    const isReasoningModel = supportedParams.includes('reasoning') || 
                            supportedParams.includes('reasoning_effort') ||
                            reasoningKeywords.some(k => lowerId.includes(k));

    if (isReasoningModel) {
        reasoningSection.classList.remove('hidden');
    } else {
        reasoningSection.classList.add('hidden');
    }

    if (supportedParams.includes('reasoning_effort') || isReasoningModel) {
        effortRow.classList.remove('hidden');
        effortRow.style.display = 'flex';
    } else {
        effortRow.classList.add('hidden');
        effortRow.style.display = 'none';
    }
}

function configureContextSliderForModel(sliderId, modelId) {
    const slider = document.getElementById(sliderId);
    if (!slider) return;

    let physicalLimit = 102400; // Default fallback context limit if model is unknown
    if (modelId) {
        const saved = savedExperimentalModelCatalog(ExperimentalWorldsState.globalSettings?.apiProvider);
        const matched = ExperimentalWorldsHost.modelCatalog().find(m => m.id === modelId)
            || saved.find(m => m.id === modelId);
        if (matched && matched.context_length) {
            physicalLimit = matched.context_length;
        }
    }

    slider.max = physicalLimit;

    // Adjust slider stepping so it's smooth and highly responsive
    if (physicalLimit <= 32768) {
        slider.step = 1024;
    } else if (physicalLimit <= 131072) {
        slider.step = 2048;
    } else if (physicalLimit <= 524288) {
        slider.step = 8192;
    } else {
        slider.step = 16384;
    }
}

// --- Saved provider model catalogs (Virtual Human layout, module-owned
//     instance). The record shape and force-refresh-then-persist flow are
//     ported from the host's normalizeStoredOpenRouterModelCatalog /
//     getSharedOpenRouterModelCatalog pair, but the store lives in this
//     module's own state (ExperimentalWorldsState.savedModelCatalogs) and its
//     own repository record, so it never reads or writes the host's
//     globalSettings catalog. ---
const EXPERIMENTAL_SAVED_CATALOG_MAX_MODELS = 2000;
const EXPERIMENTAL_SAVED_CATALOG_MAX_ENTRY_JSON = 20000;

function normalizeStoredExperimentalModelCatalog(value) {
    const source = Array.isArray(value?.models) ? value.models : [];
    const seen = new Set();
    const models = [];
    source.forEach(raw => {
        if (!experimentalIsPlainObject(raw) || typeof raw.id !== 'string') return;
        const id = raw.id.trim().slice(0, 300);
        if (!id || seen.has(id)) return;
        const architecture = experimentalIsPlainObject(raw.architecture) ? raw.architecture : {};
        const pricing = experimentalIsPlainObject(raw.pricing) ? raw.pricing : {};
        const topProvider = experimentalIsPlainObject(raw.top_provider) ? raw.top_provider : {};
        const entry = {
            id,
            name: String(raw.name || id).trim().slice(0, 500),
            description: String(raw.description || '').slice(0, 4000),
            context_length: Number(raw.context_length) || 0,
            architecture: {
                input_modalities: Array.isArray(architecture.input_modalities) ? architecture.input_modalities.slice(0, 12) : ['text'],
                output_modalities: Array.isArray(architecture.output_modalities) ? architecture.output_modalities.slice(0, 12) : ['text']
            },
            // OpenRouter lists parameter names; NanoGPT-style image catalogs
            // describe them as an object. Both survive so sidecar metadata and
            // the model info card keep working from the saved record.
            supported_parameters: Array.isArray(raw.supported_parameters)
                ? raw.supported_parameters.slice(0, 100)
                : experimentalIsPlainObject(raw.supported_parameters) ? raw.supported_parameters : [],
            pricing: {
                prompt: String(pricing.prompt ?? ''), completion: String(pricing.completion ?? ''),
                internal_reasoning: String(pricing.internal_reasoning ?? ''),
                input_cache_read: String(pricing.input_cache_read ?? '')
            },
            top_provider: {
                max_completion_tokens: Number(topProvider.max_completion_tokens) || 0
            },
            supported_voices: Array.isArray(raw.supported_voices) ? raw.supported_voices.slice(0, 200) : []
        };
        let json;
        try { json = JSON.stringify(entry); } catch (_) { return; }
        if (!json || json.length > EXPERIMENTAL_SAVED_CATALOG_MAX_ENTRY_JSON) return;
        seen.add(id);
        models.push(entry);
    });
    return {
        version: 1,
        fetchedAt: Number.isFinite(Number(value?.fetchedAt)) ? Number(value.fetchedAt) : 0,
        models: models.slice(0, EXPERIMENTAL_SAVED_CATALOG_MAX_MODELS)
    };
}

function savedExperimentalModelCatalog(provider) {
    const key = ExperimentalWorldsHost.normalizedProviderId(provider || '');
    if (!key) return [];
    const store = ExperimentalWorldsState.savedModelCatalogs;
    if (!experimentalIsPlainObject(store)) return [];
    return normalizeStoredExperimentalModelCatalog(store[key]).models;
}

function rememberExperimentalModelCatalog(provider, models) {
    const key = ExperimentalWorldsHost.normalizedProviderId(provider || '');
    if (!key || !Array.isArray(models) || !models.length) return false;
    const catalog = normalizeStoredExperimentalModelCatalog({ models, fetchedAt: Date.now() });
    if (!catalog.models.length) return false;
    if (!experimentalIsPlainObject(ExperimentalWorldsState.savedModelCatalogs)) {
        ExperimentalWorldsState.savedModelCatalogs = {};
    }
    ExperimentalWorldsState.savedModelCatalogs[key] = catalog;
    // This is public catalog metadata only; credentials remain in Settings and
    // are never copied into the transferable record.
    ExperimentalWorldsHost.persist().catch(error =>
        console.warn('Experimental Worlds model metadata loaded but could not be cached locally:', error));
    return true;
}

// --- shared model-picker helpers (stock app.js ports, verbatim behavior) ---

function modelOutputModalities(model) {
    const architecture = experimentalIsPlainObject(model?.architecture) ? model.architecture : {};
    if (Array.isArray(architecture.output_modalities)) {
        return architecture.output_modalities.map(value => String(value).toLowerCase());
    }
    const modality = String(architecture.modality || '').toLowerCase();
    const outputSide = modality.includes('->') ? modality.split('->').pop() : '';
    return outputSide ? outputSide.split(/[+,/]/).map(value => value.trim()).filter(Boolean) : [];
}

function isExperimentalTextCapableModel(model) {
    if (!model || typeof model.id !== 'string') return false;
    const outputs = modelOutputModalities(model);
    if (outputs.length) return outputs.includes('text');
    const id = model.id.toLowerCase();
    return !/(?:^|[/._-])(?:embedding|embed|rerank|moderation|whisper|transcrib|tts|speech|voice|image|video)(?:$|[/._-])/i.test(id);
}

function rankExperimentalTextModels(models) {
    return (Array.isArray(models) ? models : [])
        .filter(isExperimentalTextCapableModel)
        .map(model => {
            const parameters = Array.isArray(model.supported_parameters)
                ? model.supported_parameters.map(value => String(value)) : [];
            const tools = parameters.includes('tools') || parameters.includes('tool_choice');
            const json = parameters.includes('response_format') || parameters.includes('structured_outputs');
            const promptPrice = Number(model?.pricing?.prompt);
            const inputModalities = Array.isArray(model?.architecture?.input_modalities)
                ? model.architecture.input_modalities.map(value => String(value).toLowerCase())
                : ['text'];
            return {
                id: model.id,
                name: model.name || model.id,
                contextLength: Number(model.context_length) || 0,
                supportsTools: tools,
                supportsJSON: json,
                capabilitiesKnown: parameters.length > 0,
                supportedParams: parameters,
                inputModalities,
                promptPrice: Number.isFinite(promptPrice) && promptPrice >= 0 ? promptPrice : null,
                description: String(model.description || ''),
                maxOutput: Number(model?.top_provider?.max_completion_tokens) || 0
            };
        })
        .sort(compareModelPickerAlphabetically);
}

function experimentalTextModelPriceLabel(price) {
    if (!Number.isFinite(price)) return '';
    const perMillion = price * 1000000;
    if (perMillion === 0) return 'Free input';
    return `$${perMillion < 0.01 ? perMillion.toFixed(4) : perMillion.toFixed(2)}/M input`;
}

// Model names are commonly remembered as separate family and version words
// (for example "flash 3.8" rather than the catalog's "Gemini 3.8 Flash").
// Treat whitespace as an AND query so the order the author remembers does not
// determine whether a model is discoverable.
function modelSearchTerms(query) {
    return String(query || '').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
}

function matchesModelSearch(candidate, query) {
    const terms = modelSearchTerms(query);
    if (!terms.length) return true;
    const text = typeof candidate === 'string'
        ? candidate
        : [candidate?.name, candidate?.label, candidate?.id, candidate?.value, candidate?.description, candidate?.meta]
            .filter(Boolean).join(' ');
    const searchable = text.toLocaleLowerCase();
    return terms.every(term => searchable.includes(term));
}

function compareModelPickerAlphabetically(left, right) {
    const leftName = String(left?.name || left?.label || left?.id || left?.value || '');
    const rightName = String(right?.name || right?.label || right?.id || right?.value || '');
    return leftName.localeCompare(rightName, undefined, { sensitivity: 'base', numeric: true })
        || String(left?.id || left?.value || '').localeCompare(String(right?.id || right?.value || ''), undefined, {
            sensitivity: 'base', numeric: true
        });
}

async function hydrateChatMemoryEmbedding(record) {
    if (!record?.text) return record;
    const embedding = await ExperimentalWorldsVectorMemory.getCachedEmbedding(record.text);
    if (embedding) {
        record.embedding = embedding;
        record.embeddingNamespace = ExperimentalWorldsVectorMemory.namespace();
        record.updatedAt = Date.now();
    }
    return record;
}

// --- adapted: the isolated module owns only the Experimental World Studio
//     model card; the stock chat-studio branch is deliberately dropped. ---
function getModelInfoElements(prefix) {
    if (prefix !== 'w-' && prefix !== 'w-studio-') {
        return {
            card: null, nameEl: null, idEl: null, badge: null,
            detailsContext: null, detailsPrice: null, detailsTools: null,
            detailsJson: null, badges: null, paramsList: null
        };
    }
    return {
        card: document.getElementById('ew-w-model-info-card'),
        nameEl: document.getElementById('ew-w-model-info-name'),
        idEl: document.getElementById('ew-w-model-info-id'),
        badge: document.getElementById('ew-w-model-verification-badge'),
        detailsContext: document.getElementById('ew-w-model-detail-context'),
        detailsPrice: document.getElementById('ew-w-model-detail-price'),
        detailsTools: document.getElementById('ew-w-model-detail-tools'),
        detailsJson: document.getElementById('ew-w-model-detail-json'),
        badges: document.getElementById('ew-w-model-info-badges'),
        paramsList: document.getElementById('ew-w-model-info-params-list')
    };
}

// --- adapted: chat owner identity comes from the host's opt-in
//     chatMemoryContext service, not from host chat state. ---
function chatOwnerId() {
    const context = ExperimentalWorldsHost.chatMemoryContext();
    return String(context?.ownerId || '');
}
