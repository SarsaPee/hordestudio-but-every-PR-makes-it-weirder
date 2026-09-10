// --- World Agent -----------------------------------------------------------
// The deterministic tick keeps the world consistent; it cannot invent. The world
// agent is the one place the simulation is allowed to surprise you: on a long
// interval it reads a compact digest and proposes developments that follow from
// what is already in motion.
//
// It shapes the WORLD ONLY. Every field that touches the player — position,
// stats, inventory, dice, money, time, quests — is stripped before anything is
// applied, so an off-screen simulation can never reach in and edit the person
// playing. What survives goes through the same validated handlers the DM uses.
const WORLD_AGENT_FIELDS = Object.freeze([
    'world_events', 'npc_goal_updates', 'npc_moves', 'faction_updates',
    'location_state_updates', 'npc_relationship_updates', 'economy_updates',
    'schedule_updates'
]);

function normalizeWorldAgentConfig(world) {
    const raw = (world && typeof world.worldAgent === 'object' && !Array.isArray(world.worldAgent))
        ? world.worldAgent : {};
    return {
        enabled: raw.enabled === true,
        intervalTurns: Math.max(8, Math.min(200, parseInt(raw.intervalTurns) || 24)),
        model: String(raw.model || '').trim().slice(0, 160),
        openRouterRouting: normalizeOpenRouterRouting(raw.openRouterRouting, { allowNull: true }),
        proposalOnly: raw.proposalOnly === true
    };
}

function shouldRunWorldAgent(world, sess, options = {}) {
    if (!world || !sess) return false;
    if (options.isReroll) return false;            // replays must not re-roll the dice
    if (!normalizeWorldGameRules(world).modules.livingWorld) return false;
    const config = normalizeWorldAgentConfig(world);
    if (!config.enabled) return false;
    const protocol = window.HordeSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    const activeSceneId = protocol?.activeSceneId || '';
    if (activeSceneId && sess.lastWorldAgentSceneId && sess.lastWorldAgentSceneId !== activeSceneId) {
        return true;
    }
    const turn = Math.max(1, parseInt(sess.turnCount) || 1);
    const last = Math.max(0, parseInt(sess.lastWorldAgentTurn) || 0);
    const elapsed = last === 0 ? turn : turn - last;
    if (elapsed < config.intervalTurns) return false;
    if (elapsed >= config.intervalTurns * 2) return true; // eventual momentum guarantee
    const queued = (sess.scheduledEvents || []).filter(event => event.status === 'scheduled'
        && (event.dueTurn == null || event.dueTurn >= turn)).length;
    const activeGoals = sessionNpcs(world, sess).filter(npc => {
        const npcState = sess.entityStates?.[npc.id];
        return npcState?.goal && ['active', 'blocked'].includes(npcState.goalStatus || 'active');
    }).length;
    // Ask for invention only when the deterministic kernel is running out of
    // future material. A populated event queue already keeps the world alive.
    return queued < Math.max(2, Math.min(6, Math.ceil(activeGoals / 4)));
}

// Compact enough to stay cheap: what is in motion, not the whole world.
function buildWorldAgentDigest(world, sess) {
    const time = getWorldTimeData(world, sess);
    const nameOf = id => world.entities.find(item => item.id === id)?.name || id;
    const locName = id => world.locations.find(item => item.id === id)?.name || id;
    const lines = [];
    lines.push(`WORLD: ${world.name}`);
    lines.push(`TIME: day ${time.days}, ${String(time.hours24).padStart(2, '0')}:${String(time.mins).padStart(2, '0')} (turn ${sess.turnCount || 1})`);
    lines.push(`PLAYER IS AT: ${locName(sess.playerLocation)} — do not move, harm, reward, or otherwise touch the player.`);

    const agendaPool = sessionNpcs(world, sess).map(npc => {
        const entState = sess.entityStates?.[npc.id];
        if (!entState?.goal || !isNpcActive(entState)) return null;
        const step = entState.goalSteps?.[entState.goalStepIndex || 0];
        return `- ${npc.name} [${npc.id}] at ${locName(entState.location)} — ${entState.goalStatus} "${entState.goal}" ${entState.goalProgress || 0}%${step ? ` (currently: ${step})` : ''}`;
    }).filter(Boolean);
    const agendas = rotatingWorldWindow(agendaPool, 20, sess.turnCount || 0);
    if (agendas.length) lines.push(`NPC AGENDAS IN MOTION:\n${agendas.join('\n')}`);

    const factions = rotatingWorldWindow((sess.factions || []).filter(f => !['defeated', 'disbanded'].includes(f.status)), 10, sess.turnCount || 0)
        .map(f => `- ${f.name} [${f.id}] influence ${f.influence}, reputation ${f.reputation}${f.goal ? ` — "${f.goal}" ${f.goalProgress}%` : ''}`);
    if (factions.length) lines.push(`FACTIONS:\n${factions.join('\n')}`);

    const pending = (sess.scheduledEvents || []).filter(e => e.status === 'scheduled').slice(0, 10)
        .map(e => `- ${e.title} (turn ${e.dueTurn ?? '?'}${e.locationId ? ` at ${locName(e.locationId)}` : ''})`);
    if (pending.length) lines.push(`ALREADY SCHEDULED (do not duplicate):\n${pending.join('\n')}`);

    const notable = rotatingWorldWindow(Object.entries(sess.locationStates || {})
        .filter(([, s]) => (s.conditions || []).length || s.danger > 30), 10, sess.turnCount || 0)
        .map(([id, s]) => `- ${locName(id)} [${id}]: danger ${s.danger}, prosperity ${s.prosperity}${(s.conditions || []).length ? `, ${s.conditions.map(c => c.label).join('/')}` : ''}`);
    if (notable.length) lines.push(`LOCATION STATES:\n${notable.join('\n')}`);

    const news = (sess.worldNews || []).slice(-12).map(item => `- ${item.text}`);
    if (news.length) lines.push(`RECENT DEVELOPMENTS:\n${news.join('\n')}`);

    const acted = (sess.history || []).filter(m => m.role === 'user').slice(-5).map(m => `- ${String(m.text || '').slice(0, 160)}`);
    if (acted.length) lines.push(`WHAT THE PLAYER HAS BEEN DOING:\n${acted.join('\n')}`);

    lines.push(`PLACES: ${rotatingWorldWindow(sessionLocations(world, sess), 60, sess.turnCount || 0).map(l => `${l.name} [${l.id}]`).join(', ')}`);
    return lines.join('\n\n');
}

function bumpWorldEpoch(session) {
    if (session) session._worldEpoch = (Number(session._worldEpoch) || 0) + 1;
    return Number(session?._worldEpoch) || 0;
}

// Strip anything that would let an off-screen simulation edit the player.
function sanitizeWorldAgentActions(raw) {
    const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    const actions = {};
    let dropped = 0;
    Object.keys(source).forEach(key => {
        if (WORLD_AGENT_FIELDS.includes(key)) {
            const value = source[key];
            if (Array.isArray(value) ? value.length : value != null) actions[key] = value;
        } else {
            dropped++;
        }
    });
    return { actions, dropped, applied: Object.keys(actions).length > 0 };
}

async function runWorldAgent(world, sess, options = {}) {
    const config = normalizeWorldAgentConfig(world);
    const turn = Math.max(1, parseInt(sess.turnCount) || 1);
    const startEpoch = Number(sess._worldEpoch) || 0;
    const protocol = window.HordeSidecarHooks?.normalizeWorldTimeline?.(world, sess);
    const triggerReason = options.triggerReason || (protocol?.activeSceneId && sess.lastWorldAgentSceneId !== protocol.activeSceneId ? 'scene_change' : 'turn_cadence');
    sess.lastWorldAgentTurn = turn;   // set first: a failure must not retry every turn
    if (protocol?.activeSceneId) sess.lastWorldAgentSceneId = protocol.activeSceneId;

    const system = `You are the WORLD AGENT for a persistent roleplay world. Between the player's scenes you decide what the rest of the world does.

Your job is CONSEQUENCE and MOMENTUM, not spectacle:
- Advance what is already in motion. Every development must follow from an existing agenda, faction, tension, or recent event in the digest.
- Prefer the small and concrete over the world-shaking: a debt called in, a door found open, a rumour reaching the wrong ear, a routine quietly changed.
- Let consequences land off-screen. People react to what has happened; they do not wait politely for the player.
- Do not repeat anything under ALREADY SCHEDULED.

ABSOLUTE LIMITS — you control the world, never the player:
- Never move, injure, heal, reward, rob, or otherwise affect the player character.
- Never invent player actions, decisions, or dialogue.
- Never create locations or people that do not appear in the digest; work with who and what exists.
- Never narrate prose. You emit state changes only.

Propose 1 to 3 developments. Return ONLY this JSON, no prose or fences:
{"developments":[{"summary":"<one sentence, for the author's log>"}],
 "world_events":[{"id":"<slug>","title":"<short>","description":"<one or two sentences>","due_turn":<integer turn>,"location_id":"<id or omit>","condition_on_trigger":"<optional short condition label>","condition_duration_turns":<optional integer>}],
 "npc_goal_updates":[{"npc_id":"<id>","goal":"<new goal, only to redirect someone>","goal_progress_change":<integer>,"status":"active|blocked|completed|failed"}],
 "npc_moves":[{"npc_id":"<id>","location_id":"<id>","reason":"<short>"}],
 "faction_updates":[{"id":"<id>","name":"<name>","influence_change":<integer>,"reputation_change":<integer>,"goal":"<optional>","goal_progress_change":<integer>}],
 "location_state_updates":[{"location_id":"<id>","danger_change":<integer>,"prosperity_change":<integer>,"conditions_add":["<label>"]}],
 "npc_relationship_updates":[{"source_npc_id":"<id>","target_npc_id":"<id>","change":<integer>,"reason":"<short>"}]}
Omit any array you are not using. Current turn is ${turn}; schedule events a few turns out, not in the past.`;

    const response = await fetch(apiBase() + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(applyOpenRouterRouting({
            model: config.model || structuredModelFor(world),
            max_tokens: 1200,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: buildWorldAgentDigest(world, sess) }
            ]
        }, world, { scope: 'worldAgent' }))
    });
    if (!response.ok) {
        throw new Error((await response.json().catch(() => ({})))?.error?.message || response.statusText);
    }
    const content = (await response.json())?.choices?.[0]?.message?.content || '';
    const parsed = parseWorldAgentPayload(content);
    if (!parsed) throw new Error('World agent returned no usable JSON');

    // The player may have rerolled, reset, deleted this timeline, or advanced
    // it while the background request was in flight. Never apply a development
    // authored against a state that no longer exists.
    const liveInstance = state.worldInstances?.[world.id];
    const timelineStillExists = liveInstance?.sessions?.includes(sess);
    if (!timelineStillExists || (Number(sess._worldEpoch) || 0) !== startEpoch
        || Math.max(1, parseInt(sess.turnCount) || 1) !== turn) {
        console.warn('Horde Engine: discarded stale World Agent response after timeline changed.');
        return { applied: false, stale: true, turn, developments: [] };
    }

    const { actions, dropped } = sanitizeWorldAgentActions(parsed);
    if (dropped) console.warn(`Horde Engine: world agent proposed ${dropped} out-of-scope field(s); ignored.`);
    if (!Object.keys(actions).length) return { applied: false, turn, developments: [] };

    const developments = (Array.isArray(parsed.developments) ? parsed.developments : [])
        .map(item => String(item?.summary || item || '').trim()).filter(Boolean).slice(0, 5);
    const sidecarTimeline = window.HordeSidecarHooks?.isSidecarWorld?.(world, sess) === true;
    if (sidecarTimeline || config.proposalOnly) {
            if (protocol) {
            protocol.backgroundProposals.push({
                id: `world_agent_${turn}_${Date.now().toString(36)}`,
                status: 'pending_sidecar_review', createdAt: new Date().toISOString(), turn,
                summary: developments, actions: safeJsonClone(actions), dropped,
                provenance: { source: 'world_agent', model: config.model || structuredModelFor(world), triggerReason, sceneId: protocol.activeSceneId || '' }
            });
            protocol.backgroundProposals = protocol.backgroundProposals.slice(-80);
            protocol.packet = buildSidecarScenePacket(world, sess);
        }
        console.log(`Horde Engine: World Agent stored a proposal packet on turn ${turn}.`);
        return { applied: false, proposed: true, turn, developments, fields: Object.keys(actions) };
    }

    processStructuredActions(actions, world, sess);

    developments.forEach((summary, index) => {
        addWorldNews(sess, summary, {
            id: `news_agent_${turn}_${index}`, type: 'world', playerVisible: false,
            knownBy: []   // nobody has heard yet; it must reach the player like anything else
        });
    });
    console.log(`Horde Engine: World Agent applied ${Object.keys(actions).join(', ')} on turn ${turn}`);
    return { applied: true, turn, developments, fields: Object.keys(actions) };
}

function parseWorldAgentPayload(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    const candidates = [];
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) candidates.push(fenced[1]);
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
    candidates.push(text);
    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch (error) { /* try the next shape */ }
    }
    return null;
}

function syncNPCSchedules(world, sess) {
    if (!normalizeWorldGameRules(world).modules.schedules) {
        return { moves: 0, active: 0 };
    }
    normalizeLivingWorldState(world, sess);
    const time = getWorldTimeData(world, sess);
    const currentTimeStr = `${time.hours24.toString().padStart(2, '0')}:${time.mins.toString().padStart(2, '0')}`;
    let moveCount = 0;
    let activeCount = 0;

    world.entities.forEach(ent => {
        const hasTimelineOverride = Object.prototype.hasOwnProperty.call(sess.npcScheduleOverrides || {}, ent.id);
        if (!world.hudConfig?.enableSchedules && !hasTimelineOverride) return;
        const schedule = hasTimelineOverride
            ? sess.npcScheduleOverrides[ent.id]
            : ent.schedule;
        if (ent.type !== 'npc' || !schedule || schedule.length === 0) return;
        if (!isVisibleToSession(ent, sess)) return;               // other timeline's NPC
        if (!isNpcActive(sess.entityStates[ent.id])) return;      // the dead keep no appointments

        // Authored/imported world templates never pass through session
        // normalization, so an out-of-range time reaches the clock comparison
        // raw. Drop malformed blocks rather than let one become the fallback.
        const usable = schedule.filter(block => isValidScheduleTime(block?.time));
        if (usable.length === 0) return;

        // Weekly routines are first-class. A block without `days` remains a
        // daily block for backwards compatibility; weekday/weekend and named
        // days let school, work, worship and leisure stop happening every day.
        const today = usable.filter(block => isScheduleBlockForWorldDay(world, block, time.days));
        const yesterday = usable.filter(block => isScheduleBlockForWorldDay(world, block, Math.max(1, time.days - 1)));
        const sorted = [...today].sort((a, b) => a.time.localeCompare(b.time));
        let activeBlock = null;

        for (const block of sorted) {
            if (block.time <= currentTimeStr) {
                activeBlock = block;
            } else {
                break;
            }
        }

        if (!activeBlock) {
            const prior = [...yesterday].sort((a, b) => a.time.localeCompare(b.time));
            activeBlock = prior[prior.length - 1] || sorted[sorted.length - 1] || null;
        }

        if (activeBlock) {
            if (!sess.entityStates[ent.id]) sess.entityStates[ent.id] = { location: ent.startLocation || world.startLocationId };
            const entState = sess.entityStates[ent.id];

            // ARBITRATION: the narrative outranks the timetable. If the DM moved
            // this NPC recently, the schedule may not teleport them away.
            if (isNpcPinned(sess, entState)) return;

            const loc = getLocationRef(world, activeBlock.locationId);
            if (loc) activeCount++;
            if (loc && entState.location !== loc.id) {
                const prevLoc = entState.location;
                entState.location = loc.id;
                entState.currentActivity = activeBlock.activity || "";
                moveCount++;
                // If this move crosses the player's scene, the DM must narrate it —
                // characters walk in and out, they don't blink in and out.
                if (loc.id === sess.playerLocation) {
                    queueEngineEvent(sess, `${ent.name} has just arrived here${activeBlock.activity ? ` (${activeBlock.activity})` : ''} — narrate their entrance.`);
                } else if (prevLoc === sess.playerLocation) {
                    queueEngineEvent(sess, `${ent.name} is leaving${activeBlock.activity ? ` to ${activeBlock.activity}` : ''} — narrate their departure.`);
                }
            } else if (loc) {
                entState.currentActivity = activeBlock.activity || "";
            }
        }
    });
    Object.assign(sess.livingWorldActivity, {
        turn: Math.max(sess.livingWorldActivity.turn || 0, Math.max(1, parseInt(sess.turnCount) || 1)),
        scheduleMoves: moveCount,
        activeSchedules: activeCount
    });
    return { moves: moveCount, active: activeCount };
}

function validateWorldReferences(world) {
    const report = { broken: [], suggestions: {} };
    if (!world) return report;

    const locIds = world.locations.map(l => l.id ? l.id.toLowerCase() : '').filter(Boolean);
    const locNames = world.locations.map(l => l.name ? l.name.toLowerCase() : "").filter(Boolean);

    const check = (ref, source) => {
        if (!ref) return;
        const clean = ref.toLowerCase().trim();
        if (!locIds.includes(clean) && !locNames.includes(clean)) {
            report.broken.push({ ref, source });
            const best = world.locations.find(l => l.name && (l.name.toLowerCase().includes(clean) || clean.includes(l.name.toLowerCase())));
            if (best) report.suggestions[ref] = best.id;
        }
    };

    world.entities.forEach(ent => {
        check(ent.startLocation, `NPC ${ent.name} Start`);
        check(ent.homeLocation, `NPC ${ent.name} Home`);
        (ent.schedule || []).forEach(s => check(s.locationId, `NPC ${ent.name} Schedule @ ${s.time}`));
    });

    world.locations.forEach(loc => {
        (loc.exits || []).forEach(ex => {
            const target = getExitTargetName(ex);
            if (target) {
                check(target, `Location ${loc.name} Exit`);
            }
        });
    });

    return report;
}

/**
 * ✨ AI Schedule Generator: builds a daily or weekly routine for an NPC from their
 * personality and the world's geography. Optional — manual editing still works.
 * Returns true on success.
 */
async function generateNpcSchedule(npc, world) {
    if (!hasApiCredentials()) { showToast('API Key missing (Settings).', 'error'); return false; }
    if (!world.locations || world.locations.length === 0) { showToast('Add locations first.', 'error'); return false; }

    const locManifest = world.locations
        .map(l => `- id: "${l.id}" | ${l.name}${l.description ? ` — ${l.description.slice(0, 80)}` : ''}`)
        .join('\n');
    const homeLoc = world.locations.find(l => l.id === npc.homeLocation || l.name === npc.homeLocation);

    const prompt = `WORLD: ${world.name} — ${world.description || ''}

NPC: ${npc.name}
Description: ${npc.description || 'Unknown'}
${npc.persona ? `Personality: ${npc.persona}` : ''}
${homeLoc ? `Home: ${homeLoc.name}` : 'No fixed home.'}

AVAILABLE LOCATIONS (you MUST use only these ids):
${locManifest}

Design this NPC's believable weekly routine: 5-10 time blocks covering ordinary weekdays plus any meaningfully different weekend behavior. Use days:["weekday"], days:["weekend"], or named weekdays where needed; omit days only for something that happens every day. Include waking/home, work or school, and evening behavior. Activities should be specific and in-world, not generic.

Return ONLY this JSON, nothing else:
{"schedule": [{"time": "07:00", "locationId": "<id from list>", "activity": "<short specific activity>", "days": ["weekday"]}]}`;

    const response = await fetch(apiBase() + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(applyOpenRouterRouting({
            model: world.model || state.globalSettings.defaultModel,
            max_tokens: 900,
            messages: [
                { role: 'system', content: 'You are a world-simulation designer. You output only valid JSON.' },
                { role: 'user', content: prompt }
            ]
        }, world))
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error?.message || response.statusText);
    const raw = (await response.json()).choices?.[0]?.message?.content || '';
    const parsed = extractJSON(raw);
    const blocks = Array.isArray(parsed) ? parsed : parsed.schedule;
    if (!Array.isArray(blocks) || blocks.length === 0) throw new Error('Model returned no schedule blocks');

    // Validate: real times, real locations (fuzzy-heal bad ids), chronological order
    const cleaned = blocks
        .map(b => {
            const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(b.time || '') ? b.time : null;
            const loc = world.locations.find(l => l.id === b.locationId) || findFuzzyLocation(b.locationId || '', world.locations);
            if (!time || !loc) return null;
            const days = (Array.isArray(b.days) ? b.days : (b.day ? [b.day] : []))
                .map(day => String(day || '').trim()).filter(Boolean).slice(0, 7);
            return { time, locationId: loc.id, activity: (b.activity || '').slice(0, 120), ...(days.length ? { days } : {}) };
        })
        .filter(Boolean)
        .sort((a, b) => a.time.localeCompare(b.time));

    if (cleaned.length === 0) throw new Error('No valid blocks after validation');
    npc.schedule = cleaned;
    return true;
}

