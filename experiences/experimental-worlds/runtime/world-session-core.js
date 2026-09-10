// --- Narrated outfit --------------------------------------------------------
// The outfit field only ever changed when the model called the tool, and until
// now nothing in the prompt told it to — so the usual case, prose describing
// the player getting changed with no tool call, left the HUD showing whatever
// they wore an hour ago. This is the same last line of defence that presence
// and location already have: if the prose plainly says it, believe the prose.

// What counts as the player putting something on. Deliberately narrow: it must
// be the PLAYER (you/your), and it must be an act of dressing.
const OUTFIT_CHANGE_PATTERNS = Object.freeze([
    // "you change into the red dress", "you slip into your armour"
    /\byou\b[^.!?]{0,30}\b(?:change|changed|slip|slipped|dress|dressed|shrug|shrugged)\s+(?:in)?to\s+([^.!?;]{3,80})/i,
    // "you pull on your boots", "you put on the cloak", "you don the mask"
    /\byou\b[^.!?]{0,20}\b(?:put|pull|throw|tug)\s+on\s+([^.!?;]{3,80})/i,
    /\byou\b[^.!?]{0,20}\bdon(?:ned)?\s+([^.!?;]{3,80})/i,
    // "you are now wearing …", "you're dressed in …"
    /\byou(?:'re| are)\s+(?:now\s+)?(?:wearing|dressed\s+in|clad\s+in)\s+([^.!?;]{3,80})/i,
    // "you strip out of the gown and into …" — take the destination
    /\byou\b[^.!?]{0,40}\bout\s+of\s+[^.!?;]{3,40}\s+and\s+into\s+([^.!?;]{3,80})/i
]);

// Losing the outfit is a change too, and has no "into what" to capture.
const OUTFIT_REMOVAL_PATTERN =
    /\byou\b[^.!?]{0,30}\b(?:strip|stripped|undress|undressed|peel|peeled)\b[^.!?]{0,20}\b(?:off|out of|down|naked|bare)\b/i;

// A garment phrase is a noun phrase; the sentence carrying on past the clothes
// is not. Detecting that by "contains an -ing word" was wrong — half of what
// people wear is a participle ("riding breeches", "travelling leathers",
// "evening gown"). A clause gives itself away by STARTING with the participle,
// or by having a subject doing something.
// A participle only starts a clause when something follows it as an object —
// "folding YOUR clothes", "leaving THE room". Followed by a plain noun it is
// describing the garment: "travelling leathers", "evening gown".
const OUTFIT_CLAUSE_START = new RegExp(
    '^(?:and\\s+)?(?:' +
        '\\w+ing\\s+(?:the|a|an|your|his|her|their|its|my|our|it|them)\\b' +
        '|(?:he|she|they|it|you|his|her|their|its|the|a|an)\\b[^,]{0,60}?\\b' +
          '(?:is|are|was|were|says?|said|moves?|moved|turns?|turned|looks?|looked' +
          '|watches?|watched|steps?|stepped|leaves?|left|stands?|stood|feels?|felt|hangs?|hung)\\b' +
    ')', 'i');

// What the player does next, once dressed. "and belt on the sword", "and pull
// the hood up" — a garment list never continues with one of these.
const OUTFIT_NEXT_ACTION = new RegExp(
    '\\s+and\\s+(?=(?:' +
        '\\S+\\s+(?:on|off|onto|into|over|around|up|out|to|at|through)\\b' +
        '|(?:pull|put|belt|buckle|strap|sling|pick|take|grab|head|leave|step|walk|cross' +
        '|tie|lace|fasten|sheathe|draw|push|open|close|climb|descend|ring|wait|turn|look|follow' +
        '|disappear|vanish|stride|hurry|slip|move|go|set)\\b' +
    '))', 'i');

/**
 * Cut a captured phrase back to just the clothes.
 *
 * Real narration runs on — "the grey dress, folding your own clothes into the
 * sack", "the court gown, and the Duchess-Regent's eyes move over you". A list
 * of garments is worth keeping ("a white shirt, black breeches and boots"), so
 * segments are kept while they still read as garments and dropped from the
 * first one that reads as the story continuing.
 */
function trimOutfitPhrase(phrase) {
    let text = String(phrase || '');
    // Cut the trailing clauses FIRST, so the garment scan below is judging
    // clothes rather than the rest of the sentence.
    // The next action: "…leathers and belt on the sword" is one garment and one
    // thing done afterwards; the following preposition gives it away. "black
    // and gold doublet" has none, so it survives.
    text = text.split(OUTFIT_NEXT_ACTION)[0];
    // And why they put it on: "a heavy wool cloak against the rain".
    text = text.split(/\s+(?:against|despite|because|for\s+(?:the\s+)?(?:warmth|cold|rain|journey|road|night|evening|occasion)|to\s+(?:keep|ward|hide|cover|stave))\b/i)[0];

    // What is left may still be a list of garments, which is worth keeping.
    const kept = [];
    for (const rawSegment of text.split(',')) {
        const segment = rawSegment.trim();
        if (!segment) break;
        // Once at least one garment has been captured, a relative clause is
        // narration about it, not another item: "the dress, which Maera left
        // out". Keep "that black dress" valid when it is the actual first
        // garment rather than treating every demonstrative as a clause.
        if (kept.length && /^(?:which|who|that)\b/i.test(segment)) break;
        if (OUTFIT_CLAUSE_START.test(segment)) break;
        // Real outfits are often a coordinated list without commas ("a thin
        // pair of boxer shorts and an old tshirt"). Action/scene clauses have
        // already been cut by OUTFIT_NEXT_ACTION and OUTFIT_CLAUSE_START, so a
        // six-word ceiling discarded valid clothing far more often than it
        // protected us. Keep the capture bounded, but allow a natural outfit.
        if (segment.split(/\s+/).length > 14) break;
        kept.push(segment);
        if (kept.length >= 4) break;
    }
    return kept.join(', ').replace(/[,;:.\s]+$/, '').trim();
}

function normalizeOutfitItem(phrase) {
    const item = trimOutfitPhrase(String(phrase || '')
        .replace(/\s+/g, ' ')
        .replace(/^(?:my|your|the|a|an|some)\s+/i, '')
        .trim());
    if (item.length < 2 || item.length > 100) return '';
    if (/^(?:it|them|this|that|something|anything|nothing|clothes?)$/i.test(item)) return '';
    return item;
}

/**
 * Player-authored clothing is authoritative input, not something the model
 * should have to remember to repeat in a tool call. Return a small operation so
 * putting on boots adds boots, taking off a coat removes only the coat, while
 * changing into an outfit replaces the full description.
 */
function detectPlayerOutfitIntent(input) {
    const prose = stripSpokenDialogue(String(input || '')).replace(/[*_~]/g, ' ');
    if (!prose.trim()) return null;
    // Deterministic state only follows completed first-person actions. Attempts,
    // refusals, hypotheticals and explicit negation belong to narration.
    if (/\bI\b[^.!?]{0,35}\b(?:try|tries|tried|attempt|attempted|want|wanted|plan|planned|might|may|could|would|refuse|refused|don['’]?t|do not|didn['’]?t|did not|never)\b[^.!?]{0,40}\b(?:change|dress|slip|swap|put|pull|throw|tug|don|wrap|fasten|buckle|strap|take|peel|strip|undress)\b/i.test(prose)) {
        return null;
    }
    const replacePatterns = [
        /\bI\b[^.!?]{0,25}\b(?:change|changed|slip|slipped|dress|dressed)\s+(?:in)?to\s+([^.!?;]{2,100})/i,
        // Treat explicit first-person clothing declarations as authoritative.
        // Players routinely type contractions without apostrophes ("im wearing")
        // or with a curly apostrophe; neither should require the model to repeat
        // the same fact in a tool call before the HUD can reflect it.
        /\bI(?:\s+am|['’]?m)\s+(?:now\s+)?(?:wearing|dressed\s+in|clad\s+in)\s+([^.!?;]{2,100})/i,
        /\bI\s+have\s+([^.!?;]{2,100}?)\s+on\b/i,
        /\bmy\s+(?:current\s+)?outfit\s+is\s+([^.!?;]{2,100})/i,
        /\bI\b[^.!?]{0,25}\b(?:swap|swapped)\s+(?:my\s+)?(?:outfit|clothes?)\s+(?:for|to)\s+([^.!?;]{2,100})/i
    ];
    for (const pattern of replacePatterns) {
        const match = prose.match(pattern);
        const item = normalizeOutfitItem(match?.[1]);
        if (item) return { mode: 'replace', item };
    }
    const addPatterns = [
        /\bI\b[^.!?]{0,20}\b(?:put|pull|throw|tug|slip|slipped)\s+on\s+([^.!?;]{2,100})/i,
        /\bI\b[^.!?]{0,20}\bdon(?:ned)?\s+([^.!?;]{2,100})/i,
        /\bI\b[^.!?]{0,20}\b(?:wrap|wrapped|fasten|fastened|buckle|buckled|strap|strapped)\s+([^.!?;]{2,100}?)(?:\s+(?:around|over|onto)\b|$)/i
    ];
    for (const pattern of addPatterns) {
        const match = prose.match(pattern);
        const item = normalizeOutfitItem(match?.[1]);
        if (item) return { mode: 'add', item };
    }
    const remove = prose.match(
        /\bI\b[^.!?]{0,20}\b(?:take|took|pull|pulled|slip|slipped|peel|peeled|throw|threw)\s+off\s+([^.!?;]{2,100})/i);
    if (remove) {
        const item = normalizeOutfitItem(remove[1]);
        if (item) return { mode: 'remove', item };
    }
    if (/\bI\b[^.!?]{0,25}\b(?:strip|stripped|undress|undressed|get|got)\b[^.!?]{0,20}\b(?:naked|undressed|bare|out of my clothes)\b/i.test(prose)) {
        return { mode: 'clear', item: '' };
    }
    return null;
}

function applyPlayerOutfitIntent(sess, input) {
    const intent = detectPlayerOutfitIntent(input);
    if (!intent) return null;
    const previous = String(sess.outfit || '').trim();
    let next = previous;
    if (intent.mode === 'replace') {
        next = intent.item;
    } else if (intent.mode === 'clear') {
        next = 'Undressed.';
    } else if (intent.mode === 'add') {
        const alreadyWorn = previous.toLowerCase().includes(intent.item.toLowerCase());
        next = alreadyWorn ? previous : [previous, intent.item].filter(Boolean).join(', ');
    } else if (intent.mode === 'remove') {
        const escaped = intent.item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        next = previous
            .replace(new RegExp(`(?:^|,|\\band\\b)\\s*(?:the\\s+|a\\s+|an\\s+)?${escaped}\\s*(?=,|\\band\\b|$)`, 'ig'), '')
            .replace(/\s*,\s*,+/g, ', ')
            .replace(/^\s*(?:,|and)\s*|\s*(?:,|and)\s*$/gi, '')
            .trim();
        if (next === previous && previous.toLowerCase().includes(intent.item.toLowerCase())) {
            next = previous.replace(new RegExp(escaped, 'ig'), '').replace(/\s*,\s*,+/g, ', ').trim();
        }
        if (!next) next = 'Undressed.';
    }
    next = String(next || '').replace(/\s+/g, ' ').replace(/^,\s*|\s*,$/g, '').slice(0, 240);
    if (!next || next.toLowerCase() === previous.toLowerCase()) return null;
    sess.outfit = next;
    console.log(`Horde Engine: Player-authored outfit ${intent.mode} — "${previous}" → "${next}".`);
    return { from: previous, to: next, mode: intent.mode, item: intent.item };
}

/**
 * Read a change of clothes out of the prose. Returns the new outfit text, or
 * null when the narration says nothing definite — a wrong guess here would
 * dress the player in something they never put on, so anything ambiguous is
 * left alone for the tool call to settle.
 */
function detectNarratedOutfit(narrative) {
    // Dialogue is somebody TALKING about clothes, not the player changing.
    const prose = stripSpokenDialogue(String(narrative || ''));
    if (!prose.trim()) return null;

    for (const pattern of OUTFIT_CHANGE_PATTERNS) {
        const match = pattern.exec(prose);
        if (!match) continue;
        let outfit = String(match[1] || '')
            .replace(/\s+/g, ' ')
            .replace(/^(?:your|the|a|an|some)\s+/i, '')
            .replace(/[,;:]\s*$/, '')
            .trim();
        outfit = trimOutfitPhrase(outfit);
        if (outfit.length < 3 || outfit.length > 80) continue;
        // A pronoun or a bare verb is not a garment.
        if (/^(?:it|them|this|that|him|her|something|anything|nothing)$/i.test(outfit)) continue;
        return outfit;
    }
    if (OUTFIT_REMOVAL_PATTERN.test(prose)) return 'Undressed.';
    return null;
}

function applyNarratedOutfit(sess, narrative) {
    const detected = detectNarratedOutfit(narrative);
    if (!detected) return null;
    const previous = String(sess.outfit || '');
    // Do not churn the field when the prose merely restates what they wear.
    if (previous.trim().toLowerCase() === detected.trim().toLowerCase()) return null;
    sess.outfit = detected;
    console.warn(`Horde Engine: the prose changed the player's outfit but no outfit_update was recorded — set to "${detected}".`);
    return { from: previous, to: detected };
}

function applyNarratedPresence(world, sess, narrative) {
    const detected = detectNarratedPresence(world, sess, narrative);
    detected.forEach(hit => {
        sess.entityStates[hit.id].location = sess.playerLocation;
        // The narration explicitly placed them here. Give that placement the
        // same authority as npc_moves so the next schedule sync cannot
        // immediately teleport them back out and make the cast flicker.
        sess.entityStates[hit.id].pinnedUntilTurn = (sess.turnCount || 1) + 6;
        console.warn(`Horde Engine: "${hit.name}" was narrated present but never recorded — pulled into the scene ("${hit.evidence}").`);
    });
    return detected;
}

function rollForScenePopulation(locationId, persist = true) {
    const world = ExperimentalWorldsState.worlds.find(w => w.id === ExperimentalWorldsState.activeWorldId);
    const sess = getCurrentWorldSession();
    if (!world || !sess) return;
    if (!normalizeWorldGameRules(world).modules.livingWorld) return;

    console.log(`Horde Engine: Rolling for scene density at ${locationId}`);

    // Every other subsystem draws from stableWorldRoll so that restoring a
    // snapshot and replaying a turn reproduces it exactly. Scene population is
    // replayed on reroll too (via applyUserDirectedMovement), so it seeds from
    // the same turn coordinates instead of Math.random — otherwise rerolling
    // silently rewrites who is standing in the room.
    const sceneSeed = `${world.id}|${sess.id}|${sess.turnCount || 1}|${locationId}`;

    // 1. Determine how many "extra" people should be here (0 to 3)
    const densityRoll = Math.floor(stableWorldRoll(`${sceneSeed}|density`) * 4); // 0, 1, 2, or 3
    if (densityRoll === 0) return;

    // 2. Get NPCs that are "eligible" to be in this room
    const availableNPCs = world.entities.filter(ent => {
        if (ent.type !== 'npc') return false;
        if (!isVisibleToSession(ent, sess)) return false; // other timeline's NPC
        const entState = sess.entityStates[ent.id];
        if (!entState) return false;
        if (!isNpcActive(entState)) return false;         // the dead don't wander

        // Don't pull NPCs already here
        if (entState.location === locationId) return false;

        // ARBITRATION: never randomly teleport an NPC the narrative placed somewhere,
        // and never override NPCs whose whereabouts a schedule governs.
        if (isNpcPinned(sess, entState)) return false;
        const hasTimelineSchedule = Object.prototype.hasOwnProperty.call(sess.npcScheduleOverrides || {}, ent.id)
            && sess.npcScheduleOverrides[ent.id].length > 0;
        if (hasTimelineSchedule || (world.hudConfig?.enableSchedules && ent.schedule && ent.schedule.length > 0)) return false;

        // Resident Logic: Are they "Home"?
        // Home may be written as an id or a name, in any casing, so resolve it
        // the same way every other location reference in the engine is.
        const homeRef = ent.homeLocation || ent.startLocation;
        const belongsHere = !!homeRef && getLocationRef(world, homeRef)?.id === locationId;
        const npcRoll = stableWorldRoll(`${sceneSeed}|${ent.id}`);

        if (belongsHere) {
            // Time-based probability
            const hour = getWorldTimeData(world, sess).hours24;
            const isNight = hour < 8 || hour >= 20; // 8 PM to 8 AM

            const homeChance = isNight ? 0.95 : 0.50; // 95% at night, 50% during day
            return npcRoll < homeChance;
        }

        // Wanderer Logic
        const isMentionedElsewhere = world.locations.some(l => l.description && l.description.toLowerCase().includes(ent.name.toLowerCase()));
        const isWanderer = !homeRef && !isMentionedElsewhere;

        // 15% chance for a wanderer to appear
        return isWanderer && npcRoll < 0.15;
    });

    // 3. Order deterministically and pick. (A `0.5 - random()` comparator is
    // both non-uniform and inconsistent, which some engines reject outright.)
    const selected = [...availableNPCs]
        .sort((a, b) => stableWorldRoll(`${sceneSeed}|pick|${a.id}`) - stableWorldRoll(`${sceneSeed}|pick|${b.id}`))
        .slice(0, densityRoll);

    selected.forEach(npc => {
        if (sess.entityStates[npc.id]) {
            sess.entityStates[npc.id].location = locationId;
            // Presence must be storytold, never silent — tell the DM they're here.
            queueEngineEvent(sess, `${npc.name} is present in this location — establish their presence naturally in the scene.`);
            console.log(`Horde Engine: Living World — ${npc.name} moved to scene.`);
        }
    });

    if (persist) ExperimentalWorldsHost.persist().catch(() => {});
}

// --- Session-scoped world views ---
// NPCs improvised mid-story (npc_introduced) belong to the timeline that created
// them; other timelines never see them. Template NPCs (no sessionOrigin) are
// global. Locations stay global by design: timelines share geography, not people.
function isVisibleToSession(item, sess) {
    return !item.sessionOrigin || !sess || item.sessionOrigin === sess.id;
}
function sessionNpcs(world, sess) {
    return world.entities.filter(e => e.type === 'npc' && isVisibleToSession(e, sess));
}

function sessionLocations(world, sess) {
    const extras = experimentalIsPlainObject(sess?.dynamicExits) ? sess.dynamicExits : {};
    return (world.locations || []).filter(location => isVisibleToSession(location, sess)).map(location => {
        const added = Array.isArray(extras[location.id]) ? extras[location.id] : [];
        return added.length ? { ...location, exits: [...(Array.isArray(location.exits) ? location.exits : []), ...added] } : location;
    });
}

function worldForSession(world, sess) {
    return { ...world, locations: sessionLocations(world, sess), entities: world.entities };
}

function addSessionDynamicExit(sess, fromLocationId, targetName) {
    if (!sess || !fromLocationId || !targetName) return;
    if (!experimentalIsPlainObject(sess.dynamicExits)) sess.dynamicExits = {};
    const exits = Array.isArray(sess.dynamicExits[fromLocationId]) ? sess.dynamicExits[fromLocationId] : [];
    const wanted = `to ${String(targetName).trim()}`;
    if (!exits.some(exit => getExitTargetName(exit).toLowerCase() === String(targetName).trim().toLowerCase())) exits.push(wanted);
    sess.dynamicExits[fromLocationId] = exits.slice(0, 100);
}

function rotatingWorldWindow(items, limit, turn = 0) {
    if (!Array.isArray(items) || items.length <= limit) return Array.isArray(items) ? [...items] : [];
    const start = Math.abs(Math.trunc(Number(turn) || 0) * Math.max(1, limit)) % items.length;
    return Array.from({ length: limit }, (_, index) => items[(start + index) % items.length]);
}

function selectForegroundNpcs(world, sess, allPresent, userInput, limit = 16) {
    if (allPresent.length <= limit) return allPresent;
    const input = String(userInput || '').toLowerCase();
    const scored = allPresent.map(npc => {
        const entState = sess.entityStates?.[npc.id] || {};
        let score = npc.isMajor ? 100 : 0;
        if (input && npcReferenceVariants(npc).some(name => name.length > 1 && input.includes(name))) score += 200;
        if (entState.relationshipToPlayer) score += 50;
        if (entState.interactingWith?.includes('player')) score += 80;
        score += Math.min(20, (entState.observations || []).length);
        return { npc, score };
    });
    const priority = scored.filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
    const chosen = new Set(priority.map(item => item.npc.id));
    const rotating = rotatingWorldWindow(scored.filter(item => !chosen.has(item.npc.id)), limit - priority.length, sess.turnCount || 0);
    return [...priority.map(item => item.npc), ...rotating.map(item => item.npc)];
}

function normalizedNpcNameParts(name) {
    const clean = String(name || '').toLowerCase()
        .replace(/[’']/g, '')
        .replace(/[^a-z0-9\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    while (parts.length > 1 && NAME_TITLES.test(parts[0])) parts.shift();
    return { clean, parts };
}

function npcReferenceVariants(npc) {
    const { clean, parts } = normalizedNpcNameParts(npc?.name);
    const aliases = Array.isArray(npc?.aliases) ? npc.aliases : [];
    return [...new Set([
        clean,
        parts.join(' '),
        parts[0],
        parts.length > 1 ? parts[parts.length - 1] : '',
        ...aliases.map(alias => normalizedNpcNameParts(alias).clean)
    ].filter(value => value && value.length >= 3))];
}

function findReferencedWorldNpcs(world, sess, text) {
    const haystack = ` ${normalizedNpcNameParts(text).clean} `;
    if (!haystack.trim()) return [];
    return sessionNpcs(world, sess).filter(npc =>
        npcReferenceVariants(npc).some(variant => haystack.includes(` ${variant} `)));
}

// A mention is useful context without being a presence assertion. Keep this
// small derived list for the HUD so a character like Sarah can be visibly
// involved/nearby while remaining correctly absent from the physical cast.
function findRecentlyMentionedWorldNpcs(world, sess, presentIds = new Set()) {
    const mentioned = new Map();
    (sess?.history || []).slice(-8).forEach(message => {
        findReferencedWorldNpcs(world, sess, canonicalMsgText(message)).forEach(npc => {
            if (!presentIds.has(npc.id) && isNpcActive(sess.entityStates?.[npc.id])) mentioned.set(npc.id, npc);
        });
    });
    return [...mentioned.values()].slice(0, 8);
}

// Death is permanent: dead/gone NPCs are excluded from schedules, population,
// and scene presence until the DM explicitly changes their status back.
function isNpcActive(entState) {
    return !entState || (entState.status !== 'dead' && entState.status !== 'gone');
}

function resolveNpcId(world, llmNpcId, sess = null) {
    if (!llmNpcId) return null;
    const rawQuery = String(llmNpcId).trim().toLowerCase();
    const query = normalizedNpcNameParts(llmNpcId).clean;
    const pool = (sess ? world.entities.filter(e => isVisibleToSession(e, sess)) : world.entities)
        .filter(e => e.type === 'npc');

    // 1. Direct ID match
    let npc = pool.find(e => String(e.id || '').toLowerCase() === rawQuery);

    // 2. Exact full name or declared alias.
    if (!npc) {
        const exactMatches = pool.filter(e => npcReferenceVariants(e).includes(query));
        if (exactMatches.length === 1) npc = exactMatches[0];
    }

    // 3. A partial name is accepted only when it identifies one person.
    // `find()` used to send every "Sister" or shared surname to whichever NPC
    // happened to be first in the array.
    if (!npc) {
        const matches = pool.filter(e => npcReferenceVariants(e).some(variant =>
            variant.includes(query) || query.includes(variant)));
        if (matches.length === 1) npc = matches[0];
    }

    return npc ? npc.id : null;
}

const CHECK_GUARDED_ACTION_FIELDS = Object.freeze([
    'location_id', 'location_introduced', 'time_skip_minutes', 'transactions',
    'inventory_add', 'inventory_remove', 'stat_changes', 'capability_progress', 'player_condition_updates',
    'outfit_update', 'player_identity_update', 'quests_update', 'npc_moves',
    'npc_introduced', 'npc_goal_updates', 'npc_disposition_changes',
    'npc_relationship_updates', 'npc_observations', 'world_events',
    'location_state_updates', 'faction_updates', 'economy_updates',
    'schedule_updates', 'player_preference_updates', 'relationship_update',
    'relationship_event', 'memory_write', 'ledger_update'
]);

function sanitizeCheckOutcomeActions(raw) {
    if (!experimentalIsPlainObject(raw)) return null;
    const clean = {};
    CHECK_GUARDED_ACTION_FIELDS.forEach(field => {
        if (raw[field] !== undefined) clean[field] = experimentalSafeJsonClone(raw[field]);
    });
    return Object.keys(clean).length ? clean : null;
}

function processStructuredActions(args, explicitWorld = null, explicitSession = null, options = {}) {
    // Optional explicit targets let the background World Agent finish safely
    // even if the player switches sessions while its request is in flight.
    // Optional trailing context is internal; ordinary callers may still use
    // the original one-argument form.
    const world = explicitWorld || ExperimentalWorldsState.worlds.find(w => w.id === ExperimentalWorldsState.activeWorldId);
    const sess = explicitSession || getCurrentWorldSession();
    if (!world || !sess) return null;
    normalizeLivingWorldState(world, sess);
    normalizePlayerRulesState(world, sess);
    const modules = normalizeWorldGameRules(world).modules;
    const sidecarCommit = options?.sidecar === true;
    let ledgerEntry = null;
    let movementResult = null;
    let statResult = null;
    let transactionResults = [];
    let checkResults = [];
    let checkOutcomeResults = [];
    let capabilityProgressResults = [];
    let conditionResults = [];
    const moduleRejections = [];
    const rejectDisabledField = (field, module) => {
        if (args[field] !== undefined && args[field] !== null
            && (!Array.isArray(args[field]) || args[field].length > 0)) {
            moduleRejections.push({ field, module, reason: 'module_disabled' });
        }
    };

    // Resolve uncertainty before touching any result-dependent state. A model
    // must place those mutations in on_success/on_failure. Any guarded field at
    // the same level as a check is rejected, preventing a failed roll from
    // accidentally committing the successful outcome.
    if (Array.isArray(args.checks) && args.checks.length) {
        const requestedChecks = args.checks.slice(0, 10);
        checkResults = performAuthoritativeChecks(world, sess, requestedChecks);
        checkResults.forEach((result, index) => {
            if (result.pending || result.reason) return;
            const requested = requestedChecks[index] || {};
            const branch = sanitizeCheckOutcomeActions(result.success ? requested.on_success : requested.on_failure);
            if (branch) checkOutcomeResults.push(processStructuredActions(branch, world, sess, options));
        });
        const guarded = { ...args };
        delete guarded.checks;
        CHECK_GUARDED_ACTION_FIELDS.forEach(field => {
            if (guarded[field] !== undefined) {
                moduleRejections.push({ field, module: 'checks', reason: 'unconditional_update_beside_check' });
                delete guarded[field];
            }
        });
        args = guarded;
    }

    if (Array.isArray(args.capability_progress) && args.capability_progress.length) {
        capabilityProgressResults = applyWorldCapabilityProgress(world, sess, args.capability_progress);
    }

    // --- DYNAMIC WORLD GROWTH: register new locations FIRST so a move to
    // a just-introduced location in the same tool call resolves correctly.
    if (args.location_introduced && Array.isArray(args.location_introduced)) {
        args.location_introduced.forEach(li => {
            const explicitSeparatePromotion = String(options?.scenePulseSeparatePromotionId || '')
                && String(li?.scenePulseSeparatePromotionId || '') === String(options.scenePulseSeparatePromotionId);
            if (!li.name || (!explicitSeparatePromotion && findFuzzyLocation(li.name, sessionLocations(world, sess)))) return; // already exists here
            const requestedId = String(li.id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
            const newLoc = {
                id: requestedId && !world.locations.some(location => location.id === requestedId)
                    ? requestedId : 'loc_' + Date.now() + Math.floor(Math.random() * 1000),
                name: li.name.trim(),
                region: (li.region || '').trim(),
                mapType: ['region', 'route', 'building', 'outdoor', 'room', 'area'].includes(li.map_type) ? li.map_type : '',
                parentLocationId: '',
                mapFloor: String(li.floor || '').trim().slice(0, 80),
                description: li.description || 'A newly discovered place.',
                hiddenDescription: '',
                exits: [],
                secrets: [],
                sessionOrigin: sess.id
            };
            // Link exits both ways to an anchor (stated connection, else current location)
            const visibleLocations = sessionLocations(world, sess);
            const anchor = (li.connects_to && findFuzzyLocation(li.connects_to, visibleLocations))
                || visibleLocations.find(l => l.id === sess.playerLocation);
            const mapParent = li.parent_location_id && findFuzzyLocation(li.parent_location_id, visibleLocations);
            if (mapParent) newLoc.parentLocationId = mapParent.id;
            if (anchor) {
                newLoc.exits.push(`to ${anchor.name}`);
                addSessionDynamicExit(sess, anchor.id, newLoc.name);
            }
            world.locations.push(newLoc);
            ExperimentalWorldsHost.notify(`🗺️ New location discovered: ${newLoc.name}`, 'success');
            if (document.getElementById('w-locations-list') && typeof renderWorldLocations === 'function' && ExperimentalWorldsState.editingWorld?.id === world.id) {
                renderWorldLocations();
            }
        });
    }

    if (args.location_id) {
        const playerState = normalizePlayerRulesState(world, sess);
        const targetLoc = findFuzzyLocation(args.location_id, sessionLocations(world, sess));
        if (playerState.status !== 'active') {
            movementResult = { ok: false, moved: false, reason: playerState.status, path: [] };
        } else if (targetLoc) {
            movementResult = movePlayerAlongWorldPath(world, sess, targetLoc);
            if (movementResult.moved) {
                ExperimentalWorldsHost.notify(`Moved to ${targetLoc.name}`, 'info');
            } else if (!movementResult.ok) {
                console.warn(`Horde Engine: rejected unreachable player move from ${sess.playerLocation} to ${targetLoc.id}`);
            }
        } else {
            movementResult = { ok: false, moved: false, reason: 'unknown_destination', path: [] };
            console.warn(`Horde Engine: LLM attempted to move player to unknown location_id: ${args.location_id}`);
        }
    }

    if (args.time_skip_minutes !== undefined && args.time_skip_minutes !== null) {
        const skip = parseInt(args.time_skip_minutes) || 0;
        if (skip > 0) {
            sess.bonusTimeMinutes = (sess.bonusTimeMinutes || 0) + skip;
            const hrs = Math.floor(skip / 60);
            const mins = skip % 60;
            let timeStr = hrs > 0 ? `${hrs}h${mins > 0 ? ` ${mins}m` : ''}` : `${mins}m`;
            ExperimentalWorldsHost.notify(`Time advanced by ${timeStr}`, 'info');
            // The clock just jumped past events scheduled inside the skipped
            // window (a dawn raid during an eight-hour sleep). Fire them now,
            // in the turn that skipped, rather than one action later.
            if (!sidecarCommit) {
                runLivingWorldTick(world, sess);
                syncNPCSchedules(world, sess);
            }
        }
    }

    if (Array.isArray(args.transactions)) {
        transactionResults = executeCommerceTransactions(world, sess, args.transactions);
        // A refused trade used to vanish: the fiction said money changed hands
        // and the purse never moved. Say why, loudly enough to act on.
        transactionResults.filter(result => !result.success).forEach(result => {
            const explanation = {
                currency_not_configured: 'this world has no currency stat — set one in World Studio → HUD & Stats',
                no_market_and_no_price: 'no market here and the DM gave no price',
                item_not_sold_here: 'that item is not stocked at this location',
                ambiguous_item: 'the item name matched more than one thing in stock',
                cannot_afford: 'not enough funds',
                insufficient_stock: 'the seller does not have that many',
                item_not_owned: 'the player does not own that',
                module_disabled: 'the commerce module is off for this world'
            }[result.reason] || result.reason;
            console.warn(`Horde Engine: transaction refused (${result.type} ${result.item}) — ${explanation}.`);
            if (result.reason === 'currency_not_configured' || result.reason === 'no_market_and_no_price') {
                ExperimentalWorldsHost.notify(`Purchase not settled: ${explanation}.`, 'warning');
            }
        });
    }

    if (Array.isArray(args.player_condition_updates)) {
        conditionResults = applyPlayerConditionUpdates(world, sess, args.player_condition_updates);
    }
    
    if (modules.inventory && args.inventory_add && Array.isArray(args.inventory_add)) {
        args.inventory_add.forEach(value => {
            const item = globalThis.ExperimentalWorldsRpgMechanics?.normalizeItem(value) || value;
            const name = globalThis.ExperimentalWorldsRpgMechanics?.itemName(item) || String(item || '');
            if (!globalThis.ExperimentalWorldsRpgMechanics?.findItem(sess.inventory, name)) {
                sess.inventory.push(item);
                ExperimentalWorldsHost.notify(`Item taken: ${name}`, 'info');
            }
        });
    }

    if (modules.inventory && args.inventory_remove && Array.isArray(args.inventory_remove)) {
        args.inventory_remove.forEach(item => {
            const target = String(item || '').trim().toLowerCase();
            if (!target) return;
            // Fuzzy match: the LLM may say "potion" for "healing potion"
            const nameOf = value => (globalThis.ExperimentalWorldsRpgMechanics?.itemName(value) || String(value || '')).toLowerCase();
            let idx = sess.inventory.findIndex(i => nameOf(i) === target);
            if (idx === -1) idx = sess.inventory.findIndex(i => nameOf(i).includes(target) || target.includes(nameOf(i)));
            if (idx !== -1) {
                const removed = sess.inventory.splice(idx, 1)[0];
                Object.keys(sess.equipment || {}).forEach(slot => { if (sess.equipment[slot] === removed?.id) sess.equipment[slot] = null; });
                ExperimentalWorldsHost.notify(`Item removed: ${globalThis.ExperimentalWorldsRpgMechanics?.itemName(removed) || removed}`, 'info');
            }
        });
    }

    if (args.stat_changes && typeof args.stat_changes === 'object') {
        statResult = applyPlayerStatChanges(world, sess, args.stat_changes, {
            cause: String(args.stat_change_cause || 'The player suffered a lasting consequence.').slice(0, 240)
        });
    }

    if (args.outfit_update) {
        sess.outfit = args.outfit_update;
        ExperimentalWorldsHost.notify('Outfit Updated', 'info');
    }

    if (experimentalIsPlainObject(args.player_identity_update)) {
        const update = args.player_identity_update;
        const identity = experimentalIsPlainObject(sess.playerIdentity) ? sess.playerIdentity : (sess.playerIdentity = {});
        if (!experimentalIsPlainObject(sess.legalStanding)) sess.legalStanding = {};
        const setText = (source, target, limit) => {
            if (update[source] !== undefined) identity[target] = String(update[source] || '').slice(0, limit);
        };
        setText('role', 'role', 100);
        setText('social_rank', 'socialRank', 80);
        setText('title', 'title', 120);
        setText('legal_status', 'legalStatus', 100);
        if (update.faction_id !== undefined) {
            const query = String(update.faction_id || '').trim().toLowerCase();
            const faction = sess.factions.find(item =>
                item.id.toLowerCase() === query || item.name.toLowerCase() === query);
            identity.factionId = faction?.id || '';
        }
        const mutateList = (target, additions, removals) => {
            const current = new Set((Array.isArray(identity[target]) ? identity[target] : [])
                .map(item => String(item || '').trim()).filter(Boolean));
            (Array.isArray(additions) ? additions : []).forEach(item => {
                const value = String(item || '').trim();
                if (value) current.add(value.slice(0, 200));
            });
            const removeKeys = new Set((Array.isArray(removals) ? removals : [])
                .map(item => String(item || '').trim().toLowerCase()).filter(Boolean));
            identity[target] = [...current].filter(item => !removeKeys.has(item.toLowerCase())).slice(0, 40);
        };
        mutateList('privileges', update.privileges_add, update.privileges_remove);
        mutateList('obligations', update.obligations_add, update.obligations_remove);
        mutateList('holdings', update.holdings_add, update.holdings_remove);
        if (identity.factionId && update.legal_status !== undefined) {
            const standing = sess.legalStanding[identity.factionId] || {
                heat: 0, crimes: [], lastChangedTurn: 0
            };
            standing.status = identity.legalStatus;
            if (update.heat_change !== undefined) {
                standing.heat = livingClamp((standing.heat || 0) + Number(update.heat_change || 0), 0, 100);
            }
            if (update.crime) {
                standing.crimes = [...(Array.isArray(standing.crimes) ? standing.crimes : []),
                    String(update.crime).slice(0, 200)].slice(-30);
            }
            standing.lastChangedTurn = sess.turnCount || 1;
            sess.legalStanding[identity.factionId] = standing;
        }
        const reason = String(update.reason || '').trim().slice(0, 240);
        if (reason) {
            appendWorldLedgerEntry(sess, `Status changed: ${reason}`);
            ExperimentalWorldsHost.notify('Social position changed', 'info');
        }
    }

    if (args.ledger_update) {
        ledgerEntry = appendWorldLedgerEntry(sess, args.ledger_update);
        if (ledgerEntry) ExperimentalWorldsHost.notify('Ledger Updated', 'info');
    }

    if (args.label) {
        if (!sess.revealedSecrets) sess.revealedSecrets = [];
        if (!sess.revealedSecrets.includes(args.label)) {
            sess.revealedSecrets.push(args.label);
            ExperimentalWorldsHost.notify(`Secret Uncovered: ${args.label}`, 'success');
        }
    }

    if (args.threads_update && Array.isArray(args.threads_update)) {
        if (!sess.threads) sess.threads = [];
        args.threads_update.forEach(t => {
            if (!t.id || !t.text) return;
            const existing = sess.threads.find(x => x.id === t.id);
            if (existing) {
                existing.text = t.text;
                if (t.status) existing.status = t.status;
                if (t.status === 'resolved') ExperimentalWorldsHost.notify(`🧵 Thread resolved: ${t.text.slice(0, 50)}`, 'success');
            } else {
                sess.threads.push({ id: t.id, text: String(t.text).slice(0, 200), status: t.status || 'open', turnOpened: sess.turnCount || 1 });
                ExperimentalWorldsHost.notify(`🧵 New story thread`, 'info');
            }
        });
    }

    if (modules.schedules && args.schedule_updates && Array.isArray(args.schedule_updates)) {
        args.schedule_updates.forEach(update => {
            const npcId = resolveNpcId(world, update?.npc_id, sess);
            if (!npcId || !Array.isArray(update.blocks)) return;
            const validBlocks = update.blocks.map(block => {
                const location = getLocationRef(world, block?.location_id);
                const time = String(block?.time || '');
                if (!location || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
                const days = (Array.isArray(block.days) ? block.days : (block.day ? [block.day] : []))
                    .map(day => String(day || '').trim()).filter(Boolean).slice(0, 7);
                return { time, locationId: location.id, activity: String(block.activity || '').slice(0, 160), ...(days.length ? { days } : {}) };
            }).filter(Boolean);
            const existing = Array.isArray(sess.npcScheduleOverrides[npcId]) ? sess.npcScheduleOverrides[npcId] : [];
            const combined = update.replace === false ? [...existing, ...validBlocks] : validBlocks;
            const byTime = new Map();
            combined.forEach(block => byTime.set(block.time, block));
            sess.npcScheduleOverrides[npcId] = [...byTime.values()]
                .sort((a, b) => a.time.localeCompare(b.time))
                .slice(0, 1000);
            if (update.reason) {
                const entState = sess.entityStates[npcId] || (sess.entityStates[npcId] = { location: sess.playerLocation, observations: [] });
                entState.observations = entState.observations || [];
                entState.observations.push({
                    id: livingId('obs', `${npcId}_schedule_${sess.turnCount || 1}`),
                    text: `[Schedule changed] ${String(update.reason).slice(0, 240)}`,
                    turn: sess.turnCount || 1
                });
            }
        });
    }

    if (modules.livingWorld && args.world_events && Array.isArray(args.world_events)) {
        const now = getWorldTimeData(world, sess);
        args.world_events.forEach(update => {
            if (!update || (!update.id && !update.title)) return;
            const id = String(update.id || livingId('event', update.title)).slice(0, 80);
            let event = sess.scheduledEvents.find(item => item.id === id);
            if (!event) {
                event = {
                    id,
                    title: String(update.title || 'Unnamed event').slice(0, 120),
                    description: String(update.description || update.title || 'Something changes in the world.').slice(0, 500),
                    status: 'scheduled',
                    dueTurn: update.due_in_turns !== undefined
                        ? (sess.turnCount || 1) + Math.max(1, parseInt(update.due_in_turns) || 1)
                        : (update.due_in_minutes !== undefined ? null : (sess.turnCount || 1) + 1),
                    dueMinute: update.due_in_minutes !== undefined
                        ? now.currentTotalMinutes + Math.max(1, parseInt(update.due_in_minutes) || 1)
                        : null,
                    repeatEveryTurns: 0,
                    repeatEveryMinutes: 0,
                    locationId: null,
                    conditionOnTrigger: '',
                    conditionDurationTurns: 0,
                    factionId: '',
                    influenceChange: 0,
                    lastTriggeredTurn: 0
                };
                sess.scheduledEvents.push(event);
            }
            if (update.title !== undefined) event.title = String(update.title).slice(0, 120);
            if (update.description !== undefined) event.description = String(update.description).slice(0, 500);
            if (['scheduled', 'cancelled'].includes(update.status)) event.status = update.status;
            if (update.due_in_turns !== undefined) {
                event.dueTurn = (sess.turnCount || 1) + Math.max(1, parseInt(update.due_in_turns) || 1);
                if (update.due_in_minutes === undefined) event.dueMinute = null;
            }
            if (update.due_in_minutes !== undefined) {
                event.dueMinute = now.currentTotalMinutes + Math.max(1, parseInt(update.due_in_minutes) || 1);
                if (update.due_in_turns === undefined) event.dueTurn = null;
            }
            if (update.repeat_every_turns !== undefined) event.repeatEveryTurns = Math.max(0, parseInt(update.repeat_every_turns) || 0);
            if (update.repeat_every_minutes !== undefined) event.repeatEveryMinutes = Math.max(0, parseInt(update.repeat_every_minutes) || 0);
            if (update.location_id !== undefined) event.locationId = getLocationRef(world, update.location_id)?.id || null;
            if (update.condition_on_trigger !== undefined) event.conditionOnTrigger = String(update.condition_on_trigger || '').slice(0, 120);
            if (update.condition_duration_turns !== undefined) event.conditionDurationTurns = Math.max(0, parseInt(update.condition_duration_turns) || 0);
            if (update.faction_id !== undefined) event.factionId = String(update.faction_id || '').slice(0, 80);
            if (update.influence_change !== undefined) event.influenceChange = livingClamp(update.influence_change, -20, 20);
        });
        sess.scheduledEvents = sess.scheduledEvents.slice(-500);
    }

    // Pre-register factions so one atomic tool call can also assign territory,
    // location control, event effects, and inter-faction relations to them.
    if (modules.livingWorld && args.faction_updates && Array.isArray(args.faction_updates)) {
        args.faction_updates.forEach(update => {
            if (!update || (!update.id && !update.name)) return;
            const query = String(update.id || update.name).toLowerCase();
            if (sess.factions.some(item => item.id.toLowerCase() === query || item.name.toLowerCase() === query)) return;
            sess.factions.push({
                id: String(update.id || livingId('faction', update.name)).slice(0, 80),
                name: String(update.name || update.id).slice(0, 120),
                reputation: 0, influence: 50, resources: 50,
                goal: '', goalProgress: 0, status: 'active', territory: [], relations: []
            });
        });
    }

    if (modules.livingWorld && args.location_state_updates && Array.isArray(args.location_state_updates)) {
        args.location_state_updates.forEach(update => {
            const location = getLocationRef(world, update?.location_id);
            if (!location) return;
            const locState = sess.locationStates[location.id] || {
                conditions: [], controlFactionId: '', danger: 0, prosperity: 50, resources: {}
            };
            const makeCondition = value => {
                const item = typeof value === 'string' ? { label: value } : (value || {});
                const label = String(item.label || '').trim().slice(0, 120);
                if (!label) return null;
                const duration = item.duration_turns !== undefined ? parseInt(item.duration_turns) : parseInt(update.condition_duration_turns);
                return {
                    id: String(item.id || livingId('condition', label)).slice(0, 80),
                    label,
                    expiresTurn: duration > 0 ? (sess.turnCount || 1) + duration : null
                };
            };
            if (Array.isArray(update.set_conditions)) locState.conditions = update.set_conditions.map(makeCondition).filter(Boolean);
            if (Array.isArray(update.add_conditions)) {
                update.add_conditions.map(makeCondition).filter(Boolean).forEach(condition => {
                    const existing = locState.conditions.find(item => item.id === condition.id);
                    if (existing) Object.assign(existing, condition);
                    else locState.conditions.push(condition);
                });
            }
            if (Array.isArray(update.remove_conditions)) {
                const removals = new Set(update.remove_conditions.map(value => String(value).toLowerCase()));
                locState.conditions = locState.conditions.filter(condition =>
                    !removals.has(condition.id.toLowerCase()) && !removals.has(condition.label.toLowerCase()));
            }
            if (update.control_faction_id !== undefined) {
                const query = String(update.control_faction_id || '').toLowerCase();
                const faction = sess.factions.find(item => item.id.toLowerCase() === query || item.name.toLowerCase() === query);
                locState.controlFactionId = faction?.id || '';
            }
            if (update.danger_change !== undefined) locState.danger = livingClamp(locState.danger + Number(update.danger_change || 0), 0, 100);
            if (update.prosperity_change !== undefined) locState.prosperity = livingClamp(locState.prosperity + Number(update.prosperity_change || 0), 0, 100);
            if (update.resource_changes && typeof update.resource_changes === 'object') {
                Object.entries(update.resource_changes).forEach(([key, change]) => {
                    locState.resources[String(key).slice(0, 80)] = livingClamp((locState.resources[key] || 0) + Number(change || 0), 0, 999999);
                });
            }
            locState.conditions = locState.conditions.slice(0, 50);
            sess.locationStates[location.id] = locState;
        });
    }

    if (modules.relationships && args.npc_relationship_updates && Array.isArray(args.npc_relationship_updates)) {
        args.npc_relationship_updates.forEach(update => {
            const sourceId = resolveNpcId(world, update?.source_npc_id, sess);
            const targetId = resolveNpcId(world, update?.target_npc_id, sess);
            if (!sourceId || !targetId || sourceId === targetId) return;
            const key = relationshipKey(sourceId, targetId);
            const rel = sess.npcRelationships[key] || { score: 0, label: '', reason: '', lastChangedTurn: 0 };
            if (update.change !== undefined) rel.score = livingClamp(rel.score + livingClamp(update.change, -30, 30), -100, 100);
            if (update.label !== undefined) rel.label = String(update.label || '').slice(0, 80);
            if (update.reason !== undefined) rel.reason = String(update.reason || '').slice(0, 240);
            rel.lastChangedTurn = sess.turnCount || 1;
            sess.npcRelationships[key] = rel;
        });
    }

    if (modules.livingWorld && args.faction_updates && Array.isArray(args.faction_updates)) {
        args.faction_updates.forEach(update => {
            if (!update || (!update.id && !update.name)) return;
            const query = String(update.id || update.name).toLowerCase();
            let faction = sess.factions.find(item => item.id.toLowerCase() === query || item.name.toLowerCase() === query);
            if (!faction) {
                faction = {
                    id: String(update.id || livingId('faction', update.name)).slice(0, 80),
                    name: String(update.name || update.id).slice(0, 120),
                    reputation: 0, influence: 50, resources: 50,
                    goal: '', goalProgress: 0, status: 'active', territory: [], relations: []
                };
                sess.factions.push(faction);
            }
            if (update.name !== undefined) faction.name = String(update.name).slice(0, 120);
            if (update.reputation_change !== undefined) faction.reputation = livingClamp(faction.reputation + Number(update.reputation_change || 0), -100, 100);
            if (update.influence_change !== undefined) faction.influence = livingClamp(faction.influence + Number(update.influence_change || 0), 0, 100);
            if (update.resources_change !== undefined) faction.resources = livingClamp(faction.resources + Number(update.resources_change || 0), 0, 999999);
            if (update.goal !== undefined) {
                const nextGoal = String(update.goal || '').slice(0, 240);
                if (nextGoal !== faction.goal) faction.goalProgress = 0;
                faction.goal = nextGoal;
            }
            if (update.goal_progress_change !== undefined) faction.goalProgress = livingClamp(faction.goalProgress + Number(update.goal_progress_change || 0), 0, 100);
            if (['active', 'weakened', 'defeated', 'disbanded'].includes(update.status)) faction.status = update.status;
            if (Array.isArray(update.territory_add)) {
                update.territory_add.forEach(ref => {
                    const location = getLocationRef(world, ref);
                    if (location && !faction.territory.includes(location.id)) faction.territory.push(location.id);
                });
            }
            if (Array.isArray(update.territory_remove)) {
                const removals = new Set(update.territory_remove.map(ref => getLocationRef(world, ref)?.id).filter(Boolean));
                faction.territory = faction.territory.filter(id => !removals.has(id));
            }
            if (Array.isArray(update.relations)) {
                update.relations.forEach(relationUpdate => {
                    const targetQuery = String(relationUpdate?.faction_id || '').toLowerCase();
                    const target = sess.factions.find(item => item.id.toLowerCase() === targetQuery || item.name.toLowerCase() === targetQuery);
                    if (!target || target.id === faction.id) return;
                    // Both sides, because standing is mutual everywhere else in
                    // the engine. Writing only one direction meant the DM could
                    // declare a war that the other faction never noticed: its
                    // standing showed no enemy, so it took no penalty for
                    // contested ground and read as calm in the prompt.
                    adjustFactionRelation(sess, faction, target, Number(relationUpdate.change || 0));
                });
            }
        });
        sess.factions = sess.factions.slice(0, 200);
    }

    if ((modules.commerce || modules.livingWorld) && args.economy_updates && Array.isArray(args.economy_updates)) {
        args.economy_updates.forEach(update => {
            const location = getLocationRef(world, update?.location_id);
            const item = String(update?.item || '').trim();
            if (!location || !item) return;
            const market = sess.economy.markets[location.id] || (sess.economy.markets[location.id] = {});
            const key = item.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 80) || livingId('item', item);
            const stock = market[key] || { item: item.slice(0, 100), quantity: 0, price: 1, regenPerTurn: 0, maxQuantity: 100 };
            if (update.set_quantity !== undefined) stock.quantity = livingClamp(update.set_quantity, 0, 999999);
            else if (update.quantity_change !== undefined) stock.quantity = livingClamp(stock.quantity + Number(update.quantity_change || 0), 0, 999999);
            if (update.price !== undefined) stock.price = livingClamp(update.price, 0, 999999);
            if (update.regen_per_turn !== undefined) stock.regenPerTurn = livingClamp(update.regen_per_turn, 0, 9999);
            if (update.max_quantity !== undefined) stock.maxQuantity = livingClamp(update.max_quantity, 0, 999999);
            if (stock.quantity > stock.maxQuantity) stock.maxQuantity = stock.quantity;
            market[key] = stock;
        });
    }

    if (modules.livingWorld && args.player_preference_updates && Array.isArray(args.player_preference_updates)) {
        args.player_preference_updates.forEach(update => {
            const key = String(update?.key || '').trim().slice(0, 80);
            if (!key) return;
            sess.playstyle.preferences[key] = {
                value: String(update.value ?? '').slice(0, 240),
                confidence: livingClamp(update.confidence == null ? 0.7 : update.confidence, 0, 1),
                source: String(update.source || 'observed').slice(0, 120),
                turn: sess.turnCount || 1
            };
        });
    }

    if (args.npc_status_changes && Array.isArray(args.npc_status_changes)) {
        args.npc_status_changes.forEach(sc => {
            const rid = resolveNpcId(world, sc.npc_id, sess);
            if (!rid || !['alive', 'dead', 'gone'].includes(sc.status)) return;
            if (!sess.entityStates[rid]) sess.entityStates[rid] = { location: sess.playerLocation };
            const entState = sess.entityStates[rid];
            const prevStatus = entState.status || 'alive';
            if (prevStatus === sc.status) return;
            entState.status = sc.status;
            delete entState.pinnedUntilTurn; // pins die with the person
            if (!entState.observations) entState.observations = [];
            entState.observations.push({
                id: 'obs_' + Date.now() + Math.floor(Math.random() * 1000),
                text: `[STATUS: ${sc.status.toUpperCase()}]${sc.cause ? ' ' + sc.cause : ''}`,
                turn: sess.turnCount || 1
            });
            const npc = world.entities.find(e => e.id === rid);
            const icon = sc.status === 'dead' ? '☠️' : (sc.status === 'gone' ? '🚪' : '✨');
            ExperimentalWorldsHost.notify(`${icon} ${npc ? npc.name : 'NPC'} is now ${sc.status}`, 'info');
        });
    }

    if (args.npc_moves && Array.isArray(args.npc_moves)) {
        args.npc_moves.forEach(move => {
            const resolvedId = resolveNpcId(world, move?.npc_id, sess);
            const entState = sess.entityStates[resolvedId];
            if (entState && !isNpcActive(entState)) return; // corpses don't travel
            // Every other field in this tool names its destination `location_id`,
            // so a model writing that here is following the schema's own
            // convention. Accept the obvious spellings rather than silently
            // dropping the move and leaving the room reading as empty.
            const destinationRef = move?.target_location_id ?? move?.location_id
                ?? move?.to_location_id ?? move?.destination_id ?? move?.destination;
            const targetLoc = findFuzzyLocation(destinationRef, sessionLocations(world, sess));
            if (entState && targetLoc) {
                entState.location = targetLoc.id;
                // Narrative placement outranks schedules/population for the next few turns
                entState.pinnedUntilTurn = (sess.turnCount || 1) + 6;
                const npc = world.entities.find(e => e.id === resolvedId);
                ExperimentalWorldsHost.notify(`${npc ? npc.name : 'NPC'} moved to ${targetLoc.name}.`, 'info');
            } else {
                // Never fail silently here: an unapplied move is exactly the bug
                // where the DM narrates someone walking in and the HUD keeps
                // insisting the room is empty.
                moduleRejections.push({
                    field: 'npc_moves', module: 'livingWorld',
                    reason: !entState ? 'unknown_npc' : 'unknown_destination',
                    npc: move?.npc_id ?? null, destination: destinationRef ?? null
                });
                console.warn(`Horde Engine: npc_moves ignored — ${!entState
                    ? `unknown NPC "${move?.npc_id}"`
                    : `unknown destination "${destinationRef}"`}. The scene cast will not include them.`);
            }
        });
    }

    if (args.npc_introduced && Array.isArray(args.npc_introduced)) {
        args.npc_introduced.forEach(npc => {
            if (!npc.name) return;
            const existing = world.entities.find(e => isVisibleToSession(e, sess) && e.name.toLowerCase() === npc.name.trim().toLowerCase());
            const explicitSeparatePromotion = String(options?.scenePulseSeparatePromotionId || '')
                && String(npc?.scenePulseSeparatePromotionId || '') === String(options.scenePulseSeparatePromotionId);
            if (!existing || explicitSeparatePromotion) {
                // Generate and inject a brand new NPC
                const requestedId = explicitSeparatePromotion
                    ? String(npc?.id || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100) : '';
                const newId = requestedId && !world.entities.some(entity => entity.id === requestedId)
                    ? requestedId : 'ent_' + Date.now() + Math.floor(Math.random() * 1000);
                // Home: only if the narrative states one — meeting someone at an inn
                // must NOT make them a resident of the inn. No home = wanderer.
                const statedHome = npc.home_location ? findFuzzyLocation(npc.home_location, sessionLocations(world, sess)) : null;
                const newNpc = {
                    id: newId,
                    type: 'npc',
                    name: npc.name.trim(),
                    description: npc.description || 'A person you just met.',
                    startLocation: sess.playerLocation,
                    homeLocation: statedHome ? statedHome.id : '',
                    isMajor: !!npc.persona, // a persona means they matter — keep it in context
                    persona: npc.persona || '',
                    secrets: [],
                    sessionOrigin: sess.id // timeline-scoped: other sessions never see them
                };
                world.entities.push(newNpc);

                // Set their initial state for this session (pinned: they were just
                // placed by the narrative — the engine may not shuffle them yet)
                sess.entityStates[newId] = {
                    location: sess.playerLocation,
                    pinnedUntilTurn: (sess.turnCount || 1) + 6,
                    observations: [{
                        id: 'obs_' + Date.now() + Math.floor(Math.random() * 1000),
                        text: `Encountered the player at ${world.locations.find(l => l.id === sess.playerLocation)?.name || 'this location'}.`,
                        turn: sess.turnCount || 1
                    }]
                };
                
                ExperimentalWorldsHost.notify(`New character introduced: ${newNpc.name}`, 'success');
                // Re-render studio entities if visible
                if (typeof renderWorldEntities === 'function' && document.getElementById('w-entities-list')) {
                    renderWorldEntities();
                }
            }
        });
    }

    if (modules.livingWorld && args.npc_goal_updates && Array.isArray(args.npc_goal_updates)) {
        args.npc_goal_updates.forEach(gu => {
            const rid = resolveNpcId(world, gu.npc_id, sess);
            if (!rid || gu.goal === undefined) return;
            if (!sess.entityStates[rid]) sess.entityStates[rid] = { location: sess.playerLocation };
            const entState = sess.entityStates[rid];
            const goal = String(gu.goal || '').trim();
            const goalChanged = goal !== entState.goal;
            entState.goal = goal ? goal.slice(0, 200) : '';
            if (goal && gu.motivation) entState.goalMotivation = String(gu.motivation).slice(0, 200);
            else if (!goal) {
                delete entState.goalMotivation;
                delete entState.goalSteps;
                delete entState.goalStepIndex;
                delete entState.goalProgress;
                delete entState.goalDeadlineTurn;
                delete entState.goalDifficulty;
                delete entState.goalAutonomy;
                delete entState.goalStatus;
            }
            if (goal) {
                if (goalChanged) entState.goalProgress = 0;
                if (Array.isArray(gu.steps)) {
                    entState.goalSteps = gu.steps.map(step => String(step).slice(0, 160)).filter(Boolean).slice(0, 20);
                    entState.goalStepIndex = 0;
                } else if (!Array.isArray(entState.goalSteps)) {
                    entState.goalSteps = [];
                }
                if (gu.progress_change !== undefined) entState.goalProgress = livingClamp((entState.goalProgress || 0) + Number(gu.progress_change || 0), 0, 100);
                if (gu.deadline_in_turns !== undefined) {
                    const deadline = parseInt(gu.deadline_in_turns) || 0;
                    entState.goalDeadlineTurn = deadline > 0 ? (sess.turnCount || 1) + deadline : null;
                }
                if (gu.difficulty !== undefined) entState.goalDifficulty = livingClamp(gu.difficulty, 0, 100);
                else if (entState.goalDifficulty === undefined) entState.goalDifficulty = 50;
                if (['paused', 'low', 'medium', 'high'].includes(gu.autonomy)) entState.goalAutonomy = gu.autonomy;
                else if (!entState.goalAutonomy) entState.goalAutonomy = 'medium';
                if (['active', 'completed', 'failed', 'blocked'].includes(gu.status)) entState.goalStatus = gu.status;
                else if (goalChanged || !entState.goalStatus) entState.goalStatus = 'active';
                if (entState.goalProgress >= 100 && !gu.status) entState.goalStatus = 'completed';
            }
            const npc = world.entities.find(e => e.id === rid);
            console.log(`Horde Engine: Goal ${goal ? 'set' : 'cleared'} for ${npc ? npc.name : rid}${goal ? ` — ${goal}` : ''}`);
            if (goal) ExperimentalWorldsHost.notify(`🎯 ${npc ? npc.name : 'An NPC'} has an agenda...`, 'info');
        });
    }

    if (modules.relationships && args.npc_disposition_changes && Array.isArray(args.npc_disposition_changes)) {
        args.npc_disposition_changes.forEach(dc => {
            const rid = resolveNpcId(world, dc.npc_id, sess);
            if (!rid) return;
            if (!sess.entityStates[rid]) sess.entityStates[rid] = { location: sess.playerLocation };
            const entState = sess.entityStates[rid];
            const change = Math.max(-20, Math.min(20, parseInt(dc.change) || 0));
            if (!change) return;
            const prev = entState.disposition !== undefined ? entState.disposition : 50;
            entState.disposition = Math.max(0, Math.min(100, prev + change));
            // The "why" becomes a permanent memory so the NPC can reference it later
            if (dc.reason) {
                if (!entState.observations) entState.observations = [];
                entState.observations.push({
                    id: 'obs_' + Date.now() + Math.floor(Math.random() * 1000),
                    text: `[Feelings shifted ${change > 0 ? '+' : ''}${change}] ${dc.reason}`,
                    turn: sess.turnCount || 1
                });
            }
            const npc = world.entities.find(e => e.id === rid);
            ExperimentalWorldsHost.notify(`${npc ? npc.name : 'NPC'} ${change > 0 ? '❤️ +' : '💔 '}${change}`, change > 0 ? 'success' : 'info');
        });
    }

    if (args.npc_observations && Array.isArray(args.npc_observations)) {
        args.npc_observations.forEach(obs => {
            if (!obs || !obs.observation) return;
            // The LLM usually passes a NAME here, not an ID — resolve it, and store
            // the same {id, text, turn} shape every consumer expects.
            const rid = resolveNpcId(world, obs.npc_id, sess);
            if (!rid) return console.warn(`Horde Engine: npc_observations — unknown NPC "${obs.npc_id}"`);
            if (!sess.entityStates[rid]) sess.entityStates[rid] = { location: sess.playerLocation };
            addNpcKnowledge(world, sess, rid, {
                id: 'obs_' + Date.now() + Math.floor(Math.random() * 1000),
                text: String(obs.observation),
                sourceType: obs.source_type || 'told',
                sourceNpcId: resolveNpcId(world, obs.source_npc_id, sess) || '',
                confidence: obs.confidence,
                visibility: obs.visibility,
                contradicted: obs.contradicted === true,
                allowedToShare: obs.allowed_to_share !== false,
                turn: sess.turnCount || 1,
                absoluteMinute: getWorldTimeData(world, sess).currentTotalMinutes
            });
            console.log(`Horde Engine: NPC Memory — ${rid} learned: ${obs.observation}`);
        });
    }

    if (!modules.inventory) {
        rejectDisabledField('inventory_add', 'inventory');
        rejectDisabledField('inventory_remove', 'inventory');
    }
    if (!modules.stats) rejectDisabledField('stat_changes', 'stats');
    if (!modules.schedules) rejectDisabledField('schedule_updates', 'schedules');
    if (!modules.quests) rejectDisabledField('quests_update', 'quests');
    if (!modules.relationships) {
        rejectDisabledField('npc_relationship_updates', 'relationships');
        rejectDisabledField('npc_disposition_changes', 'relationships');
    }
    if (!modules.livingWorld) {
        ['world_events', 'location_state_updates', 'faction_updates', 'player_preference_updates', 'npc_goal_updates']
            .forEach(field => rejectDisabledField(field, 'livingWorld'));
    }
    if (!modules.commerce && !modules.livingWorld) rejectDisabledField('economy_updates', 'commerce');

    const questResult = applyQuestUpdates(world, sess, args.quests_update);
    if (!ledgerEntry) {
        const ledgerArgs = { ...args };
        moduleRejections.forEach(rejection => delete ledgerArgs[rejection.field]);
        ledgerEntry = appendWorldLedgerEntry(sess, buildStructuredLedgerFallback(world, sess, ledgerArgs, questResult, {
            transactions: transactionResults,
            checks: checkResults,
            stats: statResult
        }));
    }
    return {
        ledgerEntry,
        questResult,
        movementResult,
        statResult,
        transactionResults,
        checkResults,
        checkOutcomeResults,
        capabilityProgressResults,
        conditionResults,
        moduleRejections,
        playerState: experimentalSafeJsonClone(normalizePlayerRulesState(world, sess))
    };
}

// (removed: processAIActions — legacy [STATEUPDATE] text-tag parser, superseded
// by the update_world_state tool call pipeline and never invoked)

async function renderWorldMap() {
    const world = ExperimentalWorldsState.worlds.find(w => w.id === ExperimentalWorldsState.activeWorldId);
    if (!world) return;

    const modal = document.getElementById('map-modal');
    const container = document.getElementById('map-container');
    modal.classList.remove('hidden');

    try {
        const sess = getCurrentWorldSession();
        const presentation = normalizeWorldPresentation(world);
        const mapSkin = worldMediaSource(world, presentation.mapSkinAssetId);
        const effectiveMode = ['classic', 'cinematic'].includes(sess?.presentationMode)
            ? sess.presentationMode : (presentation.enabled ? presentation.mode : 'classic');
        container.style.backgroundImage = mapSkin && effectiveMode !== 'classic'
            ? `linear-gradient(rgba(8,8,12,.5),rgba(8,8,12,.5)),url('${experimentalCssUrl(mapSkin)}')` : 'none';
        container.style.backgroundSize = 'cover';
        container.style.backgroundPosition = 'center';
        renderSemanticWorldMap(container, worldForSession(world, sess), {
            currentLocationId: sess?.playerLocation || ''
        });
    } catch (err) {
        container.replaceChildren();
        const error = document.createElement('div');
        error.className = 'error';
        error.textContent = `Map Generation Error: ${err.message}`;
        container.appendChild(error);
        console.error(err);
    }
}

/** --- REFERENCE SANITIZER & SCHEDULER MODULE --- **/

function getLocationRef(world, ref) {
    if (!ref || !world.locations) return null;
    const clean = String(ref).trim().toLowerCase();
    return world.locations.find(location =>
        String(location.id || '').trim().toLowerCase() === clean
        || String(location.name || '').trim().toLowerCase() === clean) || null;
}

function getWorldTimeData(world, sess) {
    if (!sess.turnCount) sess.turnCount = 1;
    const timeStep = world.hudConfig?.timeStep !== undefined ? world.hudConfig.timeStep : 5;
    const startMinutes = (world.hudConfig?.startTimeHours !== undefined ? world.hudConfig.startTimeHours : 8) * 60
        + Math.max(0, Math.min(59, parseInt(world.hudConfig?.startTimeMinutes) || 0));
    // Sidecar worlds resolve time from authored evidence via the reconciled
    // receipt. A model call is not a unit of fictional time, so legacy turn
    // ticks remain available only to Inline Legacy timelines.
    const sidecarTimeline = window.ExperimentalWorldsSidecarHooks?.isSidecarWorld?.(world, sess) === true;
    const totalElapsedMinutes = (sidecarTimeline ? 0 : (sess.turnCount - 1) * timeStep)
        + (Number(sess.bonusTimeMinutes) || 0) + (Number(sess.bonusTimeSeconds) || 0) / 60;
    const currentTotalMinutes = Math.max(0, startMinutes + totalElapsedMinutes);
    
    const days = Math.floor(currentTotalMinutes / (24 * 60)) + 1;
    const totalMinutesToday = ((currentTotalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
    const hours24 = Math.floor(totalMinutesToday / 60);
    const mins = totalMinutesToday % 60;
    
    return { days, hours24, mins, totalMinutesToday, currentTotalMinutes, timeStep, startMinutes };
}

const WORLD_WEEKDAYS = Object.freeze(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);

function getWorldWeekday(world, dayNumber) {
    const authored = String(world?.hudConfig?.startWeekday || 'Monday').trim().toLowerCase();
    const startIndex = Math.max(0, WORLD_WEEKDAYS.findIndex(day => day.toLowerCase() === authored));
    const offset = Math.max(0, (parseInt(dayNumber) || 1) - 1);
    return WORLD_WEEKDAYS[(startIndex + offset) % WORLD_WEEKDAYS.length];
}

function isScheduleBlockForWorldDay(world, block, dayNumber) {
    const raw = block?.days ?? block?.day;
    if (raw == null || raw === '' || (Array.isArray(raw) && raw.length === 0)) return true;
    const wanted = new Set((Array.isArray(raw) ? raw : String(raw).split(','))
        .map(value => String(value || '').trim().toLowerCase()).filter(Boolean));
    const weekday = getWorldWeekday(world, dayNumber).toLowerCase();
    const short = weekday.slice(0, 3);
    const dayIndex = WORLD_WEEKDAYS.findIndex(day => day.toLowerCase() === weekday) + 1;
    return wanted.has(weekday) || wanted.has(short) || wanted.has(String(dayIndex))
        || (wanted.has('weekday') && dayIndex <= 5) || (wanted.has('weekend') && dayIndex >= 6)
        || (wanted.has('daily') || wanted.has('everyday'));
}

// --- Weather Engine ---
// Weighted toward mild skies, shifts every 3 in-game hours, manually overridable.
const WORLD_WEATHER_TYPES = [
    { id: 'clear',    label: 'clear skies',               emoji: '☀️', weight: 4 },
    { id: 'breeze',   label: 'a gentle breeze',           emoji: '🍃', weight: 2 },
    { id: 'crisp',    label: 'crisp, cold air',           emoji: '🌬️', weight: 1 },
    { id: 'overcast', label: 'overcast, muted light',     emoji: '☁️', weight: 2 },
    { id: 'fog',      label: 'thick fog rolling through', emoji: '🌫️', weight: 1 },
    { id: 'drizzle',  label: 'a light drizzle',           emoji: '🌦️', weight: 1 },
    { id: 'rain',     label: 'steady rain',               emoji: '🌧️', weight: 1 },
    { id: 'wind',     label: 'blustery wind',             emoji: '💨', weight: 1 },
    { id: 'storm',    label: 'a brewing storm',           emoji: '⛈️', weight: 1 }
];

function getWorldWeather(world, sess) {
    // Manual override wins until the player switches back to Auto
    if (sess && sess.weatherOverride) {
        const t = WORLD_WEATHER_TYPES.find(w => w.id === sess.weatherOverride);
        if (t) return t;
    }
    const time = getWorldTimeData(world, sess);
    // Shift every 3 in-game hours. (The old system keyed off the DAY number —
    // at 5 min/turn a day is ~288 turns, so weather froze on one sky forever.)
    const block = Math.floor(time.currentTotalMinutes / 180);
    let h = Math.imul(block + 1, 2654435761);
    for (let i = 0; i < (world.id || '').length; i++) h = (Math.imul(h, 31) + world.id.charCodeAt(i)) | 0;
    h = Math.abs(h ^ (h >>> 15));
    const totalWeight = WORLD_WEATHER_TYPES.reduce((s, w) => s + w.weight, 0);
    let roll = h % totalWeight;
    for (const w of WORLD_WEATHER_TYPES) {
        roll -= w.weight;
        if (roll < 0) return w;
    }
    return WORLD_WEATHER_TYPES[0];
}

/**
 * Travel time: exits can declare "takes Xm". Until now this was decorative —
 * these helpers make movement actually cost clock time on every path
 * (exit clicks, typed movement, and DM tool moves).
 */
function getExitTravelTime(world, fromId, toId) {
    const from = world.locations.find(l => l.id === fromId);
    const to = world.locations.find(l => l.id === toId);
    if (!from || !to || !Array.isArray(from.exits)) return 0;
    for (const ex of from.exits) {
        if (typeof ex !== 'object') continue;
        const t = parseInt(ex.travelTime) || 0;
        if (!t) continue;
        const target = (getExitTargetName(ex) || '').toLowerCase();
        if (target && (target === to.name.toLowerCase() || target === to.id.toLowerCase())) return t;
    }
    return 0;
}

function getWorldTravelLeg(world, fromId, toId) {
    const from = getLocationRef(world, fromId);
    const to = getLocationRef(world, toId);
    if (!from || !to) return null;
    const exit = (from.exits || []).find(candidate => {
        const target = getLocationRef(world, candidate?.targetLocationId || getExitTargetName(candidate));
        return target?.id === to.id;
    });
    const details = exit && typeof exit === 'object' ? exit : {};
    return {
        from, to,
        mode: normalizeWorldTravelMode(details.mode),
        travelTime: Math.max(0, Number(details.travelTime) || 0),
        routeName: String(details.routeName || '').trim(),
        cost: String(details.cost || '').trim()
    };
}

function describeWorldTravelLeg(leg) {
    if (!leg) return '';
    const mode = formatWorldTravelMode(leg.mode);
    const details = [mode, leg.routeName, leg.travelTime ? `${leg.travelTime} min` : '', leg.cost ? `fare ${leg.cost}` : ''].filter(Boolean);
    return `${leg.from.name} → ${leg.to.name}${details.length ? ` (${details.join(' · ')})` : ''}`;
}

function applyTravelTime(world, sess, fromId, toId) {
    const t = getExitTravelTime(world, fromId, toId);
    if (t > 0) {
        sess.bonusTimeMinutes = (sess.bonusTimeMinutes || 0) + t;
        ExperimentalWorldsHost.notify(`🕒 Travel time: +${t}m`, 'info');
    }
    return t;
}

function getWorldPathTravelTime(world, path) {
    if (!Array.isArray(path) || path.length < 2) return 0;
    let total = 0;
    for (let index = 1; index < path.length; index++) {
        total += getExitTravelTime(world, path[index - 1], path[index]);
    }
    return total;
}

function movePlayerAlongWorldPath(world, sess, targetLocation, options = {}) {
    if (!world || !sess || !targetLocation) return { ok: false, moved: false, reason: 'unknown_destination', path: [] };
    const path = findWorldTravelPath(typeof worldForSession === 'function' ? worldForSession(world, sess) : world, sess.playerLocation, targetLocation.id);
    if (!path) return { ok: false, moved: false, reason: 'unreachable', path: [] };
    if (path.length === 1) return { ok: true, moved: false, reason: 'already_there', path };

    const previousLocation = sess.playerLocation;
    const travelLegs = path.slice(1).map((toId, index) => getWorldTravelLeg(world, path[index], toId)).filter(Boolean);
    const travelMinutes = travelLegs.reduce((total, leg) => total + leg.travelTime, 0);
    sess.playerLocation = targetLocation.id;
    if (travelMinutes > 0) {
        sess.bonusTimeMinutes = (sess.bonusTimeMinutes || 0) + travelMinutes;
        if (options.showTravelToast !== false) ExperimentalWorldsHost.notify(`🕒 Travel time: +${travelMinutes}m`, 'info');
    }
    return {
        ok: true,
        moved: true,
        reason: '',
        previousLocation,
        destination: targetLocation.id,
        path,
        travelMinutes,
        travelLegs
    };
}

// An NPC moved by the narrative (npc_moves / npc_introduced) is "pinned":
// schedules and random population may not override them until the pin expires.
function isNpcPinned(sess, entState) {
    return !!(entState && entState.pinnedUntilTurn && (sess.turnCount || 1) < entState.pinnedUntilTurn);
}

// Queue a world event for the DM to narrate on the next generation
// (e.g. an NPC arriving because their schedule moved them into the scene).
function queueEngineEvent(sess, text) {
    if (!sess || !text) return;
    sess.engineEvents = sess.engineEvents || [];
    if (!sess.engineEvents.includes(text)) sess.engineEvents.push(text);
}

function livingClamp(value, min, max) {
    const n = Number(value);
    const fallback = min <= 0 && max >= 0 ? 0 : min;
    return Math.max(min, Math.min(max, Number.isFinite(n) ? n : fallback));
}

// Schedule blocks are selected by string comparison against the wall clock, and
// a block that can never compare <= "23:59" becomes the permanent pre-dawn
// fallback — silently overriding an NPC's real routine. Times must therefore be
// range-checked, not merely shaped like HH:MM.
function isValidScheduleTime(value) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? ''));
}

function livingId(prefix, value) {
    const clean = String(value || '').trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48);
    return `${prefix}_${clean || Math.random().toString(36).slice(2, 10)}`;
}

// --- Shops -----------------------------------------------------------------
// Markets existed only as timeline state, creatable solely by the AI, so an
// author had no way to say "the baker sells bread" at all. A stated price now
// settles one-off purchases, and these authored shops cover the standing case:
// persistent stock and prices the author controls, seeded into every timeline
// and visible to the DM as something the player can actually walk up and buy.

function normalizeShopStock(raw, index) {
    const item = String(raw?.item || `item_${index + 1}`).trim().slice(0, 100);
    const price = livingClamp(raw?.price == null ? 1 : raw.price, 0, 999999);
    return {
        item,
        price,
        // The rate this good settles at when nothing is pressing on it, so
        // scarcity drift oscillates around the author's figure.
        basePrice: livingClamp(raw?.basePrice == null ? price : raw.basePrice, 0, 999999),
        quantity: livingClamp(raw?.quantity == null ? 1 : raw.quantity, 0, 999999),
        maxQuantity: livingClamp(raw?.maxQuantity == null ? Math.max(1, Number(raw?.quantity) || 1) : raw.maxQuantity, 0, 999999),
        regenPerTurn: livingClamp(raw?.regenPerTurn || 0, 0, 9999)
    };
}

function normalizeWorldShops(world) {
    (world?.locations || []).forEach(location => {
        if (!Array.isArray(location.shop)) {
            if (location.shop) delete location.shop;
            return;
        }
        location.shop = location.shop
            .filter(entry => entry && String(entry.item || '').trim())
            .map(normalizeShopStock)
            .slice(0, 100);
        if (!location.shop.length) delete location.shop;
    });
    return world;
}

/**
 * Read a location's stock without touching it. Seeding runs while the author
 * may still be mid-edit — a row they have added but not yet named must not be
 * deleted out from under them just because a session started.
 */
function readWorldShop(location) {
    if (!Array.isArray(location?.shop)) return [];
    return location.shop
        .filter(entry => entry && String(entry.item || '').trim())
        .map(normalizeShopStock)
        .slice(0, 100);
}

// A stock key must be stable and match how transactions look items up.
function shopStockKey(item) {
    return questTextKey(item) || String(item || '').trim().toLowerCase();
}

function seedMarketsFromWorld(world) {
    const markets = {};
    (world?.locations || []).forEach(location => {
        const shop = readWorldShop(location);
        if (!shop.length) return;
        const market = {};
        shop.forEach(stock => {
            const key = shopStockKey(stock.item);
            if (key) market[key] = { ...stock };
        });
        if (Object.keys(market).length) markets[location.id] = market;
    });
    return markets;
}

/**
 * Bring an existing timeline up to date with shops authored after it began —
 * otherwise adding a shop mid-campaign would only affect brand new sessions,
 * which is not what anyone means by "the baker now sells bread". Never touches
 * a good the timeline already knows about: play has moved its stock and price.
 */
function syncMarketsWithWorldShops(world, sess) {
    if (!sess?.economy) return 0;
    if (!sess.economy.markets || typeof sess.economy.markets !== 'object') sess.economy.markets = {};
    let added = 0;
    (world?.locations || []).forEach(location => {
        const shop = readWorldShop(location);
        if (!shop.length) return;
        const market = sess.economy.markets[location.id] || (sess.economy.markets[location.id] = {});
        shop.forEach(stock => {
            const key = shopStockKey(stock.item);
            if (!key || market[key]) return;   // already trading — leave play alone
            market[key] = { ...stock };
            added++;
        });
    });
    return added;
}

// --- Factions --------------------------------------------------------------
// Factions lived only inside a timeline and only the AI could create one, so an
// author could describe a war in the lore and the engine would know nothing of
// the sides fighting it. Authored factions are the standing case: powers the
// author controls, seeded into every timeline, holding territory, standing in
// declared relation to each other, and with NPCs who actually belong to them.

const FACTION_STATUSES = ['active', 'weakened', 'defeated', 'disbanded'];

function normalizeWorldFaction(raw, index) {
    const name = String(raw?.name || `Faction ${index + 1}`).trim().slice(0, 120);
    const reputation = livingClamp(raw?.reputation == null ? 0 : raw.reputation, -100, 100);
    return {
        id: String(raw?.id || livingId('faction', name || index)).slice(0, 80),
        name,
        description: String(raw?.description || '').slice(0, 600),
        // How much the faction can make happen, and how the public regards it.
        influence: livingClamp(raw?.influence == null ? 50 : raw.influence, 0, 100),
        reputation,
        resources: livingClamp(raw?.resources == null ? 50 : raw.resources, 0, 999999),
        goal: String(raw?.goal || '').slice(0, 240),
        goalPool: (Array.isArray(raw?.goalPool) ? raw.goalPool : [])
            .map(entry => String(typeof entry === 'string' ? entry : entry?.goal || '').trim().slice(0, 240))
            .filter(Boolean).slice(0, 20),
        status: FACTION_STATUSES.includes(raw?.status) ? raw.status : 'active',
        territory: [...new Set((Array.isArray(raw?.territory) ? raw.territory : [])
            .map(ref => String(ref || '').trim()).filter(Boolean))].slice(0, 500),
        relations: (Array.isArray(raw?.relations) ? raw.relations : []).slice(0, 200).map(relation => ({
            factionId: String(relation?.factionId || '').slice(0, 80),
            score: livingClamp(relation?.score || 0, -100, 100)
        })).filter(relation => relation.factionId)
    };
}

/**
 * Repair stored factions and drop every reference that no longer resolves —
 * territory pointing at a deleted location, a relation or a membership naming
 * a faction that is gone. Mutating, so it belongs on the load and save paths
 * and never on the path that starts a session.
 */
function normalizeWorldFactions(world) {
    if (!world) return world;
    if (!Array.isArray(world.factions)) {
        if (world.factions) delete world.factions;
        if (!world.factions) world.factions = [];
    }
    world.factions = world.factions.slice(0, 200).map(normalizeWorldFaction);
    // Ids must be unique or relations and membership become ambiguous.
    const seen = new Set();
    world.factions.forEach((faction, index) => {
        while (seen.has(faction.id)) faction.id = `${faction.id}_${index + 1}`;
        seen.add(faction.id);
    });
    world.factions.forEach(faction => {
        faction.territory = faction.territory
            .map(ref => getLocationRef(world, ref)?.id).filter(Boolean);
        faction.territory = [...new Set(faction.territory)];
        faction.relations = faction.relations.filter(relation =>
            relation.factionId !== faction.id && seen.has(relation.factionId));
    });
    (world.entities || []).forEach(entity => {
        if (entity?.factionId && !seen.has(entity.factionId)) delete entity.factionId;
    });
    if (!world.factions.length) delete world.factions;
    return world;
}

// Non-destructive read, for the same reason shops have one: a session must
// never edit the world an author may still be part-way through writing.
function readWorldFactions(world) {
    if (!Array.isArray(world?.factions)) return [];
    const factions = world.factions
        .filter(entry => entry && String(entry.name || '').trim())
        .map(normalizeWorldFaction).slice(0, 200);
    const ids = new Set(factions.map(faction => faction.id));
    factions.forEach(faction => {
        faction.territory = [...new Set(faction.territory
            .map(ref => getLocationRef(world, ref)?.id).filter(Boolean))];
        faction.relations = faction.relations.filter(relation =>
            relation.factionId !== faction.id && ids.has(relation.factionId));
    });
    return factions;
}

// A faction enters play with its authored standing but no history: nothing has
// been achieved and no aim is part-done until the world actually turns.
function livingFactionFromWorld(faction) {
    return { ...faction, goalProgress: 0, achievements: [] };
}

function seedFactionsFromWorld(world) {
    return readWorldFactions(world).map(livingFactionFromWorld);
}

/**
 * Bring a running timeline up to date with factions authored after it began.
 * A faction already in play is left entirely alone — its influence, aim and
 * relations are the story so far, not something the editor should overwrite.
 */
function syncFactionsWithWorld(world, sess) {
    if (!sess) return 0;
    if (!Array.isArray(sess.factions)) sess.factions = [];
    const known = new Set(sess.factions.map(faction => String(faction?.id || '')));
    let added = 0;
    readWorldFactions(world).forEach(faction => {
        if (known.has(faction.id) || sess.factions.length >= 200) return;
        sess.factions.push(livingFactionFromWorld(faction));
        known.add(faction.id);
        added++;
    });
    return added;
}

// --- Society: standing relationships and the state of places ----------------
// Both lived only inside a timeline, so a world could open with a married
// couple who were strangers to the engine and a war-torn border that read as
// perfectly safe. Authored here, seeded into every timeline, and — because a
// world may hold hundreds of people — filled in by the Society calibration
// pass rather than by hand.

const RELATIONSHIP_CAP = 2000;

function normalizeWorldRelationship(raw) {
    const a = String(raw?.a || raw?.from || '').trim().slice(0, 80);
    const b = String(raw?.b || raw?.to || '').trim().slice(0, 80);
    return {
        a, b,
        label: String(raw?.label || '').trim().slice(0, 80),
        score: livingClamp(raw?.score == null ? 0 : raw.score, -100, 100),
        reason: String(raw?.reason || '').trim().slice(0, 240)
    };
}

/**
 * Repair stored relationships: drop any naming somebody who is gone or
 * themselves, and collapse duplicates so one pair cannot hold two standings.
 * Mutating — for the load and save paths only.
 */
function normalizeWorldRelationships(world) {
    if (!world) return world;
    if (!Array.isArray(world.relationships)) {
        if (world.relationships) delete world.relationships;
        if (!world.relationships) world.relationships = [];
    }
    const people = new Set((world.entities || []).map(entity => String(entity?.id || '')));
    const byPair = new Map();
    world.relationships.slice(0, RELATIONSHIP_CAP).map(normalizeWorldRelationship).forEach(relation => {
        if (!relation.a || !relation.b || relation.a === relation.b) return;
        if (!people.has(relation.a) || !people.has(relation.b)) return;
        byPair.set(relationshipKey(relation.a, relation.b), relation);   // last write wins
    });
    world.relationships = [...byPair.values()];
    if (!world.relationships.length) delete world.relationships;
    return world;
}

// Non-destructive read, for the same reason shops and factions have one.
function readWorldRelationships(world) {
    if (!Array.isArray(world?.relationships)) return [];
    const people = new Set((world.entities || []).map(entity => String(entity?.id || '')));
    const byPair = new Map();
    world.relationships.slice(0, RELATIONSHIP_CAP).map(normalizeWorldRelationship).forEach(relation => {
        if (!relation.a || !relation.b || relation.a === relation.b) return;
        if (!people.has(relation.a) || !people.has(relation.b)) return;
        byPair.set(relationshipKey(relation.a, relation.b), relation);
    });
    return [...byPair.values()];
}

function seedRelationshipsFromWorld(world) {
    const seeded = {};
    readWorldRelationships(world).forEach(relation => {
        seeded[relationshipKey(relation.a, relation.b)] = {
            score: relation.score, label: relation.label, reason: relation.reason
        };
    });
    return seeded;
}

/**
 * Bring a running timeline up to date with relationships authored after it
 * began. A pair the timeline already knows is left alone: play has moved that
 * standing, and the editor is not entitled to undo what happened at the table.
 */
function syncRelationshipsWithWorld(world, sess) {
    if (!sess) return 0;
    if (!sess.npcRelationships || typeof sess.npcRelationships !== 'object' || Array.isArray(sess.npcRelationships)) {
        sess.npcRelationships = {};
    }
    let added = 0;
    readWorldRelationships(world).forEach(relation => {
        const key = relationshipKey(relation.a, relation.b);
        if (sess.npcRelationships[key]) return;
        sess.npcRelationships[key] = {
            score: relation.score, label: relation.label, reason: relation.reason
        };
        added++;
    });
    return added;
}

// A location's opening condition. Absent means "unremarkable", which is why
// nothing is written onto a location that says nothing about itself.
function authoredLocationState(location) {
    if (!location) return null;
    const hasDanger = location.danger != null && location.danger !== '';
    const hasProsperity = location.prosperity != null && location.prosperity !== '';
    const conditions = (Array.isArray(location.conditions) ? location.conditions : [])
        .map(entry => String(typeof entry === 'string' ? entry : entry?.label || '').trim())
        .filter(Boolean).slice(0, 20);
    if (!hasDanger && !hasProsperity && !conditions.length) return null;
    return {
        conditions: conditions.map((label, index) => ({
            id: livingId('condition', `${location.id}_${label || index}`),
            label: label.slice(0, 120),
            expiresTurn: null            // authored conditions stand until play changes them
        })),
        controlFactionId: '',
        danger: livingClamp(hasDanger ? location.danger : 0, 0, 100),
        prosperity: livingClamp(hasProsperity ? location.prosperity : 50, 0, 100),
        resources: {}
    };
}

function seedLocationStatesFromWorld(world) {
    const states = {};
    (world?.locations || []).forEach(location => {
        const state = authoredLocationState(location);
        if (state) states[location.id] = state;
    });
    // Territory is a claim on the ground, so a holding opens under its holder.
    readWorldFactions(world).forEach(faction => {
        faction.territory.forEach(locId => {
            const state = states[locId] || (states[locId] = {
                conditions: [], controlFactionId: '', danger: 0, prosperity: 50, resources: {}
            });
            if (!state.controlFactionId) state.controlFactionId = faction.id;
        });
    });
    return states;
}

/**
 * Bring a running timeline up to date with places described after it began.
 * A location the timeline already tracks is left alone — its danger is the
 * story of what has happened there, not a figure the editor may reset.
 */
function syncLocationStatesWithWorld(world, sess) {
    if (!sess) return 0;
    if (!sess.locationStates || typeof sess.locationStates !== 'object' || Array.isArray(sess.locationStates)) {
        sess.locationStates = {};
    }
    let added = 0;
    Object.entries(seedLocationStatesFromWorld(world)).forEach(([locId, state]) => {
        if (sess.locationStates[locId]) return;
        sess.locationStates[locId] = state;
        added++;
    });
    return added;
}

/**
 * Repair everything an author can write into a world, and drop every reference
 * that no longer resolves.
 *
 * This used to run only when the app loaded stored state, which left three
 * ways to keep bad data: importing a .horde_world (never normalized at all, so
 * a half-formed faction crashed the Factions panel on open), saving from the
 * Studio (the editing clone went to storage as-is), and exporting (the same
 * clone went straight to a file). Deleting a person or a place in the Studio
 * also left standings and territory pointing at them until the next reload.
 *
 * So it runs on every path that produces or persists a world instead.
 */
function normalizeWorldSandboxConfig(world) {
    if (!world) return {};
    const raw = experimentalIsPlainObject(world.sandboxConfig) ? world.sandboxConfig : {};
    world.sandboxConfig = {
        enabled: raw.enabled === true,
        scale: ['local', 'regional', 'kingdom', 'continent'].includes(raw.scale) ? raw.scale : 'regional',
        calendar: String(raw.calendar || 'Four seasonal quarters').slice(0, 120),
        seasonDays: livingClamp(raw.seasonDays == null ? 30 : raw.seasonDays, 1, 365),
        politics: raw.politics !== false,
        conflict: raw.conflict !== false,
        law: raw.law !== false,
        seasons: raw.seasons !== false,
        growth: raw.growth !== false,
        principles: String(raw.principles || '').slice(0, 4000)
    };
    const locationIds = new Set((world.locations || []).map(location => location.id));
    const factionIds = new Set((world.factions || []).map(faction => faction.id));
    const used = new Set();
    world.startingLives = (Array.isArray(world.startingLives) ? world.startingLives : [])
        .filter(experimentalIsPlainObject).slice(0, 40).map((life, index) => {
            let id = String(life.id || livingId('origin', life.name || index)).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
            while (used.has(id)) id = `${id}_${index + 1}`;
            used.add(id);
            const startLocationId = locationIds.has(life.startLocationId)
                ? life.startLocationId : (world.startLocationId || world.locations?.[0]?.id || '');
            const factionId = factionIds.has(life.factionId) ? life.factionId : '';
            const statOverrides = {};
            if (experimentalIsPlainObject(life.statOverrides)) {
                Object.entries(life.statOverrides).slice(0, 40).forEach(([key, value]) => {
                    if (Number.isFinite(Number(value))) statOverrides[String(key).slice(0, 80)] = Number(value);
                });
            }
            return {
                id,
                name: String(life.name || `Starting Life ${index + 1}`).slice(0, 100),
                icon: String(life.icon || '◈').slice(0, 8),
                role: String(life.role || life.name || 'wanderer').slice(0, 100),
                socialRank: String(life.socialRank || 'commoner').slice(0, 80),
                description: String(life.description || '').slice(0, 500),
                startLocationId,
                factionId,
                factionReputation: livingClamp(life.factionReputation || 0, -100, 100),
                title: String(life.title || '').slice(0, 120),
                outfit: String(life.outfit || '').slice(0, 300),
                inventory: (Array.isArray(life.inventory) ? life.inventory : String(life.inventory || '').split(','))
                    .map(item => String(item || '').trim()).filter(Boolean).slice(0, 60),
                obligations: (Array.isArray(life.obligations) ? life.obligations : String(life.obligations || '').split('\n'))
                    .map(item => String(item || '').trim()).filter(Boolean).slice(0, 30),
                privileges: (Array.isArray(life.privileges) ? life.privileges : String(life.privileges || '').split('\n'))
                    .map(item => String(item || '').trim()).filter(Boolean).slice(0, 30),
                skills: (Array.isArray(life.skills) ? life.skills : String(life.skills || '').split('\n'))
                    .map(item => String(item || '').trim()).filter(Boolean).slice(0, 40),
                perks: (Array.isArray(life.perks) ? life.perks : String(life.perks || '').split('\n'))
                    .map(item => String(item || '').trim()).filter(Boolean).slice(0, 40),
                legalStatus: String(life.legalStatus || 'free').slice(0, 100),
                holdings: (Array.isArray(life.holdings) ? life.holdings : String(life.holdings || '').split(','))
                    .map(item => String(item || '').trim()).filter(Boolean).slice(0, 30),
                statOverrides,
                intro: recoverStartingLifeIntro(world, life).slice(0, 6000),
                // Mechanics checkpoint overlays ride along untouched: the
                // world mechanics engine normalizes them at life start
                // (applyCheckpoint). Rebuilding lives without this field
                // silently disabled checkpoint initialization for imported
                // mechanics worlds.
                ...(experimentalIsPlainObject(life.checkpointOverlay)
                    ? { checkpointOverlay: life.checkpointOverlay } : {})
            };
        });
    return world.sandboxConfig;
}

function seedWorldSocietyState(world) {
    const config = normalizeWorldSandboxConfig(world);
    const settlementTypes = new Set(['area', 'building', 'outdoor']);
    const settlements = {};
    (world.locations || []).forEach(location => {
        if (location.simulateSettlement === false) return;
        const isSettlement = location.simulateSettlement === true
            || settlementTypes.has(String(location.mapType || '').toLowerCase())
                && /(village|town|city|keep|castle|port|harbor|market|camp|fort|hold|court|abbey|farm|manor)/i.test(`${location.name} ${location.region || ''}`);
        if (!isSettlement) return;
        const prosperity = livingClamp(location.prosperity == null ? 50 : location.prosperity, 0, 100);
        const danger = livingClamp(location.danger == null ? 20 : location.danger, 0, 100);
        settlements[location.id] = {
            name: location.name,
            population: livingClamp(location.population == null ? ({ local: 120, regional: 500, kingdom: 1800, continent: 5000 }[config.scale] || 500) : location.population, 1, 10000000),
            food: livingClamp(location.food == null ? 60 : location.food, 0, 100),
            wealth: prosperity,
            security: livingClamp(100 - danger, 0, 100),
            unrest: livingClamp(location.unrest || Math.round(danger / 3), 0, 100),
            growth: 0,
            controlFactionId: String(location.controlFactionId || '')
        };
    });
    return {
        version: 1,
        season: 'Spring',
        year: 1,
        settlements,
        conflicts: [],
        developments: [],
        lastTickTurn: 0
    };
}

function normalizeWorldSocietyState(world, sess) {
    const config = normalizeWorldSandboxConfig(world);
    if (!config.enabled) return null;
    if (!experimentalIsPlainObject(sess.society)) sess.society = seedWorldSocietyState(world);
    const seeded = seedWorldSocietyState(world);
    if (!experimentalIsPlainObject(sess.society.settlements)) sess.society.settlements = {};
    Object.entries(seeded.settlements).forEach(([id, value]) => {
        if (!experimentalIsPlainObject(sess.society.settlements[id])) sess.society.settlements[id] = value;
    });
    Object.keys(sess.society.settlements).forEach(id => {
        if (!world.locations.some(location => location.id === id)) {
            delete sess.society.settlements[id];
            return;
        }
        const settlement = sess.society.settlements[id];
        settlement.name = String(settlement.name || getLocationRef(world, id)?.name || id).slice(0, 120);
        settlement.population = livingClamp(settlement.population || 1, 1, 10000000);
        ['food', 'wealth', 'security', 'unrest'].forEach(key => {
            settlement[key] = livingClamp(settlement[key] == null ? 50 : settlement[key], 0, 100);
        });
        settlement.growth = livingClamp(settlement.growth || 0, -100, 100);
        settlement.controlFactionId = String(settlement.controlFactionId || sess.locationStates?.[id]?.controlFactionId || '');
    });
    if (!Array.isArray(sess.society.conflicts)) sess.society.conflicts = [];
    if (!Array.isArray(sess.society.developments)) sess.society.developments = [];
    sess.society.conflicts = sess.society.conflicts.slice(-60);
    sess.society.developments = sess.society.developments.slice(-80);
    sess.society.lastTickTurn = Math.max(0, parseInt(sess.society.lastTickTurn) || 0);
    const time = getWorldTimeData(world, sess);
    const seasons = ['Spring', 'Summer', 'Autumn', 'Winter'];
    const seasonIndex = Math.floor(Math.max(0, time.days - 1) / config.seasonDays);
    sess.society.season = seasons[seasonIndex % seasons.length];
    sess.society.year = Math.floor(seasonIndex / seasons.length) + 1;
    if (!experimentalIsPlainObject(sess.playerIdentity)) sess.playerIdentity = {};
    if (!experimentalIsPlainObject(sess.legalStanding)) sess.legalStanding = {};
    return sess.society;
}

function normalizeAuthoredWorld(world) {
    if (!world) return world;
    // A hand-edited or truncated file can carry holes in these arrays, and a
    // hole is not a place or a person — every pass below would throw on it.
    world.locations = (Array.isArray(world.locations) ? world.locations : []).filter(experimentalIsPlainObject);
    world.entities = (Array.isArray(world.entities) ? world.entities : []).filter(experimentalIsPlainObject);
    normalizeWorldPresentation(world);
    const validMediaIds = new Set(world.mediaAssets.map(asset => asset.id));
    if (world.presentation.mapSkinAssetId && !validMediaIds.has(world.presentation.mapSkinAssetId)) {
        world.presentation.mapSkinAssetId = '';
    }

    normalizeWorldShops(world);
    world.locations.forEach(location => {
        if (!experimentalIsPlainObject(location.visuals)) location.visuals = {};
        location.visuals.backgroundAssetId = String(location.visuals.backgroundAssetId || '').slice(0, 160);
        location.visuals.backgroundPosition = String(location.visuals.backgroundPosition || 'center').slice(0, 80);
        if (location.visuals.backgroundAssetId && !validMediaIds.has(location.visuals.backgroundAssetId)) {
            location.visuals.backgroundAssetId = '';
        }
        if (location.danger != null && location.danger !== '') location.danger = livingClamp(location.danger, 0, 100);
        if (location.prosperity != null && location.prosperity !== '') location.prosperity = livingClamp(location.prosperity, 0, 100);
        if (location.conditions !== undefined) {
            const conditions = (Array.isArray(location.conditions) ? location.conditions : [])
                .map(entry => String(typeof entry === 'string' ? entry : entry?.label || '').trim())
                .filter(Boolean).slice(0, 20);
            if (conditions.length) location.conditions = conditions;
            else delete location.conditions;
        }
    });
    world.entities.forEach(entity => {
        if (!experimentalIsPlainObject(entity.visuals)) entity.visuals = {};
        entity.gender = String(entity.gender || '').trim().slice(0, 100);
        entity.visuals.portraitAssetId = String(entity.visuals.portraitAssetId || '').slice(0, 160);
        entity.visuals.portraitDisplayAssetId = String(entity.visuals.portraitDisplayAssetId || '').slice(0, 160);
        entity.visuals.portraitBriefId = String(entity.visuals.portraitBriefId || '').trim().slice(0, 80);
        entity.visuals.imageIntent = normalizeWorldImageIntent(
            entity.visuals.imageIntent, entity.imagePrompt, entity.visuals.imageIntent?.context || '');
        entity.visuals.framing = normalizeWorldImageFraming(
            entity.visuals.framing, { framing: entity.visuals.portraitFraming }, entity.visuals.portraitSubjectGuide);
        entity.visuals.look = normalizeWorldImageLook(entity.visuals.look, world.presentation?.imageGuide || {});
        entity.identityReferences = (Array.isArray(entity.identityReferences) ? entity.identityReferences : [])
            .filter(ref => experimentalIsPlainObject(ref) && typeof ref.assetId === 'string')
            .filter(ref => validMediaIds.has(ref.assetId))
            .slice(0, 12)
            .map(ref => ({ assetId: String(ref.assetId).slice(0, 160),
                purpose: ['primary_identity', 'secondary_identity', 'style_reference'].includes(ref.purpose)
                    ? ref.purpose : 'primary_identity',
                revision: Math.max(0, Number(ref.revision) || 0), notes: String(ref.notes || '').slice(0, 800) }));
        entity.visuals.portraitSubjectGuide = normalizeWorldVisualSubjectGuide(entity.visuals.portraitSubjectGuide);
        entity.visuals.portraitIdentityGuide = normalizeWorldVisualIdentityGuide(entity.visuals.portraitIdentityGuide);
        // Dossier gender is the stable source. A manually authored identity
        // guide remains authoritative for that image, but blank guide fields
        // inherit the dossier value so new characters are immediately usable.
        if (entity.gender && !entity.visuals.portraitIdentityGuide.gender) {
            entity.visuals.portraitIdentityGuide.gender = entity.gender;
        }
        // Outfits are the wardrobe source of truth. The legacy currentOutfit
        // string stays synced to the worn outfit so every prose consumer
        // (portrait compiler, dossier) reads one coherent "what they are
        // wearing right now"; when nothing is worn it is left untouched.
        entity.visuals.outfits = normalizeWorldOutfits(entity.visuals.outfits);
        const validOutfitAssetIds = new Set(world.mediaAssets.map(asset => asset.id));
        entity.visuals.outfits.forEach(outfit => {
            outfit.imageAssetIds = (outfit.imageAssetIds || []).filter(assetId => validOutfitAssetIds.has(assetId));
        });
        const wornOutfit = worldCurrentOutfit(entity);
        if (wornOutfit) {
            entity.visuals.currentOutfitId = wornOutfit.id;
            entity.currentOutfit = wornOutfit.description;
        } else if (entity.visuals.currentOutfitId) {
            entity.visuals.currentOutfitId = '';
        }
        entity.visuals.portraitPosition = String(entity.visuals.portraitPosition || 'center').slice(0, 80);
        entity.visuals.dialogueColor = /^#[0-9a-f]{6}$/i.test(String(entity.visuals.dialogueColor || ''))
            ? String(entity.visuals.dialogueColor).toUpperCase() : '';
        if (entity.visuals.portraitAssetId && !validMediaIds.has(entity.visuals.portraitAssetId)) {
            entity.visuals.portraitAssetId = '';
        }
        if (entity.visuals.portraitDisplayAssetId && !validMediaIds.has(entity.visuals.portraitDisplayAssetId)) {
            entity.visuals.portraitDisplayAssetId = '';
        }
        // A vendor bound to a location that no longer exists is not a vendor.
        if (entity.vendorFor && !world.locations.some(l => l.id === entity.vendorFor)) {
            delete entity.vendorFor;
        }
    });
    normalizeWorldDirectoryData(world);
    // After locations and entities, so a membership, a standing or a claim on
    // ground that names something gone clears rather than reaching an export.
    normalizeWorldFactions(world);
    const authoredFactionIds = new Set((world.factions || []).map(faction => faction.id));
    world.locations.forEach(location => {
        if (location.population != null) location.population = livingClamp(location.population, 1, 10000000);
        if (location.food != null) location.food = livingClamp(location.food, 0, 100);
        if (location.unrest != null) location.unrest = livingClamp(location.unrest, 0, 100);
        if (location.controlFactionId && !authoredFactionIds.has(location.controlFactionId)) {
            delete location.controlFactionId;
        }
    });
    normalizeWorldRelationships(world);
    normalizeWorldSandboxConfig(world);
    normalizeWorldGameRules(world);
    normalizeWorldKernelConfig(world);
    world.worldAgent = normalizeWorldAgentConfig(world);
    return world;
}

const WORLD_KNOWLEDGE_SOURCES = new Set(['witnessed', 'told', 'public', 'suspected', 'believed', 'life_seed', 'unknown']);
const WORLD_CONSEQUENCE_STATES = new Set(['created', 'active', 'escalating', 'decaying', 'resolved']);

function normalizeNpcKnowledgeEntry(raw, defaults = {}) {
    const item = typeof raw === 'string' ? { text: raw } : (experimentalIsPlainObject(raw) ? raw : {});
    const sourceType = WORLD_KNOWLEDGE_SOURCES.has(item.sourceType || item.source)
        ? (item.sourceType || item.source) : (defaults.sourceType || 'unknown');
    const confidence = livingClamp(item.confidence == null
        ? (sourceType === 'witnessed' ? 1 : sourceType === 'told' ? 0.72 : 0.55)
        : item.confidence, 0, 1);
    const turn = Math.max(0, parseInt(item.turn ?? defaults.turn) || 0);
    const text = String(item.text || item.observation || defaults.text || '').trim().slice(0, 500);
    if (!text) return null;
    return {
        id: String(item.id || defaults.id || livingId('obs', `${turn}_${text}`)).slice(0, 100),
        eventId: String(item.eventId || item.event_id || defaults.eventId || '').slice(0, 100),
        text,
        sourceType,
        source: sourceType,
        sourceNpcId: String(item.sourceNpcId || item.source_npc_id || defaults.sourceNpcId || '').slice(0, 100),
        evidenceMode: String(item.evidenceMode || item.evidence_mode || defaults.evidenceMode
            || (sourceType === 'witnessed' ? 'direct' : sourceType === 'told' ? 'hearsay' : 'inference')).slice(0, 40),
        confidence,
        visibility: ['public', 'private'].includes(item.visibility) ? item.visibility : (defaults.visibility || 'private'),
        contradicted: item.contradicted === true,
        allowedToShare: item.allowedToShare !== false && item.allowed_to_share !== false,
        learnedAt: {
            turn,
            absoluteMinute: Math.max(0, parseInt(item.learnedAt?.absoluteMinute ?? item.absoluteMinute ?? defaults.absoluteMinute) || 0)
        },
        turn
    };
}

function addNpcKnowledge(world, sess, npcRef, raw, defaults = {}) {
    const npcId = resolveNpcId(world, npcRef, sess) || String(npcRef || '');
    const entState = sess?.entityStates?.[npcId];
    if (!npcId || !entState) return null;
    const entry = normalizeNpcKnowledgeEntry(raw, defaults);
    if (!entry) return null;
    if (!Array.isArray(entState.observations)) entState.observations = [];
    const duplicate = entState.observations.find(item =>
        (entry.eventId && item.eventId === entry.eventId) || String(item.text || '').toLowerCase() === entry.text.toLowerCase());
    if (duplicate) {
        if (entry.confidence > Number(duplicate.confidence || 0)) Object.assign(duplicate, entry);
        return duplicate;
    }
    entState.observations.push(entry);
    entState.observations = entState.observations.slice(-100);
    return entry;
}

function normalizeWorldConsequences(world, sess) {
    if (!Array.isArray(sess.consequences)) sess.consequences = [];
    const locationIds = new Set((world.locations || []).map(location => location.id));
    const entityIds = new Set((world.entities || []).map(entity => entity.id));
    sess.consequences = sess.consequences.slice(-300).map((raw, index) => {
        const item = experimentalIsPlainObject(raw) ? raw : { detail: String(raw || '') };
        const state = WORLD_CONSEQUENCE_STATES.has(item.state) ? item.state : 'created';
        const createdTurn = Math.max(1, parseInt(item.createdTurn) || 1);
        return {
            id: String(item.id || livingId('consequence', `${createdTurn}_${index}_${item.title || item.detail}`)).slice(0, 100),
            type: String(item.type || 'world').slice(0, 60),
            title: String(item.title || item.detail || 'Unresolved consequence').slice(0, 160),
            detail: String(item.detail || item.title || '').slice(0, 600),
            state,
            createdTurn,
            updatedTurn: Math.max(createdTurn, parseInt(item.updatedTurn) || createdTurn),
            locationId: locationIds.has(item.locationId) ? item.locationId : '',
            actorIds: [...new Set((Array.isArray(item.actorIds) ? item.actorIds : [])
                .filter(id => id === 'player' || entityIds.has(id)))].slice(0, 20),
            sourceEventId: String(item.sourceEventId || '').slice(0, 100),
            severity: livingClamp(item.severity == null ? 35 : item.severity, 0, 100),
            escalateAfterTurns: Math.max(0, parseInt(item.escalateAfterTurns) || 0),
            decayAfterTurns: Math.max(0, parseInt(item.decayAfterTurns) || 0),
            resolvedTurn: item.resolvedTurn == null ? null : Math.max(createdTurn, parseInt(item.resolvedTurn) || createdTurn),
            evidence: String(item.evidence || '').slice(0, 400),
            visibility: ['public', 'private', 'hidden'].includes(item.visibility) ? item.visibility : 'private'
        };
    });
    return sess.consequences;
}

function createWorldConsequence(world, sess, raw) {
    const policy = normalizeWorldGameRules(world).consequences;
    if (policy?.enabled === false) return null;
    normalizeWorldConsequences(world, sess);
    const turn = Math.max(1, parseInt(sess.turnCount) || 1);
    const sourceEventId = String(raw?.sourceEventId || '').slice(0, 100);
    const existing = sourceEventId && sess.consequences.find(item => item.sourceEventId === sourceEventId);
    if (existing) return existing;
    const entry = {
        ...raw,
        state: raw?.state || 'created',
        createdTurn: turn,
        updatedTurn: turn,
        escalateAfterTurns: raw?.escalateAfterTurns == null ? policy.escalationTurns : raw.escalateAfterTurns,
        decayAfterTurns: raw?.decayAfterTurns == null ? policy.decayTurns : raw.decayAfterTurns
    };
    sess.consequences.push(entry);
    normalizeWorldConsequences(world, sess);
    const maxActive = Math.max(10, parseInt(policy?.maxActive) || 120);
    const resolved = sess.consequences.filter(item => item.state === 'resolved');
    const active = sess.consequences.filter(item => item.state !== 'resolved');
    sess.consequences = [...resolved.slice(-100), ...active.slice(-maxActive)];
    return sess.consequences[sess.consequences.length - 1];
}

function advanceWorldConsequences(world, sess, turn) {
    const consequences = normalizeWorldConsequences(world, sess);
    let changed = 0;
    consequences.forEach(item => {
        if (item.state === 'resolved') return;
        const age = turn - item.createdTurn;
        let next = item.state;
        if (item.state === 'created') next = 'active';
        if (item.escalateAfterTurns > 0 && age >= item.escalateAfterTurns && item.severity >= 50) next = 'escalating';
        if (item.decayAfterTurns > 0 && age >= item.decayAfterTurns && item.severity < 50) next = 'decaying';
        if (next === 'decaying' && age >= item.decayAfterTurns + 3) {
            next = 'resolved';
            item.resolvedTurn = turn;
        }
        if (next !== item.state) {
            item.state = next;
            item.updatedTurn = turn;
            changed++;
        }
    });
    return changed;
}

function normalizeLivingWorldState(world, sess) {
    if (!world || !sess) return sess;
    // Canonical immersion-engine state. Older timelines migrate lazily: the
    // first committed turn starts versioning without rewriting their history.
    if (!Array.isArray(sess.turnEvents)) sess.turnEvents = [];
    if (!Array.isArray(sess.worldTurnReceipts)) sess.worldTurnReceipts = [];
    sess.turnEvents = sess.turnEvents.slice(-1200);
    sess.worldTurnReceipts = sess.worldTurnReceipts.slice(-120);
    sess.worldStateVersion = Math.max(0, parseInt(sess.worldStateVersion) || 0);
    if (!Array.isArray(sess.pendingChecks)) {
        sess.pendingChecks = sess.pendingCheck ? [sess.pendingCheck] : [];
    }
    sess.pendingChecks = sess.pendingChecks
        .filter(item => item && typeof item === 'object' && !Array.isArray(item)).slice(0, 10);
    sess.pendingCheck = sess.pendingChecks[0] || null;
    if (!experimentalIsPlainObject(sess.lastTurnAudit)) sess.lastTurnAudit = null;
    if (!Array.isArray(sess.playerSceneConditions)) sess.playerSceneConditions = [];
    if (typeof sess.playerActivity !== 'string') sess.playerActivity = '';
    // Shops, factions and society authored since this timeline began take effect
    // now. Each only ever adds what the timeline has never seen.
    syncMarketsWithWorldShops(world, sess);
    syncFactionsWithWorld(world, sess);
    syncRelationshipsWithWorld(world, sess);
    syncLocationStatesWithWorld(world, sess);
    if (!Array.isArray(sess.scheduledEvents)) sess.scheduledEvents = [];
    if (!sess.locationStates || typeof sess.locationStates !== 'object' || Array.isArray(sess.locationStates)) sess.locationStates = {};
    if (!sess.npcRelationships || typeof sess.npcRelationships !== 'object' || Array.isArray(sess.npcRelationships)) sess.npcRelationships = {};
    if (!sess.npcScheduleOverrides || typeof sess.npcScheduleOverrides !== 'object' || Array.isArray(sess.npcScheduleOverrides)) sess.npcScheduleOverrides = {};
    if (!experimentalIsPlainObject(sess.dynamicExits)) sess.dynamicExits = {};
    if (!Array.isArray(sess.factions)) sess.factions = [];
    if (!sess.economy || typeof sess.economy !== 'object' || Array.isArray(sess.economy)) sess.economy = {};
    if (!sess.economy.currency) sess.economy.currency = 'coin';
    if (!sess.economy.markets || typeof sess.economy.markets !== 'object' || Array.isArray(sess.economy.markets)) sess.economy.markets = {};
    if (!sess.playstyle || typeof sess.playstyle !== 'object' || Array.isArray(sess.playstyle)) sess.playstyle = {};
    if (!Number.isFinite(Number(sess.playstyle.turnsObserved))) sess.playstyle.turnsObserved = 0;
    if (!sess.playstyle.signals || typeof sess.playstyle.signals !== 'object' || Array.isArray(sess.playstyle.signals)) sess.playstyle.signals = {};
    if (!sess.playstyle.preferences || typeof sess.playstyle.preferences !== 'object' || Array.isArray(sess.playstyle.preferences)) sess.playstyle.preferences = {};
    if (!Array.isArray(sess.playstyle.dominant)) sess.playstyle.dominant = [];
    if (!sess.playstyle.summary) sess.playstyle.summary = 'No clear playstyle pattern yet.';
    if (!Array.isArray(sess.worldNews)) sess.worldNews = [];
    normalizeWorldConsequences(world, sess);
    Object.values(sess.entityStates || {}).forEach(entState => {
        entState.observations = (Array.isArray(entState.observations) ? entState.observations : [])
            .map(item => normalizeNpcKnowledgeEntry(item)).filter(Boolean).slice(-100);
    });
    normalizeWorldSocietyState(world, sess);
    // Knowledge tracking arrived after some timelines were saved; items with no
    // record of who knows them are treated as already-circulating common talk
    // rather than retroactively hidden from characters who plausibly heard.
    sess.worldNews = sess.worldNews.slice(-80).map(item => {
        const entry = (item && typeof item === 'object' && !Array.isArray(item))
            ? item : { text: String(item || '') };
        entry.knownBy = Array.isArray(entry.knownBy)
            ? [...new Set(entry.knownBy.map(id => String(id || '')).filter(Boolean))].slice(0, 40)
            : null;
        entry.playerWitnessed = entry.playerWitnessed === true;
        entry.transmissions = (Array.isArray(entry.transmissions) ? entry.transmissions : []).slice(-80).map(record => ({
            from: String(record?.from || '').slice(0, 100),
            to: String(record?.to || '').slice(0, 100),
            turn: Math.max(0, parseInt(record?.turn) || 0),
            locationId: String(record?.locationId || '').slice(0, 100),
            confidence: livingClamp(record?.confidence == null ? 0.7 : record.confidence, 0, 1)
        }));
        return entry;
    });
    sess.lastLivingWorldTick = Math.max(0, parseInt(sess.lastLivingWorldTick) || 0);
    sess.lastLivingWorldMinute = Math.max(0, parseInt(sess.lastLivingWorldMinute) || 0);
    sess.lastWorldAgentTurn = Math.max(0, parseInt(sess.lastWorldAgentTurn) || 0);
    if (!sess.livingWorldActivity || typeof sess.livingWorldActivity !== 'object' || Array.isArray(sess.livingWorldActivity)) {
        sess.livingWorldActivity = {};
    }
    ['turn', 'events', 'goals', 'factions', 'markets', 'scheduleMoves', 'activeSchedules'].forEach(key => {
        sess.livingWorldActivity[key] = Math.max(0, parseInt(sess.livingWorldActivity[key]) || 0);
    });

    // A living-world session must have something concrete to simulate and
    // display even before the model creates factions or future events. Seed
    // the player's current place as a persistent local-state record. Other
    // locations are initialized lazily when visited or changed.
    const currentLocation = getLocationRef(world, sess.playerLocation);
    if (currentLocation && !sess.locationStates[currentLocation.id]) {
        sess.locationStates[currentLocation.id] = {
            conditions: [],
            controlFactionId: '',
            danger: 0,
            prosperity: 50,
            resources: {}
        };
    }

    sess.scheduledEvents = sess.scheduledEvents.slice(0, 500).map((event, index) => ({
        id: String(event?.id || `event_${index + 1}`).slice(0, 80),
        title: String(event?.title || 'Unnamed event').slice(0, 120),
        description: String(event?.description || event?.title || 'Something changes in the world.').slice(0, 500),
        status: ['scheduled', 'triggered', 'cancelled'].includes(event?.status) ? event.status : 'scheduled',
        dueTurn: event?.dueTurn == null ? null : Math.max(1, parseInt(event.dueTurn) || 1),
        dueMinute: event?.dueMinute == null ? null : Math.max(0, parseInt(event.dueMinute) || 0),
        repeatEveryTurns: Math.max(0, parseInt(event?.repeatEveryTurns) || 0),
        repeatEveryMinutes: Math.max(0, parseInt(event?.repeatEveryMinutes) || 0),
        locationId: getLocationRef(world, event?.locationId)?.id || null,
        conditionOnTrigger: event?.conditionOnTrigger ? String(event.conditionOnTrigger).slice(0, 120) : '',
        conditionDurationTurns: Math.max(0, parseInt(event?.conditionDurationTurns) || 0),
        factionId: event?.factionId ? String(event.factionId).slice(0, 80) : '',
        influenceChange: livingClamp(event?.influenceChange || 0, -20, 20),
        lastTriggeredTurn: Math.max(0, parseInt(event?.lastTriggeredTurn) || 0)
    }));

    Object.keys(sess.locationStates).forEach(locId => {
        if (!world.locations.some(location => location.id === locId)) {
            delete sess.locationStates[locId];
            return;
        }
        const state = sess.locationStates[locId] || {};
        state.conditions = (Array.isArray(state.conditions) ? state.conditions : []).slice(0, 50).map((condition, index) => {
            const item = typeof condition === 'string' ? { label: condition } : (condition || {});
            return {
                id: String(item.id || livingId('condition', item.label || index)).slice(0, 80),
                label: String(item.label || 'Changed').slice(0, 120),
                expiresTurn: item.expiresTurn == null ? null : Math.max(1, parseInt(item.expiresTurn) || 1)
            };
        });
        state.controlFactionId = state.controlFactionId ? String(state.controlFactionId).slice(0, 80) : '';
        state.danger = livingClamp(state.danger == null ? 0 : state.danger, 0, 100);
        state.prosperity = livingClamp(state.prosperity == null ? 50 : state.prosperity, 0, 100);
        if (!state.resources || typeof state.resources !== 'object' || Array.isArray(state.resources)) state.resources = {};
        Object.keys(state.resources).forEach(key => {
            state.resources[key] = livingClamp(state.resources[key], 0, 999999);
        });
        sess.locationStates[locId] = state;
    });

    sess.factions = sess.factions.slice(0, 200).map((faction, index) => ({
        id: String(faction?.id || livingId('faction', faction?.name || index)).slice(0, 80),
        name: String(faction?.name || `Faction ${index + 1}`).slice(0, 120),
        reputation: livingClamp(faction?.reputation == null ? 0 : faction.reputation, -100, 100),
        influence: livingClamp(faction?.influence == null ? 50 : faction.influence, 0, 100),
        resources: livingClamp(faction?.resources == null ? 50 : faction.resources, 0, 999999),
        goal: String(faction?.goal || '').slice(0, 240),
        goalProgress: livingClamp(faction?.goalProgress || 0, 0, 100),
        status: ['active', 'weakened', 'defeated', 'disbanded'].includes(faction?.status) ? faction.status : 'active',
        territory: [...new Set((Array.isArray(faction?.territory) ? faction.territory : [])
            .map(ref => getLocationRef(world, ref)?.id)
            .filter(Boolean))].slice(0, 500),
        relations: (Array.isArray(faction?.relations) ? faction.relations : []).slice(0, 200).map(relation => ({
            factionId: String(relation?.factionId || '').slice(0, 80),
            score: livingClamp(relation?.score || 0, -100, 100)
        })),
        // Aims already achieved, so a victorious faction is not left inert and
        // the DM can refer to what it has actually accomplished.
        achievements: (Array.isArray(faction?.achievements) ? faction.achievements : [])
            .map(item => String(item || '').slice(0, 240)).filter(Boolean).slice(-10),
        // Authored follow-up aims, mirroring an NPC's goalPool.
        goalPool: (Array.isArray(faction?.goalPool) ? faction.goalPool : [])
            .map(entry => String(typeof entry === 'string' ? entry : entry?.goal || '').trim().slice(0, 240))
            .filter(Boolean).slice(0, 20)
    }));

    // Factions can be deleted by the narrative; every reference to a faction
    // that no longer exists is dropped here, the same way state for deleted
    // locations and NPCs is. Dangling ids otherwise accumulate forever and
    // travel into exports.
    const factionIds = new Set(sess.factions.map(faction => faction.id));
    sess.factions.forEach(faction => {
        faction.relations = faction.relations.filter(relation =>
            relation.factionId && relation.factionId !== faction.id && factionIds.has(relation.factionId));
    });
    Object.values(sess.locationStates).forEach(locState => {
        if (locState.controlFactionId && !factionIds.has(locState.controlFactionId)) locState.controlFactionId = '';
    });
    sess.scheduledEvents.forEach(event => {
        if (event.factionId && !factionIds.has(event.factionId)) {
            event.factionId = '';
            event.influenceChange = 0;
        }
    });

    Object.keys(sess.npcRelationships).forEach(key => {
        const rel = sess.npcRelationships[key] || {};
        rel.score = livingClamp(rel.score == null ? 0 : rel.score, -100, 100);
        rel.label = String(rel.label || '').slice(0, 80);
        rel.reason = String(rel.reason || '').slice(0, 240);
        rel.lastChangedTurn = Math.max(0, parseInt(rel.lastChangedTurn) || 0);
        // true only for relationships drift itself created; those are the only
        // ones whose label/reason drift may keep rewriting.
        rel.autoManaged = rel.autoManaged === true;
        sess.npcRelationships[key] = rel;
    });

    Object.keys(sess.npcScheduleOverrides).forEach(npcId => {
        if (!world.entities.some(npc => npc.id === npcId && npc.type === 'npc')) {
            delete sess.npcScheduleOverrides[npcId];
            return;
        }
        sess.npcScheduleOverrides[npcId] = (Array.isArray(sess.npcScheduleOverrides[npcId]) ? sess.npcScheduleOverrides[npcId] : [])
            .map(block => {
                const location = getLocationRef(world, block?.locationId);
                const time = isValidScheduleTime(block?.time) ? String(block.time) : '';
                if (!location || !time) return null;
                const days = (Array.isArray(block?.days) ? block.days : (block?.day ? [block.day] : []))
                    .map(day => String(day || '').trim()).filter(Boolean).slice(0, 7);
                return { time, locationId: location.id, activity: String(block?.activity || '').slice(0, 160), ...(days.length ? { days } : {}) };
            })
            .filter(Boolean)
            .sort((a, b) => a.time.localeCompare(b.time))
            .slice(0, 1000);
    });

    Object.keys(sess.economy.markets).forEach(locId => {
        if (!world.locations.some(location => location.id === locId)) {
            delete sess.economy.markets[locId];
            return;
        }
        const market = sess.economy.markets[locId];
        if (!market || typeof market !== 'object' || Array.isArray(market)) {
            delete sess.economy.markets[locId];
            return;
        }
        Object.keys(market).forEach(itemKey => {
            const stock = market[itemKey] || {};
            stock.item = String(stock.item || itemKey).slice(0, 100);
            stock.quantity = livingClamp(stock.quantity || 0, 0, 999999);
            stock.price = livingClamp(stock.price == null ? 1 : stock.price, 0, 999999);
            stock.regenPerTurn = livingClamp(stock.regenPerTurn || 0, 0, 9999);
            // The rate this good settles at when nothing is pressing on it.
            // Captured once so drift oscillates around a fixed anchor instead of
            // compounding away from its authored value.
            stock.basePrice = livingClamp(stock.basePrice == null ? stock.price : stock.basePrice, 0, 999999);
            stock.maxQuantity = livingClamp(stock.maxQuantity == null ? Math.max(stock.quantity, 100) : stock.maxQuantity, 0, 999999);
            market[itemKey] = stock;
        });
    });

    sessionNpcs(world, sess).forEach(npc => {
        const entState = sess.entityStates?.[npc.id];
        if (!entState) return;
        // World authors/importers can provide a starting agenda directly on
        // an NPC. It becomes timeline state once and is then free to evolve.
        const authoredGoal = String(npc.goal || npc.agenda || '').trim();
        if (!entState.goal && authoredGoal) {
            entState.goal = authoredGoal.slice(0, 200);
            entState.goalProgress = 0;
            entState.goalDifficulty = livingClamp(npc.goalDifficulty == null ? 50 : npc.goalDifficulty, 0, 100);
            entState.goalAutonomy = ['paused', 'low', 'medium', 'high'].includes(npc.goalAutonomy)
                ? npc.goalAutonomy : 'medium';
            entState.goalStatus = 'active';
            entState.goalSteps = (Array.isArray(npc.goalSteps) ? npc.goalSteps : [])
                .map(step => String(step).slice(0, 160)).filter(Boolean).slice(0, 20);
            entState.goalStepIndex = 0;
            entState.goalStepReported = -1;   // no beat announced yet
        } else if (entState.goal && entState.goal === authoredGoal
            && !(Array.isArray(entState.goalSteps) && entState.goalSteps.length)
            && Array.isArray(npc.goalSteps) && npc.goalSteps.length) {
            // This timeline adopted the agenda before it had authored beats.
            // Take them on now, and treat the beats already covered by existing
            // progress as water under the bridge so the feed isn't flooded with
            // a retroactive dump of everything the NPC "did" off-screen.
            entState.goalSteps = npc.goalSteps.map(step => String(step).slice(0, 160)).filter(Boolean).slice(0, 20);
            const stepSize = 100 / entState.goalSteps.length;
            const reachedIndex = livingClamp(
                Math.floor(Math.max(0, (entState.goalProgress || 0) - 0.001) / stepSize),
                0, entState.goalSteps.length - 1);
            entState.goalStepIndex = reachedIndex;
            entState.goalStepReported = (entState.goalProgress || 0) > 0 ? reachedIndex : -1;
        }
        if (entState.goal) {
            entState.goalProgress = livingClamp(entState.goalProgress || 0, 0, 100);
            entState.goalDifficulty = livingClamp(entState.goalDifficulty == null ? 50 : entState.goalDifficulty, 0, 100);
            entState.goalAutonomy = ['paused', 'low', 'medium', 'high'].includes(entState.goalAutonomy) ? entState.goalAutonomy : 'medium';
            entState.goalStatus = ['active', 'completed', 'failed', 'blocked'].includes(entState.goalStatus) ? entState.goalStatus : 'active';
            entState.goalSteps = (Array.isArray(entState.goalSteps) ? entState.goalSteps : []).map(step => String(step).slice(0, 160)).slice(0, 20);
            entState.goalStepIndex = livingClamp(entState.goalStepIndex || 0, 0, Math.max(0, entState.goalSteps.length - 1));
            // -1 means "nothing announced yet"; timelines saved before beats
            // existed adopt it so their opening beat still surfaces.
            entState.goalStepReported = Number.isFinite(entState.goalStepReported)
                ? livingClamp(entState.goalStepReported, -1, Math.max(0, entState.goalSteps.length - 1))
                : -1;
            if (entState.goalDeadlineTurn != null) entState.goalDeadlineTurn = Math.max(1, parseInt(entState.goalDeadlineTurn) || 1);
            entState.goalHistory = (Array.isArray(entState.goalHistory) ? entState.goalHistory : [])
                .map(item => String(item || '').trim().slice(0, 200)).filter(Boolean).slice(-10);
            if (entState.goalResolvedTurn != null) {
                entState.goalResolvedTurn = Math.max(1, parseInt(entState.goalResolvedTurn) || 1);
            }
        }
    });

    return sess;
}

function stableWorldRoll(seed) {
    let hash = 2166136261;
    const text = String(seed || '');
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    hash += hash << 13;
    hash ^= hash >>> 7;
    hash += hash << 3;
    hash ^= hash >>> 17;
    hash += hash << 5;
    return (hash >>> 0) / 4294967296;
}

function worldControlledEntity(world, sess) {
    const id = String(sess?.controlledEntityId || '').trim();
    return id && id !== 'player'
        ? (world?.entities || []).find(entity => entity?.id === id && entity.type === 'npc') || null
        : null;
}

function worldControlledPlayerIdentity(world, sess) {
    const controlledEntity = worldControlledEntity(world, sess);
    if (controlledEntity) return {
        id: controlledEntity.id,
        name: String(controlledEntity.name || 'Controlled character'),
        description: String(controlledEntity.description || controlledEntity.appearance || ''),
        portrayal: String(controlledEntity.persona || ''),
        locked: true,
        source: 'controlled_entity'
    };
    const canonical = experimentalIsPlainObject(world?.playerIdentity) ? world.playerIdentity : {};
    const sessionIdentity = experimentalIsPlainObject(sess?.playerIdentity) ? sess.playerIdentity : {};
    return {
        id: 'player',
        // World-owned identity is canon. A reusable global Persona is a
        // portrayal source, never permission to rename that player character.
        name: String(canonical.displayName || canonical.name || sessionIdentity.canonicalName || sessionIdentity.personaName || 'the player'),
        description: String(canonical.stableIdentity || canonical.appearance || sessionIdentity.appearance || ''),
        portrayal: String(canonical.personality || ''),
        locked: canonical.locked === true,
        source: canonical.displayName || canonical.name ? 'world_player_identity' : 'session_player_identity'
    };
}

function getTimelinePersona(sess, world = null) {
    const persona = experimentalIsPlainObject(sess?.personaSnapshot)
        ? sess.personaSnapshot
        : ExperimentalWorldsHost.sharedPersonas().find(item => item.id === String(sess?.personaId || '')) || null;
    if (!persona) return null;
    // Do not silently import a globally-active profile into a world whose
    // canonical protagonist is locked to somebody else. Older timelines did
    // exactly that, which is how Alex could be narrated as Georgia Frederick.
    const identity = world ? worldControlledPlayerIdentity(world, sess) : null;
    if (identity?.locked && identity.id === 'player' && identity.name
        && String(persona.name || '').trim()
        && String(persona.name || '').trim().toLowerCase() !== identity.name.trim().toLowerCase()) return null;
    return persona;
}

async function bindPersonaToCurrentWorldTimeline(persona, options = {}) {
    const world = ExperimentalWorldsState.worlds.find(item => item.id === ExperimentalWorldsState.activeWorldId);
    const sess = getCurrentWorldSession();
    if (!world || !sess) return false;
    const selected = persona ? experimentalNormalizePersona(persona) : null;
    sess.personaId = selected?.id || '';
    sess.personaSnapshot = selected ? experimentalSafeJsonClone(selected) : null;
    sess.personaBinding = {
        personaId: selected?.id || '',
        boundAt: new Date().toISOString(),
        source: String(options.source || 'direct_world_persona_control')
    };
    // Keep the canonical player name authoritative. Persona fields describe
    // presentation and voice; they never rename a locked world protagonist.
    sess.playerIdentity = experimentalIsPlainObject(sess.playerIdentity) ? sess.playerIdentity : {};
    const identity = worldControlledPlayerIdentity(world, sess);
    if (identity.id === 'player' && !identity.locked && selected) {
        sess.playerIdentity.personaName = selected.name;
        sess.playerIdentity.age = selected.age || '';
        sess.playerIdentity.pronouns = selected.pronouns || '';
        sess.playerIdentity.appearance = selected.appearance || '';
    }
    await ExperimentalWorldsHost.persist();
    renderWorldPlayState();
    return true;
}

function lifeSeedSlug(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 46) || 'person';
}

function chooseTimelineHome(world, sourceText) {
    const text = String(sourceText || '').toLowerCase();
    const named = (world.locations || []).find(location =>
        location.name && text.includes(location.name.toLowerCase()));
    if (named) return named;
    const homes = (world.locations || []).filter(location =>
        /house|home|apartment|flat|manor|estate|farm|cottage|quarters|keep|castle|palace|hall|residence/i
            .test(`${location.name || ''} ${location.description || ''}`)
        && !/school|store|shop|office|hospital|clinic|station|classroom/i.test(location.name || ''));
    const pool = homes;
    const wantsWealth = /\b(rich|wealthy|affluent|upper[- ]class|privileged|luxury|estate)\b/i.test(text);
    const wantsStruggle = /\b(poor|working[- ]class|struggling|broke|tenement|peasant)\b/i.test(text);
    return [...pool].sort((a, b) => {
        const left = Number(a.prosperity == null ? 50 : a.prosperity);
        const right = Number(b.prosperity == null ? 50 : b.prosperity);
        if (wantsWealth) return right - left;
        if (wantsStruggle) return left - right;
        return stableWorldRoll(`${world.id}|home|${a.id}`) - stableWorldRoll(`${world.id}|home|${b.id}`);
    })[0] || null;
}

function fallbackTimelineLifePlan(world, sess, persona, origin) {
    const source = `${persona?.name || ''} ${persona?.text || ''} ${origin?.name || ''} ${origin?.role || ''} ${origin?.description || ''}`;
    const student = /student|school|new kid|teen|child|pupil|apprentice/i.test(source);
    const doctorFamily = /parents?.{0,24}(?:doctors?|dcotors?|physicians?|medical)|(?:doctor|physician|medical) parents?/i.test(source);
    const home = chooseTimelineHome(world, source);
    const school = (world.locations || []).find(location => /school|academy|college|classroom/i.test(`${location.name} ${location.description || ''}`));
    const hospital = (world.locations || []).find(location => /hospital|clinic|medical|infirmary|healer/i.test(`${location.name} ${location.description || ''}`));
    const modern = /200[0-9]|suburb|school|phone|mall|doctor|hospital/i.test(`${world.name} ${world.description}`);
    const surnames = modern ? ['Mercer', 'Bennett', 'Shah', 'Morales', 'Sullivan', 'Chen'] : ['Vale', 'Mere', 'Ashford', 'Thorne', 'Reed', 'Hale'];
    const firsts = modern ? ['Morgan', 'Alex', 'Dana', 'Jordan', 'Casey', 'Taylor', 'Jamie', 'Riley'] : ['Mara', 'Tomas', 'Elin', 'Rowan', 'Anwen', 'Gareth', 'Ilya', 'Mira'];
    const pick = (values, salt) => values[Math.floor(stableWorldRoll(`${world.id}|${sess.id}|${salt}`) * values.length) % values.length];
    const surname = String(persona?.name || '').trim().split(/\s+/).slice(-1)[0] || pick(surnames, 'surname');
    const people = [];
    if (student) {
        ['parent one', 'parent two'].forEach((relation, index) => people.push({
            id: `family_${index + 1}`,
            name: `${pick(firsts, `parent_${index}`)} ${surname}`,
            relationship_to_player: relation,
            role: doctorFamily ? 'doctor' : (modern ? (index ? 'office manager' : 'civil engineer') : (index ? 'household steward' : 'craftsperson')),
            description: `The player's ${relation}, with a life and responsibilities beyond the player.`,
            persona: index ? 'Warm, observant, firm about promises, and carrying private work pressure.' : 'Practical, protective, dryly funny, and reluctant to discuss money worries.',
            home_location_id: home?.id || '', disposition: 86,
            day_location_id: doctorFamily ? (hospital?.id || '') : '',
            goal: 'Keep the household stable without controlling the player.',
            schedule: [
                { time: '06:30', locationId: '$HOME', activity: 'getting the household ready', days: ['weekday'] },
                ...(doctorFamily && hospital ? [{ time: index ? '08:00' : '07:00', locationId: hospital.id, activity: 'working a medical shift', days: ['weekday'] }] : []),
                { time: '19:00', locationId: '$HOME', activity: 'handling dinner and family life', days: ['weekday'] }
            ]
        }));
        ['classmate', 'potential friend', 'social rival'].forEach((relation, index) => people.push({
            id: `peer_${index + 1}`,
            name: `${pick(firsts, `peer_${index}`)} ${pick(surnames, `peer_s_${index}`)}`,
            relationship_to_player: relation,
            role: modern ? 'student' : 'young local',
            description: `A ${relation} in the player's daily orbit.`,
            persona: ['Open and funny but unreliable under pressure.', 'Quietly ambitious, kind one-on-one, cautious in groups.', 'Confident, competitive, and more complicated than first impressions.'][index],
            home_location_id: '', disposition: [58, 66, 40][index],
            day_location_id: school?.id || '',
            goal: ['Find a place in the local social scene.', 'Protect a friendship while pursuing a private ambition.', 'Stay socially influential without showing insecurity.'][index],
            schedule: school ? [{ time: '08:00', locationId: school.id, activity: 'attending school', days: ['weekday'] }] : []
        }));
    } else {
        ['trusted local contact', 'neighbor', 'work or community acquaintance'].forEach((relation, index) => people.push({
            id: `anchor_${index + 1}`, name: `${pick(firsts, `adult_${index}`)} ${pick(surnames, `adult_s_${index}`)}`,
            relationship_to_player: relation, role: modern ? ['friend', 'neighbor', 'coworker'][index] : ['confidant', 'neighbor', 'local associate'][index],
            description: `A persistent ${relation} connected to the player's ordinary life.`,
            persona: ['Loyal, candid, and willing to challenge bad decisions.', 'Helpful, nosy, and deeply informed about the area.', 'Capable, busy, and balancing friendship against personal ambition.'][index],
            home_location_id: '', disposition: [76, 61, 55][index],
            goal: 'Pursue a personal goal that occasionally intersects the player’s life.',
            schedule: []
        }));
    }
    return {
        summary: `${student ? 'Household and school circle' : 'Home and local social circle'} initialized from the selected identity.`,
        home: home ? { location_id: home.id } : {
            name: `${surname} Home`,
            description: 'A household home grounded in the player’s stated background and starting circumstances.',
            connects_to: origin?.startLocationId || sess.playerLocation
        },
        people,
        relationships: student ? [{ a: 'family_1', b: 'family_2', label: 'co-parents', score: 72, reason: 'They share a household and responsibility for the player.' }] : []
    };
}

async function requestTimelineLifePlan(world, sess, persona, origin) {
    if (!ExperimentalWorldsHost.hasApiCredentials()) throw new Error('No configured model credentials');
    const locations = (world.locations || []).slice(0, 350).map(location =>
        `${location.id} | ${location.name} | ${location.region || '-'} | ${location.mapType || '-'} | prosperity ${location.prosperity ?? 50}`).join('\n');
    const people = (world.entities || []).filter(entity => entity.type === 'npc' && !entity.sessionOrigin).slice(0, 240).map(entity =>
        `${entity.id} | ${entity.name} | ${String(entity.description || '').slice(0, 100)} | home ${entity.homeLocation || '-'} | at ${entity.startLocation || '-'}`).join('\n');
    const source = `PERSONA NAME: ${persona?.name || 'none'}\nPERSONA DETAILS:\n${persona?.text || 'none'}\n\nSTARTING LIFE: ${origin?.name || 'default'}\nROLE: ${origin?.role || 'unspecified'}\nSOCIAL RANK: ${origin?.socialRank || 'unspecified'}\nDETAILS: ${origin?.description || ''}\nOBLIGATIONS: ${(origin?.obligations || []).join('; ') || 'none stated'}\nPRIVILEGES: ${(origin?.privileges || []).join('; ') || 'none stated'}\nHOLDINGS: ${(origin?.holdings || []).join('; ') || 'none stated'}\nOUTFIT: ${origin?.outfit || 'unspecified'}\nOPENING: ${origin?.intro || 'world default'}\nSTART LOCATION: ${origin?.startLocationId || sess.playerLocation}`;
    const body = {
        model: structuredModelFor(world), max_tokens: 6500,
        messages: [
            { role: 'system', content: `You initialize a persistent life inside an existing sandbox world. Convert the player's Persona and Starting Life into concrete simulation state without contradicting either.

Reuse existing location_id and existing_npc_id whenever they genuinely fit. Create new people when the Persona states family or close relationships that do not already exist. A student should normally have a plausible household plus 3-6 school/social connections; an adult should have household/local/work anchors. Every recurring person needs a role, relationship to the player, distinct personality, personal goal, home when knowable, and a weekly routine using ONLY location IDs in the manifest. If the Persona says the parents are doctors and the family is wealthy, those exact facts must become structured people, workplaces, schedules and an affluent home—not flavor text.

Return only JSON:
{"summary":"...","home":{"location_id":"existing id or blank","name":"new home name only if needed","description":"...","connects_to":"existing id","parent_location_id":"existing id"},"people":[{"id":"temporary stable key","existing_npc_id":"optional existing id","name":"...","relationship_to_player":"mother/father/sibling/friend/classmate/rival/coworker/etc","role":"...","description":"...","persona":"...","home_location_id":"existing id or $HOME","day_location_id":"existing school/work id","goal":"...","disposition":0,"schedule":[{"time":"07:00","locationId":"existing id or $HOME","activity":"...","days":["weekday"]}]}],"relationships":[{"a":"temporary person id","b":"temporary person id","label":"...","score":0,"reason":"..."}]}

Disposition and relationship scores are -100..100. Generate 4-10 people, never an anonymous crowd. Do not create a new town or duplicate an existing suitable house, school, hospital or workplace.` },
            { role: 'user', content: `${source}\n\nWORLD: ${world.name}\n${world.description || ''}\n\nLOCATIONS:\n${locations}\n\nEXISTING PEOPLE AVAILABLE FOR REAL CONNECTIONS:\n${people || 'none'}` }
        ]
    };
    const modelInfo = openRouterModels.find(model => model.id === body.model);
    if (!ExperimentalWorldsHost.isLocalProvider() && modelInfo?.supported_parameters?.some(parameter => STRUCTURED_PARAM_FLAGS.includes(parameter))) {
        body.response_format = { type: 'json_object' };
    }
    const response = await fetch(ExperimentalWorldsHost.apiBase() + '/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...ExperimentalWorldsHost.authHeaders(), ...ExperimentalWorldsHost.attributionHeaders() },
        body: JSON.stringify(ExperimentalWorldsHost.applyOpenRouterRouting(body, world))
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.error?.message || response.statusText);
    const message = (await response.json())?.choices?.[0]?.message || {};
    const content = Array.isArray(message.content) ? message.content.map(part => part?.text || '').join(' ') : (message.content || message.reasoning || '');
    const plan = experimentalExtractJSON(String(content));
    if (!plan || !Array.isArray(plan.people) || plan.people.length < 1) throw new Error('Model returned no valid people array');
    return plan;
}

function applyTimelineLifePlan(world, sess, persona, origin, rawPlan, source = 'model') {
    const plan = experimentalIsPlainObject(rawPlan) ? rawPlan : {};
    const sourceText = `${persona?.text || ''} ${origin?.description || ''}`;
    let home = getLocationRef(world, plan.home?.location_id || plan.home?.name) || chooseTimelineHome(world, sourceText);
    const createdLocationIds = [];
    if (!home && plan.home?.name) {
        const anchor = getLocationRef(world, plan.home.connects_to || plan.home.parent_location_id || origin?.startLocationId || sess.playerLocation);
        home = {
            id: `loc_life_${lifeSeedSlug(plan.home.name)}_${String(sess.id).slice(-6)}`,
            name: String(plan.home.name).slice(0, 120), region: String(plan.home.region || anchor?.region || '').slice(0, 120),
            mapType: 'building', parentLocationId: getLocationRef(world, plan.home.parent_location_id)?.id || '',
            description: String(plan.home.description || 'The player’s home and the center of their household life.').slice(0, 700),
            hiddenDescription: '', exits: anchor ? [`to ${anchor.name}`] : [], secrets: [], sessionOrigin: sess.id
        };
        if (anchor) {
            addSessionDynamicExit(sess, anchor.id, home.name);
        }
        world.locations.push(home);
        createdLocationIds.push(home.id);
    }
    home = home || getLocationRef(world, origin?.startLocationId || sess.playerLocation);
    const idMap = new Map();
    const seededPeople = [];
    const rawPeople = (Array.isArray(plan.people) ? plan.people : []).filter(experimentalIsPlainObject).slice(0, 16);
    rawPeople.forEach((raw, index) => {
        const existing = raw.existing_npc_id ? world.entities.find(entity => entity.id === raw.existing_npc_id && entity.type === 'npc' && isVisibleToSession(entity, sess)) : null;
        const key = String(raw.id || `person_${index + 1}`);
        let npc = existing;
        if (!npc) {
            const baseId = `ent_life_${lifeSeedSlug(raw.name || key)}_${String(sess.id).slice(-6)}`;
            let id = baseId;
            let suffix = 2;
            while (world.entities.some(entity => entity.id === id)) id = `${baseId}_${suffix++}`;
            const relationship = String(raw.relationship_to_player || 'acquaintance');
            const sharesPlayerHome = /parent|guardian|spouse|sibling|child|roommate|household|family/i.test(relationship);
            const rawHome = raw.home_location_id === '$HOME' ? home : getLocationRef(world, raw.home_location_id);
            const defaultHome = sharesPlayerHome ? home : null;
            const rawDay = getLocationRef(world, raw.day_location_id);
            const resolveBlockLocation = ref => ref === '$HOME' ? home : getLocationRef(world, ref);
            const schedule = (Array.isArray(raw.schedule) ? raw.schedule : []).map(block => {
                const location = resolveBlockLocation(block?.locationId || block?.location_id);
                if (!location || !isValidScheduleTime(block?.time)) return null;
                const days = (Array.isArray(block.days) ? block.days : []).map(day => String(day).slice(0, 20)).filter(Boolean).slice(0, 7);
                return { time: String(block.time), locationId: location.id, activity: String(block.activity || raw.role || '').slice(0, 160), ...(days.length ? { days } : {}) };
            }).filter(Boolean).sort((a, b) => a.time.localeCompare(b.time)).slice(0, 16);
            npc = {
                id, type: 'npc', name: String(raw.name || `New Person ${index + 1}`).slice(0, 120),
                role: String(raw.role || '').slice(0, 120), relationshipToPlayer: relationship.slice(0, 100),
                aliases: [relationship, ...(/\bmother\b/i.test(relationship) ? ['mom', 'mum'] : []), ...(/\bfather\b/i.test(relationship) ? ['dad'] : [])]
                    .map(alias => String(alias).trim().slice(0, 80)).filter(Boolean),
                description: String(raw.description || `A persistent ${raw.relationship_to_player || 'person'} in the player's life.`).slice(0, 700),
                persona: String(raw.persona || '').slice(0, 1200), isMajor: true,
                homeLocation: (rawHome || defaultHome)?.id || '', startLocation: (rawDay || rawHome || defaultHome)?.id || sess.playerLocation,
                goal: String(raw.goal || 'Maintain their own life while responding honestly to the player.').slice(0, 240), goalAutonomy: 'medium',
                goalSteps: [], schedule, secrets: [], sessionOrigin: sess.id
            };
            world.entities.push(npc);
        }
        idMap.set(key, npc.id);
        const seededHome = raw.home_location_id === '$HOME' ? home : getLocationRef(world, raw.home_location_id);
        const seededDay = getLocationRef(world, raw.day_location_id);
        const location = seededDay || seededHome || getLocationRef(world, npc.startLocation || npc.homeLocation) || home || getLocationRef(world, sess.playerLocation);
        const relationship = String(raw.relationship_to_player || npc.relationshipToPlayer || 'acquaintance').slice(0, 100);
        const disposition = livingClamp(raw.disposition == null ? (/parent|guardian|spouse|sibling|close friend/i.test(relationship) ? 82 : 58) : raw.disposition, 0, 100);
        sess.entityStates[npc.id] = {
            ...(sess.entityStates[npc.id] || {}), location: location?.id || sess.playerLocation,
            disposition, relationshipToPlayer: relationship,
            observations: [{ id: `obs_seed_${npc.id}`, text: `Has an established ${relationship} relationship with the player from before this timeline began.`, source: 'life_seed', confidence: 1, turn: 0 }]
        };
        if (existing && Array.isArray(raw.schedule)) {
            const overrides = raw.schedule.map(block => {
                const scheduleLocation = (block?.locationId || block?.location_id) === '$HOME'
                    ? home : getLocationRef(world, block?.locationId || block?.location_id);
                if (!scheduleLocation || !isValidScheduleTime(block?.time)) return null;
                const days = (Array.isArray(block.days) ? block.days : []).map(day => String(day).slice(0, 20)).filter(Boolean).slice(0, 7);
                return { time: String(block.time), locationId: scheduleLocation.id, activity: String(block.activity || raw.role || '').slice(0, 160), ...(days.length ? { days } : {}) };
            }).filter(Boolean).sort((a, b) => a.time.localeCompare(b.time)).slice(0, 16);
            if (overrides.length) sess.npcScheduleOverrides[npc.id] = overrides;
        }
        seededPeople.push({ id: npc.id, name: npc.name, relationship, role: npc.role || raw.role || '', homeLocationId: seededHome?.id || npc.homeLocation || '', disposition });
    });
    (Array.isArray(plan.relationships) ? plan.relationships : []).slice(0, 60).forEach(raw => {
        const a = idMap.get(String(raw?.a || ''));
        const b = idMap.get(String(raw?.b || ''));
        if (!a || !b || a === b) return;
        sess.npcRelationships[relationshipKey(a, b)] = {
            score: livingClamp(raw.score || 0, -100, 100), label: String(raw.label || '').slice(0, 80),
            reason: String(raw.reason || '').slice(0, 240), lastChangedTurn: 0
        };
    });
    const household = seededPeople.filter(person => /parent|guardian|spouse|sibling|child|roommate|family/i.test(person.relationship));
    for (let a = 0; a < household.length; a++) for (let b = a + 1; b < household.length; b++) {
        const key = relationshipKey(household[a].id, household[b].id);
        if (!sess.npcRelationships[key]) sess.npcRelationships[key] = { score: 65, label: 'household family', reason: 'They share a home and history.', lastChangedTurn: 0 };
    }
    sess.playerIdentity = experimentalIsPlainObject(sess.playerIdentity) ? sess.playerIdentity : {};
    sess.playerIdentity.homeLocationId = home?.id || '';
    sess.playerIdentity.householdNpcIds = household.map(person => person.id);
    sess.playerIdentity.socialNpcIds = seededPeople.map(person => person.id);
    sess.personaId = persona?.id || '';
    sess.lifeSeed = {
        version: 1, initialized: true, source, personaId: persona?.id || '', originId: origin?.id || sess.originId || '',
        homeLocationId: home?.id || '', people: seededPeople, locationIds: createdLocationIds,
        summary: String(plan.summary || `${seededPeople.length} persistent people and a home were connected to this life.`).slice(0, 500),
        generatedAt: Date.now()
    };
    const line = `Active life initialized: ${sess.lifeSeed.summary}`;
    appendWorldLedgerEntry(sess, line);
    normalizeAuthoredWorld(world);
    normalizeLivingWorldState(world, sess);
    return sess.lifeSeed;
}

async function initializeTimelineLife(world, sess, persona) {
    const origin = (world.startingLives || []).find(life => life.id === sess.originId) || null;
    let plan;
    let source = 'model';
    try {
        plan = await requestTimelineLifePlan(world, sess, persona, origin);
    } catch (error) {
        console.warn('Timeline life model generation failed; using deterministic initializer:', error.message);
        plan = fallbackTimelineLifePlan(world, sess, persona, origin);
        source = 'deterministic_fallback';
    }
    const result = applyTimelineLifePlan(world, sess, persona, origin, plan, source);
    ExperimentalWorldsHost.notify(`Active life initialized · ${result.people.length} persistent people`, 'success');
    return result;
}

/**
 * Build the visible, authored opening for a selected starting life.
 *
 * Explicit `life.intro` remains authoritative.  When it is empty, imported
 * checkpoint packs can still provide a meaningful opening through their card
 * metadata.  Keeping this derivation here makes the behaviour generic: it
 * works for any world that stores life metadata without hard-coding a world's
 * prose or checkpoint IDs.
 */
function formatStartingLifeOpening(world, life) {
    if (!life || !experimentalIsPlainObject(life)) return '';
    const explicit = recoverStartingLifeIntro(world, life);
    if (explicit) return explicit;
    const location = getLocationRef(world, life.startLocationId);
    const context = [
        String(life.icon || '').trim(),
        [String(life.socialRank || life.role || '').trim(), String(location?.name || '').trim()]
            .filter(Boolean).join(' · '),
        String(life.name || life.title || '').trim(),
        String(life.description || '').trim()
    ].filter(Boolean);
    return context.join('\n').slice(0, 6000);
}

/**
 * Recover checkpoint prose that predates the regenerated Melbourne export.
 * The old shared-library snapshot is the source of truth for these four
 * authored openings; the newer export retained the life metadata but emitted
 * empty `intro` fields. This is deliberately gated to the Melbourne profile
 * and only fills a blank field, so it cannot overwrite a world's own prose.
 */
function recoverStartingLifeIntro(world, life) {
    const explicit = String(
        life?.intro
        || life?.openingNarration
        || life?.opening
        || life?.checkpointOverlay?.intro
        || life?.checkpointOverlay?.openingNarration
        || ''
    ).trim();
    if (explicit) return explicit;
    const isMelbourne = String(world?.mechanicsProfile || '').toLowerCase() === 'melbourne_v1'
        || String(world?.bundledId || '').toLowerCase() === 'melbourne-canonical-v1';
    if (!isMelbourne) return '';
    const recovered = {
        checkpoint_interview: 'Friday 14 August 2026, 12:00. Alex is on Collins Street with three hours before his 15:00 M&M BI Data Analyst interview. The interview has not happened yet and nothing between now and then is pre-played. His phone, wallet, keys and interview notes are with him. The CBD is functioning normally around him. He can prepare, wander, eat, call someone, arrive early or do something less sensible; the world should respond without choosing his actions for him.',
        checkpoint_job_offer: 'Friday 14 August 2026, 18:30. Georgia has offered Alex the M&M BI Data Analyst role and he has accepted. He is at Guildhall with the offer email on his phone while Friday service starts to gather around a venue he already knows well. Do not invent a transcript of the interview or assume who Alex has told about the job. Begin from the ordinary social fact of him being there with a new job and let familiar people react only when they actually learn about it.',
        checkpoint_first_day: "Monday 17 August 2026, 08:40. Alex arrives in M&M's ground-floor lobby for his first day as a BI Data Analyst. The accepted job offer is canon; the exact Friday interview conversation is not. Reception, access, onboarding, awkward first-day logistics and Georgia's department are ahead of him. Let the office reveal itself through people, systems and small practical problems rather than a corporate exposition dump.",
        checkpoint_networking: "Friday 21 August 2026, 17:30. After one week in BI, Alex arrives at The Kelvin Bar, an aggressively ordinary CBD bar whose upstairs function room M&M has hired for a networking event. There are name tags, function food, a limited company tab and a room of people who mostly know one other person. Georgia is already inside and plainly dislikes the entire genre of event. The external event-side organiser has not arrived yet. Around Alex are unfamiliar M&M staff, suppliers, agency people and adjacent professionals who should be generated as ordinary people if he engages them. Nobody in the room is preselected as secretly important. Start here and give Alex room to enter the event before the night acquires momentum."
    }[String(life?.id || '')];
    return recovered || '';
}

function applyStartingLifeToSession(world, sess, originId) {
    normalizeWorldSandboxConfig(world);
    const life = world.startingLives.find(item => item.id === originId);
    if (!life || !sess) return null;
    sess.originId = life.id;
    sess.playerIdentity = {
        originId: life.id,
        role: life.role,
        socialRank: life.socialRank,
        title: life.title,
        factionId: life.factionId,
        legalStatus: life.legalStatus,
        privileges: [...life.privileges],
        obligations: [...life.obligations],
        skills: [...life.skills],
        perks: [...life.perks],
        holdings: [...life.holdings]
    };
    if (getLocationRef(world, life.startLocationId)) sess.playerLocation = life.startLocationId;
    sess.inventory = [...life.inventory];
    (world.hudConfig?.stats || []).forEach(stat => {
        sess.playerStats[stat.id] = stat.value;
    });
    // Browsing New Session Setup cards must not accumulate reputation or stat
    // overrides from every life previewed before the player presses Begin.
    sess.factions = seedFactionsFromWorld(world);
    sess.outfit = life.outfit || '';
    sess.currentOutfit = life.outfit || '';
    Object.entries(life.statOverrides).forEach(([statId, value]) => {
        if (sess.playerStats[statId] !== undefined || (world.hudConfig?.stats || []).some(stat => stat.id === statId)) {
            sess.playerStats[statId] = value;
        }
    });
    if (life.factionId) {
        const faction = sess.factions.find(item => item.id === life.factionId);
        if (faction) faction.reputation = life.factionReputation;
    }
    sess.legalStanding = {};
    if (life.factionId) {
        sess.legalStanding[life.factionId] = {
            status: life.legalStatus,
            heat: /outlaw|wanted|criminal/i.test(life.legalStatus) ? 55 : 0,
            crimes: [],
            lastChangedTurn: 0
        };
    }
    // A starting life may provide a complete authored opening in `intro`.
    // Some imported worlds (including the Melbourne checkpoint pack) leave
    // that field empty because the useful opening is represented by the
    // checkpoint card itself: icon, social rank, location, title and
    // description.  Do not fall through to the generic world intro in that
    // case; that text describes the checkpoint system, not the selected life.
    const checkpointOpening = formatStartingLifeOpening(world, life);
    if (checkpointOpening) sess.pendingOriginIntro = checkpointOpening;
    else delete sess.pendingOriginIntro;
    const label = life.title ? `${life.title}, ${life.role}` : life.role;
    sess.ledger = `Began this life as ${label}${life.factionId ? `, aligned with ${sess.factions.find(f => f.id === life.factionId)?.name || life.factionId}` : ''}.`;
    // World mechanics checkpoint overlay: a starting life may carry durable
    // facts, relationships, inventory containers, cognition and an intro
    // that the engine applies before play begins.
    if (window.ExperimentalWorldsMechanics?.isEnabled?.(world) && life.checkpointOverlay) {
        window.ExperimentalWorldsMechanics.applyCheckpoint(world, sess, life);
    }
    return life;
}

function runSocietySimulationTick(world, sess, turn) {
    const config = normalizeWorldSandboxConfig(world);
    const society = normalizeWorldSocietyState(world, sess);
    if (!config.enabled || !society || society.lastTickTurn >= turn) return { changed: 0 };
    society.lastTickTurn = turn;
    let changed = 0;
    const seasonPressure = { Spring: 1, Summer: 2, Autumn: 4, Winter: -5 }[society.season] || 0;
    Object.entries(society.settlements).forEach(([locationId, settlement]) => {
        const locationState = sess.locationStates?.[locationId];
        const contested = sess.factions.filter(faction => faction.territory?.includes(locationId)).length > 1;
        const harvestRoll = stableWorldRoll(`${world.id}|${sess.id}|settlement|${locationId}|${turn}`);
        const foodDelta = config.seasons && turn % 3 === 0
            ? seasonPressure + (harvestRoll > .82 ? 3 : harvestRoll < .12 ? -4 : 0) : 0;
        const securityDelta = contested ? -2 : (locationState?.danger > 65 ? -1 : locationState?.danger < 25 ? 1 : 0);
        const wealthDelta = settlement.food < 25 ? -2 : settlement.security > 65 && settlement.food > 55 ? 1 : 0;
        const unrestDelta = settlement.food < 25 || settlement.security < 25 ? 2
            : settlement.food > 55 && settlement.security > 55 ? -1 : 0;
        [['food', foodDelta], ['security', securityDelta], ['wealth', wealthDelta], ['unrest', unrestDelta]]
            .forEach(([key, delta]) => {
                if (!delta) return;
                const before = settlement[key];
                settlement[key] = livingClamp(before + delta, 0, 100);
                if (settlement[key] !== before) changed++;
            });
        settlement.growth = livingClamp(Math.round((settlement.food + settlement.wealth + settlement.security - settlement.unrest - 140) / 6), -100, 100);
        if (turn % 12 === 0 && settlement.growth !== 0) {
            const before = settlement.population;
            settlement.population = livingClamp(Math.round(before * (1 + settlement.growth / 10000)), 1, 10000000);
            if (settlement.population !== before) changed++;
        }
        if (locationState) {
            locationState.prosperity = livingClamp(Math.round((locationState.prosperity * 3 + settlement.wealth) / 4), 0, 100);
            locationState.danger = livingClamp(Math.round((locationState.danger * 3 + (100 - settlement.security)) / 4), 0, 100);
        }
    });

    if (config.conflict && turn % 6 === 0) {
        const active = sess.factions.filter(faction => faction.status === 'active');
        for (let i = 0; i < active.length; i++) {
            const enemy = (active[i].relations || []).find(relation => relation.score <= FACTION_WAR_AT);
            if (!enemy) continue;
            const other = active.find(item => item.id === enemy.factionId);
            if (!other) continue;
            const conflictId = [active[i].id, other.id].sort().join('|');
            let conflict = society.conflicts.find(item => item.id === conflictId);
            if (!conflict) {
                conflict = { id: conflictId, sides: [active[i].id, other.id], status: 'war', intensity: 20, warScore: 0, startedTurn: turn };
                society.conflicts.push(conflict);
                addWorldNews(sess, `Open conflict has begun between ${active[i].name} and ${other.name}.`, {
                    id: `news_war_${livingId('', conflictId)}_${turn}`, type: 'faction', playerVisible: false,
                    knownBy: []
                });
                changed++;
            } else if (conflict.status === 'war') {
                const swing = stableWorldRoll(`${conflictId}|${turn}`) < .5 ? -2 : 2;
                conflict.warScore = livingClamp((conflict.warScore || 0) + swing, -100, 100);
                conflict.intensity = livingClamp((conflict.intensity || 20) + (Math.abs(swing) ? 1 : -1), 0, 100);
                changed++;
            }
        }
    }

    if (config.growth && turn % 10 === 0) {
        const candidates = Object.entries(society.settlements)
            .filter(([, settlement]) => Math.abs(settlement.growth) >= 4)
            .sort((a, b) => Math.abs(b[1].growth) - Math.abs(a[1].growth));
        if (candidates.length) {
            const [locationId, settlement] = candidates[0];
            const positive = settlement.growth > 0;
            const options = positive
                ? ['A new workshop has opened', 'A market quarter is expanding', 'New households have arrived', 'Road repairs have begun']
                : ['Families are leaving', 'A workshop has shuttered', 'Food queues have lengthened', 'Road maintenance has stopped'];
            const detail = options[Math.floor(stableWorldRoll(`${locationId}|development|${turn}`) * options.length)];
            const development = {
                id: `development_${turn}_${locationId}`, turn, locationId,
                text: `${detail} in ${settlement.name}.`, direction: positive ? 'growth' : 'decline'
            };
            society.developments.push(development);
            addWorldNews(sess, development.text, {
                id: development.id, locationId, type: 'society', playerVisible: false, knownBy: []
            });
            changed++;
        }
    }
    // Long-running sandboxes can cover years. Keep the structural record
    // useful and bounded just like worldNews; the newest developments retain
    // the current shape while the ledger/history preserve player-facing canon.
    society.developments = society.developments.slice(-80);
    society.conflicts = society.conflicts.slice(-60);
    return { changed, season: society.season, conflicts: society.conflicts.filter(item => item.status === 'war').length };
}

function getLocalSocietySettlement(world, sess) {
    const settlements = sess?.society?.settlements || {};
    if (settlements[sess?.playerLocation]) return settlements[sess.playerLocation];
    const location = getLocationRef(world, sess?.playerLocation);
    if (!location) return null;
    if (location.parentLocationId && settlements[location.parentLocationId]) {
        return settlements[location.parentLocationId];
    }
    const sameRegion = (world.locations || []).find(candidate =>
        candidate.id !== location.id && candidate.region === location.region && settlements[candidate.id]);
    return sameRegion ? settlements[sameRegion.id] : null;
}

function getWorldSocietyPrompt(world, sess) {
    const config = normalizeWorldSandboxConfig(world);
    const society = normalizeWorldSocietyState(world, sess);
    if (!config.enabled || !society) return '';
    const identity = sess.playerIdentity || {};
    const lines = ['[LIVING SOCIETY — causal macro-simulation; do not expose hidden numbers as UI]'];
    if (identity.role) {
        lines.push(`Player identity: ${identity.title ? `${identity.title}; ` : ''}${identity.role}; rank ${identity.socialRank || 'unspecified'}; legal status ${identity.legalStatus || 'free'}.`);
        if (identity.factionId) lines.push(`Player allegiance: ${sess.factions.find(item => item.id === identity.factionId)?.name || identity.factionId}.`);
        if (identity.privileges?.length) lines.push(`Privileges: ${identity.privileges.join('; ')}.`);
        if (identity.obligations?.length) lines.push(`Obligations: ${identity.obligations.join('; ')}. These are pressures and choices, not forced player actions.`);
        if (identity.holdings?.length) lines.push(`Holdings: ${identity.holdings.join('; ')}.`);
    }
    lines.push(`Calendar: ${society.season}, Year ${society.year} (${config.calendar}); scale: ${config.scale}.`);
    const local = getLocalSocietySettlement(world, sess);
    if (local) {
        lines.push(`Local society: population about ${local.population}; food ${local.food}/100; wealth ${local.wealth}/100; security ${local.security}/100; unrest ${local.unrest}/100; trend ${local.growth > 3 ? 'growing' : local.growth < -3 ? 'declining' : 'stable'}.`);
    }
    const wars = society.conflicts.filter(item => item.status === 'war').slice(0, 6).map(conflict => {
        const names = conflict.sides.map(id => sess.factions.find(faction => faction.id === id)?.name || id);
        return `${names.join(' vs ')} (intensity ${conflict.intensity}, balance ${conflict.warScore})`;
    });
    if (wars.length) lines.push(`Active conflicts: ${wars.join(' | ')}.`);
    const developments = society.developments.slice(-5).map(item => item.text);
    if (developments.length) lines.push(`Recent structural developments: ${developments.join(' | ')}.`);
    if (config.principles) lines.push(`Author's society principles: ${config.principles}`);
    lines.push('Status is real but not destiny. The player may rise, fall, abdicate, desert, inherit, conquer, build, reform, commit crimes, seek pardon, or leave it all. Never railroad them back into their starting role.');
    return `\n${lines.join('\n')}\n`;
}

function addWorldNews(sess, text, metadata = {}) {
    const clean = String(text || '').trim();
    if (!sess || !clean) return null;
    sess.worldNews = Array.isArray(sess.worldNews) ? sess.worldNews : [];
    const duplicate = sess.worldNews.find(item => item.text === clean && item.turn === (sess.turnCount || 1));
    if (duplicate) return duplicate;
    const item = {
        id: metadata.id || livingId('news', `${sess.turnCount || 1}_${clean}`),
        text: clean.slice(0, 400),
        turn: sess.turnCount || 1,
        locationId: metadata.locationId || null,
        factionId: metadata.factionId || null,
        type: metadata.type || 'world',
        playerVisible: metadata.playerVisible !== false,
        // Who currently carries this fact. Information reaches the player only
        // through a character who knows it (or by witnessing it firsthand), so
        // "don't reveal remote facts" becomes a mechanic instead of a request.
        knownBy: [...new Set((Array.isArray(metadata.knownBy) ? metadata.knownBy : [])
            .map(id => String(id || '')).filter(Boolean))].slice(0, 40),
        playerWitnessed: metadata.playerWitnessed === true,
        // New records start canonical so re-entering the same turn is a true
        // no-op instead of lazily adding this field on the second tick.
        transmissions: []
    };
    sess.worldNews.push(item);
    if (sess.worldNews.length > 80) sess.worldNews.splice(0, sess.worldNews.length - 80);
    return item;
}

// Who is standing where, built once per tick. Both witnessing and rumour need
// this, and rebuilding it per lookup turns the tick quadratic on large worlds.
// Occupancy is capped per location: a crowded room does not need every occupant
// individually simulated to behave believably.
const LIVING_ROOM_CAP = 12;
function buildNpcLocationIndex(world, sess) {
    const index = new Map();
    sessionNpcs(world, sess).forEach(npc => {
        const entState = sess.entityStates?.[npc.id];
        if (!entState?.location || !isNpcActive(entState)) return;
        let group = index.get(entState.location);
        if (!group) index.set(entState.location, group = []);
        group.push(npc.id);
    });
    index.forEach((group, locationId) => {
        if (group.length > LIVING_ROOM_CAP) {
            index.set(locationId, rotatingWorldWindow(group, LIVING_ROOM_CAP,
                (sess.turnCount || 0) + Math.floor(stableWorldRoll(locationId) * group.length)));
        }
    });
    return index;
}

// Who could have seen something happen at a location: the actor always knows,
// and anyone else present may have noticed. A public event (chance 1) is seen by
// the whole room; a furtive personal act is meant to be missable, so bystanders
// witness it on a seeded roll instead.
function witnessesAt(npcIndex, sess, locationId, actorId, turn, chance = 0.35) {
    const known = actorId ? [actorId] : [];
    if (!locationId) return known;
    (npcIndex.get(locationId) || []).forEach(npcId => {
        if (npcId === actorId) return;
        if (chance >= 1 || stableWorldRoll(`${sess.id}|witness|${locationId}|${actorId}|${npcId}|${turn}`) < chance) {
            known.push(npcId);
        }
    });
    return known;
}

// Rumour: characters who share a location trade what they know. This is what
// carries a remote fact toward the player over time — and what makes distance
// and isolation meaningful, since an unvisited fact simply never travels.
//
// Work per tick is bounded on every axis (items, rooms, occupants). On a world
// with more populated rooms than the per-tick budget, the rooms are visited in a
// rotating window keyed on the turn, so everywhere still gets its turn to talk.
const LIVING_GOSSIP_ITEMS = 12;
const LIVING_GOSSIP_ROOMS = 40;
function spreadWorldKnowledge(world, npcIndex, sess, turn) {
    // Backward-compatible direct calls from older extensions/tests used
    // (npcIndex, session, turn). The canonical tick supplies the world so a
    // transmission can also become provenance-backed NPC knowledge.
    if (world instanceof Map) {
        turn = sess;
        sess = npcIndex;
        npcIndex = world;
        world = null;
    }
    if (!Array.isArray(sess.worldNews) || !sess.worldNews.length) return 0;
    const circulating = sess.worldNews.slice(-LIVING_GOSSIP_ITEMS)
        .filter(item => Array.isArray(item.knownBy) && item.knownBy.length > 0 && item.knownBy.length < 40);
    if (!circulating.length) return 0;

    const rooms = [];
    npcIndex.forEach((npcIds, locationId) => {
        if (npcIds.length >= 2) rooms.push([locationId, npcIds]);
    });
    if (!rooms.length) return 0;
    const window = rooms.length <= LIVING_GOSSIP_ROOMS
        ? rooms
        : Array.from({ length: LIVING_GOSSIP_ROOMS },
            (_, offset) => rooms[(turn * LIVING_GOSSIP_ROOMS + offset) % rooms.length]);

    let spread = 0;
    for (const [locationId, npcIds] of window) {
        for (const item of circulating) {
            const knows = new Set(item.knownBy);
            if (!npcIds.some(id => knows.has(id))) continue;   // nobody here can tell it
            for (const listenerId of npcIds) {
                if (knows.has(listenerId) || item.knownBy.length >= 40) continue;
                if (stableWorldRoll(`${sess.id}|gossip|${item.id}|${listenerId}|${locationId}|${turn}`) < 0.4) {
                    const speakerId = npcIds.find(id => knows.has(id));
                    item.knownBy.push(listenerId);
                    knows.add(listenerId);
                    if (!Array.isArray(item.transmissions)) item.transmissions = [];
                    const priorConfidence = Number(sess.entityStates?.[speakerId]?.observations
                        ?.find(observation => observation.eventId === item.eventId || observation.eventId === item.id)?.confidence || 0.8);
                    const confidence = livingClamp(priorConfidence * 0.82, 0.2, 0.95);
                    item.transmissions.push({ from: speakerId, to: listenerId, turn, locationId, confidence });
                    item.transmissions = item.transmissions.slice(-80);
                    if (world) addNpcKnowledge(world, sess, listenerId, {
                        id: `obs_gossip_${item.id}_${listenerId}`,
                        eventId: item.eventId || item.id,
                        text: item.text,
                        sourceType: 'told',
                        sourceNpcId: speakerId,
                        evidenceMode: 'hearsay',
                        confidence,
                        visibility: 'private',
                        allowedToShare: true,
                        turn
                    });
                    spread++;
                }
            }
        }
    }
    return spread;
}

// Standing conditions mostly mean trouble, but not always — a harvest festival
// is a condition too. Unrecognized labels are treated as mild disruption, which
// is the safer default for something the narrative bothered to mark.
const CALMING_CONDITION = /\b(festival|feast|harvest|peace|celebration|blessing|blessed|consecrated|garrison|reinforced|repaired|rebuilt|market\s?day|prosper\w*|bountiful|sanctuary|amnesty)\b/i;
const HARMFUL_CONDITION = /\b(fire|burning|siege|besieged|plague|pestilence|famine|starv\w*|flood|riot|curfew|raid\w*|quarantine|blockade|haunt\w*|cursed|collapse|infest\w*|blight|war|unrest|lawless|ambush|bandit|occupied)\b/i;

function conditionPressure(label) {
    const text = String(label || '');
    if (CALMING_CONDITION.test(text)) return -12;
    // A siege or a plague should make a place properly dangerous on its own;
    // two such conditions together should make it dire.
    if (HARMFUL_CONDITION.test(text)) return 30;
    return 10;
}

// Where a place is being pulled, before reversion. Positive = toward danger.
function locationPressure(world, sess, locationId, locState) {
    let pressure = 0;
    (locState.conditions || []).forEach(condition => { pressure += conditionPressure(condition.label); });

    const factions = Array.isArray(sess.factions) ? sess.factions : [];
    const claimants = factions.filter(faction =>
        !['defeated', 'disbanded'].includes(faction.status)
        && Array.isArray(faction.territory) && faction.territory.includes(locationId));
    // Two powers pulling at the same ground is the definition of a dangerous
    // place, whatever either of them intends.
    if (claimants.length > 1) pressure += 8 + (claimants.length - 1) * 4;

    const holder = factions.find(faction => faction.id === locState.controlFactionId);
    if (holder && !['defeated', 'disbanded'].includes(holder.status)) {
        // Firm control settles a place; a weakened or waning holder invites trouble.
        if (holder.status === 'weakened') pressure += 10;
        else if (holder.influence >= 60) pressure -= 8;
        else if (holder.influence <= 30) pressure += 6;
    } else if (locState.controlFactionId) {
        pressure += 6;   // whoever held this is gone
    }
    return pressure;
}

// Danger and prosperity ease toward what the world justifies, one step a tick.
function driftLocationStates(world, sess, turn, npcIndex) {
    const occupancy = npcIndex || buildNpcLocationIndex(world, sess);
    let changed = 0;
    Object.entries(sess.locationStates || {}).forEach(([locationId, locState]) => {
        const pressure = locationPressure(world, sess, locationId, locState);
        // Whole numbers, so a settled place rests instead of oscillating around
        // a fractional target forever.
        const dangerTarget = Math.round(livingClamp(pressure, 0, 100));
        const prosperityTarget = Math.round(livingClamp(50 - pressure * 0.8, 0, 100));
        const previousDanger = locState.danger;
        const previousProsperity = locState.prosperity;

        // Slow and seeded: places change over a stay, not between two sentences.
        if (locState.danger !== dangerTarget
            && stableWorldRoll(`${sess.id}|danger|${locationId}|${turn}`) < 0.35) {
            locState.danger = livingClamp(locState.danger + Math.sign(dangerTarget - locState.danger), 0, 100);
        }
        if (locState.prosperity !== prosperityTarget
            && stableWorldRoll(`${sess.id}|prosperity|${locationId}|${turn}`) < 0.25) {
            locState.prosperity = livingClamp(locState.prosperity + Math.sign(prosperityTarget - locState.prosperity), 0, 100);
        }
        if (locState.danger === previousDanger && locState.prosperity === previousProsperity) return;
        changed++;

        // Only announce genuine turns of the tide, not every point.
        const band = value => value >= 70 ? 3 : value >= 40 ? 2 : value >= 15 ? 1 : 0;
        const place = world.locations.find(item => item.id === locationId);
        if (!place) return;
        const dangerBandChanged = band(previousDanger) !== band(locState.danger);
        const prosperityBandChanged = band(previousProsperity) !== band(locState.prosperity);
        if (!dangerBandChanged && !prosperityBandChanged) return;
        const rising = dangerBandChanged
            ? locState.danger > previousDanger
            : locState.prosperity < previousProsperity;
        addWorldNews(sess, dangerBandChanged
            ? (rising ? `${place.name} has become a more dangerous place to be.`
                      : `${place.name} has settled; people move more freely there again.`)
            : (rising ? `${place.name} is visibly poorer than it was.`
                      : `${place.name} is doing better than it was.`), {
            id: `news_place_${locationId}_${turn}`, locationId, type: 'world', playerVisible: false,
            // Whoever is standing there can see it for themselves.
            knownBy: occupancy.get(locationId) || []
        });
    });
    return changed;
}

function updatePlaystyleProfile(sess, input) {
    const text = String(input || '').toLowerCase();
    if (!sess || !text.trim()) return;
    const categories = {
        combat: /\b(attack|fight|shoot|stab|punch|kill|weapon|spell|ambush)\b/,
        social: /\b(talk|ask|tell|persuade|convince|negotiate|apologize|joke|comfort)\b/,
        exploration: /\b(explore|travel|go to|enter|climb|cross|map|look around|search the area)\b/,
        investigation: /\b(investigate|inspect|examine|clue|deduce|question|evidence|search for)\b/,
        stealth: /\b(sneak|hide|stealth|quietly|pickpocket|disguise|avoid notice)\b/,
        crafting: /\b(craft|build|repair|cook|brew|forge|make|harvest)\b/,
        romance: /\b(flirt|kiss|romance|embrace|date|seduce|hold hands)\b/,
        mercy: /\b(spare|forgive|mercy|help|heal|rescue|release)\b/,
        aggression: /\b(threaten|intimidate|torture|execute|betray|burn|destroy)\b/
    };
    sess.playstyle = sess.playstyle || { turnsObserved: 0, signals: {}, preferences: {}, dominant: [] };
    sess.playstyle.signals = sess.playstyle.signals || {};
    sess.playstyle.turnsObserved = (parseInt(sess.playstyle.turnsObserved) || 0) + 1;
    Object.entries(categories).forEach(([key, pattern]) => {
        if (pattern.test(text)) sess.playstyle.signals[key] = (parseInt(sess.playstyle.signals[key]) || 0) + 1;
    });
    sess.playstyle.dominant = Object.entries(sess.playstyle.signals)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([key]) => key);
    sess.playstyle.summary = sess.playstyle.dominant.length
        ? `Observed lean: ${sess.playstyle.dominant.join(', ')}. Treat this as a soft signal, not a restriction.`
        : 'No clear playstyle pattern yet.';
}

function relationshipKey(a, b) {
    return [String(a || ''), String(b || '')].sort().join('|');
}

// --- Faction causation -----------------------------------------------------
// Factions used to advance in complete isolation: `relations` was stored,
// displayed, and never read, so no alliance ever helped anyone and no rivalry
// ever cost anyone anything. These three functions make a faction's situation
// — who stands with it, who against it, and whose ground it is standing on —
// actually bear on what happens to it.
const FACTION_ALLY_AT = 30;
const FACTION_HOSTILE_AT = -30;
const FACTION_WAR_AT = -70;
const FACTION_AMBIENT_FLOOR = -60;   // coexistence alone cannot cause open war
const FACTION_PAIR_CAP = 12;   // bounded pair work; real worlds have a handful

// A power that has achieved its aim and has no authored follow-up does not
// simply stop existing. It takes the stance its situation dictates — derived
// from state, not invented lore, so the engine never fabricates fiction.
function nextFactionAim(sess, faction) {
    const standing = factionStanding(sess, faction);
    if (standing.contested) return 'secure its contested holdings';
    if (standing.enemies.length) return `gain the upper hand over ${standing.enemies[0].name}`;
    if (standing.allies.length) return `deepen its understanding with ${standing.allies[0].name}`;
    return 'extend its influence';
}

function livingFactionById(sess, id) {
    return (sess.factions || []).find(faction => faction.id === id) || null;
}

function factionRelationScore(faction, otherId) {
    const relation = (faction.relations || []).find(item => item.factionId === otherId);
    return relation ? (Number(relation.score) || 0) : 0;
}

// Relations are stored per-faction, so a one-sided edit produced a world where
// A hated B while B felt nothing. Always move both sides together.
function adjustFactionRelation(sess, a, b, delta) {
    if (!a || !b || a.id === b.id) return 0;
    let moved = 0;
    [[a, b], [b, a]].forEach(([from, to]) => {
        from.relations = Array.isArray(from.relations) ? from.relations : [];
        let relation = from.relations.find(item => item.factionId === to.id);
        if (!relation) {
            relation = { factionId: to.id, score: 0 };
            from.relations.push(relation);
        }
        const before = relation.score;
        relation.score = livingClamp(relation.score + delta, -100, 100);
        if (relation.score !== before) moved++;
    });
    return moved;
}

function factionStanding(sess, faction) {
    const others = (sess.factions || []).filter(item =>
        item.id !== faction.id && !['defeated', 'disbanded'].includes(item.status));
    const allies = others.filter(item => factionRelationScore(faction, item.id) >= FACTION_ALLY_AT);
    const enemies = others.filter(item => factionRelationScore(faction, item.id) <= FACTION_HOSTILE_AT);
    const territory = Array.isArray(faction.territory) ? faction.territory : [];
    const contested = enemies.reduce((total, enemy) =>
        total + (enemy.territory || []).filter(id => territory.includes(id)).length, 0);
    // Friends lend weight; enemies obstruct; ground you must hold against someone
    // slows everything down.
    const momentum = (allies.length * 0.04) - (enemies.length * 0.05) - (contested * 0.03);
    return { allies, enemies, contested, momentum };
}

function resolveFactionVictory(world, sess, faction, turn) {
    let changes = 0;
    const locName = id => world.locations.find(item => item.id === id)?.name || id;
    faction.influence = livingClamp(faction.influence + 8, 0, 100);
    addWorldNews(sess, `${faction.name} achieved its objective: ${faction.goal}.`, {
        id: `news_faction_${faction.id}_${turn}`, factionId: faction.id, type: 'faction'
    });
    changes++;

    const { enemies } = factionStanding(sess, faction);
    const rival = [...enemies].sort((a, b) => b.influence - a.influence)[0] || null;
    if (rival) {
        // Winning takes something from someone. Prefer ground they were both
        // standing on, otherwise the rival's most prized holding.
        const territory = Array.isArray(faction.territory) ? faction.territory : (faction.territory = []);
        const rivalTerritory = Array.isArray(rival.territory) ? rival.territory : (rival.territory = []);
        const seized = rivalTerritory.find(id => territory.includes(id)) || rivalTerritory[0] || '';
        if (seized) {
            rival.territory = rivalTerritory.filter(id => id !== seized);
            if (!territory.includes(seized)) territory.push(seized);
            const locState = sess.locationStates?.[seized];
            if (locState) locState.controlFactionId = faction.id;
            addWorldNews(sess, `${faction.name} has taken ${locName(seized)} from ${rival.name}.`, {
                id: `news_faction_seize_${faction.id}_${turn}`, locationId: seized,
                factionId: faction.id, type: 'faction'
            });
            changes++;
        }
        rival.influence = livingClamp(rival.influence - 6, 0, 100);
        if (rival.influence <= 15 && rival.status === 'active') {
            rival.status = 'weakened';
            addWorldNews(sess, `${rival.name} is visibly weakened.`, {
                id: `news_faction_weak_${rival.id}_${turn}`, factionId: rival.id, type: 'faction'
            });
        }
        changes += adjustFactionRelation(sess, faction, rival, -15);

        // The loser answers. A consequence the player can later run into.
        if ((sess.scheduledEvents || []).length < 500) {
            const eventId = livingId('event', `${rival.id}_answer_${turn}`);
            if (!sess.scheduledEvents.some(event => event.id === eventId)) {
                sess.scheduledEvents.push({
                    id: eventId,
                    title: `${rival.name} answers ${faction.name}`,
                    description: `Having lost ground to ${faction.name}, ${rival.name} moves to recover it.`,
                    status: 'scheduled',
                    dueTurn: turn + 3 + Math.floor(stableWorldRoll(`${rival.id}|answer|${turn}`) * 6),
                    dueMinute: null, repeatEveryTurns: 0, repeatEveryMinutes: 0,
                    locationId: seized || null,
                    conditionOnTrigger: seized ? 'Contested' : '',
                    conditionDurationTurns: seized ? 12 : 0,
                    factionId: rival.id, influenceChange: 4, lastTriggeredTurn: 0
                });
                changes++;
            }
        }
    }

    // An achieved aim must not leave the faction inert forever. Record it and
    // free the slot so a new goal can be taken up.
    faction.achievements = [...(Array.isArray(faction.achievements) ? faction.achievements : []), faction.goal]
        .filter(Boolean).slice(-10);
    const done = new Set(faction.achievements);
    // An authored continuation first; otherwise the stance its situation implies.
    const pooled = (Array.isArray(faction.goalPool) ? faction.goalPool : [])
        .map(entry => String(typeof entry === 'string' ? entry : entry?.goal || '').trim())
        .find(goal => goal && !done.has(goal));
    faction.goal = (pooled || nextFactionAim(sess, faction)).slice(0, 240);
    faction.goalProgress = 0;
    return changes;
}

function driftFactionRelations(world, sess, turn) {
    const activePool = (sess.factions || [])
        .filter(faction => !['defeated', 'disbanded'].includes(faction.status));
    const active = typeof rotatingWorldWindow === 'function'
        ? rotatingWorldWindow(activePool, FACTION_PAIR_CAP, turn)
        : activePool.slice(0, FACTION_PAIR_CAP);
    let changes = 0;
    for (let i = 0; i < active.length - 1; i++) {
        for (let j = i + 1; j < active.length; j++) {
            const a = active[i];
            const b = active[j];
            if (stableWorldRoll(`${sess.id}|frel|${a.id}|${b.id}|${turn}`) >= 0.12) continue;
            const before = factionRelationScore(a, b.id);

            const aTerritory = Array.isArray(a.territory) ? a.territory : [];
            const bTerritory = Array.isArray(b.territory) ? b.territory : [];
            const overlap = bTerritory.filter(id => aTerritory.includes(id)).length;
            // A common enemy is the oldest reason on earth to become friends.
            const sharedEnemies = active.filter(other =>
                other.id !== a.id && other.id !== b.id
                && factionRelationScore(a, other.id) <= FACTION_HOSTILE_AT
                && factionRelationScore(b, other.id) <= FACTION_HOSTILE_AT).length;

            let delta = 0;
            // Ambient friction takes a shared border as far as real hostility but
            // no further — open war should be caused by something happening (a
            // seizure, a betrayal), not by two powers merely coexisting long
            // enough. Without this floor, every campaign drifts into war on a
            // long enough timeline regardless of events.
            if (overlap > 0 && before > FACTION_AMBIENT_FLOOR) delta -= 1 + Math.min(2, overlap);
            if (sharedEnemies > 0) delta += 1;
            if (!delta) continue;
            changes += adjustFactionRelation(sess, a, b, delta);

            const after = factionRelationScore(a, b.id);
            // Only announce the moments that change the nature of the thing.
            const crossed = (mark) => (before > mark && after <= mark) || (before < mark && after >= mark);
            if (crossed(FACTION_WAR_AT)) {
                addWorldNews(sess, after <= FACTION_WAR_AT
                    ? `${a.name} and ${b.name} are now openly hostile.`
                    : `${a.name} and ${b.name} have pulled back from open hostility.`, {
                    id: `news_frel_war_${a.id}_${b.id}_${turn}`, factionId: a.id, type: 'faction'
                });
            } else if (crossed(FACTION_ALLY_AT)) {
                addWorldNews(sess, after >= FACTION_ALLY_AT
                    ? `${a.name} and ${b.name} have found common cause.`
                    : `The understanding between ${a.name} and ${b.name} has cooled.`, {
                    id: `news_frel_ally_${a.id}_${b.id}_${turn}`, factionId: a.id, type: 'faction'
                });
            }
        }
    }
    return changes;
}

function runLivingWorldTick(world, sess) {
    const modules = normalizeWorldGameRules(world).modules;
    if (!modules.livingWorld) {
        return { advanced: false, disabled: true, turn: Math.max(1, parseInt(sess?.turnCount) || 1), events: 0, goals: 0, factions: 0, markets: 0 };
    }
    normalizeLivingWorldState(world, sess);
    const turn = Math.max(1, parseInt(sess.turnCount) || 1);
    const time = getWorldTimeData(world, sess);
    // The turn-based simulation advances exactly once per turn. The world clock,
    // however, can jump mid-turn when the DM applies time_skip_minutes (sleep,
    // waiting, long travel). Re-entering after such a jump runs a clock-only
    // catch-up so events scheduled inside the skipped window fire during that
    // turn instead of surfacing one action late.
    const alreadyAdvanced = sess.lastLivingWorldTick >= turn;
    const clockAdvanced = time.currentTotalMinutes > (Number(sess.lastLivingWorldMinute) || 0);
    if (alreadyAdvanced && !clockAdvanced) {
        return {
            advanced: false,
            turn,
            events: sess.livingWorldActivity.events || 0,
            goals: sess.livingWorldActivity.goals || 0,
            factions: sess.livingWorldActivity.factions || 0,
            markets: sess.livingWorldActivity.markets || 0
        };
    }
    const clockCatchUpOnly = alreadyAdvanced;
    sess.lastLivingWorldTick = turn;
    sess.lastLivingWorldMinute = time.currentTotalMinutes;
    let eventCount = 0;
    let goalCount = 0;
    let factionCount = 0;
    let marketCount = 0;
    // Built once: witnessing and rumour both need to know who is standing where.
    const npcIndex = buildNpcLocationIndex(world, sess);

    if (!clockCatchUpOnly) {
        Object.values(sess.locationStates).forEach(locState => {
            locState.conditions = (locState.conditions || []).filter(condition =>
                condition.expiresTurn == null || condition.expiresTurn > turn);
        });
    }

    sess.scheduledEvents.forEach(event => {
        if (event.status !== 'scheduled') return;
        const turnDue = !clockCatchUpOnly && event.dueTurn != null && turn >= event.dueTurn;
        const minuteDue = event.dueMinute != null && time.currentTotalMinutes >= event.dueMinute;
        if (!turnDue && !minuteDue) return;
        event.lastTriggeredTurn = turn;
        eventCount++;
        const location = world.locations.find(item => item.id === event.locationId);
        const where = location ? ` at ${location.name}` : '';
        const newsText = `${event.title}${where}: ${event.description}`;
        // Anyone standing where it happened knows it happened. A worldwide event
        // (no location) is public by nature and needs no carrier to travel.
        const atPlayer = !event.locationId || event.locationId === sess.playerLocation;
        addWorldNews(sess, newsText, {
            id: `news_${event.id}_${turn}`, locationId: event.locationId,
            factionId: event.factionId, type: 'event',
            knownBy: event.locationId ? witnessesAt(npcIndex, sess, event.locationId, '', turn, 1) : [],
            playerWitnessed: atPlayer
        });

        if (event.conditionOnTrigger && event.locationId) {
            const locState = sess.locationStates[event.locationId] || {
                conditions: [], controlFactionId: '', danger: 0, prosperity: 50, resources: {}
            };
            const conditionId = livingId('condition', `${event.id}_${event.conditionOnTrigger}`);
            const existing = locState.conditions.find(condition => condition.id === conditionId);
            const expiresTurn = event.conditionDurationTurns > 0 ? turn + event.conditionDurationTurns : null;
            if (existing) existing.expiresTurn = expiresTurn;
            else locState.conditions.push({ id: conditionId, label: event.conditionOnTrigger, expiresTurn });
            sess.locationStates[event.locationId] = locState;
        }
        if (event.factionId && event.influenceChange) {
            const faction = sess.factions.find(item => item.id === event.factionId);
            if (faction) faction.influence = livingClamp(faction.influence + event.influenceChange, 0, 100);
        }
        if (!event.locationId || event.locationId === sess.playerLocation) {
            queueEngineEvent(sess, `${newsText} Narrate its immediate, observable consequences.`);
        }

        if (event.repeatEveryTurns > 0 || event.repeatEveryMinutes > 0) {
            if (event.repeatEveryTurns > 0) event.dueTurn = turn + event.repeatEveryTurns;
            else event.dueTurn = null;
            if (event.repeatEveryMinutes > 0) event.dueMinute = time.currentTotalMinutes + event.repeatEveryMinutes;
            else event.dueMinute = null;
        } else {
            event.status = 'triggered';
        }
    });

    sessionNpcs(world, sess).forEach(npc => {
        if (clockCatchUpOnly) return;   // agendas advance per turn, not per clock jump
        const entState = sess.entityStates?.[npc.id];
        if (!entState?.goal || !isNpcActive(entState)) return;
        if (entState.location === sess.playerLocation) return;   // on-screen: the DM's domain

        // A finished agenda is not the end of a life. After a rest, an NPC with
        // authored follow-ups (goalPool) takes up the next unused one, so the
        // world does not quietly run down as goals resolve. NPCs without a pool
        // stay resolved until the DM hands them something new.
        if (entState.goalStatus === 'completed' || entState.goalStatus === 'failed') {
            if (!Array.isArray(npc.goalPool) || !npc.goalPool.length) return;
            if (!entState.goalResolvedTurn) { entState.goalResolvedTurn = turn; return; }
            if (turn - entState.goalResolvedTurn < 8) return;   // let the dust settle
            const done = new Set([...(Array.isArray(entState.goalHistory) ? entState.goalHistory : []), entState.goal]);
            const next = npc.goalPool
                .map(entry => (typeof entry === 'string' ? { goal: entry } : (entry || {})))
                .find(entry => entry.goal && !done.has(String(entry.goal).trim().slice(0, 200)));
            if (!next) return;   // pool exhausted: this life's stories are told
            entState.goalHistory = [...done].slice(-10);
            entState.goal = String(next.goal).trim().slice(0, 200);
            entState.goalProgress = 0;
            entState.goalStatus = 'active';
            entState.goalDifficulty = livingClamp(next.difficulty == null ? (entState.goalDifficulty ?? 50) : next.difficulty, 0, 100);
            entState.goalAutonomy = ['paused', 'low', 'medium', 'high'].includes(next.autonomy)
                ? next.autonomy : (entState.goalAutonomy || 'medium');
            entState.goalSteps = (Array.isArray(next.steps) ? next.steps : [])
                .map(step => String(step).slice(0, 160)).filter(Boolean).slice(0, 20);
            entState.goalStepIndex = 0;
            entState.goalStepReported = -1;
            delete entState.goalDeadlineTurn;
            delete entState.goalResolvedTurn;
            goalCount++;
            addWorldNews(sess, `${npc.name} has set their mind to something new: ${entState.goal}`, {
                id: `news_goal_new_${npc.id}_${turn}`, locationId: entState.location,
                type: 'npc_goal', playerVisible: false, knownBy: [npc.id]
            });
            return;
        }
        if (entState.goalStatus !== 'active' || entState.goalAutonomy === 'paused') return;
        if (entState.goalDeadlineTurn && turn > entState.goalDeadlineTurn) {
            entState.goalStatus = 'failed';
            entState.goalResolvedTurn = turn;
            addWorldNews(sess, `${npc.name}'s effort to ${entState.goal} failed when time ran out.`, {
                id: `news_goal_failed_${npc.id}_${turn}`, locationId: entState.location, type: 'npc_goal', playerVisible: false
            });
            goalCount++;
            return;
        }
        const autonomyRate = { low: 0.28, medium: 0.52, high: 0.78 }[entState.goalAutonomy] || 0.52;
        const difficultyPenalty = (entState.goalDifficulty || 50) / 250;
        const roll = stableWorldRoll(`${world.id}|${sess.id}|${npc.id}|goal|${turn}`);
        if (roll > Math.max(0.08, autonomyRate - difficultyPenalty)) return;
        const gain = 1 + Math.floor(stableWorldRoll(`${npc.id}|gain|${turn}`) * (entState.goalAutonomy === 'high' ? 5 : 3));
        const previous = entState.goalProgress || 0;
        entState.goalProgress = livingClamp(previous + gain, 0, 100);
        goalCount++;

        // An advancing agenda must leave a CONCRETE trace, not a progress bar.
        // Authored goalSteps are the beats of that agenda; each beat is reported
        // exactly once, in order, as the specific thing the NPC did — so it can
        // be discovered later as a fact rather than improvised on the spot.
        // goalStepReported tracks the last beat announced (-1 = none yet), which
        // is what lets the opening beat surface at all.
        const lastReported = Number.isFinite(entState.goalStepReported) ? entState.goalStepReported : -1;
        const freshSteps = [];
        if (entState.goalSteps.length > 0) {
            const stepSize = 100 / entState.goalSteps.length;
            entState.goalStepIndex = livingClamp(Math.floor(Math.max(0, entState.goalProgress - 0.001) / stepSize), 0, entState.goalSteps.length - 1);
            for (let index = lastReported + 1; index <= entState.goalStepIndex; index++) {
                if (entState.goalSteps[index]) freshSteps.push({ index, text: entState.goalSteps[index] });
            }
        }
        const crossedMilestone = Math.floor(previous / 25) < Math.floor(entState.goalProgress / 25);
        const stepLocation = world.locations.find(item => item.id === entState.location);
        const whereabouts = stepLocation ? ` at ${stepLocation.name}` : '';
        const finalIndex = entState.goalSteps.length - 1;
        const completing = entState.goalProgress >= 100;

        // Beats that landed this tick. On the completing tick the last beat is
        // folded into the completion line instead of being announced twice.
        // The actor always knows what they did; anyone sharing the room may have
        // seen it, which is where the rumour starts.
        const beatWitnesses = witnessesAt(npcIndex, sess, entState.location, npc.id, turn);
        freshSteps
            .filter(step => !(completing && step.index === finalIndex))
            .forEach(step => {
                addWorldNews(sess, `${npc.name}${whereabouts}: ${step.text}`, {
                    id: `news_goal_step_${npc.id}_${step.index}_${turn}`,
                    locationId: entState.location, type: 'npc_goal', playerVisible: false,
                    knownBy: beatWitnesses
                });
            });
        if (entState.goalSteps.length > 0) {
            entState.goalStepReported = completing ? finalIndex : Math.max(lastReported, entState.goalStepIndex);
        }

        if (completing) {
            entState.goalStatus = 'completed';
            entState.goalResolvedTurn = turn;
            // Fold the closing beat into the completion line only when it lands
            // on this same tick; otherwise it was already reported and repeating
            // it verbatim reads as an echo in the news feed.
            const finalStep = entState.goalSteps.length ? entState.goalSteps[finalIndex] : '';
            const closedNow = freshSteps.some(step => step.index === finalIndex);
            addWorldNews(sess, finalStep && closedNow
                ? `${npc.name}${whereabouts}: ${finalStep} — completing their aim to ${entState.goal}.`
                : `${npc.name}${whereabouts} finished what they set out to do: ${entState.goal}.`, {
                id: `news_goal_complete_${npc.id}_${turn}`, locationId: entState.location, type: 'npc_goal', playerVisible: false,
                knownBy: beatWitnesses
            });
        } else if (crossedMilestone && entState.goalSteps.length === 0) {
            // Only agendas with no authored beats fall back to the vague line.
            addWorldNews(sess, `${npc.name} made significant off-screen progress toward: ${entState.goal}.`, {
                id: `news_goal_${npc.id}_${turn}`, locationId: entState.location, type: 'npc_goal', playerVisible: false,
                knownBy: beatWitnesses
            });
        }
    });

    // Relationship drift: people who share a room do not come out of fifty
    // turns together unchanged. Familiarity mostly warms, friction sometimes
    // cools, and standing hostility festers. The DM's authored labels are never
    // overwritten — drift only owns relationships it created (autoManaged).
    // Rooms containing the player are skipped: on-screen bonds are played out,
    // not simulated.
    let relationshipCount = 0;
    if (!clockCatchUpOnly && modules.relationships) {
        npcIndex.forEach((npcIds, locationId) => {
            if (npcIds.length < 2 || locationId === sess.playerLocation) return;
            for (let a = 0; a < npcIds.length - 1; a++) {
                for (let b = a + 1; b < npcIds.length; b++) {
                    const key = relationshipKey(npcIds[a], npcIds[b]);
                    if (stableWorldRoll(`${sess.id}|drift|${key}|${turn}`) >= 0.1) continue;
                    const rel = sess.npcRelationships[key]
                        || (sess.npcRelationships[key] = {
                            score: 0, label: '', reason: '', lastChangedTurn: 0, autoManaged: true
                        });
                    const previousScore = rel.score || 0;
                    const warm = stableWorldRoll(`${sess.id}|driftdir|${key}|${turn}`) < 0.75;
                    // Hostile pairs read every gesture badly: their drift inverts.
                    const delta = previousScore <= -15 ? (warm ? -1 : 1) : (warm ? 1 : -1);
                    rel.score = livingClamp(previousScore + delta, -100, 100);
                    rel.lastChangedTurn = turn;
                    relationshipCount++;
                    if (rel.autoManaged) {
                        rel.label = rel.score >= 50 ? 'close' : rel.score >= 20 ? 'friendly'
                            : rel.score <= -50 ? 'bitter enemies' : rel.score <= -20 ? 'strained'
                            : 'acquaintances';
                        if (!rel.reason) {
                            const room = world.locations.find(item => item.id === locationId);
                            rel.reason = `time shared at ${room ? room.name : 'the same place'}`;
                        }
                    }
                    if (Math.floor(previousScore / 25) !== Math.floor(rel.score / 25)) {
                        const nameA = world.entities.find(item => item.id === npcIds[a])?.name || npcIds[a];
                        const nameB = world.entities.find(item => item.id === npcIds[b])?.name || npcIds[b];
                        addWorldNews(sess, rel.score > previousScore
                            ? `${nameA} and ${nameB} have grown noticeably closer.`
                            : `Relations between ${nameA} and ${nameB} have soured.`, {
                            id: `news_rel_${key}_${turn}`, locationId, type: 'npc_goal', playerVisible: false,
                            knownBy: [npcIds[a], npcIds[b]]
                        });
                    }
                }
            }
        });
    }

    sess.factions.forEach(faction => {
        if (clockCatchUpOnly) return;   // faction drift is per turn, not per clock jump
        if (faction.status !== 'active' || !faction.goal || faction.goalProgress >= 100) return;

        // A faction does not pursue its aims in a vacuum. Allies lend weight,
        // enemies obstruct, and a power stretched across contested ground makes
        // slower progress than one working unopposed.
        const standing = factionStanding(sess, faction);
        const chance = livingClamp(0.18 + (faction.influence / 250) + standing.momentum, 0.03, 0.9);
        if (stableWorldRoll(`${world.id}|${sess.id}|${faction.id}|faction|${turn}`) > chance) return;
        const previous = faction.goalProgress;
        faction.goalProgress = livingClamp(previous + 1 + Math.floor(stableWorldRoll(`${faction.id}|gain|${turn}`) * 3), 0, 100);
        factionCount++;

        if (faction.goalProgress >= 100) {
            // Achieving an aim is a CAUSE, not just a headline. It takes ground,
            // shifts the balance of power, and provokes whoever it was aimed at.
            factionCount += resolveFactionVictory(world, sess, faction, turn);
        }
    });

    // Powers with a shared border and no shared cause drift apart; powers with a
    // common enemy drift together. This is what eventually produces alliances
    // and open hostility without anyone scripting them.
    if (!clockCatchUpOnly && sess.factions.length > 1) {
        factionCount += driftFactionRelations(world, sess, turn);
    }

    // Places have their own momentum. Danger and prosperity answer to what is
    // actually true of a location — its standing conditions, whether one faction
    // holds it or several are pulling at it — and, absent any of that, they ease
    // back toward normal. Without that reversion a world only ever ratchets
    // worse, because every source of pressure is additive.
    const placeCount = clockCatchUpOnly ? 0 : driftLocationStates(world, sess, turn, npcIndex);
    const societyResult = clockCatchUpOnly ? { changed: 0, conflicts: 0 }
        : runSocietySimulationTick(world, sess, turn);

    if (modules.commerce && !clockCatchUpOnly) {
        Object.entries(sess.economy.markets).forEach(([locationId, market]) => {
            const locState = sess.locationStates[locationId];
            Object.values(market).forEach(stock => {
                if (stock.regenPerTurn > 0 && stock.quantity < stock.maxQuantity) {
                    const previousQuantity = stock.quantity;
                    // A frightened, failing place restocks worse than a thriving one.
                    const supplyFactor = locState
                        ? livingClamp(0.4 + (locState.prosperity / 100) - (locState.danger / 200), 0.2, 1.6)
                        : 1;
                    const regen = Math.max(1, Math.round(stock.regenPerTurn * supplyFactor));
                    stock.quantity = livingClamp(stock.quantity + regen, 0, stock.maxQuantity);
                    if (stock.quantity !== previousQuantity) marketCount++;
                }
                // Scarcity and risk price themselves in, drifting a step at a
                // time around the item's established base rather than swinging.
                if (locState && stock.basePrice > 0) {
                    const scarcity = stock.maxQuantity > 0 ? 1 - (stock.quantity / stock.maxQuantity) : 0;
                    const pressure = (locState.danger / 100) * 0.35 + scarcity * 0.4 - (locState.prosperity / 100) * 0.25;
                    const target = livingClamp(Math.round(stock.basePrice * (1 + pressure)),
                        Math.max(1, Math.floor(stock.basePrice * 0.5)), Math.ceil(stock.basePrice * 2));
                    if (stock.price !== target) {
                        stock.price = livingClamp(stock.price + Math.sign(target - stock.price), 0, 999999);
                        marketCount++;
                    }
                }
            });
        });
    }

    // Word travels between characters who share a room. This is the step that
    // eventually carries a remote fact within earshot of the player.
    const rumoursSpread = clockCatchUpOnly ? 0 : spreadWorldKnowledge(world, npcIndex, sess, turn);
    const consequenceChanges = clockCatchUpOnly ? 0 : advanceWorldConsequences(world, sess, turn);

    // A catch-up pass only adds events; it must not erase the turn's tallies.
    Object.assign(sess.livingWorldActivity, clockCatchUpOnly ? {
        turn,
        events: (sess.livingWorldActivity.events || 0) + eventCount
    } : {
        turn,
        events: eventCount,
        goals: goalCount,
        factions: factionCount,
        markets: marketCount,
        rumours: rumoursSpread,
        relationships: relationshipCount,
        places: placeCount,
        society: societyResult.changed || 0,
        conflicts: societyResult.conflicts || 0,
        consequences: consequenceChanges
    });
    return {
        advanced: true,
        clockCatchUpOnly,
        turn,
        events: eventCount,
        goals: goalCount,
        factions: factionCount,
        markets: marketCount,
        rumours: rumoursSpread,
        relationships: relationshipCount,
        places: placeCount,
        society: societyResult.changed || 0,
        conflicts: societyResult.conflicts || 0,
        consequences: consequenceChanges
    };
}

function getLivingWorldPrompt(world, sess, presentNPCs = [], options = {}) {
    const modules = normalizeWorldGameRules(world).modules;
    if (!modules.livingWorld) return '';
    normalizeLivingWorldState(world, sess);
    const lines = ['[LIVING WORLD — persistent simulation; DM-only knowledge unless plausibly observed or learned]'];
    const locState = sess.locationStates[sess.playerLocation];
    if (locState) {
        const faction = sess.factions.find(item => item.id === locState.controlFactionId);
        const conditions = (locState.conditions || []).map(item => item.label).join(', ');
        lines.push(`Current location state: danger ${locState.danger}/100; prosperity ${locState.prosperity}/100${faction ? `; controlled by ${faction.name}` : ''}${conditions ? `; conditions: ${conditions}` : ''}.`);
        const resources = Object.entries(locState.resources || {}).slice(0, 8).map(([key, value]) => `${key} ${value}`).join(', ');
        if (resources) lines.push(`Local resources: ${resources}.`);
    }
    const market = modules.commerce ? sess.economy.markets[sess.playerLocation] : null;
    if (market) {
        const stock = Object.values(market).slice(0, 10).map(item => `${item.item} x${item.quantity} @ ${item.price} ${sess.economy.currency}`).join(', ');
        if (stock) {
            // Name the trader when there is one, so buying happens through a
            // person rather than from thin air.
            const vendors = (world.entities || [])
                .filter(entity => entity.type === 'npc' && entity.vendorFor === sess.playerLocation
                    && isVisibleToSession(entity, sess) && isNpcActive(sess.entityStates?.[entity.id]))
                .map(entity => entity.name);
            lines.push(`Local market: ${stock}.${vendors.length ? ` Traded by ${vendors.join(', ')}.` : ''} ${options.sidecar === true
                ? 'Author any completed purchase or sale clearly and identify it in the hidden handoff; Sidecar owns the canonical transaction.'
                : 'Record any purchase or sale with the transactions field so the money and goods actually move.'}`);
        }
    }
    const upcoming = sess.scheduledEvents.filter(event => event.status === 'scheduled')
        .sort((a, b) => (a.dueTurn ?? 999999) - (b.dueTurn ?? 999999))
        .slice(0, 6);
    if (upcoming.length) lines.push(`Future events: ${upcoming.map(event => `${event.title} (turn ${event.dueTurn ?? '?'})`).join('; ')}.`);
    const activeConsequences = (sess.consequences || [])
        .filter(item => item.state !== 'resolved' && item.visibility !== 'hidden').slice(-8);
    if (activeConsequences.length) {
        lines.push(`Active consequences: ${activeConsequences.map(item =>
            `${item.title} [${item.state}, severity ${item.severity}/100]${item.detail && item.detail !== item.title ? ` — ${item.detail}` : ''}`
        ).join(' | ')}. Do not silently erase these; escalate, decay or resolve them only through causally relevant play.`);
    }
    const activeFactions = sess.factions.filter(faction => !['defeated', 'disbanded'].includes(faction.status)).slice(0, 8);
    if (activeFactions.length) {
        // Who stands with whom matters to how scenes play, so state it rather
        // than leaving the DM to guess from a number it never sees.
        const factionLine = faction => {
            const standing = factionStanding(sess, faction);
            const nameOfFaction = id => sess.factions.find(item => item.id === id)?.name || id;
            const parts = [`${faction.name} [influence ${faction.influence}, reputation ${faction.reputation}]`];
            if (faction.goal) parts.push(`seeks "${faction.goal}" (${faction.goalProgress}%)`);
            if (standing.allies.length) parts.push(`allied with ${standing.allies.map(a => nameOfFaction(a.id)).slice(0, 3).join(', ')}`);
            if (standing.enemies.length) {
                const atWar = standing.enemies.filter(e => factionRelationScore(faction, e.id) <= FACTION_WAR_AT);
                parts.push(`${atWar.length ? 'openly hostile to' : 'at odds with'} ${(atWar.length ? atWar : standing.enemies).map(e => nameOfFaction(e.id)).slice(0, 3).join(', ')}`);
            }
            if (standing.contested) parts.push(`${standing.contested} contested holding(s)`);
            if (faction.achievements?.length) parts.push(`has already achieved: ${faction.achievements.slice(-2).join('; ')}`);
            return parts.join(' — ');
        };
        lines.push(`Factions: ${activeFactions.map(factionLine).join(' | ')}.`);
        // A faction only reaches the scene through the people in it. Without
        // this the DM knows two powers are at war and still has no idea that
        // the man pouring the drinks is sworn to one of them.
        const affiliated = presentNPCs
            .map(npc => {
                const entity = world.entities.find(item => item.id === npc.id) || npc;
                const faction = entity.factionId && activeFactions.find(item => item.id === entity.factionId);
                return faction ? `${npc.name} of ${faction.name}` : null;
            })
            .filter(Boolean).slice(0, 8);
        if (affiliated.length) {
            lines.push(`Affiliations present: ${affiliated.join('; ')}. They act for their faction's interests, and what they see here can reach it.`);
        }
    }
    const presentIds = new Set(presentNPCs.map(npc => npc.id));
    const relevantRelationships = (modules.relationships ? Object.entries(sess.npcRelationships) : []).filter(([key]) =>
        key.split('|').some(id => presentIds.has(id))).slice(0, 8);
    if (relevantRelationships.length) {
        lines.push(`Relevant NPC relationships: ${relevantRelationships.map(([key, rel]) => {
            const names = key.split('|').map(id => world.entities.find(npc => npc.id === id)?.name || id).join(' ↔ ');
            return `${names}: ${rel.score}${rel.label ? ` (${rel.label})` : ''}${rel.reason ? ` — ${rel.reason}` : ''}`;
        }).join('; ')}.`);
    }
    if (sess.playstyle?.summary) lines.push(`Playstyle adaptation: ${sess.playstyle.summary} Offer compatible opportunities, but keep challenge, surprise, and player freedom.`);
    const explicitPreferences = Object.entries(sess.playstyle?.preferences || {}).slice(0, 10);
    if (explicitPreferences.length) {
        lines.push(`Recorded player preferences: ${explicitPreferences.map(([key, pref]) => `${key}=${pref.value} (confidence ${pref.confidence})`).join('; ')}.`);
    }
    // Information reaching the player is now a mechanic, not an honour system.
    // A development is tellable only through someone in the scene who actually
    // knows it (or because the player was there). Everything else is background
    // the DM may shape the world with, but may not speak aloud.
    const recentNews = sess.worldNews.slice(-16);
    const nameOf = id => world.entities.find(npc => npc.id === id)?.name || id;
    const tellable = [];
    const dark = [];
    recentNews.forEach(item => {
        if (item.playerWitnessed) {
            tellable.push(`${item.text} (the player saw this happen)`);
            return;
        }
        // null knownBy = recorded before knowledge tracking existed; treat as
        // common talk rather than retroactively sealing it away.
        if (item.knownBy === null) {
            tellable.push(`${item.text} (common talk)`);
            return;
        }
        const carriers = (item.knownBy || []).filter(id => presentIds.has(id));
        if (carriers.length) {
            tellable.push(`${item.text} — known here by ${carriers.slice(0, 3).map(nameOf).join(', ')}`);
        } else {
            dark.push(item.text);
        }
    });
    if (tellable.length) {
        lines.push(`Developments reachable in this scene — someone present knows each of these and may reveal it if the conversation earns it (in their own voice, with their own slant; they need not volunteer it): ${tellable.slice(-8).join(' | ')}.`);
    }
    if (dark.length) {
        lines.push(`Developments NOT yet reachable — nobody present knows these and the player has not witnessed them. Use them to shape the world's mood and consequences, but no character may mention, hint at, or act on them: ${dark.slice(-8).join(' | ')}.`);
    }
    return lines.length > 1 ? `\n${lines.join('\n')}` : '';
}
