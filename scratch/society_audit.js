/**
 * Society audit — Tier 3 calibration, authored relationships, place state.
 *
 * A world could open with a married couple the engine read as strangers and a
 * bandit road it read as perfectly safe, because both lived only inside a
 * timeline. They are now authored on the world and seeded into every session.
 *
 * The hard part is scale: a world may hold hundreds of people, and every pair
 * is a question. So the ENGINE chooses which pairs are worth asking about and
 * the model never sees the rest — that selection is what most of this file
 * pins down.
 *
 * Run with: node scratch/society_audit.js
 */
const assert = require('node:assert');
const vm = require('node:vm');
const { app, functionSource, constSource, buildContext } = require('./app_source.js');

const context = { console: { warn() {}, log() {} } };
buildContext(vm, ['normalizeWorldRelationship', 'normalizeWorldRelationships',
    'readWorldRelationships', 'seedRelationshipsFromWorld', 'syncRelationshipsWithWorld',
    'authoredLocationState', 'seedLocationStatesFromWorld', 'syncLocationStatesWithWorld',
    'calibrationPairCandidates', 'calibrationSocietyDigest', 'buildCalibrationPrompt',
    'calibrationFindingsFromSociety', 'applyCalibrationFinding', 'parseCalibrationPayload',
    'calibrationBatches', 'calibrationWorkUnits',
    'SOCIETY_PAIR_CAP', 'CALIBRATION_PASSES'], context);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function society() {
    return {
        id: 'w', name: 'Emberwick',
        locations: [
            { id: 'l_house', name: 'Smith House', exits: [] },
            { id: 'l_road', name: 'The Mine Road', exits: [], description: 'Bandits work this stretch after dark.' },
            { id: 'l_square', name: 'Village Square', exits: [], danger: 10, prosperity: 70 }
        ],
        entities: [
            { id: 'e_greg', name: 'Greg Smith', type: 'npc', isMajor: true, homeLocation: 'l_house',
              description: 'Married to Emily Smith. A blacksmith who drinks too much.' },
            { id: 'e_emily', name: 'Emily Smith', type: 'npc', isMajor: true, homeLocation: 'l_house',
              description: 'Greg\'s wife, quietly furious.' },
            { id: 'e_sarah', name: 'Sarah', type: 'npc', isMajor: true, homeLocation: 'l_inn' },
            { id: 'e_vess', name: 'Vess', type: 'npc', factionId: 'f_hand' },
            { id: 'e_dov', name: 'Dov', type: 'npc', factionId: 'f_hand' },
            { id: 'i_sword', name: 'Old Sword', type: 'item' }
        ],
        factions: [{ id: 'f_hand', name: 'The Ashen Hand' }]
    };
}

// --- pair selection: the part that has to scale ------------------------------

test('the pairs that matter are found without asking about every pair', () => {
    const pairs = context.calibrationPairCandidates(society());
    const has = (a, b) => pairs.some(p => [p.a.id, p.b.id].sort().join('|') === [a, b].sort().join('|'));
    assert(has('e_greg', 'e_emily'), 'a married couple was not judged worth asking about');
    assert(has('e_vess', 'e_dov'), 'two people sworn to the same power were skipped');
    assert(has('e_greg', 'e_sarah'), 'two central characters were never considered');
});

test('being named in someone\'s description outranks merely being prominent', () => {
    const pairs = context.calibrationPairCandidates(society());
    const first = [pairs[0].a.id, pairs[0].b.id].sort().join('|');
    assert.equal(first, 'e_emily|e_greg',
        'the strongest signal in the world was not the first thing asked about');
});

test('items are never given relationships', () => {
    const pairs = context.calibrationPairCandidates(society());
    assert(!pairs.some(p => p.a.id === 'i_sword' || p.b.id === 'i_sword'),
        'a sword was asked how it feels about someone');
});

test('a pair the author has already settled is not asked about again', () => {
    const world = society();
    world.relationships = [{ a: 'e_greg', b: 'e_emily', label: 'wife', score: 40 }];
    const pairs = context.calibrationPairCandidates(world);
    assert(!pairs.some(p => [p.a.id, p.b.id].sort().join('|') === 'e_emily|e_greg'),
        'the pass would propose a standing the author already wrote');
});

