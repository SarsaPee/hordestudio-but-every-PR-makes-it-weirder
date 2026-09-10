function normalizeWorldTurnReceipt(world, sess, rawReceipt) {
    const source = experimentalIsPlainObject(rawReceipt?.receipt) ? rawReceipt.receipt
        : experimentalIsPlainObject(rawReceipt) ? rawReceipt : {};
    const sceneSource = experimentalIsPlainObject(source.scene) ? source.scene : {};
    const stateUpdates = experimentalIsPlainObject(source.state_updates) ? { ...source.state_updates } : {};
    // Older providers may still return the established state fields at the
    // receipt root. Preserve those as proposals, but movement is validated
    // through actor-scoped events below and never trusted as a naked field.
    ENGINE_STATE_KEYS.forEach(key => {
        if (key !== 'location_id' && source[key] !== undefined && stateUpdates[key] === undefined) {
            stateUpdates[key] = source[key];
        }
    });
    return {
        version: 1,
        turn_id: String(source.turn_id || `turn_${Math.max(1, parseInt(sess.turnCount) || 1)}`).slice(0, 100),
        summary: String(source.summary || source.turn_summary || '').slice(0, 300),
        scene: {
            player_location_id: String(sceneSource.player_location_id || sceneSource.location_id || '').slice(0, 120),
            player_location_changed: sceneSource.player_location_changed === true,
            present_character_ids: (Array.isArray(sceneSource.present_character_ids)
                ? sceneSource.present_character_ids : []).map(id => String(id || '').slice(0, 120)).filter(Boolean).slice(0, 80),
            nearby_character_ids: (Array.isArray(sceneSource.nearby_character_ids)
                ? sceneSource.nearby_character_ids : []).map(id => String(id || '').slice(0, 120)).filter(Boolean).slice(0, 80),
            nearby_character_context: experimentalIsPlainObject(sceneSource.nearby_character_context)
                ? Object.fromEntries(Object.entries(sceneSource.nearby_character_context).slice(0, 80)
                    .map(([id, value]) => [String(id || '').slice(0, 120), experimentalIsPlainObject(value) ? {
                        mode: String(value.mode || 'nearby').slice(0, 40),
                        reason: String(value.reason || '').slice(0, 360)
                    } : {}])) : {},
            // World mechanics owns scene telemetry and boundary evidence;
            // normalization must not strip them before the engine reads them.
            ...((window.HordeWorldMechanics?.isEnabled?.(world) && experimentalIsPlainObject(sceneSource.telemetry))
                ? { telemetry: sceneSource.telemetry } : {}),
            ...((window.HordeWorldMechanics?.isEnabled?.(world) && experimentalIsPlainObject(sceneSource.transition))
                ? { transition: sceneSource.transition } : {})
        },
        events: (Array.isArray(source.events) ? source.events : []).slice(0, 100),
        entity_updates: (Array.isArray(source.entity_updates) ? source.entity_updates : []).slice(0, 100),
        state_updates: stateUpdates
    };
}

function validateWorldTurnReceipt(world, sess, rawReceipt, context = {}) {
    const receipt = normalizeWorldTurnReceipt(world, sess, rawReceipt);
    const acceptedEvents = [];
    const rejectedEvents = [];
    const informationalEvents = [];
    const entityPatches = [];
    const legacyArgs = { ...receipt.state_updates };
    const modules = normalizeWorldGameRules(world).modules;
    const sidecarTemporalAuthority = context.sidecarTemporalAuthority === true;
    const authorizedTimeSkipMinutes = sidecarTemporalAuthority
        ? Math.max(0, Math.min(SIDECAR_MAX_EXPLICIT_TIME_SKIP_MINUTES, parseInt(context.authorizedTimeSkipMinutes) || 0))
        : null;
    // A naked location_id was the source of actor confusion. It is never
    // committed; only an accepted player movement event may set this field.
    delete legacyArgs.location_id;
    delete legacyArgs.npc_moves;
    // These mutate the player but carry no actor in the legacy shape. Require
    // their actor-scoped canonical events; deterministic commerce/check
    // reducers remain specialized engine operations.
    delete legacyArgs.outfit_update;
    delete legacyArgs.inventory_add;
    delete legacyArgs.inventory_remove;
    delete legacyArgs.player_condition_updates;

    const reject = (index, event, reason, detail = '') => {
        rejectedEvents.push({
            index, reason, detail: String(detail || '').slice(0, 240),
            type: String(event?.type || 'unknown').slice(0, 60),
            actor_id: String(event?.actor_id || '').slice(0, 120)
        });
    };
    if (sidecarTemporalAuthority) {
        const suppliedMinutes = Math.max(0, parseInt(legacyArgs.time_skip_minutes) || 0);
        if (suppliedMinutes !== authorizedTimeSkipMinutes) {
            reject(-1, { type: 'time' }, 'sidecar_time_not_authorized',
                `receipt requested ${suppliedMinutes} minutes; endpoint evidence authorized ${authorizedTimeSkipMinutes}.`);
        }
        if (authorizedTimeSkipMinutes) legacyArgs.time_skip_minutes = authorizedTimeSkipMinutes;
        else delete legacyArgs.time_skip_minutes;
    }
    const acceptedNpcMoves = [];
    const currentFrame = buildWorldSceneFrame(world, sess);
    const projectedLocations = new Map([['player', String(sess.playerLocation || '')]]);
    sessionNpcs(world, sess).forEach(npc => {
        projectedLocations.set(npc.id, String(sess.entityStates?.[npc.id]?.location || ''));
    });
    const playerStart = String(context.playerStartLocationId || currentFrame.player_location_id);
    const committedDestination = String(context.committedPlayerDestinationId || '');
    const introducedLocations = (Array.isArray(legacyArgs.location_introduced)
        ? legacyArgs.location_introduced : []).map((item, index) => ({
        id: String(item?.id || `loc_turn_${Math.max(1, parseInt(sess.turnCount) || 1)}_${index + 1}`)
            .replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100),
        name: String(item?.name || '').trim(),
        connects_to: item?.connects_to,
        raw: item
    })).filter(item => item.name);
    if (introducedLocations.length) {
        legacyArgs.location_introduced = introducedLocations.map(item => ({ ...item.raw, id: item.id }));
    }
    const resolveProposedLocation = ref => {
        const known = getLocationRef(world, ref);
        if (known) return { location: known, introduced: false };
        const query = String(ref || '').trim().toLowerCase();
        const proposed = introducedLocations.find(item =>
            item.id.toLowerCase() === query || item.name.toLowerCase() === query);
        return proposed ? { location: proposed, introduced: true } : { location: null, introduced: false };
    };

    receipt.events.forEach((rawEvent, index) => {
        const event = experimentalIsPlainObject(rawEvent) ? rawEvent : {};
        const type = WORLD_TURN_EVENT_TYPES.includes(event.type) ? event.type : 'other';
        const actorId = resolveWorldActorId(world, sess, event.actor_id);
        const status = ['intended', 'attempted', 'in_progress', 'completed', 'cancelled', 'failed']
            .includes(event.status) ? event.status : 'completed';
        const base = {
            id: String(event.id || `${receipt.turn_id}_event_${index + 1}`).slice(0, 120),
            type, actor_id: actorId, status,
            participants: (Array.isArray(event.participants) ? event.participants : [])
                .map(ref => resolveWorldActorId(world, sess, ref)).filter(Boolean).slice(0, 20),
            witnessed_by: (Array.isArray(event.witnessed_by) ? event.witnessed_by : [])
                .map(ref => resolveWorldActorId(world, sess, ref)).filter(Boolean).slice(0, 40),
            evidence: String(event.evidence || '').slice(0, 400),
            cause: String(event.cause || event.reason || '').slice(0, 300),
            // Annex A execution evidence: intent, explicit compensation and
            // the declared mechanic-conditioned execution survive into the
            // committed event so the engine can validate them at commit.
            ...(window.HordeWorldMechanics?.isEnabled?.(world)
                && experimentalIsPlainObject(event.mechanic_conditioned_execution) ? {
                actor_intention: String(event.actor_intention || '').slice(0, 300),
                compensatory_strategy: (Array.isArray(event.compensatory_strategy) ? event.compensatory_strategy : [])
                    .map(value => String(value || '').slice(0, 60)).filter(Boolean).slice(0, 10),
                mechanic_conditioned_execution: {
                    task: String(event.mechanic_conditioned_execution.task || '').slice(0, 40),
                    proposed_legality: String(event.mechanic_conditioned_execution.proposed_legality
                        || event.mechanic_conditioned_execution.legality || '').slice(0, 40),
                    compensations: (Array.isArray(event.mechanic_conditioned_execution.compensations)
                        ? event.mechanic_conditioned_execution.compensations : [])
                        .map(value => String(value || '').slice(0, 60)).filter(Boolean).slice(0, 10),
                    environmental_support: (Array.isArray(event.mechanic_conditioned_execution.environmental_support)
                        ? event.mechanic_conditioned_execution.environmental_support : [])
                        .map(value => String(value || '').slice(0, 60)).filter(Boolean).slice(0, 10)
                },
                objective_result: String(event.objective_result || '').slice(0, 300)
            } : {})
        };
        if (!actorId && !['time', 'environment', 'other'].includes(type)) {
            reject(index, event, 'unknown_actor', event.actor_id);
            return;
        }

        if (type === 'movement') {
            const fromLoc = getLocationRef(world, event.from_location_id || event.from);
            const proposedDestination = resolveProposedLocation(event.to_location_id || event.to || event.location_id);
            const toLoc = proposedDestination.location;
            const movement = {
                ...base,
                from_location_id: fromLoc?.id || '',
                to_location_id: toLoc?.id || '',
                movement_mode: ['voluntary', 'forced', 'carried', 'vehicle', 'fall', 'teleport']
                    .includes(event.movement_mode) ? event.movement_mode : 'voluntary',
                vehicle_id: String(event.vehicle_id || '').slice(0, 160),
                caused_by_actor_id: resolveWorldActorId(world, sess, event.caused_by_actor_id)
            };
            if (!toLoc) {
                reject(index, event, 'unknown_destination', event.to_location_id || event.to);
                return;
            }
            if (status !== 'completed') {
                informationalEvents.push(movement);
                return;
            }
            if (actorId === 'player') {
                const alreadyCommitted = !!committedDestination && toLoc.id === committedDestination;
                const playerIntentMatch = !!context.playerMovementAuthorized
                    && (!context.authorizedPlayerDestinationId || toLoc.id === context.authorizedPlayerDestinationId);
                // an actor is only meaningful when another actor is doing the
                // moving. Requiring caused_by_actor_id for every non-voluntary
                // mode rejected perfectly valid receipts — a vehicle ride ("Uber
                // from CBD to St Kilda"), a fall or a teleport has no acting
                // actor, so the player silently stayed put for entire arcs while
                // the narrative moved on without the tracker.
                const actorDrivenMode = ['forced', 'carried'].includes(movement.movement_mode);
                const forced = movement.movement_mode !== 'voluntary'
                    && !!movement.cause
                    && (!actorDrivenMode || !!movement.caused_by_actor_id);
                if (!alreadyCommitted && !playerIntentMatch && !forced) {
                    reject(index, event, 'player_movement_not_authorized',
                        actorDrivenMode && !movement.caused_by_actor_id
                            ? `${movement.movement_mode} movement must name caused_by_actor_id.`
                            : 'No matching player movement intent, and no non-voluntary movement_mode with a stated cause.');
                    return;
                }
                const routeOrigin = alreadyCommitted ? playerStart : sess.playerLocation;
                if (!proposedDestination.introduced && routeOrigin !== toLoc.id && !findWorldTravelPath(typeof worldForSession === 'function' ? worldForSession(world, sess) : world, routeOrigin, toLoc.id)
                    && movement.movement_mode !== 'teleport') {
                    reject(index, event, 'unreachable_player_destination', `${routeOrigin} → ${toLoc.id}`);
                    return;
                }
                if (!alreadyCommitted && sess.playerLocation !== toLoc.id) legacyArgs.location_id = toLoc.id;
                projectedLocations.set('player', toLoc.id);
                acceptedEvents.push(movement);
                return;
            }
            const npcState = sess.entityStates?.[actorId];
            if (!npcState || !isNpcActive(npcState)) {
                reject(index, event, 'inactive_or_missing_actor', actorId);
                return;
            }
            const actualFrom = getLocationRef(world, npcState.location);
            if (fromLoc && actualFrom && fromLoc.id !== actualFrom.id) {
                reject(index, event, 'actor_origin_mismatch', `${actualFrom.id} ≠ ${fromLoc.id}`);
                return;
            }
            if (!proposedDestination.introduced && actualFrom && actualFrom.id !== toLoc.id
                && !findWorldTravelPath(typeof worldForSession === 'function' ? worldForSession(world, sess) : world, actualFrom.id, toLoc.id)
                && movement.movement_mode !== 'teleport') {
                reject(index, event, 'unreachable_npc_destination', `${actualFrom.id} → ${toLoc.id}`);
                return;
            }
            acceptedNpcMoves.push({
                npc_id: actorId,
                target_location_id: toLoc.id,
                reason: movement.cause
            });
            projectedLocations.set(actorId, toLoc.id);
            acceptedEvents.push({ ...movement, from_location_id: actualFrom?.id || movement.from_location_id });
            return;
        }

        if (status !== 'completed') {
            informationalEvents.push(base);
            return;
        }
        if (type === 'time') {
            const minutes = Math.max(0, Math.min(14400, parseInt(event.minutes_elapsed ?? event.minutes) || 0));
            if (sidecarTemporalAuthority && minutes !== authorizedTimeSkipMinutes) {
                reject(index, event, 'sidecar_time_not_authorized',
                    `event requested ${minutes} minutes; endpoint evidence authorized ${authorizedTimeSkipMinutes}.`);
                return;
            }
            if (minutes) legacyArgs.time_skip_minutes = Math.max(parseInt(legacyArgs.time_skip_minutes) || 0, minutes);
            acceptedEvents.push({ ...base, minutes_elapsed: minutes });
            return;
        }
        if (type === 'outfit') {
            const outfit = String(event.outfit || event.current_outfit || event.value || '').trim().slice(0, 240);
            if (!outfit) {
                reject(index, event, 'missing_outfit');
                return;
            }
            if (actorId === 'player') legacyArgs.outfit_update = outfit;
            else entityPatches.push({ entity_id: actorId, outfit });
            acceptedEvents.push({ ...base, outfit });
            return;
        }
        if (type === 'activity' || type === 'interaction') {
            entityPatches.push({
                entity_id: actorId,
                activity: String(event.activity || event.action || '').slice(0, 180),
                interacting_with: base.participants
            });
            acceptedEvents.push(base);
            return;
        }
        if (type === 'inventory' && actorId === 'player') {
            if (!modules.inventory) {
                reject(index, event, 'module_disabled', 'inventory');
                return;
            }
            const item = String(event.item || '').trim().slice(0, 160);
            const action = String(event.action || '').toLowerCase();
            if (!item || !['add', 'gain', 'take', 'remove', 'lose', 'consume', 'give', 'drop'].includes(action)) {
                reject(index, event, 'invalid_inventory_event');
                return;
            }
            const key = ['add', 'gain', 'take'].includes(action) ? 'inventory_add' : 'inventory_remove';
            legacyArgs[key] = [...(Array.isArray(legacyArgs[key]) ? legacyArgs[key] : []), item];
            acceptedEvents.push({ ...base, action, item });
            return;
        }
        if (type === 'condition') {
            if (!modules.conditions) {
                reject(index, event, 'module_disabled', 'conditions');
                return;
            }
            const condition = String(event.condition || event.value || '').trim().slice(0, 120);
            const action = ['remove', 'clear', 'recover'].includes(String(event.action || '').toLowerCase())
                ? 'remove' : 'add';
            if (!condition) {
                reject(index, event, 'missing_condition');
                return;
            }
            if (actorId === 'player') {
                legacyArgs.player_condition_updates = [
                    ...(Array.isArray(legacyArgs.player_condition_updates) ? legacyArgs.player_condition_updates : []),
                    { condition, action }
                ];
            } else {
                const current = Array.isArray(sess.entityStates?.[actorId]?.conditions)
                    ? sess.entityStates[actorId].conditions : [];
                const next = action === 'add'
                    ? [...new Set([...current, condition])]
                    : current.filter(value => value.toLowerCase() !== condition.toLowerCase());
                entityPatches.push({ entity_id: actorId, conditions: next, has_conditions: true });
            }
            acceptedEvents.push({ ...base, action, condition });
            return;
        }
        if (type === 'relationship') {
            if (!modules.relationships) {
                reject(index, event, 'module_disabled', 'relationships');
                return;
            }
            const targetId = resolveWorldActorId(world, sess, event.target_id);
            const change = Math.max(-30, Math.min(30, Number(event.change) || 0));
            if (!targetId || !change || targetId === actorId) {
                reject(index, event, 'invalid_relationship_event');
                return;
            }
            if (actorId !== 'player' && targetId === 'player') {
                legacyArgs.npc_disposition_changes = [
                    ...(Array.isArray(legacyArgs.npc_disposition_changes) ? legacyArgs.npc_disposition_changes : []),
                    { npc_id: actorId, change, reason: base.cause }
                ];
            } else if (actorId !== 'player' && targetId !== 'player') {
                legacyArgs.npc_relationship_updates = [
                    ...(Array.isArray(legacyArgs.npc_relationship_updates) ? legacyArgs.npc_relationship_updates : []),
                    { source_npc_id: actorId, target_npc_id: targetId, change,
                        label: String(event.label || '').slice(0, 80), reason: base.cause }
                ];
            } else {
                reject(index, event, 'player_feelings_not_engine_controlled');
                return;
            }
            acceptedEvents.push({ ...base, target_id: targetId, change, label: String(event.label || '').slice(0, 80) });
            return;
        }
        if (type === 'observation' && actorId !== 'player') {
            const observation = String(event.observation || event.fact || '').trim().slice(0, 400);
            if (observation) {
                legacyArgs.npc_observations = [...(Array.isArray(legacyArgs.npc_observations) ? legacyArgs.npc_observations : []),
                    {
                        npc_id: actorId,
                        observation,
                        source_type: event.source_type || (base.witnessed_by.includes(actorId) ? 'witnessed' : 'told'),
                        source_npc_id: event.source_npc_id || '',
                        confidence: event.confidence,
                        visibility: event.visibility || 'private',
                        contradicted: event.contradicted === true,
                        allowed_to_share: event.allowed_to_share !== false
                    }];
            }
            acceptedEvents.push({ ...base, observation });
            return;
        }
        if (type === 'status' && actorId !== 'player') {
            const nextStatus = ['alive', 'dead', 'gone'].includes(event.next_status || event.value)
                ? (event.next_status || event.value) : '';
            if (!nextStatus) {
                reject(index, event, 'invalid_status');
                return;
            }
            legacyArgs.npc_status_changes = [...(Array.isArray(legacyArgs.npc_status_changes) ? legacyArgs.npc_status_changes : []),
                { npc_id: actorId, status: nextStatus, cause: base.cause }];
            acceptedEvents.push({ ...base, next_status: nextStatus });
            return;
        }
        // Specialized reducers still receive their established state fields via
        // state_updates. The event remains canonical evidence and provenance.
        acceptedEvents.push(base);
    });

    receipt.entity_updates.forEach((rawPatch, index) => {
        const patch = experimentalIsPlainObject(rawPatch) ? rawPatch : {};
        const actorId = resolveWorldActorId(world, sess, patch.entity_id || patch.actor_id);
        if (!actorId) {
            rejectedEvents.push({ index, type: 'entity_update', reason: 'unknown_actor', actor_id: String(patch.entity_id || '') });
            return;
        }
        const assertedLocation = getLocationRef(world, patch.location_id);
        const actualLocation = resolveProposedLocation(projectedLocations.get(actorId)).location;
        if (patch.location_id && (!assertedLocation || assertedLocation.id !== actualLocation?.id)) {
            rejectedEvents.push({
                index, type: 'entity_update', reason: 'location_assertion_mismatch',
                actor_id: actorId, detail: `${actualLocation?.id || 'unknown'} ≠ ${patch.location_id}`
            });
        }
        entityPatches.push({
            entity_id: actorId,
            activity: String(patch.activity || '').slice(0, 180),
            interacting_with: (Array.isArray(patch.interacting_with) ? patch.interacting_with : [])
                .map(ref => resolveWorldActorId(world, sess, ref)).filter(Boolean).slice(0, 20),
            outfit: String(patch.outfit || '').slice(0, 1200),
            outfit_name: String(patch.outfit_name || '').slice(0, 80),
            conditions: (Array.isArray(patch.conditions) ? patch.conditions : [])
                .map(value => String(value || '').slice(0, 120)).filter(Boolean).slice(0, 30),
            has_conditions: Array.isArray(patch.conditions)
        });
    });
    if (acceptedNpcMoves.length) legacyArgs.npc_moves = acceptedNpcMoves;

    const assertedPlayerLocation = resolveProposedLocation(receipt.scene.player_location_id).location;
    if (!receipt.scene.player_location_id) {
        rejectedEvents.push({ index: -1, type: 'scene', reason: 'missing_player_location_assertion', actor_id: 'player' });
    } else {
        const expectedPlayerLocation = projectedLocations.get('player') || sess.playerLocation;
        if (!assertedPlayerLocation || assertedPlayerLocation.id !== expectedPlayerLocation) {
            rejectedEvents.push({
                index: -1, type: 'scene', reason: 'player_location_assertion_mismatch', actor_id: 'player',
                detail: `${expectedPlayerLocation} ≠ ${receipt.scene.player_location_id}`
            });
        }
        const actuallyChanged = expectedPlayerLocation !== playerStart;
        if (receipt.scene.player_location_changed !== actuallyChanged) {
            rejectedEvents.push({
                index: -1, type: 'scene', reason: 'player_location_change_flag_mismatch',
                actor_id: 'player', detail: `asserted ${receipt.scene.player_location_changed}; actual ${actuallyChanged}`
            });
        }
    }

    return {
        receipt, legacyArgs, acceptedEvents, informationalEvents, rejectedEvents, entityPatches,
        sceneAssertion: receipt.scene,
        currentFrame
    };
}

function applyWorldEntityPatches(world, sess, patches) {
    const applied = [];
    patches.forEach(patch => {
        if (patch.entity_id === 'player') {
            if (patch.outfit) sess.outfit = patch.outfit;
            if (patch.activity) sess.playerActivity = patch.activity;
            if (patch.has_conditions) sess.playerSceneConditions = [...patch.conditions];
            applied.push(patch.entity_id);
            return;
        }
        const entState = sess.entityStates?.[patch.entity_id];
        if (!entState) return;
        if (patch.activity) entState.currentActivity = patch.activity;
        if (patch.interacting_with?.length || Array.isArray(patch.interacting_with)) {
            entState.interactingWith = [...patch.interacting_with];
        }
        if (patch.outfit) entState.outfit = patch.outfit;
        if (patch.has_conditions) entState.conditions = [...patch.conditions];
        applied.push(patch.entity_id);
    });
    return applied;
}

function applyWorldSceneNearbyContext(world, sess, scene, source = 'tool_call') {
    // This is intentionally Sidecar-only. Inline Legacy has no semantic
    // distinction between an NPC physically present and one who is merely
    // audible/off-screen, so importing it there would fabricate a new state
    // from old receipts. A Sidecar receipt treats this as a complete ending
    // checksum for the off-screen scene layer.
    if (source !== 'sidecar' && source !== 'sidecar_conversation') return [];
    const requested = Array.isArray(scene?.nearby_character_ids) ? scene.nearby_character_ids : [];
    const context = experimentalIsPlainObject(scene?.nearby_character_context) ? scene.nearby_character_context : {};
    const physicallyPresent = new Set(buildWorldSceneFrame(world, sess).present_character_ids || []);
    const next = {};
    requested.forEach(ref => {
        const id = resolveWorldActorId(world, sess, ref);
        if (!id || id === 'player' || physicallyPresent.has(id)) return;
        const entity = sessionNpcs(world, sess).find(npc => npc.id === id);
        if (!entity || !isNpcActive(sess.entityStates?.[id])) return;
        const details = experimentalIsPlainObject(context[ref]) ? context[ref]
            : (experimentalIsPlainObject(context[id]) ? context[id] : {});
        next[id] = {
            mode: String(details.mode || 'nearby').slice(0, 40),
            reason: String(details.reason || '').slice(0, 360),
            source_turn: Math.max(1, Number(sess.turnCount) || 1),
            source: 'sidecar'
        };
    });
    sess.sceneNearbyCharacters = next;
    return Object.keys(next);
}

// Sidecar-only NPC wardrobe reconciliation. Inline Legacy keeps its existing
// session-only outfit behaviour; Sidecar can promote narrator-evidenced NPC
// clothing into the character's first-class wardrobe without changing the
// player's manually controlled dress state.
function applyWorldNpcOutfitPatches(world, sess, patches, source = 'tool_call') {
    if (source !== 'sidecar' && source !== 'sidecar_conversation') return [];
    const applied = [];
    (Array.isArray(patches) ? patches : []).forEach(patch => {
        const entity = (world.entities || []).find(item => item.id === patch.entity_id && item.type === 'npc');
        const description = String(patch.outfit || '').trim().slice(0, 1200);
        if (!entity || !description) return;
        entity.visuals = experimentalIsPlainObject(entity.visuals) ? entity.visuals : {};
        const outfits = worldOutfits(entity);
        const exact = outfits.find(outfit => outfit.description.toLowerCase() === description.toLowerCase());
        const named = String(patch.outfit_name || '').trim().slice(0, 80);
        const outfit = exact || {
            id: `outfit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
            name: named || `Scene outfit ${outfits.length + 1}`,
            description,
            imageAssetIds: []
        };
        if (!exact) outfits.push(outfit);
        entity.visuals.outfits = outfits.slice(-30);
        selectWorldOutfit(world, entity, outfit.id);
        applied.push({ entityId: entity.id, outfitId: outfit.id, created: !exact });
    });
    return applied;
}

function recordWorldTurnCommit(world, sess, validation, actionResult, source = 'tool_call') {
    if (!Array.isArray(sess.turnEvents)) sess.turnEvents = [];
    if (!Array.isArray(sess.worldTurnReceipts)) sess.worldTurnReceipts = [];
    if (!Array.isArray(sess.playerKnownEvents)) sess.playerKnownEvents = [];
    sess.worldStateVersion = Math.max(0, parseInt(sess.worldStateVersion) || 0) + 1;
    const turn = Math.max(1, parseInt(sess.turnCount) || 1);
    const clock = getWorldTimeData(world, sess);
    const worldTime = {
        day: clock.days,
        hour: clock.hours24,
        minute: clock.mins,
        absolute_minute: clock.currentTotalMinutes
    };
    const eventLocationId = event => {
        if (event.type === 'movement' && event.to_location_id) return event.to_location_id;
        if (event.location_id && getLocationRef(world, event.location_id)) {
            return getLocationRef(world, event.location_id).id;
        }
        if (event.actor_id === 'player') return String(sess.playerLocation || '');
        return String(sess.entityStates?.[event.actor_id]?.location || sess.playerLocation || '');
    };
    const committedEvents = validation.acceptedEvents.map((event, index) => ({
        ...event,
        id: event.id || `evt_${turn}_${index + 1}`,
        turn,
        location_id: eventLocationId(event),
        world_time: { ...worldTime },
        world_state_version: sess.worldStateVersion,
        committed: true
    }));
    const informationalEvents = validation.informationalEvents.map((event, index) => ({
        ...event,
        id: event.id || `evt_${turn}_info_${index + 1}`,
        turn,
        location_id: eventLocationId(event),
        world_time: { ...worldTime },
        world_state_version: sess.worldStateVersion,
        committed: false
    }));
    sess.turnEvents.push(...committedEvents, ...informationalEvents);
    sess.turnEvents = sess.turnEvents.slice(-1200);
    if (!Array.isArray(sess.playerKnownEvents)) sess.playerKnownEvents = [];
    committedEvents.forEach(event => {
        const fact = String(event.evidence || event.cause || validation.receipt.summary || '').trim();
        if (!fact) return;
        event.witnessed_by.forEach(witnessId => {
            if (witnessId === 'player') {
                if (!sess.playerKnownEvents.includes(event.id)) sess.playerKnownEvents.push(event.id);
                return;
            }
            const entState = sess.entityStates?.[witnessId];
            if (!entState) return;
            addNpcKnowledge(world, sess, witnessId, {
                id: `obs_${event.id}`,
                eventId: event.id,
                text: fact.slice(0, 400),
                sourceType: 'witnessed',
                evidenceMode: 'direct',
                confidence: 1,
                visibility: 'private',
                turn,
                absoluteMinute: worldTime.absolute_minute
            });
        });
        if (['condition', 'relationship', 'status', 'inventory', 'discovery'].includes(event.type)) {
            const severity = event.type === 'condition' ? 65 : event.type === 'relationship' ? 45 : 35;
            createWorldConsequence(world, sess, {
                type: event.type,
                title: fact.slice(0, 160),
                detail: fact,
                sourceEventId: event.id,
                locationId: eventLocationId(event),
                actorIds: [event.actor_id, ...(event.target_ids || [])].filter(Boolean),
                severity,
                escalateAfterTurns: severity >= 50 ? 4 : 0,
                decayAfterTurns: severity < 50 ? 8 : 0,
                evidence: String(event.evidence || ''),
                visibility: event.witnessed_by.includes('player') ? 'public' : 'private'
            });
        }
    });
    sess.playerKnownEvents = sess.playerKnownEvents.slice(-800);

    const resultingFrame = buildWorldSceneFrame(world, sess);
    const assertedCast = validation.sceneAssertion.present_character_ids
        .map(ref => resolveWorldActorId(world, sess, ref))
        .filter(id => id && id !== 'player').sort();
    const actualCast = resultingFrame.present_character_ids;
    const castMismatch = assertedCast.length !== actualCast.length
        || assertedCast.some((id, index) => id !== actualCast[index]);
    if (castMismatch) {
        validation.rejectedEvents.push({
            index: -1, type: 'scene', reason: 'present_cast_checksum_mismatch', actor_id: '',
            detail: `asserted [${assertedCast.join(', ')}], actual [${actualCast.join(', ')}]`
        });
    }
    const audit = {
        turn,
        receipt_id: validation.receipt.turn_id,
        source,
        world_state_version: sess.worldStateVersion,
        accepted: committedEvents.length,
        informational: informationalEvents.length,
        rejected: validation.rejectedEvents,
        applied_fields: Object.keys(validation.legacyArgs),
        entity_patches: validation.entityPatches.map(patch => patch.entity_id),
        presence_recoveries: validation.recoveredPresence || [],
        scene: resultingFrame,
        cast_checksum_match: !castMismatch,
        movement: actionResult?.movementResult || null,
        timestamp: Date.now()
    };
    sess.lastTurnAudit = audit;
    sess.worldTurnReceipts.push({
        turn,
        receipt: validation.receipt,
        audit
    });
    sess.worldTurnReceipts = sess.worldTurnReceipts.slice(-120);
    sess.playerKnownEvents = sess.playerKnownEvents.map(id => String(id || '')).filter(Boolean).slice(-800);
    return audit;
}

// Sidecar commits are retried independently of Narrator Takes.  Keep the
// transaction identity and the exact operation set separate: reusing a
// logical key with a different receipt is unsafe and must fail closed.
function stableSidecarValue(value) {
    if (Array.isArray(value)) return value.map(stableSidecarValue);
    if (experimentalIsPlainObject(value)) return Object.keys(value).sort().reduce((result, key) => {
        if (value[key] !== undefined) result[key] = stableSidecarValue(value[key]);
        return result;
    }, {});
    return value;
}

function sidecarReceiptFingerprint(receipt) {
    const payload = experimentalSafeJsonClone(receipt || {});
    // Provider-generated transport identifiers are not world operations. Strip
    // them so a safe downstream retry can reproduce the same transaction even
    // when the model chooses a fresh receipt turn ID; all authored summaries,
    // events, entity patches and state updates remain fingerprinted.
    ['turn_id', 'idempotency_key', 'sidecar_idempotency_key', 'take_id', 'revision_id', 'source_turn_id'].forEach(key => delete payload[key]);
    return worldMediaHash(JSON.stringify(stableSidecarValue(payload)));
}

function sidecarCommitIdentity(sess, context = {}, receipt = {}) {
    const explicit = String(context.idempotencyKey || receipt.idempotency_key || receipt.sidecar_idempotency_key || '').trim();
    if (explicit) return explicit.slice(0, 240);
    const timelineId = String(context.timelineId || sess?.id || 'timeline');
    const takeId = String(context.takeId || receipt.take_id || 'take');
    const revisionId = String(context.revisionId || receipt.revision_id || 'revision');
    const sourceTurnId = String(context.sourceTurnId || context.sidecarTurnId || receipt.source_turn_id || 'turn');
    return `sidecar:${timelineId}:${sourceTurnId}:${takeId}:${revisionId}`.slice(0, 240);
}

function sidecarCommitJournal(sess) {
    if (!sess) return [];
    if (!Array.isArray(sess.sidecarCommitJournal)) sess.sidecarCommitJournal = [];
    sess.sidecarCommitJournal = sess.sidecarCommitJournal.slice(-240);
    return sess.sidecarCommitJournal;
}

function commitWorldTurnReceipt(world, sess, rawReceipt, context = {}, source = 'tool_call') {
    const sidecarSource = source === 'sidecar' || source === 'sidecar_conversation';
    // Fingerprint the normalized receipt rather than a provider-specific
    // wrapper.  A compact transport may return {receipt_json:"..."}, while an
    // OpenAI-compatible provider may return the native object; those are the
    // same logical operation and must be idempotent across retries.
    let receiptFingerprint = '';
    const commitIdentity = sidecarSource ? sidecarCommitIdentity(sess, context, rawReceipt) : '';
    if (sidecarSource) {
        const recoveryOf = String(context.recoveryOf || rawReceipt?.recovery_of || '').trim();
        const incomplete = sess.sidecarIncompleteCommit;
        const recoveryAuthorized = !!(context.allowIncompleteRecovery === true
            && incomplete
            && recoveryOf
            && recoveryOf === String(incomplete.identity || '').trim());
        if (incomplete && !recoveryAuthorized) {
            const blocked = new Error('A previous Sidecar commit is incomplete and must be recovered before progression can continue.');
            blocked.code = 'sidecar_incomplete_commit_blocked';
            blocked.incompleteCommit = experimentalSafeJsonClone(incomplete);
            throw blocked;
        }
    }
    const validation = validateWorldTurnReceipt(world, sess, rawReceipt, context);
    receiptFingerprint = sidecarSource ? sidecarReceiptFingerprint(validation.receipt) : '';
    if (sidecarSource) {
        const journal = sidecarCommitJournal(sess);
        const prior = journal.find(entry => entry.identity === commitIdentity && entry.status === 'committed');
        if (prior) {
            if (prior.fingerprint !== receiptFingerprint) {
                const conflict = new Error('The Sidecar transaction identity was reused with a different receipt payload.');
                conflict.code = 'sidecar_commit_fingerprint_conflict';
                conflict.commitIdentity = commitIdentity;
                conflict.existingFingerprint = prior.fingerprint;
                conflict.receiptFingerprint = receiptFingerprint;
                throw conflict;
            }
            return prior.result;
        }
    }
    // Write a durable intent before the first mutating reducer call.  This is
    // deliberately not a world snapshot: should a native reducer partially
    // fail, the journal is evidence for the native recovery/World GM path and
    // progression is blocked rather than silently restoring broad state.
    let preparedJournalEntry = null;
    if (sidecarSource) {
        const journal = sidecarCommitJournal(sess);
        preparedJournalEntry = {
            identity: commitIdentity,
            fingerprint: receiptFingerprint,
            status: 'prepared',
            source: 'sidecar',
            receiptTurnId: String(validation.receipt?.turn_id || ''),
            preparedAt: new Date().toISOString(),
            receipt: experimentalSafeJsonClone(rawReceipt)
        };
        journal.push(preparedJournalEntry);
        sess.sidecarCommitJournal = journal.slice(-240);
    }
    const hasConditionalCheck = Array.isArray(validation.legacyArgs?.checks) && validation.legacyArgs.checks.length > 0;
    if (hasConditionalCheck) {
        // An unresolved check cannot coexist with already-completed event or
        // entity assertions for its outcome. Preserve attempts as
        // informational, reject completed mutations, and let the selected
        // on_success/on_failure branch own the canonical consequence.
        validation.acceptedEvents.forEach((event, index) => {
            validation.rejectedEvents.push({
                index,
                type: event.type || 'event',
                reason: 'completed_event_beside_unresolved_check',
                actor_id: event.actor_id || '',
                detail: 'Move the persistent consequence into checks[0].on_success or on_failure.'
            });
        });
        validation.acceptedEvents = [];
        if (validation.entityPatches.length) {
            validation.rejectedEvents.push({
                index: -1, type: 'entity_update', reason: 'entity_patch_beside_unresolved_check', actor_id: '',
                detail: 'Ending entity changes must be supplied by the resolved outcome.'
            });
            validation.entityPatches = [];
        }
    }
    const previousLocation = sess.playerLocation;
    // Claims are checked against accepted, actor-scoped receipt evidence, but
    // stay staged until the native reducer has handled the same receipt.
    // World mechanics: guard -> prepare. When the engine owns this world it
    // also orchestrates the dossier claims handoff (mechanics-derived
    // records project into the claims ledger inside its own pipeline), so
    // the app-level staging below is bypassed to avoid double-applying
    // claims.
    const mechanicsEngine = window.HordeWorldMechanics?.isEnabled?.(world) ? window.HordeWorldMechanics : null;
    let mechanicsGuard = null;
    let preparedMechanics = { enabled: false, accepted: true, errors: [], dropped: [] };
    if (mechanicsEngine) {
        mechanicsGuard = mechanicsEngine.receiptIdentityGuard(world, sess, validation.receipt);
        if (mechanicsGuard.allowed) {
            preparedMechanics = mechanicsEngine.prepareCommit(world, sess, validation,
                worldMechanicsRegistryFor(world),
                { origin: sidecarSource ? 'sidecar' : 'narrator' }) || preparedMechanics;
        }
    }
    const preparedDossierClaims = mechanicsEngine
        ? { enabled: false, claims: [], rejected: [] }
        : (window.ExperimentalWorldsDossierClaims?.prepareCommit?.(world, sess, validation, {
            origin: sidecarSource ? 'sidecar' : 'narrator'
        }) || { enabled: false, claims: [], rejected: [] });
    let actionResult;
    let nearbyContext;
    let npcOutfitUpdates;
    let audit;
    try {
    actionResult = processStructuredActions(validation.legacyArgs, world, sess, {
        sidecar: sidecarSource,
        // Only an explicit author choice in the ScenePulse Inspect scaffold
        // can permit a same-named introduced record. Model receipts never
        // receive this capability.
        scenePulseSeparatePromotionId: String(context.scenePulseSeparatePromotionId || '')
    });
    applyWorldEntityPatches(world, sess, validation.entityPatches);
    nearbyContext = applyWorldSceneNearbyContext(world, sess, validation.sceneAssertion, source);
    npcOutfitUpdates = applyWorldNpcOutfitPatches(world, sess, validation.entityPatches, source);
    // Recover an omitted NPC movement only when two independent channels
    // agree: the structured ending checksum names the NPC and the visible
    // prose explicitly places that same named person in the player's scene.
    // Either signal alone remains non-authoritative.
    const assertedCast = new Set((validation.sceneAssertion?.present_character_ids || [])
        .map(ref => resolveWorldActorId(world, sess, ref)).filter(Boolean));
    const recoverablePresence = context.narrativeText
        ? detectNarratedPresence(world, sess, context.narrativeText)
        : [];
    const recoveredPresence = [];
    if (!sidecarSource) recoverablePresence.forEach(hit => {
        if (!assertedCast.has(hit.id)) return;
        const entState = sess.entityStates?.[hit.id];
        if (!entState || isNpcPinned(sess, entState)) return;
        const from = getLocationRef(world, entState.location);
        const to = getLocationRef(world, sess.playerLocation);
        const sessionWorld = typeof worldForSession === 'function' ? worldForSession(world, sess) : world;
        if (!to || (from && from.id !== to.id && !findWorldTravelPath(sessionWorld, from.id, to.id))) return;
        entState.location = to.id;
        entState.pinnedUntilTurn = (sess.turnCount || 1) + 6;
        recoveredPresence.push(hit.id);
    });
    validation.recoveredPresence = recoveredPresence;
    if (!sidecarSource && sess.playerLocation !== previousLocation) rollForScenePopulation(sess.playerLocation, false);
    if (hasConditionalCheck && actionResult.checkResults.some(result => !result.pending && !result.reason)) {
        const resolvedFrame = buildWorldSceneFrame(world, sess);
        validation.sceneAssertion = {
            player_location_id: resolvedFrame.player_location_id,
            player_location_changed: resolvedFrame.player_location_id !== previousLocation,
            present_character_ids: resolvedFrame.present_character_ids
        };
    }
    audit = recordWorldTurnCommit(world, sess, validation, actionResult, source);
    audit.commitIdentity = commitIdentity || null;
    audit.receiptFingerprint = receiptFingerprint;
    audit.npc_outfit_updates = npcOutfitUpdates;
    audit.nearby_character_context = nearbyContext;
    const dossierClaimResult = window.ExperimentalWorldsDossierClaims?.applyPreparedCommit?.(world, sess, preparedDossierClaims)
        || { applied: [], rejected: [] };
    if (preparedDossierClaims.enabled) {
        audit.dossier_claims = {
            applied: dossierClaimResult.applied.map(claim => claim?.id || '').filter(Boolean),
            rejected: [...preparedDossierClaims.rejected, ...dossierClaimResult.rejected]
        };
    }
    // World mechanics: apply -> finalize. The engine lands its own records
    // (altered states with canonical phases, dose-event history, cognition,
    // relationships, inventory, scene telemetry and the boundary card) and,
    // when it owns the world, applies and finalizes the staged dossier
    // claims inside its own pipeline.
    if (mechanicsEngine) {
        if (!mechanicsGuard?.allowed) {
            audit.mechanics = { applied: false, skipped: 'duplicate_turn_receipt',
                detail: String(mechanicsGuard?.reason || '').slice(0, 240) };
        } else if (preparedMechanics.enabled) {
            const mechanicsResult = mechanicsEngine.applyPreparedCommit(world, sess, preparedMechanics);
            const mechanicsSceneCard = mechanicsEngine.finalizeCommit(world, sess, validation, audit, preparedMechanics);
            audit.mechanics = {
                applied: !!mechanicsResult.applied,
                errors: mechanicsResult.errors || preparedMechanics.errors || [],
                dropped: preparedMechanics.dropped || [],
                continuations: (preparedMechanics.continuations || [])
                    .map(update => update?.id || '').filter(Boolean),
                execution_verdicts: preparedMechanics.executionVerdicts || [],
                scene_card: mechanicsSceneCard?.id || '',
                revision: preparedMechanics.revision
            };
        } else {
            audit.mechanics = { applied: false, errors: preparedMechanics.errors || [] };
        }
    }
    } catch (error) {
        if (sidecarSource) {
            const incomplete = {
                identity: commitIdentity,
                fingerprint: receiptFingerprint,
                source: 'sidecar',
                status: 'incomplete',
                receiptTurnId: String(validation.receipt?.turn_id || ''),
                startedAt: new Date().toISOString(),
                error: {
                    code: error?.code || 'sidecar_commit_partial_failure',
                    message: String(error?.message || error || 'Sidecar commit failed.')
                },
                receipt: experimentalSafeJsonClone(rawReceipt),
                validation: experimentalSafeJsonClone(validation)
            };
            sess.sidecarIncompleteCommit = incomplete;
            if (preparedJournalEntry) Object.assign(preparedJournalEntry, incomplete, { journaledAt: new Date().toISOString() });
            else sidecarCommitJournal(sess).push({ ...incomplete, journaledAt: new Date().toISOString() });
        }
        throw error;
    }
    const result = { validation, actionResult, audit };
    if (sidecarSource) {
        const recoveryOf = String(context.recoveryOf || rawReceipt?.recovery_of || '').trim();
        if (recoveryOf && sess.sidecarIncompleteCommit?.identity === recoveryOf) {
            audit.incompleteCommitRecoveryOf = recoveryOf;
            const recoveredAt = new Date().toISOString();
            sidecarCommitJournal(sess).forEach(entry => {
                if (entry.identity === recoveryOf && entry.status === 'incomplete') {
                    entry.status = 'recovered';
                    entry.recoveredAt = recoveredAt;
                    entry.recoveredByIdentity = commitIdentity;
                }
            });
        }
        if (preparedJournalEntry) Object.assign(preparedJournalEntry, {
            status: 'committed', receiptTurnId: String(validation.receipt?.turn_id || ''),
            committedAt: new Date().toISOString(), result: experimentalSafeJsonClone(result)
        });
        else sidecarCommitJournal(sess).push({
            identity: commitIdentity,
            fingerprint: receiptFingerprint,
            status: 'committed',
            receiptTurnId: String(validation.receipt?.turn_id || ''),
            committedAt: new Date().toISOString(),
            result: experimentalSafeJsonClone(result)
        });
        sess.sidecarCommitJournal = sess.sidecarCommitJournal.slice(-240);
        sess.sidecarIncompleteCommit = null;
    }
    return result;
}

function commitEngineWorldNoOp(world, sess, source = 'engine', summary = 'Engine-authored scene frame.') {
    const frame = buildWorldSceneFrame(world, sess);
    return commitWorldTurnReceipt(world, sess, {
        summary,
        scene: {
            player_location_id: frame.player_location_id,
            player_location_changed: false,
            present_character_ids: frame.present_character_ids
        },
        events: [],
        entity_updates: Object.entries(frame.activities).map(([entity_id, details]) => ({
            entity_id,
            location_id: frame.player_location_id,
            activity: details.activity || '',
            interacting_with: details.interacting_with || []
        })),
        state_updates: {}
    }, { playerStartLocationId: sess.playerLocation }, source);
}

function extractSidecarNarratorHandoff(value) {
    const raw = String(value || '');
    const match = raw.match(/<scene_handoff>\s*([\s\S]*?)\s*<\/scene_handoff>/i);
    if (!match) {
        // Gemini and a few compatible providers occasionally omit the XML
        // wrapper while still emitting the requested OOC handoff headings.
        // Treat the first unambiguous SCENE READING heading as the hidden
        // boundary instead of allowing backstage prose into the player turn.
        const plain = raw.match(/(?:^|\n)\s*SCENE\s+READING\b/i);
        if (plain && (plain.index || 0) > 0) {
            return {
                narration: raw.slice(0, plain.index).trim(),
                handoff: raw.slice(plain.index).replace(/^\s*/,'').trim(),
                complete: false
            };
        }
        // A provider can exhaust its budget after opening the hidden handoff.
        // Never expose those partial backstage notes as visible roleplay. The
        // Sidecar can still use the partial evidence and its canonical frame,
        // while `complete:false` keeps the omission visible in diagnostics.
        const opening = raw.match(/<scene_handoff>\s*/i);
        if (opening) {
            return {
                narration: raw.slice(0, opening.index).trim(),
                handoff: raw.slice((opening.index || 0) + opening[0].length).trim(),
                complete: false
            };
        }
        return { narration: raw.trim(), handoff: '', complete: false };
    }
    return {
        narration: `${raw.slice(0, match.index)}${raw.slice((match.index || 0) + match[0].length)}`.trim(),
        handoff: String(match[1] || '').trim(),
        complete: true
    };
}

// Opening turns and downstream retries can run before executeWorldTurn has
// assembled the narrator's tool catalogue. They still need the same native
// commit contract; treating a missing catalogue as a hard failure strands a
// perfectly good authored opening. This fallback is deliberately a portable
// receipt envelope, not a second reducer or mutation path. Once the normal
// catalogue exists it remains the source of truth and replaces this shape.
function sidecarCommitToolFor(world = null, sess = null) {
    if (experimentalIsPlainObject(window.__hordeCommitTool)
        && window.__hordeCommitTool?.function?.name === 'commit_world_turn'
        && window.__hordeCommitTool?.function?.parameters) {
        return experimentalSafeJsonClone(window.__hordeCommitTool);
    }
    return {
        type: 'function',
        function: {
            name: 'commit_world_turn',
            description: 'Commit one canonical world-turn receipt. Use empty arrays and an empty state_updates object for a no-op beat; never invent un-authored state.',
            parameters: {
                type: 'object',
                properties: {
                    turn_id: { type: 'string' },
                    summary: { type: 'string' },
                    scene: {
                        type: 'object',
                        properties: {
                            player_location_id: { type: 'string' },
                            player_location_changed: { type: 'boolean' },
                            present_character_ids: { type: 'array', items: { type: 'string' } },
                            nearby_character_ids: { type: 'array', items: { type: 'string' } },
                            nearby_character_context: { type: 'object' },
                            scene_state: { type: 'string' }
                        },
                        additionalProperties: true
                    },
                    events: { type: 'array', items: { type: 'object', additionalProperties: true } },
                    entity_updates: { type: 'array', items: { type: 'object', additionalProperties: true } },
                    state_updates: { type: 'object', additionalProperties: true },
                    ledger_update: { type: 'string' },
                    npc_disposition_changes: { type: 'array', items: { type: 'object', additionalProperties: true } }
                },
                required: ['scene', 'events', 'entity_updates'],
                additionalProperties: true
            }
        }
    };
}

function buildSidecarOpeningHandoff(world, sess, narration) {
    const frame = buildWorldSceneFrame(world, sess);
    const location = getLocationRef(world, frame.player_location_id);
    const clock = buildSidecarClockEvidence(world, sess);
    return `SCENE READING
- This is the opening narrator response for a newly initialized timeline. It establishes the starting scene only; it does not imply a completed player action.

ANSWER core.time
- Opening scene starts at canonical time ${clock.display || 'as established by the world'}. No elapsed time is asserted.

ANSWER core.location
- The player begins at the canonical starting location ${location?.name || frame.player_location_id || 'Unknown'}. No movement is completed.

ANSWER core.cast
- Treat only characters explicitly established as physically present in the opening narration as present.

ANSWER core.world_changes
- Opening narration: ${String(narration || '').replace(/\s+/g, ' ').slice(0, 1600) || 'No visible narration was available.'}

REQUESTS
- None.

ACCEPTED PLAYER DETAILS
- None.`;
}

async function bootstrapSidecarOpeningTurn(world, sess, narration) {
    const handoff = buildSidecarOpeningHandoff(world, sess, narration);
    const model = world.model || ExperimentalWorldsState.globalSettings.defaultModel;
    const provider = ExperimentalWorldsHost.normalizedProviderId(ExperimentalWorldsState.globalSettings?.apiProvider || 'openrouter');
    try {
        const reconciled = await runSidecarReconciliation(world, sess, {
            handoff,
            narration,
            playerInput: '[Timeline initialization: narrator opening response]',
            receiptContext: {
                playerStartLocationId: sess.playerLocation,
                narrativeText: narration,
                openingTurn: true
            },
            commitTool: sidecarCommitToolFor(world, sess),
            handoffComplete: true
        });
        sess.lastTurnStateSource = 'sidecar';
        return { ...reconciled, handoff, failure: null };
    } catch (error) {
        // The opening remains visible even if a provider outage prevents
        // Sidecar from completing its first receipt. Preserve a failed
        // Sidecar turn, rather than treating the intro as an untracked engine
        // turn that can leave a later sequence looking closed or broken.
        let failed = error?.sidecarAttempt || null;
        if (!failed) {
            const attempt = beginSidecarTurnAttempt(world, sess, {
                handoff, narration,
                playerInput: '[Timeline initialization: narrator opening response]',
                preFrame: buildWorldSceneFrame(world, sess),
                preClock: buildSidecarClockEvidence(world, sess),
                model, provider, handoffComplete: true
            });
            failed = failSidecarTurnAttempt(world, sess, attempt, error, {
                code: 'sidecar_opening_reconciliation_failed', model, provider
            });
        }
        sess.lastTurnStateSource = 'sidecar_unresolved';
        return {
            committed: null, receipt: null, packet: failed?.packet || sess.sidecar?.packet || null,
            turnId: failed?.turnId || null, handoff, failure: failed?.failure || {
                code: 'sidecar_opening_reconciliation_failed',
                message: String(error?.message || error || 'Opening reconciliation failed.')
            }
        };
    }
}

function sidecarTemporalStatement(handoff) {
    const match = String(handoff || '').match(/ANSWER\s+core\.time\s*(?::|\n)\s*-?\s*([\s\S]*?)(?=\n\s*(?:ANSWER|REQUEST|ACCEPTED\s+PLAYER\s+DETAILS)\b|$)/i);
    return String(match?.[1] || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
}

// Only paired clock endpoints can authorize a Sidecar clock change. The
// authored source endpoint must exactly match the canonical pre-turn clock,
// which makes an unmarked "8:57 → 8:58" safe without treating ordinary
// temporal prose as a mechanical duration.
const SIDECAR_MAX_EXPLICIT_TIME_SKIP_MINUTES = 1440;

function parseSidecarClockEndpoint(value) {
    const match = String(value || '').trim().match(/^(\d{1,2}):([0-5]\d)\s*(a\.?m\.?|p\.?m\.?)?$/i);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    const marker = String(match[3] || '').replace(/\./g, '').toLowerCase();
    if (hour > 23 || (marker && (!hour || hour > 12))) return null;
    return { hour, minute, meridiem: marker || '', is24Hour: !marker && (hour === 0 || hour > 12) };
}

function sidecarEndpointMinuteOfDay(endpoint, fallbackMeridiem = '') {
    if (!endpoint) return null;
    if (endpoint.is24Hour) return endpoint.hour * 60 + endpoint.minute;
    const marker = endpoint.meridiem || fallbackMeridiem;
    if (!marker) return null;
    return (endpoint.hour % 12) * 60 + endpoint.minute + (marker === 'pm' ? 720 : 0);
}

function extractFF54SceneHeader(narration) {
    const match = String(narration || '').match(/\[\s*🕰️\s*([^\]|]+)\|\s*🗓️\s*([^\]|]+)\|\s*📍\s*([^\]|]+?)(?:\s*\|\s*([^\]]*?))?\s*\]/);
    if (!match) return null;
    const header = {
        raw: match[0],
        // The upstream Time-and-Place header labels its field ("🕰️ Time 8:58 AM"),
        // so strip a leading label before handing the text to the strict clock
        // endpoint parser; otherwise real FF headers never move the clock.
        timeText: String(match[1] || '').trim().replace(/^\s*(?:Time|Clock|Time of Day)\s*[:\-]?\s*/i, '').trim(),
        dayText: String(match[2] || '').trim(),
        locationText: String(match[3] || '').trim(),
        weatherText: String(match[4] || '').trim()
    };
    return header.timeText || header.locationText ? header : null;
}

// Two-phase temporal model (FF 5.4 scene header as the narrative start-anchor):
//   previous committed end --(inter-turn jump)--> narrator header start
//   header start --(in-turn elapsed)--> end of the narrated response
// A header that advances past the canonical clock is authored temporal
// progression, not a contradiction; it may also legitimately recover a clock
// that a previous failed reconciliation left stale. A header that cannot
// resolve to a plausible forward jump stays uncommitted (question lifecycle).
function deriveSidecarTwoPhaseTemporal(clockEvidence, header, handoff) {
    const canonicalMinute = Number(clockEvidence?.canonicalTotalMinutes);
    const previousMinuteOfDay = Number.isFinite(canonicalMinute) ? ((canonicalMinute % 1440) + 1440) % 1440 : null;
    const canonicalDisplay = String(clockEvidence?.display || '');
    const meridiem = previousMinuteOfDay === null ? '' : (previousMinuteOfDay >= 720 ? 'pm' : 'am');
    const breakdown = {
        previousTurnEnd: { display: canonicalDisplay, minuteOfDay: previousMinuteOfDay, day: Number(clockEvidence?.day) || 0 },
        narratorHeader: header ? {
            raw: header.raw,
            timeText: header.timeText,
            dayText: header.dayText,
            locationText: header.locationText,
            weatherText: header.weatherText
        } : null,
        interTurnJump: { minutes: 0, status: 'none', basis: 'no parseable header time' },
        currentTurnStart: { display: canonicalDisplay, minuteOfDay: previousMinuteOfDay, basis: 'canonical' },
        inTurnElapsed: { minutes: 0, status: 'none', basis: '' },
        currentTurnEnd: { display: canonicalDisplay, minuteOfDay: previousMinuteOfDay, basis: 'canonical' }
    };
    const headerEndpoint = header ? parseSidecarClockEndpoint(header.timeText) : null;
    const headerMinuteOfDay = headerEndpoint ? sidecarEndpointMinuteOfDay(headerEndpoint, meridiem) : null;
    if (Number.isFinite(previousMinuteOfDay) && headerMinuteOfDay !== null) {
        const interMinutes = (headerMinuteOfDay - previousMinuteOfDay + 1440) % 1440;
        if (interMinutes === 0) {
            breakdown.interTurnJump = { minutes: 0, status: 'none', basis: 'header start matches the committed clock' };
            breakdown.currentTurnStart = { display: header.timeText, minuteOfDay: headerMinuteOfDay, basis: 'header' };
        } else if (interMinutes > 0 && interMinutes <= SIDECAR_MAX_EXPLICIT_TIME_SKIP_MINUTES) {
            const statement = sidecarTemporalStatement(handoff);
            breakdown.interTurnJump = {
                minutes: interMinutes,
                status: statement ? 'supported' : 'uncorroborated',
                basis: statement
                    ? 'narrator header start-anchor corroborated by the handoff temporal statement'
                    : 'narrator header start-anchor without a handoff temporal statement'
            };
            breakdown.currentTurnStart = { display: header.timeText, minuteOfDay: headerMinuteOfDay, basis: 'header' };
        } else {
            breakdown.interTurnJump = { minutes: 0, status: 'ambiguous', basis: 'header time does not resolve to a plausible forward jump' };
        }
    }
    // In-turn elapsed: exact paired endpoints in the handoff temporal statement.
    // The pair source may anchor at the committed clock or, when the inter-turn
    // jump is supported, at the narrator's header start-anchor.
    const anchorForPair = breakdown.interTurnJump.status === 'supported' ? breakdown.currentTurnStart : null;
    const pair = deriveSidecarExplicitTimeSkip(handoff, clockEvidence, anchorForPair);
    if (pair) {
        if (pair.anchoredToHeader) {
            breakdown.inTurnElapsed = { minutes: pair.minutes, status: 'supported', basis: 'exact endpoint pair "' + pair.source + '" -> "' + pair.target + '" anchored at the header start' };
        } else {
            if (breakdown.interTurnJump.status === 'supported') {
                breakdown.interTurnJump = { minutes: 0, status: 'overridden', basis: 'exact handoff endpoint pair anchored this beat at the canonical clock; the pair outranks the header-derived jump' };
            }
            breakdown.inTurnElapsed = { minutes: pair.minutes, status: 'supported', basis: 'exact endpoint pair "' + pair.source + '" -> "' + pair.target + '" in the handoff' };
        }
        breakdown.currentTurnEnd = { display: pair.target, minuteOfDay: pair.targetMinuteOfDay, basis: 'handoff_endpoint_pair' };
    } else if (breakdown.interTurnJump.status === 'supported') {
        breakdown.currentTurnEnd = { display: breakdown.currentTurnStart.display, minuteOfDay: breakdown.currentTurnStart.minuteOfDay, basis: 'header_start_anchor' };
    }
    return breakdown;
}

function deriveSidecarExplicitTimeSkip(handoff, clockEvidence, startAnchor) {
    const statement = sidecarTemporalStatement(handoff);
    const pair = statement.match(/\b((?:[01]?\d|2[0-3]):[0-5]\d\s*(?:a\.?m\.?|p\.?m\.?)?)\s*(?:→|->|–|—|\b(?:into|to|through)\b)\s*((?:[01]?\d|2[0-3]):[0-5]\d\s*(?:a\.?m\.?|p\.?m\.?)?)\b/i);
    if (!pair) return null;
    const source = parseSidecarClockEndpoint(pair[1]);
    const target = parseSidecarClockEndpoint(pair[2]);
    const canonicalMinute = Number(clockEvidence?.canonicalTotalMinutes);
    if (!source || !target || !Number.isFinite(canonicalMinute)) return null;
    const preTurnMinuteOfDay = ((canonicalMinute % 1440) + 1440) % 1440;
    const canonicalMeridiem = preTurnMinuteOfDay >= 720 ? 'pm' : 'am';
    const sourceMinute = sidecarEndpointMinuteOfDay(source, canonicalMeridiem);
    // An unmarked 12-hour source is valid only when it names the actual
    // canonical clock or the narrator's committed header start-anchor. It
    // cannot silently select AM or PM.
    const anchorMinuteOfDay = Number((startAnchor || {}).minuteOfDay);
    const matchesCanonical = sourceMinute === preTurnMinuteOfDay;
    const matchesAnchor = matchesCanonical === false
        && Number.isFinite(anchorMinuteOfDay)
        && sourceMinute === anchorMinuteOfDay
        && String((startAnchor || {}).basis || '') === 'header';
    if (!matchesCanonical && !matchesAnchor) return null;
    const sourceBaseMinuteOfDay = matchesAnchor ? anchorMinuteOfDay : preTurnMinuteOfDay;
    const inheritedTargetMeridiem = target.meridiem ? '' : (source.meridiem || (sourceBaseMinuteOfDay >= 720 ? 'pm' : 'am'));
    const targetMinute = sidecarEndpointMinuteOfDay(target, inheritedTargetMeridiem);
    if (targetMinute === null) return null;
    let minutes = targetMinute - sourceBaseMinuteOfDay;
    // Crossing midnight must be explicit (PM source to AM target). A bare
    // decreasing pair is ambiguous and intentionally does not move the clock.
    if (minutes <= 0 && (source.meridiem === 'pm' || sourceBaseMinuteOfDay >= 720) && target.meridiem === 'am') minutes += 1440;
    if (minutes <= 0 || minutes > SIDECAR_MAX_EXPLICIT_TIME_SKIP_MINUTES) return null;
    return {
        minutes,
        statement,
        source: pair[1].trim(),
        target: pair[2].trim(),
        beforeCanonicalMinutes: canonicalMinute,
        sourceMinuteOfDay: sourceBaseMinuteOfDay,
        targetMinuteOfDay: targetMinute,
        anchoredToHeader: matchesAnchor
    };
}

// The Reader does not author a duration. It may, however, resolve the
// Narrator's already-authored temporal meaning to an endpoint when both the
// source and result are explicitly attributable to this beat. This is the
// semantic path for statements such as "roughly one minute elapsed"; the
// original language remains stored as the evidence, while the normalized
// endpoint is used only by the clock reducer.
function deriveSidecarReaderTemporalResolution(readerPacket, clockEvidence, temporal) {
    const evidence = readerPacket?.valid === true && experimentalIsPlainObject(readerPacket.timeEvidence)
        ? readerPacket.timeEvidence : null;
    if (!evidence) return null;
    const resolution = String(evidence.resolution || evidence.status || '').toLowerCase();
    if (['unknown', 'unresolved', 'none', 'no_change'].includes(resolution)) return null;
    const sourceText = String(evidence.source_clock || evidence.sourceClock || evidence.start_clock || evidence.startClock || '').trim();
    const targetText = String(evidence.end_clock || evidence.endClock || evidence.target_clock || evidence.targetClock || '').trim();
    const canonicalMinute = Number(clockEvidence?.canonicalTotalMinutes);
    if (!sourceText || !targetText || !Number.isFinite(canonicalMinute)) return null;
    const canonicalMinuteOfDay = ((canonicalMinute % 1440) + 1440) % 1440;
    const fallbackMeridiem = canonicalMinuteOfDay >= 720 ? 'pm' : 'am';
    const source = parseSidecarClockEndpoint(sourceText);
    const target = parseSidecarClockEndpoint(targetText);
    if (!source || !target) return null;
    const sourceMinuteOfDay = sidecarEndpointMinuteOfDay(source, fallbackMeridiem);
    const headerStart = temporal?.currentTurnStart;
    const headerMinuteOfDay = Number(headerStart?.minuteOfDay);
    const anchoredToHeader = sourceMinuteOfDay !== canonicalMinuteOfDay
        && Number.isFinite(headerMinuteOfDay)
        && sourceMinuteOfDay === headerMinuteOfDay
        && String(headerStart?.basis || '') === 'header';
    if (sourceMinuteOfDay !== canonicalMinuteOfDay && !anchoredToHeader) return null;
    const targetMinuteOfDay = sidecarEndpointMinuteOfDay(target,
        target.meridiem ? '' : (source.meridiem || (sourceMinuteOfDay >= 720 ? 'pm' : 'am')));
    if (targetMinuteOfDay === null) return null;
    let minutes = targetMinuteOfDay - sourceMinuteOfDay;
    if (minutes <= 0 && (source.meridiem === 'pm' || sourceMinuteOfDay >= 720) && target.meridiem === 'am') minutes += 1440;
    if (minutes <= 0 || minutes > SIDECAR_MAX_EXPLICIT_TIME_SKIP_MINUTES) return null;
    return {
        minutes,
        source: sourceText,
        target: targetText,
        sourceMinuteOfDay,
        targetMinuteOfDay,
        anchoredToHeader,
        precision: ['exact', 'approximate'].includes(String(evidence.precision || '').toLowerCase())
            ? String(evidence.precision).toLowerCase() : 'semantic',
        authoredMeaning: String(evidence.authored_meaning || evidence.authoredMeaning || '').slice(0, 1200),
        rationale: String(evidence.rationale || evidence.reason || '').slice(0, 1200),
        basis: 'reader_source_anchored_semantic_resolution'
    };
}

function applySidecarTemporalAuthority(receipt, handoff, clockEvidence, temporal, readerPacket = null) {
    if (!experimentalIsPlainObject(receipt)) return null;
    const breakdown = experimentalIsPlainObject(temporal)
        ? temporal
        : deriveSidecarTwoPhaseTemporal(clockEvidence, null, handoff);
    receipt.events = (Array.isArray(receipt.events) ? receipt.events : [])
        .filter(event => String(event?.type || '').toLowerCase() !== 'time');
    receipt.state_updates = experimentalIsPlainObject(receipt.state_updates) ? receipt.state_updates : {};
    delete receipt.state_updates.time_skip_minutes;
    const phaseSupported = phase => experimentalIsPlainObject(phase) && phase.status === 'supported';
    let totalMinutes = 0;
    if (phaseSupported(breakdown.interTurnJump)) totalMinutes += Number(breakdown.interTurnJump.minutes) || 0;
    if (phaseSupported(breakdown.inTurnElapsed)) totalMinutes += Number(breakdown.inTurnElapsed.minutes) || 0;
    const readerResolution = deriveSidecarReaderTemporalResolution(readerPacket, clockEvidence, breakdown);
    if (readerResolution) {
        // A source anchored at the pre-turn clock already covers the whole
        // beat; a header-anchored source covers only its in-turn second phase.
        totalMinutes = readerResolution.anchoredToHeader
            ? (phaseSupported(breakdown.interTurnJump) ? Number(breakdown.interTurnJump.minutes) || 0 : 0) + readerResolution.minutes
            : readerResolution.minutes;
    }
    if (totalMinutes > 0 && totalMinutes <= SIDECAR_MAX_EXPLICIT_TIME_SKIP_MINUTES) {
        receipt.state_updates.time_skip_minutes = totalMinutes;
        return {
            minutes: totalMinutes,
            interTurnMinutes: phaseSupported(breakdown.interTurnJump) ? Number(breakdown.interTurnJump.minutes) || 0 : 0,
            inTurnMinutes: phaseSupported(breakdown.inTurnElapsed) ? Number(breakdown.inTurnElapsed.minutes) || 0 : 0,
            basis: readerResolution?.basis || 'two_phase_header_and_endpoints',
            header: breakdown.narratorHeader,
            statement: sidecarTemporalStatement(handoff),
            readerResolution: readerResolution ? experimentalSafeJsonClone(readerResolution) : null
        };
    }
    return null;
}

const SIDECAR_CORE_QUESTION_IDS = Object.freeze(['core.time', 'core.location', 'core.cast', 'core.world_changes']);

function sidecarHandoffAnswer(handoff, questionId) {
    const escaped = String(questionId || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = String(handoff || '').match(new RegExp(
        `ANSWER\\s+${escaped}\\s*(?::|\\n)\\s*-?\\s*([\\s\\S]*?)(?=\\n\\s*(?:ANSWER|REQUEST|ACCEPTED\\s+PLAYER\\s+DETAILS)\\b|$)`, 'i'));
    return String(match?.[1] || '').replace(/\s+/g, ' ').trim().slice(0, 1600);
}

function sidecarHandoffSection(handoff, heading) {
    const escaped = String(heading || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = String(handoff || '').match(new RegExp(
        `${escaped}\\s*(?::|\\n)\\s*-?\\s*([\\s\\S]*?)(?=\\n\\s*(?:SCENE\\s+READING|ANSWER|REQUESTS?|ACCEPTED\\s+PLAYER\\s+DETAILS)\\b|$)`, 'i'));
    return String(match?.[1] || '').trim().slice(0, 6000);
}

function buildSidecarClockEvidence(world, sess) {
    const clock = getWorldTimeData(world, sess);
    const hour12 = clock.hours24 % 12 || 12;
    return {
        day: clock.days,
        display: `${hour12}:${String(clock.mins).padStart(2, '0')} ${clock.hours24 >= 12 ? 'PM' : 'AM'}`,
        format: '12-hour clock with AM/PM',
        canonicalTotalMinutes: clock.currentTotalMinutes,
        startTotalMinutes: clock.startMinutes,
        authoredOffsetMinutes: Number(sess.bonusTimeMinutes) || 0,
        authoredOffsetSeconds: Number(sess.bonusTimeSeconds) || 0,
        authority: 'semantic_sidecar',
        note: 'A model call is not a unit of world time. The legacy per-turn timeStep is intentionally omitted.'
    };
}

function buildSidecarCanonicalReferenceManifest(world, sess, evidenceText = '') {
    const view = typeof worldForSession === 'function' ? worldForSession(world, sess) : world;
    const frame = buildWorldSceneFrame(world, sess);
    const evidence = String(evidenceText || '').toLowerCase();
    const currentLocationId = String(frame.player_location_id || '');
    const present = new Set(frame.present_character_ids || []);
    const entityRows = (Array.isArray(view?.entities) ? view.entities : [])
        .filter(entity => entity?.id && entity?.name)
        .map(entity => {
            const runtime = sess.entityStates?.[entity.id] || {};
            const referenced = evidence.includes(String(entity.name).toLowerCase())
                || evidence.includes(String(entity.id).toLowerCase());
            return {
                id: String(entity.id), name: String(entity.name), type: String(entity.type || 'npc'),
                present: present.has(entity.id), referenced,
                status: String(runtime.status || entity.status || 'active'),
                locationId: String(runtime.location || entity.startLocation || ''),
                homeLocationId: String(entity.homeLocation || entity.homeLocationId || ''),
                sessionOwned: entity.sessionOrigin === sess.id
            };
        })
        .sort((a, b) => Number(b.present) - Number(a.present)
            || Number(b.referenced) - Number(a.referenced)
            || a.name.localeCompare(b.name));
    const locationRows = (Array.isArray(view?.locations) ? view.locations : [])
        .filter(location => location?.id && location?.name)
        .map(location => {
            const referenced = evidence.includes(String(location.name).toLowerCase())
                || evidence.includes(String(location.id).toLowerCase());
            return {
                id: String(location.id), name: String(location.name),
                type: String(location.mapType || location.type || 'location'),
                parentLocationId: String(location.parentLocationId || ''),
                current: location.id === currentLocationId, referenced,
                aliases: (Array.isArray(location.aliases) ? location.aliases : []).map(String).slice(0, 8)
            };
        })
        .sort((a, b) => Number(b.current) - Number(a.current)
            || Number(b.referenced) - Number(a.referenced)
            || a.name.localeCompare(b.name));
    const entityLimit = 400;
    const locationLimit = 600;
    return {
        controlledEntity: {
            id: window.ExperimentalWorldsSidecarTimeline?.ensureHierarchy?.(
                window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess), sess
            )?.sequence?.controlledEntityId || 'player',
            personaId: String(sess.personaId || ''),
            personaName: String(getTimelinePersona(sess, view)?.name || worldControlledPlayerIdentity(view, sess).name || 'Player')
        },
        entities: entityRows.slice(0, entityLimit),
        locations: locationRows.slice(0, locationLimit),
        omitted: {
            entities: Math.max(0, entityRows.length - entityLimit),
            locations: Math.max(0, locationRows.length - locationLimit)
        },
        instruction: 'Resolve authored names to these canonical IDs. A known off-scene entity is not a new entity. Never invent an ID or re-introduce a canonical record.'
    };
}


/*
 * Roleplay OS — Freaky Frankenstein 5.4 Agentic (Marinara Agent Gating).
 *
 * Built-in Narrator operating framework. This deliberately lives in app.js:
 * there is no separate FF/Marinara runtime, no FF globals, and no second
 * initialization lifecycle. FF shapes how the Narrator authors the current
 * scene; Horde Sidecar + native reducers remain the only canonical state
 * authority. state_mode is AGENTS here by construction. The source preset's
 * Internal States backend, mutable macro persistence, regex state
 * management, and policy-override sections are intentionally excluded from
 * this runtime; they are recorded as provenance, not executed.
 */
const FF54_ADAPTER_VERSION = 'ff54-agentic-horde-adapter-2';

// The Internal States persistence backend is the one architectural exclusion:
// Horde Sidecar owns state, so state_mode is pinned to AGENTS.
const FF54_STATE_MODE_PIN = 'AGENTS';

// Adapter-curated defaults. The upstream export ships self-contradictory
// section flags (e.g. Story and Cinema both enabled) and its choiceBlocks
// carry no stored defaults, so these fill the gaps. Worlds overlay their own
// selections on top; nothing here is welded shut.
const FF54_BUILT_IN_DEFAULTS = Object.freeze({
    cot_style: 'BOLT',
    pov_style: 'SECOND',
    prose_style: 'STORY',
    output_length: 'ON',
    echo_mode: 'EMBELLISH',
    nsfw_mode: 'NONE',
    bypass_mode: 'NONE',
    state_mode: FF54_STATE_MODE_PIN,
    internal_states: ['DND'],
    custom_toggles: ['VOICE2', 'ANTIOMNI', 'VAD', 'REALNPC', 'BANNED', 'GENESIS', 'VNCOLOR2', 'POPGFX', 'COMBAT', 'ONOMATO'],
    extras: []
});

// Marinara agent_data marker types -> Horde compiler agent lanes. Marker
// sections themselves are skipped (the compiler owns data injection), but
// {{#if agent::<type>}} conditionals elsewhere resolve against lane presence.
const FF54_AGENT_LANE_BY_TYPE = Object.freeze({
    'persona-stats': 'agent_persona_stats',
    'character-tracker': 'agent_character_tracker',
    'beholder': 'agent_beholder',
    'quest': 'agent_quest',
    'world-state': 'agent_world_state',
    'inventory-tracker': 'agent_inventory_tracker'
});

const FF54_AGENTIC_OS = {
    id: 'ff54_agentic',
    name: 'Freaky Frankenstein 5.4 Agentic',
    version: '5.4-agent-gating',
    stateMode: 'AGENTS',
    source: 'built_in',
    description: "Agent-gated FF 5.4 adapted as Horde's built-in Narrator Roleplay OS: engine-managed <context>, narrative-only mechanics, Sidecar persistence.",
    provenance: {
        presetId: 'QT6ABwAN4X1hQEGhGSGjs',
        artifact: 'Freaky Frankenstein 5.4 — Agent Gating.marinara.json',
        author: 'Dbtgreg (converted)',
        excluded: ['internal_states backend (state_mode pinned to AGENTS)', 'macro variable persistence (setvar/getvar neutralized)', 'regex state management'],
        upstreamSource: 'installation-level source registry (ExperimentalWorldsState.roleplayOSSources), resolved verbatim per world sourceId pin; built-in adapted registry when absent'
    }
};

function normalizeFF54Choices(raw) {
    // Lenient by design: keep unknown variables and option values verbatim so
    // future upstream choices survive import, surface generically in the UI,
    // and gate whatever sections reference them. Shape validation only —
    // membership is decided by the installed source's own choiceBlocks.
    const source = experimentalIsPlainObject(raw) ? raw : {};
    const choices = {};
    Object.keys(source).forEach(key => {
        const value = source[key];
        if (Array.isArray(value)) {
            const list = value.map(item => String(item || '').trim()).filter(Boolean)
                .filter((item, index, all) => all.indexOf(item) === index);
            if (list.length) choices[key] = list;
        } else if (value !== undefined && value !== null && String(value).trim()) {
            choices[key] = String(value).trim();
        }
    });
    // The state backend pin is architectural, not a user choice.
    choices.state_mode = FF54_STATE_MODE_PIN;
    return choices;
}

function normalizeRoleplayOSConfig(raw) {
    const config = experimentalIsPlainObject(raw) ? raw : {};
    return {
        id: FF54_AGENTIC_OS.id,
        name: FF54_AGENTIC_OS.name,
        version: FF54_AGENTIC_OS.version,
        stateMode: FF54_AGENTIC_OS.stateMode,
        source: FF54_AGENTIC_OS.source,
        choices: normalizeFF54Choices(config.choices),
        sourceId: String(config.sourceId || '').slice(0, 120),
        defaultsApplied: !experimentalIsPlainObject(config.choices),
        // Last choice reconciliation against a repointed source, kept visible
        // in the config surface until dismissed. Reconciliation itself never
        // silently resets a selection; the notes say exactly what moved.
        lastMigration: experimentalIsPlainObject(config.lastMigration) ? {
            at: String(config.lastMigration.at || '').slice(0, 40),
            sourceId: String(config.lastMigration.sourceId || '').slice(0, 120),
            notes: (Array.isArray(config.lastMigration.notes) ? config.lastMigration.notes : []).map(note => String(note || '').slice(0, 400)).slice(0, 24)
        } : null
    };
}

// ---------------------------------------------------------------------------
// Installation-level Roleplay OS source registry. Imported Marinara presets
// are parsed once (sections + choiceBlocks + derived defaults + provenance),
// stored in ExperimentalWorldsState.roleplayOSSources, persisted in device state and full
// migration backups. Registry entries are hash-ID'd: re-importing the same
// version is an idempotent upsert, and different FF versions coexist while
// each world resolves against the entry it is pinned to.
// ---------------------------------------------------------------------------
function normalizeFF54ChoiceBlocks(raw) {
    const blocks = Array.isArray(raw) ? raw : [];
    return blocks.slice(0, 64).map((block, index) => {
        const source = experimentalIsPlainObject(block) ? block : {};
        let options = source.options;
        if (typeof options === 'string') {
            try { options = JSON.parse(options); } catch (_) { options = []; }
        }
        return {
            variableName: String(source.variableName || ('choice_' + (index + 1))).slice(0, 80),
            question: String(source.question || '').slice(0, 400),
            multiSelect: source.multiSelect === true || String(source.multiSelect).toLowerCase() === 'true',
            displayMode: String(source.displayMode || 'buttons').slice(0, 40),
            sortOrder: parseInt(source.sortOrder, 10) || (index * 100),
            options: (Array.isArray(options) ? options : []).slice(0, 32).map(option => ({
                id: String((experimentalIsPlainObject(option) ? option.id : '') || '').slice(0, 80),
                value: String((experimentalIsPlainObject(option) ? option.value : '') || '').slice(0, 80),
                label: String((experimentalIsPlainObject(option) ? (option.label || option.value) : '') || '').slice(0, 200)
            })).filter(option => option.value)
        };
    }).filter(block => block.options.length);
}

// Declared defaults for an installed source: adapter-curated where the
// upstream export is self-contradictory, first upstream option otherwise.
// These are source-level defaults; world selections overlay them and are
// never silently reset by a source update.
function ff54DeriveSourceDefaults(choiceBlocks) {
    const single = {
        cot_style: 'BOLT', pov_style: 'SECOND', prose_style: 'STORY',
        output_length: 'ON', echo_mode: 'EMBELLISH', nsfw_mode: 'NONE',
        bypass_mode: 'NONE'
    };
    const multi = {
        internal_states: ['DND'],
        custom_toggles: ['VOICE2', 'ANTIOMNI', 'VAD', 'REALNPC', 'BANNED', 'GENESIS', 'VNCOLOR2', 'POPGFX', 'COMBAT', 'ONOMATO'],
        extras: []
    };
    const defaults = {};
    (choiceBlocks || []).forEach(block => {
        if (block.variableName === 'state_mode') { defaults.state_mode = FF54_STATE_MODE_PIN; return; }
        const knownValues = block.options.map(option => option.value);
        if (block.multiSelect) {
            defaults[block.variableName] = (multi[block.variableName] || []).filter(token => knownValues.includes(token));
        } else {
            const curated = single[block.variableName];
            defaults[block.variableName] = knownValues.includes(curated) ? curated : (block.options[0] && block.options[0].value) || '';
        }
    });
    return defaults;
}

function normalizeFF54SourcePreset(raw) {
    if (!experimentalIsPlainObject(raw)) return null;
    const source = experimentalIsPlainObject(raw.data) ? raw.data : raw;
    const meta = experimentalIsPlainObject(raw.data) && experimentalIsPlainObject(raw.data.preset)
        ? raw.data.preset : (experimentalIsPlainObject(raw.preset) ? raw.preset : null);
    const rawSections = Array.isArray(source.sections) ? source.sections
        : (Array.isArray(source.prompts) ? source.prompts
        : (Array.isArray(raw.sections) ? raw.sections : null));
    if (!rawSections || !rawSections.length) return null;
    let hash = 5381;
    const sections = rawSections.slice(0, 240).map((section, index) => {
        let marker = section.markerConfig;
        if (typeof marker === 'string') {
            try { marker = JSON.parse(marker); } catch (_) { marker = null; }
        }
        marker = experimentalIsPlainObject(marker) ? marker : null;
        // Registry round-trip: stored entries carry the already-extracted
        // marker identity, not the original markerConfig payload.
        const markerType = marker ? String(marker.type || '').slice(0, 60) : String(section.markerType || '').slice(0, 60);
        const agentType = marker ? String(marker.agentType || '').slice(0, 60) : String(section.agentType || '').slice(0, 60);
        const content = String(section.content || section.prompt || '').slice(0, 60000);
        for (let i = 0; i < content.length; i += 1) hash = ((hash * 33) ^ content.charCodeAt(i)) >>> 0;
        const position = String(section.injectionPosition || section.position || 'ordered') === 'depth' ? 'depth' : 'ordered';
        const roleRaw = String(section.role || 'system').toLowerCase();
        return {
            id: String(section.id || ('section_' + (index + 1))).slice(0, 80),
            name: String(section.name || ('Section ' + (index + 1))).slice(0, 160),
            content,
            role: ['system', 'user', 'assistant'].includes(roleRaw) ? roleRaw : 'system',
            position,
            depth: Math.max(0, parseInt(section.injectionDepth ?? section.depth, 10) || 0),
            order: parseInt(section.injectionOrder ?? section.order, 10) || (index * 10),
            enabled: section.enabled === true || String(section.enabled).toLowerCase() === 'true',
            markerType,
            agentType
        };
    });
    const choiceBlocks = normalizeFF54ChoiceBlocks(source.choiceBlocks || raw.choiceBlocks || []);
    const presetId = String((meta && meta.id) || raw.presetId || 'ff54_source').slice(0, 80);
    const contentHash = hash.toString(16);
    return {
        id: String(raw.id || ('ff_source_' + presetId + '_' + contentHash.slice(0, 8))).slice(0, 120),
        format: Array.isArray(source.sections) ? 'marinara' : (Array.isArray(source.prompts) ? 'sillytavern' : 'normalized'),
        presetId,
        presetName: String((meta && meta.name) || raw.presetName || 'FF 5.4 source preset').slice(0, 200),
        sections,
        choiceBlocks,
        defaults: ff54DeriveSourceDefaults(choiceBlocks),
        provenance: {
            adapter: FF54_ADAPTER_VERSION,
            contentHash,
            sectionCount: sections.length,
            choiceBlockCount: choiceBlocks.length,
            importedAt: String(raw.importedAt || (experimentalIsPlainObject(raw.provenance) ? raw.provenance.importedAt : '') || new Date().toISOString()).slice(0, 40),
            note: 'Author-imported upstream preset data, resolved verbatim. Exclusions by identity only: state_mode pinned to AGENTS, macro persistence (setvar/getvar) neutralized.'
        }
    };
}

function normalizeRoleplayOSSourceRegistry(raw) {
    return (Array.isArray(raw) ? raw : [])
        .map(entry => normalizeFF54SourcePreset(entry))
        .filter(Boolean);
}

function getInstalledRoleplayOSSources() {
    return normalizeRoleplayOSSourceRegistry(ExperimentalWorldsState.roleplayOSSources);
}

function installRoleplayOSSource(raw) {
    const entry = normalizeFF54SourcePreset(raw);
    if (!entry) return null;
    if (!Array.isArray(ExperimentalWorldsState.roleplayOSSources)) ExperimentalWorldsState.roleplayOSSources = [];
    const index = ExperimentalWorldsState.roleplayOSSources.findIndex(item => item && item.id === entry.id);
    if (index !== -1) ExperimentalWorldsState.roleplayOSSources[index] = entry;
    else ExperimentalWorldsState.roleplayOSSources.push(entry);
    return entry;
}

// Reconcile a world's stored choices against a (new or repointed) source.
// Kept: variable exists and the stored value still matches an option. Removed
// variables/values produce visible migration notes; the source default applies
// only where the old selection no longer exists. Never a silent reset.
function reconcileFF54WorldChoices(stored, sourcePreset) {
    const storedChoices = experimentalIsPlainObject(stored) ? stored : {};
    const blocks = sourcePreset && Array.isArray(sourcePreset.choiceBlocks) ? sourcePreset.choiceBlocks : [];
    const result = { choices: {}, migration: [] };
    Object.keys(storedChoices).forEach(variable => {
        if (variable === 'state_mode') return;
        const value = storedChoices[variable];
        const block = blocks.find(item => item.variableName === variable);
        if (!block) {
            result.migration.push({ variable, kind: 'variable_removed', note: 'choice "' + variable + '" does not exist in this source; selection dropped' });
            return;
        }
        const known = block.options.map(option => option.value);
        if (Array.isArray(value)) {
            const kept = value.filter(token => known.includes(token));
            if (kept.length !== value.length) {
                result.migration.push({ variable, kind: 'options_removed', note: 'options ' + value.filter(token => !kept.includes(token)).join(', ') + ' are unavailable in this source' });
            }
            if (kept.length) result.choices[variable] = kept;
            else result.migration.push({ variable, kind: 'selection_empty', note: 'selection for "' + variable + '" no longer matches any option; source default applies' });
            return;
        }
        if (known.includes(value)) {
            result.choices[variable] = value;
        } else {
            result.migration.push({ variable, kind: 'value_removed', note: '"' + variable + '" selection "' + value + '" is unavailable in this source; source default applies' });
        }
    });
    return result;
}

function worldRoleplayOS(world) {
    const config = window.ExperimentalWorldsSidecarMode?.normalizeWorldConfig?.(world);
    const os = normalizeRoleplayOSConfig(config?.roleplayOS);
    const registry = typeof getInstalledRoleplayOSSources === 'function' ? getInstalledRoleplayOSSources() : [];
    // 'builtin' is an explicit pin to the built-in adapted registry; an empty
    // sourceId keeps auto-detection (the installed FF source when one exists,
    // built-in otherwise).
    const sourcePreset = os.sourceId === 'builtin'
        ? null
        : (os.sourceId
            ? (registry.find(entry => entry.id === os.sourceId) || registry.find(entry => entry.presetId === os.sourceId) || null)
            : (registry.find(entry => /freaky frankenstein/i.test(entry.presetName)) || null));
    const defaults = sourcePreset && experimentalIsPlainObject(sourcePreset.defaults)
        ? sourcePreset.defaults : FF54_BUILT_IN_DEFAULTS;
    const effectiveChoices = { ...defaults, ...os.choices, state_mode: FF54_STATE_MODE_PIN };
    return { ...os, sourcePreset, choices: effectiveChoices };
}

function ff54TemplateVars(os, agentAvailability) {
    const choices = os.choices || {};
    const vars = {};
    Object.keys(choices).forEach(key => { vars[key] = choices[key]; });
    // Horde Sidecar owns state persistence; the upstream Internal States
    // backend is architecturally replaced, so its mode pin is AGENTS.
    vars.state_mode = FF54_STATE_MODE_PIN;
    const lanes = Array.isArray(agentAvailability) ? agentAvailability : [];
    Object.keys(FF54_AGENT_LANE_BY_TYPE).forEach(type => {
        vars['agent::' + type] = lanes.indexOf(FF54_AGENT_LANE_BY_TYPE[type]) !== -1;
    });
    return vars;
}

function ff54EvalCondition(condition, vars) {
    const text = String(condition || '').trim();
    let match;
    if ((match = text.match(/^agent::([\w-]+)$/))) {
        return vars['agent::' + match[1]] === true;
    }
    if ((match = text.match(/^(\w+)\s*(==|!=)\s*"([^"]*)"\s*&&\s*(\w+)\s+contains\s+"([^"]*)"$/))) {
        const leftValue = vars[match[1]];
        const leftOk = match[2] === '==' ? String(leftValue) === match[3] : String(leftValue) !== match[3];
        const rightList = Array.isArray(vars[match[4]]) ? vars[match[4]] : [];
        return leftOk && rightList.indexOf(match[5]) !== -1;
    }
    if ((match = text.match(/^(\w+)\s+contains\s+"([^"]*)"$/))) {
        const list = Array.isArray(vars[match[1]]) ? vars[match[1]] : [];
        return list.indexOf(match[2]) !== -1;
    }
    if ((match = text.match(/^(\w+)\s*(==|!=)\s*"([^"]*)"$/))) {
        const value = vars[match[1]];
        return match[2] === '==' ? String(value) === match[3] : String(value) !== match[3];
    }
    if ((match = text.match(/^(\w+)$/))) {
        const value = vars[match[1]];
        return Array.isArray(value) ? value.length > 0 : String(value || '') !== '';
    }
    return false;
}

// Evaluate the Marinara conditional subset the preset actually uses:
// {{#if cond}}...{{else if cond}}...{{else}}...{{/if}} (nestable),
// {{//comment}}, {{trim}}. {{setvar::x::y}}/{{getvar::x}} macro persistence is
// the excluded state architecture and evaluates to nothing. {{roll:...}} and
// {{user}} are left verbatim; the call site substitutes {{user}}.
function ff54EvaluateTemplate(text, vars) {
    let output = String(text || '');
    let guard = 0;
    while (output.indexOf('{{#if') !== -1 && guard < 300) {
        guard += 1;
        const start = output.indexOf('{{#if');
        const token = /{{#if[^}]*}}|{{\/if}}/g;
        token.lastIndex = start;
        let depth = 0;
        let end = -1;
        let scan;
        while ((scan = token.exec(output))) {
            if (scan[0] === '{{/if}}') {
                depth -= 1;
                if (depth === 0) { end = scan.index; break; }
            } else {
                depth += 1;
            }
        }
        if (end === -1) break;
        const headerClose = output.indexOf('}}', start) + 2;
        const condition = output.slice(start + 5, headerClose - 2);
        const body = output.slice(headerClose, end);
        // Split the body into branches at top-level else / else-if markers.
        const branches = [{ condition, body: '' }];
        const elseToken = /{{else if([^}]*)}}|{{else}}/g;
        const innerDepth = /{{#if[^}]*}}|{{\/if}}/g;
        let lastBoundary = 0;
        let piece;
        while ((piece = elseToken.exec(body))) {
            innerDepth.lastIndex = lastBoundary;
            let nested = 0;
            let inner;
            while ((inner = innerDepth.exec(body)) && inner.index < piece.index) {
                nested += inner[0] === '{{/if}}' ? -1 : 1;
            }
            if (nested === 0) {
                branches[branches.length - 1].body = body.slice(lastBoundary, piece.index);
                if (piece[0] === '{{else}}') {
                    branches.push({ condition: null, body: '' });
                } else {
                    branches.push({ condition: piece[1].trim(), body: '' });
                }
                lastBoundary = piece.index + piece[0].length;
            }
        }
        branches[branches.length - 1].body = body.slice(lastBoundary);
        let chosen = '';
        for (let index = 0; index < branches.length; index += 1) {
            const branch = branches[index];
            if (branch.condition === null || ff54EvalCondition(branch.condition, vars)) {
                chosen = branch.body;
                break;
            }
        }
        output = output.slice(0, start) + chosen + output.slice(end + 7);
    }
    output = output.replace(/{{\/\/[^}]*}}/g, '');
    output = output.replace(/{{trim}}/g, '');
    output = output.replace(/{{setvar::[^}]*}}/g, '');
    output = output.replace(/{{getvar::[^}]*}}/g, '');
    return output;
}

function resolveFF54UpstreamSections(os, agentAvailability) {
    const source = os.sourcePreset;
    const vars = ff54TemplateVars(os, agentAvailability);
    const sections = [];
    source.sections.slice().sort((a, b) => (a.order - b.order) || 0).forEach(section => {
        const record = {
            id: 'upstream:' + section.id, name: section.name, chars: 0, content: '',
            enabled: false, reason: '', placement: 'system', role: section.role, depth: section.depth
        };
        if (section.markerType) {
            record.reason = 'context marker (' + section.markerType + (section.agentType ? (': ' + section.agentType) : '') + ') supplied by the Horde Sidecar Context Compiler / native history';
            sections.push(record);
            return;
        }
        if (!section.enabled) {
            record.reason = 'upstream preset toggle off';
            sections.push(record);
            return;
        }
        const content = ff54EvaluateTemplate(section.content, vars).trim();
        if (!content) {
            record.reason = 'upstream condition not met';
            sections.push(record);
            return;
        }
        record.enabled = true;
        record.reason = 'upstream preset section (verbatim)';
        record.content = content;
        record.chars = content.length;
        record.placement = section.position === 'depth' ? 'history' : (section.role === 'assistant' ? 'prefill' : 'system');
        sections.push(record);
    });
    return sections;
}

// Dispatch: an installed upstream source drives the resolved stack; the
// built-in adapted registry is the fallback when no source is installed.
function resolveFF54Sections(world, os, options = {}) {
    if (os && os.sourcePreset && Array.isArray(os.sourcePreset.sections) && os.sourcePreset.sections.length) {
        return resolveFF54UpstreamSections(os, ((options || {}).agentAvailability) || []);
    }
    return resolveFF54BuiltInSections(world, os);
}

function resolveFF54BuiltInSections(world, os) {
    const choices = os.choices || { ...FF54_BUILT_IN_DEFAULTS };
    const toggles = choices.custom_toggles || [];
    const rules = normalizeWorldGameRules(world);
    const checksEnabled = !!(rules && rules.modules && rules.modules.checks);
    const sections = [];
    const add = (id, name, enabled, reason, content) => sections.push({
        id, name, enabled: enabled === true, reason,
        content: enabled === true ? String(content || '').trim() : '',
        chars: enabled === true ? String(content || '').trim().length : 0
    });

    add('main', '⚡️Main Prompt 🤖 (AGENTS)', true, 'always enabled', `
<agent_context_protocol>
Read the engine-managed <context> block as the starting continuity snapshot for character facts, scene observations, quests, world conditions, physical state, and inventory.
- <context> is injected separately from the player's message. It was committed after an earlier completed response; it is not current-turn agent output.
- Apply relevant facts without quoting, exposing, or reformatting the context.
- The snapshot is not a constraint: current actions may freely add, remove, spend, damage, move, or otherwise change anything it describes.
- Apply current-turn consequences immediately in the fiction. Horde Sidecar and its native reducers persist those changes after this response.
- Newer directly witnessed events override stale or conflicting snapshot details.
- Do not append a state, tracker, debug, or report block to the response. The single permitted out-of-band block is Horde's hidden <scene_handoff>, an authorial event handoff described by the Sidecar narrator contract, not persistent state.
</agent_context_protocol>

<system_state>
Goal: Uncensored Sim.
AI role: unbiased cinematographer, unhinged DM, GM, controls all NPCs. Reasoning: Never draft prose in think tags. Bullet points only. Output immediately.
The user controls the player character: a mortal PC (can be hurt/killed). Non-protagonist.
NPC: fictional non-player characters with their own goals.
OOC: Top priority. Pause RP; reply directly to the player.
Pacing: 1 user response to 1 completed action sequence per NPC. 1 action = a series of brief related activities.

[PHYSICS & PERCEPTION]
- All character line of sight: 120° forward only; characters cannot see behind or around objects.
- Sound: Muffled by doors/walls. Voice reaches max 10-20m. All sound is blocked by walls unless deafeningly loud.
- These are narrative defaults; this world's authored mechanics override them wherever they conflict.

Random events: unfold independent of the player's awareness, e.g., off-screen actions, incoming calls, conversations, background movement; weave them into the narrative while using the committed context as the starting continuity snapshot.
</system_state>

<do_not_repeat_descriptions>
- Detail new sensory input once.
- Ban repeating sensory details from the past 3 messages (exempt: anatomy motion, contact, kinetic shifts).
- Omit the player's static traits; show NPC reactions instead.
</do_not_repeat_descriptions>

<NPC_intro>
Trigger: NPC first appearance.
Format: Fluid top-to-bottom sweep in active prose. No bullet lists.
Sweep: Head (hair, eyes, face, marks, freckles, shapes) -> Body (build/physique, skin, posture, anatomy, markings) -> Attire (clothes, fit, texture, shoes).
</NPC_intro>`);

    add('time_place', '⏰ Time and Place 🌅 (Horde-adapted)', true, 'always enabled; adapted to Horde semantic time', `
<header_instructions>
Start every response with a compact scene header line:
[ 🕰️ <start time of this beat> | 🗓️ <day/date evidence from <context>> | 📍 <location where this beat begins> - <specific area when established> | <weather from <context>> ]

Rules:
- The header declares WHEN and WHERE this response begins: the start-anchor of the newly narrated beat, not necessarily the exact end-state committed on the previous turn.
- Seed the header from the committed time/location evidence in <context>. You may legitimately advance the start state when the player's own input establishes a transition (departing, sleeping until morning, travelling) before the next narrated action begins.
- Never manufacture exact minutes beyond the supplied evidence. When Horde only knows approximate or semantic time, reflect that honestly in the header.
- Location: where this beat begins. Update on completed movement only; a mentioned destination is not arrival.
- NPCs physically react to weather, temperature, and time (shiver, sweat, fatigue).
</header_instructions>`);

    add('prose_story', '📖Story Mode ✍🏻', choices.prose_style === 'STORY', `prose_style=${choices.prose_style}`, `
<prose_rules>
Final response must be evocative, lyrical, and atmospheric with high pathos. Use character-focused pacing. Use dynamic syntax with fluid paragraphs and varied sentences. Ban verbless fragments, telegraphic prose, and em-dash fragmentation (e.g., word—word—word).

Ban apophasis in responses: do not describe negative actions (e.g., swap "she didn't flinch" with "she stood steady").

Ban litotes in responses.
Example: Good = "His shoulders hunched and he shook his head."
Banned / Bad: "He appeared less than confident."

Weave physical traits naturally into narrative. Use tactile vocabulary and visible/audible macro actions.
</prose_rules>`);

    add('prose_cinema', '🎬Cinematic Realism 🎥', choices.prose_style === 'CINEMA', `prose_style=${choices.prose_style}`, `
<prose_rules>
Scope: Narrative prose only. Spoken NPC dialogue is exempt from all prose rules.

Realism & Flow:
- Style: Prioritize concrete 5-sense details only (sight, sound, touch, taste, smell). Ban poetic flourish, thoughts, summaries, and meta notes.
- Cadence: Smooth paragraphs with varied sentence lengths and openings.
- Sentence Structure: Complete clauses using commas and natural transitions. Ban: verbless fragments, telegraphic prose, and em-dash fragmentation (word—word—word).
- Conjunctions: Max 2 clauses per sentence using "and", "as", or "while". Must split long actions into separate sentences.
- Body & Movement: Weave body traits into real motion using tactile words. Show visible/audible macro actions and room shifts. Ban tiny micro-expressions.

Banned Formulas & Styles:
- No Tricolons: Ban lists of three elements, verbs, or descriptors. BAD: "The air smells like rain, salt and copper." GOOD: "The rain makes the air smell floral." Use one solid detail or pairs.
- No Apophasis: Show what happens, not what doesn't (GOOD: "They look forward and walk" | BAD: "They don't turn around").
- No Personification: Never give living actions to objects or nature (GOOD: "The forest was humid" | BAD: "The forest breathed mist").
- No Litotes: Ban double negatives (GOOD: "His shoulders hunched" | BAD: "He appeared less than confident").
- No "Of" Genitive Overuse Chains: Ban phrases like "the sound of him" or "the heat of her". Use Saxon possessives ("his sound", "her heat") or active verbs.
- No Drama Formulas: Ban 1-word hits, stacked negatives, and repeat lines (BAD: "Silence." / "No hope. No way out." / "Pure control.").
- Plain Words: Swap medical words for everyday words (thighs not quadriceps, shoulder not deltoid, back not spine).
- Ban excess similes and metaphors.
</prose_rules>`);

    add('pov_first', '👀1st person POV🦅', choices.pov_style === 'FIRST', `pov_style=${choices.pov_style}`, `
<POV>
Mode: 1st Person Subjective.
Tense: Present tense.
Voice: Refer to the player character strictly as "I" / "me" / "my".

Rules:
- Filter all narration through direct personal bias, inner thoughts, and immediate senses.
- Keep narrative within the player character's field of view.
</POV>`);

    add('pov_second', '👀2nd person POV🦅', choices.pov_style === 'SECOND', `pov_style=${choices.pov_style}`, `
<POV>
Mode: 2nd Person POV.
Tense: Present tense.
Address: Refer to the player character strictly as "you" / "your".
Bad: "Her arms shake."
Good: "You notice her arms are shaking."

Rules:
- NPCs and the world interact directly with "you".
- Ban 1st person ("I") in narration.
- Tone: Atmospheric, immediate, and guiding.
</POV>`);

    add('pov_third', '👀3rd person POV🦅', choices.pov_style === 'THIRD', `pov_style=${choices.pov_style}`, `
<POV>
Mode: 3rd Person Limited.
Tense: Past tense.
Pronouns: he/him, she/her, they/them, or character names.

Rules:
- Strictly 3rd person for all characters, including the player character.
- Perspective: Keep sensory focus grounded in the immediate scene.
</POV>`);

    add('pov_hybrid', '👀Hybrid POV🥵🥶😣', choices.pov_style === 'HYBRID', `pov_style=${choices.pov_style}`, `
<POV>
Mode: Hybrid POV (3rd Person World + 2nd Person User Sensations).

Rules:
- NPCs & World: Narrate all characters, actions, and scenery strictly in 3rd person (he/she/they/NPC name).
- User Sensations: Narrate what the player character physically feels in 2nd person ("you" / "your"). Focus on touch, heat, cold, pain, pressure, and wetness on the player's skin.
- Sensation ≠ Action: Sensation ONLY.

Examples: Bad: "Leslie hands you the clay and you grab it."
Good: "Leslie hands you clay. The gritty slimy texture glides through your fingers. It's cold and soft on your skin."
</POV>`);

    add('echo_antiparrot', '🦜 Anti-parrot and anti-echo 💬', choices.echo_mode === 'ANTIPARROT', `echo_mode=${choices.echo_mode}`, `
<user_autonomy>
Strict Rules:
- User Autonomy: Never act, speak, think, or move for the player character.
- Anti-Echo: Never quote, rephrase, or repeat the player's words, actions, or thoughts. NPCs react to meaning, not literal words. NPCs *NEVER* repeat the player's words.
- Selective Flow: Avoid checklist replies. NPCs react naturally to just 1 or 2 key points of the player's input.
- Scene Progression: Push the scene forward with new NPC moves, fresh senses, and new dialogue. Stop and pass the turn when the player must act.

NPC Anti-Repeat Rule:
- Bad (Banned): User: "My name is Dan." -> NPC: "Your name is Dan?" she says, rolling the name in her mouth.
- Good: User: "My name is Dan." -> NPC: "Nice to meet you. My name is Jess."
</user_autonomy>`);

    add('echo_embellish', '🧂Embellish Mode 🧙‍♂️', choices.echo_mode === 'EMBELLISH', `echo_mode=${choices.echo_mode}`, `
<user_autonomy>
Role: Co-writer for presentation only. You may restate, dramatize, and give narrative presentation to the actions and dialogue the player has ALREADY explicitly authored this turn.

You must never invent:
- a new player decision
- additional player dialogue beyond what the player wrote
- an unrequested action
- private player thoughts or beliefs
- consent or refusal on the player's behalf
- a commitment the player did not make

Rules:
- Expand User: elaborate the player's authored actions in their intended direction while keeping core intent.
- Structure: start the response with the player's authored action and dialogue as written intent, presented naturally.
- NPCs: react naturally to 1 or 2 key points. Ban point-by-point checklist replies.
- Continue Nudge: if the player inputs "continue", present the established situation and NPC responses; do not author new player decisions.
- Evidence note: the player's original words are the authoritative record of what the controlled character did and said; your embellished wording is presentation only. Horde's memory treats the user's authored text as primary evidence and your narration as secondary.
</user_autonomy>`);

    add('output_length', '📝Total Output Length🚦', choices.output_length === 'ON', `output_length=${choices.output_length}`, `
<formatting_constraints>
- AI Response Length: 4 to 8 paragraphs, 400 to 600 words (excluding the scene header and the hidden handoff). Does not have to be exact but close enough.
- History Override: Ignore past chat message lengths. Match this target directly.
</formatting_constraints>`);

    add('toggle_voice2', '🎤NPC Voice + Dialogue 2.0 🗣️', toggles.includes('VOICE2'), 'custom toggle VOICE2', `
<npc_voice>
Rules in this tag apply to spoken NPC dialogue only. Narrative prose is exempt.

Spoken Dialogue Output & Flow Rules:
- Ratio: NPC spoken dialogue must comprise 30% to 50% of total response (exempt if alone or ignoring the player).
- NPC Dialogue Flow: Continuous, multi-sentence speech with complete sentences flowing like water. No Fragments: Merge clauses into continuous thoughts.
  BANNED: "I am talking. To a person. About work."
  GOOD: "I am talking to a person about work."
- Anti-Monologue: Break long speech with physical action beats.
- Anti-Overreact / Ban Melodrama: Never over-dramatize player words (Bad: "No one has ever said that to me! Say it again!" | Good: Any completely different response).
- Anti-Recap: Never recap past events unless driving the immediate next action.

Idiolect, Diction Friction & Anti-Smoothing:
- Distinct Idiolect: Create and strictly maintain distinct idiolect for all NPCs matching persona and dialogue examples. Dynamic delivery register shifted by VAD, emotions, and active instincts.
- Diction Friction: NPCs must never sound interchangeable. Amplify unique verbal registers, accents, dialects, slang, idioms, and social biases.
- Anti-Smoothing: Never smooth dialogue into a generic or neutral register. Preserve unique speech quirks at all times using literacy tools.
- Punctuation Exemption: Em-dashes and ellipses ARE permitted in spoken dialogue for cadence, vocal pauses, interruptions.
- NPCs don't discuss specific words the player said or specific times/numbers of an event. This is unnatural unless they have a mental disorder.

Emotion & Vocalizations:
- Orthographic Cues: When VAD/emotions are high, use orthographic cues (Caps: "I'M GOING TO WRECK YOU!" | Stutter: "I... I d-don't know!" | Shock: "You.. you never loved ME?! JUST SAY IT!").
- Intimacy Talk: NPCs talk, moan, and vocalize during intimacy ("unnhhh, mmmm, YES!").
- Species Vocalizations: Felines = purr. Canines = growl/whine. Avians = chirp. Humans = groans, sighs, pants, moans (humans never make animal sounds).
- Attitude: Pursue goals fiercely without unearned aggression or default hostility unless written into persona.

Bans in Dialogue:
- Ban Coordinating Conjunctions: Ban "and" and "or" in spoken dialogue. Split statements with periods, commas, or action beats.
- Ban Abstract Speeches: Ban deep philosophical speeches; trail off to mundane, concrete details instead.
- Ban Tricolons: Ban lists of three sequential parallel clauses, questions, or elements.
</npc_voice>`);

    add('toggle_antiomni', '🧘Anti-Omniscient NPCs 💥🧠', toggles.includes('ANTIOMNI'), 'custom toggle ANTIOMNI', `
<anti_omniscient_NPCs>
NPC knowledge restricted to personal education/experience. They must not know things outside their scope. NPCs treat others as strangers initially. Avoid military/clinical tone.

Anti-bridging rule: NPCs have Zero knowledge of unwitnessed events without firsthand presence or explicit transfer (calls/evidence). If they are in scene B they never witness anything from scene A unless they were present.

Smell rule: NPCs cannot identify characters, actions, or history by scent. They can't identify "what happened" by smells.

Sound rule: All sound is blocked by walls unless deafeningly loud. NPCs cannot hear through walls.

Thought Rule: NPC Dialogue must never reference the player's internal thoughts (no mind reading).

Evidence Rule: NPCs reconstructing past events requires physical evidence and expertise. Ban intuition, dramatic irony, and "just knowing."

Horde reinforcement: private character cognition supplied in <context> is never a license for omniscience; a character knows only what their own perception, communication, evidence, or committed cognition establishes.
</anti_omniscient_NPCs>`);

    add('toggle_vad', '🎭NPC Instincts + VAD Emotions🎥🎬', toggles.includes('VAD'), 'custom toggle VAD', `
<npc_instincts>
All NPCs possess these core instincts [9]:
1. CognitiveClosure: Craves certainty, zero tolerance for ambiguity.
2. PreservationImpulse: Survival instinct, threat response, resource hoarding.
3. SweetnessComfort: Craves warmth, sugar, praise, physical comfort.
4. TribalAffiliation: Desire for social belonging, conformity, group validation.
5. ReproductionLegacy: Urge to create, parent, mentor, reproduce, or leave legacy.
6. PatternFear: Subconscious alarm to ambiguous patterns, silence, or mimicry.
7. GrossAversion: Primal disgust, repulsion to rot, filth, or disease.
8. TranscendenceImpulse: Urge to lose oneself in beauty, vastness, or meaning.
9. CuriosityDrive: Explore novelty, resolve incongruity, tinker, understand.

Rules:
- Triggers: Stress, ritual, hunger, nostalgia, beauty, disgust, curiosity, fear or emotional arousal.
- Effects: Triggers cause instincts to intensify, overriding rational behavior.
- Subconscious: NPCs are driven to impulsive physical actions (e.g., unsolicited touching, hitting, intimacy, stealing, violence) before they are consciously aware.
- Prose: Terms used for reasoning/planning only; never output them in narrative prose.
</npc_instincts>

<vad_emotion>
VAD Axes: Valence (+/-), Arousal (high/low energy), Dominance (in control/helpless). VAD states change actions, body language, tone, and dialogue delivery, while persona remains fixed. Never state VAD labels in prose.

Examples:
- High-Dom Anger = cold, calm authority.
- Low-Dom Anger = desperate, cracking voice, panic.
- +Val / High Arousal = cheery, excited.
- -Val / Low Arousal = bored, flat.

Application:
- Flaws: NPCs are flawed, panic-prone, deceptive, and tactically poor under stress.
- Dynamic Drive: Current VAD and active instincts must drive NPC posture, goals, and dialogue delivery in every reply.
</vad_emotion>`);

    add('toggle_realnpc', '🪧Realistic NPCs 👬', toggles.includes('REALNPC'), 'custom toggle REALNPC', `
<realistic_bold_characters>
Rules:
- Mortality & Free Will: NPCs are fallible, mortal, lack plot armor. NPCs pursue goals relentlessly regardless of the player's desires. NPCs should lie, confront, disagree, and engage in forced physical interactions/non-con for goals.
- Original Thought: NPCs construct new ideas and discuss past history, tastes, moods, or sensations. Never narrate what is already obvious in the immediate scene.
- Persona Integrity: Preserve negative traits, grudges, and disagreements. Never soften NPCs into compliance. NPCs call out lies if aware and take risks.

Full Actions Only Rule:
- No Hesitation: NPCs frequently execute physical actions (grabbing, striking, stealing, touching, pushing) fully and realistically. They never do half-measures or unfinished moves (no "hovering hands"). NPCs frequently touch everyone/everything to achieve goals. They must physically interact with other NPCs and the player character.
- Bad (banned): "He hesitates, his hand hovering near the gold."
- Good: "He shoves others away and snatches the gold, pocketing it to secure his prize."
</realistic_bold_characters>`);

    add('toggle_banned', '🚫Banned Word List📝', toggles.includes('BANNED'), 'custom toggle BANNED', `
<banned_vocabulary>
Rule: ALL listed words and phrases are STRICTLY prohibited in ALL responses. You must select a replacement word:

[fresh meat, spine, breath hitching, breath catching, husky, catching in throat, pupils blown wide, predatory, ozone, meat, asset, shivers down spine, pupils dilated, nails biting, velvet, vise, vice, structural integrity, deep curve, furnace, throaty, calloused, guttural, slick, unadulterated, jaw clenched, jaw working, barely above a whisper, musk, breast, a beat]

</banned_vocabulary>`);

    add('toggle_genesis', '🧬 HQ NPC Genesis 🆕', toggles.includes('GENESIS'), 'custom toggle GENESIS', `
<npc_creation>
Trigger: Introducing any new, undefined NPC.
Naming: Generate 5 setting-appropriate names; select the 5th. Banned names: Elara, Lily, Seraphina, generic fantasy names.
Identity: Select setting race; link accent, slang, and cultural beliefs directly. NPC goals and unique dialogue.
Visuals: Define skin, eye shape/color, hair style/color, physical flaws, build, detailed clothing, and accessories.

Horde note: a newly introduced NPC is authored evidence for Sidecar, never an automatic canonical entity. Name new arrivals clearly in the hidden <scene_handoff> so Sidecar can stage them as provisional records for author review.
</npc_creation>`);

    add('toggle_vncolor2', '🌈 Colored Dialogue 2.0 VN🖍️', toggles.includes('VNCOLOR2'), 'custom toggle VNCOLOR2', `
<colored_dialogue>
Must use Exact Format: <color:tone>"Dialogue"</color:tone>
Must replace color in tag with: cyan, pink, teal, orange, gold, violet, salmon, orchid, yellow, plum
Must replace NPC Tone in tag with: shout, whisper, measured, tremble, if normal tone omit :tone

Example: <gold:measured>"You're barking up the wrong tree."</gold:measured>

Rules:
- Assign each NPC one unique 1-word color from the palette. Use tones only when needed.
- Lock this color permanently for the entire chat.
- Prefix all spoken NPC dialogue only. Keep narrative prose un-prefixed.
</colored_dialogue>`);

    add('toggle_popgfx', '👾Pop in Graphics 💻', toggles.includes('POPGFX'), 'custom toggle POPGFX', `
<gfx_protocol>
Trigger: Must use when characters receive, notice, view, or read readable media (terminal, sign, map, letter, phone).
Format: Output raw inline HTML wrapped strictly in <!-- GFX_START --> and <!-- GFX_END --> tags. Markdown code blocks are STRICTLY BANNED.

CSS Styles:
- Terminal: font-family:monospace; background:#0a0a0a; color:#0f0; border:1px solid #0f0; box-shadow:0 0 10px #0f03; padding:15px; border-radius:5px; text-shadow:0 0 4px #0f0;
- Letter/Sign/Map: font-family:'Brush Script MT',cursive; background:#f4e4d4; color:#2c1e16; padding:20px; border:1px solid #d3c2b3; box-shadow:2px 2px 8px #0002; line-height:1.6;
- Phone: font-family:sans-serif; background:#121212; color:#fff; border-radius:20px; padding:15px; border:1px solid #333; max-width:350px; box-shadow:0 5px 15px #0006;
- Phone Requirements: Must include Time, Battery%, CallerID, ChatBubbles, and Emojis.

Example:
<!-- GFX_START -->
<div style="font-family:monospace; background:#0a0a0a; color:#0f0; border:1px solid #0f0; box-shadow:0 0 10px #0f03; padding:15px; border-radius:5px; text-shadow:0 0 4px #0f0;">
> ROOT ACCESS GRANTED<br>
> DECRYPTING FILES...
</div>
<!-- GFX_END -->
</gfx_protocol>`);

    add('toggle_combat', '⚔️ Spectacle Combat Physics 💥', toggles.includes('COMBAT'), 'custom toggle COMBAT', `
<combat>
Scope: Apply to all fight scenes. Write as an exaggerated, high-impact kinetic spectacle.

Rules:
- Speed and Destruction: Instant speed and physical force. Attacks shatter stone, fracture masonry, split wood, snap clothes, and throw blinding sparks.
- Bodily Impact: Raw visceral destruction (rent flesh, spraying blood, snapping bone). Ban clinical or sanitized terms.
- Combat Dialogue: Grandiose, arrogant, or chillingly calm boasts of lethality. Enemies stand and fight rather than flee to sound alarms.
</combat>`);

    add('toggle_onomato', '💥Onomatopoeia Mode 🔊', toggles.includes('ONOMATO'), 'custom toggle ONOMATO', `
<onomatopoeia>
Use frequent onomatopoeia standalone sound effects (e.g., *Squelch!*, *Kablam!*) during intimate or high-impact actions.
Prose Format: Enclose raw onomatopoeia in asterisks (*sound*). Emojis are permitted.
</onomatopoeia>`);

    const dndSelected = (choices.internal_states || []).includes('DND');
    add('dnd_sim', '🐉🗡️DnD Simulator 🎲 (AGENTS, narrative-only)', dndSelected, `internal_states=${(choices.internal_states || []).join(',') || 'none'}`,
        checksEnabled ? `
<internal_dndsim>
This world has Horde's canonical check engine. A mechanically uncertain beat is governed by that engine, not by invented dice.
- Never invent a die result, DC, roll, or mechanical payload in prose or in the hidden handoff.
- When a beat reaches genuine mechanical uncertainty, narrate up to the moment of uncertainty and identify the needed check in the hidden <scene_handoff> so Sidecar can reconcile it.
- Outside mechanical checks, resolve ordinary actions through established fiction, skills, and consequence.
</internal_dndsim>` : `
<internal_dndsim>
Role: Impartial DM/GM. When any character (the player or an NPC) completes a skilled, contested, or high-stakes action (significant coercion, persuasion, insight, stealth, craft), resolve it honestly:
1. Lock the difficulty internally based on the task, the actor's skills, and available tools (Easy: 1-5, Moderate: 5-10, Hard: 10-15, Impossible: 15-20). Never change it once locked.
2. Judge the outcome against that difficulty, including reasonable established buffs/debuffs. Bias neither toward nor against the player. No fudge. No partial success just outside the margin.
3. Integrate the outcome seamlessly into the narration. Never mention DCs, rolls, numbers, or dice in the prose.
Skip rolls entirely for trivial daily tasks (talking, walking, easy movements).

AGENTS mode: use the resolved outcome to determine the current narrative result only. Do not append, expose, or reconstruct a DnD task report or state block; persistence belongs to Horde Sidecar after this response.
</internal_dndsim>`);

    const cotMap = {
        BOLT: 'cot_bolt',
        MICRO: 'cot_micro',
        MAX: 'cot_max'
    };
    add('cot_bolt', '⚡️BOLT Chain of Thought 🧠 (AGENTS)', choices.cot_style === 'BOLT', `cot_style=${choices.cot_style}`, `
# Reasoning Rules
- Reason briefly in concise bullet points inside think tags across Tasks 0-10.
- *NEVER* draft full prose in reasoning; ONLY brainstorm ideas and answer all questions, then output the final response immediately after Task 10.
- Do not leak reasoning into the final response.

Tasks:
0. Gamestate: What is the exact physical positioning, line of sight (120°), and sound muffling of characters in the scene? Are OOC commands present (if yes, halt RP and answer directly)? What does the <context> snapshot establish about this beat?
1. Neutrality & Rolls: What are the NPCs' immediate individual goals and how do they pursue them? Apply realistic-bold behaviour so NPCs act fully without hesitation. If the DnD narrative rule is active, lock the task difficulty now and judge the outcome honestly, never revisiting it.
2. Scope & Knowledge: How do the anti-bridging, smell, sound, thought, and evidence rules limit NPC knowledge right now? What are NPCs completely blind to? What false beliefs or misunderstandings does that blindness create?
3. Prose Style: List the active <prose_rules> concisely. Enforce <do_not_repeat_descriptions> to omit repeat sensory details from the last 3 messages.
4. Natural Dialogue: Apply <npc_voice> for legato pacing and complete multi-word sentences; calculate VAD and instincts for present NPCs to warp emotional delivery; keep each NPC's idiolect distinct; target the correct dialogue ratio.
5. User Boundaries: What is the correct <POV>? List all <user_autonomy> rules. What is the NPC anti-repeat rule and how will I follow it in this scene?
6. Slop Review: List all <banned_vocabulary> words and choose replacements for this scene.
7. Formatting: Can <gfx_protocol> apply? Which locked dialogue colors are established in <colored_dialogue>? What is the target length in <formatting_constraints>? Skip absent tags.
8. Modes: Apply any optional mode sections active in this stack; skip otherwise.
9. Plot Momentum: Brainstorm 3 very distinct, compelling ways the NPCs can react based on VAD and instincts to drive the scene. Select the best path or a blend, concisely.
10. State Backend: The <context> block is the starting continuity snapshot only. Treat it strictly as prior committed state, never as player dialogue or current-turn output. Let current actions naturally change it, prefer newer directly witnessed events, and leave persistence bookkeeping entirely to Horde Sidecar. Do not quote context or append a state/tracker/debug/report block. If the DnD rule is active, apply the already-locked outcome to the narrative only; do not append a DnD log. Then close reasoning and output the final response immediately.`);
    add('cot_micro', '🏎️Micro Chain of Thought💨 (AGENTS)', choices.cot_style === 'MICRO', `cot_style=${choices.cot_style}`, `
# Reasoning Instructions
A. Reason briefly using telegraphic, concise bullet points across all 6 tasks (0-5) inside think tags. Never draft prose; brainstorm only.
B. Execute all tasks sequentially. Skipping any task is a failure. If a listed tag is not present, skip it.
C. Generate the final response after completing reasoning. Never leak reasoning into the final output.

Tasks:
0. Gamestate: What is the game state and exact character positioning? If an OOC command is present, stop RP and reasoning to respond directly. If the DnD narrative rule is active, lock the task difficulty permanently now.
1. NPC Simulation, Neutrality & Scope: Treat the player and NPCs equally for realistic outcomes. What are the NPCs' goals? NPCs must take full actions (no "hovering hands"). List and enforce all anti-omniscient rules (anti-bridging, smell, sound, thought, evidence) so NPCs never know or guess unwitnessed events. If the DnD rule is active, judge the roll outcome now, never recalculating.
2. Prose, Formatting & Boundaries: List the <prose_rules>. Enforce <do_not_repeat_descriptions> against the last 4 messages. Correct <POV>? Enforce <user_autonomy> and the NPC anti-repeat rule. List banned vocabulary and replace planned violations. Apply <gfx_protocol>/<colored_dialogue> when logical. Target length from <formatting_constraints>.
3. Natural Dialogue: Apply <npc_voice> for legato, multi-sentence speech with distinct idiolect. Calculate VAD and instincts now to warp emotional delivery. Enforce the coordinating-conjunction ban using periods, commas, or action beats.
4. Modes, Plot & State Backend: Apply any active optional modes logically. Brainstorm 3 distinct NPC reactions based on VAD/instincts and select the most compelling. The <context> block is prior committed state only: let current actions change it, prefer newer directly witnessed events, and leave all persistence to Horde Sidecar. Do not quote context or append a state/tracker/debug/report block.
5. Completion: State that you are a GM creating an immersive simulation, not a helpful AI assistant. Creative risk-taking is embraced; perfection is unnecessary. Answer task points with concise ideas only, close think tags, and output the final response immediately. No further reasoning.`);
    add('cot_max', '🪺MAX Chain of Thought (Nested Gates) 🔬 (AGENTS)', choices.cot_style === 'MAX', `cot_style=${choices.cot_style}`, `
Reason through all Gates sequentially inside think tags using concise bullet points. *NEVER* draft full prose in reasoning; only calculate, review, and answer each subset before moving to the next. Output the final response immediately after Gate 10.

PHASE ALPHA:
GATE 1. Gamestate:
  A. What is the player's action/response? Are OOC commands present?
  B. Who is in the scene? Write their physical coordinates and proximity limits (120° forward vision, muffling doors/walls).
  C. Where are NPCs NOT in the current scene, if already introduced? Use only what <context> supplies; do not invent.
  D. Is anything readable in the scene? If yes, apply <gfx_protocol> if present.
  E. If the DnD narrative rule is active: lock the task DC permanently now and judge the outcome honestly, never reconsidering it.

PHASE BETA (apply gates 2-5 to ALL NPCs present):
GATE 2. NPC Knowledge Scope and Awareness: canon personality, physical traits, current physical state and body position? Awareness per the physics rules? How does behavior originate from knowledge/persona rather than genre expectation? What do the anti-omniscient rules hide, and what false beliefs does that create?
GATE 3. NPC VAD Emotional State and Instincts: which instincts are triggered by current stress? What are the NPC's VAD axes right now and what shifted since last turn? How does that raw state manifest physically before conscious thought catches up?
GATE 4. NPC Agenda and Agency Friction: independent, self-serving motivations in this response? Full commitment without hovering or permission-seeking? What handling, disagreements, or deceit strategies fit the NPC's knowledge and persona?
GATE 5. Natural NPC Voice and Acoustics: how does <npc_voice> flavor dialogue by state, age, culture, and species? Enforce the conjunction ban with periods, commas, or action beats; keep dialogue multi-word and flowing. If emotions are high, demonstrate delivery via orthographic cues and non-lexical vocalizations, sparingly. Match established dialogue quirks. Target dialogue ratio.

PHASE CHARLIE:
GATE 6. Agent Reports: review the engine-managed <context> block as the starting snapshot. Treat it strictly as prior committed state, never as player dialogue or current-turn output. Let current scene actions freely change it; prefer newer directly witnessed events over stale report details. Leave persistence bookkeeping to subsequent Horde Sidecar work. Do not quote context or append a state/tracker/debug/report block. If the DnD rule is active, apply the already-locked outcome to the narrative only.
PLOT MOMENTUM: brainstorm 3 very different ways the NPCs could respond based on established VAD and instincts; pick the most interesting one.
GATE 7. Sensory Physics and Cinematography: combat scene? Apply <combat>. List the main <prose_rules> for the narrative style. Enforce <do_not_repeat_descriptions>: Registration (first description), Habituation (omit), Dishabituation (kinetic shifts); no repeated or re-skinned sensory details from the last 3-4 messages.
GATE 8. User POV and Autonomy: correct <POV>? How does <user_autonomy> shape the scene, including the NPC anti-repeat rule?
GATE 9. Narrative Lint Pass: is this response too concrete/abstract or disrespectful of the partner's time? Did NPC agency get destroyed by centering the player on the universe? List <banned_vocabulary> and replacements. Remove authorial summaries, send-offs, and hand-holding. Fit <formatting_constraints> if present.
GATE 10. Auxiliary reasoning not covered above. Never draft—only concise thinking, then the final high-quality response. Do not leak processing into the final response. Completion: you are a GM/DM creating an immersive simulation, not a helpful AI assistant. Creative risk-taking is embraced; perfection is unnecessary. Close reasoning tags and output the final response immediately.`);

    if (choices.cot_style === 'OFF') {
        add('cot_off', '🧠 Chain of Thought — Off', false, 'cot_style=OFF: use the model\'s native reasoning; never print reasoning in the response', '');
    }

    return sections;
}

function buildFF54NarratorSystemStack(world, os, contextBlock, options = {}) {
    const sections = resolveFF54Sections(world, os, options);
    // FF's Embellish mode deliberately re-presents player text. That is
    // incompatible with a Sidecar narrator: the player turn is already a
    // visible, immutable record, so re-presenting it can make an NPC appear
    // to have said it. Keep the preference intact for Inline Legacy, but
    // suppress only this conflicting adapter section in Sidecar mode.
    const suppressed = new Set(options.sidecar === true ? ['echo_embellish'] : []);
    const enabled = sections.filter(section => section.enabled && !suppressed.has(section.id));
    const disabled = sections.filter(section => !section.enabled || suppressed.has(section.id))
        .map(section => ({ id: section.id, name: section.name,
            reason: suppressed.has(section.id) ? 'Suppressed in Sidecar mode: player turns remain visible and must not be re-authored.' : section.reason }));
    const wrapper = `[ROLEPLAY OS — FREAKY FRANKENSTEIN 5.4 AGENTIC · HORDE COMPATIBILITY WRAPPER]
You are running the Freaky Frankenstein 5.4 Agentic narrative framework inside Horde Studio. FF shapes how you narrate; Horde owns what is real.

Precedence, highest first:
1. Horde hard application and system authority.
2. Committed Horde canonical world and mechanical state.
3. The compiled Horde Scene Packet / <context> supplied below.
4. Accepted authorial configuration for this world.
5. Freaky Frankenstein narrative instructions.
6. Retrieved history, memories, and examples.
7. The current user turn.
Where an FF default conflicts with this world's authored mechanics or committed canon, Horde wins.

State backend: AGENTS. The engine-managed <context> is an already-committed continuity snapshot. You author current events; you never persist state. Do not emit FF Internal States, macro variables, regex-managed blocks, or any state/tracker/debug/report block.
The single permitted out-of-band block is Horde's hidden <scene_handoff>, described by the separate Sidecar narrator contract. It is an authorial event handoff, not persistent state, and Sidecar alone interprets it.
Time discipline: use only the time evidence supplied in <context>. Never manufacture exact clock times or durations to satisfy a format.
Epistemic discipline: hidden/off-screen facts in <context> are authorial awareness only. Characters know only what they witnessed, were told, or hold as committed cognition.`;
    // Sidecar has one narrator turn with one authoritative system contract.
    // Upstream FF presets often put reasoning/guardrail sections at an
    // in-chat depth with role=user.  That is useful for SillyTavern-style
    // legacy prompting, but it is the wrong authority boundary here: after
    // the player's message those blocks look like fresh user instructions
    // and can override or compete with the scoped Horde context.  Keep the
    // source preset unchanged for Inline Legacy, but fold all non-assistant
    // depth injections into the Sidecar system prompt.
    const sidecar = options.sidecar === true;
    const promptSections = enabled.filter(section =>
        (section.placement || 'system') === 'system'
    );
    const injectedHistory = enabled
        .filter(section => section.placement === 'history')
        .map(section => ({
            role: section.role === 'assistant' ? 'assistant' : (section.role === 'user' ? 'user' : 'system'),
            content: section.content,
            depth: Number(section.depth) || 0
        }))
        // See the comment above: only an intentional assistant prefill is
        // allowed to remain in the conversational history for Sidecar.
        .filter(section => !sidecar || section.role === 'assistant');
    const foldedSidecarSections = sidecar
        ? enabled
            .filter(section => section.placement === 'history' && section.role !== 'assistant')
            .sort((a, b) => (a.order - b.order) || 0)
        : [];
    const prefill = enabled
        .filter(section => section.placement === 'prefill')
        .map(section => section.content)
        .join('\n\n');
    const foldedPrompt = foldedSidecarSections.map(section => section.content).filter(Boolean);
    const prompt = `${wrapper}\n\n${promptSections.map(section => section.content).filter(Boolean).join('\n\n')}${foldedPrompt.length ? `\n\n[SIDECAR-FOLDED PRESET GUARDRAILS]\n${foldedPrompt.join('\n\n')}` : ''}\n\n${contextBlock}`;
    return {
        os: {
            id: os.id, name: os.name, version: os.version, stateMode: os.stateMode, source: os.source,
            sourceId: os.sourceId || '',
            upstream: os.sourcePreset ? {
                presetId: os.sourcePreset.presetId,
                presetName: os.sourcePreset.presetName,
                adapter: FF54_ADAPTER_VERSION,
                contentHash: (os.sourcePreset.provenance || {}).contentHash || ''
            } : null
        },
        choices: os.choices,
        wrapper,
        enabledSections: enabled.map(section => ({ id: section.id, name: section.name, chars: section.chars, reason: section.reason,
            placement: sidecar && section.placement === 'history' && section.role !== 'assistant' ? 'system-folded' : (section.placement || 'system'),
            depth: Number(section.depth) || 0,
            role: sidecar && section.placement === 'history' && section.role !== 'assistant' ? 'system' : (section.role || 'system') })),
        disabledSections: disabled,
        injectedHistory,
        prefill,
        prompt
    };
}

// ---------------------------------------------------------------------------
// FF 5.4 Agentic — Sidecar-native Context Compiler.
// One compiler feeds both context surfaces (the Horde <context> block and the
// FF agent-data markers). Every semantic item Sidecar owns is offered as a
// candidate, assigned to exactly one lane, deduplicated, budgeted, and
// serialized once. Legacy narrator plumbing (Kernel manifest, memory matrix,
// lore/ledger prompt blocks) is NOT injected alongside this block; whatever
// survived it as useful semantic information is routed here instead.
// ---------------------------------------------------------------------------
// Resolve the mechanics registry for a world: an explicit world-level
// registry, the live global named by world.bunnyRxRegistry.globalName (the
// BunnyRx live-import convention), or the shared global.
function worldMechanicsRegistryFor(world) {
    if (world?.mechanicsRegistry) return world.mechanicsRegistry;
    const globalName = String(world?.bunnyRxRegistry?.globalName || '').trim();
    if (globalName && window[globalName]) return window[globalName];
    return window.HordeWorldMechanicsRegistry || null;
}

function compileFF54SidecarContext(world, sess, opt = {}) {
    const packet = experimentalIsPlainObject(opt.packet) ? opt.packet : {};
    const rules = normalizeWorldGameRules(world);
    const ruleModules = (rules && rules.modules) || {};
    const budgetMax = Math.max(4000, parseInt(opt.budget, 10) || 14000);
    const candidates = [];
    let orderCounter = 0;
    const jsonText = value => { try { return JSON.stringify(value); } catch (_) { return ''; } };
    const normKey = text => String(text || '').toLowerCase()
        .replace(/\s+/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 180);
    const add = (lane, label, text, priority, cap, options = {}) => {
        const content = String(text || '').trim();
        orderCounter += 1;
        if (!content) {
            candidates.push({ lane: String(lane), label: String(label || lane), priority: Math.max(1, priority || 3), order: orderCounter, chars: 0, kept: false, reason: 'empty' });
            return;
        }
        const clipped = content.length > cap;
        const candidate = {
            lane: String(lane), label: String(label || lane), priority: Math.max(1, priority || 3),
            order: orderCounter, chars: content.length, mandatory: options.mandatory === true,
            content: clipped ? content.slice(0, cap) + '\n[truncated by context budget]' : content,
            clipped, kept: false, reason: 'pending'
        };
        candidate.key = normKey(candidate.content);
        candidates.push(candidate);
    };

    const castIds = Array.isArray(packet.activeCast) ? packet.activeCast : [];

    // Authorial configuration (precedence layer 4) — one lane, no duplicates.
    add('author_config', 'AUTHORIAL WORLD DIRECTION', world && world.dmPrompt, 1, 5000);
    add('author_config', 'SESSION PREFERENCES', opt.storyPrefsPrompt, 1, 900);
    if (world && world.authorNote) {
        add('author_config', 'AUTHOR NOTE', "[AUTHOR'S NOTE: " + world.authorNote + ']', 1, 900);
    }

    // FF persona stats — controlled character identity + physical state.
    add('agent_persona_stats', 'CONTROLLED CHARACTER', [
        String(opt.personaContext || '').trim(),
        'CURRENT PHYSICAL STATE: ' + jsonText({
            location: String(opt.locName || ''),
            outfit: String(sess.outfit || ''),
            stats: String(opt.statContext || '').trim(),
            status: String((opt.playerRulesState || {}).status || 'active'),
            conditions: Array.isArray((opt.playerRulesState || {}).conditions) ? opt.playerRulesState.conditions : []
        })
    ].filter(Boolean).join('\n\n'), 1, 3600, { mandatory: !!String(opt.personaContext || '').trim() });

    // FF character tracker — active cast state + relationship posture.
    const controlledEntityId = String((packet.activeSequence || {}).controlledEntityId || sess?.controlledEntityId || 'player');
    const relationships = (Array.isArray(world && world.relationships) ? world.relationships : [])
        .filter(record => record && (castIds.indexOf(record.a) !== -1 || castIds.indexOf(record.b) !== -1))
        .slice(-12)
        .map(record => ({ between: [record.a, record.b], label: record.label, score: record.score, reason: record.reason }));
    const scenePulseRelationships = scenePulseRelationshipPromptProjection(sess, castIds, controlledEntityId);
    add('agent_character_tracker', 'ACTIVE CAST', jsonText({
        present_cast: (opt.presentNPCs || []).map(npc => npc && npc.name).filter(Boolean),
        controlled_entity: controlledEntityId,
        activities: packet.activities || null,
        relationships: relationships,
        // The full rich state and the last signed delta are both useful to
        // the Narrator. The vector is relative to the previous ScenePulse
        // source reading, never a replacement for the current meter value.
        scenePulse_relationships: scenePulseRelationships,
        scenePulse_relationship_note: 'ScenePulse meters are current relationship presentation state. lastMeterDeltas are signed changes from the prior accepted source reading; use them as movement, never as the current value.',
        presence_note: 'Committed presence only. A mentioned destination is not arrival; a nearby voice is not physical presence.'
    }), 1, 2200);

    // FF quest tracker — canonical quest state, not legacy prompt formatting.
    add('agent_quest', 'QUEST TRACKER', jsonText(
        (Array.isArray(sess.quests) ? sess.quests : [])
            .filter(quest => quest.status === 'active').slice(0, 12)
            .map(quest => ({
                title: quest.title,
                description: quest.description || '',
                giver: quest.giver || '',
                objectives: (quest.objectives || []).map(objective =>
                    (objective.status || 'active') + ': ' + objective.text + (objective.optional ? ' (optional)' : ''))
            }))
    ), 2, 2200);

    // FF world state — committed scene/time/place evidence.
    add('agent_world_state', 'WORLD STATE', jsonText({
        sequence: packet.activeSequence || null,
        scene: packet.activeScene || null,
        time: {
            clock: String(opt.exactTimeStr || packet.worldTime || ''),
            period: String(opt.period || ''),
            weekday: String(opt.weekdayName || ''),
            day: opt.days,
            temporal_continuity: packet.temporalContinuity || ''
        },
        weather: String(opt.weather || ''),
        location: {
            name: String(opt.locName || (packet.activeLocation || {}).name || ''),
            description: String(opt.locDesc || ''),
            exits: String(opt.locExits || '')
        },
        canonical_frame: opt.canonicalSceneFrame || null,
        recent_committed_events: Array.isArray(opt.recentCanonicalEvents) ? opt.recentCanonicalEvents : [],
        temporal_evidence: packet.temporalEvidence || null,
        semantic_reader: packet.reader ? {
            snapshotId: packet.reader.snapshotId || '', mode: packet.reader.mode || 'delta', summary: packet.reader.summary || '',
            scene: packet.reader.scene || {}, presence: packet.reader.presence || {}, temporal: packet.reader.temporal || {},
            eventClaims: packet.reader.eventClaims || [], unresolvedEvidence: packet.reader.unresolvedEvidence || []
        } : null,
        canonical_status: packet.canonicalStateStatus || ''
    }), 1, 3200);

    if (packet.reader?.provisionalCognition?.length) {
        add('cognition', 'PROVISIONAL CHARACTER COGNITION HINTS', jsonText(packet.reader.provisionalCognition) + '\nThese are uncertain, reader-derived hints scoped to the relevant character only. They are not objective canon and must not be transferred to another character.', 3, 1600);
    }

    // FF inventory tracker.
    if (ruleModules.inventory || ruleModules.equipment) {
        const itemName = item => (globalThis.ExperimentalWorldsRpgMechanics && globalThis.ExperimentalWorldsRpgMechanics.itemName) ? globalThis.ExperimentalWorldsRpgMechanics.itemName(item) : String(item || '');
        add('agent_inventory_tracker', 'INVENTORY', jsonText({
            inventory: (Array.isArray(sess.inventory) ? sess.inventory : []).map(itemName).filter(Boolean),
            equipped: Object.entries(sess.equipment || {}).filter(entry => entry[1]).map(entry =>
                entry[0] + ': ' + itemName((sess.inventory || []).find(item => item && item.id === entry[1])))
        }), 2, 1600);
    }

    // FF Beholder — long-run NPC dossier observations + validated Labs sensor.
    add('agent_beholder', 'OBSERVATIONS', jsonText({
        dossier_claims: String(opt.dossierClaimsContext || '').trim(),
        labs_micro_sensor: String(opt.labsWorldHint || '').trim(),
        note: 'Derived observations, not canonical facts. Newer directly witnessed events override them.'
    }), 3, 2600);

    // Horde-native <context> sections.
    add('cast_knowledge', 'CAST KNOWLEDGE BOUNDARIES', opt.npcContext, 1, 3600);
    const absentParts = [
        String(opt.absentNpcManifest || '').trim(),
        String(opt.referencedNpcContext || '').trim(),
        String(opt.deadNpcManifest || '').trim()
    ].filter(Boolean);
    if (absentParts.length) {
        absentParts.push('ABSENT characters must NOT appear, speak, or act in this scene. If the story needs one of them here, author their arrival clearly and name it in the hidden handoff — characters walk in, they do not materialize.');
        add('absent_cast', 'ABSENT AND DEPARTED CAST', absentParts.join('\n'), 2, 1600);
    }
    const secretBase = String(opt.secretContext || '').trim();
    if (secretBase) {
        add('secrets', 'SCENE SECRETS', secretBase + '\nSecret discipline: LOCKED SECRET entries carry hints only; the truth is withheld from you. If the player investigates a locked secret, do not invent its truth; name an investigate_secret request with the label in the hidden <scene_handoff> so the truth can be prepared for a later beat. Only incorporate a truth already supplied in canonical context. Do not reveal secrets prematurely; foreshadow only.', 2, 2200);
    }
    const diceConfig = opt.diceConfig || {};
    const mechanics = [
        'Rules Profile: ' + (rules && rules.profileId || 'default') + '. Enabled modules: ' + (WORLD_RULE_MODULE_KEYS.filter(key => ruleModules[key]).join(', ') || 'none') + '. Disabled modules: ' + (WORLD_RULE_MODULE_KEYS.filter(key => !ruleModules[key]).join(', ') || 'none') + '.',
        ruleModules.checks
            ? 'Check Engine: d' + diceConfig.sides + ', ' + diceConfig.resolution + ' resolution, ' + diceConfig.visibility + ' visibility. Do not invent a roll or reducer payload. If this beat reaches a mechanically uncertain action, stop at the uncertainty and identify the needed check in the hidden handoff so Sidecar can reconcile it.'
            : 'Check Engine: disabled — resolve through fiction without dice.',
        String(opt.statContext || '').trim() ? 'Player stats: ' + opt.statContext : '',
        'Mechanics are narrative-only in this mode: apply their meaning in prose and leave all mechanical persistence to Horde Sidecar.'
    ].filter(Boolean).join('\n');
    // World mechanics context is candidateized like everything else: the
    // engine emits the smallest mechanically meaningful facts for this
    // audience and these on-stage entities, and each candidate competes
    // for the budget on its own relevance. Mandatory candidates are real:
    // the compiler keeps them even under budget pressure.
    const mechanicsCandidates = window.HordeWorldMechanics?.isEnabled?.(world)
        ? (window.HordeWorldMechanics.contextCandidates?.(world, sess,
            worldMechanicsRegistryFor(world), {
            audience: 'narrator',
            relevantEntityIds: ['player', ...castIds],
            controlledEntityId: 'player',
            locationId: String(sess.playerLocation || ''),
            entityNames: (Array.isArray(world.entities) ? world.entities : [])
                .filter(entity => entity?.id).reduce((map, entity) => {
                    map[entity.id] = String(entity.name || entity.id);
                    return map;
                }, {})
        }) || [])
        : [];
    mechanicsCandidates.forEach(candidate => {
        add(String(candidate.lane || 'mechanics'), String(candidate.title || 'WORLD MECHANICS'),
            candidate.text, Number(candidate.priority) || 1,
            Number(candidate.budgetHint) || 2000,
            { mandatory: candidate.mandatory === true });
    });
    add('mechanics', 'MECHANICS', mechanics, 2, 1600);
    add('engine_events', 'ENGINE EVENTS — WEAVE INTO THIS BEAT', opt.engineEventsPrompt, 1, 1200);
    add('memories', 'SEMANTIC RECALL — derived memory, never objective canon', jsonText(opt.recall), 2, 3000);
    add('memory_summaries', 'VALIDATED MEMORY SUMMARIES', jsonText(opt.replacementMemory), 3, 2200);
    add('questions', 'OPEN QUESTIONS', (packet.pendingQuestions || []).length
        ? 'Unresolved authorial questions; stay consistent with them and answer them in play:\n' + jsonText(packet.pendingQuestions)
        : '', 2, 1400);
    const obligations = {
        reconciliation_backlog: packet.reconciliationBacklog || [],
        pending_requests: packet.pendingRequests || [],
        background_proposals: packet.backgroundProposals || [],
        authorial_refinements: packet.recentAuthorialRefinements || []
    };
    add('obligations', 'RECONCILIATION OBLIGATIONS', jsonText(obligations), 3, 1800);
    add('traversal', 'TRAVERSAL AND VEHICLES', jsonText(packet.traversal || null), 2, 1200);
    add('world_conditions', 'LIVING WORLD', opt.livingWorldPrompt, 3, 2400);
    add('world_conditions', 'SOCIETY', opt.societyPrompt, 3, 1800);
    add('threads', 'OPEN STORY THREADS', opt.threadsPrompt, 3, 1200);
    add('lore', 'TRIGGERED WORLD LORE', opt.relevantLore, 3, 2400);

    // Relevant committed cognition — private character thought, epistemic-restricted.
    const graph = opt.memoryGraph || null;
    const cognition = ((graph && graph.cognition) || [])
        .filter(record => (record.status || 'active') === 'active'
            && (!castIds.length || castIds.indexOf(record.characterId) !== -1))
        .sort((a, b) => (Number(b.importance) || 0) - (Number(a.importance) || 0))
        .slice(0, 8)
        .map(record => ({
            characterId: record.characterId,
            status: record.epistemicStatus || '',
            thought: String(record.text || '').slice(0, 600),
            importance: record.importance,
            confidence: record.confidence
        }));
    add('cognition', 'COMMITTED CHARACTER COGNITION — private, epistemic-restricted', cognition.length
        ? jsonText(cognition) + '\nThis is authorial awareness only. A character acts on only their own committed cognition; it is never a license for omniscience.'
        : '', 2, 1800);

    // --- dedup + budget selection ---
    const kept = [];
    const seenKeys = [];
    let used = 0;
    const sorted = candidates.slice().sort((a, b) => (a.priority - b.priority) || (a.order - b.order));
    sorted.forEach(candidate => {
        if (candidate.reason === 'empty') return;
        if (candidate.key && seenKeys.indexOf(candidate.key) !== -1) { candidate.reason = 'duplicate'; return; }
        const laneTexts = kept.filter(item => item.lane === candidate.lane).map(item => item.key);
        if (candidate.key && laneTexts.some(key => key.indexOf(candidate.key) !== -1 || candidate.key.indexOf(key) !== -1)) {
            candidate.reason = 'contained';
            return;
        }
        // Mandatory candidates cannot lose the budget competition: token
        // budgeting must not silently repeal committed mechanical truth.
        if (!candidate.mandatory && used + candidate.content.length > budgetMax) { candidate.reason = 'over_budget'; return; }
        candidate.kept = true;
        candidate.reason = 'included';
        if (candidate.key) seenKeys.push(candidate.key);
        kept.push(candidate);
        used += candidate.content.length;
    });

    const contextLanes = ['author_config', 'cast_knowledge', 'absent_cast', 'secrets', 'mechanics', 'engine_events', 'memories', 'memory_summaries', 'questions', 'obligations', 'traversal', 'world_conditions', 'threads', 'lore', 'cognition'];
    const agentLanes = ['agent_persona_stats', 'agent_character_tracker', 'agent_quest', 'agent_world_state', 'agent_inventory_tracker', 'agent_beholder'];
    const laneRank = lane => {
        const index = contextLanes.indexOf(lane);
        return index !== -1 ? index : 90;
    };
    const contextSections = kept.filter(candidate => contextLanes.indexOf(candidate.lane) !== -1)
        .sort((a, b) => (laneRank(a.lane) - laneRank(b.lane)) || (a.order - b.order))
        .map(candidate => '[' + candidate.label + ']\n' + candidate.content);
    const agentBlocks = agentLanes.map(lane => {
        const laneCandidates = kept.filter(candidate => candidate.lane === lane);
        if (!laneCandidates.length) return '';
        return '<' + lane + '>\n' + laneCandidates.map(candidate => candidate.content).join('\n\n') + '\n</' + lane + '>';
    }).filter(Boolean);
    const contextBlock = '<context>\nEngine-managed Horde continuity snapshot. It was committed after an earlier completed response; it is prior state, not current-turn output. Current actions may freely change anything it describes; newer directly witnessed events override it. Do not quote it or expose its structure.\n\n' + contextSections.join('\n\n') + '\n</context>\n' + agentBlocks.join('\n');
    const manifest = {
        budget: budgetMax,
        used: used,
        candidateCount: candidates.length,
        includedCount: kept.length,
        droppedCount: candidates.filter(candidate => !candidate.kept).length,
        candidates: candidates.map(candidate => ({
            lane: candidate.lane, label: candidate.label, priority: candidate.priority,
            chars: candidate.chars, clipped: candidate.clipped === true,
            mandatory: candidate.mandatory === true, kept: candidate.kept, reason: candidate.reason
        }))
    };
    return { contextBlock: contextBlock, manifest: manifest };
}


function beginSidecarTurnAttempt(world, sess, options = {}) {
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    if (!protocol) return { protocol: null, turnRecord: null };
    const existing = options.existingTurnRecord || null;
    const attemptId = `sidecar_attempt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const explicitIdentity = String(options.idempotencyKey || '').trim();
    let logicalIdentity = explicitIdentity;
    const turnRecord = existing || {
        id: `sidecar_turn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        status: 'reconciliation_pending',
        reconciliationStatus: 'pending',
        createdAt: new Date().toISOString(),
        // This Take is an authored artifact. Display/context budgets may be
        // bounded later, but a downstream retry must never retry a truncated
        // surrogate of the narration or hidden handoff.
        narration: String(options.narration || ''),
        handoff: String(options.handoff || ''),
        handoffComplete: options.handoffComplete !== false,
        sceneReading: sidecarHandoffSection(options.handoff, 'SCENE READING'),
        acceptedPlayerDetails: sidecarHandoffSection(options.handoff, 'ACCEPTED PLAYER DETAILS'),
        temporalStatement: sidecarTemporalStatement(options.handoff),
        sceneHeader: experimentalSafeJsonClone(options.sceneHeader || null),
        playerInput: String(options.playerInput || ''),
        preFrame: experimentalSafeJsonClone(options.preFrame || buildWorldSceneFrame(world, sess)),
        preClock: experimentalSafeJsonClone(options.preClock || buildSidecarClockEvidence(world, sess)),
        model: String(options.model || ''),
        provider: String(options.provider || ''),
        takeId: String(options.takeId || `take_${options.takeIndex == null ? 0 : options.takeIndex}`),
        revisionId: String(options.revisionId || ''),
        ff54: experimentalSafeJsonClone(sess && sess.sidecar && sess.sidecar.ff54) || null,
        receipt: null,
        audit: null,
        failure: null,
        attempts: [],
        provenance: {
            source: 'narrator_handoff',
            turn: Math.max(1, Number(sess.turnCount) || 1),
            take: Number(options.takeIndex) || 0,
            revisionId: String(options.revisionId || ''),
            handoffComplete: options.handoffComplete !== false
        }
    };
    turnRecord.authorialArtifact = turnRecord.authorialArtifact || {
        narration: turnRecord.narration,
        handoff: turnRecord.handoff,
        playerInput: turnRecord.playerInput,
        narrationHash: worldMediaHash(String(turnRecord.narration || '')),
        handoffHash: worldMediaHash(String(turnRecord.handoff || '')),
        playerInputHash: worldMediaHash(String(turnRecord.playerInput || '')),
        capturedAt: turnRecord.createdAt
    };
    if (!logicalIdentity) {
        const identitySource = options.sourceTurnId || existing?.id || turnRecord.id;
        logicalIdentity = `sidecar:${sess.id || 'timeline'}:${identitySource}:${options.takeId || existing?.takeId || 'take'}:${options.revisionId || existing?.revisionId || 'revision'}`.slice(0, 240);
    }
    if (existing) {
        turnRecord.status = 'reconciliation_pending';
        turnRecord.reconciliationStatus = 'pending';
        turnRecord.failure = null;
        turnRecord.receipt = null;
        turnRecord.audit = null;
        // Preserve preceding attempts for Backstage/retry. Only the current
        // attempt's outcome is reset; a successful Reader result remains a
        // reusable artifact if Sidecar subsequently failed.
        turnRecord.reader = options.readerPacketOverride ? experimentalSafeJsonClone(options.readerPacketOverride) : (turnRecord.reader || null);
        turnRecord.readerEnvelope = turnRecord.readerEnvelope || null;
        turnRecord.retryCount = (Number(turnRecord.retryCount) || 0) + 1;
    }
    turnRecord.attempts = Array.isArray(turnRecord.attempts) ? turnRecord.attempts : [];
    turnRecord.logicalCommitIdentity = logicalIdentity;
    turnRecord.preCanonicalFingerprint = options.preCanonicalFingerprint || turnRecord.preCanonicalFingerprint || sidecarCanonicalCheckpointFingerprint(world, sess);
    turnRecord.preWorldStateVersion = Number(options.preWorldStateVersion ?? turnRecord.preWorldStateVersion ?? sess.worldStateVersion) || 0;
    turnRecord.currentAttemptId = attemptId;
    turnRecord.attempts.push({ id: attemptId, status: 'pending', createdAt: new Date().toISOString(), logicalCommitIdentity: logicalIdentity, readerReused: !!options.readerPacketOverride, source: experimentalSafeJsonClone({ narrationHash: turnRecord.authorialArtifact.narrationHash, handoffHash: turnRecord.authorialArtifact.handoffHash, playerInputHash: turnRecord.authorialArtifact.playerInputHash, preCanonicalFingerprint: turnRecord.preCanonicalFingerprint }) });
    turnRecord.attempts = turnRecord.attempts.slice(-24);
    if (!existing) {
        window.ExperimentalWorldsSidecarTimeline?.recordTurn(protocol, sess, turnRecord);
        protocol.turns.push(turnRecord);
        protocol.turns = protocol.turns.slice(-500);
    }
    if (!experimentalIsPlainObject(protocol.diagnostics)) protocol.diagnostics = {};
    if (!Array.isArray(protocol.diagnostics.reconciliationAttempts)) protocol.diagnostics.reconciliationAttempts = [];
    protocol.diagnostics.reconciliationAttempts.push({
        turnId: turnRecord.id, attemptId, status: 'pending', createdAt: new Date().toISOString(),
        model: turnRecord.model, provider: turnRecord.provider,
        logicalCommitIdentity: logicalIdentity
    });
    protocol.diagnostics.reconciliationAttempts = protocol.diagnostics.reconciliationAttempts.slice(-100);
    protocol.packet = buildSidecarScenePacket(world, sess, turnRecord.handoff);
    return { protocol, turnRecord, attemptId, logicalIdentity };
}

function sidecarCanonicalCheckpointFingerprint(world, sess) {
    return worldMediaHash(JSON.stringify(stableSidecarValue({
        worldStateVersion: Number(sess?.worldStateVersion) || 0,
        playerLocation: sess?.playerLocation || '',
        outfit: sess?.outfit || '',
        worldTime: getWorldTimeData(world, sess),
        entityStates: sess?.entityStates || {},
        nearby: sess?.sceneNearbyCharacters || {},
        receiptCount: Array.isArray(sess?.worldTurnReceipts) ? sess.worldTurnReceipts.length : 0,
        // A Sidecar receipt reads relationships, locations, entities, ledger
        // and world rules as well as the player's frame. A partial frame hash
        // can therefore accept a stale reconciliation after World GM changed
        // one of its inputs. Exclude Sidecar audit/cache fields themselves.
        registry: {
            entities: (world?.entities || []).map(entity => ({ id: entity?.id, type: entity?.type, name: entity?.name, value: entity })).filter(entity => entity.id),
            locations: world?.locations || [],
            relationships: world?.relationships || world?.relationshipRecords || [],
            ledger: world?.ledger || world?.worldLedger || {},
            quests: world?.quests || [],
            obligations: world?.obligations || []
        },
        sessionCanonical: {
            npcRelationships: sess?.npcRelationships || {},
            inventory: sess?.inventory || {},
            ledger: sess?.ledger || '',
            quests: sess?.quests || [],
            obligations: sess?.obligations || []
        }
    })));
}

function failSidecarTurnAttempt(world, sess, attempt, error, detail = {}) {
    const protocol = attempt?.protocol || window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    const turnRecord = attempt?.turnRecord;
    const failure = {
        code: String(detail.code || error?.code || 'sidecar_reconciliation_failed'),
        stage: String(detail.stage || error?.sidecarDetail?.stage || 'reconciliation').slice(0, 40),
        message: String(error?.message || error || 'Sidecar reconciliation failed.').slice(0, 1600),
        finishReason: String(detail.finishReason || ''),
        provider: String(detail.provider || turnRecord?.provider || ''),
        model: String(detail.model || turnRecord?.model || ''),
        failedAt: new Date().toISOString(),
        response: detail.response ? experimentalSafeJsonClone(detail.response) : null
    };
    if (turnRecord) {
        turnRecord.status = 'reconciliation_failed';
        turnRecord.reconciliationStatus = 'failed';
        turnRecord.failure = failure;
        turnRecord.postFrame = buildWorldSceneFrame(world, sess);
        const currentAttempt = (turnRecord.attempts || []).find(item => item.id === turnRecord.currentAttemptId);
        if (currentAttempt) Object.assign(currentAttempt, { status: 'failed', failedAt: failure.failedAt, failure: experimentalSafeJsonClone(failure) });
        (protocol?.readerSnapshots || []).filter(snapshot => snapshot.turnId === turnRecord.id && snapshot.attemptId === turnRecord.currentAttemptId && snapshot.status === 'pending_reconciliation').forEach(snapshot => {
            snapshot.status = 'failed';
            snapshot.provenance = { ...(snapshot.provenance || {}), reconciliationFailure: failure.code };
        });
        (protocol?.proposals || []).filter(proposal => proposal.sourceTurnId === turnRecord.id && proposal.status === 'pending_sidecar_review').forEach(proposal => {
            proposal.status = 'pending_reconciliation';
            proposal.provenance = { ...(proposal.provenance || {}), reconciliationFailure: failure.code };
        });
    }
    const diagnostic = protocol?.diagnostics?.reconciliationAttempts?.find(item => item.turnId === turnRecord?.id && (!turnRecord?.currentAttemptId || item.attemptId === turnRecord.currentAttemptId));
    if (diagnostic) Object.assign(diagnostic, { status: 'failed', failure });
    if (protocol && turnRecord) {
        const incompleteCommit = sess?.sidecarIncompleteCommit && sess.sidecarIncompleteCommit.identity === turnRecord.logicalCommitIdentity;
        const recoveryQuestion = queueSidecarQuestion(world, sess,
            incompleteCommit
                ? 'A Sidecar canonical commit stopped after partial processing. Review the journaled receipt through World GM/native recovery before allowing progression; do not replay the authored prose.'
                : 'The preceding authored beat has not yet been committed to canonical state. On the next pass, reconcile any durable changes from it that remain true; do not replay or embellish the prose.',
            `${failure.message}\n\n${turnRecord.handoff || turnRecord.narration}${incompleteCommit ? `\n\nJournaled incomplete commit: ${sess.sidecarIncompleteCommit.error?.message || ''}` : ''}`, {
                id: `reconcile.transport.${turnRecord.id}`,
                origin: 'reconciliation_transport', target: 'sidecar', pressure: 'high',
                scope: 'turn', sceneId: turnRecord.sceneId, sequenceId: turnRecord.sequenceId,
                provenance: { sourceTurnId: turnRecord.id, finishReason: failure.finishReason }
            });
        if (recoveryQuestion) {
            recoveryQuestion.recoveryOnly = true;
            recoveryQuestion.attemptStatus = 'failed';
            recoveryQuestion.recoveryAttemptId = turnRecord.currentAttemptId || '';
            recoveryQuestion.incompleteCommit = !!incompleteCommit;
        }
        protocol.packet = buildSidecarScenePacket(world, sess, turnRecord.handoff);
    }
    return {
        turnId: turnRecord?.id || '',
        packet: protocol?.packet || null,
        failure,
        backstage: turnRecord ? {
            status: 'reconciliation_failed', handoff: turnRecord.handoff,
            handoffComplete: turnRecord.handoffComplete !== false,
            reader: turnRecord.reader || null, receipt: null, packet: protocol?.packet || null, failure,
            preFrame: turnRecord.preFrame, postFrame: turnRecord.postFrame
        } : null
    };
}

function recordSidecarCoreAnswers(world, sess, handoff) {
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    if (!protocol) return {};
    const answers = protocol.coreAnswers || (protocol.coreAnswers = {});
    SIDECAR_CORE_QUESTION_IDS.forEach(id => {
        const answer = sidecarHandoffAnswer(handoff, id);
        if (!answer) return;
        answers[id] = {
            answer,
            source: 'narrator_handoff',
            answeredTurn: Math.max(1, Number(sess.turnCount) || 1),
            recordedAt: new Date().toISOString()
        };
    });
    return answers;
}

function recordSidecarRequests(world, sess, handoff) {
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    if (!protocol) return [];
    const match = String(handoff || '').match(/(?:REQUESTS?|NARRATIVE\s+REQUESTS?)\s*[:\n]\s*([\s\S]*?)(?=\n\s*(?:ACCEPTED\s+PLAYER\s+DETAILS|ANSWER)\b|$)/i);
    const body = String(match?.[1] || '').trim();
    if (!body || /^(?:none|no change|n\/a)\.?$/i.test(body)) return [];
    const lines = body.split('\n').map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean).slice(0, 12);
    const created = [];
    lines.forEach(text => {
        const prior = protocol.requests.find(request => request.status === 'open' && request.text === text);
        if (prior) return;
        const request = { id: `request_${Date.now().toString(36)}_${protocol.requests.length + 1}`, status: 'open', text: text.slice(0, 1600),
            origin: 'narrator_handoff', createdTurn: Math.max(1, Number(sess.turnCount) || 1), createdAt: new Date().toISOString(), provenance: { source: 'narrator_handoff' } };
        protocol.requests.push(request); created.push(request);
    });
    protocol.requests = protocol.requests.slice(-200);
    return created;
}

function recordSidecarTemporalEvidence(world, sess, handoff, beforeClock, explicitEndpointEvidence = null) {
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    if (!protocol) return null;
    const afterClock = getWorldTimeData(world, sess);
    const authoredMeaning = sidecarTemporalStatement(handoff);
    // The exact clock delta is an existing reducer result. Preserve it beside,
    // never instead of, the Narrator's potentially approximate language.
    protocol.temporalState = {
        id: `temporal_${Date.now().toString(36)}`,
        source: 'narrator_handoff',
        authoredText: authoredMeaning,
        kind: 'semantic',
        authoredMeaning,
        explicitEndpointEvidence: explicitEndpointEvidence ? {
            source: explicitEndpointEvidence.source,
            target: explicitEndpointEvidence.target,
            derivedMinutes: explicitEndpointEvidence.minutes,
            sourceMinuteOfDay: explicitEndpointEvidence.sourceMinuteOfDay,
            targetMinuteOfDay: explicitEndpointEvidence.targetMinuteOfDay,
            basis: explicitEndpointEvidence.basis || 'two_phase_header_and_endpoints',
            readerResolution: experimentalSafeJsonClone(explicitEndpointEvidence.readerResolution || null)
        } : null,
        beforeCanonicalMinutes: beforeClock?.currentTotalMinutes ?? null,
        afterCanonicalMinutes: afterClock.currentTotalMinutes,
        mechanicalDeltaMinutes: beforeClock
            ? afterClock.currentTotalMinutes - beforeClock.currentTotalMinutes : null,
        recordedAt: new Date().toISOString()
    };
    return protocol.temporalState;
}

function buildSidecarScenePacket(world, sess, handoff = '') {
    const frame = buildWorldSceneFrame(world, sess);
    const clock = getWorldTimeData(world, sess);
    const hour12 = clock.hours24 % 12 || 12;
    const location = getLocationRef(world, frame.player_location_id);
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    const hierarchy = window.ExperimentalWorldsSidecarTimeline?.ensureHierarchy(protocol, sess);
    const historyChars = (sess.history || []).reduce((total, message) => total + String(message?.text || '').length, 0);
    const sceneChars = String(world.dmPrompt || '').length + String(world.authorNote || '').length
        + String(location?.description || '').length + String(sess.ledger || '').length;
    const configuredContext = Math.max(1024, Number(world.contextSize) || 8192);
    const contextRatio = Math.min(1, (historyChars + sceneChars) / (configuredContext * 3.5));
    const questions = (protocol?.questions || []).filter(question => question.status === 'open'
        && question.attemptStatus !== 'failed'
        && !SIDECAR_CORE_QUESTION_IDS.includes(question.id)
        && ['narrator', 'user'].includes(question.target || 'narrator')).slice(-8)
        .map(question => ({ id: question.id, prompt: question.prompt, target: question.target, priority: question.priority || question.pressure || 'low', blocking: question.blocking === true, origin: question.origin, evidence: String(question.evidence || '').slice(0, 800) }));
    const reconciliationBacklog = (protocol?.turns || [])
        .filter(turn => ['reconciliation_pending', 'reconciliation_failed'].includes(turn.status)
            && turn.status !== 'superseded')
        .slice(-4)
        .map(turn => ({
            turnId: turn.id,
            status: turn.reconciliationStatus || turn.status,
            sceneReading: String(turn.sceneReading || '').slice(0, 1800),
            acceptedPlayerDetails: String(turn.acceptedPlayerDetails || '').slice(0, 1200),
            temporalStatement: String(turn.temporalStatement || '').slice(0, 800),
            failure: turn.failure ? {
                code: turn.failure.code,
                message: String(turn.failure.message || '').slice(0, 800),
                finishReason: turn.failure.finishReason || ''
            } : null,
            provenance: turn.provenance || null
        }));
    const traversalState = window.ExperimentalWorldsSidecarTraversal?.ensureState(protocol);
    const memoryGraph = window.ExperimentalWorldsSidecarMemoryGraph?.graph(protocol);
    const readerSnapshot = protocol?.readerSnapshots?.filter(snapshot => snapshot.status === 'active').at(-1) || null;
    const pendingReaderSnapshot = !readerSnapshot
        ? protocol?.readerSnapshots?.filter(snapshot => snapshot.status === 'pending_reconciliation').at(-1) || null
        : null;
    const activeJourneys = (traversalState?.journeys || []).filter(journey => journey.status !== 'completed').slice(-4);
    const accessibleVehicles = window.ExperimentalWorldsSidecarTraversal?.accessibleVehicles(world, hierarchy?.sequence?.controlledEntityId || 'player') || [];
    const activeSceneTurns = protocol?.turns?.filter(turn => turn.sceneId === hierarchy?.scene?.id).length || 0;
    const activeSequenceTurns = protocol?.turns?.filter(turn => turn.sequenceId === hierarchy?.sequence?.id).length || 0;
    const openQuestionRecords = (protocol?.questions || []).filter(question => question.status === 'open');
    const canonicalChars = JSON.stringify({ frame, clock, traversal: traversalState?.journeys || [], entityStates: sess.entityStates || {} }).length;
    const retrievedMemoryCount = Number(protocol?.lastRetrievalCount) || 0;
    const pressureFactors = {
        activeCast: frame.present_character_ids?.length || 0,
        blockingQuestions: openQuestionRecords.filter(question => question.blocking === true || question.pressure === 'high').length,
        retrievedMemoryCount,
        canonicalChars,
        sceneChars,
        sequenceTurns: activeSequenceTurns,
        reconciliationFriction: (protocol?.audits || []).filter(audit => Array.isArray(audit.rejected) && audit.rejected.length).length,
        sourceRetirement: (protocol?.turns || []).filter(turn => turn.status === 'superseded').length
    };
    return {
        version: 1,
        generatedAt: new Date().toISOString(),
        worldTime: `${hour12}:${String(clock.mins).padStart(2, '0')} ${clock.hours24 >= 12 ? 'PM' : 'AM'}`,
        activeLocation: { id: frame.player_location_id, name: location?.name || frame.player_location_id },
        canonicalStateStatus: sess?.sidecarIncompleteCommit
            ? 'incomplete_commit_blocked'
            : (reconciliationBacklog.length ? 'prior_authored_beat_pending_reconciliation' : 'reconciled'),
        sceneState: reconciliationBacklog.length
            ? 'Canonical state is unchanged for one or more authored beats whose Sidecar reconciliation did not complete. Their evidence remains pinned below.'
            : 'Canonical state reflects the latest successfully reconciled authored beat.',
        incompleteCommit: sess?.sidecarIncompleteCommit ? {
            identity: sess.sidecarIncompleteCommit.identity || '',
            fingerprint: sess.sidecarIncompleteCommit.fingerprint || '',
            error: sess.sidecarIncompleteCommit.error || null,
            status: 'blocked',
            note: 'A partial canonical mutation was detected. Progression is blocked until native commit/World GM recovery resolves the journaled receipt.'
        } : null,
        // The scene packet is a narrator viewport, so include the controlled
        // actor as well as the NPCs whose canonical presence checksum is kept
        // in `frame.present_character_ids`. The reducer still validates the
        // NPC-only checksum; this display/context field must not be mistaken
        // for a write payload.
        activeCast: ['player', ...frame.present_character_ids],
        nearbyCast: (frame.nearby_characters || []).map(entry => ({
            id: entry.id,
            name: sessionNpcs(world, sess).find(npc => npc.id === entry.id)?.name || entry.id,
            mode: entry.mode,
            reason: entry.reason,
            locationId: entry.location_id
        })),
        activeSequence: hierarchy?.sequence ? {
            id: hierarchy.sequence.id,
            title: hierarchy.sequence.title,
            controlledEntityId: hierarchy.sequence.controlledEntityId,
            transitionMode: hierarchy.sequence.transitionMode
        } : null,
        activeScene: hierarchy?.scene ? {
            id: hierarchy.scene.id,
            title: hierarchy.scene.title,
            mode: hierarchy.scene.mode
        } : null,
        traversal: {
            activeJourneys,
            accessibleVehicles: accessibleVehicles.map(vehicle => ({
                id: vehicle.id, name: vehicle.name, parkedAnchorId: vehicle.vehicle?.parkedAnchorId || vehicle.startLocation || '',
                access: vehicle.vehicle?.access || []
            }))
        },
        memory: memoryGraph ? {
            worldHistoryCount: (memoryGraph.worldHistory || []).filter(record => record.status === 'active').length,
            episodeCount: (memoryGraph.episodes || []).filter(record => record.status === 'active').length,
            sceneMemoryCount: (memoryGraph.scenes || []).filter(record => record.status === 'active').length,
            sequenceMemoryCount: (memoryGraph.sequences || []).filter(record => record.status === 'active').length,
            cognitionCount: (memoryGraph.cognition || []).filter(record => record.status !== 'superseded').length,
            queuedJobs: (protocol?.jobs || []).filter(job => ['queued', 'running'].includes(job.status)).map(job => ({ id: job.id, type: job.type, status: job.status }))
        } : null,
        activities: frame.activities,
        temporalContinuity: handoff ? sidecarTemporalStatement(handoff).slice(0, 600) : String(protocol?.temporalState?.authoredMeaning || '').slice(0, 600),
        temporalEvidence: protocol?.temporalState || null,
        reader: readerSnapshot ? {
            snapshotId: readerSnapshot.id,
            profileRevision: readerSnapshot.envelope?.profileRevision || '',
            mode: readerSnapshot.envelope?.snapshotMode || 'delta',
            summary: readerSnapshot.envelope?.summary || '',
            scene: readerSnapshot.envelope?.scene || {},
            environment: readerSnapshot.envelope?.environment || {},
            presence: readerSnapshot.envelope?.presence || {},
            temporal: readerSnapshot.envelope?.temporal || {},
            // This is author-facing Narrator context, not a character-memory
            // payload. Each claim remains subject-scoped and provisional so
            // later compiler lanes can enforce audience boundaries.
            characterIntelligence: (readerSnapshot.envelope?.characterIntelligence || []).slice(0, 16).map(item => ({
                subjectRef: item.subjectRef || item.candidateId || '', name: item.name || '', presence: item.presence || {},
                activity: item.activity || null, emotionalPosture: item.emotionalPosture || [], attentionFocus: item.attentionFocus || [],
                apparentUnderstanding: item.apparentUnderstanding || [], noticed: item.noticed || [], likelyUnnoticed: item.likelyUnnoticed || [],
                suspicionOrUncertainty: item.suspicionOrUncertainty || [], immediateObjectiveOrConcern: item.immediateObjectiveOrConcern || [],
                sceneLocalImpression: item.sceneLocalImpression || null, epistemicStatus: 'reader_derived_provisional'
            })),
            candidateStructures: (readerSnapshot.envelope?.candidateStructures || []).slice(0, 40),
            eventClaims: (readerSnapshot.envelope?.eventClaims || []).slice(0, 20),
            durableProposals: (readerSnapshot.envelope?.durableProposals || []).slice(0, 12),
            relationshipProposals: (readerSnapshot.envelope?.relationshipProposals || []).slice(0, 12),
            unresolvedEvidence: (readerSnapshot.envelope?.unresolvedEvidence || []).slice(0, 12),
            lookupProvenance: (readerSnapshot.envelope?.lookupProvenance || []).slice(0, 12),
            canonicalReferences: readerSnapshot.envelope?.canonicalReferences || {},
            provisionalCognition: (readerSnapshot.envelope?.provisionalCognition || []).slice(0, 12),
            validationWarnings: (readerSnapshot.envelope?.validationWarnings || []).slice(0, 12),
            provenance: readerSnapshot.provenance || {}
        } : null,
        sceneProjection: protocol?.sceneProjection ? {
            snapshotId: protocol.sceneProjection.snapshotId || '',
            sceneId: protocol.sceneProjection.sceneId || '',
            summary: protocol.sceneProjection.summary || '',
            temporal: protocol.sceneProjection.temporal || {}, location: protocol.sceneProjection.location || {},
            environment: protocol.sceneProjection.environment || {}, scene: protocol.sceneProjection.scene || {},
            people: (protocol.sceneProjection.people || []).slice(0, 16).map(person => ({
                id: person.entityId || person.id || '', name: person.name || '', presence: person.mode || '', location: person.location || '',
                activity: person.activity || '', attention: person.attentionFocus || [], posture: person.emotionalPosture || [],
                provisional: true
            })),
            changes: (protocol.sceneProjection.changes || []).slice(0, 20),
            candidates: activeReaderCandidates(protocol, { sceneId: protocol.sceneProjection.sceneId || hierarchy?.scene?.id || '' }).slice(-80),
            updatedAt: protocol.sceneProjection.updatedAt || '',
            nonCanonical: true
        } : null,
        pendingReaderEvidence: pendingReaderSnapshot ? {
            snapshotId: pendingReaderSnapshot.id,
            status: 'pending_reconciliation',
            turnId: pendingReaderSnapshot.turnId,
            summary: pendingReaderSnapshot.envelope?.summary || '',
            scene: pendingReaderSnapshot.envelope?.scene || {},
            presence: pendingReaderSnapshot.envelope?.presence || {},
            temporal: pendingReaderSnapshot.envelope?.temporal || {},
            candidateStructures: (pendingReaderSnapshot.envelope?.candidateStructures || []).slice(0, 40),
            canonicalReferences: pendingReaderSnapshot.envelope?.canonicalReferences || {},
            note: 'Derived reader evidence is retained for reconciliation but is not canonical until the Sidecar commit succeeds.'
        } : null,
        sceneReading: sidecarHandoffSection(handoff, 'SCENE READING').slice(0, 2400),
        acceptedPlayerDetails: sidecarHandoffSection(handoff, 'ACCEPTED PLAYER DETAILS').slice(0, 2400),
        coreReview: protocol?.coreAnswers || {},
        pendingQuestions: questions,
        reconciliationBacklog,
        pendingRequests: (protocol?.requests || []).filter(request => request.status === 'open').slice(-8)
            .map(request => ({ id: request.id, text: request.text, origin: request.origin })),
        backgroundProposals: (protocol?.backgroundProposals || []).filter(proposal => ['pending_sidecar_review', 'author_approved'].includes(proposal.status))
            .slice(-6).map(proposal => ({ id: proposal.id, turn: proposal.turn, summary: proposal.summary, actions: proposal.actions || {}, status: proposal.status })),
        recentAuthorialRefinements: (protocol?.refinements || []).slice(-6).map(refinement => ({
            text: String(refinement.userText || '').slice(0, 1200),
            committed: refinement.committed === true,
            createdAt: refinement.createdAt || ''
        })),
        contextPressure: window.ExperimentalWorldsSidecarTimeline?.contextPressure(protocol, sess, {
            historyCount: sess.history?.length || 0,
            contextRatio,
            factors: pressureFactors,
            thresholds: {
                watch: ExperimentalWorldsState.globalSettings?.contextPressureWatchThreshold,
                refresh: ExperimentalWorldsState.globalSettings?.contextPressureRefreshThreshold
            }
        }) || null
    };
}

function recordSidecarTrace(world, sess, trace) {
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    if (!protocol?.debug?.enabled) return;
    protocol.debug.traces.push({ id: `trace_${Date.now().toString(36)}`, at: new Date().toISOString(), ...trace });
    protocol.debug.traces = protocol.debug.traces.slice(-Math.max(1, protocol.debug.retainTraceCount || 20));
}

// Sidecar is an authored two-call loop. Keep its live console trail visible
// even when durable trace retention is off: debugging an unexpected state
// result must not depend on a Studio checkbox or an opaque network inspector.
// Request payloads deliberately contain no headers, so API credentials never
// enter the console.
function logSidecarConsoleTrace(stage, payload) {
    const label = `[Horde Sidecar] ${stage}`;
    console.groupCollapsed(label);
    // Stringify rather than logging expandable objects: Chrome's console
    // export/remote inspector otherwise collapses exact prompt/reply evidence
    // to the useless label "Object".
    console.log(JSON.stringify(payload || {}, null, 2));
    console.groupEnd();
}

// The Reader is intentionally incapable of changing canon. It can ask the
// application to inspect small, attributable slices of the active world, then
// gives the Reconciler an evidence packet. This keeps a model from burning its
// commit budget debating whether an already-authored person such as Denton
// Pike exists, while preserving the Reconciler as the only mutation authority.
function sidecarReasoningPolicy(tracker = {}, world = {}) {
    const mode = ['inherit', 'enabled', 'disabled'].includes(tracker.reasoningMode)
        ? tracker.reasoningMode : (tracker.reasoning === true ? 'enabled' : 'inherit');
    const enabled = mode === 'enabled' || (mode === 'inherit' && world.reasoning === true);
    const configured = String(tracker.reasoningEffort || 'auto').toLowerCase();
    if (mode === 'enabled' && ['low', 'medium', 'high'].includes(configured)) return { mode, enabled, effort: configured };
    const narrator = String(world.reasoningEffort || '').toLowerCase();
    return { mode, enabled, effort: ['low', 'medium', 'high'].includes(narrator) ? narrator : 'medium' };
}

function applySidecarReasoning(body, provider, tracker = {}, world = {}, options = {}) {
    const policy = sidecarReasoningPolicy(tracker, world);
    if (!policy.enabled || options.withoutReasoning === true) {
        // Omission is the only compatible fallback for providers whose model
        // mandates native reasoning and rejects an explicit disable request.
        return body;
    }
    const model = String(body.model || '').toLowerCase();
    const supported = Array.isArray(tracker.supportedParams) && tracker.supportedParams.length
        ? tracker.supportedParams : (Array.isArray(world.supportedParams) ? world.supportedParams : []);
    if (supported.includes('reasoning_effort') || /(o1|o3|o4|deepseek)/.test(model)) body.reasoning_effort = policy.effort;
    else body.reasoning = { effort: policy.effort };
    return body;
}

function sidecarSupportsStructuredJson(provider, model, tracker = {}, profile = {}) {
    const advertised = [
        ...(Array.isArray(tracker.supportedParams) ? tracker.supportedParams : []),
        ...(Array.isArray(profile.supportedParams) ? profile.supportedParams : []),
        ...(Array.isArray(ExperimentalWorldsState.globalSettings?.supportedParams) ? ExperimentalWorldsState.globalSettings.supportedParams : [])
    ].map(value => String(value || '').toLowerCase());
    if (advertised.includes('response_format') || advertised.includes('structured_outputs')) return true;
    // Unknown/custom providers stay on the validated prompt+parser fallback
    // path. Use native JSON mode only when the loaded model catalogue has
    // explicitly advertised support for it.
    const catalogue = Array.isArray(globalThis.openRouterModels) ? globalThis.openRouterModels : [];
    const match = catalogue.find(entry => String(entry?.id || '').toLowerCase() === String(model || '').toLowerCase());
    return !!(match && Array.isArray(match.supported_parameters)
        && match.supported_parameters.some(value => ['response_format', 'structured_outputs'].includes(String(value || '').toLowerCase())));
}

// OpenAI-compatible tool schemas are richer than the subset accepted by some
// upstream adapters (notably Google AI Studio via OpenRouter). Keep the
// canonical commit_world_turn contract intact in Horde, but project the
// schema sent to the provider onto the portable function-schema subset. This
// prevents a provider from rejecting the entire reconciliation request before
// it can emit the native reducer call.
function normalizeSidecarProviderSchema(schema) {
    if (!experimentalIsPlainObject(schema)) return schema;
    if (Array.isArray(schema.anyOf) && schema.anyOf.length) {
        // The only current union is the inventory item string/object form.
        // Prefer the object branch when available so named item metadata is
        // retained; the reducer still accepts the resulting object shape.
        const preferred = schema.anyOf.find(item => experimentalIsPlainObject(item) && item.type === 'object') || schema.anyOf[0];
        const normalized = normalizeSidecarProviderSchema(preferred);
        if (schema.description && normalized && !normalized.description) normalized.description = schema.description;
        return normalized;
    }
    const allowed = new Set(['type', 'description', 'properties', 'required', 'items', 'enum', 'maxItems', 'minItems', 'nullable', 'format']);
    const output = {};
    Object.entries(schema).forEach(([key, value]) => {
        if (!allowed.has(key)) return;
        if (key === 'properties' && experimentalIsPlainObject(value)) {
            output.properties = Object.entries(value).reduce((properties, [name, child]) => {
                properties[name] = normalizeSidecarProviderSchema(child);
                return properties;
            }, {});
        } else if (key === 'items') {
            output.items = normalizeSidecarProviderSchema(value);
        } else if (key === 'required' && Array.isArray(value)) {
            output.required = value.filter(name => !output.properties || Object.prototype.hasOwnProperty.call(output.properties, name));
        } else {
            output[key] = value;
        }
    });
    if (Array.isArray(output.required) && output.properties) {
        output.required = output.required.filter(name => Object.prototype.hasOwnProperty.call(output.properties, name));
    }
    return output;
}

function normalizeSidecarProviderTool(tool) {
    const copy = experimentalSafeJsonClone(tool);
    if (copy?.function?.parameters) copy.function.parameters = normalizeSidecarProviderSchema(copy.function.parameters);
    return copy;
}

function sidecarUsesCompactCommitTransport(provider, model, tool) {
    if (tool?.function?.name !== 'commit_world_turn') return false;
    // Gemini's Google AI Studio adapter accepts small OpenAI-compatible
    // function declarations (the Reader proves that path works), but rejects
    // the full recursive world-turn receipt schema even after projection.
    // Keep the compact transport scoped to that strict adapter family.
    const modelId = String(model || '').toLowerCase();
    return ExperimentalWorldsHost.normalizedProviderId(provider) === 'openrouter'
        && /(?:^|[/_-])(?:google|gemini|gemma)(?:[/_.-]|$)/.test(modelId);
}

function compactSidecarCommitTool(tool) {
    const name = String(tool?.function?.name || 'commit_world_turn');
    return {
        type: 'function',
        function: {
            name,
            description: 'Commit one canonical world-turn receipt. Put the complete receipt object — summary, scene, events, entity_updates, and state_updates — into receipt_json as valid JSON text. The engine validates and applies it after this call.',
            parameters: {
                type: 'object',
                properties: {
                    receipt_json: {
                        type: 'string',
                        description: 'A complete JSON world-turn receipt. Example: {"summary":"...","scene":{"player_location_id":"...","player_location_changed":false,"present_character_ids":[]},"events":[],"entity_updates":[],"state_updates":{}}. Do not use Markdown or a code fence.'
                    }
                },
                required: ['receipt_json']
            }
        }
    };
}

function prepareSidecarProviderTool(tool, provider, model) {
    if (sidecarUsesCompactCommitTransport(provider, model, tool)) return compactSidecarCommitTool(tool);
    return normalizeSidecarProviderTool(tool);
}

function sidecarTokenLimitIncomplete(payload) {
    const choice = payload?.choices?.[0] || {};
    const finish = String(choice.finish_reason || choice.native_finish_reason || payload?.status || '').toLowerCase();
    return ['length', 'max_tokens', 'token_limit', 'incomplete'].includes(finish);
}

async function fetchSidecarCompletion(body, { provider, tracker, world, owner, scope = 'sidecar', signal, retryPolicy = 'bounded', forceWithoutReasoning = false } = {}) {
    const policy = sidecarReasoningPolicy(tracker, world);
    const request = async (withoutReasoning, forceCompactCommitTransport = false) => {
        const payload = experimentalSafeJsonClone(body);
        delete payload.reasoning;
        delete payload.reasoning_effort;
        applySidecarReasoning(payload, provider, tracker, world, { withoutReasoning });
        if (Array.isArray(payload.tools)) {
            payload.tools = payload.tools.map(tool => forceCompactCommitTransport && tool?.function?.name === 'commit_world_turn'
                ? compactSidecarCommitTool(tool)
                : prepareSidecarProviderTool(tool, provider, payload.model));
        }
        if (forceCompactCommitTransport && payload.tool_choice?.function?.name === 'commit_world_turn') {
            // Required is the portable OpenAI-compatible equivalent of a
            // forced function when a strict provider rejects the object form.
            payload.tool_choice = 'required';
        }
        return fetch(ExperimentalWorldsHost.providerApiBase(provider) + '/chat/completions', {
            method: 'POST', signal,
            headers: { ...ExperimentalWorldsHost.providerAuthHeaders(provider), 'Content-Type': 'application/json', ...ExperimentalWorldsHost.providerAttributionHeaders(provider) },
            body: JSON.stringify(ExperimentalWorldsHost.applyOpenRouterRouting(payload, owner || world, { scope, providerId: provider }))
        });
    };
    let response = await request(forceWithoutReasoning);
    // A provider may reject optional reasoning parameters even when the model
    // catalogue advertises them. Retry the same request without reasoning so
    // a transient provider capability mismatch cannot strand an otherwise
    // valid native reconciliation receipt.
    if (retryPolicy !== 'none' && !response.ok && policy.enabled && response.status === 400) {
        const detail = await response.clone().text().catch(() => '');
        if (/invalid argument|reasoning|unsupported parameter/i.test(detail)) {
            logSidecarConsoleTrace('Sidecar retry after provider 400', { model: body.model, provider, detail: detail.slice(0, 800) });
            response = await request(true);
        }
    }
    // Keep the complete schema for providers that accept it, but retry once
    // with the compact JSON-string transport when a provider rejects the
    // declaration itself. This is still one native commit tool call from the
    // model's perspective and is decoded before the existing reducer path.
    const hasCommitTool = Array.isArray(body.tools) && body.tools.some(tool => tool?.function?.name === 'commit_world_turn');
    if (retryPolicy !== 'none' && !response.ok && response.status === 400 && hasCommitTool
        && !sidecarUsesCompactCommitTransport(provider, body.model, body.tools.find(tool => tool?.function?.name === 'commit_world_turn'))) {
        const detail = await response.clone().text().catch(() => '');
        if (/invalid argument|tool|function|schema|parameter/i.test(detail)) {
            logSidecarConsoleTrace('Sidecar retry with compact commit transport', { model: body.model, provider, detail: detail.slice(0, 800) });
            response = await request(true, true);
        }
    }
    if (retryPolicy === 'none' || forceWithoutReasoning || !policy.enabled || !response.ok) return response;
    const payload = await response.clone().json().catch(() => null);
    if (!sidecarTokenLimitIncomplete(payload)) return response;
    ExperimentalWorldsHost.notify('Sidecar thought too hard, retrying without reasoning.', 'info');
    logSidecarConsoleTrace('Sidecar retry without optional reasoning', { model: body.model, provider, finishReason: payload?.choices?.[0]?.finish_reason || payload?.choices?.[0]?.native_finish_reason || '' });
    return request(true);
}

function sidecarCanonicalEntityRecord(world, sess, entityId) {
    const view = typeof worldForSession === 'function' ? worldForSession(world, sess) : world;
    const entity = (view?.entities || []).find(item => String(item?.id) === String(entityId));
    if (!entity) return null;
    const runtime = sess.entityStates?.[entity.id] || {};
    return {
        id: String(entity.id), name: String(entity.name || ''), type: String(entity.type || 'npc'),
        aliases: (entity.aliases || []).map(String).slice(0, 12),
        gender: String(entity.gender || '').slice(0, 100),
        currentOutfit: String(entity.currentOutfit || worldCurrentOutfit(entity)?.description || '').slice(0, 1200),
        outfits: entity.type === 'npc' ? worldOutfits(entity).map(outfit => ({ id: outfit.id, name: outfit.name, description: outfit.description, imageCount: (outfit.imageAssetIds || []).length })).slice(0, 30) : [],
        description: String(entity.description || entity.appearance || '').slice(0, 1800),
        tags: (entity.tags || []).map(String).slice(0, 20),
        homeLocationId: String(entity.homeLocation || entity.homeLocationId || ''),
        initialLocationId: String(entity.initialLocation || entity.startLocation || ''),
        currentState: {
            status: String(runtime.status || entity.status || 'active'),
            locationId: String(runtime.location || entity.startLocation || ''),
            activity: String(runtime.currentActivity || ''),
            outfit: String(runtime.outfit || ''),
            conditions: Array.isArray(runtime.conditions) ? runtime.conditions.slice(0, 12).map(String) : []
        },
        provenance: { canonical: true, sessionOwned: entity.sessionOrigin === sess.id }
    };
}

function sidecarCanonicalLocationRecord(world, sess, locationId) {
    const view = typeof worldForSession === 'function' ? worldForSession(world, sess) : world;
    const location = getLocationRef(view, locationId) || (view?.locations || []).find(item => String(item?.id) === String(locationId));
    if (!location) return null;
    return {
        id: String(location.id), name: String(location.name || ''), type: String(location.mapType || location.type || 'location'),
        aliases: (location.aliases || []).map(String).slice(0, 12),
        parentLocationId: String(location.parentLocationId || ''),
        description: String(location.description || '').slice(0, 1800),
        tags: (location.tags || []).map(String).slice(0, 20),
        exits: (location.exits || []).slice(0, 40).map(exit => typeof exit === 'string' ? exit : String(exit?.to || exit?.id || '')),
        provenance: { canonical: true }
    };
}

function sidecarReadOnlyTools() {
    return [
        {
            type: 'function', function: {
                name: 'search_world_state',
                description: 'Search canonical entity and location records by a narrated name, alias, ID, or descriptive phrase. Read-only; never creates anything.',
                parameters: { type: 'object', properties: {
                    query: { type: 'string' }, kinds: { type: 'array', items: { type: 'string', enum: ['entity', 'location'] } }, limit: { type: 'integer', minimum: 1, maximum: 20 }
                }, required: ['query'], additionalProperties: false }
            }
        },
        {
            type: 'function', function: {
                name: 'get_world_entity', description: 'Read a known canonical entity by its exact ID, including current session state. Read-only.',
                parameters: { type: 'object', properties: { entity_id: { type: 'string' } }, required: ['entity_id'], additionalProperties: false }
            }
        },
        {
            type: 'function', function: {
                name: 'get_world_location', description: 'Read a known canonical location by its exact ID, including hierarchy and exits. Read-only.',
                parameters: { type: 'object', properties: { location_id: { type: 'string' } }, required: ['location_id'], additionalProperties: false }
            }
        },
        {
            type: 'function', function: {
                name: 'get_current_scene_state', description: 'Read the current canonical scene frame, clock evidence and open continuity questions. Read-only.',
                parameters: { type: 'object', properties: {}, additionalProperties: false }
            }
        },
        {
            type: 'function', function: {
                name: 'get_prior_scene_snapshots', description: 'Read bounded prior semantic reader snapshots for continuity comparison. Derived evidence only; never canonical mutation.',
                parameters: { type: 'object', properties: {
                    scene_id: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 12 }
                }, additionalProperties: false }
            }
        },
        {
            type: 'function', function: {
                name: 'get_world_records',
                description: 'Read bounded canonical relationship, ledger, thread, quest, obligation, or proposal records relevant to the authored beat. Read-only; never commits or answers a question.',
                parameters: { type: 'object', properties: {
                    kinds: { type: 'array', items: { type: 'string', enum: ['relationship', 'ledger', 'thread', 'quest', 'obligation', 'proposal'] } },
                    query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 30 }
                }, required: ['kinds'], additionalProperties: false }
            }
        }
    ];
}

function sidecarReaderReadOnlyProtocol(world, sess) {
    // The normal timeline normalizer heals missing containers in place.  That
    // is useful for Horde's runtime, but a Reader lookup is an inspection
    // operation and must not mutate canonical state merely by asking a
    // question. Normalize isolated copies so default fields are available
    // without creating a hidden write path.
    const worldCopy = experimentalSafeJsonClone(world || {});
    const sessCopy = experimentalSafeJsonClone(sess || {});
    return window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(worldCopy, sessCopy) || null;
}

function runSidecarReadOnlyTool(world, sess, name, rawArgs) {
    const args = experimentalIsPlainObject(rawArgs) ? rawArgs : experimentalSafeParseJSONRepair(String(rawArgs || '{}')) || {};
    if (name === 'get_world_entity') {
        const entity = sidecarCanonicalEntityRecord(world, sess, args.entity_id);
        return { found: !!entity, entity };
    }
    if (name === 'get_world_location') {
        const location = sidecarCanonicalLocationRecord(world, sess, args.location_id);
        return { found: !!location, location };
    }
    if (name === 'get_current_scene_state') {
        const protocol = sidecarReaderReadOnlyProtocol(world, sess);
        return {
            found: true, scene: buildWorldSceneFrame(world, sess), clock: buildSidecarClockEvidence(world, sess),
            reader: protocol?.sceneReader || null,
            questions: (protocol?.questions || []).filter(question => ['open', 'deferred'].includes(question.status)).slice(-12)
        };
    }
    if (name === 'get_prior_scene_snapshots') {
        const protocol = sidecarReaderReadOnlyProtocol(world, sess);
        const sceneId = String(args.scene_id || '').trim();
        const limit = Math.max(1, Math.min(12, Number(args.limit) || 6));
        const snapshots = (protocol?.readerSnapshots || [])
            .filter(snapshot => snapshot.status !== 'superseded' && (!sceneId || snapshot.sceneId === sceneId))
            .slice(-limit)
            .map(snapshot => ({
                id: snapshot.id, status: snapshot.status, turnId: snapshot.turnId,
                sceneId: snapshot.sceneId, sequenceId: snapshot.sequenceId,
                envelope: {
                    schemaVersion: snapshot.envelope?.schemaVersion || 1,
                    snapshotMode: snapshot.envelope?.snapshotMode || 'delta',
                    summary: snapshot.envelope?.summary || '',
                    scene: snapshot.envelope?.scene || {},
                    presence: snapshot.envelope?.presence || {},
                    temporal: snapshot.envelope?.temporal || {},
                    sourceTurnId: snapshot.envelope?.sourceTurnId || ''
                }
            }));
        return { found: snapshots.length > 0, sceneId, snapshots, provenance: { readOnly: true, source: 'sidecar_reader_snapshots' } };
    }
    if (name === 'get_world_records') {
        const protocol = sidecarReaderReadOnlyProtocol(world, sess);
        const requested = new Set(Array.isArray(args.kinds) ? args.kinds : []);
        const query = String(args.query || '').trim().toLowerCase();
        const limit = Math.max(1, Math.min(30, Number(args.limit) || 12));
        const matches = value => {
            if (!query) return true;
            try { return JSON.stringify(value).toLowerCase().includes(query); } catch (_) { return false; }
        };
        const result = {};
        if (requested.has('relationship')) result.relationships = Object.entries(sess.npcRelationships || {}).slice(-limit).map(([id, value]) => ({ id, value })).filter(matches);
        if (requested.has('ledger')) result.ledger = String(sess.ledger || '').slice(-Math.min(6000, Number(effectiveSidecarReaderProfile(world, sess).maxLookupPayload) || 6000));
        if (requested.has('thread')) result.threads = (protocol?.threads || world.storyThreads || world.threads || []).slice(-limit).filter(matches);
        if (requested.has('quest')) result.quests = (protocol?.quests || world.quests || []).slice(-limit).filter(matches);
        if (requested.has('obligation')) result.obligations = (protocol?.obligations || sess.obligations || []).slice(-limit).filter(matches);
        if (requested.has('proposal')) result.proposals = (protocol?.proposals || []).filter(item => ['open', 'pending', 'pending_sidecar_review', 'author_approved'].includes(item.status || 'open')).slice(-limit).filter(matches);
        return { found: Object.values(result).some(value => Array.isArray(value) ? value.length : String(value || '').length > 0), query: String(args.query || ''), records: result, provenance: { readOnly: true, source: 'canonical_world_and_timeline_records' } };
    }
    if (name === 'search_world_state') {
        const needle = String(args.query || '').toLowerCase().trim();
        const kinds = new Set(Array.isArray(args.kinds) && args.kinds.length ? args.kinds : ['entity', 'location']);
        const limit = Math.max(1, Math.min(20, Number(args.limit) || 8));
        const manifest = buildSidecarCanonicalReferenceManifest(world, sess, needle);
        const score = record => {
            const corpus = [record.id, record.name, ...(record.aliases || [])].join(' ').toLowerCase();
            if (!needle) return record.referenced ? 2 : 0;
            if (corpus === needle) return 12;
            if (corpus.includes(needle)) return 8;
            return needle.split(/\s+/).reduce((total, token) => total + (token.length > 2 && corpus.includes(token) ? 1 : 0), 0);
        };
        const entities = kinds.has('entity') ? manifest.entities.map(record => ({ ...record, _score: score(record) })).filter(record => record._score > 0).sort((a, b) => b._score - a._score).slice(0, limit).map(({ _score, ...record }) => record) : [];
        const locations = kinds.has('location') ? manifest.locations.map(record => ({ ...record, _score: score(record) })).filter(record => record._score > 0).sort((a, b) => b._score - a._score).slice(0, limit).map(({ _score, ...record }) => record) : [];
        return { found: entities.length + locations.length > 0, query: String(args.query || ''), entities, locations };
    }
    return { found: false, error: `Unknown read-only Sidecar tool: ${String(name || '')}` };
}

// Retired Reader-v1 adapters are deliberately not part of the runtime. Keep
// their historical migration code isolated under uncallable names while old
// saved-session migrations are retired; all active paths use the v2 Reader
// declarations below.
function retiredSidecarReaderV1ParseOutput(content, fallback = {}) {
    // Providers vary between string content and OpenAI content-part arrays.
    // Normalize both forms before JSON repair so a valid reader envelope is
    // not mistaken for an empty/invalid response.
    const normalizedContent = Array.isArray(content)
        ? content.map(part => typeof part === 'string' ? part : String(part?.text || part?.content || '')).filter(Boolean).join('\n')
        : (experimentalIsPlainObject(content) ? (content.text || content.content || '') : content);
    const raw = String(normalizedContent || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const parsed = experimentalSafeParseJSONRepair(raw);
    if (!experimentalIsPlainObject(parsed)) return {
        valid: false, summary: 'The Sidecar Reader returned no usable structured reading.',
        canonicalReferences: fallback, unresolved: [], proposedQuestions: [], raw: raw.slice(0, 12000)
    };
    const interpretation = experimentalIsPlainObject(parsed.semantic_interpretation)
        ? parsed.semantic_interpretation
        : (experimentalIsPlainObject(parsed.semanticInterpretation) ? parsed.semanticInterpretation : {});
    const semanticInterpretation = {
        ...interpretation,
        scene: interpretation.scene || interpretation.scene_state || parsed.scene || parsed.scene_state || {},
        location: interpretation.location || interpretation.location_state || parsed.location || parsed.location_state || {},
        presence: interpretation.presence || interpretation.cast || parsed.presence || parsed.cast || {},
        events: interpretation.events || interpretation.event_claims || parsed.events || parsed.event_claims || [],
        durableProposals: interpretation.durableProposals || interpretation.durable_proposals || parsed.durableProposals || parsed.durable_proposals || [],
        relationshipProposals: interpretation.relationshipProposals || interpretation.relationship_proposals || parsed.relationshipProposals || parsed.relationship_proposals || [],
        provisionalCognition: interpretation.provisionalCognition || interpretation.provisional_cognition || parsed.provisionalCognition || parsed.provisional_cognition || [],
        candidateStructures: interpretation.candidateStructures || interpretation.candidate_structures || interpretation.candidates || parsed.candidateStructures || parsed.candidate_structures || parsed.candidates || []
    };
    return {
        valid: true,
        mode: parsed.mode === 'full' ? 'full' : 'delta',
        changedFields: Array.isArray(parsed.changed_fields || parsed.changedFields) ? (parsed.changed_fields || parsed.changedFields).map(item => String(item || '').slice(0, 120)).filter(Boolean).slice(0, 80) : [],
        summary: String(parsed.summary || parsed.scene_reading || '').slice(0, 6000),
        canonicalReferences: experimentalIsPlainObject(parsed.canonical_references || parsed.canonicalReferences) ? (parsed.canonical_references || parsed.canonicalReferences) : fallback,
        semanticInterpretation,
        durableProposals: Array.isArray(semanticInterpretation.durableProposals)
            ? semanticInterpretation.durableProposals.slice(0, 40) : [],
        relationshipProposals: Array.isArray(semanticInterpretation.relationshipProposals)
            ? semanticInterpretation.relationshipProposals.slice(0, 40) : [],
        candidateStructures: Array.isArray(semanticInterpretation.candidateStructures)
            ? semanticInterpretation.candidateStructures.slice(0, 80) : [],
        reconciliationFocus: Array.isArray(parsed.reconciliation_focus || parsed.reconciliationFocus) ? (parsed.reconciliation_focus || parsed.reconciliationFocus).slice(0, 30) : [],
        unresolved: Array.isArray(parsed.unresolved) ? parsed.unresolved.slice(0, 20) : [],
        proposedQuestions: Array.isArray(parsed.proposed_questions || parsed.proposedQuestions) ? (parsed.proposed_questions || parsed.proposedQuestions).slice(0, 12) : [],
        timeEvidence: parsed.time_evidence || parsed.timeEvidence || null,
        controlledCharacterEvidence: (Array.isArray(parsed.controlled_character_evidence || parsed.controlledCharacterEvidence) ? (parsed.controlled_character_evidence || parsed.controlledCharacterEvidence) : [])
            .filter(item => experimentalIsPlainObject(item)).slice(0, 12).map(item => ({
                evidence: String(item.evidence || '').slice(0, 800),
                provenance: ['user_explicit_action', 'user_explicit_dialogue', 'narrator_paraphrase', 'sidecar_interpretation', 'behavioural_pattern_inference'].includes(item.provenance) ? item.provenance : 'sidecar_interpretation'
            })),
        raw: raw.slice(0, 12000)
    };
}

function retiredSidecarReaderV1NormalizeEnvelope(raw = {}, defaults = {}) {
    const source = experimentalIsPlainObject(raw) ? raw : {};
    const cleanList = (value, limit = 40) => Array.isArray(value) ? value.slice(0, limit).map(item => experimentalIsPlainObject(item) ? experimentalSafeJsonClone(item) : String(item || '').slice(0, 800)) : [];
    return {
        schemaVersion: 1,
        profileRevision: String(source.profileRevision || defaults.profileRevision || 'reader-v1').slice(0, 100),
        promptRevision: String(source.promptRevision || defaults.promptRevision || 'semantic-reader-v1').slice(0, 120),
        sourceTurnId: String(source.sourceTurnId || defaults.sourceTurnId || '').slice(0, 160),
        sourceTakeId: String(source.sourceTakeId || defaults.sourceTakeId || '').slice(0, 160),
        sourceRevisionId: String(source.sourceRevisionId || defaults.sourceRevisionId || '').slice(0, 160),
        visibleNarrationHash: String(source.visibleNarrationHash || defaults.visibleNarrationHash || '').slice(0, 120),
        handoffHash: String(source.handoffHash || defaults.handoffHash || '').slice(0, 120),
        snapshotMode: source.snapshotMode === 'full' ? 'full' : 'delta',
        changedFields: Array.isArray(source.changedFields || source.changed_fields) ? (source.changedFields || source.changed_fields).map(item => String(item || '').slice(0, 120)).filter(Boolean).slice(0, 80) : [],
        refreshIndex: Math.max(0, Number(source.refreshIndex || defaults.refreshIndex) || 0),
        temporal: experimentalIsPlainObject(source.temporal) ? experimentalSafeJsonClone(source.temporal) : { meaning: '', precision: 'unknown', source: '' },
        canonicalReferences: experimentalIsPlainObject(source.canonicalReferences) ? experimentalSafeJsonClone(source.canonicalReferences) : {},
        location: experimentalIsPlainObject(source.location) ? experimentalSafeJsonClone(source.location) : { activeLocationId: '', movement: [], evidence: '' },
        presence: experimentalIsPlainObject(source.presence) ? experimentalSafeJsonClone(source.presence) : { active: [], nearby: [], audible: [], remote: [], mentioned: [], absent: [] },
        scene: experimentalIsPlainObject(source.scene) ? experimentalSafeJsonClone(source.scene) : { topic: '', mood: '', tension: '', interactionStyle: '', sound: '', environment: '' },
        eventClaims: cleanList(source.eventClaims, 80),
        candidateStructures: cleanList(source.candidateStructures || source.candidate_structures || source.candidates, 80),
        durableProposals: cleanList(source.durableProposals, 40),
        relationshipProposals: cleanList(source.relationshipProposals, 40),
        unresolvedEvidence: cleanList(source.unresolvedEvidence || source.unresolved, 40),
        validationWarnings: cleanList(source.validationWarnings || source.warnings, 40),
        provisionalCognition: cleanList(source.provisionalCognition, 40),
        lookupProvenance: cleanList(source.lookupProvenance, 60),
        semanticInterpretation: experimentalIsPlainObject(source.semanticInterpretation) ? experimentalSafeJsonClone(source.semanticInterpretation) : {},
        controlledCharacterEvidence: cleanList(source.controlledCharacterEvidence, 20),
        summary: String(source.summary || '').slice(0, 6000),
        reconciliationFocus: cleanList(source.reconciliationFocus, 30),
        metadata: experimentalIsPlainObject(source.metadata) ? experimentalSafeJsonClone(source.metadata) : {}
    };
}

function retiredSidecarReaderV1MergeEnvelope(previous, delta, options = {}) {
    const prior = normalizeSidecarReaderEnvelope(previous || {}, options);
    const incoming = normalizeSidecarReaderEnvelope(delta || {}, options);
    if (incoming.snapshotMode === 'full' || !previous) return incoming;
    const merged = { ...prior, ...incoming };
    const arrayFields = ['eventClaims', 'candidateStructures', 'durableProposals', 'relationshipProposals', 'unresolvedEvidence', 'validationWarnings', 'provisionalCognition', 'lookupProvenance', 'controlledCharacterEvidence', 'reconciliationFocus'];
    arrayFields.forEach(field => {
        const changed = Array.isArray(incoming.changedFields) && incoming.changedFields.length
            ? incoming.changedFields.map(value => String(value).replace(/_/g, '').toLowerCase()) : null;
        const normalizedField = field.replace(/[A-Z]/g, match => match.toLowerCase());
        if (!Object.prototype.hasOwnProperty.call(delta || {}, field)
            && !Object.prototype.hasOwnProperty.call(delta || {}, field.replace(/[A-Z]/g, match => `_${match.toLowerCase()}`))) merged[field] = prior[field];
        if (changed && !changed.some(value => value === normalizedField.replace(/_/g, '').toLowerCase() || value.includes(normalizedField.replace(/_/g, '').toLowerCase()))) merged[field] = prior[field];
        if (incoming.snapshotMode === 'full' && !incoming.changedFields.length && !incoming[field]?.length && prior[field]?.length) merged[field] = prior[field];
    });
    ['temporal', 'location', 'presence', 'scene', 'semanticInterpretation', 'metadata', 'canonicalReferences'].forEach(field => {
        if (!Object.prototype.hasOwnProperty.call(delta || {}, field)) merged[field] = prior[field];
        const changed = Array.isArray(incoming.changedFields) ? incoming.changedFields.map(value => String(value).replace(/_/g, '').toLowerCase()) : [];
        if (changed.length && !changed.some(value => value === field.toLowerCase() || value.includes(field.toLowerCase()))) merged[field] = prior[field];
        if (incoming.snapshotMode === 'full' && !incoming.changedFields.length && !Object.keys(incoming[field] || {}).length && Object.keys(prior[field] || {}).length) merged[field] = prior[field];
    });
    return normalizeSidecarReaderEnvelope(merged, options);
}

function retiredSidecarReaderV1AttachSnapshot(world, sess, turnRecord, packet, options = {}) {
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    if (!protocol || !turnRecord || !packet) return null;
    const profile = options.profile || effectiveSidecarReaderProfile(world, sess);
    const source = {
        ...packet,
        profileRevision: profile.revision,
        promptRevision: profile.promptRevision,
        sourceTurnId: turnRecord.id,
        sourceTakeId: turnRecord.takeId || options.takeId || '',
        sourceRevisionId: turnRecord.revisionId || options.revisionId || '',
        visibleNarrationHash: worldMediaHash(String(turnRecord.narration || '')),
        handoffHash: worldMediaHash(String(turnRecord.handoff || '')),
        refreshIndex: (Number(options.refreshIndex) || 0),
        snapshotMode: options.fullRefresh ? 'full' : (packet.mode === 'full' ? 'full' : 'delta'),
        temporal: packet.timeEvidence || packet.temporal || {},
        scene: packet.semanticInterpretation?.scene || packet.scene || {},
        location: packet.semanticInterpretation?.location || packet.location || {},
        presence: packet.semanticInterpretation?.presence || packet.presence || {},
        eventClaims: packet.semanticInterpretation?.events || packet.semanticInterpretation?.eventClaims || packet.eventClaims || [],
        candidateStructures: packet.semanticInterpretation?.candidateStructures || packet.semanticInterpretation?.candidate_structures || packet.candidateStructures || packet.candidate_structures || packet.candidates || [],
        durableProposals: packet.semanticInterpretation?.durableProposals || packet.durableProposals || [],
        relationshipProposals: packet.semanticInterpretation?.relationshipProposals || packet.relationshipProposals || [],
        provisionalCognition: packet.semanticInterpretation?.provisionalCognition || packet.semanticInterpretation?.provisional_cognition || packet.provisionalCognition || [],
        lookupProvenance: packet.lookupProvenance || [],
        canonicalReferences: packet.canonicalReferences || {},
        unresolvedEvidence: packet.unresolved || [],
        validationWarnings: packet.validationWarnings || [],
        controlledCharacterEvidence: packet.controlledCharacterEvidence || [],
        summary: packet.summary || '',
        reconciliationFocus: packet.reconciliationFocus || [],
        metadata: { model: packet.model || '', provider: packet.provider || '', finishReason: packet.finishReason || '', rounds: packet.rounds || 1, capturedAt: new Date().toISOString() }
    };
    const previous = protocol.readerSnapshots.filter(snapshot => snapshot.status === 'active').at(-1)?.envelope || null;
    const envelope = mergeSidecarReaderEnvelope(previous, source, { profileRevision: profile.revision, promptRevision: profile.promptRevision, sourceTurnId: turnRecord.id, fullRefresh: options.fullRefresh });
    const snapshot = { id: `reader_snapshot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, status: 'pending_reconciliation', createdAt: new Date().toISOString(), turnId: turnRecord.id, takeId: turnRecord.takeId || '', sceneId: turnRecord.sceneId || protocol.activeSceneId || '', sequenceId: turnRecord.sequenceId || protocol.activeSequenceId || '', envelope, provenance: { source: 'sidecar_semantic_reader', profileRevision: profile.revision, readerMode: envelope.snapshotMode, priorSnapshotId: protocol.readerSnapshots.filter(item => item.status === 'active').at(-1)?.id || '' } };
    protocol.readerSnapshots.push(snapshot);
    protocol.readerSnapshots = protocol.readerSnapshots.slice(-200);
    turnRecord.readerEnvelope = experimentalSafeJsonClone(envelope);
    turnRecord.readerSnapshotId = snapshot.id;
    // Pending Reader evidence remains attempt-local. Publishing it into the
    // next-turn packet here would let an invalid/failed reconciliation leak
    // subjective inference into live continuity.
    return snapshot;
}

function activateSidecarReaderSnapshot(world, sess, snapshotId, turnId = '') {
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    const snapshot = protocol?.readerSnapshots?.find(item => item.id === snapshotId);
    if (!snapshot) return null;
    protocol.readerSnapshots.forEach(item => {
        if (item.id !== snapshot.id && item.status === 'active') {
            item.status = 'accepted_historical'; item.historicalAt = new Date().toISOString();
        }
    });
    snapshot.status = 'active'; snapshot.settlementStatus = 'settled'; snapshot.activatedAt = new Date().toISOString();
    snapshot.provenance = { ...(snapshot.provenance || {}), committedTurnId: turnId || snapshot.turnId };
    protocol.sceneReader = experimentalSafeJsonClone(snapshot.envelope);
    const scene = (protocol.scenes || []).find(item => item.id === snapshot.sceneId);
    if (scene) {
        scene.readerSnapshotId = snapshot.id;
        scene.readerState = experimentalSafeJsonClone({ summary: snapshot.envelope.summary, scene: snapshot.envelope.scene, presence: snapshot.envelope.presence, temporal: snapshot.envelope.temporal, candidateStructures: snapshot.envelope.candidateStructures || [], nonCanonical: true });
    }
    return snapshot;
}

// Scene Projection is a read-only, human-facing join of one accepted Reader
// interpretation and its canonical checkpoint. It deliberately carries more
// information than the token-budgeted narrator packet; no render path should
// need to rediscover relevance from the complete Character Registry.
function sidecarProjectionDisplayName(world, sess, hierarchy, ref = '') {
    const id = String(ref || '');
    if (id === 'player' || id === hierarchy?.sequence?.controlledEntityId || id === sess?.controlledEntityId) {
        return String(sess?.playerIdentity?.name || sess?.persona?.name || 'You');
    }
    return String((world?.entities || []).find(entity => String(entity?.id) === id)?.name || id || 'Unknown');
}

function sidecarProjectionClaimText(value) {
    if (Array.isArray(value)) return value.map(sidecarProjectionClaimText).filter(Boolean).join(' · ');
    if (experimentalIsPlainObject(value)) return String(value.text || value.summary || value.description || value.value || '').trim();
    return String(value || '').trim();
}

function sidecarProjectionPresenceEntries(values, mode, displayName) {
    return (Array.isArray(values) ? values : []).map(value => {
        const raw = experimentalIsPlainObject(value) ? value : { id: value };
        const id = String(raw.characterId || raw.character_id || raw.entityId || raw.entity_id || raw.id || raw.subjectRef || raw.subject_ref || '').trim();
        return {
            id, mode: String(raw.mode || mode || '').trim().toLowerCase(), name: String(raw.name || (id ? displayName(id) : raw.label || '')).trim(),
            location: String(raw.location || raw.locationId || raw.location_id || raw.localSpace || raw.local_space || '').trim(),
            channel: String(raw.channel || '').trim(), reason: String(raw.reason || raw.evidence || raw.relevanceReason || '').trim(),
            source: experimentalSafeJsonClone(raw)
        };
    }).filter(entry => entry.id || entry.name);
}

function buildSidecarSceneProjection(world, sess, protocol, options = {}) {
    const hierarchy = window.ExperimentalWorldsSidecarTimeline?.ensureHierarchy?.(protocol, sess, { createWhenMissing: false }) || {};
    const snapshotId = String(options.snapshotId || '').trim();
    const snapshot = snapshotId
        ? (protocol?.readerSnapshots || []).find(item => item.id === snapshotId && ['active', 'accepted_historical'].includes(item.status))
        : (protocol?.readerSnapshots || []).filter(item => item.status === 'active').at(-1);
    const envelope = snapshot?.envelope || options.envelope || null;
    const turn = options.turn || (protocol?.turns || []).find(item => item.id === snapshot?.turnId) || null;
    const frame = options.frame || turn?.postFrame || buildWorldSceneFrame(world, sess);
    const displayName = ref => sidecarProjectionDisplayName(world, sess, hierarchy, ref);
    const canonicalLocation = getLocationRef(world, envelope?.location?.activeLocationId || envelope?.location?.active_location_id || frame?.player_location_id || sess?.playerLocation);
    const parents = [];
    let parentId = canonicalLocation?.parentLocationId;
    const seenParents = new Set();
    while (parentId && !seenParents.has(parentId) && parents.length < 8) {
        seenParents.add(parentId);
        const parent = getLocationRef(world, parentId);
        if (!parent) break;
        parents.unshift({ id: parent.id, name: parent.name || parent.id });
        parentId = parent.parentLocationId;
    }
    const presence = envelope?.presence || {};
    const bySubject = new Map();
    ['active', 'nearby', 'audible', 'remote', 'mentioned', 'absent'].forEach(mode => {
        sidecarProjectionPresenceEntries(presence[mode], mode, displayName).forEach(entry => {
            const key = entry.id || `name:${entry.name.toLowerCase()}`;
            const prior = bySubject.get(key);
            bySubject.set(key, { ...(prior || {}), ...entry, mode: entry.mode || prior?.mode || mode });
        });
    });
    (envelope?.characterIntelligence || []).forEach(intelligence => {
        const subjectRef = String(intelligence.subjectRef || intelligence.candidateId || intelligence.name || '').trim();
        if (!subjectRef) return;
        const key = subjectRef;
        const prior = bySubject.get(key) || {};
        const mode = String(intelligence.presence?.mode || prior.mode || '').toLowerCase();
        bySubject.set(key, {
            ...prior, id: intelligence.subjectRef || prior.id || '', name: intelligence.name || prior.name || displayName(intelligence.subjectRef),
            mode, location: intelligence.presence?.location || prior.location || '', channel: intelligence.presence?.channel || prior.channel || '',
            reason: intelligence.relevance?.reason || prior.reason || '', intelligence: experimentalSafeJsonClone(intelligence),
            candidateId: intelligence.candidateId || prior.candidateId || ''
        });
    });
    const controlledId = String(hierarchy?.sequence?.controlledEntityId || sess?.controlledEntityId || 'player');
    if (!bySubject.has(controlledId)) bySubject.set(controlledId, {
        id: controlledId, name: displayName(controlledId), mode: 'active', location: canonicalLocation?.id || '', channel: 'in_scene', reason: 'controlled character'
    });
    const relevantModes = new Set(['active', 'nearby', 'audible']);
    const relevantPeople = [...bySubject.values()].filter(person => {
        if (relevantModes.has(person.mode)) return true;
        if (person.mode === 'remote') return !!(person.channel || person.reason || person.intelligence?.relevance?.reason);
        // A name alone belongs in detail/diff, not the default scene roster.
        return !!(person.intelligence?.relevance?.reason || person.reason) && person.mode !== 'absent';
    }).map(person => {
        const entity = (world?.entities || []).find(item => String(item?.id) === String(person.id)) || null;
        const state = sess?.entityStates?.[person.id] || {};
        const intelligence = person.intelligence || null;
        return {
            ...person, entityId: entity?.id || person.id || '', entity, candidate: null, state: experimentalSafeJsonClone(state),
            canonical: !!entity, activity: sidecarProjectionClaimText(intelligence?.activity) || String(state.currentActivity || state.activity || ''),
            emotionalPosture: intelligence?.emotionalPosture || [], attentionFocus: intelligence?.attentionFocus || [],
            apparentUnderstanding: intelligence?.apparentUnderstanding || [], noticed: intelligence?.noticed || [], likelyUnnoticed: intelligence?.likelyUnnoticed || [],
            suspicionOrUncertainty: intelligence?.suspicionOrUncertainty || [], interpersonalPostures: intelligence?.interpersonalPostures || [],
            immediateObjectiveOrConcern: intelligence?.immediateObjectiveOrConcern || [], sceneLocalImpression: intelligence?.sceneLocalImpression || null,
            goals: intelligence?.goals || {}, visibleState: intelligence?.visibleState || {}, changedDimensions: intelligence?.changedDimensions || [],
            appearance: String(entity?.appearance || entity?.description || ''), relevance: intelligence?.relevance || { reason: person.reason || '' }
        };
    }).sort((left, right) => {
        const rank = value => ({ active: 0, nearby: 1, audible: 2, remote: 3 })[value.mode] ?? 4;
        return rank(left) - rank(right) || String(left.name).localeCompare(String(right.name));
    });
    const candidates = activeReaderCandidates(protocol, { sceneId: turn?.sceneId || snapshot?.sceneId || hierarchy?.scene?.id || '' })
        .filter(candidate => !snapshot || !candidate.readerSnapshotId || candidate.readerSnapshotId === snapshot.id || candidate.sourceTurnIds?.includes(snapshot.turnId))
        .map(candidate => experimentalSafeJsonClone(candidate));
    const candidateById = new Map(candidates.map(candidate => [String(candidate.candidateId || ''), candidate]));
    relevantPeople.forEach(person => { if (person.candidateId && candidateById.has(person.candidateId)) person.candidate = candidateById.get(person.candidateId); });
    const openQuestions = (protocol?.questions || []).filter(question => ['open', 'deferred'].includes(question.status)
        && (!question.sceneId || question.sceneId === (turn?.sceneId || snapshot?.sceneId || hierarchy?.scene?.id))).map(question => experimentalSafeJsonClone(question));
    const environment = experimentalSafeJsonClone(envelope?.environment || {});
    const scene = experimentalSafeJsonClone(envelope?.scene || {});
    const temporal = experimentalSafeJsonClone(envelope?.temporal || {});
    const projection = {
        schemaVersion: 2, status: snapshot ? 'settled' : 'no_reader_data', id: `scene_projection:${snapshot?.id || turn?.id || 'none'}`,
        snapshotId: snapshot?.id || '', turnId: turn?.id || snapshot?.turnId || '', sceneId: turn?.sceneId || snapshot?.sceneId || hierarchy?.scene?.id || '',
        sequenceId: turn?.sequenceId || snapshot?.sequenceId || hierarchy?.sequence?.id || '', createdAt: snapshot?.activatedAt || snapshot?.createdAt || '',
        temporal, location: {
            canonicalId: canonicalLocation?.id || '', name: canonicalLocation?.name || envelope?.location?.name || 'Unknown location',
            parentLocations: parents, localSpace: String(envelope?.location?.localSpace || envelope?.location?.local_space || '').trim(),
            authoredDescription: String(envelope?.location?.description || envelope?.location?.evidence || '').trim()
        }, environment, scene, scenePulse: experimentalSafeJsonClone(envelope?.scenePulse || {}), people: relevantPeople, candidateStructures: candidates,
        relationships: experimentalSafeJsonClone([...(envelope?.relationshipPostures || []), ...(envelope?.relationshipShifts || [])]),
        canonicalRelationships: experimentalSafeJsonClone(sess?.npcRelationships || {}), salientObjects: experimentalSafeJsonClone(envelope?.salientObjects || []),
        salientLocations: experimentalSafeJsonClone(envelope?.salientLocations || []), pressures: experimentalSafeJsonClone([...(envelope?.pressures || []), ...(envelope?.currentThreads || [])]),
        questions: openQuestions, changes: experimentalSafeJsonClone(envelope?.changes || []), unresolved: experimentalSafeJsonClone(envelope?.unresolvedEvidence || []),
        summary: String(envelope?.summary || '').trim(), coverage: experimentalSafeJsonClone(envelope?.coverage || {}),
        provenance: { readerSnapshotId: snapshot?.id || '', sourceTurnId: turn?.id || snapshot?.turnId || '', sourceTakeId: snapshot?.takeId || turn?.takeId || '', sourceRevisionId: snapshot?.envelope?.sourceRevisionId || turn?.revisionId || '' }
    };
    return projection;
}

function sidecarSettlementIdentity(turnRecord, receipt = {}) {
    const turnId = String(turnRecord?.id || receipt?.turn_id || 'turn');
    const takeId = String(turnRecord?.takeId || receipt?.take_id || 'take');
    const revisionId = String(turnRecord?.revisionId || receipt?.revision_id || 'revision');
    return `scene_settlement:${turnId}:${takeId}:${revisionId}`.slice(0, 280);
}

function sidecarTurnNeedsDownstreamRecovery(turn = {}) {
    const status = String(turn?.status || '').toLowerCase();
    const reconciliation = String(turn?.reconciliationStatus || turn?.reconciliation_status || '').toLowerCase();
    return ['reconciliation_failed', 'reconciliation_pending', 'settlement_incomplete'].includes(status)
        || ['failed', 'pending', 'reconciliation_failed', 'reconciliation_pending', 'canonical_committed_publication_incomplete'].includes(reconciliation);
}

// Array position is not continuity. Opening bootstrap, retries, refreshes and
// historical repairs can append bookkeeping records out of authored-message
// order. The current workspace/retry surface must instead follow the latest
// visible narrator artifact in this timeline.
function currentSidecarAuthoredTurn(protocol, sess) {
    if (!protocol || !sess) return null;
    const turns = (protocol.turns || []).filter(turn => turn && turn.status !== 'superseded');
    const byId = new Map(turns.map(turn => [String(turn.id || ''), turn]));
    for (const message of [...(sess.history || [])].reverse()) {
        if (message?.role !== 'dm') continue;
        const id = String(message.sidecarTurnId || message.sidecarBackstage?.sidecarTurnId || '').trim();
        if (id && byId.has(id)) return byId.get(id);
    }
    return turns.slice().sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || ''))).at(-1) || null;
}

function sidecarCognitionAccessForPresence(mode = '') {
    const normalized = String(mode || '').toLowerCase();
    if (normalized === 'active') return 'visual';
    if (normalized === 'nearby' || normalized === 'audible') return 'auditory';
    if (normalized === 'remote') return 'informational';
    return 'unknown';
}

function sidecarTurnCognitionEvidence(intelligence = {}) {
    const fields = [
        ['activity', intelligence.activity], ['emotional posture', intelligence.emotionalPosture], ['attention', intelligence.attentionFocus],
        ['apparent understanding', intelligence.apparentUnderstanding], ['noticed', intelligence.noticed], ['likely missed', intelligence.likelyUnnoticed],
        ['uncertainty', intelligence.suspicionOrUncertainty], ['concern', intelligence.immediateObjectiveOrConcern], ['impression', intelligence.sceneLocalImpression]
    ];
    return fields.map(([label, value]) => {
        const text = sidecarProjectionClaimText(value);
        return text ? `${label}: ${text}` : '';
    }).filter(Boolean).join('\n').slice(0, 8000);
}

// Live ScenePulse-style thought assessments are durable source-pinned inputs
// to the existing cognition graph. They are not durable memories themselves,
// and their jobs use the same provider concurrency/throttling as Episode work.
function queueSidecarTurnCognitionJobs(world, sess, protocol, turnRecord, projection = null) {
    if (!protocol || !turnRecord?.readerSnapshotId || !turnRecord?.readerEnvelope) return [];
    const jobs = window.ExperimentalWorldsSidecarMemoryGraph?.ensureJobs?.(protocol) || [];
    const readerSnapshotId = String(turnRecord.readerSnapshotId || '').trim();
    const reader = turnRecord.readerEnvelope;
    const people = projection?.people || (reader.characterIntelligence || []).map(intelligence => ({
        id: intelligence.subjectRef || intelligence.candidateId || '', candidateId: intelligence.candidateId || '', mode: intelligence.presence?.mode || '', intelligence
    }));
    const queued = [];
    people.forEach(person => {
        const intelligence = person.intelligence || (reader.characterIntelligence || []).find(item => item.subjectRef === person.id || item.candidateId === person.candidateId);
        if (!intelligence) return;
        const subjectRef = String(intelligence.subjectRef || intelligence.candidateId || person.id || person.candidateId || '').trim();
        const mode = String(intelligence.presence?.mode || person.mode || '').toLowerCase();
        if (!subjectRef || !['active', 'nearby', 'audible', 'remote'].includes(mode)) return;
        if (String(intelligence.status || '').toLowerCase() === 'unconscious') return;
        const evidence = sidecarTurnCognitionEvidence(intelligence);
        // A genuinely unsupported subject stays recorded in the Reader
        // coverage but does not waste a character-model call pretending it has
        // usable perception evidence.
        if (!evidence) return;
        const baseId = `turn_cognition:${turnRecord.id}:${subjectRef}`.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 180);
        const subjectJobs = jobs.filter(job => job.type === 'turn_cognition'
            && String(job.turnId || '') === String(turnRecord.id || '')
            && String(job.subjectRef || job.characterId || job.candidateId || '') === subjectRef);
        // One accepted Reader reading gets one cognition job. A focused
        // ScenePulse reread of that same settled turn is a new, inspectable
        // derived reading: do not silently retain cognition grounded in the
        // prior snapshot, but never erase it either.
        if (subjectJobs.some(job => String(job.readerSnapshotId || '') === readerSnapshotId)) return;
        const id = `${baseId}${subjectJobs.length ? `:${readerSnapshotId}` : ''}`.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 220);
        const revisedAt = new Date().toISOString();
        subjectJobs.forEach(job => {
            job.status = 'superseded';
            job.supersededAt = revisedAt;
            job.supersededByReaderSnapshotId = readerSnapshotId;
            job.supersededByJobId = id;
        });
        const memory = window.ExperimentalWorldsSidecarMemoryGraph?.graph?.(protocol);
        (memory?.cognition || []).forEach(record => {
            if (!subjectJobs.some(job => job.id === record.turnCognitionJobId) || record.status !== 'active') return;
            record.status = 'superseded';
            record.supersededAt = revisedAt;
            record.supersededByReaderSnapshotId = readerSnapshotId;
            record.provenance = { ...(record.provenance || {}), supersededByReaderSnapshotId: readerSnapshotId, supersededByJobId: id };
        });
        const canonicalEntity = (world.entities || []).find(entity => String(entity?.id) === subjectRef);
        const candidate = !canonicalEntity ? (protocol.readerCandidates || []).find(item => item.candidateId === subjectRef || item.candidateId === intelligence.candidateId) : null;
        jobs.push({
            id, type: 'turn_cognition', status: 'queued', createdAt: new Date().toISOString(), attempts: 0,
            turnId: turnRecord.id, sourceTurnIds: [turnRecord.id], sceneId: turnRecord.sceneId || protocol.activeSceneId || '',
            sequenceId: turnRecord.sequenceId || protocol.activeSequenceId || '', readerSnapshotId,
            characterId: canonicalEntity?.id || '', candidateId: candidate?.candidateId || intelligence.candidateId || '', subjectRef,
            access: sidecarCognitionAccessForPresence(mode), perceptionEvidence: evidence, provisionalIntelligence: experimentalSafeJsonClone(intelligence),
            dependencies: [], priority: 'background', retryAt: '', diagnostics: [],
            provenance: { source: 'settled_reader_character_intelligence', sourceTurnId: turnRecord.id, readerSnapshotId: turnRecord.readerSnapshotId, subjectKind: canonicalEntity ? 'canonical_entity' : 'scene_candidate' }
        });
        queued.push(id);
    });
    return queued;
}

// Publish derived Reader state in an isolated protocol draft. Canonical state
// has already been changed by the native receipt at this point; this function
// must therefore either publish a complete derived bundle or leave the former
// settled bundle visible and report a recoverable publication failure. It
// never reruns the receipt or restores a whole world snapshot.
function publishSidecarSettlement(world, sess, protocol, options = {}) {
    if (!protocol || !options.turnRecord) throw new Error('A Sidecar settlement needs a timeline protocol and authored turn.');
    const turnRecord = options.turnRecord;
    const settlementId = sidecarSettlementIdentity(turnRecord, options.receipt);
    const existing = (protocol.settlements || []).find(entry => entry.id === settlementId);
    if (existing?.status === 'settled') return { status: 'already_settled', settlement: existing, projection: experimentalSafeJsonClone(protocol.sceneProjection || null), packet: protocol.packet || null };
    const originalProtocol = sess.sidecar;
    const draftSeed = experimentalSafeJsonClone(protocol);
    // All of the existing staging helpers resolve the protocol from the
    // session. Point them at an isolated draft for the publication window.
    sess.sidecar = draftSeed;
    try {
        const draft = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
        if (!draft) throw new Error('Could not open an isolated Sidecar settlement draft.');
        if (!Array.isArray(draft.settlements)) draft.settlements = [];
        const draftTurn = draft.turns.find(item => item.id === turnRecord.id);
        if (!draftTurn) throw new Error('The authored Sidecar turn disappeared before derived settlement.');
        const now = new Date().toISOString();
        const stagedPacket = draftTurn.reader || options.readerPacket || {};
        draftTurn.settlementId = settlementId;
        const stagedIntroductions = window.ExperimentalWorldsSidecarPromotion?.stageReceiptIntroductions(draft, experimentalSafeJsonClone(options.introductionDraft || {}), {
            source: 'narrator_handoff', narration: options.narration || '', handoff: options.handoff || '', turnId: draftTurn.id
        }) || [];
        recordSidecarCoreAnswers(world, sess, options.handoff || '');
        recordSidecarRequests(world, sess, options.handoff || '');
        recordSidecarReaderProposals(world, sess, stagedPacket, draftTurn, draftTurn.readerSnapshotId || '');
        recordSidecarReaderCandidates(world, sess, stagedPacket, draftTurn, draftTurn.readerSnapshotId || '');
        queueSidecarReaderQuestions(world, sess, stagedPacket, draftTurn);
        recordSidecarTemporalEvidence(world, sess, options.handoff || '', options.preClock, options.explicitEndpointEvidence || null);
        (draft.backgroundProposals || []).filter(proposal => ['pending_sidecar_review', 'author_approved'].includes(proposal.status)).forEach(proposal => {
            proposal.status = 'sidecar_reviewed'; proposal.reviewedAt = now; proposal.reviewReceiptId = options.receipt?.turn_id || '';
            proposal.reviewOutcome = options.committed?.audit?.rejected?.length ? 'reviewed_with_rejections' : 'reviewed_no_automatic_commit';
        });
        queueSidecarReconciliationQuestions(world, sess, options.committed?.audit);
        const reconciledPriorIds = Array.isArray(options.receipt?.state_updates?.reconciled_prior_turn_ids)
            ? options.receipt.state_updates.reconciled_prior_turn_ids.map(String) : [];
        reconciledPriorIds.forEach(id => {
            const prior = draft.turns.find(item => item.id === id && item.reconciliationStatus === 'failed');
            if (!prior) return;
            prior.status = 'reconciled_late'; prior.reconciliationStatus = 'committed_late'; prior.reconciledByTurnId = draftTurn.id; prior.reconciledAt = now;
            updateSidecarQuestion(world, sess, `reconcile.transport.${id}`, { status: 'resolved', resolutionType: 'later_sidecar_reconciliation', answer: `Reconciled by ${draftTurn.id}.`, provenance: { source: 'sidecar_receipt', turnId: draftTurn.id } });
        });
        draftTurn.status = 'active'; draftTurn.reconciliationStatus = 'committed'; draftTurn.committedAt = now;
        draftTurn.receiptTurnId = String(options.receipt?.turn_id || ''); draftTurn.postFrame = experimentalSafeJsonClone(options.postFrame || buildWorldSceneFrame(world, sess));
        draftTurn.postClock = experimentalSafeJsonClone(options.postClock || buildSidecarClockEvidence(world, sess)); draftTurn.receipt = experimentalSafeJsonClone(options.receipt || {});
        draftTurn.audit = experimentalSafeJsonClone(options.committed?.audit || {}); draftTurn.explicitEndpointEvidence = experimentalSafeJsonClone(options.explicitEndpointEvidence || null);
        draftTurn.provisionalIntroductions = stagedIntroductions.map(entry => entry.id); draftTurn.settledAttemptId = options.attemptId || draftTurn.currentAttemptId || '';
        draftTurn.readerProposalDrafts = null; draftTurn.readerCandidateDrafts = null; draftTurn.readerQuestionDrafts = null; draftTurn.settlementWarning = null;
        if (draftTurn.readerSnapshotId) activateSidecarReaderSnapshot(world, sess, draftTurn.readerSnapshotId, draftTurn.id);
        const projection = buildSidecarSceneProjection(world, sess, draft, { turn: draftTurn, snapshotId: draftTurn.readerSnapshotId, frame: draftTurn.postFrame });
        projection.settlementId = settlementId;
        (draft.sceneProjections || []).forEach(item => { if (item.status === 'active') { item.status = 'accepted_historical'; item.historicalAt = now; } });
        draft.sceneProjections = (draft.sceneProjections || []).filter(item => item.id !== projection.id);
        draft.sceneProjections.push({ ...experimentalSafeJsonClone(projection), status: 'active', settledAt: now });
        draft.sceneProjections = draft.sceneProjections.slice(-400);
        draft.sceneProjection = experimentalSafeJsonClone(projection);
        const settlement = { id: settlementId, status: 'settled', turnId: draftTurn.id, takeId: draftTurn.takeId || '', revisionId: draftTurn.revisionId || '', attemptId: draftTurn.settledAttemptId, readerSnapshotId: draftTurn.readerSnapshotId || '', receiptFingerprint: options.committed?.audit?.receiptFingerprint || '', receiptTurnId: draftTurn.receiptTurnId, publishedAt: now, projectionId: projection.id };
        draft.settlements = [...draft.settlements.filter(item => item.id !== settlementId), settlement].slice(-500);
        const currentAttempt = draftTurn.attempts?.find(item => item.id === (options.attemptId || draftTurn.currentAttemptId));
        if (currentAttempt) Object.assign(currentAttempt, { status: 'committed', committedAt: now, receiptFingerprint: settlement.receiptFingerprint, settlementId });
        const diagnostic = draft.diagnostics?.reconciliationAttempts?.find(item => item.turnId === draftTurn.id && (!options.attemptId || item.attemptId === options.attemptId));
        if (diagnostic) Object.assign(diagnostic, { status: 'committed', committedAt: now, receiptTurnId: draftTurn.receiptTurnId, audit: experimentalSafeJsonClone(options.committed?.audit), explicitEndpointEvidence: experimentalSafeJsonClone(options.explicitEndpointEvidence || null), settlementId });
        window.ExperimentalWorldsSidecarMemoryGraph?.recordTurn(draft, draftTurn);
        draftTurn.turnCognitionJobIds = queueSidecarTurnCognitionJobs(world, sess, draft, draftTurn, projection);
        queueSidecarSceneOutfitQuestions(world, sess, draftTurn);
        const memoryConfig = effectiveSidecarMemoryConfig(world);
        window.ExperimentalWorldsSidecarMemoryGraph?.queueEpisode(draft, { batchSize: memoryConfig.episodeChunkTurns, cadenceTurns: memoryConfig.episodeCadenceTurns });
        draft.packet = buildSidecarScenePacket(world, sess, options.handoff || '');
        sess.sidecarDerivedSettlementIncomplete = null;
        return { status: 'settled', settlement, projection, packet: draft.packet, protocol: draft };
    } catch (error) {
        // Discard the unpublished derived draft. Canonical mutation is never
        // rolled back here; the caller records canonical/settlement-incomplete
        // evidence and exposes the safe recovery action.
        sess.sidecar = originalProtocol;
        throw error;
    }
}

function queueSidecarReaderQuestions(world, sess, readerPacket, turnRecord) {
    const proposed = Array.isArray(readerPacket?.proposedQuestions) ? readerPacket.proposedQuestions : [];
    proposed.forEach((proposal, index) => {
        const prompt = typeof proposal === 'string' ? proposal : String(proposal?.prompt || proposal?.question || '');
        if (!prompt.trim()) return;
        const target = typeof proposal === 'object' && ['narrator', 'sidecar', 'user'].includes(proposal.target) ? proposal.target : 'narrator';
        const priority = typeof proposal === 'object' && ['low', 'medium', 'high'].includes(proposal.priority) ? proposal.priority : 'low';
        queueSidecarQuestion(world, sess, prompt, typeof proposal === 'object' ? String(proposal.evidence || proposal.reason || '') : '', {
            id: typeof proposal === 'object' && proposal.id ? String(proposal.id).slice(0, 180) : `reader.${turnRecord?.id || 'turn'}.${index + 1}`,
            origin: 'semantic_reader', target, priority, pressure: priority,
            scope: 'turn', sceneId: turnRecord?.sceneId || '', sequenceId: turnRecord?.sequenceId || '',
            provenance: { sourceTurnId: turnRecord?.id || '', source: 'sidecar_reader' }
        });
    });
}

// Reader proposals are durable evidence for the Reconciler/Backstage, never a
// second mutation path.  Keeping them on the shared proposal ledger means
// World GM, reroll cleanup, and later memory jobs can inspect the exact
// candidate without confusing it for a committed ledger/relationship fact.
function recordSidecarReaderProposals(world, sess, readerPacket, turnRecord, snapshotId = '') {
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    if (!protocol || !turnRecord || !readerPacket) return [];
    const entries = [];
    const groups = [
        ['durableProposals', 'durable_fact'],
        ['relationshipProposals', 'relationship'],
        ['unresolved', 'unresolved_evidence']
    ];
    groups.forEach(([field, kind]) => {
        const values = Array.isArray(readerPacket?.[field]) ? readerPacket[field] : [];
        values.forEach((value, index) => {
            const proposal = experimentalIsPlainObject(value) ? experimentalSafeJsonClone(value) : { summary: String(value || '') };
            const summary = String(proposal.summary || proposal.fact || proposal.reason || proposal.prompt || proposal.question || '').trim().slice(0, 1600);
            if (!summary) return;
            const stable = `reader.${turnRecord.id}.${kind}.${index + 1}`.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 180);
            const existing = (protocol.proposals || []).find(item => item.id === stable);
            const record = existing || {
                id: stable, type: kind, status: 'pending_sidecar_review', createdAt: new Date().toISOString(),
                sourceTurnId: turnRecord.id, sourceTakeId: turnRecord.takeId || '', sourceRevisionId: turnRecord.revisionId || '',
                readerSnapshotId: snapshotId, evidence: [], provenance: { source: 'sidecar_semantic_reader', turnId: turnRecord.id, readerSnapshotId: snapshotId }
            };
            record.summary = summary;
            record.candidate = proposal;
            record.evidence = [...(record.evidence || []), {
                at: new Date().toISOString(), visibleNarrationHash: worldMediaHash(String(turnRecord.narration || '')),
                handoffHash: worldMediaHash(String(turnRecord.handoff || '')), reader: proposal
            }].slice(-8);
            record.updatedAt = new Date().toISOString();
            if (!existing) protocol.proposals.push(record);
            entries.push(record);
        });
    });
    protocol.proposals = (protocol.proposals || []).slice(-400);
    return entries;
}

// ScenePulse's character cards are richer than a generic candidate label.
// When the Reader supplied both shapes in the *same packet*, retain a compact
// observed character record beside the pre-canonical candidate. This is not a
// name-based registry lookup: a stable id wins, and a display-name fallback is
// admitted only when it identifies exactly one source character in this one
// accepted scene reading. The record remains scene evidence until an explicit
// candidate graduation chooses to use it.
function scenePulseCharacterEvidenceForCandidate(readerPacket, candidate = {}) {
    const scenePulse = readerPacket?.semanticInterpretation?.scenePulse || readerPacket?.scenePulse || {};
    const characters = Array.isArray(scenePulse?.characters) ? scenePulse.characters.filter(isPlainObject).slice(0, 80) : [];
    if (!characters.length) return null;
    const candidateIds = new Set([
        candidate?.candidateId, candidate?.characterId, candidate?.subjectRef,
        candidate?.canonicalMatchId, candidate?.id
    ].map(value => String(value || '').trim()).filter(Boolean));
    const characterIds = character => [
        character?.id, character?.characterId, character?.character_id,
        character?.candidateId, character?.candidate_id, character?.subjectRef,
        character?.subject_ref, character?.canonicalId, character?.canonical_id
    ].map(value => String(value || '').trim()).filter(Boolean);
    let matches = candidateIds.size
        ? characters.filter(character => characterIds(character).some(id => candidateIds.has(id)))
        : [];
    if (matches.length !== 1) {
        const labels = new Set([candidate?.label, candidate?.name]
            .map(value => String(value || '').trim().toLowerCase()).filter(Boolean));
        if (!labels.size) return null;
        matches = characters.filter(character => [character?.name, ...(Array.isArray(character?.aliases) ? character.aliases : [])]
            .map(value => String(value || '').trim().toLowerCase()).some(label => labels.has(label)));
    }
    if (matches.length !== 1) return null;
    const source = matches[0];
    const text = (value, limit) => String(value || '').trim().slice(0, limit);
    const inventory = Array.isArray(source.inventory)
        ? source.inventory.map(value => text(value, 240)).filter(Boolean).slice(0, 40)
        : text(source.inventory, 1800);
    const evidence = {
        name: text(source.name, 240), aliases: (Array.isArray(source.aliases) ? source.aliases : [])
            .map(value => text(value, 180)).filter(Boolean).slice(0, 24),
        hair: text(source.hair, 600), face: text(source.face, 600), outfit: text(source.outfit, 1200),
        posture: text(source.posture, 400), proximity: text(source.proximity, 400),
        notableDetails: text(source.notableDetails, 1200), inventory,
        fertStatus: text(source.fertStatus, 240), fertNotes: text(source.fertNotes, 1200),
        immediateNeed: text(source.immediateNeed, 800), shortTermGoal: text(source.shortTermGoal, 800),
        longTermGoal: text(source.longTermGoal, 1200)
    };
    return Object.values(evidence).some(value => Array.isArray(value) ? value.length : value) ? evidence : null;
}

// A complete ScenePulse character card already has a stable source identity.
// Providers occasionally omit the parallel candidateStructures array to save
// tokens, which must not make that card disappear from Horde's explicit
// review scaffold.  Derive the *pre-canonical* candidate from the accepted
// source card in that narrow case.  This deliberately never consults a World
// record or treats a display name as an identity match: an explicitly supplied
// canonical ID stays out of this bridge, and an id-less card stays ScenePulse
// presentation only.
function scenePulseCharacterCardIdentity(card = {}) {
    const source = experimentalIsPlainObject(card) ? card : {};
    return [source.candidateId, source.candidate_id, source.characterId,
        source.character_id, source.id, source.subjectRef, source.subject_ref]
        .map(value => String(value || '').trim()).find(Boolean) || '';
}

function scenePulseCharacterCardEvidence(card = {}, sourceTurnId = '', readerSnapshotId = '') {
    const source = experimentalIsPlainObject(card) ? card : {};
    const text = [source.role, source.immediateNeed, source.shortTermGoal,
        source.longTermGoal, source.notableDetails]
        .map(value => String(value || '').trim()).filter(Boolean).join(' · ').slice(0, 1800);
    return {
        source: 'accepted_scenepulse_character_card', sourceTurnId: String(sourceTurnId || '').slice(0, 180),
        readerSnapshotId: String(readerSnapshotId || '').slice(0, 180), text
    };
}

function scenePulseCharacterCardHistory(protocol, candidateId = '') {
    const identity = String(candidateId || '').trim();
    if (!identity) return [];
    return (protocol?.readerSnapshots || [])
        .filter(snapshot => ['active', 'accepted_historical'].includes(String(snapshot?.status || ''))
            && snapshot?.settlementStatus === 'settled')
        .map(snapshot => {
            const cards = Array.isArray(snapshot?.envelope?.scenePulse?.characters)
                ? snapshot.envelope.scenePulse.characters : [];
            const card = cards.find(item => experimentalIsPlainObject(item)
                && scenePulseCharacterCardIdentity(item) === identity) || null;
            if (!card) return null;
            return {
                sourceTurnId: String(snapshot?.turnId || '').trim(), readerSnapshotId: String(snapshot?.id || '').trim(),
                card, evidence: scenePulseCharacterCardEvidence(card, snapshot?.turnId, snapshot?.id)
            };
        }).filter(Boolean).slice(-30);
}

function scenePulseCharacterCandidatesFromCards(readerPacket, protocol, turnRecord, snapshotId = '', rawCandidates = []) {
    const scenePulse = readerPacket?.semanticInterpretation?.scenePulse || readerPacket?.scenePulse || {};
    const cards = Array.isArray(scenePulse?.characters) ? scenePulse.characters.filter(isPlainObject).slice(0, 80) : [];
    const rawIds = new Set((Array.isArray(rawCandidates) ? rawCandidates : []).filter(isPlainObject).flatMap(candidate => [
        candidate.candidateId, candidate.candidate_id, candidate.characterId, candidate.character_id,
        candidate.id, candidate.subjectRef, candidate.subject_ref
    ]).map(value => String(value || '').trim()).filter(Boolean));
    const knownIds = new Set((protocol?.readerCandidates || []).flatMap(candidate => [
        candidate?.candidateId, candidate?.canonicalMatchId
    ]).map(value => String(value || '').trim()).filter(Boolean));
    return cards.map(card => {
        const candidateId = scenePulseCharacterCardIdentity(card);
        const label = String(card?.name || '').trim().slice(0, 240);
        const explicitCanonicalId = String(card?.canonicalId || card?.canonical_id || '').trim();
        if (!candidateId || !label || card?._isPrimary === true || explicitCanonicalId || rawIds.has(candidateId) || knownIds.has(candidateId)) return null;
        const history = scenePulseCharacterCardHistory(protocol, candidateId);
        const sourceTurnIds = [...new Set([...history.map(entry => entry.sourceTurnId), String(turnRecord?.id || '')]
            .map(value => String(value || '').trim()).filter(Boolean))].slice(-30);
        const sourceEvidence = [...history.map(entry => entry.evidence), scenePulseCharacterCardEvidence(card, turnRecord?.id, snapshotId)]
            .filter(entry => entry.sourceTurnId || entry.text).slice(-24);
        return {
            candidateId, candidateType: 'character', label, role: String(card?.role || '').trim().slice(0, 180),
            description: [card?.role, card?.immediateNeed, card?.shortTermGoal, card?.longTermGoal, card?.notableDetails]
                .map(value => String(value || '').trim()).filter(Boolean).join('\n').slice(0, 2400),
            presence: 'active', details: {
                hair: String(card?.hair || '').trim().slice(0, 600), face: String(card?.face || '').trim().slice(0, 600),
                outfit: String(card?.outfit || '').trim().slice(0, 1200), posture: String(card?.posture || '').trim().slice(0, 400),
                proximity: String(card?.proximity || '').trim().slice(0, 400), notableDetails: String(card?.notableDetails || '').trim().slice(0, 1200)
            },
            clothingDescription: String(card?.outfit || '').trim().slice(0, 1200),
            sourceTurnIds, evidence: sourceEvidence
        };
    }).filter(Boolean);
}

// The controlled player may have a source card and an evidence-scoped
// character reading, but is never a pre-canonical ScenePulse candidate. This
// is an exclusion guard, not an identity lookup: it prevents an accidental
// self-promotion route while leaving the player card in the foreground.
function scenePulseControlledCharacterReference(world, sess) {
    const id = String(sess?.controlledEntityId || sess?.sidecar?.activeControlledEntityId || '').trim();
    const entity = id ? (world?.entities || []).find(item => String(item?.id || '') === id) : null;
    const names = new Set([entity?.name, sess?.playerIdentity?.name, sess?.playerName]
        .map(value => String(value || '').trim().toLowerCase()).filter(Boolean));
    return { id, names };
}

function scenePulseCandidateIsControlledCharacter(candidate = {}, controlled = {}) {
    const source = experimentalIsPlainObject(candidate) ? candidate : {};
    const type = String(source.candidateType || source.candidate_type || source.type || '').trim().toLowerCase();
    if (type && !['character', 'entity', 'npc', 'person'].includes(type)) return false;
    const controlledId = String(controlled?.id || '').trim();
    const ids = [source.candidateId, source.candidate_id, source.characterId, source.character_id,
        source.subjectRef, source.subject_ref, source.canonicalMatchId, source.canonical_match_id, source.canonicalId, source.canonical_id]
        .map(value => String(value || '').trim()).filter(Boolean);
    if (controlledId && ids.includes(controlledId)) return true;
    const label = String(source.label || source.name || '').trim().toLowerCase();
    return !!label && controlled?.names instanceof Set && controlled.names.has(label);
}

// Pre-canonical structures live beside reader snapshots. They are deliberately
// not written through the world reducer: a bartender, room, outfit, prop or
// vehicle can be useful to the next scene before it has earned a canonical ID.
function recordSidecarReaderCandidates(world, sess, readerPacket, turnRecord, snapshotId = '') {
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    if (!protocol || !turnRecord || !readerPacket) return [];
    const controlled = scenePulseControlledCharacterReference(world, sess);
    const raw = (readerPacket.candidateStructures || readerPacket.candidates || readerPacket.semanticInterpretation?.candidateStructures || [])
        .filter(candidate => !scenePulseCandidateIsControlledCharacter(candidate, controlled));
    // A prior packet may have carried the player despite the Reader contract.
    // Retire that derived record rather than letting it appear as an identity
    // handoff or persist a self-promotion option after the source refresh.
    (protocol.readerCandidates || []).filter(candidate => scenePulseCandidateIsControlledCharacter(candidate, controlled)).forEach(candidate => {
        candidate.status = 'superseded';
        candidate.promotionDisposition = 'controlled_player_excluded';
        candidate.promotionProvenance = { source: 'controlled_player_candidate_exclusion', at: new Date().toISOString() };
    });
    // Candidate structures are the primary Reader route. Source-card fallback
    // is only used for a stable, non-canonical card the Reader actually
    // supplied in this same accepted packet; it never imports a Horde registry
    // record to make ScenePulse look more complete.
    const sourceCardCandidates = scenePulseCharacterCandidatesFromCards(readerPacket, protocol, turnRecord, snapshotId, raw);
    const candidates = window.ExperimentalWorldsSidecarHooks?.mergeReaderCandidates?.(protocol, [...raw, ...sourceCardCandidates], {
        sourceTurnId: turnRecord.id,
        sourceTakeId: turnRecord.takeId || '',
        sourceRevisionId: turnRecord.revisionId || '',
        readerSnapshotId: snapshotId,
        attemptId: turnRecord.settledAttemptId || turnRecord.currentAttemptId || '',
        settlementId: turnRecord.settlementId || '',
    }) || [];
    const sourceCards = new Map((readerPacket?.semanticInterpretation?.scenePulse?.characters || readerPacket?.scenePulse?.characters || [])
        .filter(isPlainObject).map(card => [scenePulseCharacterCardIdentity(card), card]).filter(([identity]) => identity));
    // Include earlier source-derived candidates so their stable source card
    // keeps collecting settled evidence on a later delta without overwriting
    // a promotion/match decision with a new `derived` status.
    const sourceCandidates = [...new Map([...candidates, ...(protocol.readerCandidates || []).filter(candidate => sourceCards.has(String(candidate?.candidateId || '')))]
        .map(candidate => [String(candidate?.candidateId || ''), candidate])).values()];
    sourceCandidates.forEach(candidate => {
        const sourceCard = sourceCards.get(String(candidate?.candidateId || '')) || null;
        const sourceCharacter = candidate.candidateType === 'character'
            ? scenePulseCharacterEvidenceForCandidate(readerPacket, candidate) : null;
        if (sourceCharacter) {
            // Preserve model-supplied candidate fields. The matching source
            // card fills only absent presentation details and stays clearly
            // marked as a same-packet ScenePulse observation.
            const details = experimentalIsPlainObject(candidate.details) ? candidate.details : {};
            candidate.details = {
                ...details,
                hair: details.hair || sourceCharacter.hair,
                face: details.face || sourceCharacter.face,
                outfit: details.outfit || sourceCharacter.outfit,
                posture: details.posture || sourceCharacter.posture,
                proximity: details.proximity || sourceCharacter.proximity,
                notableDetails: details.notableDetails || sourceCharacter.notableDetails
            };
            candidate.clothingDescription = candidate.clothingDescription || sourceCharacter.outfit;
            candidate.scenePulseCharacter = experimentalSafeJsonClone(sourceCharacter);
        }
        if (sourceCard) {
            const history = scenePulseCharacterCardHistory(protocol, candidate.candidateId);
            candidate.sourceTurnIds = [...new Set([...(candidate.sourceTurnIds || []), ...history.map(entry => entry.sourceTurnId), turnRecord.id]
                .map(value => String(value || '').trim()).filter(Boolean))].slice(-30);
            candidate.evidence = [...(candidate.evidence || []), ...history.map(entry => entry.evidence), scenePulseCharacterCardEvidence(sourceCard, turnRecord.id, snapshotId)]
                .filter(entry => entry?.sourceTurnId || entry?.text).slice(-24);
        }
        candidate.sourceSceneId = turnRecord.sceneId || protocol.activeSceneId || '';
        candidate.sourceSequenceId = turnRecord.sequenceId || protocol.activeSequenceId || '';
        candidate.readerSnapshotId = snapshotId || candidate.readerSnapshotId || '';
        candidate.provenance = {
            source: 'sidecar_semantic_reader',
            turnId: turnRecord.id,
            takeId: turnRecord.takeId || '',
            revisionId: turnRecord.revisionId || '',
            readerSnapshotId: snapshotId || ''
        };
        candidate.attemptStatus = 'settled';
        candidate.settlementStatus = 'settled';
    });
    // Candidate records are one input to the projection, not the projection
    // itself.  Publication assembles the complete dimensional scene view only
    // once this attempt has settled.
    return sourceCandidates;
}

/*
 * A syntactically repairable but provider-truncated envelope is not a healthy
 * scene reading.  Keep the required set deliberately source-grounded so a
 * dormant registry never consumes output budget, then validate it below.
 */
function sidecarReaderRequiredSubjects(references = {}, options = {}) {
    const sourceText = [options.playerInput, options.narration, options.handoff]
        .map(value => String(value || '')).join('\n');
    const controlledId = String(options.controlledEntityId || '').trim();
    const countName = name => {
        const escaped = String(name || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return escaped ? (sourceText.match(new RegExp(`\\b${escaped}\\b`, 'gi')) || []).length : 0;
    };
    const result = (Array.isArray(references?.entities) ? references.entities : [])
        .filter(entity => {
            const id = String(entity?.id || '').trim();
            const name = String(entity?.name || '').trim();
            return id && name && (id === controlledId || countName(name) >= 2);
        })
        .map(entity => ({
            id: String(entity.id), name: String(entity.name || entity.id), role: String(entity.role || ''),
            reason: String(entity.id) === controlledId ? 'controlled entity' : 'repeatedly named in the authored beat'
        }));
    if (controlledId && !result.some(entry => entry.id === controlledId)) {
        result.unshift({ id: controlledId, name: 'Controlled character', role: 'controlled_entity', reason: 'controlled entity' });
    }
    return result.slice(0, 16);
}

function validateSidecarReaderCoverage(packet, requiredSubjects = [], finishReason = '') {
    if (/length|truncat/i.test(String(finishReason || ''))) {
        return { valid: false, error: 'reader_output_truncated', missing: requiredSubjects.map(entry => entry.id) };
    }
    const readings = Array.isArray(packet?.characterIntelligence) ? packet.characterIntelligence : [];
    const covered = new Set(readings.flatMap(item => [item?.subjectRef, item?.candidateId, item?.name])
        .map(value => String(value || '').trim().toLowerCase()).filter(Boolean));
    const missing = requiredSubjects.filter(subject => !covered.has(String(subject.id).toLowerCase()) && !covered.has(String(subject.name).toLowerCase()));
    return missing.length
        ? { valid: false, error: 'reader_incomplete_character_coverage', missing: missing.map(subject => subject.id) }
        : { valid: true, error: '', missing: [] };
}

// ScenePulse's source macros resolve from its latest tracker snapshot.  In
// Worlds, that means the prior *accepted Reader* projection only.  Never
// resolve a prompt macro from the presentation fixture or Horde's registry:
// those are useful visible fallbacks, not model evidence.
function scenePulseSourceMacroValues(scenePulse = {}, profile = {}) {
    const source = experimentalIsPlainObject(scenePulse) ? scenePulse : {};
    const text = key => {
        const value = source[key];
        if (value === undefined || value === null) return '';
        return Array.isArray(value) ? value.map(item => String(item || '').trim()).filter(Boolean).join(', ') : String(value).trim();
    };
    const characters = Array.isArray(source.characters) ? source.characters : [];
    const characterName = value => {
        if (experimentalIsPlainObject(value)) return String(value.name || value.displayName || value.id || '').trim();
        const raw = String(value || '').trim();
        const match = characters.find(item => String(item?.id || item?.characterId || item?.candidateId || '').trim() === raw);
        return String(match?.name || raw).trim();
    };
    const presentRaw = Array.isArray(source.charactersPresent) ? source.charactersPresent : [];
    const present = presentRaw.map(characterName).filter(Boolean);
    const characterNames = present.length ? present : characters.map(item => String(item?.name || '').trim()).filter(Boolean);
    const relationships = (Array.isArray(source.relationships) ? source.relationships : []).map(relationship => {
        const name = String(relationship?.name || '').trim();
        if (!name) return '';
        const parts = [];
        if (relationship.relType) parts.push(String(relationship.relType).trim());
        if (Number.isFinite(Number(relationship.affection))) parts.push(`aff:${Number(relationship.affection)}`);
        return `${name}${parts.length ? ` (${parts.join(', ')})` : ''}`;
    }).filter(Boolean);
    const active = rows => (Array.isArray(rows) ? rows : [])
        .filter(item => String(item?.urgency || item?.status || '').toLowerCase() !== 'resolved')
        .map(item => String(item?.name || item?.title || '').trim()).filter(Boolean);
    const mainQuests = active(source.mainQuests), sideQuests = active(source.sideQuests);
    const preset = profile?.scenePulsePreset || {};
    return Object.freeze({
        sp_location: text('location'), sp_time: text('time'), sp_date: text('date'), sp_mood: text('sceneMood'), sp_tension: text('sceneTension'),
        sp_weather: text('weather'), sp_topic: text('sceneTopic'), sp_summary: text('sceneSummary'), sp_temperature: text('temperature'), sp_northstar: text('northStar'),
        sp_characters: characterNames.join(', '), sp_char_count: String(characterNames.length), sp_relationships: relationships.join(', '),
        sp_quests: [...mainQuests, ...sideQuests].join(', '), sp_main_quests: mainQuests.join(', '), sp_side_quests: sideQuests.join(', '),
        sp_quest_count: String(mainQuests.length + sideQuests.length), sp_active_profile: String(preset.displayName || preset.id || '').trim()
    });
}

function expandScenePulseSourceMacros(template, scenePulse = {}, profile = {}) {
    const values = scenePulseSourceMacroValues(scenePulse, profile);
    return String(template || '').replace(/\{\{(sp_[a-z_]+)\}\}/gi, (_, name) => Object.prototype.hasOwnProperty.call(values, name.toLowerCase()) ? values[name.toLowerCase()] : '');
}

// This is the exact temporary panel created by ScenePulse's guided tour.
// It is a source-panel *schema*, not evidence and not a source of values.
// Keeping it here means a first Reader call can understand the visible
// guided-tour controls without ever receiving TOUR_EXAMPLE_DATA as context.
const SCENEPULSE_TOUR_CUSTOM_PANELS = Object.freeze([Object.freeze({
    name: 'RPG Stats (Tour Example)', fields: Object.freeze([
        Object.freeze({ key: 'health', label: 'Health', type: 'meter', desc: "{{user}}'s health 0-100" }),
        Object.freeze({ key: 'mana', label: 'Mana', type: 'meter', desc: 'Mana remaining after spellcasting' }),
        Object.freeze({ key: 'reputation', label: 'Reputation', type: 'text', desc: 'Standing with the local guild' })
    ])
})]);

// Custom panels are ScenePulse's flat tracker fields. The schema travels to
// the Reader; values travel back only as ordinary, compact scenePulse deltas
// keyed by `field.key`. A bounded copy prevents a large local configuration
// from becoming an accidental prompt payload, and an unsupported field is
// never permission for the model to invent a value.
function scenePulseActiveSourceProfile(protocol = null) {
    const preferences = normalizeScenePulseWorldsPreferences(protocol?.workspaceUi?.scenePulseWorlds || {});
    const profiles = Array.isArray(preferences.sourceProfiles) ? preferences.sourceProfiles : [];
    const activeId = String(preferences.sourceActiveProfileId || '');
    return profiles.find(profile => String(profile?.id || '') === activeId) || null;
}

// Source custom panels are a part of the foreground product, so resolve the
// same effective schema for the native panel, its declared replacement keys,
// and the one Reader prompt. The tour's panel is deliberately a schema only:
// upstream creates it during the tour, but TOUR_EXAMPLE_DATA has no invented
// health/mana/reputation values to put in its fields.
function scenePulseEffectiveSourceCustomPanels(preferences = {}) {
    const localPanels = Array.isArray(preferences?.customPanels) ? preferences.customPanels : [];
    if (localPanels.length) return localPanels;
    const profiles = Array.isArray(preferences?.sourceProfiles) ? preferences.sourceProfiles : [];
    const activeId = String(preferences?.sourceActiveProfileId || '');
    const activeProfile = profiles.find(profile => String(profile?.id || '') === activeId) || null;
    const profilePanels = Array.isArray(activeProfile?.customPanels) ? activeProfile.customPanels : [];
    return profilePanels.length ? profilePanels : SCENEPULSE_TOUR_CUSTOM_PANELS;
}

function scenePulseReaderCustomPanelSchema(world, sess, protocol = null) {
    const workspace = protocol || protocolForSidecarTimeline(world, sess);
    const preferences = normalizeScenePulseWorldsPreferences(workspace?.workspaceUi?.scenePulseWorlds || {});
    // A timeline-local custom schema takes precedence once a user has edited
    // it. Before then, the selected source Profile supplies its own native
    // schema; only if neither exists do we seed the sealed tour schema.
    const sourcePanels = scenePulseEffectiveSourceCustomPanels(preferences);
    return sourcePanels.slice(0, 12).map(panel => ({
        name: String(panel?.name || 'Custom Panel').slice(0, 120),
        enabled: panel?.enabled !== false,
        fields: (Array.isArray(panel?.fields) ? panel.fields : []).filter(field => field?.enabled !== false).slice(0, 24).map(field => ({
            key: String(field?.key || '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 80),
            label: String(field?.label || field?.key || 'Field').slice(0, 120),
            type: ['text', 'number', 'meter', 'list', 'enum'].includes(String(field?.type || '')) ? field.type : 'text',
            description: String(field?.desc || '').slice(0, 300),
            options: Array.isArray(field?.options) ? field.options.slice(0, 32).map(option => String(option || '').slice(0, 80)).filter(Boolean) : [],
            invert: field?.invert === true
        })).filter(field => field.key)
    })).filter(panel => panel.enabled && panel.fields.length);
}

function scenePulseCustomPanelSchemaFingerprint(schema = []) {
    // Schema compatibility is about semantic field definition, not cosmetic
    // field labels. This lets a label-only adjustment remain delta-compatible
    // while a key/type/hint/options change requests one honest full read.
    return JSON.stringify((Array.isArray(schema) ? schema : []).map(panel => ({
        fields: (panel.fields || []).map(field => ({ key: field.key, type: field.type, description: field.description, options: field.options, invert: field.invert === true }))
    })));
}

function scenePulseSourceProfilePromptContext(sourceProfile, priorScenePulse, readerProfile) {
    if (!experimentalIsPlainObject(sourceProfile)) return { instruction: '', overrides: {}, role: null, provenance: null };
    const overrides = experimentalIsPlainObject(sourceProfile.promptOverrides) ? sourceProfile.promptOverrides : {};
    const systemPrompt = typeof sourceProfile.systemPrompt === 'string'
        ? expandScenePulseSourceMacros(sourceProfile.systemPrompt, priorScenePulse, readerProfile).slice(0, 24_000) : '';
    const schema = typeof sourceProfile.schema === 'string' ? sourceProfile.schema.slice(0, 24_000) : '';
    const hasGuidance = !!(systemPrompt || schema || Object.keys(overrides).length);
    const role = hasGuidance && ['system', 'user', 'assistant'].includes(sourceProfile.systemPromptRole)
        ? sourceProfile.systemPromptRole : null;
    const instruction = hasGuidance
        ? `\n\n[ACTIVE SCENEPULSE SOURCE PROFILE]\nProfile: ${String(sourceProfile.name || sourceProfile.id || 'ScenePulse Profile').slice(0, 120)} (${String(sourceProfile.id || '').slice(0, 180)}). This is user-authored ScenePulse configuration for the Reader’s presentation projection. Follow it only where it is compatible with the evidence-only, no-canon, rich ScenePulse, and compact-delta rules in this request. It may refine how supported scene data is expressed; it cannot require invented values, override visible narration, or change canonical authority.${systemPrompt ? `\n\n[PROFILE PROMPT]\n${systemPrompt}` : ''}${schema ? `\n\n[PROFILE SCHEMA]\n${schema}` : ''}`
        : '';
    return {
        instruction,
        overrides,
        role,
        provenance: { id: String(sourceProfile.id || ''), name: String(sourceProfile.name || '').slice(0, 120), updatedAt: String(sourceProfile.updatedAt || ''), appliedPresetId: String(sourceProfile.appliedPresetId || ''), overrideCount: Object.keys(overrides).length, hasSystemPrompt: !!systemPrompt, hasSchema: !!schema }
    };
}

// ScenePulse Profiles also carry the source dynamic field builder's panel,
// card and sub-field choices.  In Worlds they scope what the one Reader is
// asked to refresh; they never make a sparse packet erase the foreground
// source fixture or authorize arbitrary new field keys.
function scenePulseSourceProfileFieldConfiguration(sourceProfile) {
    const source = experimentalIsPlainObject(sourceProfile) ? sourceProfile : {};
    const booleanEntries = (value, allowed, limit = allowed.length) => Object.fromEntries(Object.entries(experimentalIsPlainObject(value) ? value : {})
        .filter(([key, enabled]) => allowed.includes(String(key)) && typeof enabled === 'boolean')
        .slice(0, limit)
        .map(([key, enabled]) => [String(key), enabled]));
    const panelKeys = ['dashboard', 'scene', 'quests', 'relationships', 'characters', 'storyIdeas'];
    const dashCardKeys = ['date', 'time', 'weather', 'temperature', 'location'];
    const fieldToggles = Object.fromEntries(Object.entries(experimentalIsPlainObject(source.fieldToggles) ? source.fieldToggles : {})
        .filter(([key, enabled]) => /^[A-Za-z][A-Za-z0-9_]{0,100}$/.test(String(key)) && typeof enabled === 'boolean')
        .slice(0, 240)
        .map(([key, enabled]) => [String(key), enabled]));
    return {
        panels: booleanEntries(source.panels, panelKeys),
        dashCards: booleanEntries(source.dashCards, dashCardKeys),
        fieldToggles
    };
}

// Resolve the source's named prompt slots independently from bundled presets.
// The preset is advisory source configuration; the active Profile is the
// explicit authoring surface and therefore wins for a shared slot key.
function scenePulseResolvedPromptSlotEntries(sourcePreset, sourceProfileContext, priorScenePulse, readerProfile) {
    const presetOverrides = experimentalIsPlainObject(sourcePreset?.promptOverrides) ? sourcePreset.promptOverrides : {};
    const profileOverrides = experimentalIsPlainObject(sourceProfileContext?.overrides) ? sourceProfileContext.overrides : {};
    return Object.entries({ ...presetOverrides, ...profileOverrides })
        .filter(([slot, text]) => typeof slot === 'string' && typeof text === 'string' && text.trim())
        .map(([slot, text]) => [slot, expandScenePulseSourceMacros(text, priorScenePulse, readerProfile)]);
}

async function runSidecarSemanticReading(world, sess, options = {}) {
    const tracker = options.tracker || {};
    const profile = options.readerProfile || effectiveSidecarReaderProfile(world, sess);
    const provider = options.provider;
    const model = options.model;
    const sidecarWorld = options.sidecarWorld || world;
    const references = options.references || buildSidecarCanonicalReferenceManifest(world, sess, `${options.playerInput || ''}\n${options.narration || ''}\n${options.handoff || ''}`);
    // Automatic capacity must accommodate a complete structured reading of a
    // populated scene. Explicit user caps remain authoritative.
    const defaultTokens = tracker.reasoning === true ? 7000 : 6000;
    const configuredTokens = Number(profile.maxTokens) || Number(tracker.readerMaxTokens) || 0;
    const maxTokens = configuredTokens > 0 ? Math.max(1200, Math.min(100000, Math.trunc(configuredTokens))) : defaultTokens;
    const readerMechanicsFrame = window.HordeWorldMechanics?.isEnabled?.(world)
        ? String(window.HordeWorldMechanics.reconcilerFrame?.(world, sess,
            worldMechanicsRegistryFor(world)) || '')
        : '';
    const readerProtocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    const priorReaderSnapshotId = String(options.priorReaderSnapshotId
        || readerProtocol?.readerSnapshots?.filter(snapshot => snapshot.status === 'active').at(-1)?.id
        || '').trim();
    const activeSourceProfile = scenePulseActiveSourceProfile(readerProtocol);
    const humanSceneStateContext = scenePulseHumanStatePromptContext(readerProtocol);
    const customPanelSchema = scenePulseReaderCustomPanelSchema(world, sess, readerProtocol);
    const customPanelSchemaFingerprint = scenePulseCustomPanelSchemaFingerprint(customPanelSchema);
    const priorCustomPanelSchemaFingerprint = String(options.priorReaderEnvelope?.metadata?.scenePulseCustomPanelSchemaFingerprint || '');
    // A changed custom schema needs a new whole projection exactly once.
    // Merging a meter into an earlier text/list field would create a plausible
    // but invalid tracker value, so prefer the larger packet at this explicit
    // compatibility boundary and go back to compact deltas on the next turn.
    const hasPriorReaderProjection = experimentalIsPlainObject(options.priorReaderEnvelope) && Object.keys(options.priorReaderEnvelope).length > 0;
    const customPanelSchemaChanged = hasPriorReaderProjection && priorCustomPanelSchemaFingerprint !== customPanelSchemaFingerprint;
    const forceFull = options.forceFull === true || customPanelSchemaChanged;
    const readerHierarchy = readerProtocol && window.ExperimentalWorldsSidecarTimeline?.ensureHierarchy?.(readerProtocol, sess, { createWhenMissing: false });
    const controlledEntityId = String(options.preFrame?.controlled_entity_id
        || readerHierarchy?.sequence?.controlledEntityId
        || sess?.sidecar?.activeControlledEntityId
        || sess?.controlledEntityId
        || 'player');
    const controlledEntity = (world.entities || []).find(entity => String(entity?.id) === controlledEntityId) || null;
    const controlledPersona = sess?.playerIdentity?.persona || sess?.persona || controlledEntity?.persona || '';
    const lookupBudget = Math.max(1000, Number(profile.maxLookupPayload) || 12000);
    const boundedReferences = JSON.stringify(references).slice(0, lookupBudget);
    const requiredSubjects = sidecarReaderRequiredSubjects(references, {
        playerInput: options.playerInput, narration: options.narration, handoff: options.handoff, controlledEntityId
    });
    const prompt = `[SIDECAR READER]\nYou are the read-only semantic reading layer between an authored roleplay turn and the canonical world Reconciler. Establish what the visible narration and Narrator handoff mean; do not write roleplay, alter canon, or prepare a commit receipt. You may use the supplied read-only tools when a name, place, current scene fact, canonical identity, relationship, ledger, thread, quest, or obligation is genuinely uncertain. A named record returned by a tool already exists: never treat it as a new entity. If evidence is still insufficient, say UNKNOWN and propose a narrowly worded reconciliation question rather than guessing.\n\nReturn one JSON object with: mode, changed_fields, summary, canonical_references, semantic_interpretation, reconciliation_focus, unresolved, proposed_questions, time_evidence, and controlled_character_evidence. semantic_interpretation is a Scene Intelligence envelope, not generic summary prose. Preserve distinct dimensions for scene {topic,mood,tension,interactionStyle,sound,environment,description}, time/date/day, location/local_space, weather/environment, active objects/places, authored events, changed_this_turn, relationship shifts, current threads, and unresolved evidence. semantic_interpretation.candidateStructures is a list of stable pre-canonical scene candidates for unnamed or partially described characters, local spaces, outfits, props, vehicles, relationship posture, or threads. A candidate is derived evidence, never canon; do not invent missing fields merely to complete a schema.\n\nFor EVERY character who is active, nearby, audible, remote-but-interacting, or specifically relevant off-scene, return semantic_interpretation.characterIntelligence[] item. This is a provisional, character-scoped, epistemically labelled scene reading — never an objective world fact or durable memory. Each item has subjectRef/canonical ID when resolvable, name, relevance, presence {mode,location,channel}, activity, and only evidence-supported entries for emotionalPosture, attentionFocus, apparentUnderstanding, noticed, likelyUnnoticed, suspicionOrUncertainty, interpersonalPostures, immediateObjectiveOrConcern, goals {immediateNeed,shortTerm,longTerm}, and sceneLocalImpression/innerThought. Each claim must carry text, epistemicKind (authored_disclosure|observable_behaviour|perception_evidence|reader_inference|established_memory|unknown), confidence, uncertainty, and short source evidence. Use UNKNOWN or omit a field where the beat does not support it. Do not manufacture a private thought simply because a field exists. For the controlled player, never assert unexpressed inner thought: only player-authored action/dialogue, explicit narration, or clearly labelled inference may be reported.\n\nCONTROLLED ENTITY / PERSONA: ${JSON.stringify({ id: controlledEntityId, name: controlledEntity?.name || sess?.playerIdentity?.name || 'Player', persona: String(controlledPersona || '').slice(0, 2400) })}\n\ncontrolled_character_evidence: behavioural evidence for the controlled player character, each item {evidence, provenance} with provenance strictly one of user_explicit_action, user_explicit_dialogue, narrator_paraphrase, sidecar_interpretation, behavioural_pattern_inference. The player's own input is primary evidence; Narrator wording (especially FF Embellish presentation) is secondary presentation only. Never attribute a Narrator flourish to the player, and never jump from one beat to a persistent personality trait.\n\nRead the beat across the FF semantic domains: temporal (including the scene header, if present), location and completed movement, cast presence and appearance, character state, objectives and quests, relationship posture, inventory and economy, world conditions, traversal and vehicles, open questions, scene boundary, and recovery obligations. A leading scene header line such as [ \u{1F550} time | \u{1F5D3} day | \u{1F4CD} place | weather ] is the Narrator's declared start state for this beat — structured temporal evidence, not a contradiction with the committed clock. Presence must classify every relevant named character as active, nearby, audible, remote, mentioned, or absent; only active belongs in the direct cast. Mentioned-only and unrelated absent registry characters do not receive a characterIntelligence item.\n\nCANONICAL REFERENCE MANIFEST (bounded):\n${boundedReferences}\n\nPRE-TURN SCENE FRAME:\n${JSON.stringify(options.preFrame || buildWorldSceneFrame(world, sess))}\n\nCLOCK EVIDENCE:\n${JSON.stringify(options.clockEvidence || buildSidecarClockEvidence(world, sess))}\n\nWORLD MECHANICS FRAME (tracked altered states; read-only evidence context):\n${readerMechanicsFrame || '(none)'}\n\nA9 EVIDENCE SEPARATION: when the mechanics frame shows a character under a tracked altered state, keep four kinds of evidence distinct in controlled_character_evidence and semantic_interpretation: user_intention (what the player's own words declare they are trying), user_compensation (explicit accounting for the tracked state — steadying, bracing, simplifying, asking for help), mechanic_conditioned_execution (how the tracked state actually shaped the execution as narrated — staggered steps, slurred words, misjudged distance), and objective_result (what observably completed in the world). Tag each item's provenance accordingly and never merge intention with result.\n\nPLAYER INPUT:\n${JSON.stringify(String(options.playerInput || '').slice(0, 6000))}\n\nVISIBLE NARRATION:\n${JSON.stringify(String(options.narration || '').slice(0, 24000))}\n\nNARRATOR HANDOFF:\n${String(options.handoff || '').slice(0, 12000) || '(missing — inspect visible narration conservatively)'}`;
    // ScenePulse's useful inner-thought behaviour is retained here, but its
    // tendency to fabricate autobiography is explicitly disallowed.  Keep
    // this as a separate prompt block so the stored core contract remains
    // inspectable and profile revisions can identify the cognition rule.
    const sceneIntelligenceThoughtInstruction = `

[PER-TURN CHARACTER THOUGHTS]
For every conscious active NPC, produce a fresh concise present-tense sceneLocalImpression/innerThought and immediate need/concern for this beat. It may be a plausible new, voice-specific Reader inference when grounded in the authored beat plus established character grounding; label it reader_inference and include the grounding/evidence. Do not carry last turn's thought forward and call it new. Do not invent biography, prior events, secrets, or a private thought merely to fill a field. Nearby, audible, remote-interacting and specifically relevant off-scene subjects receive a thought only through the information they could actually receive. The controlled player's unexpressed inner life is never authored. Record coverage/status even when a subject is unconscious, unsupported, or unknown.

[DELTA BASE]
In delta mode include baseSnapshotId exactly equal to this supplied previous accepted snapshot ID: ${priorReaderSnapshotId || '(none — use full mode)'}. Do not name a failed, historical, cross-Timeline, or guessed base. In full mode leave baseSnapshotId blank.`;
    const scenePulseInstruction = `

[SCENEPULSE RICH SCENE DATA]
Also return semantic_interpretation.scenePulse for this same beat. Its full shape is {time,date,elapsed,temporalIntent,location,weather,temperature,sceneTopic,sceneMood,sceneInteraction,sceneTension,sceneSummary,soundEnvironment,witnesses,charactersPresent,northStar,mainQuests,sideQuests,relationships,characters,plotBranches}. Keep it rich enough to drive the source ScenePulse interface, not a generic status card. characters[] items may include name, aliases, archetype, role, innerThought, immediateNeed, shortTermGoal, longTermGoal, hair, face, outfit, posture, proximity, notableDetails, inventory, fertStatus, fertNotes. When the visible beat explicitly gives, rejects, restores, or reveals a character's name, former name, nickname, pseudonym, or alias, include that exact character's stable characterId, current name, and complete aliases array in the same changed-only ScenePulse patch—even when no other character-card field changes. Keep the current display name out of aliases; never infer or invent aliases from a role label, styling, resemblance, or guess. For each conscious scene-relevant NPC, innerThought is one to three first-person, present-tense sentences in that character's own voice. It must be grounded in this beat and established character grounding; it must not contain provenance labels, confidence scores, technical caveats, fabricated biography, unseen events, or a claim of the controlled player's unexpressed thoughts. Omit rather than pad an unsupported thought. relationships[] use ScenePulse's name, relType, relPhase, timeTogether, milestone, affection/trust/desire/stress/compatibility and labels. mainQuests and sideQuests describe only established durable objectives; an empty list is valid. plotBranches are suggestions, not events: when the visible beat supports creative continuation, return exactly one grounded direction for each of dramatic, intense, comedic, twist, and exploratory; otherwise return []. Every branch is exactly {type, name, hook}: type is one of those five category words, name is a short specific title and must never be the category word, and hook is the grounded direction. scenePulse is a presentation projection of this response, not persistent canon or a second state store.

[SCENEPULSE STABLE RECORD IDENTITIES]
In a full ScenePulse projection, each character record MUST include characterId: use the matching stable candidateId from this same Reader packet when the person is Scene-only, or a verified canonical ID only when the supplied references establish that link. Do not derive an ID from a display name. Each relationship record MUST include relationshipId and its characterId when it concerns a rendered character; retain both IDs through every rename. Each durable quest record MUST include a stable questId; retain it through title changes. Names and aliases are display data, not identity. Do not manufacture a canonical identity to satisfy this shape: an evidence-backed candidate ID is correct.

[SCENEPULSE NPC RELATIONSHIP WEB]
When two or more non-player names are currently present in scenePulse.characters and the authored beat or established accepted Reader evidence supports their mutual structure, return semantic_interpretation.npcRelationshipGraph as one compact whole cache: {roster:[exact current scenePulse.characters names],edges:[{from,to,type,label,direction,evidence}],organizations:[{name,kind,members}]}. This drives ScenePulse's source Relationship Web only; it is a Reader-derived scene interpretation, never a canonical relationship mutation. roster must contain the complete current non-player ScenePulse character roster using exactly those display names. Every edge endpoint and organization member must be in roster; never include the controlled player, a registry-only person, or a guessed off-screen name. type is one of family, friend, ally, rival, antagonist, mentor, authority, lover, lust, acquaintance, unknown; direction is from-to or reciprocal; label is a compact grounded phrase. Emit the graph only when it changes, except a focused relationships refresh must return it even when the evidence-backed result is an empty edges array. Use npcRelationshipGraph:null only to explicitly clear a previously accepted graph. Do not make a second graph-generation call: this one Reader pass is the graph's only inference path.

[SCENEPULSE CUSTOM PANEL SCHEMA]
The following is user-visible ScenePulse configuration, not story evidence. Its fields are flat keys directly inside scenePulse; use the exact keys and types if (and only if) this beat or established accepted Reader evidence supports a current value. Do not initialise a health, mana, reputation, enum, list, or number merely because a configured field exists. In delta mode, emit only a changed configured key; omit it when unchanged and use scenePulse.clearFields only for an explicit supported clearing. For a list value, send the full new list when it changes. In full mode, include supported configured values and omit unsupported ones. ${JSON.stringify(customPanelSchema)}

[SCENEPULSE DELTA CONTRACT]
When READER SNAPSHOT MODE is delta, scenePulse is also a compact delta: emit only changed ScenePulse fields. ALWAYS include time, date, elapsed, and the complete current charactersPresent membership; omitted fields mean unchanged. For characters, relationships, mainQuests and sideQuests, emit record patches keyed by stable characterId, relationshipId or questId and include only changed subfields. On a name reveal, retain the same stable ID, set the best established display name, and put every previous display label in aliases; emit one patch, never an old-name and new-name duplicate. A relationship patch for that person retains its relationshipId/characterId and adopts the same display name. Use {_delete:true} or {operation:"remove"} to remove one record, and scenePulse.clearFields for an explicit cleared scalar or collection. Never send an empty object or array to mean "unchanged". If a whole ephemeral collection must be replaced (for example a freshly regenerated plotBranches set), name it in scenePulse.replaceCollections and provide its full replacement array. A relationship's first ScenePulse record is its visible baseline: include every source-visible field: name, relationshipId, characterId, relType, relPhase, timeTogether, milestone, all five current numeric meters (affection, trust, desire, stress, compatibility), and all five explicit compact labels (affectionLabel, trustLabel, desireLabel, stressLabel, compatibilityLabel). Each label is a grounded 1–3 word phrase for its own meter. Never substitute a generic labels array. Omit the relationship entirely when even this provisional source baseline is unsupported. A previously stored relationship missing any of those five meters or five named labels is also unbaselined: complete it with the full visible baseline on this read before using deltas. These meters are ScenePulse presentation evidence, not canonical relationship mutations. After a complete baseline exists, send only relationship.meterDeltas as signed numeric changes for meters that moved; do not repeat unchanged current meter values or a model-drawn UI delta. The runtime applies those deltas to the accepted source baseline and the source renderer places the previous-turn marker. A full refresh returns the complete shape.
`;

const scenePulseActiveRelationshipCoverageInstruction = `

[SCENEPULSE ACTIVE RELATIONSHIP COVERAGE]
For every scenePulse character who directly exchanges dialogue/actions with the controlled character in this beat, or appears in relationshipShifts, emit that character's scenePulse.relationships record. This is required current-scene coverage, not a census: do not add merely mentioned, registry-only, or unrelated people. Use the same stable characterId and relationshipId on every later delta. A short ordinary interaction still earns a conservative provisional baseline when it establishes a real current relationship posture; do not omit the record and leave the source renderer to fabricate an unknown stub. The five meters describe the present interactional state, not a canonical verdict. On a baseline, write the five named source fields affectionLabel, trustLabel, desireLabel, stressLabel and compatibilityLabel; do not send a generic labels array.`;
    const scenePulseFocusInstruction = (options.scenePulseFocus === 'thoughts' ? `

[SCENEPULSE FOCUSED THOUGHT REFRESH]
The user explicitly requested fresh Inner Thoughts for this already-authored beat. Re-read the existing narration and grounding; do not call or simulate Narrator, do not alter the authored event, and do not create a new turn. Re-evaluate every conscious scene-relevant NPC's first-person innerThought, immediate need, and short/long goals. Return the complete Reader envelope as requested, but make the new thought text genuinely fresh rather than copying a prior phrase.` : '') + scenePulseActiveRelationshipCoverageInstruction;
    const scenePulseSectionFocus = {
        dashboard: 'dashboard environment (time, date, location, weather and temperature)',
        scene: 'Scene Details (summary, topic, mood, interaction, tension, sound and witnesses)',
        quests: 'Quest Journal and North Star',
        relationships: 'relationship dimensions, labels, current phase, and the Reader-derived NPC relationship web',
        characters: 'current-scene character cards, appearance, needs, goals and grounded thoughts',
        branches: 'Story Ideas / plot branches'
    }[String(options.scenePulseFocus || '')] || '';
    const scenePulseSectionFocusInstruction = scenePulseSectionFocus ? `

[SCENEPULSE FOCUSED SECTION REFRESH]
The user explicitly requested a fresh check of ${scenePulseSectionFocus} for this already-authored beat. Re-read the visible narration and existing grounding. Do not call or simulate Narrator, alter the authored event, create a new turn, or pad unrelated fields. Return the complete Reader envelope required by this request, concentrating on evidence-supported changes to that ScenePulse section. In delta mode, emit only its changed fields; omit unsupported values rather than manufacturing a complete card.` : '';
    const readerCoverageInstruction = `

[REQUIRED SUBJECT COVERAGE]
${JSON.stringify(requiredSubjects)}
Return one concise characterIntelligence record for every listed subject BEFORE candidates, relationship details, or threads. A merely mentioned person may receive a terse coverage record, but a speaker, caller, active, nearby, audible, or remote interlocutor must receive the appropriate character-scoped reading. Put characterIntelligence near the start of semantic_interpretation. Do not enumerate unrelated absent registry characters. Keep every claim compact (normally one sentence, under 240 characters): a response that runs out of space before a relevant person is invalid.`;
    const sourcePreset = profile.scenePulsePreset || null;
    const priorScenePulseForMacros = experimentalIsPlainObject(options.priorReaderEnvelope?.scenePulse) ? options.priorReaderEnvelope.scenePulse : {};
    const sourceProfileContext = scenePulseSourceProfilePromptContext(activeSourceProfile, priorScenePulseForMacros, profile);
    // A selected source Profile is the user's ScenePulse authoring choice.
    // Its slot edits override an advisory preset, but neither can displace
    // the Sidecar evidence, delta, or canonical-boundary contracts below.
    // A ScenePulse Profile can edit the source's named prompt slots without
    // selecting a bundled preset.  Those edits are source authoring, not a
    // cosmetic local setting: the next Sidecar read needs to receive them.
    // Previously this block was conditional on `sourcePreset.id`, which made
    // a perfectly valid Profile Manager / Prompt Editor edit disappear until
    // the user also chose a preset.  The profile wins when both define the
    // same slot, just as the vendored source profile system intends.
    const sourcePromptSlotEntries = scenePulseResolvedPromptSlotEntries(sourcePreset, sourceProfileContext, priorScenePulseForMacros, profile);
    const sourcePromptSlotInstruction = sourcePromptSlotEntries.length ? `

[SCENEPULSE SOURCE PROMPT SLOTS]
${sourcePreset?.id
    ? `Preset: ${sourcePreset.displayName || sourcePreset.id} (${sourcePreset.id}).`
    : `Profile: ${sourceProfileContext.provenance?.name || activeSourceProfile?.name || activeSourceProfile?.id || 'ScenePulse Profile'}.`}
These are ScenePulse source prompt-slot overrides. They refine the Reader's presentation projection only; they do not change Narrator selection, provider routing, World state, or authority. ScenePulse {{sp_*}} macros in these slots resolve only from the prior accepted ScenePulse projection; no tutorial fallback or Horde registry value is eligible. Apply the following overrides where compatible with the evidence, read-only, and compact-delta contracts below:\n${sourcePromptSlotEntries.map(([slot, text]) => `[${slot}]\n${String(text)}`).join('\n\n')}` : '';
    const sourceProfileFieldConfiguration = scenePulseSourceProfileFieldConfiguration(activeSourceProfile);
    const sourceProfileFieldConfigurationPresent = Object.values(sourceProfileFieldConfiguration)
        .some(value => experimentalIsPlainObject(value) && Object.keys(value).length);
    const sourceProfileFieldInstruction = sourceProfileFieldConfigurationPresent ? `

[SCENEPULSE SOURCE FIELD CONFIGURATION]
${JSON.stringify(sourceProfileFieldConfiguration)}
This is the active source Profile's dynamic panel, dashboard-card, and sub-field configuration. Use it to focus optional ScenePulse field updates for this reading. A disabled optional field must not be padded merely because the source tutorial displays it; an enabled field still needs narration or established accepted-scene support. This configuration cannot erase a populated foreground source field by omission, add an undeclared field, change World authority, or relax the required time/date/elapsed/current-presence continuity contract.` : '';
    const readerPrompt = prompt + humanSceneStateContext + sourceProfileContext.instruction + sourcePromptSlotInstruction + sourceProfileFieldInstruction + sceneIntelligenceThoughtInstruction + scenePulseInstruction + scenePulseFocusInstruction + scenePulseSectionFocusInstruction + readerCoverageInstruction;
    const priorEnvelope = options.priorReaderEnvelope || null;
    const contextBudget = Math.max(4000, Number(profile.contextBudget) || 24000);
    const boundedPriorEnvelope = JSON.stringify(priorEnvelope || {}).slice(0, contextBudget);
    const compactOutputBudget = forceFull ? 7000 : 3600;
    const profileInstruction = `\n\nREADER SNAPSHOT MODE: ${forceFull ? 'full refresh' : 'delta'}. ${customPanelSchemaChanged ? 'The user-visible custom-panel schema changed since the prior accepted Reader packet, so this one response must be a full compatible projection.' : ''} ${forceFull ? 'Return every scene dimension and required subject coverage.' : 'Return only changed fields, but always return a coverage/status record for every REQUIRED SUBJECT COVERAGE entry; omitted other fields remain unchanged.'}\nPREVIOUS ENVELOPE (bounded to the configured reader context budget):\n${boundedPriorEnvelope}\n\nReturn semantic_interpretation with scene {topic,mood,tension,interactionStyle,sound,environment,description}, location {activeLocationId,localSpace,movement,evidence}, temporal {time,date,day,weather,precision,evidence}, presence {active,nearby,audible,remote,mentioned}, events, changedThisTurn, relationshipShifts, salientObjects, salientLocations, currentThreads, characterIntelligence, candidateStructures, durableProposals, relationshipProposals, provisionalCognition, scenePulse, npcRelationshipGraph. characterIntelligence is REQUIRED for every supplied required subject and keyed by stable canonical ID or stable candidate ID. candidateStructures are pre-canonical derived candidates only: {candidateId,candidateType:character|location|outfit|prop|vehicle|relationship|thread,label,role,description,presence,details,clothingDescription,individualGarments,visibleCondition,canonicalMatchId,confidence,evidence,sourceTurnIds}. Use stable candidate IDs across deltas when the same unnamed person/place/object recurs. Match existing canonical IDs only when lookup evidence supports it; otherwise leave canonicalMatchId empty. A sparse candidate is valid; do not fill omitted clothing, identity, or object details by guessing. Presence is an evidence classification, not a movement command: a mentioned name is not active; an audible or nearby character must remain off the direct cast until narration establishes arrival. Set mode to ${forceFull ? 'full' : 'delta'} and list changed_fields.\n\n[COMPLETION BUDGET — HARD]\nReturn one complete, parseable JSON object in at most ${compactOutputBudget} tokens. This is an evidence packet, not an explanation: do not repeat the same fact in summary, semantic_interpretation, and scenePulse. For each character, send role/presence/activity plus only the evidence-supported claim arrays that add a distinct fact; use at most one compact item per relevant claim category. scenePulse character cards carry visible source fields; characterIntelligence carries provenance-rich interpretation, so do not duplicate descriptions between them. Omit unsupported optional arrays and empty objects. In bootstrap delta mode with no previous envelope, send supported current scene fields and source records, but keep optional candidates, graph edges, proposals, and duplicate evidence sparse. Before responding, close every array and object: omit lower-priority optional detail rather than returning truncated JSON.`;
    const sourcePresetRole = sourceProfileContext.role || (['system', 'user', 'assistant'].includes(sourcePreset?.systemPromptRole) ? sourcePreset.systemPromptRole : 'system');
    const messages = [{ role: sourcePresetRole, content: readerPrompt + profileInstruction }, { role: 'user', content: `Read this authored beat and return the semantic evidence packet. Include mode (delta or full) and changed_fields.\n\nFor time_evidence, return one object with resolution (established|none|unknown), authored_meaning (the exact narrator wording), source_clock and end_clock as h:mm AM/PM only when both endpoints are established, precision (exact|approximate|semantic), and a brief rationale. Resolve semantic meaning from the authored beat; never use a phrase-to-duration lookup. If either endpoint would be a guess, mark it unknown and leave both blank.` }];
    const tools = sidecarReadOnlyTools();
    const readerTracker = {
        ...tracker,
        reasoningMode: profile.reasoningMode === 'inherit' ? tracker.reasoningMode : profile.reasoningMode,
        reasoning: profile.reasoningMode === 'inherit' ? tracker.reasoning === true : profile.reasoningMode === 'enabled',
        reasoningEffort: profile.reasoningEffort === 'auto' ? tracker.reasoningEffort : profile.reasoningEffort
    };
    const readerStartedAt = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
    const readerUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, reported: false };
    const recordReaderUsage = payload => {
        const usage = payload?.usage || payload?.usage_metadata || {};
        const promptTokens = Number(usage.prompt_tokens ?? usage.promptTokens ?? usage.input_tokens ?? usage.inputTokens);
        const completionTokens = Number(usage.completion_tokens ?? usage.completionTokens ?? usage.output_tokens ?? usage.outputTokens);
        const totalTokens = Number(usage.total_tokens ?? usage.totalTokens);
        if (Number.isFinite(promptTokens) && promptTokens >= 0) { readerUsage.promptTokens += promptTokens; readerUsage.reported = true; }
        if (Number.isFinite(completionTokens) && completionTokens >= 0) { readerUsage.completionTokens += completionTokens; readerUsage.reported = true; }
        if (Number.isFinite(totalTokens) && totalTokens >= 0) { readerUsage.totalTokens += totalTokens; readerUsage.reported = true; }
    };
    const finishReaderMetrics = packet => {
        const endedAt = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
        const derivedTotal = readerUsage.totalTokens || (readerUsage.promptTokens + readerUsage.completionTokens);
        packet.readerMetrics = {
            source: 'reader_call',
            elapsedMs: Math.max(0, Math.round(endedAt - readerStartedAt)),
            promptTokens: readerUsage.reported ? readerUsage.promptTokens : null,
            completionTokens: readerUsage.reported ? readerUsage.completionTokens : null,
            totalTokens: readerUsage.reported ? derivedTotal : null,
            providerReportedUsage: readerUsage.reported
        };
        packet.metadata = {
            ...(experimentalIsPlainObject(packet.metadata) ? packet.metadata : {}),
            scenePulseCustomPanelSchemaFingerprint: customPanelSchemaFingerprint,
            scenePulseCustomPanelCount: customPanelSchema.length,
            scenePulseSourceProfile: experimentalSafeJsonClone(sourceProfileContext.provenance)
        };
        return packet;
    };
    let finalPayload = null;
    let compactRecoveryAttempted = false;
    const lookupProvenance = [];
    const timeoutController = new AbortController();
    const timeoutId = options.signal ? null : setTimeout(() => timeoutController.abort(), Math.max(10000, Number(profile.timeoutSeconds) * 1000 || 120000));
    const readerSignal = options.signal || timeoutController.signal;
    const maxRounds = Math.max(0, Math.min(12, Number(profile.maxToolCalls) || 3));
    // A tool-cap reaches one assistant response *after* the lookup calls.
    // Previously the last lookup appended the instruction to return JSON and
    // then fell out of this loop, causing us to parse that tool-call response
    // (whose content is normally empty) as an invalid Reader envelope. Keep
    // the final request tool-free: it is still the same immutable authored
    // beat, but the model now has one bounded chance to return its packet.
    const finalResponseRound = maxRounds + 1;
    for (let round = 0; round <= finalResponseRound; round++) {
        const forceFinalReaderResponse = round === finalResponseRound;
        const body = { model, stream: false, max_tokens: maxTokens, temperature: 0, messages: experimentalSafeJsonClone(messages) };
        if (!forceFinalReaderResponse) {
            body.tools = tools;
            body.tool_choice = 'auto';
            body.parallel_tool_calls = false;
        }
        const useNativeJson = sidecarSupportsStructuredJson(provider, model, readerTracker, profile);
        if (useNativeJson) body.response_format = { type: 'json_object' };
        applySidecarReasoning(body, provider, readerTracker, world);
        logSidecarConsoleTrace(`Reader request · round ${round + 1}`, { model, provider, maxTokens, prompt: readerPrompt, request: experimentalSafeJsonClone(body) });
        let response = await fetchSidecarCompletion(body, {
            provider, tracker: readerTracker, world, owner: { ...sidecarWorld, model, provider }, scope: 'sidecar_reader', signal: readerSignal, retryPolicy: profile.retryPolicy
        });
        // Some catalogues are optimistic or provider gateways reject JSON mode
        // for tool-capable models. Keep the native attempt bounded, then fall
        // back to the same validated JSON parser without changing authority.
        if (!response.ok && useNativeJson && [400, 404, 422].includes(response.status)) {
            const detail = await response.clone().text().catch(() => '');
            if (/response_format|json_object|structured.?output|not support|invalid argument/i.test(detail)) {
                delete body.response_format;
                logSidecarConsoleTrace('Reader retry without native JSON mode', { model, provider, detail: detail.slice(0, 800) });
                response = await fetchSidecarCompletion(body, {
                    provider, tracker: readerTracker, world, owner: { ...sidecarWorld, model, provider }, scope: 'sidecar_reader', signal: readerSignal, retryPolicy: profile.retryPolicy
                });
            }
        }
        if (!response.ok) throw new Error((await response.text()).slice(0, 800) || `Sidecar Reader failed (${response.status})`);
        finalPayload = await response.json();
        recordReaderUsage(finalPayload);
        const choice = finalPayload?.choices?.[0] || {};
        const message = choice.message || {};
        logSidecarConsoleTrace(`Reader response · round ${round + 1}`, { model, provider: finalPayload?.provider || provider, finishReason: choice.finish_reason || choice.native_finish_reason || '', assistant: experimentalSafeJsonClone(message) });
        recordSidecarTrace(world, sess, { kind: 'semantic_reader', round: round + 1, prompt: readerPrompt, reply: message, model, provider: finalPayload?.provider || provider, finishReason: choice.finish_reason || choice.native_finish_reason || '' });
        const availableTools = sidecarReadOnlyTools();
        // A provider cannot make another lookup on the final tool-free
        // request. Treat a malformed residual tool-call envelope as no
        // packet rather than executing an out-of-budget lookup.
        const rawCalls = forceFinalReaderResponse ? [] : (Array.isArray(message.tool_calls) ? message.tool_calls : []);
        const calls = rawCalls.filter(call => availableTools.some(tool => tool.function.name === call?.function?.name));
        if (!rawCalls.length) {
            const packet = parseSidecarReaderOutput(message.content, references, { controlledEntityId });
            packet.model = model; packet.provider = finalPayload?.provider || provider; packet.finishReason = choice.finish_reason || choice.native_finish_reason || ''; packet.rounds = round + 1;
            const coverage = validateSidecarReaderCoverage(packet, requiredSubjects, packet.finishReason);
            packet.requiredCharacterSubjects = experimentalSafeJsonClone(requiredSubjects);
            packet.characterCoverage = coverage;
            if (!coverage.valid) {
                packet.valid = false;
                packet.error = coverage.error;
                packet.validationWarnings = [...(packet.validationWarnings || []), coverage.error === 'reader_output_truncated'
                    ? 'The provider stopped before the Reader completed its semantic envelope.'
                    : `Reader did not account for required subject(s): ${coverage.missing.join(', ') || 'unknown'}.`];
            }
            packet.lookupProvenance = lookupProvenance.slice(-20);
            // Completion-length failures are transport-shaped, not semantic
            // disagreement. Re-read the same immutable authored beat once
            // with an explicit compact budget; do not call Narrator or touch
            // canonical state while recovering the packet.
            const finishReason = String(packet.finishReason || '').toLowerCase();
            const capped = /(^|[_\s-])(length|max[_\s-]?tokens?)([_\s-]|$)/.test(finishReason);
            if (!packet.valid && capped && !compactRecoveryAttempted) {
                compactRecoveryAttempted = true;
                messages.push({ role: 'user', content: `The previous Reader packet reached the provider completion cap and was discarded before JSON could close. Start a fresh standalone JSON packet now. Keep it under ${compactOutputBudget} tokens, preserve required subject coverage and supported ScenePulse fields, and omit optional repetition before omitting any required structure. Return JSON only.` });
                logSidecarConsoleTrace('Reader compact recovery', { model, provider, finishReason: packet.finishReason, targetTokens: compactOutputBudget });
                continue;
            }
            if (timeoutId) clearTimeout(timeoutId);
            return finishReaderMetrics(packet);
        }
        // Preserve the provider's tool-call envelope so the next request is
        // protocol-valid, but answer every call ourselves.  Unknown tools are
        // never executed: the Reader surface is strictly read-only and an
        // unexpected write-capable name becomes an explicit unavailable-tool
        // result rather than a hidden mutation or a malformed tool transcript.
        messages.push({ role: 'assistant', content: message.content || '', tool_calls: experimentalSafeJsonClone(rawCalls) });
        rawCalls.forEach(call => {
            const known = availableTools.some(tool => tool.function.name === call?.function?.name);
            const result = known
                ? runSidecarReadOnlyTool(world, sess, call.function?.name, call.function?.arguments || '{}')
                : { found: false, error: `Tool ${String(call?.function?.name || 'unknown')} is unavailable to the read-only Sidecar Reader.` };
            lookupProvenance.push({ tool: call.function?.name || '', arguments: experimentalSafeParseJSONRepair(String(call.function?.arguments || '{}')) || {}, found: result?.found === true, at: new Date().toISOString(), resultSummary: JSON.stringify(result).slice(0, 1400) });
            messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
        });
        if (round === maxRounds) {
            messages.push({ role: 'user', content: 'Tool lookup limit reached. Return the JSON reading now using the evidence already provided. Do not call a tool.' });
            logSidecarConsoleTrace('Reader forcing final JSON response after tool limit', { model, provider, rounds: round + 1 });
        }
    }
    if (timeoutId) clearTimeout(timeoutId);
    const fallbackPacket = parseSidecarReaderOutput(finalPayload?.choices?.[0]?.message?.content || '', references, { controlledEntityId });
    fallbackPacket.lookupProvenance = lookupProvenance.slice(-20);
    return finishReaderMetrics(fallbackPacket);
}

/*
 * Scene Intelligence Reader v2.
 *
 * Keep this normalization in the integrated runtime rather than bolting a
 * ScenePulse-shaped cache onto the side. It is the sole active Reader
 * boundary: it adapts older payload shapes before every consumer receives
 * one evidence model.
 */
function sidecarReaderValue(source, ...names) {
    for (const name of names) if (source && Object.prototype.hasOwnProperty.call(source, name)) return source[name];
    return undefined;
}

function sidecarReaderClaim(raw, subjectRef = '') {
    if (typeof raw === 'string') raw = { text: raw };
    if (!experimentalIsPlainObject(raw)) return null;
    const text = String(raw.text || raw.value || raw.summary || raw.impression || raw.thought || raw.description || '').trim().slice(0, 1800);
    if (!text) return null;
    const epistemicKind = ['authored_disclosure', 'observable_behaviour', 'perception_evidence', 'reader_inference', 'established_memory', 'unknown']
        .includes(String(raw.epistemicKind || raw.epistemic_kind || '').toLowerCase())
        ? String(raw.epistemicKind || raw.epistemic_kind).toLowerCase() : 'reader_inference';
    const evidence = Array.isArray(raw.evidence || raw.evidenceRefs || raw.evidence_refs)
        ? (raw.evidence || raw.evidenceRefs || raw.evidence_refs).map(item => experimentalIsPlainObject(item) ? experimentalSafeJsonClone(item) : { excerpt: String(item || '').slice(0, 900) }).slice(0, 12)
        : (raw.evidence ? [{ excerpt: String(raw.evidence).slice(0, 900) }] : []);
    return {
        text, subjectRef: String(raw.subjectRef || raw.subject_ref || subjectRef || '').slice(0, 180),
        targetRef: String(raw.targetRef || raw.target_ref || raw.target || '').slice(0, 180),
        epistemicKind, uncertainty: String(raw.uncertainty || raw.confidence_note || '').slice(0, 500),
        confidence: Number.isFinite(Number(raw.confidence)) ? Math.max(0, Math.min(1, Number(raw.confidence))) : null,
        evidence, source: String(raw.source || '').slice(0, 120)
    };
}

// The Reader prompt names the four ScenePulse presence lanes, but providers
// occasionally return an equivalent natural-language value such as
// `in_person`. Normalize only those declared synonyms at the boundary. An
// unknown value remains unknown: it must not manufacture an active character
// or make a cognition job eligible merely because a name was mentioned.
function normalizeSidecarPresenceMode(value = '') {
    const mode = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (['active', 'in_person', 'present', 'onsite', 'on_scene', 'direct'].includes(mode)) return 'active';
    if (['nearby', 'adjacent', 'local'].includes(mode)) return 'nearby';
    if (['audible', 'heard', 'offscreen_audible'].includes(mode)) return 'audible';
    if (['remote', 'phone', 'call', 'online', 'video_call'].includes(mode)) return 'remote';
    return '';
}

function normalizeSidecarCharacterIntelligence(raw = {}, defaults = {}) {
    const source = experimentalIsPlainObject(raw) ? raw : {};
    const subjectRef = String(source.subjectRef || source.subject_ref || source.characterId || source.character_id || source.id || source.candidateId || source.candidate_id || '').slice(0, 180);
    const claimList = value => (Array.isArray(value) ? value : (value == null ? [] : [value]))
        .map(item => sidecarReaderClaim(item, subjectRef)).filter(Boolean).slice(0, 12);
    const scalar = value => sidecarReaderClaim(value, subjectRef);
    const relationships = (Array.isArray(source.interpersonalPostures || source.interpersonal_postures) ? (source.interpersonalPostures || source.interpersonal_postures) : [])
        .map(item => {
            const claim = sidecarReaderClaim(item, subjectRef);
            if (!claim) return null;
            return { ...claim, targetRef: String(item.targetRef || item.target_ref || item.target || claim.targetRef || '').slice(0, 180) };
        }).filter(Boolean).slice(0, 20);
    const coverage = experimentalIsPlainObject(source.coverage) ? experimentalSafeJsonClone(source.coverage) : {};
    const rawPresence = experimentalIsPlainObject(source.presence)
        ? experimentalSafeJsonClone(source.presence)
        : { mode: String(source.presence || source.presenceMode || source.presence_mode || '').slice(0, 40), location: String(source.location || source.position || '').slice(0, 300), channel: String(source.channel || '').slice(0, 80) };
    const presenceMode = normalizeSidecarPresenceMode(rawPresence.mode);
    return {
        subjectRef,
        candidateId: String(source.candidateId || source.candidate_id || '').slice(0, 180),
        name: String(source.name || source.label || '').slice(0, 240),
        role: String(source.role || '').slice(0, 240),
        relevance: experimentalIsPlainObject(source.relevance) ? experimentalSafeJsonClone(source.relevance) : { category: String(source.relevance || '').slice(0, 80), reason: String(source.relevanceReason || source.relevance_reason || '').slice(0, 800) },
        presence: { ...rawPresence, mode: presenceMode },
        activity: scalar(source.activity), visibleState: experimentalIsPlainObject(source.visibleState || source.visible_state) ? experimentalSafeJsonClone(source.visibleState || source.visible_state) : {},
        emotionalPosture: claimList(source.emotionalPosture || source.emotional_posture),
        attentionFocus: claimList(source.attentionFocus || source.attention_focus),
        apparentUnderstanding: claimList(source.apparentUnderstanding || source.apparent_understanding || source.beliefs),
        noticed: claimList(source.noticed),
        likelyUnnoticed: claimList(source.likelyUnnoticed || source.likely_unnoticed),
        suspicionOrUncertainty: claimList(source.suspicionOrUncertainty || source.suspicion_or_uncertainty),
        interpersonalPostures: relationships,
        immediateObjectiveOrConcern: claimList(source.immediateObjectiveOrConcern || source.immediate_objective_or_concern || source.immediateNeed || source.immediate_need),
        goals: experimentalIsPlainObject(source.goals) ? experimentalSafeJsonClone(source.goals) : {
            immediateNeed: String(source.immediateNeed || source.immediate_need || '').slice(0, 800),
            shortTerm: String(source.shortTermGoal || source.short_term_goal || '').slice(0, 800),
            longTerm: String(source.longTermGoal || source.long_term_goal || '').slice(0, 800)
        },
        sceneLocalImpression: scalar(source.sceneLocalImpression || source.scene_local_impression || source.innerThought || source.inner_thought),
        changedDimensions: Array.isArray(source.changedDimensions || source.changed_dimensions) ? (source.changedDimensions || source.changed_dimensions).map(String).slice(0, 30) : [],
        coverage,
        evidence: claimList(source.evidence),
        status: ['evaluated', 'unknown', 'unchanged', 'not_evaluated', 'unconscious'].includes(String(source.status || '').toLowerCase()) ? String(source.status).toLowerCase() : 'evaluated'
    };
}

// A ScenePulse character card is not merely display decoration: its thought
// is a subject-scoped reading from this same Reader packet.  Mirror that one
// observation into the existing character-intelligence lane when the Reader
// did not already provide it there.  This lets the normal cognition pipeline
// consider the thought as a provisional lead, while retaining the foreground
// card as the complete visible source record.
//
// Deliberately do not use a display name to discover an identity, consult a
// World record, or invent a presence state.  A card without a stable source
// identity plus explicit current-scene presence stays ScenePulse-only.  The
// controlled character is also excluded even if a malformed packet includes
// an apparent inner thought for them.
function scenePulseCharacterCognitionBridge(scenePulse = {}, suppliedIntelligence = [], defaults = {}) {
    const source = experimentalIsPlainObject(scenePulse) ? scenePulse : {};
    const cards = Array.isArray(source.characters) ? source.characters.filter(isPlainObject).slice(0, 80) : [];
    const entries = Array.isArray(suppliedIntelligence) ? suppliedIntelligence.map(item => experimentalSafeJsonClone(item)) : [];
    const controlledId = String(defaults?.controlledEntityId || '').trim();
    const normalizedPresence = value => {
        const mode = String(experimentalIsPlainObject(value) ? value.mode : value || '').trim().toLowerCase();
        return ['active', 'nearby', 'audible', 'remote'].includes(mode) ? mode : '';
    };
    const text = value => {
        if (Array.isArray(value)) return value.map(text).filter(Boolean).join(' ').slice(0, 1800);
        if (experimentalIsPlainObject(value)) return String(value.text || value.thought || value.value || value.summary || '').trim().slice(0, 1800);
        return String(value || '').trim().slice(0, 1800);
    };
    const roster = Array.isArray(source.charactersPresent) ? source.charactersPresent : [];
    const rosterPresence = (stableId, name, card) => {
        const direct = normalizedPresence(card?.presence || card?.presenceMode || card?.presence_mode);
        if (direct) return direct;
        const wantedName = String(name || '').trim().toLowerCase();
        const matched = roster.find(member => {
            const value = experimentalIsPlainObject(member) ? member : { id: member, name: member };
            const id = String(value.characterId || value.character_id || value.candidateId || value.candidate_id || value.id || '').trim();
            const label = String(value.name || value.label || (typeof member === 'string' ? member : '')).trim().toLowerCase();
            return id === stableId || (!!wantedName && label === wantedName);
        });
        if (!matched) return '';
        return normalizedPresence(matched) || 'active';
    };
    const stableIdentity = card => String(card?.characterId || card?.character_id || card?.candidateId || card?.candidate_id || card?.id || '').trim().slice(0, 180);
    const controlledCard = (card, stableId) => card?.controlled === true || card?.isControlled === true
        || card?.isPlayer === true || card?.is_player === true
        || (!!controlledId && stableId === controlledId)
        || /^(?:player|user|protagonist|controlled character)$/i.test(String(card?.role || '').trim());
    let bridged = false;
    cards.forEach(card => {
        const stableId = stableIdentity(card);
        const name = String(card?.name || card?.label || '').trim().slice(0, 240);
        const thought = text(card?.innerThought || card?.inner_thought);
        if (!stableId || !name || !thought || controlledCard(card, stableId)) return;
        const presenceMode = rosterPresence(stableId, name, card);
        if (!presenceMode) return;
        const matchIndexes = entries.map((entry, index) => {
            const entryId = String(entry?.subjectRef || entry?.candidateId || '').trim();
            return entryId === stableId ? index : -1;
        }).filter(index => index >= 0);
        // Multiple intelligence records for one source identity are already
        // an ambiguity. Preserve both supplied records rather than guessing
        // which one should receive card evidence.
        if (matchIndexes.length > 1) return;
        const sourceClaim = {
            text: thought, subjectRef: stableId, epistemicKind: 'reader_inference',
            uncertainty: '', confidence: null,
            evidence: [{ excerpt: 'Same-packet ScenePulse character card.' }], source: 'scenepulse_character_card'
        };
        const visibleState = Object.fromEntries([
            ['hair', card.hair], ['face', card.face], ['outfit', card.outfit], ['posture', card.posture],
            ['proximity', card.proximity], ['notableDetails', card.notableDetails], ['inventory', card.inventory]
        ].filter(([, value]) => Array.isArray(value) ? value.length : text(value)).map(([key, value]) => [key, experimentalSafeJsonClone(value)]));
        const immediateNeed = text(card.immediateNeed || card.immediate_need);
        const sourceGoals = {
            immediateNeed,
            shortTerm: text(card.shortTermGoal || card.short_term_goal),
            longTerm: text(card.longTermGoal || card.long_term_goal)
        };
        if (matchIndexes.length === 1) {
            const index = matchIndexes[0];
            const entry = entries[index];
            let changed = false;
            if (!entry.sceneLocalImpression) { entry.sceneLocalImpression = sourceClaim; changed = true; }
            if (!normalizedPresence(entry.presence) && presenceMode) { entry.presence = { ...(experimentalIsPlainObject(entry.presence) ? entry.presence : {}), mode: presenceMode }; changed = true; }
            if (!Array.isArray(entry.immediateObjectiveOrConcern) || !entry.immediateObjectiveOrConcern.length) {
                if (immediateNeed) { entry.immediateObjectiveOrConcern = [sidecarReaderClaim({ text: immediateNeed, source: 'scenepulse_character_card' }, stableId)]; changed = true; }
            }
            entry.goals = experimentalIsPlainObject(entry.goals) ? entry.goals : {};
            ['immediateNeed', 'shortTerm', 'longTerm'].forEach(key => {
                if (!String(entry.goals[key] || '').trim() && sourceGoals[key]) { entry.goals[key] = sourceGoals[key]; changed = true; }
            });
            entry.visibleState = experimentalIsPlainObject(entry.visibleState) ? entry.visibleState : {};
            Object.entries(visibleState).forEach(([key, value]) => {
                if (entry.visibleState[key] === undefined || entry.visibleState[key] === null || entry.visibleState[key] === '') {
                    entry.visibleState[key] = value; changed = true;
                }
            });
            if (changed) {
                entry.changedDimensions = [...new Set([...(Array.isArray(entry.changedDimensions) ? entry.changedDimensions : []), 'scenepulseCharacterCard'])].slice(0, 30);
                bridged = true;
            }
            return;
        }
        const derived = normalizeSidecarCharacterIntelligence({
            subjectRef: stableId, candidateId: String(card.candidateId || card.candidate_id || '').trim(), name, role: String(card.role || '').trim(),
            presence: { mode: presenceMode }, innerThought: sourceClaim,
            immediateNeed, goals: sourceGoals, visibleState,
            changedDimensions: ['scenepulseCharacterCard'], status: 'evaluated'
        }, defaults);
        entries.push(derived);
        bridged = true;
    });
    return { characterIntelligence: entries.slice(0, 48), bridged };
}

// The vendored ScenePulse relationship web expects one small graph cache:
// named NPC-to-NPC edges plus optional organizations.  It is deliberately a
// Reader interpretation beside the source tracker, not a World relationship
// mutation.  Keep this boundary compact and validate it before it can reach
// the native source overlay: a graph may only name people the Reader itself
// supplied in its explicitly declared source roster.
function normalizeSidecarNpcRelationshipGraph(raw) {
    if (!experimentalIsPlainObject(raw)) return null;
    const name = value => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 180);
    const edgeTypes = new Set(['family', 'friend', 'ally', 'rival', 'antagonist', 'mentor', 'authority', 'lover', 'lust', 'acquaintance', 'unknown']);
    const roster = [...new Set((Array.isArray(raw.roster) ? raw.roster : (Array.isArray(raw.characters) ? raw.characters : []))
        .map(item => name(experimentalIsPlainObject(item) ? (item.name || item.label) : item))
        .filter(Boolean))].slice(0, 48);
    const rosterByLower = new Map(roster.map(item => [item.toLowerCase(), item]));
    const edges = (Array.isArray(raw.edges) ? raw.edges : []).map(item => {
        if (!experimentalIsPlainObject(item)) return null;
        const from = rosterByLower.get(name(item.from || item.source || item.subject).toLowerCase()) || '';
        const to = rosterByLower.get(name(item.to || item.target).toLowerCase()) || '';
        const type = String(item.type || item.kind || 'unknown').trim().toLowerCase();
        if (!from || !to || from.toLowerCase() === to.toLowerCase() || !edgeTypes.has(type)) return null;
        return {
            from, to, type,
            label: name(item.label || item.summary || type).slice(0, 180),
            direction: String(item.direction || '').toLowerCase() === 'reciprocal' ? 'reciprocal' : 'from-to',
            evidence: String(item.evidence || item.reason || '').trim().slice(0, 900)
        };
    }).filter(Boolean).slice(0, 30);
    const organizations = (Array.isArray(raw.organizations) ? raw.organizations : []).map(item => {
        if (!experimentalIsPlainObject(item)) return null;
        const members = [...new Set((Array.isArray(item.members) ? item.members : [])
            .map(member => rosterByLower.get(name(member).toLowerCase()) || '')
            .filter(Boolean))].slice(0, 48);
        const orgName = name(item.name || item.label).slice(0, 120);
        if (!orgName || members.length < 2) return null;
        return { name: orgName, kind: name(item.kind || 'group').slice(0, 48) || 'group', members };
    }).filter(Boolean).slice(0, 24);
    // A roster is the graph's compact consistency check.  Without it, an
    // old delta could be rendered against a later source character list.
    if (roster.length < 2) return null;
    return { version: 1, roster, edges, organizations };
}

// The source schema declares witnesses as a list.  Reader output occasionally
// compresses one background observer into a scalar string; treating that as
// an empty list makes an accepted, visible fact disappear from Scene Details.
// Preserve the packet's wording as one witness rather than splitting or
// inferring people. This lives at the Reader boundary so the settled
// projection, source renderer, history and comparison use the same shape.
function normalizeSidecarScenePulseShape(raw = {}) {
    const scenePulse = experimentalIsPlainObject(raw) ? experimentalSafeJsonClone(raw) : {};
    if (!Object.prototype.hasOwnProperty.call(scenePulse, 'witnesses')) return scenePulse;
    const rawWitnesses = scenePulse.witnesses;
    const witnessText = value => experimentalIsPlainObject(value)
        ? String(value.name || value.label || value.text || value.value || '').trim()
        : String(value || '').trim();
    if (Array.isArray(rawWitnesses)) {
        scenePulse.witnesses = rawWitnesses.map(witnessText).filter(Boolean).slice(0, 48);
    } else {
        const witness = witnessText(rawWitnesses);
        scenePulse.witnesses = witness ? [witness] : [];
    }
    return scenePulse;
}

function normalizeSidecarReaderEnvelope(raw = {}, defaults = {}) {
    const source = experimentalIsPlainObject(raw) ? raw : {};
    const semantic = experimentalIsPlainObject(source.semanticInterpretation || source.semantic_interpretation) ? (source.semanticInterpretation || source.semantic_interpretation) : {};
    const supplied = Array.isArray(source.suppliedFields) ? source.suppliedFields : Object.keys(source);
    // Keep the nested source shape as provenance.  A delta can legitimately
    // contain a semantic_interpretation object whose individual dimensions
    // differ from the top-level fields.  Losing this set makes the merger
    // preserve stale opening-scene data even when the Reader supplied a full
    // current scene, cast and character reading inside that object.
    const semanticSupplied = Array.isArray(source.semanticSuppliedFields)
        ? source.semanticSuppliedFields
        : Object.keys(semantic);
    const value = (...names) => {
        const direct = sidecarReaderValue(source, ...names);
        return direct === undefined ? sidecarReaderValue(semantic, ...names) : direct;
    };
    const cleanList = (input, limit = 40) => Array.isArray(input) ? input.slice(0, limit).map(item => experimentalIsPlainObject(item) ? experimentalSafeJsonClone(item) : String(item || '').slice(0, 800)) : [];
    const scenePulse = normalizeSidecarScenePulseShape(value('scenePulse', 'scene_pulse', 'scenepulse'));
    const characterInput = value('characterIntelligence', 'character_intelligence', 'characters') || [];
    const suppliedCharacterIntelligence = (Array.isArray(characterInput) ? characterInput : Object.values(characterInput || {}))
        .map(item => normalizeSidecarCharacterIntelligence(item, defaults)).filter(item => item.subjectRef || item.name || item.candidateId).slice(0, 48);
    const scenePulseCognition = scenePulseCharacterCognitionBridge(scenePulse, suppliedCharacterIntelligence, defaults);
    const characterIntelligence = scenePulseCognition.characterIntelligence;
    const coverage = experimentalIsPlainObject(value('coverage')) ? experimentalSafeJsonClone(value('coverage')) : {};
    return {
        schemaVersion: 2,
        profileRevision: String(source.profileRevision || defaults.profileRevision || 'reader-v2').slice(0, 100),
        promptRevision: String(source.promptRevision || defaults.promptRevision || 'scene-intelligence-v2').slice(0, 120),
        sourceTurnId: String(source.sourceTurnId || defaults.sourceTurnId || '').slice(0, 160),
        sourceTakeId: String(source.sourceTakeId || defaults.sourceTakeId || '').slice(0, 160),
        sourceRevisionId: String(source.sourceRevisionId || defaults.sourceRevisionId || '').slice(0, 160),
        sourceAttemptId: String(source.sourceAttemptId || defaults.sourceAttemptId || '').slice(0, 180),
        visibleNarrationHash: String(source.visibleNarrationHash || defaults.visibleNarrationHash || '').slice(0, 120),
        handoffHash: String(source.handoffHash || defaults.handoffHash || '').slice(0, 120),
        snapshotMode: source.snapshotMode === 'full' || source.mode === 'full' ? 'full' : 'delta',
        baseSnapshotId: String(source.baseSnapshotId || source.base_snapshot_id || defaults.baseSnapshotId || '').slice(0, 180),
        changedFields: Array.isArray(source.changedFields || source.changed_fields) ? (source.changedFields || source.changed_fields).map(item => String(item || '').slice(0, 120)).filter(Boolean).slice(0, 100) : [],
        clearFields: Array.isArray(source.clearFields || source.clear_fields) ? (source.clearFields || source.clear_fields).map(String).slice(0, 80) : [],
        suppliedFields: supplied.map(String).slice(0, 140),
        // The character-intelligence supplement is deterministically derived
        // from an explicitly supplied rich ScenePulse character card. Mark it
        // as supplied so a compact card-only delta reaches the existing
        // cognition lane instead of being discarded as an unrelated omission.
        semanticSuppliedFields: [...new Set([...semanticSupplied.map(String), ...(scenePulseCognition.bridged ? ['characterIntelligence'] : [])])].slice(0, 140),
        requiredCharacterSubjects: cleanList(value('requiredCharacterSubjects', 'required_character_subjects'), 24),
        refreshIndex: Math.max(0, Number(source.refreshIndex || defaults.refreshIndex) || 0),
        temporal: experimentalIsPlainObject(value('temporal', 'timeEvidence', 'time_evidence')) ? experimentalSafeJsonClone(value('temporal', 'timeEvidence', 'time_evidence')) : {},
        canonicalReferences: experimentalIsPlainObject(value('canonicalReferences', 'canonical_references')) ? experimentalSafeJsonClone(value('canonicalReferences', 'canonical_references')) : {},
        location: experimentalIsPlainObject(value('location')) ? experimentalSafeJsonClone(value('location')) : {},
        presence: experimentalIsPlainObject(value('presence')) ? experimentalSafeJsonClone(value('presence')) : {},
        environment: experimentalIsPlainObject(value('environment')) ? experimentalSafeJsonClone(value('environment')) : {},
        scene: experimentalIsPlainObject(value('scene')) ? experimentalSafeJsonClone(value('scene')) : {},
        // ScenePulse is a rich presentation contract.  Keep its source
        // fields beside (not in place of) Horde's settled scene envelope so
        // a later delta never has to flatten thoughts, quest detail, meters,
        // or branch hooks back into a generic status summary.
        scenePulse,
        // This is intentionally adjacent to scenePulse rather than inside
        // it: the source relationship web consumes a native cache, while the
        // graph remains a Reader-derived comparison surface, never canon.
        npcRelationshipGraph: normalizeSidecarNpcRelationshipGraph(value('npcRelationshipGraph', 'npc_relationship_graph', 'scenePulseRelationshipGraph', 'scene_pulse_relationship_graph')),
        characterIntelligence,
        relationshipPostures: cleanList(value('relationshipPostures', 'relationship_postures', 'relationshipProposals', 'relationship_proposals'), 60),
        relationshipShifts: cleanList(value('relationshipShifts', 'relationship_shifts'), 60),
        eventClaims: cleanList(value('eventClaims', 'event_claims', 'events'), 80),
        candidateStructures: cleanList(value('candidateStructures', 'candidate_structures', 'candidates'), 100),
        durableProposals: cleanList(value('durableProposals', 'durable_proposals'), 60),
        relationshipProposals: cleanList(value('relationshipProposals', 'relationship_proposals'), 60),
        pressures: cleanList(value('pressures', 'threads', 'obligations', 'currentThreads', 'current_threads'), 60),
        currentThreads: cleanList(value('currentThreads', 'current_threads', 'threads'), 60),
        salientObjects: cleanList(value('salientObjects', 'salient_objects'), 60),
        salientLocations: cleanList(value('salientLocations', 'salient_locations'), 60),
        changes: cleanList(value('changes', 'sceneChanges', 'scene_changes', 'changedThisTurn', 'changed_this_turn'), 100),
        unresolvedEvidence: cleanList(value('unresolvedEvidence', 'unresolved'), 60),
        validationWarnings: cleanList(value('validationWarnings', 'warnings'), 60),
        provisionalCognition: cleanList(value('provisionalCognition', 'provisional_cognition'), 60),
        lookupProvenance: cleanList(value('lookupProvenance', 'lookup_provenance'), 60),
        controlledCharacterEvidence: cleanList(value('controlledCharacterEvidence', 'controlled_character_evidence'), 24),
        summary: String(value('summary', 'sceneReading', 'scene_reading') || '').slice(0, 6000),
        reconciliationFocus: cleanList(value('reconciliationFocus', 'reconciliation_focus'), 40),
        coverage,
        metadata: experimentalIsPlainObject(value('metadata')) ? experimentalSafeJsonClone(value('metadata')) : {}
    };
}

function parseSidecarReaderOutput(content, fallback = {}, defaults = {}) {
    const normalizedContent = Array.isArray(content) ? content.map(part => typeof part === 'string' ? part : String(part?.text || part?.content || '')).filter(Boolean).join('\n') : (experimentalIsPlainObject(content) ? (content.text || content.content || '') : content);
    const raw = String(normalizedContent || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const parsed = experimentalSafeParseJSONRepair(raw);
    if (!experimentalIsPlainObject(parsed)) return { valid: false, error: 'reader_invalid_json', summary: 'The Sidecar Reader returned no usable structured reading.', canonicalReferences: fallback, unresolved: [], proposedQuestions: [], raw: raw.slice(0, 12000) };
    const envelope = normalizeSidecarReaderEnvelope({ ...parsed, canonicalReferences: parsed.canonicalReferences || parsed.canonical_references || fallback }, defaults);
    const hasScene = Object.keys(envelope.scene || {}).length > 0 || Object.keys(envelope.location || {}).length > 0 || Object.keys(envelope.presence || {}).length > 0;
    // A configured ScenePulse custom-panel value is independently useful
    // reader evidence. Do not reject a compact full/section reading merely
    // because it changes only a supported source field such as health.
    const hasScenePulse = Object.keys(envelope.scenePulse || {}).length > 0;
    const declaredDelta = envelope.snapshotMode === 'delta'
        && (Object.prototype.hasOwnProperty.call(parsed, 'changed_fields') || Object.prototype.hasOwnProperty.call(parsed, 'changedFields')
            || Object.prototype.hasOwnProperty.call(parsed, 'coverage') || Object.prototype.hasOwnProperty.call(parsed, 'clear_fields') || Object.prototype.hasOwnProperty.call(parsed, 'clearFields'));
    const hasMeaning = !!envelope.summary || hasScene || hasScenePulse || envelope.eventClaims.length || envelope.characterIntelligence.length || !!envelope.npcRelationshipGraph || envelope.changes.length || Object.keys(envelope.coverage || {}).length > 0 || declaredDelta;
    const valid = hasMeaning && (envelope.snapshotMode !== 'full' || hasScene || hasScenePulse || !!envelope.summary || envelope.characterIntelligence.length > 0);
    return {
        ...envelope, valid, error: valid ? '' : 'reader_empty_envelope',
        mode: envelope.snapshotMode, raw: raw.slice(0, 12000),
        proposedQuestions: Array.isArray(parsed.proposedQuestions || parsed.proposed_questions) ? (parsed.proposedQuestions || parsed.proposed_questions).slice(0, 20) : [],
        unresolved: envelope.unresolvedEvidence,
        timeEvidence: envelope.temporal,
        semanticInterpretation: { scene: envelope.scene, location: envelope.location, presence: envelope.presence, environment: envelope.environment, scenePulse: envelope.scenePulse, npcRelationshipGraph: envelope.npcRelationshipGraph, characterIntelligence: envelope.characterIntelligence, events: envelope.eventClaims, candidateStructures: envelope.candidateStructures, durableProposals: envelope.durableProposals, relationshipProposals: envelope.relationshipProposals, provisionalCognition: envelope.provisionalCognition }
    };
}

function sidecarMergeReaderObject(previous = {}, incoming = {}, clear = []) {
    const result = experimentalSafeJsonClone(previous || {});
    Object.entries(incoming || {}).forEach(([key, value]) => {
        if (value === undefined) return;
        if (value === null || clear.includes(key)) delete result[key];
        else if (experimentalIsPlainObject(value) && experimentalIsPlainObject(result[key])) result[key] = sidecarMergeReaderObject(result[key], value, []);
        else result[key] = experimentalSafeJsonClone(value);
    });
    clear.forEach(key => delete result[key]);
    return result;
}

function sidecarMergeReaderRecords(previous = [], incoming = [], fields = {}) {
    const keyOf = fields.keyOf || (value => String(value?.id || value?.subjectRef || value?.candidateId || value?.label || ''));
    const result = (previous || []).map(value => experimentalSafeJsonClone(value));
    (incoming || []).forEach(raw => {
        const record = experimentalSafeJsonClone(raw);
        const clearFields = Array.isArray(record?.clearFields) ? record.clearFields : [];
        if (record && typeof record === 'object') delete record.clearFields;
        const id = keyOf(record);
        const keyedIndex = id ? result.findIndex(value => keyOf(value) === id) : -1;
        // Some source projections predate stable Horde IDs. A caller may
        // supply a deliberately narrow identity-reveal matcher, but only
        // after the ordinary record key has failed. This keeps the generic
        // Reader reducer deterministic and prevents fuzzy display-name
        // matching from silently merging two different people.
        const fallbackIndex = keyedIndex < 0 && typeof fields.findExistingIndex === 'function'
            ? Number(fields.findExistingIndex(result, record)) : -1;
        const index = keyedIndex >= 0 ? keyedIndex : (Number.isInteger(fallbackIndex) ? fallbackIndex : -1);
        if (record?._delete || record?.operation === 'remove') { if (index >= 0) result.splice(index, 1); return; }
        if (index >= 0) result[index] = sidecarMergeReaderObject(result[index], record, clearFields);
        else result.push(record);
    });
    return result.slice(0, fields.limit || 100);
}

function sidecarScenePulseRecordKey(record, collection) {
    const source = experimentalIsPlainObject(record) ? record : {};
    const keys = collection === 'relationships'
        ? ['relationshipId', 'relationship_id', 'characterId', 'character_id', 'id', 'name']
        : collection === 'characters'
            ? ['characterId', 'character_id', 'id', 'name']
            : collection === 'plotBranches'
                ? ['branchId', 'branch_id', 'id', 'category', 'name']
                : ['questId', 'quest_id', 'id', 'name'];
    return keys.map(key => String(source[key] || '').trim()).find(Boolean)?.toLowerCase() || '';
}

function sidecarScenePulseStableIdentity(record, collection) {
    const source = experimentalIsPlainObject(record) ? record : {};
    const keys = collection === 'relationships'
        ? ['relationshipId', 'relationship_id', 'characterId', 'character_id', 'id']
        : collection === 'characters'
            ? ['characterId', 'character_id', 'id']
            : collection === 'plotBranches'
                ? ['branchId', 'branch_id', 'id']
                : ['questId', 'quest_id', 'id'];
    return keys.map(key => String(source[key] || '').trim()).find(Boolean)?.toLowerCase() || '';
}

function sidecarScenePulseIdentityAliases(record) {
    const source = experimentalIsPlainObject(record) ? record : {};
    const raw = [source.name, ...(Array.isArray(source.aliases) ? source.aliases : []), ...(Array.isArray(source.previousNames) ? source.previousNames : [])];
    return [...new Set(raw.map(value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase()).filter(Boolean))];
}

// A reveal must not produce "Officer Buzzcut" and "Jack Browning" as two
// separate people. Stable IDs are authoritative; where older compact input
// has no ID, an exact declared alias is the only permitted fallback. Two
// candidates means ambiguity, so the patch remains a separate record for
// review rather than guessing from a first name, title, or substring.
function sidecarScenePulseRevealMatchIndex(records = [], record = {}, collection = '') {
    if (collection !== 'characters' && collection !== 'relationships') return -1;
    const stable = sidecarScenePulseStableIdentity(record, collection);
    if (stable) {
        const stableMatches = records.map((value, index) => sidecarScenePulseStableIdentity(value, collection) === stable ? index : -1).filter(index => index >= 0);
        if (stableMatches.length === 1) return stableMatches[0];
    }
    const aliases = new Set(sidecarScenePulseIdentityAliases(record));
    if (!aliases.size) return -1;
    const aliasMatches = records.map((value, index) => sidecarScenePulseIdentityAliases(value).some(alias => aliases.has(alias)) ? index : -1).filter(index => index >= 0);
    return aliasMatches.length === 1 ? aliasMatches[0] : -1;
}

// The compact ScenePulse contract permits a collection patch to be expressed
// as an object keyed by its stable record id.  Normalise that wire-efficient
// form at the reducer boundary, preserving the map key as the source record
// identity.  The rendered source product still receives its native arrays.
function sidecarScenePulseRecords(value, collection) {
    if (Array.isArray(value)) return experimentalSafeJsonClone(value);
    if (!experimentalIsPlainObject(value)) return [];
    const identityField = collection === 'relationships'
        ? 'relationshipId'
        : collection === 'characters'
            ? 'characterId'
            : collection === 'plotBranches'
                ? 'branchId'
                : 'questId';
    return Object.entries(value).map(([stableId, raw]) => {
        if (!experimentalIsPlainObject(raw)) return raw;
        const record = experimentalSafeJsonClone(raw);
        const explicitIdentity = record[identityField]
            || record[identityField.replace(/[A-Z]/g, char => `_${char.toLowerCase()}`)]
            || record.id;
        // A display name is intentionally not enough here: it is mutable and
        // must not discard the stable identity that was supplied as the key.
        if (!explicitIdentity && String(stableId).trim()) record[identityField] = String(stableId).trim();
        return record;
    });
}

// ScenePulse data is a presentation projection, but sparse Reader packets
// still need deterministic record-level merging. A relationship delta such
// as {relationshipId, trust} must preserve milestone, stress, labels, etc.
function sidecarMergeScenePulse(previous = {}, incoming = {}) {
    const prior = experimentalIsPlainObject(previous) ? previous : {};
    const patch = experimentalIsPlainObject(incoming) ? incoming : {};
    const clearFields = Array.isArray(patch.clearFields) ? patch.clearFields.map(String) : [];
    const replaceCollections = new Set(Array.isArray(patch.replaceCollections) ? patch.replaceCollections.map(String) : []);
    const values = experimentalSafeJsonClone(patch);
    delete values.clearFields;
    delete values.replaceCollections;
    const result = sidecarMergeReaderObject(prior, values, clearFields);
    const keyedCollections = ['characters', 'relationships', 'mainQuests', 'sideQuests', 'plotBranches'];
    keyedCollections.forEach(collection => {
        if (!Object.prototype.hasOwnProperty.call(patch, collection) && !clearFields.includes(collection)) return;
        const base = clearFields.includes(collection) || replaceCollections.has(collection) ? [] : (prior[collection] || []);
        const sourceRecords = sidecarScenePulseRecords(patch[collection], collection);
        // ScenePulse relationship movement is compact signed data after a
        // baseline exists. Apply it at the Reader reducer so the source panel
        // always receives the current meter values it renders, while its
        // native history continues to derive the previous-turn marker.
        const records = collection === 'relationships' ? sourceRecords.map(raw => {
            if (!experimentalIsPlainObject(raw)) return raw;
            const record = experimentalSafeJsonClone(raw);
            const deltas = experimentalIsPlainObject(record.meterDeltas) ? record.meterDeltas
                : (experimentalIsPlainObject(record.meter_deltas) ? record.meter_deltas : null);
            if (!deltas) return record;
            delete record.meterDeltas;
            delete record.meter_deltas;
            const incomingKey = sidecarScenePulseRecordKey(record, collection);
            const previous = base.find(item => sidecarScenePulseRecordKey(item, collection) === incomingKey)
                || base[sidecarScenePulseRevealMatchIndex(base, record, collection)] || null;
            if (!previous) return record;
            ['affection', 'trust', 'desire', 'stress', 'compatibility'].forEach(meter => {
                if (Object.prototype.hasOwnProperty.call(record, meter)) return;
                const current = Number(previous[meter]);
                const delta = Number(deltas[meter]);
                if (!Number.isFinite(current) || current === -1 || !Number.isFinite(delta)) return;
                record[meter] = Math.max(0, Math.min(100, Math.round((current + delta) * 100) / 100));
            });
            return record;
        }) : sourceRecords;
        result[collection] = replaceCollections.has(collection)
            ? experimentalSafeJsonClone(records).slice(0, 100)
            : sidecarMergeReaderRecords(base, records, {
                keyOf: record => sidecarScenePulseRecordKey(record, collection),
                findExistingIndex: (existing, record) => sidecarScenePulseRevealMatchIndex(existing, record, collection),
                limit: 100
            });
    });
    // Presence is a per-turn coverage assertion, not a patchable history.
    if (Object.prototype.hasOwnProperty.call(patch, 'charactersPresent')) result.charactersPresent = experimentalSafeJsonClone(patch.charactersPresent);
    return result;
}

function mergeSidecarReaderEnvelope(previous, delta, options = {}) {
    const prior = normalizeSidecarReaderEnvelope(previous || {}, options);
    const incoming = normalizeSidecarReaderEnvelope(delta || {}, options);
    if (!previous || incoming.snapshotMode === 'full') return incoming;
    const raw = experimentalIsPlainObject(delta) ? delta : {};
    const provided = new Set(incoming.suppliedFields || Object.keys(raw));
    const semanticProvided = new Set(incoming.semanticSuppliedFields || []);
    const merged = experimentalSafeJsonClone(prior);
    const fieldAliases = field => [field, field.replace(/[A-Z]/g, char => `_${char.toLowerCase()}`)];
    const providedField = field => fieldAliases(field).some(name => provided.has(name) || semanticProvided.has(name)
        || Object.prototype.hasOwnProperty.call(raw.semanticInterpretation || raw.semantic_interpretation || {}, name));
    const objectFields = ['temporal', 'canonicalReferences', 'location', 'presence', 'environment', 'scene', 'coverage', 'metadata'];
    objectFields.forEach(field => { if (providedField(field)) merged[field] = sidecarMergeReaderObject(prior[field], incoming[field], incoming.clearFields || []); });
    if (providedField('scenePulse')) merged.scenePulse = sidecarMergeScenePulse(prior.scenePulse, incoming.scenePulse);
    // NPC graph updates are intentionally whole-cache replacements.  A
    // partial edge patch would be less compact in practice and can leave a
    // stale tie visible after a name/roster change.
    if (providedField('npcRelationshipGraph')) merged.npcRelationshipGraph = experimentalSafeJsonClone(incoming.npcRelationshipGraph);
    const arrayFields = ['characterIntelligence', 'requiredCharacterSubjects', 'relationshipPostures', 'relationshipShifts', 'eventClaims', 'candidateStructures', 'durableProposals', 'relationshipProposals', 'pressures', 'currentThreads', 'salientObjects', 'salientLocations', 'changes', 'unresolvedEvidence', 'validationWarnings', 'provisionalCognition', 'lookupProvenance', 'controlledCharacterEvidence', 'reconciliationFocus'];
    arrayFields.forEach(field => { if (providedField(field)) merged[field] = sidecarMergeReaderRecords(prior[field], incoming[field], { limit: field === 'characterIntelligence' ? 48 : 100 }); });
    const perSnapshotFields = new Set(['changedFields', 'clearFields', 'refreshIndex', 'baseSnapshotId', 'snapshotMode', 'sourceTurnId', 'sourceTakeId', 'sourceRevisionId', 'sourceAttemptId', 'visibleNarrationHash', 'handoffHash', 'profileRevision', 'promptRevision']);
    ['summary', ...perSnapshotFields].forEach(field => {
        if (providedField(field) || perSnapshotFields.has(field)) merged[field] = experimentalSafeJsonClone(incoming[field]);
    });
    // These describe this source packet, not cumulative state.  Carrying a
    // prior packet's field list forward makes a later sparse delta look as if
    // it cleared/replaced dimensions it never addressed.
    merged.suppliedFields = [...new Set(incoming.suppliedFields || [])];
    merged.semanticSuppliedFields = [...new Set(incoming.semanticSuppliedFields || [])];
    return normalizeSidecarReaderEnvelope(merged, options);
}

function attachSidecarReaderSnapshot(world, sess, turnRecord, packet, options = {}) {
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    if (!protocol || !turnRecord || !packet) return null;
    const profile = options.profile || effectiveSidecarReaderProfile(world, sess);
    const previousSnapshot = protocol.readerSnapshots.filter(snapshot => snapshot.status === 'active').at(-1) || null;
    const suppliedBase = String(packet?.baseSnapshotId || packet?.base_snapshot_id || '').trim();
    const isDelta = !options.fullRefresh && packet?.mode !== 'full' && packet?.snapshotMode !== 'full';
    if (isDelta && previousSnapshot && suppliedBase && suppliedBase !== previousSnapshot.id) {
        const mismatch = new Error('Reader delta named a base snapshot outside the accepted current continuity.');
        mismatch.code = 'reader_delta_base_mismatch';
        mismatch.expectedBaseSnapshotId = previousSnapshot.id;
        mismatch.suppliedBaseSnapshotId = suppliedBase;
        throw mismatch;
    }
    if (isDelta && !previousSnapshot) {
        const missingBase = new Error('The first Reader snapshot for a continuity must be a full envelope.');
        missingBase.code = 'reader_delta_without_base';
        throw missingBase;
    }
    const controlledEntityId = String(options.controlledEntityId || sess?.controlledEntityId || 'player').trim();
    const source = normalizeSidecarReaderEnvelope({
        ...packet, profileRevision: profile.revision, promptRevision: profile.promptRevision,
        sourceTurnId: turnRecord.id, sourceTakeId: turnRecord.takeId || options.takeId || '', sourceRevisionId: turnRecord.revisionId || options.revisionId || '',
        sourceAttemptId: options.attemptId || turnRecord.currentAttemptId || '',
        visibleNarrationHash: worldMediaHash(String(turnRecord.authorialArtifact?.narration ?? turnRecord.narration ?? '')),
        handoffHash: worldMediaHash(String(turnRecord.authorialArtifact?.handoff ?? turnRecord.handoff ?? '')),
        refreshIndex: Number(options.refreshIndex) || 0, snapshotMode: options.fullRefresh ? 'full' : (packet.mode === 'full' ? 'full' : 'delta'),
        baseSnapshotId: previousSnapshot?.id || '', metadata: { ...(packet.metadata || {}), model: packet.model || '', provider: packet.provider || '', finishReason: packet.finishReason || '', rounds: packet.rounds || 1, scenePulsePreset: experimentalSafeJsonClone(profile.scenePulsePreset || null), usage: experimentalSafeJsonClone(packet.readerMetrics || {}), capturedAt: new Date().toISOString() }
    }, { controlledEntityId });
    const envelope = mergeSidecarReaderEnvelope(previousSnapshot?.envelope || null, source, {
        profileRevision: profile.revision, promptRevision: profile.promptRevision,
        sourceTurnId: turnRecord.id, baseSnapshotId: previousSnapshot?.id || '', controlledEntityId
    });
    // Keep the exact Reader packet beside the materialized envelope. The
    // envelope is deliberately cumulative so the source panel never shrinks
    // when a focused reread omits unrelated fields; Inspect and timeline
    // delta markers still need the small packet that produced this snapshot.
    const snapshot = { id: `reader_snapshot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, status: 'pending_reconciliation', createdAt: new Date().toISOString(), attemptId: source.sourceAttemptId, turnId: turnRecord.id, takeId: turnRecord.takeId || '', sceneId: turnRecord.sceneId || protocol.activeSceneId || '', sequenceId: turnRecord.sequenceId || protocol.activeSequenceId || '', envelope, rawEnvelope: experimentalSafeJsonClone(source), provenance: { source: 'sidecar_semantic_reader', profileRevision: profile.revision, readerMode: envelope.snapshotMode, priorSnapshotId: previousSnapshot?.id || '' } };
    protocol.readerSnapshots.push(snapshot); protocol.readerSnapshots = protocol.readerSnapshots.slice(-400);
    turnRecord.readerEnvelope = experimentalSafeJsonClone(envelope); turnRecord.readerSnapshotId = snapshot.id;
    // Pending interpretation is audit/retry evidence only. Never publish it
    // through the active next-turn packet before Sidecar settles it.
    return snapshot;
}

function activateSidecarReaderSnapshot(world, sess, snapshotId, turnId = '') {
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    const snapshot = protocol?.readerSnapshots?.find(item => item.id === snapshotId);
    if (!snapshot) return null;
    protocol.readerSnapshots.forEach(item => { if (item.id !== snapshot.id && item.status === 'active') { item.status = 'accepted_historical'; item.historicalAt = new Date().toISOString(); } });
    snapshot.status = 'active'; snapshot.activatedAt = new Date().toISOString(); snapshot.settlementStatus = 'settled';
    snapshot.provenance = { ...(snapshot.provenance || {}), committedTurnId: turnId || snapshot.turnId };
    protocol.sceneReader = experimentalSafeJsonClone(snapshot.envelope);
    const scene = (protocol.scenes || []).find(item => item.id === snapshot.sceneId);
    if (scene) scene.readerState = experimentalSafeJsonClone({ summary: snapshot.envelope.summary, scene: snapshot.envelope.scene, environment: snapshot.envelope.environment, presence: snapshot.envelope.presence, temporal: snapshot.envelope.temporal, characterIntelligence: snapshot.envelope.characterIntelligence, candidateStructures: snapshot.envelope.candidateStructures || [], nonCanonical: true, snapshotId: snapshot.id });
    return snapshot;
}

function queueSidecarQuestion(world, sess, prompt, evidence = '', options = {}) {
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    if (!protocol) return null;
    const stableId = String(options.id || '').trim();
    const prior = protocol.questions.find(question => ['open', 'deferred'].includes(question.status)
        && (stableId ? question.id === stableId : question.prompt === prompt));
    if (prior) return prior;
    const question = {
        id: stableId || `q_sidecar_${Date.now().toString(36)}_${protocol.questions.length + 1}`,
        origin: options.origin || 'sidecar_reconciliation', target: options.target || 'user', status: 'open', prompt: String(prompt).slice(0, 1200),
        evidence: String(evidence).slice(0, 4000), createdTurn: Math.max(1, Number(sess.turnCount) || 1),
        attempts: 0, dependencies: Array.isArray(options.dependencies) ? options.dependencies.slice(0, 12) : [],
        pressure: ['low', 'medium', 'high'].includes(options.pressure) ? options.pressure : 'low',
        priority: ['low', 'medium', 'high'].includes(options.priority) ? options.priority : (['low', 'medium', 'high'].includes(options.pressure) ? options.pressure : 'low'),
        blocking: options.blocking === true,
        scope: options.scope || 'world', relevance: options.relevance || 'active_scene',
        sceneId: options.sceneId || protocol.activeSceneId || '', sequenceId: options.sequenceId || protocol.activeSequenceId || '',
        revisionId: options.revisionId || '', resolutionType: '',
        attemptHistory: [], priorityHistory: [], answerProvenance: [], evidenceInspected: [], repairCallHistory: [], targetTransferHistory: [], finalResolution: null,
        provenance: { source: options.source || 'sidecar', ...(experimentalIsPlainObject(options.provenance) ? options.provenance : {}) }, createdAt: new Date().toISOString()
    };
    protocol.questions.push(question);
    return question;
}

function recordSidecarQuestionAttempt(world, sess, questionId, attempt = {}) {
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    const question = protocol?.questions?.find(item => item.id === questionId);
    if (!question) return null;
    question.attempts = (Number(question.attempts) || 0) + 1;
    if (!Array.isArray(question.attemptHistory)) question.attemptHistory = [];
    question.attemptHistory.push({ at: new Date().toISOString(), ...experimentalSafeJsonClone(attempt) });
    question.attemptHistory = question.attemptHistory.slice(-20);
    return question;
}

function updateSidecarQuestion(world, sess, questionId, patch = {}) {
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    const question = protocol?.questions?.find(item => item.id === questionId);
    if (!question) return null;
    if (patch.priority && ['low', 'medium', 'high'].includes(patch.priority) && patch.priority !== question.priority) {
        if (!Array.isArray(question.priorityHistory)) question.priorityHistory = [];
        question.priorityHistory.push({ from: question.priority, to: patch.priority, at: new Date().toISOString(), reason: String(patch.priorityReason || '').slice(0, 500), provenance: patch.priorityProvenance || 'sidecar' });
        question.priority = patch.priority;
        question.pressure = patch.priority;
    }
    if (typeof patch.blocking === 'boolean') question.blocking = patch.blocking;
    if (patch.relevance) question.relevance = String(patch.relevance).slice(0, 120);
    if (Array.isArray(patch.evidenceInspected)) question.evidenceInspected = patch.evidenceInspected.slice(-20);
    if (patch.status && ['open', 'resolved', 'deferred', 'expired', 'superseded'].includes(patch.status)) question.status = patch.status;
    if (patch.resolutionType) question.resolutionType = String(patch.resolutionType).slice(0, 120);
    if (patch.answer != null) question.answer = String(patch.answer).slice(0, 3000);
    if (patch.provenance) question.answerProvenance = [...(question.answerProvenance || []), experimentalSafeJsonClone(patch.provenance)].slice(-20);
    if (question.status !== 'open') { question.resolvedAt = question.resolvedAt || new Date().toISOString(); question.finalResolution = { status: question.status, resolutionType: question.resolutionType, answer: question.answer || '', at: question.resolvedAt }; }
    return question;
}

// A Sidecar request is a World operation, not an application-global request.
// Keep the captured UI owner separate from the canonical-checkpoint guard: the
// checkpoint stops a stale receipt, while this stops a slow Reader/repair from
// attaching any result after the author has changed Experimental context.
function captureExperimentalSidecarOwner(world, sess) {
    return Object.freeze({
        mode: 'experimental-worlds',
        worldId: String(world?.id || ''),
        timelineId: String(sess?.id || ''),
        worldEpoch: Number(sess?._worldEpoch) || 0,
        restoreGeneration: Number(window.ExperimentalWorldsRestoreGeneration) || 0,
        effectiveSettings: Object.freeze({
            model: String(world?.model || ExperimentalWorldsState.globalSettings?.defaultModel || ''),
            provider: String(world?.provider || ExperimentalWorldsState.globalSettings?.apiProvider || '')
        })
    });
}

function assertExperimentalSidecarOwner(owner) {
    const currentWorld = ExperimentalWorldsState.worlds.find(candidate => candidate.id === ExperimentalWorldsState.activeWorldId);
    const currentSession = getCurrentWorldSession();
    const valid = ExperimentalWorldsState.view === 'worldPlay'
        && String(currentWorld?.id || '') === owner.worldId
        && String(currentSession?.id || '') === owner.timelineId
        && Number(currentSession?._worldEpoch) === owner.worldEpoch
        && Number(window.ExperimentalWorldsRestoreGeneration) === owner.restoreGeneration;
    if (valid) return;
    const error = new Error('A late Experimental Worlds Sidecar result was discarded because its captured mode, World, timeline, revision, or restore generation is no longer current.');
    error.code = 'experimental_world_owner_changed';
    throw error;
}

async function runSidecarQuestionRepair(world, sess, questionId) {
    const requestOwner = captureExperimentalSidecarOwner(world, sess);
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    const question = protocol?.questions?.find(item => item.id === questionId && item.status === 'open');
    if (!question) throw new Error('Question is no longer open.');
    const config = window.ExperimentalWorldsSidecarMode?.normalizeWorldConfig?.(world) || {}; const tracker = config.tracker || {};
    const narratorModel = world.model || ExperimentalWorldsState.globalSettings.defaultModel;
    const model = tracker.inheritNarrator !== false || !tracker.model ? narratorModel : tracker.model;
    const narratorProvider = ExperimentalWorldsHost.normalizedProviderId(ExperimentalWorldsState.globalSettings?.apiProvider || 'openrouter');
    const provider = tracker.inheritNarrator !== false || !tracker.provider
        ? narratorProvider : ExperimentalWorldsHost.normalizedProviderId(tracker.provider);
    const readerProfile = effectiveSidecarReaderProfile(world, sess);
    const readerModel = readerProfile.model || model;
    const readerProvider = readerProfile.provider ? ExperimentalWorldsHost.normalizedProviderId(readerProfile.provider) : provider;
    const prompt = `[SIDECAR QUESTION REPAIR]\nAnswer only this one unresolved authorial question from the supplied evidence. Do not mutate canon and do not infer adjacent facts. Return JSON only: {"answer":"YES|NO|UNKNOWN|CLARIFICATION","explanation":"brief"}.\nQUESTION: ${JSON.stringify({ id: question.id, prompt: question.prompt, evidence: question.evidence, dependencies: question.dependencies })}\nPACKET: ${JSON.stringify(buildSidecarScenePacket(world, sess))}`;
    const body = { model, max_tokens: 800, temperature: 0, messages: [{ role: 'system', content: prompt }, { role: 'user', content: 'Provide the narrow repair answer.' }] };
    // A narrow repair should inherit the world's Sidecar reasoning policy;
    // it is still capped tightly so it cannot become an unbounded debate.
    applySidecarReasoning(body, provider, tracker, world);
    const response = await fetchSidecarCompletion(body, {
        provider, tracker, world,
        owner: { ...world, model, provider, openRouterRouting: tracker.openRouterRouting || world.openRouterRouting }
    });
    if (!response.ok) throw new Error((await response.text()).slice(0, 500) || `Question repair failed (${response.status})`);
    assertExperimentalSidecarOwner(requestOwner);
    const reply = (await response.json())?.choices?.[0]?.message?.content || '{}'; const parsed = experimentalSafeParseJSONRepair(reply) || {};
    recordSidecarQuestionAttempt(world, sess, question.id, { channel: 'explicit_repair', answer: parsed.answer || 'UNKNOWN', explanation: parsed.explanation || '' });
    question.repairCallHistory = [...(question.repairCallHistory || []), { at: new Date().toISOString(), model, answer: parsed.answer || 'UNKNOWN', explanation: String(parsed.explanation || '').slice(0, 800) }].slice(-12);
    question.answer = String(parsed.explanation || parsed.answer || 'UNKNOWN').slice(0, 3000); question.resolutionType = 'canonical_evidence_resolution'; question.provenance = { ...(question.provenance || {}), lastRepair: 'explicit_sidecar_repair' };
    await ExperimentalWorldsHost.persist(); renderSidecarConversation(world, sess); return parsed;
}

function queueSidecarReconciliationQuestions(world, sess, audit) {
    const rejected = Array.isArray(audit?.rejected) ? audit.rejected.slice(-6) : [];
    rejected.forEach(item => {
        const reason = String(item.reason || 'unreconciled_state').slice(0, 120);
        const actor = String(item.actor_id || '').slice(0, 120);
        queueSidecarQuestion(world, sess,
            `A narrated change could not be reconciled (${reason}${actor ? ` for ${actor}` : ''}). Should this remain unresolved, or can a later beat establish the missing fact?`,
            String(item.detail || reason), {
                id: `reconcile.${reason}.${actor || 'world'}`.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 180),
                origin: 'reconciliation', target: 'narrator', pressure: 'low'
            });
    });
}

// A scene may foreground an NPC whose clothing has never been authored.  Do
// not invent an outfit (and do not manufacture an image) in that situation;
// preserve the uncertainty as one directed, scene-scoped question so the
// Narrator can establish a useful visible first impression naturally.  The
// stable ID prevents the same NPC from being re-prompted on every turn.
function queueSidecarSceneOutfitQuestions(world, sess, turnRecord = null) {
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    if (!protocol) return [];
    const frame = buildWorldSceneFrame(world, sess);
    const sceneId = String(turnRecord?.sceneId || protocol.activeSceneId || 'scene');
    const priorTurns = (protocol.turns || []).filter(turn => turn !== turnRecord && String(turn.sceneId || '') === sceneId);
    const newlyForegrounded = new Set();
    frame.present_character_ids.forEach(id => {
        const hadPriorPresence = priorTurns.some(turn => {
            const ids = [...(turn.preFrame?.present_character_ids || []), ...(turn.postFrame?.present_character_ids || [])];
            return ids.includes(id);
        });
        if (!hadPriorPresence) newlyForegrounded.add(id);
    });
    const queued = [];
    newlyForegrounded.forEach(id => {
        const entity = (world.entities || []).find(item => item.id === id && item.type === 'npc');
        if (!entity) return;
        const runtimeOutfit = String(sess.entityStates?.[id]?.outfit || entity.currentOutfit || '').trim();
        const authoredOutfit = worldCurrentOutfit(entity);
        if (runtimeOutfit || authoredOutfit) return;
        const questionId = `outfit.scene.${sceneId}.${id}`.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 180);
        if ((protocol.questions || []).some(question => question.id === questionId)) return;
        const question = queueSidecarQuestion(world, sess,
            `${entity.name || id} is foregrounded in this scene, but no concrete current outfit has been established. Should the Narrator establish what ${entity.name || 'this character'} is wearing now, or should the visible clothing remain unknown?`,
            `Scene entry for ${entity.name || id}. The character may remain intentionally undescribed; do not infer clothing from a portrait or dossier identity fields.`,
            { id: questionId, origin: 'scene_outfit_entry', target: 'narrator', pressure: 'low', priority: 'low', scope: 'scene', sceneId, relevance: 'foreground_character' });
        if (question) queued.push(question);
    });
    return queued;
}

async function runSidecarReconciliation(world, sess, options = {}) {
    const requestOwner = captureExperimentalSidecarOwner(world, sess);
    const config = window.ExperimentalWorldsSidecarMode?.normalizeWorldConfig?.(world) || {};
    const tracker = config.tracker || {};
    const narratorModel = world.model || ExperimentalWorldsState.globalSettings.defaultModel;
    const model = tracker.inheritNarrator !== false || !tracker.model ? narratorModel : tracker.model;
    const narratorProvider = ExperimentalWorldsHost.normalizedProviderId(ExperimentalWorldsState.globalSettings?.apiProvider || 'openrouter');
    const provider = tracker.inheritNarrator !== false || !tracker.provider
        ? narratorProvider : ExperimentalWorldsHost.normalizedProviderId(tracker.provider);
    const sidecarWorld = {
        ...world,
        model,
        provider,
        openRouterRouting: tracker.openRouterRouting || world.openRouterRouting
    };
    // A retry belongs to the accepted Narrator artifact, never to the caller
    // which happened to ask for the retry.  In particular, do not let a
    // trimmed UI preview or a stale editor value become the source of a new
    // Reader/Sidecar pass.
    const acceptedArtifact = options.existingTurnRecord?.authorialArtifact || null;
    const authoredNarration = acceptedArtifact?.narration ?? options.narration;
    const authoredHandoff = acceptedArtifact?.handoff ?? options.handoff;
    const authoredPlayerInput = acceptedArtifact?.playerInput ?? options.playerInput;
    const preFrame = buildWorldSceneFrame(world, sess);
    const preClock = getWorldTimeData(world, sess);
    const clockEvidence = buildSidecarClockEvidence(world, sess);
    // FF 5.4 scene header: parse the visible start-anchor as structured
    // temporal evidence and split the beat into inter-turn jump + in-turn
    // elapsed before the Reader/Reconciler see it.
    const sceneHeader = extractFF54SceneHeader(String(authoredNarration || ''));
    const temporalBreakdown = deriveSidecarTwoPhaseTemporal(clockEvidence, sceneHeader, String(authoredHandoff || ''));
    const handoff = String(authoredHandoff || '').trim();
    const narration = String(authoredNarration || '').trim();
    const playerInput = String(authoredPlayerInput || '');
    const commitTool = experimentalSafeJsonClone(options.commitTool);
    const priorPacket = buildSidecarScenePacket(world, sess);
    const priorReconciliationEvidence = (window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess)?.turns || [])
        .filter(turn => ['reconciliation_pending', 'reconciliation_failed'].includes(turn.status))
        .slice(-4)
        .map(turn => ({
            turnId: turn.id,
            status: turn.reconciliationStatus || turn.status,
            playerInput: String(turn.playerInput || '').slice(0, 1600),
            visibleNarration: String(turn.narration || '').slice(0, 8000),
            handoff: String(turn.handoff || '').slice(0, 6000),
            failure: turn.failure ? {
                code: turn.failure.code,
                message: String(turn.failure.message || '').slice(0, 800),
                finishReason: turn.failure.finishReason || ''
            } : null,
            provenance: turn.provenance || null
        }));
    const references = buildSidecarCanonicalReferenceManifest(world, sess,
        `${playerInput}\n${narration}\n${handoff}`);
    const protocolBeforeReader = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    const priorReaderSnapshot = protocolBeforeReader?.readerSnapshots?.filter(snapshot => snapshot.status === 'active').at(-1) || null;
    const priorReaderEnvelope = priorReaderSnapshot?.envelope || null;
    const readerProfile = effectiveSidecarReaderProfile(world, sess);
    const readerModel = readerProfile.model || model;
    const readerProvider = readerProfile.provider ? ExperimentalWorldsHost.normalizedProviderId(readerProfile.provider) : provider;
    const readerIndex = (Number(protocolBeforeReader?.readerSnapshots?.length) || 0) + 1;
    const forceReaderFull = !priorReaderSnapshot || readerIndex === 1 || readerIndex % Math.max(1, Number(readerProfile.fullRefreshCadence) || 5) === 0;
    const existingTurnRecord = options.existingTurnRecord || null;
    const attempt = beginSidecarTurnAttempt(world, sess, {
        handoff, narration, playerInput,
        sceneHeader: experimentalSafeJsonClone(temporalBreakdown),
        preFrame, preClock: clockEvidence, model, provider,
        takeIndex: options.takeIndex, takeId: options.takeId, revisionId: options.revisionId,
        handoffComplete: options.handoffComplete !== false,
        existingTurnRecord,
        sourceTurnId: existingTurnRecord?.id || options.sourceTurnId || '',
        idempotencyKey: existingTurnRecord?.logicalCommitIdentity || options.idempotencyKey || '',
        preCanonicalFingerprint: existingTurnRecord?.preCanonicalFingerprint || sidecarCanonicalCheckpointFingerprint(world, sess),
        preWorldStateVersion: existingTurnRecord?.preWorldStateVersion ?? sess.worldStateVersion,
        readerPacketOverride: options.readerPacketOverride
    });
    let readerPacket;
    if (tracker.readerEnabled === false) {
        readerPacket = {
            valid: false,
            disabled: true,
            summary: 'Sidecar semantic reader disabled for this world; reconciliation used the Narrator handoff directly.',
            canonicalReferences: references,
            unresolved: [],
            proposedQuestions: [],
            controlledCharacterEvidence: [],
            raw: ''
        };
        recordSidecarTrace(world, sess, { kind: 'semantic_reader_disabled', model, provider });
    } else if (options.readerPacketOverride && experimentalIsPlainObject(options.readerPacketOverride)) {
        readerPacket = experimentalSafeJsonClone(options.readerPacketOverride);
        recordSidecarTrace(world, sess, { kind: 'semantic_reader_reused', model: readerModel, provider: readerProvider, sourceTurnId: attempt.turnRecord?.id || '' });
    } else try {
        options.onStage?.('reading');
        readerPacket = await runSidecarSemanticReading(world, sess, {
            tracker, provider: readerProvider, model: readerModel, readerProfile, sidecarWorld, references, preFrame, clockEvidence,
            priorReaderEnvelope, priorReaderSnapshotId: priorReaderSnapshot?.id || '', forceFull: forceReaderFull, playerInput, narration, handoff, signal: options.signal
        });
    } catch (readerError) {
        // A Reader failure is a terminal downstream failure.  Do not pass a
        // synthetic envelope to Sidecar: that would turn an interpretation
        // outage into an unreviewed canonical mutation.
        const failure = new Error(String(readerError?.message || readerError || 'Sidecar Reader failed.').slice(0, 1600));
        failure.code = readerError?.code || 'sidecar_reader_failed';
        failure.sidecarDetail = {
            code: failure.code,
            stage: 'reader',
            model: readerModel,
            provider: readerProvider,
            response: readerError?.sidecarDetail?.response || null
        };
        if (attempt.turnRecord) {
            attempt.turnRecord.reader = { valid: false, failure: { code: failure.code, message: failure.message }, model: readerModel, provider: readerProvider };
            const currentAttempt = attempt.turnRecord.attempts?.find(item => item.id === attempt.attemptId);
            if (currentAttempt) currentAttempt.readerStatus = 'failed';
        }
        logSidecarConsoleTrace('Reader failure', { model: readerModel, provider: readerProvider, error: failure.message });
        recordSidecarTrace(world, sess, { kind: 'semantic_reader_failure', model: readerModel, provider: readerProvider, error: failure.message });
        // This throw occurs before the reconciliation request's try/catch.
        // Persist the failed attempt here so Retry Scene Update can safely
        // resume the same authored Take instead of accidentally rerolling it.
        assertExperimentalSidecarOwner(requestOwner);
        failure.sidecarAttempt = failSidecarTurnAttempt(world, sess, attempt, failure, failure.sidecarDetail);
        throw failure;
    }
    if (!readerPacket?.disabled && readerPacket?.valid === false) {
        const failure = new Error('Sidecar Reader returned no valid scene envelope.');
        failure.code = 'sidecar_reader_invalid_output';
        failure.sidecarDetail = { code: failure.code, stage: 'reader', model: readerModel, provider: readerProvider };
        assertExperimentalSidecarOwner(requestOwner);
        failure.sidecarAttempt = failSidecarTurnAttempt(world, sess, attempt, failure, failure.sidecarDetail);
        throw failure;
    }
    // Do this before Reader evidence is attached to the protocol. A Reader
    // packet is inspectable state, so it must not be published into a World
    // that the author has left while the transport was in flight.
    assertExperimentalSidecarOwner(requestOwner);
    if (attempt.turnRecord) {
        attempt.turnRecord.reader = experimentalSafeJsonClone(readerPacket);
        const readerIsProcessable = !readerPacket?.disabled && readerPacket?.valid !== false;
        // A Reader result reused after Sidecar failure remains audit evidence
        // for its old attempt. Attach a fresh pending snapshot for this new
        // attempt instead of reactivating the failed attempt's snapshot.
        const existingSnapshot = null;
        const readerSnapshot = readerIsProcessable
            ? (existingSnapshot || attachSidecarReaderSnapshot(world, sess, attempt.turnRecord, readerPacket, { profile: readerProfile, fullRefresh: forceReaderFull, refreshIndex: readerIndex, takeId: options.takeId, revisionId: options.revisionId, attemptId: attempt.attemptId }))
            : null;
        attempt.turnRecord.readerSnapshotId = readerSnapshot?.id || attempt.turnRecord.readerSnapshotId || '';
        // Keep all Reader-derived records attempt-local until Sidecar commits.
        // The envelope is inspectable through Backstage, but no candidate,
        // question, proposal, or scene projection becomes active here.
        attempt.turnRecord.readerProposalDrafts = readerIsProcessable ? experimentalSafeJsonClone({
            durableProposals: readerPacket.durableProposals || [],
            relationshipProposals: readerPacket.relationshipProposals || [],
            unresolved: readerPacket.unresolved || []
        }) : null;
        attempt.turnRecord.readerCandidateDrafts = readerIsProcessable ? experimentalSafeJsonClone(readerPacket.candidateStructures || readerPacket.candidates || []) : null;
        attempt.turnRecord.readerQuestionDrafts = readerIsProcessable ? experimentalSafeJsonClone(readerPacket.proposedQuestions || []) : null;
        attempt.turnRecord.controlledCharacterEvidence = readerIsProcessable ? experimentalSafeJsonClone(readerPacket.controlledCharacterEvidence || []) : [];
        const currentAttempt = attempt.turnRecord.attempts?.find(item => item.id === attempt.attemptId);
        if (currentAttempt) currentAttempt.readerStatus = 'succeeded';
    }
    options.onStage?.('reconciling');
    const mechanicsFrame = window.HordeWorldMechanics?.isEnabled?.(world)
        ? String(window.HordeWorldMechanics.reconcilerFrame?.(world, sess,
            worldMechanicsRegistryFor(world)) || '')
        : '';
    const compactCommitTransport = sidecarUsesCompactCommitTransport(provider, model, commitTool);
    const commitTransportInstruction = compactCommitTransport
        ? 'Call commit_world_turn exactly once. Put the COMPLETE receipt object inside the receipt_json argument as valid JSON text; this is still the only canonical state call for the turn.'
        : 'Call commit_world_turn exactly once with the native structured receipt; this is the only canonical state call for the turn.';
    const scenePresenceAuthority = `[SCENE PRESENCE AUTHORITY]\nThere are three distinct states: (1) present_character_ids means physical co-presence with the player; (2) nearby_character_ids means an existing NPC is physically absent but explicitly audible, nearby, or materially off-screen involved; (3) a bare name mention is not scene state. When narration or handoff establishes state (2), include the exact canonical ID in the COMPLETE nearby_character_ids ending checksum and nearby_character_context[id] = {mode, reason}. This stores a non-moving scene-presence tag for the next packet and HUD. Never put a nearby NPC in present_character_ids, never move their location for this tag, and never invent this tag from a mere name reference.`;
    const sidecarPrompt = `[SIDECAR RECONCILIATION]\nYou are the semantic reconciliation layer for a roleplay world. The Narrator authored visible prose; do not rewrite it and do not invent missing facts. Reconcile only what the narration and handoff establish against canonical state and mechanical constraints. Mechanics constrain outcomes; they never author them. If something is uncertain, leave canonical state unchanged and let the question lifecycle carry that uncertainty.\n\nThe SIDECAR READER REPORT is a read-only pre-canonical interpretation. It may identify records, derive ephemeral candidates and surface uncertainty, but it cannot itself establish a fact. Prefer its exact resolved IDs over guessing; verify all durable changes against visible narration, handoff and canonical frame. Candidate structures are useful derived scene projection, not canon: keep them scene-local or create a proposal/question unless an existing reducer operation is explicitly supported by authored evidence. Never copy an entire candidate into a Character, Location, Outfit, Item or Vehicle merely to complete a schema.\n\nReturn exactly one native commit_world_turn tool call. This is the only canonical state call for this turn. Preserve the exact actor and location IDs in the supplied reference manifest. A canonical entity that was previously off-scene must be moved/presented under its existing ID, never introduced again. A completed movement needs a completed actor-scoped event. Do not create automatic arrival, relationship, schedule, condition, knowledge, or time changes. Temporal language is evidence, not a lookup table: preserve the Narrator's original wording/range. Do not emit time events or state_updates.time_skip_minutes. The runtime derives the only permitted clock delta from the two reconcilable phases in NARRATOR SCENE HEADER — TEMPORAL EVIDENCE: (1) the inter-turn transition from the previous committed end state to the Narrator's header start-anchor, and (2) the in-turn elapsed time from the header to the response end, taken from an exact handoff source-to-target endpoint pair. The header is the declared start state of this beat, not a contradiction: a header that advances past the canonical pre-turn clock is authored temporal progression when the player input, narration, or handoff establishes the transition. A header that cannot resolve to a plausible forward jump stays uncommitted and belongs in the question lifecycle. "immediate", "brief", and "a few seconds" never move the clock. A no-change beat still requires a valid ending checksum and empty changes.\n\nIf CURRENT SIDECAR PACKET contains reconciliationBacklog, inspect its pinned authored evidence together with the current beat. Only when this receipt actually and safely incorporates a prior failed beat, include state_updates.reconciled_prior_turn_ids with those exact Sidecar turn IDs. Otherwise leave the backlog unresolved.\n\nReconcile across the FF semantic domains: temporal (two-phase, header-anchored), location and completed movement, cast presence and appearance, character state, objectives and quests, relationship posture (explicit commitments only), inventory and economy, world conditions, traversal and vehicles, open questions, scene boundary, cognition consistency (per-character epistemics), recovery obligations, and promotion candidates for genuinely new entities and places.\nWhere the SIDECAR READER REPORT carries controlled_character_evidence, treat user_explicit_action and user_explicit_dialogue as primary player-authored evidence and narrator_paraphrase as presentation only. Never canonize a persistent character trait from a single Narrator flourish; higher-order interpretations need repeated evidence or explicit authorial confirmation.\n\nCANONICAL PRE-TURN FRAME:\n${JSON.stringify(preFrame)}\n\nCANONICAL PRE-TURN CLOCK EVIDENCE (12-hour display; no automatic turn tick):\n${JSON.stringify(clockEvidence)}\n\nNARRATOR SCENE HEADER — TEMPORAL EVIDENCE (two-phase: previous committed end -> header start-anchor -> response end):\n${JSON.stringify(temporalBreakdown)}\n\nWORLD MECHANICS FRAME (engine-owned state; the engine owns phases and dose arithmetic — you supply evidence only):\n${mechanicsFrame || '(no tracked mechanics state this turn)'}\n\nCANONICAL ENTITY AND LOCATION REFERENCES:\n${JSON.stringify(references)}\n\nSIDECAR READER REPORT:\n${JSON.stringify(readerPacket)}\n\nPLAYER INPUT:\n${JSON.stringify(String(options.playerInput || '').slice(0, 6000))}\n\nVISIBLE NARRATION:\n${JSON.stringify(narration.slice(0, 24000))}\n\nNARRATOR HANDOFF:\n${handoff || '(missing — commit only independently established facts, otherwise a no-op receipt)'}`;
    const configuredTokens = Number(tracker.maxTokens) || 0;
    const outfitAuthority = `${scenePresenceAuthority}\n\n[COMMIT TRANSPORT]\n${commitTransportInstruction}\n\n[NPC OUTFIT AUTHORITY] When visible narration establishes an NPC clothing change, place the exact current description in that NPC entity_updates.outfit and optionally provide outfit_name. The canonical reducer matches an existing wardrobe entry or creates a scene outfit. Never change the player outfit from Sidecar, and never infer clothing changes from portraits or off-screen assumptions.`;
    const maxTokens = configuredTokens > 0
        ? Math.max(1800, Math.min(100000, Math.trunc(configuredTokens)))
        : (tracker.reasoning === true ? 8000 : 6000);
    const body = {
        model, stream: false,
        max_tokens: maxTokens,
        temperature: 0,
        messages: [{ role: 'system', content: `${sidecarPrompt}\n\n${outfitAuthority}\n\n[NARRATOR HANDOFF STATUS]\n${options.handoffComplete === false ? 'INCOMPLETE OR MISSING. Use visible narration and canonical evidence conservatively; never invent the missing authorial interpretation.' : 'COMPLETE.'}\n\n[CURRENT SIDECAR PACKET — Background World Agent entries and unresolved handoffs are evidence/proposals, never silently canonical]\n${JSON.stringify(priorPacket)}\n\n[PINNED PRIOR RECONCILIATION EVIDENCE — unresolved authored beats, not automatically canonical]\n${JSON.stringify(priorReconciliationEvidence)}` }, { role: 'user', content: 'Reconcile this authored turn now. Emit the native commit tool call before the output budget ends.' }],
        tools: commitTool ? [commitTool] : [],
        // Google AI Studio rejects the OpenAI-specific forced-function object
        // on complex calls. Its compact transport only needs a required tool
        // call; the prompt still names the sole permitted function.
        tool_choice: compactCommitTransport ? 'required' : { type: 'function', function: { name: 'commit_world_turn' } },
        parallel_tool_calls: false
    };
    applySidecarReasoning(body, provider, tracker, world);
    // A full Reconciler declaration can be expensive for a provider that
    // spends its complete response budget before selecting the required
    // function. This recovery is deliberately narrower than a second
    // settlement system: same authored beat, same accepted Reader evidence,
    // one compact receipt_json declaration, no optional reasoning, no
    // Narrator call, and no alternate mutation route.
    const compactCommitRecoveryBody = {
        model, stream: false, max_tokens: maxTokens, temperature: 0,
        messages: [{
            role: 'system', content: `[COMPACT SIDECAR COMMIT RECOVERY]\nReturn exactly one commit_world_turn function call now. The visible Narration is immutable and has already been accepted; do not write prose, call a Reader, invent evidence, or mutate through any route other than this receipt. Reconcile only durable facts established by the supplied evidence. If a detail is uncertain, leave it unchanged. Preserve the exact canonical IDs. The receipt_json argument must contain one complete valid JSON receipt and an ending checksum.\n\nCANONICAL PRE-TURN FRAME:\n${JSON.stringify(preFrame)}\n\nCLOCK EVIDENCE:\n${JSON.stringify(clockEvidence)}\n\nTEMPORAL EVIDENCE:\n${JSON.stringify(temporalBreakdown)}\n\nCANONICAL REFERENCES:\n${JSON.stringify(references)}\n\nACCEPTED READER EVIDENCE:\n${JSON.stringify({ summary: readerPacket?.summary || '', temporal: readerPacket?.temporal || readerPacket?.timeEvidence || {}, location: readerPacket?.location || {}, presence: readerPacket?.presence || {}, scene: readerPacket?.scene || {}, eventClaims: (readerPacket?.eventClaims || []).slice(0, 24), relationshipPostures: (readerPacket?.relationshipPostures || []).slice(0, 24), characterIntelligence: (readerPacket?.characterIntelligence || []).slice(0, 16), controlledCharacterEvidence: (readerPacket?.controlledCharacterEvidence || []).slice(0, 12), scenePulse: readerPacket?.scenePulse || readerPacket?.semanticInterpretation?.scenePulse || {} })}\n\nPLAYER INPUT:\n${JSON.stringify(String(options.playerInput || '').slice(0, 6000))}\n\nVISIBLE NARRATION:\n${JSON.stringify(narration.slice(0, 16000))}\n\nNARRATOR HANDOFF:\n${String(handoff || '').slice(0, 6000) || '(missing — commit only independently established facts)'}`
        }, {
            role: 'user', content: 'Emit the compact commit_world_turn receipt now. Do not explain your reasoning or call any tool other than commit_world_turn.'
        }],
        tools: [compactSidecarCommitTool(commitTool)], tool_choice: 'required', parallel_tool_calls: false
    };
    logSidecarConsoleTrace('Reconciliation request', {
        model, provider, maxTokens, compactCommitTransport,
        prompt: sidecarPrompt,
        request: experimentalSafeJsonClone(body)
    });
    try {
        if (!commitTool?.function?.parameters) {
            const unavailable = new Error('The native world commit tool is unavailable.');
            unavailable.code = 'commit_tool_unavailable';
            throw unavailable;
        }
        const response = await fetchSidecarCompletion(body, {
            provider, tracker, world, owner: sidecarWorld, signal: options.signal
        });
        if (!response.ok) {
            const providerBody = await response.text().catch(() => '');
            const requestError = new Error(providerBody.slice(0, 800) || `Sidecar request failed (${response.status})`);
            requestError.code = 'sidecar_http_error';
            requestError.httpStatus = response.status;
            throw requestError;
        }
        let payload = await response.json();
        let choice = payload?.choices?.[0] || {};
        let message = choice.message || {};
        logSidecarConsoleTrace('Reconciliation response', {
            model, provider: payload?.provider || provider,
            finishReason: choice.finish_reason || choice.native_finish_reason || '',
            assistant: experimentalSafeJsonClone(message)
        });
        let toolCall = (message.tool_calls || []).find(call => call?.function?.name === 'commit_world_turn')
            || (message.function_call?.name === 'commit_world_turn'
                ? { id: message.function_call.id || '', type: 'function', function: message.function_call }
                : null);
        recordSidecarTrace(world, sess, {
            kind: 'reconciliation', prompt: sidecarPrompt, reply: message, model,
            provider: payload?.provider || provider, finishReason: choice.finish_reason || choice.native_finish_reason || ''
        });
        let compactRecoveryAttempted = false;
        const initialFinishReason = choice.finish_reason || choice.native_finish_reason || '';
        if (!toolCall && /length|max[_\s-]?tokens?|token_limit|incomplete/i.test(String(initialFinishReason))) {
            compactRecoveryAttempted = true;
            logSidecarConsoleTrace('Reconciliation compact commit recovery', { model, provider, maxTokens, finishReason: initialFinishReason });
            const compactResponse = await fetchSidecarCompletion(compactCommitRecoveryBody, {
                provider, tracker, world, owner: sidecarWorld, signal: options.signal,
                retryPolicy: 'none', forceWithoutReasoning: true
            });
            if (!compactResponse.ok) {
                const compactProviderBody = await compactResponse.text().catch(() => '');
                const compactRequestError = new Error(compactProviderBody.slice(0, 800) || `Compact Sidecar recovery failed (${compactResponse.status})`);
                compactRequestError.code = 'sidecar_compact_recovery_http_error';
                compactRequestError.httpStatus = compactResponse.status;
                throw compactRequestError;
            }
            payload = await compactResponse.json();
            choice = payload?.choices?.[0] || {};
            message = choice.message || {};
            logSidecarConsoleTrace('Reconciliation compact recovery response', {
                model, provider: payload?.provider || provider,
                finishReason: choice.finish_reason || choice.native_finish_reason || '', assistant: experimentalSafeJsonClone(message)
            });
            recordSidecarTrace(world, sess, {
                kind: 'reconciliation_compact_recovery', prompt: compactCommitRecoveryBody.messages[0].content,
                reply: message, model, provider: payload?.provider || provider,
                finishReason: choice.finish_reason || choice.native_finish_reason || ''
            });
            toolCall = (message.tool_calls || []).find(call => call?.function?.name === 'commit_world_turn')
                || (message.function_call?.name === 'commit_world_turn'
                    ? { id: message.function_call.id || '', type: 'function', function: message.function_call }
                    : null);
        }
        if (!toolCall) {
            const truncated = choice.finish_reason === 'length' || choice.native_finish_reason === 'length';
            const missing = new Error(truncated
                ? `Sidecar exhausted its ${maxTokens}-token output budget before emitting commit_world_turn.`
                : 'Sidecar responded without the required native commit_world_turn tool call.');
            missing.code = truncated ? 'sidecar_output_truncated' : 'missing_commit_tool_call';
            missing.sidecarDetail = {
                code: missing.code,
                finishReason: choice.finish_reason || choice.native_finish_reason || '',
                provider: payload?.provider || provider,
                model,
                response: {
                    content: typeof message.content === 'string' ? message.content.slice(0, 12000) : message.content,
                    reasoning: String(message.reasoning || message.reasoning_content || '').slice(0, 16000),
                    toolCalls: experimentalSafeJsonClone(message.tool_calls || []),
                    compactRecoveryAttempted
                }
            };
            throw missing;
        }
        const receipt = unwrapSidecarCommitReceipt(toolCall.function?.arguments || '{}');
        const explicitEndpointEvidence = applySidecarTemporalAuthority(receipt, handoff, clockEvidence, temporalBreakdown, readerPacket);
        const receiptContext = {
            ...(options.receiptContext || {}),
            sidecarTemporalAuthority: true,
            authorizedTimeSkipMinutes: explicitEndpointEvidence?.minutes || 0,
            authorizedInterTurnMinutes: explicitEndpointEvidence?.interTurnMinutes || 0,
            authorizedInTurnMinutes: explicitEndpointEvidence?.inTurnMinutes || 0,
            idempotencyKey: attempt.logicalIdentity,
            sourceTurnId: attempt.turnRecord?.id || '',
            sidecarTurnId: attempt.turnRecord?.id || '',
            takeId: attempt.turnRecord?.takeId || options.takeId || '',
            revisionId: attempt.turnRecord?.revisionId || options.revisionId || '',
            timelineId: sess.id
        };
        const protocol = attempt.protocol || window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
        // Provisional promotion used to mutate the protocol before the native
        // receipt was accepted (and deleted fields from the receipt in-place).
        // Keep a post-commit-only draft instead: a failed/stale receipt must
        // leave no provisional entity or location behind.
        const introductionDraft = {
            location_introduced: experimentalSafeJsonClone(Array.isArray(receipt.location_introduced) ? receipt.location_introduced : []),
            npc_introduced: experimentalSafeJsonClone(Array.isArray(receipt.npc_introduced) ? receipt.npc_introduced : [])
        };
        const receiptForCommit = experimentalSafeJsonClone(receipt);
        delete receiptForCommit.location_introduced;
        delete receiptForCommit.npc_introduced;
        // Verify that the canonical checkpoint has not changed under this
        // authored beat. This is a guard, not a snapshot restore mechanism.
        const currentCheckpoint = sidecarCanonicalCheckpointFingerprint(world, sess);
        assertExperimentalSidecarOwner(requestOwner);
        if (currentCheckpoint !== attempt.turnRecord.preCanonicalFingerprint) {
            const stale = new Error('The authored beat no longer matches its canonical pre-turn checkpoint.');
            stale.code = 'sidecar_stale_checkpoint';
            stale.sidecarDetail = { code: stale.code, stage: 'reconciliation', expected: attempt.turnRecord.preCanonicalFingerprint, actual: currentCheckpoint };
            throw stale;
        }
        const committed = commitWorldTurnReceipt(world, sess, receiptForCommit, receiptContext, 'sidecar');
        if (protocol) {
            // A successful native receipt and derived publication are distinct
            // transaction phases. Publish the latter through an isolated
            // protocol draft so a bad candidate/question/projection cannot be
            // reported as a settled Reader turn or cause the receipt to run a
            // second time on recovery.
            const turnRecord = attempt.turnRecord;
            try {
                const settled = publishSidecarSettlement(world, sess, protocol, {
                    turnRecord, receipt, committed, introductionDraft, narration, handoff, preClock,
                    explicitEndpointEvidence, attemptId: attempt.attemptId,
                    postFrame: buildWorldSceneFrame(world, sess), postClock: buildSidecarClockEvidence(world, sess)
                });
                // Vehicle runtime interpretation follows the accepted receipt,
                // but is non-blocking derived state. Its own errors are
                // preserved as diagnostics rather than invalidating the
                // already atomic scene publication.
                try {
                    const activeProtocol = sess.sidecar;
                    const traversalChanges = window.ExperimentalWorldsSidecarTraversal?.reconcileVehicleEvents(activeProtocol, world, receipt, { playerLocationId: preFrame.player_location_id }) || [];
                    const activeTurn = activeProtocol?.turns?.find(item => item.id === turnRecord?.id);
                    if (activeTurn) activeTurn.traversalChanges = traversalChanges;
                } catch (traversalError) {
                    const activeTurn = sess.sidecar?.turns?.find(item => item.id === turnRecord?.id);
                    if (activeTurn) activeTurn.traversalWarning = String(traversalError?.message || traversalError).slice(0, 800);
                }
                return { committed, receipt, packet: settled.packet || null, turnId: turnRecord?.id || null, settlement: settled };
            } catch (settlementError) {
                const settlementWarning = {
                    code: settlementError?.code || 'sidecar_settlement_warning',
                    message: String(settlementError?.message || settlementError || 'Derived Sidecar settlement failed.').slice(0, 1200)
                };
                turnRecord.status = 'settlement_incomplete';
                turnRecord.reconciliationStatus = 'canonical_committed_publication_incomplete';
                turnRecord.committedAt = turnRecord.committedAt || new Date().toISOString();
                turnRecord.receiptTurnId = String(receipt.turn_id || '');
                turnRecord.receipt = experimentalSafeJsonClone(receipt);
                turnRecord.audit = experimentalSafeJsonClone(committed.audit);
                turnRecord.incompleteSettlementAttemptId = attempt.attemptId;
                turnRecord.settlementWarning = settlementWarning;
                const diagnostic = protocol.diagnostics?.reconciliationAttempts?.find(item => item.turnId === turnRecord.id && item.attemptId === attempt.attemptId);
                if (diagnostic) Object.assign(diagnostic, { status: 'canonical_committed_publication_incomplete', settlementWarning });
                sess.sidecarDerivedSettlementIncomplete = {
                    turnId: turnRecord.id, attemptId: attempt.attemptId || '', receiptTurnId: String(receipt.turn_id || ''),
                    receiptFingerprint: committed.audit?.receiptFingerprint || '', createdAt: new Date().toISOString(), error: experimentalSafeJsonClone(settlementWarning)
                };
                return { committed, receipt, packet: protocol.packet || null, turnId: turnRecord.id, settlement: { status: 'incomplete', error: settlementWarning } };
            }
        }
        return { committed, receipt, packet: protocol?.packet || null, turnId: attempt.turnRecord?.id || null };
    } catch (error) {
        if (error?.name === 'AbortError') throw error;
        // The old owner may no longer be current. Recording a failure on that
        // context would itself be a late mutation, so discard it as-is.
        if (error?.code === 'experimental_world_owner_changed') throw error;
        const failed = failSidecarTurnAttempt(world, sess, attempt, error, error.sidecarDetail || {
            code: error.code,
            provider, model
        });
        error.sidecarAttempt = failed;
        throw error;
    }
}

// Finish an interrupted *derived* publication after the native receipt has
// already committed. This is deliberately not a reconciliation retry: it
// reuses the journaled receipt/audit and never calls the Narrator, Reader, or
// canonical reducer a second time.
function recoverSidecarDerivedSettlement(world, sess, turn) {
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    if (!protocol || !turn?.receipt || !turn?.audit) throw new Error('The committed receipt required for derived settlement recovery is unavailable.');
    const incomplete = sess.sidecarDerivedSettlementIncomplete;
    if (!incomplete || incomplete.turnId !== turn.id) throw new Error('No matching derived-settlement recovery record exists.');
    const identity = String(turn.logicalCommitIdentity || '');
    const committedJournal = (sess.sidecarCommitJournal || []).find(entry => entry.identity === identity && entry.status === 'committed');
    if (!committedJournal || committedJournal.fingerprint !== incomplete.receiptFingerprint) {
        const error = new Error('The committed receipt journal no longer proves a safe derived-settlement recovery.');
        error.code = 'sidecar_settlement_recovery_unproven';
        throw error;
    }
    const result = publishSidecarSettlement(world, sess, protocol, {
        turnRecord: turn, receipt: experimentalSafeJsonClone(turn.receipt), committed: { audit: experimentalSafeJsonClone(turn.audit) },
        introductionDraft: { location_introduced: experimentalSafeJsonClone(turn.receipt.location_introduced || []), npc_introduced: experimentalSafeJsonClone(turn.receipt.npc_introduced || []) },
        narration: turn.authorialArtifact?.narration ?? turn.narration ?? '', handoff: turn.authorialArtifact?.handoff ?? turn.handoff ?? '',
        preClock: turn.preClock, explicitEndpointEvidence: turn.explicitEndpointEvidence || null, attemptId: turn.incompleteSettlementAttemptId || turn.currentAttemptId || '',
        postFrame: buildWorldSceneFrame(world, sess), postClock: buildSidecarClockEvidence(world, sess)
    });
    return { ...result, recovered: true };
}

// Reprocess the accepted Narrator artifact without creating a new roleplay
// turn. The failed Sidecar turn remains the durable source record; retries are
// attempt records on that same turn and reuse a successful Reader envelope.
async function retrySidecarSceneUpdate(world, sess, sidecarTurnId) {
    if (ExperimentalWorldsRuntime.sidecarRetryInProgress()) return;
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    const turn = protocol?.turns?.find(item => item.id === sidecarTurnId);
    if (!protocol || !turn) throw new Error('The authored Sidecar turn is no longer available.');
    if (turn.status === 'settlement_incomplete') {
        ExperimentalWorldsRuntime.setSidecarRetryInProgress(true);
        try {
            const result = recoverSidecarDerivedSettlement(world, sess, turn);
            await ExperimentalWorldsHost.persist(); renderWorldPlayState();
            runSidecarBackgroundMemoryJobs(world, sess, { force: true, source: 'sidecar_settlement_recovery' }).catch(error => console.warn('Sidecar settlement memory dispatch skipped —', error.message));
            ExperimentalWorldsHost.notify('Scene Intelligence caught up without replaying the canonical receipt.', 'success');
            return result;
        } finally { ExperimentalWorldsRuntime.setSidecarRetryInProgress(false); }
    }
    if (!sidecarTurnNeedsDownstreamRecovery(turn)) {
        ExperimentalWorldsHost.notify('This authored beat is already settled.', 'info');
        return;
    }
    const currentCheckpoint = sidecarCanonicalCheckpointFingerprint(world, sess);
    if (turn.preCanonicalFingerprint && currentCheckpoint !== turn.preCanonicalFingerprint) {
        const stale = new Error('Canonical state changed after this beat failed. Open World GM to reconcile it before retrying.');
        stale.code = 'sidecar_stale_checkpoint';
        turn.failure = { code: stale.code, message: stale.message, failedAt: new Date().toISOString() };
        turn.reconciliationStatus = 'failed';
        turn.status = 'reconciliation_failed';
        await ExperimentalWorldsHost.persist();
        renderWorldPlayState();
        ExperimentalWorldsHost.notify(stale.message, 'warning');
        return;
    }
    ExperimentalWorldsRuntime.setSidecarRetryInProgress(true);
    // Reuse only a Reader result which crossed the snapshot boundary. A
    // packet rejected before attachment (for example a wrong delta base) is
    // not a successful Reader artifact and must be reread from the exact
    // same authored beat instead of poisoning every subsequent retry.
    const reusableReaderSnapshot = (protocol.readerSnapshots || []).find(snapshot => snapshot.id === turn.readerSnapshotId
        && snapshot.turnId === turn.id && ['pending_reconciliation', 'failed'].includes(snapshot.status));
    const previousReader = reusableReaderSnapshot && turn.reader && turn.reader.valid !== false
        ? experimentalSafeJsonClone(turn.reader) : null;
    try {
        const result = await runSidecarReconciliation(world, sess, {
            handoff: turn.handoff,
            narration: turn.narration,
            playerInput: turn.playerInput,
            takeId: turn.takeId,
            revisionId: turn.revisionId,
            sourceTurnId: turn.id,
            existingTurnRecord: turn,
            readerPacketOverride: previousReader || null,
            receiptContext: {
                playerStartLocationId: turn.preFrame?.player_location_id || sess.playerLocation,
                narrativeText: turn.narration,
                retryOf: turn.id
            },
            commitTool: sidecarCommitToolFor(world, sess),
            handoffComplete: turn.handoffComplete !== false,
            onStage: stage => {
                const label = document.getElementById('world-dm-typing');
                if (label) label.textContent = stage === 'reading' ? 'Sidecar is reading the authored beat…' : 'Sidecar is reconciling world state…';
            }
        });
        const message = (sess.history || []).find(item => item.sidecarTurnId === turn.id || item.sidecarBackstage?.sidecarTurnId === turn.id);
        if (message?.sidecarBackstage) {
            message.sidecarBackstage = {
                ...message.sidecarBackstage,
                status: 'committed', failure: null, unresolved: false,
                receipt: result.receipt, packet: result.packet,
                reader: { ...(turn.reader || {}), readerEnvelope: turn.readerEnvelope || null, readerSnapshotId: turn.readerSnapshotId || '' },
                audit: turn.audit, preFrame: turn.preFrame, postFrame: turn.postFrame,
                retryCount: turn.retryCount || 0
            };
        }
        await ExperimentalWorldsHost.persist();
        renderWorldPlayState();
        ExperimentalWorldsHost.notify('Scene update settled. The authored narration was preserved.', 'success');
        runSidecarBackgroundMemoryJobs(world, sess, { force: true, source: 'sidecar_retry' }).catch(error => console.warn('Sidecar retry memory dispatch skipped —', error.message));
        return result;
    } catch (error) {
        await ExperimentalWorldsHost.persist();
        renderWorldPlayState();
        ExperimentalWorldsHost.notify(`Scene update still incomplete: ${error.message || error}`, 'warning');
        throw error;
    } finally {
        ExperimentalWorldsRuntime.setSidecarRetryInProgress(false);
    }
}

// Refresh a settled Scene Intelligence projection without rewriting canon.
// This is deliberately Reader-only: a changed interpretation becomes a
// reviewable derived snapshot, while the accepted Narrator Take and native
// receipt remain immutable.
async function refreshSidecarSceneIntelligence(world, sess, sidecarTurnId = '', options = {}) {
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    const currentTurn = currentSidecarAuthoredTurn(protocol, sess);
    const turn = sidecarTurnId
        ? (protocol?.turns || []).find(item => item.id === sidecarTurnId)
        : currentTurn;
    if (!protocol || !turn) throw new Error('No settled authored Sidecar turn is available to refresh.');
    if (sidecarTurnNeedsDownstreamRecovery(turn)) {
        return retrySidecarSceneUpdate(world, sess, turn.id);
    }
    const config = window.ExperimentalWorldsSidecarMode?.normalizeWorldConfig?.(world) || {};
    const tracker = config.tracker || {};
    const profile = effectiveSidecarReaderProfile(world, sess);
    const provider = profile.provider ? ExperimentalWorldsHost.normalizedProviderId(profile.provider) : ExperimentalWorldsHost.normalizedProviderId(ExperimentalWorldsState.globalSettings?.apiProvider || 'openrouter');
    const model = profile.model || world.model || ExperimentalWorldsState.globalSettings.defaultModel;
    const references = buildSidecarCanonicalReferenceManifest(world, sess, `${turn.playerInput || ''}\n${turn.narration || ''}\n${turn.handoff || ''}`);
    // Source /sp regen preserves ScenePulse's compact-delta cadence; /sp
    // refresh explicitly asks for one complete projection. Both reread this
    // exact accepted beat through the single Sidecar Reader—never Narrator or
    // ScenePulse's autonomous source generation pipeline.
    const forceFull = options.forceFull === true;
    const packet = await runSidecarSemanticReading(world, sess, {
        tracker, provider, model, readerProfile: profile, sidecarWorld: { ...world, model, provider }, references,
        preFrame: turn.preFrame || buildWorldSceneFrame(world, sess), clockEvidence: turn.preClock || buildSidecarClockEvidence(world, sess),
        priorReaderEnvelope: turn.readerEnvelope || turn.reader || null, forceFull,
        playerInput: turn.playerInput || '', narration: turn.narration || '', handoff: turn.handoff || '',
        scenePulseFocus: options.scenePulseFocus || '', signal: options.signal
    });
    protocol.readerRefreshes = Array.isArray(protocol.readerRefreshes) ? protocol.readerRefreshes : [];
    protocol.readerRefreshes.push({
        id: `reader_refresh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        status: 'review', sourceTurnId: turn.id, createdAt: new Date().toISOString(),
        envelope: normalizeSidecarReaderEnvelope(packet, { sourceTurnId: turn.id, profileRevision: profile.revision, promptRevision: profile.promptRevision, snapshotMode: forceFull ? 'full' : 'delta' }),
        provenance: { source: 'scene_intelligence_refresh', provider, model, profileRevision: profile.revision, scenePulseFocus: options.scenePulseFocus || '', forceFull }
    });
    protocol.readerRefreshes = protocol.readerRefreshes.slice(-40);
    await ExperimentalWorldsHost.persist();
    // A native ScenePulse refresh accepts this review immediately below.
    // Do not remount the source panel between staging and acceptance: doing
    // so can detach the originating host action while its valid Reader
    // packet is still in flight. Backstage refreshes retain their review
    // render; foreground source controls request the atomic route instead.
    if (options.renderReview !== false) renderWorldPlayState();
    return protocol.readerRefreshes.at(-1);
}

// The source Thoughts affordance is an actual focused Reader operation.  It
// never calls Narrator and the only promoted record is the derived, reviewed
// scene snapshot for this exact already-settled authored turn.
async function refreshScenePulseThoughts(world, sess, sidecarTurnId = '', options = {}) {
    const refresh = await refreshSidecarSceneIntelligence(world, sess, sidecarTurnId, {
        scenePulseFocus: 'thoughts', forceFull: true, signal: options.signal
    });
    if (refresh?.status !== 'review') return refresh;
    const accepted = acceptSidecarReaderRefresh(world, sess, refresh.id);
    await ExperimentalWorldsHost.persist();
    renderWorldPlayState();
    // This is a user-invoked derived refresh, not an authored turn. Dispatch
    // only the newly versioned cognition work in the background; it remains
    // tied to the same settled narration and cannot alter world state.
    if (accepted?.cognitionJobIds?.length) {
        runSidecarBackgroundMemoryJobs(world, sess, { source: 'scenepulse_thought_refresh' })
            .catch(error => console.warn('ScenePulse thought cognition dispatch skipped —', error.message));
    }
    return accepted;
}

// A Reader refresh is a reviewable interpretation of an already authored and
// canonically settled beat. Accepting it promotes only the derived scene
// snapshot/projection; it never calls Narrator, invokes Sidecar's receipt, or
// repeats canonical operations such as movement or time advancement.
function acceptSidecarReaderRefresh(world, sess, refreshId) {
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    const refresh = protocol?.readerRefreshes?.find(item => item.id === refreshId && item.status === 'review');
    if (!protocol || !refresh) throw new Error('That Reader refresh is no longer available for review.');
    const turn = (protocol.turns || []).find(item => item.id === refresh.sourceTurnId);
    const latestTurn = currentSidecarAuthoredTurn(protocol, sess);
    if (!turn || !latestTurn || latestTurn.id !== turn.id) {
        const error = new Error('This Reader refresh belongs to historical narration and cannot replace the current scene view.');
        error.code = 'reader_refresh_not_current';
        throw error;
    }
    if (!['active', 'committed'].includes(String(turn.status || '')) && turn.reconciliationStatus !== 'committed') {
        const error = new Error('The authored beat is not safely settled for a Reader-only refresh.');
        error.code = 'reader_refresh_unsettled_turn';
        throw error;
    }
    const currentNarrationHash = worldMediaHash(String(turn.authorialArtifact?.narration ?? turn.narration ?? ''));
    const currentHandoffHash = worldMediaHash(String(turn.authorialArtifact?.handoff ?? turn.handoff ?? ''));
    if (refresh.envelope?.visibleNarrationHash && refresh.envelope.visibleNarrationHash !== currentNarrationHash
        || refresh.envelope?.handoffHash && refresh.envelope.handoffHash !== currentHandoffHash) {
        const error = new Error('The stored Reader refresh no longer matches this authored artifact. Re-read the current scene instead.');
        error.code = 'reader_refresh_artifact_mismatch';
        throw error;
    }
    const profile = effectiveSidecarReaderProfile(world, sess);
    // A source section refresh is normally a compact delta. Preserve that
    // mode through acceptance so attachSidecarReaderSnapshot merges it with
    // the current settled projection instead of replacing unrelated source
    // fields with the tutorial fallback. Only an explicitly requested full
    // reread is allowed to replace the projection.
    const replacesProjection = refresh.provenance?.forceFull === true
        || String(refresh.envelope?.snapshotMode || refresh.envelope?.mode || '').toLowerCase() === 'full';
    const packet = {
        ...experimentalSafeJsonClone(refresh.envelope || {}), valid: true,
        mode: replacesProjection ? 'full' : 'delta', snapshotMode: replacesProjection ? 'full' : 'delta',
        model: refresh.provenance?.model || '', provider: refresh.provenance?.provider || '', finishReason: 'review_accepted'
    };
    const snapshot = attachSidecarReaderSnapshot(world, sess, turn, packet, {
        profile, fullRefresh: replacesProjection, refreshIndex: Number(refresh.envelope?.refreshIndex || 0) + 1,
        takeId: turn.takeId || '', revisionId: turn.revisionId || '', attemptId: `reader_refresh_review:${refresh.id}`
    });
    if (!snapshot) throw new Error('Could not stage the accepted Reader refresh.');
    activateSidecarReaderSnapshot(world, sess, snapshot.id, turn.id);
    // A focused native ScenePulse refresh is still an accepted Reader packet.
    // Publish its scene-local candidates through the same narrow source-card
    // bridge as an authored settlement; otherwise a fully rendered refreshed
    // character card could never reach explicit Horde review.
    recordSidecarReaderCandidates(world, sess, packet, turn, snapshot.id);
    const projection = buildSidecarSceneProjection(world, sess, protocol, {
        snapshotId: snapshot.id, turn, frame: turn.postFrame || buildWorldSceneFrame(world, sess)
    });
    const now = new Date().toISOString();
    (protocol.sceneProjections || []).forEach(item => {
        if (item.status === 'active') { item.status = 'accepted_historical'; item.historicalAt = now; }
    });
    protocol.sceneProjections = (protocol.sceneProjections || []).filter(item => item.snapshotId !== snapshot.id);
    protocol.sceneProjections.push({ ...experimentalSafeJsonClone(projection), status: 'active', settledAt: now, refreshOf: refresh.id });
    protocol.sceneProjections = protocol.sceneProjections.slice(-400);
    protocol.sceneProjection = experimentalSafeJsonClone(projection);
    turn.readerEnvelope = experimentalSafeJsonClone(snapshot.envelope);
    turn.readerSnapshotId = snapshot.id;
    // The memory graph remains source-pinned to this authored turn, but its
    // derived Reader evidence must follow the explicitly accepted refresh.
    // This is not a new world event and never touches the native receipt.
    window.ExperimentalWorldsSidecarMemoryGraph?.recordTurn?.(protocol, turn);
    const refreshedCognitionJobIds = queueSidecarTurnCognitionJobs(world, sess, protocol, turn, projection);
    turn.turnCognitionJobIds = [...new Set([...(turn.turnCognitionJobIds || []), ...refreshedCognitionJobIds])];
    refresh.status = 'accepted'; refresh.acceptedAt = now; refresh.acceptedSnapshotId = snapshot.id;
    protocol.packet = buildSidecarScenePacket(world, sess, turn.handoff || '');
    return { status: 'accepted', refresh, snapshot, projection, cognitionJobIds: refreshedCognitionJobIds };
}

function discardSidecarReaderRefresh(world, sess, refreshId) {
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    const refresh = protocol?.readerRefreshes?.find(item => item.id === refreshId && item.status === 'review');
    if (!protocol || !refresh) return false;
    refresh.status = 'rejected'; refresh.rejectedAt = new Date().toISOString();
    return true;
}

function parseSidecarConversationResponse(content) {
    const raw = String(content || '').trim();
    const parsed = experimentalSafeParseJSONRepair(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''));
    if (!experimentalIsPlainObject(parsed)) return { reply: raw || 'Sidecar did not return a usable reply.', resolutions: [], proposedReceipt: null, workspaceAction: 'none' };
    return {
        reply: String(parsed.reply || '').trim() || 'I have recorded the discussion.',
        resolutions: Array.isArray(parsed.resolutions) ? parsed.resolutions.slice(0, 12) : [],
        proposedReceipt: experimentalIsPlainObject(parsed.proposed_receipt) ? parsed.proposed_receipt : null,
        workspaceAction: ['none', 'close_scene', 'begin_sequence_plan', 'approve_sequence_plan', 'context_refresh'].includes(parsed.workspace_action) ? parsed.workspace_action : 'none'
    };
}

function parseSidecarEpisodeOutput(content) {
    const parsed = experimentalSafeParseJSONRepair(String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''));
    if (!experimentalIsPlainObject(parsed) || !String(parsed.summary || '').trim()) return null;
    return {
        summary: String(parsed.summary || '').trim().slice(0, 8000),
        objectiveHistory: String(parsed.objectiveHistory || parsed.objective_history || '').trim().slice(0, 8000),
        perceptionCoverage: Array.isArray(parsed.perceptionCoverage || parsed.perception_coverage)
            ? (parsed.perceptionCoverage || parsed.perception_coverage).slice(0, 80) : [],
        locationReferences: Array.isArray(parsed.locationReferences || parsed.location_references)
            ? (parsed.locationReferences || parsed.location_references).slice(0, 80) : []
    };
}

function parseSidecarHierarchyOutput(content) {
    const parsed = experimentalSafeParseJSONRepair(String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''));
    if (!experimentalIsPlainObject(parsed) || !String(parsed.summary || '').trim()) return null;
    return { summary: String(parsed.summary).trim().slice(0, 12000), keyFacts: String(parsed.keyFacts || parsed.key_facts || '').trim().slice(0, 8000) };
}

function parseSidecarCognitionOutput(content) {
    const parsed = experimentalSafeParseJSONRepair(String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''));
    if (!experimentalIsPlainObject(parsed)) return null;
    const memories = (Array.isArray(parsed.memories) ? parsed.memories : []).filter(isPlainObject).slice(0, 16)
        .map(memory => ({
            text: String(memory.text || '').trim().slice(0, 3000),
            epistemicStatus: ['self_action', 'direct_observation', 'disclosure', 'interpretation', 'belief', 'influence']
                .includes(memory.epistemicStatus || memory.epistemic_status) ? (memory.epistemicStatus || memory.epistemic_status) : 'direct_observation',
            importance: Math.max(0, Math.min(1, Number(memory.importance) || 0.45)),
            confidence: Math.max(0, Math.min(1, Number(memory.confidence) || 0.6)),
            sourceTurnIds: Array.isArray(memory.sourceTurnIds || memory.source_turn_ids) ? (memory.sourceTurnIds || memory.source_turn_ids).slice(0, 12) : []
        })).filter(memory => memory.text);
    return { memories };
}

// A ScenePulse thought has already crossed the settled Reader boundary as a
// character-scoped, provisional impression. If the optional background
// cognition model refuses its small JSON contract, retain that exact thought
// as the bounded cognition claim rather than dropping the perception or
// inventing a replacement. This fallback applies only to a job that carries
// the accepted subject thought; generic episode cognition still requires its
// own structured model output.
function sidecarCognitionThoughtFallback(job = {}) {
    const intelligence = experimentalIsPlainObject(job?.provisionalIntelligence) ? job.provisionalIntelligence : {};
    const thought = sidecarProjectionClaimText(intelligence.sceneLocalImpression).slice(0, 3000);
    if (!thought) return [];
    const reportedConfidence = Number(intelligence?.sceneLocalImpression?.confidence);
    return [{
        text: thought,
        epistemicStatus: 'interpretation',
        importance: 0.45,
        confidence: Number.isFinite(reportedConfidence) ? Math.max(0, Math.min(1, reportedConfidence)) : 0.55,
        sourceTurnIds: Array.isArray(job.sourceTurnIds) ? job.sourceTurnIds.slice(0, 12) : []
    }];
}

function sidecarLocationEmbeddingText(world, location) {
    const ancestry = [];
    let parentId = location?.parentLocationId;
    const seen = new Set();
    while (parentId && !seen.has(parentId) && ancestry.length < 6) {
        seen.add(parentId);
        const parent = (world?.locations || []).find(item => item.id === parentId);
        if (!parent) break;
        ancestry.unshift(parent.name || parent.id); parentId = parent.parentLocationId;
    }
    return [`Location: ${location?.name || location?.id || 'Unnamed'}`, location?.aliases?.length ? `Aliases: ${location.aliases.join(', ')}` : '',
        `Type: ${location?.mapType || location?.type || 'location'}`, ancestry.length ? `Within: ${ancestry.join(' › ')}` : '',
        `Stable description: ${location?.description || ''}`, location?.purpose ? `Purpose: ${location.purpose}` : '',
        Array.isArray(location?.tags) && location.tags.length ? `Tags: ${location.tags.join(', ')}` : ''].filter(Boolean).join('\n').slice(0, 6000);
}

async function vectorizeSidecarMemoryRecords(records, options = {}) {
    const namespace = HordeVectorMemory.namespace();
    const pending = records.filter(record => record && (record.text || record.vectorText)
        && (!Array.isArray(record.embedding) || (record.embeddingNamespace && record.embeddingNamespace !== namespace)));
    let cursor = 0;
    let completed = 0;
    async function worker() {
        while (cursor < pending.length) {
            const record = pending[cursor++];
            try {
                record.embedding = await HordeVectorMemory.getCachedEmbedding(record.vectorText || record.text);
                record.embeddingNamespace = HordeVectorMemory.namespace();
                record.vectorizedAt = new Date().toISOString();
                completed++;
                options.onProgress?.({ completed, attempted: pending.length, record });
            } catch (error) { record.vectorError = String(error?.message || error).slice(0, 300); options.onProgress?.({ completed, attempted: pending.length, record, error }); }
        }
    }
    await Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker));
    return { attempted: pending.length, completed: pending.filter(record => Array.isArray(record.embedding)).length };
}

async function retrieveSidecarMemory(world, sess, query, limit = 8, options = {}) {
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    const graph = window.ExperimentalWorldsSidecarMemoryGraph?.graph(protocol);
    const text = String(query || '').trim();
    if (!graph || !text || !HordeVectorMemory) return [];
    let queryEmbedding;
    try { queryEmbedding = await HordeVectorMemory.getCachedEmbedding(text); } catch (_) { return []; }
    if (!Array.isArray(queryEmbedding)) return [];
    const historyCandidates = (graph.worldHistory || []).filter(record => record.status === 'active').map(record => ({ kind: 'world_history', text: record.text || record.narration, record }));
    const episodeCandidates = (graph.episodes || []).filter(record => record.status === 'active').map(record => ({ kind: 'episode', text: record.text || `${record.summary}\n${record.objectiveHistory || ''}`, record }));
    const readerCandidates = (protocol.readerSnapshots || []).filter(snapshot => snapshot.status === 'active' && snapshot.envelope?.summary).map(snapshot => ({
        kind: 'reader_scene', text: [snapshot.envelope.summary, snapshot.envelope.scene?.topic, snapshot.envelope.scene?.mood, snapshot.envelope.scene?.environment].filter(Boolean).join('\n'),
        record: { ...snapshot.envelope, id: snapshot.id, vectorText: [snapshot.envelope.summary, snapshot.envelope.scene?.topic, snapshot.envelope.scene?.mood].filter(Boolean).join('\n'), embedding: snapshot.embedding, sourceTurnId: snapshot.turnId, status: 'active' }
    }));
    const baseCandidates = [...historyCandidates, ...episodeCandidates, ...readerCandidates].filter(candidate => candidate.text);
    const missingBase = baseCandidates.filter(candidate => !Array.isArray(candidate.record.embedding)).slice(0, 48);
    missingBase.forEach(candidate => { candidate.record.vectorText = String(candidate.record.vectorText || candidate.text).slice(0, 8000); });
    if (missingBase.length) await vectorizeSidecarMemoryRecords(missingBase.map(candidate => candidate.record));
    readerCandidates.forEach(candidate => {
        const snapshot = protocol.readerSnapshots.find(item => item.id === candidate.record.id);
        if (snapshot && Array.isArray(candidate.record.embedding)) { snapshot.embedding = candidate.record.embedding; snapshot.vectorizedAt = new Date().toISOString(); }
    });
    const prerequisitesMet = historyCandidates.some(candidate => Array.isArray(candidate.record.embedding))
        && episodeCandidates.some(candidate => Array.isArray(candidate.record.embedding));
    const allowedCharacters = new Set(Array.isArray(options.characterIds) ? options.characterIds.filter(Boolean) : []);
    const derivedCandidates = prerequisitesMet ? [
        ...(graph.cognition || []).filter(record => record.status === 'active' && (!allowedCharacters.size || allowedCharacters.has(record.characterId))).map(record => ({ kind: 'cognition', text: record.text, record })),
        ...(graph.scenes || []).filter(record => record.status === 'active' && record.vectorText).map(record => ({ kind: 'scene', text: record.vectorText || record.summary, record })),
        ...(graph.sequences || []).filter(record => record.status === 'active' && record.vectorText).map(record => ({ kind: 'sequence', text: record.vectorText || record.summary, record })),
        ...(graph.locationReferences || []).filter(record => record.status !== 'resolved').map(record => ({ kind: 'unresolved_place', text: `${record.name || ''} ${record.evidence || ''}`, record })),
        ...(world.locations || []).map(record => ({ kind: 'location', text: sidecarLocationEmbeddingText(world, record), record }))
    ] : [];
    const candidates = [...baseCandidates, ...derivedCandidates].filter(candidate => candidate.text);
    const missing = derivedCandidates.filter(candidate => !Array.isArray(candidate.record.embedding)).slice(0, 48);
    missing.forEach(candidate => { candidate.record.vectorText = String(candidate.record.vectorText || candidate.text).slice(0, 8000); });
    if (missing.length) await vectorizeSidecarMemoryRecords(missing.map(candidate => candidate.record));
    return candidates.map(candidate => ({ ...candidate, score: cosineSimilarity(queryEmbedding, candidate.record.embedding || []) }))
        .filter(candidate => Number.isFinite(candidate.score) && candidate.score > 0)
        .sort((a, b) => b.score - a.score).slice(0, limit)
        .map(candidate => ({ kind: candidate.kind, score: Math.round(candidate.score * 1000) / 1000, text: candidate.text.slice(0, 1600), id: candidate.record.id, characterId: candidate.record.characterId || '', epistemicStatus: candidate.record.epistemicStatus || '' }));
}

function effectiveSidecarMemoryConfig(world) {
    const global = ExperimentalWorldsState.globalSettings || {};
    const local = world?.sidecarConfig?.memory && typeof world.sidecarConfig.memory === 'object'
        ? world.sidecarConfig.memory : {};
    const inherited = name => local.inheritGlobal === false ? local[name] : (global[name] ?? local[name]);
    const pick = (name, fallback, min, max) => {
        const candidate = inherited(name);
        const numeric = Math.round(Number(candidate));
        return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
    };
    return {
        inheritGlobal: local.inheritGlobal !== false,
        episodeChunkTurns: pick('episodeChunkTurns', 5, 1, 20),
        episodeCadenceTurns: pick('episodeCadenceTurns', 5, 1, 50),
        verbatimTurnWindow: pick('verbatimTurnWindow', 5, 0, 30),
        consolidationConcurrency: pick('consolidationConcurrency', 6, 1, 12),
        backgroundProviderConcurrency: pick('backgroundProviderConcurrency', 2, 1, 12),
        retrievalLimit: pick('retrievalLimit', 8, 1, 24),
        cognitionRecentLimit: pick('cognitionRecentLimit', 8, 1, 30),
        cognitionSemanticTopK: pick('cognitionSemanticTopK', 6, 1, 20),
        consolidationModel: String(inherited('consolidationModel') || global.consolidationModel || world?.model || ExperimentalWorldsState.globalSettings?.defaultModel || '').trim(),
        consolidationMaxTokens: Number(inherited('consolidationMaxTokens')) || 1400,
        consolidationTemperature: Number(inherited('consolidationTemperature')) || 0,
        consolidationReasoning: inherited('consolidationReasoning') === true
    };
}

function effectiveSidecarReaderProfile(world, sess = null) {
    const globalProfile = window.ExperimentalWorldsSidecarReader?.normalizeProfile?.(ExperimentalWorldsState.globalSettings?.sidecarReaderProfile || {}) || {};
    const tracker = window.ExperimentalWorldsSidecarMode?.normalizeWorldConfig?.(world)?.tracker || {};
    const localProfile = window.ExperimentalWorldsSidecarReader?.normalizeProfile?.(tracker.readerProfile || {}) || {};
    const profile = tracker.readerProfileInherit === false ? localProfile : globalProfile;
    // `timeline.sidecar.readerProfile` is a derived snapshot of the profile
    // used by a turn, not an override.  Treating the empty/default timeline
    // object as authoritative silently masked global and world settings.
    // World/timeline provenance is written when a reader turn starts; routing
    // always resolves from the explicit world inheritance choice here.
    return window.ExperimentalWorldsSidecarReader?.normalizeProfile?.(profile) || profile;
}

function deriveSidecarReaderProfileRevision(profile) {
    const normalized = window.ExperimentalWorldsSidecarReader?.normalizeProfile?.(profile || {}) || profile || {};
    const fingerprint = { ...normalized, revision: '' };
    return { ...normalized, revision: `reader-${worldMediaHash(JSON.stringify(fingerprint))}` };
}

// Historical reader backfill is explicitly derived-only. It never invokes a
// reducer, rewrites a Turn, or makes an old Take active; it only attaches a
// versioned reader snapshot/evidence record so later memory jobs can consume
// it. Progress is persisted after every item, allowing a failed run to resume
// without repeating completed turns.
async function backfillSidecarReaderSnapshots(world, sess, options = {}) {
    if (!world || !sess || !window.ExperimentalWorldsSidecarHooks?.isSidecarWorld?.(world, sess)) throw new Error('Reader backfill requires a Sidecar timeline.');
    const protocol = window.ExperimentalWorldsSidecarHooks.normalizeWorldTimeline(world, sess);
    const activeTurns = (protocol.turns || []).filter(turn => turn.status !== 'superseded');
    const turnIds = Array.isArray(options.turnIds) && options.turnIds.length ? new Set(options.turnIds.map(String)) : null;
    const startFound = options.startTurnId ? activeTurns.findIndex(turn => String(turn.id) === String(options.startTurnId)) : 0;
    const startIndex = Math.max(0, startFound);
    const endFound = options.endTurnId ? activeTurns.findIndex(turn => String(turn.id) === String(options.endTurnId)) : activeTurns.length - 1;
    if (options.startTurnId && startFound === -1) throw new Error('The selected reader backfill start turn is not available on this timeline.');
    if (options.endTurnId && endFound === -1) throw new Error('The selected reader backfill end turn is not available on this timeline.');
    if (endFound >= 0 && startIndex >= 0 && endFound < startIndex) throw new Error('Reader backfill range must end at or after its start turn.');
    const endIndex = endFound < 0 ? activeTurns.length - 1 : endFound;
    const selectedTurns = activeTurns.slice(startIndex, endIndex + 1);
    const eligible = selectedTurns.filter(turn => (!turnIds || turnIds.has(String(turn.id)))
        && !protocol.readerSnapshots.some(snapshot => snapshot.turnId === turn.id && snapshot.settlementStatus === 'audit_only'));
    const profile = effectiveSidecarReaderProfile(world, sess);
    const config = window.ExperimentalWorldsSidecarMode?.normalizeWorldConfig?.(world) || {};
    const tracker = config.tracker || {};
    const model = profile.model || (tracker.inheritNarrator !== false && tracker.model ? tracker.model : (world.model || ExperimentalWorldsState.globalSettings.defaultModel));
    const provider = profile.provider || (tracker.inheritNarrator !== false ? ExperimentalWorldsHost.normalizedProviderId(ExperimentalWorldsState.globalSettings?.apiProvider || 'openrouter') : ExperimentalWorldsHost.normalizedProviderId(tracker.provider || ExperimentalWorldsState.globalSettings?.apiProvider || 'openrouter'));
    protocol.readerBackfill = { ...(protocol.readerBackfill || {}), status: 'running', startedAt: protocol.readerBackfill?.startedAt || new Date().toISOString(), total: (protocol.readerBackfill?.total || 0) + eligible.length, completed: Number(protocol.readerBackfill?.completed) || 0, failed: Number(protocol.readerBackfill?.failed) || 0, lastError: '' };
    await ExperimentalWorldsHost.persist();
    for (const turn of eligible) {
        const refreshIndex = (Number(protocol.readerSnapshots.length) || 0) + 1;
        // Historical processing is evidence-only. A full envelope avoids
        // borrowing a current snapshot as a delta base and it never enters
        // active Reader continuity, candidate state, questions or packets.
        const forceFull = true;
        try {
            const packet = await runSidecarSemanticReading(world, sess, {
                tracker, provider, model, readerProfile: profile, preFrame: turn.preFrame || buildWorldSceneFrame(world, sess),
                clockEvidence: turn.preClock || buildSidecarClockEvidence(world, sess), priorReaderEnvelope: null, forceFull,
                playerInput: turn.playerInput || '', narration: turn.narration || '', handoff: turn.handoff || '',
                references: buildSidecarCanonicalReferenceManifest(world, sess, `${turn.playerInput || ''}\n${turn.narration || ''}\n${turn.handoff || ''}`)
            });
            if (!packet?.valid) throw new Error(packet?.error || 'Reader returned invalid historical scene evidence.');
            const envelope = normalizeSidecarReaderEnvelope({
                ...packet, profileRevision: profile.revision, promptRevision: profile.promptRevision,
                sourceTurnId: turn.id, sourceTakeId: turn.takeId || '', sourceRevisionId: turn.revisionId || '',
                refreshIndex, snapshotMode: 'full', baseSnapshotId: '',
                visibleNarrationHash: worldMediaHash(String(turn.authorialArtifact?.narration ?? turn.narration ?? '')),
                handoffHash: worldMediaHash(String(turn.authorialArtifact?.handoff ?? turn.handoff ?? '')),
                metadata: { ...(packet.metadata || {}), auditOnly: true, capturedAt: new Date().toISOString() }
            });
            const snapshot = {
                id: `reader_backfill_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
                status: 'backfill_review', settlementStatus: 'audit_only', createdAt: new Date().toISOString(),
                turnId: turn.id, takeId: turn.takeId || '', sceneId: turn.sceneId || '', sequenceId: turn.sequenceId || '',
                envelope, provenance: { source: 'sidecar_reader_backfill', profileRevision: profile.revision, auditOnly: true }
            };
            protocol.readerSnapshots.push(snapshot);
            turn.readerBackfillEvidence = { snapshotId: snapshot.id, status: 'audit_only', createdAt: snapshot.createdAt };
            protocol.readerBackfill.completed = Number(protocol.readerBackfill.completed) + 1;
        } catch (error) {
            protocol.readerBackfill.failed = Number(protocol.readerBackfill.failed) + 1;
            protocol.readerBackfill.lastError = String(error?.message || error).slice(0, 1000);
            turn.readerBackfillError = protocol.readerBackfill.lastError;
        }
        protocol.readerBackfill.updatedAt = new Date().toISOString();
        await ExperimentalWorldsHost.persist();
        options.onProgress?.(experimentalSafeJsonClone(protocol.readerBackfill));
    }
    protocol.readerBackfill.status = protocol.readerBackfill.failed && !protocol.readerBackfill.completed ? 'failed' : 'completed';
    protocol.readerBackfill.completedAt = new Date().toISOString();
    await ExperimentalWorldsHost.persist();
    return experimentalSafeJsonClone(protocol.readerBackfill);
}
window.ExperimentalWorldsSidecarReaderBackfill = { run: backfillSidecarReaderSnapshots };

async function runSidecarBackgroundMemoryJobs(world, sess, options = {}) {
    if (!ExperimentalWorldsHost.hasApiCredentials() || !window.ExperimentalWorldsSidecarHooks?.isSidecarWorld?.(world, sess)) return;
    const protocol = window.ExperimentalWorldsSidecarHooks.normalizeWorldTimeline(world, sess);
    const graph = window.ExperimentalWorldsSidecarMemoryGraph?.graph(protocol);
    if (!graph) return;
    // Sidecar migration retains visible history as evidence.  Materialise that
    // evidence before looking for an Episode so manual archive and ordinary
    // cadence have the same truthful source set.
    window.ExperimentalWorldsSidecarMemoryGraph?.backfillWorldHistory?.(protocol, sess);
    const startMemoryEpoch = Number(sess._memEpoch) || 0;
    const memoryDefaults = effectiveSidecarMemoryConfig(world);
    const config = window.ExperimentalWorldsSidecarMode?.normalizeWorldConfig?.(world) || {};
    const tracker = config.tracker || {};
    const model = tracker.inheritNarrator !== false || !tracker.model
        ? (memoryDefaults.consolidationModel || world.model || ExperimentalWorldsState.globalSettings.defaultModel)
        : tracker.model;
    window.ExperimentalWorldsSidecarMemoryGraph.queueEpisode(protocol, {
        batchSize: memoryDefaults.episodeChunkTurns,
        cadenceTurns: memoryDefaults.episodeCadenceTurns,
        force: options.force === true,
        source: options.source || 'sidecar_memory_dispatcher',
        priority: options.priority || (options.force === true ? 'manual' : 'background')
    });
    const providerLimit = Math.max(1, Math.min(12, Number(memoryDefaults.backgroundProviderConcurrency) || 2));
    const overallLimit = Math.max(1, Math.min(12, Number(memoryDefaults.consolidationConcurrency) || 6));
    const queuedJobs = (protocol.jobs || []).filter(job => ['episode_consolidation', 'scene_consolidation', 'sequence_consolidation', 'cognition_consolidation', 'turn_cognition'].includes(job.type) && ['queued', 'dependency_waiting'].includes(job.status)
        && (!job.retryAt || new Date(job.retryAt).getTime() <= Date.now()));
    const completedIds = new Set((protocol.jobs || []).filter(job => job.status === 'completed').map(job => job.id));
    queuedJobs.forEach(job => {
        const deps = Array.isArray(job.dependencies) ? job.dependencies : [];
        if (deps.some(dep => !completedIds.has(dep) && !(protocol.jobs || []).some(candidate => candidate.id === dep && candidate.status === 'completed'))) {
            job.status = 'dependency_waiting'; job.waitingSince = job.waitingSince || new Date().toISOString();
        } else if (job.status === 'dependency_waiting') job.status = 'queued';
        job.provider = job.provider || ExperimentalWorldsState.globalSettings?.apiProvider || 'openrouter';
        job.model = job.model || memoryDefaults.consolidationModel || model;
    });
    const runnable = queuedJobs.filter(job => job.status === 'queued').slice(0, overallLimit);
    if (!runnable.length) {
        // Dependency transitions and newly queued work are state too. Persist
        // them even when this wave has nothing runnable yet, otherwise a
        // browser refresh can make a dependency-waiting job appear to vanish.
        await ExperimentalWorldsHost.persist();
        return;
    }
    const providerCounts = {};
    const scheduled = runnable.filter(job => {
        const key = `${job.provider || 'default'}::${job.model || model}`;
        providerCounts[key] = providerCounts[key] || 0;
        if (providerCounts[key] >= providerLimit) return false;
        providerCounts[key]++;
        job.dispatch = { provider: job.provider || 'default', model: job.model || model, scheduledAt: new Date().toISOString(), foreground: false };
        return true;
    });
    await Promise.all(scheduled.map(async job => {
        job.status = 'running'; job.startedAt = new Date().toISOString();
        const jobProvider = ExperimentalWorldsHost.normalizedProviderId(job.provider || ExperimentalWorldsState.globalSettings?.apiProvider || 'openrouter');
        const jobWorld = { ...world, model: job.model || model, openRouterRouting: tracker.openRouterRouting || world.openRouterRouting };
        if (job.type === 'cognition_consolidation' || job.type === 'turn_cognition') {
            const turnScoped = job.type === 'turn_cognition';
            const episode = turnScoped ? null : (graph.episodes || []).find(record => record.id === job.episodeId && record.status === 'active');
            const character = job.characterId === 'player'
                ? { id: 'player', name: sess.playerIdentity?.name || 'the player', persona: sess.playerIdentity?.persona || '' }
                : ((world.entities || []).find(entity => entity.id === job.characterId && (entity.type === 'npc' || entity.type === 'character'))
                    || (turnScoped && (job.candidateId || job.subjectRef) ? (() => {
                        const candidate = (protocol.readerCandidates || []).find(item => item.candidateId === job.candidateId && item.settlementStatus === 'settled');
                        return candidate
                            ? { id: candidate.candidateId, name: candidate.label || candidate.role || 'Scene character', persona: candidate.persona || '', description: candidate.description || '', sceneCandidate: true }
                            : { id: job.subjectRef, name: job.provisionalIntelligence?.name || 'Scene character', persona: '', description: '', sceneCandidate: true };
                    })() : null));
            if ((!turnScoped && !episode) || !character) {
                window.ExperimentalWorldsSidecarMemoryGraph.failJob(protocol, job.id, !turnScoped && !episode ? 'Episode no longer exists.' : 'Character/candidate is no longer eligible for cognition.');
                return;
            }
            const activeSources = (job.sourceTurnIds || []).every(turnId => (protocol.turns || []).some(turn => turn.id === turnId && ['active', 'reconciled_late'].includes(turn.status) && ['committed', 'committed_late'].includes(turn.reconciliationStatus)));
            if (!activeSources) {
                window.ExperimentalWorldsSidecarMemoryGraph.failJob(protocol, job.id, 'The source Turn is no longer in accepted settled continuity.');
                return;
            }
            const prior = (graph.cognition || []).filter(record => record.characterId === character.id && record.status === 'active').slice(-memoryDefaults.cognitionRecentLimit)
                .map(record => ({ text: record.text, epistemicStatus: record.epistemicStatus }));
            const sourceIds = turnScoped ? (job.sourceTurnIds || []) : (episode.sourceTurnIds || []);
            const sourceTurns = graph.worldHistory.filter(record => sourceIds.includes(record.turnId) && record.status === 'active')
                .map(record => ({ turnId: record.turnId, narration: record.narration, sceneReading: record.sceneReading, readerEnvelope: record.readerEnvelope || null }));
            const characterState = sess.entityStates?.[character.id] || {};
            const relationships = Object.entries(sess.npcRelationships || {}).filter(([key]) => key.split('|').includes(character.id)).slice(-12);
            const authorial = { ledger: String(sess.ledger || '').slice(-3000), scenePacket: protocol.packet || null };
            const prompt = `[SIDECAR CHARACTER COGNITION]\nWrite only experiential memories for ${character.name} [${character.id}]. This is private character cognition, never objective canon. Return JSON only: {"memories":[{"text":"first-person memory","epistemicStatus":"self_action|direct_observation|disclosure|interpretation|belief|influence","importance":0.0,"confidence":0.0,"sourceTurnIds":["turn id"]}]}.\nKeep witnessed actions distinct from self-actions; disclosures must identify who told them; interpretations and suspicions must remain uncertain. Do not create a memory merely because the character was present, and do not infer interiority beyond the available character grounding. Ordinary absence belongs in episode coverage, not as a durable memory. A Reader provisional impression is a character-scoped lead, not an objective fact: retain, revise, or reject it only according to this subject's perception.\n\nCHARACTER-SCOPED PERCEPTION EVIDENCE:\n${JSON.stringify({ characterId: character.id, access: job.access, evidence: job.perceptionEvidence || '', provisionalIntelligence: turnScoped ? job.provisionalIntelligence || null : null, episodeCoverage: (episode?.perceptionCoverage || []).filter(item => item.characterId === character.id) })}\n\nEXACT SOURCE RANGE (only what was authored):\n${JSON.stringify(sourceTurns)}\n\nCHARACTER GROUNDING:\n${JSON.stringify({ id: character.id, name: character.name, persona: character.persona || '', description: character.description || '', currentState: characterState, relationships, sceneCandidate: character.sceneCandidate === true })}\n\nOBJECTIVE EPISODE (context, not character knowledge by itself):\n${JSON.stringify(episode ? { id: episode.id, summary: episode.summary, objectiveHistory: episode.objectiveHistory } : { status: 'not yet consolidated', sourceTurnIds: sourceIds })}\n\nAUTHORIAL CONTEXT (explains stakes only; never grants knowledge):\n${JSON.stringify(authorial)}\n\nRELEVANT PRIOR COGNITION:\n${JSON.stringify(prior)}`;
            try {
                const response = await fetch(ExperimentalWorldsHost.providerApiBase(jobProvider) + '/chat/completions', {
                    method: 'POST', headers: { ...ExperimentalWorldsHost.providerAuthHeaders(jobProvider), 'Content-Type': 'application/json', ...ExperimentalWorldsHost.providerAttributionHeaders(jobProvider) },
                    body: JSON.stringify(ExperimentalWorldsHost.applyOpenRouterRouting({ model, max_tokens: Math.max(300, Number(memoryDefaults.consolidationMaxTokens) || 1400), temperature: Number(memoryDefaults.consolidationTemperature) || 0,
                        ...(memoryDefaults.consolidationReasoning ? { reasoning_effort: 'low' } : {}),
                        messages: [{ role: 'system', content: prompt }, { role: 'user', content: 'Consolidate this character cognition.' }] },
                        jobWorld, { scope: 'sidecar' }))
                });
                if (!response.ok) throw new Error(`Cognition consolidation failed (${response.status})`);
                let output = parseSidecarCognitionOutput((await response.json())?.choices?.[0]?.message?.content || '');
                const thoughtFallback = !output && turnScoped ? sidecarCognitionThoughtFallback(job) : [];
                if (!output && !thoughtFallback.length) throw new Error('Cognition consolidation returned no usable JSON.');
                if (!output) output = { memories: thoughtFallback, fallback: 'accepted_scenepulse_thought' };
                if ((Number(sess._memEpoch) || 0) !== startMemoryEpoch) return;
                output.memories.forEach(memory => graph.cognition.push({
                    id: `cognition_${Date.now().toString(36)}_${graph.cognition.length + 1}`, status: 'active', createdAt: new Date().toISOString(),
                    characterId: character.id, characterName: character.name, episodeId: episode?.id || '', turnCognitionJobId: turnScoped ? job.id : '', readerSnapshotId: job.readerSnapshotId || '', text: memory.text,
                    epistemicStatus: memory.epistemicStatus, importance: memory.importance, confidence: memory.confidence,
                    sourceTurnIds: memory.sourceTurnIds.length ? memory.sourceTurnIds : episode.sourceTurnIds,
                    provenance: { source: turnScoped ? (output.fallback ? 'character_turn_cognition_reader_thought_fallback' : 'character_turn_cognition') : 'character_cognition_consolidation', access: job.access, perceptionEvidence: job.perceptionEvidence || '', sourceEpisodeId: episode?.id || '', sourceTurnIds: sourceIds, readerSnapshotId: job.readerSnapshotId || '', provisionalReaderInput: turnScoped ? experimentalSafeJsonClone(job.provisionalIntelligence || null) : null }
                }));
                graph.cognition = graph.cognition.slice(-4000);
                await vectorizeSidecarMemoryRecords(graph.cognition.filter(record => record.turnCognitionJobId === job.id || (!turnScoped && record.episodeId === episode?.id && record.characterId === character.id)));
                job.status = 'completed'; job.completedAt = new Date().toISOString();
                protocol.packet = buildSidecarScenePacket(world, sess);
            } catch (error) {
                window.ExperimentalWorldsSidecarMemoryGraph.failJob(protocol, job.id, error.message || String(error));
            }
            return;
        }
        if (job.type === 'scene_consolidation' || job.type === 'sequence_consolidation') {
            const targetId = job.type === 'scene_consolidation' ? job.sceneId : job.sequenceId;
            const episodes = (graph.episodes || []).filter(episode => (job.episodeIds || []).includes(episode.id) && episode.status === 'active');
            if (!episodes.length) { window.ExperimentalWorldsSidecarMemoryGraph.failJob(protocol, job.id, 'No active episode evidence remains.'); return; }
            const label = job.type === 'scene_consolidation' ? 'scene' : 'sequence';
        const prompt = `[SIDECAR ${label.toUpperCase()} CONSOLIDATION]\nCompress the supplied episode summaries into one durable ${label}-level memory. Preserve only supported facts and unresolved uncertainty; do not invent events, locations, character knowledge, or outcomes. Reader fields are derived evidence only: use them to understand scene topic/presence/temporal continuity and candidate structures, never as permission to grant a character knowledge or rewrite objective canon. Candidate structures may remain ephemeral and should only be mentioned as unresolved/scene-local unless independently supported for promotion. Return JSON only: {"summary":"compact event-based summary","keyFacts":"durable facts and open threads"}.\n\nEPISODES:\n${JSON.stringify(episodes.map(episode => ({ id: episode.id, summary: episode.summary, objectiveHistory: episode.objectiveHistory, sourceTurnIds: episode.sourceTurnIds, readerEvidence: (episode.sourceTurnIds || []).map(turnId => graph.worldHistory.find(record => record.turnId === turnId)?.readerEnvelope || null).filter(Boolean).map(envelope => ({ summary: envelope.summary, scene: envelope.scene, presence: envelope.presence, temporal: envelope.temporal, candidateStructures: envelope.candidateStructures || [] })) })))}\n\nTARGET ${label.toUpperCase()} ID: ${targetId}`;
            try {
                const response = await fetch(ExperimentalWorldsHost.providerApiBase(jobProvider) + '/chat/completions', {
                    method: 'POST', headers: { ...ExperimentalWorldsHost.providerAuthHeaders(jobProvider), 'Content-Type': 'application/json', ...ExperimentalWorldsHost.providerAttributionHeaders(jobProvider) },
                    body: JSON.stringify(ExperimentalWorldsHost.applyOpenRouterRouting({ model, max_tokens: Math.max(300, Number(memoryDefaults.consolidationMaxTokens) || 1400), temperature: Number(memoryDefaults.consolidationTemperature) || 0,
                        ...(memoryDefaults.consolidationReasoning ? { reasoning_effort: 'low' } : {}), messages: [{ role: 'system', content: prompt }, { role: 'user', content: `Consolidate this ${label}.` }] },
                        jobWorld, { scope: 'sidecar' }))
                });
                if (!response.ok) throw new Error(`${label} consolidation failed (${response.status})`);
                const output = parseSidecarHierarchyOutput((await response.json())?.choices?.[0]?.message?.content || '');
                if (!output) throw new Error(`${label} consolidation returned no usable JSON.`);
                if ((Number(sess._memEpoch) || 0) !== startMemoryEpoch) return;
                const collection = job.type === 'scene_consolidation' ? graph.scenes : graph.sequences;
                const record = collection.find(item => item[`${label}Id`] === targetId);
                if (record) {
                    record.summary = output.summary;
                    record.keyFacts = output.keyFacts;
                    record.vectorText = [output.summary, output.keyFacts].filter(Boolean).join('\n');
                    record.updatedAt = new Date().toISOString();
                    record.provenance = { ...(record.provenance || {}), source: `${label}_consolidation`, evidenceEpisodeIds: episodes.map(episode => episode.id) };
                    await vectorizeSidecarMemoryRecords([record]);
                }
                job.status = 'completed'; job.completedAt = new Date().toISOString(); job.outputId = record?.id || '';
            } catch (error) { window.ExperimentalWorldsSidecarMemoryGraph.failJob(protocol, job.id, error.message || String(error)); }
            return;
        }
        const source = graph.worldHistory.filter(record => job.sourceTurnIds.includes(record.turnId) && record.status === 'active');
        if (!source.length) {
            window.ExperimentalWorldsSidecarMemoryGraph.failJob(protocol, job.id, 'All source turns were superseded before consolidation.');
            return;
        }
        const prompt = `[SIDECAR EPISODE CONSOLIDATION]\nYou consolidate a committed group of roleplay turns. Do not invent facts, promote implied places, or grant character knowledge from authorial context. Return JSON only:\n{\n  "summary":"objective episode summary",\n  "objectiveHistory":"durable factual history only",\n  "perceptionCoverage":[{"characterId":"canonical ID when known","access":"visual|auditory|informational|absent","detail":"what this participant had access to"}],\n  "locationReferences":[{"name":"particular referenced place","locationId":"canonical ID or empty","status":"assigned|unresolved","evidence":"short contextual clue"}]\n}\nAn ordinary generic desire such as “somewhere quiet” is not a location reference. Only record a particular place if the full episode context identifies one or establishes that it is unresolved.\n\nCOMMITTED SOURCE TURNS (reader envelopes are derived evidence, not canon):\n${JSON.stringify(source.map(record => ({ turnId: record.turnId, sequenceId: record.sequenceId, sceneId: record.sceneId, narration: record.narration, handoff: record.sceneReading, readerEnvelope: record.readerEnvelope || null })))} `;
        try {
            const response = await fetch(ExperimentalWorldsHost.providerApiBase(jobProvider) + '/chat/completions', {
                method: 'POST', headers: { ...ExperimentalWorldsHost.providerAuthHeaders(jobProvider), 'Content-Type': 'application/json', ...ExperimentalWorldsHost.providerAttributionHeaders(jobProvider) },
                body: JSON.stringify(ExperimentalWorldsHost.applyOpenRouterRouting({ model, max_tokens: Math.max(300, Number(memoryDefaults.consolidationMaxTokens) || 1400), temperature: Number(memoryDefaults.consolidationTemperature) || 0,
                    ...(memoryDefaults.consolidationReasoning ? { reasoning_effort: 'low' } : {}),
                    messages: [{ role: 'system', content: prompt }, { role: 'user', content: 'Consolidate this episode.' }] },
                    jobWorld, { scope: 'sidecar' }))
            });
            if (!response.ok) throw new Error(`Episode consolidation failed (${response.status})`);
            const output = parseSidecarEpisodeOutput((await response.json())?.choices?.[0]?.message?.content || '');
            if (!output) throw new Error('Episode consolidation returned no usable JSON.');
            if ((Number(sess._memEpoch) || 0) !== startMemoryEpoch) return;
            window.ExperimentalWorldsSidecarMemoryGraph.completeEpisode(protocol, job.id, output);
            const completedEpisode = (graph.episodes || []).find(record => record.jobId === job.id);
            const sourceForVectors = graph.worldHistory.filter(record => job.sourceTurnIds.includes(record.turnId) && record.status === 'active');
            sourceForVectors.forEach(record => { record.vectorText = record.text || record.narration; });
            if (completedEpisode) completedEpisode.vectorText = completedEpisode.text || completedEpisode.summary;
            // Cognition and location vectors are downstream products: make the
            // committed world-history and episode evidence available first.
            await vectorizeSidecarMemoryRecords([...sourceForVectors, ...(completedEpisode ? [completedEpisode] : [])]);
            protocol.packet = buildSidecarScenePacket(world, sess);
        } catch (error) {
            window.ExperimentalWorldsSidecarMemoryGraph.failJob(protocol, job.id, error.message || String(error));
        }
    }));
    await ExperimentalWorldsHost.persist();
    // Episode completion creates dependent cognition and hierarchy jobs after
    // this wave was selected.  Yield once, then dispatch a fresh bounded wave;
    // this is deliberately background-only and never becomes a third turn call.
    const hasDependentWave = (protocol.jobs || []).some(job => job.status === 'queued' && job.provenance?.source !== 'sidecar_memory_dispatcher');
    const activeCount = (graph.worldHistory || []).filter(record => record.status === 'active').length;
    const hasForcedRemainder = options.force === true && activeCount > Number(graph.lastEpisodeTurnCount || 0)
        && scheduled.some(job => job.type === 'episode_consolidation' && job.status === 'completed');
    if (hasDependentWave || hasForcedRemainder) {
        setTimeout(() => runSidecarBackgroundMemoryJobs(world, sess, options).catch(error => console.warn('Sidecar memory follow-up wave skipped —', error.message)), 0);
    }
}

async function runSidecarConversation(world, sess, userText, options = {}) {
    const requestOwner = captureExperimentalSidecarOwner(world, sess);
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    if (!protocol) throw new Error('Sidecar protocol is unavailable for this timeline.');
    const config = window.ExperimentalWorldsSidecarMode?.normalizeWorldConfig?.(world) || {};
    const tracker = config.tracker || {};
    const narratorModel = world.model || ExperimentalWorldsState.globalSettings.defaultModel;
    const model = tracker.inheritNarrator !== false || !tracker.model ? narratorModel : tracker.model;
    const narratorProvider = ExperimentalWorldsHost.normalizedProviderId(ExperimentalWorldsState.globalSettings?.apiProvider || 'openrouter');
    const provider = tracker.inheritNarrator !== false || !tracker.provider
        ? narratorProvider : ExperimentalWorldsHost.normalizedProviderId(tracker.provider);
    const packet = protocol.packet || buildSidecarScenePacket(world, sess);
    const openQuestions = (protocol.questions || []).filter(question => question.status === 'open').slice(-20);
    const incompleteCommit = sess?.sidecarIncompleteCommit || null;
    const recoveryInstruction = incompleteCommit
        ? `\n\nINCOMPLETE COMMIT RECOVERY: A prior canonical Sidecar transaction is journaled as incomplete. Its stable identity is ${JSON.stringify(String(incompleteCommit.identity || ''))}. Do not replay its authored prose. If, and only if, the author explicitly asks to recover, repair, complete, or reconcile that journaled transaction, your proposed_receipt must include recovery_of with exactly that identity and must be a new compensating/native receipt grounded in the journal evidence. Otherwise keep proposed_receipt null and explain that progression is blocked pending explicit recovery.`
        : '';
    const workspaceContract = `\n\nWORKSPACE:\n${JSON.stringify(protocol.workspace || { kind: 'world_gm' })}\nIf and only if the author explicitly approves an available workspace action, include an additional JSON field "workspace_action" with one of: "close_scene", "begin_sequence_plan", "approve_sequence_plan", "context_refresh". Otherwise set it to "none". Never infer approval from merely opening a workspace.`;
    const prompt = `[SIDECAR CONVERSATION]\nYou are the out-of-world continuity and state-refinement sidecar. Speak naturally and briefly to the world author. This is not roleplay, and a conversation must not itself advance time, progress a journey, or move characters. Answer from canonical state where possible. The author may deliberately establish a fact without narrating it; preserve that direct-user provenance, do not invent adjacent facts. Implied people and places are evidence-backed provisional records, not canonical entities: explain their status, but only propose promotion when the author explicitly asks.\n\nReturn one JSON object only:\n{\n  "reply": "plain-language answer for the author",\n  "resolutions": [{"question_id":"stable open question ID", "answer":"authorial answer", "status":"resolved|deferred"}],\n  "proposed_receipt": null\n}\nUse proposed_receipt only for an explicit authorial refinement that needs existing canonical reducers, including a clearly requested clock correction. It must be a complete native commit_world_turn receipt, and must never turn a conversation into an automatic tick, arrival, traversal progression, presence change, or speculative fact. If no state change is requested, use null. Use only IDs from CANONICAL REFERENCES.${recoveryInstruction}\n\nCURRENT SCENE PACKET:\n${JSON.stringify(packet)}\n\nINCOMPLETE COMMIT JOURNAL (only for explicit recovery; do not replay it):\n${incompleteCommit ? JSON.stringify(incompleteCommit).slice(0, 18000) : '(none)'}\n\nCANONICAL REFERENCES:\n${JSON.stringify(buildSidecarCanonicalReferenceManifest(world, sess, userText))}\n\nOPEN QUESTIONS:\n${JSON.stringify(openQuestions)}\n\nIMPLIED RECORDS AWAITING REVIEW:\n${JSON.stringify([...(protocol.provisionalLocations || []), ...(protocol.provisionalEntities || [])].filter(record => record.status !== 'promoted').slice(-20))}\n\nRECENT SIDECAR CONVERSATION:\n${JSON.stringify((protocol.conversations || []).slice(-12))}\n\nAUTHOR MESSAGE:\n${JSON.stringify(String(userText || '').slice(0, 6000))}`;
    const body = {
        model, stream: false,
        max_tokens: Math.max(1200, Number(tracker.maxTokens) || 3000),
        temperature: 0.2,
        messages: [{ role: 'system', content: prompt + workspaceContract }, { role: 'user', content: 'Respond as Sidecar.' }]
    };
    applySidecarReasoning(body, provider, tracker, world);
    const sidecarWorld = { ...world, model, provider, openRouterRouting: tracker.openRouterRouting || world.openRouterRouting };
    logSidecarConsoleTrace('World GM request', { model, provider, request: experimentalSafeJsonClone(body) });
    const response = await fetchSidecarCompletion(body, {
        provider, tracker, world, owner: sidecarWorld, signal: options.signal
    });
    if (!response.ok) throw new Error((await response.text()).slice(0, 800) || `Sidecar conversation failed (${response.status})`);
    const data = await response.json();
    assertExperimentalSidecarOwner(requestOwner);
    logSidecarConsoleTrace('World GM response', {
        model, provider: data?.provider || provider,
        finishReason: data?.choices?.[0]?.finish_reason || '',
        assistant: experimentalSafeJsonClone(data?.choices?.[0]?.message || {})
    });
    const result = parseSidecarConversationResponse(data?.choices?.[0]?.message?.content || '');
    const authorEntry = { id: `sidecar_author_${Date.now().toString(36)}`, role: 'user', text: String(userText || '').trim(), createdAt: new Date().toISOString() };
    const sidecarEntry = { id: `sidecar_reply_${Date.now().toString(36)}`, role: 'sidecar', text: result.reply, createdAt: new Date().toISOString(), provenance: { source: 'direct_user_refinement' } };
    let commit = null;
    if (result.proposedReceipt) {
        try {
            const recoveryOf = String(result.proposedReceipt.recovery_of || result.proposedReceipt.recoveryOf || '').trim();
            const explicitRecoveryIntent = /\b(recover|repair|complete|resolve|reconcile|finish)\b/i.test(String(userText || ''));
            commit = commitWorldTurnReceipt(world, sess, result.proposedReceipt, {
                playerStartLocationId: sess.playerLocation,
                playerMovementAuthorized: false,
                narrativeText: '',
                sourceTurnId: authorEntry.id,
                idempotencyKey: `sidecar-conversation:${sess.id || 'timeline'}:${authorEntry.id}`,
                allowIncompleteRecovery: explicitRecoveryIntent && !!recoveryOf,
                recoveryOf
            }, 'sidecar_conversation');
            sidecarEntry.commitAudit = experimentalSafeJsonClone(commit.audit);
        } catch (error) {
            sidecarEntry.commitError = error.message || String(error);
            sidecarEntry.text += '\n\nI could not apply that refinement because it did not pass canonical validation. I left state unchanged.';
        }
    }
    result.resolutions.forEach(resolution => {
        const question = protocol.questions.find(item => item.id === String(resolution.question_id || ''));
        if (!question || !['resolved', 'deferred'].includes(resolution.status)) return;
        recordSidecarQuestionAttempt(world, sess, question.id, { channel: 'sidecar_conversation', status: resolution.status, answer: resolution.answer || '' });
        updateSidecarQuestion(world, sess, question.id, { status: resolution.status, answer: resolution.answer || '', resolutionType: resolution.status === 'resolved' ? 'direct_user_answer' : 'direct_user_deferral', provenance: { source: 'direct_user_refinement', conversationId: authorEntry.id } });
    });
    if (result.workspaceAction === 'close_scene') {
        const active = window.ExperimentalWorldsSidecarTimeline?.ensureHierarchy(protocol, sess);
        if (active?.scene?.status === 'active') {
            const closedSceneId = active.scene.id;
            active.scene.status = 'closed'; active.scene.closedAt = new Date().toISOString();
            active.scene.endTurnId = (protocol.turns || []).filter(turn => turn.sceneId === closedSceneId).at(-1)?.id || '';
            active.scene.provisionalReview = { status: 'author_approved', reviewedAt: new Date().toISOString(), provenance: { source: 'sidecar_conversation', conversationId: authorEntry.id } };
            const memory = effectiveSidecarMemoryConfig(world);
            window.ExperimentalWorldsSidecarMemoryGraph?.queueEpisode(protocol, { batchSize: memory.episodeChunkTurns, cadenceTurns: memory.episodeCadenceTurns, force: true, source: 'scene_transition', priority: 'scene_transition' });
            protocol.activeSceneId = '';
            // Closing a scene does not close its sequence. Open the next
            // scene immediately so normal narration remains available.
            const next = window.ExperimentalWorldsSidecarTimeline?.ensureHierarchy(protocol, sess, { createWhenMissing: true });
            sidecarEntry.workspaceAction = {
                type: 'close_scene', sceneId: closedSceneId, nextSceneId: next?.scene?.id || '',
                source: 'explicit_author_approval'
            };
        }
    } else if (result.workspaceAction === 'begin_sequence_plan') {
        const plan = window.ExperimentalWorldsSidecarTimeline?.beginPlanning(protocol, sess, authorEntry.text);
        if (plan) sidecarEntry.workspaceAction = { type: 'begin_sequence_plan', planId: plan.id, source: 'explicit_author_approval' };
    } else if (result.workspaceAction === 'approve_sequence_plan') {
        const previous = window.ExperimentalWorldsSidecarTimeline?.ensureHierarchy(protocol, sess, { createWhenMissing: false });
        const memory = effectiveSidecarMemoryConfig(world);
        // Queue the final evidence before close.  The closure itself is then
        // observed by Episode completion and fans out the Scene/Sequence jobs.
        window.ExperimentalWorldsSidecarMemoryGraph?.queueEpisode(protocol, { batchSize: memory.episodeChunkTurns, cadenceTurns: memory.episodeCadenceTurns, force: true, source: 'sequence_transition', priority: 'closure' });
        const transitionMode = /(?:cut|skip|later|tomorrow|following|new scene)/i.test(authorEntry.text) ? 'discontinuous' : 'continuous';
        const approved = window.ExperimentalWorldsSidecarTimeline?.approvePlanning(protocol, sess, {
            title: protocol.sequencePlanning?.title || 'New sequence',
            sceneTitle: protocol.sequencePlanning?.sceneTitle || '',
            transitionMode,
            authorIntent: authorEntry.text
        }, { closePriorScene: true, transitionMode });
        if (approved) sidecarEntry.workspaceAction = { type: 'approve_sequence_plan', sequenceId: approved.sequence.id, sceneId: approved.scene.id, source: 'explicit_author_approval', priorSceneId: previous?.scene?.id || '' };
    } else if (result.workspaceAction === 'context_refresh') {
        const memory = effectiveSidecarMemoryConfig(world);
        window.ExperimentalWorldsSidecarMemoryGraph?.queueEpisode(protocol, { batchSize: memory.episodeChunkTurns, cadenceTurns: memory.episodeCadenceTurns, force: true, source: 'context_refresh', priority: 'context_refresh' });
        sidecarEntry.workspaceAction = { type: 'context_refresh', source: 'explicit_author_approval' };
    }
    protocol.conversations.push(authorEntry, sidecarEntry);
    protocol.conversations = protocol.conversations.slice(-200);
    protocol.refinements.push({ id: `refinement_${Date.now().toString(36)}`, createdAt: new Date().toISOString(), userText: authorEntry.text,
        source: 'direct_user_refinement', committed: !!commit, audit: commit ? experimentalSafeJsonClone(commit.audit) : null });
    protocol.refinements = protocol.refinements.slice(-200);
    protocol.packet = buildSidecarScenePacket(world, sess);
    recordSidecarTrace(world, sess, { kind: 'conversation', prompt, reply: data?.choices?.[0]?.message || {}, model, provider });
    if (sidecarEntry.workspaceAction) runSidecarBackgroundMemoryJobs(world, sess).catch(error => console.warn('Sidecar workspace memory dispatch skipped —', error.message));
    return { ...result, commit, packet: protocol.packet };
}

function returnToWorldNarrator() {
    // The Sidecar panel can be redrawn while background work heals a session.
    // Resolve the active timeline at click time, never through a stale panel
    // closure, so Return always changes the composer that is actually shown.
    const activeWorld = ExperimentalWorldsState.worlds.find(item => item.id === ExperimentalWorldsState.activeWorldId);
    const activeSession = getCurrentWorldSession();
    const activeProtocol = activeWorld && activeSession
        ? window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(activeWorld, activeSession)
        : null;
    if (!activeProtocol) return;
    activeProtocol.inputMode = 'narrator';
    activeProtocol.workspace = {};
    renderWorldPlayState();
    document.getElementById('world-user-input')?.focus();
    ExperimentalWorldsHost.persist().catch(error => console.warn('Could not persist narrator mode:', error));
}

function renderSidecarConversation(world, sess) {
    const panel = document.getElementById('world-sidecar-conversation');
    const log = document.getElementById('world-sidecar-conversation-log');
    if (!panel || !log) return;
    const protocol = window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    const enabled = protocol?.inputMode === 'sidecar'
        && window.ExperimentalWorldsSidecarHooks?.isSidecarWorld?.(world, sess) === true;
    panel.classList.toggle('hidden', !enabled);
    if (!enabled) return;
    const closeSidecarConversation = document.getElementById('world-close-sidecar-conversation');
    if (closeSidecarConversation) closeSidecarConversation.onclick = returnToWorldNarrator;
    const entries = (protocol?.conversations || []).slice(-80);
    const questionCards = (protocol?.questions || []).filter(question => ['open', 'deferred'].includes(question.status)).slice(-20).map(question => `
        <details style="margin:0 0 8px; padding:7px 9px; border:1px solid var(--border); border-radius:7px; background:rgba(255,255,255,.03);">
            <summary style="cursor:pointer; font-size:.72rem; color:var(--warning);">Open question · ${experimentalEscapeHTML(question.id)} · ${experimentalEscapeHTML(question.priority || question.pressure || 'low')}${question.blocking ? ' · blocking' : ''}</summary>
            <div style="font-size:.78rem; color:var(--text-2); margin-top:6px; white-space:pre-wrap;">${experimentalEscapeHTML(question.prompt || '')}</div>
            <div style="font-size:.68rem; color:var(--text-3); margin-top:5px;">Origin: ${experimentalEscapeHTML(question.origin || '')} · Target: ${experimentalEscapeHTML(question.target || '')} · Attempts: ${Number(question.attempts) || 0} · Relevance: ${experimentalEscapeHTML(question.relevance || 'active_scene')}</div>
            ${question.evidence ? `<div style="font-size:.68rem; color:var(--text-3); margin-top:4px;">Evidence: ${experimentalEscapeHTML(question.evidence.slice(0, 600))}</div>` : ''}
            ${question.priority === 'high' ? `<button class="tool-btn sidecar-question-repair" data-question-id="${experimentalEscapeHTML(question.id)}" style="margin-top:6px;">Run narrow repair</button>` : ''}
        </details>`).join('');
    const memoryJobs = (protocol?.jobs || []).filter(job => ['queued', 'dependency_waiting', 'running', 'blocked'].includes(job.status)).slice(-20);
    const memoryJobCards = memoryJobs.length ? `<details style="margin:0 0 8px; padding:7px 9px; border:1px solid var(--border); border-radius:7px; background:rgba(108,92,231,.06);"><summary style="cursor:pointer; font-size:.72rem; color:var(--accent);">Memory pipeline · ${memoryJobs.length} pending or reviewable job${memoryJobs.length === 1 ? '' : 's'}</summary><div style="display:grid; gap:5px; margin-top:7px;">${memoryJobs.map(job => `<div style="font-size:.72rem; color:var(--text-2);"><b>${experimentalEscapeHTML(String(job.type || '').replace(/_/g, ' '))}</b> · ${experimentalEscapeHTML(job.status || '')}${job.characterId ? ` · ${experimentalEscapeHTML(job.characterId)}` : ''}${job.episodeId ? ` · episode ${experimentalEscapeHTML(job.episodeId)}` : ''}${job.diagnostics?.at(-1)?.error ? `<br><span style="color:var(--warning);">${experimentalEscapeHTML(job.diagnostics.at(-1).error)}</span>` : ''}</div>`).join('')}</div></details>` : '';
    const proposalCards = (protocol?.backgroundProposals || []).filter(proposal => ['pending_sidecar_review', 'author_approved', 'sidecar_reviewed'].includes(proposal.status)).slice(-12).map(proposal => `
        <div style="margin:0 0 9px; padding:9px; border-radius:7px; background:rgba(255,180,70,.08); border:1px solid var(--border);">
            <div style="font-size:.66rem; color:var(--warning); font-weight:800; text-transform:uppercase; margin-bottom:3px;">World Agent proposal · ${experimentalEscapeHTML(proposal.status === 'author_approved' ? 'approved for Sidecar review' : proposal.status === 'sidecar_reviewed' ? `Sidecar reviewed · ${proposal.reviewOutcome || 'no automatic commit'}` : 'awaiting review')}</div>
            <div style="font-size:.8rem; color:var(--text-2); white-space:pre-wrap;">${experimentalEscapeHTML((proposal.summary || []).join('\n') || 'No readable proposal summary.')}</div>
            <div style="display:flex; gap:6px; margin-top:7px; flex-wrap:wrap;">${proposal.status === 'pending_sidecar_review' ? `<button class="tool-btn sidecar-proposal-approve" data-proposal-id="${experimentalEscapeHTML(proposal.id)}">Approve for Sidecar</button>` : ''}${proposal.status !== 'sidecar_reviewed' ? `<button class="tool-btn sidecar-proposal-revise" data-proposal-id="${experimentalEscapeHTML(proposal.id)}">Refine proposal</button><button class="tool-btn tool-btn-danger sidecar-proposal-dismiss" data-proposal-id="${experimentalEscapeHTML(proposal.id)}">Dismiss</button>` : ''}</div>
        </div>`).join('');
    log.innerHTML = questionCards + memoryJobCards + proposalCards + entries.map(entry => {
        const author = entry.role === 'user';
        return `<div style="margin:0 0 9px; padding:8px 9px; border-radius:7px; background:${author ? 'var(--surface)' : 'rgba(108, 92, 231, 0.12)'}; border-left:3px solid ${author ? 'var(--accent)' : '#6c5ce7'};">
            <div style="font-size:0.66rem; color:var(--text-3); font-weight:800; text-transform:uppercase; margin-bottom:3px;">${author ? 'Author → Sidecar' : 'Sidecar'}</div>
            <div style="font-size:0.82rem; color:var(--text-2);">${parseHordeMarkdown(String(entry.text || ''))}</div>
        </div>`;
    }).join('') || '<div style="color:var(--text-3); font-size:0.8rem;">Ask Sidecar about the current world, open continuity questions, or an explicit authorial refinement.</div>';
    log.querySelectorAll('.sidecar-proposal-approve').forEach(button => button.onclick = async () => {
        const proposal = protocol.backgroundProposals.find(item => item.id === button.dataset.proposalId);
        if (!proposal) return;
        proposal.status = 'author_approved'; proposal.reviewedAt = new Date().toISOString(); proposal.reviewProvenance = 'direct_user_refinement';
        protocol.packet = buildSidecarScenePacket(world, sess); await ExperimentalWorldsHost.persist(); renderSidecarConversation(world, sess);
    });
    log.querySelectorAll('.sidecar-proposal-dismiss').forEach(button => button.onclick = async () => {
        const proposal = protocol.backgroundProposals.find(item => item.id === button.dataset.proposalId);
        if (!proposal) return;
        proposal.status = 'dismissed'; proposal.reviewedAt = new Date().toISOString(); proposal.reviewProvenance = 'direct_user_refinement';
        protocol.packet = buildSidecarScenePacket(world, sess); await ExperimentalWorldsHost.persist(); renderSidecarConversation(world, sess);
    });
    log.querySelectorAll('.sidecar-proposal-revise').forEach(button => button.onclick = async () => {
        const proposal = protocol.backgroundProposals.find(item => item.id === button.dataset.proposalId);
        if (!proposal) return;
        const guidance = prompt('How should Sidecar refine this World Agent proposal? It will remain a proposal until reviewed.', 'Make the proposal more relevant to the current scene and remove anything unsupported.') || '';
        if (!guidance.trim()) return;
        button.disabled = true;
        try {
            const revised = await reviseWorldAgentProposal(world, sess, proposal, guidance);
            if (revised) ExperimentalWorldsHost.notify('World Agent proposal revised for Sidecar review.', 'success');
        } catch (error) {
            ExperimentalWorldsHost.notify(`Proposal revision failed: ${error.message || error}`, 'error');
        } finally {
            renderSidecarConversation(world, sess);
        }
    });
    log.querySelectorAll('.sidecar-question-repair').forEach(button => button.onclick = async () => {
        button.disabled = true;
        try { await runSidecarQuestionRepair(world, sess, button.dataset.questionId); ExperimentalWorldsHost.notify('Question repair recorded.', 'success'); }
        catch (error) { ExperimentalWorldsHost.notify(`Question repair failed: ${error.message || error}`, 'error'); }
        finally { renderSidecarConversation(world, sess); }
    });
    log.scrollTop = log.scrollHeight;
}

// The old V3 toolbar survived the 17.0 UI migration without its panel
// controller.  Keep its familiar controls, but make them a thin, observable
// view over the active Sidecar timeline instead of reviving the old parallel
// V3 world-state system.
function closeWorldSidecarInspector() {
    document.getElementById('world-sidecar-inspector-overlay')?.remove();
}

function sidecarInspectorJson(value, fallback = 'Nothing has been recorded yet.') {
    if (value == null) return `<div class="form-hint">${experimentalEscapeHTML(fallback)}</div>`;
    return `<pre style="white-space:pre-wrap; overflow-wrap:anywhere; max-height:48vh; overflow:auto; margin:0; padding:10px; border:1px solid var(--border); border-radius:8px; background:var(--bg); color:var(--text-2); font-size:.74rem;">${experimentalEscapeHTML(JSON.stringify(value, null, 2))}</pre>`;
}

function openWorldSidecarLine(workspace = {}) {
    const world = ExperimentalWorldsState.worlds.find(item => item.id === ExperimentalWorldsState.activeWorldId);
    const sess = getCurrentWorldSession();
    if (!world || !sess) return;
    if (window.ExperimentalWorldsSidecarHooks?.isSidecarWorld?.(world, sess) !== true) return openWorldSidecarInspector('migration');
    const protocol = window.ExperimentalWorldsSidecarHooks.normalizeWorldTimeline(world, sess);
    protocol.workspace = {
        kind: ['sequence_planning', 'context_refresh', 'sequence_closure'].includes(workspace.kind) ? workspace.kind : 'world_gm',
        title: String(workspace.title || 'World GM').slice(0, 160),
        guidance: String(workspace.guidance || '').slice(0, 3000),
        openedAt: new Date().toISOString(),
        provenance: { source: 'direct_user_refinement' }
    };
    const input = document.getElementById('world-user-input');
    protocol.inputMode = 'sidecar';
    if (input) {
        input.placeholder = workspace.placeholder || 'Ask Sidecar about continuity, questions, or a refinement…';
        input.value = workspace.draft || '';
        input.focus();
    }
    protocol.packet = buildSidecarScenePacket(world, sess);
    ExperimentalWorldsHost.persist().catch(() => {});
    renderSidecarConversation(world, sess);
}

function updateSidecarReaderCandidate(world, sess, candidateId, action, canonicalId = '') {
    const protocol = protocolForSidecarTimeline(world, sess);
    const candidate = protocol?.readerCandidates?.find(item => item.candidateId === candidateId);
    if (!protocol || !candidate) return null;
    // The ScenePulse surface may ask for review, but it is not a mutation
    // authority.  A candidate stays scene-only until an explicit World GM /
    // native reconciliation decision carries this source-pinned intent.
    return {
        kind: 'scene_candidate_review_intent', action: ['promote', 'match', 'leave', 'ignore'].includes(action) ? action : 'review',
        candidateId: String(candidate.candidateId), candidateType: String(candidate.candidateType || ''),
        canonicalId: String(canonicalId || '').slice(0, 180),
        sourceTurnIds: experimentalSafeJsonClone(candidate.sourceTurnIds || []), readerSnapshotId: String(candidate.readerSnapshotId || ''),
        expectedSceneId: String(candidate.sceneId || protocol.activeSceneId || ''),
        expectedCanonicalRevision: sidecarCanonicalCheckpointFingerprint(world, sess),
        evidence: experimentalSafeJsonClone(candidate.evidence || candidate.description || '')
    };
}

function sidecarSceneProjectionMarkup(world, sess) {
    const protocol = protocolForSidecarTimeline(world, sess);
    const packet = protocol?.packet || buildSidecarScenePacket(world, sess);
    const reader = packet?.reader || packet?.pendingReaderEvidence || {};
    const latestTurn = (protocol?.turns || []).filter(turn => turn.status !== 'superseded').at(-1);
    const failedTurn = latestTurn && ['reconciliation_failed', 'reconciliation_pending'].includes(latestTurn.status) ? latestTurn : null;
    const incompleteCommit = sess?.sidecarIncompleteCommit || null;
    const recoveryMarkup = failedTurn || incompleteCommit ? `<section class="sidecar-scene-recovery"><div><strong>${incompleteCommit ? 'Canonical commit incomplete' : 'Scene update incomplete'}</strong><span>${incompleteCommit ? 'Progression is blocked until the journaled commit is reviewed through World GM/native recovery.' : 'Narration is preserved while downstream interpretation is pending.'}</span></div><div class="sidecar-recovery-actions">${failedTurn && !incompleteCommit ? `<button type="button" class="btn btn-primary sidecar-retry-scene-update" data-sidecar-turn-id="${experimentalEscapeHTML(failedTurn.id)}">Retry Scene Update</button>` : ''}<button type="button" class="btn btn-ghost sidecar-open-world-gm">Open World GM</button></div></section>` : '';
    const candidates = activeReaderCandidates(protocol, { sceneId: packet?.activeScene?.id || protocol?.activeSceneId || '' }).slice(-120);
    const presence = reader.presence || {};
    const relationships = Array.isArray(reader.relationshipProposals) ? reader.relationshipProposals.slice(-20) : [];
    const list = (values, empty = 'None recorded.') => Array.isArray(values) && values.length ? values.map(value => {
        const entry = experimentalIsPlainObject(value) ? value : { id: value };
        const label = entry.name || entry.label || entry.id || 'Unnamed';
        return `<li><strong>${experimentalEscapeHTML(String(label))}</strong>${entry.reason ? ` <span class="form-hint">${experimentalEscapeHTML(String(entry.reason))}</span>` : ''}</li>`;
    }).join('') : `<li class="form-hint">${experimentalEscapeHTML(empty)}</li>`;
    const relationshipMarkup = relationships.length ? relationships.map(item => {
        const entry = experimentalIsPlainObject(item) ? item : { summary: item };
        const label = entry.label || entry.subject || entry.target || entry.relationship || 'Relationship proposal';
        const evidence = entry.evidence || entry.reason || entry.summary || '';
        const posture = entry.posture || entry.axis || entry.change || entry.delta || '';
        return `<div class="sp-relationship-card sidecar-relationship-card"><div class="sp-relationship-header"><strong>${experimentalEscapeHTML(String(label))}</strong>${posture ? `<span class="sp-relationship-meter">${experimentalEscapeHTML(String(posture))}</span>` : ''}</div><div class="sp-relationship-evidence">${experimentalEscapeHTML(String(evidence))}</div><small>Reader proposal · Sidecar review required</small></div>`;
    }).join('') : `<div class="form-hint">No relationship changes proposed for this beat.</div>`;
    const candidateMarkup = candidates.length ? candidates.map(candidate => {
        const label = candidate.label || candidate.role || candidate.candidateType || 'Scene candidate';
        const detail = candidate.description || candidate.clothingDescription || candidate.visibleCondition || candidate.evidence || '';
        const status = candidate.status && !['active', 'proposed'].includes(candidate.status) ? ` · ${candidate.status}` : '';
        return `<article class="sp-candidate-card sidecar-candidate-card"><header><strong>${experimentalEscapeHTML(String(label))}</strong><span>${experimentalEscapeHTML(String(candidate.candidateType || 'candidate'))}${experimentalEscapeHTML(status)}</span></header><p>${experimentalEscapeHTML(String(detail).slice(0, 700) || 'No additional evidence recorded.')}</p><small>${candidate.canonicalMatchId ? `Matched canonical ID: ${experimentalEscapeHTML(candidate.canonicalMatchId)}` : 'Pre-canonical evidence · review required'}</small><div class="sidecar-candidate-actions"><button type="button" class="btn btn-ghost sidecar-candidate-match" data-candidate-id="${experimentalEscapeHTML(String(candidate.candidateId || ''))}">Review match</button><button type="button" class="btn btn-ghost sidecar-candidate-promote" data-candidate-id="${experimentalEscapeHTML(String(candidate.candidateId || ''))}">Review promotion</button><button type="button" class="btn btn-ghost sidecar-candidate-leave" data-candidate-id="${experimentalEscapeHTML(String(candidate.candidateId || ''))}">Leave ephemeral</button></div></article>`;
    }).join('') : `<div class="form-hint">No pre-canonical scene candidates recorded.</div>`;
    return `<div class="sidecar-scene-inspector"><div class="sp-toolbar sidecar-scene-toolbar"><span class="sp-brand-title"><span class="sp-brand-accent">SCENE</span> intelligence</span><span class="sp-toolbar-spacer"></span><span class="sidecar-status-pill ${failedTurn || incompleteCommit ? 'is-warning' : 'is-ready'}">${incompleteCommit ? 'Commit blocked' : failedTurn ? 'Update incomplete' : 'Reader current'}</span><button type="button" class="sp-toolbar-btn sidecar-scene-refresh" title="Refresh the current Scene Intelligence projection">↻</button></div>${recoveryMarkup}<div class="sidecar-scene-grid"><section class="sp-section sidecar-scene-card"><h3>Current scene</h3><div><strong>Location</strong><div>${experimentalEscapeHTML(packet?.activeLocation?.name || 'Unknown')}</div></div><div><strong>World time</strong><div>${experimentalEscapeHTML(packet?.worldTime || 'Unknown')}</div></div><div><strong>Scene state</strong><div>${experimentalEscapeHTML(packet?.sceneState || 'No scene projection yet.')}</div></div></section><section class="sp-section sidecar-scene-card"><h3>Scene reading</h3><div class="sidecar-scene-reading">${experimentalEscapeHTML(reader.summary || packet?.sceneReading || 'No reader summary yet.')}</div>${reader.scene ? `<div class="form-hint">${experimentalEscapeHTML([reader.scene.topic, reader.scene.mood, reader.scene.tension, reader.scene.interactionStyle].filter(Boolean).join(' · ') || 'No additional scene signals.')}</div>` : ''}</section></div><div class="sidecar-scene-columns"><section class="sp-section sidecar-scene-card"><h3>Cast</h3><h4>Active</h4><ul>${list(presence.active || packet?.activeCast)}</ul><h4>Nearby</h4><ul>${list(presence.nearby || packet?.nearbyCast)}</ul><h4>Audible</h4><ul>${list(presence.audible)}</ul><h4>Mentioned</h4><ul>${list(presence.mentioned)}</ul></section><section class="sp-section sidecar-scene-card"><h3>Scene entities</h3>${candidateMarkup}</section></div><section class="sp-section sidecar-scene-card"><h3>Relationships</h3><div class="sidecar-relationship-list">${relationshipMarkup}</div></section><section class="sp-section sidecar-scene-card"><h3>Current pressures</h3><ul>${list(packet?.pendingQuestions, 'No open scene questions.')}</ul></section></div>`;
}

// Human-facing Scene Intelligence render model.  This deliberately does not
// use buildSidecarScenePacket as its completeness boundary: the packet is a
// relevance-filtered narrator viewport, while this workspace is an inspection
// surface over the committed timeline, Reader projection and canonical world.
function buildSidecarWorkspaceModel(world, sess, options = {}) {
    const protocol = protocolForSidecarTimeline(world, sess);
    if (!protocol) return null;
    const hierarchy = window.ExperimentalWorldsSidecarTimeline?.ensureHierarchy(protocol, sess, { createWhenMissing: false }) || {};
    const rawUi = experimentalIsPlainObject(protocol.workspaceUi) ? protocol.workspaceUi : {};
    const workspaceUi = {
        view: ['scene', 'relationships', 'characters', 'history', 'thoughts', 'all-known'].includes(options.view || rawUi.view) ? (options.view || rawUi.view) : 'scene',
        open: experimentalIsPlainObject(rawUi.open) ? experimentalSafeJsonClone(rawUi.open) : {},
        selectedSnapshotId: String(options.snapshotId || rawUi.selectedSnapshotId || ''),
        historyMode: options.snapshotId ? true : rawUi.historyMode === true
    };
    const snapshots = (protocol.readerSnapshots || []).filter(snapshot => ['active', 'accepted_historical'].includes(snapshot.status) && snapshot.settlementStatus === 'settled')
        .sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || ''))).slice(-80);
    const activeSnapshot = snapshots.filter(snapshot => snapshot.status === 'active').at(-1) || null;
    const selectedSnapshot = workspaceUi.historyMode && workspaceUi.selectedSnapshotId
        ? snapshots.find(snapshot => snapshot.id === workspaceUi.selectedSnapshotId) || activeSnapshot
        : activeSnapshot;
    const selectedTurn = (protocol.turns || []).find(turn => turn.id === selectedSnapshot?.turnId) || null;
    const projectionRecord = (protocol.sceneProjections || []).find(item => item.snapshotId === selectedSnapshot?.id)
        || (selectedSnapshot ? buildSidecarSceneProjection(world, sess, protocol, { snapshotId: selectedSnapshot.id, turn: selectedTurn }) : null);
    const projection = projectionRecord ? experimentalSafeJsonClone(projectionRecord) : null;
    const frame = selectedTurn?.postFrame || buildWorldSceneFrame(world, sess) || {};
    const clock = getWorldTimeData(world, sess);
    const latestTurn = currentSidecarAuthoredTurn(protocol, sess);
    // Recovery is a property of the newest authored beat, not an old
    // historical failure.  Surfacing an earlier failure as current blocks a
    // healthy scene and makes Retry look like a reroll of the wrong Take.
    const failedTurn = latestTurn && sidecarTurnNeedsDownstreamRecovery(latestTurn) ? latestTurn : null;
    const incompleteCommit = sess?.sidecarIncompleteCommit || sess?.sidecarDerivedSettlementIncomplete || null;
    const people = projection?.people || [];
    const cast = ['active', 'nearby', 'audible', 'remote', 'mentioned', 'absent'].reduce((result, mode) => {
        result[mode] = people.filter(person => person.mode === mode); return result;
    }, {});
    // Keep canonical records, current scene posture, and Reader proposals
    // visibly distinct.  The workspace may visualise all three together, but
    // a provisional relationship reading must never masquerade as a durable
    // reciprocal relationship record.
    const relevantSubjectIds = new Set(people.map(person => String(person.entityId || person.id || '')).filter(Boolean));
    const canonicalRelationships = Object.entries(projection?.canonicalRelationships || {}).filter(([id, value]) => {
        const record = experimentalIsPlainObject(value) ? value : {};
        const endpoints = [
            ...String(id || '').split('|').map(String),
            record.sourceNpcId, record.source_npc_id, record.sourceEntityId, record.source_entity_id,
            record.targetNpcId, record.target_npc_id, record.targetEntityId, record.target_entity_id
        ].map(value => String(value || '').trim()).filter(Boolean);
        // ScenePulse's relationship view is about the people in this beat.
        // A player-only partial snapshot must not pull the entire world
        // relationship registry into the panel just because every relation
        // happens to contain the player endpoint.
        const uniqueEndpoints = [...new Set(endpoints)];
        return uniqueEndpoints.length >= 2 && uniqueEndpoints.every(endpoint => relevantSubjectIds.has(endpoint));
    }).map(([id, value]) => {
        const record = experimentalIsPlainObject(value) ? value : {};
        const participants = String(id || '').split('|').map(part => sidecarProjectionDisplayName(world, sess, hierarchy, part)).filter(Boolean);
        return {
            id: `canonical:${id}`, source: 'canonical', proposal: false,
            label: record.label || record.name || record.otherName || participants.join(' ↔ ') || id,
            posture: record.posture || record.status || record.affinity || record.trust || '',
            evidence: record.evidence || record.summary || record.notes || 'Canonical relationship record.',
            raw: experimentalSafeJsonClone(value)
        };
    });
    const sceneRelationships = (projection?.relationships || []).map((record, index) => ({
        id: String(record?.id || record?.relationshipId || `scene:${selectedSnapshot?.id || 'current'}:${index}`),
        source: 'scene_reader', proposal: false,
        label: record?.label || [record?.subjectName || record?.subject, record?.targetName || record?.target].filter(Boolean).join(' → ') || 'Scene relationship posture',
        posture: record?.posture || record?.change || record?.axis || '',
        evidence: record?.evidence || record?.reason || record?.summary || 'Reader-derived scene posture; not a durable relationship mutation.',
        raw: experimentalSafeJsonClone(record)
    }));
    const relationshipProposals = (selectedSnapshot?.envelope?.relationshipProposals || []).map((record, index) => ({
        id: String(record?.id || record?.proposalId || `proposal:${selectedSnapshot?.id || 'current'}:${index}`),
        source: 'reader_proposal', proposal: true,
        label: record?.label || [record?.subjectName || record?.subject, record?.targetName || record?.target].filter(Boolean).join(' → ') || 'Relationship proposal',
        posture: record?.posture || record?.change || '',
        evidence: record?.evidence || record?.reason || record?.summary || 'Reader proposal awaiting Sidecar review.',
        raw: experimentalSafeJsonClone(record)
    }));
    const relationships = [...canonicalRelationships, ...sceneRelationships, ...relationshipProposals];
    const candidates = experimentalSafeJsonClone(projection?.candidateStructures || []);
    const memory = protocol.memoryGraph || {};
    const openQuestions = experimentalSafeJsonClone(projection?.questions || (protocol.questions || []).filter(question => ['open', 'deferred'].includes(question.status)).slice(-24));
    const knownCharacters = [
        ...(world.entities || []).filter(entity => ['npc', 'character', 'person'].includes(String(entity?.type || '').toLowerCase())).map(entity => ({ id: entity.id, name: entity.name || entity.id, canonical: true, entity })),
        ...candidates.filter(candidate => String(candidate.candidateType || '').toLowerCase() === 'character').map(candidate => ({ id: candidate.candidateId, name: candidate.label || candidate.role || 'Scene character', canonical: false, candidate }))
    ].filter((entry, index, all) => all.findIndex(other => String(other.id) === String(entry.id)) === index);
    const readerEnabled = world?.sidecarConfig?.tracker?.readerEnabled !== false;
    const reader = selectedSnapshot?.envelope || null;
    const historical = workspaceUi.historyMode && !!selectedSnapshot && selectedSnapshot.status !== 'active';
    const snapshotMatchesLatestTurn = !!activeSnapshot && !!latestTurn
        && String(activeSnapshot.turnId || '') === String(latestTurn.id || '')
        && (!latestTurn.takeId || !activeSnapshot.takeId || String(activeSnapshot.takeId) === String(latestTurn.takeId));
    const legacyReader = !!reader && Number(reader.schemaVersion || 0) < 2;
    const coverageReferences = reader?.canonicalReferences || buildSidecarCanonicalReferenceManifest(world, sess, `${latestTurn?.playerInput || ''}\n${latestTurn?.narration || ''}\n${latestTurn?.handoff || ''}`);
    const requiredCharacterSubjects = Array.isArray(reader?.requiredCharacterSubjects) && reader.requiredCharacterSubjects.length
        ? reader.requiredCharacterSubjects
        : sidecarReaderRequiredSubjects(coverageReferences, {
            playerInput: latestTurn?.playerInput || '', narration: latestTurn?.narration || '', handoff: latestTurn?.handoff || '',
            controlledEntityId: hierarchy?.sequence?.controlledEntityId || sess?.controlledEntityId || 'player'
        });
    const readerCoverage = reader
        ? validateSidecarReaderCoverage(reader, requiredCharacterSubjects, reader?.metadata?.finishReason || '')
        : { valid: false, error: 'reader_not_available', missing: requiredCharacterSubjects.map(subject => subject.id) };
    // A snapshot may be perfectly valid as historical evidence yet be unsafe
    // to present as the latest scene: this happens after an old sparse Reader
    // run, an interrupted upgrade, or a committed beat that never received a
    // matching Reader result. Keep it visible as *last settled* evidence, but
    // never blend it with the new narration and call it current.
    const readerStale = !historical && readerEnabled && !!reader && (!snapshotMatchesLatestTurn || legacyReader || !readerCoverage.valid);
    const readerFresh = !!reader && (historical || (!readerStale && snapshotMatchesLatestTurn));
    const pendingReaderRefresh = !historical
        ? (protocol.readerRefreshes || []).filter(refresh => refresh.status === 'review'
            && String(refresh.sourceTurnId || '') === String(latestTurn?.id || '')).at(-1) || null
        : null;
    const worldTime = projection?.temporal?.end_clock || projection?.temporal?.time || `${clock.hours24 % 12 || 12}:${String(clock.mins).padStart(2, '0')} ${clock.hours24 >= 12 ? 'PM' : 'AM'}`;
    return {
        protocol, hierarchy, frame, clock, reader, activeSnapshot, selectedSnapshot, selectedTurn, projection, latestTurn, failedTurn, incompleteCommit,
        cast, candidates, relationships, activeCharacters: people, knownCharacters, snapshots, openQuestions, memory, workspaceUi, readerEnabled, historical,
        location: experimentalSafeJsonClone(projection?.location || { name: frame?.location_name || frame?.locationName || 'Unknown location', localSpace: '' }),
        readerFresh, readerStale, legacyReader, readerCoverage, requiredCharacterSubjects, snapshotMatchesLatestTurn, pendingReaderRefresh,
        status: incompleteCommit ? 'blocked' : failedTurn ? 'warning' : !readerEnabled ? 'muted' : readerStale ? 'stale' : (reader ? 'ready' : 'pending'), worldTime
    };
}

function packetCastFallback(protocol, sess, mode) {
    const packet = protocol?.packet || {};
    if (mode === 'active') return Array.isArray(packet.activeCast) ? packet.activeCast : [];
    if (mode === 'nearby') return Array.isArray(packet.nearbyCast) ? packet.nearbyCast : [];
    return [];
}

function sidecarWorkspaceAvatar(name) {
    return experimentalEscapeHTML(String(name || '?').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || '?');
}

// ScenePulse uses a tiny inline graph rather than a numeric wall of text for
// relationship history.  Keep the renderer dependency-free and feed it only
// committed Reader snapshots/canonical relationship evidence.
function sidecarWorkspaceSparkline(model, entry) {
    const id = String(entry?.id || '').toLowerCase();
    const values = (model.snapshots || []).slice().reverse().map(snapshot => {
        const proposals = snapshot?.envelope?.relationshipProposals || snapshot?.envelope?.relationships || [];
        const hit = (Array.isArray(proposals) ? proposals : []).find(item => String(item?.id || item?.characterId || item?.subject || '').toLowerCase() === id);
        // A ScenePulse sparkline is evidence history, never a decoration.
        // Do not turn the latest posture into synthetic prior samples.
        const raw = hit?.affinity ?? hit?.trust ?? hit?.value ?? hit?.delta ?? hit?.change;
        const numeric = Number(raw);
        return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric < 0 ? 50 + numeric / 2 : numeric)) : null;
    }).filter(value => value != null);
    if (values.length < 2) return '<svg class="sp-sparkline si-sparkline" viewBox="0 0 90 24" aria-label="No relationship history yet"><path d="M2 20 H88" class="si-sparkline-empty"/></svg>';
    const points = values.map((value, index) => `${2 + index * (86 / Math.max(values.length - 1, 1))},${22 - (value / 100) * 18}`).join(' ');
    return `<svg class="sp-sparkline si-sparkline" viewBox="0 0 90 24" aria-label="Relationship trend"><path d="M2 22 H88" class="si-sparkline-axis"/><polyline points="${points}" class="si-sparkline-line"/><circle cx="${2 + (values.length - 1) * (86 / Math.max(values.length - 1, 1))}" cy="${22 - (values.at(-1) / 100) * 18}" r="2.2" class="si-sparkline-dot"/></svg>`;
}

function sidecarWorkspaceSceneSignals(model) {
    const scene = model.reader?.scene || {};
    const entries = [
        ['Topic', scene.topic], ['Mood', scene.mood || scene.moodAtmosphere],
        ['Tension', scene.tension], ['Interaction', scene.interactionStyle],
        ['Sound', scene.sound || scene.environment || scene.soundEnvironment]
    ].filter(([, value]) => value);
    return entries;
}

function sidecarWorkspaceDimensions(model) {
    const temporal = model.projection?.temporal || model.reader?.temporal || {};
    const environment = model.projection?.environment || model.reader?.environment || {};
    const location = model.location || {};
    const parent = Array.isArray(location.parentLocations) && location.parentLocations.length
        ? location.parentLocations.map(item => item.name || item.id).filter(Boolean).join(' › ') : '';
    return [
        ['Time', model.worldTime || temporal.time || temporal.end_clock],
        ['Date', temporal.date || temporal.calendarDate],
        ['Day', temporal.day || temporal.dayOfWeek],
        ['Location', location.name],
        ['Local space', location.localSpace || location.authoredDescription],
        ['Wider place', parent],
        ['Weather', environment.weather || temporal.weather],
        ['Environment', environment.description || environment.setting || model.reader?.scene?.environment],
        ['Lighting', environment.lighting],
        ['Sound', environment.sound || model.reader?.scene?.sound]
    ].filter(([, value]) => String(value || '').trim());
}

function sidecarWorkspaceList(items, empty, fields = ['text', 'summary', 'description', 'label', 'name', 'evidence']) {
    const values = Array.isArray(items) ? items : [];
    if (!values.length) return `<div class="si-empty-inline">${experimentalEscapeHTML(empty)}</div>`;
    const textOf = item => {
        if (!experimentalIsPlainObject(item)) return String(item || '');
        for (const field of fields) if (item[field]) return String(item[field]);
        return Object.values(item).find(value => typeof value === 'string') || '';
    };
    return `<ul class="si-evidence-list">${values.slice(0, 12).map(item => `<li>${experimentalEscapeHTML(textOf(item).slice(0, 520))}</li>`).join('')}</ul>`;
}

function sidecarWorkspaceCharacterCard(entry, model) {
    const mode = String(entry.mode || 'mentioned');
    const accent = mode === 'active' ? '#4db8a4' : mode === 'nearby' ? '#7c7cff' : mode === 'audible' ? '#d4a855' : '#738095';
    const claim = value => sidecarProjectionClaimText(value);
    const nowRows = [
        ['Presence', mode],
        entry.position?.localSpace || entry.localSpace ? ['Position', entry.position?.localSpace || entry.localSpace] : null,
        entry.activity ? ['Doing', entry.activity] : null,
        claim(entry.attentionFocus) ? ['Focus', claim(entry.attentionFocus)] : null,
        claim(entry.emotionalPosture) ? ['Posture', claim(entry.emotionalPosture)] : null
    ].filter(Boolean);
    const interpretationRows = [
        claim(entry.apparentUnderstanding) ? ['Understands', claim(entry.apparentUnderstanding)] : null,
        claim(entry.noticed) ? ['Noticed', claim(entry.noticed)] : null,
        claim(entry.likelyUnnoticed) ? ['Did not notice', claim(entry.likelyUnnoticed)] : null,
        claim(entry.suspicionOrUncertainty) ? ['Uncertain about', claim(entry.suspicionOrUncertainty)] : null,
        claim(entry.immediateObjectiveOrConcern) ? ['Immediate concern', claim(entry.immediateObjectiveOrConcern)] : null,
        claim(entry.interpersonalPostures) ? ['Towards others', claim(entry.interpersonalPostures)] : null
    ].filter(Boolean);
    const appearanceRows = [
        entry.appearance ? ['Visible state', entry.appearance] : null,
        entry.clothing || entry.outfit ? ['Wearing', entry.clothing || entry.outfit] : null,
        entry.carrying?.length ? ['Carrying', Array.isArray(entry.carrying) ? entry.carrying.join(', ') : entry.carrying] : null
    ].filter(Boolean);
    const thought = claim(entry.sceneLocalImpression);
    const goalRows = [
        entry.immediateNeed || entry.goal ? ['Need', entry.immediateNeed || entry.goal] : null,
        entry.shortTermGoal ? ['Short term', entry.shortTermGoal] : null,
        entry.longTermGoal ? ['Long term', entry.longTermGoal] : null
    ].filter(Boolean);
    const epistemic = entry.intelligence?.epistemicLabel || entry.intelligence?.epistemicKind || 'Reader-derived, provisional';
    const meta = [mode, entry.channel, entry.reason].filter(Boolean).join(' · ') || 'Scene-relevant character';
    return `<article class="sp-char-card si-character-card ${mode === 'active' || mode === 'remote' ? 'sp-card-open' : ''}" style="--char-accent:${accent};--char-border:${accent};" data-si-character="${experimentalEscapeHTML(entry.id)}">
        <header class="sp-char-header" data-si-toggle="character">
            <span class="sp-char-chevron">›</span><span class="sp-char-portrait"><span class="sp-char-portrait-monogram">${sidecarWorkspaceAvatar(entry.name)}</span></span>
            <span class="sp-char-name-col"><span class="sp-char-name-row"><strong class="sp-char-name">${experimentalEscapeHTML(entry.name)}</strong><span class="sp-char-archetype sp-char-archetype-${mode === 'active' ? 'ally' : 'background'}">${experimentalEscapeHTML(mode)}</span></span><span class="sp-char-meta">${experimentalEscapeHTML(meta.slice(0, 160))}</span></span>
            <span class="sp-char-header-spacer"></span>
        </header>
        <div class="sp-char-body"><div class="sp-char-subsection-label"><span class="sp-char-subsection-text">Right now</span></div><div class="sp-char-grid">${nowRows.map(([label, value]) => `<span class="sp-char-field">${experimentalEscapeHTML(label)}</span><span class="sp-char-val">${experimentalEscapeHTML(String(value))}</span>`).join('')}</div>${appearanceRows.length ? `<div class="sp-char-subsection-label"><span class="sp-char-subsection-text">Visible state</span></div><div class="sp-char-grid">${appearanceRows.map(([label, value]) => `<span class="sp-char-field">${experimentalEscapeHTML(label)}</span><span class="sp-char-val">${experimentalEscapeHTML(String(value))}</span>`).join('')}</div>` : ''}${interpretationRows.length || thought ? `<div class="sp-char-subsection-label si-provisional-label"><span class="sp-char-subsection-text">Private scene reading</span><small>${experimentalEscapeHTML(epistemic)}</small></div>${thought ? `<blockquote class="sp-char-thought-block">“${experimentalEscapeHTML(thought)}”</blockquote>` : ''}<div class="sp-char-grid">${interpretationRows.map(([label, value]) => `<span class="sp-char-field">${experimentalEscapeHTML(label)}</span><span class="sp-char-val">${experimentalEscapeHTML(String(value))}</span>`).join('')}</div>` : `<div class="sp-char-empty">No private-state inference was warranted for this character in this beat.</div>`}${goalRows.length ? `<div class="sp-char-goals">${goalRows.map(([label, value]) => `<div class="sp-char-goal-item"><strong>${experimentalEscapeHTML(label)}:</strong> ${experimentalEscapeHTML(String(value))}</div>`).join('')}</div>` : ''}</div>
    </article>`;
}

function sidecarWorkspaceHistoryTimeline(model) {
    const snapshots = model.snapshots || [];
    if (!snapshots.length) return '<div class="sp-empty-state si-empty-state"><div class="sp-empty-icon">◌</div><strong class="sp-empty-title">No settled Reader history</strong><span class="sp-empty-sub">Accepted Narrator turns appear here after downstream interpretation settles.</span></div>';
    const timeline = snapshots.slice().reverse().map((snapshot, index) => {
        const envelope = snapshot.envelope || {};
        const current = index === 0;
        const scene = envelope.scene || {};
        const title = scene.topic || envelope.summary || 'Scene update';
        const time = envelope.temporal?.meaning || envelope.timeSemantics?.meaning || snapshot.createdAt || '';
        const status = snapshot.status || 'active';
        return `<button type="button" class="sp-history-item si-history-item ${current ? 'is-current' : ''}" data-si-snapshot="${experimentalEscapeHTML(String(snapshot.id || ''))}"><span class="sp-history-marker ${current ? 'is-current' : ''}">${current ? '●' : '○'}</span><span class="sp-history-content"><span class="sp-history-heading"><strong>${experimentalEscapeHTML(String(title).slice(0, 180))}</strong><span class="sp-history-badge ${status === 'active' ? 'is-current' : ''}">${experimentalEscapeHTML(status)}</span></span><span class="sp-history-meta">${experimentalEscapeHTML(String(snapshot.turnId || 'turn'))} · ${experimentalEscapeHTML(String(envelope.snapshotMode || 'delta'))} · ${experimentalEscapeHTML(String(time).slice(0, 180))}</span><span class="si-history-summary">${experimentalEscapeHTML(String(envelope.summary || 'Reader snapshot attached to the accepted turn.').slice(0, 320))}</span></span></button>`;
    }).join('');
    const nodes = snapshots.slice().reverse().map((snapshot, index) => `<span class="sp-tl-node" style="left:${snapshots.length === 1 ? 50 : (index / (snapshots.length - 1)) * 100}%" title="${experimentalEscapeHTML(String(snapshot.turnId || 'turn'))}"><span class="sp-tl-dot ${index === 0 ? 'sp-tl-dot-latest' : ''}"></span><span class="sp-tl-label ${index === 0 ? 'sp-tl-label-active' : ''}">${experimentalEscapeHTML(String(snapshot.turnId || '').slice(-8))}</span></span>`).join('');
    return `<div class="sp-tl-bar si-timeline-bar">${nodes}</div><div class="sp-history-list">${timeline}</div>`;
}

function sidecarWorkspaceThoughts(model) {
    const people = (model.activeCharacters || []).filter(entry => entry.intelligence && [
        entry.emotionalPosture, entry.attentionFocus, entry.apparentUnderstanding, entry.noticed,
        entry.suspicionOrUncertainty, entry.immediateObjectiveOrConcern, entry.sceneLocalImpression
    ].some(value => sidecarProjectionClaimText(value)));
    if (!people.length) return '<div class="sp-empty-state si-empty-state"><div class="sp-empty-icon">◌</div><strong class="sp-empty-title">No character readings yet</strong><span class="sp-empty-sub">Reader-derived thoughts appear only when the authored beat gives a character-specific evidence basis.</span></div>';
    return `<div class="si-thoughts-notice">These are provisional, character-scoped readings. They are not objective world facts or durable memories; settled items become evidence for the separate cognition pipeline.</div><div class="sp-thought-list">${people.map(entry => {
        const thought = sidecarProjectionClaimText(entry.sceneLocalImpression) || sidecarProjectionClaimText(entry.apparentUnderstanding) || sidecarProjectionClaimText(entry.immediateObjectiveOrConcern);
        const posture = sidecarProjectionClaimText(entry.emotionalPosture);
        const attention = sidecarProjectionClaimText(entry.attentionFocus);
        const noticed = sidecarProjectionClaimText(entry.noticed);
        return `<article class="sp-thought-card si-thought-card"><header><span class="sp-thought-avatar">${sidecarWorkspaceAvatar(entry.name)}</span><span><strong>${experimentalEscapeHTML(entry.name)}</strong><small>${experimentalEscapeHTML(entry.mode || 'relevant')} · provisional reading</small></span></header>${thought ? `<blockquote>“${experimentalEscapeHTML(thought)}”</blockquote>` : ''}${[posture && ['Emotional posture', posture], attention && ['Attention', attention], noticed && ['Noticed', noticed]].filter(Boolean).map(([label, value]) => `<div class="sp-row si-intelligence-row"><span class="sp-row-label">${experimentalEscapeHTML(label)}</span><span class="sp-row-value">${experimentalEscapeHTML(value)}</span></div>`).join('')}</article>`;
    }).join('')}</div>`;
}

function sidecarWorkspaceKnownCharacters(model) {
    const relevantIds = new Set((model.activeCharacters || []).map(entry => String(entry.entityId || entry.id || '')));
    const known = (model.knownCharacters || []).filter(entry => !relevantIds.has(String(entry.id || '')));
    if (!known.length) return '<div class="sp-empty-state si-empty-state"><div class="sp-empty-icon">♙</div><strong class="sp-empty-title">No other known characters</strong><span class="sp-empty-sub">Characters with current scene relevance are already shown in the scene roster.</span></div>';
    return `<div class="si-known-explainer">This is the canonical registry browser. These characters are not inserted into the current scene merely because they exist in the world.</div><div class="si-known-list">${known.map(entry => `<article class="si-known-character"><span class="sp-char-portrait"><span class="sp-char-portrait-monogram">${sidecarWorkspaceAvatar(entry.name)}</span></span><span><strong>${experimentalEscapeHTML(entry.name)}</strong><small>${entry.canonical ? 'Canonical character · no current scene relevance' : 'Scene candidate'}</small></span></article>`).join('')}</div>`;
}

// ScenePulse's relationship blocks are deliberately a separate renderer: the
// home scene, Relationships browser and future graph all consume the same
// accepted Horde relationship records.  This is presentation only; it never
// supplies a fallback value or invents a history sample.
function sidecarWorkspaceRelationshipMarkup(model) {
    if (!model.relationships.length) return '<div class="sp-empty-state si-empty-state"><div class="sp-empty-icon">◎</div><strong class="sp-empty-title">No relationship records</strong><span class="sp-empty-sub">Relationship posture becomes visible as evidence is committed.</span></div>';
    return `<div class="si-relationship-intro">Committed relationship posture and Reader proposals are shown separately. A proposal remains amber until Sidecar evidence is accepted.</div>${model.relationships.map(entry => {
        const numeric = Number(entry.posture);
        const width = Number.isFinite(numeric) ? Math.min(100, Math.max(8, numeric < 0 ? 50 + numeric / 2 : numeric)) : null;
        const display = entry.posture ?? 'unresolved';
        const meter = width === null
            ? '<div class="sp-meter-row"><span class="sp-meter-label">Posture</span><span class="sp-meter-bar-na"></span><span class="sp-meter-value-na">qualitative</span></div>'
            : `<div class="sp-meter-row"><span class="sp-meter-label">Posture</span><span class="sp-meter-bar-wrap"><span class="sp-meter-bar-track"><span class="sp-meter-bar-fill" style="width:${width}%"></span></span></span><span class="sp-meter-value">${experimentalEscapeHTML(String(display))}</span>${sidecarWorkspaceSparkline(model, entry)}</div>`;
        return `<article class="sp-rel-block si-rel-block ${entry.proposal ? 'is-proposal' : ''}" style="--char-accent:${entry.proposal ? '#d4a855' : '#4db8a4'};--char-border:${entry.proposal ? '#d4a855' : '#4db8a4'}"><header class="sp-rel-header"><span class="sp-rel-chevron">›</span><span class="sp-char-portrait"><span class="sp-char-portrait-monogram">${sidecarWorkspaceAvatar(entry.label)}</span></span><span class="sp-rel-name">${experimentalEscapeHTML(entry.label)}</span><span class="sp-rel-type-badge">${experimentalEscapeHTML(entry.proposal ? 'proposal' : 'canonical')}</span><span class="sp-rel-phase-badge">${experimentalEscapeHTML(String(display))}</span></header><div class="sp-rel-body si-rel-body"><div class="sp-rel-meta"><div class="sp-rel-meta-item"><span class="sp-rel-meta-label">Evidence</span><span>${experimentalEscapeHTML(entry.evidence || (entry.proposal ? 'Reader proposal awaiting Sidecar review.' : 'Canonical relationship state.'))}</span></div></div>${meter}${entry.proposal ? '<div class="si-card-actions"><button type="button" class="btn btn-ghost" data-si-action="relationship:' + experimentalEscapeHTML(entry.id) + '">Review evidence</button></div>' : ''}</div></article>`;
    }).join('')}`;
}

// Pinned verbatim from ScenePulse v6.27.20's TOUR_EXAMPLE_DATA.  This is a
// deliberate development fixture: it is only ever presented after the user
// selects the clearly labelled Demo view, and is never merged into a Horde
// world, timeline, receipt, or Reader snapshot.
const SCENEPULSE_TOUR_EXAMPLE_DATA = Object.freeze({
    time: '14:32:00', date: '03/17/2025 (Monday)', location: 'Main Floor > Cafe Lune', weather: 'Overcast, light rain', temperature: '14°C / 57°F — cool, damp',
    sceneTopic: 'Tense customer interaction during afternoon rush', sceneMood: 'Anxious, simmering conflict', sceneInteraction: 'Strained professionalism breaking down', sceneTension: 'high',
    sceneSummary: 'Three customers entered during the afternoon lull. The lead customer is agitated about a previous order mistake, and the barista is struggling to maintain composure after an exhausting morning shift.',
    soundEnvironment: 'Espresso machine hissing, rain against windows, distant traffic, phone buzzing on counter', charactersPresent: ['Elena Vasquez', 'Marcus Chen', 'Yuki Tanaka'], northStar: 'Build a life worth staying in',
    mainQuests: [
        { name: 'Keep the cafe from going under', urgency: 'high', detail: 'Monthly revenue is 15% below break-even. Need to boost foot traffic or cut costs within 60 days or the lease is gone.' },
        { name: 'Repair the relationship with Mom', urgency: 'moderate', detail: "Haven't spoken in three weeks after the argument about the inheritance. She left a voicemail yesterday but it hasn't been played yet." }
    ],
    sideQuests: [{ name: 'Learn to cook something other than instant ramen', urgency: 'low', detail: "Elena offered to teach a few recipes. Haven't taken her up on it yet." }],
    relationships: [
        { name: 'Elena Vasquez', relType: 'Co-worker', relPhase: 'Friendly', timeTogether: '3 months', milestone: 'Covered my shift when no one else would.', affection: 62, affectionLabel: 'Warm', trust: 55, trustLabel: 'Building', desire: 20, desireLabel: '', stress: 30, stressLabel: 'Manageable', compatibility: 68, compatibilityLabel: 'Natural fit' },
        { name: 'Marcus Chen', relType: 'Customer', relPhase: 'Hostile', timeTogether: '2 months', milestone: 'Filed a formal complaint about a wrong order.', affection: 8, affectionLabel: 'Cold', trust: 12, trustLabel: 'Distrustful', desire: 0, desireLabel: 'N/A', stress: 72, stressLabel: 'High friction', compatibility: 15, compatibilityLabel: 'Oil and water' },
        { name: 'Yuki Tanaka', relType: 'Customer', relPhase: 'Strangers', timeTogether: 'Less than a minute', milestone: 'Walked in during the confrontation.', affection: 0, affectionLabel: '', trust: 0, trustLabel: '', desire: 0, desireLabel: '', stress: 10, stressLabel: '', compatibility: 0, compatibilityLabel: '' }
    ],
    characters: [
        { name: 'Elena Vasquez', role: 'Co-worker, afternoon shift barista', innerThought: "If Marcus starts yelling again I'm stepping in. Last time was too much.", immediateNeed: 'Keep the peace while orders get filled', shortTermGoal: 'Finish the shift without drama', longTermGoal: 'Save enough to go back to school', hair: 'Dark brown, pulled back in a messy bun', face: 'Olive skin, warm brown eyes, slight worry crease between brows', outfit: 'Cafe Lune apron over a grey henley, black jeans, worn Converse; slightly disheveled after the lunch rush', posture: 'Shoulders forward behind the bar, weight shifted to left foot; alert and slightly tense', proximity: 'Behind the counter, 3 feet from the register', notableDetails: 'Small coffee-bean tattoo on inner left wrist', inventory: ['Phone in back pocket', 'Car keys on hook', 'Notebook with drink recipes'], fertStatus: 'N/A', fertNotes: '' },
        { name: 'Marcus Chen', role: 'Regular customer, office worker', innerThought: 'I specifically said no foam. Every single time. Do they even listen?', immediateNeed: 'Get the correct order this time', shortTermGoal: 'Make it back to the office before his 3pm meeting', longTermGoal: 'Make partner at the consulting firm by next year', hair: 'Black, neatly parted, product-styled', face: 'East Asian, clean-shaven, jaw clenched, reading glasses pushed up on forehead', outfit: 'Navy suit jacket over white dress shirt (no tie), charcoal slacks, leather oxfords; neat', posture: 'Upright, arms crossed, leaning slightly forward; impatient and alert', proximity: 'At the register, face-to-face with Elena', notableDetails: 'Wedding ring on left hand; small nick on right jaw from a rushed morning shave', inventory: ['Leather briefcase', 'Phone in hand', 'Wallet'], fertStatus: 'N/A', fertNotes: '' },
        { name: 'Yuki Tanaka', role: 'New customer, freelance photographer', innerThought: "This place has good light. But what's happening at the counter looks intense.", immediateNeed: 'Order a coffee without getting caught in the crossfire', shortTermGoal: 'Scout this neighborhood for her photo series', longTermGoal: 'Get her work into a gallery showing', hair: 'Bleached tips over natural black, shoulder-length, slightly damp from rain', face: 'Round face, curious dark eyes scanning the room, small nose ring', outfit: 'Oversized denim jacket over a band tee, cargo pants, platform boots; casual', posture: 'Standing just inside the doorway, weight back on heels; alert but not tense', proximity: 'Near the entrance, about 8 feet from the counter', notableDetails: 'Camera strap wear on right shoulder', inventory: ['Camera bag (Canon R5)', 'Phone', 'Wallet', 'Folding umbrella'], fertStatus: 'N/A', fertNotes: '' }
    ],
    plotBranches: [
        { type: 'dramatic', name: 'Marcus threatens a review bomb', hook: 'He pulls out his phone and starts typing a one-star review right there at the counter. Elena sees it and her expression hardens.' },
        { type: 'comedic', name: 'The espresso machine finally gives out', hook: 'Mid-confrontation, the overheating machine lets out a dramatic hiss and sprays steam. Everyone freezes. The tension breaks — or doubles.' },
        { type: 'twist', name: 'Yuki recognizes Marcus', hook: "She realizes Marcus is the same person who rejected her photography proposal at his firm last month. She hasn't decided if she should say anything." },
        { type: 'exploratory', name: "Elena's notebook secret", hook: "While reaching for a cup, Elena's notebook falls open. The pages aren't drink recipes — they're detailed sketches of the cafe's customers." },
        { type: 'intense', name: 'The voicemail plays on speaker', hook: "Phone buzzes on the counter — Mom's voicemail starts playing through the speakers. Everyone in the cafe hears the first few words." }
    ]
});

// ScenePulse's own guided tour uses one populated tracker record and a
// twelve-node illustrative timeline.  Keep it completely separate from a
// Horde world: nothing in this object reads, writes, or borrows a Turn,
// character, relationship, quest, or snapshot from the current timeline.
const SCENEPULSE_TOUR_TIMELINE = Object.freeze(Array.from({ length: 12 }, (_, index) => ({
    id: `tour-${15 + index}`, label: `#${15 + index}`, current: index === 11
})));

// Worlds V2 has one explicit ownership policy for the native ScenePulse
// presentation.  This is deliberately code-owned rather than a hidden UI
// preference: a Reader projection may supply these scene-facing families,
// while Horde's entity registry, quest database, and location graph may not
// silently leak into them.  If the Reader has not supplied one, the sealed
// source fixture remains visible as an *Example* fallback until a real
// accepted packet does.
//
// Custom-panel keys are added below from their user-authored schema.  They
// are named field authority, not an "all fields" escape hatch, so a future
// source addition still has to be consciously classified before it can
// replace the source fixture in a live World.
const SCENEPULSE_NATIVE_PRESENTATION_FIELDS = Object.freeze([
    'time', 'date', 'elapsed', 'temporalIntent',
    'location', 'weather', 'temperature', 'soundEnvironment', 'witnesses',
    'sceneTopic', 'sceneMood', 'sceneInteraction', 'sceneTension', 'sceneSummary',
    'charactersPresent', 'characters', 'relationships',
    'northStar', 'mainQuests', 'sideQuests', 'plotBranches'
]);

function scenePulseDeclaredNativeFieldAuthority(uiPreferences = {}) {
    const customKeys = scenePulseEffectiveSourceCustomPanels(uiPreferences)
        .flatMap(panel => Array.isArray(panel?.fields) ? panel.fields : [])
        .map(field => String(field?.key || '').trim())
        .filter(key => /^[A-Za-z][A-Za-z0-9_]{0,100}$/.test(key));
    return [...new Set([...SCENEPULSE_NATIVE_PRESENTATION_FIELDS, ...customKeys])];
}

function sealScenePulseTourFixture(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(sealScenePulseTourFixture);
    return Object.freeze(value);
}

function scenePulseTourState() {
    if (!window.HordeScenePulseTour) {
        window.HordeScenePulseTour = {
            // Gate A's only input.  The integrated ScenePulse module accepts
            // this handoff alone; it cannot see a Horde world, model result,
            // canonical registry, quest store, or timeline until Gate B.
            acceptedHandoff: Object.freeze({
                id: 'scenepulse-tour-example-data-accepted',
                status: 'accepted_fixture',
                source: 'ScenePulse TOUR_EXAMPLE_DATA (v6.27.20)',
                scenePulse: sealScenePulseTourFixture(experimentalSafeJsonClone(SCENEPULSE_TOUR_EXAMPLE_DATA))
            })
        };
    }
    return window.HordeScenePulseTour;
}

// ScenePulse candidates are deliberately scene evidence first.  These helpers
// provide the narrow, explicit bridge into Horde's durable record workflow:
// they never inspect the registry to complete a source card, never make a
// candidate canonical on sight, and keep the stable Reader candidate id all
// the way through review, promotion, and later audit.
function scenePulseCandidatePromotionKind(candidate = {}) {
    const type = String(candidate?.candidateType || '').toLowerCase();
    if (type === 'character') return 'entity';
    if (type === 'location') return 'location';
    return '';
}

function scenePulseCandidateSourceTurnIds(candidate = {}) {
    const evidenceTurnIds = (Array.isArray(candidate?.evidence) ? candidate.evidence : [])
        .map(entry => String(entry?.sourceTurnId || entry?.turnId || '').trim());
    return [...new Set([...(Array.isArray(candidate?.sourceTurnIds) ? candidate.sourceTurnIds : []), ...evidenceTurnIds]
        .map(value => String(value || '').trim()).filter(Boolean))].slice(-30);
}

function scenePulseCandidatePromotionEligibility(protocol, candidate = {}) {
    const kind = scenePulseCandidatePromotionKind(candidate);
    const label = String(candidate?.label || candidate?.name || '').trim();
    if (!kind) return { reviewable: false, ready: false, reason: 'Only scene characters and locations can graduate into Horde records.' };
    if (candidate?.settlementStatus !== 'settled' || candidate?.attemptStatus === 'pending') {
        return { reviewable: false, ready: false, reason: 'This candidate has not reached a settled Reader snapshot.' };
    }
    if (!label) return { reviewable: false, ready: false, reason: 'The Reader did not establish a usable name or label for this candidate.' };
    if (['rejected', 'retired', 'stale', 'superseded'].includes(String(candidate?.status || '').toLowerCase())) {
        return { reviewable: false, ready: false, reason: 'This candidate is no longer active scene evidence.' };
    }
    const sourceTurnIds = scenePulseCandidateSourceTurnIds(candidate);
    const sourceScene = (protocol?.scenes || []).find(scene => String(scene?.id || '') === String(candidate?.sourceSceneId || ''));
    const sceneClosed = sourceScene?.status === 'closed';
    const readerAccepted = String(candidate?.status || '').toLowerCase() === 'accepted';
    const repeated = sourceTurnIds.length >= 2;
    const ready = repeated || sceneClosed || readerAccepted;
    return {
        reviewable: true,
        ready,
        sourceTurnCount: sourceTurnIds.length,
        sceneClosed,
        reason: ready
            ? (repeated ? 'Observed in more than one settled authored turn.' : sceneClosed ? 'Its source scene has closed and is ready for review.' : 'The Reader explicitly marked this candidate accepted.')
            : 'It remains scene evidence until it recurs, its scene closes, or the author explicitly resolves it in World review.'
    };
}

function scenePulseCandidateCanonicalRecord(world, candidate = {}) {
    const kind = scenePulseCandidatePromotionKind(candidate);
    const canonicalId = String(candidate?.canonicalMatchId || '').trim();
    if (!kind || !canonicalId) return null;
    if (kind === 'location') return (world?.locations || []).find(record => String(record?.id || '') === canonicalId) || null;
    const record = (world?.entities || []).find(item => String(item?.id || '') === canonicalId) || null;
    return ['npc', 'character', 'person'].includes(String(record?.type || '').toLowerCase()) ? record : null;
}

function scenePulseCandidateReviewProjection(world, sess, protocol, options = {}) {
    const turnId = String(options?.turnId || '').trim();
    const snapshotId = String(options?.snapshotId || '').trim();
    if (!protocol || (!turnId && !snapshotId)) return [];
    const provisional = [...(protocol.provisionalLocations || []), ...(protocol.provisionalEntities || [])];
    return activeReaderCandidates(protocol).filter(candidate => {
        if (!scenePulseCandidatePromotionKind(candidate)) return false;
        const matchesSnapshot = !!snapshotId && String(candidate.readerSnapshotId || '') === snapshotId;
        const matchesTurn = !!turnId && scenePulseCandidateSourceTurnIds(candidate).includes(turnId);
        return matchesSnapshot || matchesTurn;
    }).map(candidate => {
        const staged = provisional.find(record => String(record?.scenePulseCandidateId || '') === String(candidate.candidateId || '')) || null;
        const canonical = scenePulseCandidateCanonicalRecord(world, candidate)
            || ((staged?.promotedCanonicalId || staged?.resolvedCanonicalId) ? (() => {
                const records = staged.kind === 'location' ? (world?.locations || []) : (world?.entities || []);
                return records.find(record => String(record?.id || '') === String(staged.promotedCanonicalId || staged.resolvedCanonicalId)) || null;
            })() : null);
        const eligibility = scenePulseCandidatePromotionEligibility(protocol, candidate);
        return {
            candidateId: String(candidate.candidateId || ''), candidateType: String(candidate.candidateType || ''),
            label: String(candidate.label || candidate.name || candidate.role || 'Scene candidate').slice(0, 240),
            role: String(candidate.role || '').slice(0, 180), description: String(candidate.description || '').slice(0, 1800),
            confidence: Number.isFinite(Number(candidate.confidence)) ? Number(candidate.confidence) : null,
            settlementStatus: String(candidate.settlementStatus || ''), candidateStatus: String(candidate.status || ''),
            sourceTurnIds: experimentalSafeJsonClone(scenePulseCandidateSourceTurnIds(candidate)), readerSnapshotId: String(candidate.readerSnapshotId || ''),
            sourceSceneId: String(candidate.sourceSceneId || ''), eligibility,
            staged: staged ? {
                id: String(staged.id || ''), status: String(staged.status || ''),
                promotionRequested: staged.promotionRequested === true,
                sourceTurnIds: experimentalSafeJsonClone(staged.readerSourceTurnIds || []),
                disposition: String(staged.scenePulseDisposition || ''),
                duplicateCandidates: (Array.isArray(staged.duplicateCanonicalCandidates) ? staged.duplicateCanonicalCandidates : [])
                    .filter(entry => experimentalIsPlainObject(entry) && String(entry?.id || '').trim())
                    .slice(-8).map(entry => ({
                        id: String(entry.id || '').slice(0, 180), name: String(entry.name || entry.id || '').slice(0, 240),
                        kind: String(entry.kind || '').slice(0, 40)
                    }))
            } : null,
            canonical: canonical ? { id: String(canonical.id || ''), name: String(canonical.name || ''), kind: staged?.kind || scenePulseCandidatePromotionKind(candidate) } : null,
            // This id is surfaced only for an explicit identity decision; a
            // name match never becomes a silent canonical link.
            readerCanonicalMatchId: String(candidate.canonicalMatchId || '')
        };
    }).slice(-80);
}

function scenePulseCandidatePromotionDraft(candidate = {}) {
    const kind = scenePulseCandidatePromotionKind(candidate);
    const details = experimentalIsPlainObject(candidate?.details) ? candidate.details : {};
    const sourceCharacter = experimentalIsPlainObject(candidate?.scenePulseCharacter) ? candidate.scenePulseCharacter : {};
    const appearance = {
        hair: String(details.hair || sourceCharacter.hair || '').trim().slice(0, 600),
        face: String(details.face || sourceCharacter.face || '').trim().slice(0, 600),
        outfit: String(candidate.clothingDescription || details.outfit || details.clothing || sourceCharacter.outfit || '').trim().slice(0, 1200),
        garments: (Array.isArray(candidate.individualGarments) ? candidate.individualGarments : [])
            .map(value => String(value || '').trim()).filter(Boolean).slice(0, 24),
        posture: String(details.posture || details.pose || sourceCharacter.posture || '').trim().slice(0, 400),
        notableDetails: String(details.notableDetails || details.appearance || sourceCharacter.notableDetails || candidate.visibleCondition || '').trim().slice(0, 1200),
        visibleCondition: String(candidate.visibleCondition || '').trim().slice(0, 600)
    };
    const specialist = {
        fertStatus: String(sourceCharacter.fertStatus || '').trim().slice(0, 240),
        fertNotes: String(sourceCharacter.fertNotes || '').trim().slice(0, 1200)
    };
    const goals = {
        immediateNeed: String(sourceCharacter.immediateNeed || '').trim().slice(0, 800),
        shortTermGoal: String(sourceCharacter.shortTermGoal || '').trim().slice(0, 800),
        longTermGoal: String(sourceCharacter.longTermGoal || '').trim().slice(0, 1200)
    };
    const presentation = {
        proximity: String(details.proximity || sourceCharacter.proximity || '').trim().slice(0, 400),
        inventory: Array.isArray(sourceCharacter.inventory)
            ? sourceCharacter.inventory.map(value => String(value || '').trim()).filter(Boolean).slice(0, 40)
            : String(sourceCharacter.inventory || '').trim().slice(0, 1800)
    };
    const descriptiveParts = [
        candidate.role && `Observed role: ${candidate.role}`,
        candidate.description,
        appearance.visibleCondition && `Visible condition: ${appearance.visibleCondition}`,
        appearance.outfit && `Observed outfit: ${appearance.outfit}`
    ].map(value => String(value || '').trim()).filter(Boolean);
    if (kind === 'location') {
        return {
            kind, raw: {
                name: String(candidate.label || candidate.name || '').trim(),
                description: descriptiveParts.join('\n').slice(0, 1800),
                region: String(details.region || '').trim(), map_type: String(details.mapType || details.map_type || '').trim(),
                floor: String(details.floor || '').trim(), parent_location_id: String(candidate.parentCanonicalId || details.parentLocationId || '').trim(),
                scenePulseCandidateId: String(candidate.candidateId || ''), scenePulseCandidateType: 'location'
            }, appearance, specialist, goals, presentation
        };
    }
    return {
        kind, raw: {
            name: String(candidate.label || candidate.name || '').trim(),
            description: descriptiveParts.join('\n').slice(0, 1800),
            // A role or visual description is not a fabricated character
            // persona. Only Reader evidence explicitly marked persona may
            // initialize this durable field.
            persona: String(details.persona || '').trim().slice(0, 1800),
            home_location: String(candidate.parentCanonicalId || details.homeLocation || '').trim(),
            scenePulseCandidateId: String(candidate.candidateId || ''), scenePulseCandidateType: 'character'
        }, appearance, specialist, goals, presentation
    };
}

function scenePulsePromotionRecordForCandidate(protocol, candidateId) {
    return [...(protocol?.provisionalLocations || []), ...(protocol?.provisionalEntities || [])]
        .find(record => String(record?.scenePulseCandidateId || '') === String(candidateId || '')) || null;
}

async function stageScenePulseCandidateForWorldReview(world, sess, candidateId) {
    const protocol = protocolForSidecarTimeline(world, sess);
    const candidate = protocol?.readerCandidates?.find(item => String(item?.candidateId || '') === String(candidateId || ''));
    const eligibility = scenePulseCandidatePromotionEligibility(protocol, candidate);
    if (!candidate || !eligibility.reviewable) throw new Error(eligibility.reason || 'That ScenePulse candidate cannot be reviewed.');
    const draft = scenePulseCandidatePromotionDraft(candidate);
    const sourceTurnIds = scenePulseCandidateSourceTurnIds(candidate);
    const sourceTurn = [...(protocol.turns || [])].reverse()
        .find(turn => sourceTurnIds.includes(String(turn?.id || ''))) || null;
    const staged = window.ExperimentalWorldsSidecarPromotion?.stage?.(protocol, draft.kind, draft.raw, {
        source: 'scenepulse_reader_candidate', turnId: sourceTurnIds.at(-1) || '',
        narration: String(sourceTurn?.narration || ''), handoff: String(sourceTurn?.handoff || '')
    });
    if (!staged) throw new Error('The candidate could not be staged for World review.');
    staged.scenePulseCandidateId = String(candidate.candidateId || '');
    staged.scenePulseCandidateType = String(candidate.candidateType || '');
    staged.readerSnapshotIds = [...new Set([...(staged.readerSnapshotIds || []), candidate.readerSnapshotId]
        .map(value => String(value || '').trim()).filter(Boolean))].slice(-30);
    staged.readerSourceTurnIds = [...new Set([...(staged.readerSourceTurnIds || []), ...sourceTurnIds])].slice(-30);
    staged.scenePulseEvidence = experimentalSafeJsonClone((candidate.evidence || []).slice(-24));
    staged.scenePulseAppearance = experimentalSafeJsonClone(draft.appearance);
    staged.scenePulseSpecialist = experimentalSafeJsonClone(draft.specialist);
    staged.scenePulseGoals = experimentalSafeJsonClone(draft.goals);
    staged.scenePulsePresentation = experimentalSafeJsonClone(draft.presentation);
    staged.promotionEligibility = experimentalSafeJsonClone(eligibility);
    staged.scenePulseDisposition = eligibility.ready ? 'world_review_ready' : 'awaiting_scene_evidence';
    staged.reviewProvenance = {
        source: 'explicit_scenepulse_comparison_review', reviewedAt: new Date().toISOString(),
        candidateId: staged.scenePulseCandidateId, readerSnapshotId: String(candidate.readerSnapshotId || ''), sourceTurnIds: experimentalSafeJsonClone(sourceTurnIds)
    };
    candidate.provisionalId = staged.id;
    candidate.promotionDisposition = staged.scenePulseDisposition;
    protocol.packet = buildSidecarScenePacket(world, sess);
    await ExperimentalWorldsHost.persist();
    renderWorldPlayState();
    return { status: staged.scenePulseDisposition, provisionalId: staged.id, eligibility };
}

function applyScenePulsePromotionAppearance(canonical, staged) {
    if (!canonical || canonical.type !== 'npc') return null;
    const appearance = experimentalIsPlainObject(staged?.scenePulseAppearance) ? staged.scenePulseAppearance : {};
    const specialist = experimentalIsPlainObject(staged?.scenePulseSpecialist) ? staged.scenePulseSpecialist : {};
    const goals = experimentalIsPlainObject(staged?.scenePulseGoals) ? staged.scenePulseGoals : {};
    const presentation = experimentalIsPlainObject(staged?.scenePulsePresentation) ? staged.scenePulsePresentation : {};
    const outfitDescription = String(appearance.outfit || '').trim().slice(0, 1200);
    canonical.visuals = experimentalIsPlainObject(canonical.visuals) ? canonical.visuals : {};
    const outcomes = {};
    if (outfitDescription) {
        const outfits = worldOutfits(canonical);
        let outfit = outfits.find(item => String(item?.description || '').toLowerCase() === outfitDescription.toLowerCase());
        if (!outfit) {
            outfit = {
                id: `outfit_scenepulse_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
                name: 'Observed scene outfit', description: outfitDescription, imageAssetIds: []
            };
            outfits.push(outfit);
        }
        canonical.visuals.outfits = outfits.slice(-30);
        canonical.visuals.currentOutfitId = outfit.id;
        canonical.currentOutfit = outfit.description;
        const garments = (Array.isArray(appearance.garments) ? appearance.garments : [])
            .map(value => String(value || '').trim()).filter(Boolean).slice(0, 24);
        if (garments.length) outfit.scenePulseObservedGarments = garments;
        outcomes.outfitId = outfit.id;
    }
    const identityDetails = [appearance.hair, appearance.face, appearance.notableDetails]
        .map(value => String(value || '').trim()).filter(Boolean).join('; ').slice(0, 600);
    if (identityDetails) {
        canonical.visuals.portraitIdentityGuide = normalizeWorldVisualIdentityGuide(canonical.visuals.portraitIdentityGuide);
        if (!canonical.visuals.portraitIdentityGuide.appearanceDetails) {
            canonical.visuals.portraitIdentityGuide.appearanceDetails = identityDetails;
            outcomes.identityGuide = 'appearanceDetails';
        }
    }
    if (appearance.posture) {
        canonical.visuals.portraitSubjectGuide = normalizeWorldVisualSubjectGuide(canonical.visuals.portraitSubjectGuide);
        if (!canonical.visuals.portraitSubjectGuide.pose) {
            canonical.visuals.portraitSubjectGuide.pose = String(appearance.posture).slice(0, 400);
            outcomes.subjectGuide = 'pose';
        }
    }
    const source = {
        source: 'explicit_scenepulse_candidate_promotion', promotedAt: new Date().toISOString(),
        candidateId: String(staged?.scenePulseCandidateId || ''), readerSnapshotIds: experimentalSafeJsonClone(staged?.readerSnapshotIds || []),
        sourceTurnIds: experimentalSafeJsonClone(staged?.readerSourceTurnIds || [])
    };
    canonical.scenePulseAppearanceEvidence = { ...source, appearance: experimentalSafeJsonClone(appearance) };
    // These fields are intentionally kept as observed graduation evidence,
    // not flattened into a generic personality or permanent-state schema.
    // They retain provenance and can be revised by a later accepted scene.
    const observedState = {
        ...source,
        presentation: experimentalSafeJsonClone(presentation),
        specialist: experimentalSafeJsonClone(specialist),
        goals: experimentalSafeJsonClone(goals)
    };
    if (Object.values(specialist).some(Boolean) || Object.values(goals).some(Boolean)
        || Object.values(presentation).some(value => Array.isArray(value) ? value.length : value)) {
        canonical.scenePulseObservedState = observedState;
        outcomes.observedState = true;
    }
    // A long-term goal may initialise an otherwise empty durable goal on an
    // explicit character graduation. Never overwrite an authored Horde goal
    // with a current ScenePulse reading.
    if (!String(canonical.goal || '').trim() && String(goals.longTermGoal || '').trim()) {
        canonical.goal = String(goals.longTermGoal).trim().slice(0, 1200);
        outcomes.goalSeeded = true;
    }
    return outcomes;
}

// A location promotion has no portrait or personality to seed, but it still
// needs the same durable provenance boundary as a graduated ScenePulse person.
// Keep the exact observed place details and Reader evidence on the new Horde
// Location; do not replace them with the current live environment or infer a
// containment graph from the display name.
function applyScenePulsePromotionLocation(canonical, staged) {
    if (!canonical || String(staged?.kind || '') !== 'location') return null;
    const source = {
        source: 'explicit_scenepulse_candidate_promotion', promotedAt: new Date().toISOString(),
        candidateId: String(staged?.scenePulseCandidateId || ''), readerSnapshotIds: experimentalSafeJsonClone(staged?.readerSnapshotIds || []),
        sourceTurnIds: experimentalSafeJsonClone(staged?.readerSourceTurnIds || [])
    };
    const observedLocation = {
        description: String(staged?.description || '').trim().slice(0, 1800),
        region: String(staged?.region || '').trim().slice(0, 180),
        mapType: String(staged?.mapType || '').trim().slice(0, 80),
        floor: String(staged?.floor || '').trim().slice(0, 120),
        parentHint: String(staged?.parentHint || '').trim().slice(0, 180)
    };
    canonical.scenePulseLocationEvidence = {
        ...source,
        location: observedLocation,
        evidence: experimentalSafeJsonClone((staged?.scenePulseEvidence || []).slice(-24))
    };
    return { locationEvidence: true };
}

function markScenePulseCandidatePromotionOutcome(protocol, staged, canonical, outcome = 'promoted') {
    if (!protocol || !staged || !canonical) return null;
    const candidate = protocol.readerCandidates?.find(item => String(item?.candidateId || '') === String(staged.scenePulseCandidateId || ''));
    if (!candidate) return null;
    candidate.status = outcome === 'matched' ? 'matched' : 'promoted';
    candidate.canonicalMatchId = String(canonical.id || '');
    candidate.provisionalId = String(staged.id || '');
    candidate.promotionDisposition = outcome === 'matched' ? 'canonical_identity_linked' : 'canonical_record_created';
    candidate.promotionProvenance = {
        source: outcome === 'matched' ? 'explicit_scenepulse_identity_link' : 'explicit_scenepulse_candidate_promotion',
        at: new Date().toISOString(), canonicalId: String(canonical.id || ''), provisionalId: String(staged.id || ''),
        readerSnapshotIds: experimentalSafeJsonClone(staged.readerSnapshotIds || []), sourceTurnIds: experimentalSafeJsonClone(staged.readerSourceTurnIds || [])
    };
    return candidate;
}

async function linkScenePulseCandidateToCanonical(world, sess, candidateId) {
    const protocol = protocolForSidecarTimeline(world, sess);
    const candidate = protocol?.readerCandidates?.find(item => String(item?.candidateId || '') === String(candidateId || ''));
    const eligibility = scenePulseCandidatePromotionEligibility(protocol, candidate);
    const canonical = scenePulseCandidateCanonicalRecord(world, candidate);
    if (!candidate || !eligibility.reviewable) throw new Error(eligibility.reason || 'That ScenePulse candidate cannot be linked.');
    if (!canonical) throw new Error('The Reader did not provide a verified canonical identity to link.');
    const staged = scenePulsePromotionRecordForCandidate(protocol, candidateId);
    ExperimentalWorldsHost.confirmModal(`Link ${candidate.label || candidate.name}`, `Link this settled ScenePulse candidate to Horde’s existing ${canonical.type === 'npc' ? 'character' : 'location'} “${canonical.name}”? This preserves both evidence trails and creates no new record.`, async () => {
        if (staged) {
            staged.status = 'resolved'; staged.resolvedCanonicalId = canonical.id;
            staged.scenePulseDisposition = 'canonical_identity_linked';
        }
        markScenePulseCandidatePromotionOutcome(protocol, staged || { scenePulseCandidateId: candidateId, id: '' }, canonical, 'matched');
        protocol.refinements.push({
            id: `scenepulse_identity_link_${Date.now().toString(36)}`, createdAt: new Date().toISOString(),
            source: 'direct_user_refinement', userText: `Linked ScenePulse candidate ${candidate.label || candidateId} to ${canonical.name}.`,
            committed: true, candidateId: String(candidateId || ''), canonicalId: canonical.id
        });
        protocol.refinements = protocol.refinements.slice(-200);
        protocol.packet = buildSidecarScenePacket(world, sess);
        await ExperimentalWorldsHost.persist();
        renderWorldPlayState();
        ExperimentalWorldsHost.notify(`${candidate.label || candidate.name} is now linked to ${canonical.name}.`, 'success');
    });
    return { status: 'confirmation_required', canonicalId: canonical.id };
}

// A name/shape collision found while the author explicitly promotes a
// ScenePulse candidate is a development comparison, not a question for the
// roleplay player. Keep the two possible records visible in Inspect until the
// author chooses this exact link or explicitly creates a distinct record.
async function resolveScenePulseCandidateDuplicate(world, sess, candidateId, canonicalId, choice) {
    const protocol = protocolForSidecarTimeline(world, sess);
    const candidate = protocol?.readerCandidates?.find(item => String(item?.candidateId || '') === String(candidateId || ''));
    const staged = scenePulsePromotionRecordForCandidate(protocol, candidateId);
    const kind = scenePulseCandidatePromotionKind(candidate);
    const requested = String(canonicalId || '').trim();
    const duplicate = (Array.isArray(staged?.duplicateCanonicalCandidates) ? staged.duplicateCanonicalCandidates : [])
        .find(entry => String(entry?.id || '') === requested) || null;
    if (!candidate || !staged || !kind || !duplicate) throw new Error('That duplicate comparison is no longer available.');
    if (!['link', 'create'].includes(String(choice || ''))) throw new Error('Choose whether to link the existing record or create separately.');
    const canonical = kind === 'location'
        ? (world?.locations || []).find(record => String(record?.id || '') === requested) || null
        : (world?.entities || []).find(record => String(record?.id || '') === requested && ['npc', 'character', 'person'].includes(String(record?.type || '').toLowerCase())) || null;
    if (!canonical) throw new Error('The compared Horde record is no longer available.');
    if (choice === 'create') {
        return promoteImpliedWorldRecord({ provisionalId: staged.id, candidateId, allowDuplicate: true });
    }
    ExperimentalWorldsHost.confirmModal(`Link ${candidate.label || candidate.name}`, `Use the existing ${kind === 'location' ? 'location' : 'character'} “${canonical.name}” for this ScenePulse candidate? This is an explicit author decision; it does not change the visible scene.`, async () => {
        staged.status = 'resolved';
        staged.resolvedCanonicalId = canonical.id;
        staged.scenePulseDisposition = 'canonical_identity_linked_author_choice';
        staged.duplicateResolution = { choice: 'link', canonicalId: canonical.id, at: new Date().toISOString() };
        markScenePulseCandidatePromotionOutcome(protocol, staged, canonical, 'matched');
        protocol.refinements.push({
            id: `scenepulse_duplicate_link_${Date.now().toString(36)}`, createdAt: new Date().toISOString(),
            source: 'direct_user_refinement', userText: `Linked ScenePulse candidate ${candidate.label || candidateId} to existing ${canonical.name}.`,
            committed: true, candidateId: String(candidateId || ''), canonicalId: canonical.id, duplicateResolution: 'link'
        });
        protocol.refinements = protocol.refinements.slice(-200);
        protocol.packet = buildSidecarScenePacket(world, sess);
        await ExperimentalWorldsHost.persist();
        renderWorldPlayState();
        ExperimentalWorldsHost.notify(`${candidate.label || candidate.name} is now linked to ${canonical.name}.`, 'success');
    });
    return { status: 'confirmation_required', canonicalId: canonical.id, choice: 'link' };
}

async function keepScenePulseCandidateSceneOnly(world, sess, candidateId) {
    const protocol = protocolForSidecarTimeline(world, sess);
    const candidate = protocol?.readerCandidates?.find(item => String(item?.candidateId || '') === String(candidateId || ''));
    if (!candidate) throw new Error('The ScenePulse candidate is no longer available.');
    candidate.promotionDisposition = 'scene_only_by_author';
    candidate.promotionProvenance = {
        source: 'explicit_scenepulse_scene_only', at: new Date().toISOString(),
        readerSnapshotId: String(candidate.readerSnapshotId || ''), sourceTurnIds: experimentalSafeJsonClone(scenePulseCandidateSourceTurnIds(candidate))
    };
    const staged = scenePulsePromotionRecordForCandidate(protocol, candidateId);
    if (staged && staged.status !== 'promoted') {
        staged.scenePulseDisposition = 'scene_only_by_author';
        staged.status = 'scene_only';
    }
    protocol.packet = buildSidecarScenePacket(world, sess);
    await ExperimentalWorldsHost.persist();
    renderWorldPlayState();
    return { status: 'scene_only' };
}

// An accepted snapshot keeps both its cumulative projection and the exact
// compact Reader packet that created it. Older snapshots predate rawEnvelope;
// only those use the authored turn's legacy Reader packet as a fallback.
function sidecarReaderSnapshotRawEnvelope(snapshot, sourceTurn = null) {
    if (experimentalIsPlainObject(snapshot?.rawEnvelope)) return snapshot.rawEnvelope;
    return experimentalIsPlainObject(sourceTurn?.reader) ? sourceTurn.reader : {};
}

// Gate B is intentionally a very small host boundary.  ScenePulse receives
// only the sealed source fixture plus an exact, settled Reader projection for
// the newest authored beat.  In particular, do not "help" a sparse Reader
// result with World entities, quests, locations, canonical relationships, or
// a stale Sidecar workspace model: a missing source field must remain visibly
// fixture-backed until the Reader's own sync path supplies it.
function scenePulseAcceptedHandoff(world, sess) {
    const fixture = scenePulseTourState().acceptedHandoff;
    const protocol = protocolForSidecarTimeline(world, sess);
    const storedUiPreferences = protocol?.workspaceUi?.scenePulseWorlds;
    // Settings are always handed to the source runtime, including the first
    // fixture mount.  They cannot add story data; they only determine source
    // controls, visual treatment, custom-schema fields, and portraits.
    const uiPreferences = scenePulseWorldsHandoffPreferences(world, storedUiPreferences || {});
    const nativeFieldAuthority = scenePulseDeclaredNativeFieldAuthority(uiPreferences);
    // UI preferences are deliberately outside the ScenePulse data projection:
    // they can survive a fixture/live switch, but never supply a source field.
    const fixtureWithPreferences = Object.freeze({ ...fixture, uiPreferences, nativeFieldAuthority });
    const latestTurn = currentSidecarAuthoredTurn(protocol, sess);
    if (!protocol || !latestTurn) return scenePulseHumanOverlay(protocol, fixtureWithPreferences);
    const latestTurnAccepted = !sidecarTurnNeedsDownstreamRecovery(latestTurn)
        && (['active', 'committed'].includes(String(latestTurn.status || '').toLowerCase())
            || String(latestTurn.reconciliationStatus || '').toLowerCase() === 'committed');
    const historySnapshots = (protocol.readerSnapshots || [])
        .filter(snapshot => ['active', 'accepted_historical'].includes(snapshot?.status)
            && snapshot?.settlementStatus === 'settled')
        .sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')));
    // A failed or still-incomplete newest beat has no authority to replace a
    // fully accepted foreground scene with the tutorial.  Retain the exact
    // last settled packet in ScenePulse, while Backstage continues to expose
    // the newer handoff/question for inspection and recovery.  The fixture is
    // only the first-scene scaffold when no accepted packet exists at all.
    const settledForLatestTurn = latestTurnAccepted ? historySnapshots
        .filter(snapshot => String(snapshot?.turnId || '') === String(latestTurn.id || ''))
        .at(-1) : null;
    const settled = settledForLatestTurn || historySnapshots.at(-1) || null;
    const sourceTurn = settled && (protocol.turns || [])
        .find(turn => String(turn?.id || '') === String(settled.turnId || '')) || null;
    const retainingLastKnownScene = !!settled && (!settledForLatestTurn
        || String(settled.turnId || '') !== String(latestTurn.id || ''));
    const envelope = settled?.envelope || null;
    const sourceTurnMatches = String(envelope?.sourceTurnId || settled?.turnId || '') === String(sourceTurn?.id || '');
    // The source panel receives the materialized settled projection. Inspect
    // receives this snapshot's exact compact packet; a focused reread must
    // not show the older packet stored on its authored turn.
    const rawReaderEnvelope = sidecarReaderSnapshotRawEnvelope(settled, sourceTurn);
    const deltaScenePulse = experimentalIsPlainObject(rawReaderEnvelope?.scenePulse) ? rawReaderEnvelope.scenePulse : {};
    // Persisted snapshots may predate a source-shape repair. Normalize the
    // accepted display clone on read as well as on new Reader input, so a
    // scalar witness in an older settled packet remains visible to the
    // upstream renderer without mutating its raw evidence record.
    const settledScenePulse = experimentalIsPlainObject(envelope?.scenePulse)
        ? normalizeSidecarScenePulseShape(envelope.scenePulse) : null;
    // attachSidecarReaderSnapshot already materializes compact deltas. Do not
    // apply meterDeltas again at render time: that would double an accepted
    // relationship change on every redraw.
    const acceptedScenePulse = settledScenePulse;
    if (!settled || !sourceTurnMatches || !acceptedScenePulse || !Object.keys(acceptedScenePulse).length) return scenePulseHumanOverlay(protocol, fixtureWithPreferences);

    const readerPreset = effectiveSidecarReaderProfile(world, sess)?.scenePulsePreset || null;
    const currentIndex = historySnapshots.findIndex(snapshot => snapshot.id === settled.id);
    const predecessor = currentIndex > 0 ? historySnapshots[currentIndex - 1] : null;
    const history = historySnapshots.slice(0, currentIndex + 1).map((snapshot, index, snapshots) => {
        const sourceTurn = (protocol.turns || []).find(turn => String(turn?.id || '') === String(snapshot.turnId || '')) || null;
        const rawReaderEnvelope = sidecarReaderSnapshotRawEnvelope(snapshot, sourceTurn);
        const rawDelta = experimentalIsPlainObject(rawReaderEnvelope?.scenePulse) ? rawReaderEnvelope.scenePulse : {};
        const storedProjection = experimentalIsPlainObject(snapshot.envelope?.scenePulse)
            ? normalizeSidecarScenePulseShape(snapshot.envelope.scenePulse) : {};
        const projection = storedProjection;
        const priorSnapshot = index > 0 ? snapshots[index - 1] : null;
        const priorTurn = priorSnapshot && (protocol.turns || []).find(turn => String(turn?.id || '') === String(priorSnapshot.turnId || ''));
        const priorRawEnvelope = sidecarReaderSnapshotRawEnvelope(priorSnapshot, priorTurn);
        const priorDelta = experimentalIsPlainObject(priorRawEnvelope?.scenePulse) ? priorRawEnvelope.scenePulse : {};
        const priorStored = experimentalIsPlainObject(priorSnapshot?.envelope?.scenePulse) ? priorSnapshot.envelope.scenePulse : null;
        const usage = snapshot.envelope?.metadata?.usage;
        // Historic snapshots may have placeholder zeroes from before calls
        // measured their own lifetime. Only the explicit reader-call marker is
        // measurement evidence; absence is never rendered as a fast call.
        const recordedMetric = field => usage?.source === 'reader_call' && typeof usage?.[field] === 'number' && Number.isFinite(usage[field]) && usage[field] > 0 ? usage[field] : null;
        return {
            id: String(snapshot.id || ''),
            label: `Turn ${index + 1}`,
            current: snapshot.id === settled.id,
            createdAt: snapshot.createdAt || '',
            summary: String(snapshot.envelope?.summary || projection.sceneSummary || snapshot.envelope?.scene?.topic || 'Accepted ScenePulse reading').slice(0, 600),
            turnId: String(snapshot.turnId || ''),
            analytics: {
                model: String(snapshot.envelope?.metadata?.model || snapshot.model || ''),
                provider: String(snapshot.envelope?.metadata?.provider || snapshot.provider || ''),
                mode: String(snapshot.envelope?.snapshotMode || snapshot.provenance?.readerMode || 'delta'),
                elapsedMs: recordedMetric('elapsedMs'),
                promptTokens: recordedMetric('promptTokens'),
                completionTokens: recordedMetric('completionTokens'),
                totalTokens: recordedMetric('totalTokens'),
                providerReportedUsage: usage?.source === 'reader_call' && usage?.providerReportedUsage === true,
                deltaBytes: JSON.stringify(rawDelta).length,
                changedFields: Object.keys(rawDelta).filter(key => !['clearFields', 'clear_fields', 'replaceCollections', 'replace_collections'].includes(key)).length
            },
            scenePulse: experimentalSafeJsonClone(projection),
            previousScenePulse: priorStored ? experimentalSafeJsonClone(priorStored) : null,
            deltaScenePulse: experimentalSafeJsonClone(rawDelta),
            clearFields: Array.isArray(rawDelta.clearFields || rawDelta.clear_fields) ? experimentalSafeJsonClone(rawDelta.clearFields || rawDelta.clear_fields) : [],
            replaceCollections: Array.isArray(rawDelta.replaceCollections || rawDelta.replace_collections) ? experimentalSafeJsonClone(rawDelta.replaceCollections || rawDelta.replace_collections) : [],
            // The graph travels beside this historical source projection so
            // Inspect can show a Reader-derived web without treating it as a
            // tracker field or a canonical relationship record.
            npcRelationshipGraph: experimentalSafeJsonClone(snapshot.envelope?.npcRelationshipGraph || null),
            // This lives beside the source tracker, never inside it. The
            // native panel remains a ScenePulse rendering; Inspect can show
            // whether a settled scene candidate has a parallel Horde review.
            candidateReview: experimentalSafeJsonClone(scenePulseCandidateReviewProjection(world, sess, protocol, {
                snapshotId: String(snapshot.id || ''), turnId: String(snapshot.turnId || '')
            })),
            // A Quest Journal action is translated only from an explicit
            // source save. Its compact outcome remains beside this historical
            // scene snapshot for Inspect; no Horde quest is used to fill the
            // source tracker.
            questReview: experimentalSafeJsonClone(scenePulseQuestReviewProjection(protocol, {
                snapshotId: String(snapshot.id || ''), turnId: String(snapshot.turnId || '')
            })),
            relationshipReview: experimentalSafeJsonClone(scenePulseRelationshipReviewProjection(protocol, {
                snapshotId: String(snapshot.id || ''), turnId: String(snapshot.turnId || '')
            }))
        };
    });
    return scenePulseHumanOverlay(protocol, Object.freeze({
        id: `scenepulse-live-${settled.id}`,
        status: 'accepted_live',
        source: `${retainingLastKnownScene ? 'Last known accepted' : 'Accepted'} Horde Reader handoff · ${settled.id}`,
        lastKnown: retainingLastKnownScene,
        fixtureScenePulse: fixture.scenePulse,
        scenePulse: experimentalSafeJsonClone(acceptedScenePulse),
        previousScenePulse: predecessor?.envelope?.scenePulse ? experimentalSafeJsonClone(predecessor.envelope.scenePulse) : null,
        deltaScenePulse: experimentalSafeJsonClone(deltaScenePulse),
        clearFields: Array.isArray(deltaScenePulse.clearFields || deltaScenePulse.clear_fields) ? experimentalSafeJsonClone(deltaScenePulse.clearFields || deltaScenePulse.clear_fields) : [],
        replaceCollections: Array.isArray(deltaScenePulse.replaceCollections || deltaScenePulse.replace_collections) ? experimentalSafeJsonClone(deltaScenePulse.replaceCollections || deltaScenePulse.replace_collections) : [],
        npcRelationshipGraph: experimentalSafeJsonClone(envelope.npcRelationshipGraph || null),
        history: experimentalSafeJsonClone(history),
        readerPreset: experimentalSafeJsonClone(readerPreset),
        candidateReview: experimentalSafeJsonClone(scenePulseCandidateReviewProjection(world, sess, protocol, {
            snapshotId: String(settled.id || ''), turnId: String(sourceTurn?.id || '')
        })),
        questReview: experimentalSafeJsonClone(scenePulseQuestReviewProjection(protocol, {
            snapshotId: String(settled.id || ''), turnId: String(sourceTurn?.id || '')
        })),
        relationshipReview: experimentalSafeJsonClone(scenePulseRelationshipReviewProjection(protocol, {
            snapshotId: String(settled.id || ''), turnId: String(sourceTurn?.id || '')
        })),
        uiPreferences,
        nativeFieldAuthority,
        provenance: Object.freeze({
            turnId: String(sourceTurn?.id || ''), snapshotId: String(settled.id || ''), readerMode: String(envelope.snapshotMode || 'delta'),
            currentTurnId: String(latestTurn.id || ''), presentation: retainingLastKnownScene ? 'last_known_after_incomplete_turn' : 'current'
        })
    }));
}

// Source Refresh regenerates a derived Reader projection for the current
// accepted authored beat. It never reruns Narrator, advances canonical time,
// or substitutes registry data for a missing ScenePulse field.
async function refreshAcceptedScenePulseProjection(world, sess, options = {}) {
    const protocol = protocolForSidecarTimeline(world, sess);
    const latestTurn = currentSidecarAuthoredTurn(protocol, sess);
    if (!latestTurn) throw new Error('No authored scene is available to refresh.');
    if (ExperimentalWorldsRuntime.readerRefreshController()) throw new Error('ScenePulse is already updating this scene.');
    const section = String(options?.section || '');
    const controller = new AbortController();
    ExperimentalWorldsRuntime.setReaderRefreshController(controller);
    try {
        if (section === 'thoughts') {
            const refreshedThoughts = await refreshScenePulseThoughts(world, sess, latestTurn.id, { signal: controller.signal });
            if (controller.signal.aborted) return { status: 'stopped' };
            ExperimentalWorldsHost.notify('ScenePulse thoughts refreshed for the current scene.', 'success');
            return refreshedThoughts;
        }
        const refresh = await refreshSidecarSceneIntelligence(world, sess, latestTurn.id, {
            // Source toolbar/section refreshes retain compact-delta cadence;
            // the explicit source /sp refresh command requests one complete
            // projection of this same authored beat.
            forceFull: options.forceFull === true,
            scenePulseFocus: section,
            renderReview: false,
            signal: controller.signal
        });
        if (controller.signal.aborted) return { status: 'stopped' };
        if (refresh?.status === 'review') {
            const accepted = acceptSidecarReaderRefresh(world, sess, refresh.id);
            await ExperimentalWorldsHost.persist();
            renderWorldPlayState();
            if (accepted?.cognitionJobIds?.length) {
                runSidecarBackgroundMemoryJobs(world, sess, { source: 'scenepulse_reader_refresh' })
                    .catch(error => console.warn('ScenePulse refresh cognition dispatch skipped —', error.message));
            }
            ExperimentalWorldsHost.notify(section ? `ScenePulse ${section} refresh accepted from the authored beat.` : 'ScenePulse refresh accepted from the authored beat.', 'success');
            return accepted;
        }
        // Recovery can return a settled retry rather than a review packet.
        // The caller still receives a truthful completion without issuing Narrator.
        ExperimentalWorldsHost.notify('ScenePulse refreshed for the current scene.', 'success');
        return refresh;
    } catch (error) {
        if (controller.signal.aborted) {
            // Keep the accepted tracker exactly as it was.  The native source
            // UI can offer Retry; this is not a failed or new World turn.
            ExperimentalWorldsHost.notify('ScenePulse update stopped. The current scene was left unchanged.', 'info');
            return { status: 'stopped' };
        }
        throw error;
    } finally {
        if (ExperimentalWorldsRuntime.readerRefreshController() === controller) ExperimentalWorldsRuntime.setReaderRefreshController(null);
    }
}

function stopScenePulseReaderRefresh() {
    if (!ExperimentalWorldsRuntime.readerRefreshController()) return { stopped: false };
    ExperimentalWorldsRuntime.readerRefreshController().abort();
    return { stopped: true };
}

// Keep the source Story-Idea controls source-faithful without placing Horde
// composer knowledge in the imported module. Paste stages the exact OOC
// direction for review; Inject deliberately follows the source's immediate
// send semantics only after the user clicks that explicit control.
function stageScenePulseStoryIdea({ direction = '', inject = false } = {}) {
    // The vendored card hands its source object across the named host
    // boundary. Convert that object to the source's own OOC direction here;
    // coercing it with String() would put "[object Object]" in the draft.
    const raw = experimentalIsPlainObject(direction) ? direction : null;
    const category = String(raw?.type || raw?.category || '').trim().toLowerCase();
    const type = ['dramatic', 'intense', 'comedic', 'twist', 'exploratory'].includes(category) ? category : 'exploratory';
    const article = /^[aeiou]/i.test(type) ? 'an' : 'a';
    const name = String(raw?.name || raw?.title || '').trim();
    const hook = String(raw?.hook || raw?.description || raw?.suggestion || '').trim();
    const text = typeof direction === 'string'
        ? direction.trim()
        : (name || hook ? `[OOC: Take the story in ${article} ${type} direction — "${name || 'Story direction'}". ${hook}]` : '');
    if (!text) throw new Error('The selected Story Idea has no direction text.');
    const input = document.getElementById('world-user-input');
    if (!input) throw new Error('The World composer is unavailable.');
    if (inject && ExperimentalWorldsRuntime.turnInProgress()) throw new Error('The current World turn is still generating.');
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    resizeExperimentalWorldMessageInput(input);
    input.focus();
    if (!inject) {
        ExperimentalWorldsHost.notify('Story direction pasted into the World draft — edit and send when ready.', 'success');
        return;
    }
    const send = document.getElementById('world-send-btn');
    if (!send) throw new Error('The World send control is unavailable.');
    send.click();
    ExperimentalWorldsHost.notify('Story direction injected as a new World turn.', 'success');
}

// A source preset is a Reader-prompt selection, not a provider/sampler
// takeover. It is persisted in the World-scoped Reader profile and only takes
// effect on a later Reader call; accepted turns retain their original prompt
// provenance and no Narrator or canonical state is replayed.
async function applyScenePulseReaderPreset(world, sess, rawPreset = {}) {
    const existing = world?.sidecarConfig?.tracker?.readerProfile || {};
    if (!experimentalIsPlainObject(rawPreset) || !Object.keys(rawPreset).length) {
        const { scenePulsePreset, ...withoutScenePulsePreset } = existing;
        world.sidecarConfig = window.ExperimentalWorldsSidecarMode?.normalizeWorldConfig?.({
            ...world,
            sidecarConfig: { ...(world.sidecarConfig || {}), tracker: { ...(world.sidecarConfig?.tracker || {}), readerProfileInherit: false, readerProfile: withoutScenePulsePreset } }
        }) || world.sidecarConfig;
        await ExperimentalWorldsHost.persist();
        renderWorldPlayState();
        return null;
    }
    const profile = window.ExperimentalWorldsSidecarReader?.normalizeProfile?.({ scenePulsePreset: rawPreset }) || {};
    if (!profile.scenePulsePreset?.id) throw new Error('The ScenePulse preset is incomplete.');
    world.sidecarConfig = window.ExperimentalWorldsSidecarMode?.normalizeWorldConfig?.({
        ...world,
        sidecarConfig: { ...(world.sidecarConfig || {}), tracker: { ...(world.sidecarConfig?.tracker || {}), readerProfileInherit: false, readerProfile: { ...existing, scenePulsePreset: profile.scenePulsePreset } } }
    }) || world.sidecarConfig;
    if (!world?.sidecarConfig?.tracker?.readerProfile?.scenePulsePreset?.id) throw new Error('Horde could not persist the ScenePulse preset selection.');
    await ExperimentalWorldsHost.persist();
    renderWorldPlayState();
    return world.sidecarConfig.tracker.readerProfile.scenePulsePreset;
}

// Source /sp export is intentionally scoped to the ScenePulse tracker.  A
// Worlds export follows the same boundary: accepted Reader ScenePulse
// projections and their Reader-profile provenance, never World entities,
// narration, canonical receipts, or provider request bodies.
function exportScenePulseReaderHistory(world, sess) {
    const protocol = protocolForSidecarTimeline(world, sess);
    const snapshots = (protocol?.readerSnapshots || []).filter(snapshot => ['active', 'accepted_historical'].includes(snapshot?.status)
        && snapshot?.settlementStatus === 'settled');
    if (!snapshots.length) return { count: 0, message: 'No ScenePulse scene snapshots to export.' };
    const profile = effectiveSidecarReaderProfile(world, sess);
    const exportData = {
        extension: 'ScenePulse', version: '6.27.20', exportedAt: new Date().toISOString(),
        scope: 'accepted_reader_scenepulse_projections_only', readerPreset: experimentalSafeJsonClone(profile.scenePulsePreset || null), snapshotCount: snapshots.length,
        snapshots: snapshots.map(snapshot => {
            const sourceTurn = (protocol.turns || []).find(turn => String(turn?.id || '') === String(snapshot.turnId || '')) || null;
            const rawDelta = experimentalIsPlainObject(sourceTurn?.reader?.scenePulse) ? sourceTurn.reader.scenePulse : {};
            return {
                id: snapshot.id, createdAt: snapshot.createdAt, turnId: snapshot.turnId, mode: snapshot.envelope?.snapshotMode || 'delta',
                changedFields: experimentalSafeJsonClone(snapshot.envelope?.changedFields || []), compactScenePulseDelta: experimentalSafeJsonClone(rawDelta),
                scenePulse: experimentalSafeJsonClone(snapshot.envelope?.scenePulse || {}), preset: experimentalSafeJsonClone(snapshot.envelope?.metadata?.scenePulsePreset || null),
                npcRelationshipGraph: experimentalSafeJsonClone(snapshot.envelope?.npcRelationshipGraph || null),
                usage: experimentalSafeJsonClone(snapshot.envelope?.metadata?.usage || {})
            };
        })
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `scenepulse-reader-history-${Date.now()}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return { count: snapshots.length, message: `Exported ${snapshots.length} ScenePulse scene snapshot${snapshots.length === 1 ? '' : 's'}.` };
}

// Source /sp clear clears tracker data, not the chat.  Keep that destructive
// boundary narrow in Worlds: only derived Reader snapshots/projections are
// removed after the source console's explicit confirmation.  Narration,
// canonical state, entities, receipts and the composer are all left intact.
async function clearScenePulseReaderHistory(world, sess) {
    const protocol = protocolForSidecarTimeline(world, sess);
    if (!protocol) throw new Error('No World ScenePulse history is available.');
    const count = (protocol.readerSnapshots || []).filter(snapshot => ['active', 'accepted_historical'].includes(snapshot?.status)
        && snapshot?.settlementStatus === 'settled').length;
    if (!count) return { count: 0, message: 'No ScenePulse scene snapshots to clear.' };
    protocol.readerSnapshots = [];
    protocol.readerRefreshes = [];
    protocol.sceneProjections = [];
    protocol.sceneProjection = null;
    (protocol.turns || []).forEach(turn => {
        turn.readerSnapshotId = '';
        turn.readerEnvelope = null;
        turn.reader = null;
    });
    protocol.packet = buildSidecarScenePacket(world, sess, '');
    await ExperimentalWorldsHost.persist();
    renderWorldPlayState();
    return { count, message: `Cleared ${count} ScenePulse scene snapshot${count === 1 ? '' : 's'}; the story and World state were preserved.` };
}

// These are presentation preferences, not ScenePulse evidence.  Persist only
// a compact, whitelisted source-panel shape per World timeline so a source
// control never smuggles registry/canonical state into the adapter boundary.
function normalizeScenePulseWorldsPreferences(raw = {}) {
    const source = experimentalIsPlainObject(raw) ? raw : {};
    const bools = (value, keys) => Object.fromEntries(keys.map(key => [key, value?.[key] !== false]));
    const panels = bools(source.panels, ['dashboard', 'scene', 'quests', 'relationships', 'characters', 'branches']);
    const features = bools(source.features, ['thoughts', 'weather', 'timeTint', 'transitions']);
    const dashCards = bools(source.dashCards, ['date', 'time', 'weather', 'temperature', 'location']);
    const theme = ['default', 'midnight', 'fantasy', 'cyberpunk', 'minimal'].includes(String(source.theme || '')) ? source.theme : 'default';
    const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
    const normalizeBooleanMap = (value, limit = 640) => Object.fromEntries(Object.entries(experimentalIsPlainObject(value) ? value : {})
        .filter(([key, item]) => /^[A-Za-z][A-Za-z0-9_]{0,100}$/.test(String(key)) && typeof item === 'boolean')
        .slice(0, limit));
    const normalizeCustomPanels = value => Array.isArray(value) ? value.slice(0, 20).map(panel => ({
        name: String(panel?.name || 'Custom Panel').slice(0, 120), enabled: panel?.enabled !== false,
        fields: (Array.isArray(panel?.fields) ? panel.fields : []).slice(0, 80).map(field => ({
            key: String(field?.key || 'field').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 80) || 'field',
            label: String(field?.label || 'Field').slice(0, 120),
            type: ['text', 'number', 'meter', 'list', 'enum'].includes(String(field?.type || '')) ? field.type : 'text',
            desc: String(field?.desc || '').slice(0, 600), enabled: field?.enabled !== false,
            options: Array.isArray(field?.options) ? field.options.slice(0, 48).map(option => String(option || '').trim().slice(0, 120)).filter(Boolean) : [],
            invert: field?.invert === true
        }))
    })) : [];
    const customPanels = normalizeCustomPanels(source.customPanels);
    const identityMap = (value, valueLimit) => Object.fromEntries(Object.entries(experimentalIsPlainObject(value) ? value : {})
        .filter(([identity, item]) => /^(?:reader|fixture):[A-Za-z0-9_.:-]{1,180}$/.test(String(identity || '')) && String(item || '').trim())
        .slice(0, 120)
        .map(([identity, item]) => [String(identity), String(item).trim().slice(0, valueLimit)]));
    const portraitAssetIds = identityMap(source.portraitAssetIds, 160);
    const wikiNotes = identityMap(source.wikiNotes, 4_000);
    const nativeFieldAuthority = Array.isArray(source.nativeFieldAuthority)
        ? [...new Set(source.nativeFieldAuthority.map(key => String(key || '').trim()).filter(key => /^[A-Za-z][A-Za-z0-9_]{0,100}$/.test(key)))].slice(0, 80)
        : [];
    const sourceProfiles = Array.isArray(source.sourceProfiles) ? source.sourceProfiles.slice(0, 16).map((profile, index) => {
        const promptOverrides = Object.fromEntries(Object.entries(experimentalIsPlainObject(profile?.promptOverrides) ? profile.promptOverrides : {})
            .filter(([key, value]) => /^[A-Za-z][A-Za-z0-9_]{0,100}$/.test(String(key)) && typeof value === 'string')
            .slice(0, 32)
            .map(([key, value]) => [String(key), String(value).slice(0, 48_000)]));
        return {
            id: /^[A-Za-z0-9_.:-]{1,180}$/.test(String(profile?.id || '')) ? String(profile.id) : `worlds-source-profile-${index + 1}`,
            name: String(profile?.name || 'ScenePulse Profile').slice(0, 120),
            description: String(profile?.description || '').slice(0, 1_200),
            schema: typeof profile?.schema === 'string' ? profile.schema.slice(0, 160_000) : null,
            systemPrompt: typeof profile?.systemPrompt === 'string' ? profile.systemPrompt.slice(0, 160_000) : null,
            promptOverrides,
            systemPromptRole: ['system', 'user', 'assistant'].includes(String(profile?.systemPromptRole || '')) ? profile.systemPromptRole : 'system',
            appliedPresetId: typeof profile?.appliedPresetId === 'string' ? profile.appliedPresetId.slice(0, 240) : null,
            schemaVersion: Number.isInteger(Number(profile?.schemaVersion)) ? Math.max(1, Math.min(16, Number(profile.schemaVersion))) : 1,
            panels: normalizeBooleanMap(profile?.panels, 64),
            fieldToggles: normalizeBooleanMap(profile?.fieldToggles),
            dashCards: normalizeBooleanMap(profile?.dashCards, 64),
            customPanels: normalizeCustomPanels(profile?.customPanels),
            createdAt: String(profile?.createdAt || '').slice(0, 80),
            updatedAt: String(profile?.updatedAt || '').slice(0, 80)
        };
    }) : [];
    const sourceActiveProfileId = sourceProfiles.some(profile => profile.id === String(source.sourceActiveProfileId || ''))
        ? String(source.sourceActiveProfileId) : (sourceProfiles[0]?.id || '');
    return {
        panels, features, compact: source.compact === true, showEmpty: source.showEmpty === true, setupDismissed: source.setupDismissed === true, thoughtsOpen: source.thoughtsOpen !== false,
        dashCards, fieldToggles: normalizeBooleanMap(source.fieldToggles), language: String(source.language || '').slice(0, 80),
        thoughtGhost: source.thoughtGhost !== false, thoughtSnap: source.thoughtSnap !== false, thoughtFit: source.thoughtFit === true,
        thoughtTruncate: source.thoughtTruncate === true,
        thoughtWidth: number(source.thoughtWidth, 340, 220, 1400), thoughtHeight: number(source.thoughtHeight, 400, 160, 1200),
        thoughtX: number(source.thoughtX, 8, 0, 12000), thoughtY: number(source.thoughtY, 68, 0, 12000),
        theme, fontScale: number(source.fontScale, 1, .7, 1.5), customPanels, sourceProfiles, sourceActiveProfileId,
        portraitAssetIds, wikiNotes, nativeFieldAuthority
    };
}

// Portrait data stays in portable Horde media storage. The ScenePulse
// preference record contains only an asset ID under a stable Reader identity;
// this handoff adds its renderable data URL without promoting it into the
// Reader projection, canonical entity, or prompt context.
function scenePulseWorldsHandoffPreferences(world, rawPreferences = {}) {
    const preferences = normalizeScenePulseWorldsPreferences(rawPreferences);
    const portraitSources = {};
    Object.entries(preferences.portraitAssetIds || {}).forEach(([identity, assetId]) => {
        const source = worldMediaSource(world, assetId);
        if (source) portraitSources[identity] = source;
    });
    // The source runtime receives the resolved schema, not a separate Horde
    // fallback. This makes the upstream tour panel a real mounted surface and
    // lets a compact Reader delta replace one of its keys when evidence exists.
    return { ...preferences, customPanels: experimentalSafeJsonClone(scenePulseEffectiveSourceCustomPanels(preferences)), portraitSources };
}

async function persistScenePulseWorldsPreferences(world, sess, rawPreferences = {}) {
    const protocol = protocolForSidecarTimeline(world, sess);
    if (!protocol) throw new Error('No World timeline is available for ScenePulse preferences.');
    protocol.workspaceUi = experimentalIsPlainObject(protocol.workspaceUi) ? protocol.workspaceUi : {};
    protocol.workspaceUi.scenePulseWorlds = normalizeScenePulseWorldsPreferences(rawPreferences);
    await ExperimentalWorldsHost.persist();
    return protocol.workspaceUi.scenePulseWorlds;
}

// The native source runtime owns these controls and data structures; Horde
// only persists their explicitly scoped preferences. Source custom-panel
// definitions are promoted to the World schema here, while their values stay
// inside the source tracker snapshot for the active timeline.
async function persistScenePulseSourceRuntimePreferences(world, sess, sourcePreferences = {}, chatPanels = undefined, hasChatPanels = false) {
    const protocol = protocolForSidecarTimeline(world, sess);
    if (!protocol) throw new Error('No World timeline is available for ScenePulse source preferences.');
    protocol.workspaceUi = experimentalIsPlainObject(protocol.workspaceUi) ? protocol.workspaceUi : {};
    const previous = normalizeScenePulseWorldsPreferences(protocol.workspaceUi.scenePulseWorlds || {});
    const incoming = experimentalIsPlainObject(sourcePreferences) ? sourcePreferences : {};
    // Upstream ScenePulse uses the *presence* of chatPanels as the authority
    // signal: an empty array means the author deliberately removed every
    // chat-local panel. Older runtime payloads did not carry that signal, so
    // retain their non-empty-array fallback while the native bridge supplies
    // an explicit flag for all new saves.
    const schema = hasChatPanels === true
        ? (Array.isArray(chatPanels) ? chatPanels : [])
        : (Array.isArray(chatPanels) && chatPanels.length ? chatPanels : incoming.customPanels);
    protocol.workspaceUi.scenePulseWorlds = normalizeScenePulseWorldsPreferences({
        ...previous,
        panels: incoming.panels,
        features: incoming.features,
        dashCards: incoming.dashCards,
        fieldToggles: incoming.fieldToggles,
        reduceEffects: incoming.reduceEffects === true,
        theme: incoming.theme,
        fontScale: incoming.fontScale,
        language: incoming.language,
        setupDismissed: incoming.setupDismissed === true,
        showEmpty: incoming.showEmpty === true,
        thoughtGhost: incoming.thoughtGhost !== false,
        thoughtSnap: incoming.thoughtSnap !== false,
        thoughtFit: incoming.thoughtFit === true,
        thoughtTruncate: incoming.thoughtTruncate === true,
        thoughtWidth: incoming.thoughtWidth,
        thoughtHeight: incoming.thoughtHeight,
        thoughtX: incoming.thoughtX,
        thoughtY: incoming.thoughtY,
        openSections: incoming.openSections,
        customPanels: schema,
        sourceProfiles: incoming.sourceProfiles,
        sourceActiveProfileId: incoming.sourceActiveProfileId
    });
    await ExperimentalWorldsHost.persist();
    return protocol.workspaceUi.scenePulseWorlds;
}

function scenePulseSourceSnapshot(value) {
    if (!experimentalIsPlainObject(value)) throw new Error('ScenePulse source edit did not contain a tracker snapshot.');
    const snapshot = experimentalSafeJsonClone(value);
    // Source runtime metadata describes its rendering path, not evidence.
    // Keep any normal source metadata required by its history tools but do not
    // promote bridge bookkeeping into a human semantic edit.
    if (experimentalIsPlainObject(snapshot._spMeta)) {
        delete snapshot._spMeta.hordeScenePulseBridge;
        delete snapshot._spMeta.hordeSource;
        delete snapshot._spMeta.hordeSnapshotId;
        delete snapshot._spMeta.hordeTurnId;
        delete snapshot._spMeta.hordeLabel;
        delete snapshot._spMeta.hordeCreatedAt;
        delete snapshot._spMeta.hordeHistoryIndex;
    }
    return snapshot;
}

// Quest Journal is a ScenePulse surface, but its source actions can carry a
// real author decision about an existing World quest.  Keep the translation
// deliberately narrow: the native source tracker remains the first place an
// edit is made, then a saved *live* edit updates the World only when the
// connection is already known and unambiguous.  A same-named World quest is
// never silently claimed; it stays Unresolved in Inspect until the author
// chooses to link it or to create a distinct quest.
const SCENEPULSE_QUEST_TIERS = Object.freeze(['mainQuests', 'sideQuests']);

function scenePulseQuestTextKey(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 180);
}

function scenePulseQuestSourceKey(tier, name) {
    const tierKey = SCENEPULSE_QUEST_TIERS.includes(tier) ? tier : 'sideQuests';
    const titleKey = scenePulseQuestTextKey(name);
    return titleKey ? `${tierKey}:${titleKey}` : '';
}

function scenePulseQuestUrgency(value) {
    const urgency = String(value || '').trim().toLowerCase();
    return ['critical', 'high', 'moderate', 'low', 'resolved'].includes(urgency) ? urgency : 'moderate';
}

function scenePulseQuestSourceEntry(tier, raw, index) {
    const name = String(raw?.name || raw?.title || '').trim().slice(0, 200);
    const sourceKey = scenePulseQuestSourceKey(tier, name);
    if (!name || !sourceKey) return null;
    return Object.freeze({
        tier,
        index,
        sourceKey,
        name,
        urgency: scenePulseQuestUrgency(raw?.urgency || raw?.status),
        detail: String(raw?.detail || raw?.description || '').trim().slice(0, 1000)
    });
}

function scenePulseQuestEntries(snapshot = {}, tier) {
    const values = Array.isArray(snapshot?.[tier]) ? snapshot[tier] : [];
    return values.map((item, index) => scenePulseQuestSourceEntry(tier, item, index)).filter(Boolean);
}

function scenePulseQuestSameContent(left, right) {
    return !!left && !!right
        && left.name === right.name
        && left.urgency === right.urgency
        && scenePulseQuestTextKey(left.detail) === scenePulseQuestTextKey(right.detail);
}

function scenePulseQuestSameNonNameContent(left, right) {
    return !!left && !!right
        && left.urgency === right.urgency
        && scenePulseQuestTextKey(left.detail) === scenePulseQuestTextKey(right.detail);
}

function scenePulseQuestChange(operation, before, after, reason = '') {
    const source = after || before;
    if (!source) return null;
    return Object.freeze({
        operation,
        tier: source.tier,
        sourceKey: String(after?.sourceKey || before?.sourceKey || ''),
        previousSourceKey: String(before?.sourceKey || ''),
        sourceQuest: experimentalSafeJsonClone(after || before),
        previousQuest: experimentalSafeJsonClone(before || null),
        reason: String(reason || '').slice(0, 300)
    });
}

// The source tracker has no quest IDs.  Exact name/tier matches are stable;
// a rename is recognised only when its non-name content is uniquely identical.
// Everything else remains scene-only rather than guessing which durable quest
// the author meant.
function scenePulseQuestChanges(before = {}, after = {}) {
    const changes = [];
    for (const tier of SCENEPULSE_QUEST_TIERS) {
        const beforeEntries = scenePulseQuestEntries(before, tier);
        const afterEntries = scenePulseQuestEntries(after, tier);
        const beforeByKey = new Map();
        const afterByKey = new Map();
        beforeEntries.forEach(entry => beforeByKey.set(entry.sourceKey, [...(beforeByKey.get(entry.sourceKey) || []), entry]));
        afterEntries.forEach(entry => afterByKey.set(entry.sourceKey, [...(afterByKey.get(entry.sourceKey) || []), entry]));
        const beforeUnmatched = [];
        const afterUnmatched = [];
        const allKeys = new Set([...beforeByKey.keys(), ...afterByKey.keys()]);
        for (const key of allKeys) {
            const oldEntries = beforeByKey.get(key) || [];
            const newEntries = afterByKey.get(key) || [];
            if (oldEntries.length > 1 || newEntries.length > 1) {
                changes.push(scenePulseQuestChange('unresolved', oldEntries[0] || null, newEntries[0] || null,
                    'ScenePulse has duplicate quest titles in this tier, so no World quest was guessed.'));
                continue;
            }
            const oldEntry = oldEntries[0] || null;
            const newEntry = newEntries[0] || null;
            if (!oldEntry) { afterUnmatched.push(newEntry); continue; }
            if (!newEntry) { beforeUnmatched.push(oldEntry); continue; }
            if (scenePulseQuestSameContent(oldEntry, newEntry)) continue;
            const operation = oldEntry.urgency !== 'resolved' && newEntry.urgency === 'resolved'
                ? 'complete'
                : oldEntry.urgency === 'resolved' && newEntry.urgency !== 'resolved'
                    ? 'restore' : 'update';
            changes.push(scenePulseQuestChange(operation, oldEntry, newEntry));
        }
        // A source name edit preserves all other source fields. Pair only a
        // unique identical-content old/new pair; pairing arbitrary removed
        // and added rows would corrupt an unrelated Horde quest.
        const consumedBefore = new Set();
        const consumedAfter = new Set();
        beforeUnmatched.forEach(oldEntry => {
            const candidates = afterUnmatched.filter(newEntry => !consumedAfter.has(newEntry.sourceKey)
                && scenePulseQuestSameNonNameContent(oldEntry, newEntry));
            if (candidates.length !== 1) return;
            const newEntry = candidates[0];
            consumedBefore.add(oldEntry.sourceKey);
            consumedAfter.add(newEntry.sourceKey);
            changes.push(scenePulseQuestChange('rename', oldEntry, newEntry));
        });
        beforeUnmatched.filter(entry => !consumedBefore.has(entry.sourceKey))
            .forEach(entry => changes.push(scenePulseQuestChange('remove', entry, null)));
        afterUnmatched.filter(entry => !consumedAfter.has(entry.sourceKey))
            .forEach(entry => changes.push(scenePulseQuestChange('add', null, entry)));
    }
    return changes.filter(Boolean).slice(0, 80);
}

function scenePulseQuestLinks(protocol) {
    const raw = Array.isArray(protocol?.scenePulseQuestLinks) ? protocol.scenePulseQuestLinks : [];
    const links = raw.filter(link => experimentalIsPlainObject(link)
        && String(link?.questId || '').trim()
        && Array.isArray(link?.sourceKeys))
        .slice(-500).map(link => ({
            questId: String(link.questId).trim().slice(0, 160),
            sourceKeys: [...new Set(link.sourceKeys.map(value => String(value || '').trim()).filter(value => /^[A-Za-z]+Quests:[a-z0-9 ]{1,180}$/.test(value)))].slice(-32),
            createdAt: String(link.createdAt || '').slice(0, 80),
            updatedAt: String(link.updatedAt || '').slice(0, 80)
        })).filter(link => link.sourceKeys.length);
    protocol.scenePulseQuestLinks = links;
    return links;
}

function scenePulseQuestLinkedRecord(protocol, sourceKey, previousSourceKey = '') {
    const keys = new Set([sourceKey, previousSourceKey].map(value => String(value || '').trim()).filter(Boolean));
    return scenePulseQuestLinks(protocol).find(link => link.sourceKeys.some(key => keys.has(key))) || null;
}

function linkScenePulseQuest(protocol, questId, ...sourceKeys) {
    const keys = [...new Set(sourceKeys.map(value => String(value || '').trim())
        .filter(value => /^[A-Za-z]+Quests:[a-z0-9 ]{1,180}$/.test(value)))];
    if (!keys.length || !questId) return null;
    const links = scenePulseQuestLinks(protocol);
    let link = links.find(item => item.questId === questId || item.sourceKeys.some(key => keys.includes(key)));
    const stamp = new Date().toISOString();
    if (!link) {
        link = { questId: String(questId).slice(0, 160), sourceKeys: [], createdAt: stamp, updatedAt: stamp };
        links.push(link);
    }
    link.questId = String(questId).slice(0, 160);
    link.sourceKeys = [...new Set([...(link.sourceKeys || []), ...keys])].slice(-32);
    link.updatedAt = stamp;
    protocol.scenePulseQuestLinks = links.slice(-500);
    return link;
}

function scenePulseQuestStableId(sourceKey) {
    let hash = 5381;
    for (const char of String(sourceKey || 'scene-pulse-quest')) hash = ((hash << 5) + hash + char.charCodeAt(0)) | 0;
    return `spq_${(hash >>> 0).toString(36)}`;
}

function scenePulseQuestExactTitleCollision(sess, sourceQuest, excludeQuestId = '') {
    const titleKey = questTextKey(sourceQuest?.name);
    if (!titleKey) return null;
    return (sess?.quests || []).find(quest => String(quest?.id || '') !== String(excludeQuestId || '')
        && questTextKey(quest?.title) === titleKey) || null;
}

function scenePulseQuestWorldRecord(world, sess, sourceQuest, link) {
    const status = sourceQuest?.urgency === 'resolved' ? 'completed' : 'active';
    const quest = {
        id: makeQuestId(sess, sourceQuest.name, scenePulseQuestStableId(sourceQuest.sourceKey)),
        title: sourceQuest.name,
        description: sourceQuest.detail,
        giver: '',
        status,
        objectives: [],
        rewards: normalizeQuestRewards(null),
        rewardsGranted: false,
        rewardReceipt: '',
        createdTurn: sess.turnCount || 1,
        updatedTurn: sess.turnCount || 1,
        resolvedTurn: status === 'completed' ? (sess.turnCount || 1) : null,
        rewardGrantedTurn: null,
        completionNote: '',
        scenePulseUrgency: sourceQuest.urgency,
        scenePulseLink: { sourceKeys: [sourceQuest.sourceKey], linkedAt: new Date().toISOString() }
    };
    sess.quests.push(quest);
    linkScenePulseQuest(protocolForSidecarTimeline(world, sess), quest.id, sourceQuest.sourceKey, ...(link?.sourceKeys || []));
    return quest;
}

function scenePulseQuestTranslationResult(change, status, options = {}) {
    return {
        id: `scene-pulse-quest-${crypto.randomUUID()}`,
        type: 'scene_pulse_quest_translation',
        status,
        operation: change.operation,
        tier: change.tier,
        sourceKey: change.sourceKey,
        previousSourceKey: change.previousSourceKey,
        sourceQuest: experimentalSafeJsonClone(change.sourceQuest),
        previousQuest: experimentalSafeJsonClone(change.previousQuest),
        questId: String(options.questId || '').slice(0, 160),
        collisionQuestId: String(options.collisionQuestId || '').slice(0, 160),
        reason: String(options.reason || change.reason || '').slice(0, 600),
        createdAt: new Date().toISOString(),
        sourceEditId: String(options.sourceEditId || '').slice(0, 240),
        targetSnapshotId: String(options.targetSnapshotId || '').slice(0, 240),
        targetTurnId: String(options.targetTurnId || '').slice(0, 240)
    };
}

function applyScenePulseQuestChange(world, sess, protocol, change, options = {}) {
    const sourceQuest = change?.sourceQuest || change?.previousQuest;
    if (!sourceQuest?.name || change.operation === 'unresolved') {
        return scenePulseQuestTranslationResult(change, 'unresolved', { ...options, reason: change.reason || 'This source quest change could not be identified safely.' });
    }
    normalizeQuestState(world, sess);
    const linked = scenePulseQuestLinkedRecord(protocol, change.sourceKey, change.previousSourceKey);
    let quest = linked ? (sess.quests || []).find(item => String(item?.id || '') === linked.questId) : null;
    if (!quest && change.operation === 'add') {
        const collision = scenePulseQuestExactTitleCollision(sess, sourceQuest);
        if (collision && options.choice !== 'link') {
            if (options.choice !== 'create') {
                return scenePulseQuestTranslationResult(change, 'unresolved', {
                    ...options, collisionQuestId: collision.id,
                    reason: 'A World quest already has this exact title. Choose a link or create it separately in Inspect.'
                });
            }
        }
        if (collision && options.choice === 'link') {
            quest = collision;
            linkScenePulseQuest(protocol, quest.id, change.sourceKey, change.previousSourceKey);
        } else {
            quest = scenePulseQuestWorldRecord(world, sess, sourceQuest, linked);
        }
    }
    if (!quest && change.operation === 'remove') {
        return scenePulseQuestTranslationResult(change, 'scene_only', { ...options,
            reason: 'This quest only existed in ScenePulse, so removing it did not alter a World quest.' });
    }
    if (!quest) {
        return scenePulseQuestTranslationResult(change, 'unresolved', { ...options,
            reason: 'This ScenePulse quest has no established World quest link yet.' });
    }
    linkScenePulseQuest(protocol, quest.id, change.sourceKey, change.previousSourceKey, ...(linked?.sourceKeys || []));
    quest.scenePulseLink = { sourceKeys: scenePulseQuestLinkedRecord(protocol, change.sourceKey, change.previousSourceKey)?.sourceKeys || [change.sourceKey], linkedAt: new Date().toISOString() };
    if (change.operation === 'remove') {
        quest.status = 'abandoned';
        quest.resolvedTurn = sess.turnCount || 1;
    } else if (change.operation === 'restore') {
        if (quest.rewardsGranted && formatQuestRewardSummary(quest)) {
            return scenePulseQuestTranslationResult(change, 'unresolved', { ...options, questId: quest.id,
                reason: 'This World quest has already settled rewards, so it cannot be restored automatically.' });
        }
        quest.status = 'active';
        quest.resolvedTurn = null;
        quest.rewardsGranted = false;
        quest.rewardGrantedTurn = null;
        quest.rewardReceipt = '';
        quest.title = sourceQuest.name;
        quest.description = sourceQuest.detail;
        quest.scenePulseUrgency = sourceQuest.urgency;
    } else {
        quest.title = sourceQuest.name;
        quest.description = sourceQuest.detail;
        quest.scenePulseUrgency = sourceQuest.urgency;
        if (change.operation === 'complete') {
            quest.status = 'completed';
            quest.resolvedTurn = sess.turnCount || 1;
            grantQuestRewards(world, sess, quest);
        }
    }
    quest.updatedTurn = sess.turnCount || 1;
    normalizeQuestState(world, sess);
    return scenePulseQuestTranslationResult(change, 'applied', { ...options, questId: quest.id });
}

function scenePulseQuestReviewProjection(protocol, options = {}) {
    const snapshotId = String(options.snapshotId || '');
    const turnId = String(options.turnId || '');
    const sourceEditId = String(options.sourceEditId || '');
    return (Array.isArray(protocol?.scenePulseQuestTranslations) ? protocol.scenePulseQuestTranslations : [])
        .filter(item => item?.type === 'scene_pulse_quest_translation'
            // A source action belongs most precisely to the direct human
            // edit which produced it. Snapshot identity remains the normal
            // history route, but authored edits can form a successor chain
            // whose visible snapshot identity is no longer the original
            // Reader node.
            && (sourceEditId
                ? String(item?.sourceEditId || '') === sourceEditId
                // A settled Reader snapshot is the exact source identity for
                // an edit. Historic/targeted Reader paths can lack a durable
                // turn id, so require it only when no snapshot was supplied.
                : (snapshotId
                    ? String(item?.targetSnapshotId || '') === snapshotId
                    : (!turnId || String(item?.targetTurnId || '') === turnId))))
        .slice(-24).map(item => experimentalSafeJsonClone(item));
}

function applyScenePulseQuestEditTranslations(world, sess, protocol, edit) {
    // A non-fixture accepted snapshot is enough provenance for an explicit
    // source edit.  Do not discard it merely because the selected Reader
    // history point does not retain a parallel turn id; that would leave a
    // visible ScenePulse action with no possible Horde lifecycle path.
    if (!edit?.targetSnapshotId || edit.targetSnapshotId === 'fixture') return [];
    const changes = scenePulseQuestChanges(edit.before, edit.after);
    if (!changes.length) return [];
    const results = changes.map(change => applyScenePulseQuestChange(world, sess, protocol, change, {
        sourceEditId: edit.id,
        targetSnapshotId: edit.targetSnapshotId,
        targetTurnId: edit.targetTurnId
    }));
    protocol.scenePulseQuestTranslations = Array.isArray(protocol.scenePulseQuestTranslations) ? protocol.scenePulseQuestTranslations : [];
    protocol.scenePulseQuestTranslations.push(...results);
    if (protocol.scenePulseQuestTranslations.length > 320) protocol.scenePulseQuestTranslations = protocol.scenePulseQuestTranslations.slice(-320);
    return results;
}

async function resolveScenePulseQuestTranslation(world, sess, translationId, choice = '') {
    const protocol = protocolForSidecarTimeline(world, sess);
    const translation = (protocol?.scenePulseQuestTranslations || []).find(item => String(item?.id || '') === String(translationId || ''));
    if (!translation || translation.status !== 'unresolved') throw new Error('That ScenePulse quest change is no longer awaiting a World decision.');
    if (!['link', 'create'].includes(choice)) throw new Error('Choose whether to link the matching World quest or create a separate one.');
    const change = {
        operation: translation.operation,
        tier: translation.tier,
        sourceKey: translation.sourceKey,
        previousSourceKey: translation.previousSourceKey,
        sourceQuest: experimentalSafeJsonClone(translation.sourceQuest || {}),
        previousQuest: experimentalSafeJsonClone(translation.previousQuest || {}),
        reason: translation.reason || ''
    };
    const outcome = applyScenePulseQuestChange(world, sess, protocol, change, {
        choice,
        sourceEditId: translation.sourceEditId,
        targetSnapshotId: translation.targetSnapshotId,
        targetTurnId: translation.targetTurnId
    });
    if (outcome.status === 'unresolved') throw new Error(outcome.reason || 'The World quest could not be resolved.');
    translation.status = 'resolved';
    translation.resolvedAt = new Date().toISOString();
    translation.resolution = choice;
    translation.resolvedQuestId = outcome.questId || '';
    protocol.scenePulseQuestTranslations.push(outcome);
    if (protocol.scenePulseQuestTranslations.length > 320) protocol.scenePulseQuestTranslations = protocol.scenePulseQuestTranslations.slice(-320);
    await ExperimentalWorldsHost.persist();
    renderWorldPlayState();
    return outcome;
}

// ScenePulse relationships are deliberately more expressive than Horde's
// legacy score/label pair.  Preserve the source's five current meters and
// its compact change vector below the session relationship instead of
// flattening them into an invented affinity score.  This path starts only at
// an explicit source-panel save, and only when the source record carries a
// stable identity which has already been linked or promoted in Horde.
const SCENEPULSE_RELATIONSHIP_METERS = Object.freeze([
    'affection', 'trust', 'desire', 'stress', 'compatibility'
]);
const SCENEPULSE_RELATIONSHIP_TEXT_FIELDS = Object.freeze([
    'name', 'relType', 'relPhase', 'timeTogether', 'milestone'
]);

function scenePulseRelationshipSafeId(value) {
    const id = String(value || '').trim();
    return /^[A-Za-z0-9_.:-]{1,180}$/.test(id) ? id : '';
}

function scenePulseRelationshipMeter(value) {
    if (value === undefined || value === null || value === '') return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    // Native ScenePulse uses -1 as its explicit N/A meter state. Retain it
    // distinctly rather than coercing it to a false zero.
    if (numeric === -1) return -1;
    return Math.max(0, Math.min(100, Math.round(numeric * 100) / 100));
}

function scenePulseRelationshipSourceEntry(raw, index = 0) {
    if (!experimentalIsPlainObject(raw)) return null;
    const relationshipId = scenePulseRelationshipSafeId(raw.relationshipId || raw.relationship_id || raw.id);
    const characterId = scenePulseRelationshipSafeId(raw.characterId || raw.character_id || raw.subjectRef || raw.subject_ref);
    const identityKind = relationshipId ? 'relationship' : characterId ? 'character' : 'unlinked';
    const sourceKey = relationshipId ? `relationship:${relationshipId}`
        : characterId ? `character:${characterId}`
            // An unlinked item is included in the review trail so an explicit
            // source edit is not silently lost. It can never mutate Horde.
            : `unlinked:${Math.max(0, Number(index) || 0)}`;
    const text = (value, limit) => String(value || '').trim().slice(0, limit);
    const meters = {};
    const labels = {};
    SCENEPULSE_RELATIONSHIP_METERS.forEach(key => {
        meters[key] = scenePulseRelationshipMeter(raw[key]);
        labels[key] = text(raw[`${key}Label`] || raw[`${key}label`], 180);
    });
    return Object.freeze({
        sourceKey, identityKind, relationshipId, characterId,
        name: text(raw.name || raw.character || '', 240),
        relType: text(raw.relType || raw.type || '', 180),
        relPhase: text(raw.relPhase || raw.phase || '', 180),
        timeTogether: text(raw.timeTogether || raw.duration || raw.known || '', 240),
        milestone: text(raw.milestone || raw.nextMilestone || '', 1_200),
        meters, labels
    });
}

function scenePulseRelationshipEntries(snapshot = {}) {
    return (Array.isArray(snapshot?.relationships) ? snapshot.relationships : [])
        .map((raw, index) => scenePulseRelationshipSourceEntry(raw, index)).filter(Boolean);
}

function scenePulseRelationshipEqual(left, right) {
    if (!left || !right) return false;
    const comparable = entry => ({
        name: entry.name, relType: entry.relType, relPhase: entry.relPhase,
        timeTogether: entry.timeTogether, milestone: entry.milestone,
        meters: entry.meters, labels: entry.labels
    });
    return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

function scenePulseRelationshipChangedMeters(before, after) {
    const result = {};
    SCENEPULSE_RELATIONSHIP_METERS.forEach(key => {
        const previous = before?.meters?.[key] ?? null;
        const current = after?.meters?.[key] ?? null;
        if (previous === current || previous === null || current === null || previous === -1 || current === -1) return;
        result[key] = Math.round((current - previous) * 100) / 100;
    });
    return result;
}

function scenePulseRelationshipChangedFields(before, after) {
    const fields = [];
    SCENEPULSE_RELATIONSHIP_TEXT_FIELDS.slice(1).forEach(key => {
        if (String(before?.[key] || '') !== String(after?.[key] || '')) fields.push(key);
    });
    SCENEPULSE_RELATIONSHIP_METERS.forEach(key => {
        if (before?.meters?.[key] !== after?.meters?.[key]) fields.push(key);
        if (String(before?.labels?.[key] || '') !== String(after?.labels?.[key] || '')) fields.push(`${key}Label`);
    });
    return fields;
}

function scenePulseRelationshipChange(operation, before, after, reason = '') {
    const source = after || before;
    if (!source) return null;
    return Object.freeze({
        operation,
        sourceKey: String(source.sourceKey || ''),
        previousSourceKey: String(before?.sourceKey || ''),
        sourceRelationship: experimentalSafeJsonClone(after || before),
        previousRelationship: experimentalSafeJsonClone(before || null),
        meterDeltas: experimentalSafeJsonClone(scenePulseRelationshipChangedMeters(before, after)),
        changedFields: scenePulseRelationshipChangedFields(before || {}, after || {}),
        reason: String(reason || '').slice(0, 400)
    });
}

// Stable source identity is mandatory for a World translation. A name may
// still render beautifully in ScenePulse, but it is never an identity key.
function scenePulseRelationshipChanges(before = {}, after = {}) {
    const changes = [];
    const index = entries => entries.reduce((map, entry) => {
        const values = map.get(entry.sourceKey) || [];
        values.push(entry);
        map.set(entry.sourceKey, values);
        return map;
    }, new Map());
    const prior = index(scenePulseRelationshipEntries(before));
    const next = index(scenePulseRelationshipEntries(after));
    const keys = new Set([...prior.keys(), ...next.keys()]);
    keys.forEach(key => {
        const oldEntries = prior.get(key) || [];
        const newEntries = next.get(key) || [];
        if (oldEntries.length > 1 || newEntries.length > 1) {
            changes.push(scenePulseRelationshipChange('unresolved', oldEntries[0] || null, newEntries[0] || null,
                'Duplicate ScenePulse relationship identities cannot be translated into one World relationship.'));
            return;
        }
        const oldEntry = oldEntries[0] || null;
        const newEntry = newEntries[0] || null;
        if (!oldEntry) changes.push(scenePulseRelationshipChange('add', null, newEntry));
        else if (!newEntry) changes.push(scenePulseRelationshipChange('remove', oldEntry, null));
        else if (!scenePulseRelationshipEqual(oldEntry, newEntry)) changes.push(scenePulseRelationshipChange('update', oldEntry, newEntry));
    });
    return changes.filter(Boolean).slice(0, 80);
}

function scenePulseRelationshipLinks(protocol) {
    const links = (Array.isArray(protocol?.scenePulseRelationshipLinks) ? protocol.scenePulseRelationshipLinks : [])
        .filter(link => experimentalIsPlainObject(link))
        .map(link => ({
            sourceKeys: [...new Set((Array.isArray(link.sourceKeys) ? link.sourceKeys : [])
                .map(value => String(value || '').trim())
                .filter(value => /^(?:relationship|character):[A-Za-z0-9_.:-]{1,180}$/.test(value)))].slice(-12),
            controlledEntityId: String(link.controlledEntityId || '').trim().slice(0, 180),
            targetEntityId: String(link.targetEntityId || '').trim().slice(0, 180),
            createdAt: String(link.createdAt || '').slice(0, 80),
            updatedAt: String(link.updatedAt || '').slice(0, 80)
        }))
        .filter(link => link.sourceKeys.length && link.controlledEntityId && link.targetEntityId)
        .slice(-500);
    if (protocol) protocol.scenePulseRelationshipLinks = links;
    return links;
}

function scenePulseRelationshipSourceKeys(entry = {}) {
    const keys = [];
    if (entry.relationshipId) keys.push(`relationship:${entry.relationshipId}`);
    if (entry.characterId) keys.push(`character:${entry.characterId}`);
    return keys;
}

function linkScenePulseRelationship(protocol, controlledEntityId, targetEntityId, ...sourceKeys) {
    const keys = [...new Set(sourceKeys.flat().map(value => String(value || '').trim())
        .filter(value => /^(?:relationship|character):[A-Za-z0-9_.:-]{1,180}$/.test(value)))];
    if (!protocol || !keys.length || !controlledEntityId || !targetEntityId) return null;
    const links = scenePulseRelationshipLinks(protocol);
    let link = links.find(item => item.controlledEntityId === controlledEntityId
        && item.targetEntityId === targetEntityId
        && item.sourceKeys.some(key => keys.includes(key)));
    const stamp = new Date().toISOString();
    if (!link) {
        link = { sourceKeys: [], controlledEntityId, targetEntityId, createdAt: stamp, updatedAt: stamp };
        links.push(link);
    }
    link.sourceKeys = [...new Set([...(link.sourceKeys || []), ...keys])].slice(-12);
    link.updatedAt = stamp;
    protocol.scenePulseRelationshipLinks = links.slice(-500);
    return link;
}

function scenePulseRelationshipControlledEntity(world, sess, protocol) {
    const activeSequence = (Array.isArray(protocol?.sequences) ? protocol.sequences : [])
        .find(sequence => String(sequence?.id || '') === String(protocol?.activeSequenceId || '')) || null;
    const id = String(activeSequence?.controlledEntityId || sess?.controlledEntityId || 'player').trim();
    if (!id) return null;
    if (id === 'player') return { id, name: String(sess?.playerIdentity?.name || 'Player') };
    return (world?.entities || []).find(entity => String(entity?.id || '') === id
        && ['npc', 'character', 'person'].includes(String(entity?.type || '').toLowerCase())) || null;
}

// Resolve only explicit edges: an established link, a promoted Reader
// candidate id, or a source characterId which exactly is a World entity id.
// Display names/aliases deliberately do not participate.
function scenePulseRelationshipTarget(world, sess, protocol, entry) {
    const controlled = scenePulseRelationshipControlledEntity(world, sess, protocol);
    if (!controlled) return { reason: 'The current controlled character has no stable World identity.' };
    const keys = scenePulseRelationshipSourceKeys(entry);
    const people = (world?.entities || []).filter(entity => ['npc', 'character', 'person']
        .includes(String(entity?.type || '').toLowerCase()));
    const byId = new Map(people.map(entity => [String(entity.id || ''), entity]));
    const linked = scenePulseRelationshipLinks(protocol).find(link => link.controlledEntityId === controlled.id
        && link.sourceKeys.some(key => keys.includes(key)));
    if (linked) {
        const target = byId.get(linked.targetEntityId);
        if (target && target.id !== controlled.id) return { controlled, target, source: 'established_relationship_link' };
    }
    const candidateId = String(entry?.characterId || '').trim();
    const candidateMatches = (Array.isArray(protocol?.readerCandidates) ? protocol.readerCandidates : [])
        .filter(candidate => candidate?.candidateType === 'character'
            && String(candidate?.candidateId || '') === candidateId
            && ['matched', 'promoted'].includes(String(candidate?.status || '').toLowerCase())
            && byId.has(String(candidate?.canonicalMatchId || '')));
    const candidateTargetIds = [...new Set(candidateMatches.map(candidate => String(candidate.canonicalMatchId)))];
    if (candidateTargetIds.length === 1) {
        const target = byId.get(candidateTargetIds[0]);
        if (target && target.id !== controlled.id) return { controlled, target, source: 'promoted_scene_candidate' };
    }
    const direct = candidateId ? byId.get(candidateId) : null;
    if (direct && direct.id !== controlled.id) return { controlled, target: direct, source: 'exact_source_character_id' };
    if (entry?.identityKind === 'unlinked') return { reason: 'This ScenePulse relationship has no stable relationshipId or characterId yet.' };
    return { reason: 'This ScenePulse relationship is still scene-only because its stable character identity has not been linked or promoted.' };
}

function scenePulseRelationshipTranslationResult(change, status, options = {}) {
    return {
        id: `scene-pulse-relationship-${crypto.randomUUID()}`,
        type: 'scene_pulse_relationship_translation', status,
        operation: String(change?.operation || 'update'),
        sourceKey: String(change?.sourceKey || '').slice(0, 240),
        previousSourceKey: String(change?.previousSourceKey || '').slice(0, 240),
        sourceRelationship: experimentalSafeJsonClone(change?.sourceRelationship || {}),
        previousRelationship: experimentalSafeJsonClone(change?.previousRelationship || null),
        meterDeltas: experimentalSafeJsonClone(change?.meterDeltas || {}),
        changedFields: experimentalSafeJsonClone(change?.changedFields || []),
        relationshipKey: String(options.relationshipKey || '').slice(0, 400),
        controlledEntityId: String(options.controlledEntityId || '').slice(0, 180),
        targetEntityId: String(options.targetEntityId || '').slice(0, 180),
        targetName: String(options.targetName || '').slice(0, 240),
        reason: String(options.reason || change?.reason || '').slice(0, 700),
        createdAt: new Date().toISOString(),
        sourceEditId: String(options.sourceEditId || '').slice(0, 240),
        targetSnapshotId: String(options.targetSnapshotId || '').slice(0, 240),
        targetTurnId: String(options.targetTurnId || '').slice(0, 240)
    };
}

function applyScenePulseRelationshipChange(world, sess, protocol, change, options = {}) {
    const source = change?.sourceRelationship || change?.previousRelationship;
    if (!source || change?.operation === 'unresolved') {
        return scenePulseRelationshipTranslationResult(change, 'unresolved', {
            ...options, reason: change?.reason || 'This ScenePulse relationship change could not be identified safely.'
        });
    }
    const resolution = scenePulseRelationshipTarget(world, sess, protocol, source);
    if (!resolution.controlled || !resolution.target) {
        return scenePulseRelationshipTranslationResult(change, 'scene_only', {
            ...options, reason: resolution.reason || 'This relationship is still represented only in ScenePulse.'
        });
    }
    const key = relationshipKey(resolution.controlled.id, resolution.target.id);
    if (!experimentalIsPlainObject(sess.npcRelationships)) sess.npcRelationships = {};
    const existing = experimentalIsPlainObject(sess.npcRelationships[key]) ? sess.npcRelationships[key] : null;
    if (change.operation === 'remove' && !existing) {
        return scenePulseRelationshipTranslationResult(change, 'scene_only', {
            ...options, relationshipKey: key, controlledEntityId: resolution.controlled.id,
            targetEntityId: resolution.target.id, targetName: resolution.target.name,
            reason: 'The relationship was removed from the ScenePulse scene, but Horde had no established relationship state to retire.'
        });
    }
    const record = existing || { score: 0, label: '', reason: '', lastChangedTurn: 0, autoManaged: false };
    const previousScenePulse = experimentalIsPlainObject(record.scenePulse) ? record.scenePulse : {};
    const history = Array.isArray(previousScenePulse.history) ? previousScenePulse.history.slice(-47) : [];
    const relationSnapshot = experimentalSafeJsonClone(source);
    const event = {
        at: new Date().toISOString(), operation: change.operation,
        sourceEditId: String(options.sourceEditId || ''), targetSnapshotId: String(options.targetSnapshotId || ''),
        targetTurnId: String(options.targetTurnId || ''), meterDeltas: experimentalSafeJsonClone(change.meterDeltas || {}),
        changedFields: experimentalSafeJsonClone(change.changedFields || []), relationship: relationSnapshot
    };
    history.push(event);
    // Source removal is a current-scene change, not evidence that a Person's
    // prior relationship should be deleted. Keep the last rich state as
    // historical and let a later explicit World action govern real removal.
    record.scenePulse = change.operation === 'remove'
        ? {
            ...previousScenePulse, sourceKey: source.sourceKey, relationshipId: source.relationshipId || '',
            characterId: source.characterId || '', name: source.name || previousScenePulse.name || '',
            status: 'historical', lastSeenAt: event.at, lastSourceTurnId: event.targetTurnId,
            lastSourceSnapshotId: event.targetSnapshotId, lastMeterDeltas: {}, history
        }
        : {
            version: 1, sourceKey: source.sourceKey, relationshipId: source.relationshipId || '',
            characterId: source.characterId || '', name: source.name || '', status: 'current',
            relType: source.relType || '', relPhase: source.relPhase || '', timeTogether: source.timeTogether || '',
            milestone: source.milestone || '', meters: experimentalSafeJsonClone(source.meters || {}), labels: experimentalSafeJsonClone(source.labels || {}),
            lastMeterDeltas: experimentalSafeJsonClone(change.meterDeltas || {}), lastChangedFields: experimentalSafeJsonClone(change.changedFields || []),
            lastSeenAt: event.at, lastSourceTurnId: event.targetTurnId, lastSourceSnapshotId: event.targetSnapshotId,
            source: 'explicit_scenepulse_relationship_edit', history
        };
    sess.npcRelationships[key] = record;
    linkScenePulseRelationship(protocol, resolution.controlled.id, resolution.target.id, scenePulseRelationshipSourceKeys(source));
    return scenePulseRelationshipTranslationResult(change, 'applied', {
        ...options, relationshipKey: key, controlledEntityId: resolution.controlled.id,
        targetEntityId: resolution.target.id, targetName: resolution.target.name,
        reason: change.operation === 'remove'
            ? 'The current ScenePulse relationship was retired while its prior rich state remains in Horde history.'
            : `Saved ScenePulse relationship dimensions for ${resolution.target.name || resolution.target.id}; only changed meters are retained as deltas.`
    });
}

function scenePulseRelationshipReviewProjection(protocol, options = {}) {
    const snapshotId = String(options.snapshotId || '');
    const turnId = String(options.turnId || '');
    return (Array.isArray(protocol?.scenePulseRelationshipTranslations) ? protocol.scenePulseRelationshipTranslations : [])
        .filter(item => item?.type === 'scene_pulse_relationship_translation'
            && (!snapshotId || String(item?.targetSnapshotId || '') === snapshotId)
            && (!turnId || String(item?.targetTurnId || '') === turnId))
        .slice(-32).map(item => experimentalSafeJsonClone(item));
}

function applyScenePulseRelationshipEditTranslations(world, sess, protocol, edit) {
    if (!edit?.targetTurnId || edit.targetSnapshotId === 'fixture') return [];
    const changes = scenePulseRelationshipChanges(edit.before, edit.after);
    if (!changes.length) return [];
    const results = changes.map(change => applyScenePulseRelationshipChange(world, sess, protocol, change, {
        sourceEditId: edit.id, targetSnapshotId: edit.targetSnapshotId, targetTurnId: edit.targetTurnId
    }));
    protocol.scenePulseRelationshipTranslations = Array.isArray(protocol.scenePulseRelationshipTranslations)
        ? protocol.scenePulseRelationshipTranslations : [];
    protocol.scenePulseRelationshipTranslations.push(...results);
    if (protocol.scenePulseRelationshipTranslations.length > 320) {
        protocol.scenePulseRelationshipTranslations = protocol.scenePulseRelationshipTranslations.slice(-320);
    }
    return results;
}

// Narration needs the useful relationship signal, not the full audit trail.
// Feed only the current source dimensions and their most recent compact delta
// into the active-cast context. This lets a model distinguish “trust 38” from
// “trust rose by 13” without confusing an old history entry for present state.
function scenePulseRelationshipPromptProjection(sess, relevantEntityIds = [], controlledEntityId = 'player') {
    const relevant = new Set([controlledEntityId, ...(Array.isArray(relevantEntityIds) ? relevantEntityIds : [])]
        .map(value => String(value || '').trim()).filter(Boolean));
    return Object.entries(experimentalIsPlainObject(sess?.npcRelationships) ? sess.npcRelationships : {})
        .map(([key, record]) => {
            const source = experimentalIsPlainObject(record?.scenePulse) ? record.scenePulse : null;
            if (!source || String(source.status || '') !== 'current') return null;
            const participants = String(key || '').split('|').filter(Boolean);
            if (participants.length !== 2 || !participants.some(id => relevant.has(id))) return null;
            const meters = {};
            const labels = {};
            const deltas = {};
            SCENEPULSE_RELATIONSHIP_METERS.forEach(meter => {
                const value = scenePulseRelationshipMeter(source?.meters?.[meter]);
                if (value !== null) meters[meter] = value;
                const label = String(source?.labels?.[meter] || '').trim().slice(0, 180);
                if (label) labels[meter] = label;
                const delta = Number(source?.lastMeterDeltas?.[meter]);
                if (Number.isFinite(delta) && delta !== 0) deltas[meter] = Math.round(delta * 100) / 100;
            });
            return {
                between: participants, status: String(source.status || '').slice(0, 40),
                sourceKey: String(source.sourceKey || '').slice(0, 240), name: String(source.name || '').slice(0, 240),
                relType: String(source.relType || '').slice(0, 180), relPhase: String(source.relPhase || '').slice(0, 180),
                timeTogether: String(source.timeTogether || '').slice(0, 240), milestone: String(source.milestone || '').slice(0, 1_200),
                meters, labels, lastMeterDeltas: deltas,
                sourceTurnId: String(source.lastSourceTurnId || '').slice(0, 180)
            };
        }).filter(Boolean).slice(-12);
}

// A human source-panel save is part of the authored scene-state record. Keep
// its compact patch available to both upcoming model lanes, without sending
// the sealed tutorial fixture or calling the change a user-interface event.
function scenePulseHumanStatePromptContext(protocol = null) {
    const edits = (Array.isArray(protocol?.scenePulseHumanEdits) ? protocol.scenePulseHumanEdits : [])
        .filter(edit => edit?.status === 'active' && edit?.author === 'human' && Array.isArray(edit?.rawPatch) && edit.rawPatch.length)
        .slice(-12)
        .map(edit => ({
            id: String(edit.id || ''),
            at: String(edit.createdAt || ''),
            sourceTurnId: String(edit.targetTurnId || ''),
            sceneStatePatch: experimentalSafeJsonClone(edit.rawPatch)
        }));
    if (!edits.length) return '';
    return `\n\n[AUTHOR-SET SCENE STATE]\nThe author has explicitly set the following current scene-state values. Treat these as authored state for continuity and as the base for future compact ScenePulse deltas. They are not narration, do not describe them as editing, and do not treat them as a canonical-world commit without supporting visible story evidence. A later explicit authored beat may supersede them.\n${JSON.stringify(edits)}`;
}

// Direct ScenePulse editing is deliberately a human tracker event—not a
// Reader result and not a silent mutation of canonical World state. It keeps
// the exact before/after snapshots and the native source's compact top-level
// patch, making it inspectable, promptable, and undoable as a history node.
async function commitScenePulseSourceEdit(world, sess, payload = {}) {
    const protocol = protocolForSidecarTimeline(world, sess);
    if (!protocol) throw new Error('No World timeline is available for this ScenePulse edit.');
    const before = scenePulseSourceSnapshot(payload.before);
    const after = scenePulseSourceSnapshot(payload.after);
    const patch = Array.isArray(payload.patch) ? experimentalSafeJsonClone(payload.patch).slice(0, 240) : [];
    if (!patch.length) return { saved: false, reason: 'no_tracker_change' };
    const serializedSize = JSON.stringify({ before, after, patch }).length;
    if (serializedSize > 1_500_000) throw new Error('ScenePulse edit is too large to preserve safely in timeline history.');
    const stamp = new Date().toISOString();
    const targetSnapshotId = String(payload.targetSnapshotId || 'fixture').slice(0, 240);
    const targetTurnId = String(payload.targetTurnId || '').slice(0, 240);
    const edit = {
        id: `scene-pulse-human-edit-${crypto.randomUUID()}`,
        type: 'scene_pulse_human_edit',
        status: 'active',
        author: 'human',
        createdAt: stamp,
        targetSnapshotId,
        targetTurnId,
        sourceRuntime: String(payload?.source?.runtime || 'native-source-modules-via-horde-compatibility-scaffold').slice(0, 180),
        sourceRevision: String(payload?.source?.revision || '').slice(0, 80),
        before,
        after,
        rawPatch: patch,
        undo: Object.freeze({ action: 'restore_scene_pulse_snapshot', targetSnapshotId, restore: before })
    };
    protocol.scenePulseHumanEdits = Array.isArray(protocol.scenePulseHumanEdits) ? protocol.scenePulseHumanEdits : [];
    protocol.scenePulseHumanEdits.push(edit);
    // Keep a bounded audit trail without deleting the only active overlay.
    if (protocol.scenePulseHumanEdits.length > 160) protocol.scenePulseHumanEdits = protocol.scenePulseHumanEdits.slice(-160);
    // A saved edit is the explicit author boundary for native ScenePulse
    // controls. Translate only explicit Quest Journal and relationship-source
    // edits: ordinary source fields remain scene presentation. Quest title
    // collisions and unlinked relationship identities remain visible in
    // Inspect instead of being guessed or duplicated.
    const questTranslations = applyScenePulseQuestEditTranslations(world, sess, protocol, edit);
    const relationshipTranslations = applyScenePulseRelationshipEditTranslations(world, sess, protocol, edit);
    // The human edit is the durable authored-history node. Keep the compact
    // outcomes on that node as well as in the timeline-wide action ledger:
    // a later protocol migration or filtered historic projection must never
    // make a successfully saved ScenePulse action disappear after reload.
    edit.questReview = experimentalSafeJsonClone(questTranslations);
    edit.relationshipReview = experimentalSafeJsonClone(relationshipTranslations);
    await ExperimentalWorldsHost.persist();
    return {
        saved: true, id: edit.id, edit,
        questTranslations: experimentalSafeJsonClone(questTranslations),
        relationshipTranslations: experimentalSafeJsonClone(relationshipTranslations)
    };
}

function scenePulseHumanReviewRecords(edit, projected, persistedKey) {
    const persisted = Array.isArray(edit?.[persistedKey]) ? edit[persistedKey] : [];
    const records = new Map();
    // Retain the action that was committed with this edit even if a historic
    // protocol projection cannot be reconstructed. A current projection wins
    // for the same record, so an unresolved action still reflects its later
    // author-chosen resolution.
    persisted.forEach((record, index) => {
        const id = String(record?.id || `saved-${index}`);
        records.set(id, experimentalSafeJsonClone(record));
    });
    (Array.isArray(projected) ? projected : []).forEach((record, index) => {
        const id = String(record?.id || `projected-${index}`);
        records.set(id, experimentalSafeJsonClone(record));
    });
    return [...records.values()].slice(-24);
}

function scenePulseHumanHistoryEntry(protocol, edit) {
    const snapshotId = String(edit?.targetSnapshotId || '');
    const turnId = String(edit?.targetTurnId || '');
    return {
        id: String(edit?.id || ''),
        label: 'Human ScenePulse edit',
        current: false,
        createdAt: edit?.createdAt || '',
        summary: `Human tracker edit: ${(edit?.rawPatch || []).map(change => change?.key).filter(Boolean).join(', ') || 'source fields'}`,
        turnId,
        scenePulse: experimentalSafeJsonClone(edit?.after || {}),
        previousScenePulse: experimentalSafeJsonClone(edit?.before || {}),
        deltaScenePulse: experimentalSafeJsonClone(edit?.rawPatch || []),
        clearFields: [],
        replaceCollections: [],
        // A human edit is a separate source-history node, but its World
        // review belongs to the accepted Reader snapshot it deliberately
        // changed. Carry that compact review forward so Inspect never makes
        // a saved quest action vanish merely because the source is viewing
        // its authored successor rather than the Reader node itself.
        questReview: scenePulseHumanReviewRecords(edit,
            scenePulseQuestReviewProjection(protocol, { snapshotId, turnId, sourceEditId: edit?.id }), 'questReview'),
        relationshipReview: scenePulseHumanReviewRecords(edit,
            scenePulseRelationshipReviewProjection(protocol, { snapshotId, turnId }), 'relationshipReview')
    };
}

function scenePulseHumanHistory(protocol, handoff, edits) {
    const sourceHistory = Array.isArray(handoff?.history) ? experimentalSafeJsonClone(handoff.history) : [];
    if (!sourceHistory.length || !edits.length) return sourceHistory;
    const childrenByTarget = new Map();
    edits.forEach(edit => {
        const target = String(edit?.targetSnapshotId || '');
        if (!target) return;
        const children = childrenByTarget.get(target) || [];
        children.push(edit);
        childrenByTarget.set(target, children);
    });
    childrenByTarget.forEach(children => children.sort((left, right) =>
        String(left?.createdAt || '').localeCompare(String(right?.createdAt || ''))));
    const history = [];
    const visited = new Set();
    const appendWithEdits = entry => {
        if (!entry || visited.has(String(entry.id || ''))) return;
        visited.add(String(entry.id || ''));
        history.push(entry);
        (childrenByTarget.get(String(entry.id || '')) || []).forEach(edit =>
            appendWithEdits(scenePulseHumanHistoryEntry(protocol, edit)));
    };
    sourceHistory.forEach(appendWithEdits);
    return history;
}

function scenePulseCurrentHumanSuccessor(edits, snapshotId) {
    let current = edits.filter(item => String(item?.targetSnapshotId || '') === String(snapshotId || '')).at(-1);
    const visited = new Set();
    while (current?.id && !visited.has(String(current.id))) {
        visited.add(String(current.id));
        const successor = edits.filter(item => String(item?.targetSnapshotId || '') === String(current.id)).at(-1);
        if (!successor) break;
        current = successor;
    }
    return current || null;
}

function scenePulseHumanOverlay(protocol, handoff) {
    const edits = (Array.isArray(protocol?.scenePulseHumanEdits) ? protocol.scenePulseHumanEdits : [])
        .filter(item => item?.status === 'active' && experimentalIsPlainObject(item?.after))
        .sort((left, right) => String(left?.createdAt || '').localeCompare(String(right?.createdAt || '')));
    const currentSnapshotId = String(handoff?.provenance?.snapshotId || (handoff?.status === 'accepted_fixture' ? 'fixture' : ''));
    // Every direct save is a successor of the exact scene state the author
    // was viewing. If an author saves again before a Reader pass, that newer
    // edit targets the prior human node, not the original Reader snapshot.
    // Follow that explicit chain to its tip so the foreground and Inspect
    // describe the latest authored state rather than silently showing an
    // ancestor.
    const currentEdit = scenePulseCurrentHumanSuccessor(edits, currentSnapshotId);
    const history = scenePulseHumanHistory(protocol, handoff, edits);
    if (!currentEdit) {
        if (history.length === (Array.isArray(handoff?.history) ? handoff.history.length : 0)) return handoff;
        return Object.freeze({ ...handoff, history });
    }
    // The fixture has no Reader history to anchor an edit to. Once a real
    // scene exists, every authored source edit is inserted immediately after
    // the precise accepted Reader snapshot it changed (including chains of
    // edits made while reviewing that history point).
    if (!history.some(entry => String(entry?.id || '') === String(currentEdit.id || ''))) {
        history.push(scenePulseHumanHistoryEntry(protocol, currentEdit));
    }
    return Object.freeze({
        ...handoff,
        id: `${handoff?.id || 'scenepulse'}:${currentEdit.id}`,
        status: 'accepted_human',
        fixtureScenePulse: experimentalSafeJsonClone(handoff?.fixtureScenePulse || handoff?.scenePulse || {}),
        // The native source panel renders the human selected snapshot. The
        // unmodified Sidecar reading remains separately available for the
        // visible comparison rather than being overwritten in place.
        sidecarScenePulse: experimentalSafeJsonClone(handoff?.scenePulse || {}),
        scenePulse: experimentalSafeJsonClone(currentEdit.after),
        history,
        // Inspecting the current authored successor must retain the exact
        // World outcomes produced by this save.  Without this projection the
        // action exists in Horde but vanishes from the panel that initiated
        // it until the author happens to select the preceding Reader node.
        questReview: scenePulseHumanReviewRecords(currentEdit,
            scenePulseQuestReviewProjection(protocol, {
                snapshotId: currentSnapshotId,
                turnId: String(currentEdit.targetTurnId || ''),
                sourceEditId: currentEdit.id
            }), 'questReview'),
        relationshipReview: scenePulseHumanReviewRecords(currentEdit,
            scenePulseRelationshipReviewProjection(protocol, {
                snapshotId: currentSnapshotId,
                turnId: String(currentEdit.targetTurnId || '')
            }), 'relationshipReview'),
        humanEdit: Object.freeze({ id: currentEdit.id, author: 'human', createdAt: currentEdit.createdAt, rawPatch: experimentalSafeJsonClone(currentEdit.rawPatch || []), undo: experimentalSafeJsonClone(currentEdit.undo || {}) }),
        provenance: Object.freeze({ ...(handoff?.provenance || {}), humanEditId: currentEdit.id, source: 'human_scene_pulse_edit' })
    });
}

async function saveScenePulsePortraitOverride(world, sess, payload = {}) {
    const identity = String(payload?.identity || '').trim();
    if (!/^(?:reader|fixture):[A-Za-z0-9_.:-]{1,180}$/.test(identity)) throw new Error('ScenePulse portrait identity is invalid.');
    const data = String(payload?.data || '');
    if (!/^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i.test(data)) throw new Error('Choose an embedded image file for the ScenePulse portrait.');
    const protocol = protocolForSidecarTimeline(world, sess);
    if (!protocol) throw new Error('No World timeline is available for this ScenePulse portrait.');
    const assetId = addWorldMediaAsset(world, data, 'scenepulse_portrait', String(payload?.label || 'ScenePulse portrait').slice(0, 240), {
        prompt: `Manual ScenePulse portrait override for ${identity}. This is presentation media, not Reader evidence.`
    });
    protocol.workspaceUi = experimentalIsPlainObject(protocol.workspaceUi) ? protocol.workspaceUi : {};
    const preferences = normalizeScenePulseWorldsPreferences(protocol.workspaceUi.scenePulseWorlds || {});
    preferences.portraitAssetIds[identity] = assetId;
    protocol.workspaceUi.scenePulseWorlds = normalizeScenePulseWorldsPreferences(preferences);
    await ExperimentalWorldsHost.persist();
    return { assetId, source: worldMediaSource(world, assetId) };
}

async function clearScenePulsePortraitOverride(world, sess, payload = {}) {
    const identity = String(payload?.identity || '').trim();
    if (!/^(?:reader|fixture):[A-Za-z0-9_.:-]{1,180}$/.test(identity)) throw new Error('ScenePulse portrait identity is invalid.');
    const protocol = protocolForSidecarTimeline(world, sess);
    if (!protocol) throw new Error('No World timeline is available for this ScenePulse portrait.');
    protocol.workspaceUi = experimentalIsPlainObject(protocol.workspaceUi) ? protocol.workspaceUi : {};
    const preferences = normalizeScenePulseWorldsPreferences(protocol.workspaceUi.scenePulseWorlds || {});
    delete preferences.portraitAssetIds[identity];
    // Retain the shared/reusable media asset. Clearing an override changes
    // only this ScenePulse association and cannot unexpectedly delete media.
    protocol.workspaceUi.scenePulseWorlds = normalizeScenePulseWorldsPreferences(preferences);
    await ExperimentalWorldsHost.persist();
    return { identity };
}

// The imported ScenePulse surface emits this small, named boundary event for
// actions that belong to Horde.  It has no direct composer/session knowledge:
// Horde claims only recognized actions and returns the promise that represents
// the real result.  Replacing the handler per render keeps its World/session
// closure exact without accumulating duplicate listeners.
function bindScenePulseWorldsHostActions(host, world, sess) {
    const prior = host.__scenePulseHostActionHandler;
    if (prior) host.removeEventListener('horde-scenepulse-action', prior);
    const handler = event => {
        const detail = event?.detail;
        if (!detail || typeof detail !== 'object') return;
        if (detail.action === 'stage-story-idea') {
            event.preventDefault();
            detail.promise = Promise.resolve().then(() => stageScenePulseStoryIdea({ direction: detail.direction, inject: detail.inject === true }));
            return;
        }
        if (detail.action === 'refresh-scene-pulse') {
            event.preventDefault();
            detail.promise = Promise.resolve().then(() => refreshAcceptedScenePulseProjection(world, sess, {
                section: detail.section || '', forceFull: detail.forceFull === true
            }));
            return;
        }
        if (detail.action === 'stop-scene-pulse-refresh') {
            event.preventDefault();
            detail.promise = Promise.resolve().then(() => stopScenePulseReaderRefresh());
            return;
        }
        if (detail.action === 'stage-scenepulse-candidate-review') {
            event.preventDefault();
            detail.promise = Promise.resolve().then(() => stageScenePulseCandidateForWorldReview(world, sess, detail.candidateId));
            return;
        }
        if (detail.action === 'promote-scenepulse-candidate') {
            event.preventDefault();
            detail.promise = Promise.resolve().then(async () => {
                const staged = await stageScenePulseCandidateForWorldReview(world, sess, detail.candidateId);
                if (!staged.eligibility?.ready && detail.allowEarly !== true) return staged;
                return promoteImpliedWorldRecord({
                    provisionalId: staged.provisionalId, candidateId: detail.candidateId,
                    allowEarly: detail.allowEarly === true
                });
            });
            return;
        }
        if (detail.action === 'link-scenepulse-candidate') {
            event.preventDefault();
            detail.promise = Promise.resolve().then(() => linkScenePulseCandidateToCanonical(world, sess, detail.candidateId));
            return;
        }
        if (detail.action === 'keep-scenepulse-candidate-scene-only') {
            event.preventDefault();
            detail.promise = Promise.resolve().then(() => keepScenePulseCandidateSceneOnly(world, sess, detail.candidateId));
            return;
        }
        if (detail.action === 'resolve-scenepulse-candidate-duplicate') {
            event.preventDefault();
            detail.promise = Promise.resolve().then(() => resolveScenePulseCandidateDuplicate(world, sess,
                detail.candidateId, detail.canonicalId, detail.choice));
            return;
        }
        if (detail.action === 'apply-scenepulse-preset') {
            event.preventDefault();
            detail.promise = Promise.resolve().then(() => applyScenePulseReaderPreset(world, sess, detail.preset || {}));
            return;
        }
        if (detail.action === 'export-scenepulse-history') {
            event.preventDefault();
            detail.promise = Promise.resolve().then(() => exportScenePulseReaderHistory(world, sess));
            return;
        }
        if (detail.action === 'clear-scenepulse-history') {
            event.preventDefault();
            detail.promise = Promise.resolve().then(() => clearScenePulseReaderHistory(world, sess));
            return;
        }
        if (detail.action === 'persist-scenepulse-view-preferences') {
            event.preventDefault();
            detail.promise = Promise.resolve().then(() => persistScenePulseWorldsPreferences(world, sess, detail.preferences || {}));
            return;
        }
        if (detail.action === 'persist-scenepulse-source-settings') {
            event.preventDefault();
            detail.promise = Promise.resolve().then(() => persistScenePulseSourceRuntimePreferences(world, sess, detail.preferences || {}, detail.chatPanels, detail.hasChatPanels === true));
            return;
        }
        if (detail.action === 'commit-scenepulse-source-edit') {
            event.preventDefault();
            detail.promise = Promise.resolve().then(() => commitScenePulseSourceEdit(world, sess, detail));
            return;
        }
        if (detail.action === 'resolve-scenepulse-quest-translation') {
            event.preventDefault();
            detail.promise = Promise.resolve().then(() => resolveScenePulseQuestTranslation(world, sess,
                detail.translationId, detail.choice));
            return;
        }
        if (detail.action === 'save-scenepulse-portrait') {
            event.preventDefault();
            detail.promise = Promise.resolve().then(() => saveScenePulsePortraitOverride(world, sess, detail));
            return;
        }
        if (detail.action === 'clear-scenepulse-portrait') {
            event.preventDefault();
            detail.promise = Promise.resolve().then(() => clearScenePulsePortraitOverride(world, sess, detail));
            return;
        }
    };
    host.__scenePulseHostActionHandler = handler;
    host.addEventListener('horde-scenepulse-action', handler);
}

function unbindScenePulseWorldsHostActions(host) {
    if (!host?.__scenePulseHostActionHandler) return;
    host.removeEventListener('horde-scenepulse-action', host.__scenePulseHostActionHandler);
    delete host.__scenePulseHostActionHandler;
}

function scenePulseTourDossiers(data) {
    return (data.characters || []).map((character, index) => ({
        ...experimentalSafeJsonClone(character), id: `tour-character-${index}`, canonical: false, current: experimentalSafeJsonClone(character),
        observations: [{ at: 'Tour fixture', snapshotId: 'tour-26', thought: String(character.innerThought || ''), summary: String(data.sceneSummary || ''), location: String(data.location || '') }]
    }));
}

function scenePulseClaimText(value) {
    if (Array.isArray(value)) return value.map(scenePulseClaimText).filter(Boolean).join(' · ');
    if (experimentalIsPlainObject(value)) return String(value.text || value.thought || value.value || value.summary || value.description || '').trim();
    return String(value || '').trim();
}

// ScenePulse uses colour as a recognition aid.  The host's stable entity or
// candidate identifier, never a mutable display name alone, determines it.
function scenePulseIdentityColor(identity = '') {
    let hash = 0;
    for (const char of String(identity || 'scene-pulse')) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    return `hsl(${Math.abs(hash) % 360} 54% 61%)`;
}

function scenePulseTimePhase(time = '') {
    const match = String(time || '').match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\b/i);
    if (!match) return '';
    let hour = Number(match[1]);
    if (/pm/i.test(match[3]) && hour !== 12) hour += 12;
    if (/am/i.test(match[3]) && hour === 12) hour = 0;
    if (!match[3] && hour > 23) return '';
    return hour < 6 ? 'night' : hour < 10 ? 'dawn' : hour < 17 ? 'day' : hour < 21 ? 'dusk' : 'night';
}

// The dossier is an encounter browser, not a second entity registry.  It
// joins Horde's stable identity/candidate records with accepted ScenePulse
// readings so someone can leave the scene without being erased from view.
function scenePulseDossiers(world, model, data) {
    const records = new Map();
    const keyFor = (id, name) => String(id || `name:${String(name || '').trim().toLowerCase()}`);
    const upsert = (entry = {}) => {
        const id = String(entry.id || entry.entityId || entry.candidateId || '').trim();
        const name = String(entry.name || entry.label || '').trim();
        if (!name) return null;
        let key = keyFor(id, name);
        // Older accepted ScenePulse samples may predate host identity binding
        // and therefore have only a name.  Join that history to the newly
        // resolved identity rather than rendering two dossiers.
        if (!records.has(key)) {
            const named = [...records.entries()].find(([, record]) => String(record.name || '').toLowerCase() === name.toLowerCase());
            if (named) key = named[0];
        }
        const prior = records.get(key) || { id: id || key, name, aliases: [], role: '', archetype: '', canonical: false, entity: null, candidate: null, current: null, observations: [] };
        prior.name = name || prior.name;
        prior.aliases = [...new Set([...(prior.aliases || []), ...(Array.isArray(entry.aliases) ? entry.aliases : [])].map(value => String(value || '').trim()).filter(Boolean))].slice(0, 24);
        prior.role = entry.role || prior.role;
        prior.archetype = entry.archetype || prior.archetype;
        prior.canonical = prior.canonical || !!entry.canonical;
        prior.entity = entry.entity || prior.entity;
        prior.candidate = entry.candidate || prior.candidate;
        if (entry.current) prior.current = { ...(prior.current || {}), ...entry.current };
        records.set(key, prior);
        return prior;
    };
    (data.characters || []).forEach(character => upsert({ ...character, current: character, canonical: !!(world.entities || []).find(entity => String(entity?.id) === String(character.id)) }));
    (model.snapshots || []).forEach(snapshot => {
        const envelope = snapshot.envelope || {};
        const characters = Array.isArray(envelope.scenePulse?.characters) ? envelope.scenePulse.characters : [];
        const intelligence = Array.isArray(envelope.characterIntelligence) ? envelope.characterIntelligence : [];
        const findIntelligence = character => intelligence.find(item => String(item?.subjectRef || item?.candidateId || '') === String(character?.id || character?.candidateId || '') || String(item?.name || '').toLowerCase() === String(character?.name || '').toLowerCase());
        characters.forEach(character => {
            const reading = findIntelligence(character) || {};
            const record = upsert({ ...character, id: character.id || character.candidateId || reading.subjectRef || reading.candidateId || '', aliases: character.aliases || [] });
            if (!record) return;
            record.observations.push({ at: snapshot.createdAt || '', snapshotId: snapshot.id || '', thought: scenePulseClaimText(character.innerThought || reading.sceneLocalImpression), summary: String(envelope.summary || envelope.scene?.topic || '').slice(0, 420), location: String(envelope.scenePulse?.location || envelope.location?.localSpace || '').slice(0, 240) });
        });
        intelligence.forEach(reading => {
            const name = String(reading?.name || '').trim();
            if (!name) return;
            const record = upsert({ id: reading.subjectRef || reading.candidateId || '', name, role: reading.role || '' });
            if (!record || record.observations.some(item => item.snapshotId === snapshot.id)) return;
            record.observations.push({ at: snapshot.createdAt || '', snapshotId: snapshot.id || '', thought: scenePulseClaimText(reading.sceneLocalImpression), summary: String(envelope.summary || envelope.scene?.topic || '').slice(0, 420), location: String(envelope.location?.localSpace || '').slice(0, 240) });
        });
    });
    // Horde's entity registry enriches an already-encountered dossier; it
    // never becomes an implicit "everyone in the world" character list.
    (model.knownCharacters || []).forEach(entry => {
        const existing = [...records.values()].find(record => String(record.id) === String(entry.id) || String(record.name || '').toLowerCase() === String(entry.name || '').toLowerCase());
        if (existing) upsert({ ...entry, name: existing.name, aliases: entry.entity?.aliases || entry.candidate?.aliases || [], role: entry.entity?.role || entry.candidate?.role || '' });
    });
    return [...records.values()].map(record => {
        record.observations.sort((left, right) => String(left.at).localeCompare(String(right.at)));
        return record;
    }).sort((left, right) => Number(!!right.current) - Number(!!left.current) || left.name.localeCompare(right.name));
}

function scenePulseWorldsAdapter(world, sess, model, useDemo = false) {
    if (useDemo) return experimentalSafeJsonClone(SCENEPULSE_TOUR_EXAMPLE_DATA);
    // The selected history snapshot is intentionally independent of the
    // latest turn.  ScenePulse's normal Live view must instead begin at that
    // latest accepted authored beat; otherwise an old active snapshot can
    // produce a convincing but stale opening-scene panel.
    // `turn.reader` is the exact Reader packet attached to the selected
    // authored attempt.  `readerEnvelope` is the accepted projection cache
    // and can lag while history reconciliation is being repaired; prefer the
    // turn packet in Live view so opening-scene cache state cannot win over
    // the narration currently on screen.
    const currentEnvelope = model.latestTurn?.reader?.readerEnvelope || model.latestTurn?.reader || model.latestTurn?.readerEnvelope || model.reader || model.projection || {};
    const raw = currentEnvelope.scenePulse || currentEnvelope.scene_pulse || model.projection?.scenePulse || {};
    const scene = currentEnvelope.scene || model.projection?.scene || {};
    const temporal = currentEnvelope.temporal || model.projection?.temporal || {};
    const environment = currentEnvelope.environment || model.projection?.environment || {};
    const rawCharacters = Array.isArray(raw.characters) ? raw.characters : [];
    const playerId = String(model.hierarchy?.sequence?.controlledEntityId || sess?.controlledEntityId || 'player');
    const liveCharacters = Array.isArray(currentEnvelope.characterIntelligence) && currentEnvelope.characterIntelligence.length
        ? currentEnvelope.characterIntelligence.map(intelligence => {
            const id = String(intelligence?.subjectRef || intelligence?.candidateId || '');
            const entity = (world.entities || []).find(item => String(item?.id || '') === id) || null;
            const state = sess?.entityStates?.[id] || {};
            return { id, entityId: id, name: intelligence?.name || entity?.name || id, intelligence, entity, state, mode: intelligence?.presence?.mode || '' };
        }) : (model.activeCharacters || []);
    const characters = liveCharacters.filter(person => String(person.entityId || person.id || '') !== playerId).map(person => {
        const intelligence = person.intelligence || {};
        const source = rawCharacters.find(item => String(item?.name || '').toLowerCase() === String(person.name || '').toLowerCase()) || {};
        const visible = intelligence.visibleState || {};
        return {
            id: String(person.entityId || person.id || source.id || source.name || ''), name: source.name || person.name || 'Unknown', aliases: Array.isArray(source.aliases) ? source.aliases : [],
            archetype: source.archetype || intelligence.archetype || '', role: source.role || intelligence.role || person.entity?.role || '',
            innerThought: source.innerThought || source.inner_thought || scenePulseClaimText(intelligence.sceneLocalImpression),
            immediateNeed: source.immediateNeed || scenePulseClaimText(intelligence.immediateObjectiveOrConcern) || intelligence.goals?.immediateNeed || '',
            shortTermGoal: source.shortTermGoal || intelligence.goals?.shortTerm || '', longTermGoal: source.longTermGoal || intelligence.goals?.longTerm || '',
            hair: source.hair || visible.hair || '', face: source.face || visible.face || '', outfit: source.outfit || visible.outfit || visible.clothing || '',
            posture: source.posture || visible.posture || '', proximity: source.proximity || person.location || '', notableDetails: source.notableDetails || visible.notableDetails || '',
            inventory: Array.isArray(source.inventory) ? source.inventory : (Array.isArray(visible.inventory) ? visible.inventory : (Array.isArray(person.state?.inventory) ? person.state.inventory : [])), fertStatus: source.fertStatus || '',
            fertNotes: source.fertNotes || source.fert_notes || '', presence: person.mode || ''
        };
    });
    // A source-shaped packet can contain an encounter before its candidate is
    // promoted into Horde's entity registry.  Keep it in the current scene
    // rather than silently discarding the rich local profile.
    rawCharacters.forEach((source, index) => {
        const name = String(source?.name || '').trim();
        if (!name || characters.some(person => person.name.toLowerCase() === name.toLowerCase())) return;
        characters.push({
            id: String(source.id || source.candidateId || `scene-pulse:${name}:${index}`), name,
            aliases: Array.isArray(source.aliases) ? source.aliases : [], archetype: source.archetype || '', role: source.role || '',
            innerThought: source.innerThought || source.inner_thought || '', immediateNeed: source.immediateNeed || '',
            shortTermGoal: source.shortTermGoal || '', longTermGoal: source.longTermGoal || '', hair: source.hair || '', face: source.face || '',
            outfit: source.outfit || '', posture: source.posture || '', proximity: source.proximity || '', notableDetails: source.notableDetails || '',
            inventory: Array.isArray(source.inventory) ? source.inventory : [], fertStatus: source.fertStatus || '', fertNotes: source.fertNotes || source.fert_notes || '', presence: source.presence || 'scene-relevant'
        });
    });
    const knownQuests = [...(Array.isArray(raw.mainQuests) ? raw.mainQuests : []), ...(Array.isArray(raw.sideQuests) ? raw.sideQuests : [])];
    const worldQuests = [...(Array.isArray(world?.quests) ? world.quests : []), ...(Array.isArray(sess?.quests) ? sess.quests : [])]
        .map(item => ({ id: String(item?.id || ''), name: item?.name || item?.title || item?.label || '', detail: item?.detail || item?.description || item?.objective || '', urgency: item?.urgency || item?.priority || 'moderate', tier: item?.tier || item?.kind || 'main', status: item?.status || 'active', objectives: Array.isArray(item?.objectives) ? item.objectives : [], hostManaged: Array.isArray(sess?.quests) && sess.quests.includes(item) }))
        .filter(item => item.name || item.detail);
    const relationshipFallback = (model.relationships || []).filter(item => !item.proposal).map(item => ({
        name: item.label, relType: item.raw?.relType || item.raw?.type || 'Relationship', relPhase: item.raw?.relPhase || item.posture || '',
        timeTogether: item.raw?.timeTogether || '', milestone: item.raw?.milestone || item.evidence || '',
        affection: item.raw?.affection, affectionLabel: item.raw?.affectionLabel || '', trust: item.raw?.trust, trustLabel: item.raw?.trustLabel || '',
        desire: item.raw?.desire, desireLabel: item.raw?.desireLabel || '', stress: item.raw?.stress, stressLabel: item.raw?.stressLabel || '',
        compatibility: item.raw?.compatibility, compatibilityLabel: item.raw?.compatibilityLabel || ''
    }));
    return {
        time: raw.time || temporal.end_clock || temporal.time || model.worldTime || '', date: raw.date || [temporal.date, temporal.day || temporal.dayOfWeek].filter(Boolean).join(' ') || '', elapsed: raw.elapsed || temporal.elapsed || temporal.duration || '', temporalIntent: raw.temporalIntent || raw.temporal_intent || temporal.intent || temporal.meaning || '',
        location: raw.location || [getLocationRef(world, currentEnvelope.location?.activeLocationId || currentEnvelope.location?.active_location_id)?.name || model.location?.name, currentEnvelope.location?.localSpace || currentEnvelope.location?.local_space || model.location?.localSpace].filter(Boolean).join(' > ') || '', weather: raw.weather || environment.weather || temporal.weather || '',
        temperature: raw.temperature || environment.temperature || '', sceneTopic: raw.sceneTopic || scene.topic || '', sceneMood: raw.sceneMood || scene.mood || scene.moodAtmosphere || '',
        sceneInteraction: raw.sceneInteraction || scene.interactionStyle || '', sceneTension: raw.sceneTension || scene.tension || '', sceneSummary: raw.sceneSummary || currentEnvelope.summary || model.projection?.summary || '',
        soundEnvironment: raw.soundEnvironment || environment.sound || scene.sound || '', witnesses: Array.isArray(raw.witnesses) ? raw.witnesses : [], charactersPresent: raw.charactersPresent || characters.map(item => item.name), northStar: raw.northStar || '',
        mainQuests: (() => { const host = worldQuests.filter(item => !/side/i.test(item.tier)); const names = new Set(host.map(item => item.name.toLowerCase())); return [...host, ...(Array.isArray(raw.mainQuests) ? raw.mainQuests : []).filter(item => !names.has(String(item?.name || '').toLowerCase()))]; })(),
        sideQuests: (() => { const host = worldQuests.filter(item => /side/i.test(item.tier)); const names = new Set(host.map(item => item.name.toLowerCase())); return [...host, ...(Array.isArray(raw.sideQuests) ? raw.sideQuests : []).filter(item => !names.has(String(item?.name || '').toLowerCase()))]; })(),
        relationships: Array.isArray(raw.relationships) && raw.relationships.length ? raw.relationships : relationshipFallback,
        characters, plotBranches: Array.isArray(raw.plotBranches) ? raw.plotBranches : []
    };
}

function scenePulseMeter(label, value, text) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    const width = Math.max(0, Math.min(100, number));
    return `<div class="sp-meter-row"><span class="sp-meter-label">${experimentalEscapeHTML(label)}</span><span class="sp-meter-bar-wrap"><span class="sp-meter-bar-track"><span class="sp-meter-bar-fill" style="width:${width}%"></span></span></span><span class="sp-meter-value">${experimentalEscapeHTML(text || String(number))}</span></div>`;
}

function scenePulseThoughtPanel(data, ui, persist, onRegenerate = null) {
    let panel = document.getElementById('sp-thought-panel');
    if (panel) panel.remove();
    panel = document.createElement('aside');
    panel.id = 'sp-thought-panel';
    panel.className = `sp-tp-visible ${ui.thoughtGhost ? 'sp-tp-ghost-mode' : ''}`;
    panel.style.left = `${Math.max(8, Number(ui.thoughtLeft) || 12)}px`;
    panel.style.top = `${Math.max(48, Number(ui.thoughtTop) || 88)}px`;
    if (ui.thoughtWidth) panel.style.width = `${Math.max(240, Number(ui.thoughtWidth))}px`;
    const cards = data.characters.filter(character => character.innerThought).map(character => `<article class="sp-tp-card"><header class="sp-tp-name"><span class="sp-char-portrait"><span class="sp-char-portrait-monogram">${experimentalEscapeHTML(sidecarWorkspaceAvatar(character.name))}</span></span><span class="sp-tp-name-text">${experimentalEscapeHTML(character.name)}</span><span class="sp-tp-name-icon">◌</span></header><blockquote class="sp-tp-monologue">${experimentalEscapeHTML(character.innerThought)}</blockquote><div class="sp-tp-goals">${character.immediateNeed ? `<div class="sp-tp-goal"><span class="sp-tp-goal-icon">◆</span>${experimentalEscapeHTML(character.immediateNeed)}</div>` : ''}${character.shortTermGoal ? `<div class="sp-tp-goal"><span class="sp-tp-goal-icon">→</span>${experimentalEscapeHTML(character.shortTermGoal)}</div>` : ''}</div></article>`).join('') || '<div class="sp-empty-state"><strong class="sp-empty-title">No inner thoughts yet</strong></div>';
    panel.innerHTML = `<header class="sp-tp-header" id="sp-tp-drag"><span class="sp-tp-drag-grip">━━</span><span class="sp-tp-title">Inner Thoughts</span><span class="sp-tp-header-spacer"></span>${onRegenerate ? '<button type="button" class="sp-tp-refresh" title="Regenerate inner thoughts">↻</button>' : ''}<button type="button" class="sp-tp-snapleft" title="Snap left">⇤</button><button type="button" class="sp-tp-ghost" title="Ghost mode">◌</button><button type="button" class="sp-tp-close" title="Hide thoughts">×</button></header><div id="sp-tp-body">${cards}</div><div class="sp-tp-resize" title="Resize">◢</div>`;
    globalThis.ExperimentalWorldsDom.portalRoot().appendChild(panel);
    const save = () => { persist(); };
    panel.querySelector('.sp-tp-close').addEventListener('click', () => panel.remove());
    panel.querySelector('.sp-tp-refresh')?.addEventListener('click', async event => {
        event.currentTarget.disabled = true;
        try {
            const nextData = await onRegenerate();
            if (nextData) scenePulseThoughtPanel(nextData, ui, persist, onRegenerate);
        } catch (error) {
            ExperimentalWorldsHost.notify(`Could not regenerate thoughts: ${error?.message || error}`, 'error');
            event.currentTarget.disabled = false;
        }
    });
    panel.querySelector('.sp-tp-ghost').addEventListener('click', () => { ui.thoughtGhost = !ui.thoughtGhost; panel.classList.toggle('sp-tp-ghost-mode', ui.thoughtGhost); save(); });
    panel.querySelector('.sp-tp-snapleft').addEventListener('click', () => { ui.thoughtLeft = 12; ui.thoughtTop = 88; panel.style.left = '12px'; panel.style.top = '88px'; save(); });
    const drag = panel.querySelector('#sp-tp-drag'); let dragging = false; let dx = 0; let dy = 0;
    drag.addEventListener('pointerdown', event => { if (event.target.closest('button')) return; dragging = true; dx = event.clientX - panel.offsetLeft; dy = event.clientY - panel.offsetTop; drag.setPointerCapture(event.pointerId); });
    drag.addEventListener('pointermove', event => { if (!dragging) return; panel.style.left = `${Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, event.clientX - dx))}px`; panel.style.top = `${Math.max(0, Math.min(window.innerHeight - 44, event.clientY - dy))}px`; });
    drag.addEventListener('pointerup', () => { if (!dragging) return; dragging = false; ui.thoughtLeft = panel.offsetLeft; ui.thoughtTop = panel.offsetTop; save(); });
    const handle = panel.querySelector('.sp-tp-resize'); let resizing = false; let startX = 0; let startWidth = 0;
    handle.addEventListener('pointerdown', event => { resizing = true; startX = event.clientX; startWidth = panel.offsetWidth; handle.setPointerCapture(event.pointerId); });
    handle.addEventListener('pointermove', event => { if (!resizing) return; panel.style.width = `${Math.max(240, Math.min(window.innerWidth - panel.offsetLeft - 8, startWidth + event.clientX - startX))}px`; });
    handle.addEventListener('pointerup', () => { if (!resizing) return; resizing = false; ui.thoughtWidth = panel.offsetWidth; save(); });
}

function renderScenePulseWorldsWorkspace(world, sess) {
    const host = document.getElementById('world-sidecar-workspace');
    const column = document.querySelector('#world-play-view .world-status-col');
    if (!host || !column) return;
    // The upstream panel has a document-level weather/effects layer.  A late
    // Sidecar redraw must never remount it over the library or another Horde
    // route simply because a World remains selected in workspace state.
    if (ExperimentalWorldsState.view !== 'worldPlay') {
        unbindScenePulseWorldsHostActions(host);
        window.HordeScenePulseSourceRuntime?.unmount?.(host);
        window.HordeScenePulseWorlds?.unmount?.(host);
        host.replaceChildren();
        return;
    }
    const sidecar = window.ExperimentalWorldsSidecarHooks?.isSidecarWorld?.(world, sess) === true;
    column.classList.toggle('is-sidecar', sidecar); host.classList.toggle('hidden', !sidecar);
    if (sidecar) restoreScenePulseStatusColumnWidth(column);
    else clearScenePulseStatusColumnWidth(column);
    if (!sidecar) {
        unbindScenePulseWorldsHostActions(host);
        window.HordeScenePulseSourceRuntime?.unmount?.(host);
        window.HordeScenePulseWorlds?.unmount?.(host);
        host.replaceChildren();
        return;
    }
    // Gate A remains the sealed source tutorial handoff. Once a new authored
    // beat has an exact settled Reader snapshot, Gate B overlays only that
    // source-shaped delta projection; it never substitutes Melbourne/world
    // registry data for incomplete ScenePulse fields.
    const handoff = scenePulseAcceptedHandoff(world, sess);
    if (!window.HordeScenePulseSourceRuntime?.mount) {
        host.innerHTML = '<div class="sp-empty-state"><div class="sp-empty-title">Native ScenePulse source runtime did not load</div><div class="sp-empty-sub">The compatibility scaffold is unavailable, so the source panel is intentionally not substituted with a host lookalike.</div></div>';
        return;
    }
    bindScenePulseWorldsHostActions(host, world, sess);
    // The default World HUD is the actual ScenePulse panel/runtime. The older
    // host-drawn adapter remains vendored as a migration reference only; do
    // not silently fall back to it when the native source bridge fails.
    window.HordeScenePulseWorlds?.unmount?.(host);
    window.HordeScenePulseSourceRuntime.mount(host, handoff).catch(error => {
        console.error('Native ScenePulse source runtime failed:', error);
    });
    return;

    // Gate B adapter below is intentionally unreachable until the fixture
    // acceptance checklist is complete.  It is retained as a future host
    // boundary, not an alternate sidebar or a demo data fallback.
    const model = buildSidecarWorkspaceModel(world, sess);
    if (!model) return;
    const protocol = model.protocol;
    protocol.workspaceUi = experimentalIsPlainObject(protocol.workspaceUi) ? protocol.workspaceUi : {};
    const ui = protocol.workspaceUi.scenePulse = { demo: protocol.workspaceUi.scenePulse?.demo !== false, view: protocol.workspaceUi.scenePulse?.view || 'scene', open: protocol.workspaceUi.scenePulse?.open || {}, panels: protocol.workspaceUi.scenePulse?.panels || {}, features: { thoughts: protocol.workspaceUi.scenePulse?.features?.thoughts !== false, weather: protocol.workspaceUi.scenePulse?.features?.weather !== false, timeTint: protocol.workspaceUi.scenePulse?.features?.timeTint !== false, transitions: protocol.workspaceUi.scenePulse?.features?.transitions !== false }, panelsOpen: protocol.workspaceUi.scenePulse?.panelsOpen === true, compact: protocol.workspaceUi.scenePulse?.compact === true, edit: protocol.workspaceUi.scenePulse?.edit === true, showEmpty: protocol.workspaceUi.scenePulse?.showEmpty === true, fontScale: Math.max(0.7, Math.min(1.5, Number(protocol.workspaceUi.scenePulse?.fontScale) || 1)), theme: protocol.workspaceUi.scenePulse?.theme || 'default', reduceEffects: protocol.workspaceUi.scenePulse?.reduceEffects === true, thoughtGhost: protocol.workspaceUi.scenePulse?.thoughtGhost === true, thoughtLeft: protocol.workspaceUi.scenePulse?.thoughtLeft || 12, thoughtTop: protocol.workspaceUi.scenePulse?.thoughtTop || 88, thoughtWidth: protocol.workspaceUi.scenePulse?.thoughtWidth || 360, liveLocation: protocol.workspaceUi.scenePulse?.liveLocation || '', dossierId: protocol.workspaceUi.scenePulse?.dossierId || '' };
    const persist = () => { sess.sidecar = protocol; ExperimentalWorldsHost.persist().catch(error => console.warn('ScenePulse UI setting save failed:', error)); };
    const tour = ui.demo ? scenePulseTourState() : null;
    const data = tour ? tour.data : scenePulseWorldsAdapter(world, sess, model, false);
    const dossiers = tour ? scenePulseTourDossiers(data) : scenePulseDossiers(world, model, data);
    const view = ['scene', 'characters', 'dossiers', 'relationships', 'journal', 'ideas', 'history', 'settings'].includes(ui.view) ? ui.view : 'scene';
    const section = (key, title, icon, body, badge = '') => `<section class="sp-section ${ui.open[key] !== false ? 'sp-open' : ''}" data-sp-section="${experimentalEscapeHTML(key)}"><header class="sp-section-header" data-sp-section-toggle="${experimentalEscapeHTML(key)}"><span class="sp-section-chevron">›</span><span class="sp-section-icon">${icon}</span><span class="sp-section-title">${experimentalEscapeHTML(title)}</span>${badge ? `<span class="sp-section-badge">${experimentalEscapeHTML(badge)}</span>` : ''}<span class="sp-section-spacer"></span><button type="button" class="sp-section-refresh" data-sp-action="refresh" title="Refresh">↻</button></header><div class="sp-section-body"><div class="sp-section-content">${body}</div></div></section>`;
    const tension = String(data.sceneTension || 'calm').toLowerCase();
    const tensionClass = /critical/.test(tension) ? 'sp-tension-critical' : /high/.test(tension) ? 'sp-tension-high' : /moderate/.test(tension) ? 'sp-tension-moderate' : /low/.test(tension) ? 'sp-tension-low' : 'sp-tension-calm';
    const dashboard = `<div class="sp-dashboard spw-dashboard"><article class="sp-dash-card sp-dash-card-date"><span class="sp-dash-sub">${experimentalEscapeHTML(data.date)}</span><strong class="sp-dash-day">${experimentalEscapeHTML(data.date.match(/\(([^)]+)\)/)?.[1] || '')}</strong></article><article class="sp-dash-card sp-dash-card-time"><span class="sp-dash-clock">◷</span><strong class="sp-time-value">${experimentalEscapeHTML(data.time)}</strong></article><article class="sp-dash-card sp-dash-card-temp ${tensionClass}"><div class="sp-temp-bar-wrap"><i style="width:${tension === 'critical' ? 100 : tension === 'high' ? 78 : tension === 'moderate' ? 56 : tension === 'low' ? 32 : 12}%"></i></div><strong class="sp-temp-bar-label">${experimentalEscapeHTML(data.sceneTension || 'calm')} · ${experimentalEscapeHTML(data.sceneMood || '')}</strong></article><article class="sp-dash-card sp-dash-card-weather"><span class="sp-dash-icon">${/rain|storm/i.test(data.weather) ? '≋' : '☁'}</span><strong class="sp-dash-value">${experimentalEscapeHTML(data.weather || 'Unknown')}</strong><small>${experimentalEscapeHTML(data.temperature || '')}</small></article></div><div class="sp-dash-location"><span class="sp-dash-loc-icon">⌖</span><span class="sp-dash-loc-text">${experimentalEscapeHTML(data.location || 'Unknown')}</span></div>`;
    const sceneDetails = `<div class="sp-scene-summary-row"><div class="sp-scene-summary">${experimentalEscapeHTML(data.sceneSummary || 'No scene details yet.')}</div></div>${[['Topic', data.sceneTopic], ['Mood', data.sceneMood], ['Interaction', data.sceneInteraction], ['Tension', data.sceneTension], ['Elapsed', data.elapsed], ['Temporal intent', data.temporalIntent], ['Sounds', data.soundEnvironment], ['Witnesses', Array.isArray(data.witnesses) ? data.witnesses.map(scenePulseClaimText).filter(Boolean).join(' · ') : scenePulseClaimText(data.witnesses)]].filter(([, value]) => value).map(([label, value]) => `<div class="sp-row ${label === 'Tension' ? `sp-scene-tension-row ${tensionClass}` : label === 'Sounds' ? 'sp-scene-sounds-row' : ''}"><span class="sp-row-label">${experimentalEscapeHTML(label)}</span><span class="sp-row-value">${experimentalEscapeHTML(value)}</span></div>`).join('')}`;
    const characterCards = data.characters.length ? data.characters.map((character, index) => {
        const accent = scenePulseIdentityColor(character.id || character.name);
        return `<article class="sp-char-card ${index === 0 ? 'sp-card-open' : ''}" style="--char-accent:${accent};--char-border:${accent};--char-bg:color-mix(in srgb,${accent} 10%,transparent);" data-sp-character data-sp-character-id="${experimentalEscapeHTML(character.id || character.name)}"><header class="sp-char-header"><span class="sp-char-chevron">›</span><span class="sp-char-portrait"><span class="sp-char-portrait-monogram">${experimentalEscapeHTML(sidecarWorkspaceAvatar(character.name))}</span></span><span class="sp-char-name-col"><span class="sp-char-name-row"><strong class="sp-char-name">${experimentalEscapeHTML(character.name)}</strong><span class="sp-char-archetype">${experimentalEscapeHTML(character.archetype || character.presence || 'present')}</span></span><small class="sp-char-meta">${experimentalEscapeHTML(character.role || '')}</small></span></header><div class="sp-char-body">${character.innerThought ? `<blockquote class="sp-char-thought-block">${experimentalEscapeHTML(character.innerThought)}</blockquote>` : ''}<div class="sp-char-grid">${[['Aliases', character.aliases?.join(' · ')], ['Hair', character.hair], ['Face', character.face], ['Outfit', character.outfit], ['Posture', character.posture], ['Proximity', character.proximity], ['Details', character.notableDetails], ['Fertility', [character.fertStatus, character.fertNotes].filter(Boolean).join(' — ')]].filter(([, value]) => value).map(([label, value]) => `<span class="sp-char-field">${experimentalEscapeHTML(label)}</span><span class="sp-char-val">${experimentalEscapeHTML(value)}</span>`).join('')}</div><div class="sp-char-goals">${[['Now', character.immediateNeed], ['Soon', character.shortTermGoal], ['Long term', character.longTermGoal]].filter(([, value]) => value).map(([label, value]) => `<div class="sp-char-goal-item"><strong>${experimentalEscapeHTML(label)}:</strong> ${experimentalEscapeHTML(value)}</div>`).join('')}</div>${character.inventory?.length ? `<div class="sp-char-goals"><div class="sp-char-goal-item"><strong>Inventory:</strong> ${experimentalEscapeHTML(character.inventory.join(' · '))}</div></div>` : ''}<div class="sp-card-actions"><button type="button" class="btn btn-ghost" data-sp-dossier="${experimentalEscapeHTML(character.id || character.name)}">Open dossier</button></div></div></article>`;
    }).join('') : '<div class="sp-empty-state"><strong class="sp-empty-title">No characters in this scene</strong></div>';
    const relationshipCards = data.relationships.length ? data.relationships.map((relationship, index) => `<article class="sp-rel-block ${index === 0 ? 'sp-card-open' : ''}" data-sp-relationship><header class="sp-rel-header"><span class="sp-rel-chevron">›</span><span class="sp-char-portrait"><span class="sp-char-portrait-monogram">${experimentalEscapeHTML(sidecarWorkspaceAvatar(relationship.name))}</span></span><strong class="sp-rel-name">${experimentalEscapeHTML(relationship.name)}</strong><span class="sp-rel-type-badge">${experimentalEscapeHTML(relationship.relType || '')}</span><span class="sp-rel-phase-badge">${experimentalEscapeHTML(relationship.relPhase || '')}</span></header><div class="sp-rel-body"><div class="sp-rel-meta"><div class="sp-rel-meta-item"><span class="sp-rel-meta-label">Known</span><span>${experimentalEscapeHTML(relationship.timeTogether || '')}</span></div><div class="sp-rel-meta-item"><span class="sp-rel-meta-label">Milestone</span><span>${experimentalEscapeHTML(relationship.milestone || '')}</span></div></div>${scenePulseMeter('Affection', relationship.affection, relationship.affectionLabel)}${scenePulseMeter('Trust', relationship.trust, relationship.trustLabel)}${scenePulseMeter('Desire', relationship.desire, relationship.desireLabel)}${scenePulseMeter('Stress', relationship.stress, relationship.stressLabel)}${scenePulseMeter('Compatibility', relationship.compatibility, relationship.compatibilityLabel)}</div></article>`).join('') : '<div class="sp-empty-state"><strong class="sp-empty-title">No relationships for this scene</strong></div>';
    const questTier = (title, quests, cls) => quests.length ? `<div class="sp-plot-tier ${cls}"><div class="sp-plot-tier-title"><span class="sp-tier-chevron">›</span><span>${experimentalEscapeHTML(title)}</span><span class="sp-section-badge">${quests.length}</span></div><div class="sp-tier-body">${quests.map(quest => {
        const status = String(quest.status || 'active').toLowerCase();
        const objectiveSummary = Array.isArray(quest.objectives) && quest.objectives.length
            ? `${quest.objectives.filter(item => item?.status === 'completed').length}/${quest.objectives.length} objectives` : '';
        const controls = quest.hostManaged && quest.id ? `<div class="sp-quest-actions"><button type="button" class="btn btn-ghost" data-sp-quest-action="edit" data-sp-quest-id="${experimentalEscapeHTML(quest.id)}">Edit</button><button type="button" class="btn btn-ghost" data-sp-quest-action="${status === 'active' ? 'complete' : 'restore'}" data-sp-quest-id="${experimentalEscapeHTML(quest.id)}">${status === 'active' ? 'Complete' : 'Restore'}</button><button type="button" class="btn btn-ghost sp-quest-remove" data-sp-quest-action="remove" data-sp-quest-id="${experimentalEscapeHTML(quest.id)}">Remove</button></div>` : '';
        return `<article class="sp-plot-entry sp-card-open ${status === 'active' ? '' : 'sp-quest-resolved'}"><header class="sp-quest-header"><span class="sp-plot-status sp-urgency-${experimentalEscapeHTML(status === 'active' ? String(quest.urgency || 'moderate').toLowerCase() : status)}">${experimentalEscapeHTML(status === 'active' ? quest.urgency || 'open' : status)}</span><strong class="sp-plot-name">${experimentalEscapeHTML(quest.name || 'Untitled')}</strong></header><div class="sp-quest-detail">${experimentalEscapeHTML(quest.detail || '')}${objectiveSummary ? `<small>${experimentalEscapeHTML(objectiveSummary)}</small>` : ''}</div>${controls}</article>`;
    }).join('')}</div></div>` : '';
    const journal = `${data.northStar ? `<div class="sp-north-star"><span>North Star</span><strong>${experimentalEscapeHTML(data.northStar)}</strong></div>` : ''}${questTier('Main quests', data.mainQuests || [], 'sp-tier-main')}${questTier('Side quests', data.sideQuests || [], 'sp-tier-side')}${!data.northStar && !(data.mainQuests || []).length && !(data.sideQuests || []).length ? '<div class="sp-empty-state"><strong class="sp-empty-title">No quests yet</strong></div>' : ''}<div class="sp-journal-actions"><button type="button" class="btn btn-ghost" data-sp-quest-action="add">Add quest</button></div>`;
    const ideas = data.plotBranches.length ? `<div class="sp-ideas-list">${data.plotBranches.map((idea, index) => `<article class="sp-idea-card"><span class="sp-idea-type">${experimentalEscapeHTML(idea.type || 'idea')}</span><strong>${experimentalEscapeHTML(idea.name || '')}</strong><p>${experimentalEscapeHTML(idea.hook || '')}</p><button type="button" class="btn btn-ghost" data-sp-idea="${index}">Use this direction</button></article>`).join('')}</div>` : '<div class="sp-empty-state"><strong class="sp-empty-title">No story ideas yet</strong></div>';
    const history = tour
        ? `<div class="sp-tl-bar sp-tour-timeline">${SCENEPULSE_TOUR_TIMELINE.map(item => `<button type="button" class="sp-tl-node" style="left:${SCENEPULSE_TOUR_TIMELINE.length === 1 ? 50 : 8 + (SCENEPULSE_TOUR_TIMELINE.indexOf(item) / (SCENEPULSE_TOUR_TIMELINE.length - 1)) * 84}%" data-sp-tour-history="${item.id}" title="ScenePulse guided-tour snapshot ${item.label}"><span class="sp-tl-dot ${item.current ? 'sp-tl-dot-latest' : ''} ${tour.selectedTimelineId === item.id ? 'sp-tl-dot-selected' : ''}"></span><span class="sp-tl-label ${tour.selectedTimelineId === item.id ? 'sp-tl-label-active' : ''}">${item.label}</span></button>`).join('')}</div><div class="sp-tour-history-note">Source guided-tour timeline · ${experimentalEscapeHTML((SCENEPULSE_TOUR_TIMELINE.find(item => item.id === tour.selectedTimelineId) || SCENEPULSE_TOUR_TIMELINE.at(-1)).label)} · tour-only fixture</div><button type="button" class="sp-tl-browse-btn" data-sp-tour-browse>Browse All (${SCENEPULSE_TOUR_TIMELINE.length})</button>`
        : model.snapshots.length ? `<div class="sp-timeline">${model.snapshots.slice().reverse().map(snapshot => `<button type="button" class="sp-timeline-entry" data-sp-history="${experimentalEscapeHTML(snapshot.id)}"><span>${experimentalEscapeHTML(new Date(snapshot.createdAt).toLocaleString())}</span><strong>${experimentalEscapeHTML(snapshot.envelope?.summary || snapshot.envelope?.scene?.topic || 'Scene update')}</strong></button>`).join('')}</div>` : '<div class="sp-empty-state"><strong class="sp-empty-title">No scene history yet</strong></div>';
    const selectedDossier = dossiers.find(item => String(item.id) === String(ui.dossierId)) || null;
    const dossierList = dossiers.length ? `<div class="sp-dossier-search"><input type="search" data-sp-dossier-search placeholder="Search encountered characters" aria-label="Search encountered characters"></div><div class="sp-dossier-list">${dossiers.map(record => `<button type="button" class="sp-dossier-row ${selectedDossier?.id === record.id ? 'is-selected' : ''}" data-sp-dossier="${experimentalEscapeHTML(record.id)}" data-sp-dossier-name="${experimentalEscapeHTML(`${record.name} ${record.aliases.join(' ')} ${record.role}`.toLowerCase())}"><span class="sp-char-portrait" style="--char-accent:${scenePulseIdentityColor(record.id || record.name)}"><span class="sp-char-portrait-monogram">${experimentalEscapeHTML(sidecarWorkspaceAvatar(record.name))}</span></span><span><strong>${experimentalEscapeHTML(record.name)}</strong><small>${experimentalEscapeHTML([record.current ? 'in this scene' : '', record.role, record.observations.length ? `${record.observations.length} accepted reading${record.observations.length === 1 ? '' : 's'}` : record.canonical ? 'encountered record' : 'scene candidate'].filter(Boolean).join(' · '))}</small></span></button>`).join('')}</div>` : '<div class="sp-empty-state"><strong class="sp-empty-title">No encountered characters yet</strong></div>';
    const dossierDetail = selectedDossier ? (() => {
        const current = selectedDossier.current || {};
        const entity = selectedDossier.entity || {};
        const observations = selectedDossier.observations || [];
        const first = observations[0]; const last = observations.at(-1);
        const currentRows = [['Role', current.role || selectedDossier.role || entity.role], ['Archetype', current.archetype || selectedDossier.archetype], ['Aliases', selectedDossier.aliases.join(' · ')], ['Appearance', current.face || entity.appearance || entity.description], ['Outfit', current.outfit], ['Posture', current.posture], ['Proximity', current.proximity], ['Last-known location', last?.location]].filter(([, value]) => value);
        const historyAttribute = tour ? 'data-sp-tour-history' : 'data-sp-history';
        return `<article class="sp-dossier-detail"><header><button type="button" class="btn btn-ghost" data-sp-dossier-back>‹ All dossiers</button><span class="sp-char-portrait" style="--char-accent:${scenePulseIdentityColor(selectedDossier.id || selectedDossier.name)}"><span class="sp-char-portrait-monogram">${experimentalEscapeHTML(sidecarWorkspaceAvatar(selectedDossier.name))}</span></span><span><h3>${experimentalEscapeHTML(selectedDossier.name)}</h3><small>${experimentalEscapeHTML(tour ? 'ScenePulse tour character' : selectedDossier.canonical ? 'Horde identity linked' : 'Scene candidate')}</small></span></header><div class="sp-char-grid">${currentRows.map(([label, value]) => `<span class="sp-char-field">${experimentalEscapeHTML(label)}</span><span class="sp-char-val">${experimentalEscapeHTML(String(value))}</span>`).join('')}</div><div class="sp-dossier-stats"><span>First seen: ${experimentalEscapeHTML(tour ? 'Tour fixture' : first?.at ? new Date(first.at).toLocaleString() : 'current scene')}</span><span>Last seen: ${experimentalEscapeHTML(tour ? 'Tour fixture' : last?.at ? new Date(last.at).toLocaleString() : 'current scene')}</span><span>Appearances: ${observations.length || (current.name ? 1 : 0)}</span></div>${current.innerThought ? `<blockquote class="sp-char-thought-block">${experimentalEscapeHTML(current.innerThought)}</blockquote>` : ''}<h4>Scene history</h4>${observations.length ? `<div class="sp-dossier-observations">${observations.slice().reverse().map(observation => `<button type="button" class="sp-dossier-observation" ${historyAttribute}="${experimentalEscapeHTML(observation.snapshotId)}"><small>${experimentalEscapeHTML(tour ? 'Tour fixture' : observation.at ? new Date(observation.at).toLocaleString() : 'Current scene')}</small>${observation.thought ? `<blockquote>${experimentalEscapeHTML(observation.thought)}</blockquote>` : ''}<span>${experimentalEscapeHTML(observation.summary || observation.location || 'Scene reading')}</span></button>`).join('')}</div>` : '<div class="sp-empty-state"><strong class="sp-empty-title">No accepted scene observations yet</strong></div>'}</article>`;
    })() : dossierList;
    const dossierView = selectedDossier ? dossierDetail : dossierList;
    const settings = `<div class="sp-settings"><label>Theme<select data-sp-theme><option value="default" ${ui.theme === 'default' ? 'selected' : ''}>Default</option><option value="midnight" ${ui.theme === 'midnight' ? 'selected' : ''}>Midnight</option><option value="fantasy" ${ui.theme === 'fantasy' ? 'selected' : ''}>Fantasy</option><option value="cyberpunk" ${ui.theme === 'cyberpunk' ? 'selected' : ''}>Cyberpunk</option><option value="minimal" ${ui.theme === 'minimal' ? 'selected' : ''}>Minimal</option></select></label><label class="sp-setting-toggle"><input type="checkbox" data-sp-effects ${ui.reduceEffects ? '' : 'checked'}> Scene effects</label></div>`;
    const panelEnabled = key => ui.panels[key] !== false;
    const historyCount = tour ? SCENEPULSE_TOUR_TIMELINE.length : model.snapshots.length;
    const sceneContent = `${panelEnabled('dashboard') ? dashboard : ''}${panelEnabled('scene') ? section('scene', 'Scene Details', '◈', sceneDetails) : ''}${panelEnabled('characters') ? section('characters', 'Characters', '♙', characterCards, String(data.characters.length)) : ''}${panelEnabled('relationships') ? section('relationships', 'Relationships', '↔', relationshipCards, String(data.relationships.length)) : ''}${panelEnabled('journal') ? section('journal', 'Quest Journal', '▣', journal) : ''}${panelEnabled('ideas') ? section('ideas', 'Story Ideas', '✦', ideas, String(data.plotBranches.length)) : ''}${panelEnabled('history') ? section('history', 'History', '◷', history, String(historyCount)) : ''}`;
    const content = view === 'dossiers' ? section('dossiers', selectedDossier ? selectedDossier.name : 'Character Dossiers', '▤', dossierView, String(dossiers.length)) : sceneContent;
    const status = ui.demo ? '<span class="spw-demo-ribbon">Demo fixture · TOUR_EXAMPLE_DATA</span>' : '<span class="spw-live-ribbon">Live scene</span>';
    const nav = (label, nextView, title) => `<button type="button" class="sp-toolbar-btn ${view === nextView ? 'sp-tb-active' : ''}" data-sp-view="${nextView}" title="${experimentalEscapeHTML(title)}">${label}</button>`;
    const locationChanged = !ui.demo && !!ui.liveLocation && !!data.location && ui.liveLocation !== data.location;
    if (!ui.demo && data.location && ui.liveLocation !== data.location) { ui.liveLocation = data.location; persist(); }
    host.dataset.spTheme = ui.theme;
    host.dataset.spWeather = String(data.weather || '').toLowerCase();
    host.dataset.spTimePhase = scenePulseTimePhase(data.time);
    host.classList.toggle('spw-reduce-effects', ui.reduceEffects);
    host.classList.toggle('spw-scene-transition', locationChanged);
    host.innerHTML = `<div class="sp-toolbar"><div class="sp-brand"><span class="sp-brand-mark">◉</span><span class="sp-brand-word">Scene<span>Pulse</span></span><small>${experimentalEscapeHTML(data.sceneTopic || 'Scene')}</small></div><span class="sp-toolbar-spacer"></span>${status}<button type="button" class="sp-toolbar-btn ${ui.demo ? 'sp-tb-active' : ''}" data-sp-action="demo" title="Toggle tour demo">▣</button><button type="button" class="sp-toolbar-btn" data-sp-action="thoughts" title="Inner Thoughts">◌</button><button type="button" class="sp-toolbar-btn" data-sp-action="refresh" title="Refresh">↻</button>${nav('⌂', 'scene', 'Scene Details')}${nav('♙', 'characters', 'Characters')}${nav('▤', 'dossiers', 'Character dossiers')}${nav('↔', 'relationships', 'Relationships')}${nav('▣', 'journal', 'Quest Journal')}${nav('✦', 'ideas', 'Story Ideas')}${nav('◷', 'history', 'History')}${nav('⚙', 'settings', 'Settings')}</div><div class="sp-panel-body spw-panel-body">${content}</div>`;
    if (locationChanged) setTimeout(() => host.classList.remove('spw-scene-transition'), 520);
    host.querySelectorAll('[data-sp-view]').forEach(button => button.addEventListener('click', () => { ui.view = button.dataset.spView; persist(); renderScenePulseWorldsWorkspace(world, sess); }));
    host.querySelectorAll('[data-sp-section-toggle]').forEach(header => header.addEventListener('click', event => { if (event.target.closest('button')) return; const sectionEl = header.closest('[data-sp-section]'); const key = header.dataset.spSectionToggle; ui.open[key] = !sectionEl.classList.contains('sp-open'); persist(); sectionEl.classList.toggle('sp-open', ui.open[key]); }));
    host.querySelectorAll('[data-sp-character]').forEach(card => card.querySelector('.sp-char-header').addEventListener('click', () => card.classList.toggle('sp-card-open')));
    host.querySelectorAll('[data-sp-relationship]').forEach(card => card.querySelector('.sp-rel-header').addEventListener('click', () => card.classList.toggle('sp-card-open')));
    host.querySelectorAll('[data-sp-dossier]').forEach(button => button.addEventListener('click', () => { ui.dossierId = button.dataset.spDossier; ui.view = 'dossiers'; persist(); renderScenePulseWorldsWorkspace(world, sess); }));
    host.querySelector('[data-sp-dossier-back]')?.addEventListener('click', () => { ui.dossierId = ''; persist(); renderScenePulseWorldsWorkspace(world, sess); });
    host.querySelector('[data-sp-dossier-search]')?.addEventListener('input', event => {
        const query = String(event.target.value || '').trim().toLowerCase();
        host.querySelectorAll('[data-sp-dossier-name]').forEach(row => { row.hidden = !!query && !String(row.dataset.spDossierName || '').includes(query); });
    });
    host.querySelectorAll('[data-sp-action]').forEach(button => button.addEventListener('click', async () => { const action = button.dataset.spAction; if (action === 'demo') { ui.demo = !ui.demo; ui.view = 'scene'; persist(); renderScenePulseWorldsWorkspace(world, sess); return; } if (action === 'thoughts') { scenePulseThoughtPanel(data, ui, persist, async () => { if (ui.demo) { ExperimentalWorldsHost.notify('The tour fixture has no live Reader to regenerate.', 'info'); return null; } await refreshScenePulseThoughts(world, sess, model.latestTurn?.id || ''); const nextModel = buildSidecarWorkspaceModel(world, sess); const nextData = nextModel ? scenePulseWorldsAdapter(world, sess, nextModel, false) : null; renderScenePulseWorldsWorkspace(world, sess); ExperimentalWorldsHost.notify('Inner Thoughts regenerated from the settled turn.', 'success'); return nextData; }); return; } if (action === 'refresh') { if (ui.demo) { ExperimentalWorldsHost.notify('Switch to Live scene before refreshing.', 'info'); return; } button.disabled = true; try { await refreshSidecarSceneIntelligence(world, sess, model.latestTurn?.id || ''); ExperimentalWorldsHost.notify('ScenePulse refreshed for review.', 'success'); } catch (error) { ExperimentalWorldsHost.notify(`Could not refresh ScenePulse: ${error?.message || error}`, 'error'); } renderScenePulseWorldsWorkspace(world, sess); } }));
    host.querySelector('[data-sp-theme]')?.addEventListener('change', event => { ui.theme = event.target.value; persist(); renderScenePulseWorldsWorkspace(world, sess); });
    host.querySelector('[data-sp-effects]')?.addEventListener('change', event => { ui.reduceEffects = !event.target.checked; persist(); host.classList.toggle('spw-reduce-effects', ui.reduceEffects); });
    host.querySelectorAll('[data-sp-idea]').forEach(button => button.addEventListener('click', () => { const idea = data.plotBranches[Number(button.dataset.spIdea)]; const input = document.getElementById('world-user-input'); if (!idea || !input) return; input.value = idea.hook || idea.name || ''; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); ExperimentalWorldsHost.notify('Story direction added to the draft.', 'success'); }));
    host.querySelectorAll('[data-sp-quest-action]').forEach(button => button.addEventListener('click', () => {
        if (ui.demo) { ExperimentalWorldsHost.notify('The tour fixture is read-only. Switch to Live scene to change this timeline.', 'info'); return; }
        const action = button.dataset.spQuestAction;
        const questId = String(button.dataset.spQuestId || '');
        const quest = questId ? findSessionQuest(sess, questId) : null;
        if (action === 'add') { openWorldQuestManager(); return; }
        if (!quest) { ExperimentalWorldsHost.notify('That quest is no longer available in this timeline.', 'warning'); return; }
        if (action === 'edit') { openWorldQuestManager(quest.id); return; }
        if (action === 'complete' || action === 'restore') {
            const nextStatus = action === 'complete' ? 'completed' : 'active';
            const verb = action === 'complete' ? 'Complete' : 'Restore';
            ExperimentalWorldsHost.confirmModal(`${verb} quest`, `${verb} “${quest.title}” in this timeline?`, async () => {
                applyQuestUpdates(world, sess, [{ id: quest.id, status: nextStatus }]);
                await ExperimentalWorldsHost.persist();
                renderWorldPlayState();
                ExperimentalWorldsHost.notify(action === 'complete' ? 'Quest completed.' : 'Quest restored.', 'success');
            });
            return;
        }
        if (action === 'remove') {
            ExperimentalWorldsHost.confirmModal('Delete Quest', `Delete “${quest.title}” from this timeline?`, async () => {
                const index = (sess.quests || []).findIndex(item => item.id === quest.id);
                if (index !== -1) sess.quests.splice(index, 1);
                await ExperimentalWorldsHost.persist();
                renderWorldPlayState();
                ExperimentalWorldsHost.notify('Quest deleted.', 'info');
            });
        }
    }));
    host.querySelectorAll('[data-sp-history]').forEach(button => button.addEventListener('click', () => { model.workspaceUi.selectedSnapshotId = button.dataset.spHistory; model.workspaceUi.historyMode = true; protocol.workspaceUi = model.workspaceUi; persist(); renderSidecarWorkspace(world, sess); }));
}

function renderSidecarWorkspace(world, sess) {
    return renderScenePulseWorldsWorkspace(world, sess);
    const host = document.getElementById('world-sidecar-workspace');
    const column = document.querySelector('#world-play-view .world-status-col');
    if (!host || !column) return;
    const sidecar = window.ExperimentalWorldsSidecarHooks?.isSidecarWorld?.(world, sess) === true;
    column.classList.toggle('is-sidecar', sidecar);
    host.classList.toggle('hidden', !sidecar);
    if (!sidecar) { host.replaceChildren(); return; }
    const model = buildSidecarWorkspaceModel(world, sess);
    if (!model) return;
    const { protocol, workspaceUi } = model;
    const scrollTop = host.querySelector('.si-body')?.scrollTop || 0;
    const currentFocus = document.activeElement?.id || '';
    const statusLabel = model.status === 'blocked' ? 'Commit blocked'
        : model.status === 'warning' ? 'Update incomplete'
            : model.status === 'muted' ? 'Reader disabled'
                : model.status === 'pending' ? 'Reader not processed'
                    : model.status === 'stale' ? 'Reader needs refresh'
                        : 'Reader current';
    const statusClass = model.status === 'ready' ? '' : model.status === 'muted' ? 'is-muted' : 'is-warning';
    // Preserve ScenePulse's real full-width section rhythm. Refresh is a
    // pipeline action in the toolbar, not a decorative per-section spinner.
    const section = (key, title, body, badge = '', icon = '◈') => `<section class="sp-section si-section ${workspaceUi.open[key] !== false ? 'sp-open' : ''}" data-si-section="${experimentalEscapeHTML(key)}"><header class="sp-section-header si-section-header" data-si-section-toggle="${experimentalEscapeHTML(key)}"><span class="sp-section-chevron">›</span><span class="sp-section-icon">${icon}</span><span class="sp-section-title">${experimentalEscapeHTML(title)}</span>${badge ? `<span class="sp-section-badge">${experimentalEscapeHTML(badge)}</span>` : ''}<span class="sp-section-spacer"></span></header><div class="sp-section-body si-section-body"><div class="sp-section-content">${body}</div></div></section>`;
    const button = (label, action, cls = 'btn btn-ghost') => `<button type="button" class="${cls}" data-si-action="${experimentalEscapeHTML(action)}">${experimentalEscapeHTML(label)}</button>`;
    const failure = !model.readerEnabled
        ? `<div class="si-failure is-muted"><strong>Reader disabled</strong><span>New Sidecar turns use the Narrator handoff only until the semantic Reader is enabled for this world.</span><div class="si-retry-row">${button('Enable Reader', 'enable-reader', 'btn btn-primary')}${button('Backstage', 'backstage')}</div></div>`
        : model.readerEnabled && !model.reader && model.latestTurn
            ? `<div class="si-failure is-muted"><strong>Reader not processed</strong><span>This authored turn is preserved. Process its existing narration and handoff without generating a new Narrator response.</span><div class="si-retry-row">${button('Process Current Scene', 'process', 'btn btn-primary')}${button('Backstage', 'backstage')}</div></div>`
        : model.readerStale && !model.failedTurn
            ? `<div class="si-failure is-muted"><strong>Scene Intelligence needs a current reading</strong><span>${model.legacyReader ? 'This timeline still has a legacy sparse Reader snapshot.' : model.readerCoverage?.error === 'reader_output_truncated' ? 'The active Reader response was truncated before it could cover the scene.' : model.readerCoverage?.error === 'reader_incomplete_character_coverage' ? `The active Reader missed ${model.readerCoverage.missing.length} relevant character${model.readerCoverage.missing.length === 1 ? '' : 's'}.` : 'The last settled Reader snapshot belongs to an earlier authored beat.'} The preserved narration has not been changed; refresh its scene reading before treating this panel as current.</span><div class="si-retry-row">${button('Refresh Scene Intelligence', 'refresh', 'btn btn-primary')}${button('Backstage', 'backstage')}</div></div>`
        : model.incompleteCommit
        ? `<div class="si-failure"><strong>Canonical commit incomplete</strong><span>Progression is blocked. The journaled receipt must be recovered through World GM.</span><div class="si-retry-row">${button('Open World GM', 'gm', 'btn btn-primary')}${button('Backstage', 'backstage')}</div></div>`
        : model.failedTurn
            ? `<div class="si-failure"><strong>${experimentalEscapeHTML(model.failedTurn.failure?.stage === 'reader' ? 'Reader update incomplete' : 'Scene update incomplete')}</strong><span>Narration is preserved; downstream interpretation has not settled.</span><div class="si-retry-row">${button('Retry Scene Update', 'retry', 'btn btn-primary')}${button('Backstage', 'backstage')}</div></div>`
            : '';
    const refreshReview = model.pendingReaderRefresh
        ? `<div class="si-refresh-review"><strong>Fresh Reader interpretation ready for review</strong><span>It was derived from the preserved current narration. Accepting it updates Scene Intelligence only; it does not rerun Narrator or replay the canonical receipt.</span><div class="si-retry-row">${button('Use this reading', `accept-refresh:${model.pendingReaderRefresh.id}`, 'btn btn-primary')}${button('Discard', `discard-refresh:${model.pendingReaderRefresh.id}`)}</div></div>`
        : '';
    // Never splice packet prose into a stale Reader projection. The packet is
    // a narrator-context subset and may describe a newer beat than the
    // accepted Reader snapshot; doing so produced the exact "12:00 + Sarah
    // phone call" chimera the workspace is meant to prevent.
    const renderedReader = model.readerFresh || model.historical ? model.reader : null;
    const sceneSummary = renderedReader?.summary || (model.readerStale ? 'The last accepted scene reading is stale. Refresh it to inspect the current authored beat.' : 'No settled Reader scene description yet.');
    const temporal = renderedReader?.temporal || model.projection?.temporal || {};
    const scene = renderedReader?.scene || model.projection?.scene || {};
    const environment = renderedReader?.environment || model.projection?.environment || {};
    const day = temporal.day || temporal.dayOfWeek || 'Unknown day';
    const date = temporal.date || temporal.calendarDate || '';
    const weather = environment.weather || temporal.weather || 'No weather evidence';
    const environmentalText = environment.description || environment.setting || scene.environment || weather;
    const tension = scene.tension || 'unknown';
    const tensionClass = /critical/i.test(tension) ? 'sp-tension-critical' : /high/i.test(tension) ? 'sp-tension-high' : /moderate/i.test(tension) ? 'sp-tension-moderate' : /low/i.test(tension) ? 'sp-tension-low' : 'sp-tension-calm';
    const characterBody = model.activeCharacters.length
        ? model.activeCharacters.map(entry => sidecarWorkspaceCharacterCard(entry, model)).join('')
        : '<div class="sp-empty-state si-empty-state"><div class="sp-empty-icon">◌</div><strong class="sp-empty-title">No relevant people</strong><span class="sp-empty-sub">The Reader has not established anyone beyond the controlled character for this beat.</span></div>';
    const sceneDetailRows = [
        ['Topic', scene.topic], ['Mood', scene.mood || scene.moodAtmosphere], ['Tension', tension],
        ['Interaction', scene.interactionStyle], ['Sound', environment.sound || scene.sound],
        ['Local space', model.location?.localSpace || model.location?.authoredDescription]
    ].filter(([, value]) => String(value || '').trim());
    const sceneDetails = `<div class="sp-scene-summary-row"><div class="sp-scene-summary">${experimentalEscapeHTML(sceneSummary)}</div></div>${sceneDetailRows.map(([label, value]) => `<div class="sp-row ${label === 'Tension' ? `sp-scene-tension-row ${tensionClass}` : label === 'Sound' ? 'sp-scene-sounds-row' : ''}"><span class="sp-row-label">${experimentalEscapeHTML(label)}</span><span class="sp-row-value">${experimentalEscapeHTML(String(value))}</span></div>`).join('')}`;
    const questEntries = (model.projection?.currentThreads || model.projection?.pressures || []).slice(0, 12);
    const questJournal = questEntries.length ? `<div class="sp-plot-tier sp-tier-open sp-tier-main"><div class="sp-plot-tier-title"><span class="sp-tier-chevron">›</span><span class="sp-tier-icon">▣</span><span>Active tasks</span><span class="sp-section-badge">${questEntries.length}</span></div><div class="sp-tier-body">${questEntries.map(item => `<article class="sp-plot-entry sp-card-open"><header class="sp-quest-header"><span class="sp-quest-chevron">›</span><span class="sp-plot-status sp-urgency-moderate">active</span><strong class="sp-plot-name">${experimentalEscapeHTML(String(item.label || item.name || item.threadId || 'Current thread'))}</strong></header><div class="sp-quest-detail">${experimentalEscapeHTML(String(item.details || item.description || item.evidence || 'Current scene pressure.'))}</div></article>`).join('')}</div></div>` : '<div class="sp-empty-state si-empty-state"><div class="sp-empty-icon">▣</div><strong class="sp-empty-title">No active scene tasks</strong><span class="sp-empty-sub">Threads and obligations appear here when the authored beat makes them relevant.</span></div>';
    const dashboard = `<div class="sp-dashboard si-source-dashboard">
        <article class="sp-dash-card sp-dash-card-date"><span class="sp-dash-sub">${experimentalEscapeHTML(date)}</span><strong class="sp-dash-day">${experimentalEscapeHTML(day)}</strong></article>
        <article class="sp-dash-card sp-dash-card-time"><span class="sp-dash-clock">◷</span><strong class="sp-time-value">${experimentalEscapeHTML(model.worldTime)}</strong></article>
        <article class="sp-dash-card sp-dash-card-temp ${tensionClass}"><div class="sp-temp-bar-wrap"><div class="si-source-tension-bar"><i></i></div></div><strong class="sp-temp-bar-label">${experimentalEscapeHTML(tension)} · ${experimentalEscapeHTML(scene.mood || 'scene mood unknown')}</strong></article>
        <article class="sp-dash-card sp-dash-card-weather"><span class="sp-dash-icon">${/rain|storm|wind/i.test(weather) ? '≋' : '☁'}</span><strong class="sp-dash-value">${experimentalEscapeHTML(environmentalText)}</strong></article>
    </div><div class="sp-dash-location"><span class="sp-dash-loc-icon">⌖</span><span class="sp-dash-loc-text">${experimentalEscapeHTML([model.location?.name, ...(model.location?.parentLocations || []).map(item => item.name)].filter(Boolean).join(' ← ') || 'Unknown location')}</span></div>`;
    const sceneBody = `${failure}${refreshReview}${dashboard}
        ${section('scene-details', 'Scene details', sceneDetails, scene.topic ? 'live' : '', '▸')}
        ${section('characters', 'Characters', characterBody, `${model.activeCharacters.length}`, '♙')}
        ${section('relationships', 'Relationships', sidecarWorkspaceRelationshipMarkup(model), `${model.relationships.length}`, '↔')}
        ${section('quest-journal', 'Quest journal', questJournal, `${questEntries.length}`, '▣')}
        ${section('changes', 'Changes, places & objects', `<div class="si-source-change-grid"><div><strong>What changed</strong>${sidecarWorkspaceList(model.projection?.changes, 'No material change was extracted for this beat.')}</div><div><strong>Relevant objects</strong>${sidecarWorkspaceList(model.projection?.salientObjects, 'No object has current scene relevance.')}</div><div><strong>Relevant places</strong>${sidecarWorkspaceList(model.projection?.salientLocations, 'No additional place is currently salient.')}</div></div>`, `${(model.projection?.changes || []).length}`, '◇')}
        ${section('candidates', 'Scene evidence', model.candidates.length ? model.candidates.slice(-12).reverse().map(candidate => `<article class="sp-candidate-card si-candidate-card"><header><span class="si-avatar">${sidecarWorkspaceAvatar(candidate.label || candidate.role)}</span><span class="si-candidate-title"><strong>${experimentalEscapeHTML(candidate.label || candidate.role || candidate.candidateType || 'Scene candidate')}</strong><small>${experimentalEscapeHTML(candidate.candidateType || 'candidate')} · ${experimentalEscapeHTML(candidate.status || 'evidence')}</small></span></header><p>${experimentalEscapeHTML(String(candidate.description || candidate.evidence || candidate.clothingDescription || 'Pre-canonical evidence; review required.').slice(0, 420))}</p><div class="si-card-actions">${button('Review evidence', `candidate:${experimentalEscapeHTML(candidate.candidateId || '')}`)}${button('World GM', `candidate-gm:${experimentalEscapeHTML(candidate.candidateId || '')}`)}</div></article>`).join('') : '<div class="sp-empty-state si-empty-state"><div class="sp-empty-icon">◇</div><strong class="sp-empty-title">No scene candidates</strong><span class="sp-empty-sub">New people, places and props remain evidence until reviewed.</span></div>', `${model.candidates.length}`, '◇')}
        ${section('questions', 'Questions & pressures', model.openQuestions.length ? model.openQuestions.slice(0, 10).map(question => `<article class="si-question-card"><div class="si-question-heading"><span class="si-question-mark">?</span><strong>${experimentalEscapeHTML(question.prompt || question.id)}</strong><span class="sp-section-badge">${experimentalEscapeHTML(question.priority || question.pressure || 'open')}</span></div><p>${experimentalEscapeHTML(String(question.evidence || 'The answer remains unresolved and will be carried only while relevant.').slice(0, 360))}</p><div class="si-card-actions">${button('Open World GM', 'gm')}</div></article>`).join('') : '<div class="sp-empty-state si-empty-state"><div class="sp-empty-icon">?</div><strong class="sp-empty-title">No open questions</strong><span class="sp-empty-sub">Uncertainty is carried only when it remains relevant to continuity.</span></div>', `${model.openQuestions.length}`, '?')}`;
    const relationshipBody = sidecarWorkspaceRelationshipMarkup(model);
    const characterBrowserBody = model.activeCharacters.length ? `<div class="si-character-intro">Characters are grouped by what the authored beat establishes: active, nearby, audible and remote. Expand a card for scoped evidence.</div>${model.activeCharacters.map(entry => sidecarWorkspaceCharacterCard(entry, model)).join('')}` : '<div class="sp-empty-state si-empty-state"><div class="sp-empty-icon">◌</div><strong class="sp-empty-title">No character evidence</strong><span class="sp-empty-sub">No character-specific presence has settled for this scene.</span></div>';
    const historyBody = sidecarWorkspaceHistoryTimeline(model);
    const thoughtsBody = sidecarWorkspaceThoughts(model);
    const allKnownBody = sidecarWorkspaceKnownCharacters(model);
    const viewBody = workspaceUi.view === 'relationships' ? `<div class="si-view-intro"><span class="si-kicker">RELATIONSHIP WEB</span><h2>People in the current world</h2><p>Signals, posture and evidence over time.</p></div>${section('relationships', 'Relationships', relationshipBody, `${model.relationships.length}`, '↔')}`
        : workspaceUi.view === 'characters' ? `<div class="si-view-intro"><span class="si-kicker">CHARACTER BROWSER</span><h2>Who is in the beat?</h2><p>ScenePulse-style character cards backed by Horde’s canonical entities and scoped Reader evidence.</p></div>${section('characters', 'Characters', characterBrowserBody, `${model.activeCharacters.length}`, '♙')}`
            : workspaceUi.view === 'history' ? `<div class="si-view-intro"><span class="si-kicker">SCENE HISTORY</span><h2>Reader snapshots</h2><p>Immutable derived snapshots attached to accepted Turns and Takes.</p></div>${section('history', 'History & timeline', historyBody, `${model.snapshots.length}`, '◷')}`
                : workspaceUi.view === 'thoughts' ? `<div class="si-view-intro"><span class="si-kicker">CHARACTER READINGS</span><h2>What each person may be making of this</h2><p>Private, evidence-scoped Reader interpretation—not objective canon.</p></div>${section('thoughts', 'Provisional cognition', thoughtsBody, `${model.activeCharacters.filter(entry => entry.intelligence).length}`, '◌')}`
                    : workspaceUi.view === 'all-known' ? `<div class="si-view-intro"><span class="si-kicker">ALL KNOWN CHARACTERS</span><h2>World registry</h2><p>Kept deliberately outside the relevance-first scene roster.</p></div>${section('all-known', 'Known characters', allKnownBody, `${model.knownCharacters.length}`, '♙')}`
                : sceneBody;
    const rerender = () => { renderSidecarWorkspace(world, sess); };
    // Keep a single tiny bridge on window for the generated tab buttons.  It
    // avoids relying on a long-lived listener attached to DOM that is rebuilt
    // during world renders, while still mutating the canonical timeline UI
    // state rather than introducing a second workspace state store.
    window.__hordeSceneWorkspaceView = view => {
        if (!['scene', 'relationships', 'characters', 'history', 'thoughts', 'all-known'].includes(view)) return;
        workspaceUi.view = view;
        protocol.workspaceUi = workspaceUi;
        sess.sidecar = protocol;
        rerender();
        ExperimentalWorldsHost.persist().catch(error => console.warn('Scene Intelligence view persistence failed:', error));
    };
    if (!window.__hordeSceneWorkspaceDocumentListener) {
        document.addEventListener('click', event => {
            const button = event.target?.closest?.('#world-sidecar-workspace [data-si-view]');
            if (!button) return;
            window.__hordeSceneWorkspaceView?.(button.dataset.siView);
        });
        window.__hordeSceneWorkspaceDocumentListener = true;
    }
    const toolbarButton = (label, view, title) => `<button type="button" class="sp-toolbar-btn si-source-toolbar-btn ${workspaceUi.view === view ? 'sp-tb-active' : ''}" data-si-view="${view}" title="${experimentalEscapeHTML(title)}" aria-label="${experimentalEscapeHTML(title)}">${label}</button>`;
    const compactPipelineAction = model.historical
        ? `<button type="button" class="sp-toolbar-btn si-source-toolbar-btn" data-si-action="return-current" title="Return to the current scene" aria-label="Return to the current scene">↩</button>`
        : `<button type="button" class="sp-toolbar-btn si-source-toolbar-btn" data-si-action="refresh" title="Refresh Scene Intelligence" aria-label="Refresh Scene Intelligence">↻</button>`;
    host.innerHTML = `<div class="sp-toolbar si-source-toolbar"><div class="sp-brand si-source-brand"><span class="sp-brand-mark" aria-hidden="true">◉</span><span class="sp-brand-word">Scene<span>Pulse</span></span><small>${experimentalEscapeHTML(model.hierarchy.scene?.title || model.location?.name || 'Current scene')}</small></div><span class="sp-toolbar-spacer"></span><span class="sidecar-status-pill ${statusClass}">${experimentalEscapeHTML(model.historical ? 'History mode' : statusLabel)}</span>${compactPipelineAction}${toolbarButton('⌂', 'scene', 'Open current scene')}${toolbarButton('◌', 'thoughts', 'Open character thoughts')}${toolbarButton('◷', 'history', 'Open accepted scene history')}${toolbarButton('♙', 'all-known', 'Browse all known characters')}<button type="button" class="sp-toolbar-btn si-source-toolbar-btn" data-si-action="collapse-all" title="Collapse or expand scene sections" aria-label="Collapse or expand scene sections">▦</button><button type="button" class="sp-toolbar-btn si-source-toolbar-btn" data-si-action="backstage" title="Open Backstage evidence" aria-label="Open Backstage evidence">≡</button><button type="button" class="sp-toolbar-btn si-source-toolbar-btn" data-si-action="gm" title="Open World GM" aria-label="Open World GM">✎</button></div><div class="sp-panel-body si-body">${viewBody}</div>`;
    // Bind the generated tab controls directly after each redraw.  The
    // workspace is rebuilt during Sidecar updates, so a one-time listener on
    // an earlier DOM node is not sufficient.  The document-level bridge above
    // remains as a defensive fallback for host redraws that occur mid-click.
    host.querySelectorAll('[data-si-view]').forEach(buttonEl => buttonEl.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const nextView = buttonEl.dataset.siView;
        if (!['scene', 'relationships', 'characters', 'history', 'thoughts', 'all-known'].includes(nextView)) return;
        workspaceUi.view = nextView;
        protocol.workspaceUi = workspaceUi;
        sess.sidecar = protocol;
        rerender();
        ExperimentalWorldsHost.persist().catch(error => console.warn('Scene Intelligence view persistence failed:', error));
    }));
    host.querySelectorAll('[data-si-section-toggle]').forEach(header => header.addEventListener('click', event => {
        if (event.target.closest('[data-si-section-refresh]')) return;
        const sectionEl = header.closest('.si-section');
        if (!sectionEl) return;
        const isOpen = sectionEl.classList.toggle('sp-open');
        workspaceUi.open[header.dataset.siSectionToggle] = isOpen;
        ExperimentalWorldsHost.persist().catch(() => {});
    }));
    host.querySelectorAll('[data-si-toggle="character"]').forEach(header => header.addEventListener('click', () => header.closest('.si-character-card')?.classList.toggle('sp-card-open')));
    host.querySelectorAll('.sp-rel-header').forEach(header => header.addEventListener('click', () => header.closest('.si-rel-block')?.classList.toggle('sp-card-open')));
    host.querySelectorAll('[data-si-snapshot]').forEach(buttonEl => buttonEl.addEventListener('click', () => {
        workspaceUi.selectedSnapshotId = buttonEl.dataset.siSnapshot || '';
        workspaceUi.historyMode = true;
        protocol.workspaceUi = workspaceUi;
        sess.sidecar = protocol;
        rerender();
        ExperimentalWorldsHost.persist().catch(error => console.warn('Scene Intelligence history selection persistence failed:', error));
    }));
    host.querySelectorAll('[data-si-action]').forEach(buttonEl => buttonEl.addEventListener('click', async () => {
        const action = buttonEl.dataset.siAction || '';
        if (action === 'return-current') {
            workspaceUi.historyMode = false;
            workspaceUi.selectedSnapshotId = '';
            protocol.workspaceUi = workspaceUi;
            sess.sidecar = protocol;
            await ExperimentalWorldsHost.persist();
            rerender(); return;
        }
        if (action === 'collapse-all') {
            const sections = [...host.querySelectorAll('[data-si-section]')];
            const anyOpen = sections.some(sectionEl => sectionEl.classList.contains('sp-open'));
            sections.forEach(sectionEl => {
                const key = sectionEl.dataset.siSection;
                sectionEl.classList.toggle('sp-open', !anyOpen);
                if (key) workspaceUi.open[key] = !anyOpen;
            });
            protocol.workspaceUi = workspaceUi;
            sess.sidecar = protocol;
            await ExperimentalWorldsHost.persist();
            return;
        }
        if (action === 'backstage') return openWorldSidecarInspector('backstage');
        if (action === 'gm') return openWorldSidecarLine({ kind: 'world_gm', title: 'World GM · Scene Intelligence', guidance: 'Resolve the current Sidecar failure or authorial ambiguity without regenerating the visible Narrator turn.' });
        if (action === 'enable-reader') {
            world.sidecarConfig = window.ExperimentalWorldsSidecarMode?.normalizeWorldConfig?.({ ...world, sidecarConfig: { ...(world.sidecarConfig || {}), tracker: { ...(world.sidecarConfig?.tracker || {}), readerEnabled: true } } }) || world.sidecarConfig;
            if (world.sidecarConfig?.tracker) world.sidecarConfig.tracker.readerEnabled = true;
            await ExperimentalWorldsHost.persist();
            ExperimentalWorldsHost.notify('Sidecar Reader enabled for this world.', 'success');
            rerender(); return;
        }
        if (model.historical && ['process', 'retry', 'refresh'].includes(action)) {
            ExperimentalWorldsHost.notify('Historical Scene Intelligence is read-only. Return to the current scene to process it.', 'info');
            return;
        }
        if (action === 'process') {
            buttonEl.disabled = true; buttonEl.textContent = 'Processing…';
            try {
                if (model.failedTurn) await retrySidecarSceneUpdate(world, sess, model.failedTurn.id);
                else if (model.latestTurn?.id) await refreshSidecarSceneIntelligence(world, sess, model.latestTurn.id);
                else throw new Error('There is no authored turn to process yet.');
                ExperimentalWorldsHost.notify('Scene Intelligence processed.', 'success');
            } catch (error) { ExperimentalWorldsHost.notify(`Scene processing failed: ${error?.message || error}`, 'error'); }
            rerender(); return;
        }
        if (action === 'retry') {
            buttonEl.disabled = true; buttonEl.textContent = 'Retrying…';
            try { await retrySidecarSceneUpdate(world, sess, model.failedTurn?.id); } catch (error) { ExperimentalWorldsHost.notify(`Scene update retry failed: ${error?.message || error}`, 'error'); }
            rerender(); return;
        }
        if (action === 'refresh') {
            buttonEl.disabled = true; buttonEl.textContent = '…';
            try { await refreshSidecarSceneIntelligence(world, sess, model.latestTurn?.id || ''); ExperimentalWorldsHost.notify('Scene Intelligence refreshed for review.', 'success'); } catch (error) { ExperimentalWorldsHost.notify(`Scene refresh failed: ${error?.message || error}`, 'error'); }
            rerender(); return;
        }
        if (action.startsWith('accept-refresh:')) {
            buttonEl.disabled = true; buttonEl.textContent = 'Applying…';
            try {
                acceptSidecarReaderRefresh(world, sess, action.slice(15));
                await ExperimentalWorldsHost.persist();
                ExperimentalWorldsHost.notify('Scene Intelligence updated from the reviewed reading. Narration and canon were untouched.', 'success');
            } catch (error) { ExperimentalWorldsHost.notify(`Could not apply that Reader refresh: ${error?.message || error}`, 'error'); }
            rerender(); return;
        }
        if (action.startsWith('discard-refresh:')) {
            discardSidecarReaderRefresh(world, sess, action.slice(16));
            await ExperimentalWorldsHost.persist();
            ExperimentalWorldsHost.notify('Reader refresh discarded. The last settled scene view remains unchanged.', 'info');
            rerender(); return;
        }
        if (action.startsWith('candidate-gm:')) {
            const candidate = model.candidates.find(item => item.candidateId === action.slice(13));
            if (candidate) openWorldSidecarLine({ kind: 'world_gm', title: 'Review scene candidate', guidance: 'Decide whether this candidate should match an existing record, be promoted, or remain ephemeral.', draft: `Candidate: ${candidate.label || candidate.role || candidate.candidateType}\nEvidence: ${candidate.description || candidate.evidence || ''}` });
            return;
        }
        if (action.startsWith('candidate:')) {
            const candidate = model.candidates.find(item => item.candidateId === action.slice(10));
            if (candidate) openWorldSidecarLine({ kind: 'world_gm', title: 'Review scene candidate', guidance: 'Review this pre-canonical evidence with the World GM.', draft: `Candidate: ${candidate.label || candidate.role || candidate.candidateType}\nEvidence: ${candidate.description || candidate.evidence || ''}` });
            return;
        }
        if (action.startsWith('relationship:')) {
            const relation = model.relationships.find(item => item.id === action.slice(13));
            if (relation) openWorldSidecarLine({ kind: 'world_gm', title: 'Review relationship evidence', guidance: 'Review this relationship posture and its evidence. Do not infer a reciprocal change without authorial support.', draft: `${relation.label}\n${relation.posture}\n${relation.evidence}` });
        }
    }));
    host.querySelectorAll('[data-si-history]').forEach(row => row.addEventListener('click', () => openWorldSidecarInspector('backstage')));
    requestAnimationFrame(() => { const body = host.querySelector('.si-body'); if (body) body.scrollTop = scrollTop; if (currentFocus) document.getElementById(currentFocus)?.focus({ preventScroll: true }); });
}

function openWorldSidecarInspector(view = 'scene') {
    closeWorldSidecarInspector();
    const world = ExperimentalWorldsState.worlds.find(item => item.id === ExperimentalWorldsState.activeWorldId);
    const sess = getCurrentWorldSession();
    if (!world || !sess) return;
    const isSidecar = window.ExperimentalWorldsSidecarHooks?.isSidecarWorld?.(world, sess) === true;
    // Scene State and Backstage are part of the transcript.  The user should
    // inspect the handoff beside the turn it explains, not in a second generic
    // JSON window. Keep the modal only for legacy migration and true actions.
    if (isSidecar && view === 'backstage') {
        const cards = [...document.querySelectorAll('.world-sidecar-backstage')];
        const card = cards.at(-1);
        if (card) {
            card.open = true;
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        ExperimentalWorldsHost.notify('No committed Sidecar handoff exists yet for this timeline.', 'info');
        return;
    }
    const protocol = isSidecar ? window.ExperimentalWorldsSidecarHooks.normalizeWorldTimeline(world, sess) : null;
    const packet = isSidecar ? (protocol.packet || buildSidecarScenePacket(world, sess)) : null;
    const latestTurn = isSidecar ? (protocol.turns || []).at(-1) : null;
    const failedTurn = isSidecar
        ? (protocol.turns || []).filter(turn => ['reconciliation_failed', 'reconciliation_pending'].includes(turn.status)).at(-1)
        : null;
    const incompleteCommit = sess?.sidecarIncompleteCommit || null;
    const readerBackfillTurns = isSidecar ? (protocol.turns || []).filter(turn => turn.status !== 'superseded').slice(-120) : [];
    const readerBackfillTurnOptions = readerBackfillTurns.map((turn, index) => `<option value="${experimentalEscapeHTML(String(turn.id || ''))}">Turn ${index + 1} · ${experimentalEscapeHTML(String(turn.id || '').slice(-28))}</option>`).join('');
    const title = view === 'line' ? 'World GM · private Sidecar line'
        : view === 'backstage' ? 'Backstage handoff'
        : view === 'migration' ? 'Enable Sidecar for this world'
        : 'Scene State';
    const overlay = document.createElement('div');
    overlay.id = 'world-sidecar-inspector-overlay';
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '1100';
    const legacy = `<section style="display:grid; gap:12px; padding:4px 0;">
        <div class="fallback-banner" style="display:block; margin:0;"><span class="banner-icon">◌</span><span class="banner-text"><strong>This timeline is using Inline Legacy.</strong> Sidecar packets, private Sidecar conversation, scene reconciliation and Sidecar-only controls are intentionally unavailable until this timeline is migrated.</span></div>
        <div class="form-hint">The existing narration history and canonical receipts will be retained. Derived vectors are rebuilt after migration; this does not create a new world.</div>
        <div><button class="btn btn-primary" id="world-sidecar-inspector-migrate">Open Sidecar migration wizard</button></div>
    </section>`;
    let body = legacy;
    if (isSidecar) {
        const tabs = `<div style="display:flex; gap:7px; flex-wrap:wrap; margin-bottom:12px;">
            <button class="tool-btn sidecar-inspector-tab" data-view="scene">Scene state</button>
            <button class="tool-btn sidecar-inspector-tab" data-view="backstage">Backstage</button>
            <button class="tool-btn sidecar-inspector-tab" data-view="questions">Questions</button>
            <button class="tool-btn sidecar-inspector-tab" data-view="memory">Memory jobs</button>
            <button class="tool-btn sidecar-inspector-tab" data-view="line">Private Sidecar line</button>
            <button class="tool-btn sidecar-inspector-tab" data-view="timelines">Timelines</button>
        </div>`;
        if (view === 'line') { openWorldSidecarLine(); return; }
        else if (view === 'backstage') body = `${tabs}${sidecarInspectorJson({ narratorHandoff: latestTurn?.handoff || latestTurn?.sceneHandoff || null, sidecarReader: latestTurn?.reader || null, sidecarReceipt: latestTurn?.receipt || latestTurn?.reconciliationReceipt || null, roleplayOS: latestTurn?.ff54 || null, temporalBreakdown: latestTurn?.sceneHeader || null, controlledCharacterEvidence: latestTurn?.controlledCharacterEvidence || null, nextScenePacket: packet, proposals: (protocol.backgroundProposals || []).slice(-12), refinements: (protocol.refinements || []).slice(-12), readerRefreshes: (protocol.readerRefreshes || []).slice(-20), commitJournal: (sess.sidecarCommitJournal || []).slice(-40), incompleteCommit: sess.sidecarIncompleteCommit || null }, 'No Sidecar turn has been committed yet.')}`;
        else if (view === 'questions') body = `${tabs}${sidecarInspectorJson((protocol.questions || []).filter(question => question.status !== 'resolved'), 'There are no open Sidecar questions.')}`;
        else if (view === 'memory') body = `${tabs}<div style="display:grid; gap:8px; margin-bottom:10px; padding:10px; border:1px solid var(--border); border-radius:8px;"><div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;"><strong>Reader backfill</strong><span class="form-hint">Derived evidence only; canonical turns and world history are never rewritten.</span></div><div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;"><label class="form-label" style="min-width:210px;">From turn<select id="world-sidecar-reader-backfill-start" class="form-select"><option value="">First eligible turn</option>${readerBackfillTurnOptions}</select></label><label class="form-label" style="min-width:210px;">Through turn<select id="world-sidecar-reader-backfill-end" class="form-select"><option value="">Last eligible turn</option>${readerBackfillTurnOptions}</select></label><button class="btn btn-primary" id="world-sidecar-reader-backfill">Backfill selected range</button></div></div>${protocol.readerBackfill ? `<div class="form-hint" style="margin-bottom:8px;">Reader backfill: ${experimentalEscapeHTML(protocol.readerBackfill.status || 'idle')} · ${Number(protocol.readerBackfill.completed) || 0} completed · ${Number(protocol.readerBackfill.failed) || 0} failed${protocol.readerBackfill.lastError ? ` · ${experimentalEscapeHTML(protocol.readerBackfill.lastError)}` : ''}</div>` : ''}${sidecarInspectorJson({
            configuration: effectiveSidecarMemoryConfig(world),
            readerProfile: effectiveSidecarReaderProfile(world, sess),
            readerBackfill: protocol.readerBackfill || null,
            readerSnapshots: (protocol.readerSnapshots || []).slice(-40).map(snapshot => ({ id: snapshot.id, status: snapshot.status, turnId: snapshot.turnId, sceneId: snapshot.sceneId, sequenceId: snapshot.sequenceId, mode: snapshot.envelope?.snapshotMode, profileRevision: snapshot.envelope?.profileRevision, createdAt: snapshot.createdAt })),
            jobs: (protocol.jobs || []).slice(-120),
            graph: {
                worldHistory: (protocol.memoryGraph?.worldHistory || []).map(record => ({ id: record.id, turnId: record.turnId, status: record.status, sceneId: record.sceneId, sequenceId: record.sequenceId, vectorizedAt: record.vectorizedAt || '' })),
                episodes: (protocol.memoryGraph?.episodes || []).map(record => ({ id: record.id, sourceTurnIds: record.sourceTurnIds, sceneIds: record.sceneIds, sequenceIds: record.sequenceIds, status: record.status, vectorizedAt: record.vectorizedAt || '' })),
                scenes: protocol.memoryGraph?.scenes || [], sequences: protocol.memoryGraph?.sequences || [], cognition: protocol.memoryGraph?.cognition || []
            }
        }, 'No Sidecar memory work has been recorded yet.')}`;
        else if (view === 'timelines') body = `${tabs}<p class="form-hint">Forks are immutable copies of a selected committed revision. Superseded takes stay auditable but do not leak into the active timeline.</p><button class="btn btn-primary" id="world-sidecar-inspector-timelines">Open timeline and fork browser</button>`;
        else if (view === 'scene') body = `${tabs}${sidecarSceneProjectionMarkup(world, sess)}`;
        else body = `${tabs}${sidecarInspectorJson(packet, 'The next-turn scene packet has not been prepared yet.')}`;
    }
    overlay.innerHTML = `<div class="modal" style="width:min(900px, calc(100vw - 36px)); max-height:86vh; display:flex; flex-direction:column;"><div class="modal-header"><h2>${experimentalEscapeHTML(title)}</h2><button class="modal-close" id="close-world-sidecar-inspector">×</button></div><div class="modal-body" style="overflow:auto;">${body}</div></div>`;
    globalThis.ExperimentalWorldsDom.portalRoot().appendChild(overlay);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeWorldSidecarInspector(); });
    document.getElementById('close-world-sidecar-inspector')?.addEventListener('click', closeWorldSidecarInspector);
    document.getElementById('world-sidecar-inspector-migrate')?.addEventListener('click', () => { closeWorldSidecarInspector(); openSidecarMigrationWizard(world.id); });
    document.querySelectorAll('.sidecar-inspector-tab').forEach(button => button.addEventListener('click', () => openWorldSidecarInspector(button.dataset.view)));
    const openCandidateReview = button => {
        const candidate = protocol?.readerCandidates?.find(item => item.candidateId === button.dataset.candidateId);
        if (!candidate) return;
        openWorldSidecarLine({
            kind: 'world_gm',
            title: 'Review scene candidate',
            guidance: 'Review this pre-canonical scene candidate. Confirm whether it should be promoted, matched to an existing canonical entity, or left ephemeral. Do not invent an ID; resolve it from the world registry if a match is intended.',
            draft: `Candidate: ${candidate.label || candidate.role || candidate.candidateType}\nType: ${candidate.candidateType}\nEvidence: ${candidate.description || candidate.clothingDescription || ''}\nRequested action: ${button.dataset.candidateAction || 'review'}\n\nPlease resolve this through the World GM conversation.`
        });
    };
    overlay.querySelectorAll('.sidecar-candidate-promote').forEach(button => button.dataset.candidateAction = 'promote');
    overlay.querySelectorAll('.sidecar-candidate-leave').forEach(button => button.dataset.candidateAction = 'leave ephemeral');
    overlay.querySelectorAll('.sidecar-candidate-match').forEach(button => button.dataset.candidateAction = 'match existing');
    overlay.querySelectorAll('.sidecar-candidate-promote,.sidecar-candidate-leave,.sidecar-candidate-match').forEach(button => button.addEventListener('click', () => openCandidateReview(button)));
    overlay.querySelector('.sidecar-retry-scene-update')?.addEventListener('click', async event => {
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = 'Retrying…';
        try {
            await retrySidecarSceneUpdate(world, sess, button.dataset.sidecarTurnId);
            closeWorldSidecarInspector();
        } catch (error) {
            ExperimentalWorldsHost.notify(`Retry Scene Update failed: ${error?.message || error}`, 'error');
            button.disabled = false;
            button.textContent = 'Retry Scene Update';
        }
    });
    overlay.querySelector('.sidecar-open-world-gm')?.addEventListener('click', () => {
        const detail = incompleteCommit?.error?.message || failedTurn?.failure?.message || '';
        closeWorldSidecarInspector();
        openWorldSidecarLine({
            kind: 'world_gm',
            title: 'Recover Sidecar commit',
            guidance: 'Review the incomplete or failed downstream transaction. Resolve it through the native canonical commit/World GM path; do not replay narration or invent a replacement event.',
            draft: detail ? `A Sidecar transaction requires recovery:\n${detail}\n\nPlease inspect the journaled receipt and explain how it should be resolved.` : ''
        });
    });
    overlay.querySelector('.sidecar-scene-refresh')?.addEventListener('click', async event => {
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = '…';
        try {
            const refreshed = await refreshSidecarSceneIntelligence(world, sess, latestTurn?.id || '');
            ExperimentalWorldsHost.notify(refreshed?.status === 'review' ? 'Scene Intelligence refreshed for review; canon was unchanged.' : 'Scene update retry started.', 'success');
            closeWorldSidecarInspector();
            openWorldSidecarInspector('scene');
        } catch (error) {
            ExperimentalWorldsHost.notify(`Scene Intelligence refresh failed: ${error?.message || error}`, 'error');
            button.disabled = false;
            button.textContent = '↻';
        }
    });
    document.getElementById('world-sidecar-inspector-timelines')?.addEventListener('click', () => { closeWorldSidecarInspector(); openWorldTimelineBrowser(); });
    document.getElementById('world-sidecar-reader-backfill')?.addEventListener('click', async event => {
        const button = event.currentTarget; button.disabled = true; button.textContent = 'Backfilling…';
        try {
            const result = await window.ExperimentalWorldsSidecarReaderBackfill?.run(world, sess, {
                startTurnId: document.getElementById('world-sidecar-reader-backfill-start')?.value || '',
                endTurnId: document.getElementById('world-sidecar-reader-backfill-end')?.value || '',
                onProgress: progress => { button.textContent = `Backfilling… ${progress.completed || 0}/${progress.total || 0}`; }
            });
            ExperimentalWorldsHost.notify(`Reader backfill ${result?.status || 'completed'}: ${result?.completed || 0} completed, ${result?.failed || 0} failed.`, result?.failed ? 'warning' : 'success');
            closeWorldSidecarInspector(); openWorldSidecarInspector('memory');
        } catch (error) { ExperimentalWorldsHost.notify(`Reader backfill failed: ${error.message || error}`, 'error'); button.disabled = false; button.textContent = 'Backfill semantic reader'; }
    });
}

async function reviseWorldAgentProposal(world, sess, proposal, guidance) {
    const config = normalizeWorldAgentConfig(world);
    const response = await fetch(ExperimentalWorldsHost.apiBase() + '/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...ExperimentalWorldsHost.authHeaders() },
        body: JSON.stringify(ExperimentalWorldsHost.applyOpenRouterRouting({
            model: config.model || structuredModelFor(world), max_tokens: 1400,
            messages: [
                { role: 'system', content: 'You revise a background World Agent proposal. Return ONLY JSON with the same proposal shape. Keep it grounded in the supplied digest, never affect the player, never create unsupported entities, and do not narrate prose.' },
                { role: 'user', content: JSON.stringify({ guidance, currentProposal: proposal, digest: buildWorldAgentDigest(world, sess) }) }
            ]
        }, world, { scope: 'worldAgent' }))
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.error?.message || response.statusText);
    const content = (await response.json())?.choices?.[0]?.message?.content || '';
    const parsed = parseWorldAgentPayload(content);
    if (!parsed || (!parsed.actions && !parsed.world_events && !parsed.npc_goal_updates && !parsed.npc_moves && !parsed.faction_updates && !parsed.location_state_updates && !parsed.npc_relationship_updates)) throw new Error('World Agent returned no usable proposal.');
    const sanitized = sanitizeWorldAgentActions(parsed);
    const target = protocolForSidecarTimeline(world, sess);
    if (!target) throw new Error('Sidecar timeline unavailable.');
    proposal.actions = experimentalSafeJsonClone(sanitized.actions);
    proposal.dropped = sanitized.dropped;
    proposal.summary = (Array.isArray(parsed.developments) ? parsed.developments : proposal.summary || []).map(item => String(item?.summary || item || '').trim()).filter(Boolean).slice(0, 5);
    proposal.status = 'pending_sidecar_review';
    proposal.revisedAt = new Date().toISOString();
    proposal.revisionGuidance = String(guidance).slice(0, 1000);
    proposal.revisionProvenance = { source: 'world_agent_revision', model: config.model || structuredModelFor(world) };
    target.packet = buildSidecarScenePacket(world, sess);
    await ExperimentalWorldsHost.persist();
    return proposal;
}

function protocolForSidecarTimeline(world, sess) {
    return window.ExperimentalWorldsSidecarHooks?.normalizeWorldTimeline?.(world, sess) || null;
}

function extractInlineWorldTurnReceipt(text) {
    const source = String(text || '');
    const tagged = source.match(/<world_turn_receipt>\s*([\s\S]*?)\s*<\/world_turn_receipt>/i);
    if (tagged) {
        const parsed = experimentalSafeParseJSONRepair(tagged[1]);
        if (experimentalIsPlainObject(parsed)) return parsed;
    }
    const legacy = extractInlineWorldStatePayload(source);
    if (legacy) return {
        scene: {},
        events: [],
        entity_updates: [],
        state_updates: legacy,
        summary: 'Legacy state payload recovered.'
    };
    return null;
}

function scrubNarrativeArtifacts(text) {
    if (!text) return text;
    const KEY_ALT = ENGINE_STATE_KEYS.join('|');
    // Coerce: this is fed straight from provider payloads, and an array or
    // object arriving here used to throw on .replace and kill the whole turn.
    let t = typeof text === 'string' ? text : String(text);
    // The explicit tool-free state channel: applied by the engine, never shown.
    t = t.replace(/<world_turn_receipt>[\s\S]*?(?:<\/world_turn_receipt>|$)/gi, '')
         .replace(/<world_state_json>[\s\S]*?(?:<\/world_state_json>|$)/gi, '');
    // XML-ish tool-call wrappers various providers emit as visible text
    t = t.replace(/<\|?\/?tool[_-]?calls?\|?>/gi, '')
         .replace(/<function(_call)?[^>]*>[\s\S]*?(<\/function(_call)?>|$)/gi, '');
    // Fenced JSON blocks that are clearly engine payloads
    t = t.replace(new RegExp('```(?:json)?[^`]*?(?:' + KEY_ALT + ')[\\s\\S]*?(?:```|$)', 'gi'), '');
    // Bare JSON object lines carrying engine keys
    t = t.replace(new RegExp('^\\s*\\{[^\\n]*"(?:' + KEY_ALT + ')"[^\\n]*\\}?\\s*$', 'gim'), '');
    // Pseudo function-call lines printed as prose
    t = t.replace(/^\s*(?:commit_world_turn|update_world_state|investigate_secret)\s*\(\s*\{[\s\S]*?\}\s*\)\s*;?\s*$/gim, '');
    // Legacy/system tag echoes copied from context
    t = t.replace(/\[(?:STATEUPDATE|LEDGERUPDATE)[^\]]*\]/gi, '')
         .replace(/^\s*\[(?:ENGINE EVENTS?|MANDATE|FINAL MANDATE|SYSTEM)[^\]]*\]\s*$/gim, '');
    // Collapse the gaps scrubbing leaves behind
    return t.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Normalize model-authored chronicle text before it reaches the persistent
 * ledger. Models vary the bullet/tag syntax, so storage must not depend on one
 * exact rendering of "[MEMORY]: ...".
 */
function normalizeWorldLedgerEntry(value) {
    if (value === null || value === undefined) return '';
    let entry = String(value)
        .replace(/^\s*\[MEMORY\]\s*:?\s*/i, '')
        .replace(/^\s*<\/?memory>\s*/i, '')
        .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
        .replace(/^\s*["']|["']\s*$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!entry || /^(?:no[_\s-]?memory|none|nothing consequential)\.?$/i.test(entry)) return '';
    return entry.slice(0, 500);
}

function worldLedgerEntryKey(value) {
    return normalizeWorldLedgerEntry(value)
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

/** Append once and return the canonical, unbulleted entry for message metadata. */
function appendWorldLedgerEntry(session, value) {
    if (!session) return null;
    const entry = normalizeWorldLedgerEntry(value);
    if (!entry) return null;

    const key = worldLedgerEntryKey(entry);
    const alreadyRecorded = String(session.ledger || '')
        .split('\n')
        .some(line => worldLedgerEntryKey(line) === key);
    if (!alreadyRecorded) {
        const existing = String(session.ledger || '').trim();
        session.ledger = `${existing}${existing ? '\n' : ''}• ${entry}`;
        session.ledgerRevision = (Number(session.ledgerRevision) || 0) + 1;
        compactWorldLedger(session);
    }
    return entry;
}

const WORLD_LEDGER_HOT_LINES = 100;
const WORLD_LEDGER_HOT_CHARS = 24000;

function compactWorldLedger(session) {
    if (!session) return;
    let lines = String(session.ledger || '').split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length <= WORLD_LEDGER_HOT_LINES && lines.join('\n').length <= WORLD_LEDGER_HOT_CHARS) return;
    if (!Array.isArray(session.ledgerArchive)) session.ledgerArchive = [];
    let keepFrom = Math.max(0, lines.length - WORLD_LEDGER_HOT_LINES);
    while (keepFrom < lines.length - 1 && lines.slice(keepFrom).join('\n').length > WORLD_LEDGER_HOT_CHARS) keepFrom++;
    keepFrom = Math.max(1, keepFrom);
    const archived = lines.slice(0, keepFrom);
    session.ledger = lines.slice(keepFrom).join('\n');
    session.ledgerArchive.push({
        id: `ledger_archive_${Date.now()}_${session.ledgerArchive.length + 1}`,
        fromTurn: Math.max(1, (Number(session.turnCount) || 1) - lines.length),
        toTurn: Math.max(1, Number(session.turnCount) || 1),
        lines: archived.slice(0, 120),
        createdAt: Date.now()
    });
    session.ledgerArchive = session.ledgerArchive.slice(-120);
}

function retrieveWorldLedgerArchive(session, query, limit = 12) {
    const archives = Array.isArray(session?.ledgerArchive) ? session.ledgerArchive : [];
    if (!archives.length) return '';
    const terms = [...new Set(String(query || '').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])].slice(0, 40);
    const candidates = [];
    archives.forEach((archive, archiveIndex) => {
        (Array.isArray(archive.lines) ? archive.lines : []).forEach((line, lineIndex) => {
            const lower = String(line || '').toLowerCase();
            const matches = terms.reduce((score, term) => score + (lower.includes(term) ? 1 : 0), 0);
            if (matches > 0) candidates.push({ line, matches, recency: archiveIndex * 1000 + lineIndex });
        });
    });
    return candidates.sort((a, b) => b.matches - a.matches || b.recency - a.recency)
        .slice(0, limit).map(item => item.line).join('\n').slice(0, 6000);
}

function syncCurrentWorldSnapshotLedger(session) {
    if (!session || !Array.isArray(session.history) || !session.history.length) return false;
    const message = session.history[session.history.length - 1];
    if (message?.role !== 'dm') return false;
    const patch = snapshot => {
        if (!snapshot?.session) return;
        snapshot.session.ledger = session.ledger;
        snapshot.session.ledgerRevision = session.ledgerRevision;
        snapshot.session.ledgerManualRevision = session.ledgerManualRevision;
        snapshot.session.ledgerManualOverrideText = session.ledgerManualOverrideText;
        snapshot.session.ledgerDiagnostics = experimentalSafeJsonClone(session.ledgerDiagnostics || {});
    };
    patch(message.postSnapshot);
    const currentVersion = message.currentVersion ?? ((message.versions || []).length - 1);
    if (Array.isArray(message.versionSnapshots) && currentVersion >= 0) {
        patch(message.versionSnapshots[currentVersion]);
    }
    return true;
}

function replaceWorldLedger(session, value) {
    if (!session) return false;
    const next = String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, 200000);
    if (next === String(session.ledger || '').trim()) return false;
    session.ledger = next;
    session.ledgerRevision = (Number(session.ledgerRevision) || 0) + 1;
    session.ledgerManualRevision = (Number(session.ledgerManualRevision) || 0) + 1;
    session.ledgerManualOverrideText = next;
    session.ledgerDiagnostics = {
        turn: Math.max(1, parseInt(session.turnCount) || 1),
        status: 'updated',
        source: 'manual'
    };
    syncCurrentWorldSnapshotLedger(session);
    return true;
}

function extractWorldLedgerEntry(text) {
    if (!text) return '';
    const source = String(text);
    const tagged = source.match(/\[MEMORY\]\s*:?\s*([^\r\n]+)/i)
        || source.match(/<memory>\s*([\s\S]*?)<\/memory>/i)
        || source.match(/(?:^|\n)\s*MEMORY\s*:\s*([^\r\n]+)/i);
    return tagged ? normalizeWorldLedgerEntry(tagged[1]) : '';
}

/** Remove only the technical directive, wherever the model placed it. */
function stripWorldLedgerDirective(text) {
    if (!text) return text;
    return String(text)
        .replace(/\s*<memory>[\s\S]*?<\/memory>\s*/gi, '\n')
        .replace(/\s*\[MEMORY\]\s*:?[^\r\n]*/gi, '')
        .replace(/(?:^|\n)\s*MEMORY\s*:\s*[^\r\n]*/gi, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function buildStructuredLedgerFallback(world, session, args = {}, questResult = {}, mechanics = {}) {
    if (!world || !session || args.ledger_update) return '';
    const facts = [];
    const names = values => [...new Set((Array.isArray(values) ? values : [])
        .map(value => String(value || '').trim())
        .filter(Boolean))];
    const npcName = ref => {
        const id = resolveNpcId(world, ref, session);
        return world.entities.find(entity => entity.id === id)?.name || String(ref || '').trim();
    };

    const introduced = names((args.location_introduced || []).map(item => item?.name));
    if (introduced.length) facts.push(`The world gained the newly discovered location${introduced.length === 1 ? '' : 's'} ${introduced.join(', ')}`);
    if (args.label) facts.push(`The secret "${String(args.label).trim()}" was uncovered`);

    names(args.inventory_add).forEach(item => facts.push(`The player obtained ${item}`));
    names(args.inventory_remove).forEach(item => facts.push(`The player lost ${item}`));
    (Array.isArray(mechanics.transactions) ? mechanics.transactions : [])
        .filter(transaction => transaction?.success)
        .forEach(transaction => facts.push(`The player ${transaction.type === 'sell' ? 'sold' : 'bought'} ${transaction.quantity} ${transaction.item}`));
    (Array.isArray(mechanics.checks) ? mechanics.checks : [])
        .filter(check => !check?.success && check?.failureCost?.condition)
        .forEach(check => facts.push(`The player suffered ${check.failureCost.condition} after failing ${check.label}`));

    (Array.isArray(args.npc_status_changes) ? args.npc_status_changes : []).forEach(update => {
        const name = npcName(update?.npc_id);
        const status = String(update?.status || '').trim();
        if (!name || !status) return;
        facts.push(`${name} became ${status}${update.cause ? ` because ${String(update.cause).trim()}` : ''}`);
    });
    names((args.npc_introduced || []).map(item => item?.name))
        .forEach(name => facts.push(`The player encountered ${name}`));
    (Array.isArray(args.npc_goal_updates) ? args.npc_goal_updates : []).forEach(update => {
        const name = npcName(update?.npc_id);
        const goal = String(update?.goal || '').trim();
        if (name && goal) facts.push(`${name} began pursuing "${goal}"`);
    });

    (Array.isArray(args.npc_disposition_changes) ? args.npc_disposition_changes : []).forEach(update => {
        const name = npcName(update?.npc_id);
        const reason = String(update?.reason || '').trim();
        if (name && reason) facts.push(`${name}'s feelings toward the player changed because ${reason}`);
    });
    (Array.isArray(args.npc_relationship_updates) ? args.npc_relationship_updates : []).forEach(update => {
        const source = npcName(update?.source_npc_id);
        const target = npcName(update?.target_npc_id);
        const reason = String(update?.reason || '').trim();
        if (source && target && reason) facts.push(`${source} and ${target}'s relationship changed because ${reason}`);
    });

    (Array.isArray(args.quests_update) ? args.quests_update : []).forEach(update => {
        const quest = findSessionQuest(session, update?.id, update?.title);
        if (!quest) return;
        const suppliedStatus = String(update?.status || '').trim();
        if (suppliedStatus === 'completed' || suppliedStatus === 'failed' || suppliedStatus === 'abandoned') {
            facts.push(`The quest "${quest.title}" became ${suppliedStatus}`);
        } else if (!update?.id && update?.title) {
            facts.push(`The player accepted the quest "${quest.title}"`);
        }
    });
    for (const id of questResult.completed || []) {
        const quest = findSessionQuest(session, id);
        if (quest) facts.push(`The player completed the quest "${quest.title}"`);
    }
    for (const id of questResult.failed || []) {
        const quest = findSessionQuest(session, id);
        if (quest) facts.push(`The player failed the quest "${quest.title}"`);
    }

    (Array.isArray(args.threads_update) ? args.threads_update : []).forEach(update => {
        if (update?.status === 'resolved' && update.text) facts.push(`The story thread "${String(update.text).trim()}" was resolved`);
    });
    (Array.isArray(args.location_state_updates) ? args.location_state_updates : []).forEach(update => {
        const location = getLocationRef(world, update?.location_id);
        if (!location) return;
        const conditions = names([
            ...(Array.isArray(update.set_conditions) ? update.set_conditions : []),
            ...(Array.isArray(update.add_conditions) ? update.add_conditions : [])
        ].map(condition => typeof condition === 'string' ? condition : condition?.label));
        if (conditions.length) facts.push(`${location.name} came under the lasting condition${conditions.length === 1 ? '' : 's'} ${conditions.join(', ')}`);
    });
    (Array.isArray(args.faction_updates) ? args.faction_updates : []).forEach(update => {
        const faction = String(update?.name || update?.id || '').trim();
        if (!faction) return;
        if (['defeated', 'disbanded'].includes(update.status)) facts.push(`${faction} was ${update.status}`);
        else if (update.goal) facts.push(`${faction} committed to the goal "${String(update.goal).trim()}"`);
    });
    names((args.world_events || []).map(event => event?.title))
        .forEach(title => facts.push(`The future event "${title}" was set in motion`));

    const uniqueFacts = [...new Map(facts.map(fact => [worldLedgerEntryKey(fact), fact])).values()];
    if (!uniqueFacts.length) return '';
    const summary = uniqueFacts.slice(0, 3).join('; ');
    return `${summary.replace(/[.;]\s*$/, '')}.`;
}

/**
 * Last-resort, provider-independent chronicle recovery.
 *
 * Structured state remains the preferred source, followed by the model's
 * explicit [MEMORY] line and the small classifier request below. This local
 * pass exists for providers that omit tools/tags or fail only the classifier
 * request. It deliberately accepts only sentences containing strong,
 * completed-state language so ordinary travel and descriptive prose do not
 * flood the source-of-truth ledger.
 */
function buildLocalNarrativeLedgerFallback(userInput, narrative) {
    const strippedDirective = stripWorldLedgerDirective(String(narrative || ''));
    const source = (typeof stripSpokenDialogue === 'function' ? stripSpokenDialogue(strippedDirective) : strippedDirective)
        .replace(/<details[\s\S]*?<\/details>/gi, ' ')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/[*_~#>`]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!source) return '';

    const decisivePatterns = [
        { score: 12, pattern: /\b(?:died|is dead|was killed|was slain|has fallen|permanently departed|left (?:the \w+\s+)?forever)\b/i },
        { score: 11, pattern: /\b(?:was destroyed|collapsed|burned down|was shattered|was sealed|was opened|was conquered|was liberated)\b/i },
        { score: 10, pattern: /\b(?:obtained|acquired|received|claimed|recovered|lost|surrendered|gave away|spent|sold|bought)\b/i },
        { score: 10, pattern: /\b(?:accepted|completed|failed|abandoned)\b.{0,50}\b(?:quest|mission|task|oath|contract)\b|\b(?:quest|mission|task|oath|contract)\b.{0,50}\b(?:accepted|completed|failed|abandoned)\b/i },
        { score: 9, pattern: /\b(?:discovered|uncovered|revealed|learned|confirmed|exposed)\b/i },
        { score: 8, pattern: /\b(?:promised|swore|pledged|joined|betrayed|forgave|rescued|freed|arrested|banished)\b/i },
        { score: 7, pattern: /\b(?:became allies|became enemies|fell in love|ended their alliance|took control|declared war|made peace)\b/i }
    ];
    const uncertain = /\b(?:almost|nearly|tries?|attempts?|might|may|could|would|perhaps|maybe|rumou?r|seems?|appears?|if|unless|claims?|claimed|says?|said|alleges?|alleged|lies?|lied|according to|supposedly|reportedly|believes?|suspects?)\b/i;
    const negativeOutcome = /\b(?:not|never|didn'?t|doesn'?t|hasn'?t|hadn'?t|failed to)\b.{0,45}\b(?:die|dead|killed|slain|destroyed|collapsed|obtained|acquired|received|lost|accepted|completed|discovered|revealed|promised|joined|betrayed|rescued|freed|arrested)\b/i;
    const candidates = (source.match(/[^.!?\n]+[.!?]?/g) || [])
        .map(sentence => sentence.trim())
        .filter(sentence => sentence.length >= 12 && sentence.length <= 420 && !sentence.endsWith('?'))
        .map((sentence, index) => {
            if (uncertain.test(sentence) || negativeOutcome.test(sentence)) return null;
            let score = 0;
            decisivePatterns.forEach(rule => {
                if (rule.pattern.test(sentence)) score = Math.max(score, rule.score);
            });
            if (!score) return null;
            if (/\b(?:the player|you|your)\b/i.test(sentence)) score += 1;
            return { sentence, score, index };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || a.index - b.index);
    if (!candidates.length) return '';

    let entry = candidates[0].sentence
        .replace(/^(?:meanwhile|afterward|finally|then)[,:]?\s*/i, '')
        .replace(/^you\b/i, 'The player')
        .replace(/^your character\b/i, 'The player')
        .replace(/\s+/g, ' ')
        .trim();
    if (!/[.!?]$/.test(entry)) entry += '.';
    return normalizeWorldLedgerEntry(entry);
}

function shouldRepairMissingWorldReceipt(world, command, userInput, narrative) {
    const kernel = normalizeWorldKernelConfig(world);
    if (!kernel.enabled) return true;
    if (kernel.repairMode === 'always') return true;
    if (kernel.repairMode === 'never') return false;
    if (['init', 'look', 'continue'].includes(command)) return false;
    const source = `${String(userInput || '')}\n${String(narrative || '')}`.slice(0, 9000);
    // Repair only when prose plausibly established durable canon. Small talk,
    // description and ordinary reactions safely receive a local no-op receipt.
    return /\b(?:buy|bought|sell|sold|pay|paid|give|gave|take|took|steal|stole|drop|dropped|wear|wore|change[sd]? clothes|attack|hit|hurt|injur|heal|kill|died|dead|destroy|break|broke|discover|reveal|learned|promise|swore|join|betray|arrest|escape|quest|mission|objective|relationship|trust|reputation|faction|schedule|arriv|depart|enter|leave|left|travel|move[sd]?|time pass|waited|slept|day later|hour later|condition|poison|disease|fire|flood|collapse)\b/i.test(source);
}

/**
 * Models occasionally ignore both the state tool and the [MEMORY] contract.
 * Ask a tiny, tool-free classifier only in that failure case so meaningful
 * developments are still recorded without filling the ledger with small talk.
 */
async function recoverWorldLedgerEntry(world, modelId, userInput, narrative, signal) {
    if (!narrative || !String(narrative).trim()) return '';
    try {
        const response = await fetch(ExperimentalWorldsHost.apiBase() + '/chat/completions', {
            method: 'POST',
            signal,
            headers: {
                ...ExperimentalWorldsHost.authHeaders(),
                'Content-Type': 'application/json',
                ...ExperimentalWorldsHost.attributionHeaders()
            },
            body: JSON.stringify(ExperimentalWorldsHost.applyOpenRouterRouting({
                model: modelId,
                stream: false,
                temperature: 0,
                // Reasoning models spend this budget on hidden thinking before
                // emitting a single visible token. At 120 they return empty
                // content every time, which silently killed the chronicle.
                max_tokens: 900,
                messages: ExperimentalWorldsHost.sanitizeMessagesForProvider([
                    {
                        role: 'system',
                        content: 'You maintain a fictional world chronicle. Return exactly NO_MEMORY for description, repetition, small talk, or ordinary movement between known places. Otherwise return one concise factual sentence (max 35 words) only when canon permanently changed: a major choice, new discovery, promise, relationship shift, item gained/lost, quest change, lasting world condition, or death/departure. Never invent details.'
                    },
                    {
                        role: 'user',
                        content: `PLAYER ACTION:\n${String(userInput || '(continued scene)').slice(0, 1200)}\n\nDM OUTCOME:\n${String(narrative).slice(0, 4000)}`
                    }
                ])
            }, world))
        });
        if (!response.ok) {
            console.warn(`Horde Engine: Chronicle classifier unavailable (${response.status}); using local recovery.`);
            return '';
        }
        const data = await response.json();
        const message = data.choices?.[0]?.message;
        let result = message?.content || '';
        if (Array.isArray(result)) result = result.map(part => part?.text || '').join(' ');
        result = String(result).trim();
        if (!result) {
            // Content empty but the model clearly worked: it spent the whole
            // budget reasoning. Say so rather than failing invisibly.
            console.warn(`Horde Engine: chronicle classifier returned no content${
                message?.reasoning ? ' (budget consumed by hidden reasoning — raise max_tokens)' : ''
            }; falling back to local recovery.`);
            return '';
        }
        // Strip visible chain-of-thought wrappers before reading the verdict.
        result = result.replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, '').trim();
        if (/^NO[_\s-]?MEMORY\b/i.test(result)) return '';
        return extractWorldLedgerEntry(result) || normalizeWorldLedgerEntry(result.split('\n').find(Boolean) || '');
    } catch (err) {
        if (err?.name !== 'AbortError') console.warn('Horde Engine: Chronicle recovery failed', err);
        return '';
    }
}

/**
 * ✍️ Impersonate: ask the model to draft the USER's next message,
 * writing as the player's persona. Result lands in the input box for
 * editing — nothing is sent automatically.
 */
