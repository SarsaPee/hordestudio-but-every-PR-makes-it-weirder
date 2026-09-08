const assert = require('node:assert/strict');
const vm = require('node:vm');
const { buildContext } = require('./app_source');
const ctx = { console, companionLifeState: c => c.testLife,
    companionNextWakeAt: (c, now) => c.testLife.situation.endsAt || now + 3600000,
    companionSetDecisionEvidence: (c, evidence) => { c.evidence = evidence; } };
buildContext(vm, ['companionAttentionContext', 'decideCompanionAttention', 'advanceCompanionMessageAttention',
    'normalizeCompanionMessage'], ctx);
const now = 1800000000000;
const experience = { realTimeLife: true, replyDelays: true, allowNoReply: true };
const person = () => ({ id: 'ada', humanDynamics: { energy: 85, stress: 15, anger: 0, socialNeed: 50 },
    relationshipDynamics: { warmth: 60, resentment: 0 }, commitments: [],
    testLife: { activity: 'home', label: 'relaxing at home', availability: 'available', situation: {} } });
const message = () => ({ id: 'm', role: 'user', text: 'How was your day?', timestamp: now, deliveredAt: now,
    deliveryState: 'delivered', awaitingReply: true, replyDueAt: 0 });
const tick = (c, m, at) => ctx.advanceCompanionMessageAttention(c, m, at, experience);
const open = (c, m) => { tick(c, m, now); tick(c, m, m.attention.nextCheckAt); };
const test = (name, fn) => { fn(); console.log(`PASS ${name}`); };

test('same message: available person starts generation, occupied person reads and defers, sleeping person does not read', () => {
    const available = person(), busy = person(), asleep = person();
    busy.testLife = { activity: 'work', label: 'working', availability: 'busy', situation: { endsAt: now + 3600000 } };
    asleep.testLife = { activity: 'sleep', label: 'asleep', availability: 'asleep', situation: { endsAt: now + 8 * 3600000 } };
    const a = message(), b = message(), s = message();
    open(available, a); open(busy, b); tick(asleep, s, now);
    assert.equal(a.attention.stage, 'ready'); assert(a.replyDueAt > 0);
    assert.equal(b.attention.stage, 'deferred'); assert(b.readAt > now); assert.equal(b.replyDueAt, 0);
    assert.equal(s.attention.stage, 'waiting'); assert.equal(s.readAt, 0);
    assert.equal(s.attention.nextCheckAt, now + 8 * 3600000);
});

test('early activity release resumes before old gate; extended work postpones past old gate', () => {
    const c = person(), m = message();
    c.testLife = { activity: 'work', label: 'working', availability: 'busy', situation: { endsAt: now + 3600000 } };
    open(c, m); const oldGate = m.attention.nextCheckAt;
    c.testLife = person().testLife;
    tick(c, m, m.attention.lastEvaluatedAt + 1000);
    assert(m.attention.lastEvaluatedAt < oldGate); assert.equal(m.attention.stage, 'ready');
    const finish = m.attention.lastEvaluatedAt + 1000;
    c.testLife = { activity: 'work', label: 'a new meeting', availability: 'busy', situation: { endsAt: now + 2 * 3600000 } };
    tick(c, m, finish);
    assert.equal(m.attention.stage, 'deferred'); assert.equal(m.replyDueAt, 0);
    // The next phone break is a real eligibility boundary, not the old broad routine end.
});

test('ready attention survives reload without adding another composing delay', () => {
    const c = person(), m = message(); open(c, m);
    const restored = ctx.normalizeCompanionMessage(JSON.parse(JSON.stringify(m)));
    assert.equal(restored.attention.stage, 'ready');
    const finish = restored.replyDueAt;
    tick(c, restored, finish - 1); assert.equal(restored.replyDueAt, finish);
    tick(c, restored, finish); assert.equal(restored.attention.stage, 'ready'); assert.equal(restored.replyDueAt, finish);
    assert(restored.attention.trace.length <= 8); assert(c.evidence.decision);
});