function renderWorldScheduler() {
    const world = state.editingWorld;
    const container = document.getElementById('scheduler-npc-list');
    if (!world || !container) return;

    container.innerHTML = '';
    const npcs = world.entities.filter(e => e.type === 'npc');

    if (npcs.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-3);">No NPCs found in this world. Add NPCs first to set their schedules.</div>';
        return;
    }

    npcs.forEach(npc => {
        const div = document.createElement('div');
        div.className = 'studio-card';
        div.style.padding = '20px';
        div.style.background = 'var(--surface2)';

        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h3 style="margin:0; color:var(--accent);">${escapeHTML(npc.name)}</h3>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-ghost gen-sched-btn" style="font-size:0.75rem; color:var(--accent);">✨ Auto-Generate</button>
                    <button class="btn btn-ghost add-block-btn" style="font-size:0.75rem;">+ Add Time Block</button>
                </div>
            </div>
            <div class="blocks-container" style="display:flex; flex-direction:column; gap:10px;">
                ${(npc.schedule || []).map((block, idx) => {
                    const selectedDays = (Array.isArray(block.days) ? block.days : (block.day ? [block.day] : []))
                        .map(day => String(day || '').trim().toLowerCase()).filter(Boolean);
                    const everyDay = !selectedDays.length || selectedDays.some(day => /^(daily|everyday)$/.test(day));
                    const dayChoices = [
                        ['weekday', 'Weekdays'], ['weekend', 'Weekend'], ['monday', 'Mon'], ['tuesday', 'Tue'],
                        ['wednesday', 'Wed'], ['thursday', 'Thu'], ['friday', 'Fri'], ['saturday', 'Sat'], ['sunday', 'Sun']
                    ];
                    return `
                    <div class="world-schedule-block">
                        <div style="flex:1">
                            <label style="font-size:10px; opacity:0.6; display:block; margin-bottom:4px;">Start Time</label>
                            <input type="time" class="form-input block-time" value="${escapeHTML(block.time)}" data-idx="${idx}">
                        </div>
                        <div class="world-schedule-days">
                            <label style="font-size:10px; opacity:0.6; display:block; margin-bottom:4px;">Days</label>
                            <div class="smart-chip-picker" role="group" aria-label="Schedule days">
                                <label><input type="checkbox" class="block-day" data-idx="${idx}" data-day="daily" ${everyDay ? 'checked' : ''}><span>Every day</span></label>
                                ${dayChoices.map(([value, label]) => `<label><input type="checkbox" class="block-day" data-idx="${idx}" data-day="${value}" ${!everyDay && selectedDays.includes(value) ? 'checked' : ''}><span>${label}</span></label>`).join('')}
                            </div>
                        </div>
                        <div style="flex:2">
                            <label style="font-size:10px; opacity:0.6; display:block; margin-bottom:4px;">Location</label>
                            <select class="form-select block-loc" data-idx="${idx}">
                                <option value="">Select Location...</option>
                                ${world.locations.map(l => `<option value="${escapeHTML(l.id)}" ${l.id === block.locationId ? 'selected' : ''}>${escapeHTML(l.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div style="flex:3">
                            <label style="font-size:10px; opacity:0.6; display:block; margin-bottom:4px;">Activity / Intent</label>
                            <input type="text" class="form-input block-act" placeholder="e.g. Sleeping, Patrolling..." value="${escapeHTML(block.activity || '')}" data-idx="${idx}">
                        </div>
                        <button class="tool-btn del-block-btn" data-idx="${idx}" style="align-self:flex-end; margin-bottom:5px;">✕</button>
                    </div>
                `; }).join('')}
            </div>
        `;

        div.querySelector('.add-block-btn').onclick = () => {
            if (!npc.schedule) npc.schedule = [];
            npc.schedule.push({ time: '08:00', locationId: '', activity: '' });
            renderWorldScheduler();
        };

        div.querySelector('.gen-sched-btn').onclick = async (e) => {
            const btn = e.target;
            if (npc.schedule && npc.schedule.length > 0 && !confirm(`${npc.name} already has a schedule. Replace it?`)) return;
            btn.disabled = true;
            btn.textContent = '⏳ Designing...';
            try {
                await generateNpcSchedule(npc, world);
                showToast(`Schedule generated for ${npc.name}`, 'success');
                renderWorldScheduler();
            } catch (err) {
                showToast(`Generation failed: ${err.message}`, 'error');
                btn.disabled = false;
                btn.textContent = '✨ Auto-Generate';
            }
        };

        div.querySelectorAll('.block-time').forEach(inp => {
            inp.onchange = (e) => { npc.schedule[e.target.dataset.idx].time = e.target.value; };
        });
        div.querySelectorAll('.block-loc').forEach(sel => {
            sel.onchange = (e) => { npc.schedule[e.target.dataset.idx].locationId = e.target.value; };
        });
        div.querySelectorAll('.block-day').forEach(input => {
            input.onchange = event => {
                const index = Number(event.target.dataset.idx);
                const group = [...div.querySelectorAll(`.block-day[data-idx="${index}"]`)];
                const daily = group.find(control => control.dataset.day === 'daily');
                if (event.target.dataset.day === 'daily' && event.target.checked) {
                    group.forEach(control => { if (control !== daily) control.checked = false; });
                    delete npc.schedule[index].days;
                    return;
                }
                if (event.target.dataset.day !== 'daily' && event.target.checked && daily) daily.checked = false;
                const days = group.filter(control => control.dataset.day !== 'daily' && control.checked)
                    .map(control => control.dataset.day);
                if (days.length) npc.schedule[index].days = days;
                else {
                    if (daily) daily.checked = true;
                    delete npc.schedule[index].days;
                }
            };
        });
        div.querySelectorAll('.block-act').forEach(inp => {
            inp.oninput = (e) => { npc.schedule[e.target.dataset.idx].activity = e.target.value; };
        });
        div.querySelectorAll('.del-block-btn').forEach(btn => {
            btn.onclick = () => {
                npc.schedule.splice(btn.dataset.idx, 1);
                renderWorldScheduler();
            };
        });

        container.appendChild(div);
    });
}

/**
 * 🔎 Deterministic world lint: structural problems findable without AI —
 * dead-end locations, unreachable rooms, hollow secrets, mute lorebook
 * entries, cardboard NPCs, colliding labels. Free and instant.
 */
function buildWorldLintReport(world) {
    const findings = [];
    const locs = world.locations || [];
    const push = (sev, area, msg) => findings.push({ sev, area, msg });

    // Duplicate location names (references resolve by name — collisions misroute)
    const nameCount = {};
    locs.forEach(l => { const n = (l.name || '').trim().toLowerCase(); if (n) nameCount[n] = (nameCount[n] || 0) + 1; });
    Object.entries(nameCount).filter(([, c]) => c > 1).forEach(([n, c]) =>
        push('warning', 'Locations', `Location name "${n}" is used ${c}× — exits and NPC references may resolve to the wrong one.`));

    const locByKey = {};
    locs.forEach(l => { if (l.id) locByKey[l.id.toLowerCase()] = l; if (l.name) locByKey[l.name.trim().toLowerCase()] = l; });

    // Per-location checks + exit graph
    const adj = {};
    locs.forEach(l => {
        adj[l.id] = [];
        const exits = Array.isArray(l.exits) ? l.exits : [];
        // A room attached to a parent is never a dead end: containment is a real
        // route back out, so only genuinely unattached places are trapped.
        const attachedTo = String(l.parentLocationId || l.region || '').trim().toLowerCase();
        const hasContainer = !!attachedTo && !!locByKey[attachedTo] && locByKey[attachedTo].id !== l.id;
        if (exits.length === 0 && !hasContainer) push('warning', 'Locations', `"${l.name || l.id}" has no exits — a dead end the player can never leave (or unreachable scenery).`);
        if (!l.description || !l.description.trim()) push('warning', 'Locations', `"${l.name || l.id}" has an empty visible description.`);
        exits.forEach(ex => {
            const target = (getExitTargetName(ex) || '').trim().toLowerCase();
            const t = locByKey[target];
            if (t) adj[l.id].push(t.id);
        });
        // An exit the author drew as two-way but which only exists on one side.
        // The Studio creates the reciprocal exit when you edit it by hand, but a
        // room from the AI Builder, an import, or location_introduced never gets
        // one — and the connection silently works in one direction only.
        exits.forEach(ex => {
            if (ex && typeof ex === 'object' && ex.isOneWay) return;   // deliberate
            const target = (getExitTargetName(ex) || '').trim().toLowerCase();
            const t = locByKey[target];
            if (!t || t.id === l.id) return;
            const backReferences = (Array.isArray(t.exits) ? t.exits : []).some(back => {
                const backTarget = (getExitTargetName(back) || '').trim().toLowerCase();
                return backTarget === (l.id || '').toLowerCase()
                    || backTarget === (l.name || '').trim().toLowerCase();
            });
            const contains = String(l.parentLocationId || l.region || '').trim().toLowerCase();
            const isChildOfTarget = contains === (t.id || '').toLowerCase()
                || contains === (t.name || '').trim().toLowerCase();
            if (!backReferences && !isChildOfTarget) {
                push('warning', 'Locations',
                    `"${l.name || l.id}" leads to "${t.name || t.id}", but "${t.name || t.id}" has no way back — the connection works in one direction only. Add the return exit, or tick 1-Way if that is intended.`);
            }
        });

        (l.secrets || []).forEach(s => {
            if (!s.label) push('warning', 'Secrets', `A secret in "${l.name}" has no label — it can never be revealed.`);
            if (s.label && !s.hint) push('warning', 'Secrets', `Secret "${s.label}" (${l.name}) has no hint — the DM has nothing to foreshadow with.`);
            if (s.label && !s.truth) push('critical', 'Secrets', `Secret "${s.label}" (${l.name}) has no truth — investigating reveals nothing.`);
        });
    });

    // Reachability sweep from the start location. Containment counts as a route
    // in both directions here for the same reason it does in pathfinding — a
    // room inside a building is reachable from it — otherwise the audit reports
    // every authored sub-room as unreachable when the engine can walk there fine.
    locs.forEach(l => {
        const parentRef = String(l.parentLocationId || l.region || '').trim().toLowerCase();
        if (!parentRef) return;
        const parent = locByKey[parentRef];
        if (!parent || parent.id === l.id) return;
        adj[l.id] = adj[l.id] || [];
        adj[parent.id] = adj[parent.id] || [];
        if (!adj[l.id].includes(parent.id)) adj[l.id].push(parent.id);
        if (!adj[parent.id].includes(l.id)) adj[parent.id].push(l.id);
    });

    const startId = world.startLocationId || locs[0]?.id;
    (world.startingLives || []).forEach(life => {
        if (!life.name) push('warning', 'Starting Lives', 'A starting life has no player-facing name.');
        if (!locs.some(location => location.id === life.startLocationId)) {
            push('critical', 'Starting Lives', `"${life.name || life.id}" has no valid starting location.`);
        }
        if (life.factionId && !(world.factions || []).some(faction => faction.id === life.factionId)) {
            push('warning', 'Starting Lives', `"${life.name || life.id}" points to a missing faction.`);
        }
        Object.keys(life.statOverrides || {}).forEach(statId => {
            if (!(world.hudConfig?.stats || []).some(stat => stat.id === statId)) {
                push('warning', 'Starting Lives', `"${life.name || life.id}" overrides unknown stat "${statId}".`);
            }
        });
    });
    if (startId && locs.length > 1) {
        const seen = new Set([startId]);
        const q = [startId];
        while (q.length) {
            const cur = q.shift();
            (adj[cur] || []).forEach(n => { if (!seen.has(n)) { seen.add(n); q.push(n); } });
        }
        locs.filter(l => !seen.has(l.id)).forEach(l =>
            push('warning', 'Map', `"${l.name || l.id}" is unreachable — no chain of exits leads there from the start location.`));
    }

    // NPCs
    (world.entities || []).forEach(e => {
        if (e.type !== 'npc') return;
        if (!e.description && !e.persona) push('suggestion', 'NPCs', `"${e.name}" has no description or persona — they will play as a cardboard extra.`);
        if (e.isMajor && !e.persona) push('warning', 'NPCs', `"${e.name}" is marked MAJOR but has no persona — the flag does nothing without one.`);
        (e.secrets || []).forEach(s => {
            if (s.label && !s.hint) push('warning', 'Secrets', `Secret "${s.label}" (${e.name}) has no hint.`);
            if (s.label && !s.truth) push('critical', 'Secrets', `Secret "${s.label}" (${e.name}) has no truth.`);
        });
    });

    // Lorebook
    (world.lorebook || []).forEach((l, i) => {
        if (!l.keyword || !l.keyword.trim()) push('critical', 'Lorebook', `Lore entry #${i + 1} has no keyword — it can never trigger.`);
        else if (!l.text || !l.text.trim()) push('warning', 'Lorebook', `Lore entry "${l.keyword}" has no text.`);
    });

    // Colliding secret labels across the whole world
    const labels = {};
    [...locs, ...(world.entities || [])].forEach(o => (o.secrets || []).forEach(s => { if (s.label) labels[s.label] = (labels[s.label] || 0) + 1; }));
    Object.entries(labels).filter(([, c]) => c > 1).forEach(([lab, c]) =>
        push('warning', 'Secrets', `Secret label "${lab}" is used ${c}× — reveals will collide.`));

    return findings;
}

// --- World Calibration -----------------------------------------------------
// A hand-authored world leaves most of the engine asleep: no stats, no NPC
// homes, no schedules, no relationships, no markets, no travel times, rooms that
// cannot be re-entered and places nothing links to. Calibration wakes it up.
//
// Tier 0 is everything the engine can repair on its own, with no API call and
// no judgement: facts that are simply missing or self-contradictory. Findings
// are proposed as data and applied only on request, so nothing changes under
// the author without their say-so.

function estimateWorldPromptTokens(world, preset) {
    const parts = [world.dmPrompt, world.authorNote, world.intro, world.description];
    (world.locations || []).forEach(location => {
        parts.push(location.description, location.hiddenDetails);
        (location.secrets || []).forEach(secret => parts.push(secret.label, secret.hint, secret.truth));
    });
    (world.entities || []).forEach(entity => parts.push(entity.description, entity.persona));
    (world.lorebook || []).forEach(entry => parts.push(entry.keyword, entry.text));
    // Authored society reaches the prompt too, so it has to be counted or the
    // recommended context size comes out short on a world with a lot of it.
    (world.locations || []).forEach(location => {
        (location.shop || []).forEach(stock => parts.push(stock.item));
        (location.conditions || []).forEach(condition => parts.push(String(condition?.label ?? condition ?? '')));
    });
    (world.factions || []).forEach(faction => parts.push(faction.name, faction.description, faction.goal));
    (world.relationships || []).forEach(relation => parts.push(relation.label, relation.reason));
    (preset?.data?.prompts || []).forEach(prompt => {
        if (prompt && prompt.enabled !== false) parts.push(prompt.content);
    });
    const characters = parts.filter(Boolean).join(' ').length;
    return Math.ceil(characters / 3.2);
}

function worldDirectoryHealth(world) {
    const locations = Array.isArray(world?.locations) ? world.locations : [];
    const regions = Array.isArray(world?.regions) ? world.regions : [];
    const people = (world?.entities || []).filter(entity => entity?.type === 'npc');
    const items = (world?.entities || []).filter(entity => entity?.type === 'item');
    const groups = Array.isArray(world?.groups) ? world.groups : [];
    const issues = [];
    const count = (list, test) => list.filter(test).length;
    const thinRegions = count(regions, region => !String(region.description || '').trim() || !(region.tags || []).length);
    const thinLocations = count(locations, location => !String(location.description || '').trim() || !(location.tags || []).length);
    const unstructuredLocations = count(locations, location => !location.regionId || !location.mapType);
    const thinPeople = count(people, person => !String(person.description || '').trim() || !String(person.persona || '').trim());
    const unplacedPeople = count(people, person => !person.startLocation || !person.homeLocation);
    const unsimulatedPeople = count(people, person => !(person.schedule || []).length || !String(person.goal || '').trim());
    const ungroupedPeople = count(people, person => !(person.groupIds || []).length && !person.householdId);
    const thinItems = count(items, item => !String(item.description || '').trim() || !item.startLocation);
    const thinGroups = count(groups, group => !String(group.description || '').trim() || !(group.tags || []).length);
    const emptyRegions = count(regions, region => !locations.some(location => location.regionId === region.id));
    const buildingLikeRegions = count(regions, region =>
        /\b(?:house|shop|store|inn|tavern|keep|castle|tower|office|school|hospital|station|temple|church|building)\b/i.test(region.name || '')
        && locations.filter(location => location.regionId === region.id).some(location => ['room', 'area'].includes(location.mapType)));
    const invalidContainment = count(locations, location => {
        if (!location.parentLocationId) return false;
        const parent = getLocationRef(world, location.parentLocationId);
        return !parent || parent.id === location.id || (parent.regionId && location.regionId && parent.regionId !== location.regionId);
    });
    const incompleteTravel = locations.reduce((total, location) => total + (location.exits || []).filter(exit => {
        const target = getLocationRef(world, exit?.targetLocationId || getExitTargetName(exit));
        return !target || !String(exit?.mode || '').trim() || !(Number(exit?.travelTime) > 0);
    }).length, 0);
    const isolatedRegions = regions.length > 1 ? count(regions, region => {
        const hasLocations = locations.some(location => location.regionId === region.id);
        return hasLocations && worldRegionTravelLinks(world, region.id).length === 0;
    }) : 0;
    if (thinRegions) issues.push({ area: 'Regions', count: thinRegions, detail: 'missing a regional description or search tags', pass: 'Structure' });
    if (thinLocations) issues.push({ area: 'Locations', count: thinLocations, detail: 'missing a player-facing description or search tags', pass: 'Structure' });
    if (unstructuredLocations) issues.push({ area: 'Map', count: unstructuredLocations, detail: 'still rely on inferred region or map roles', pass: 'Structure' });
    if (thinPeople) issues.push({ area: 'People', count: thinPeople, detail: 'missing a public impression or persona', pass: 'People' });
    if (unplacedPeople) issues.push({ area: 'People', count: unplacedPeople, detail: 'missing a starting place or home', pass: 'People' });
    if (unsimulatedPeople) issues.push({ area: 'Living world', count: unsimulatedPeople, detail: 'missing a schedule or off-screen agenda', pass: 'People' });
    if (ungroupedPeople) issues.push({ area: 'Households', count: ungroupedPeople, detail: 'not linked to a household, family or organization', pass: 'People' });
    if (thinItems) issues.push({ area: 'Items', count: thinItems, detail: 'missing a description or starting location', pass: 'Items' });
    if (thinGroups) issues.push({ area: 'Groups', count: thinGroups, detail: 'missing a description or classification tags', pass: 'People' });
    if (emptyRegions) issues.push({ area: 'Regions', count: emptyRegions, detail: 'contain no playable locations', pass: 'Structure' });
    if (buildingLikeRegions) issues.push({ area: 'Hierarchy', count: buildingLikeRegions, detail: 'look like buildings modeled as regions; keep the geographic region and make rooms child locations instead', pass: 'Structure' });
    if (invalidContainment) issues.push({ area: 'Hierarchy', count: invalidContainment, detail: 'have a missing, self-referential or cross-region parent location', pass: 'Structure' });
    if (isolatedRegions) issues.push({ area: 'Travel', count: isolatedRegions, detail: 'cannot be reached from another region through a canonical location link', pass: 'Structure' });
    if (incompleteTravel) issues.push({ area: 'Travel', count: incompleteTravel, detail: 'connections lack a valid target, mode or positive travel time', pass: 'Structure' });
    const possible = Math.max(1, locations.length * 3 + regions.length * 3 + people.length * 4 + items.length * 2 + groups.length * 2);
    const missing = thinRegions + thinLocations + unstructuredLocations + thinPeople + unplacedPeople + unsimulatedPeople + ungroupedPeople + thinItems + thinGroups + emptyRegions + buildingLikeRegions + invalidContainment + isolatedRegions + incompleteTravel;
    return { score: Math.max(0, Math.round((1 - missing / possible) * 100)), issues, counts: { regions: regions.length, locations: locations.length, people: people.length, items: items.length, groups: groups.length } };
}

function calibrateStructuralFindings(world, preset) {
    const findings = [];
    const locations = Array.isArray(world.locations) ? world.locations : [];
    const add = finding => findings.push({ tier: 'structure', ...finding });
    const byKey = new Map();
    locations.forEach(location => {
        if (location.id) byKey.set(String(location.id).toLowerCase(), location);
        if (location.name) byKey.set(String(location.name).trim().toLowerCase(), location);
    });

    // 1. A start location, so play does not begin wherever the list happens to start.
    if (!world.startLocationId || !locations.some(l => l.id === world.startLocationId)) {
        const first = locations[0];
        if (first) {
            add({
                id: 'start_location', type: 'set_start_location', severity: 'warning',
                title: 'No starting location is set',
                detail: `Play would begin at "${first.name || first.id}" only because it is first in the list. Setting it explicitly makes that a decision rather than an accident.`,
                patch: { startLocationId: first.id }
            });
        }
    }

    // 2. Context large enough for the preset plus the world's own text.
    const needed = estimateWorldPromptTokens(world, preset) + (parseInt(world.maxTokens) || 2048) + 2048;
    const recommended = Math.max(8192, Math.ceil(needed / 1024) * 1024);
    const current = parseInt(world.contextSize) || 0;
    if (current < recommended) {
        add({
            id: 'context_size', type: 'raise_context_size', severity: current ? 'warning' : 'critical',
            title: current ? `Context size ${current} is too small` : 'No context size set',
            detail: `This world's text plus its preset needs about ${recommended} tokens. Below that the engine drops history mid-scene and the DM forgets what just happened.`,
            patch: { contextSize: recommended }
        });
    }

    // 3. Exits that only exist on one side. The Studio writes the return exit
    //    when you edit one by hand, but nothing else does — so imported, built
    //    or AI-introduced rooms become one-way traps.
    locations.forEach(location => {
        (Array.isArray(location.exits) ? location.exits : []).forEach(exit => {
            if (exit && typeof exit === 'object' && exit.isOneWay) return;
            const targetName = getExitTargetName(exit);
            const target = byKey.get(String(targetName || '').trim().toLowerCase());
            if (!target || target.id === location.id) return;
            const hasReturn = (Array.isArray(target.exits) ? target.exits : []).some(back => {
                const backTarget = String(getExitTargetName(back) || '').trim().toLowerCase();
                return backTarget === String(location.id || '').toLowerCase()
                    || backTarget === String(location.name || '').trim().toLowerCase();
            });
            const containedByTarget = [location.parentLocationId, location.region]
                .some(ref => String(ref || '').trim().toLowerCase() === String(target.id || '').toLowerCase()
                    || String(ref || '').trim().toLowerCase() === String(target.name || '').trim().toLowerCase());
            if (hasReturn || containedByTarget) return;
            const direction = getExitDirection(exit);
            const back = direction ? `${getOppositeDirection(direction)} to ${location.name}` : `to ${location.name}`;
            add({
                id: `reciprocal_${target.id}_${location.id}`, type: 'add_reciprocal_exit', severity: 'critical',
                title: `"${target.name || target.id}" has no way back to "${location.name || location.id}"`,
                detail: `You can walk in and never walk out. Adds the return exit "${back}".`,
                patch: { locationId: target.id, exitText: back,
                         travelTime: (exit && typeof exit === 'object' && exit.travelTime) || 0 }
            });
        });
    });

    // 4. Places nothing leads to. Connecting them needs judgement, so this is
    //    reported for the structure pass to resolve rather than guessed at.
    const startId = world.startLocationId || locations[0]?.id;
    if (startId && locations.length > 1) {
        const adjacency = new Map(locations.map(l => [l.id, []]));
        locations.forEach(location => {
            (location.exits || []).forEach(exit => {
                const target = byKey.get(String(getExitTargetName(exit) || '').trim().toLowerCase());
                if (target) adjacency.get(location.id)?.push(target.id);
            });
            const parentRef = String(location.parentLocationId || location.region || '').trim().toLowerCase();
            const parent = parentRef ? byKey.get(parentRef) : null;
            if (parent && parent.id !== location.id) {
                adjacency.get(location.id)?.push(parent.id);
                adjacency.get(parent.id)?.push(location.id);
            }
        });
        const seen = new Set([startId]);
        const queue = [startId];
        while (queue.length) {
            (adjacency.get(queue.shift()) || []).forEach(next => {
                if (!seen.has(next)) { seen.add(next); queue.push(next); }
            });
        }
        locations.filter(location => !seen.has(location.id)).forEach(location => {
            add({
                id: `orphan_${location.id}`, type: 'report_orphan', severity: 'critical',
                title: `"${location.name || location.id}" cannot be reached`,
                detail: 'No chain of exits or containment leads here from the start. The structure pass will propose how it connects.',
                patch: { locationId: location.id }
            });
        });
    }

    // 5. Names that collide, because references resolve by name.
    const nameCounts = {};
    locations.forEach(location => {
        const key = String(location.name || '').trim().toLowerCase();
        if (key) nameCounts[key] = (nameCounts[key] || 0) + 1;
    });
    Object.entries(nameCounts).filter(([, count]) => count > 1).forEach(([name, count]) => {
        add({
            id: `dupname_${name}`, type: 'report_duplicate_name', severity: 'warning',
            title: `${count} locations are called "${name}"`,
            detail: 'Exits and NPC placements resolve by name, so these will send people to the wrong one. Rename all but one.',
            patch: { name }
        });
    });

    // 6. Authored society that will not do what the author thinks it does.
    // None of these are repairable automatically — each is a judgement the
    // author has to make — so they report rather than carry a patch.
    const factions = Array.isArray(world.factions) ? world.factions : [];
    const npcs = (world.entities || []).filter(entity => entity?.type === 'npc');

    factions.forEach(faction => {
        const members = npcs.filter(entity => entity.factionId === faction.id).length;
        const holdings = (faction.territory || []).length;
        if (!members && !holdings) {
            add({
                id: `faction_inert_${faction.id}`, type: 'report_faction_inert', severity: 'suggestion',
                title: `"${faction.name}" has no members and holds no ground`,
                detail: 'It can still be named in narration, but nothing anchors it to the world: no one acts for it and it loses nothing when a rival takes a place. Give it territory, or someone who serves it.'
            });
        }
    });

    if (factions.length > 1) {
        const stated = factions.filter(faction => (faction.relations || []).length).length;
        if (!stated) {
            add({
                id: 'factions_no_relations', type: 'report_faction_relations', severity: 'suggestion',
                title: `${factions.length} factions, none of whom have a stated view of each other`,
                detail: 'They will all start neutral and only drift apart by chance. Setting standing on the Factions tab is what makes them allies or enemies from turn one.'
            });
        }
    }

    // A shop with nothing priced is a shop the player cannot buy from.
    locations.forEach(location => {
        const freeItems = (location.shop || []).filter(stock => !Number(stock.price));
        if (freeItems.length) {
            add({
                id: `shop_free_${location.id}`, type: 'report_shop_price', severity: 'suggestion',
                title: `${location.name}: ${freeItems.length} item${freeItems.length === 1 ? ' is' : 's are'} priced at zero`,
                detail: `${freeItems.map(stock => stock.item).slice(0, 3).join(', ')} — the player can take these for nothing. Set a price, or that is what will happen.`
            });
        }
        const outOfStock = (location.shop || []).filter(stock =>
            !Number(stock.quantity) && !Number(stock.regenPerTurn));
        if (outOfStock.length) {
            add({
                id: `shop_empty_${location.id}`, type: 'report_shop_stock', severity: 'suggestion',
                title: `${location.name}: ${outOfStock.length} item${outOfStock.length === 1 ? '' : 's'} can never be bought`,
                detail: `${outOfStock.map(stock => stock.item).slice(0, 3).join(', ')} — no stock and no restock, so every purchase fails.`
            });
        }
    });

    // A vendor nobody can reach, and a shop nobody tends.
    const shopLocations = locations.filter(location => (location.shop || []).length);
    shopLocations.forEach(location => {
        if (!npcs.some(entity => entity.vendorFor === location.id)) {
            add({
                id: `shop_unattended_${location.id}`, type: 'report_shop_vendor', severity: 'suggestion',
                title: `${location.name} sells things but nobody trades there`,
                detail: 'Buying still works, but the DM has no one to sell it to the player. Set an NPC as the vendor on their card.'
            });
        }
    });

    // Older worlds load safely, but safe defaults are not the same thing as a
    // fully authored directory. Report those semantic gaps in useful batches
    // instead of creating hundreds of noisy one-record warnings.
    const directoryHealth = worldDirectoryHealth(world);
    const directoryNouns = { Regions: 'region', Locations: 'location', Map: 'location', Travel: 'connection', People: 'person', 'Living world': 'person', Households: 'person', Items: 'item', Groups: 'group' };
    directoryHealth.issues.forEach((issue, index) => add({
        id: `directory_gap_${index}_${issue.area.toLowerCase().replace(/\W+/g, '_')}`,
        type: 'report_directory_gap',
        severity: issue.count > 20 ? 'warning' : 'suggestion',
        title: `${issue.count} ${directoryNouns[issue.area] || 'directory record'}${issue.count === 1 ? '' : 's'} need enrichment`,
        detail: `${issue.detail}. Run the ${issue.pass} pass to propose missing details, then review them before applying.`
    }));

    return findings;
}

// Applying a finding is separated from producing it so the whole set can be
// reviewed, tested, and applied selectively.
function applyCalibrationFinding(world, finding) {
    if (!world || !finding) return false;
    const locations = Array.isArray(world.locations) ? world.locations : [];
    switch (finding.type) {
        case 'set_start_location':
            world.startLocationId = finding.patch.startLocationId;
            return true;
        case 'raise_context_size':
            world.contextSize = finding.patch.contextSize;
            return true;
        case 'add_reciprocal_exit': {
            const target = locations.find(l => l.id === finding.patch.locationId);
            if (!target) return false;
            target.exits = Array.isArray(target.exits) ? target.exits : [];
            const already = target.exits.some(exit =>
                String(getExitTargetName(exit) || '').trim().toLowerCase()
                === String(getExitTargetName(finding.patch.exitText) || '').trim().toLowerCase());
            if (already) return false;
            target.exits.push({ text: finding.patch.exitText, travelTime: finding.patch.travelTime || 0, isOneWay: false });
            return true;
        }
        case 'set_map_type': {
            const location = locations.find(l => l.id === finding.patch.locationId);
            if (!location || location.mapType) return false;   // never overwrite an authored role
            location.mapType = finding.patch.mapType;
            return true;
        }
        case 'set_containment': {
            const location = locations.find(l => l.id === finding.patch.locationId);
            if (!location || location.parentLocationId) return false;
            if (location.id === finding.patch.parentLocationId) return false;
            // Refuse to build a containment loop: a place cannot end up inside
            // something that is already inside it.
            const seen = new Set([location.id]);
            let cursor = locations.find(l => l.id === finding.patch.parentLocationId);
            while (cursor) {
                if (seen.has(cursor.id)) return false;
                seen.add(cursor.id);
                const ref = String(cursor.parentLocationId || cursor.region || '').trim().toLowerCase();
                cursor = ref
                    ? locations.find(l => String(l.id).toLowerCase() === ref
                        || String(l.name || '').trim().toLowerCase() === ref)
                    : null;
            }
            location.parentLocationId = finding.patch.parentLocationId;
            return true;
        }
        case 'set_floor': {
            const location = locations.find(l => l.id === finding.patch.locationId);
            if (!location || location.mapFloor) return false;
            location.mapFloor = finding.patch.mapFloor;
            return true;
        }
        case 'connect_location': {
            const location = locations.find(l => l.id === finding.patch.locationId);
            const target = locations.find(l => l.id === finding.patch.targetId);
            if (!location || !target) return false;
            location.exits = Array.isArray(location.exits) ? location.exits : [];
            target.exits = Array.isArray(target.exits) ? target.exits : [];
            const links = (from, toName) => from.exits.some(exit =>
                String(getExitTargetName(exit) || '').trim().toLowerCase() === String(toName).trim().toLowerCase());
            let changed = false;
            if (!links(location, target.name)) {
                location.exits.push({ text: `to ${target.name}`, travelTime: 0, isOneWay: false });
                changed = true;
            }
            // Connect both ways, or we would simply create a new one-way trap.
            if (!links(target, location.name)) {
                target.exits.push({ text: `to ${location.name}`, travelTime: 0, isOneWay: false });
                changed = true;
            }
            return changed;
        }
        case 'set_travel_time': {
            const location = locations.find(l => l.id === finding.patch.locationId);
            const exits = location && Array.isArray(location.exits) ? location.exits : null;
            const exit = exits ? exits[finding.patch.exitIndex] : null;
            if (!exit) return false;
            if (typeof exit === 'object' && exit.travelTime) return false;   // already stated
            exits[finding.patch.exitIndex] = typeof exit === 'string'
                ? { text: exit, travelTime: finding.patch.minutes, isOneWay: false }
                : { ...exit, travelTime: finding.patch.minutes };
            return true;
        }
        case 'set_entity_location':
        case 'set_entity_home': {
            const entity = (world.entities || []).find(e => e.id === finding.patch.entityId);
            if (!entity) return false;
            const field = finding.type === 'set_entity_home' ? 'homeLocation' : 'startLocation';
            if (entity[field]) return false;              // the author already placed them
            entity[field] = finding.patch.locationId;
            return true;
        }
        case 'set_persona': {
            const entity = (world.entities || []).find(e => e.id === finding.patch.entityId);
            if (!entity || String(entity.persona || '').trim()) return false;
            entity.persona = finding.patch.persona;
            return true;
        }
        case 'set_entity_gender': {
            const entity = (world.entities || []).find(e => e.id === finding.patch.entityId);
            const gender = String(finding.patch.gender || '').trim().slice(0, 100);
            if (!entity || entity.gender || !gender) return false;
            entity.gender = gender;
            entity.visuals = isPlainObject(entity.visuals) ? entity.visuals : {};
            const identity = normalizeWorldVisualIdentityGuide(entity.visuals.portraitIdentityGuide);
            if (!identity.gender) identity.gender = gender;
            entity.visuals.portraitIdentityGuide = identity;
            return true;
        }
        case 'set_entity_tags': {
            const entity = (world.entities || []).find(e => e.id === finding.patch.entityId);
            if (!entity || (entity.tags || []).length) return false;
            entity.tags = [...new Set((finding.patch.tags || []).map(tag => String(tag).trim()).filter(Boolean))].slice(0, 30);
            return entity.tags.length > 0;
        }
        case 'set_entity_depth': {
            const entity = (world.entities || []).find(e => e.id === finding.patch.entityId);
            if (!entity || !WORLD_DIRECTORY_DEPTHS.includes(finding.patch.simulationDepth)) return false;
            const legacyDefault = !entity.simulationDepth
                || (entity.simulationDepth === 'background' && !entity.isMajor);
            if (!legacyDefault) return false;
            entity.simulationDepth = finding.patch.simulationDepth;
            entity.isMajor = entity.simulationDepth === 'core';
            return true;
        }
        case 'set_entity_group': {
            const entity = (world.entities || []).find(e => e.id === finding.patch.entityId);
            if (!entity || !finding.patch.name) return false;
            if (!Array.isArray(world.groups)) world.groups = [];
            const name = String(finding.patch.name).trim().slice(0, 120);
            let group = world.groups.find(item => String(item.name || '').trim().toLowerCase() === name.toLowerCase());
            if (!group) {
                const base = `grp_${worldDirectorySlug(name, 'group')}`;
                let id = base;
                let suffix = 2;
                while (world.groups.some(item => item.id === id)) id = `${base}_${suffix++}`;
                group = {
                    id, name,
                    type: ['household', 'family', 'organization', 'crew', 'other'].includes(finding.patch.groupType)
                        ? finding.patch.groupType : 'other',
                    description: String(finding.patch.description || '').trim().slice(0, 1200),
                    homeLocationId: getLocationRef(world, finding.patch.homeLocationId)?.id || '',
                    tags: [...new Set((finding.patch.tags || []).map(String).map(tag => tag.trim()).filter(Boolean))].slice(0, 30)
                };
                world.groups.push(group);
            }
            entity.groupIds = Array.isArray(entity.groupIds) ? entity.groupIds : [];
            if (entity.groupIds.includes(group.id)) return false;
            entity.groupIds.push(group.id);
            if (group.type === 'household' && !entity.householdId) entity.householdId = group.id;
            return true;
        }
        case 'set_location_tags': {
            const location = locations.find(l => l.id === finding.patch.locationId);
            if (!location || (location.tags || []).length) return false;
            location.tags = [...new Set((finding.patch.tags || []).map(String).map(tag => tag.trim()).filter(Boolean))].slice(0, 30);
            return location.tags.length > 0;
        }
        case 'set_location_aliases': {
            const location = locations.find(l => l.id === finding.patch.locationId);
            if (!location || (location.aliases || []).length) return false;
            location.aliases = [...new Set((finding.patch.aliases || []).map(String).map(alias => alias.trim()).filter(Boolean))].slice(0, 12);
            return location.aliases.length > 0;
        }
        case 'set_location_description': {
            const location = locations.find(l => l.id === finding.patch.locationId);
            if (!location || String(location.description || '').trim()) return false;
            location.description = String(finding.patch.description || '').trim().slice(0, 4000);
            return Boolean(location.description);
        }
        case 'set_location_region': {
            const location = locations.find(l => l.id === finding.patch.locationId);
            if (!location || location.regionId || !finding.patch.name) return false;
            if (!Array.isArray(world.regions)) world.regions = [];
            const name = String(finding.patch.name).trim().slice(0, 120);
            let region = world.regions.find(item => item.id === finding.patch.regionId
                || String(item.name || '').trim().toLowerCase() === name.toLowerCase());
            if (!region) {
                const base = `reg_${worldDirectorySlug(name, 'region')}`;
                let id = base;
                let suffix = 2;
                while (world.regions.some(item => item.id === id)) id = `${base}_${suffix++}`;
                region = { id, name, description: '', tags: [] };
                world.regions.push(region);
            }
            location.regionId = region.id;
            location.region = region.name;
            return true;
        }
        case 'set_item_description': {
            const item = (world.entities || []).find(e => e.id === finding.patch.entityId && e.type === 'item');
            if (!item || String(item.description || '').trim()) return false;
            item.description = String(finding.patch.description || '').trim().slice(0, 4000);
            return Boolean(item.description);
        }
        case 'set_schedule': {
            const entity = (world.entities || []).find(e => e.id === finding.patch.entityId);
            if (!entity || (entity.schedule || []).length) return false;
            entity.schedule = safeJsonClone(finding.patch.schedule);
            return true;
        }
        case 'set_agenda': {
            const entity = (world.entities || []).find(e => e.id === finding.patch.entityId);
            if (!entity || String(entity.goal || '').trim()) return false;
            entity.goal = finding.patch.goal;
            if (finding.patch.beats?.length) entity.goalSteps = [...finding.patch.beats];
            if (finding.patch.pool?.length) entity.goalPool = [...finding.patch.pool];
            if (finding.patch.autonomy) entity.goalAutonomy = finding.patch.autonomy;
            if (finding.patch.difficulty != null) entity.goalDifficulty = finding.patch.difficulty;
            return true;
        }
        case 'set_beats': {
            const entity = (world.entities || []).find(e => e.id === finding.patch.entityId);
            if (!entity || (entity.goalSteps || []).length) return false;
            entity.goalSteps = [...finding.patch.beats];
            if (finding.patch.pool?.length && !(entity.goalPool || []).length) {
                entity.goalPool = [...finding.patch.pool];
            }
            return true;
        }
        case 'set_relationship': {
            const entities = world.entities || [];
            const { a, b, label, score, reason } = finding.patch;
            if (!entities.some(e => e.id === a) || !entities.some(e => e.id === b)) return false;
            if (!Array.isArray(world.relationships)) world.relationships = [];
            const key = relationshipKey(a, b);
            // The author's standing for a pair is never overwritten.
            if (world.relationships.some(rel => relationshipKey(rel.a, rel.b) === key)) return false;
            world.relationships.push({ a, b, label, score, reason });
            return true;
        }
        case 'add_directional_relationship_claim': {
            const { sourceCharacterId, targetCharacterId, axis } = finding.patch;
            if (!(world.entities || []).some(entity => entity.id === sourceCharacterId)
                || !(world.entities || []).some(entity => entity.id === targetCharacterId)
                || sourceCharacterId === targetCharacterId) return false;
            if (!Array.isArray(world.relationshipClaims)) world.relationshipClaims = [];
            if (world.relationshipClaims.some(claim => claim.sourceCharacterId === sourceCharacterId
                && claim.targetCharacterId === targetCharacterId && claim.axis === axis)) return false;
            world.relationshipClaims.push({
                id: `relclaim_${Date.now().toString(36)}_${world.relationshipClaims.length + 1}`,
                sourceCharacterId, targetCharacterId, axis,
                value: safeJsonClone(finding.patch.value), confidence: finding.patch.confidence,
                reason: finding.patch.reason, origin: 'world_health_check',
                provenance: { pass: 'relationships', appliedAt: new Date().toISOString() }, status: 'active'
            });
            return true;
        }
        case 'set_location_state': {
            const location = locations.find(l => l.id === finding.patch.locationId);
            if (!location) return false;
            if (location.danger != null && location.danger !== '') return false;
            location.danger = finding.patch.danger;
            location.prosperity = finding.patch.prosperity;
            if (finding.patch.conditions?.length) location.conditions = [...finding.patch.conditions];
            return true;
        }
        case 'add_faction': {
            if (!Array.isArray(world.factions)) world.factions = [];
            const { id, name } = finding.patch;
            if (world.factions.some(faction => faction.id === id
                || String(faction.name || '').trim().toLowerCase() === name.trim().toLowerCase())) {
                return false;
            }
            world.factions.push(normalizeWorldFaction(finding.patch, world.factions.length));
            return true;
        }
        case 'set_faction_membership': {
            const entity = (world.entities || []).find(e => e.id === finding.patch.entityId);
            if (!entity || entity.factionId) return false;
            // The faction may have been proposed alongside this and declined.
            if (!(world.factions || []).some(faction => faction.id === finding.patch.factionId)) return false;
            entity.factionId = finding.patch.factionId;
            return true;
        }
        default:
            return false;   // informational findings carry no automatic repair
    }
}

// --- The model used for structured work -------------------------------------
// Narration and JSON want opposite models. A reasoning model writes excellent
// prose and then talks itself past the token limit before emitting an object,
// which is why the chronicle classifier, the world turn and calibration each
// failed the same way. Every structured pass therefore routes through one
// deliberately chosen model instead of whatever is telling the story.
//
// This list used to be hand-written from memory, which meant it went stale the
// moment a provider retired a slug — "No endpoints found for
// anthropic/claude-3-5-haiku" was a model id that had simply never existed in
// that form. Nothing here is guessed any more: the candidates are derived from
// the live OpenRouter catalog, the same one AI Config already fetches, using
// the capability flags the catalog itself reports.

// A model has to be able to return an object on demand. Without one of these
// it is being asked to hit a JSON contract by luck.
const STRUCTURED_PARAM_FLAGS = Object.freeze(['response_format', 'structured_outputs']);

// Reasoning models are the specific failure this picker exists to avoid: they
// spend the whole budget thinking and emit nothing usable. The catalog reports
// the parameters that mark one.
const REASONING_PARAM_FLAGS = Object.freeze(['reasoning', 'include_reasoning', 'thinking']);

// A batch's answer has to fit in one reply. Below this, a model cannot finish
// even a small batch, which is what "the reply was cut off" actually meant.
const STRUCTURED_MIN_OUTPUT_TOKENS = 8000;

/**
 * How well a model is likely to hold a long structured answer together.
 *
 * Ranking purely on price put the smallest, cheapest models first, and those
 * are the ones that lose the shape of a big JSON object halfway through. Size
 * is not reported by the catalog, so this reads the proxies that are: how much
 * it can write, how much it can read, and what it costs — a model priced at
 * nothing is nearly always a tiny one.
 */
function structuredCapabilityBand(model) {
    let band = 0;
    if (model.maxOutput >= 16000) band += 2;
    else if (model.maxOutput >= 8000) band += 1;
    if (model.context >= 128000) band += 1;
    // Free and near-free models are the small ones. Still offered — just not
    // recommended ahead of something that will finish the work.
    if (model.price >= 0.05) band += 1;
    if (model.price >= 0.20) band += 1;
    return band;
}

function structuredModelPricePerMillion(model) {
    const prompt = parseFloat(model?.pricing?.prompt);
    const completion = parseFloat(model?.pricing?.completion);
    if (!Number.isFinite(prompt) || !Number.isFinite(completion)) return null;
    // Structured passes read a lot and write a little, so weight accordingly.
    return ((prompt * 3 + completion) / 4) * 1_000_000;
}

/**
 * Rank the live catalog for structured work: can emit JSON, is not a reasoning
 * model, has room for a world digest, and is cheap. Returns [] when the
 * catalog has not loaded, so the picker degrades to a plain text field rather
 * than offering ids that may no longer resolve.
 */
function rankStructuredModels(models, limit = 12) {
    return (Array.isArray(models) ? models : [])
        .map(model => {
            const params = Array.isArray(model?.supported_parameters) ? model.supported_parameters : [];
            const outputs = model?.architecture?.output_modalities;
            const price = structuredModelPricePerMillion(model);
            return {
                id: typeof model?.id === 'string' ? model.id : '',
                name: model?.name || model?.id || '',
                context: Number(model?.context_length) || 0,
                // What a pass can actually WRITE, which is the ceiling that was
                // silently truncating replies — not the context window.
                maxOutput: Number(model?.top_provider?.max_completion_tokens) || 0,
                price,
                json: STRUCTURED_PARAM_FLAGS.some(flag => params.includes(flag)),
                reasoning: REASONING_PARAM_FLAGS.some(flag => params.includes(flag)),
                // Sorting by price alone put two music-generation models at the
                // top: they are cheap and report response_format, but a model
                // that answers in audio cannot return a calibration object.
                textOnly: Array.isArray(outputs)
                    ? outputs.length === 1 && outputs[0] === 'text'
                    : true,                    // no modality reported: assume text
                free: price === 0
            };
        })
        .filter(model => model.id && model.json && !model.reasoning && model.textOnly
            && model.context >= 32000          // a world digest has to fit
            // The reply has to fit too. A model that can only write 4k tokens
            // will truncate a batch however cheap it is — this is the exact
            // ceiling that was failing, so it is now a hard requirement.
            && (model.maxOutput === 0 || model.maxOutput >= STRUCTURED_MIN_OUTPUT_TOKENS)
            && model.price != null)
        // Cheapest first was the wrong order: it put 4-billion-parameter models
        // at the top, and small models are exactly the ones that lose the
        // thread of a long structured answer. Sort by capability band first,
        // then by price inside the band, so the default is something that can
        // actually finish the job.
        .sort((left, right) =>
            structuredCapabilityBand(right) - structuredCapabilityBand(left)
            || left.price - right.price)
        .slice(0, limit)
        .map(model => {
            const price = model.free
                ? 'free'
                : '$' + (model.price < 1 ? model.price.toFixed(3) : model.price.toFixed(2)) + '/M';
            const out = model.maxOutput ? `${Math.round(model.maxOutput / 1000)}k out` : 'output unstated';
            return { ...model, note: `${price} · ${Math.round(model.context / 1000)}k ctx · ${out}` };
        });
}

/**
 * The model to use for anything that must return structured data. Falls back
 * through the world's own settings so nothing breaks when it is unset.
 */
function structuredModelFor(world) {
    const chosen = String(state.globalSettings?.structuredModel || '').trim();
    if (chosen) return chosen;
    const agent = world ? normalizeWorldAgentConfig(world).model : '';
    return agent || world?.model || state.globalSettings.defaultModel;
}

/**
 * One small call for one character's beats — the cheapest useful unit of AI
 * help. Beats are what turn "made progress" into something the player can
 * actually discover, and writing four of them by hand for every NPC is the
 * kind of chore that stops a world ever getting finished.
 */
async function generateAgendaBeats(entity, button) {
    const world = state.editingWorld;
    if (!world || !entity) return;
    if (!hasApiCredentials()) return showToast('API Key missing (Settings).', 'error');
    if (!String(entity.goal || '').trim()) {
        return showToast('Give them an agenda first — the beats are the steps toward it.', 'info');
    }
    const original = button ? button.textContent : '';
    if (button) { button.disabled = true; button.textContent = '⏳'; }
    try {
        const response = await fetch(apiBase() + '/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders(), ...attributionHeaders() },
            body: JSON.stringify(applyOpenRouterRouting({
                model: structuredModelFor(world),
                max_tokens: 1200,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: `You write the concrete steps a character takes toward a private goal, for a roleplay world engine.

Return 4 or 5 beats in order, escalating. Each is ONE specific observable action, written in past tense, as a bystander would report it — "asked the mason about the old seal", "was seen carrying a lantern down to the cellar long after closing". Never vague ("made progress", "worked on her plan"), never internal ("decided to"), never a whole scene.

Also suggest one follow-up aim they would take up once this one resolves.

Reply with only this JSON: {"beats":["...","..."],"next_goal":"..."}` },
                    { role: 'user', content: `WORLD: ${world.name}\n${world.description ? `PREMISE: ${String(world.description).slice(0, 300)}\n` : ''}CHARACTER: ${entity.name}\n${entity.description ? `ABOUT: ${String(entity.description).slice(0, 600)}\n` : ''}${entity.persona ? `MANNER: ${String(entity.persona).slice(0, 600)}\n` : ''}THEIR GOAL: ${entity.goal}\n\nWrite their beats.` }
                ]
            }, world))
        });
        if (!response.ok) {
            throw new Error((await response.json().catch(() => ({})))?.error?.message || response.statusText);
        }
        const message = (await response.json())?.choices?.[0]?.message || {};
        let text = message.content || '';
        if (Array.isArray(text)) text = text.map(part => part?.text || '').join(' ');
        if (!String(text).trim() && message.reasoning) text = String(message.reasoning);
        text = String(text).replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, ' ');

        let parsed = null;
        for (let start = text.indexOf('{'); start >= 0 && !parsed; start = text.indexOf('{', start + 1)) {
            const end = text.indexOf('}', start);
            if (end < 0) break;
            try {
                const candidate = JSON.parse(text.slice(start, text.lastIndexOf('}') + 1));
                if (Array.isArray(candidate?.beats)) parsed = candidate;
            } catch (error) { /* keep scanning */ }
        }
        if (!parsed) throw new Error('The model did not return beats. Try a smaller, non-reasoning model above.');

        const beats = parsed.beats.map(beat => String(beat || '').trim()).filter(Boolean).slice(0, 20);
        if (!beats.length) throw new Error('The model returned no usable beats.');
        entity.goalSteps = beats;
        const next = String(parsed.next_goal || '').trim();
        if (next && !(entity.goalPool || []).length) entity.goalPool = [next.slice(0, 240)];
        renderWorldEntities();
        showToast(`${beats.length} beats written for ${entity.name} — edit freely, then Save World.`, 'success');
    } catch (error) {
        console.error('Beat generation failed', error);
        showToast(error.message || 'Could not write beats.', 'error');
    } finally {
        if (button) { button.disabled = false; button.textContent = original || '✨ Generate'; }
    }
}

