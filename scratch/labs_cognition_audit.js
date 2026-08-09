const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const { buildContext } = require('./app_source');

const diagnostics = [];
let fetchCalls = [];
let nextContent = JSON.stringify({
    signals: { warmth: 2, pressure: 0, vulnerability: 0, boundaryRespect: 1, urgency: 0, hostility: 0, reciprocity: 1 },
    messageKind: 'affection', evidence: 'missed you', confidence: 0.88
});

const context = {
    window: {}, URL, AbortController, setTimeout, clearTimeout, console, navigator: { gpu: null },
    fetch: async (url, options = {}) => {
        fetchCalls.push({ url, options });
        if (url.endsWith('/models')) return { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ id: 'smollm2:360m' }] }) };
        return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: nextContent } }] }) };
    }
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('labs-core.js', 'utf8'), context, { filename: 'labs-core.js' });
vm.runInContext(fs.readFileSync('labs-tasks.js', 'utf8'), context, { filename: 'labs-tasks.js' });

async function run() {
    const appSource = fs.readFileSync('app.js', 'utf8');
    const htmlSource = fs.readFileSync('index.html', 'utf8');
    const cssSource = fs.readFileSync('style.css', 'utf8');
    assert.ok(htmlSource.indexOf('labs-core.js') < htmlSource.indexOf('app.js?v='), 'Labs runtime loads before the application');
    assert.match(appSource, /setupHordeLabs\(\)/, 'Labs is mounted during application startup');
    assert.match(appSource, /labsProposal\('social_signal'[\s\S]+?'chat'/, 'Chat has an opt-in social-signal hook');
    assert.match(appSource, /labsProposal\('social_signal'[\s\S]+?'humans'/, 'Virtual Humans have an opt-in social-signal hook');
    assert.match(appSource, /labsProposal\('event_lens'[\s\S]+?'worlds'/, 'Worlds has an opt-in actor-scoped event hook');
    assert.match(appSource, /updateChatHudFromTurn/, 'Traditional and Labs chat HUD controllers are wired into completed turns');
    assert.match(appSource, /rerollHudBefore[\s\S]+?chatHudState/, 'Reroll restores the prior timeline HUD state');
    assert.match(htmlSource, /id="tab-hud"[\s\S]+?id="chat-status-col"|id="chat-status-col"[\s\S]+?id="tab-hud"/, 'Chat HUD authoring and right sidebar are present');
    assert.match(htmlSource, /labs-embedded\.js[\s\S]+?labs-core\.js/, 'Embedded runtime loads before Labs core');
    assert.match(cssSource, /\.labs-close-btn\s*\{[^}]*width:\s*38px[^}]*height:\s*38px/, 'Labs close control has a fixed square geometry');
    assert.match(cssSource, /@media \(max-width: 760px\)[\s\S]+?labs-policy-grid/, 'Labs has a narrow-screen layout');

    const Labs = context.HordeLabs;
    assert.equal(Labs.tasks().length, 6, 'all bounded tasks register');
    assert.equal(Labs.normalizeConfig({ baseUrl: 'https://evil.example/v1' }).baseUrl, 'http://127.0.0.1:11434/v1', 'remote cognition endpoints are blocked');

    Labs.configure({ enabled: false, model: 'smollm2:360m', policies: { chat: 'assist' } }, { onDiagnostic: row => diagnostics.push(row) });
    let result = await Labs.propose('social_signal', { message: 'missed you', text: 'missed you' }, { mode: 'chat' });
    assert.equal(result.skipped, true, 'off is a no-call fallback');
    assert.equal(fetchCalls.length, 0, 'off performs no fetch');

    Labs.configure({ enabled: true, model: 'smollm2:360m', policies: { chat: 'shadow' } });
    result = await Labs.propose('social_signal', { message: 'missed you', text: 'missed you' }, { mode: 'chat' });
    assert.equal(result.ok, true);
    assert.equal(result.accepted, false, 'shadow never affects play');
    assert.equal(result.shadow, true);

    Labs.configure({ enabled: true, model: 'smollm2:360m', policies: { chat: 'assist' } });
    result = await Labs.propose('social_signal', { message: 'missed you again', text: 'missed you again' }, { mode: 'chat' });
    assert.equal(result.accepted, true, 'assist accepts validator-approved output');
    assert.equal(result.candidate.signals.warmth, 2);

    nextContent = JSON.stringify({
        meters: [{ id: 'trust', value: 57, evidence: 'I kept my promise' }],
        status: 'A promise was explicitly kept.', statusEvidence: 'kept my promise', confidence: .91
    });
    result = await Labs.propose('status_update', {
        message: 'PLAYER: I kept my promise\nREPLY: I noticed.', text: 'PLAYER: I kept my promise\nREPLY: I noticed.',
        meters: [{ id: 'trust', min: 0, max: 100, current: 50 }]
    }, { mode: 'chat', policy: 'assist' });
    assert.equal(result.accepted, true, 'validated chat HUD updates are accepted');
    assert.equal(result.candidate.meters[0].value, 57, 'HUD values survive bounded validation');

    nextContent = JSON.stringify({
        meters: [{ id: 'trust', value: 82, evidence: '' }],
        status: 'Trust suddenly surged.', statusEvidence: '', confidence: .99
    });
    result = await Labs.propose('status_update', {
        message: 'PLAYER: hello\nREPLY: hello', text: 'PLAYER: hello\nREPLY: hello',
        meters: [{ id: 'trust', min: 0, max: 100, current: 57 }]
    }, { mode: 'chat', policy: 'assist' });
    assert.equal(result.ok, false, 'a HUD meter cannot change without exact exchange evidence');

    nextContent = JSON.stringify({
        events: [{ actorId: 'npc_unknown', kind: 'move', targetId: '', locationId: 'hall', phase: 'completed', evidence: 'walk out', confidence: .9 }],
        ambiguous: false, confidence: .9
    });
    Labs.configure({ enabled: true, model: 'qwen3:0.6b', policies: { worlds: 'assist' } });
    result = await Labs.propose('event_lens', {
        text: 'I walk out', allowedActorIds: ['player'], allowedTargetIds: ['player'], allowedLocationIds: ['room', 'hall']
    }, { mode: 'worlds' });
    assert.equal(result.ok, false, 'unknown actors are rejected');
    assert.match(result.reason, /unknown actor/i);

    Labs.configure({ enabled: true, model: 'mystery-local-model', policies: { worlds: 'assist' } });
    result = await Labs.propose('event_lens', {
        text: 'I walk out', allowedActorIds: ['player'], allowedTargetIds: ['player'], allowedLocationIds: ['room', 'hall']
    }, { mode: 'worlds' });
    assert.equal(result.skipped, true, 'an unknown model cannot bypass a Small-tier task gate');
    assert.equal(Labs.capabilityTier('HuggingFaceTB/SmolLM2-135M-Instruct'), 'micro', 'the embedded 135M model is explicitly Micro-tier');

    nextContent = 'not json';
    Labs.configure({ enabled: true, model: 'smollm2:360m', policies: { chat: 'assist' } });
    result = await Labs.propose('social_signal', { message: 'different malformed request', text: 'different malformed request' }, { mode: 'chat' });
    assert.equal(result.ok, false, 'malformed local output falls back without throwing');
    assert.ok(diagnostics.length >= 4, 'private diagnostics are recorded');
    assert.ok(diagnostics.every(row => !('prompt' in row) && !('candidate' in row)), 'diagnostics do not store prompt or thought content');

    context.HordeLabsEmbedded = {
        completeStructured: async () => ({ text: JSON.stringify({
            signals: { warmth: 1, pressure: 0, vulnerability: 0, boundaryRespect: 0, urgency: 0, hostility: 0, reciprocity: 0 },
            messageKind: 'casual', evidence: 'hello embedded', confidence: .8
        }) })
    };
    Labs.configure({ enabled: true, runtime: 'embedded', policies: { chat: 'assist' } });
    result = await Labs.propose('social_signal', { message: 'hello embedded', text: 'hello embedded' }, { mode: 'chat' });
    assert.equal(result.accepted, true, 'embedded runtime uses the same schema and validator path');
    assert.equal(result.candidate.messageKind, 'casual');

    const hudContext = buildContext(vm, ['extractChatHudDirective'], {});
    let extracted = hudContext.extractChatHudDirective('Visible reply\n<horde_status>{"meters":[');
    assert.equal(extracted.text, 'Visible reply', 'an incomplete private HUD footer is quarantined');
    assert.equal(extracted.update, null);
    extracted = hudContext.extractChatHudDirective('Hi\n<horde_status>{"meters":[],"status":"Calm"}</horde_status>');
    assert.equal(extracted.text, 'Hi', 'a complete private HUD footer is removed from speech');
    assert.equal(extracted.update.status, 'Calm', 'a valid private HUD footer remains available to the validator');

    class SilentWorker {
        constructor() { this.terminated = false; }
        postMessage() {}
        terminate() { this.terminated = true; }
    }
    const embeddedContext = {
        window: {}, Worker: SilentWorker, DOMException, console, URL,
        document: { baseURI: 'http://127.0.0.1:43127/' },
        location: { protocol: 'http:' }
    };
    embeddedContext.window = embeddedContext;
    vm.createContext(embeddedContext);
    vm.runInContext(fs.readFileSync('labs-embedded.js', 'utf8'), embeddedContext, { filename: 'labs-embedded.js' });
    const waitingStatus = embeddedContext.HordeLabsEmbedded.status({}).catch(error => error);
    const abortController = new AbortController();
    const waitingGeneration = embeddedContext.HordeLabsEmbedded.completeStructured({}, abortController.signal).catch(error => error);
    abortController.abort();
    const [statusError, generationError] = await Promise.all([waitingStatus, waitingGeneration]);
    assert.equal(statusError.name, 'AbortError', 'terminating a worker rejects a concurrent status request');
    assert.equal(generationError.name, 'AbortError', 'timed-out embedded generation rejects cleanly');

    const fileContext = {
        window: {}, Worker: SilentWorker, DOMException, console, URL,
        document: { baseURI: 'file:///tmp/horde-studio/index.html' },
        location: { protocol: 'file:' }
    };
    fileContext.window = fileContext;
    vm.createContext(fileContext);
    vm.runInContext(fs.readFileSync('labs-embedded.js', 'utf8'), fileContext, { filename: 'labs-embedded.js' });
    const fileError = await fileContext.HordeLabsEmbedded.status({}).catch(error => error);
    assert.equal(fileError.code, 'HORDE_FILE_WORKER_BLOCKED', 'direct-file mode reports the worker-origin restriction');
    assert.match(fileError.message, /Start Horde Studio/, 'direct-file recovery points to the launcher');

    const health = await Labs.health({ baseUrl: 'http://127.0.0.1:11434/v1' });
    assert.deepEqual(health.models, ['smollm2:360m']);
    console.log(`PASS labs cognition audit (${diagnostics.length} receipts, ${fetchCalls.length} fetches)`);
}

run().catch(error => { console.error(error); process.exitCode = 1; });
