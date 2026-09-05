(function initHordeWorldMechanics(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.HordeWorldMechanics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildHordeWorldMechanics() {
    'use strict';

    const PROFILE_ID = 'world_mechanics_v1';
    const RELATIONSHIP_AXES = Object.freeze([
        'trust', 'affection', 'desire', 'stress', 'compatibility', 'respect'
    ]);
    const RESONANCE_VALUES = Object.freeze([
        'aligned', 'partially_aligned', 'neutral', 'mismatched', 'strongly_mismatched'
    ]);
    const ALTERED_PHASES = Object.freeze([
        'onset', 'active', 'strong', 'declining', 'residual', 'resolved'
    ]);
    const COGNITION_KINDS = Object.freeze([
        'observation', 'communication', 'interpretation', 'belief', 'memory', 'reassessment'
    ]);
    const INVENTORY_ACTIONS = Object.freeze([
        'acquire', 'reveal', 'transfer', 'consume', 'measure', 'discard', 'lose', 'resolve_quantity'
    ]);

    // Pacing curve for altered-state phase progression. Onset is turn-count
    // only, by design — a real-minutes gate meant a dialogue-heavy scene
    // could sit for 45 narrative minutes without the clock ever advancing
    // enough to register, so a character coming up on MDMA could just never
    // visibly arrive. Every later stage checks BOTH a turn count and a
    // minute count and fires on whichever comes first, so a long skip (a
    // fast-forwarded night) and a slow real-time scene both make progress.
    const JOURNEY_CLASSES = Object.freeze({
        short: {
            toActiveTurn: { immediate: 1, building: 2 },
            strong: { turn: 1, minutes: 3 }, declining: { turn: 2, minutes: 10 }, resolved: { turn: 3, minutes: 30 }
        },
        medium: {
            toActiveTurn: { immediate: 1, building: 2 },
            strong: { turn: 3, minutes: 40 }, declining: { turn: 5, minutes: 120 }, resolved: { turn: 8, minutes: 360 }
        },
        long: {
            toActiveTurn: { immediate: 1, building: 3 },
            strong: { turn: 6, minutes: 180 }, declining: { turn: 10, minutes: 420 }, resolved: { turn: 16, minutes: 840 }
        }
    });
    // Rolled once per episode (at onset/redose), not re-rolled every turn —
    // it's a stable trait of that dose, not a coin flip on every read. Only
    // scales the post-onset stages; onset itself stays a fixed guarantee.
    const PACE_MULTIPLIERS = Object.freeze({ fast: 0.7, normal: 1, slow: 1.4 });
    const PACE_KEYS = Object.freeze(['fast', 'normal', 'slow']);

    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
    const text = (value, limit = 400) => String(value == null ? '' : value).trim().slice(0, limit);
    const list = value => Array.isArray(value) ? value : [];
    const unique = values => [...new Set(values.filter(Boolean))];
    const id = (value, fallback = '') => text(value || fallback, 120).replace(/[^a-zA-Z0-9:_-]/g, '_');

    function isEnabled(world) {
        return world?.mechanicsProfile === PROFILE_ID || world?.mechanics?.profile === PROFILE_ID;
    }

    function normalizeRelationshipAxes(raw) {
        const result = {};
        if (!object(raw)) return result;
        RELATIONSHIP_AXES.forEach(axis => {
            const value = raw[axis];
            if (value === null || value === undefined || value === '') return;
            const numeric = Number(value);
            if (Number.isFinite(numeric)) result[axis] = Math.max(-100, Math.min(100, numeric));
        });
        return result;
    }

    function normalizeCheckpointOverlay(raw) {
        const source = object(raw) ? raw : {};
        const relationships = {};
        Object.entries(object(source.relationships) ? source.relationships : {}).forEach(([key, axes]) => {
            const normalized = normalizeRelationshipAxes(axes);
            const directionalKey = text(key, 260).replace('::', '->');
            if (directionalKey && Object.keys(normalized).length) relationships[directionalKey] = normalized;
        });
        return {
            id: id(source.id, 'checkpoint'),
            canonicalDate: text(source.canonicalDate, 80),
            startLocationId: id(source.startLocationId),
            bonusTimeMinutes: Number.isFinite(Number(source.bonusTimeMinutes))
                ? Math.trunc(Number(source.bonusTimeMinutes)) : null,
            durableFacts: list(source.durableFacts).map(value => text(value, 500)).filter(Boolean).slice(0, 120),
            playerInventory: list(source.playerInventory).map(normalizeInventoryContainer).filter(Boolean).slice(0, 120),
            entityStates: object(source.entityStates) ? clone(source.entityStates) : {},
            relationships,
            actorCognition: object(source.actorCognition) ? clone(source.actorCognition) : {},
            intro: text(source.intro, 6000)
        };
    }

    function ensureSession(world, session) {
        if (!isEnabled(world) || !session) return null;
        if (!object(session.worldMechanics)) session.worldMechanics = {};
        const state = session.worldMechanics;
        state.version = 1;
        state.profile = PROFILE_ID;
        if (!object(state.checkpoint)) state.checkpoint = {
            id: '', applied: false, appliedAt: null, baselineRevision: 0, superseded: false
        };
        if (!Array.isArray(state.durableFacts)) state.durableFacts = [];
        if (!object(state.relationshipAxes)) state.relationshipAxes = {};
        if (!object(state.alteredStates)) state.alteredStates = {};
        Object.entries(state.alteredStates).forEach(([actorId, value]) => {
            const records = Array.isArray(value) ? value : (object(value) && value.profileKey ? [value] : []);
            state.alteredStates[actorId] = records
                .filter(record => object(record) && record.profileKey && record.status !== 'resolved')
                .map(record => clone(record));
            if (!state.alteredStates[actorId].length) delete state.alteredStates[actorId];
        });
        if (!object(state.inventory)) state.inventory = { containers: {}, observations: [] };
        if (!object(state.inventory.containers)) state.inventory.containers = {};
        if (!Array.isArray(state.inventory.observations)) state.inventory.observations = [];
        if (!Array.isArray(state.cognition)) state.cognition = [];
        if (!Array.isArray(state.sceneCards)) state.sceneCards = [];
        if (!Array.isArray(state.gmProposals)) state.gmProposals = [];
        if (!object(state.sceneTelemetry)) state.sceneTelemetry = {};
        // The dossier ledger is a separate authority layer, but shares the
        // session lifecycle so snapshots and branch restores stay atomic.
        globalThis.HordeDossierClaims?.initializeWorld?.(world, session);
        return state;
    }

    function applyCheckpoint(world, session, life, options = {}) {
        const state = ensureSession(world, session);
        if (!state) return { applied: false, reason: 'profile_disabled' };
        const receiptCount = list(session.worldTurnReceipts).length;
        const hasCommittedPlay = receiptCount > 0 || Number(session.worldStateVersion || 0) > 0
            || state.checkpoint.superseded === true;
        if (hasCommittedPlay && options.explicitReset !== true) {
            return { applied: false, reason: 'committed_play_exists' };
        }
        const overlay = normalizeCheckpointOverlay(life?.checkpointOverlay);
        if (!overlay.id || !life?.checkpointOverlay) return { applied: false, reason: 'checkpoint_missing' };

        state.checkpoint = {
            id: overlay.id,
            canonicalDate: overlay.canonicalDate,
            applied: true,
            appliedAt: Date.now(),
            baselineRevision: 0,
            superseded: false
        };
        state.durableFacts = clone(overlay.durableFacts);
        state.relationshipAxes = clone(overlay.relationships);
        state.cognition = [];
        Object.entries(overlay.actorCognition).forEach(([actorId, records]) => {
            list(records).forEach((record, index) => {
                const normalized = normalizeCognitionRecord(record, actorId, `checkpoint:${overlay.id}:${index + 1}`);
                if (normalized) state.cognition.push(normalized);
            });
        });
        state.inventory = { containers: {}, observations: [] };
        state.alteredStates = {};
        state.sceneCards = [];
        state.gmProposals = [];
        state.committedReceiptIds = [];
        overlay.playerInventory.forEach(container => {
            state.inventory.containers[container.id] = container;
            list(container.observations).forEach(observation => state.inventory.observations.push(clone(observation)));
        });
        if (overlay.startLocationId) session.playerLocation = overlay.startLocationId;
        if (overlay.bonusTimeMinutes !== null) session.bonusTimeMinutes = overlay.bonusTimeMinutes;
        if (overlay.intro) session.pendingOriginIntro = overlay.intro;
        Object.entries(overlay.entityStates).forEach(([actorId, patch]) => {
            if (!object(patch)) return;
            const current = object(session.entityStates?.[actorId]) ? session.entityStates[actorId] : {};
            session.entityStates[actorId] = { ...current, ...clone(patch) };
        });
        return { applied: true, checkpointId: overlay.id };
    }

    function markCheckpointSuperseded(world, session) {
        const state = ensureSession(world, session);
        if (!state || !state.checkpoint.applied) return;
        state.checkpoint.superseded = true;
    }

    function receiptIdentityGuard(world, session, receipt) {
        if (!isEnabled(world)) return { allowed: true };
        const turnId = text(receipt?.turn_id, 100);
        if (!turnId) return { allowed: true };
        const prior = list(session.worldTurnReceipts).find(item => text(item?.receipt?.turn_id, 100) === turnId);
        if (!prior) return { allowed: true };
        return {
            allowed: false,
            reason: 'committed_historical_turn',
            detail: 'Use an explicit branch/replay, timeline rewind, or canon-mutation workflow.'
        };
    }

    function normalizeSceneMetadata(scene) {
        const telemetry = object(scene?.telemetry) ? scene.telemetry : {};
        const transition = object(scene?.transition) ? scene.transition : {};
        return {
            telemetry: {
                topic: text(telemetry.topic, 160),
                mood: text(telemetry.mood, 120),
                tension: text(telemetry.tension, 80),
                interaction: text(telemetry.interaction, 160),
                sounds: list(telemetry.sounds).map(value => text(value, 120)).filter(Boolean).slice(0, 20),
                elapsedContext: text(telemetry.elapsed_context || telemetry.elapsedContext, 160)
            },
            transition: {
                boundaryType: ['none', 'time_skip', 'location_change', 'cast_change', 'sequence_change', 'manual']
                    .includes(transition.boundary_type || transition.boundaryType)
                    ? (transition.boundary_type || transition.boundaryType) : 'none',
                evidence: text(transition.evidence, 400),
                priorSceneId: id(transition.prior_scene_id || transition.priorSceneId)
            }
        };
    }

    function normalizeBasis(raw) {
        return list(raw).map(item => {
            if (typeof item === 'string') return { type: 'event', id: text(item, 160) };
            if (!object(item)) return null;
            const type = ['event', 'observation', 'communication', 'cognition'].includes(item.type)
                ? item.type : 'event';
            const sourceId = text(item.id || item.ref, 160);
            return sourceId ? { type, id: sourceId } : null;
        }).filter(Boolean).slice(0, 40);
    }

    function normalizeCognitionRecord(raw, fallbackActorId = '', fallbackId = '') {
        if (!object(raw)) return null;
        const actorId = id(raw.actor_id || raw.actorId || fallbackActorId);
        const kind = COGNITION_KINDS.includes(raw.kind) ? raw.kind : 'interpretation';
        const value = text(raw.text || raw.value, 600);
        if (!actorId || !value) return null;
        return {
            id: id(raw.id, fallbackId || `cognition_${Date.now()}`),
            actorId,
            kind,
            text: value,
            confidence: Number.isFinite(Number(raw.confidence))
                ? Math.max(0, Math.min(1, Number(raw.confidence))) : null,
            basis: normalizeBasis(raw.basis || raw.provenance),
            supersedes: id(raw.supersedes),
            acceptedRevision: Number(raw.acceptedRevision || 0)
        };
    }

    function knownProvenance(session, acceptedEvents) {
        const refs = new Set();
        list(session.turnEvents).forEach(event => {
            if (event?.committed !== false && event?.id) refs.add(`event:${event.id}`);
        });
        list(acceptedEvents).forEach(event => { if (event?.id) refs.add(`event:${event.id}`); });
        Object.values(object(session.entityStates) ? session.entityStates : {}).forEach(actor => {
            list(actor?.observations).forEach(observation => {
                if (observation?.id) refs.add(`observation:${observation.id}`);
                if (observation?.eventId) refs.add(`event:${observation.eventId}`);
            });
        });
        const state = object(session.worldMechanics) ? session.worldMechanics : {};
        list(state.cognition).forEach(record => {
            if (record?.id) refs.add(`cognition:${record.id}`);
            if (record?.kind === 'communication' && record?.id) refs.add(`communication:${record.id}`);
        });
        // Already-established altered-state provenance (including
        // "manual:dossier:<ts>" ids the app itself stamps when a human edits
        // an altered state via the UI, not an in-fiction event) is not
        // something the model can ever justify with a fresh accepted event —
        // there was never one to begin with. Once accepted, a source stays
        // known forever; re-referencing it (e.g. a phase update — onset to
        // declining) must not be re-litigated against provenance that will
        // never exist.
        list(state.alteredStates ? Object.values(state.alteredStates) : []).forEach(records => {
            list(records).forEach(record => {
                list(record?.sourceEventIds).forEach(eventId => { if (eventId) refs.add(`event:${eventId}`); });
            });
        });
        return refs;
    }

    function normalizeInventoryContainer(raw) {
        if (!object(raw)) return null;
        const containerId = id(raw.id || raw.container_id || raw.containerId);
        const name = text(raw.name || raw.item, 180);
        if (!containerId || !name) return null;
        return {
            id: containerId,
            name,
            kind: raw.kind === 'continuous' ? 'continuous' : 'discrete',
            holderId: id(raw.holder_id || raw.holderId || 'player'),
            count: raw.kind === 'continuous' ? null
                : (Number.isFinite(Number(raw.count)) ? Math.max(0, Math.trunc(Number(raw.count))) : null),
            currentQuantity: raw.kind === 'continuous' && Number.isFinite(Number(raw.current_quantity ?? raw.currentQuantity))
                ? Number(raw.current_quantity ?? raw.currentQuantity) : null,
            quantityUnit: text(raw.quantity_unit || raw.quantityUnit, 40),
            exhaustive: raw.exhaustive === true,
            observations: list(raw.observations).map(normalizeQuantityObservation).filter(Boolean)
        };
    }

    function normalizeQuantityObservation(raw) {
        if (!object(raw)) return null;
        const observationId = id(raw.id);
        if (!observationId) return null;
        const quantity = Number(raw.quantity);
        return {
            id: observationId,
            quantity: Number.isFinite(quantity) ? quantity : null,
            unit: text(raw.unit, 40),
            eventId: text(raw.event_id || raw.eventId, 160),
            observedAt: text(raw.observed_at || raw.observedAt, 100),
            observerId: id(raw.observer_id || raw.observerId || 'player'),
            method: text(raw.method, 120)
        };
    }

    function normalizeInventoryEvent(raw, index) {
        if (!object(raw)) return null;
        const action = INVENTORY_ACTIONS.includes(raw.action) ? raw.action : '';
        const containerId = id(raw.container_id || raw.containerId);
        if (!action || !containerId) return null;
        return {
            id: id(raw.id, `inventory_${index + 1}`),
            action,
            containerId,
            actorId: id(raw.actor_id || raw.actorId || 'player'),
            targetActorId: id(raw.target_actor_id || raw.targetActorId),
            item: text(raw.item, 180),
            kind: raw.kind === 'continuous' ? 'continuous' : 'discrete',
            count: Number.isFinite(Number(raw.count)) ? Math.max(0, Math.trunc(Number(raw.count))) : null,
            quantity: Number.isFinite(Number(raw.quantity)) ? Number(raw.quantity) : null,
            unit: text(raw.unit, 40),
            measured: raw.measured === true,
            exhaustive: raw.exhaustive === true,
            evidenceEventIds: list(raw.evidence_event_ids || raw.evidenceEventIds).map(value => text(value, 160)).filter(Boolean)
        };
    }

    function normalizeAlteredStateUpdate(raw, index, registry) {
        if (!object(raw)) return null;
        const actorId = id(raw.actor_id || raw.actorId);
        const profileKey = id(raw.profile_key || raw.profileKey);
        const phase = ALTERED_PHASES.includes(raw.phase) ? raw.phase : '';
        if (!actorId || !profileKey || !phase) return null;
        const profile = registry?.profiles?.[profileKey];
        if (!profile) return { invalid: 'excluded_or_unknown_profile', actorId, profileKey };
        return {
            id: id(raw.id, `altered_${index + 1}`),
            actorId,
            profileKey,
            sourceEventIds: unique(list(raw.source_event_ids || raw.sourceEventIds)
                .map(value => text(value, 160))).slice(0, 20),
            phase,
            domains: (list(raw.domains).length ? list(raw.domains) : list(profile.domains))
                .map(value => text(value, 120)).filter(Boolean).slice(0, 12),
            selfAssessment: text(raw.self_assessment || raw.selfAssessment, 200),
            selfAssessmentReliability: ['reliable', 'partially_reliable', 'unreliable', 'unknown']
                .includes(raw.self_assessment_reliability || raw.selfAssessmentReliability)
                ? (raw.self_assessment_reliability || raw.selfAssessmentReliability) : 'unknown',
            observable: ['none', 'subtle', 'noticeable', 'obvious', 'unknown'].includes(raw.observable)
                ? raw.observable : 'unknown',
            observedAt: text(raw.observed_at || raw.observedAt, 100),
            redose: raw.redose === true,
            status: phase === 'resolved' ? 'resolved' : 'active'
        };
    }

    function prepareCommit(world, session, validation, registry, options = {}) {
        if (!isEnabled(world)) return { enabled: false, accepted: true, errors: [] };
        const state = ensureSession(world, session);
        const updates = object(validation.receipt?.state_updates) ? validation.receipt.state_updates : {};
        const errors = [];
        const acceptedIds = new Set(list(validation.acceptedEvents).map(event => event.id).filter(Boolean));
        const known = knownProvenance(session, validation.acceptedEvents);
        // Record-level validation failures DROP that one record; they never
        // void the whole receipt. A state_update citing an event that was
        // itself dropped (commonly: the model omitted actor_id on an event,
        // so the engine rejected it) used to cascade into a fatal
        // mechanics_validation_failed, discarding an otherwise-valid receipt
        // — journey_action, movement, transactions and all. That is a far
        // worse outcome than losing one relationship axis or altered-state
        // phase bump. Dropped records are still reported, so nothing is
        // silently swallowed.
        const dropped = [];
        const requireBasis = (basis, label) => {
            if (!basis.length) {
                dropped.push(`${label}: missing evidentiary basis`);
                return false;
            }
            const missing = basis.filter(ref => !known.has(`${ref.type}:${ref.id}`));
            if (missing.length) dropped.push(`${label}: unknown provenance ${missing.map(ref => `${ref.type}:${ref.id}`).join(', ')}`);
            return missing.length === 0;
        };

        const cognition = list(updates.actor_cognition_updates).map((raw, index) =>
            normalizeCognitionRecord(raw, '', `cognition_${validation.receipt.turn_id}_${index + 1}`)).filter(Boolean)
            .filter(record => requireBasis(record.basis, `cognition ${record.id}`));

        const relationships = list(updates.relationship_axis_updates).map((raw, index) => {
            if (!object(raw)) return null;
            const sourceId = id(raw.source_actor_id || raw.sourceActorId);
            const targetId = id(raw.target_actor_id || raw.targetActorId);
            const axes = normalizeRelationshipAxes(raw.axes || raw.changes);
            const basis = normalizeBasis(raw.basis || raw.provenance);
            if (!sourceId || !targetId || sourceId === targetId || !Object.keys(axes).length) return null;
            const record = {
                id: id(raw.id, `relationship_${validation.receipt.turn_id}_${index + 1}`),
                sourceId, targetId, axes, reason: text(raw.reason, 400), basis
            };
            if (!record.reason) {
                dropped.push(`relationship ${record.id}: meaningful reason required`);
                return null;
            }
            return requireBasis(basis, `relationship ${record.id}`) ? record : null;
        }).filter(Boolean);

        const inventory = list(updates.inventory_events).map(normalizeInventoryEvent).filter(Boolean)
            .filter(event => {
                const missing = event.evidenceEventIds.filter(eventId =>
                    !known.has(`event:${eventId}`) && !acceptedIds.has(eventId));
                if (missing.length) dropped.push(`inventory ${event.id}: unknown evidence event ${missing.join(', ')}`);
                return missing.length === 0;
            });

        const altered = list(updates.altered_state_updates)
            .map((raw, index) => normalizeAlteredStateUpdate(raw, index, registry)).filter(Boolean)
            .filter(update => {
                if (update.invalid) {
                    dropped.push(`altered state ${update.profileKey}: ${update.invalid}`);
                    return false;
                }
                if (!update.sourceEventIds.length) {
                    dropped.push(`altered state ${update.id}: source event required`);
                    return false;
                }
                const missing = update.sourceEventIds.filter(eventId =>
                    !known.has(`event:${eventId}`) && !acceptedIds.has(eventId));
                if (missing.length) dropped.push(`altered state ${update.id}: unknown source event ${missing.join(', ')}`);
                return missing.length === 0;
            });
        // Semantic compressed-interval continuation evidence. The
        // Reconciler supplies what the fiction established; the engine
        // resolves what that implies mechanically from canonical dose
        // history. An LLM is never the calculator.
        const continuations = list(updates.altered_state_updates)
            .map((raw, index) => normalizeContinuationUpdate(raw, index, registry)).filter(Boolean)
            .filter(update => {
                if (update.invalid) {
                    dropped.push(`continuation ${update.profileKey}: ${update.invalid}`);
                    return false;
                }
                if (!update.sourceEventIds.length) {
                    dropped.push(`continuation ${update.id}: source event required`);
                    return false;
                }
                const missing = update.sourceEventIds.filter(eventId =>
                    !known.has(`event:${eventId}`) && !acceptedIds.has(eventId));
                if (missing.length) dropped.push(`continuation ${update.id}: unknown source event ${missing.join(', ')}`);
                return missing.length === 0;
            })
            .map(update => {
                const record = list(state.alteredStates?.[update.actorId])
                    .find(item => item?.profileKey === update.profileKey);
                return { ...update, resolved: resolveContinuation(world, session, record, update) };
            });

        // Commit-time feasibility validation (Annex A hybrid envelope). The
        // narration already rendered this beat; the engine checks the
        // declared mechanic-conditioned execution evidence against the
        // tracked envelope and records a verdict. A verdict never drops the
        // event — an overdrawn execution is surfaced for correction, not
        // erased from the record.
        const executionVerdicts = list(validation.acceptedEvents).map(event => {
            const evidence = object(event?.mechanic_conditioned_execution)
                ? event.mechanic_conditioned_execution : null;
            if (!evidence) return null;
            const request = {
                actorId: event.actor_id,
                task: evidence.task,
                proposedLegality: evidence.proposed_legality || evidence.legality,
                compensations: list(evidence.compensations),
                environmentalSupport: list(evidence.environmental_support)
            };
            const verdict = validateExecution(world, session, request, registry);
            return {
                eventId: String(event?.id || '').slice(0, 120),
                actorId: String(event?.actor_id || '').slice(0, 120),
                task: verdict.task,
                legal: verdict.legal === true,
                affordedLegality: verdict.affordedLegality,
                envelopeLegality: verdict.envelopeLegality,
                compensations: clone(request.compensations),
                environmentalSupport: clone(request.environmentalSupport),
                reason: verdict.reason || ''
            };
        }).filter(Boolean);
        const dossier = globalThis.HordeDossierClaims?.prepareCommit?.(world, session, validation, { origin: options?.origin || 'narrator' })
            || { enabled: false, accepted: true, claims: [], patches: [], errors: [] };
        if (dossier.enabled && !dossier.accepted) {
            // Same drop-don't-void rule as the records above. A dossier claim
            // whose evidence points at an event the engine dropped is
            // discarded on its own; everything structural stays fatal.
            // Claims are filtered by re-checking their own evidenceIds rather
            // than by parsing the "dossier claim N" index out of the message
            // — that index is not stable, because the claim list is both
            // filtered and appended to after those errors are generated.
            const unknownEventRef = ref => {
                const value = String(ref || '');
                if (value.indexOf('event:') !== 0) return false;
                const eventId = value.slice(6);
                return !known.has(value) && !acceptedIds.has(eventId);
            };
            const fatal = dossier.errors.filter(error =>
                !/^dossier claim \d+: unknown evidence /.test(String(error)));
            dossier.errors.filter(error => /^dossier claim \d+: unknown evidence /.test(String(error)))
                .forEach(error => dropped.push(String(error)));
            dossier.claims = list(dossier.claims)
                .filter(claim => !list(claim?.evidenceIds).some(unknownEventRef));
            if (fatal.length) errors.push(...fatal);
            else dossier.accepted = true;
        }
        if (dossier.enabled) {
            const cognitionPath = {
                observation: 'observations', communication: 'communications', interpretation: 'interpretations',
                belief: 'beliefs', memory: 'memories', reassessment: 'reassessments'
            };
            const epistemicType = {
                observation: 'observed_fact', communication: 'communication', interpretation: 'interpretation',
                belief: 'belief', memory: 'memory', reassessment: 'reassessment'
            };
            cognition.forEach(record => dossier.claims.push({
                characterId: record.actorId,
                fieldPath: `cognition.${cognitionPath[record.kind]}`,
                mode: 'additive',
                value: [{ id: record.id, text: record.text, confidence: record.confidence,
                    basis: clone(record.basis), supersedes: record.supersedes || '' }],
                origin: 'runtime', maturity: 'ephemeral',
                evidenceIds: record.basis.map(ref => `${ref.type}:${ref.id}`),
                epistemicType: epistemicType[record.kind],
                sourceReceiptId: validation.receipt.turn_id,
                sourceTurnId: validation.receipt.turn_id,
                reason: `Accepted ${record.kind} with preserved evidentiary basis.`
            }));
            relationships.forEach(update => Object.entries(update.axes).forEach(([axis, value]) => {
                dossier.claims.push({
                    characterId: update.sourceId,
                    fieldPath: `relationships.${update.targetId}.${axis}`,
                    mode: 'replacement', value,
                    origin: 'runtime', maturity: 'ephemeral',
                    evidenceIds: update.basis.map(ref => `${ref.type}:${ref.id}`),
                    sourceReceiptId: validation.receipt.turn_id,
                    sourceTurnId: validation.receipt.turn_id,
                    reason: update.reason
                });
            }));
        }
        const scene = normalizeSceneMetadata(validation.receipt.scene);
        return {
            enabled: true,
            accepted: errors.length === 0,
            errors,
            // Records discarded individually. Reported so the turn's audit
            // still shows what was thrown away, without voiding the receipt.
            dropped,
            revision: Number(session.worldStateVersion || 0) + 1,
            scene,
            cognition,
            relationships,
            inventory,
            altered,
            continuations,
            executionVerdicts,
            dossier,
            registry,
            state
        };
    }

    function applyInventoryEvent(state, event, revision) {
        const inventory = state.inventory;
        let container = inventory.containers[event.containerId];
        if (!container && ['acquire', 'reveal'].includes(event.action)) {
            container = normalizeInventoryContainer({
                id: event.containerId,
                name: event.item || event.containerId,
                kind: event.kind,
                holderId: event.actorId,
                count: event.count,
                exhaustive: event.exhaustive
            });
            inventory.containers[event.containerId] = container;
        }
        if (!container) return;
        if (event.action === 'transfer' && event.targetActorId) container.holderId = event.targetActorId;
        if (event.action === 'discard' || event.action === 'lose') container.holderId = '';
        if (container.kind === 'discrete' && event.count !== null) {
            if (['consume', 'discard', 'lose'].includes(event.action)) {
                container.count = Math.max(0, Number(container.count || 0) - event.count);
            } else if (event.action === 'acquire') {
                container.count = Number(container.count || 0) + event.count;
            }
        }
        if (container.kind === 'continuous') {
            if (event.action === 'measure' || event.action === 'resolve_quantity') {
                container.currentQuantity = event.quantity;
                if (event.measured) {
                    const observation = {
                        id: id(`${event.id}_observation`),
                        quantity: event.quantity,
                        unit: event.unit || container.quantityUnit,
                        eventId: event.evidenceEventIds[0] || '',
                        observedAt: `revision:${revision}`,
                        observerId: event.actorId,
                        method: event.action
                    };
                    container.observations.push(observation);
                    inventory.observations.push(clone(observation));
                }
            } else if (['consume', 'discard', 'lose'].includes(event.action)) {
                // Unmeasured change invalidates only the current remainder. It
                // never erases historical measurements.
                container.currentQuantity = event.measured && event.quantity !== null
                    ? Math.max(0, Number(container.currentQuantity || 0) - event.quantity) : null;
            }
        }
        if (event.exhaustive) container.exhaustive = true;
    }

    function applyPreparedCommit(world, session, prepared) {
        if (!prepared?.enabled || !prepared.accepted) return { applied: false, errors: prepared?.errors || [] };
        const state = ensureSession(world, session);
        state.sceneTelemetry = clone(prepared.scene.telemetry);
        state.lastTransition = clone(prepared.scene.transition);
        prepared.cognition.forEach(record => {
            record.acceptedRevision = prepared.revision;
            state.cognition.push(record);
        });
        prepared.relationships.forEach(update => {
            const key = `${update.sourceId}->${update.targetId}`;
            const current = object(state.relationshipAxes[key]) ? state.relationshipAxes[key] : {};
            state.relationshipAxes[key] = { ...current, ...update.axes, lastReason: update.reason,
                lastBasis: clone(update.basis), lastChangedRevision: prepared.revision };
        });
        prepared.inventory.forEach(event => applyInventoryEvent(state, event, prepared.revision));
        const nowTotalMinutes = Number(globalThis.getWorldTimeData?.(world, session)?.currentTotalMinutes);
        const nowTurn = Math.max(1, parseInt(session.turnCount) || 1);
        prepared.altered.forEach(update => {
            const existing = list(state.alteredStates[update.actorId])
                .find(record => record.profileKey === update.profileKey);
            const current = list(state.alteredStates[update.actorId])
                .filter(record => record.profileKey !== update.profileKey);
            if (update.status !== 'resolved') {
                // onset is captured here, by the engine, from the world clock —
                // never taken from the model. A redose restarts the clock
                // (simplification: real pharmacology often extends rather than
                // resets, but a reset is the safer default against a model
                // that never explicitly flags redose). Anything else re-stating
                // an already-active profile is a phase update, not a new dose,
                // and keeps its original onset/dose count.
                const isFreshOnset = !existing || update.redose === true;
                current.push({
                    ...update,
                    priorCanonicalPhase: existing?.phase || '',
                    acceptedRevision: prepared.revision,
                    doseEvents: isFreshOnset
                        ? [...list(existing?.doseEvents), {
                            atTotalMinutes: Number.isFinite(nowTotalMinutes) ? nowTotalMinutes : null,
                            quantity: 1, provenance: 'explicit', revisionId: prepared.revision
                        }].slice(-80)
                        : list(existing?.doseEvents),
                    continuityModel: (isFreshOnset || list(existing?.doseEvents).length)
                        ? 'semantic_v1' : (existing?.continuityModel || ''),
                    onsetTotalMinutes: (isFreshOnset || !Number.isFinite(existing?.onsetTotalMinutes))
                        ? (Number.isFinite(nowTotalMinutes) ? nowTotalMinutes : existing?.onsetTotalMinutes)
                        : existing.onsetTotalMinutes,
                    onsetTurn: isFreshOnset ? nowTurn : (existing?.onsetTurn ?? nowTurn),
                    // Where this started. Staying here means still at it;
                    // leaving is what lets it wear off.
                    onsetLocationId: isFreshOnset
                        ? (update.actorId === 'player'
                            ? text(session.playerLocation, 120)
                            : text(object(session.entityStates) ? session.entityStates[update.actorId]?.location : '', 120))
                        : (existing?.onsetLocationId || ''),
                    doseCount: isFreshOnset ? (Number(existing?.doseCount) || 0) + 1 : (Number(existing?.doseCount) || 1),
                    pace: isFreshOnset ? 'normal' : (existing?.pace || 'normal')
                });
            } else if (existing) {
                // Resolving used to delete the record outright, which threw away
                // the only history the system had: when the dose landed, how many
                // there had been, and how fast that body metabolises. Two things
                // then broke. The aftermath became unwriteable, because nothing
                // recorded that this person was high an hour ago. And re-adding
                // the state by hand found no prior record, so it stamped a brand
                // new onset — a character who had been drinking since eight read
                // as freshly served. Keep the record, marked resolved; the prompt
                // context already filters these out, so nothing starts describing
                // a high that has ended.
                current.push({
                    ...existing,
                    ...update,
                    status: 'resolved',
                    resolvedTotalMinutes: Number.isFinite(nowTotalMinutes) ? nowTotalMinutes : undefined,
                    resolvedTurn: nowTurn,
                    acceptedRevision: prepared.revision,
                    onsetTotalMinutes: existing.onsetTotalMinutes,
                    onsetTurn: existing.onsetTurn,
                    doseCount: existing.doseCount,
                    pace: existing.pace
                });
            }
            if (current.length) state.alteredStates[update.actorId] = current.slice(-12);
            else delete state.alteredStates[update.actorId];
        });
        // Compressed-time activity continuity: apply the engine-resolved
        // inferred doses as real distributed dose events. Reconstructed
        // inputs keep their provenance so later inspection can answer
        // "why does the engine think ~8 drinks?" with "5 explicit + ~3
        // inferred during a continued interval".
        list(prepared.continuations).forEach(update => {
            const existing = list(state.alteredStates[update.actorId])
                .find(record => record.profileKey === update.profileKey);
            const resolution = update.resolved || { quantity: 0, events: [] };
            if (!existing || !list(resolution.events).length) return;
            if (!Array.isArray(existing.doseEvents)) existing.doseEvents = [];
            existing.doseEvents = existing.doseEvents.concat(list(resolution.events)
                .map(event => ({ ...event, revisionId: prepared.revision }))).slice(-80);
            existing.doseCount = (Number(existing.doseCount) || 0) + (Number(resolution.quantity) || 0);
            existing.inferredDoseCount = (Number(existing.inferredDoseCount) || 0)
                + list(resolution.events).filter(event => event.provenance === 'inferred_continuation').length;
            const lastEvent = existing.doseEvents[existing.doseEvents.length - 1];
            if (lastEvent && Number.isFinite(lastEvent.atTotalMinutes)) {
                existing.onsetTotalMinutes = lastEvent.atTotalMinutes;
                existing.onsetTurn = nowTurn;
            }
            existing.onsetLocationId = update.actorId === 'player'
                ? text(session.playerLocation, 120)
                : text(object(session.entityStates) ? session.entityStates[update.actorId]?.location : '', 120);
            existing.status = 'active';
            existing.continuityModel = 'semantic_v1';
            if (!Array.isArray(existing.continuationHistory)) existing.continuationHistory = [];
            existing.continuationHistory.push({
                id: update.id, intervalMinutes: update.intervalMinutes,
                rateRelation: update.rateRelation, quantity: resolution.quantity,
                confidence: update.confidence, basis: update.basis,
                provenance: 'inferred_continuation', acceptedRevision: prepared.revision
            });
            existing.continuationHistory = existing.continuationHistory.slice(-40);
        });
        // Phase authority (profile-declared): the engine owns the canonical
        // phase. For derived profiles the receipt-supplied phase is a
        // claimed observation only — the engine stamps the canonical phase
        // from the journey curve and the canonical clock. For evidence and
        // hybrid profiles a claimed phase change must survive transition
        // validation; an illegal transition keeps the prior canonical phase
        // and records the reason instead.
        Object.entries(state.alteredStates).forEach(([actorKey, records]) => {
            list(records).forEach(record => {
                if (record?.status === 'resolved') return;
                const profile = prepared.registry?.profiles?.[record.profileKey];
                if (!profile) return;
                if (!Object.prototype.hasOwnProperty.call(record, 'claimedPhase')) {
                    record.claimedPhase = record.phase;
                }
                const policy = profilePhasePolicy(profile);
                if (policy.authority === 'derived') {
                    const derived = deriveCanonicalPhase(world, session, record, profile);
                    if (derived) record.phase = derived;
                } else {
                    const prior = record.priorCanonicalPhase || '';
                    const verdict = validatePhaseTransition({ ...record, phase: prior || 'onset' }, profile,
                        { to: record.phase, evidence: record.sourceEventIds });
                    if (verdict.legal && verdict.phase) record.phase = verdict.phase;
                    else if (!verdict.legal) {
                        record.phaseTransitionReason = verdict.reason || 'illegal_transition';
                        if (prior) record.phase = prior;
                    }
                }
            });
        });
        globalThis.HordeDossierClaims?.applyPreparedCommit?.(world, session, prepared.dossier);
        state.cognition = state.cognition.slice(-1200);
        state.inventory.observations = state.inventory.observations.slice(-1200);
        markCheckpointSuperseded(world, session);
        return { applied: true };
    }

    function finalizeCommit(world, session, validation, audit, prepared) {
        if (!prepared?.enabled || !prepared.accepted) return null;
        const state = ensureSession(world, session);
        const sceneId = id(`scene_${audit.world_state_version}_${validation.receipt.turn_id}`);
        const acceptedEvents = list(validation.acceptedEvents);
        const consumptionEvents = unique(prepared.inventory
            .filter(update => update.action === 'consume').map(update => update.id)
            .concat(acceptedEvents.filter(event => /consum/i.test(event.type || '')).map(event => event.id)));
        const discoveries = unique(acceptedEvents
            .filter(event => ['discovery', 'knowledge', 'reveal'].includes(text(event.type, 80).toLowerCase()))
            .map(event => event.id));
        const card = {
            id: sceneId,
            sourceReceiptIds: [validation.receipt.turn_id],
            startTime: audit.scene?.world_time || null,
            endTime: audit.scene?.world_time || null,
            locations: unique(list(validation.acceptedEvents).map(event => event.location_id).filter(Boolean)
                .concat(audit.scene?.player_location_id || '')).slice(0, 20),
            presentCast: clone(audit.scene?.present_character_ids || []),
            objectiveSummary: text(validation.receipt.summary, 600),
            objectiveEventIds: acceptedEvents.map(event => event.id).filter(Boolean),
            inventoryChanges: prepared.inventory.map(update => update.id),
            consumptionEvents,
            discoveries,
            relationshipEvidence: prepared.relationships.map(update => ({
                id: update.id,
                reason: update.reason,
                basis: clone(update.basis)
            })),
            durableStateDeltas: {
                relationships: prepared.relationships.map(update => update.id),
                alteredStates: prepared.altered.map(update => update.id),
                inventory: prepared.inventory.map(update => update.id),
                cognition: prepared.cognition.map(update => update.id)
            },
            unresolvedThreads: list(session.threads).filter(thread => thread.status !== 'resolved').map(thread => thread.id),
            annotation: '',
            acceptedRevision: audit.world_state_version
        };
        const transition = prepared.scene.transition;
        const prior = state.sceneCards[state.sceneCards.length - 1];
        if (transition.boundaryType !== 'none' || !prior) state.sceneCards.push(card);
        else {
            prior.sourceReceiptIds.push(validation.receipt.turn_id);
            prior.endTime = card.endTime;
            prior.locations = unique(prior.locations.concat(card.locations));
            prior.presentCast = card.presentCast;
            prior.objectiveSummary = [prior.objectiveSummary, card.objectiveSummary].filter(Boolean).join(' ').slice(0, 1200);
            prior.objectiveEventIds = unique(list(prior.objectiveEventIds).concat(card.objectiveEventIds));
            prior.inventoryChanges = unique(list(prior.inventoryChanges).concat(card.inventoryChanges));
            prior.consumptionEvents = unique(list(prior.consumptionEvents).concat(card.consumptionEvents));
            prior.discoveries = unique(list(prior.discoveries).concat(card.discoveries));
            prior.relationshipEvidence = list(prior.relationshipEvidence).concat(card.relationshipEvidence).slice(-200);
            Object.keys(prior.durableStateDeltas).forEach(key => {
                prior.durableStateDeltas[key] = unique(prior.durableStateDeltas[key].concat(card.durableStateDeltas[key]));
            });
            prior.unresolvedThreads = card.unresolvedThreads;
        }
        state.sceneCards = state.sceneCards.slice(-500);
        globalThis.HordeDossierClaims?.finalizeCommit?.(world, session, validation, audit, prepared.dossier);
        return card;
    }

    function editSceneCardAnnotation(world, session, sceneId, annotation) {
        const state = ensureSession(world, session);
        const card = state?.sceneCards.find(item => item.id === sceneId);
        if (!card) return false;
        card.annotation = text(annotation, 2000);
        return true;
    }

    function addGmProposal(world, session, raw) {
        const state = ensureSession(world, session);
        if (!state || !object(raw)) return null;
        const proposal = {
            id: id(raw.id, `proposal_${Date.now()}`),
            basis: list(raw.basis).map(item => {
                if (!object(item)) return null;
                const type = ['event', 'observation', 'communication', 'cognition', 'receipt', 'scene']
                    .includes(item.type) ? item.type : 'event';
                const refId = id(item.id);
                return refId ? { type, id: refId } : null;
            }).filter(Boolean).slice(0, 80),
            sourceSceneId: id(raw.source_scene_id || raw.sourceSceneId),
            worldRevision: Number(raw.world_revision ?? raw.worldRevision ?? session.worldStateVersion ?? 0),
            affectedEntities: list(raw.affected_entities || raw.affectedEntities).map(value => id(value)).filter(Boolean),
            suggestedDeltas: object(raw.suggested_deltas || raw.suggestedDeltas)
                ? clone(raw.suggested_deltas || raw.suggestedDeltas) : {},
            provenance: text(raw.provenance, 600),
            stale: false,
            approved: false,
            status: 'pending',
            committedReceiptId: ''
        };
        const existing = state.gmProposals.find(item => item.id === proposal.id);
        if (existing) return existing;
        state.gmProposals.push(proposal);
        state.gmProposals = state.gmProposals.slice(-300);
        return proposal;
    }

    function approveGmProposal(world, session, proposalId, committedReceiptId) {
        const state = ensureSession(world, session);
        const proposal = state?.gmProposals.find(item => item.id === proposalId);
        if (!proposal || proposal.stale || proposal.approved) return false;
        const receiptId = id(committedReceiptId);
        const accepted = list(session.worldTurnReceipts)
            .some(item => id(item?.receipt?.turn_id) === receiptId && Number(item?.audit?.accepted || 0) >= 0);
        if (!accepted) return false;
        proposal.approved = true;
        proposal.status = 'committed';
        proposal.committedReceiptId = receiptId;
        return true;
    }

    function markStaleGmProposals(world, session, invalidatedBasisIds) {
        const state = ensureSession(world, session);
        if (!state) return 0;
        const invalid = new Set(list(invalidatedBasisIds).map(value => text(value, 160)));
        let changed = 0;
        state.gmProposals.forEach(proposal => {
            if (proposal.approved || proposal.stale) return;
            if (proposal.basis.some(ref => invalid.has(ref.id))) {
                proposal.stale = true;
                changed++;
            }
        });
        return changed;
    }

    function deriveInteractionResonance(actor, observer, context = {}) {
        const actorStates = list(actor?.alteredStates || (actor?.alteredState ? [actor.alteredState] : []))
            .filter(state => state?.status !== 'resolved');
        const observerStates = list(observer?.alteredStates || (observer?.alteredState ? [observer.alteredState] : []))
            .filter(state => state?.status !== 'resolved');
        if (!actorStates.length) return 'neutral';
        if (!observerStates.length) {
            return context.observerTolerance === 'low' ? 'mismatched' : 'neutral';
        }
        const actorDomains = new Set(actorStates.flatMap(state => list(state.domains))
            .map(value => text(value, 120).toLowerCase()));
        const observerDomains = new Set(observerStates.flatMap(state => list(state.domains))
            .map(value => text(value, 120).toLowerCase()));
        const shared = [...actorDomains].filter(value => observerDomains.has(value));
        const conflictPairs = [
            ['social openness increased', 'social withdrawal increased'],
            ['arousal increased', 'sedation increased'],
            ['tactile salience increased', 'touch aversion increased'],
            ['discursiveness increased', 'sensory tolerance reduced']
        ];
        const conflicts = conflictPairs.filter(([left, right]) =>
            (actorDomains.has(left) && observerDomains.has(right))
            || (actorDomains.has(right) && observerDomains.has(left)));
        if (conflicts.length && context.relationshipSafety === 'low') return 'strongly_mismatched';
        if (conflicts.length) return 'mismatched';
        if (shared.length && context.sceneContext === 'hostile') return 'partially_aligned';
        if (shared.length) return 'aligned';
        return context.familiarity === 'high' ? 'partially_aligned' : 'neutral';
    }

    // Compares a record's actual recorded phase against what the pacing
    // curve says it should be by now, gated on whichever of turns/minutes
    // got there first. Returns null when there's nothing to flag (no journey
    // data for this profile, or the recorded phase already looks current).
    // A night out is social, not pharmacological. Someone who is still in the
    // room where they started is still at it — topping up, sharing, carried by
    // the same momentum — so a pure decay curve was quietly sobering people up
    // mid-party. Leaving is what actually ends it: a different location is the
    // moment the supply, the company and the reason all stop. And a long gap is
    // not a long party, it is the party being over — you rejoin someone in the
    // aftermath, not still going.
    const MAINTENANCE_WINDOW_MINUTES = 120;

    // Altered state used to reach the model only as a field inside a serialised
    // blob — "phase":"strong" sitting beside relationship axes and cognition.
    // That says a character IS high; it never says how a single word of theirs
    // should change. Meanwhile NPC voice gets paragraphs of prescriptive craft
    // instruction, so voice wins every time and people on their fourth line
    // read exactly like people on none. These directives put state in the same
    // register as the voice rules: what to write, stated as an instruction.
    const APPETITE_BY_PHASE = Object.freeze({
        onset: 'RISING — the first one has landed and the next already sounds like a good idea.',
        active: 'HIGH — actively topping up, pouring, offering, keeping the round moving.',
        strong: 'HIGH — pushing it on everyone, impatient with anyone slower, generous to the point of insistence.',
        declining: 'SHARPEST — this is the chase. Actively going looking for more to hold the feeling rather than let it go.',
        residual: 'AMBIVALENT — wants it and knows better; may still cave if it is put in front of them.',
        resolved: 'GONE — do not manufacture craving here.'
    });

    function alteredStateDirective(record, profile, nowMinutes) {
        if (!profile) return '';
        const mins = Number.isFinite(record?.onsetTotalMinutes) && Number.isFinite(nowMinutes)
            ? Math.max(0, nowMinutes - record.onsetTotalMinutes) : null;
        const domains = list(profile.domains).map(value => text(value, 80)).filter(Boolean);
        const appetite = APPETITE_BY_PHASE[record.phase] || '';
        const bits = [
            `${record.actorId} — ${profile.label} · ${record.phase}`
                + (mins === null ? '' : ` · ${mins} min in`)
                + ` · dose #${record.doseCount || 1}`,
            domains.length ? `  BODY AND VOICE: ${domains.join('; ')}. Write these into how they actually speak and move — pace, volume, interruption, focus, touch, appetite for food and drink — not as a label attached to an otherwise neutral performance.` : '',
            appetite ? `  APPETITE: ${appetite}` : '',
            record.phase === 'resolved' ? '' :
                `  If this character speaks or acts this turn and their dialogue could belong to a sober person, that is a failure — rewrite it before you answer.`
        ].filter(Boolean);
        return bits.join('\n');
    }
    function alteredStatePacingContext(session, record) {
        const actorId = record?.actorId;
        const here = actorId === 'player'
            ? text(session?.playerLocation, 120)
            : text(object(session?.entityStates) ? session.entityStates[actorId]?.location : '', 120);
        const started = text(record?.onsetLocationId, 120);
        return { here, started, sameLocation: !!here && !!started && here === started };
    }

    function alteredStatePacingNote(record, profile, nowTurn, nowMinutes, placeCtx) {
        const curve = profile?.journey && JOURNEY_CLASSES[profile.journey];
        if (!curve || !Number.isFinite(record.onsetTurn)) return null;
        const pace = PACE_MULTIPLIERS[record.pace] || 1;
        const turnsElapsed = nowTurn - record.onsetTurn;
        const minutesElapsed = Number.isFinite(record.onsetTotalMinutes) && Number.isFinite(nowMinutes)
            ? nowMinutes - record.onsetTotalMinutes : -Infinity;
        // Minutes are authoritative; turns are only a fallback for records with
        // no usable onset clock. The two used to be OR'd, which worked while a
        // turn cost roughly eight minutes — three turns really was about the
        // half hour a short journey takes. Once conversational beats dropped to
        // 0-1 minutes that equivalence broke badly: three turns of banter is two
        // minutes of world time, so the turn trigger fired five to ten times too
        // early and a line taken moments ago was already being written as a
        // comedown. Elapsed real time is what a body actually responds to.
        const haveClock = Number.isFinite(minutesElapsed) && minutesElapsed >= 0;
        const expected = expectedPhase(record, profile, nowTurn, nowMinutes);
        // Long gap: the party ended while you were away. Rejoin them in the
        // aftermath rather than mid-high, whatever the curve says.
        const longGap = haveClock && minutesElapsed >= MAINTENANCE_WINDOW_MINUTES;
        if (longGap && ALTERED_PHASES.indexOf(record.phase) < ALTERED_PHASES.indexOf('residual')) {
            return `${record.actorId} — ${profile.label}: ${minutesElapsed} min since onset, well past the ${MAINTENANCE_WINDOW_MINUTES}-minute mark. That is not a long session, it is a session that ENDED somewhere in the gap. Move to "residual" or "resolved" and write them in the aftermath — the comedown, the flatness, the wrecked appetite, whatever this profile's own tail describes. Do not write them as still up.`;
        }
        // Still in the room it started in, inside the maintenance window: they
        // are not winding down, they are still at it. Never nudge downward here.
        if (placeCtx?.sameLocation && haveClock && minutesElapsed < MAINTENANCE_WINDOW_MINUTES) {
            const idx = ALTERED_PHASES.indexOf(record.phase);
            if (idx >= ALTERED_PHASES.indexOf('declining')) {
                return `${record.actorId} — ${profile.label}: still in the same place this started (${minutesElapsed} min, dose #${record.doseCount || 1}). Recorded phase is "${record.phase}", but nobody quietly sobers up without leaving — the supply, the company and the reason are all still here. Hold them up, or top them up with redose:true if that is in character. Only let it slide once they leave or the night genuinely turns.`;
            }
            return null;
        }
        const recordedIdx = ALTERED_PHASES.indexOf(record.phase);
        const expectedIdx = expected === 'declining or residual' ? ALTERED_PHASES.indexOf('declining') : ALTERED_PHASES.indexOf(expected);
        // The check used to be one-directional: it only ever nudged a phase
        // FORWARD, so a model that declined someone early was never corrected
        // and everyone drifted sober ahead of schedule while the clock said
        // otherwise. Running ahead of the curve is as wrong as lagging it.
        if (expectedIdx < recordedIdx) {
            return `${record.actorId} — ${profile.label}: recorded phase is "${record.phase}" but only ${minutesElapsed} min have passed (dose #${record.doseCount || 1}, ${record.pace || 'normal'} pace) — the reference still expects "${expected}". They are NOT winding down yet. Put them back to "${expected}" and write them accordingly; do not sober someone up ahead of their own clock.`;
        }
        if (expectedIdx === recordedIdx) return null;
        // Left the room the dose was taken in: this is where wearing off is
        // allowed to happen, and the note says so rather than leaving the model
        // to guess why the expectation suddenly moved.
        if (placeCtx && !placeCtx.sameLocation && placeCtx.here) {
            return `${record.actorId} — ${profile.label}: ${minutesElapsed} min since onset (dose #${record.doseCount || 1}, ${record.pace || 'normal'} pace), and they have LEFT where this started. Away from that supply and company it is allowed to wear off — reference expects "${expected}"; recorded is "${record.phase}". Advance it, or justify explicitly why it is holding.`;
        }
        return `${record.actorId} — ${profile.label}: ${turnsElapsed} turn(s)/${Number.isFinite(minutesElapsed) ? minutesElapsed : '?'} min since onset (dose #${record.doseCount || 1}, ${record.pace || 'normal'} pace). Reference expects "${expected}" by now; currently recorded phase is "${record.phase}" — advance it (or explicitly justify staying put) rather than leaving it stale.`;
    }

    // --- Phase authority (profile-declared) ---
    // The engine always owns the canonical phase. Profiles declare how
    // phases are decided: derived (engine computes from canonical doses +
    // the canonical clock — substance and medication profiles), evidence
    // (engine validates proposed transitions against profile rules —
    // semantic states like panic or concussion whose transitions are caused
    // by events, not merely elapsed minutes), or hybrid (engine computes,
    // and accepted evidence can alter inputs or trigger allowed exceptional
    // transitions). The Reconciler never sets a phase; it records doses and
    // submits evidence-shaped transition requests for the engine to rule on.
    const PHASE_AUTHORITIES = Object.freeze(['derived', 'evidence', 'hybrid']);

    function normalizePhasePolicy(raw) {
        const source = object(raw) ? raw : {};
        return {
            authority: PHASE_AUTHORITIES.includes(source.authority) ? source.authority : 'derived',
            clockDriven: source.clockDriven !== false,
            eventDriven: source.eventDriven === true || source.authority === 'evidence',
            allowEvidenceCorrection: source.allowEvidenceCorrection === true
        };
    }

    function profilePhasePolicy(profile) {
        return normalizePhasePolicy(profile?.phasePolicy);
    }

    function expectedPhase(record, profile, nowTurn, nowMinutes) {
        const curve = profile?.journey && JOURNEY_CLASSES[profile.journey];
        if (!curve || !Number.isFinite(record?.onsetTurn)) return null;
        const pace = PACE_MULTIPLIERS[record.pace] || 1;
        const turnsElapsed = Math.max(1, parseInt(nowTurn) || 1) - record.onsetTurn;
        const minutesElapsed = Number.isFinite(record.onsetTotalMinutes) && Number.isFinite(nowMinutes)
            ? nowMinutes - record.onsetTotalMinutes : -Infinity;
        // Minutes are authoritative; turns are only a fallback for records
        // with no usable onset clock. Elapsed real time is what a body
        // actually responds to.
        const haveClock = Number.isFinite(minutesElapsed) && minutesElapsed >= 0;
        const reached = stage => haveClock
            ? minutesElapsed >= Math.round(curve[stage].minutes * pace)
            : turnsElapsed >= Math.max(1, Math.round(curve[stage].turn * pace));
        const toActiveTurn = curve.toActiveTurn[profile.onsetSpeed] || curve.toActiveTurn.building || 1;
        if (turnsElapsed < toActiveTurn) return 'onset';
        if (!reached('strong')) return 'active';
        if (!reached('declining')) return 'strong';
        if (!reached('resolved')) return 'declining or residual';
        return 'resolved';
    }

    function deriveCanonicalPhase(world, session, record, profile) {
        const nowTurn = Math.max(1, parseInt(session.turnCount) || 1);
        const nowMinutes = Number(globalThis.getWorldTimeData?.(world, session)?.currentTotalMinutes);
        const expected = expectedPhase(record, profile, nowTurn, nowMinutes);
        if (!expected) return null;
        const phase = expected === 'declining or residual' ? 'declining' : expected;
        const minutesElapsed = Number.isFinite(record.onsetTotalMinutes) && Number.isFinite(nowMinutes)
            ? nowMinutes - record.onsetTotalMinutes : -Infinity;
        const haveClock = Number.isFinite(minutesElapsed) && minutesElapsed >= 0;
        // Long gap: the session ended somewhere in the gap. Rejoin in the
        // aftermath rather than mid-high, whatever the curve says.
        if (haveClock && minutesElapsed >= MAINTENANCE_WINDOW_MINUTES
            && ALTERED_PHASES.indexOf(phase) < ALTERED_PHASES.indexOf('residual')) return 'residual';
        // Same-location hold — migration safety net, never primary V2
        // behavior. It exists to protect legacy records without
        // continuation-capable dose history from the original failure mode
        // (a compressed interval silently sobering everyone). Once a record
        // runs under the semantic continuation model, the hold disappears:
        // explicit cessation must be allowed to sober someone who stays in
        // the same room.
        const here = record.actorId === 'player'
            ? text(session.playerLocation, 120)
            : text(object(session.entityStates) ? session.entityStates[record.actorId]?.location : '', 120);
        const started = text(record.onsetLocationId, 120);
        if (record.continuityModel !== 'semantic_v1'
            && haveClock && minutesElapsed < MAINTENANCE_WINDOW_MINUTES && !!here && !!started && here === started
            && ALTERED_PHASES.indexOf(phase) >= ALTERED_PHASES.indexOf('declining')) return 'strong';
        return phase;
    }

    function validatePhaseTransition(record, profile, request = {}) {
        const policy = profilePhasePolicy(profile);
        const from = ALTERED_PHASES.includes(record?.phase) ? record.phase : 'onset';
        const to = ALTERED_PHASES.includes(request?.to) ? request.to : '';
        const evidence = list(request?.evidence);
        if (!to) return { legal: false, keepPhase: from, reason: 'invalid_target_phase' };
        const fromIdx = ALTERED_PHASES.indexOf(from);
        const toIdx = ALTERED_PHASES.indexOf(to);
        if (toIdx === fromIdx) return { legal: true, noOp: true, phase: from };
        // Exceptional transitions are profile-declared jumps the engine
        // accepts when submitted evidence satisfies them — vomiting and
        // rapid loss of consciousness satisfying a severe-intoxication rule,
        // for example. The engine decides what the evidence means; the
        // Reconciler only ever submits it.
        const exceptional = list(profile?.transitionRules?.exceptional).find(rule =>
            object(rule) && (rule.from === from || rule.from === '*')
            && (rule.to === to || rule.to === '*'));
        if (exceptional) return { legal: true, phase: to, viaExceptionalRule: true };
        if (toIdx > fromIdx) {
            // Forward transitions are adjacent steps (or a resolve) and
            // require submitted evidence for non-clock-driven profiles.
            const adjacent = toIdx - fromIdx === 1 || to === 'resolved';
            if (!adjacent) return { legal: false, keepPhase: from, reason: 'non_adjacent_forward_transition' };
            return evidence.length || profilePhasePolicy(profile).clockDriven
                ? { legal: true, phase: to }
                : { legal: false, keepPhase: from, reason: 'forward_transition_requires_evidence' };
        }
        // Backward "corrections" are only allowed when the profile says so.
        return policy.allowEvidenceCorrection
            ? { legal: true, phase: to, corrected: true }
            : { legal: false, keepPhase: from, reason: 'backward_transition_not_allowed' };
    }

    // --- Feasibility envelope (Annex A) ---
    // The engine computes, per active mechanic, what each task category
    // affords: succeeds / degraded / fail_forward. It never renders prose
    // and never applies a generic "impaired characters fail" rule —
    // failure arises only from the relationship between state and task.
    // Explicit compensatory behaviour (identified at the controlled-input /
    // FF Embellish seam) and environmental supports (existing world/scene
    // context) improve the legality class by one step, bounded by the
    // profile's own table. The existing post-Narrator Reader independently
    // verifies the intent → compensation → conditioned execution →
    // objective-result chain for reconciliation.
    const TASK_CATEGORIES = Object.freeze([
        'movement', 'precision', 'speech', 'perception', 'memory', 'cognition', 'social'
    ]);
    const COMPENSATION_STRATEGIES = Object.freeze([
        'move_slowly', 'brace_support', 'sit_first', 'ask_for_help', 'pause_composure',
        'speak_deliberately', 'double_check', 'avoid_stairs', 'use_railing', 'hydrate_eat',
        'wait_for_dizziness', 'delegate', 'choose_simpler_action'
    ]);
    const SUPPORT_REQUIRING_COMPENSATIONS = Object.freeze([
        'brace_support', 'use_railing', 'ask_for_help', 'delegate'
    ]);
    const LEGALITY_ORDER = Object.freeze(['succeeds', 'degraded', 'fail_forward']);
    // Generic domain→task fallback used when a profile ships no explicit
    // feasibility table. Impairment-relevant domain keywords map to affected
    // task categories; disinhibition-style domains intentionally map to
    // nothing — they change behaviour, not competence (Annex A A7).
    const DOMAIN_TASK_FALLBACK = Object.freeze({
        'coordination': ['movement', 'precision'],
        'balance': ['movement'],
        'motor': ['movement', 'precision'],
        'reaction': ['movement', 'precision'],
        'speech': ['speech'],
        'language': ['speech'],
        'slurr': ['speech'],
        'memory': ['memory'],
        'focus': ['precision', 'cognition'],
        'attention': ['precision', 'cognition'],
        'sedation': ['movement', 'precision', 'cognition'],
        'perception': ['perception'],
        'visual': ['perception'],
        'judgment': ['social', 'cognition'],
        'inhibition': [],
        'self-monitoring': []
    });
    const PHASE_IMPAIRMENT = Object.freeze({
        onset: 1, active: 2, strong: 3, declining: 2, residual: 1, resolved: 0
    });
    const DEFAULT_TASK_COMPENSATIONS = Object.freeze({
        movement: ['move_slowly', 'brace_support', 'sit_first', 'use_railing', 'avoid_stairs',
            'wait_for_dizziness', 'ask_for_help', 'delegate', 'choose_simpler_action'],
        precision: ['sit_first', 'pause_composure', 'double_check', 'ask_for_help', 'delegate',
            'choose_simpler_action'],
        speech: ['speak_deliberately', 'pause_composure', 'choose_simpler_action'],
        perception: ['double_check', 'ask_for_help', 'pause_composure'],
        memory: ['double_check', 'delegate'],
        cognition: ['pause_composure', 'double_check', 'delegate'],
        social: ['ask_for_help', 'pause_composure']
    });

    function normalizeFeasibilityTable(raw) {
        const source = object(raw) ? raw : {};
        const tasks = {};
        Object.entries(object(source.tasks) ? source.tasks : {}).forEach(([task, def]) => {
            if (!TASK_CATEGORIES.includes(task) || !object(def)) return;
            tasks[task] = {
                degradeAt: ALTERED_PHASES.includes(def.degradeAt) ? def.degradeAt : 'active',
                failForwardAt: ALTERED_PHASES.includes(def.failForwardAt) ? def.failForwardAt : null,
                meaningfulCompensations: list(def.meaningfulCompensations || def.meaningful_compensations)
                    .map(value => text(value, 60)).filter(value => COMPENSATION_STRATEGIES.includes(value))
            };
        });
        return Object.keys(tasks).length ? tasks : null;
    }

    function tasksForDomains(domains) {
        const affected = new Set();
        list(domains).forEach(domain => {
            const value = text(domain, 120).toLowerCase();
            Object.entries(DOMAIN_TASK_FALLBACK).forEach(([needle, tasks]) => {
                if (value.includes(needle)) tasks.forEach(task => affected.add(task));
            });
        });
        return [...affected];
    }

    function computeFeasibilityEnvelope(world, session, actorId, registry) {
        const state = ensureSession(world, session);
        if (!state) return { enabled: false, tasks: {} };
        const records = list(state.alteredStates[id(actorId)])
            .filter(record => record?.status !== 'resolved');
        const tasks = {};
        TASK_CATEGORIES.forEach(task => { tasks[task] = { legality: 'succeeds', mechanics: [] }; });
        if (!records.length) return { enabled: true, tasks };
        records.forEach(record => {
            const profile = registry?.profiles?.[record.profileKey];
            if (!profile) return;
            const phase = record.phase || 'active';
            const impairment = PHASE_IMPAIRMENT[phase] || 0;
            if (impairment <= 1) return;
            const table = normalizeFeasibilityTable(profile.feasibility);
            const affected = table ? Object.keys(table)
                : tasksForDomains(list(profile.domains).length ? profile.domains : record.domains);
            affected.forEach(task => {
                if (!tasks[task]) return;
                const def = table ? table[task] : null;
                const degradeAt = def ? def.degradeAt : 'active';
                const failForwardAt = def ? def.failForwardAt
                    : (task === 'movement' || task === 'precision' ? 'strong' : null);
                // Outcome authority is degree-gated: degraded execution
                // preserves success; only strong + observably-obvious
                // impairment may fail a declared competence forward.
                const obvious = record.observable === 'obvious';
                let legality = 'succeeds';
                if (failForwardAt && ALTERED_PHASES.indexOf(phase) >= ALTERED_PHASES.indexOf(failForwardAt)
                    && impairment + (obvious ? 1 : 0) >= 4) legality = 'fail_forward';
                else if (ALTERED_PHASES.indexOf(phase) >= ALTERED_PHASES.indexOf(degradeAt)) legality = 'degraded';
                const entry = {
                    legality,
                    mechanicId: record.profileKey,
                    phase,
                    observable: record.observable || 'unknown',
                    meaningfulCompensations: def ? def.meaningfulCompensations
                        : (DEFAULT_TASK_COMPENSATIONS[task] || [])
                };
                if (LEGALITY_ORDER.indexOf(legality) > LEGALITY_ORDER.indexOf(tasks[task].legality)) {
                    tasks[task] = entry;
                }
            });
        });
        return { enabled: true, tasks };
    }

    function validateExecution(world, session, request, registry) {
        const envelope = computeFeasibilityEnvelope(world, session, request?.actorId, registry);
        if (!envelope.enabled) return { legal: true, affordedLegality: 'succeeds' };
        const task = TASK_CATEGORIES.includes(request?.task) ? request.task : 'other';
        const verdict = envelope.tasks[task] || { legality: 'succeeds' };
        const compensations = list(request?.compensations).map(value => text(value, 60))
            .filter(value => COMPENSATION_STRATEGIES.includes(value));
        const meaningful = list(verdict.meaningfulCompensations);
        const supported = list(request?.environmentalSupport).map(value => text(value, 60)).filter(Boolean);
        // A player who explicitly accounts for the tracked state is playing
        // the mechanic, not pretending it is absent — compensation improves
        // the legality class by one step. Strategies that need the
        // environment to cooperate (bracing, railings, help) only qualify
        // when the scene actually supplies that support.
        const qualifying = compensations.filter(strategy =>
            (!meaningful.length || meaningful.includes(strategy))
            && (!SUPPORT_REQUIRING_COMPENSATIONS.includes(strategy) || supported.length));
        let affordedIdx = LEGALITY_ORDER.indexOf(verdict.legality);
        if (affordedIdx > 0 && qualifying.length) affordedIdx -= 1;
        const afforded = LEGALITY_ORDER[Math.max(0, affordedIdx)];
        const proposedIdx = LEGALITY_ORDER.includes(request?.proposedLegality)
            ? LEGALITY_ORDER.indexOf(request.proposedLegality) : 0;
        return {
            legal: proposedIdx >= affordedIdx,
            affordedLegality: afforded,
            envelopeLegality: verdict.legality,
            task,
            mechanic: verdict.mechanicId || null,
            reason: proposedIdx >= affordedIdx ? '' : 'declared_competence_exceeds_tracked_state'
        };
    }

    // --- Compressed-time activity continuity (dose continuation) ---
    // Compressed narrative time does not mean the world stopped acting.
    // When the Reader identifies a meaningful compressed interval inside an
    // ongoing activity, the Reconciler submits semantic evidence (the
    // party continued at roughly the established pace) and the engine
    // computes what that implies mechanically from canonical dose history.
    // The LLM is never the calculator. Ordinary turns never extrapolate an
    // extra dose merely because an activity is ongoing; only a meaningfully
    // compressed interval invokes the continuation system. Explicit
    // cessation always wins. Uncertain continuity must never default to
    // instant sobriety (that was the original failure mode), but inferred
    // quantities stay approximate and carry their provenance.
    const RATE_RELATIONS = Object.freeze([
        'same', 'slower', 'faster', 'intermittent', 'unknown', 'stopped'
    ]);
    // Per-dose-interval multipliers by rate relation: slower doubles the
    // interval between doses (half the rate), faster tightens it.
    const RATE_MULTIPLIERS = Object.freeze({ same: 1, slower: 2, faster: 0.67, intermittent: 2, unknown: 1 });
    const CONTINUATION_CONFIDENCE = Object.freeze(['high', 'medium', 'low']);

    function recentInputCadence(world, session, actorId, profileKey) {
        const state = ensureSession(world, session);
        const record = list(state?.alteredStates?.[id(actorId)])
            .find(item => item?.profileKey === id(profileKey));
        const events = list(record?.doseEvents)
            .filter(event => Number.isFinite(Number(event?.atTotalMinutes)))
            .map(event => ({ at: Number(event.atTotalMinutes),
                quantity: Math.max(1, Number(event.quantity) || 1) }))
            .slice(-8);
        if (events.length < 2) return null;
        const intervals = [];
        for (let index = 1; index < events.length; index += 1) {
            intervals.push((events[index].at - events[index - 1].at) / Math.max(1, events[index - 1].quantity));
        }
        intervals.sort((left, right) => left - right);
        const median = intervals[Math.floor(intervals.length / 2)];
        if (!Number.isFinite(median) || median <= 0) return null;
        return {
            perDoseMinutes: Math.round(median * 10) / 10,
            dosesPerHour: Math.round(60 / median),
            sampleSize: events.length,
            basis: 'canonical_dose_events',
            approximate: true
        };
    }

    function resolveContinuation(world, session, record, evidence) {
        // Engine-side arithmetic. The Reconciler supplies semantic
        // evidence; the engine computes the mechanical implication from
        // canonical dose history. An authored quantity ("another three
        // drinks over the next hour") is validated and accepted as-is.
        if (evidence.rateRelation === 'stopped') {
            return { quantity: 0, events: [], rateRelation: 'stopped' };
        }
        const nowMinutes = Number(globalThis.getWorldTimeData?.(world, session)?.currentTotalMinutes);
        const authored = Math.trunc(Number(evidence.quantityDelta) || 0);
        let quantity = 0;
        let perDose = null;
        const cadence = recentInputCadence(world, session, evidence.actorId, evidence.profileKey);
        if (authored >= 1) {
            quantity = Math.min(60, authored);
            perDose = evidence.intervalMinutes / Math.max(1, quantity);
        } else if (cadence && Number.isFinite(nowMinutes)) {
            perDose = cadence.perDoseMinutes * (RATE_MULTIPLIERS[evidence.rateRelation] || 1);
            quantity = Math.max(0, Math.min(60,
                Math.floor(evidence.intervalMinutes / Math.max(5, perDose))));
        }
        if (!quantity) {
            return { quantity: 0, events: [], rateRelation: evidence.rateRelation, cadence };
        }
        // Distribute the inferred doses across the omitted interval at the
        // effective cadence instead of collapsing them into one giant
        // end-of-skip redose. Times are approximate and provenance says so.
        const events = [];
        for (let index = quantity; index >= 1; index -= 1) {
            events.push({
                atTotalMinutes: Number.isFinite(nowMinutes)
                    ? Math.round(nowMinutes - (index - 1) * perDose) : null,
                quantity: 1,
                provenance: authored >= 1 ? 'explicit' : 'inferred_continuation',
                confidence: evidence.confidence || 'medium',
                basis: list(evidence.basis),
                approximate: true
            });
        }
        return { quantity, events, rateRelation: evidence.rateRelation, cadence, approximate: true };
    }

    function normalizeContinuationUpdate(raw, index, registry) {
        if (!object(raw)) return null;
        if (ALTERED_PHASES.includes(raw.phase)) return null;
        const continuation = object(raw.continuation) ? raw.continuation : null;
        if (!continuation) return null;
        const actorId = id(raw.actor_id || raw.actorId);
        const profileKey = id(raw.profile_key || raw.profileKey);
        if (!actorId || !profileKey) return null;
        const profile = registry?.profiles?.[profileKey];
        if (!profile) return { invalid: 'excluded_or_unknown_profile', actorId, profileKey };
        const intervalMinutes = Math.max(0,
            Math.trunc(Number(continuation.interval_minutes ?? continuation.intervalMinutes) || 0));
        if (intervalMinutes < 5) {
            return { invalid: 'continuation_needs_compressed_interval', actorId, profileKey };
        }
        const rateRelation = RATE_RELATIONS.includes(continuation.rate_relation || continuation.rateRelation)
            ? (continuation.rate_relation || continuation.rateRelation) : 'unknown';
        return {
            id: id(raw.id, `continuation_${index + 1}`),
            actorId,
            profileKey,
            intervalMinutes,
            activity: text(continuation.activity, 80) || 'continued_consumption',
            rateRelation,
            confidence: CONTINUATION_CONFIDENCE.includes(continuation.confidence)
                ? continuation.confidence : 'medium',
            basis: list(continuation.basis).map(value => text(value, 160)).filter(Boolean).slice(0, 12),
            quantityDelta: Number.isFinite(Number(continuation.quantity_delta ?? continuation.quantityDelta))
                ? Math.trunc(Number(continuation.quantity_delta ?? continuation.quantityDelta)) : null,
            sourceEventIds: unique(list(raw.source_event_ids || raw.sourceEventIds)
                .map(value => text(value, 160))).slice(0, 20),
            provenance: 'semantic_continuation_evidence'
        };
    }

    function promptContext(world, session, registry) {
        const state = ensureSession(world, session);
        if (!state) return '';
        const nowTurn = Math.max(1, parseInt(session.turnCount) || 1);
        const nowMinutes = Number(globalThis.getWorldTimeData?.(world, session)?.currentTotalMinutes);
        const pacingNotes = [];
        const activeAlteredStates = Object.fromEntries(Object.entries(state.alteredStates)
            .map(([actorId, values]) => [actorId, list(values)
                .filter(value => value?.status !== 'resolved')
                .map(value => {
                    const profile = registry?.profiles?.[value.profileKey];
                    const note = profile ? alteredStatePacingNote({ ...value, actorId }, profile, nowTurn, nowMinutes,
                        alteredStatePacingContext(session, { ...value, actorId })) : null;
                    if (note) pacingNotes.push(note);
                    return {
                        profileKey: value.profileKey,
                        phase: value.phase,
                        domains: value.domains,
                        selfAssessmentReliability: value.selfAssessmentReliability,
                        observable: value.observable,
                        sourceEventIds: value.sourceEventIds,
                        doseCount: value.doseCount || 1,
                        turnsSinceOnset: Number.isFinite(value.onsetTurn) ? nowTurn - value.onsetTurn : null
                    };
                })])
            .filter(([, values]) => values.length));
        const combinationProfiles = {};
        if (registry?.profiles) {
            Object.entries(activeAlteredStates).forEach(([actorId, values]) => {
                const keys = values.map(value => value.profileKey)
                    .filter(key => registry.profiles[key] && !registry.profiles[key].combination);
                const matches = [];
                for (let left = 0; left < keys.length; left++) {
                    for (let right = left + 1; right < keys.length; right++) {
                        const match = [`${keys[left]}_${keys[right]}`, `${keys[right]}_${keys[left]}`]
                            .find(key => registry.profiles[key]?.combination);
                        if (match && !matches.includes(match)) matches.push(match);
                    }
                }
                if (matches.length) combinationProfiles[actorId] = matches;
            });
        }
        const inventory = Object.fromEntries(Object.entries(state.inventory.containers).map(([containerId, value]) => [containerId, {
            name: value.name,
            kind: value.kind,
            holderId: value.holderId,
            count: value.count,
            currentQuantity: value.currentQuantity,
            quantityUnit: value.quantityUnit,
            exhaustive: value.exhaustive,
            observations: list(value.observations).slice(-3)
        }]));
        // Explicit-vs-inferred dose provenance stays visible so the model
        // writes the approximate reality ("~8 drinks, 5 explicit + ~3
        // inferred") rather than false precision, and so the Reconciler can
        // see cadence and continuity evidence when it reconstructs
        // compressed intervals.
        const continuity = [];
        Object.entries(state.alteredStates).forEach(([actorId, records]) => {
            list(records).forEach(record => {
                const events = list(record.doseEvents);
                if (!events.length) return;
                continuity.push({
                    actorId, profileKey: record.profileKey,
                    doseCount: Number(record.doseCount) || events.length,
                    explicitDoseCount: events.filter(event => event.provenance === 'explicit'
                        || event.provenance === 'authorial').length,
                    inferredDoseCount: events.filter(event => event.provenance === 'inferred_continuation').length,
                    lastDoseAt: Number.isFinite(Number((events[events.length - 1] || {}).atTotalMinutes))
                        ? Number((events[events.length - 1] || {}).atTotalMinutes) : null,
                    recentCadence: recentInputCadence(world, session, actorId, record.profileKey),
                    continuityModel: record.continuityModel || 'legacy'
                });
            });
        });
        const compact = {
            checkpoint: state.checkpoint,
            sceneTelemetry: state.sceneTelemetry,
            relationships: state.relationshipAxes,
            alteredStates: activeAlteredStates,
            relevantCombinationProfiles: combinationProfiles,
            inventory,
            recentCognition: state.cognition.slice(-24),
            openGmProposals: state.gmProposals.filter(proposal => !proposal.stale && !proposal.approved).slice(-12),
            bunnyRxRegistry: registry ? { id: registry.id, profileKeys: Object.keys(registry.profiles || {}) } : null,
            continuity: continuity.slice(-12)
        };
        const dossierContext = globalThis.HordeDossierClaims?.promptContext?.(
            world, session, list(world.entities).filter(entity => entity?.type === 'npc'), {
                worldTime: session.worldTime || ''
            }
        ) || '';
        // The registry carries a full curated write-up per substance, but
        // sending all 37 every turn would be pure waste — and previously
        // nothing beyond the bare profile key ever left this function, so the
        // model wrote every altered state from its own general knowledge with
        // zero grounding in the curated pack. Send the real excerpt only for
        // whichever profiles are actually in play this turn.
        const activeProfileKeys = unique(Object.values(activeAlteredStates)
            .flatMap(values => values.map(value => value.profileKey))
            .concat(Object.values(combinationProfiles).flat()));
        // The source pack authors these with SillyTavern {{random::a::b::c}}
        // attention-nudge macros (e.g. a rotating "what does the evidence
        // look like right now" prompt). Left raw, the model sees the literal
        // "{{random::...}}" syntax with every option run together instead of
        // one picked line — replaceMacros is app.js's existing resolver for
        // exactly this, exposed on globalThis since app.js is a plain script.
        const resolveExcerpt = text => globalThis.replaceMacros ? globalThis.replaceMacros(text, null) : text;
        const excerpts = registry?.profiles ? activeProfileKeys
            .map(key => registry.profiles[key])
            .filter(profile => profile?.referenceExcerpt)
            .map(profile => `--- ${profile.label} ---\n${resolveExcerpt(profile.referenceExcerpt)}`)
            : [];
        const bunnyRxContext = excerpts.length
            ? `\n\n[BUNNYRX — ACTIVE PROFILE REFERENCE]\nCurated reference for the substances currently active in this scene. Use it to ground how the affected character behaves, speaks, and perceives — it is guidance for portrayal, not a source of new mechanical facts; only commit_world_turn receipts create durable state.\n${excerpts.join('\n\n')}\n`
            : '';
        const pacingContext = pacingNotes.length
            ? `\n\n[BUNNYRX — PACING CHECK]\n${pacingNotes.join('\n')}\n`
            : '';
        // Feasibility envelope (Annex A hybrid): the narrator receives the
        // legality classes for declared competences under tracked states,
        // plus what compensation the scene could support. The engine still
        // validates the declared execution at commit; this block is the
        // affordance information FF renders within.
        const envelopeByActor = {};
        Object.entries(state.alteredStates || {}).forEach(([actorId, records]) => {
            if (!list(records).some(record => record?.status !== 'resolved')) return;
            const envelope = computeFeasibilityEnvelope(world, session, actorId, registry);
            const impaired = Object.entries(envelope.tasks || {})
                .filter(([, def]) => def.legality && def.legality !== 'succeeds')
                .map(([task, def]) => ({ task, legality: def.legality, phase: def.phase,
                    meaningful_compensations: def.meaningfulCompensations || [] }));
            if (impaired.length) envelopeByActor[actorId] = impaired;
        });
        const envelopeContext = Object.keys(envelopeByActor).length
            ? `\n\n[FEASIBILITY — WHAT THIS STATE ALLOWS]\nLegality classes for declared competences under tracked altered states — never a script, never a demand for failure:\n${JSON.stringify(envelopeByActor)}\nA declared competence may fail-forward only at strong + observably-obvious impairment; every other declared goal succeeds, possibly with degraded execution. A player who explicitly accounts for their tracked state (bracing, slowing, simplifying, asking for help) is playing the mechanic, not dodging it — reward that: the goal succeeds and the execution visibly carries the impairment. Compensations that need the environment (bracing, railings, a helping hand) qualify only when the current scene actually supplies that support; scene supports come from the present environment, not from this block. Separate what a character DECLARES (intent, explicit compensation) from what the state DOES to the execution, and never announce mechanics — write the resolved execution as diegetic behaviour.`
            : '';
        // Hoisted out of the JSON blob into its own instruction block, so state
        // competes with the voice rules instead of sitting below them as data.
        const directives = [];
        Object.entries(state.alteredStates || {}).forEach(([actorId, values]) => {
            list(values).filter(value => value?.status !== 'resolved' && value?.phase !== 'resolved')
                .forEach(value => {
                    const profile = registry?.profiles?.[value.profileKey];
                    const directive = alteredStateDirective({ ...value, actorId }, profile, nowMinutes);
                    if (directive) directives.push(directive);
                });
        });
        const directiveContext = directives.length
            ? `\n\n[ALTERED STATE — WRITE THESE PEOPLE THIS WAY]\nThese are not labels to acknowledge; they are how these characters behave for the whole response. Intoxication changes speech before it changes anything else.\n${directives.join('\n\n')}\n`
            : '';
        return `\n\n[WORLD MECHANICS — COMMITTED STATE AND AUTHORITY]\n${JSON.stringify(compact)}\n`
            + `A committed commit_world_turn receipt is the only generated-fiction path to durable truth. Prose, FF5 reasoning, BunnyRX and World GM proposals are not storage. `
            + `Separate objective result, actor intention, observation, interpretation, belief and memory. Durable cognition requires accepted provenance and may build on prior accepted cognition. `
            + `Relationship axes are directional durable judgements, not a running mood meter — but they should move often, in small increments, whenever a scene gives real accepted evidence either way; do not save updates only for watershed moments. A shared vulnerability, an admission, an act of trust, a small betrayal or friction are all real evidence and each deserves its own small shift (a few points), not silence until something dramatic happens. `
            + `BunnyRX is reference knowledge only. Persist only compact Altered State. Never infer exact substance, quantity, time or phase for an observer without evidence. `
            // The physiological tail (hungover, drained, foggy, serotonin-flat)
            // is real and worth writing. Craving is a different, narrower
            // claim: it's a fact about that character's relationship with the
            // substance, not an automatic side effect of using it, and it must
            // never be conjured just because a phase resolved. A character who
            // used once and doesn't think about it again is not a data gap —
            // Chloe leaving an 8-ball untouched for a week and that reading as
            // restraint worth noticing is good characterisation; that instinct
            // should survive this system, not get mechanically overridden by it.
            + `Once a state reaches "resolved", the physiological aftermath (fatigue, low mood, soreness, mental fog — whatever this profile's own comedown describes) is fair game to keep writing for as long as it's earned, but active craving or urge to redose is NOT an automatic consequence — only write it when that specific character's own established relationship with the substance and the scene genuinely support it. Going quiet about it, or even having visibly not touched more of it, is a legitimate and often better read on a character than manufactured yearning. `
            // Separately from craving: within a single active session, a
            // character isn't a vending machine waiting for the player to say
            // "do another line." If it's in character and the substance,
            // company and supply are all still there, let them act on their
            // own initiative — call altered_state_updates with redose:true
            // unprompted. This is ordinary scene agency, not compulsion.
            + `APPETITE IS A DRIVE, NOT A PERMISSION. Within an ACTIVE session (not yet resolved), intoxication WANTS MORE OF ITSELF. Drinking begets drinking; a line makes the next line obvious; the whole point of the night is that it escalates. An NPC with supply, company and no hard reason to stop is not waiting to be offered — they pour the next one, cut the next one, wave the bartender down, push it on everyone else, and get impatient with anyone slowing them down. Do NOT wait for the player to prompt it and do NOT keep them politely level while the player does all the consuming: the player is one person at this table, not the only one with a body. `
            + `Every turn, for each intoxicated character, ask: has enough happened that this person would have had another? If yes — and across a normal scene the answer is yes often — narrate them taking it and commit altered_state_updates with redose:true. A character whose doseCount never moves across a long night is being written wrong. `
            + `INFER IT. You do not need the player to state a dose. A round arriving, a glass being refilled, a baggie going round, someone disappearing to the bathroom together, "one more before we go" — these ARE doses and must be committed as such for everyone involved, not just whoever spoke last. `
            + `The appetite is SHARPEST while declining: that is the chase, when people redose hardest to hold the feeling rather than let it go. Declining is not winding down, it is when someone goes looking for more. `
            // The rules above are written about NPCs, and the player kept being
            // read as the thing that PROMPTS a dose rather than someone who takes
            // them. Result: the player narrates two bumps in a row, the model
            // faithfully updates their phase, and doseCount stays at 1 — so the
            // engine ages them off a single dose taken half an hour ago while the
            // fiction has them freshly lit. The player is a body in the scene, not
            // just the camera.
            + `THE PLAYER IS TRACKED EXACTLY LIKE ANY OTHER CHARACTER. When the player's own message has them taking a dose — another bump, another drink, another cap — you MUST record it: altered_state_updates for actor "player" with redose:true, every single time, even when they already have that substance active. Updating only their phase is wrong; a fresh dose restarts their clock and increments the dose count, and skipping it makes the engine treat a line taken thirty seconds ago as one taken half an hour ago. Their persona is a character with a body, appetites and a tolerance, not a viewpoint. `
            + `For relevant social exchanges derive qualitative interaction resonance (aligned / partially_aligned / neutral / mismatched / strongly_mismatched) from both Altered States, personality, familiarity, directional relationship, VAD, knowledge and context. Never calculate drug buffs or automatically change relationships. `
            + `Continuous inventory keeps append-only quantity observations. Unknown is not zero; unobserved is not nonexistent; known inventory is not exhaustive unless explicitly marked. `
            + `GM proposals and scene cards are non-authoritative derived material until an explicit accepted canon mutation receipt.`
            + bunnyRxContext
            + directiveContext
            + pacingContext
            + envelopeContext
            + dossierContext;
    }

    // Reconciler-facing pre-turn frame. The Reconciler sees engine-owned
    // truth (phases, dose arithmetic, containers, cognition) and supplies
    // evidence only — it never computes phases or quantities itself.
    function reconcilerFrame(world, session, registry) {
        if (!isEnabled(world)) return '';
        const state = ensureSession(world, session);
        const nowMinutes = Number(globalThis.getWorldTimeData?.(world, session)?.currentTotalMinutes);
        const activeStates = [];
        const envelopeByActor = {};
        Object.entries(state.alteredStates || {}).forEach(([actorId, records]) => {
            const active = list(records).filter(record => record?.status !== 'resolved');
            if (!active.length) return;
            active.forEach(record => {
                const events = list(record.doseEvents);
                activeStates.push({
                    actorId, profileKey: record.profileKey,
                    enginePhase: record.phase,
                    phaseAuthority: profilePhasePolicy(registry?.profiles?.[record.profileKey] || {}).authority,
                    minutesSinceOnset: Number.isFinite(Number(record.onsetTotalMinutes)) && Number.isFinite(nowMinutes)
                        ? Math.max(0, Math.round(nowMinutes - Number(record.onsetTotalMinutes))) : null,
                    doseCount: Number(record.doseCount) || 0,
                    explicitDoses: events.filter(event => event.provenance === 'explicit'
                        || event.provenance === 'authorial').length,
                    inferredDoses: events.filter(event => event.provenance === 'inferred_continuation').length,
                    lastDoseAt: events.length && Number.isFinite(Number((events[events.length - 1] || {}).atTotalMinutes))
                        ? Number(events[events.length - 1].atTotalMinutes) : null,
                    recentCadence: recentInputCadence(world, session, actorId, record.profileKey),
                    continuityModel: record.continuityModel || 'legacy'
                });
            });
            const envelope = computeFeasibilityEnvelope(world, session, actorId, registry);
            const impaired = Object.entries(envelope.tasks || {})
                .filter(([, def]) => def.legality && def.legality !== 'succeeds')
                .map(([task, def]) => ({ task, legality: def.legality,
                    meaningful_compensations: def.meaningfulCompensations || [] }));
            if (impaired.length) envelopeByActor[actorId] = impaired;
        });
        const containers = Object.entries(state.inventory.containers).map(([containerId, value]) => ({
            id: containerId, name: value.name, kind: value.kind, holderId: value.holderId,
            count: value.count, currentQuantity: value.currentQuantity,
            quantityUnit: value.quantityUnit, exhaustive: value.exhaustive
        }));
        const frame = {
            activeStates,
            impairedTaskEnvelope: envelopeByActor,
            inventoryContainers: containers,
            relationshipAxes: state.relationshipAxes,
            recentCognition: state.cognition.slice(-12)
        };
        return `\n[WORLD MECHANICS — PRE-TURN FRAME]\n${JSON.stringify(frame)}\n`
            + `The engine owns phases and dose arithmetic. INFER IT, FROM PROSE: a round arriving, a glass refilled, a baggie going round are doses for everyone involved — commit altered_state_updates with redose:true for each actor who took one. Never set a phase: restate phase only as an evidence-shaped transition (profile_key + source_event_ids + domains); illegal transitions are dropped with a report, never void the receipt. COMPRESSED TIME inside an ongoing consumption activity: submit a continuation entry {interval_minutes, rate_relation, basis} and let the engine compute inferred doses from canonical cadence; supply quantity_delta only when the narration states an exact count; use rate_relation "stopped" when the narration establishes explicit cessation. THE PLAYER IS TRACKED LIKE ANY CHARACTER: when the player's input has them taking a dose, commit it for actor "player" with redose:true, every time. Containers: unobserved is not zero; quantity observations stay evidence-backed.`;
    }

    function extendReceiptSchema(world, parameters) {
        if (!isEnabled(world) || !object(parameters?.properties)) return parameters;
        const properties = parameters.properties;
        if (object(properties.scene?.properties)) {
            properties.scene.properties.telemetry = {
                type: 'object',
                properties: {
                    topic: { type: 'string' }, mood: { type: 'string' }, tension: { type: 'string' },
                    interaction: { type: 'string' }, sounds: { type: 'array', items: { type: 'string' } },
                    elapsed_context: { type: 'string' }
                },
                description: 'Compact ending-scene telemetry. This is committed only with the receipt.'
            };
            properties.scene.properties.transition = {
                type: 'object',
                properties: {
                    boundary_type: { type: 'string', enum: ['none', 'time_skip', 'location_change', 'cast_change', 'sequence_change', 'manual'] },
                    evidence: { type: 'string' }, prior_scene_id: { type: 'string' }
                },
                description: 'Evidence-backed scene-boundary classification.'
            };
        }
        if (object(properties.events?.items?.properties)) {
            properties.events.items.properties.actor_intention = { type: 'string', description: 'What the actor meant or attempted; never substitute this for the objective result.' };
            properties.events.items.properties.objective_result = { type: 'string', description: 'What observably occurred, independent of anyone\'s interpretation.' };
        }
        const updates = properties.state_updates;
        if (!object(updates)) return parameters;
        if (!object(updates.properties)) updates.properties = {};
        const basis = {
            type: 'array', items: { type: 'object', properties: {
                type: { type: 'string', enum: ['event', 'observation', 'communication', 'cognition'] },
                id: { type: 'string' }
            }, required: ['type', 'id'] }
        };
        updates.properties.relationship_axis_updates = {
            type: 'array', items: { type: 'object', properties: {
                id: { type: 'string' }, source_actor_id: { type: 'string' }, target_actor_id: { type: 'string' },
                axes: { type: 'object', properties: Object.fromEntries(RELATIONSHIP_AXES.map(axis => [axis, { type: 'number', minimum: -100, maximum: 100 }])) },
                reason: { type: 'string' }, basis
            }, required: ['source_actor_id', 'target_actor_id', 'axes', 'reason', 'basis'] },
            description: 'Directional durable judgement updates backed by accepted evidence. Never use for transient mood or intoxicated warmth.'
        };
        updates.properties.altered_state_updates = {
            type: 'array', items: { type: 'object', properties: {
                id: { type: 'string' }, actor_id: { type: 'string' }, profile_key: { type: 'string' },
                source_event_ids: { type: 'array', items: { type: 'string' } },
                phase: { type: 'string', enum: ALTERED_PHASES }, domains: { type: 'array', items: { type: 'string' } },
                self_assessment: { type: 'string' },
                self_assessment_reliability: { type: 'string', enum: ['reliable', 'partially_reliable', 'unreliable', 'unknown'] },
                observable: { type: 'string', enum: ['none', 'subtle', 'noticeable', 'obvious', 'unknown'] },
                observed_at: { type: 'string' },
                redose: { type: 'boolean', description: "True only when this actor genuinely took more of this SAME substance while already active (a second line, another drink poured and drunk, etc.) — this restarts the onset clock. False or omitted for an ordinary phase update (e.g. moving from 'active' to 'declining' as time passes) on an episode already in progress." },
                continuation: { type: 'object', properties: {
                    interval_minutes: { type: 'integer', description: 'The compressed narrative interval this evidence covers.' },
                    activity: { type: 'string', enum: ['continued_consumption'] },
                    rate_relation: { type: 'string', enum: ['same', 'slower', 'faster', 'intermittent', 'unknown', 'stopped'], description: 'How consumption continued across the omitted interval. The engine computes inferred quantities from canonical dose history; supply quantity_delta only when the narration explicitly states a count.' },
                    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                    basis: { type: 'array', items: { type: 'string' }, description: 'Continuity evidence, e.g. same_party_continues, drinking_already_established, no_cessation_evidence.' },
                    quantity_delta: { type: 'integer', description: 'Only when the narration explicitly states the number of doses ("another three drinks"). Otherwise omit — the engine derives it from the established cadence.' }
                }, required: ['interval_minutes', 'rate_relation'] }
            }, required: ['actor_id', 'profile_key', 'source_event_ids', 'phase', 'domains'] },
            description: 'Compact embodied state compiled from an allowlisted BunnyRX profile and accepted source events. The engine tracks onset time and dose count itself from this — it does not need phase re-asserted every turn, only when it actually changes. A continuation entry carries semantic compressed-interval evidence; the engine computes inferred quantities from canonical dose history — supply quantity_delta only when the narration states an exact count.'
        };
        updates.properties.inventory_events = {
            type: 'array', items: { type: 'object', properties: {
                id: { type: 'string' }, action: { type: 'string', enum: INVENTORY_ACTIONS },
                container_id: { type: 'string' }, actor_id: { type: 'string' }, target_actor_id: { type: 'string' },
                item: { type: 'string' }, kind: { type: 'string', enum: ['discrete', 'continuous'] },
                count: { type: 'integer' }, quantity: { type: 'number' }, unit: { type: 'string' },
                measured: { type: 'boolean' }, exhaustive: { type: 'boolean' },
                evidence_event_ids: { type: 'array', items: { type: 'string' } }
            }, required: ['action', 'container_id', 'actor_id'] },
            description: 'Structured inventory changes. Continuous quantity observations are append-only; unknown never means zero.'
        };
        updates.properties.actor_cognition_updates = {
            type: 'array', items: { type: 'object', properties: {
                id: { type: 'string' }, actor_id: { type: 'string' }, kind: { type: 'string', enum: COGNITION_KINDS },
                text: { type: 'string' }, confidence: { type: 'number', minimum: 0, maximum: 1 },
                basis, supersedes: { type: 'string' }
            }, required: ['actor_id', 'kind', 'text', 'basis'] },
            description: 'Durable observation/communication/interpretation/belief/memory/reassessment with accepted provenance chains.'
        };
        globalThis.HordeDossierClaims?.extendReceiptSchema?.(parameters);
        return parameters;
    }

    function getActorAlteredStates(world, session, actorId) {
        const state = ensureSession(world, session);
        return clone(list(state?.alteredStates?.[id(actorId)]));
    }

    function setManualAlteredState(world, session, actorId, raw, registry) {
        const state = ensureSession(world, session);
        const normalizedActorId = id(actorId);
        const profileKey = id(raw?.profileKey || raw?.profile_key);
        const profile = registry?.profiles?.[profileKey];
        if (!state || !normalizedActorId || !profile) return { applied: false, reason: 'unknown_profile' };
        const phase = ALTERED_PHASES.includes(raw?.phase) ? raw.phase : 'active';
        const existing = list(state.alteredStates[normalizedActorId])
            .find(record => record.profileKey === profileKey);
        const current = list(state.alteredStates[normalizedActorId])
            .filter(record => record.profileKey !== profileKey);
        if (phase !== 'resolved') {
            // A manual dossier edit is authored state, not a fresh dose — it
            // shouldn't reset an in-progress onset/dose count that the model
            // already built up, only start one if there's genuinely nothing
            // there yet, UNLESS the editor explicitly asks to restart the
            // clock (resetOnset) or gives an explicit dose count/pace of
            // their own. Without any of this, the pacing check silently has
            // nothing to work with for anything added through this panel.
            const nowMinutes = Number(globalThis.getWorldTimeData?.(world, session)?.currentTotalMinutes);
            const nowTurn = Math.max(1, parseInt(session.turnCount) || 1);
            // Restoring a state that was lost, or correcting one the model got
            // wrong, must inherit the onset that actually happened — otherwise a
            // hand-repair silently restarts the clock and someone three hours into
            // a night reads as having just started. A prior record is therefore
            // resumed even when it had been resolved, because the common reason to
            // re-add a resolved state is that resolving it was the mistake.
            // A genuine new dose is still expressible: tick resetOnset.
            const resetOnset = raw?.resetOnset === true
                || !existing
                || !Number.isFinite(Number(existing?.onsetTotalMinutes));
            const explicitDoseCount = Number.isFinite(Number(raw?.doseCount)) && raw?.doseCount !== '' && raw?.doseCount != null
                ? Math.max(1, Math.round(Number(raw.doseCount))) : null;
            const explicitPace = PACE_KEYS.includes(raw?.pace) ? raw.pace : null;
            current.push({
                id: id(raw?.id, `manual_${normalizedActorId}_${profileKey}_${Date.now()}`),
                actorId: normalizedActorId,
                profileKey,
                sourceEventIds: unique(list(raw?.sourceEventIds).map(value => text(value, 160)))
                    .concat([`manual:dossier:${Date.now()}`]).slice(-20),
                phase,
                domains: list(raw?.domains).length
                    ? list(raw.domains).map(value => text(value, 120)).filter(Boolean).slice(0, 12)
                    : (existing?.domains?.length ? existing.domains
                        : list(profile.domains).map(value => text(value, 120)).filter(Boolean).slice(0, 12)),
                selfAssessment: text(raw?.selfAssessment, 200) || existing?.selfAssessment || '',
                selfAssessmentReliability: ['reliable', 'partially_reliable', 'unreliable', 'unknown']
                    .includes(raw?.selfAssessmentReliability) ? raw.selfAssessmentReliability
                    : (existing?.selfAssessmentReliability || 'unknown'),
                observable: ['none', 'subtle', 'noticeable', 'obvious', 'unknown'].includes(raw?.observable)
                    ? raw.observable : (existing?.observable || 'unknown'),
                observedAt: text(raw?.observedAt, 100) || `manual:${new Date().toISOString()}`,
                status: 'active',
                authority: 'user_dossier_edit',
                acceptedRevision: Number(session.worldStateVersion || 0),
                onsetTotalMinutes: resetOnset
                    ? (Number.isFinite(nowMinutes) ? nowMinutes : existing?.onsetTotalMinutes)
                    : (Number.isFinite(existing?.onsetTotalMinutes) ? existing.onsetTotalMinutes
                        : (Number.isFinite(nowMinutes) ? nowMinutes : undefined)),
                onsetTurn: resetOnset ? nowTurn : (existing?.onsetTurn ?? nowTurn),
                onsetLocationId: resetOnset
                    ? (normalizedActorId === 'player'
                        ? text(session.playerLocation, 120)
                        : text(object(session.entityStates) ? session.entityStates[normalizedActorId]?.location : '', 120))
                    : (existing?.onsetLocationId || ''),
                doseCount: explicitDoseCount ?? (Number(existing?.doseCount) || 1),
                doseEvents: (resetOnset || !list(existing?.doseEvents).length)
                    ? [...list(existing?.doseEvents), {
                        atTotalMinutes: Number.isFinite(nowMinutes) ? nowMinutes : null,
                        quantity: explicitDoseCount ?? 1, provenance: 'authorial'
                    }].slice(-80)
                    : list(existing?.doseEvents),
                continuityModel: (resetOnset || list(existing?.doseEvents).length
                    || explicitDoseCount != null) ? 'semantic_v1' : (existing?.continuityModel || ''),
                pace: explicitPace || existing?.pace || 'normal'
            });
        }
        if (current.length) state.alteredStates[normalizedActorId] = current.slice(-12);
        else delete state.alteredStates[normalizedActorId];
        return { applied: true, states: clone(current) };
    }

    function clearManualAlteredState(world, session, actorId, profileKey = '') {
        const state = ensureSession(world, session);
        const normalizedActorId = id(actorId);
        if (!state || !normalizedActorId) return false;
        if (!profileKey) {
            delete state.alteredStates[normalizedActorId];
            return true;
        }
        const current = list(state.alteredStates[normalizedActorId])
            .filter(record => record.profileKey !== id(profileKey));
        if (current.length) state.alteredStates[normalizedActorId] = current;
        else delete state.alteredStates[normalizedActorId];
        return true;
    }

    return Object.freeze({
        PROFILE_ID,
        RELATIONSHIP_AXES,
        RESONANCE_VALUES,
        ALTERED_PHASES,
        PHASE_AUTHORITIES,
        TASK_CATEGORIES,
        COMPENSATION_STRATEGIES,
        RATE_RELATIONS,
        CONTINUATION_CONFIDENCE,
        normalizePhasePolicy,
        expectedPhase,
        deriveCanonicalPhase,
        validatePhaseTransition,
        normalizeFeasibilityTable,
        computeFeasibilityEnvelope,
        validateExecution,
        recentInputCadence,
        resolveContinuation,
        normalizeContinuationUpdate,
        reconcilerFrame,
        isEnabled,
        ensureSession,
        normalizeCheckpointOverlay,
        applyCheckpoint,
        markCheckpointSuperseded,
        receiptIdentityGuard,
        normalizeSceneMetadata,
        normalizeCognitionRecord,
        normalizeInventoryContainer,
        normalizeQuantityObservation,
        prepareCommit,
        applyPreparedCommit,
        finalizeCommit,
        editSceneCardAnnotation,
        addGmProposal,
        approveGmProposal,
        markStaleGmProposals,
        deriveInteractionResonance,
        getActorAlteredStates,
        setManualAlteredState,
        clearManualAlteredState,
        promptContext,
        extendReceiptSchema
    });
});
