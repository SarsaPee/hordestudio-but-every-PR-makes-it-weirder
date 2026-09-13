/*
 * Sidecar runtime.  This deliberately lives in app.js: Sidecar and the world
 * engine share one browser runtime and communicate through direct state, not
 * separately loaded globals.  sidecar/ remains an archival/upstream source
 * bundle only; it is never requested by the running application.
 */
(function installIntegratedSidecarRuntime(global) {
    'use strict';
    const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
    const clean = (value, max = 240) => String(value || '').trim().slice(0, max);
    const stamp = () => new Date().toISOString();
    const key = value => clean(value, 160).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const identifier = kind => `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    // Sidecar is the only execution path. Legacy stored values are accepted
    // as input but always resolve to Sidecar; nothing re-enters Inline mode.
    const mode = () => 'sidecar';
    const numeric = (value, fallback, max) => { const parsed = Math.trunc(Number(value)); return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, max) : fallback; };
    // v2 adds evidence-scoped character intelligence and explicitly separates
    // accepted historical projections from abandoned Reader attempts.
    const READER_PROFILE_SCHEMA_VERSION = 2;
    function normalizeReaderProfile(raw = {}, fallback = {}) {
        const source = { ...(object(fallback) ? fallback : {}), ...(object(raw) ? raw : {}) };
        const choose = (value, fallbackValue, min, max) => {
            const parsed = Math.trunc(Number(value));
            return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallbackValue;
        };
        const effort = ['auto', 'low', 'medium', 'high'].includes(clean(source.reasoningEffort, 20))
            ? clean(source.reasoningEffort, 20) : 'auto';
        const retryPolicy = ['none', 'bounded'].includes(clean(source.retryPolicy, 20))
            ? clean(source.retryPolicy, 20) : 'bounded';
        const preset = object(source.scenePulsePreset) ? source.scenePulsePreset : {};
        const presetOverrides = object(preset.promptOverrides) ? Object.fromEntries(Object.entries(preset.promptOverrides)
            .filter(([key, value]) => /^[a-z][a-z0-9_]{0,60}$/i.test(String(key)) && typeof value === 'string' && value.trim())
            .map(([key, value]) => [key, clean(value, 12000)])) : {};
        const scenePulsePreset = clean(preset.id, 100) ? {
            id: clean(preset.id, 100), displayName: clean(preset.displayName || preset.id, 180), family: clean(preset.family, 60), provider: clean(preset.provider, 60),
            systemPromptRole: ['system', 'user', 'assistant'].includes(clean(preset.systemPromptRole, 20)) ? clean(preset.systemPromptRole, 20) : null,
            promptOverrides: presetOverrides
        } : null;
        return {
            schemaVersion: READER_PROFILE_SCHEMA_VERSION,
            revision: clean(source.revision || 'reader-v2', 80) || 'reader-v2',
            promptRevision: clean(source.promptRevision || 'scene-intelligence-v2', 100) || 'scene-intelligence-v2',
            provider: clean(source.provider, 40),
            model: clean(source.model, 200),
            reasoningMode: ['inherit', 'enabled', 'disabled'].includes(clean(source.reasoningMode, 20)) ? clean(source.reasoningMode, 20) : 'inherit',
            reasoningEffort: effort,
            maxTokens: choose(source.maxTokens, 0, 0, 100000),
            timeoutSeconds: choose(source.timeoutSeconds, 120, 10, 900),
            fullRefreshCadence: choose(source.fullRefreshCadence, 5, 1, 50),
            maxToolCalls: choose(source.maxToolCalls, 3, 0, 12),
            maxLookupPayload: choose(source.maxLookupPayload, 12000, 1000, 100000),
            contextBudget: choose(source.contextBudget, 24000, 4000, 120000),
            retryPolicy,
            scenePulsePreset,
            enabled: source.enabled !== false
        };
    }
    function worldConfig(world, options = {}) {
        if (!object(world)) return null;
        const current = object(world.sidecarConfig) ? world.sidecarConfig : {}, tracker = object(current.tracker) ? current.tracker : {}, debug = object(current.debug) ? current.debug : {}, memory = object(current.memory) ? current.memory : {};
        const reasoningMode = ['inherit', 'enabled', 'disabled'].includes(tracker.reasoningMode)
            ? tracker.reasoningMode : (tracker.reasoning === true ? 'enabled' : 'inherit');
        const roleplayOS = normalizeRoleplayOSConfig(current.roleplayOS);
        // Experimental Worlds has one execution path. Imported records retain
        // their older receipts for audit, but active play always uses Sidecar.
        world.sidecarConfig = { schemaVersion: 1, mode: 'sidecar', roleplayOS, tracker: { inheritNarrator: tracker.inheritNarrator !== false, provider: clean(tracker.provider, 40), model: clean(tracker.model, 160), openRouterRouting: object(tracker.openRouterRouting) ? tracker.openRouterRouting : null, supportedParams: Array.isArray(tracker.supportedParams) ? tracker.supportedParams.map(value => clean(value, 60)).filter(Boolean).slice(0, 80) : [], reasoningMode, reasoning: reasoningMode === 'enabled', reasoningEffort: ['auto', 'low', 'medium', 'high'].includes(clean(tracker.reasoningEffort, 20)) ? clean(tracker.reasoningEffort, 20) : 'auto', readerEnabled: tracker.readerEnabled !== false, readerProfileInherit: tracker.readerProfileInherit !== false, readerProfile: normalizeReaderProfile(tracker.readerProfile), readerMaxTokens: numeric(tracker.readerMaxTokens, 0, 100000), maxTokens: numeric(tracker.maxTokens, 0, 100000) }, debug: { enabled: debug.enabled === true, retainTraceCount: numeric(debug.retainTraceCount, 20, 200) }, memory: { inheritGlobal: memory.inheritGlobal !== false, episodeChunkTurns: numeric(memory.episodeChunkTurns, 5, 20), episodeCadenceTurns: numeric(memory.episodeCadenceTurns, 5, 50), verbatimTurnWindow: numeric(memory.verbatimTurnWindow, 5, 30), consolidationConcurrency: numeric(memory.consolidationConcurrency, 6, 12), backgroundProviderConcurrency: numeric(memory.backgroundProviderConcurrency, 2, 12), retrievalLimit: numeric(memory.retrievalLimit, 8, 24), cognitionRecentLimit: numeric(memory.cognitionRecentLimit, 8, 30), cognitionSemanticTopK: numeric(memory.cognitionSemanticTopK, 6, 20) } };
        return world.sidecarConfig;
    }
    function emptyProtocol(activeMode) { return { schemaVersion: 2, mode: activeMode, activeSequenceId: '', sequences: [], activeSceneId: '', scenes: [], turns: [], takes: [], takeIndex: {}, questions: [], requests: [], proposals: [], backgroundProposals: [], refinements: [], conversations: [], inputMode: 'narrator', coreAnswers: {}, temporalState: {}, provisionalLocations: [], provisionalEntities: [], readerCandidates: [], sceneProjection: null, sceneProjections: [], traversalState: {}, packet: null, readerSnapshots: [], readerRefreshes: [], readerProfile: normalizeReaderProfile({}), memoryGraph: {}, jobs: [], diagnostics: { reconciliationAttempts: [] }, debug: { enabled: false, retainTraceCount: 20, traces: [] }, migration: {} }; }
    function timelineProtocol(world, timeline, options = {}) {
        if (!object(timeline)) return null;
        const config = worldConfig(world, options) || { mode: 'sidecar', debug: {} }, current = object(timeline.sidecar) ? timeline.sidecar : {};
        const protocol = { ...emptyProtocol('sidecar'), ...current };
        protocol.schemaVersion = Math.max(2, Number(current.schemaVersion) || 0); protocol.mode = 'sidecar';
        ['sequences','scenes','turns','takes','questions','requests','proposals','backgroundProposals','refinements','conversations','provisionalLocations','provisionalEntities','readerCandidates','readerSnapshots','readerRefreshes','sceneProjections','jobs'].forEach(field => { if (!Array.isArray(protocol[field])) protocol[field] = []; });
        ['takeIndex','temporalState','traversalState','memoryGraph','diagnostics','migration','coreAnswers'].forEach(field => { if (!object(protocol[field])) protocol[field] = {}; });
        protocol.inputMode = protocol.inputMode === 'sidecar' ? 'sidecar' : 'narrator'; protocol.activeSequenceId = clean(protocol.activeSequenceId, 120); protocol.activeSceneId = clean(protocol.activeSceneId, 120); protocol.packet = object(protocol.packet) ? protocol.packet : null; protocol.readerProfile = normalizeReaderProfile(protocol.readerProfile);
        const debug = object(protocol.debug) ? protocol.debug : {}; protocol.debug = { enabled: debug.enabled === true || config.debug?.enabled === true, retainTraceCount: numeric(debug.retainTraceCount, config.debug?.retainTraceCount || 20, 200), traces: Array.isArray(debug.traces) ? debug.traces.slice(-200) : [] };
        // v2 migration is deliberately conservative: old active snapshots are
        // accepted only when their source Turn still proves a committed Take;
        // ambiguous pending/legacy records remain inspectable but quarantined
        // from current projection, candidates and memory eligibility.
        const committedTurn = id => protocol.turns.some(turn => turn?.id === id && ['active', 'reconciled_late'].includes(turn.status) && ['committed', 'committed_late'].includes(turn.reconciliationStatus));
        protocol.readerSnapshots.forEach(snapshot => {
            if (snapshot.status === 'active' && committedTurn(snapshot.turnId)) { snapshot.settlementStatus = 'settled'; return; }
            if (snapshot.status === 'accepted_historical' && committedTurn(snapshot.turnId)) { snapshot.settlementStatus = 'settled'; return; }
            if (!['active', 'accepted_historical'].includes(snapshot.status)) snapshot.settlementStatus = snapshot.settlementStatus || 'audit_only';
            else { snapshot.status = 'legacy_quarantined'; snapshot.settlementStatus = 'quarantined'; snapshot.migrationWarning = 'Legacy Reader snapshot has no provable settled Turn ancestry.'; }
        });
        protocol.readerCandidates.forEach(candidate => {
            if (candidate.settlementStatus) return;
            const sources = Array.isArray(candidate.sourceTurnIds) ? candidate.sourceTurnIds : [];
            candidate.settlementStatus = sources.length && sources.every(committedTurn) ? 'settled' : 'quarantined';
            if (candidate.settlementStatus !== 'settled') candidate.migrationWarning = 'Candidate preserved for audit until accepted source ancestry can be repaired.';
        });
        protocol.migration.readerSceneIntelligenceV2 = protocol.migration.readerSceneIntelligenceV2 || { status: 'applied', appliedAt: stamp(), notes: 'Legacy Reader records were classified by committed Turn ancestry; ambiguous data was quarantined.' };
        timeline.sidecar = protocol; return protocol;
    }
    function current(protocol, field, id) { return (protocol[field] || []).find(item => item?.id === id) || null; }
    function entityId(timeline) { return clean(timeline?.controlledEntityId || timeline?.playerEntityId || 'player', 120) || 'player'; }
    function createSequence(protocol, timeline, options = {}) { const previous = current(protocol, 'sequences', protocol.activeSequenceId); if (previous?.status === 'active') { previous.status = 'closed'; previous.closedAt = stamp(); previous.closeReason = clean(options.closePreviousReason || 'new_sequence', 160); } const sequence = { id: identifier('sequence'), timelineId: clean(timeline?.id,120), status: options.status === 'planning' ? 'planning' : 'active', title: clean(options.title || `Sequence ${(protocol.sequences || []).length + 1}`,180) || 'Untitled sequence', controlledEntityId: clean(options.controlledEntityId || entityId(timeline),120), createdAt: stamp(), startedAt: options.status === 'planning' ? '' : stamp(), closedAt: '', startTurnId: clean(options.startTurnId,160), endTurnId: '', predecessorSequenceId: clean(options.predecessorSequenceId || previous?.id,120), transitionMode: options.transitionMode === 'discontinuous' ? 'discontinuous' : 'continuous', planning: object(options.planning) ? options.planning : { status: options.status === 'planning' ? 'draft' : 'approved', authorIntent: '' }, continuationTail: Array.isArray(options.continuationTail) ? options.continuationTail.slice(-6) : [], closure: null, provenance: { source: clean(options.source || 'sidecar',80), createdAt: stamp() } }; protocol.sequences.push(sequence); protocol.activeSequenceId = sequence.id; return sequence; }
    function createScene(protocol, options = {}) { const scene = { id: identifier('scene'), timelineId: clean(options.timelineId,120), sequenceIds: Array.isArray(options.sequenceIds) ? options.sequenceIds.map(value => clean(value,120)).filter(Boolean) : [], status: options.status === 'closed' ? 'closed' : 'active', title: clean(options.title || 'Current scene',180) || 'Current scene', mode: options.mode === 'discontinuous' ? 'discontinuous' : 'continuous', openedAt: stamp(), closedAt: '', startTurnId: clean(options.startTurnId,160), endTurnId: '', source: clean(options.source || 'sidecar',80), boundaryEvidence: clean(options.boundaryEvidence,2000), continuation: object(options.continuation) ? options.continuation : {}, provisionalReview: { status: 'pending', reviewedAt: '' } }; protocol.scenes.push(scene); protocol.activeSceneId = scene.id; return scene; }
    function hierarchy(protocol, timeline, options = {}) {
        if (!protocol || !timeline) return null;
        // Older first-turn saves can contain an active sequence/scene while
        // their pointer IDs are blank. Recover those records rather than
        // misclassifying the timeline as deliberately closed.
        let sequence = current(protocol, 'sequences', protocol.activeSequenceId)
            || (protocol.sequences || []).find(item => item?.status === 'active') || null;
        if (!sequence || sequence.status === 'closed') {
            if (protocol.sequences.length && options.createWhenMissing !== true) return null;
            sequence = createSequence(protocol, timeline, {
                title: protocol.sequences.length ? `Sequence ${protocol.sequences.length + 1}` : 'Opening sequence',
                controlledEntityId: entityId(timeline), source: 'migration'
            });
        }
        let scene = current(protocol, 'scenes', protocol.activeSceneId)
            || (protocol.scenes || []).find(item => item?.status === 'active'
                && (!Array.isArray(item.sequenceIds) || item.sequenceIds.includes(sequence.id))) || null;
        if (!scene || scene.status === 'closed') {
            if (protocol.scenes.length && options.createWhenMissing !== true) return null;
            scene = createScene(protocol, {
                timelineId: timeline.id, sequenceIds: [sequence.id],
                title: protocol.scenes.length ? 'Current scene' : 'Opening scene', source: 'migration'
            });
        }
        if (!Array.isArray(scene.sequenceIds)) scene.sequenceIds = [];
        if (!scene.sequenceIds.includes(sequence.id)) scene.sequenceIds.push(sequence.id);
        protocol.activeSequenceId = sequence.id;
        protocol.activeSceneId = scene.id;
        return { sequence, scene };
    }
    function beginPlanning(protocol,timeline,authorIntent='') { const active=hierarchy(protocol,timeline); const planning={id:identifier('sequence_plan'),status:'draft',authorIntent:clean(authorIntent,4000),createdAt:stamp(),predecessorSequenceId:active?.sequence?.id||'',constraints:[],openQuestions:(protocol.questions||[]).filter(question=>question.status==='open').map(question=>question.id).slice(-20),proposedStartPacket:null,revisionCount:0,provenance:{source:'direct_user_refinement'}}; protocol.sequencePlanning=planning; return planning; }
    function approvePlanning(protocol,timeline,packet={},options={}) { const planning=object(protocol?.sequencePlanning)?protocol.sequencePlanning:null; if(!planning)return null; const previous=hierarchy(protocol,timeline), prior=previous?.scene; if(prior?.status==='active'&&options.closePriorScene===true){prior.status='closed';prior.closedAt=stamp();prior.provisionalReview={status:'pending',reviewedAt:''};} const tail=(protocol.turns||[]).filter(turn=>turn.sequenceId===previous?.sequence?.id).slice(-4).map(turn=>({id:turn.id,narration:clean(turn.narration,1200)})); const sequence=createSequence(protocol,timeline,{title:options.title||packet.title||'New sequence',controlledEntityId:options.controlledEntityId||previous?.sequence?.controlledEntityId||entityId(timeline),transitionMode:options.transitionMode||packet.transitionMode||'continuous',planning:{...planning,status:'approved',approvedAt:stamp(),proposedStartPacket:packet},continuationTail:options.transitionMode==='discontinuous'?[]:tail,source:'direct_user_refinement'}); const scene=createScene(protocol,{timelineId:timeline.id,sequenceIds:[sequence.id],title:packet.sceneTitle||packet.title||(sequence.transitionMode==='continuous'?'Continuing scene':'New scene'),mode:sequence.transitionMode,continuation:packet,source:'direct_user_refinement'}); protocol.sequencePlanning={...planning,status:'approved',approvedAt:stamp(),sequenceId:sequence.id,sceneId:scene.id}; return {sequence,scene,planning:protocol.sequencePlanning}; }
    function closeSequence(protocol,timeline,reason='author_closed') { const active=hierarchy(protocol,timeline); if(!active)return null; const {sequence,scene}=active; sequence.status='closed';sequence.closedAt=stamp();sequence.closeReason=clean(reason,240);sequence.endTurnId=(protocol.turns||[]).filter(turn=>turn.sequenceId===sequence.id).at(-1)?.id||'';sequence.closure={closedAt:sequence.closedAt,unresolvedQuestionIds:(protocol.questions||[]).filter(question=>question.status==='open').map(question=>question.id).slice(-40),provisionalLocationIds:(protocol.provisionalLocations||[]).filter(location=>location.status!=='resolved').map(location=>location.id).slice(-40),provisionalEntityIds:(protocol.provisionalEntities||[]).filter(entity=>entity.status!=='resolved').map(entity=>entity.id).slice(-40),status:'reconciliation_pending'}; if(scene.status==='active'){scene.status='closed';scene.closedAt=stamp();scene.endTurnId=sequence.endTurnId;scene.provisionalReview={status:'pending',reviewedAt:''};} protocol.activeSequenceId='';protocol.activeSceneId='';return sequence; }
    function recordTimelineTurn(protocol,timeline,turn){const active=hierarchy(protocol,timeline);if(!active||!turn)return turn;turn.sequenceId=active.sequence.id;turn.sceneId=active.scene.id;turn.controlledEntityId=active.sequence.controlledEntityId;active.sequence.endTurnId=turn.id;active.scene.endTurnId=turn.id;return turn;}
    function pressure(protocol,timeline,options={}) { const f=object(options.factors)?options.factors:{}, values={contextRatio:Math.max(0,Math.min(1,Number(options.contextRatio)||0)),historyCount:Math.max(0,Number(options.historyCount)||0),sceneTurns:(protocol.turns||[]).filter(turn=>turn.sceneId===protocol.activeSceneId).length,openQuestions:(protocol.questions||[]).filter(question=>question.status==='open').length,blockingQuestions:Math.max(0,Number(f.blockingQuestions)||0),activeCast:Math.max(0,Number(f.activeCast)||0),retrievedMemoryCount:Math.max(0,Number(f.retrievedMemoryCount)||0),canonicalChars:Math.max(0,Number(f.canonicalChars)||0),sceneChars:Math.max(0,Number(f.sceneChars)||0),sequenceTurns:Math.max(0,Number(f.sequenceTurns)||0),reconciliationFriction:Math.max(0,Number(f.reconciliationFriction)||0),sourceRetirement:Math.max(0,Number(f.sourceRetirement)||0)}, weights={contextRatio:45,historyCount:.08,sceneTurns:2,openQuestions:2,blockingQuestions:5,activeCast:1.5,retrievedMemoryCount:.5,canonicalChars:.002,sceneChars:.002,sequenceTurns:.5,reconciliationFriction:3,sourceRetirement:2,...(object(options.weights)?options.weights:{})}; const score=Math.min(100,Math.round(Object.entries(values).reduce((total,[name,value])=>total+value*Number(weights[name]||0),0))), threshold=object(options.thresholds)?options.thresholds:{},watch=Math.max(1,Math.min(99,Number(threshold.watch)||45)),refresh=Math.max(watch+1,Math.min(100,Number(threshold.refresh)||70));return {score,recommendation:score>=refresh?'recommend_refresh':score>=watch?'watch':'clear',factors:values,weights,thresholds:{watch,refresh},generatedAt:stamp()}; }
    function stage(protocol,kind,raw,evidence={}) {
        if (!protocol) return null;
        const field = kind === 'location' ? 'provisionalLocations' : 'provisionalEntities';
        if (!Array.isArray(protocol[field])) protocol[field] = [];
        const name = clean(raw?.name, 180);
        if (!name) return null;
        // A Reader candidate's stable id is real scene identity.  Never
        // collapse two same-named people or places just because a later
        // promotion bridge happens to see the same display label.
        const scenePulseCandidateId = clean(raw?.scenePulseCandidateId || raw?.sourceCandidateId, 180);
        let entry = protocol[field].find(record => {
            if (record.status === 'promoted') return false;
            if (scenePulseCandidateId) return clean(record.scenePulseCandidateId, 180) === scenePulseCandidateId;
            return !clean(record.scenePulseCandidateId, 180) && key(record.name) === key(name);
        });
        if (!entry) {
            entry = {
                id: identifier(kind === 'location' ? 'provisional_location' : 'provisional_entity'),
                kind, name, status: 'implicit', createdAt: stamp(), updatedAt: stamp(), evidence: [],
                candidateCanonicalIds: [], promotionRequested: false, promotedCanonicalId: ''
            };
            protocol[field].push(entry);
        }
        const proof = {
            at: stamp(), source: clean(evidence.source || 'narrator_handoff', 80),
            turnId: clean(evidence.turnId, 160), narration: clean(evidence.narration, 3000),
            handoff: clean(evidence.handoff, 3000), proposed: raw
        };
        entry.evidence = [...(entry.evidence || []), proof].slice(-20);
        entry.updatedAt = proof.at;
        entry.description = clean(raw?.description, 1800) || entry.description || '';
        entry.parentHint = clean(raw?.parent_location_id || raw?.connects_to || raw?.home_location, 180) || entry.parentHint || '';
        if (scenePulseCandidateId) entry.scenePulseCandidateId = scenePulseCandidateId;
        if (raw?.scenePulseCandidateType) entry.scenePulseCandidateType = clean(raw.scenePulseCandidateType, 40);
        if (kind === 'location') {
            entry.region = clean(raw?.region, 180) || entry.region || '';
            entry.mapType = clean(raw?.map_type, 40) || entry.mapType || '';
            entry.floor = clean(raw?.floor, 80) || entry.floor || '';
        } else entry.persona = clean(raw?.persona, 1800) || entry.persona || '';
        return entry;
    }
    function normalizeReaderCandidate(raw = {}, defaults = {}) {
        const source = experimentalIsPlainObject(raw) ? raw : {};
        const typeMap = { character: 'character', entity: 'character', npc: 'character', location: 'location', local_space: 'location', space: 'location', outfit: 'outfit', clothing: 'outfit', prop: 'prop', item: 'prop', vehicle: 'vehicle', relationship: 'relationship', thread: 'thread', quest: 'thread' };
        const candidateType = typeMap[String(source.candidateType || source.candidate_type || source.type || 'entity').toLowerCase()] || 'entity';
        const statusValues = ['derived', 'matched', 'unresolved', 'proposed', 'accepted', 'rejected', 'superseded', 'stale', 'retired', 'promoted'];
        const rawStatus = String(source.lifecycleStatus || source.lifecycle_status || source.status || 'derived').toLowerCase();
        const evidence = Array.isArray(source.evidence) ? source.evidence.slice(0, 24).map(item => experimentalIsPlainObject(item) ? experimentalSafeJsonClone(item) : { text: String(item || '').slice(0, 1000) }) : [];
        const label = String(source.label || source.name || source.title || source.role || '').trim().slice(0, 240);
        const candidateId = String(source.candidateId || source.candidate_id || '').trim().slice(0, 180);
        return {
            // A label alone is not identity: two unnamed bartenders or two
            // "red coats" may coexist. Horde scopes an omitted model ID to
            // source continuity and parent rather than merging by prose.
            candidateId: candidateId || `${candidateType}_${key(defaults.sourceTurnId || defaults.readerSnapshotId || 'unscoped').replace(/[^a-z0-9]+/g, '_').slice(-48)}_${key(label || 'unnamed').replace(/[^a-z0-9]+/g, '_').slice(0, 48) || 'unnamed'}`,
            candidateType,
            label,
            name: label,
            role: String(source.role || '').slice(0, 180),
            description: String(source.description || (typeof source.details === 'string' ? source.details : '') || '').slice(0, 2400),
            status: statusValues.includes(rawStatus) ? rawStatus : 'derived',
            canonicalMatchId: String(source.canonicalMatchId || source.canonical_match_id || source.canonicalEntityId || source.canonical_entity_id || '').slice(0, 180),
            parentCandidateId: String(source.parentCandidateId || source.parent_candidate_id || '').slice(0, 180),
            parentCanonicalId: String(source.parentCanonicalId || source.parent_canonical_id || source.parentLocationId || '').slice(0, 180),
            presence: String(source.presence || source.presenceState || '').slice(0, 40),
            details: experimentalIsPlainObject(source.details) ? experimentalSafeJsonClone(source.details) : {},
            clothingDescription: String(source.clothingDescription || source.clothing_description || '').slice(0, 1800),
            individualGarments: Array.isArray(source.individualGarments || source.individual_garments) ? (source.individualGarments || source.individual_garments).map(item => String(item || '').slice(0, 180)).filter(Boolean).slice(0, 24) : [],
            visibleCondition: String(source.visibleCondition || source.visible_condition || '').slice(0, 600),
            confidence: Number.isFinite(Number(source.confidence)) ? Math.max(0, Math.min(1, Number(source.confidence))) : null,
            uncertainty: String(source.uncertainty || '').slice(0, 600),
            sourceTurnIds: [...new Set([...(Array.isArray(source.sourceTurnIds) ? source.sourceTurnIds : source.source_turn_ids || []), defaults.sourceTurnId].map(value => String(value || '').slice(0, 180)).filter(Boolean))].slice(-30),
            sourceTakeIds: [...new Set([...(Array.isArray(source.sourceTakeIds) ? source.sourceTakeIds : source.source_take_ids || []), defaults.sourceTakeId].map(value => String(value || '').slice(0, 180)).filter(Boolean))].slice(-30),
            sourceRevisionIds: [...new Set([...(Array.isArray(source.sourceRevisionIds) ? source.sourceRevisionIds : source.source_revision_ids || []), defaults.sourceRevisionId].map(value => String(value || '').slice(0, 180)).filter(Boolean))].slice(-30),
            readerSnapshotId: String(source.readerSnapshotId || defaults.readerSnapshotId || '').slice(0, 180),
            settlementId: String(source.settlementId || defaults.settlementId || '').slice(0, 180),
            attemptId: String(source.attemptId || defaults.attemptId || '').slice(0, 180),
            evidence,
            lastSeenAt: String(source.lastSeenAt || source.last_seen_at || new Date().toISOString()).slice(0, 40),
            promotionProvenance: experimentalIsPlainObject(source.promotionProvenance || source.promotion_provenance) ? experimentalSafeJsonClone(source.promotionProvenance || source.promotion_provenance) : null
        };
    }

    function mergeReaderCandidates(protocol, rawCandidates, defaults = {}) {
        if (!protocol) return [];
        if (!Array.isArray(protocol.readerCandidates)) protocol.readerCandidates = [];
        const incoming = (Array.isArray(rawCandidates) ? rawCandidates : []).slice(0, 80).map(raw => normalizeReaderCandidate(raw, defaults)).filter(candidate => candidate.label || candidate.description || candidate.candidateId);
        const touched = [];
        incoming.forEach(candidate => {
            // Stable model-supplied IDs win. If a provider omits them, use a
            // type/label/parent key so “the bartender” persists across deltas.
            let existing = candidate.candidateId && protocol.readerCandidates.find(item => item.status !== 'superseded' && item.status !== 'retired' && item.candidateId === candidate.candidateId);
            if (!existing) {
                existing = { ...candidate, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
                protocol.readerCandidates.push(existing);
            } else {
                const priorEvidence = Array.isArray(existing.evidence) ? existing.evidence : [];
                const nextEvidence = [...priorEvidence, ...candidate.evidence].slice(-24);
                const union = field => [...new Set([...(existing[field] || []), ...(candidate[field] || [])])].slice(-30);
                Object.assign(existing, candidate, {
                    // Deltas are sparse. Never erase accepted evidence simply
                    // because the next Reader pass omitted a field.
                    label: candidate.label || existing.label,
                    role: candidate.role || existing.role,
                    description: candidate.description || existing.description,
                    clothingDescription: candidate.clothingDescription || existing.clothingDescription,
                    visibleCondition: candidate.visibleCondition || existing.visibleCondition,
                    canonicalMatchId: candidate.canonicalMatchId || existing.canonicalMatchId,
                    sourceTurnIds: union('sourceTurnIds'), sourceTakeIds: union('sourceTakeIds'), sourceRevisionIds: union('sourceRevisionIds'),
                    evidence: nextEvidence, createdAt: existing.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
                });
            }
            touched.push(existing);
        });
        protocol.readerCandidates = protocol.readerCandidates.slice(-600);
        return touched;
    }

    function activeReaderCandidates(protocol, options = {}) {
        const records = Array.isArray(protocol?.readerCandidates) ? protocol.readerCandidates : [];
        return records.filter(candidate => !['superseded', 'retired', 'stale', 'rejected'].includes(candidate.status)
            && candidate.attemptStatus !== 'pending' && candidate.settlementStatus === 'settled'
            && (!options.sceneId || (candidate.sourceSceneId || options.sceneId) === options.sceneId)
            && (!options.takeId || !candidate.sourceTakeIds?.length || candidate.sourceTakeIds.includes(options.takeId)));
    }
    function stageIntroductions(protocol,receipt,evidence={}) { if(!protocol||!object(receipt))return [];const staged=[];[['location_introduced','location'],['npc_introduced','entity']].forEach(([field,kind])=>{if(Array.isArray(receipt[field])){receipt[field].forEach(raw=>{const entry=stage(protocol,kind,raw,evidence);if(entry)staged.push(entry);});delete receipt[field];}});return staged; }
    function promotionFlag(protocol,provisionalId,source='direct_user_refinement'){const entry=[...(protocol?.provisionalLocations||[]),...(protocol?.provisionalEntities||[])].find(record=>record.id===provisionalId);if(!entry)return null;entry.promotionRequested=true;entry.promotionRequestedAt=stamp();entry.promotionProvenance={source};entry.status='promotion_requested';return entry;}
    function promoted(protocol,provisionalId,canonicalId){const entry=[...(protocol?.provisionalLocations||[]),...(protocol?.provisionalEntities||[])].find(record=>record.id===provisionalId);if(!entry)return null;entry.status='promoted';entry.promotedCanonicalId=clean(canonicalId,160);entry.promotedAt=stamp();return entry;}
    function normalizeTraversal(world){if(!object(world))return null;const source=object(world.traversalConfig)?world.traversalConfig:{}, methods=Array.isArray(source.methods)?source.methods:[];world.traversalConfig={schemaVersion:1,methods:methods.map((raw,index)=>{const coverageType=raw?.coverageType==='route_based'?'route_based':'point_to_point';return{id:clean(raw?.id||`traversal_${index+1}`,100)||`traversal_${index+1}`,name:clean(raw?.name||`Traversal ${index+1}`,140)||`Traversal ${index+1}`,enabled:raw?.enabled!==false,coverageType,exclusions:Array.isArray(raw?.exclusions)?raw.exclusions.map(value=>clean(value,160)).filter(Boolean).slice(0,100):[],routeStops:coverageType==='route_based'&&Array.isArray(raw?.routeStops)?raw.routeStops.map(value=>clean(value,160)).filter(Boolean).slice(0,500):[],tags:Array.isArray(raw?.tags)?raw.tags.map(value=>clean(value,80)).filter(Boolean).slice(0,32):[],provider:clean(raw?.provider,140),notes:clean(raw?.notes,1200)}})};return world.traversalConfig;}
    function normalizeVehicle(entity){if(!object(entity)||String(entity.type||'').toLowerCase()!=='vehicle')return null;const raw=object(entity.vehicle)?entity.vehicle:{};entity.vehicle={persistent:raw.persistent!==false,parkedAnchorId:clean(raw.parkedAnchorId||entity.startLocation,160),ownerEntityId:clean(raw.ownerEntityId||raw.owners?.[0]?.entityId||raw.owners?.[0],160),owners:Array.isArray(raw.owners)?raw.owners.map(entry=>({entityId:clean(entry?.entityId||entry,160),role:'owner'})).filter(entry=>entry.entityId).slice(0,20):[],access:Array.isArray(raw.access)?raw.access.map(entry=>({entityId:clean(entry?.entityId,160),role:['owner','driver','passenger','guest'].includes(entry?.role)?entry.role:'guest'})).filter(entry=>entry.entityId).slice(0,80):[],interiorHint:clean(raw.interiorHint||entity.description,1800),tags:Array.isArray(raw.tags)?raw.tags.map(value=>clean(value,80)).filter(Boolean).slice(0,32):[]};if(entity.vehicle.ownerEntityId&&!entity.vehicle.owners.some(entry=>entry.entityId===entity.vehicle.ownerEntityId))entity.vehicle.owners.unshift({entityId:entity.vehicle.ownerEntityId,role:'owner'});return entity.vehicle;}
    function resolveLocation(world,ref){const needle=clean(ref,180).toLowerCase();return(world?.locations||[]).find(location=>String(location?.id||'').toLowerCase()===needle||String(location?.name||'').trim().toLowerCase()===needle)||null;}
    function anchor(world,ref){let location=resolveLocation(world,ref);const seen=new Set();while(location&&!seen.has(location.id)){seen.add(location.id);if(String(location.mapType||'').toLowerCase()!=='room')return location;location=resolveLocation(world,location.parentLocationId);}return null;}
    function coverage(world,methodId,originRef,destinationRef){const method=normalizeTraversal(world)?.methods.find(entry=>entry.id===methodId&&entry.enabled);if(!method)return{ok:false,reason:'unknown_or_disabled_method'};const origin=anchor(world,originRef),destination=anchor(world,destinationRef);if(!origin||!destination)return{ok:false,reason:'no_eligible_pickup_or_dropoff',origin,destination,method};const exclusions=new Set(method.exclusions.map(value=>value.toLowerCase()));if(exclusions.has(origin.id.toLowerCase())||exclusions.has(destination.id.toLowerCase()))return{ok:false,reason:'method_exclusion',origin,destination,method};if(method.coverageType==='route_based'){const from=method.routeStops.indexOf(origin.id)>=0?method.routeStops.indexOf(origin.id):method.routeStops.indexOf(origin.name),to=method.routeStops.indexOf(destination.id)>=0?method.routeStops.indexOf(destination.id):method.routeStops.indexOf(destination.name);if(from<0||to<0||from===to)return{ok:false,reason:'route_stop_not_authored',origin,destination,method};return{ok:true,origin,destination,method,route:method.routeStops.slice(Math.min(from,to),Math.max(from,to)+1)};}return{ok:true,origin,destination,method,route:[]};}
    function traversalState(protocol){if(!protocol)return null;if(!object(protocol.traversalState))protocol.traversalState={};if(!Array.isArray(protocol.traversalState.journeys))protocol.traversalState.journeys=[];if(!Array.isArray(protocol.traversalState.recentRuntimeContainers))protocol.traversalState.recentRuntimeContainers=[];return protocol.traversalState;}
    function createJourney(protocol,world,options={}){const state=traversalState(protocol);if(!state)return null;const result=options.methodId?coverage(world,options.methodId,options.originId,options.destinationId):null;if(result&&!result.ok)return{error:result.reason,coverage:result};const vehicle=options.vehicleId?(world.entities||[]).find(entity=>entity.id===options.vehicleId&&entity.type==='vehicle'):null,runtime=vehicle?null:{id:identifier('runtime_vehicle'),kind:clean(options.runtimeKind||'rideshare',80)||'rideshare',createdAt:stamp(),interiorHint:clean(options.interiorHint,1800),persistent:false},journey={id:identifier('journey'),status:'prepared',createdAt:stamp(),updatedAt:stamp(),methodId:clean(options.methodId,120),vehicleEntityId:vehicle?.id||'',runtimeContainer:runtime,originAnchorId:result?.origin?.id||clean(options.originId,160),destinationAnchorId:result?.destination?.id||clean(options.destinationId,160),occupants:Array.isArray(options.occupants)?options.occupants.map(value=>clean(value,160)).filter(Boolean).slice(0,20):[],provenance:{source:clean(options.source||'sidecar',80),evidence:clean(options.evidence,2000)},temporalEvidence:clean(options.temporalEvidence,1200)};state.journeys.push(journey);state.journeys=state.journeys.slice(-80);return journey;}
    function reconcileVehicleEvents(protocol,world,receipt,options={}){const state=traversalState(protocol);if(!state)return[];const changes=[];(receipt?.events||[]).forEach(event=>{if(event?.type!=='movement'||event?.movement_mode!=='vehicle')return;const actorId=clean(event.actor_id,160),vehicleId=clean(event.vehicle_id||event.vehicleId,160),status=clean(event.status,40)||'completed';if(['intended','attempted','in_progress'].includes(status)){let journey=state.journeys.find(item=>item.status!=='completed'&&item.occupants.includes(actorId)&&(!vehicleId||item.vehicleEntityId===vehicleId));if(!journey){journey=createJourney(protocol,world,{vehicleId,originId:event.from_location_id||options.playerLocationId,destinationId:event.to_location_id||'',occupants:[actorId],source:'narrator_handoff',evidence:event.evidence||event.cause||'',runtimeKind:vehicleId?'':'rideshare'});if(journey?.id)changes.push({type:'journey_prepared',journeyId:journey.id});}return;}if(status!=='completed')return;const journey=[...state.journeys].reverse().find(item=>item.status!=='completed'&&item.occupants.includes(actorId)&&(!vehicleId||item.vehicleEntityId===vehicleId));if(!journey)return;journey.status='completed';journey.completedAt=stamp();journey.destinationAnchorId=clean(event.to_location_id||journey.destinationAnchorId,160);if(journey.vehicleEntityId){const vehicle=(world.entities||[]).find(entity=>entity.id===journey.vehicleEntityId),data=normalizeVehicle(vehicle);if(data)data.parkedAnchorId=journey.destinationAnchorId||data.parkedAnchorId;}else if(journey.runtimeContainer){state.recentRuntimeContainers.push({...journey.runtimeContainer,departedAt:stamp(),journeyId:journey.id});state.recentRuntimeContainers=state.recentRuntimeContainers.slice(-20);}changes.push({type:'journey_completed',journeyId:journey.id});});return changes;}
    function graph(protocol){if(!protocol)return null;const prior=object(protocol.memoryGraph)?protocol.memoryGraph:{};protocol.memoryGraph={schemaVersion:1,worldHistory:Array.isArray(prior.worldHistory)?prior.worldHistory:[],episodes:Array.isArray(prior.episodes)?prior.episodes:[],scenes:Array.isArray(prior.scenes)?prior.scenes:[],sequences:Array.isArray(prior.sequences)?prior.sequences:[],cognition:Array.isArray(prior.cognition)?prior.cognition:[],locationReferences:Array.isArray(prior.locationReferences)?prior.locationReferences:[],lastEpisodeTurnCount:Math.max(0,Number(prior.lastEpisodeTurnCount)||0),...prior};return protocol.memoryGraph;}
    function jobs(protocol){if(!protocol)return[];if(!Array.isArray(protocol.jobs))protocol.jobs=[];return protocol.jobs;}
    function recordMemoryTurn(protocol,turn){const memory=graph(protocol);if(!memory||!turn?.id)return null;let record=memory.worldHistory.find(item=>item.turnId===turn.id);if(record){if(turn.readerEnvelope){record.readerEnvelope=experimentalSafeJsonClone(turn.readerEnvelope);record.readerSnapshotId=clean(turn.readerSnapshotId,160);record.readerRefreshedAt=stamp();record.provenance={...(record.provenance||{}),readerSnapshotId:record.readerSnapshotId};}return record;}record={id:identifier('world_history'),kind:'world_history',turnId:turn.id,sequenceId:clean(turn.sequenceId,160),sceneId:clean(turn.sceneId,160),status:turn.status==='superseded'?'superseded':'active',createdAt:stamp(),narration:clean(turn.narration,24000),sceneReading:clean(turn.handoff,6000),text:clean(turn.narration,24000),timelineMessageId:clean(turn.timelineMessageId,160),sourceMessageIds:Array.isArray(turn.sourceMessageIds)?turn.sourceMessageIds.map(id=>clean(id,160)).filter(Boolean):[],readerSnapshotId:clean(turn.readerSnapshotId,160),readerEnvelope:turn.readerEnvelope?experimentalSafeJsonClone(turn.readerEnvelope):null,provenance:{source:'committed_sidecar_turn',receipt:turn.receipt?.turn_id||turn.id,readerSnapshotId:clean(turn.readerSnapshotId,160)}};memory.worldHistory.push(record);memory.worldHistory=memory.worldHistory.slice(-2000);return record;}
    /* Bring pre-Sidecar visible narration into the same source-pinned graph.
       This is deliberately an evidence import, not a retroactive receipt: it
       never invents a handoff, state update, cognition, or scene boundary.
       The imported raw turn stays active until an Episode has succeeded. */
    function backfillWorldHistory(protocol,timeline,options={}){
        const memory=graph(protocol); if(!memory||!timeline)return {added:0,skipped:0};
        const active=hierarchy(protocol,timeline); const messages=Array.isArray(timeline.history)?timeline.history:[];
        let added=0, skipped=0;
        messages.forEach((message,index)=>{
            const role=String(message?.role||'').toLowerCase();
            if(role!=='dm'&&role!=='assistant'){return;}
            // Failed or pending Sidecar processing is authored evidence, not a
            // settled memory source. Leave it pinned to its downstream retry
            // record instead of importing it into the active graph.
            const backstage = experimentalIsPlainObject(message?.sidecarBackstage) ? message.sidecarBackstage : null;
            if (backstage && backstage.status !== 'committed') { skipped++; return; }
            const narration=clean(message?.text||message?.content||'',24000); if(!narration){skipped++;return;}
            const messageId=clean(message?.id||`history_${index}`,160);
            const turnId=clean(message?.sidecarTurnId||`historical_turn_${messageId}`,180);
            if(memory.worldHistory.some(record=>record.turnId===turnId||record.timelineMessageId===messageId)){skipped++;return;}
            const user=messages.slice(0,index).reverse().find(candidate=>String(candidate?.role||'').toLowerCase()==='user');
            const sourceMessageIds=[user?.id,messageId].map(value=>clean(value,160)).filter(Boolean);
            const handoff=clean(message?.sidecarBackstage?.handoff||message?.handoff||'',6000);
            memory.worldHistory.push({id:identifier('world_history'),kind:'world_history',turnId,sequenceId:clean(active?.sequence?.id,160),sceneId:clean(active?.scene?.id,160),status:'active',createdAt:clean(message?.createdAt||message?.timestamp||stamp(),80)||stamp(),narration,sceneReading:handoff,text:narration,timelineMessageId:messageId,sourceMessageIds,provenance:{source:'sidecar_migration_history_backfill',rawSourcePinned:true,legacyMessageId:messageId,semanticHandoffAvailable:!!handoff}}); added++;
        });
        memory.worldHistory=memory.worldHistory.slice(-2000);
        memory.backfill={version:1,completedAt:stamp(),added:(Number(memory.backfill?.added)||0)+added,lastRunAdded:added,skipped:(Number(memory.backfill?.skipped)||0)+skipped};
        return {added,skipped};
    }
    function queueEpisode(protocol,options={}){const memory=graph(protocol), pending=jobs(protocol);if(!memory)return null;const active=memory.worldHistory.filter(record=>record.status==='active'),size=Math.max(1,Math.min(20,Number(options.batchSize)||5)),cadence=Math.max(1,Math.min(50,Number(options.cadenceTurns)||size)),available=active.length-memory.lastEpisodeTurnCount;if(available<(options.force?1:cadence))return null;const source=active.slice(memory.lastEpisodeTurnCount,memory.lastEpisodeTurnCount+size);if(!source.length||(!options.force&&source.length<size))return null;const ids=source.map(record=>record.turnId),previous=pending.find(job=>job.type==='episode_consolidation'&&job.status!=='completed'&&Array.isArray(job.sourceTurnIds)&&job.sourceTurnIds.join('|')===ids.join('|'));if(previous)return previous;const job={id:identifier('memory_job'),type:'episode_consolidation',status:'queued',createdAt:stamp(),attempts:0,sourceTurnIds:ids,dependencies:[],priority:options.priority||'background',sourceRange:{start:source[0].id,end:source.at(-1).id},retryAt:'',diagnostics:[],provenance:{source:options.source||'sidecar_memory_dispatcher',forced:options.force===true}};pending.push(job);return job;}
    function queueScope(protocol,scope,id,options={}){const memory=graph(protocol),pending=jobs(protocol),type=scope==='sequence'?'sequence_consolidation':'scene_consolidation',key=scope==='sequence'?'sequenceId':'sceneId';if(!memory||!id)return null;const recordField=scope==='sequence'?'sequenceIds':'sceneIds';const episodes=(memory.episodes||[]).filter(episode=>episode.status==='active'&&(episode[recordField]||[]).includes(id));const sourceTurns=[...new Set(episodes.flatMap(episode=>episode.sourceTurnIds||[]))];let job=pending.find(candidate=>candidate.type===type&&candidate[key]===id&&candidate.status!=='completed');if(job){job.episodeIds=[...new Set([...(job.episodeIds||[]),...episodes.map(episode=>episode.id)])];job.sourceTurnIds=[...new Set([...(job.sourceTurnIds||[]),...sourceTurns])];return job;}if(!episodes.length&&!options.allowEmpty)return null;job={id:identifier('memory_job'),type,status:'queued',createdAt:stamp(),attempts:0,[key]:id,episodeIds:episodes.map(episode=>episode.id),sourceTurnIds,dependencies:episodes.map(episode=>episode.jobId).filter(Boolean),priority:options.priority||'background',retryAt:'',diagnostics:[],provenance:{source:options.source||'scope_transition',sourcePinned:true}};pending.push(job);return job;}
    /* An Episode is a successful, source-pinned replacement layer.  Completing
       it is the dispatcher boundary: it creates the next work, but never
       retires its underlying Turn evidence.  Failed children stay inspectable
       and retryable rather than making a hole in continuity. */
    function completeEpisode(protocol,jobId,output={}){
        const memory=graph(protocol),pending=jobs(protocol),job=pending.find(entry=>entry.id===jobId);
        if(!memory||!job)return null;
        const records=memory.worldHistory.filter(record=>(job.sourceTurnIds||[]).includes(record.turnId));
        const sceneIds=[...new Set(records.map(record=>record.sceneId).filter(Boolean))];
        const sequenceIds=[...new Set(records.map(record=>record.sequenceId).filter(Boolean))];
        const readerCoverage = [];
        records.forEach(record => {
            const presence = record.readerEnvelope?.presence || {};
            ['active', 'nearby', 'audible'].forEach(access => {
                (Array.isArray(presence[access]) ? presence[access] : []).forEach(entry => {
                    const characterId = typeof entry === 'string' ? entry : (entry?.characterId || entry?.id || entry?.entityId || '');
                    if (!characterId || characterId === 'player') return;
                    if (!readerCoverage.some(item => item.characterId === characterId)) readerCoverage.push({ characterId, access: access === 'active' ? 'visual' : 'auditory', detail: `Reader classified this character as ${access} in turn ${record.turnId}.`, sourceTurnIds: [record.turnId] });
                });
            });
        });
        const mergedCoverage = [...(Array.isArray(output.perceptionCoverage) ? output.perceptionCoverage : [])];
        readerCoverage.forEach(item => { if (!mergedCoverage.some(existing => String(existing?.characterId || '') === item.characterId)) mergedCoverage.push(item); });
        const episode={
            id:identifier('episode'),kind:'episode',status:'active',createdAt:stamp(),jobId,
            sourceTurnIds:Array.isArray(job.sourceTurnIds)?job.sourceTurnIds:[],
            sequenceIds:sequenceIds.length?sequenceIds:(Array.isArray(output.sequenceIds)?output.sequenceIds:[]),
            sceneIds:sceneIds.length?sceneIds:(Array.isArray(output.sceneIds)?output.sceneIds:[]),
            summary:clean(output.summary,8000),objectiveHistory:clean(output.objectiveHistory,8000),
            text:clean([output.summary,output.objectiveHistory].filter(Boolean).join('\n'),12000),
            perceptionCoverage:mergedCoverage,
            locationReferences:Array.isArray(output.locationReferences)?output.locationReferences:[],
            provenance:{source:'episode_consolidation',rawSourcePinned:true,sourceJobId:job.id}
        };
        memory.episodes.push(episode);memory.episodes=memory.episodes.slice(-500);
        memory.locationReferences.push(...episode.locationReferences.map(reference=>({id:identifier('location_reference'),...reference,episodeId:episode.id,status:reference.locationId?'assigned':'unresolved',createdAt:stamp(),provenance:{sourceEpisodeId:episode.id}})));
        memory.locationReferences=memory.locationReferences.slice(-1000);
        memory.lastEpisodeTurnCount+=job.sourceTurnIds.length;
        job.status='completed';job.completedAt=stamp();job.outputId=episode.id;
        const upsert=(kind,key,collection)=>{
            let target=collection.find(record=>record[`${kind}Id`]===key&&record.status==='active');
            if(!target){target={id:identifier(kind),kind,status:'active',createdAt:stamp(),[`${kind}Id`]:key,episodeIds:[],sourceTurnIds:[],summary:'',keyFacts:'',provenance:{source:'episode_hierarchy',rawSourcePinned:true}};collection.push(target);}
            target.episodeIds=[...new Set([...(target.episodeIds||[]),episode.id])];
            target.sourceTurnIds=[...new Set([...(target.sourceTurnIds||[]),...episode.sourceTurnIds])];
            target.updatedAt=stamp();return target;
        };
        episode.sceneIds.forEach(id=>upsert('scene',id,memory.scenes));
        episode.sequenceIds.forEach(id=>upsert('sequence',id,memory.sequences));
        const queue=(type,identity)=>{
            const key=type==='scene_consolidation'?'sceneId':'sequenceId';
            let child=pending.find(candidate=>candidate.type===type&&candidate[key]===identity&&candidate.status!=='completed');
            if(child){child.episodeIds=[...new Set([...(child.episodeIds||[]),episode.id])];child.sourceTurnIds=[...new Set([...(child.sourceTurnIds||[]),...episode.sourceTurnIds])];return child;}
            child={id:identifier('memory_job'),type,status:'queued',createdAt:stamp(),attempts:0,[key]:identity,episodeIds:[episode.id],sourceTurnIds:episode.sourceTurnIds.slice(),dependencies:[job.id],priority:'background',retryAt:'',diagnostics:[],provenance:{source:'episode_hierarchy',sourceEpisodeId:episode.id}};pending.push(child);return child;
        };
        // A scene/sequence record may collect several Episodes while it is
        // live, but it is only a replacement layer once that dramatic scope
        // has actually closed.  Summarising an open scope and then removing
        // its raw context is how information gets silently lost mid-scene.
        // The closure transition is therefore the dispatcher boundary for
        // Scene and Sequence consolidation; the source Episodes remain
        // pinned either way.
        episode.sceneIds.forEach(id=>{ if((protocol.scenes||[]).some(scene=>scene.id===id&&scene.status==='closed')) queue('scene_consolidation',id); });
        episode.sequenceIds.forEach(id=>{ if((protocol.sequences||[]).some(sequence=>sequence.id===id&&sequence.status==='closed')) queue('sequence_consolidation',id); });
        episode.perceptionCoverage.forEach(coverage=>{
            const characterId=clean(coverage?.characterId,160),access=clean(coverage?.access,80).toLowerCase();
            if(!characterId||access==='absent')return;
            // A settled turn-scoped cognition assessment already supplied the
            // live ScenePulse impression for this subject/source. Episode work
            // consolidates that evidence later; it must not mint a parallel
            // second cognition pass for the same beat merely because the
            // Episode cadence was reached.
            const alreadyHasTurnCognition = pending.some(candidate=>candidate.type==='turn_cognition'&&candidate.characterId===characterId&&candidate.status==='completed'&&(candidate.sourceTurnIds||[]).some(turnId=>(episode.sourceTurnIds||[]).includes(turnId)));
            if(alreadyHasTurnCognition)return;
            if(pending.some(candidate=>candidate.type==='cognition_consolidation'&&candidate.episodeId===episode.id&&candidate.characterId===characterId))return;
            pending.push({id:identifier('memory_job'),type:'cognition_consolidation',status:'queued',createdAt:stamp(),attempts:0,episodeId:episode.id,characterId,access,perceptionEvidence:clean(coverage?.detail,2400),dependencies:[job.id],priority:'background',retryAt:'',diagnostics:[],provenance:{source:'episode_perception_coverage',sourceEpisodeId:episode.id}});
        });
        return episode;
    }
    function failJob(protocol,jobId,error){const job=jobs(protocol).find(entry=>entry.id===jobId);if(!job)return null;job.attempts=(Number(job.attempts)||0)+1;job.diagnostics=[...(job.diagnostics||[]),{at:stamp(),error:clean(error,1200)}].slice(-12);if(job.attempts>=3)job.status='blocked';else{job.status='queued';job.retryAt=new Date(Date.now()+Math.min(300000,1000*(2**job.attempts))).toISOString();}return job;}
    global.ExperimentalWorldsSidecarMode=Object.freeze({SCHEMA_VERSION:1,MODES:Object.freeze({INLINE_LEGACY:'inline_legacy',SIDECAR:'sidecar'}),normalizeMode:mode,normalizeWorldConfig:worldConfig,normalizeTimelineProtocol:timelineProtocol,isSidecarTimeline:(world,timeline)=>timelineProtocol(world,timeline)?.mode==='sidecar'});
    global.ExperimentalWorldsSidecarReader=Object.freeze({SCHEMA_VERSION:READER_PROFILE_SCHEMA_VERSION,normalizeProfile:normalizeReaderProfile});
    global.ExperimentalWorldsSidecarTimeline=Object.freeze({ensureHierarchy:hierarchy,beginPlanning,approvePlanning,closeActiveSequence:closeSequence,recordTurn:recordTimelineTurn,contextPressure:pressure});
    global.ExperimentalWorldsSidecarPromotion=Object.freeze({ensure:protocol=>protocol,stage,stageReceiptIntroductions:stageIntroductions,markPromotionRequested:promotionFlag,markPromoted:promoted});
    global.ExperimentalWorldsSidecarTraversal=Object.freeze({normalizeWorldTraversal:normalizeTraversal,normalizeVehicle,accessibleVehicles:(world,id)=>(world?.entities||[]).filter(entity=>String(entity?.type||'').toLowerCase()==='vehicle'&&(normalizeVehicle(entity)?.ownerEntityId===clean(id,160)||normalizeVehicle(entity)?.access.some(entry=>entry.entityId===clean(id,160)))),resolveEligibleAnchor:anchor,evaluateCoverage:coverage,ensureState:traversalState,createJourney,reconcileVehicleEvents});
    global.ExperimentalWorldsSidecarMemoryGraph=Object.freeze({graph,ensureJobs:jobs,recordTurn:recordMemoryTurn,backfillWorldHistory,queueEpisode,queueScope,completeEpisode,failJob});
    global.ExperimentalWorldsSidecarHooks=Object.freeze({normalizeWorldTimeline:(world,timeline,options={})=>{const protocol=timelineProtocol(world,timeline,options);normalizeTraversal(world);(world?.entities||[]).forEach(normalizeVehicle);return protocol;},isSidecarWorld:(world,timeline)=>timelineProtocol(world,timeline)?.mode==='sidecar',ensureNarrativeHierarchy:(world,timeline)=>{const protocol=timelineProtocol(world,timeline);return protocol?.mode==='sidecar'?hierarchy(protocol,timeline):null;},activeReaderCandidates:(protocol,options={})=>activeReaderCandidates(protocol,options),normalizeReaderCandidate:(raw,defaults={})=>normalizeReaderCandidate(raw,defaults),mergeReaderCandidates:(protocol,raw,defaults={})=>mergeReaderCandidates(protocol,raw,defaults)});
})(window);
