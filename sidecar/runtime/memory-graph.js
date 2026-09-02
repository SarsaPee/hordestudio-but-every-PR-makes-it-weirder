(function initHordeSidecarMemoryGraph(global) {
    'use strict';

    const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
    const clean = (value, max = 4000) => String(value || '').trim().slice(0, max);
    const now = () => new Date().toISOString();
    const id = kind => `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

    function graph(protocol) {
        if (!protocol) return null;
        const current = isObject(protocol.memoryGraph) ? protocol.memoryGraph : {};
        protocol.memoryGraph = {
            schemaVersion: 1,
            worldHistory: Array.isArray(current.worldHistory) ? current.worldHistory : [],
            episodes: Array.isArray(current.episodes) ? current.episodes : [],
            scenes: Array.isArray(current.scenes) ? current.scenes : [],
            sequences: Array.isArray(current.sequences) ? current.sequences : [],
            cognition: Array.isArray(current.cognition) ? current.cognition : [],
            locationReferences: Array.isArray(current.locationReferences) ? current.locationReferences : [],
            lastEpisodeTurnCount: Math.max(0, Number(current.lastEpisodeTurnCount) || 0),
            ...current
        };
        return protocol.memoryGraph;
    }

    function ensureJobs(protocol) {
        if (!protocol) return [];
        if (!Array.isArray(protocol.jobs)) protocol.jobs = [];
        return protocol.jobs;
    }

    function recordTurn(protocol, turn) {
        const memory = graph(protocol);
        if (!memory || !turn?.id) return null;
        const existing = memory.worldHistory.find(record => record.turnId === turn.id);
        if (existing) return existing;
        const record = {
            id: id('world_history'), kind: 'world_history', turnId: turn.id,
            sequenceId: clean(turn.sequenceId, 160), sceneId: clean(turn.sceneId, 160),
            status: turn.status === 'superseded' ? 'superseded' : 'active', createdAt: now(),
            narration: clean(turn.narration, 24000), sceneReading: clean(turn.handoff, 6000),
            provenance: { source: 'committed_sidecar_turn', receipt: turn.receipt?.turn_id || turn.id }
        };
        memory.worldHistory.push(record);
        memory.worldHistory = memory.worldHistory.slice(-2000);
        return record;
    }

    function queueEpisode(protocol, options = {}) {
        const memory = graph(protocol);
        const jobs = ensureJobs(protocol);
        if (!memory) return null;
        const active = memory.worldHistory.filter(record => record.status === 'active');
        const batchSize = Math.max(1, Math.min(20, Number(options.batchSize) || 5));
        const pending = active.slice(memory.lastEpisodeTurnCount, memory.lastEpisodeTurnCount + batchSize);
        if (pending.length < batchSize) return null;
        const sourceTurnIds = pending.map(record => record.turnId);
        const prior = jobs.find(job => job.type === 'episode_consolidation' && job.status !== 'completed'
            && Array.isArray(job.sourceTurnIds) && job.sourceTurnIds.join('|') === sourceTurnIds.join('|'));
        if (prior) return prior;
        const job = {
            id: id('memory_job'), type: 'episode_consolidation', status: 'queued', createdAt: now(), attempts: 0,
            sourceTurnIds, dependencies: [], priority: 'background', sourceRange: { start: pending[0].id, end: pending[pending.length - 1].id },
            retryAt: '', diagnostics: [], provenance: { source: 'sidecar_memory_dispatcher' }
        };
        jobs.push(job);
        return job;
    }

    function completeEpisode(protocol, jobId, output = {}) {
        const memory = graph(protocol);
        const jobs = ensureJobs(protocol);
        const job = jobs.find(entry => entry.id === jobId);
        if (!memory || !job) return null;
        const episode = {
            id: id('episode'), kind: 'episode', status: 'active', createdAt: now(), jobId,
            sourceTurnIds: Array.isArray(job.sourceTurnIds) ? job.sourceTurnIds : [],
            sequenceIds: Array.isArray(output.sequenceIds) ? output.sequenceIds : [],
            sceneIds: Array.isArray(output.sceneIds) ? output.sceneIds : [],
            summary: clean(output.summary, 8000), objectiveHistory: clean(output.objectiveHistory, 8000),
            perceptionCoverage: Array.isArray(output.perceptionCoverage) ? output.perceptionCoverage : [],
            locationReferences: Array.isArray(output.locationReferences) ? output.locationReferences : [],
            provenance: { source: 'episode_consolidation', rawSourcePinned: true }
        };
        memory.episodes.push(episode);
        memory.episodes = memory.episodes.slice(-500);
        memory.locationReferences.push(...episode.locationReferences.map(reference => ({
            id: id('location_reference'), ...reference, episodeId: episode.id, status: reference.locationId ? 'assigned' : 'unresolved', createdAt: now()
        })));
        memory.locationReferences = memory.locationReferences.slice(-1000);
        memory.lastEpisodeTurnCount += job.sourceTurnIds.length;
        job.status = 'completed'; job.completedAt = now(); job.outputId = episode.id;
        episode.perceptionCoverage.forEach(coverage => {
            const characterId = clean(coverage?.characterId, 160);
            const access = clean(coverage?.access, 80).toLowerCase();
            if (!characterId || access === 'absent') return;
            const duplicate = jobs.find(entry => entry.type === 'cognition_consolidation'
                && entry.episodeId === episode.id && entry.characterId === characterId);
            if (duplicate) return;
            jobs.push({
                id: id('memory_job'), type: 'cognition_consolidation', status: 'queued', createdAt: now(), attempts: 0,
                episodeId: episode.id, characterId, access, dependencies: [job.id], priority: 'background', retryAt: '', diagnostics: [],
                provenance: { source: 'episode_perception_coverage' }
            });
        });
        return episode;
    }

    function failJob(protocol, jobId, error) {
        const job = ensureJobs(protocol).find(entry => entry.id === jobId);
        if (!job) return null;
        job.attempts = (Number(job.attempts) || 0) + 1;
        job.diagnostics = [...(job.diagnostics || []), { at: now(), error: clean(error, 1200) }].slice(-12);
        if (job.attempts >= 3) {
            job.status = 'blocked';
        } else {
            job.status = 'queued';
            job.retryAt = new Date(Date.now() + Math.min(300000, 1000 * (2 ** job.attempts))).toISOString();
        }
        return job;
    }

    global.HordeSidecarMemoryGraph = Object.freeze({ graph, ensureJobs, recordTurn, queueEpisode, completeEpisode, failJob });
})(window);