// --- Calibration: AI passes -------------------------------------------------
// Tier 0 repairs facts. These passes supply the judgement a hand-built world is
// missing — which room is inside which building, how far apart places are, who
// lives where, who is married to whom. Each pass is small and focused so it
// stays reliable, gap-fills only (an authored value is never overwritten), and
// is idempotent, so a partial failure can simply be run again.

const CALIBRATION_PASSES = Object.freeze({
    structure: {
        label: 'Structure',
        blurb: 'Which places sit inside which, how they are laid out, and how long it takes to walk between them.'
    },
    locations: {
        label: 'Locations',
        blurb: 'Stable aliases and semantic identity for existing places. It never creates, merges, or moves locations.'
    },
    relationships: {
        label: 'Relationships',
        blurb: 'Evidence-backed, directional relationship proposals. Reciprocal feelings are never assumed.'
    },
    people: {
        label: 'People',
        blurb: 'Where each character lives and starts, how they speak, who they belong with, their daily routine, and the agenda they pursue when you are not watching.'
    },
    items: {
        label: 'Items',
        blurb: 'Separately enriches objects with a useful description, placement and search tags—without treating them like people.'
    },
    society: {
        label: 'Society',
        blurb: 'Who stands in what relation to whom, which powers exist and who belongs to them, and how safe or prosperous each place is before play begins.'
    }
});

// How many pairs the Society pass will ever ask about. A world may hold
// hundreds of people, and every pair is a question — so the engine chooses
// which pairs are worth asking about and the model never sees the rest.
const SOCIETY_PAIR_CAP = 60;

// Below this many people, every pair is enumerable and cheap, so the pass asks
// about all of them rather than leaving a hand-written world with no proposals.
const SOCIETY_SMALL_CAST = 40;

/**
 * The pairs whose standing actually matters, most telling first.
 *
 * Asking a model about every pair is O(n²) and unaffordable past a few dozen
 * people; asking about none leaves a world of strangers. So the pairs are
 * chosen here, from evidence already in the world: people who share a roof,
 * who serve the same power, who are named in each other's description, or who
 * are both prominent enough that the player will deal with them.
 */
function calibrationPairCandidates(world) {
    const npcs = (world?.entities || []).filter(entity => entity?.type === 'npc' && entity.id);
    const nameOf = entity => String(entity.name || '').trim();
    const scored = new Map();
    const consider = (a, b, weight, why) => {
        if (a.id === b.id) return;
        const key = relationshipKey(a.id, b.id);
        const existing = scored.get(key);
        if (existing) {
            existing.weight += weight;
            if (!existing.reasons.includes(why)) existing.reasons.push(why);
            return;
        }
        scored.set(key, { a, b, weight, reasons: [why] });
    };

    // Named in each other's text — the strongest signal a world can give.
    npcs.forEach(entity => {
        const haystack = `${entity.description || ''} ${entity.persona || ''} ${entity.goal || ''}`.toLowerCase();
        if (!haystack.trim()) return;
        npcs.forEach(other => {
            const name = nameOf(other).toLowerCase();
            if (!name || other.id === entity.id || name.length < 3) return;
            if (haystack.includes(name)) consider(entity, other, 100, 'named in their description');
        });
    });

    // Under one roof: households, families, the people a life is actually lived with.
    const byHome = new Map();
    npcs.forEach(entity => {
        const home = String(entity.homeLocation || '').trim().toLowerCase();
        if (!home) return;
        if (!byHome.has(home)) byHome.set(home, []);
        byHome.get(home).push(entity);
    });
    byHome.forEach(group => {
        if (group.length > 8) return;         // a barracks is not a household
        group.forEach((a, i) => group.slice(i + 1).forEach(b => consider(a, b, 60, 'share a home')));
    });

    // Sworn to the same power.
    const byFaction = new Map();
    npcs.forEach(entity => {
        const faction = String(entity.factionId || '').trim();
        if (!faction) return;
        if (!byFaction.has(faction)) byFaction.set(faction, []);
        byFaction.get(faction).push(entity);
    });
    byFaction.forEach(group => {
        if (group.length > 8) return;
        group.forEach((a, i) => group.slice(i + 1).forEach(b => consider(a, b, 40, 'serve the same faction')));
    });

    // Standing in the same place when play begins.
    const byStart = new Map();
    npcs.forEach(entity => {
        const start = String(entity.startLocation || '').trim().toLowerCase();
        if (!start) return;
        if (!byStart.has(start)) byStart.set(start, []);
        byStart.get(start).push(entity);
    });
    byStart.forEach(group => {
        if (group.length > 8) return;
        group.forEach((a, i) => group.slice(i + 1).forEach(b => consider(a, b, 30, 'begin play together')));
    });

    // The cast the player will actually deal with.
    const majors = npcs.filter(entity => entity.isMajor);
    majors.forEach((a, i) => majors.slice(i + 1).forEach(b => consider(a, b, 20, 'both central to the story')));

    // A hand-written world often states none of the above — no homes, no
    // factions, nobody flagged major — and would then get no proposals at all,
    // which is the opposite of the point. When the cast is small enough that
    // every pair fits inside the cap anyway, ask about all of them; the O(n²)
    // concern only bites on a large cast, and a large cast has the signals.
    if (npcs.length <= SOCIETY_SMALL_CAST) {
        npcs.forEach((a, i) => npcs.slice(i + 1).forEach(b =>
            consider(a, b, 5, 'both live in this world')));
    }

    // Anything the world already states is not worth a question.
    const stated = new Set(readWorldRelationships(world).map(relation => relationshipKey(relation.a, relation.b)));
    return [...scored.entries()]
        .filter(([key]) => !stated.has(key))
        .sort((left, right) => right[1].weight - left[1].weight)
        .slice(0, SOCIETY_PAIR_CAP)
        .map(([, pair]) => pair);
}

// --- Batching -----------------------------------------------------------
// Every pass used to send the whole world in one call and hope the answer fit
// in one reply. It does not: 60 judged pairs is roughly 5,400 tokens of JSON
// before places, factions and memberships are added, and a reply cut off at
// the limit was thrown away whole. The size of a world is not the model's
// problem to solve, so the work is now cut into batches the answer can fit in.
//
// Sized by how much OUTPUT one unit provokes, not how much input it costs:
// a location's role and travel times are a short answer, a character's whole
// routine and agenda is a long one.
const CALIBRATION_BATCH_SIZES = Object.freeze({
    structure: 40,   // a line or two of JSON each
    locations: 30,   // aliases and stable tags only
    relationships: 18, // directional assessment for one candidate pair
    people: 10,      // persona + schedule + beats + pool: the longest answers
    items: 24,       // description + placement + tags are compact
    society: 15      // a judged pair plus a place, each a short object
});

/**
 * The units of work a pass has to get through, so it can be run in batches.
 * Returns [] when a pass has nothing left to ask about.
 */
function calibrationWorkUnits(world, pass) {
    if (pass === 'structure') return (world?.locations || []).slice();
    if (pass === 'locations') return (world?.locations || []).slice();
    if (pass === 'relationships') return calibrationPairCandidates(world);
    if (pass === 'people') return (world?.entities || []).filter(entity => entity?.type === 'npc');
    if (pass === 'items') return (world?.entities || []).filter(entity => entity?.type === 'item');
    if (pass === 'society') {
        // Three kinds of unit share the pass, batched together so each call
        // carries a slice of each. Whoever has no faction is a unit too: they
        // were previously listed in full in EVERY batch, which asked the same
        // question six times over and paid for six sets of duplicate answers.
        const pairs = calibrationPairCandidates(world);
        const places = (world?.locations || [])
            .filter(location => location.danger == null || location.danger === '');
        const unaffiliated = (world?.entities || [])
            .filter(entity => entity?.type === 'npc' && !entity.factionId);
        return [...pairs.map(pair => ({ kind: 'pair', pair })),
                ...places.map(place => ({ kind: 'place', place })),
                ...unaffiliated.map(entity => ({ kind: 'member', entity }))];
    }
    return [];
}

function calibrationBatches(world, pass) {
    const units = calibrationWorkUnits(world, pass);
    const size = CALIBRATION_BATCH_SIZES[pass] || 20;
    const batches = [];
    for (let index = 0; index < units.length; index += size) {
        batches.push(units.slice(index, index + size));
    }
    return batches;
}

function calibrationSocietyDigest(world, batch) {
    const about = entity => String(entity.description || entity.persona || '')
        .replace(/\s+/g, ' ').slice(0, 160);
    const units = batch || calibrationWorkUnits(world, 'society');
    const pairs = units.filter(unit => unit.kind === 'pair').map((unit, index) => {
        const pair = unit.pair;
        return `${index + 1}. [${pair.a.id}] "${pair.a.name}" ↔ [${pair.b.id}] "${pair.b.name}" (${pair.reasons.join(', ')})
   ${pair.a.name}: ${about(pair.a) || 'nothing written'}
   ${pair.b.name}: ${about(pair.b) || 'nothing written'}`;
    }).join('\n');

    const places = units.filter(unit => unit.kind === 'place').map(unit => {
        const location = unit.place;
        return `- [${location.id}] "${location.name}"${location.description ? ` — ${String(location.description).replace(/\s+/g, ' ').slice(0, 160)}` : ''}`;
    }).join('\n');

    const factions = (world.factions || []).length
        ? (world.factions || []).map(faction =>
            `- [${faction.id}] "${faction.name}"${faction.goal ? ` — seeks ${faction.goal}` : ''}`).join('\n')
        : '(none — propose any the fiction clearly implies)';

    // Only the people this batch is responsible for. Sending the whole roster
    // every time is what produced the same proposal over and over.
    const unaffiliated = units.filter(unit => unit.kind === 'member').map(unit => {
        const entity = unit.entity;
        return `- [${entity.id}] "${entity.name}"${entity.description ? ` — ${String(entity.description).replace(/\s+/g, ' ').slice(0, 120)}` : ''}`;
    }).join('\n');

    return { pairs, places, factions, unaffiliated };
}

function calibrationLocationDigest(world, batch) {
    return (batch || world.locations || []).map(location => {
        const exits = (location.exits || []).map(exit => {
            const target = getExitTargetName(exit);
            const minutes = (exit && typeof exit === 'object' && exit.travelTime) || 0;
            return `${target}${minutes ? ` (${minutes}m)` : ' (no travel time)'}`;
        }).join('; ') || 'none';
        const bits = [`- [${location.id}] "${location.name}"`];
        if (location.mapType) bits.push(`role=${location.mapType}`);
        if (location.parentLocationId || location.region) bits.push(`inside=${location.parentLocationId || location.region}`);
        if (location.mapFloor) bits.push(`floor=${location.mapFloor}`);
        bits.push(`exits: ${exits}`);
        const description = String(location.description || '').replace(/\s+/g, ' ').slice(0, 220);
        if (description) bits.push(`— ${description}`);
        return bits.join(' | ');
    }).join('\n');
}

function calibrationPeopleDigest(world, batch) {
    const npcs = batch || (world.entities || []).filter(entity => entity.type === 'npc');
    return npcs.map(entity => {
        const has = [];
        if (entity.startLocation) has.push(`starts=${entity.startLocation}`);
        if (entity.homeLocation) has.push(`home=${entity.homeLocation}`);
        if (entity.persona) has.push('persona=written');
        if ((entity.schedule || []).length) has.push(`schedule=${entity.schedule.length} blocks`);
        if (entity.goal) has.push('agenda=written');
        if ((entity.goalSteps || []).length) has.push(`beats=${entity.goalSteps.length}`);
        if ((entity.groupIds || []).length) has.push(`groups=${entity.groupIds.join(',')}`);
        if ((entity.tags || []).length) has.push(`tags=${entity.tags.join(',')}`);
        const bits = [`- [${entity.id}] "${entity.name}" | depth=${entity.simulationDepth || (entity.isMajor ? 'core' : 'unset')}`];
        bits.push(has.length ? `already has: ${has.join(', ')}` : 'has nothing set');
        const about = String(entity.description || '').replace(/\s+/g, ' ').slice(0, 300);
        if (about) bits.push(`— ${about}`);
        return bits.join(' | ');
    }).join('\n');
}

function calibrationItemDigest(world, batch) {
    return (batch || (world.entities || []).filter(entity => entity.type === 'item')).map(item => {
        const has = [];
        if (item.description) has.push('description=written');
        if (item.startLocation) has.push(`placed=${item.startLocation}`);
        if ((item.tags || []).length) has.push(`tags=${item.tags.join(',')}`);
        return `- [${item.id}] "${item.name}" | ${has.length ? `already has: ${has.join(', ')}` : 'has nothing set'}`;
    }).join('\n');
}