test('a hand-written world still gets proposals with none of the usual signals', () => {
    // The real campaign had no homes, no factions and nobody flagged major —
    // and got zero proposals, which is the opposite of the point.
    const world = { id: 'w', name: 'Plain', locations: [], factions: [], entities: [] };
    for (let i = 0; i < 12; i++) {
        world.entities.push({ id: `e_${i}`, name: `Person ${i}`, type: 'npc', description: 'Someone.' });
    }
    const pairs = context.calibrationPairCandidates(world);
    assert(pairs.length > 0, 'a plain hand-written world would be told there is nothing to settle');
    assert(pairs.length <= context.SOCIETY_PAIR_CAP, 'the small-cast fallback ignored the cap');
});

test('the small-cast fallback never fires on a cast too large to enumerate', () => {
    const world = { id: 'w', name: 'Big', locations: [], factions: [], entities: [] };
    for (let i = 0; i < 300; i++) {
        world.entities.push({ id: `e_${i}`, name: `Person ${i}`, type: 'npc' });
    }
    const started = Date.now();
    assert.equal(context.calibrationPairCandidates(world).length, 0,
        '45,000 pairs were enumerated for a world that states nothing about anyone');
    assert(Date.now() - started < 2000, 'the fallback made a large cast slow');
});

test('a barracks is not treated as a household', () => {
    // Nine people sharing a roof is an institution; pairing them all would be
    // 36 questions about a building nobody lives in.
    const world = society();
    world.entities = [];
    for (let i = 0; i < 9; i++) {
        world.entities.push({ id: `e_${i}`, name: `Guard ${i}`, type: 'npc', homeLocation: 'l_barracks' });
    }
    // On a cast this small they are still asked about — but as fellow
    // inhabitants, never as a household, which is the wrong steer to give.
    const pairs = context.calibrationPairCandidates(world);
    assert(!pairs.some(pair => pair.reasons.includes('share a home')),
        'a nine-bed barracks was mined for family ties');
});

test('a large cast stays bounded and fast', () => {
    // The whole point: 400 people is 79,800 possible pairs and the prompt must
    // not grow with that number.
    const world = { id: 'w', name: 'Big', locations: [], entities: [], factions: [] };
    for (let i = 0; i < 400; i++) {
        world.entities.push({
            id: `e_${i}`, name: `Person ${i}`, type: 'npc', isMajor: true,
            homeLocation: `l_${i % 50}`, factionId: `f_${i % 20}`
        });
    }
    const started = Date.now();
    const pairs = context.calibrationPairCandidates(world);
    const elapsed = Date.now() - started;
    assert(pairs.length <= context.SOCIETY_PAIR_CAP,
        `the pass would ask about ${pairs.length} pairs, past the cap of ${context.SOCIETY_PAIR_CAP}`);
    assert(elapsed < 3000, `pair selection took ${elapsed}ms on 400 people`);
    const prompt = context.buildCalibrationPrompt(world, 'society');
    assert(prompt.length < 60000, `the society prompt grew to ${prompt.length} characters`);
});

test('a world with nobody in it produces no pairs and does not throw', () => {
    [{}, { entities: null }, { entities: [{}] }, { entities: [{ id: 'x', type: 'npc' }] }].forEach(world => {
        assert.doesNotThrow(() => context.calibrationPairCandidates(world),
            `pair selection threw on ${JSON.stringify(world)}`);
    });
});

// --- the prompt --------------------------------------------------------------

test('the prompt forbids the flat, wrong answer', () => {
    const prompt = context.buildCalibrationPrompt(society(), 'society');
    assert(/[Nn]ever "acquaintance"/.test(prompt),
        'nothing stops every relationship coming back as "acquaintance"');
    assert(/Skip any pair the text gives you no basis for/.test(prompt),
        'the model is not told that a gap beats a guess');
    assert(/Propose none if the world does not call for them/.test(prompt),
        'the model may invent factions the author never implied');
});

test('the prompt carries the evidence a judgement needs', () => {
    const prompt = context.buildCalibrationPrompt(society(), 'society');
    assert(/Married to Emily Smith/.test(prompt), 'the description that settles the pair was not sent');
    assert(/share a home/.test(prompt), 'the model is not told why a pair was raised');
    assert(/The Mine Road/.test(prompt), 'a place with nothing set was not offered for judgement');
    assert(!/Village Square/.test(prompt), 'a place the author already described was asked about again');
});

test('Society is offered as a pass in its own right', () => {
    assert(context.CALIBRATION_PASSES.society, 'there is no Society pass to run');
    assert(/relation/i.test(context.CALIBRATION_PASSES.society.blurb));
});

// --- findings ----------------------------------------------------------------

