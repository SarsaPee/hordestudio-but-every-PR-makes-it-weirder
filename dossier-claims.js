(function initHordeDossiers(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.HordeDossiers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildHordeDossiers() {
    'use strict';

    const PROFILE_ID = 'dossier_claims_v1';
    const VERSION = 2;
    const MODES = new Set(['additive', 'replacement', 'temporal', 'derived']);
    const ORIGINS = new Set(['user', 'main_model', 'agent', 'runtime', 'import']);
    const MATURITY = new Set(['ephemeral', 'provisional', 'established', 'authored']);
    const STATUSES = new Set([
        'active', 'superseded', 'expired', 'branch_invalid', 'user_suppressed', 'pending_approval'
    ]);
    const CORE_IDENTITY_FIELDS = new Set([
        'name', 'age', 'pronouns', 'persona', 'values', 'vulnerabilities', 'backstory', 'boundaries'
    ]);
    const NEVER_MATURE_PREFIXES = [
        'live.', 'current.', 'conditions.', 'internalState.', 'vad.', 'alteredStates.'
    ];
    const TRANSIENT_MATURATION_PATHS = new Set([
        'outfits.current', 'goals.current', 'relationships.player.disposition'
    ]);
    const TEMPORAL_PREFIXES = [
        'employment.', 'housing.', 'affiliations.', 'outfits.', 'conditions.', 'possessions.',
        'goals.', 'relationships.', 'current.'
    ];
    const RECEIPT_OWNED_ROOTS = new Set([
        'location', 'scenePresence', 'inventory', 'alteredStates', 'clock', 'movement', 'conditions'
    ]);
    const EPISTEMIC_TYPES = new Set([
        'observed_fact', 'communication', 'interpretation', 'belief', 'memory', 'reassessment',
        'rumour', 'private_claim', 'derived_summary'
    ]);

    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
    const array = value => Array.isArray(value) ? value : [];
    const cleanText = (value, limit = 4000) => String(value == null ? '' : value).trim().slice(0, limit);
    const unique = values => [...new Set(array(values).map(value => cleanText(value, 240)).filter(Boolean))];
    const safeId = (value, fallback = '') => cleanText(value || fallback, 160).replace(/[^a-zA-Z0-9:_-]/g, '_');

    function isEnabled(world) {
        return world?.mechanicsProfile === PROFILE_ID || world?.mechanics?.profile === PROFILE_ID;
    }

    function pathParts(path) {
        return cleanText(path, 240).split('.').map(part => part.trim()).filter(Boolean).slice(0, 16);
    }

    function getAtPath(target, path) {
        return pathParts(path).reduce((value, part) => value == null ? undefined : value[part], target);
    }

    function setAtPath(target, path, value) {
        const parts = pathParts(path);
        if (!parts.length) return target;
        let cursor = target;
        parts.slice(0, -1).forEach(part => {
            if (!object(cursor[part])) cursor[part] = {};
            cursor = cursor[part];
        });
        cursor[parts[parts.length - 1]] = clone(value);
        return target;
    }

    function mergeAdditive(current, incoming) {
        if (Array.isArray(current) || Array.isArray(incoming)) {
            const combined = [...array(current), ...array(incoming)];
            const seen = new Set();
            return combined.filter(value => {
                const key = object(value) ? JSON.stringify(value) : String(value);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        }
        if (object(current) && object(incoming)) return { ...clone(current), ...clone(incoming) };
        if (typeof current === 'string' && typeof incoming === 'string') {
            return [current.trim(), incoming.trim()].filter(Boolean).join('\n');
        }
        return clone(incoming);
    }

    function baseFromEntity(entity, minimal = false) {
        if (!entity) return {};
        if (minimal) return {
            id: entity.id,
            type: entity.type || 'npc',
            name: entity.name || 'Unnamed character'
        };
        const base = clone(entity);
        delete base.sessionOrigin;
        return base;
    }

    function ensureSession(world, session) {
        if (!isEnabled(world) || !session) return null;
        if (!object(session.dossierState)) session.dossierState = {};
        const state = session.dossierState;
        state.version = VERSION;
        state.profile = PROFILE_ID;
        state.activeBranchId = safeId(state.activeBranchId || session.id || 'main');
        if (!Array.isArray(state.activeLineage)) state.activeLineage = [state.activeBranchId];
        state.activeLineage = unique(state.activeLineage.concat(state.activeBranchId));
        if (!object(state.authoredBase)) state.authoredBase = {};
        if (!Array.isArray(state.dossierClaims)) state.dossierClaims = [];
        if (!Array.isArray(state.claimSuppressions)) state.claimSuppressions = [];
        if (!Array.isArray(state.suppressedEvidence)) state.suppressedEvidence = [];
        if (!Array.isArray(state.pendingAgentPatches)) state.pendingAgentPatches = [];
        if (!Array.isArray(state.notifications)) state.notifications = [];
        if (!object(state.storyNpcLifecycle)) state.storyNpcLifecycle = {};
        if (!object(state.branchArchive)) state.branchArchive = { characters: {}, evidence: [] };
        if (!object(state.branchArchive.characters)) state.branchArchive.characters = {};
        if (!Array.isArray(state.branchArchive.evidence)) state.branchArchive.evidence = [];
        if (!Number.isFinite(Number(state.sequence))) state.sequence = 0;
        if (!Number.isFinite(Number(state.lastMaturedRevision))) state.lastMaturedRevision = 0;
        state.dossierClaims.forEach(claim => {
            if (!object(claim.maturityEvidence)) claim.maturityEvidence = {};
            const metrics = claim.maturityEvidence;
            ['turnsSurvived', 'scenesSurvived', 'worldTimeElapsed', 'reinforcementCount',
                'independentEvidenceCount', 'contradictionCount'].forEach(key => {
                if (!Number.isFinite(Number(metrics[key]))) metrics[key] = 0;
                else metrics[key] = Number(metrics[key]);
            });
            if (!Array.isArray(claim.evidenceIds)) claim.evidenceIds = [];
            if (!Array.isArray(claim.supersedesClaimIds)) claim.supersedesClaimIds = [];
            if (!STATUSES.has(claim.status)) claim.status = 'active';
            if (!MATURITY.has(claim.maturity)) claim.maturity = 'ephemeral';
            if (!MODES.has(claim.mode)) claim.mode = 'additive';
            if (!ORIGINS.has(claim.origin)) claim.origin = 'import';
        });
        return state;
    }

    function initializeWorld(world, session) {
        const state = ensureSession(world, session);
        if (!state) return null;
        array(world.entities).filter(entity => entity?.type === 'npc').forEach(entity => {
            ensureCharacter(world, session, entity, { storyBorn: !!entity.sessionOrigin });
        });
        return state;
    }

    function ensureCharacter(world, session, entity, options = {}) {
        const state = ensureSession(world, session);
        if (!state || !entity?.id) return null;
        if (!object(state.authoredBase[entity.id])) {
            state.authoredBase[entity.id] = baseFromEntity(entity, options.storyBorn === true);
            state.authoredBase[entity.id]._dossierOrigin = options.storyBorn ? 'story' : 'import';
            state.authoredBase[entity.id]._capturedAtRevision = Number(session.worldStateVersion || 0);
        }
        return state.authoredBase[entity.id];
    }

    function nextId(state, prefix = 'claim') {
        state.sequence = Number(state.sequence || 0) + 1;
        return `${prefix}_${Date.now().toString(36)}_${state.sequence.toString(36)}`;
    }

    function activeSuppressionIds(state) {
        return new Set(state.claimSuppressions
            .filter(item => item && item.status !== 'reverted' && state.activeLineage.includes(item.branchId))
            .map(item => item.claimId));
    }

    function isCurrentlyApplicable(claim, state, worldTime) {
        if (!claim || !state.activeLineage.includes(claim.branchId)) return false;
        if (claim.status !== 'active') return false;
        if (activeSuppressionIds(state).has(claim.claimId)) return false;
        const now = worldTime ? Date.parse(worldTime) : NaN;
        const from = claim.validFrom ? Date.parse(claim.validFrom) : NaN;
        const until = claim.validUntil ? Date.parse(claim.validUntil) : NaN;
        if (Number.isFinite(now) && Number.isFinite(from) && now < from) return false;
        if (Number.isFinite(now) && Number.isFinite(until) && now > until) return false;
        return true;
    }

    function dependenciesAreActive(claim, state) {
        return array(claim?.evidenceIds).every(evidenceId => {
            if (!String(evidenceId).startsWith('claim:')) return true;
            const sourceId = String(evidenceId).slice('claim:'.length);
            const source = state.dossierClaims.find(item => item.claimId === sourceId);
            return !!source && isCurrentlyApplicable(source, state, '');
        });
    }

    function claimAuthority(claim) {
        const origin = { user: 500, import: 450, main_model: 300, agent: 250, runtime: 200 }[claim.origin] || 0;
        const maturity = { authored: 80, established: 60, provisional: 30, ephemeral: 10 }[claim.maturity] || 0;
        const temporal = claim.mode === 'temporal' ? 8 : 0;
        return origin + maturity + temporal;
    }

    function normalizeEvidenceIds(raw) {
        return unique(raw).map(value => value.includes(':') ? value : `event:${value}`);
    }

    function validateAutomaticDraft(raw, known = null) {
        const errors = [];
        if (!object(raw)) return { errors: ['claim must be an object'], evidenceIds: [] };
        const characterId = safeId(raw.characterId || raw.character_id);
        const fieldPath = cleanText(raw.fieldPath || raw.field_path, 240);
        const mode = raw.mode || 'additive';
        const evidenceIds = normalizeEvidenceIds(raw.evidenceIds || raw.evidence_ids || []);
        if (!characterId) errors.push('character required');
        if (!fieldPath || !pathParts(fieldPath).length) errors.push('field required');
        if (!MODES.has(mode)) errors.push(`unsupported mode ${cleanText(mode, 40) || '(empty)'}`);
        if (RECEIPT_OWNED_ROOTS.has(pathParts(fieldPath)[0])) {
            errors.push(`field ${fieldPath} is owned by the receipt reducer`);
        }
        if (!evidenceIds.length) errors.push('missing evidentiary basis');
        if (!cleanText(raw.reason, 800)) errors.push('reason required');
        if (known instanceof Set) {
            const missing = evidenceIds.filter(evidenceId => !known.has(evidenceId));
            if (missing.length) errors.push(`unknown evidence ${missing.join(', ')}`);
        }
        if (fieldPath.startsWith('cognition.')
            && !EPISTEMIC_TYPES.has(raw.epistemicType || raw.epistemic_type)) {
            errors.push('cognition claim requires an epistemic type');
        }
        return { errors, evidenceIds, characterId, fieldPath, mode };
    }

    function equivalentValue(left, right) {
        try { return JSON.stringify(left) === JSON.stringify(right); } catch (_) { return left === right; }
    }

    function isCoreIdentityPath(path) {
        const root = pathParts(path)[0] || '';
        return CORE_IDENTITY_FIELDS.has(root);
    }

    function createNotification(state, claim, kind = 'mutation') {
        const notification = {
            notificationId: nextId(state, 'notice'),
            characterId: claim.characterId,
            claimIds: [claim.claimId],
            sourceTurnId: claim.sourceTurnId || '',
            branchId: claim.branchId,
            kind: claim.softLockConflict ? 'soft_lock_conflict' : kind,
            createdAt: Date.now(),
            reviewed: false
        };
        const batch = state.notifications.find(item => !item.reviewed
            && item.characterId === notification.characterId
            && item.sourceTurnId === notification.sourceTurnId
            && item.branchId === notification.branchId
            && item.kind === notification.kind);
        if (batch) batch.claimIds = unique(batch.claimIds.concat(claim.claimId));
        else state.notifications.push(notification);
        state.notifications = state.notifications.slice(-500);
    }

    function createClaim(world, session, raw, options = {}) {
        const state = ensureSession(world, session);
        if (!state || !object(raw)) return { accepted: false, error: 'profile_disabled_or_invalid' };
        const characterId = safeId(raw.characterId || raw.character_id);
        const fieldPath = cleanText(raw.fieldPath || raw.field_path, 240);
        if (!characterId || !fieldPath || !pathParts(fieldPath).length) {
            return { accepted: false, error: 'character_and_field_required' };
        }
        const origin = ORIGINS.has(raw.origin) ? raw.origin : 'runtime';
        if (!['user', 'import'].includes(origin) && raw.mode && !MODES.has(raw.mode)) {
            return { accepted: false, error: 'unsupported_claim_mode' };
        }
        const mode = MODES.has(raw.mode) ? raw.mode : 'additive';
        if (!['user', 'import'].includes(origin) && RECEIPT_OWNED_ROOTS.has(pathParts(fieldPath)[0])) {
            return { accepted: false, error: 'field_owned_by_receipt_reducer' };
        }
        if (!['user', 'import'].includes(origin) && fieldPath.startsWith('cognition.')
            && !EPISTEMIC_TYPES.has(raw.epistemicType || raw.epistemic_type)) {
            return { accepted: false, error: 'cognition_requires_epistemic_type' };
        }
        const requestedMaturity = MATURITY.has(raw.maturity) ? raw.maturity : 'ephemeral';
        const maturity = origin === 'user'
            ? 'authored'
            : origin === 'import'
                ? (requestedMaturity === 'authored' ? 'established' : requestedMaturity)
                : origin === 'runtime'
                    ? (requestedMaturity === 'authored' ? 'established' : requestedMaturity)
                    : requestedMaturity === 'established' || requestedMaturity === 'authored'
                        ? 'provisional'
                        : requestedMaturity;
        const evidenceIds = normalizeEvidenceIds(raw.evidenceIds || raw.evidence_ids || []);
        if (!['user', 'import'].includes(origin) && !evidenceIds.length && options.allowEvidenceFree !== true) {
            return { accepted: false, error: 'automatic_claim_requires_evidence' };
        }
        if (!['user', 'import'].includes(origin) && !cleanText(raw.reason, 800)) {
            return { accepted: false, error: 'automatic_claim_requires_reason' };
        }
        const existingEquivalent = state.dossierClaims.find(claim => claim.characterId === characterId
            && claim.fieldPath === fieldPath && claim.status === 'active'
            && equivalentValue(claim.value, raw.value)
            && state.activeLineage.includes(claim.branchId));
        if (existingEquivalent && origin !== 'user') {
            existingEquivalent.evidenceIds = unique(existingEquivalent.evidenceIds.concat(evidenceIds));
            existingEquivalent.maturityEvidence.reinforcementCount++;
            existingEquivalent.maturityEvidence.independentEvidenceCount = existingEquivalent.evidenceIds.length;
            existingEquivalent.lastReinforcedAtTurn = Number(session.turnCount || 0);
            return { accepted: true, reinforced: true, claim: existingEquivalent };
        }
        const authoredConflict = origin !== 'user' && mode !== 'additive'
            && state.dossierClaims.some(claim => claim.characterId === characterId
                && claim.fieldPath === fieldPath && claim.maturity === 'authored'
                && claim.status === 'active' && state.activeLineage.includes(claim.branchId));
        const establishedCharacter = state.storyNpcLifecycle[characterId]?.state === 'established'
            || state.authoredBase[characterId]?._dossierOrigin !== 'story';
        const pendingCore = origin !== 'user' && mode !== 'additive'
            && establishedCharacter && isCoreIdentityPath(fieldPath);
        const claim = {
            claimId: safeId(raw.claimId || raw.claim_id, nextId(state)),
            characterId,
            fieldPath,
            mode,
            value: clone(raw.value),
            origin,
            sourceTurnId: cleanText(raw.sourceTurnId || raw.source_turn_id, 160),
            sourceReceiptId: cleanText(raw.sourceReceiptId || raw.source_receipt_id, 160),
            sourceAgentResultId: cleanText(raw.sourceAgentResultId || raw.source_agent_result_id, 160),
            evidenceIds,
            createdAtTurn: Number(raw.createdAtTurn ?? raw.created_at_turn ?? session.turnCount ?? 0),
            createdAtWorldTime: cleanText(raw.createdAtWorldTime || raw.created_at_world_time, 100),
            createdAtRevision: Number(session.worldStateVersion || 0),
            branchId: safeId(raw.branchId || raw.branch_id || state.activeBranchId),
            maturity,
            maturityEvidence: {
                turnsSurvived: 0,
                scenesSurvived: 0,
                worldTimeElapsed: 0,
                reinforcementCount: 0,
                independentEvidenceCount: evidenceIds.length,
                contradictionCount: 0,
                ...(object(raw.maturityEvidence || raw.maturity_evidence)
                    ? clone(raw.maturityEvidence || raw.maturity_evidence) : {})
            },
            supersedesClaimIds: unique(raw.supersedesClaimIds || raw.supersedes_claim_ids || []),
            supersededByClaimId: '',
            status: pendingCore ? 'pending_approval'
                : (options.allowStatus === true && STATUSES.has(raw.status) ? raw.status : 'active'),
            validFrom: cleanText(raw.validFrom || raw.valid_from, 100),
            validUntil: cleanText(raw.validUntil || raw.valid_until, 100),
            softLockConflict: authoredConflict,
            epistemicType: EPISTEMIC_TYPES.has(raw.epistemicType || raw.epistemic_type)
                ? (raw.epistemicType || raw.epistemic_type) : '',
            reason: cleanText(raw.reason, 800)
        };
        if (state.dossierClaims.some(item => item.claimId === claim.claimId)) {
            return { accepted: false, error: 'duplicate_claim_id' };
        }
        state.dossierClaims.filter(prior => prior.characterId === characterId
            && prior.fieldPath === fieldPath && prior.status === 'active'
            && state.activeLineage.includes(prior.branchId)
            && !equivalentValue(prior.value, claim.value)).forEach(prior => {
            prior.maturityEvidence.contradictionCount = Number(prior.maturityEvidence.contradictionCount || 0) + 1;
        });
        claim.supersedesClaimIds.forEach(priorId => {
            const prior = state.dossierClaims.find(item => item.claimId === priorId);
            if (prior && prior.status === 'active') {
                prior.status = 'superseded';
                prior.supersededByClaimId = claim.claimId;
            }
        });
        state.dossierClaims.push(claim);
        if (!['user', 'import'].includes(origin)) {
            createNotification(state, claim, pendingCore ? 'pending_approval' : 'mutation');
        }
        return { accepted: true, claim };
    }

    function createAuthoredClaim(world, session, characterId, fieldPath, value, options = {}) {
        const state = ensureSession(world, session);
        if (!state) return { accepted: false, error: 'profile_disabled' };
        const unchanged = state.dossierClaims.find(claim => claim.characterId === characterId
            && claim.fieldPath === fieldPath && claim.status === 'active' && claim.maturity === 'authored'
            && state.activeLineage.includes(claim.branchId) && equivalentValue(claim.value, value));
        if (unchanged) return { accepted: true, unchanged: true, claim: unchanged };
        const prior = state.dossierClaims.filter(claim => claim.characterId === characterId
            && claim.fieldPath === fieldPath && claim.status === 'active'
            && state.activeLineage.includes(claim.branchId)).map(claim => claim.claimId);
        return createClaim(world, session, {
            characterId, fieldPath, value,
            mode: options.mode || 'replacement',
            origin: 'user',
            maturity: 'authored',
            reason: options.reason || 'User-authored dossier edit.',
            validFrom: options.validFrom || '',
            validUntil: options.validUntil || '',
            supersedesClaimIds: options.preserveConcurrent ? [] : prior
        }, { allowEvidenceFree: true });
    }

    function resolveDossier(world, session, entity, options = {}) {
        const state = initializeWorld(world, session);
        if (!state || !entity?.id) return { value: clone(entity || {}), appliedClaims: [], fieldMeta: {} };
        // The dossier is an *extension* of the studio entity, not a replacement.
        // authoredBase is only a snapshot taken when the character was first
        // seen, so anything the entity gained afterwards (a persona written
        // later, a description filled in by a subsequent turn) used to vanish
        // from the dossier — and, because the world prompt reads through
        // materializeEntity, from play as well. Story-born characters were
        // worst hit: their snapshot is deliberately minimal, so they resolved
        // to little more than a name. Start from the live entity and let the
        // snapshot and claims layer over it.
        const base = { ...baseFromEntity(entity), ...clone(state.authoredBase[entity.id] || {}) };
        // A snapshot must never blank a field the entity actually has.
        Object.entries(baseFromEntity(entity)).forEach(([key, value]) => {
            const current = base[key];
            const empty = current === undefined || current === null || current === ''
                || (Array.isArray(current) && !current.length);
            if (empty && value !== undefined && value !== null && value !== '') base[key] = value;
        });
        delete base._dossierOrigin;
        delete base._capturedAtRevision;
        const claims = state.dossierClaims
            .filter(claim => claim.characterId === entity.id
                && isCurrentlyApplicable(claim, state, options.worldTime)
                && dependenciesAreActive(claim, state))
            .sort((left, right) => claimAuthority(left) - claimAuthority(right)
                || left.createdAtTurn - right.createdAtTurn
                || left.createdAtRevision - right.createdAtRevision);
        const fieldMeta = {};
        claims.forEach(claim => {
            const current = getAtPath(base, claim.fieldPath);
            const next = claim.mode === 'additive' ? mergeAdditive(current, claim.value) : claim.value;
            setAtPath(base, claim.fieldPath, next);
            fieldMeta[claim.fieldPath] = {
                claimId: claim.claimId,
                origin: claim.origin,
                maturity: claim.maturity,
                mode: claim.mode,
                softLockConflict: claim.softLockConflict,
                automatic: !['user', 'import'].includes(claim.origin)
            };
        });
        return { value: base, appliedClaims: claims, fieldMeta };
    }

    function materializeEntity(world, session, entity, options = {}) {
        return resolveDossier(world, session, entity, options).value;
    }

    function maturationRule(claim) {
        const fieldPath = claim.fieldPath || '';
        if (NEVER_MATURE_PREFIXES.some(prefix => fieldPath.startsWith(prefix))
            || TRANSIENT_MATURATION_PATHS.has(fieldPath)) return null;
        if (fieldPath.startsWith('relationships.')) {
            return { provisionalTurns: 4, provisionalScenes: 1, establishedTurns: 16,
                establishedScenes: 3, establishedEvidence: 3 };
        }
        if (['persona', 'values', 'vulnerabilities', 'backstory', 'boundaries']
            .some(prefix => fieldPath === prefix || fieldPath.startsWith(`${prefix}.`))) {
            return { provisionalTurns: 6, provisionalScenes: 2, establishedTurns: 20,
                establishedScenes: 4, establishedEvidence: 4 };
        }
        return { provisionalTurns: 2, provisionalScenes: 1, establishedTurns: 10,
            establishedScenes: 2, establishedEvidence: 3 };
    }

    function matureClaims(world, session, context = {}) {
        const state = ensureSession(world, session);
        if (!state) return [];
        const revision = Number(context.revision ?? session.worldStateVersion ?? 0);
        if (revision <= state.lastMaturedRevision) return [];
        const sceneChanged = context.sceneChanged === true;
        const elapsedMinutes = Math.max(0, Number(context.elapsedMinutes || 0));
        const worldTime = context.worldTime || session.worldTime || '';
        const currentTime = worldTime ? Date.parse(worldTime) : NaN;
        const promoted = [];
        state.dossierClaims.forEach(claim => {
            if (claim.status !== 'active' || !state.activeLineage.includes(claim.branchId)) return;
            const validUntil = claim.validUntil ? Date.parse(claim.validUntil) : NaN;
            if (Number.isFinite(currentTime) && Number.isFinite(validUntil) && currentTime > validUntil) {
                claim.status = 'expired';
                return;
            }
            const rule = maturationRule(claim);
            if (claim.maturity === 'authored' || !rule) return;
            const metrics = claim.maturityEvidence;
            metrics.turnsSurvived += 1;
            if (sceneChanged) metrics.scenesSurvived += 1;
            metrics.worldTimeElapsed += elapsedMinutes;
            if (claim.maturity === 'ephemeral') {
                const reinforced = metrics.reinforcementCount >= 1 || metrics.independentEvidenceCount >= 2;
                if (metrics.contradictionCount === 0 && reinforced
                    && metrics.turnsSurvived >= rule.provisionalTurns
                    && metrics.scenesSurvived >= rule.provisionalScenes) {
                    claim.maturity = 'provisional';
                    promoted.push(claim.claimId);
                }
            } else if (claim.maturity === 'provisional') {
                const durableEvidence = metrics.independentEvidenceCount >= rule.establishedEvidence
                    || metrics.reinforcementCount >= Math.max(2, rule.establishedEvidence - 1);
                if (metrics.turnsSurvived >= rule.establishedTurns
                    && metrics.scenesSurvived >= rule.establishedScenes
                    && durableEvidence && metrics.contradictionCount === 0) {
                    claim.maturity = 'established';
                    promoted.push(claim.claimId);
                }
            }
        });
        state.lastMaturedRevision = revision;
        return promoted;
    }

    function suppressClaim(world, session, claimId, reason = '') {
        const state = ensureSession(world, session);
        const claim = state?.dossierClaims.find(item => item.claimId === claimId);
        if (!claim) return false;
        const existing = state.claimSuppressions.find(item => item.claimId === claimId
            && item.branchId === state.activeBranchId && item.status !== 'reverted');
        if (existing) return true;
        state.claimSuppressions.push({
            suppressionId: nextId(state, 'suppress'), claimId, branchId: state.activeBranchId,
            createdBy: 'user', createdAt: new Date().toISOString(), reason: cleanText(reason, 500),
            priorStatus: claim.status, status: 'active'
        });
        claim.status = 'user_suppressed';
        return true;
    }

    function restoreSuppressedClaim(world, session, claimId) {
        const state = ensureSession(world, session);
        if (!state) return false;
        const activeSuppressions = state.claimSuppressions
            .filter(item => item.claimId === claimId && item.status !== 'reverted');
        const priorStatus = activeSuppressions[activeSuppressions.length - 1]?.priorStatus || 'active';
        activeSuppressions.forEach(item => { item.status = 'reverted'; });
        const claim = state.dossierClaims.find(item => item.claimId === claimId);
        if (claim?.status === 'user_suppressed') claim.status = STATUSES.has(priorStatus) ? priorStatus : 'active';
        return !!claim;
    }

    function suppressEvidence(world, session, rawEvidenceIds, options = {}) {
        const state = ensureSession(world, session);
        if (!state) return null;
        const evidenceIds = normalizeEvidenceIds(rawEvidenceIds);
        if (!evidenceIds.length) return null;
        const existing = state.suppressedEvidence.find(item => item.status !== 'reverted'
            && item.branchId === state.activeBranchId
            && item.characterId === safeId(options.characterId)
            && equivalentValue(item.evidenceIds, evidenceIds));
        if (existing) return existing;
        const record = {
            suppressionId: nextId(state, 'evidence_suppress'),
            characterId: safeId(options.characterId),
            evidenceIds,
            branchId: state.activeBranchId,
            createdBy: 'user',
            createdAt: new Date().toISOString(),
            reason: cleanText(options.reason || 'User suppressed evidentiary record.', 500),
            snapshot: clone(options.snapshot),
            status: 'active'
        };
        state.suppressedEvidence.push(record);
        state.dossierClaims.filter(claim => claim.status === 'active'
            && state.activeLineage.includes(claim.branchId)
            && (!record.characterId || claim.characterId === record.characterId)
            && claim.evidenceIds.some(evidenceId => evidenceIds.includes(evidenceId)))
            .forEach(claim => suppressClaim(world, session, claim.claimId,
                `Evidence suppressed by ${record.suppressionId}.`));
        return record;
    }

    function restoreEvidenceSuppression(world, session, suppressionId) {
        const state = ensureSession(world, session);
        const record = state?.suppressedEvidence.find(item => item.suppressionId === suppressionId);
        if (!record || record.status === 'reverted') return null;
        record.status = 'reverted';
        record.revertedAt = new Date().toISOString();
        state.claimSuppressions.filter(item => item.status !== 'reverted'
            && String(item.reason || '').includes(record.suppressionId))
            .forEach(item => restoreSuppressedClaim(world, session, item.claimId));
        return clone(record);
    }

    function approveClaim(world, session, claimId) {
        const state = ensureSession(world, session);
        const claim = state?.dossierClaims.find(item => item.claimId === claimId);
        if (!claim || claim.status !== 'pending_approval') return false;
        claim.approval = {
            priorOrigin: claim.origin,
            priorMaturity: claim.maturity,
            approvedAt: new Date().toISOString(),
            approvedBy: 'user'
        };
        claim.status = 'active';
        claim.maturity = 'authored';
        claim.origin = 'user';
        claim.softLockConflict = false;
        claim.reason = `User approved: ${claim.reason || 'core identity change'}`;
        return true;
    }

    function acceptConflictingClaim(world, session, claimId) {
        const state = ensureSession(world, session);
        const claim = state?.dossierClaims.find(item => item.claimId === claimId);
        if (!claim || claim.status !== 'active' || !claim.softLockConflict
            || !state.activeLineage.includes(claim.branchId)) return false;
        state.dossierClaims.filter(prior => prior.claimId !== claim.claimId
            && prior.characterId === claim.characterId && prior.fieldPath === claim.fieldPath
            && prior.status === 'active' && prior.maturity === 'authored'
            && state.activeLineage.includes(prior.branchId))
            .forEach(prior => suppressClaim(world, session, prior.claimId,
                `Superseded by explicitly accepted claim ${claim.claimId}.`));
        claim.approval = {
            priorOrigin: claim.origin,
            priorMaturity: claim.maturity,
            approvedAt: new Date().toISOString(),
            approvedBy: 'user'
        };
        claim.origin = 'user';
        claim.maturity = 'authored';
        claim.softLockConflict = false;
        claim.reason = `User accepted authored-field challenge: ${claim.reason}`;
        return true;
    }

    function stageAgentPatch(world, session, raw) {
        const state = ensureSession(world, session);
        if (!state || !object(raw)) return { accepted: false, error: 'invalid_patch' };
        const sourceBranchId = safeId(raw.sourceBranchId || raw.source_branch_id || state.activeBranchId);
        const sourceRevision = Number(raw.sourceRevision ?? raw.source_revision ?? session.worldStateVersion ?? 0);
        if (sourceBranchId !== state.activeBranchId || sourceRevision !== Number(session.worldStateVersion || 0)) {
            return { accepted: false, error: 'stale_agent_result' };
        }
        const proposedClaim = clone(raw.proposedClaim || raw.proposed_claim || {});
        const draft = validateAutomaticDraft(proposedClaim, knownEvidence(session));
        if (draft.errors.length) {
            return { accepted: false, error: 'invalid_agent_claim', details: draft.errors };
        }
        const patch = {
            patchId: safeId(raw.patchId || raw.patch_id, nextId(state, 'patch')),
            sourceBranchId,
            sourceRevision,
            sourceTurnId: cleanText(raw.sourceTurnId || raw.source_turn_id, 160),
            sourceAgentResultId: cleanText(raw.sourceAgentResultId || raw.source_agent_result_id, 160),
            agentId: cleanText(raw.agentId || raw.agent_id, 160),
            proposedClaim: { ...proposedClaim, evidenceIds: draft.evidenceIds },
            status: 'staged',
            stagedAt: Date.now()
        };
        state.pendingAgentPatches.push(patch);
        state.pendingAgentPatches = state.pendingAgentPatches.slice(-500);
        return { accepted: true, patch };
    }

    function createProvisionalStoryNpc(world, session, entity, source = {}) {
        const state = ensureSession(world, session);
        if (!state || !entity?.id) return null;
        ensureCharacter(world, session, entity, { storyBorn: true });
        const sourceReceiptId = cleanText(source.sourceReceiptId || source.source_receipt_id, 160);
        const evidenceIds = normalizeEvidenceIds(source.evidenceIds || source.evidence_ids || []);
        if (!evidenceIds.length && sourceReceiptId) evidenceIds.push(`receipt:${sourceReceiptId}`);
        const common = {
            characterId: entity.id,
            origin: 'agent',
            maturity: 'provisional',
            sourceTurnId: source.sourceTurnId || source.source_turn_id || '',
            sourceReceiptId,
            sourceAgentResultId: source.sourceAgentResultId || source.source_agent_result_id || '',
            evidenceIds,
            reason: 'Provisional story-born NPC dossier generated from an accepted introduction.'
        };
        ['name', 'role', 'description', 'persona', 'age', 'pronouns', 'values', 'vulnerabilities',
            'backstory', 'boundaries', 'goals', 'routines', 'habits', 'relationships'].forEach(field => {
            if (entity[field] === undefined || entity[field] === '') return;
            createClaim(world, session, { ...common, fieldPath: field, mode: 'replacement', value: clone(entity[field]) }, {
                allowEvidenceFree: evidenceIds.length === 0 && source.allowEvidenceFree === true
            });
        });
        if (object(entity.substanceProfile)) {
            createClaim(world, session, {
                ...common, fieldPath: 'substanceProfile', mode: 'replacement', value: clone(entity.substanceProfile)
            }, { allowEvidenceFree: evidenceIds.length === 0 && source.allowEvidenceFree === true });
        }
        state.storyNpcLifecycle[entity.id] = {
            state: 'provisional', introducedAtTurn: Number(session.turnCount || 0),
            sourceTurnId: common.sourceTurnId, branchId: state.activeBranchId,
            appearances: 1, lastSeenTurn: Number(session.turnCount || 0)
        };
        return state.storyNpcLifecycle[entity.id];
    }

    function noteStoryNpcAppearance(world, session, characterId) {
        const state = ensureSession(world, session);
        const lifecycle = state?.storyNpcLifecycle?.[characterId];
        if (!lifecycle) return null;
        lifecycle.appearances = Number(lifecycle.appearances || 0) + 1;
        lifecycle.lastSeenTurn = Number(session.turnCount || 0);
        if (lifecycle.state === 'provisional' && lifecycle.appearances >= 2) lifecycle.state = 'recurring';
        if (lifecycle.state === 'recurring' && lifecycle.appearances >= 4) lifecycle.state = 'established';
        return lifecycle;
    }

    function knownEvidence(session, validation) {
        const result = new Set();
        const currentReceiptId = cleanText(validation?.receipt?.turn_id, 160);
        if (currentReceiptId) result.add(`receipt:${currentReceiptId}`);
        array(session.worldTurnReceipts).forEach(record => {
            const receiptId = cleanText(record?.receipt?.turn_id, 160);
            if (receiptId) result.add(`receipt:${receiptId}`);
        });
        array(session.turnEvents).forEach(event => { if (event?.committed !== false && event?.id) result.add(`event:${event.id}`); });
        array(validation?.acceptedEvents).forEach(event => { if (event?.id) result.add(`event:${event.id}`); });
        Object.values(object(session.entityStates) ? session.entityStates : {}).forEach(entityState => {
            array(entityState?.observations).forEach(observation => {
                if (observation?.id) result.add(`observation:${observation.id}`);
                if (observation?.eventId) result.add(`event:${observation.eventId}`);
            });
        });
        array(session.cognitionLog?.records).forEach(record => {
            if (record?.id) result.add(`${record.kind === 'communication' ? 'communication' : 'cognition'}:${record.id}`);
        });
        const lineage = array(session.dossierState?.activeLineage);
        array(session.dossierState?.dossierClaims).forEach(claim => {
            if (claim?.claimId && claim.status === 'active' && lineage.includes(claim.branchId)) {
                result.add(`claim:${claim.claimId}`);
            }
        });
        return result;
    }

    function prepareCommit(world, session, validation) {
        if (!isEnabled(world)) return { enabled: false, accepted: true, claims: [], patches: [], errors: [] };
        const state = ensureSession(world, session);
        const updates = object(validation?.receipt?.state_updates) ? validation.receipt.state_updates : {};
        const known = knownEvidence(session, validation);
        const errors = [];
        const sourceReceiptId = cleanText(validation?.receipt?.turn_id, 160);
        const claims = array(updates.dossier_claim_updates).map((raw, index) => {
            if (!object(raw)) return null;
            const draft = validateAutomaticDraft(raw, known);
            draft.errors.forEach(error => errors.push(`dossier claim ${index + 1}: ${error}`));
            return {
                ...clone(raw),
                characterId: raw.character_id || raw.characterId,
                fieldPath: raw.field_path || raw.fieldPath,
                evidenceIds: draft.evidenceIds,
                origin: 'main_model',
                sourceReceiptId,
                sourceTurnId: sourceReceiptId,
                branchId: state.activeBranchId
            };
        }).filter(Boolean);
        // Strongly typed accepted events also produce dossier history. They do
        // not replace the receipt reducer's live state; they make its evidence
        // inspectable and temporally reusable.
        array(validation?.acceptedEvents).forEach(event => {
            if (!event?.id || !event.actor_id || event.actor_id === 'player') return;
            const evidenceIds = [`event:${event.id}`];
            if (event.type === 'outfit' && event.outfit) {
                claims.push({
                    characterId: event.actor_id,
                    fieldPath: 'outfits.current', mode: 'temporal', value: event.outfit,
                    origin: 'runtime', maturity: 'ephemeral', evidenceIds,
                    sourceReceiptId, sourceTurnId: sourceReceiptId, branchId: state.activeBranchId,
                    reason: 'Current outfit derived from an accepted outfit event.'
                });
                claims.push({
                    characterId: event.actor_id,
                    fieldPath: 'outfitHistory', mode: 'additive',
                    value: [{
                        outfitId: `outfit_${event.id}`,
                        characterId: event.actor_id,
                        description: event.outfit,
                        evidenceIds,
                        sourceTurnId: sourceReceiptId,
                        provenance: 'accepted receipt outfit event'
                    }],
                    origin: 'runtime', maturity: 'established', evidenceIds,
                    sourceReceiptId, sourceTurnId: sourceReceiptId, branchId: state.activeBranchId,
                    reason: 'Append-only outfit history derived from accepted evidence.'
                });
            }
            if (event.type === 'relationship' && event.target_id) {
                claims.push({
                    characterId: event.actor_id,
                    fieldPath: `relationships.${safeId(event.target_id)}.evidence`, mode: 'additive',
                    value: [{ eventId: event.id, change: event.change, label: event.label || '', reason: event.cause || '' }],
                    origin: 'runtime', maturity: 'ephemeral', evidenceIds,
                    sourceReceiptId, sourceTurnId: sourceReceiptId, branchId: state.activeBranchId,
                    reason: 'Directional relationship evidence; the receipt-owned relationship reducer remains authoritative.'
                });
            }
            if (event.type === 'observation' && event.observation) {
                claims.push({
                    characterId: event.actor_id,
                    fieldPath: 'cognition.observations', mode: 'additive',
                    value: [{ id: event.id, text: event.observation, epistemicType: 'observed_fact', evidenceIds }],
                    origin: 'runtime', maturity: 'ephemeral', evidenceIds,
                    epistemicType: 'observed_fact',
                    sourceReceiptId, sourceTurnId: sourceReceiptId, branchId: state.activeBranchId,
                    reason: 'Observation derived from accepted scene evidence.'
                });
            }
        });
        const requestedPatchIds = unique(updates.dossier_agent_patch_ids || updates.dossierAgentPatchIds || []);
        const patches = requestedPatchIds.map(patchId => state.pendingAgentPatches.find(patch => patch.patchId === patchId))
            .filter(Boolean);
        requestedPatchIds.forEach(patchId => {
            const patch = state.pendingAgentPatches.find(item => item.patchId === patchId);
            if (!patch) errors.push(`agent patch ${patchId}: not found`);
            else if (patch.status !== 'staged' || patch.sourceBranchId !== state.activeBranchId
                || patch.sourceRevision !== Number(session.worldStateVersion || 0)) {
                errors.push(`agent patch ${patchId}: stale or branch-invalid`);
            } else {
                const draft = validateAutomaticDraft(patch.proposedClaim, known);
                draft.errors.forEach(error => errors.push(`agent patch ${patchId}: ${error}`));
            }
        });
        return { enabled: true, accepted: errors.length === 0, claims, patches, errors };
    }

    function applyPreparedCommit(world, session, prepared) {
        if (!prepared?.enabled || !prepared.accepted) return { applied: false, claims: [] };
        const state = ensureSession(world, session);
        const stalePatch = prepared.patches.find(patch => patch.status !== 'staged'
            || patch.sourceBranchId !== state.activeBranchId
            || patch.sourceRevision !== Number(session.worldStateVersion || 0));
        if (stalePatch) return { applied: false, claims: [], error: `stale_agent_patch:${stalePatch.patchId}` };
        const created = [];
        prepared.claims.concat(prepared.patches.map(patch => ({
            ...clone(patch.proposedClaim),
            origin: 'agent',
            sourceTurnId: patch.sourceTurnId,
            sourceAgentResultId: patch.sourceAgentResultId,
            branchId: patch.sourceBranchId
        }))).forEach(raw => {
            const result = createClaim(world, session, raw);
            if (result.accepted) created.push(result.claim || result.reinforced);
        });
        prepared.patches.forEach(patch => { patch.status = 'committed'; });
        return { applied: true, claims: created };
    }

    function finalizeCommit(world, session, validation, audit, prepared) {
        if (!prepared?.enabled || !prepared.accepted) return [];
        const sceneChanged = validation?.receipt?.scene?.transition?.boundary_type
            && validation.receipt.scene.transition.boundary_type !== 'none';
        const promoted = matureClaims(world, session, {
            revision: audit?.world_state_version,
            sceneChanged,
            elapsedMinutes: validation?.receipt?.state_updates?.time_skip_minutes || 0,
            worldTime: audit?.scene?.world_time || session.worldTime || ''
        });
        array(audit?.scene?.present_character_ids).forEach(characterId => noteStoryNpcAppearance(world, session, characterId));
        return promoted;
    }

    function captureDiscardedState(world, session) {
        const state = ensureSession(world, session);
        return state ? {
            activeBranchId: state.activeBranchId,
            claims: clone(state.dossierClaims),
            patches: clone(state.pendingAgentPatches),
            notifications: clone(state.notifications),
            suppressedEvidence: clone(state.suppressedEvidence),
            authoredBase: clone(state.authoredBase),
            storyNpcLifecycle: clone(state.storyNpcLifecycle)
        } : null;
    }

    function forkAfterRestore(world, session, discarded) {
        const state = ensureSession(world, session);
        if (!state || !discarded) return null;
        const retainedIds = new Set(state.dossierClaims.map(claim => claim.claimId));
        const abandonedBranchId = discarded.activeBranchId;
        array(discarded.claims).filter(claim => !retainedIds.has(claim.claimId)).forEach(claim => {
            state.dossierClaims.push({ ...claim, status: 'branch_invalid', branchId: abandonedBranchId });
        });
        array(discarded.patches).filter(patch => patch.status === 'staged').forEach(patch => {
            if (!state.pendingAgentPatches.some(item => item.patchId === patch.patchId)) {
                state.pendingAgentPatches.push({ ...patch, status: 'branch_invalid' });
            }
        });
        Object.entries(object(discarded.authoredBase) ? discarded.authoredBase : {}).forEach(([characterId, base]) => {
            if (state.authoredBase[characterId] || base?._dossierOrigin !== 'story') return;
            const hasDiscardedClaims = state.dossierClaims.some(claim => claim.characterId === characterId
                && claim.status === 'branch_invalid' && claim.branchId === abandonedBranchId);
            if (!hasDiscardedClaims) return;
            state.branchArchive.characters[characterId] = {
                characterId,
                base: clone(base),
                lifecycle: clone(discarded.storyNpcLifecycle?.[characterId] || null),
                branchId: abandonedBranchId,
                archivedAt: new Date().toISOString()
            };
        });
        const retainedEvidenceSuppressions = new Set(state.suppressedEvidence.map(item => item.suppressionId));
        array(discarded.suppressedEvidence).filter(item => !retainedEvidenceSuppressions.has(item.suppressionId))
            .forEach(item => state.branchArchive.evidence.push({
                ...clone(item), branchId: abandonedBranchId, status: 'branch_invalid'
            }));
        state.branchArchive.evidence = state.branchArchive.evidence.slice(-500);
        const priorBranch = state.activeBranchId;
        const nextBranch = safeId(`branch_${Date.now()}_${Number(session._worldEpoch || 0) + 1}`);
        state.activeLineage = unique(array(state.activeLineage).concat(priorBranch));
        state.activeBranchId = nextBranch;
        state.lastMaturedRevision = Number(session.worldStateVersion || 0);
        return nextBranch;
    }

    function listArchivedCharacters(world, session) {
        const state = ensureSession(world, session);
        if (!state) return [];
        return Object.values(state.branchArchive.characters).map(record => clone(record));
    }

    function claimHistory(world, session, characterId) {
        const state = ensureSession(world, session);
        if (!state) return { active: [], history: [], suppressed: [], branchInvalid: [], pending: [], evidence: [], suppressedEvidence: [] };
        const all = state.dossierClaims.filter(claim => claim.characterId === characterId);
        return {
            active: all.filter(claim => claim.status === 'active' && state.activeLineage.includes(claim.branchId)),
            history: all.filter(claim => ['superseded', 'expired'].includes(claim.status)),
            suppressed: all.filter(claim => claim.status === 'user_suppressed'),
            branchInvalid: all.filter(claim => claim.status === 'branch_invalid'),
            pending: all.filter(claim => claim.status === 'pending_approval'),
            evidence: unique(all.flatMap(claim => claim.evidenceIds)),
            suppressedEvidence: state.suppressedEvidence.filter(item => item.characterId === characterId)
                .concat(state.branchArchive.evidence.filter(item => item.characterId === characterId))
                .map(item => clone(item))
        };
    }

    function getNotifications(world, session, options = {}) {
        const state = ensureSession(world, session);
        if (!state) return [];
        return state.notifications.filter(item => options.includeReviewed || !item.reviewed);
    }

    function markNotificationReviewed(world, session, notificationId) {
        const state = ensureSession(world, session);
        const notification = state?.notifications.find(item => item.notificationId === notificationId);
        if (!notification) return false;
        notification.reviewed = true;
        return true;
    }

    function promptContext(world, session, entities, options = {}) {
        const state = ensureSession(world, session);
        if (!state) return '';
        const blocks = array(entities).map(entity => {
            const resolved = resolveDossier(world, session, entity, options);
            const claims = resolved.appliedClaims;
            if (!claims.length) return '';
            const byMaturity = maturity => claims.filter(claim => claim.maturity === maturity)
                .map(claim => `${claim.fieldPath}: ${typeof claim.value === 'string' ? claim.value : JSON.stringify(claim.value)}`)
                .slice(0, 12);
            const sections = [
                ['AUTHORED', byMaturity('authored')],
                ['ESTABLISHED', byMaturity('established')],
                ['PROVISIONAL', byMaturity('provisional')],
                ['CURRENT/EPHEMERAL', byMaturity('ephemeral')]
            ].filter(([, values]) => values.length)
                .map(([label, values]) => `${label}: ${values.join(' | ')}`);
            return sections.length ? `[DOSSIER CLAIMS: ${entity.name}]\n${sections.join('\n')}` : '';
        }).filter(Boolean);
        return blocks.length ? `\n\n[DOSSIER AUTHORITY]\n${blocks.join('\n\n')}\nTreat maturity as confidence. Provisional information is usable but not immutable. Objective scene state and accepted receipts outrank dossier overlays.` : '';
    }

    function extendReceiptSchema(schema) {
        if (!object(schema)) return schema;
        const stateUpdates = schema.properties?.state_updates;
        if (!object(stateUpdates?.properties)) return schema;
        stateUpdates.properties.dossier_claim_updates = {
            type: 'array',
            description: 'Evidence-backed character dossier claims. Never use for location, scene cast, inventory quantity, clock, movement or active altered-state truth.',
            items: {
                type: 'object',
                required: ['character_id', 'field_path', 'mode', 'value', 'evidence_ids', 'reason'],
                properties: {
                    character_id: { type: 'string' },
                    field_path: { type: 'string' },
                    mode: { type: 'string', enum: [...MODES] },
                    value: {},
                    evidence_ids: { type: 'array', items: { type: 'string' } },
                    maturity: { type: 'string', enum: ['ephemeral', 'provisional', 'established'] },
                    epistemic_type: { type: 'string', enum: [...EPISTEMIC_TYPES] },
                    valid_from: { type: 'string' },
                    valid_until: { type: 'string' },
                    supersedes_claim_ids: { type: 'array', items: { type: 'string' } },
                    reason: { type: 'string' }
                }
            }
        };
        stateUpdates.properties.dossier_agent_patch_ids = {
            type: 'array',
            description: 'Previously staged, branch-valid agent patch IDs to commit atomically.',
            items: { type: 'string' }
        };
        return schema;
    }

    return Object.freeze({
        PROFILE_ID, VERSION, isEnabled, ensureSession, initializeWorld, ensureCharacter,
        createClaim, createAuthoredClaim, resolveDossier, materializeEntity, matureClaims,
        suppressClaim, restoreSuppressedClaim, suppressEvidence, restoreEvidenceSuppression,
        approveClaim, acceptConflictingClaim, stageAgentPatch,
        createProvisionalStoryNpc, noteStoryNpcAppearance, prepareCommit, applyPreparedCommit,
        finalizeCommit, captureDiscardedState, forkAfterRestore, claimHistory,
        listArchivedCharacters, getNotifications, markNotificationReviewed, promptContext, extendReceiptSchema
    });
});