function calibrationRelationshipDigest(world, batch) {
    return (batch || calibrationWorkUnits(world, 'relationships')).map(pair => {
        const describe = entity => String(entity.description || entity.persona || entity.goal || '')
            .replace(/\s+/g, ' ').slice(0, 360) || 'No authored description.';
        return `- [${pair.a.id}] "${pair.a.name}" ↔ [${pair.b.id}] "${pair.b.name}"\n`
            + `  possible basis: ${pair.reasons.join(', ')}\n  ${pair.a.name}: ${describe(pair.a)}\n  ${pair.b.name}: ${describe(pair.b)}`;
    }).join('\n');
}

function buildCalibrationPrompt(world, pass, batch) {
    if (pass === 'relationships') {
        const pairs = calibrationRelationshipDigest(world, batch);
        if (!pairs) return '';
        return `You audit directional relationships in a roleplay world. You do not write fiction and you do not invent a bond merely because two people exist.

For each listed pair, propose a claim only when the written evidence supports it. A relationship is directional: A can distrust B while B likes A. Assess each direction independently and omit the reverse direction unless it has its own evidence. Use neutral reusable axes such as affinity, trust, respect, dependence, rivalry, obligation, or familiarity. Do not use a city/profile-specific axis. A reciprocal claim is never implied.

Each proposal needs an exact source id, target id, axis, a compact value (a signed number or short bounded phrase), confidence 0..1, and a reason that points to the written evidence. A missing answer is better than a guess.

OUTPUT FORMAT — JSON only, first character {:
{"relationship_claims":[{"source":"<id>","target":"<id>","axis":"<neutral axis>","value":<number or text>,"confidence":0.0,"reason":"<evidence-based explanation>"}]}

WORLD: ${world.name}
${world.description ? `PREMISE: ${String(world.description).slice(0, 500)}\n` : ''}
PAIRS:
${pairs}`;
    }
    if (pass === 'locations') {
        const locations = calibrationLocationDigest(world, batch);
        if (!locations) return '';
        return `You audit the stable semantic identity of locations in a roleplay world. Do not create locations, infer containment, merge similar places, alter paths, or describe transient weather, occupants, or scene events.

For each listed existing location, supply only missing stable aliases (names a player might reasonably use for that same place) and stable semantic tags. Do not guess aliases. Omit a location entirely when the world does not support a useful addition.

OUTPUT FORMAT — JSON only, first character {:
{"locations":[{"id":"<existing id>","aliases":["<alias>"],"tags":["<stable tag>"],"why":"<brief evidence>"}]}

WORLD: ${world.name}
LOCATIONS:
${locations}`;
    }
    if (pass === 'society') {
        const { pairs, places, factions, unaffiliated } = calibrationSocietyDigest(world, batch);
        if (!pairs && !places && !unaffiliated) return '';
        // Only ask for the work this batch actually carries. Asking every
        // section every time is what made six calls answer the same question
        // about factions six times over.
        const sections = [];
        if (pairs) sections.push(`1. RELATIONSHIPS. For each numbered pair, judge their standing from what is written about them. Give:
   - label: what they are to each other in the world's own words — "wife", "estranged brother", "rival", "old debt", "mentor". Never "acquaintance" for people who share a home or a history; a marriage is a marriage and a feud is a feud.
   - score: -100 (would see them dead) to 100 (would die for them). Family and love sit high, rivalry low, indifference near zero. A bond can be close AND bitter — score how they FEEL, and let the label carry the rest.
   - reason: one short clause naming what the standing rests on.
   Skip any pair the text gives you no basis for. A guess is worse than a gap.`);
        if (places) sections.push(`2. PLACES. For each listed location give danger 0-100 and prosperity 0-100, judged from what it is. A guarded hall is not dangerous; a bandit road is. A market thrives; a flooded crypt does not. Add conditions only where something is visibly true of the place right now ("under curfew", "smoke-logged"), at most two, never speculation.`);
        if (unaffiliated) sections.push(`3. FACTIONS AND WHO SERVES THEM. For each character listed under CHARACTERS BELONGING TO NOBODY, decide whether they plainly serve one of the powers above, and say so with a membership. An innkeeper, a hedge-witch or a farmer usually serves nobody — leave them out rather than forcing everyone into a box.
   Where the fiction clearly implies an organised power that is NOT already listed — a guild those characters belong to, a watch, an order, a cartel — propose it too: name, one-line goal, influence 0-100, reputation -100..100. You may then give it members by name. Propose none if the world does not call for them; an invented faction is worse than no faction.`);
        return `You are settling the society of a roleplay world before play begins: who stands in what relation to whom, which powers exist, and what each place is like to be in.

${sections.join('\n\n')}

OUTPUT FORMAT — this is strict:
Your entire reply is one JSON object and nothing else. The first character you write must be {. Do not restate the task or reason in the open; put justification in each item's own field.

{"relationships":[{"a":"<id>","b":"<id>","label":"<text>","score":<int>,"reason":"<short>"}],
 "places":[{"id":"<id>","danger":<int>,"prosperity":<int>,"conditions":["<text>"],"why":"<short>"}],
 "factions":[{"name":"<text>","goal":"<text>","influence":<int>,"reputation":<int>,"why":"<short>"}],
 "memberships":[{"entity":"<id>","faction":"<faction id or the name of one you proposed>","why":"<short>"}]}

Omit any array you are not using. Never use an id that is not listed above.

WORLD: ${world.name}
${world.description ? `PREMISE: ${String(world.description).slice(0, 400)}\n` : ''}
EXISTING FACTIONS:
${factions}
${pairs ? `\nPAIRS TO JUDGE:\n${pairs}` : ''}${places ? `\nPLACES WITH NOTHING SET:\n${places}` : ''}${unaffiliated ? `\nCHARACTERS BELONGING TO NOBODY:\n${unaffiliated}` : ''}`;
    }
    if (pass === 'people') {
        const places = (world.locations || [])
            .map(location => `- [${location.id}] "${location.name}"${location.description ? ` — ${String(location.description).replace(/\s+/g, ' ').slice(0, 120)}` : ''}`)
            .join('\n');
        return `You are settling the cast of a roleplay world into it, so its engine can run them when the player is not watching.

For each character, supply ONLY what is missing — anything listed under "already has" is the author's and must not be replaced:
- start: the location id where they are when play begins
- home: the location id they belong to and return to (often the same)
- persona: how they speak, behave and carry themselves. Give every person one: 2-3 sentences for core/recurring cast, one sharp sentence for background cast. Second person absent.
- gender: the dossier-level gender description when the authored material establishes one. Keep blank when it is not established; never infer it from a name alone.
- depth: background | recurring | core — how much simulation/context attention they deserve
- tags: 2-6 short search terms that describe role, occupation, temperament or story function
- group: where the fiction clearly implies a reusable household, family, organization or crew, give {name,type,description,tags}. Omit it for genuinely unaffiliated people.
- schedule: 2-5 blocks of {time "HH:MM" (24h), location id, short activity}. A believable day, in order, using places that exist.
- goal: one private aim they pursue off-screen, drawn from who they are
- beats: 4-5 concrete steps toward it, in order, each ONE observable past-tense action a bystander could report ("asked the mason about the old seal", "was seen carrying a lantern down to the cellar"). Never vague, never internal.
- next_goals: one or two aims they would take up after that one resolves
- autonomy: paused | low | medium | high — how hard they push
- difficulty: 0-100, higher is slower going

Draw everything from the description you are given. Do not invent a different character. Do not use any location id that is not listed.

OUTPUT FORMAT — this is strict:
Your entire reply is one JSON object and nothing else. The first character you write must be {. Do not restate the task or reason in the open; put justification in each item's "why" field.

{"people":[{"id":"<id>","start":"<loc id>","home":"<loc id>","gender":"<established gender or blank>","persona":"<text>","depth":"recurring","tags":["<tag>"],"group":{"name":"<text>","type":"household|family|organization|crew|other","description":"<short>","tags":["<tag>"]},"schedule":[{"time":"HH:MM","location":"<loc id>","activity":"<short>"}],"goal":"<text>","beats":["<text>"],"next_goals":["<text>"],"autonomy":"medium","difficulty":50,"why":"<short>"}]}

Omit any field you have no opinion on.

WORLD: ${world.name}
${world.description ? `PREMISE: ${String(world.description).slice(0, 400)}\n` : ''}
PLACES:
${places}

CHARACTERS:
${calibrationPeopleDigest(world, batch)}`;
    }
    if (pass === 'items') {
        const places = (world.locations || [])
            .map(location => `- [${location.id}] "${location.name}"`)
            .join('\n');
        return `You are enriching the object directory of a roleplay world. Items are objects, not people: do not give them personas, schedules, homes, emotions or relationships.

For every listed item, supply ONLY what is missing:
- description: one concrete player-facing sentence explaining what it looks like and why it matters
- location: the id of the place where it begins, but only when the fiction supports a placement
- tags: 2-6 short search terms covering kind, use, owner or story relevance

OUTPUT FORMAT — strict JSON only. The first character must be {.
{"items":[{"id":"<id>","description":"<text>","location":"<loc id>","tags":["<tag>"],"why":"<short>"}]}

Omit fields the world already has or that the fiction cannot support. Never invent an item or location id.

WORLD: ${world.name}
${world.description ? `PREMISE: ${String(world.description).slice(0, 400)}\n` : ''}
PLACES:
${places}

ITEMS:
${calibrationItemDigest(world, batch)}`;
    }
    if (pass !== 'structure') return '';
    return `You are laying out the map of a roleplay world so its engine can run it.

For each location decide, ONLY where the world has not already said:
- description: one concise player-facing sentence for a blank location
- region: an existing region id, or a short reusable region name when none exists
- role: one of region, route, building, outdoor, room, area
- inside: the id of the place that physically contains it (a bathroom is inside a house; a house is not inside anything). Omit for top-level places.
- floor: a storey number when a building has more than one ("2", "-1" for a cellar). Omit otherwise.
- connect_to: for any place NOTHING leads to, the id of the location it should connect to, judged from the fiction.
- tags: 2-6 short search terms for the place, its function and atmosphere

Also estimate walking time in whole minutes for each connection that has none. Be realistic and modest: a door between two rooms of one house is 0-1 minutes; crossing a village 5-15; travelling between settlements 30-240. Never propose a time for a connection that already has one.

OUTPUT FORMAT — this is strict:
Your entire reply is one JSON object and nothing else. The first character you write must be {. Do not restate the task, do not reason in the open, do not add commentary before or after. If you want to justify a decision, put it in that item's "why" field — that is what it is for.

{"locations":[{"id":"<id>","description":"<text>","region":"<region id or name>","role":"<role>","inside":"<id or omit>","floor":"<string or omit>","connect_to":"<id or omit>","tags":["<tag>"],"why":"<short>"}],
 "travel":[{"from":"<id>","to":"<id>","minutes":<integer>}]}

Omit any array you are not using, and omit any field you have no opinion on. Never invent locations that are not listed.

WORLD: ${world.name}
${world.description ? `PREMISE: ${String(world.description).slice(0, 400)}\n` : ''}
LOCATIONS:
${calibrationLocationDigest(world, batch)}

EXISTING REGIONS:
${(world.regions || []).length ? world.regions.map(region => `- [${region.id}] "${region.name}"`).join('\n') : '(none — create only broad reusable regions the listed places clearly imply)'}`;
}

// Turn a pass's reply into reviewable findings. Anything the world already
// states is skipped, so running a pass twice proposes nothing the second time.
function calibrationFindingsFromStructure(world, payload) {
    const findings = [];
    const byId = new Map((world.locations || []).map(l => [String(l.id), l]));
    const seen = new Set();

    (Array.isArray(payload?.locations) ? payload.locations : []).forEach(entry => {
        const location = byId.get(String(entry?.id || ''));
        if (!location) return;
        const why = String(entry?.why || '').slice(0, 200);

        const description = String(entry?.description || '').trim();
        if (description && !String(location.description || '').trim()) {
            findings.push({
                tier: 'structure', id: `description_${location.id}`, type: 'set_location_description', severity: 'suggestion',
                title: `Describe "${location.name}"`, detail: description.slice(0, 240),
                patch: { locationId: location.id, description }
            });
        }

        const regionRef = String(entry?.region || '').trim();
        if (regionRef && !location.regionId) {
            const existingRegion = (world.regions || []).find(region => region.id === regionRef
                || String(region.name || '').trim().toLowerCase() === regionRef.toLowerCase());
            findings.push({
                tier: 'structure', id: `region_${location.id}`, type: 'set_location_region', severity: 'suggestion',
                title: `Group "${location.name}" under ${existingRegion?.name || regionRef}`,
                detail: why || 'Regions keep large location directories browsable and reusable.',
                patch: { locationId: location.id, regionId: existingRegion?.id || '', name: existingRegion?.name || regionRef }
            });
        }

        const tags = [...new Set((Array.isArray(entry?.tags) ? entry.tags : [])
            .map(tag => String(tag || '').trim()).filter(Boolean))].slice(0, 30);
        if (tags.length && !(location.tags || []).length) {
            findings.push({
                tier: 'structure', id: `tags_${location.id}`, type: 'set_location_tags', severity: 'suggestion',
                title: `Make "${location.name}" searchable`,
                detail: tags.join(' · '),
                patch: { locationId: location.id, tags }
            });
        }

        const role = String(entry?.role || '').trim().toLowerCase();
        if (role && WORLD_MAP_TYPES.has(role) && !location.mapType) {
            findings.push({
                tier: 'structure', id: `role_${location.id}`, type: 'set_map_type', severity: 'suggestion',
                title: `"${location.name}" is a ${formatWorldMapType(role)}`,
                detail: why || 'Sets how this place is drawn on the map and how containment reads.',
                patch: { locationId: location.id, mapType: role }
            });
        }

        const insideId = String(entry?.inside || '').trim();
        const parent = byId.get(insideId);
        if (parent && parent.id !== location.id
            && !location.parentLocationId
            && String(location.region || '').trim().toLowerCase() !== String(parent.id).toLowerCase()
            && String(location.region || '').trim().toLowerCase() !== String(parent.name || '').trim().toLowerCase()) {
            findings.push({
                tier: 'structure', id: `inside_${location.id}`, type: 'set_containment', severity: 'warning',
                title: `"${location.name}" is inside "${parent.name}"`,
                detail: why || 'Containment lets the player walk in and out without an explicit exit on both sides.',
                patch: { locationId: location.id, parentLocationId: parent.id }
            });
        }

        const floor = String(entry?.floor || '').trim();
        if (floor && !location.mapFloor) {
            findings.push({
                tier: 'structure', id: `floor_${location.id}`, type: 'set_floor', severity: 'suggestion',
                title: `"${location.name}" is on floor ${floor}`,
                detail: why || 'Used when drawing a multi-storey building.',
                patch: { locationId: location.id, mapFloor: floor }
            });
        }

        const connectId = String(entry?.connect_to || '').trim();
        const connectTo = byId.get(connectId);
        if (connectTo && connectTo.id !== location.id && !(location.exits || []).length) {
            findings.push({
                tier: 'structure', id: `connect_${location.id}`, type: 'connect_location', severity: 'critical',
                title: `Connect "${location.name}" to "${connectTo.name}"`,
                detail: why || 'Nothing currently leads here, so the player can never arrive.',
                patch: { locationId: location.id, targetId: connectTo.id, targetName: connectTo.name,
                         sourceName: location.name }
            });
        }
    });

    (Array.isArray(payload?.travel) ? payload.travel : []).forEach(entry => {
        const from = byId.get(String(entry?.from || ''));
        const to = byId.get(String(entry?.to || ''));
        const minutes = Math.max(0, Math.min(1440, parseInt(entry?.minutes) || 0));
        if (!from || !to || !minutes) return;
        const key = `${from.id}>${to.id}`;
        if (seen.has(key)) return;
        const exitIndex = (from.exits || []).findIndex(exit =>
            String(getExitTargetName(exit) || '').trim().toLowerCase() === String(to.name || '').trim().toLowerCase()
            || String(getExitTargetName(exit) || '').trim().toLowerCase() === String(to.id).toLowerCase());
        if (exitIndex < 0) return;
        const existing = from.exits[exitIndex];
        if (existing && typeof existing === 'object' && existing.travelTime) return;   // already stated
        seen.add(key);
        findings.push({
            tier: 'structure', id: `travel_${from.id}_${to.id}`, type: 'set_travel_time', severity: 'suggestion',
            title: `${from.name} → ${to.name}: ${minutes} min`,
            detail: 'Travel time drives the world clock, so journeys cost real time and schedules stay in step.',
            patch: { locationId: from.id, exitIndex, minutes }
        });
    });

    return findings;
}

function calibrationFindingsFromPeople(world, payload) {
    const findings = [];
    const byId = new Map((world.entities || []).map(entity => [String(entity.id), entity]));
    const locations = new Map();
    (world.locations || []).forEach(location => {
        locations.set(String(location.id).toLowerCase(), location);
        if (location.name) locations.set(String(location.name).trim().toLowerCase(), location);
    });
    const resolveLocation = ref => locations.get(String(ref || '').trim().toLowerCase()) || null;

    (Array.isArray(payload?.people) ? payload.people : []).forEach(entry => {
        const entity = byId.get(String(entry?.id || ''));
        if (!entity || entity.type !== 'npc') return;
        const why = String(entry?.why || '').slice(0, 200);
        const push = (type, id, severity, title, detail, patch) =>
            findings.push({ tier: 'people', id: `${id}_${entity.id}`, type, severity, title, detail, patch });

        const start = resolveLocation(entry?.start);
        if (start && !entity.startLocation) {
            push('set_entity_location', 'start', 'warning',
                `${entity.name} starts at ${start.name}`,
                why || 'Without this they begin wherever the location list happens to start.',
                { entityId: entity.id, locationId: start.id });
        }
        const home = resolveLocation(entry?.home);
        if (home && !entity.homeLocation) {
            push('set_entity_home', 'home', 'suggestion',
                `${entity.name} belongs to ${home.name}`,
                why || 'Home decides where they can be found when nothing else is driving them.',
                { entityId: entity.id, locationId: home.id });
        }

        const persona = String(entry?.persona || '').trim();
        if (persona && !String(entity.persona || '').trim()) {
            push('set_persona', 'persona', 'suggestion',
                `Give ${entity.name} a voice`,
                persona.slice(0, 180) + (persona.length > 180 ? '…' : ''),
                { entityId: entity.id, persona: persona.slice(0, 4000) });
        }

        const gender = String(entry?.gender || '').trim().slice(0, 100);
        if (gender && !String(entity.gender || '').trim()) {
            push('set_entity_gender', 'gender', 'suggestion',
                `${entity.name}: dossier gender`, gender,
                { entityId: entity.id, gender });
        }

        const depth = String(entry?.depth || '').trim().toLowerCase();
        if (WORLD_DIRECTORY_DEPTHS.includes(depth)
            && (!entity.simulationDepth || (entity.simulationDepth === 'background' && !entity.isMajor))) {
            push('set_entity_depth', 'depth', 'suggestion',
                `${entity.name}: ${depth} cast`,
                'Controls simulation and context priority; it does not gate persona editing.',
                { entityId: entity.id, simulationDepth: depth });
        }

        const tags = [...new Set((Array.isArray(entry?.tags) ? entry.tags : [])
            .map(tag => String(tag || '').trim()).filter(Boolean))].slice(0, 30);
        if (tags.length && !(entity.tags || []).length) {
            push('set_entity_tags', 'tags', 'suggestion',
                `Tag ${entity.name} for search`, tags.join(' · '), { entityId: entity.id, tags });
        }

        const proposedGroup = isPlainObject(entry?.group) ? entry.group : null;
        if (proposedGroup && !(entity.groupIds || []).length) {
            const groupName = String(proposedGroup.name || '').trim();
            const groupType = String(proposedGroup.type || '').trim().toLowerCase();
            if (groupName && ['household', 'family', 'organization', 'crew', 'other'].includes(groupType)) {
                push('set_entity_group', 'group', 'suggestion',
                    `${entity.name} belongs to ${groupName}`,
                    String(proposedGroup.description || why || 'A reusable cast group inferred from the fiction.').slice(0, 240),
                    {
                        entityId: entity.id, name: groupName, groupType,
                        description: String(proposedGroup.description || '').trim(),
                        homeLocationId: home?.id || '',
                        tags: Array.isArray(proposedGroup.tags) ? proposedGroup.tags : []
                    });
            }
        }

        // Schedules only count if every block is usable — a half-valid routine
        // would leave the character stranded at an impossible time.
        const blocks = (Array.isArray(entry?.schedule) ? entry.schedule : [])
            .map(block => {
                const location = resolveLocation(block?.location ?? block?.location_id);
                const time = String(block?.time || '').trim();
                if (!location || !isValidScheduleTime(time)) return null;
                const days = (Array.isArray(block?.days) ? block.days : (block?.day ? [block.day] : []))
                    .map(day => String(day || '').trim()).filter(Boolean).slice(0, 7);
                return { time, locationId: location.id, activity: String(block?.activity || '').slice(0, 160), ...(days.length ? { days } : {}) };
            })
            .filter(Boolean)
            .sort((a, b) => a.time.localeCompare(b.time))
            .slice(0, 20);
        if (blocks.length && !(entity.schedule || []).length) {
            push('set_schedule', 'schedule', 'warning',
                `${entity.name}: a daily routine (${blocks.length} blocks)`,
                blocks.map(block => `${block.time} ${locations.get(block.locationId.toLowerCase())?.name || block.locationId}${block.activity ? ` — ${block.activity}` : ''}`).join(' · '),
                { entityId: entity.id, schedule: blocks });
        }

        // The agenda is proposed as one unit: a goal with no beats is the vague
        // state we were trying to escape, and beats without a goal go nowhere.
        const goal = String(entry?.goal || '').trim();
        const beats = (Array.isArray(entry?.beats) ? entry.beats : [])
            .map(beat => String(beat || '').trim()).filter(Boolean).slice(0, 20);
        const pool = (Array.isArray(entry?.next_goals) ? entry.next_goals : [])
            .map(item => String(item || '').trim()).filter(Boolean).slice(0, 20);
        const autonomy = ['paused', 'low', 'medium', 'high'].includes(entry?.autonomy) ? entry.autonomy : '';
        const difficulty = Number.isFinite(Number(entry?.difficulty))
            ? Math.max(0, Math.min(100, Math.round(Number(entry.difficulty)))) : null;

        if (goal && !String(entity.goal || '').trim()) {
            push('set_agenda', 'agenda', 'warning',
                `${entity.name} wants: ${goal.slice(0, 90)}${goal.length > 90 ? '…' : ''}`,
                beats.length
                    ? `${beats.length} beats — ${beats.slice(0, 2).join('; ')}${beats.length > 2 ? '…' : ''}`
                    : (why || 'A private aim they pursue off-screen.'),
                { entityId: entity.id, goal: goal.slice(0, 200), beats, pool, autonomy, difficulty });
        } else if (beats.length && String(entity.goal || '').trim() && !(entity.goalSteps || []).length) {
            // They already have an aim but no concrete steps toward it.
            push('set_beats', 'beats', 'suggestion',
                `${entity.name}: ${beats.length} beats for their existing agenda`,
                beats.slice(0, 2).join('; ') + (beats.length > 2 ? '…' : ''),
                { entityId: entity.id, beats, pool });
        }
    });
    return findings;
}

function calibrationFindingsFromItems(world, payload) {
    const findings = [];
    const items = new Map((world.entities || [])
        .filter(entity => entity?.type === 'item').map(entity => [String(entity.id), entity]));
    const locations = new Map();
    (world.locations || []).forEach(location => {
        locations.set(String(location.id).toLowerCase(), location);
        if (location.name) locations.set(String(location.name).trim().toLowerCase(), location);
    });
    (Array.isArray(payload?.items) ? payload.items : []).forEach(entry => {
        const item = items.get(String(entry?.id || ''));
        if (!item) return;
        const description = String(entry?.description || '').trim();
        const why = String(entry?.why || '').trim().slice(0, 240);
        if (description && !String(item.description || '').trim()) {
            findings.push({
                tier: 'items', id: `item_description_${item.id}`, type: 'set_item_description', severity: 'suggestion',
                title: `Describe ${item.name}`, detail: description.slice(0, 240),
                patch: { entityId: item.id, description }
            });
        }
        const location = locations.get(String(entry?.location || '').trim().toLowerCase());
        if (location && !item.startLocation) {
            findings.push({
                tier: 'items', id: `item_location_${item.id}`, type: 'set_entity_location', severity: 'warning',
                title: `Place ${item.name} at ${location.name}`,
                detail: why || 'An unplaced item exists in the directory but cannot enter a scene.',
                patch: { entityId: item.id, locationId: location.id }
            });
        }
        const tags = [...new Set((Array.isArray(entry?.tags) ? entry.tags : [])
            .map(tag => String(tag || '').trim()).filter(Boolean))].slice(0, 30);
        if (tags.length && !(item.tags || []).length) {
            findings.push({
                tier: 'items', id: `item_tags_${item.id}`, type: 'set_entity_tags', severity: 'suggestion',
                title: `Tag ${item.name} for search`, detail: tags.join(' · '),
                patch: { entityId: item.id, tags }
            });
        }
    });
    return findings;
}

function calibrationFindingsFromLocations(world, payload) {
    const findings = [];
    const locations = new Map((world.locations || []).map(location => [String(location.id), location]));
    (Array.isArray(payload?.locations) ? payload.locations : []).forEach(entry => {
        const location = locations.get(String(entry?.id || ''));
        if (!location) return;
        const aliases = [...new Set((Array.isArray(entry?.aliases) ? entry.aliases : [])
            .map(alias => String(alias || '').trim()).filter(Boolean))].slice(0, 12);
        const tags = [...new Set((Array.isArray(entry?.tags) ? entry.tags : [])
            .map(tag => String(tag || '').trim()).filter(Boolean))].slice(0, 30);
        const why = String(entry?.why || '').trim().slice(0, 240);
        if (aliases.length && !(location.aliases || []).length) {
            findings.push({
                tier: 'locations', id: `location_aliases_${location.id}`, type: 'set_location_aliases', severity: 'suggestion',
                title: `Add aliases for ${location.name}`, detail: `${aliases.join(' · ')}${why ? ` — ${why}` : ''}`,
                patch: { locationId: location.id, aliases }
            });
        }
        if (tags.length && !(location.tags || []).length) {
            findings.push({
                tier: 'locations', id: `location_tags_${location.id}`, type: 'set_location_tags', severity: 'suggestion',
                title: `Add semantic tags for ${location.name}`, detail: `${tags.join(' · ')}${why ? ` — ${why}` : ''}`,
                patch: { locationId: location.id, tags }
            });
        }
    });
    return findings;
}

