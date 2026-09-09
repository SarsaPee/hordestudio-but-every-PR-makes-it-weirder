/*
 * Generic, evidence-backed character dossier claims.
 *
 * This deliberately has no Melbourne profile, named relationship axes, or
 * world-specific vocabulary. Profiles may register presentation/adapters later;
 * the stored records remain portable canonical evidence.
 */
(function attachHordeDossierClaims(root, factory) {
    root.HordeDossierClaims = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function buildHordeDossierClaims() {
    'use strict';

    const VERSION = 1;
    const MODES = new Set(['additive', 'replacement', 'temporal', 'derived']);
    const ORIGINS = new Set(['user_refinement', 'narrator', 'sidecar', 'world_agent', 'import']);
    const MATURITIES = new Set(['authored', 'established', 'provisional', 'ephemeral']);
    const EPISTEMIC_TYPES = new Set([
        'observed_fact', 'communication', 'interpretation', 'belief', 'memory', 'rumour', 'private_claim', 'derived_summary'
    ]);
    // These fields already have native authoritative reducers. Claims may
    // describe them as evidence, but cannot become a second state store.
    const RECEIPT_OWNED_ROOTS = new Set([
        'location', 'scenePresence', 'movement', 'inventory', 'clock', 'conditions', 'alteredStates'
    ]);

    const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
    const array = value => Array.isArray(value) ? value : [];
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const text = (value, limit = 500) => String(value == null ? '' : value).trim().slice(0, limit);
    const safeId = (value, fallback = '') => text(value || fallback, 160).replace(/[^a-zA-Z0-9:_-]/g, '_');
    const unique = values => [...new Set(array(values).map(value => text(value, 240)).filter(Boolean))];

    function normalizeWorldConfig(world, options = {}) {
        if (!object(world)) return { enabled: false };
        const source = object(world.dossierClaims) ? world.dossierClaims : {};
        const sidecarWorld = world.sidecarConfig?.mode === 'sidecar';
        const enabled = source.enabled === true || (options.newWorld === true && sidecarWorld);
        world.dossierClaims = {
            version: VERSION,
            enabled,
            ...source,
            version: VERSION,
            enabled
        };
        return world.dossierClaims;
    }

    function isEnabled(world) {
        return normalizeWorldConfig(world).enabled === true;
    }

    function ensureSession(world, session) {
        if (!isEnabled(world) || !object(session)) return null;
        if (!object(session.dossierClaims)) session.dossierClaims = {};
        const state = session.dossierClaims;
        state.version = VERSION;
        if (!Array.isArray(state.records)) state.records = [];
        if (!Array.isArray(state.suppressions)) state.suppressions = [];
        if (!Number.isFinite(Number(state.sequence))) state.sequence = 0;
        return state;
    }

    function nextId(state, prefix = 'claim') {
        state.sequence = Math.max(0, Number(state.sequence) || 0) + 1;
        return `${prefix}_${Date.now().toString(36)}_${state.sequence.toString(36)}`;
    }

    function fieldParts(path) {
        return text(path, 240).split('.').map(part => part.trim()).filter(Boolean);
    }

    function fieldAllowed(path) {
        const parts = fieldParts(path);
        if (!parts.length || parts.length > 8 || parts.some(part => !/^[A-Za-z0-9_-]{1,80}$/.test(part))) return false;
        return !RECEIPT_OWNED_ROOTS.has(parts[0]);
    }

    function entityExists(world, characterId) {
        return characterId === 'player' || array(world?.entities).some(entity => entity?.id === characterId);
    }

    function knownEvidence(session, validation) {
        const known = new Set();
        const receiptId = text(validation?.receipt?.turn_id, 160);
        if (receiptId) known.add(`receipt:${receiptId}`);
        array(validation?.acceptedEvents).forEach(event => {
            if (event?.id) known.add(`event:${text(event.id, 160)}`);
        });
        array(session?.turnEvents).forEach(event => {
            if (event?.committed !== false && event?.id) known.add(`event:${text(event.id, 160)}`);
        });
        return known;
    }

    function normalizedEvidence(raw, known, direct) {
        const evidenceIds = unique(raw?.evidence_ids || raw?.evidenceIds);
        if (direct) return evidenceIds;
        return evidenceIds.filter(id => known.has(id));
    }

    function confidence(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
    }

    function createClaim(world, session, raw, options = {}) {
        const state = ensureSession(world, session);
        if (!state) return { accepted: false, error: 'claims_disabled' };
        if (!object(raw)) return { accepted: false, error: 'claim_not_object' };
        const direct = options.direct === true;
        const origin = ORIGINS.has(raw.origin) ? raw.origin : (direct ? 'user_refinement' : 'narrator');
        const characterId = safeId(raw.character_id || raw.characterId);
        const fieldPath = text(raw.field_path || raw.fieldPath, 240);
        const mode = MODES.has(raw.mode) ? raw.mode : 'additive';
        const reason = text(raw.reason, 800);
        const evidenceIds = normalizedEvidence(raw, options.knownEvidence || new Set(), direct);
        if (!characterId || !entityExists(world, characterId)) return { accepted: false, error: 'unknown_character' };
        if (!fieldAllowed(fieldPath)) return { accepted: false, error: 'receipt_owned_or_invalid_field' };
        if (!direct && !evidenceIds.length) return { accepted: false, error: 'claim_requires_accepted_evidence' };
        if (!direct && !reason) return { accepted: false, error: 'claim_requires_reason' };
        if (raw.value === undefined) return { accepted: false, error: 'claim_requires_value' };
        const epistemicType = EPISTEMIC_TYPES.has(raw.epistemic_type || raw.epistemicType)
            ? (raw.epistemic_type || raw.epistemicType) : '';
        if (fieldPath.startsWith('cognition.') && !epistemicType) return { accepted: false, error: 'cognition_requires_epistemic_type' };
        const existing = state.records.find(record => record.characterId === characterId
            && record.fieldPath === fieldPath && record.status === 'active'
            && JSON.stringify(record.value) === JSON.stringify(raw.value));
        if (existing && !direct) {
            existing.evidenceIds = unique(existing.evidenceIds.concat(evidenceIds));
            existing.lastReinforcedAt = new Date().toISOString();
            existing.reinforcementCount = Math.max(0, Number(existing.reinforcementCount) || 0) + 1;
            return { accepted: true, reinforced: true, claim: existing };
        }
        const claim = {
            id: safeId(raw.id || raw.claim_id, nextId(state)),
            characterId,
            fieldPath,
            mode,
            value: clone(raw.value),
            confidence: confidence(raw.confidence, direct ? 1 : 0.65),
            maturity: MATURITIES.has(raw.maturity) ? raw.maturity : (direct ? 'authored' : 'provisional'),
            epistemicType,
            evidenceIds,
            reason,
            origin,
            sourceTurnId: text(raw.source_turn_id || raw.sourceTurnId || options.sourceTurnId, 160),
            sourceMessageId: text(raw.source_message_id || raw.sourceMessageId || options.sourceMessageId, 160),
            sourceRevision: Math.max(0, Number(raw.source_revision || raw.sourceRevision || session.worldStateVersion) || 0),
            createdAt: new Date().toISOString(),
            status: 'active',
            review: { status: direct ? 'accepted' : 'pending_review', reviewedAt: direct ? new Date().toISOString() : '' },
            reinforcementCount: 0
        };
        if (state.records.some(record => record.id === claim.id)) return { accepted: false, error: 'duplicate_claim_id' };
        state.records.filter(record => record.characterId === characterId && record.fieldPath === fieldPath
            && record.status === 'active' && JSON.stringify(record.value) !== JSON.stringify(claim.value))
            .forEach(record => { record.conflictedBy = claim.id; });
        state.records.push(claim);
        state.records = state.records.slice(-4000);
        return { accepted: true, claim };
    }

    function createRelationshipClaim(world, session, raw, options = {}) {
        const sourceId = safeId(raw.source_character_id || raw.sourceCharacterId);
        const targetId = safeId(raw.target_character_id || raw.targetCharacterId);
        const axis = safeId(raw.axis || 'general');
        if (!sourceId || !targetId || sourceId === targetId) return { accepted: false, error: 'invalid_directional_relationship' };
        return createClaim(world, session, {
            ...raw,
            character_id: sourceId,
            field_path: `relationships.${targetId}.${axis}`,
            value: {
                targetCharacterId: targetId,
                axis,
                value: raw.value,
                label: text(raw.label, 160)
            },
            epistemic_type: raw.epistemic_type || 'interpretation'
        }, options);
    }

    function prepareCommit(world, session, validation, options = {}) {
        if (!isEnabled(world)) return { enabled: false, claims: [], rejected: [] };
        const updates = object(validation?.receipt?.state_updates) ? validation.receipt.state_updates : {};
        const known = knownEvidence(session, validation);
        const sourceTurnId = text(validation?.receipt?.turn_id, 160);
        const drafts = [];
        array(updates.dossier_claim_updates).forEach(raw => drafts.push({ type: 'dossier', raw }));
        array(updates.relationship_claim_updates).forEach(raw => drafts.push({ type: 'relationship', raw }));
        const claims = [];
        const rejected = [];
        drafts.forEach(({ type, raw }, index) => {
            const candidate = object(raw) ? { ...clone(raw), origin: options.origin || 'narrator', source_turn_id: sourceTurnId } : null;
            const characterId = safeId(type === 'relationship'
                ? candidate?.source_character_id || candidate?.sourceCharacterId
                : candidate?.character_id || candidate?.characterId);
            const fieldPath = type === 'relationship'
                ? `relationships.${safeId(candidate?.target_character_id || candidate?.targetCharacterId)}.${safeId(candidate?.axis || 'general')}`
                : text(candidate?.field_path || candidate?.fieldPath, 240);
            const evidenceIds = normalizedEvidence(candidate, known, false);
            const relationshipTarget = safeId(candidate?.target_character_id || candidate?.targetCharacterId);
            if (!candidate || !characterId || !entityExists(world, characterId)
                || !fieldAllowed(fieldPath) || !evidenceIds.length || !text(candidate.reason, 800)
                || candidate.value === undefined || (type === 'relationship'
                    && (!relationshipTarget || relationshipTarget === characterId || !entityExists(world, relationshipTarget)))) {
                rejected.push({ index, type, reason: 'invalid_or_unsupported_claim' });
                return;
            }
            candidate.evidence_ids = evidenceIds;
            claims.push({ type, raw: candidate });
        });
        return { enabled: true, claims, rejected };
    }

    function applyPreparedCommit(world, session, prepared) {
        if (!prepared?.enabled) return { applied: [], rejected: [] };
        const known = new Set();
        const applied = [];
        const rejected = [];
        array(prepared.claims).forEach((draft, index) => {
            const result = draft.type === 'relationship'
                ? createRelationshipClaim(world, session, draft.raw, { knownEvidence: new Set(draft.raw.evidence_ids || []) })
                : createClaim(world, session, draft.raw, { knownEvidence: new Set(draft.raw.evidence_ids || []) });
            if (result.accepted) applied.push(result.claim || result);
            else rejected.push({ index, type: draft.type, reason: result.error || 'claim_rejected' });
        });
        return { applied, rejected };
    }

    function history(world, session, characterId) {
        const state = ensureSession(world, session);
        if (!state) return { active: [], rejected: [] };
        const active = state.records.filter(record => record.characterId === characterId && record.status === 'active');
        return { active: clone(active), rejected: clone(state.suppressions.filter(item => item.characterId === characterId)) };
    }

    function suppressClaim(world, session, claimId, reason = '') {
        const state = ensureSession(world, session);
        const claim = state?.records.find(record => record.id === claimId);
        if (!claim || claim.status !== 'active') return false;
        claim.status = 'suppressed';
        state.suppressions.push({ id: nextId(state, 'suppress'), claimId, characterId: claim.characterId,
            reason: text(reason, 500), createdAt: new Date().toISOString(), origin: 'user_refinement' });
        return true;
    }

    function promptContext(world, session, entities) {
        const state = ensureSession(world, session);
        if (!state) return '';
        const requested = new Set(array(entities).map(entity => entity?.id).filter(Boolean));
        const grouped = state.records.filter(record => record.status === 'active' && requested.has(record.characterId))
            .reduce((map, record) => {
                if (!map.has(record.characterId)) map.set(record.characterId, []);
                map.get(record.characterId).push(record);
                return map;
            }, new Map());
        const sections = [...grouped].map(([characterId, records]) => {
            const entity = array(world.entities).find(item => item.id === characterId);
            const lines = records.slice(-12).map(record => `- ${record.fieldPath}: ${typeof record.value === 'string' ? record.value : JSON.stringify(record.value)} [${record.maturity}; confidence ${Math.round(record.confidence * 100)}%; ${record.origin}]`);
            return `[DOSSIER CLAIMS: ${entity?.name || characterId}]\n${lines.join('\n')}`;
        });
        return sections.length ? `\n\n[DOSSIER AUTHORITY]\n${sections.join('\n\n')}\nThese are evidence-backed claims, not omniscient truth. Preserve their confidence and epistemic limits.` : '';
    }

    function extendReceiptSchema(schema) {
        const stateUpdates = schema?.properties?.state_updates;
        if (!object(stateUpdates?.properties)) return schema;
        stateUpdates.properties.dossier_claim_updates = {
            type: 'array',
            description: 'Evidence-backed claims about an existing character. Use only with accepted event:/receipt: evidence. Never use for location, movement, inventory, clock or conditions.',
            items: { type: 'object', properties: {
                character_id: { type: 'string' }, field_path: { type: 'string' }, value: {},
                mode: { type: 'string', enum: [...MODES] }, confidence: { type: 'number', minimum: 0, maximum: 1 },
                maturity: { type: 'string', enum: [...MATURITIES] }, epistemic_type: { type: 'string', enum: [...EPISTEMIC_TYPES] },
                evidence_ids: { type: 'array', items: { type: 'string' } }, reason: { type: 'string' }
            }, required: ['character_id', 'field_path', 'value', 'evidence_ids', 'reason'] }
        };
        stateUpdates.properties.relationship_claim_updates = {
            type: 'array',
            description: 'Directional relationship claims. source_character_id observes/interprets target_character_id; reciprocal truth is never implied.',
            items: { type: 'object', properties: {
                source_character_id: { type: 'string' }, target_character_id: { type: 'string' }, axis: { type: 'string' },
                value: {}, label: { type: 'string' }, confidence: { type: 'number', minimum: 0, maximum: 1 },
                maturity: { type: 'string', enum: [...MATURITIES] }, evidence_ids: { type: 'array', items: { type: 'string' } }, reason: { type: 'string' }
            }, required: ['source_character_id', 'target_character_id', 'axis', 'value', 'evidence_ids', 'reason'] }
        };
        return schema;
    }

    return Object.freeze({ VERSION, normalizeWorldConfig, isEnabled, ensureSession, createClaim,
        createRelationshipClaim, prepareCommit, applyPreparedCommit, history, suppressClaim, promptContext, extendReceiptSchema });
}));