const payload = {
    relationships: [
        { a: 'e_greg', b: 'e_emily', label: 'wife', score: 35, reason: 'married fifteen years' },
        { a: 'e_greg', b: 'e_greg', label: 'self', score: 0 },
        { a: 'e_ghost', b: 'e_emily', label: 'stranger', score: 0 },
        { a: 'e_vess', b: 'e_dov', score: 60 }
    ],
    places: [{ id: 'l_road', danger: 70, prosperity: 20, conditions: ['bandits after dark'], why: 'told so' },
             { id: 'l_square', danger: 90, prosperity: 0 }],
    factions: [{ name: 'The Ferrymen', goal: 'Hold the crossing', influence: 30, reputation: 10 }],
    memberships: [{ entity: 'e_sarah', faction: 'The Ferrymen', why: 'she runs the boat' },
                  { entity: 'e_vess', faction: 'The Ashen Hand' }]
};

test('a judged pair becomes a reviewable proposal', () => {
    const findings = context.calibrationFindingsFromSociety(society(), payload);
    const rel = findings.find(f => f.type === 'set_relationship');
    assert(rel, 'no relationship was proposed');
    assert(/Greg Smith & Emily Smith: wife/.test(rel.title));
    assert(/\+35/.test(rel.detail) && /married fifteen years/.test(rel.detail),
        'the author cannot see what the standing rests on');
});

test('nonsense pairs are refused rather than shown', () => {
    const findings = context.calibrationFindingsFromSociety(society(), payload);
    const rels = findings.filter(f => f.type === 'set_relationship');
    assert.equal(rels.length, 1,
        'a self-directed pair, an unknown person, or an unlabelled score reached the author');
});

test('a place the author already described is left alone', () => {
    const findings = context.calibrationFindingsFromSociety(society(), payload);
    const places = findings.filter(f => f.type === 'set_location_state');
    assert.deepEqual(places.map(f => f.patch.locationId), ['l_road'],
        'the pass would overwrite a place the author had already set');
    assert.equal(places[0].patch.danger, 70);
    assert.equal(places[0].severity, 'warning', 'a dangerous road was filed as a mere suggestion');
});

test('a proposed faction and the membership into it both appear, in that order', () => {
    const findings = context.calibrationFindingsFromSociety(society(), payload);
    const factionAt = findings.findIndex(f => f.type === 'add_faction');
    const memberAt = findings.findIndex(f => f.patch?.entityId === 'e_sarah');
    assert(factionAt >= 0 && memberAt >= 0, 'the faction or its member never surfaced');
    assert(factionAt < memberAt, 'applying in order would swear someone to a faction that does not exist yet');
});

test('a membership into an existing faction resolves by name', () => {
    const findings = context.calibrationFindingsFromSociety(society(), payload);
    const vess = findings.find(f => f.type === 'set_faction_membership' && f.patch.entityId === 'e_vess');
    assert.equal(vess, undefined, 'someone who already serves a power was asked to join it again');
});

// --- applying ----------------------------------------------------------------

test('applying writes the standing once and never twice', () => {
    const world = society();
    const finding = context.calibrationFindingsFromSociety(world, payload)
        .find(f => f.type === 'set_relationship');
    assert.equal(context.applyCalibrationFinding(world, finding), true);
    assert.equal(world.relationships.length, 1);
    assert.equal(context.applyCalibrationFinding(world, finding), false,
        'applying twice wrote the same pair twice');
});

test('applying never overwrites what the author set', () => {
    const world = society();
    world.locations[1].danger = 5;
    world.relationships = [{ a: 'e_greg', b: 'e_emily', label: 'strangers', score: 0 }];
    context.calibrationFindingsFromSociety(society(), payload)
        .forEach(finding => context.applyCalibrationFinding(world, finding));
    assert.equal(world.locations[1].danger, 5, 'an authored danger was overwritten');
    assert.equal(world.relationships[0].label, 'strangers', 'an authored standing was overwritten');
});

test('a membership is refused when its faction was declined', () => {
    const world = society();
    const findings = context.calibrationFindingsFromSociety(world, payload);
    const membership = findings.find(f => f.type === 'set_faction_membership');
    // The author accepted the person but not the power.
    assert.equal(context.applyCalibrationFinding(world, membership), false,
        'an NPC was sworn to a faction that was never created');
    assert.equal(world.entities.find(e => e.id === 'e_sarah').factionId, undefined);
});