function calibrationFindingsFromRelationships(world, payload) {
    const findings = [];
    const entities = new Set((world.entities || []).filter(entity => entity?.type === 'npc').map(entity => entity.id));
    const existing = new Set((Array.isArray(world.relationshipClaims) ? world.relationshipClaims : [])
        .map(claim => `${claim.sourceCharacterId}|${claim.targetCharacterId}|${claim.axis}`));
    const proposed = new Set();
    (Array.isArray(payload?.relationship_claims) ? payload.relationship_claims : []).forEach(entry => {
        const sourceCharacterId = String(entry?.source || '').trim();
        const targetCharacterId = String(entry?.target || '').trim();
        const axis = String(entry?.axis || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
        const reason = String(entry?.reason || '').trim().slice(0, 500);
        const confidence = Math.max(0, Math.min(1, Number(entry?.confidence) || 0));
        const key = `${sourceCharacterId}|${targetCharacterId}|${axis}`;
        if (!entities.has(sourceCharacterId) || !entities.has(targetCharacterId) || sourceCharacterId === targetCharacterId
            || !axis || !reason || confidence < 0.45 || existing.has(key) || proposed.has(key)) return;
        proposed.add(key);
        const source = (world.entities || []).find(entity => entity.id === sourceCharacterId);
        const target = (world.entities || []).find(entity => entity.id === targetCharacterId);
        findings.push({
            tier: 'relationships', id: `relationship_claim_${sourceCharacterId}_${targetCharacterId}_${axis}`,
            type: 'add_directional_relationship_claim', severity: confidence < 0.7 ? 'suggestion' : 'warning',
            title: `${source?.name || sourceCharacterId} → ${target?.name || targetCharacterId}: ${axis}`,
            detail: `${typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value)} · ${Math.round(confidence * 100)}% confidence — ${reason}`,
            patch: { sourceCharacterId, targetCharacterId, axis, value: safeJsonClone(entry.value), confidence, reason }
        });
    });
    return findings;
}

function calibrationFindingsFromSociety(world, payload, carriedFactions) {
    const findings = [];
    const npcs = new Map((world.entities || [])
        .filter(entity => entity?.type === 'npc').map(entity => [String(entity.id), entity]));
    const locations = new Map((world.locations || []).map(location => [String(location.id), location]));
    const stated = new Set(readWorldRelationships(world).map(relation => relationshipKey(relation.a, relation.b)));
    const proposedPairs = new Set();

    (Array.isArray(payload?.relationships) ? payload.relationships : []).forEach(entry => {
        const a = npcs.get(String(entry?.a || ''));
        const b = npcs.get(String(entry?.b || ''));
        if (!a || !b || a.id === b.id) return;
        const key = relationshipKey(a.id, b.id);
        if (stated.has(key) || proposedPairs.has(key)) return;   // the author's word stands
        const label = String(entry?.label || '').trim().slice(0, 80);
        if (!label) return;                 // a bare number says nothing an author can review
        proposedPairs.add(key);
        const score = livingClamp(Number(entry?.score) || 0, -100, 100);
        const reason = String(entry?.reason || '').trim().slice(0, 240);
        findings.push({
            tier: 'society', id: `rel_${key}`, type: 'set_relationship',
            severity: Math.abs(score) >= 50 ? 'warning' : 'suggestion',
            title: `${a.name} & ${b.name}: ${label}`,
            detail: `${score > 0 ? '+' : ''}${score}${reason ? ` — ${reason}` : ''}`,
            patch: { a: a.id, b: b.id, label, score, reason }
        });
    });

    (Array.isArray(payload?.places) ? payload.places : []).forEach(entry => {
        const location = locations.get(String(entry?.id || ''));
        if (!location) return;
        if (location.danger != null && location.danger !== '') return;   // already described
        const hasDanger = Number.isFinite(Number(entry?.danger));
        const hasProsperity = Number.isFinite(Number(entry?.prosperity));
        const conditions = (Array.isArray(entry?.conditions) ? entry.conditions : [])
            .map(item => String(item || '').trim()).filter(Boolean).slice(0, 2);
        if (!hasDanger && !hasProsperity && !conditions.length) return;
        const danger = hasDanger ? livingClamp(Number(entry.danger), 0, 100) : 0;
        const prosperity = hasProsperity ? livingClamp(Number(entry.prosperity), 0, 100) : 50;
        findings.push({
            tier: 'society', id: `place_${location.id}`, type: 'set_location_state',
            severity: danger >= 60 ? 'warning' : 'suggestion',
            title: `${location.name}: danger ${danger}, prosperity ${prosperity}`,
            detail: [conditions.join(', '), String(entry?.why || '').trim()].filter(Boolean).join(' — ')
                || 'Sets how the place reads before anything happens in it.',
            patch: { locationId: location.id, danger, prosperity, conditions }
        });
    });

    // A faction is proposed by name, since the model has no id to give.
    // A calibration response sometimes echoes a canonical faction id in the
    // name field. Treat ids and names as the same identity namespace here so
    // that a reply such as "fac_mm_bi" cannot mint a second empty faction.
    const existingNames = new Set();
    (world.factions || []).forEach(faction => {
        const name = String(faction.name || '').trim().toLowerCase();
        const id = String(faction.id || '').trim().toLowerCase();
        if (name) existingNames.add(name);
        if (id) existingNames.add(id);
    });
    // Factions proposed in an earlier batch of the same run. Without these, a
    // member found in batch 6 could not be joined to a guild proposed in
    // batch 5, because nothing is applied to the world until the author says so.
    const proposedFactions = carriedFactions instanceof Map
        || (carriedFactions && typeof carriedFactions.get === 'function'
            && typeof carriedFactions.set === 'function' && typeof carriedFactions.has === 'function')
        ? carriedFactions : new Map();
    (Array.isArray(payload?.factions) ? payload.factions : []).forEach(entry => {
        const name = String(entry?.name || '').trim().slice(0, 120);
        if (!name || existingNames.has(name.toLowerCase())) return;
        if (proposedFactions.has(name.toLowerCase())) return;
        const id = livingId('faction', name);
        proposedFactions.set(name.toLowerCase(), id);
        findings.push({
            tier: 'society', id: `faction_${id}`, type: 'add_faction', severity: 'suggestion',
            title: `New faction: ${name}`,
            detail: [String(entry?.goal || '').trim(), String(entry?.why || '').trim()]
                .filter(Boolean).join(' — ') || 'An organised power the fiction implies.',
            patch: {
                id, name,
                goal: String(entry?.goal || '').trim().slice(0, 240),
                influence: livingClamp(Number(entry?.influence) ?? 50, 0, 100),
                reputation: livingClamp(Number(entry?.reputation) || 0, -100, 100)
            }
        });
    });

    (Array.isArray(payload?.memberships) ? payload.memberships : []).forEach(entry => {
        const entity = npcs.get(String(entry?.entity || ''));
        if (!entity || entity.factionId) return;
        const ref = String(entry?.faction || '').trim();
        if (!ref) return;
        // The model may name a faction that exists, or one it has just proposed.
        const existing = (world.factions || []).find(faction =>
            faction.id === ref || String(faction.name || '').trim().toLowerCase() === ref.toLowerCase());
        const factionId = existing ? existing.id : proposedFactions.get(ref.toLowerCase());
        if (!factionId) return;
        findings.push({
            tier: 'society', id: `member_${entity.id}`, type: 'set_faction_membership', severity: 'suggestion',
            title: `${entity.name} serves ${existing ? existing.name : ref}`,
            detail: String(entry?.why || '').trim()
                || 'Membership is how a faction reaches a scene through the people in it.',
            // Applying a membership before its faction exists would dangle, so
            // the apply step re-checks that the faction is actually there.
            patch: { entityId: entity.id, factionId }
        });
    });

    return findings;
}

/**
 * Run one pass over the whole world, in as many calls as the world needs.
 *
 * A large world used to fail outright: everything went in one call, the reply
 * was cut off at the token limit, and the whole thing was discarded with an
 * error blaming the model — which had in fact been emitting correct JSON right
 * up to the cut. Batches are sized so an answer fits, a batch that fails does
 * not sink the ones that worked, and whatever was learned is returned.
 */
async function runCalibrationPass(world, pass, onProgress) {
    if (!CALIBRATION_PASSES[pass]) throw new Error(`Unknown calibration pass: ${pass}`);
    const batches = calibrationBatches(world, pass);
    if (!batches.length || !buildCalibrationPrompt(world, pass, batches[0])) {
        // A pass with nothing to ask about is a finished world, not a broken
        // one — saying "unknown pass" here sent the author looking for a bug.
        throw new Error(`Nothing left for the ${CALIBRATION_PASSES[pass].label} pass to settle — this world already states everything it looks at.`);
    }

    const findings = [];
    const failures = [];
    let cutShort = 0;
    // Carried across batches so a member found late can join a power that an
    // earlier batch proposed but the author has not applied yet.
    const carriedFactions = new Map();
    for (let index = 0; index < batches.length; index++) {
        if (typeof onProgress === 'function') onProgress(index, batches.length);
        try {
            const result = await runCalibrationBatch(world, pass, batches[index], carriedFactions);
            // Two batches can land on the same proposal — most obviously a
            // faction the fiction implies to both of them. The author should
            // review it once, not once per call.
            result.findings.forEach(finding => {
                if (findings.some(seen => seen.id === finding.id)) return;
                findings.push(finding);
            });
            if (result.truncated) cutShort++;
        } catch (error) {
            failures.push(error.message);
            console.warn(`Calibration ${pass} batch ${index + 1}/${batches.length} failed:`, error);
        }
    }
    // Every batch failed: there is nothing to show and a real problem to report.
    if (!findings.length && failures.length) throw new Error(failures[0]);
    return {
        findings,
        batches: batches.length,
        failed: failures.length,
        cutShort,
        // The caller says this out loud rather than silently returning less.
        note: [
            failures.length ? `${failures.length} of ${batches.length} batches failed` : '',
            cutShort ? `${cutShort} reply(s) were cut short and only their complete entries were kept` : ''
        ].filter(Boolean).join('; ')
    };
}

async function runCalibrationBatch(world, pass, batch, carriedFactions) {
    const prompt = buildCalibrationPrompt(world, pass, batch);
    if (!prompt) return { findings: [], truncated: false };
    const model = structuredModelFor(world);

    // Mirrors the shape the Deep Audit already proves works against real
    // providers: a system role AND a user turn (a system-only conversation
    // returns nothing on many models), a budget generous enough that reasoning
    // models still have room to emit visible output, and one strict retry.
    let truncated = false;
    const callPass = async (extraNudge, useJsonMode) => {
        const messages = [
            { role: 'system', content: prompt },
            { role: 'user', content: 'Calibrate the world above. Output the JSON object and nothing else — your first character must be {. Do not think out loud, restate the task, or explain your choices; put any reasoning in the per-item "why" fields.' }
        ];
        if (extraNudge) messages.push({ role: 'user', content: extraNudge });
        const body = {
            // Room for the whole batch's answer plus any prose a model insists
            // on. Most models in the picker report a 16k-32k output ceiling, so
            // this is well inside what they will actually allow — and batching
            // is what keeps a real answer under it.
            model,
            max_tokens: 16000,
            messages
        };
        // Constrained decoding where the provider supports it — the single most
        // reliable way to stop a model narrating its way past the token limit.
        if (useJsonMode) body.response_format = { type: 'json_object' };

        const response = await fetch(apiBase() + '/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders(), ...attributionHeaders() },
            body: JSON.stringify(applyOpenRouterRouting(body, world))
        });
        if (!response.ok) {
            const errorText = (await response.json().catch(() => ({})))?.error?.message || response.statusText;
            // Not every model accepts json_object; fall back rather than fail.
            if (useJsonMode && /response_format|json_object|json mode|not support/i.test(String(errorText))) {
                console.warn('Horde Engine: model rejected JSON mode, retrying without it.');
                return callPass(extraNudge, false);
            }
            throw new Error(errorText);
        }
        const choice = (await response.json())?.choices?.[0] || {};
        const message = choice.message || {};
        if (choice.finish_reason === 'length') truncated = true;
        let text = message.content || '';
        if (Array.isArray(text)) text = text.map(part => part?.text || '').join(' ');
        // Some providers put everything in `reasoning` and leave content empty.
        if (!String(text).trim() && message.reasoning) text = String(message.reasoning);
        return String(text);
    };

    let raw = await callPass(null, true);
    let payload = parseCalibrationPayload(raw);
    if (!payload) {
        console.warn('Horde Engine: calibration reply unparseable, retrying strict. Raw reply was:\n', raw.slice(0, 2000));
        raw = await callPass('[SYSTEM: Your previous reply was prose, not JSON. Do not restate the task or reason in the open. Reply NOW with ONLY the JSON object — no commentary, no markdown fences. Your very first character must be {.]', true);
        payload = parseCalibrationPayload(raw);
    }
    if (!payload) {
        console.error('Horde Engine: calibration failed. Full raw reply:\n', raw);
        const preview = raw.replace(/\s+/g, ' ').trim().slice(0, 200);
        // Distinguish the two failures honestly. A reply that STARTED as JSON
        // and ran out of room is our fault for asking too much — telling the
        // author to change model sent them chasing something that was working.
        if (truncated && /^\s*[{[]/.test(raw)) {
            throw new Error(`The reply was cut off before a single complete entry (it began: "${preview}…"). This world needs smaller batches — please report it, because the batch size should already have prevented this.`);
        }
        if (truncated) {
            throw new Error(`The model spent its whole budget on prose and never reached the JSON${preview ? ` (it began: "${preview}…")` : ''}. Pick a non-reasoning model in the list above.`);
        }
        throw new Error(preview
            ? `The model replied but not with JSON. It said: "${preview}${raw.length > 200 ? '…' : ''}"`
            : 'The model returned an empty reply (its budget was probably consumed by hidden reasoning).');
    }
    const wasCutShort = payload.__truncated === true;
    delete payload.__truncated;
    const findings = pass === 'people' ? calibrationFindingsFromPeople(world, payload)
        : pass === 'items' ? calibrationFindingsFromItems(world, payload)
        : pass === 'locations' ? calibrationFindingsFromLocations(world, payload)
        : pass === 'relationships' ? calibrationFindingsFromRelationships(world, payload)
        : pass === 'society' ? calibrationFindingsFromSociety(world, payload, carriedFactions)
        : calibrationFindingsFromStructure(world, payload);
    return { findings, truncated: wasCutShort };
}

// parseWorldAgentPayload insists on engine state keys, which a calibration
// reply does not have — so calibration needs its own tolerant reader.
function parseCalibrationPayload(raw) {
    let text = String(raw || '').trim();
    if (!text) return null;
    // Visible chain-of-thought wrappers first: the JSON we want is after them,
    // and braces inside the thinking would otherwise capture the scan.
    text = text.replace(/<(think|thinking|reasoning|analysis)>[\s\S]*?<\/\1>/gi, ' ').trim();

    // Every key any pass can return. The Society pass answers with
    // relationships/places/factions/memberships, none of which were listed
    // here — so a complete, perfectly valid Society reply was rejected as
    // unusable and reported as a model failure. It could never have worked.
    const PAYLOAD_KEYS = ['locations', 'travel', 'people', 'items',
        'relationships', 'relationship_claims', 'places', 'factions', 'memberships'];
    const usable = value => value && typeof value === 'object' && !Array.isArray(value)
        && PAYLOAD_KEYS.some(key => Array.isArray(value[key]));
    const tryParse = candidate => {
        try {
            const parsed = JSON.parse(candidate);
            return usable(parsed) ? parsed : null;
        } catch (error) { return null; }
    };

    const tagged = text.match(/<calibration_json>\s*([\s\S]*?)\s*<\/calibration_json>/i);
    if (tagged) {
        const hit = tryParse(tagged[1]);
        if (hit) return hit;
    }
    for (const fence of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
        const hit = tryParse(fence[1]);
        if (hit) return hit;
    }
    // Scan every balanced object in the reply, string-aware, so prose with
    // braces before or after the payload cannot derail it.
    for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
        let depth = 0;
        let quote = null;
        let escaped = false;
        for (let i = start; i < text.length; i++) {
            const char = text[i];
            if (quote) {
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === quote) quote = null;
                continue;
            }
            if (char === '"') { quote = char; continue; }
            if (char === '{') depth++;
            else if (char === '}' && --depth === 0) {
                const hit = tryParse(text.slice(start, i + 1));
                if (hit) return hit;
                break;
            }
        }
    }
    // Nothing closed: the reply was cut off mid-object. Everything the model
    // finished is still good work — throwing it away and reporting a failure
    // wastes a paid call and tells the author their model is broken when it
    // was answering correctly right up to the cut.
    return salvageTruncatedPayload(text, usable);
}

/**
 * Recover the complete entries from a reply that stopped mid-flight.
 *
 * Walks the text keeping track of the last position at which every open array
 * had just finished an element, rewinds to it, and closes what is still open.
 * A partial trailing object is discarded rather than guessed at.
 */
function salvageTruncatedPayload(text, usable) {
    const start = text.indexOf('{');
    if (start < 0) return null;
    const stack = [];
    let quote = null;
    let escaped = false;
    let lastGood = -1;

    for (let i = start; i < text.length; i++) {
        const char = text[i];
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = null;
            continue;
        }
        if (char === '"') { quote = char; continue; }
        if (char === '{' || char === '[') { stack.push(char); continue; }
        if (char === '}' || char === ']') {
            stack.pop();
            // An element of an array just closed: everything up to here is
            // whole, so this is a safe place to cut.
            if (stack[stack.length - 1] === '[') lastGood = i;
            continue;
        }
        // A comma directly inside an array also marks a clean boundary.
        if (char === ',' && stack[stack.length - 1] === '[') lastGood = i - 1;
    }
    if (lastGood < 0) return null;

    // Rebuild the closers for whatever was still open at the cut.
    const head = text.slice(start, lastGood + 1);
    const open = [];
    let q = null, esc = false;
    for (let i = 0; i < head.length; i++) {
        const char = head[i];
        if (q) {
            if (esc) esc = false;
            else if (char === '\\') esc = true;
            else if (char === q) q = null;
            continue;
        }
        if (char === '"') { q = char; continue; }
        if (char === '{' || char === '[') open.push(char);
        else if (char === '}' || char === ']') open.pop();
    }
    const closed = head + open.reverse().map(char => (char === '[' ? ']' : '}')).join('');
    try {
        const parsed = JSON.parse(closed);
        if (!usable(parsed)) return null;
        parsed.__truncated = true;   // so the caller can say so honestly
        return parsed;
    } catch (error) {
        return null;
    }
}

// A pass costs an API call, so its proposals must outlive a re-render of the
// audit panel. Applying one finding used to rebuild the panel and destroy the
// rest of the list, forcing another paid run to get them back.
let calibrationPassState = null;   // { worldId, findings, applied:Set<number>, dismissed:Set<number> }
let worldMigrationPreviewState = null; // { worldId, sourceVersion, result }

function downloadLegacyWorldBackup(world) {
    if (!world) return;
    const backup = safeJsonClone(world);
    backup._format = 'horde-world';
    backup._version = 2;
    backup._migrationBackup = {
        createdAt: new Date().toISOString(),
        schemaVersion: worldSchemaVersion(world),
        targetSchemaVersion: WORLD_SCHEMA_VERSION
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${String(world.name || 'world').replace(/[^a-z0-9_-]+/gi, '_')}_pre_upgrade.horde_world`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('Pre-upgrade world backup downloaded.', 'success');
}

function normalizeMigratedWorldInstance(world, instance) {
    if (!isPlainObject(instance)) return instance;
    const canonical = value => getLocationRef(world, value)?.id || value;
    (Array.isArray(instance.sessions) ? instance.sessions : []).forEach(session => {
        if (!isPlainObject(session)) return;
        session.playerLocation = canonical(session.playerLocation);
        (Array.isArray(session.scheduledEvents) ? session.scheduledEvents : []).forEach(event => {
            if (event?.locationId) event.locationId = canonical(event.locationId);
        });
        Object.values(isPlainObject(session.npcScheduleOverrides) ? session.npcScheduleOverrides : {}).forEach(override => {
            if (override?.locationId) override.locationId = canonical(override.locationId);
        });
        if (isPlainObject(session.locationStates)) {
            const canonicalStates = {};
            Object.entries(session.locationStates).forEach(([key, value]) => {
                canonicalStates[canonical(key)] = value;
            });
            session.locationStates = canonicalStates;
        }
        window.HordeSidecarHooks?.normalizeWorldTimeline(world, session);
    });
    return instance;
}

function worldMigrationPreview(world) {
    if (!world) return null;
    if (worldMigrationPreviewState?.worldId === world.id
        && worldMigrationPreviewState?.sourceVersion === worldSchemaVersion(world)) {
        return worldMigrationPreviewState.result;
    }
    try {
        const result = upgradeWorldSchemaData(world, { source: 'world-audit-preview' });
        worldMigrationPreviewState = { worldId: world.id, sourceVersion: worldSchemaVersion(world), result };
        return result;
    } catch (error) {
        return { error };
    }
}

function renderWorldMigrationSection(world) {
    const version = worldSchemaVersion(world);
    const current = version >= WORLD_SCHEMA_VERSION;
    const history = Array.isArray(world.migrationHistory) ? world.migrationHistory.at(-1) : null;
    if (current) {
        return `<div class="world-migration-card current">
            <div class="world-migration-icon">✓</div>
            <div><span class="vh-eyebrow">WORLD SCHEMA ${WORLD_SCHEMA_VERSION}</span><h3>Current world format</h3>
            <p>${escapeHTML(WORLD_SCHEMA_LABEL)}${history?.migratedAt ? ` · upgraded ${escapeHTML(new Date(history.migratedAt).toLocaleDateString())}` : ''}</p></div>
        </div>`;
    }
    const result = worldMigrationPreview(world);
    if (result?.error) {
        return `<div class="world-migration-card blocked"><div class="world-migration-icon">!</div><div>
            <span class="vh-eyebrow">LEGACY WORLD</span><h3>Upgrade preview could not be built</h3>
            <p>${escapeHTML(result.error.message || 'This world contains invalid legacy data.')}</p></div></div>`;
    }
    const changed = (result?.changes || []).reduce((sum, item) => sum + Math.max(1, Number(item.count) || 1), 0);
    return `<section class="world-migration-card legacy" aria-labelledby="world-migration-title">
        <div class="world-migration-icon">↥</div>
        <div class="world-migration-content">
            <span class="vh-eyebrow">LEGACY WORLD · SCHEMA ${version || 'UNVERSIONED'}</span>
            <h3 id="world-migration-title">Upgrade to the new world directory</h3>
            <p>A transactional migration creates canonical regions, rooms, travel links, People, Items and Groups. Ambiguous geography is reported, never guessed.</p>
            <div class="world-migration-summary">
                ${(result?.changes || []).length ? result.changes.map(item => `<span><b>${item.count || 1}</b> ${escapeHTML(item.area)}<small>${escapeHTML(item.detail)}</small></span>`).join('') : '<span><b>0</b> structural rewrites<small>The schema receipt and validation gate will still be added.</small></span>'}
            </div>
            ${(result?.warnings || []).length ? `<details class="world-migration-warnings"><summary>${result.warnings.length} decision${result.warnings.length === 1 ? '' : 's'} still need your review</summary>${result.warnings.map(item => `<p><b>${escapeHTML(item.area)}:</b> ${escapeHTML(item.detail)}</p>`).join('')}</details>` : ''}
            <div class="world-migration-actions">
                <button id="world-migration-backup-btn" class="btn btn-ghost" type="button">Download original</button>
                <button id="world-migration-apply-btn" class="btn btn-primary" type="button">Upgrade &amp; save${changed ? ` · ${changed} changes` : ''}</button>
            </div>
            <p class="form-hint">The new world is validated before it replaces anything. If validation or saving fails, Horde Studio restores the original automatically.</p>
        </div>
    </section>`;
}

function wireWorldMigrationControls(world) {
    const backupButton = document.getElementById('world-migration-backup-btn');
    if (backupButton) backupButton.onclick = () => downloadLegacyWorldBackup(world);
    const applyButton = document.getElementById('world-migration-apply-btn');
    if (!applyButton) return;
    applyButton.onclick = async () => {
        const result = worldMigrationPreview(world);
        if (!result || result.error) return showToast(result?.error?.message || 'Upgrade preview failed.', 'error');
        if (!confirm(`Upgrade “${world.name || 'this world'}” to schema ${WORLD_SCHEMA_VERSION}? Downloading the original first is recommended.`)) return;
        applyButton.disabled = true;
        applyButton.textContent = 'Upgrading…';
        const worldIndex = state.worlds.findIndex(entry => entry.id === world.id);
        const previousStored = worldIndex >= 0 ? safeJsonClone(state.worlds[worldIndex]) : null;
        const previousDraft = safeJsonClone(state.editingWorld);
        const previousInstance = state.worldInstances?.[world.id] ? safeJsonClone(state.worldInstances[world.id]) : null;
        const previousWorldMediaDirty = worldMediaDirty;
        try {
            const migrated = safeJsonClone(result.world);
            validateWorldData(migrated, 'Migrated world');
            state.editingWorld = migrated;
            if (worldIndex >= 0) state.worlds[worldIndex] = safeJsonClone(migrated);
            else state.worlds.push(safeJsonClone(migrated));
            if (state.worldInstances?.[world.id]) normalizeMigratedWorldInstance(migrated, state.worldInstances[world.id]);
            worldMigrationPreviewState = null;
            worldMediaDirty = true;
            await saveState();
            renderWorldStudio();
            renderWorldAudit();
            showToast(`World upgraded safely to schema ${WORLD_SCHEMA_VERSION}.`, 'success');
        } catch (error) {
            console.error('World migration rolled back:', error);
            state.editingWorld = previousDraft;
            if (worldIndex >= 0 && previousStored) state.worlds[worldIndex] = previousStored;
            else state.worlds = state.worlds.filter(entry => entry.id !== world.id);
            if (previousInstance) state.worldInstances[world.id] = previousInstance;
            else if (state.worldInstances) delete state.worldInstances[world.id];
            worldMediaDirty = previousWorldMediaDirty;
            worldMigrationPreviewState = null;
            // saveState writes several IndexedDB records. If an unexpected
            // storage error happened after one write, persist the restored
            // snapshot as a best-effort compensating transaction so a reload
            // cannot expose a half-applied migration.
            try { await saveState(); }
            catch (rollbackError) { console.error('World migration rollback could not be persisted:', rollbackError); }
            renderWorldStudio();
            renderWorldAudit();
            showToast(`Upgrade rolled back: ${error.message || 'validation failed'}`, 'error');
        }
    };
}

// Handlers are attached here rather than inline, because the page's CSP blocks
// inline event attributes outright.
function wireCalibrationControls(world, calibration, container) {
    if (!container) return;

    // The structured-model choice is a tooling preference, not world content,
    // so it saves immediately rather than waiting on Save World.
    const picker = container.querySelector('#structured-model-picker');
    const custom = container.querySelector('#structured-model-custom');
    if (picker && custom) {
        const commit = async (value) => {
            state.globalSettings.structuredModel = String(value || '').trim().slice(0, 200);
            try { await saveState(); } catch (error) { console.error('Could not save model choice', error); }
            showToast(state.globalSettings.structuredModel
                ? `Audits will use ${state.globalSettings.structuredModel}`
                : "Audits will use this world's own model", 'info');
        };
        picker.onchange = () => { custom.value = picker.value; commit(picker.value); };
        custom.onchange = () => {
            const value = custom.value.trim();
            picker.value = [...picker.options].some(option => option.value === value) ? value : '';
            commit(value);
        };

        // Populated from the live catalog rather than a list written by hand,
        // which is how a retired model id ended up being offered as a
        // suggestion and failed with "No endpoints found".
        const status = container.querySelector('#structured-model-status');
        const refresh = container.querySelector('#structured-model-refresh');
        const fallbackLabel = world.model || state.globalSettings.defaultModel || 'unset';
        const populate = async (force) => {
            if (force) { openRouterModels = []; modelCatalogSource = null; }
            if (status) status.textContent = 'Checking which models can do this…';
            let ranked = [];
            try {
                ranked = rankStructuredModels(await getOpenRouterModels());
            } catch (error) {
                console.error('Could not read the model catalog', error);
            }
            const chosen = String(state.globalSettings.structuredModel || '').trim();
            picker.innerHTML =
                `<option value="">Use this world's model (${escapeHTML(fallbackLabel)})</option>`
                + ranked.map(model =>
                    `<option value="${escapeHTML(model.id)}" ${chosen === model.id ? 'selected' : ''}>${escapeHTML(model.id)} — ${escapeHTML(model.note)}</option>`).join('')
                // A model the author typed, or picked before the catalog moved,
                // stays selectable rather than silently resetting to blank.
                + (chosen && !ranked.some(model => model.id === chosen)
                    ? `<option value="${escapeHTML(chosen)}" selected>${escapeHTML(chosen)} (typed)</option>` : '');
            if (!status) return;
            status.textContent = ranked.length
                ? `${ranked.length} models offered, cheapest first — live from ${isLocalProvider() ? 'your local server' : cloudProviderName()}, so nothing here is a stale id.`
                : `Could not reach the ${isLocalProvider() ? 'local' : cloudProviderName()} catalog. Type a model id above, or press Refresh once you are online.`;
        };
        if (refresh) refresh.onclick = () => populate(true);
        populate(false);
    }
    // The Studio edits a draft copy of the world; every other repair in this
    // panel writes to that draft and leaves persistence to Save World. Doing
    // anything else here would either be lost or would bypass the author's
    // chance to undo by simply not saving.
    const persist = (appliedCount, label) => {
        if (!appliedCount) {
            showToast('Nothing changed — that repair was already in place.', 'info');
            return;
        }
        showToast(`${label} — remember to Save World.`, 'success');
        renderWorldAudit();          // recompute: applied findings should vanish
        renderWorldStudio();         // exits and settings may have changed
    };

    const applyAll = container.querySelector('#calibrate-apply-all-btn');
    if (applyAll) {
        applyAll.onclick = () => {
            const applied = calibration.reduce((count, finding) =>
                count + (applyCalibrationFinding(world, finding) ? 1 : 0), 0);
            persist(applied, `Calibrated: ${applied} repair${applied === 1 ? '' : 's'} applied.`);
        };
    }

    container.querySelectorAll('.calibrate-one-btn').forEach(button => {
        button.onclick = () => {
            const finding = calibration[Number(button.dataset.index)];
            if (!finding) return;
            persist(applyCalibrationFinding(world, finding) ? 1 : 0, `Applied: ${finding.title}`);
        };
    });

    const passResults = container.querySelector('#calibrate-pass-results');
    if (!passResults) return;

    // Restore the proposals from the last run, so re-rendering the panel (which
    // happens on every apply) never costs the author another call.
    if (calibrationPassState && calibrationPassState.worldId === world.id) {
        renderCalibrationPassFindings(world, passResults);
    }

    container.querySelectorAll('.calibrate-pass-run').forEach(passButton => {
        const pass = passButton.dataset.pass;
        passButton.onclick = async () => {
            if (!hasApiCredentials()) return showToast('API Key missing (Settings).', 'error');
            container.querySelectorAll('.calibrate-pass-run').forEach(other => { other.disabled = true; });
            passButton.textContent = '⏳ Working...';
            passResults.innerHTML = `<div style="color:var(--text-3); font-size:0.85rem;">Reading the world for the ${escapeHTML(CALIBRATION_PASSES[pass]?.label || pass)} pass...</div>`;
            try {
                // A big world takes several calls, so say which one is running
                // rather than leaving the author watching a frozen spinner.
                const result = await runCalibrationPass(world, pass, (done, total) => {
                    passResults.innerHTML = `<div style="color:var(--text-3); font-size:0.85rem;">Reading the world for the ${escapeHTML(CALIBRATION_PASSES[pass]?.label || pass)} pass — batch ${done + 1} of ${total}...</div>`;
                });
                calibrationPassState = {
                    worldId: world.id, pass, findings: result.findings,
                    applied: new Set(), dismissed: new Set(), note: result.note
                };
                renderCalibrationPassFindings(world, passResults);
            } catch (error) {
                console.error('Calibration pass failed', error);
                calibrationPassState = null;
                passResults.innerHTML = `<div style="color:var(--red); font-size:0.85rem;">${escapeHTML(error.message || 'The pass failed.')} Nothing was changed — you can run it again.</div>`;
            } finally {
                container.querySelectorAll('.calibrate-pass-run').forEach(other => { other.disabled = false; });
                passButton.textContent = 'Run';
            }
        };
    });
}

