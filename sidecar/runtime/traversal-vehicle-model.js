(function initHordeSidecarTraversal(global) {
    'use strict';

    const clean = (value, max = 180) => String(value || '').trim().slice(0, max);
    const now = () => new Date().toISOString();
    const id = kind => `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
    const METHOD_TYPES = new Set(['point_to_point', 'route_based']);

    function normalizeWorldTraversal(world) {
        if (!isObject(world)) return null;
        const source = isObject(world.traversalConfig) ? world.traversalConfig : {};
        const methods = Array.isArray(source.methods) ? source.methods : [];
        world.traversalConfig = {
            schemaVersion: 1,
            methods: methods.map((raw, index) => {
                const type = METHOD_TYPES.has(raw?.coverageType) ? raw.coverageType : 'point_to_point';
                return {
                    id: clean(raw?.id || `traversal_${index + 1}`, 100) || `traversal_${index + 1}`,
                    name: clean(raw?.name || `Traversal ${index + 1}`, 140) || `Traversal ${index + 1}`,
                    enabled: raw?.enabled !== false,
                    coverageType: type,
                    exclusions: Array.isArray(raw?.exclusions) ? raw.exclusions.map(value => clean(value, 160)).filter(Boolean).slice(0, 100) : [],
                    routeStops: type === 'route_based' && Array.isArray(raw?.routeStops)
                        ? raw.routeStops.map(value => clean(value, 160)).filter(Boolean).slice(0, 500) : [],
                    tags: Array.isArray(raw?.tags) ? raw.tags.map(value => clean(value, 80)).filter(Boolean).slice(0, 32) : [],
                    provider: clean(raw?.provider, 140),
                    notes: clean(raw?.notes, 1200)
                };
            })
        };
        return world.traversalConfig;
    }

    function normalizeVehicle(entity) {
        if (!isObject(entity) || String(entity.type || '').toLowerCase() !== 'vehicle') return null;
        const raw = isObject(entity.vehicle) ? entity.vehicle : {};
        entity.vehicle = {
        persistent: raw.persistent !== false,
        parkedAnchorId: clean(raw.parkedAnchorId || entity.startLocation, 160),
            ownerEntityId: clean(raw.ownerEntityId || raw.owners?.[0]?.entityId || raw.owners?.[0], 160),
            owners: Array.isArray(raw.owners) ? raw.owners.map(entry => ({
                entityId: clean(entry?.entityId || entry, 160),
                role: 'owner'
            })).filter(entry => entry.entityId).slice(0, 20) : [],
            access: Array.isArray(raw.access) ? raw.access.map(entry => ({
                entityId: clean(entry?.entityId, 160), role: ['owner', 'driver', 'passenger', 'guest'].includes(entry?.role) ? entry.role : 'guest'
            })).filter(entry => entry.entityId).slice(0, 80) : [],
            interiorHint: clean(raw.interiorHint || entity.description, 1800),
            tags: Array.isArray(raw.tags) ? raw.tags.map(value => clean(value, 80)).filter(Boolean).slice(0, 32) : []
        };
        if (entity.vehicle.ownerEntityId && !entity.vehicle.owners.some(entry => entry.entityId === entity.vehicle.ownerEntityId)) {
            entity.vehicle.owners.unshift({ entityId: entity.vehicle.ownerEntityId, role: 'owner' });
        }
        return entity.vehicle;
    }

    function accessibleVehicles(world, entityId) {
        const actor = clean(entityId, 160);
        return (world?.entities || []).filter(entity => {
            if (String(entity?.type || '').toLowerCase() !== 'vehicle') return false;
            const vehicle = normalizeVehicle(entity);
            return vehicle?.ownerEntityId === actor || vehicle?.access.some(entry => entry.entityId === actor);
        });
    }

    function resolveLocation(world, reference) {
        const needle = clean(reference, 180).toLowerCase();
        return (world?.locations || []).find(location => String(location?.id || '').toLowerCase() === needle
            || String(location?.name || '').trim().toLowerCase() === needle) || null;
    }

    function resolveEligibleAnchor(world, reference) {
        let location = resolveLocation(world, reference);
        const seen = new Set();
        while (location && !seen.has(location.id)) {
            seen.add(location.id);
            // Vehicles do not enter arbitrary private rooms/floors. A building,
            // street/path, area, region or transit space is a stable pickup anchor.
            if (!['room'].includes(String(location.mapType || '').toLowerCase())) return location;
            location = resolveLocation(world, location.parentLocationId);
        }
        return null;
    }

    function evaluateCoverage(world, methodId, originRef, destinationRef) {
        const config = normalizeWorldTraversal(world);
        const method = config?.methods.find(entry => entry.id === methodId && entry.enabled);
        if (!method) return { ok: false, reason: 'unknown_or_disabled_method' };
        const origin = resolveEligibleAnchor(world, originRef);
        const destination = resolveEligibleAnchor(world, destinationRef);
        if (!origin || !destination) return { ok: false, reason: 'no_eligible_pickup_or_dropoff', origin, destination, method };
        const exclusions = new Set(method.exclusions.map(value => value.toLowerCase()));
        if (exclusions.has(origin.id.toLowerCase()) || exclusions.has(destination.id.toLowerCase())) {
            return { ok: false, reason: 'method_exclusion', origin, destination, method };
        }
        if (method.coverageType === 'route_based') {
            const stops = method.routeStops;
            const from = stops.indexOf(origin.id) >= 0 ? stops.indexOf(origin.id) : stops.indexOf(origin.name);
            const to = stops.indexOf(destination.id) >= 0 ? stops.indexOf(destination.id) : stops.indexOf(destination.name);
            if (from < 0 || to < 0 || from === to) return { ok: false, reason: 'route_stop_not_authored', origin, destination, method };
            return { ok: true, origin, destination, method, route: stops.slice(Math.min(from, to), Math.max(from, to) + 1) };
        }
        return { ok: true, origin, destination, method, route: [] };
    }

    function ensureState(protocol) {
        if (!protocol) return null;
        if (!isObject(protocol.traversalState)) protocol.traversalState = {};
        const state = protocol.traversalState;
        if (!Array.isArray(state.journeys)) state.journeys = [];
        if (!Array.isArray(state.recentRuntimeContainers)) state.recentRuntimeContainers = [];
        return state;
    }

    function createJourney(protocol, world, options = {}) {
        const state = ensureState(protocol);
        if (!state) return null;
        const coverage = options.methodId ? evaluateCoverage(world, options.methodId, options.originId, options.destinationId) : null;
        if (coverage && !coverage.ok) return { error: coverage.reason, coverage };
        const vehicle = options.vehicleId ? (world.entities || []).find(entity => entity.id === options.vehicleId && entity.type === 'vehicle') : null;
        const runtime = vehicle ? null : {
            id: id('runtime_vehicle'), kind: clean(options.runtimeKind || 'rideshare', 80) || 'rideshare',
            createdAt: now(), interiorHint: clean(options.interiorHint, 1800), persistent: false
        };
        const journey = {
            id: id('journey'), status: 'prepared', createdAt: now(), updatedAt: now(),
            methodId: clean(options.methodId, 120), vehicleEntityId: vehicle?.id || '', runtimeContainer: runtime,
            originAnchorId: coverage?.origin?.id || clean(options.originId, 160),
            destinationAnchorId: coverage?.destination?.id || clean(options.destinationId, 160),
            occupants: Array.isArray(options.occupants) ? options.occupants.map(value => clean(value, 160)).filter(Boolean).slice(0, 20) : [],
            provenance: { source: clean(options.source || 'sidecar', 80), evidence: clean(options.evidence, 2000) },
            temporalEvidence: clean(options.temporalEvidence, 1200)
        };
        state.journeys.push(journey);
        state.journeys = state.journeys.slice(-80);
        return journey;
    }

    function reconcileVehicleEvents(protocol, world, receipt, options = {}) {
        const state = ensureState(protocol);
        if (!state) return [];
        const changes = [];
        (receipt?.events || []).forEach(event => {
            if (event?.type !== 'movement' || event?.movement_mode !== 'vehicle') return;
            const actorId = clean(event.actor_id, 160);
            const vehicleId = clean(event.vehicle_id || event.vehicleId, 160);
            const status = clean(event.status, 40) || 'completed';
            if (['intended', 'attempted', 'in_progress'].includes(status)) {
                const existing = state.journeys.find(journey => journey.status !== 'completed' && journey.occupants.includes(actorId)
                    && (vehicleId ? journey.vehicleEntityId === vehicleId : true));
                if (!existing) {
                    const journey = createJourney(protocol, world, {
                        vehicleId, originId: event.from_location_id || options.playerLocationId,
                        destinationId: event.to_location_id || '', occupants: [actorId], source: 'narrator_handoff',
                        evidence: event.evidence || event.cause || '', runtimeKind: vehicleId ? '' : 'rideshare'
                    });
                    if (journey?.id) changes.push({ type: 'journey_prepared', journeyId: journey.id });
                }
                return;
            }
            if (status !== 'completed') return;
            const journey = [...state.journeys].reverse().find(item => item.status !== 'completed' && item.occupants.includes(actorId)
                && (vehicleId ? item.vehicleEntityId === vehicleId : true));
            if (!journey) return;
            journey.status = 'completed';
            journey.completedAt = now();
            journey.destinationAnchorId = clean(event.to_location_id || journey.destinationAnchorId, 160);
            if (journey.vehicleEntityId) {
                const vehicle = (world.entities || []).find(entity => entity.id === journey.vehicleEntityId);
                const data = normalizeVehicle(vehicle);
                if (data) data.parkedAnchorId = journey.destinationAnchorId || data.parkedAnchorId;
            } else if (journey.runtimeContainer) {
                state.recentRuntimeContainers.push({ ...journey.runtimeContainer, departedAt: now(), journeyId: journey.id });
                state.recentRuntimeContainers = state.recentRuntimeContainers.slice(-20);
            }
            changes.push({ type: 'journey_completed', journeyId: journey.id });
        });
        return changes;
    }

    global.HordeSidecarTraversal = Object.freeze({
        normalizeWorldTraversal,
        normalizeVehicle,
        accessibleVehicles,
        resolveEligibleAnchor,
        evaluateCoverage,
        ensureState,
        createJourney,
        reconcileVehicleEvents
    });
})(window);