test('applying the whole set in order leaves a consistent world', () => {
    const world = society();
    context.calibrationFindingsFromSociety(world, payload)
        .forEach(finding => context.applyCalibrationFinding(world, finding));
    const ferrymen = world.factions.find(f => f.name === 'The Ferrymen');
    assert(ferrymen, 'the faction was not created');
    assert.equal(world.entities.find(e => e.id === 'e_sarah').factionId, ferrymen.id,
        'the member was not joined to the faction created alongside them');
    assert.equal(world.locations[1].danger, 70);
});

// --- seeding into play -------------------------------------------------------

test('authored standings reach a timeline in the engine\'s own key format', () => {
    const world = society();
    world.relationships = [{ a: 'e_emily', b: 'e_greg', label: 'wife', score: 35, reason: 'married' }];
    const seeded = context.seedRelationshipsFromWorld(world);
    const key = context.relationshipKey('e_greg', 'e_emily');
    assert(seeded[key], 'the standing will never be found by the engine that reads it');
    assert.equal(seeded[key].label, 'wife');
    assert.equal(seeded[key].score, 35);
});

test('a standing naming somebody who is gone never reaches play', () => {
    const world = society();
    world.relationships = [{ a: 'e_greg', b: 'e_deleted', label: 'brother', score: 50 },
                           { a: 'e_greg', b: 'e_greg', label: 'self', score: 0 }];
    assert.deepEqual(context.seedRelationshipsFromWorld(world), {},
        'a dangling or self-directed standing was seeded into play');
});

test('one pair cannot hold two standings', () => {
    const world = society();
    world.relationships = [{ a: 'e_greg', b: 'e_emily', label: 'wife', score: 35 },
                           { a: 'e_emily', b: 'e_greg', label: 'rival', score: -50 }];
    context.normalizeWorldRelationships(world);
    assert.equal(world.relationships.length, 1, 'the same pair was stored twice, in both orders');
});

test('an authored place opens in the state it was written in', () => {
    const states = context.seedLocationStatesFromWorld(society());
    assert.equal(states.l_square.danger, 10);
    assert.equal(states.l_square.prosperity, 70);
    assert.equal(states.l_house, undefined, 'a place that says nothing was given a state anyway');
});

test('a faction opens holding the ground it was given', () => {
    const world = society();
    world.factions[0].territory = ['l_road'];
    const states = context.seedLocationStatesFromWorld(world);
    assert.equal(states.l_road.controlFactionId, 'f_hand',
        'territory was authored but nobody held the ground at turn one');
});

test('a standing conditon becomes a condition that does not expire on its own', () => {
    const world = society();
    world.locations[1].conditions = ['under curfew'];
    const state = context.seedLocationStatesFromWorld(world).l_road;
    assert.equal(state.conditions[0].label, 'under curfew');
    assert.equal(state.conditions[0].expiresTurn, null, 'an authored condition was given a timer');
});

test('syncing adds to a running timeline without disturbing it', () => {
    const world = society();
    world.relationships = [{ a: 'e_greg', b: 'e_emily', label: 'wife', score: 35 }];
    const sess = {
        npcRelationships: { [context.relationshipKey('e_greg', 'e_emily')]: { score: -90, label: 'estranged', reason: 'the fire' } },
        locationStates: { l_square: { danger: 95, prosperity: 5, conditions: [], controlFactionId: '', resources: {} } }
    };
    world.locations[1].danger = 70; world.locations[1].prosperity = 20;
    context.syncRelationshipsWithWorld(world, sess);
    context.syncLocationStatesWithWorld(world, sess);
    assert.equal(sess.npcRelationships[context.relationshipKey('e_greg', 'e_emily')].score, -90,
        'what happened at the table was reset to the authored figure');
    assert.equal(sess.locationStates.l_square.danger, 95, 'a place\'s history was overwritten by the editor');
    assert.equal(sess.locationStates.l_road.danger, 70, 'a newly described place never reached the timeline');
});

test('syncing is idempotent', () => {
    const world = society();
    world.relationships = [{ a: 'e_greg', b: 'e_emily', label: 'wife', score: 35 }];
    const sess = { npcRelationships: {}, locationStates: {} };
    assert.equal(context.syncRelationshipsWithWorld(world, sess), 1);
    assert.equal(context.syncRelationshipsWithWorld(world, sess), 0);
    const first = context.syncLocationStatesWithWorld(world, sess);
    assert.equal(context.syncLocationStatesWithWorld(world, sess), 0, `${first} places were added twice`);
});