function renderCalibrationPassFindings(world, host) {
    const state = calibrationPassState;
    if (!host || !state || state.worldId !== world.id) return;
    const findings = Array.isArray(state.findings) ? state.findings : [];
    const applied = state.applied instanceof Set ? state.applied : (state.applied = new Set());
    const dismissed = state.dismissed instanceof Set ? state.dismissed : (state.dismissed = new Set());
    if (!findings.length) {
        host.innerHTML = `<div style="color:var(--text-3); font-size:0.85rem;">Nothing to add — this world already says everything the ${escapeHTML(String(CALIBRATION_PASSES[state.pass]?.label || state.pass).toLowerCase())} pass looks for.</div>`;
        return;
    }
    const sevStyle = { critical: 'var(--red)', warning: 'var(--warning, #F4A261)', suggestion: 'var(--text-3)' };
    const remainingIndexes = findings.map((_, index) => index)
        .filter(index => !applied.has(index) && !dismissed.has(index));
    const remaining = remainingIndexes.length;
    host.innerHTML = `
        <div class="calibration-proposal-head">
            <strong>${escapeHTML(CALIBRATION_PASSES[state.pass]?.label || '')} — ${remaining} open · ${applied.size} applied · ${dismissed.size} dismissed${state.note ? ` · ${escapeHTML(state.note)}` : ''}</strong>
            <div class="calibration-proposal-actions">
                ${remaining ? `<button id="calibrate-pass-apply-all" class="btn btn-primary">Apply remaining</button>
                    <button id="calibrate-pass-dismiss-all" class="btn btn-ghost">Dismiss remaining</button>` : ''}
                <button id="calibrate-pass-clear" class="btn btn-ghost">Clear proposals</button>
            </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px;">
            ${remainingIndexes.length ? remainingIndexes.map(index => {
                const finding = findings[index];
                return `<div class="calibration-proposal" style="border-left-color:${sevStyle[finding.severity] || 'var(--text-3)'};">
                    <div style="flex:1;">
                        <div style="font-weight:bold;">${escapeHTML(finding.title)}</div>
                        <div style="color:var(--text-3); margin-top:2px;">${escapeHTML(finding.detail)}</div>
                    </div>
                    <div class="calibration-proposal-actions">
                        <button class="btn btn-ghost calibrate-pass-dismiss" data-index="${index}">Dismiss</button>
                        <button class="btn btn-primary calibrate-pass-one" data-index="${index}">Apply</button>
                    </div>
                </div>`;
            }).join('') : '<div class="form-hint">No open proposals. Clear this result or run another pass.</div>'}
        </div>`;

    // Re-render the panel so Tier 0 reflects the change, then put these
    // proposals straight back — they are paid for and must not vanish.
    const afterApply = (count) => {
        showToast(count
            ? `Applied ${count} change${count === 1 ? '' : 's'} — remember to Save World.`
            : 'That proposal was already represented, so it was closed without changing the world.', count ? 'success' : 'info');
        renderWorldAudit();
        renderWorldStudio();
    };

    const applyAll = host.querySelector('#calibrate-pass-apply-all');
    if (applyAll) {
        applyAll.onclick = () => {
            let count = 0;
            remainingIndexes.forEach(index => {
                const finding = findings[index];
                if (applyCalibrationFinding(world, finding)) count++;
                applied.add(index);   // mark either way: it is no longer outstanding
            });
            afterApply(count);
        };
    }
    host.querySelectorAll('.calibrate-pass-one').forEach(button => {
        button.onclick = () => {
            const index = Number(button.dataset.index);
            const changed = applyCalibrationFinding(world, findings[index]) ? 1 : 0;
            applied.add(index);
            afterApply(changed);
        };
    });
    host.querySelectorAll('.calibrate-pass-dismiss').forEach(button => {
        button.onclick = () => {
            dismissed.add(Number(button.dataset.index));
            renderCalibrationPassFindings(world, host);
        };
    });
    const dismissAll = host.querySelector('#calibrate-pass-dismiss-all');
    if (dismissAll) dismissAll.onclick = () => {
        remainingIndexes.forEach(index => dismissed.add(index));
        renderCalibrationPassFindings(world, host);
        showToast(`Dismissed ${remainingIndexes.length} proposal${remainingIndexes.length === 1 ? '' : 's'}.`, 'info');
    };
    const clear = host.querySelector('#calibrate-pass-clear');
    if (clear) clear.onclick = () => {
        calibrationPassState = null;
        host.innerHTML = '<div class="form-hint">Proposals cleared. Run a pass whenever you want a fresh set.</div>';
    };
}

function simulateWorldAutonomyHealth(world, days = 7) {
    const horizon = Math.max(1, Math.min(30, parseInt(days) || 7));
    const findings = [];
    const npcIds = new Set((world.entities || []).filter(entity => entity.type === 'npc').map(entity => entity.id));
    const locationIds = new Set((world.locations || []).map(location => location.id));
    let evaluatedMoves = 0;
    let impossibleMoves = 0;
    let repeatedBeats = 0;
    let missingKnowledge = 0;
    let eventCollisions = 0;

    (world.entities || []).filter(entity => entity.type === 'npc').forEach(npc => {
        const schedule = (Array.isArray(npc.schedule) ? npc.schedule : [])
            .map(block => ({ ...block, locationId: getLocationRef(world, block.locationId || block.location)?.id || '' }))
            .filter(block => block.locationId).sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
        for (let day = 0; day < horizon; day++) {
            for (let index = 1; index < schedule.length; index++) {
                evaluatedMoves++;
                const from = schedule[index - 1];
                const to = schedule[index];
                if (from.locationId === to.locationId) continue;
                const path = findWorldTravelPath(world, from.locationId, to.locationId);
                if (!path?.length) impossibleMoves++;
            }
        }
        const beats = (npc.goalSteps || []).map(step => String(step || '').trim().toLowerCase()).filter(Boolean);
        repeatedBeats += beats.length - new Set(beats).size;
        if (!(npc.persona || npc.description)) missingKnowledge++;
    });

    const scheduled = (world.scheduledEvents || []).map(event => `${event.dueTurn ?? ''}|${event.dueMinute ?? ''}|${event.locationId || ''}|${event.title || ''}`);
    eventCollisions = scheduled.length - new Set(scheduled).size;
    if (impossibleMoves) findings.push({ severity: 'critical', text: `${impossibleMoves} of ${evaluatedMoves} simulated schedule transitions have no travel path.` });
    if (repeatedBeats) findings.push({ severity: 'warning', text: `${repeatedBeats} repeated NPC agenda beats may create echoing off-screen updates.` });
    if (missingKnowledge) findings.push({ severity: 'warning', text: `${missingKnowledge} NPCs lack enough authored identity for stable behavior.` });
    if (eventCollisions) findings.push({ severity: 'warning', text: `${eventCollisions} scheduled events are exact duplicates.` });
    const directory = worldDirectoryHealth(world);
    directory.issues.slice(0, 8).forEach(issue => findings.push({
        severity: issue.area === 'Travel' || issue.area === 'Hierarchy' ? 'critical' : 'warning',
        text: `${issue.count} ${issue.area.toLowerCase()} record(s) ${issue.detail}.`
    }));
    const score = Math.max(0, Math.min(100, 100
        - impossibleMoves * 8 - repeatedBeats * 3 - missingKnowledge * 2 - eventCollisions * 4
        - Math.max(0, 100 - directory.score) * 0.35));
    return {
        days: horizon,
        score: Math.round(score),
        findings,
        stats: {
            npcs: npcIds.size,
            locations: locationIds.size,
            scheduleTransitions: evaluatedMoves,
            providerCalls: 0,
            impossibleMoves
        }
    };
}

function renderWorldAutonomyHealthResult(world, host) {
    const report = simulateWorldAutonomyHealth(world, 7);
    host.innerHTML = `<div class="world-health-card" style="margin-top:12px;">
        <div class="world-health-score"><strong>${report.score}</strong><span>/100</span></div>
        <div><h3>7-day autonomy forecast</h3>
        <p>${report.stats.npcs} people · ${report.stats.locations} places · ${report.stats.scheduleTransitions} schedule transitions · ${report.stats.providerCalls} model calls</p>
        ${report.findings.length ? `<div class="world-health-gaps">${report.findings.map(item =>
            `<span><b>${item.severity === 'critical' ? '!' : '•'}</b> ${escapeHTML(item.text)}</span>`).join('')}</div>`
            : '<p class="world-health-complete">No spam loops, impossible travel, duplicate events or major directory gaps were detected.</p>'}
        <p class="form-hint">This is a deterministic dry run. It never edits the world, spends credits or calls a model.</p></div>
    </div>`;
}

function renderWorldAudit() {
    const world = state.editingWorld;
    const container = document.getElementById('audit-results-container');
    if (!world || !container) return;

    const report = validateWorldReferences(world);
    const lint = buildWorldLintReport(world);
    const directoryHealth = worldDirectoryHealth(world);

    const sevStyle = { critical: 'var(--red)', warning: 'var(--warning, #F4A261)', suggestion: 'var(--text-3)' };
    const lintHtml = lint.length ? `
        <div style="margin:20px 0 10px;"><h3>Structural Lint (${lint.length})</h3></div>
        <div style="display:flex; flex-direction:column; gap:8px;">
            ${lint.map(f => `
                <div style="background:var(--surface2); padding:10px 12px; border-radius:8px; border-left:4px solid ${sevStyle[f.sev]}; font-size:0.82rem;">
                    <span class="mini-tag" style="margin-right:8px;">${escapeHTML(f.area)}</span>${escapeHTML(f.msg)}
                </div>`).join('')}
        </div>` : '';

    // One model for every structured pass. Narration and JSON want opposite
    // models, and picking the wrong one here is what made calibration, the
    // chronicle classifier and the world turn all fail the same way.
    const activeStructured = String(state.globalSettings.structuredModel || '').trim();
    const structuredSection = `
        <div style="background:var(--surface2); padding:12px 14px; border-radius:10px; margin-bottom:18px; border:1px solid var(--border);">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                <label class="form-label" style="margin:0;">🧮 Model for audits &amp; calibration</label>
                <button id="structured-model-refresh" class="btn btn-ghost" style="font-size:0.68rem; padding:3px 9px; white-space:nowrap;">↻ Refresh list</button>
            </div>
            <p class="form-hint" style="margin:4px 0 8px;">Used by the Deep Audit, every calibration pass, the chronicle classifier and the World Agent — but never for narration. The list is pulled live from your selected provider and shows only models that report being able to return JSON and are not reasoning models — those spend their whole budget thinking and return nothing usable. Cheapest first. Leave blank to use this world's own model.</p>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <select id="structured-model-picker" class="form-select" style="flex:1; min-width:200px;">
                    <option value="">Loading provider models…</option>
                </select>
                <input type="text" id="structured-model-custom" class="form-input" style="flex:1; min-width:200px;"
                       placeholder="…or type any OpenRouter model id" value="${escapeHTML(activeStructured)}">
            </div>
            <div class="form-hint" id="structured-model-status" style="margin-top:6px;">Checking which models can do this…</div>
        </div>`;

    // Calibration: everything the engine can repair on its own, with no API
    // call. Shown before the AI audit because it costs nothing and fixes the
    // faults that stop a world working at all.
    const calibration = calibrateStructuralFindings(world, getAllPresets().find(p => p.id === world.activePresetId));
    const directlyFixableTypes = new Set(['set_start_location', 'raise_context_size', 'add_reciprocal_exit', 'set_map_type', 'set_containment', 'set_floor', 'connect_location']);
    const fixable = calibration.filter(f => directlyFixableTypes.has(f.type));
    const directoryHealthHtml = `${renderWorldMigrationSection(world)}<div class="world-health-card">
        <div class="world-health-score"><strong>${directoryHealth.score}</strong><span>/100</span></div>
        <div><h3>Directory readiness</h3><p>${directoryHealth.counts.locations} locations · ${directoryHealth.counts.people} people · ${directoryHealth.counts.items} items · ${directoryHealth.counts.groups} groups</p>
        ${directoryHealth.issues.length ? `<div class="world-health-gaps">${directoryHealth.issues.map(issue => `<span><b>${issue.count}</b> ${escapeHTML(issue.area)} · ${escapeHTML(issue.detail)}</span>`).join('')}</div>` : '<p class="world-health-complete">Every new-format directory field is represented.</p>'}</div>
    </div>`;
    const calibrationSection = `
        <div style="margin-top:24px; padding-top:16px; border-top:1px solid var(--border);">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                <div>
                    <h3 style="margin:0;">🎛️ Calibrate World</h3>
                    <p class="form-hint" style="margin:4px 0 0;">No API call. Repairs deterministic engine facts and reports new-directory gaps across locations, people, groups and items. Nothing changes until you apply it.</p>
                </div>
                ${fixable.length ? `<button id="calibrate-apply-all-btn" class="btn btn-primary" style="white-space:nowrap;">Apply ${fixable.length} fix${fixable.length === 1 ? '' : 'es'}</button>` : ''}
            </div>
            ${calibration.length ? `
                <details class="world-audit-findings" ${calibration.length <= 8 ? 'open' : ''}>
                    <summary>Review ${calibration.length} deterministic finding${calibration.length === 1 ? '' : 's'}</summary>
                <div style="display:flex; flex-direction:column; gap:8px; margin-top:12px; max-height:min(52vh,620px); overflow:auto; padding-right:4px;">
                    ${calibration.map((f, index) => `
                        <div style="background:var(--surface2); padding:10px 12px; border-radius:8px; border-left:4px solid ${sevStyle[f.severity] || 'var(--text-3)'}; font-size:0.82rem; display:flex; gap:10px; align-items:flex-start;">
                            <div style="flex:1;">
                                <div style="font-weight:bold;">${escapeHTML(f.title)}</div>
                                <div style="color:var(--text-3); margin-top:2px;">${escapeHTML(f.detail)}</div>
                            </div>
                            ${directlyFixableTypes.has(f.type)
                                ? `<button class="btn btn-ghost calibrate-one-btn" data-index="${index}" style="font-size:0.7rem; padding:4px 8px; white-space:nowrap;">Apply</button>`
                                : `<span class="mini-tag" style="white-space:nowrap;">needs your call</span>`}
                        </div>`).join('')}
                </div></details>`
            : `<div style="margin-top:12px; color:var(--text-3); font-size:0.85rem;">Nothing to repair — this world's structure is already sound.</div>`}

            <div style="margin-top:18px; padding-top:14px; border-top:1px dashed var(--border);">
                ${Object.entries(CALIBRATION_PASSES).map(([key, pass]) => `
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px;">
                        <div>
                            <strong style="font-size:0.9rem;">✨ ${escapeHTML(pass.label)} pass <span class="mini-tag">batched</span></strong>
                            <p class="form-hint" style="margin:4px 0 0;">${escapeHTML(pass.blurb)} Fills only what this world has not already said, and proposes everything for review first.</p>
                        </div>
                        <button class="btn btn-ghost calibrate-pass-run" data-pass="${escapeHTML(key)}" style="white-space:nowrap;">Run</button>
                    </div>`).join('')}
                <div id="calibrate-pass-results" style="margin-top:12px;"></div>
            </div>
        </div>`;

    const autonomySection = `
        <div style="margin-top:24px; padding-top:16px; border-top:1px solid var(--border);">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                <div><h3 style="margin:0;">🫀 Autonomy Health</h3>
                <p class="form-hint" style="margin:4px 0 0;">Fast-forward seven days without changing canon. Checks schedule travel, repetition, identity gaps, event collisions and directory integrity.</p></div>
                <button id="run-autonomy-health-btn" class="btn btn-ghost" style="white-space:nowrap;">Simulate 7 days</button>
            </div>
            <div id="autonomy-health-results"></div>
        </div>`;

    const aiSection = `
        <div style="margin-top:24px; padding-top:16px; border-top:1px solid var(--border);">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                <div>
                    <h3 style="margin:0;">🤖 AI Deep Audit</h3>
                    <p class="form-hint" style="margin:4px 0 0;">A QA agent reads the complete world directory for semantic problems the lint can't see: geography, containment, travel, people, starting lives, lore and contradictions. Large worlds are safely audited in indexed batches. Each finding is proposed for review—nothing changes without your click.</p>
                </div>
                <button id="run-ai-audit-btn" class="btn btn-primary" style="white-space:nowrap;">✨ Run</button>
            </div>
            <div id="ai-audit-results" style="margin-top:14px;"></div>
        </div>`;

    if (report.broken.length === 0 && lint.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:20px;">
                <div style="font-size:3rem; margin-bottom:15px;">✅</div>
                <h3>Structure is Healthy</h3>
                <p style="color:var(--text-3);">All references linked, every room reachable, every secret complete.</p>
            </div>${directoryHealthHtml}${structuredSection}${calibrationSection}${autonomySection}${aiSection}`;
        const btn = document.getElementById('run-ai-audit-btn');
        if (btn) btn.onclick = runAIWorldAudit;
        wireWorldMigrationControls(world);
        wireCalibrationControls(world, calibration, container);
        document.getElementById('run-autonomy-health-btn')?.addEventListener('click', () =>
            renderWorldAutonomyHealthResult(world, document.getElementById('autonomy-health-results')));
        return;
    }

    container.innerHTML = `
        ${directoryHealthHtml}
        ${structuredSection}
        ${report.broken.length > 0 ? `
        <div style="margin-bottom:20px;">
            <h3 style="color:var(--red);">Broken References Found (${report.broken.length})</h3>
            <p class="form-hint">These are items that point to locations that don't exist (possibly due to typos or deletions).</p>
        </div>` : ''}
        <div style="display:flex; flex-direction:column; gap:12px;">
            ${report.broken.map(item => {
                const suggestion = report.suggestions[item.ref];
                return `
                    <div style="background:var(--surface2); padding:12px; border-radius:8px; border-left:4px solid var(--red);">
                        <div style="font-size:0.75rem; color:var(--text-3); text-transform:uppercase; font-weight:bold;">${escapeHTML(item.source)}</div>
                        <div style="margin:8px 0; font-family:monospace; background:rgba(255,0,0,0.1); padding:4px 8px; border-radius:4px;">
                            Invalid Reference: "${escapeHTML(item.ref)}"
                        </div>
                        ${suggestion ? `
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
                                <div style="font-size:0.8rem;">Suggest fixing to: <span style="color:var(--accent); font-weight:bold;">${escapeHTML(suggestion)}</span></div>
                                <button class="btn btn-ghost fix-ref-btn" data-old="${escapeHTML(item.ref)}" data-new="${escapeHTML(suggestion)}" style="font-size:0.7rem; padding:4px 8px;">Apply Fix</button>
                            </div>
                        ` : '<div style="font-size:0.8rem; color:var(--text-3);">No matching location found. Please fix manually.</div>'}
                    </div>
                `;
            }).join('')}
        </div>
        ${lintHtml}
        ${calibrationSection}
        ${autonomySection}
        ${aiSection}
    `;

    const aiBtn = document.getElementById('run-ai-audit-btn');
    if (aiBtn) aiBtn.onclick = runAIWorldAudit;
    wireWorldMigrationControls(world);
    wireCalibrationControls(world, calibration, container);
    document.getElementById('run-autonomy-health-btn')?.addEventListener('click', () =>
        renderWorldAutonomyHealthResult(world, document.getElementById('autonomy-health-results')));

    container.querySelectorAll('.fix-ref-btn').forEach(btn => {
        btn.onclick = () => {
            const oldRef = btn.dataset.old;
            const newRef = btn.dataset.new;
            
            // Apply fix globally
            world.entities.forEach(ent => {
                if (ent.startLocation === oldRef) ent.startLocation = newRef;
                if (ent.homeLocation === oldRef) ent.homeLocation = newRef;
                (ent.schedule || []).forEach(s => {
                    if (s.locationId === oldRef) s.locationId = newRef;
                });
            });
            world.locations.forEach(loc => {
                loc.exits = (loc.exits || []).map(ex => {
                    if (typeof ex === 'string') {
                        return ex.replace(new RegExp(oldRef, 'gi'), newRef);
                    } else if (ex.text) {
                        ex.text = ex.text.replace(new RegExp(oldRef, 'gi'), newRef);
                    }
                    return ex;
                });
            });

            showToast('Reference repaired!', 'success');
            renderWorldAudit();
            renderWorldStudio(); // Refresh studio to show valid states
        };
    });
}

/**
 * 🤖 AI DEEP AUDIT — a QA agent that reads the whole world for semantic
 * problems the deterministic lint can't see. Every finding renders as a card;
 * fixes only apply on explicit click, and only to whitelisted fields.
 */
const AI_AUDIT_FIELD_WHITELIST = {
    region: ['name', 'description'],
    location: ['name', 'description', 'hiddenDescription', 'region', 'regionId', 'parentLocationId', 'mapType', 'mapFloor'],
    entity: ['name', 'description', 'persona', 'homeLocation', 'startLocation', 'goal'],
    group: ['name', 'description', 'homeLocationId'],
    lore: ['keyword', 'text'],
    world: ['description', 'dmPrompt', 'authorNote', 'intro'],
    secret: ['label', 'hint', 'truth']
};

function serializeWorldForAudit(world) {
    const clip = (s, n = 2400) => (s || '').slice(0, n);
    return JSON.stringify({
        name: world.name,
        description: clip(world.description, 6000),
        dmPrompt: clip(world.dmPrompt, 12000),
        authorNote: clip(world.authorNote, 6000),
        intro: clip(world.intro, 6000),
        startLocationId: world.startLocationId,
        regions: (world.regions || []).map(region => ({
            id: region.id, name: region.name, description: clip(region.description), tags: region.tags || []
        })),
        locations: (world.locations || []).map(l => ({
            id: l.id, name: l.name, regionId: l.regionId, region: l.region,
            mapType: l.mapType, parentLocationId: l.parentLocationId, floor: l.mapFloor, tags: l.tags || [],
            description: clip(l.description), hiddenDescription: clip(l.hiddenDescription),
            exits: (l.exits || []).map(ex => typeof ex === 'string' ? { text: ex } : ({
                text: ex.text, targetLocationId: ex.targetLocationId,
                transport: ex.mode, minutes: ex.travelTime, route: ex.routeName,
                cost: ex.cost, oneWay: ex.isOneWay === true
            })),
            secrets: (l.secrets || []).map(s => ({ label: s.label, hint: clip(s.hint, 200), truth: clip(s.truth, 200) }))
        })),
        entities: (world.entities || []).map(e => ({
            id: e.id, name: e.name, type: e.type, simulationDepth: e.simulationDepth,
            description: clip(e.description), persona: clip(e.persona, 6000), tags: e.tags || [],
            homeLocation: e.homeLocation, startLocation: e.startLocation,
            groupIds: e.groupIds || [], goal: clip(e.goal), schedule: e.schedule || [],
            secrets: (e.secrets || []).map(s => ({ label: s.label, hint: clip(s.hint, 200), truth: clip(s.truth, 200) }))
        })),
        groups: (world.groups || []).map(group => ({
            id: group.id, name: group.name, type: group.type, homeLocationId: group.homeLocationId,
            description: clip(group.description), tags: group.tags || []
        })),
        factions: world.factions || [],
        relationships: world.relationships || [],
        startingLives: world.startingLives || [],
        lorebook: (world.lorebook || []).map(l => ({ keyword: l.keyword, text: clip(l.text, 6000) })),
        rules: world.rules || world.gameRules || {},
        hudConfig: world.hudConfig || {}
    });
}

function buildWorldAuditPayloads(world) {
    const full = serializeWorldForAudit(world);
    const contextTokens = Math.max(8192, Number(world?.contextSize) || 32768);
    const safeChars = Math.max(18000, (contextTokens - 6500) * 3);
    if (full.length <= safeChars) return [full];
    const index = JSON.stringify({
        world: world.name,
        regions: (world.regions || []).map(item => ({ id: item.id, name: item.name })),
        locations: (world.locations || []).map(item => ({ id: item.id, name: item.name, regionId: item.regionId, parentLocationId: item.parentLocationId, mapType: item.mapType })),
        entities: (world.entities || []).map(item => ({ id: item.id, name: item.name, type: item.type, homeLocation: item.homeLocation, startLocation: item.startLocation, groupIds: item.groupIds || [] })),
        groups: (world.groups || []).map(item => ({ id: item.id, name: item.name, homeLocationId: item.homeLocationId }))
    });
    const locations = world.locations || [];
    const entities = world.entities || [];
    const lorebook = world.lorebook || [];
    const size = 35;
    const count = Math.max(Math.ceil(locations.length / size), Math.ceil(entities.length / size), Math.ceil(lorebook.length / size), 1);
    return Array.from({ length: count }, (_, batch) => {
        const slice = {
            ...world,
            locations: locations.slice(batch * size, (batch + 1) * size),
            entities: entities.slice(batch * size, (batch + 1) * size),
            lorebook: lorebook.slice(batch * size, (batch + 1) * size)
        };
        return `CANONICAL WHOLE-WORLD INDEX (use this to validate links across batches):\n${index}\n\nDETAILED BATCH ${batch + 1}/${count}:\n${serializeWorldForAudit(slice)}`;
    });
}

/** Tolerant parse: models wrap JSON in prose/fences or lead with reasoning. */
function parseAuditFindings(raw) {
    if (!raw || !raw.trim()) throw new Error('empty response');
    const attempts = [];
    attempts.push(raw);
    const anchor = raw.indexOf('{"findings"');
    if (anchor !== -1) attempts.push(raw.slice(anchor));
    const fence = raw.match(/```(?:json)?([\s\S]*?)```/i);
    if (fence) attempts.push(fence[1]);
    for (const candidate of attempts) {
        try {
            const p = extractJSON(candidate);
            if (Array.isArray(p)) return p;
            if (p && Array.isArray(p.findings)) return p.findings;
        } catch (e) { /* try next strategy */ }
        // Bare top-level array (extractJSON only hunts for {...})
        try {
            const a = candidate.indexOf('['), b = candidate.lastIndexOf(']');
            if (a !== -1 && b > a) {
                const p = JSON.parse(candidate.slice(a, b + 1));
                if (Array.isArray(p)) return p;
            }
        } catch (e) { /* try next strategy */ }
    }
    throw new Error('The model did not return parseable JSON.');
}