test('due promises increase engagement but cannot override private activity or sleep', () => {
    const c = person(), m = message();
    c.humanDynamics.socialNeed = 90;
    c.relationshipDynamics.warmth = 90;
    c.testLife = { activity: 'work', label: 'working', availability: 'busy', situation: {} };
    open(c, m); assert.equal(m.attention.stage, 'deferred');
    c.commitments = [{ status: 'pending', medium: 'text', dueAt: now - 1 }];
    tick(c, m, now + 5 * 60000); assert.equal(m.attention.stage, 'ready');
    c.testLife.situation.availability = 'private';
    tick(c, m, now + 6 * 60000); assert.equal(m.attention.stage, 'deferred');
    assert.equal(c.commitments[0].status, 'pending');
});

test('relationship tension can withhold attention and reconciliation can restore it', () => {
    const c = person(), m = message();
    c.humanDynamics.anger = 90; c.relationshipDynamics.resentment = 90;
    open(c, m); assert.equal(m.attention.stage, 'withheld'); assert(m.awaitingReply);
    c.humanDynamics.anger = 0; c.relationshipDynamics.resentment = 0;
    tick(c, m, now + 10 * 60000); assert.equal(m.attention.stage, 'ready');
});

test('low energy makes effort matter without classifying unread content by regex', () => {
    const c = person(), short = message(), long = message();
    c.humanDynamics.energy = 15; c.humanDynamics.stress = 40;
    long.text = 'A long account. '.repeat(250);
    open(c, short); open(c, long);
    assert.equal(short.attention.stage, 'ready'); assert.equal(long.attention.stage, 'deferred');
});

test('repeated low-priority postponement can leave attention; no invented reply is generated', () => {
    const c = person(), m = message();
    c.humanDynamics.socialNeed = 0; c.relationshipDynamics.warmth = 0; c.relationshipDynamics.resentment = 44;
    c.testLife = { activity: 'work', label: 'working', availability: 'busy', situation: {} };
    open(c, m); tick(c, m, now + 25 * 3600000);
    assert.equal(m.attention.stage, 'forgotten'); assert.equal(m.awaitingReply, false); assert.equal(m.replyDueAt, 0);
});

test('instant mode bypasses delays; undelivered and invalidated messages never advance', () => {
    const c = person(), m = message();
    c.testLife.availability = 'asleep';
    ctx.advanceCompanionMessageAttention(c, m, now, { ...experience, replyDelays: false });
    assert.equal(m.attention.stage, 'ready');
    const future = message(); future.deliveredAt = now + 10000;
    tick(c, future, now); assert.equal(future.readAt, 0); assert.equal(future.replyDueAt, 0);
    const invalid = message(); invalid.invalidated = true;
    assert.equal(tick(c, invalid, now), false); assert.equal(invalid.attention, undefined);
});

test('a new long message interrupts a short prepared answer instead of bypassing inbox effort', () => {
    const c = person(), short = message(), long = message();
    c.humanDynamics.energy = 15; c.humanDynamics.stress = 40;
    open(c, short);
    tick(c, short, short.attention.lastEvaluatedAt);
    assert.equal(short.attention.stage, 'ready');
    long.id = 'followup'; long.text = 'A long account. '.repeat(250);
    ctx.advanceCompanionMessageAttention(c, short, short.attention.lastEvaluatedAt + 1000, experience, [short, long]);
    assert.equal(short.attention.stage, 'deferred'); assert.equal(short.replyDueAt, 0);
});

test('unchanged waiting and ready states do not dirty saves on every poll', () => {
    const c = person(), m = message(); tick(c, m, now);
    assert.equal(tick(c, m, now + 1), false);
    tick(c, m, m.attention.nextCheckAt);
    tick(c, m, m.attention.lastEvaluatedAt);
    const due = m.replyDueAt;
    assert.equal(tick(c, m, due + 5000), false);
    assert.equal(m.replyDueAt, due);
});

test('an already deferred inbox gets a phone break during a long busy routine', () => {
    const c = person(), m = message();
    c.testLife = { activity: 'work', label: 'working', availability: 'busy', situation: { endsAt: now + 8 * 3600000 } };
    open(c, m);
    const seen = m.readAt;
    tick(c, m, seen + 60 * 60000);
    assert.equal(m.attention.stage, 'ready');
    assert(m.attention.reason.includes('phone break'));
    tick(c, m, m.attention.lastEvaluatedAt);
    assert.equal(m.attention.stage, 'ready');
});
