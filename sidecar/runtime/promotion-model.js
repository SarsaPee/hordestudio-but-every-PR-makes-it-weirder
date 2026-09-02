(function initHordeSidecarPromotion(global) {
    'use strict';

    const clean = (value, max = 600) => String(value || '').trim().slice(0, max);
    const now = () => new Date().toISOString();
    const id = kind => `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const key = value => clean(value, 160).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

    function ensure(protocol) {
        if (!protocol) return null;
        if (!Array.isArray(protocol.provisionalLocations)) protocol.provisionalLocations = [];
        if (!Array.isArray(protocol.provisionalEntities)) protocol.provisionalEntities = [];
        return protocol;
    }

    function findOpen(records, name) {
        const target = key(name);
        return records.find(record => record.status !== 'promoted' && key(record.name) === target) || null;
    }

    function stage(protocol, kind, raw, evidence = {}) {
        ensure(protocol);
        const records = kind === 'location' ? protocol.provisionalLocations : protocol.provisionalEntities;
        const name = clean(raw?.name, 180);
        if (!name) return null;
        const existing = findOpen(records, name);
        const entry = existing || {
            id: id(kind === 'location' ? 'provisional_location' : 'provisional_entity'),
            kind,
            name,
            status: 'implicit',
            createdAt: now(),
            updatedAt: now(),
            evidence: [],
            candidateCanonicalIds: [],
            promotionRequested: false,
            promotedCanonicalId: ''
        };
        const evidenceRecord = {
            at: now(),
            source: clean(evidence.source || 'narrator_handoff', 80),
            turnId: clean(evidence.turnId, 160),
            narration: clean(evidence.narration, 3000),
            handoff: clean(evidence.handoff, 3000),
            proposed: raw
        };
        entry.evidence.push(evidenceRecord);
        entry.evidence = entry.evidence.slice(-20);
        entry.updatedAt = evidenceRecord.at;
        entry.description = clean(raw.description, 1800) || entry.description || '';
        entry.parentHint = clean(raw.parent_location_id || raw.connects_to || raw.home_location, 180) || entry.parentHint || '';
        if (kind === 'location') {
            entry.region = clean(raw.region, 180) || entry.region || '';
            entry.mapType = clean(raw.map_type, 40) || entry.mapType || '';
            entry.floor = clean(raw.floor, 80) || entry.floor || '';
        } else {
            entry.persona = clean(raw.persona, 1800) || entry.persona || '';
        }
        if (!existing) records.push(entry);
        return entry;
    }

    // Normal Sidecar turns may recognise an implied noun, but must never make
    // it canonical merely because the Narrator named it. Remove the legacy
    // eager-creation fields before the native reducer sees them and retain the
    // original evidence for explicit later promotion.
    function stageReceiptIntroductions(protocol, receipt, evidence = {}) {
        if (!protocol || !receipt || typeof receipt !== 'object') return [];
        const staged = [];
        if (Array.isArray(receipt.location_introduced)) {
            receipt.location_introduced.forEach(raw => {
                const entry = stage(protocol, 'location', raw, evidence);
                if (entry) staged.push(entry);
            });
            delete receipt.location_introduced;
        }
        if (Array.isArray(receipt.npc_introduced)) {
            receipt.npc_introduced.forEach(raw => {
                const entry = stage(protocol, 'entity', raw, evidence);
                if (entry) staged.push(entry);
            });
            delete receipt.npc_introduced;
        }
        return staged;
    }

    function markPromotionRequested(protocol, provisionalId, source = 'direct_user_refinement') {
        ensure(protocol);
        const record = [...protocol.provisionalLocations, ...protocol.provisionalEntities]
            .find(entry => entry.id === provisionalId);
        if (!record) return null;
        record.promotionRequested = true;
        record.promotionRequestedAt = now();
        record.promotionProvenance = { source };
        record.status = 'promotion_requested';
        return record;
    }

    function markPromoted(protocol, provisionalId, canonicalId) {
        ensure(protocol);
        const record = [...protocol.provisionalLocations, ...protocol.provisionalEntities]
            .find(entry => entry.id === provisionalId);
        if (!record) return null;
        record.status = 'promoted';
        record.promotedCanonicalId = clean(canonicalId, 160);
        record.promotedAt = now();
        return record;
    }

    global.HordeSidecarPromotion = Object.freeze({
        ensure,
        stage,
        stageReceiptIntroductions,
        markPromotionRequested,
        markPromoted
    });
})(window);