async function runAIWorldAudit() {
    const world = state.editingWorld;
    const btn = document.getElementById('run-ai-audit-btn');
    const results = document.getElementById('ai-audit-results');
    if (!world || !results) return;
    if (!hasApiCredentials()) return showToast('API Key missing (Settings).', 'error');

    btn.disabled = true;
    btn.textContent = '⏳ Auditing...';
    results.innerHTML = '<div style="text-align:center; padding:16px; color:var(--text-3);">The QA agent is reading your world...</div>';

    // Reasoning models (DeepSeek Pro etc.) sometimes burn the budget on hidden
    // thinking or wrap JSON in prose. Attempt, then one strict retry.
    const callAudit = async (payload, extraNudge) => {
        const messages = [
                    { role: 'system', content: `You are a meticulous whole-world QA agent for a persistent roleplay simulation. Read every supplied directory—not just prose—and audit INTERNAL problems only:
- Misplaced info: content in the wrong field (exit lists inside descriptions, personality text in physical descriptions, DM-only secrets leaked into player-visible description)
- Geography and containment: regions must be broad geographic areas; buildings are locations in regions; rooms/floors are child locations whose parentLocationId points to their containing building. Flag buildings incorrectly modeled as regions, orphan rooms, cycles, impossible containment and region/parent disagreements
- Travel: every route must connect real locations, use a positive plausible duration and preserve its author-defined transport (horse, dragon, train, portal, etc.). Never assume a modern setting
- People and society: homes, schedules, groups, factions, relationships and starting lives must resolve to canonical IDs and agree with one another
- Rules and starts: starting lives, starting location, capabilities, HUD/rules and intro must describe compatible initial facts
- Lorebook: keywords that don't match their entry text; entries contradicting locations/NPCs/other lore
- Secrets: hints that spoil their own truth; truths contradicting established world facts
- Contradictions between any two elements (geography, names, timeline, tone vs dmPrompt)
- Descriptions that contradict the location's actual exits
- Leftover placeholder text ("TODO", "xxx", lorem)
Do NOT invent new content beyond minimal corrections. Do NOT flag stylistic preferences. If the world is clean, return an empty findings array.
Return ONLY JSON:
{"findings":[{"severity":"critical|warning|suggestion","issue":"<one sentence>","target_type":"region|location|entity|group|lore|world|secret","target_id":"<canonical id, lore keyword, or owner id for secrets>","secret_label":"<secrets only>","field":"<field to change>","new_value":"<full corrected scalar field value — ONLY when a safe fix exists, else omit>","fix_description":"<what the author should do>"}]}` },
                    { role: 'user', content: `Audit this world:\n\n${payload}` }
        ];
        if (extraNudge) messages.push({ role: 'user', content: extraNudge });
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
        const response = await fetch(apiBase() + '/chat/completions', {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(applyOpenRouterRouting({
                model: structuredModelFor(world),
                max_tokens: 4000, // reasoning models eat budget before emitting content
                messages
            }, world))
        }).finally(() => clearTimeout(timeout));
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error?.message || response.statusText);
        const msg = (await response.json()).choices?.[0]?.message;
        return msg?.content || '';
    };

    try {
        const payloads = buildWorldAuditPayloads(world);
        let findings = [];
        for (let index = 0; index < payloads.length; index += 1) {
            results.innerHTML = `<div style="text-align:center; padding:16px; color:var(--text-3);">Reading world section ${index + 1} of ${payloads.length}…</div>`;
            let batchFindings;
            try {
                batchFindings = parseAuditFindings(await callAudit(payloads[index], null));
            } catch (firstErr) {
                console.warn(`AI Audit section ${index + 1} unparseable — retrying strict:`, firstErr.message);
                results.innerHTML = `<div style="text-align:center; padding:16px; color:var(--text-3);">Section ${index + 1} returned malformed output — repairing it once…</div>`;
                batchFindings = parseAuditFindings(await callAudit(payloads[index],
                    '[SYSTEM: Your previous reply contained no parseable JSON. Respond NOW with ONLY the JSON object — no markdown fences, commentary or reasoning. Begin exactly with {"findings":['));
            }
            findings.push(...batchFindings);
        }
        findings = findings.filter((finding, index, list) => index === list.findIndex(other =>
            `${other.issue}|${other.target_type}|${other.target_id}|${other.field}` === `${finding.issue}|${finding.target_type}|${finding.target_id}|${finding.field}`));

        if (!findings.length) {
            results.innerHTML = '<div style="text-align:center; padding:16px;">✅ <b>The agent found no semantic issues.</b></div>';
            return;
        }

        const sevStyle = { critical: 'var(--red)', warning: 'var(--warning, #F4A261)', suggestion: 'var(--text-3)' };
        results.innerHTML = `<div style="display:flex; flex-direction:column; gap:10px;">${findings.map((f, i) => `
            <div style="background:var(--surface2); padding:12px; border-radius:8px; border-left:4px solid ${sevStyle[f.severity] || sevStyle.suggestion};">
                <div style="font-size:0.7rem; color:var(--text-3); text-transform:uppercase; font-weight:bold; margin-bottom:4px;">
                    ${escapeHTML(f.severity || 'note')} · ${escapeHTML(f.target_type || '')} ${escapeHTML(f.target_id || '')}${f.secret_label ? ` / ${escapeHTML(f.secret_label)}` : ''}
                </div>
                <div style="font-size:0.85rem; margin-bottom:6px;">${escapeHTML(f.issue || '')}</div>
                <div style="font-size:0.78rem; color:var(--text-2);">💡 ${escapeHTML(f.fix_description || 'No suggestion')}</div>
                ${f.new_value && f.field ? `
                    <div style="margin-top:8px; display:flex; gap:8px; align-items:flex-start;">
                        <div style="flex:1; font-size:0.75rem; font-family:monospace; background:var(--bg); padding:6px 8px; border-radius:6px; max-height:80px; overflow-y:auto;">${escapeHTML(String(f.new_value).slice(0, 400))}</div>
                        <button class="btn btn-ghost ai-fix-btn" data-idx="${i}" style="font-size:0.72rem; white-space:nowrap;">✅ Apply</button>
                    </div>` : ''}
            </div>`).join('')}</div>`;

        results.querySelectorAll('.ai-fix-btn').forEach(fixBtn => {
            fixBtn.onclick = () => {
                const f = findings[parseInt(fixBtn.dataset.idx)];
                if (applyAIWorldFix(world, f)) {
                    fixBtn.disabled = true;
                    fixBtn.textContent = '✔ Applied';
                    renderWorldStudio();
                    updateWorldTokenCount();
                    showToast('Fix applied — remember to Save World.', 'success');
                } else {
                    showToast('Could not apply: target or field not found/allowed.', 'error');
                }
            };
        });
    } catch (err) {
        results.innerHTML = `<div style="color:var(--red); font-size:0.85rem;">Audit failed after retry: ${escapeHTML(err.message)}<br>
            <span style="color:var(--text-3);">Reasoning-heavy models sometimes can't produce structured output — try again, or temporarily set a non-reasoning model on this world for the audit.</span></div>`;
    } finally {
        btn.disabled = false;
        btn.textContent = '✨ Run';
    }
}

/** Apply one AI finding — whitelisted fields only, target must resolve. */
function applyAIWorldFix(world, f) {
    if (!f || !f.field || f.new_value === undefined) return false;
    const allowed = AI_AUDIT_FIELD_WHITELIST[f.target_type];
    if (!allowed || !allowed.includes(f.field)) return false;
    const val = String(f.new_value);

    if (f.target_type === 'world') { world[f.field] = val; openWorldStudio(); return true; }
    if (f.target_type === 'region') {
        const region = (world.regions || []).find(item => item.id === f.target_id);
        if (!region) return false;
        region[f.field] = val;
        if (f.field === 'name') (world.locations || []).forEach(location => {
            if (location.regionId === region.id) location.region = val;
        });
        return true;
    }
    if (f.target_type === 'location') {
        const loc = world.locations.find(l => l.id === f.target_id) || findFuzzyLocation(f.target_id, world.locations);
        if (!loc) return false;
        if (f.field === 'regionId' && val && !(world.regions || []).some(region => region.id === val)) return false;
        if (f.field === 'parentLocationId') {
            const parent = getLocationRef(world, val);
            if (val && (!parent || parent.id === loc.id || (parent.regionId && loc.regionId && parent.regionId !== loc.regionId))) return false;
        }
        if (f.field === 'mapType' && !['transit', 'route', 'building', 'outdoor', 'room', 'area'].includes(val)) return false;
        loc[f.field] = val; return true;
    }
    if (f.target_type === 'entity') {
        const id = resolveNpcId(world, f.target_id);
        const ent = world.entities.find(e => e.id === (id || f.target_id));
        if (!ent) return false;
        if (['homeLocation', 'startLocation'].includes(f.field) && val && !getLocationRef(world, val)) return false;
        ent[f.field] = val; return true;
    }
    if (f.target_type === 'group') {
        const group = (world.groups || []).find(item => item.id === f.target_id);
        if (!group) return false;
        if (f.field === 'homeLocationId' && val && !getLocationRef(world, val)) return false;
        group[f.field] = val; return true;
    }
    if (f.target_type === 'lore') {
        const entry = (world.lorebook || []).find(l => (l.keyword || '').toLowerCase() === (f.target_id || '').toLowerCase());
        if (!entry) return false;
        entry[f.field] = val; return true;
    }
    if (f.target_type === 'secret') {
        const owner = world.locations.find(l => l.id === f.target_id)
            || world.entities.find(e => e.id === f.target_id)
            || findFuzzyLocation(f.target_id, world.locations);
        const secret = owner && (owner.secrets || []).find(s => s.label === f.secret_label);
        if (!secret) return false;
        secret[f.field] = val; return true;
    }
    return false;
}

/**
 * Epistemic Isolation Filter: Redacts whispers or private text addressed to other characters
 */
function redactPrivateWhispers(text, targetCharName, otherNames) {
    if (!text || !otherNames || otherNames.length === 0) return text;
    
    let redacted = text;
    otherNames.forEach(name => {
        if (!name || name.trim().toLowerCase() === targetCharName.trim().toLowerCase()) return;
        
        const escapedName = name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        
        // Pattern 1: Match standard whispers introduces, supporting any text inside the asterisks (e.g. privately, ing)
        const whisperActionPattern = new RegExp(`(\\*[^\\*]*whisper[^\\*]*to\\s+${escapedName}[^\\*]*\\*\\s*)([^\\*\\r\\n]+)`, 'gi');
        
        // Pattern 2: *private to Name* ... or *privately to Name* ...
        const privateActionPattern = new RegExp(`(\\*[^\\*]*private(?:ly)?\\s+to\\s+${escapedName}[^\\*]*\\*\\s*)([^\\*\\r\\n]+)`, 'gi');
        
        // Pattern 3: (to Name) ... or [to Name] ...
        const parenthesesPattern = new RegExp(`((\\(|\\[)to\\s+${escapedName}(\\)|\\])\\s*)([^\\r\\n]+)`, 'gi');

        // Apply redacting replacements
        redacted = redacted.replace(whisperActionPattern, (match, prefix, dialogue) => {
            const trailingSpace = dialogue.match(/\s+$/) ? ' ' : '';
            return `${prefix}(You observe them whispering privately, but are unable to hear)${trailingSpace}`;
        });
        redacted = redacted.replace(privateActionPattern, (match, prefix, dialogue) => {
            const trailingSpace = dialogue.match(/\s+$/) ? ' ' : '';
            return `${prefix}(You observe them whispering privately, but are unable to hear)${trailingSpace}`;
        });
        redacted = redacted.replace(parenthesesPattern, (match, prefix, dialogue) => {
            const trailingSpace = dialogue.match(/\s+$/) ? ' ' : '';
            return `${prefix}(whispering privately - inaudible)${trailingSpace}`;
        });
    });
    
    return redacted;
}

/**
 * Returns the canonical text of a message, accounting for reroll versions.
 * World messages keep canon in versions[currentVersion]; chat uses content.
 */
function canonicalMsgText(m) {
    if (!m) return '';
    if (Array.isArray(m.versions) && m.versions.length > 0) {
        const idx = (m.currentVersion !== undefined && m.currentVersion >= 0) ? m.currentVersion : m.versions.length - 1;
        return m.versions[idx] || m.text || m.content || '';
    }
    return m.content || m.text || '';
}

/**
 * Ghost-cleanup for chat mode: when a message that contributed a [MEMORY]
 * chronicle line is rerolled or deleted, remove that line from the session
 * ledger so abandoned events can't bleed back into context.
 */
function stripChatLedgerEntry(session, msg) {
    if (!session || !msg || !msg.ledgerEntry || !session.ledger) return;
    const targetKey = worldLedgerEntryKey(msg.ledgerEntry);
    const history = Array.isArray(session.messages) ? session.messages : (Array.isArray(session.history) ? session.history : []);
    const stillCanonicalElsewhere = history.some(other =>
        other !== msg && other?.ledgerEntry && worldLedgerEntryKey(other.ledgerEntry) === targetKey);
    if (stillCanonicalElsewhere) return;
    session.ledger = session.ledger
        .split('\n')
        .filter(line => worldLedgerEntryKey(line) !== targetKey)
        .join('\n')
        .trim();
    session.ledgerRevision = (Number(session.ledgerRevision) || 0) + 1;
}

/**
 * Invalidate episodic memories that cover message `msgIndex` or any later message.
 * Called when a message is edited, rerolled, or deleted so summaries built from
 * now-stale ("non-canon") text are dropped and the region is rebuilt on the next
 * consolidation pass. Also self-heals lastConsolidatedIndex drift after deletes,
 * since the rewound region re-consolidates against the current message array.
 */
// Memory epoch: bumped whenever history/state is rewritten (reroll, edit,
// delete, snapshot restore). In-flight background consolidations check it
// before committing, so a summary of an abandoned take can never land on
// restored state after the fact.
function bumpMemoryEpoch(session) {
    if (session) session._memEpoch = (session._memEpoch || 0) + 1;
}

function invalidateEpisodicFrom(session, msgIndex) {
    bumpMemoryEpoch(session);
    if (!session) return false;

    let rewindTo = session.lastConsolidatedIndex || 0;
    let droppedAny = false;
    const kept = [];

    for (const m of (session.episodicMemories || [])) {
        const start = (m.startIndex ?? 0);
        const end = (m.endIndex ?? Infinity); // exclusive
        // Memory is stale if its coverage includes msgIndex or extends past it.
        if (end > msgIndex) {
            rewindTo = Math.min(rewindTo, start);
            droppedAny = true;
        } else {
            kept.push(m);
        }
    }

    if (droppedAny) {
        session.episodicMemories = kept;
    }

    // Chat v2 memories live in the continuity store, outside the transcript.
    // Remove every derived record whose provenance touches the rewritten tail.
    const continuity = state.chatContinuities?.[session.continuityId];
    if (continuity && Array.isArray(continuity.records)) {
        const invalidMessageIds = new Set((session.messages || []).slice(msgIndex).map(message => message.id).filter(Boolean));
        const before = continuity.records.length;
        continuity.records = continuity.records.filter(memory => {
            if (memory.sourceSessionId !== session.id) return true;
            const coveredByIndex = Number.isFinite(Number(memory.endIndex)) && Number(memory.endIndex) > msgIndex;
            const coveredById = (memory.sourceMessageIds || []).some(id => invalidMessageIds.has(id));
            if (!coveredByIndex && !coveredById) return true;
            rewindTo = Math.min(rewindTo, Number(memory.startIndex) || 0);
            return false;
        });
        if (continuity.records.length !== before) {
            droppedAny = true;
            continuity.updatedAt = Date.now();
            // If the removed record had superseded a prior state, restore the
            // newest surviving value for that key.
            const newestByKey = new Map();
            continuity.records.forEach(memory => {
                if (!memory.key || !['fact', 'relationship', 'state', 'thread'].includes(memory.type)) return;
                const key = `${memory.type}:${memory.key}`;
                const current = newestByKey.get(key);
                if (!current || Number(memory.updatedAt) > Number(current.updatedAt)) newestByKey.set(key, memory);
            });
            newestByKey.forEach(memory => {
                if (memory.status === 'superseded') memory.status = 'active';
            });
        }
    }

    if ((session.lastConsolidatedIndex || 0) > msgIndex || droppedAny) {
        session.lastConsolidatedIndex = Math.min(session.lastConsolidatedIndex || 0, rewindTo, msgIndex);
    }
    return droppedAny;
}

/**
 * Rolling Episodic Memory Consolidation (Background Dream Loop)
 * Unified support for Chat/Room Mode (messages) and World Mode (history).
 */
// Trim a possibly-truncated string back to its last complete sentence, so a
// budget-cut summary ends cleanly ("…owes the user.") instead of mid-word
// ("…relationship support—while"). Falls back to a clause boundary, then to an
// ellipsis, so we always store something readable.
function trimToLastSentence(text) {
    if (!text) return text;
    const t = text.trim();
    const lastEnd = Math.max(t.lastIndexOf('. '), t.lastIndexOf('! '), t.lastIndexOf('? '),
        t.endsWith('.') || t.endsWith('!') || t.endsWith('?') ? t.length - 1 : -1);
    if (lastEnd > 40) return t.slice(0, lastEnd + 1).trim();
    const lastClause = Math.max(t.lastIndexOf('; '), t.lastIndexOf(', '), t.lastIndexOf('—'));
    if (lastClause > 40) return t.slice(0, lastClause).trim() + '…';
    return t + '…';
}

const memoryConsolidationJobs = new WeakMap();

async function consolidateSessionEpisodicMemory(session, config) {
    if (!session) return;
    const existing = memoryConsolidationJobs.get(session);
    if (existing) return existing;
    const job = consolidateSessionEpisodicMemoryRun(session, config)
        .finally(() => memoryConsolidationJobs.delete(session));
    memoryConsolidationJobs.set(session, job);
    return job;
}

function parseStructuredChatMemory(rawText) {
    const raw = String(rawText || '').trim();
    const fenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const firstBrace = fenced.indexOf('{');
    const lastBrace = fenced.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        try {
            const parsed = JSON.parse(fenced.slice(firstBrace, lastBrace + 1));
            const summary = String(parsed.summary || '').trim();
            const memories = (Array.isArray(parsed.memories) ? parsed.memories : []).slice(0, 16)
                .filter(isPlainObject).map(memory => ({
                    type: CHAT_MEMORY_TYPES.has(memory.type) ? memory.type : 'fact',
                    key: String(memory.key || '').slice(0, 240),
                    text: String(memory.text || '').slice(0, 4000),
                    importance: memory.importance,
                    confidence: memory.confidence,
                    status: memory.status,
                    scope: memory.scope,
                    characterIds: memory.characterIds,
                    witnessedBy: memory.witnessedBy
                })).filter(memory => memory.text.trim());
            if (summary || memories.length) return { summary, memories };
        } catch (error) {
            console.warn('Structured memory JSON was invalid; preserving it as an episode.', error);
        }
    }
    return { summary: raw.replace(/^\[EPISODIC ARCHIVE\]:?\s*/i, ''), memories: [] };
}