test('malformed worlds and sessions do not throw', () => {
    [{}, { entities: null }, { relationships: 'nope' }, { relationships: [null, 42] },
     { locations: null }, { locations: [{ id: 'x', conditions: 'nope' }] }].forEach(world => {
        assert.doesNotThrow(() => context.seedRelationshipsFromWorld(world));
        assert.doesNotThrow(() => context.seedLocationStatesFromWorld(world));
        assert.doesNotThrow(() => context.normalizeWorldRelationships(world));
    });
    assert.doesNotThrow(() => context.syncRelationshipsWithWorld(society(), null));
    assert.doesNotThrow(() => context.syncLocationStatesWithWorld(society(), null));
});

// --- wiring ------------------------------------------------------------------

test('new timelines are seeded from the world', () => {
    assert(/npcRelationships: seedRelationshipsFromWorld\(world\)/.test(app),
        'a new session starts with nobody knowing anybody');
    assert(/locationStates: seedLocationStatesFromWorld\(world\)/.test(app),
        'a new session starts with every place unremarkable');
});

test('running timelines are kept in step', () => {
    const normalize = functionSource('normalizeLivingWorldState');
    assert(/syncRelationshipsWithWorld\(world, sess\)/.test(normalize));
    assert(/syncLocationStatesWithWorld\(world, sess\)/.test(normalize));
});

test('stored society data is repaired on load', () => {
    const repair = functionSource('normalizeAuthoredWorld');
    assert(/normalizeWorldRelationships\(world\)/.test(repair),
        'a standing naming a deleted NPC is never repaired');
    assert(/location\.danger = livingClamp/.test(repair), 'an out-of-range danger is never repaired');
    assert(/normalizeAuthoredWorld\(world\)/.test(functionSource('repairLoadedState')),
        'the repair never runs on load');
});

test('the Society pass is reachable from the calibration UI', () => {
    assert(/pass === 'society'/.test(functionSource('buildCalibrationPrompt')),
        'the pass has no prompt');
    assert(/calibrationFindingsFromSociety\(world, payload, carriedFactions\)/.test(app),
        'the reply is never turned into findings');
});

test('the manual editors exist for the cases calibration should not own', () => {
    ['loc-danger', 'loc-prosperity', 'loc-conditions', 'clear-loc-state',
     'ent-add-relation', 'rel-label', 'rel-score', 'del-rel'].forEach(control => {
        assert(app.includes(control), `the ${control} control is missing from the editor`);
    });
    // The point of Tier 3 is that hand-editing hundreds of people is not the plan.
    assert(/Calibrate → Society/.test(app),
        'nothing points the author at the automated path when the cast is large');
});

// --- factions and membership, batched -----------------------------------

function rosterWorld(npcCount) {
    const world = { id: 'w', name: 'Emberwick', factions: [],
        locations: [{ id: 'l1', name: 'Square', exits: [] }], entities: [] };
    for (let i = 0; i < npcCount; i++) {
        world.entities.push({ id: `e${i}`, name: `Person ${i}`, type: 'npc',
            description: 'A miner of the deep seam.' });
    }
    return world;
}

test('every unaffiliated character is asked about exactly once', () => {
    // They used to be listed in full in EVERY batch, so a six-call pass asked
    // the same question about the same people six times and paid for six sets
    // of duplicate answers.
    const world = rosterWorld(30);
    const batches = context.calibrationBatches(world, 'society');
    const listed = batches.flatMap(batch =>
        (context.calibrationSocietyDigest(world, batch).unaffiliated.match(/^- \[(e\d+)\]/gm) || []));
    assert.equal(listed.length, new Set(listed).size, 'a character was asked about in more than one batch');
    assert.equal(listed.length, 30, `${listed.length} of 30 characters were asked about`);
});

test('a batch with no roster in it does not ask about factions at all', () => {
    const world = society();
    const batches = context.calibrationBatches(world, 'society');
    const prompts = batches.map(batch => context.buildCalibrationPrompt(world, 'society', batch));
    const asking = prompts.filter(prompt => /FACTIONS AND WHO SERVES THEM/.test(prompt)).length;
    const carrying = batches.filter(batch => batch.some(unit => unit.kind === 'member')).length;
    assert.equal(asking, carrying,
        'the faction question is asked in batches that carry nobody to ask about');
});

