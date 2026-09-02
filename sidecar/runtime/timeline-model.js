(function initHordeSidecarTimeline(global) {
    'use strict';

    const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
    const clean = (value, max = 240) => String(value || '').trim().slice(0, max);
    const now = () => new Date().toISOString();
    const id = (kind, suffix = '') => `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}${suffix ? `_${suffix}` : ''}`;

    function playerEntityId(timeline) {
        return clean(timeline?.controlledEntityId || timeline?.playerEntityId || 'player', 120) || 'player';
    }

    function current(protocol, key, value) {
        const found = (protocol[key] || []).find(item => item?.id === value);
        return found || null;
    }

    function createScene(protocol, options = {}) {
        const scene = {
            id: id('scene'),
            timelineId: clean(options.timelineId, 120),
            sequenceIds: Array.isArray(options.sequenceIds) ? options.sequenceIds.map(value => clean(value, 120)).filter(Boolean) : [],
            status: options.status === 'closed' ? 'closed' : 'active',
            title: clean(options.title || 'Current scene', 180) || 'Current scene',
            mode: options.mode === 'discontinuous' ? 'discontinuous' : 'continuous',
            openedAt: now(),
            closedAt: '',
            startTurnId: clean(options.startTurnId, 160),
            endTurnId: '',
            source: clean(options.source || 'sidecar', 80),
            boundaryEvidence: clean(options.boundaryEvidence, 2000),
            continuation: isObject(options.continuation) ? options.continuation : {},
            provisionalReview: { status: 'pending', reviewedAt: '' }
        };
        protocol.scenes.push(scene);
        protocol.activeSceneId = scene.id;
        return scene;
    }

    function createSequence(protocol, timeline, options = {}) {
        const active = current(protocol, 'sequences', protocol.activeSequenceId);
        if (active?.status === 'active') {
            active.status = 'closed';
            active.closedAt = now();
            active.closeReason = clean(options.closePreviousReason || 'new_sequence', 160);
        }
        const sequence = {
            id: id('sequence'),
            timelineId: clean(timeline?.id, 120),
            status: options.status === 'planning' ? 'planning' : 'active',
            title: clean(options.title || `Sequence ${(protocol.sequences || []).length + 1}`, 180) || 'Untitled sequence',
            controlledEntityId: clean(options.controlledEntityId || playerEntityId(timeline), 120),
            createdAt: now(),
            startedAt: options.status === 'planning' ? '' : now(),
            closedAt: '',
            startTurnId: clean(options.startTurnId, 160),
            endTurnId: '',
            predecessorSequenceId: clean(options.predecessorSequenceId || active?.id, 120),
            transitionMode: options.transitionMode === 'discontinuous' ? 'discontinuous' : 'continuous',
            planning: isObject(options.planning) ? options.planning : { status: options.status === 'planning' ? 'draft' : 'approved', authorIntent: '' },
            continuationTail: Array.isArray(options.continuationTail) ? options.continuationTail.slice(-6) : [],
            closure: null,
            provenance: { source: clean(options.source || 'sidecar', 80), createdAt: now() }
        };
        protocol.sequences.push(sequence);
        protocol.activeSequenceId = sequence.id;
        return sequence;
    }

    function ensureHierarchy(protocol, timeline, options = {}) {
        if (!protocol || !timeline) return null;
        if (!Array.isArray(protocol.sequences)) protocol.sequences = [];
        if (!Array.isArray(protocol.scenes)) protocol.scenes = [];
        if (!Array.isArray(protocol.turns)) protocol.turns = [];
        let sequence = current(protocol, 'sequences', protocol.activeSequenceId);
        if (!sequence || sequence.status === 'closed') {
            if (protocol.sequences.length && options.createWhenMissing !== true) return null;
            sequence = createSequence(protocol, timeline, {
                title: protocol.sequences.length ? `Sequence ${protocol.sequences.length + 1}` : 'Opening sequence',
                controlledEntityId: playerEntityId(timeline),
                source: 'migration'
            });
        }
        let scene = current(protocol, 'scenes', protocol.activeSceneId);
        if (!scene || scene.status === 'closed') {
            if (protocol.scenes.length && options.createWhenMissing !== true) return null;
            scene = createScene(protocol, {
                timelineId: timeline.id,
                sequenceIds: [sequence.id],
                title: protocol.scenes.length ? 'Current scene' : 'Opening scene',
                source: 'migration'
            });
        }
        if (!Array.isArray(scene.sequenceIds)) scene.sequenceIds = [];
        if (!scene.sequenceIds.includes(sequence.id)) scene.sequenceIds.push(sequence.id);
        protocol.activeSequenceId = sequence.id;
        protocol.activeSceneId = scene.id;
        return { sequence, scene };
    }

    function beginPlanning(protocol, timeline, authorIntent = '') {
        const hierarchy = ensureHierarchy(protocol, timeline);
        const predecessor = hierarchy?.sequence || null;
        const intent = clean(authorIntent, 4000);
        const planning = {
            id: id('sequence_plan'),
            status: 'draft',
            authorIntent: intent,
            createdAt: now(),
            predecessorSequenceId: predecessor?.id || '',
            constraints: [],
            openQuestions: (protocol.questions || []).filter(question => question.status === 'open').map(question => question.id).slice(-20),
            proposedStartPacket: null,
            revisionCount: 0,
            provenance: { source: 'direct_user_refinement' }
        };
        protocol.sequencePlanning = planning;
        return planning;
    }

    function approvePlanning(protocol, timeline, packet = {}, options = {}) {
        const planning = isObject(protocol?.sequencePlanning) ? protocol.sequencePlanning : null;
        if (!planning) return null;
        const previous = ensureHierarchy(protocol, timeline);
        const priorScene = previous?.scene;
        if (priorScene?.status === 'active' && options.closePriorScene === true) {
            priorScene.status = 'closed';
            priorScene.closedAt = now();
            priorScene.provisionalReview = { status: 'pending', reviewedAt: '' };
        }
        const priorTurns = (protocol.turns || []).filter(turn => turn.sequenceId === previous?.sequence?.id).slice(-4)
            .map(turn => ({ id: turn.id, narration: clean(turn.narration, 1200) }));
        const sequence = createSequence(protocol, timeline, {
            title: options.title || packet.title || 'New sequence',
            controlledEntityId: options.controlledEntityId || previous?.sequence?.controlledEntityId || playerEntityId(timeline),
            transitionMode: options.transitionMode || packet.transitionMode || 'continuous',
            planning: { ...planning, status: 'approved', approvedAt: now(), proposedStartPacket: packet },
            continuationTail: options.transitionMode === 'discontinuous' ? [] : priorTurns,
            source: 'direct_user_refinement'
        });
        const scene = createScene(protocol, {
            timelineId: timeline.id,
            sequenceIds: [sequence.id],
            title: packet.sceneTitle || packet.title || (sequence.transitionMode === 'continuous' ? 'Continuing scene' : 'New scene'),
            mode: sequence.transitionMode,
            continuation: packet,
            source: 'direct_user_refinement'
        });
        protocol.sequencePlanning = { ...planning, status: 'approved', approvedAt: now(), sequenceId: sequence.id, sceneId: scene.id };
        return { sequence, scene, planning: protocol.sequencePlanning };
    }

    function closeActiveSequence(protocol, timeline, reason = 'author_closed') {
        const hierarchy = ensureHierarchy(protocol, timeline);
        if (!hierarchy) return null;
        const { sequence, scene } = hierarchy;
        sequence.status = 'closed';
        sequence.closedAt = now();
        sequence.closeReason = clean(reason, 240);
        sequence.endTurnId = (protocol.turns || []).filter(turn => turn.sequenceId === sequence.id).slice(-1)[0]?.id || '';
        sequence.closure = {
            closedAt: sequence.closedAt,
            unresolvedQuestionIds: (protocol.questions || []).filter(question => question.status === 'open').map(question => question.id).slice(-40),
            provisionalLocationIds: (protocol.provisionalLocations || []).filter(location => location.status !== 'resolved').map(location => location.id).slice(-40),
            provisionalEntityIds: (protocol.provisionalEntities || []).filter(entity => entity.status !== 'resolved').map(entity => entity.id).slice(-40),
            status: 'reconciliation_pending'
        };
        if (scene.status === 'active') {
            scene.status = 'closed';
            scene.closedAt = now();
            scene.endTurnId = sequence.endTurnId;
            scene.provisionalReview = { status: 'pending', reviewedAt: '' };
        }
        protocol.activeSequenceId = '';
        protocol.activeSceneId = '';
        return sequence;
    }

    function recordTurn(protocol, timeline, turn) {
        const hierarchy = ensureHierarchy(protocol, timeline);
        if (!hierarchy || !turn) return turn;
        turn.sequenceId = hierarchy.sequence.id;
        turn.sceneId = hierarchy.scene.id;
        turn.controlledEntityId = hierarchy.sequence.controlledEntityId;
        hierarchy.sequence.endTurnId = turn.id;
        hierarchy.scene.endTurnId = turn.id;
        return turn;
    }

    function contextPressure(protocol, timeline, options = {}) {
        const historyCount = Math.max(0, Number(options.historyCount) || 0);
        const contextRatio = Math.max(0, Math.min(1, Number(options.contextRatio) || 0));
        const activeScene = current(protocol, 'scenes', protocol.activeSceneId);
        const sceneTurns = (protocol.turns || []).filter(turn => turn.sceneId === activeScene?.id).length;
        const openQuestions = (protocol.questions || []).filter(question => question.status === 'open').length;
        const score = Math.min(100, Math.round(contextRatio * 45 + Math.min(25, sceneTurns * 2) + Math.min(16, openQuestions * 2) + Math.min(14, historyCount / 12)));
        return {
            score,
            recommendation: score >= 70 ? 'recommend_refresh' : score >= 45 ? 'watch' : 'clear',
            factors: { contextRatio, sceneTurns, openQuestions, historyCount },
            generatedAt: now()
        };
    }

    global.HordeSidecarTimeline = Object.freeze({
        ensureHierarchy,
        beginPlanning,
        approvePlanning,
        closeActiveSequence,
        recordTurn,
        contextPressure
    });
})(window);