async function consolidateSessionEpisodicMemoryRun(session, config) {
    if (!session) return;
    // Race guard: remember the epoch at read time; if a reroll/edit/restore
    // rewrites history while our API calls are in flight, we must not commit.
    const startEpoch = session._memEpoch || 0;

    const messages = session.messages || session.history;
    if (!messages || messages.length < 2) return;
    
    const lastIdx = session.lastConsolidatedIndex || 0;
    const currentLen = messages.length;
    
    // Consolidate in rolling chunks of 8 messages
    const CONSOLIDATION_CHUNK_SIZE = 8;
    if (currentLen - lastIdx < CONSOLIDATION_CHUNK_SIZE) return;
    
    if (!hasApiCredentials()) {
        console.warn('Consolidation: Skipping - API Key missing.');
        return;
    }
    
    // FIX 1: World sessions use config.title, not config.name
    const configName = config.name || config.title || 'Narrator';

    // Process the next sequential block of unconsolidated messages (up to 40 max)
    const MAX_SLICE = 40;
    const chunkEnd = Math.min(lastIdx + MAX_SLICE, currentLen);
    const slice = messages.slice(lastIdx, chunkEnd);
    const isChatMemory = Array.isArray(session.messages);
    if (isChatMemory) ensureChatMessageIds(session);
    
    console.log(`Consolidation: Archiving messages ${lastIdx}–${chunkEnd} (${slice.length} msgs)`);

    const sliceText = slice.map(m => {
        if (m.role === 'system') return null; // skip injected system blocks
        let prefix = 'Participant';
        if (m.role === 'user') {
            prefix = 'User';
        } else if (m.role === 'assistant' || m.role === 'dm') {
            prefix = configName;
            if (m.charId) {
                const char = state.characters.find(c => c.id === m.charId);
                if (char) prefix = char.name;
            }
        }
        const content = (canonicalMsgText(m)).trim();
        return content ? `${prefix}: ${content}` : null;
    }).filter(Boolean).join('\n\n');

    if (!sliceText) {
        session.lastConsolidatedIndex = chunkEnd;
        return;
    }
    
    try {
        // FIX 3: Use a dedicated fast model — never the character's full model
        // A flash-tier model is sufficient and avoids context limit / cost issues
        const consolidationModel = state.globalSettings?.consolidationModel
            || (isLocalProvider() ? state.globalSettings.defaultModel : 'google/gemini-flash-1.5-8b');

        const response = await fetch(apiBase() + '/chat/completions', {
            method: 'POST',
            headers: {
                ...authHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(applyOpenRouterRouting({
                model: consolidationModel,
                max_tokens: isChatMemory ? 1100 : 500,
                messages: [
                    {
                        role: 'system',
                        content: isChatMemory ? `You are Horde Chronos, a precise long-term memory archivist for roleplay.
Return ONLY valid JSON with this shape:
{"summary":"2-4 factual sentences describing the scene","memories":[{"type":"fact|relationship|state|thread","key":"stable_subject:attribute","text":"one atomic durable fact","importance":0.0,"confidence":0.0,"status":"active|resolved|disputed","scope":"timeline|relationship|canon","characterIds":["names or ids"],"witnessedBy":["names or ids"]}]}
Record only durable changes: decisions, promises, relationships, discoveries, secrets, injuries, possessions, locations, goals, identities, and unresolved threads. Each memory must contain one fact. Use the same key when a newer fact replaces an older state. Mark concluded threads resolved. Distinguish narrator canon from what characters personally witnessed. Do not invent details and do not include ordinary banter or transient mood.`
                            : `You are "Horde Chronos" — a narrative memory archivist.
Summarize the roleplay segment below in AT MOST 3 short sentences (roughly 60 words). Capture only the key events, decisions, secrets revealed, and status changes. Third person, factual, no embellishment. Finish every sentence — never trail off.
Begin your response with: [EPISODIC ARCHIVE]:`
                    },
                    { role: 'user', content: `Roleplay segment:\n\n${sliceText}` }
                ]
            }, config))
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Consolidation API ${response.status}: ${errBody.slice(0, 200)}`);
        }

        const data = await response.json();
        let rawMemory = data.choices?.[0]?.message?.content?.trim();
        if (!rawMemory) throw new Error('Consolidation model returned empty content');
        const extracted = isChatMemory ? parseStructuredChatMemory(rawMemory) : { summary: rawMemory, memories: [] };
        let summary = extracted.summary || rawMemory;

        // Safety net: if the model still overran the budget, trim to the last
        // COMPLETE sentence so we never archive a mid-word fragment like "…while".
        if (data.choices?.[0]?.finish_reason === 'length') {
            summary = trimToLastSentence(summary);
        }
        
        console.log(`Consolidation OK: ${summary.slice(0, 100)}...`);
        
        // Stamp the covered message range so this memory can be invalidated if
        // any of its source messages are later edited, rerolled, or deleted.
        // Commit gate: history was rewritten while we were summarizing —
        // this summary describes an abandoned take. Discard it.
        if ((session._memEpoch || 0) !== startEpoch) {
            console.warn('Consolidation aborted: history changed during archiving (reroll/edit) — summary discarded.');
            return;
        }

        let totalMemories = 0;
        let pendingEmbeddings = [];
        if (isChatMemory) {
            const continuity = ensureChatContinuity(session, config?.id || chatOwnerId());
            const sourceMessageIds = slice.map(message => message.id).filter(Boolean);
            const participantIds = [...new Set(slice.map(message => message.charId).filter(Boolean))];
            const records = [{
                type: 'episode', key: `scene:${session.id}:${lastIdx}:${chunkEnd}`, text: summary,
                importance: 0.62, confidence: 0.9, scope: 'timeline', characterIds: participantIds,
                witnessedBy: participantIds
            }, ...extracted.memories];
            const inserted = upsertContinuityMemoryRecords(continuity, records, {
                sourceSessionId: session.id,
                sourceMessageIds,
                startIndex: lastIdx,
                endIndex: chunkEnd,
                personaId: state.activePersonaId || ''
            });
            pendingEmbeddings = inserted;
            totalMemories = continuity.records.filter(record => record.status !== 'superseded').length;
        } else {
            const embedding = await HordeVectorMemory.getCachedEmbedding(summary);
            session.episodicMemories = session.episodicMemories || [];
            session.episodicMemories.push({
                text: summary, embedding,
                embeddingNamespace: embedding ? HordeVectorMemory.namespace() : '',
                createdAt: Date.now(), startIndex: lastIdx, endIndex: chunkEnd
            });
            totalMemories = session.episodicMemories.length;
        }
        session.lastConsolidatedIndex = chunkEnd;

        await saveState();

        // Raw structured records are already durable. Vector enrichment is a
        // second phase, so closing the app or losing the embedding provider can
        // never erase the memory itself.
        if (pendingEmbeddings.length) {
            for (const record of pendingEmbeddings) {
                try { await hydrateChatMemoryEmbedding(record); }
                catch (error) { console.warn('Memory vector enrichment failed; hybrid text recall remains active.', error); }
            }
            await HordeDB.set('chatContinuities', state.chatContinuities);
        }

        // FIX 4: Visible feedback so you know it actually ran
        showToast(`🧠 Memory archived (${totalMemories} active)`, 'info');
        console.log(`Consolidation saved. Total active memories: ${totalMemories}`);
    } catch (e) {
        // Do NOT update lastConsolidatedIndex on failure — will retry next turn
        console.warn(`Consolidation failed (will retry next turn):`, e.message);
    }
}

/**
 * 🧠 VECTOR MEMORY INSPECTOR & PLAYGROUND ENGINE
 */
let currentVectorTab = 'episodic';
let currentEpisodicStore = null; // live array backing the episodic inspector tab

function setupVectorMemoryViewerEvents() {
    const openBtn = document.getElementById('open-vector-memory-btn');
    const worldOpenBtn = document.getElementById('world-open-vector-memory-btn');
    const closeBtn = document.getElementById('close-vector-memory-btn');
    const closeFtBtn = document.getElementById('close-vector-memory-ft-btn');
    const overlay = document.getElementById('vector-memory-modal-overlay');
    
    const tabEpisodic = document.getElementById('vector-tab-episodic');
    const tabBiography = document.getElementById('vector-tab-biography');
    const tabCognition = document.getElementById('vector-tab-cognition');
    const tabLocations = document.getElementById('vector-tab-locations');
    const tabUnresolved = document.getElementById('vector-tab-unresolved');
    const characterFilter = document.getElementById('vector-character-filter');
    const deleteAllBtn = document.getElementById('vector-delete-all-btn');
    const vectorizeListedBtn = document.getElementById('vectorize-listed-btn');
    
    const searchBtn = document.getElementById('vector-test-search-btn');
    const queryInput = document.getElementById('vector-test-query');

    if (openBtn) {
        openBtn.onclick = () => {
            currentVectorTab = 'episodic';
            overlay.classList.remove('hidden');
            updateVectorTabUI();
            renderVectorMemoryList();
        };
    }
    
    if (worldOpenBtn) {
        worldOpenBtn.onclick = () => {
            const world = state.worlds.find(item => item.id === state.activeWorldId);
            const sess = getCurrentWorldSession();
            if (world && sess && window.HordeSidecarHooks?.isSidecarWorld?.(world, sess)) {
                const protocol = window.HordeSidecarHooks.normalizeWorldTimeline(world, sess);
                window.HordeSidecarMemoryGraph?.backfillWorldHistory?.(protocol, sess);
            }
            currentVectorTab = 'episodic';
            overlay.classList.remove('hidden');
            updateVectorTabUI();
            renderVectorMemoryList();
        };
    }
    
    const closeModal = () => {
        overlay.classList.add('hidden');
        if (queryInput) queryInput.value = '';
    };
    
    if (closeBtn) closeBtn.onclick = closeModal;
    if (closeFtBtn) closeFtBtn.onclick = closeModal;
    
    if (tabEpisodic) {
        tabEpisodic.onclick = () => {
            currentVectorTab = 'episodic';
            updateVectorTabUI();
            renderVectorMemoryList();
        };
    }
    
    if (tabBiography) {
        tabBiography.onclick = () => {
            currentVectorTab = 'biography';
            updateVectorTabUI();
            renderVectorMemoryList();
        };
    }

    if (tabCognition) {
        tabCognition.onclick = () => {
            currentVectorTab = 'cognition';
            updateVectorTabUI();
            renderVectorMemoryList();
        };
    }
    if (tabLocations) {
        tabLocations.onclick = () => { currentVectorTab = 'locations'; updateVectorTabUI(); renderVectorMemoryList(); };
    }

    if (tabUnresolved) {
        tabUnresolved.onclick = () => {
            currentVectorTab = 'unresolved';
            updateVectorTabUI();
            renderVectorMemoryList();
        };
    }

    if (characterFilter) {
        characterFilter.onchange = () => renderVectorMemoryList(queryInput?.value.trim() || '');
    }

    if (deleteAllBtn) {
        deleteAllBtn.onclick = async () => {
            const isWorld = !document.getElementById('world-play-view').classList.contains('hidden');
            if (!isWorld || !['episodic', 'cognition', 'unresolved'].includes(currentVectorTab)) {
                return showToast('This view has no independently stored records to delete.', 'error');
            }
            const sess = getCurrentWorldSession();
            if (!sess) return showToast('No active world session.', 'error');
            if (currentVectorTab === 'episodic') {
                if (window.HordeSidecarHooks?.isSidecarWorld?.(state.worlds.find(world => world.id === state.activeWorldId), sess)) {
                    const graph = window.HordeSidecarMemoryGraph?.graph?.(sess.sidecar);
                    if (graph) { graph.worldHistory = []; graph.episodes = []; graph.scenes = []; graph.sequences = []; graph.lastEpisodeTurnCount = 0; graph.locationReferences = []; graph.cognition = []; sess.sidecar.jobs = []; }
                } else sess.episodicMemories = [];
            } else {
                const graph = window.HordeSidecarMemoryGraph?.graph?.(sess.sidecar);
                if (!graph) return showToast('Sidecar memory is unavailable for this timeline.', 'error');
                if (currentVectorTab === 'cognition') {
                    const characterId = characterFilter?.value || '';
                    graph.cognition = graph.cognition.filter(memory => characterId && memory.characterId !== characterId);
                } else {
                    graph.locationReferences = graph.locationReferences.filter(reference => reference.locationId || reference.status === 'resolved');
                }
            }
            await saveState();
            renderVectorMemoryList(queryInput?.value.trim() || '');
            showToast('Only records in this inspector view were deleted.', 'success');
        };
    }

    if (vectorizeListedBtn) {
        vectorizeListedBtn.onclick = async () => {
            const isWorld = !document.getElementById('world-play-view').classList.contains('hidden');
            const sess = getCurrentWorldSession();
            const graph = isWorld && window.HordeSidecarMemoryGraph?.graph?.(sess?.sidecar);
            if (!graph || !['episodic', 'cognition', 'locations', 'unresolved'].includes(currentVectorTab)) {
                return showToast('Choose a Sidecar memory tab first.', 'info');
            }
            if (currentVectorTab !== 'episodic' && (!graph.worldHistory.some(record => Array.isArray(record.embedding)) || !graph.episodes.some(record => Array.isArray(record.embedding)))) {
                return showToast('Vectorization cannot continue yet. Vectorize committed World History and at least one Episode first.', 'error');
            }
            const characterId = characterFilter?.value || '';
            const records = currentVectorTab === 'episodic'
                ? [...graph.worldHistory, ...graph.episodes]
                : currentVectorTab === 'cognition'
                ? graph.cognition.filter(record => !characterId || record.characterId === characterId)
                : currentVectorTab === 'locations'
                    ? (state.worlds.find(world => world.id === state.activeWorldId)?.locations || [])
                    : graph.locationReferences.filter(record => !record.locationId && record.status !== 'resolved');
            const world = state.worlds.find(item => item.id === state.activeWorldId);
            records.forEach(record => { if (!record.text && !record.vectorText) record.vectorText = currentVectorTab === 'locations' ? sidecarLocationEmbeddingText(world, record) : `${record.name || ''} ${record.evidence || ''}`.trim(); });
            vectorizeListedBtn.disabled = true;
            vectorizeListedBtn.textContent = 'Vectorizing…';
            try {
                const result = await vectorizeSidecarMemoryRecords(records, { onProgress: progress => {
                    vectorizeListedBtn.textContent = `Vectorizing ${progress.completed}/${progress.attempted}…`;
                    const status = document.getElementById('vector-memory-status');
                    if (status) status.textContent = `Vectorization progress: ${progress.completed}/${progress.attempted}`;
                } });
                await saveState();
                renderVectorMemoryList(queryInput?.value.trim() || '');
                showToast(`Vectorized ${result.completed}/${result.attempted} derived records.`, 'success');
            } catch (error) { showToast(`Vectorization failed: ${error.message}`, 'error'); }
            finally { vectorizeListedBtn.disabled = false; vectorizeListedBtn.textContent = 'Vectorize listed'; }
        };
    }
    
    if (searchBtn && queryInput) {
        searchBtn.onclick = () => {
            const val = queryInput.value.trim();
            renderVectorMemoryList(val);
        };
        
        queryInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                const val = queryInput.value.trim();
                renderVectorMemoryList(val);
            }
        };
    }

    // Force Archive Now — bypass 8-turn wait and immediately consolidate all history
    const forceArchiveBtn = document.getElementById('force-archive-now-btn');
    if (forceArchiveBtn) {
        forceArchiveBtn.onclick = async () => {
            forceArchiveBtn.disabled = true;
            forceArchiveBtn.textContent = '⏳ Archiving...';

            const isWorld = !document.getElementById('world-play-view').classList.contains('hidden');
            try {
                if (isWorld) {
                    const world = state.worlds.find(w => w.id === state.activeWorldId);
                    const sess = getCurrentWorldSession();
                    if (!sess || !world) throw new Error('No active world session');
                    if (window.HordeSidecarHooks?.isSidecarWorld?.(world, sess)) {
                        const memory = effectiveSidecarMemoryConfig(world);
                        await runSidecarBackgroundMemoryJobs(world, sess, { force: true, source: 'manual_force_archive', priority: 'manual' });
                        renderVectorMemoryList();
                        return;
                    }
                    // Full rebuild: clear stale memories and re-consolidate from scratch
                    // (otherwise we'd duplicate the entire archive on top of old entries).
                    sess.episodicMemories = [];
                    sess.lastConsolidatedIndex = 0;
                    while (sess.history.length - (sess.lastConsolidatedIndex || 0) >= 8) {
                        await consolidateSessionEpisodicMemory(sess, world);
                    }
                } else {
                    const session = getCurrentSession();
                    const config = state.characters.find(c => c.id === state.activeCharId)
                                || state.rooms.find(r => r.id === state.activeRoomId);
                    if (!session || !config) throw new Error('No active chat session');
                    // Full rebuild: clear stale memories and re-consolidate from scratch
                    // (otherwise we'd duplicate the entire archive on top of old entries).
                    session.episodicMemories = [];
                    const continuity = ensureChatContinuity(session, config.id);
                    continuity.records = continuity.records.filter(memory => memory.sourceSessionId !== session.id);
                    session.lastConsolidatedIndex = 0;
                    while (session.messages.length - (session.lastConsolidatedIndex || 0) >= 8) {
                        await consolidateSessionEpisodicMemory(session, config);
                    }
                }
                // Refresh the list
                renderVectorMemoryList();
            } catch (e) {
                showToast('Force archive failed: ' + e.message, 'error');
            } finally {
                forceArchiveBtn.disabled = false;
                forceArchiveBtn.textContent = '⚡ Force Archive Now';
            }
        };
    }
}

function updateVectorTabUI() {
    const tabs = {
        episodic: document.getElementById('vector-tab-episodic'),
        biography: document.getElementById('vector-tab-biography'),
        cognition: document.getElementById('vector-tab-cognition'),
        locations: document.getElementById('vector-tab-locations'),
        unresolved: document.getElementById('vector-tab-unresolved')
    };
    Object.entries(tabs).forEach(([key, tab]) => {
        if (!tab) return;
        const active = key === currentVectorTab;
        tab.style.color = active ? 'var(--accent)' : 'var(--text-3)';
        tab.style.fontWeight = active ? 'bold' : 'normal';
        tab.style.borderBottom = active ? '2px solid var(--accent)' : 'none';
    });

    const characterFilter = document.getElementById('vector-character-filter');
    if (!characterFilter) return;
    const isWorld = !document.getElementById('world-play-view').classList.contains('hidden');
    characterFilter.classList.toggle('hidden', currentVectorTab !== 'cognition' || !isWorld);
    if (currentVectorTab !== 'cognition' || !isWorld) return;

    const selected = characterFilter.value;
    const sess = getCurrentWorldSession();
    const world = state.worlds.find(w => w.id === state.activeWorldId);
    const graph = window.HordeSidecarMemoryGraph?.graph?.(sess?.sidecar);
    const ids = [...new Set((graph?.cognition || []).map(record => record.characterId).filter(Boolean))];
    const names = new Map((world?.entities || []).map(entity => [entity.id, entity.name || entity.id]));
    characterFilter.innerHTML = '<option value="">All characters</option>' + ids.map(id =>
        `<option value="${escapeHTML(id)}">${escapeHTML(names.get(id) || id)}</option>`
    ).join('');
    if (ids.includes(selected)) characterFilter.value = selected;
}

async function renderVectorMemoryList(filterQuery = "") {
    const listContainer = document.getElementById('vector-memory-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-3);">Loading memories...</div>`;
    
    const isWorld = !document.getElementById('world-play-view').classList.contains('hidden');
    let candidates = [];
    
    // Track the live array backing the episodic tab so cards can edit/delete entries
    currentEpisodicStore = null;
    if (currentVectorTab === 'episodic') {
        // Retrieve rolling episodic summaries
        if (isWorld) {
            const sess = getCurrentWorldSession();
            const world = state.worlds.find(item => item.id === state.activeWorldId);
            const graph = window.HordeSidecarHooks?.isSidecarWorld?.(world, sess)
                ? window.HordeSidecarMemoryGraph?.graph?.(sess.sidecar) : null;
            if (graph) {
                currentEpisodicStore = [...graph.worldHistory, ...graph.episodes, ...(graph.scenes || []), ...(graph.sequences || [])];
                candidates = currentEpisodicStore.filter(record => record.status === 'active').map(record => ({
                    text: record.kind === 'episode' ? `[EPISODE] ${record.text || record.summary || ''}` : record.kind === 'scene' ? `[SCENE] ${record.text || record.summary || ''}` : record.kind === 'sequence' ? `[SEQUENCE] ${record.text || record.summary || ''}` : `[WORLD HISTORY] ${record.text || record.narration || ''}`,
                    embedding: record.embedding, embeddingNamespace: record.embeddingNamespace, source: record.kind || 'world_history', ref: record
                }));
            } else if (sess && sess.episodicMemories) {
                currentEpisodicStore = sess.episodicMemories;
                candidates = sess.episodicMemories.map(m => ({ text: m.text, embedding: m.embedding, source: 'episodic', ref: m }));
            }
        } else {
            const session = getCurrentSession();
            if (session) {
                const continuity = ensureChatContinuity(session, chatOwnerId());
                currentEpisodicStore = continuity.records;
                candidates = continuity.records.map(m => ({ ...m, source: 'continuity', ref: m }));
            }
        }
    } else if (currentVectorTab === 'cognition' && isWorld) {
        const sess = getCurrentWorldSession();
        const graph = window.HordeSidecarMemoryGraph?.graph?.(sess?.sidecar);
        const characterId = document.getElementById('vector-character-filter')?.value || '';
        candidates = (graph?.cognition || [])
            .filter(memory => memory.status !== 'superseded' && (!characterId || memory.characterId === characterId))
            .map(memory => ({
                text: `[${memory.characterName || memory.characterId || 'Character'} · ${String(memory.epistemicStatus || 'memory').replace(/_/g, ' ')}] ${memory.text || ''}`,
                source: 'cognition', ref: memory, type: memory.epistemicStatus || 'cognition',
                status: memory.status || 'active', importance: memory.importance,
                sourceSessionId: memory.sourceEpisodeId || memory.sourceTurnIds?.join(', ')
            }));
    } else if (currentVectorTab === 'locations' && isWorld) {
        const world = state.worlds.find(item => item.id === state.activeWorldId);
        candidates = (world?.locations || []).map(location => ({ text: sidecarLocationEmbeddingText(world, location), embedding: location.embedding,
            source: 'location', ref: location, type: location.mapType || 'location', status: 'canonical', importance: 0.8, sourceSessionId: location.id }));
    } else if (currentVectorTab === 'unresolved' && isWorld) {
        const sess = getCurrentWorldSession();
        const graph = window.HordeSidecarMemoryGraph?.graph?.(sess?.sidecar);
        candidates = (graph?.locationReferences || [])
            .filter(reference => !reference.locationId && reference.status !== 'resolved')
            .map(reference => ({
                text: `[UNRESOLVED PLACE: ${reference.name || 'Unnamed place'}] ${reference.evidence || reference.summary || 'Mentioned in established scene history.'}`,
                source: 'unresolved_place', ref: reference, type: 'unresolved place',
                status: reference.status || 'open', importance: reference.importance,
                sourceSessionId: reference.sourceEpisodeId || reference.sourceTurnIds?.join(', ')
            }));
    } else {
        // Retrieve Biography & Lore memories
        if (isWorld) {
            const world = state.worlds.find(w => w.id === state.activeWorldId);
            const sess = getCurrentWorldSession();
            if (world && sess) {
                // Return all entities in current location
                const currentLocationId = sess.playerLocation;
                const loc = world.locations.find(l => l.id === currentLocationId);
                const npcs = sessionNpcs(world, sess).filter(e =>
                    sess.entityStates[e.id]?.location === currentLocationId && isNpcActive(sess.entityStates[e.id]));
                
                // Add loc and npcs as lore/bio sources
                if (loc && loc.description) {
                    candidates.push({ text: `[LOCATION: ${loc.name}] ${loc.description}`, source: 'biography' });
                }
                npcs.forEach(n => {
                    if (n.prompt) {
                        candidates.push({ text: `[NPC: ${n.name}] ${n.prompt}`, source: 'biography' });
                    }
                    if (n.memory) {
                        const memArray = Array.isArray(n.memory) ? n.memory : [];
                        memArray.forEach(m => {
                            candidates.push({ text: `[NPC MEMORY: ${n.name}] ${m.text || m}`, embedding: m.embedding, source: 'biography' });
                        });
                    }
                });
            }
        } else {
            const session = getCurrentSession();
            if (session) {
                const config = state.characters.find(c => c.id === state.activeCharId) || 
                               state.rooms.find(r => r.id === state.activeRoomId);
                if (config) {
                    if (state.activeRoomId) {
                        // Room Scenario Context
                        if (config.scenario) {
                            candidates.push({ text: `[ROOM SCENARIO] ${config.scenario}`, source: 'biography' });
                        }
                        // Room: collect all participant memories and bios
                        (config.characterIds || []).forEach(cid => {
                            const tc = state.characters.find(c => c.id === cid);
                            if (tc) {
                                if (tc.desc) {
                                    candidates.push({ text: `[${tc.name} DESCRIPTION] ${tc.desc}`, source: 'biography' });
                                }
                                if (tc.prompt) {
                                    candidates.push({ text: `[${tc.name} PROMPT] ${tc.prompt}`, source: 'biography' });
                                }
                                const memArray = Array.isArray(tc.memory) ? tc.memory : [];
                                memArray.forEach(m => {
                                    candidates.push({ text: `[${tc.name} MEMORY] ${m.text || m}`, embedding: m.embedding, source: 'biography' });
                                });
                            }
                        });
                    } else {
                        // Solo Character Description & Prompt Context
                        if (config.desc) {
                            candidates.push({ text: `[CHARACTER DESCRIPTION] ${config.desc}`, source: 'biography' });
                        }
                        if (config.prompt) {
                            candidates.push({ text: `[CHARACTER PROMPT] ${config.prompt}`, source: 'biography' });
                        }
                        // Solo: collect character memory
                        const memArray = Array.isArray(config.memory) ? config.memory : [];
                        memArray.forEach(m => {
                            candidates.push({ text: m.text || m, embedding: m.embedding, source: 'biography' });
                        });
                    }
                }
            }
        }
    }
    
    const statusEl = document.getElementById('vector-memory-status');
    if (statusEl && isWorld) {
        const sess = getCurrentWorldSession();
        const graph = window.HordeSidecarMemoryGraph?.graph?.(sess?.sidecar);
        const scoped = currentVectorTab === 'cognition' && document.getElementById('vector-character-filter')?.value
            ? candidates.filter(candidate => candidate.ref?.characterId === document.getElementById('vector-character-filter').value) : candidates;
        const missing = scoped.filter(candidate => !Array.isArray(candidate.ref?.embedding)).length;
        const stale = scoped.filter(candidate => candidate.ref?.embeddingNamespace && candidate.ref.embeddingNamespace !== HordeVectorMemory.namespace()).length;
        const prerequisites = graph ? `Prerequisites: ${graph.worldHistory.filter(record => Array.isArray(record.embedding)).length}/${graph.worldHistory.length} World History and ${graph.episodes.filter(record => Array.isArray(record.embedding)).length}/${graph.episodes.length} Episodes embedded.` : '';
        statusEl.textContent = `${scoped.length} record${scoped.length === 1 ? '' : 's'} in this view · ${missing} missing · ${stale} stale${prerequisites ? ` · ${prerequisites}` : ''}`;
    } else if (statusEl) statusEl.textContent = `${candidates.length} record${candidates.length === 1 ? '' : 's'} in this view.`;
    if (candidates.length === 0) {
        listContainer.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-3); font-style:italic;">No vector memories indexed in this category yet. Summarize the chat or proceed with roleplay to generate them!</div>`;
        return;
    }
    
    let displayList = [];
    
    // If user typed a query, perform a similarity match or keyword fallback match!
    if (filterQuery) {
        listContainer.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-3);">Calculating cosine similarity scores...</div>`;
        
        try {
            // Check cache for candidates missing embeddings to be fast
            for (const cand of candidates) {
                if (!cand.embedding) {
                    const key = `${HordeVectorMemory.namespace()}|${HordeVectorMemory.hashText(cand.text)}`;
                    if (HordeVectorMemory.cache.has(key)) {
                        cand.embedding = HordeVectorMemory.cache.get(key);
                    }
                }
            }
            
            const queryVec = await HordeVectorMemory.getCachedEmbedding(filterQuery);
            if (queryVec && !HordeVectorMemory.isFallbackActive) {
                displayList = candidates.map(cand => {
                    let score = 0;
                    if (Array.isArray(cand.embedding) && cand.embedding.length > 0
                        && (!cand.embeddingNamespace || cand.embeddingNamespace === HordeVectorMemory.namespace())) {
                        score = cosineSimilarity(queryVec, cand.embedding);
                    }
                    return {
                        text: cand.text,
                        score: score,
                        cached: !!cand.embedding,
                        ref: cand.ref,
                        type: cand.type,
                        status: cand.status,
                        importance: cand.importance,
                        sourceSessionId: cand.sourceSessionId,
                        pinned: cand.pinned
                    };
                });
                displayList.sort((a, b) => b.score - a.score);
            } else {
                // Fallback concept matching
                const cLower = filterQuery.toLowerCase();
                displayList = candidates.map(cand => {
                    const score = cand.text.toLowerCase().includes(cLower) ? 0.99 : 0.0;
                    return { ...cand, text: cand.text, score, cached: false, ref: cand.ref };
                });
                displayList.sort((a, b) => b.score - a.score);
            }
        } catch (e) {
            console.warn("Inspector search failed, falling back to keyword scoring:", e);
            const cLower = filterQuery.toLowerCase();
            displayList = candidates.map(cand => {
                const score = cand.text.toLowerCase().includes(cLower) ? 0.99 : 0.0;
                return { ...cand, text: cand.text, score, cached: false, ref: cand.ref };
            });
            displayList.sort((a, b) => b.score - a.score);
        }
    } else {
        displayList = candidates.map(c => ({
            text: c.text,
            score: null,
            cached: !!c.embedding,
            ref: c.ref,
            type: c.type,
            status: c.status,
            importance: c.importance,
            sourceSessionId: c.sourceSessionId,
            pinned: c.pinned
        }));
    }
    
    listContainer.innerHTML = "";
    displayList.forEach(item => {
        const card = document.createElement('div');
        card.style.background = 'var(--surface)';
        card.style.border = '1px solid var(--border)';
        card.style.borderRadius = '8px';
        card.style.padding = '12px 16px';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.gap = '8px';
        card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        card.style.transition = 'transform 0.2s, border-color 0.2s';
        
        // Dynamic hover effects
        card.onmouseenter = () => {
            card.style.borderColor = 'var(--accent)';
            card.style.transform = 'translateY(-1px)';
        };
        card.onmouseleave = () => {
            card.style.borderColor = 'var(--border)';
            card.style.transform = 'none';
        };
        
        // HSL Tag styling for score
        let scoreTag = "";
        if (item.score !== null) {
            const pct = Math.round(item.score * 100);
            let color = 'var(--red)';
            if (pct >= 70) color = 'var(--success)';
            else if (pct >= 40) color = 'var(--warning)';
            
            scoreTag = `<span style="font-size:0.7rem; font-weight:800; font-family:monospace; background:rgba(0,0,0,0.2); color:${color}; padding:2px 8px; border-radius:10px; border:1px solid ${color};">MATCH ${pct}%</span>`;
        }
        
        const cacheTag = item.cached
            ? `<span style="font-size:0.6rem; font-weight:800; text-transform:uppercase; color:var(--success); opacity:0.85;">⚡ EMBEDDED</span>`
            : `<span style="font-size:0.6rem; font-weight:800; text-transform:uppercase; color:var(--text-3); opacity:0.6;">⏳ RAW TEXT</span>`;

        // Legacy episodic records retain full edit controls. Sidecar cognition and
        // unresolved-place records are independently removable, but not silently
        // rewritten: regeneration preserves their source provenance.
        const editable = currentVectorTab === 'episodic' && item.ref && currentEpisodicStore
            && !(isWorld && window.HordeSidecarHooks?.isSidecarWorld?.(state.worlds.find(world => world.id === state.activeWorldId), getCurrentWorldSession()));
        const removableSidecarRecord = isWorld && ['episodic', 'cognition', 'unresolved'].includes(currentVectorTab)
            && item.ref && window.HordeSidecarHooks?.isSidecarWorld?.(state.worlds.find(world => world.id === state.activeWorldId), getCurrentWorldSession());
        const escaped = (item.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const actionBtns = editable ? `
            <div style="display:flex; gap:6px;">
                <button class="tool-btn epi-pin-btn" title="Keep this memory in recall" style="font-size:11px; padding:2px 8px;">${item.ref?.pinned ? '★ Pinned' : '☆ Pin'}</button>
                <button class="tool-btn epi-edit-btn" title="Edit memory" style="font-size:11px; padding:2px 8px;">✎ Edit</button>
                <button class="tool-btn tool-btn-danger epi-del-btn" title="Delete memory" style="font-size:11px; padding:2px 8px;">✕</button>
            </div>` : (removableSidecarRecord ? `
            <div style="display:flex; gap:6px;">
                <button class="tool-btn tool-btn-danger sidecar-memory-del-btn" title="Delete this derived record" style="font-size:11px; padding:2px 8px;">✕ Delete</button>
            </div>` : '');

        const metadata = item.ref ? [
            String(item.ref.type || 'episode').replace('_', ' '),
            item.ref.status || 'active',
            `importance ${Math.round((Number(item.ref.importance) || 0.5) * 100)}%`,
            item.ref.sourceSessionId ? `source ${item.ref.sourceSessionId}` : '',
            Number.isFinite(Number(item.ref.startIndex)) ? `messages ${item.ref.startIndex}–${item.ref.endIndex ?? '?'}` : ''
        ].filter(Boolean).join(' · ') : '';

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border2); padding-bottom:6px;">
                <div style="display:flex; gap:8px; align-items:center;">${cacheTag}${scoreTag}</div>
                ${actionBtns}
            </div>
            ${metadata ? `<div style="font-size:0.68rem; color:var(--text-3); text-transform:uppercase; letter-spacing:.04em;">${escapeHTML(metadata)}</div>` : ''}
            <div class="epi-text" style="font-size:0.9rem; line-height:1.5; color:var(--text); white-space:pre-wrap;">${escaped}</div>
            ${editable ? `<textarea class="form-textarea epi-edit-box" rows="6" style="display:none;">${escaped}</textarea>` : ''}
        `;

        if (editable) {
            const ref = item.ref;
            const textDiv = card.querySelector('.epi-text');
            const box = card.querySelector('.epi-edit-box');
            const editBtn = card.querySelector('.epi-edit-btn');
            const delBtn = card.querySelector('.epi-del-btn');
            const pinBtn = card.querySelector('.epi-pin-btn');

            pinBtn.onclick = async () => {
                ref.pinned = !ref.pinned;
                ref.updatedAt = Date.now();
                await saveState();
                renderVectorMemoryList(filterQuery);
            };

            delBtn.onclick = async () => {
                const i = currentEpisodicStore.indexOf(ref);
                if (i === -1) return;
                currentEpisodicStore.splice(i, 1);
                await saveState();
                renderVectorMemoryList(filterQuery);
                showToast('Memory deleted', 'success');
            };

            editBtn.onclick = async () => {
                const editing = box.style.display !== 'none';
                if (!editing) {
                    textDiv.style.display = 'none';
                    box.style.display = 'block';
                    box.focus();
                    editBtn.textContent = '✓ Save';
                } else {
                    const newText = box.value.trim();
                    if (!newText) return showToast('Memory text cannot be empty', 'error');
                    ref.text = newText;
                    try {
                        ref.embedding = await getEmbedding(newText);
                        ref.embeddingNamespace = HordeVectorMemory.namespace();
                        ref.updatedAt = Date.now();
                    } catch (e) {
                        console.warn('Re-embed failed, keeping text only:', e);
                        delete ref.embedding;
                    }
                    await saveState();
                    renderVectorMemoryList(filterQuery);
                    showToast('Memory updated', 'success');
                }
            };
        }

        if (removableSidecarRecord) {
            const delBtn = card.querySelector('.sidecar-memory-del-btn');
            delBtn.onclick = async () => {
                const sess = getCurrentWorldSession();
                const graph = window.HordeSidecarMemoryGraph?.graph?.(sess?.sidecar);
                if (!graph) return;
                if (currentVectorTab === 'cognition') {
                    graph.cognition = graph.cognition.filter(record => record !== item.ref);
                } else if (currentVectorTab === 'unresolved') {
                    graph.locationReferences = graph.locationReferences.filter(record => record !== item.ref);
                } else if (item.ref.kind === 'episode') {
                    graph.episodes = graph.episodes.filter(record => record !== item.ref);
                } else {
                    graph.worldHistory = graph.worldHistory.filter(record => record !== item.ref);
                }
                await saveState();
                renderVectorMemoryList(filterQuery);
                showToast('Derived memory removed.', 'success');
            };
        }

        listContainer.appendChild(card);
    });
}

/* ═══════════════════════════════════════════════════════════════════════
   SYNTHETIC COMPANIONS — a texting/DM simulator with a digital brain.

   Deliberately standalone from the World/NPC engine above: a companion is
   not an NPC in a world, it is a person with their own thread, their own
   evolving mood and memory, and their own simulated life running against
   real wall-clock time rather than turn counts. Everything here is a pure
   function wherever possible — mood decay, the life-tick, memory
   consolidation — so the whole brain can be exercised without a network
   call, the same discipline the World engine holds itself to.
   ═══════════════════════════════════════════════════════════════════════ */