test('a batch only carries the sections it has work for', () => {
    const world = rosterWorld(30);
    const batches = context.calibrationBatches(world, 'society');
    batches.forEach((batch, index) => {
        const prompt = context.buildCalibrationPrompt(world, 'society', batch);
        const hasPairs = batch.some(unit => unit.kind === 'pair');
        const hasPlaces = batch.some(unit => unit.kind === 'place');
        assert.equal(/1\. RELATIONSHIPS/.test(prompt), hasPairs,
            `batch ${index + 1} asks about pairs it does not carry, or omits ones it does`);
        assert.equal(/2\. PLACES/.test(prompt), hasPlaces,
            `batch ${index + 1} asks about places it does not carry, or omits ones it does`);
    });
});

test('the existing faction list travels with every batch, since memberships resolve against it', () => {
    const world = society();
    const batches = context.calibrationBatches(world, 'society');
    batches.forEach((batch, index) => {
        const prompt = context.buildCalibrationPrompt(world, 'society', batch);
        assert(/EXISTING FACTIONS:/.test(prompt),
            `batch ${index + 1} cannot resolve a membership against a faction that already exists`);
    });
});

test('a member found late can join a power proposed earlier in the same run', () => {
    // Nothing is applied to the world until the author says so, so a later
    // batch has no way to know about a guild an earlier one proposed — unless
    // the run carries it forward.
    const world = rosterWorld(4);
    const carried = new Map();
    const first = context.calibrationFindingsFromSociety(world, {
        factions: [{ name: 'The Miners Guild', goal: 'Reopen the seam' }],
        memberships: [{ entity: 'e0', faction: 'The Miners Guild' }]
    }, carried);
    assert(first.some(f => f.type === 'add_faction'), 'the guild was not proposed');
    assert(first.some(f => f.type === 'set_faction_membership' && f.patch.entityId === 'e0'),
        'the member named alongside the new faction was dropped');

    // A later batch names only the membership.
    const later = context.calibrationFindingsFromSociety(world, {
        memberships: [{ entity: 'e3', faction: 'The Miners Guild' }]
    }, carried);
    assert(later.some(f => f.type === 'set_faction_membership' && f.patch.entityId === 'e3'),
        'a member in a later batch could not be joined to the guild proposed earlier');
    assert(!later.some(f => f.type === 'add_faction'),
        'the same guild was proposed a second time');
});

test('the same proposal from two batches is shown once', () => {
    const runner = functionSource('runCalibrationPass');
    assert(/findings\.some\(seen => seen\.id === finding\.id\)/.test(runner),
        'a faction two batches both imply would be listed for review twice');
});

test('the prompt tells the model that most people serve nobody', () => {
    const world = rosterWorld(5);
    const batch = context.calibrationBatches(world, 'society')
        .find(b => b.some(unit => unit.kind === 'member'));
    const prompt = context.buildCalibrationPrompt(world, 'society', batch);
    assert(/usually serves nobody/.test(prompt),
        'nothing stops every farmer and innkeeper being forced into a faction');
    assert(/an invented faction is worse than no faction/.test(prompt),
        'nothing stops powers being invented that the fiction never implied');
});

test('a proposed faction and its members survive the round trip through the parser', () => {
    // The findings builder was always tested directly, which is how a parser
    // that rejected every Society reply went unnoticed.
    const world = rosterWorld(3);
    const reply = JSON.stringify({
        factions: [{ name: 'The Miners Guild', goal: 'Reopen the deep seam', influence: 40 }],
        memberships: [{ entity: 'e1', faction: 'The Miners Guild', why: 'works the seam' }]
    });
    const payload = context.parseCalibrationPayload(reply);
    assert(payload, 'a faction-and-membership reply is rejected by the parser');
    const findings = context.calibrationFindingsFromSociety(world, payload, new Map());
    const faction = findings.find(f => f.type === 'add_faction');
    const member = findings.find(f => f.type === 'set_faction_membership');
    assert(faction && member, 'the round trip lost the faction or its member');
    assert(findings.indexOf(faction) < findings.indexOf(member),
        'applying in order would swear someone to a faction that does not exist yet');
    // And applying them really does join the two.
    context.applyCalibrationFinding(world, faction);
    context.applyCalibrationFinding(world, member);
    const created = world.factions.find(f => f.name === 'The Miners Guild');
    assert(created, 'the faction was not created');
    assert.equal(world.entities.find(e => e.id === 'e1').factionId, created.id,
        'the member was not joined to it');
});

let failures = 0;
for (const { name, fn } of tests) {
    try { fn(); console.log(`✓ ${name}`); }
    catch (error) { failures++; console.error(`✗ ${name}\n  ${error.message}`); }
}
if (failures) {
    console.error(`\n${failures} society check(s) failed.`);
    process.exit(1);
}
console.log(`\n${tests.length} society checks passed.`);
