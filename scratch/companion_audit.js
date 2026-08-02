/**
 * Synthetic Companion audit — the digital brain's pure logic.
 *
 * A companion's mood, simulated life, and memory are all deliberately pure
 * functions of (companion, timestamp) rather than accumulating drift from
 * hidden mutable state — the same discipline the World engine holds, so a
 * reply written an hour later still lines up with what was true at the time,
 * and so none of this needs a network call to verify.
 *
 * Run with: node scratch/companion_audit.js
 */
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { app, functionSource, buildContext } = require('./app_source.js');

const context = {
    console: { warn() {}, log() {} },
    state: {
        globalSettings: { apiProvider: 'openrouter' },
        personas: [], activePersonaId: null,
        companions: [], companionThreads: {}, companionTimelines: {},
        activeCompanionId: null, editingCompanionId: null
    },
    COMPANION_TURN_COMMIT_TOOL: { type: 'function', function: { name: 'commit_human_turn' } },
    companionMcpToolCatalog: { higgsfield: [], magnific: [] }
};
buildContext(vm, [
    'normalizeCompanion', 'normalizeCompanionTrauma', 'normalizeCompanionMemoryEntry',
    'normalizeCompanionLifeEvent', 'normalizeCompanionCommitment',
    'normalizeCompanionMessage', 'normalizeCompanionAndThread',
    'captureCompanionRuntime', 'freshCompanionRuntime', 'normalizeCompanionRuntime',
    'applyCompanionRuntime', 'normalizeCompanionChatExperience', 'companionExperienceLevel',
    'normalizeCompanionTimeline', 'ensureCompanionTimelineStore', 'getActiveCompanionTimeline',
    'persistCompanionRuntime', 'getCompanion', 'applyCompanionTurnCommit',
    'companionSeededRoll', 'decayCompanionMood', 'applyCompanionMoodUpdate',
    'isCompanionAsleep', 'companionActivityPool', 'companionLifeState', 'companionNextWakeAt',
    'normalizeCompanionLifeProfile', 'normalizeCompanionLifeRuntime',
    'buildProceduralCompanionLifeProfile', 'companionScheduleBlockAt',
    'companionSituationAt', 'advanceCompanionLife', 'companionWeatherLabel',
    'companionResponsePlan', 'companionInitiativeDelayMs', 'companionNextInitiativeAt',
    'companionExperiencePreset', 'reconcileCompanionExperienceMessages',
    'consolidateCompanionMemory',
    'companionMoodDescription', 'companionRelationshipDescription',
    'companionLocationOptions', 'companionTimeZoneOptions', 'isValidCompanionTimeZone',
    'companionUsesFixedTimezoneOffset', 'companionFixedOffsetDate',
    'formatCompanionUtcOffset', 'companionLocalDateInfo',
    'buildCompanionSystemPrompt', 'buildCompanionMessages',
    'splitCompanionReplyIntoBubbles', 'sanitizeCompanionTextReply',
    'repairCompanionProtocolLeaks', 'normalizeCompanionPhotoStyle',
    'normalizeCompanionPhotoCapturePolicy', 'companionPhotoCapturePlan',
    'applyCompanionGenerationConfig',
    'buildCompanionPhotoPrompt', 'buildCompanionImageRequest',
    'normalizedProviderId', 'providerApiBase', 'providerAuthHeaders',
    'providerHasCredentials', 'providerDisplayName',
    'companionTextProviderId', 'companionImageProviderId',
    'companionMcpImageToolScore', 'companionMcpImageTools',
    'companionMcpTool', 'companionMcpGenerationArguments',
    'normalizeCompanionImageParameters', 'normalizeCompanionImageProviderOptions',
    'normalizeCompanionImageProviderOptionValue',
    'imageCapabilityMap', 'imageParameterValueForDescriptor',
    'chooseCompanionImageEndpoint', 'companionImageCapabilities', 'applyCompanionImageParameters',
    'companionImageErrorMessage', 'isCompanionReferencePrivacyError',
    'gptProtoImageReferenceProfile', 'enrichGptProtoImageModel', 'gptProtoImageEndpoint',
    'generatedImageMimeFromBase64', 'normalizeGeneratedImageSource', 'gptProtoImageFromResponse',
    'rankCompanionImageModels', 'modelSupportsImageReferences', 'rankCompanionTTSModels', 'isTTSCapableModel',
    'rankCompanionTextModels', 'isCompanionTextCapableModel',
    'companionEffectiveLifeBuilderModel',
    'companionBalancedJSONObjectBlocks', 'parseCompanionLifeJSONCandidate',
    'unwrapCompanionLifeObject', 'parseCompanionLifeResponsePayload',
    'mergeCompanionLifeBuildWithStarter',
    'modelOutputModalities', 'normalizeTTSVoiceOptions', 'fallbackTTSVoicesForModel',
    'normalizeCompanionTTSProviderOptions', 'companionTTSCapabilities',
    'ttsResponseFormatForModel', 'buildCompanionTTSRequest',
    'pcmToWavArrayBuffer', 'pcm16ToWavArrayBuffer', 'sniffTTSAudioFormat', 'prepareTTSAudioBlob',
    'ttsErrorMessageFromText', 'requiredTTSFormatFromError',
    'companionBuilderSystemPrompt',
    'livingClamp', 'livingId', 'isPlainObject', 'safeJsonClone',
    'requirePlainObject', 'requireString', 'requireSafeId', 'requireArray',
    'validateCompanionData', 'validateCompanionTimelineStoreData', 'validateCompanionArchiveData',
    'buildCompanionShareData', 'buildCompanionArchivePayload', 'companionArchiveFileName', 'restoreCompanionArchive',
    'COMPANION_SHORT_TERM_LIMIT', 'extractCompanionToolCalls', 'extractCompanionEmbeddedToolCalls',
    'normalizeCompanionEmbeddedToolValue', 'safeParseJSONRepair',
    'COMPANION_TOOLS', 'COMPANION_WEB_SEARCH_TOOL', 'companionToolsFor',
    'COMPANION_IMAGE_PARAMETER_DEFS',
    'COMPANION_MCP_PROMPT_KEYS', 'COMPANION_MCP_REFERENCE_KEYS', 'HORDE_MCP_PROVIDERS',
    'apiBase', 'apiAuthKey', 'authHeaders', 'isLocalProvider',
    'isGPTProtoProvider', 'isOpenRouterProvider',
    'companionCallPlan', 'dirtyJSONRepair'
], context);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const HOUR = 60 * 60 * 1000;

function freshCompanion(overrides) {
    return context.normalizeCompanion({ name: 'Bree', appearance: 'auburn hair, freckles',
        personality: 'warm but guarded', sleepArchetype: 'normal', ...overrides });
}

// --- normalization / repair --------------------------------------------------

test('a blank companion gets every field a downstream function assumes', () => {
    const c = context.normalizeCompanion({});
    assert(c.id && c.name === '' && c.mood && c.moodBaseline && c.memory && Array.isArray(c.trauma));
    assert.equal(c.mood.label, 'content');
    assert.equal(c.sleepArchetype, 'normal');
    assert.equal(c.startingRelationship, 0);
    assert.equal(c.mood.relationship, 0);
    assert.equal(c.allowPhotos, true);
    assert.equal(c.photoCapturePolicy, 'auto');
    assert.equal(c.allowVoiceNotes, true);
    assert.equal(c.lifeBuilderModel, '');
    assert(c.relationshipDynamics && Array.isArray(c.lifeEvents) && Array.isArray(c.commitments));
    assert(c.lifeProfile && c.lifeRuntime && Array.isArray(c.lifeProfile.weeklySchedule));
    assert.deepEqual(Object.keys(c.usage).sort(), ['callsCompleted', 'photosGenerated', 'textTurns', 'voiceNotesGenerated']);
});

test('a photo while home alone resolves to a physically held front camera', () => {
    const now = Date.now();
    const c = freshCompanion({ photoCapturePolicy: 'auto' });
    c.lifeRuntime.temporarySituation = {
        activity: 'relaxing home alone', placeLabel: 'her apartment',
        withNames: [], availability: 'available',
        startedAt: now - 1000, endsAt: now + HOUR
    };
    const plan = context.companionPhotoCapturePlan(c, 'a casual photo on the sofa', now);
    assert.equal(plan.type, 'front_camera_selfie');
    assert.match(plan.instruction, /no invisible photographer/i);
});

test('an established mirror produces a mirror selfie instead of an observer shot', () => {
    const c = freshCompanion({ photoCapturePolicy: 'auto' });
    const plan = context.companionPhotoCapturePlan(c, 'mirror selfie showing my outfit', Date.now());
    assert.equal(plan.type, 'mirror_selfie');
    assert.match(plan.instruction, /phone is visible in the reflection/i);
});

test('another photographer is allowed only when company is established', () => {
    const now = Date.now();
    const c = freshCompanion({ photoCapturePolicy: 'scene' });
    c.lifeRuntime.temporarySituation = {
        activity: 'having lunch with Maya', placeLabel: 'a cafe',
        withNames: ['Maya'], availability: 'available',
        startedAt: now - 1000, endsAt: now + HOUR
    };
    const social = context.companionPhotoCapturePlan(c, 'a candid taken by Maya across the table', now, {
        captureType: 'taken_by_someone', photographer: 'Maya'
    });
    assert.equal(social.type, 'taken_by_someone');
    assert.equal(social.photographer, 'Maya');

    c.lifeRuntime.temporarySituation.withNames = [];
    c.lifeRuntime.temporarySituation.activity = 'having lunch alone';
    const alone = context.companionPhotoCapturePlan(c, 'a candid taken by Maya across the table', now, {
        captureType: 'taken_by_someone', photographer: 'Maya'
    });
    assert.notEqual(alone.type, 'taken_by_someone');
});

test('wide candid framing while alone uses a propped phone and prompt carries that provenance', () => {
    const now = Date.now();
    const c = freshCompanion({ photoCapturePolicy: 'auto' });
    c.lifeRuntime.temporarySituation = {
        activity: 'home alone', placeLabel: 'bedroom',
        withNames: [], availability: 'available',
        startedAt: now - 1000, endsAt: now + HOUR
    };
    const prompt = context.buildCompanionPhotoPrompt(c, 'wide candid of me walking across the room with both hands visible', { atMs: now });
    assert.match(prompt, /Camera provenance — Timer \/ propped phone/);
    assert.match(prompt, /Never invent an unseen friend, photographer or group/);
});

test('self-capture policy prevents a present friend from becoming photographer', () => {
    const now = Date.now();
    const c = freshCompanion({ photoCapturePolicy: 'self_capture' });
    c.lifeRuntime.temporarySituation = {
        activity: 'at lunch with Maya', placeLabel: 'a cafe',
        withNames: ['Maya'], availability: 'available',
        startedAt: now - 1000, endsAt: now + HOUR
    };
    const plan = context.companionPhotoCapturePlan(c, 'a candid taken by Maya', now, {
        captureType: 'taken_by_someone', photographer: 'Maya'
    });
    assert.notEqual(plan.type, 'taken_by_someone');
});

test('timeline runtime snapshots isolate relationship, memories and private life', () => {
    const c = freshCompanion({ startingRelationship: 12 });
    c.mood.relationship = 44;
    c.relationshipDynamics.trust = 61;
    c.memory.longTerm.push(context.normalizeCompanionMemoryEntry({ text: 'shared secret', weight: 80 }));
    c.lifeEvents.push(context.normalizeCompanionLifeEvent({ text: 'started a new job' }));
    c.lifeRuntime.temporarySituation = { activity: 'waiting for a locksmith', startedAt: 1000, endsAt: 2000 };
    const runtime = context.captureCompanionRuntime(c);
    const timeline = context.normalizeCompanionTimeline({
        id: 'timeline-a', name: 'A', messages: [{ role: 'user', text: 'hey' }], runtime
    }, c);
    c.mood.relationship = -20;
    c.memory.longTerm.length = 0;
    assert.equal(timeline.runtime.mood.relationship, 44);
    assert.equal(timeline.runtime.relationshipDynamics.trust, 61);
    assert.equal(timeline.runtime.memory.longTerm[0].text, 'shared secret');
    assert.equal(timeline.runtime.lifeEvents[0].text, 'started a new job');
    assert.equal(timeline.runtime.lifeRuntime.temporarySituation.activity, 'waiting for a locksmith');
    assert.equal(timeline.messages[0].text, 'hey');
});

test('a fresh timeline resets lived state but keeps the authored starting relationship', () => {
    const c = freshCompanion({ startingRelationship: -18 });
    c.mood.relationship = 70;
    c.commitments.push(context.normalizeCompanionCommitment({ text: 'send a photo' }));
    const fresh = context.freshCompanionRuntime(c, 1234);
    assert.equal(fresh.mood.relationship, -18);
    assert.equal(fresh.relationshipDynamics.resentment, 18);
    assert.deepEqual(Array.from(fresh.commitments), []);
    assert.deepEqual(Array.from(fresh.lifeEvents), []);
});

test('canonical human commits create life events and scheduled follow-through', () => {
    const c = freshCompanion();
    context.applyCompanionTurnCommit(c, {
        life_event: 'Had a difficult meeting at work.',
        life_state: { outfit: 'navy work shirt', location_detail: 'office stairwell' },
        commitments: [{ action: 'create', text: 'send a photo after work', medium: 'photo', due_in_minutes: 30 }]
    }, 1000, 'turn');
    assert.equal(c.lifeEvents[0].text, 'Had a difficult meeting at work.');
    assert.equal(c.currentOutfit, 'navy work shirt');
    assert.equal(c.currentLocationDetail, 'office stairwell');
    assert.equal(c.commitments[0].medium, 'photo');
    assert.equal(c.commitments[0].dueAt, 1000 + 30 * 60_000);
});

test('paid media opt-outs survive normalization', () => {
    const c = freshCompanion({ allowPhotos: false, allowVoiceNotes: false });
    assert.equal(c.allowPhotos, false);
    assert.equal(c.allowVoiceNotes, false);
});

test('MCP image settings survive normalization without becoming the default source', () => {
    const base = freshCompanion();
    assert.equal(base.imageSource, 'provider');
    const mcp = freshCompanion({
        imageSource: 'higgsfield',
        mcpImageTool: 'create_image',
        mcpImageArguments: { aspect_ratio: '9:16', count: 1 }
    });
    assert.equal(mcp.imageSource, 'higgsfield');
    assert.equal(mcp.mcpImageTool, 'create_image');
    assert.equal(JSON.stringify(mcp.mcpImageArguments), '{"aspect_ratio":"9:16","count":1}');
});

test('conversation and photo providers are independently persisted and resolved', () => {
    context.state.globalSettings.apiProvider = 'openrouter';
    context.state.gptprotoApiKey = 'gptproto-key';
    context.state.apiKey = 'openrouter-key';
    const c = freshCompanion({ textProvider: 'openrouter', imageSource: 'gptproto' });
    assert.equal(c.textProvider, 'openrouter');
    assert.equal(c.imageSource, 'gptproto');
    assert.equal(context.companionTextProviderId(c), 'openrouter');
    assert.equal(context.companionImageProviderId(c), 'gptproto');
    assert.equal(context.providerApiBase(context.companionImageProviderId(c)), 'https://gptproto.com/v1');
    assert.equal(context.providerAuthHeaders('gptproto').Authorization, 'Bearer gptproto-key');
});

test('an explicit GPTProto photo source uses GPTProto reference shape while text stays OpenRouter', () => {
    context.state.globalSettings.apiProvider = 'openrouter';
    const c = freshCompanion({
        textProvider: 'openrouter',
        imageSource: 'gptproto',
        imageModel: 'gpt-image-1',
        basePhoto: 'data:image/jpeg;base64,identity'
    });
    const request = context.buildCompanionImageRequest(c, 'a kitchen selfie', {
        providerId: context.companionImageProviderId(c)
    });
    assert.equal(request.image, 'data:image/jpeg;base64,identity');
    assert.equal(request.input_references, undefined);
    assert.equal(context.companionTextProviderId(c), 'openrouter');
});

test('MCP discovery ranks image generation above video and unrelated tools', () => {
    const tools = context.companionMcpImageTools([
        { name: 'generate_image', description: 'Create a photo', inputSchema: { properties: { prompt: { type: 'string' } } } },
        { name: 'generate_video', description: 'Create a video', inputSchema: { properties: { prompt: { type: 'string' } } } },
        { name: 'account_status', description: 'Show remaining credits', inputSchema: { properties: {} } }
    ]);
    assert.equal(tools[0].name, 'generate_image');
    assert(!tools.some(tool => tool.name === 'account_status'));
});

test('MCP generation maps the full scene and identity reference to the advertised schema', () => {
    const c = freshCompanion({
        imageSource: 'higgsfield',
        basePhoto: 'data:image/jpeg;base64,identity',
        mcpImageTool: 'create_image',
        mcpImageArguments: { aspect_ratio: '9:16' }
    });
    context.companionMcpToolCatalog.higgsfield = [{
        name: 'create_image',
        inputSchema: {
            required: ['prompt', 'mode'],
            properties: {
                prompt: { type: 'string' },
                reference_images: { type: 'array' },
                aspect_ratio: { type: 'string' },
                mode: { type: 'string', enum: ['standard', 'turbo'] }
            }
        }
    }];
    const request = context.companionMcpGenerationArguments(c, 'a casual kitchen selfie', { atMs: Date.now() });
    assert.match(request.args.prompt, /casual kitchen selfie/i);
    assert.equal(JSON.stringify(request.args.reference_images), '["data:image/jpeg;base64,identity"]');
    assert.equal(request.args.aspect_ratio, '9:16');
    assert.equal(request.args.mode, 'standard');
});

test('a shareable Virtual Human archive keeps authorship but strips every lived timeline and runtime state', () => {
    const source = freshCompanion({
        id: 'companion_export_source',
        name: 'Bree Archive',
        personality: 'warm but guarded',
        profilePhoto: 'data:image/jpeg;base64,profile',
        basePhoto: 'data:image/jpeg;base64,reference',
        lifeProfile: context.buildProceduralCompanionLifeProfile({
            id: 'companion_export_source',
            name: 'Bree Archive',
            occupation: 'designer',
            locationCountryCode: 'GB'
        }, 1000)
    });
    source.mood.relationship = 73;
    source.relationshipDynamics.trust = 88;
    source.lifeEvents.push(context.normalizeCompanionLifeEvent({ text: 'Had a private argument' }));
    source.commitments.push(context.normalizeCompanionCommitment({ text: 'Send a private photo' }));
    source.trauma.push(context.normalizeCompanionTrauma({ label: 'A private rupture' }));
    source.memory.longTerm.push(context.normalizeCompanionMemoryEntry({ text: 'Player shared a secret' }));
    source.currentOutfit = 'private chat outfit';
    source.currentLocationDetail = 'private chat location';
    source.usage.photosGenerated = 14;
    const session = context.normalizeCompanionTimeline({
        id: 'timeline_original',
        name: 'Slow burn',
        experience: context.companionExperiencePreset('instant'),
        messages: [{
            role: 'companion', type: 'photo', text: 'look at this',
            photo: 'data:image/jpeg;base64,generated', timestamp: 2000
        }],
        runtime: context.captureCompanionRuntime(source)
    }, source);
    context.state.companions = [source];
    context.state.companionThreads = { [source.id]: session.messages };
    context.state.companionTimelines = {
        [source.id]: { activeSessionId: session.id, sessions: [session] }
    };
    const payload = context.buildCompanionArchivePayload(source, 4000);
    const imported = context.restoreCompanionArchive(payload, 5000);
    const importedStore = context.state.companionTimelines[imported.id];
    assert.equal(payload._format, 'horde-studio-virtual-human');
    assert.equal(payload._version, 2);
    assert.equal(payload._kind, 'character');
    assert.equal(payload.timelines, undefined);
    assert(!JSON.stringify(payload).includes('look at this'));
    assert(!JSON.stringify(payload).includes('data:image/jpeg;base64,generated'));
    assert(!JSON.stringify(payload).includes('Player shared a secret'));
    assert.notEqual(imported.id, source.id);
    assert.equal(imported.name, source.name);
    assert.equal(imported.profilePhoto, source.profilePhoto);
    assert.equal(imported.basePhoto, source.basePhoto);
    assert(imported.lifeProfile.weeklySchedule.length > 0);
    assert.equal(importedStore.sessions.length, 1);
    assert.equal(importedStore.sessions[0].name, 'Main Timeline');
    assert.deepEqual(Array.from(importedStore.sessions[0].messages), []);
    assert.equal(imported.mood.relationship, imported.startingRelationship);
    assert.equal(imported.relationshipDynamics.trust, Math.max(0, imported.startingRelationship));
    assert.deepEqual(Array.from(imported.lifeEvents), []);
    assert.deepEqual(Array.from(imported.commitments), []);
    assert.deepEqual(Array.from(imported.trauma), []);
    assert.deepEqual(Array.from(imported.memory.longTerm), []);
    assert.equal(imported.currentOutfit, '');
    assert.equal(imported.currentLocationDetail, '');
    assert.equal(imported.usage.photosGenerated, 0);
    assert.equal(context.state.companions.length, 2);
});

test('legacy version-one personal archives still restore their timeline', () => {
    const source = freshCompanion({ id: 'legacy_source', name: 'Legacy Human' });
    const legacySession = context.normalizeCompanionTimeline({
        id: 'legacy_timeline', name: 'Old timeline',
        messages: [{ role: 'user', type: 'text', text: 'private history', timestamp: 1000 }],
        runtime: context.captureCompanionRuntime(source)
    }, source);
    const imported = context.restoreCompanionArchive({
        _format: 'horde-studio-virtual-human',
        _version: 1,
        companion: source,
        timelines: { activeSessionId: legacySession.id, sessions: [legacySession] }
    }, 6000);
    const store = context.state.companionTimelines[imported.id];
    assert.equal(store.sessions[0].name, 'Old timeline');
    assert.equal(store.sessions[0].messages[0].text, 'private history');
});

test('Virtual Human archive validation rejects unrelated JSON and unsafe archive shapes', () => {
    assert.throws(
        () => context.validateCompanionArchiveData({ _format: 'horde-studio-backup', _version: 1 }),
        /Not a Horde Studio Virtual Human archive/
    );
    assert.throws(
        () => context.validateCompanionArchiveData({
            _format: 'horde-studio-virtual-human',
            _version: 1,
            companion: { name: 'Bad', lifeProfile: { weeklySchedule: 'not a list' } },
            timelines: { sessions: [] }
        }),
        /must be a list/
    );
});

test('Virtual Human archive filenames are portable and use the dedicated extension', () => {
    assert.equal(context.companionArchiveFileName('Jane / Test Person'), 'Jane_Test_Person.horde_human');
    assert.equal(context.companionArchiveFileName(''), 'virtual_human.horde_human');
});

test('full backups include Virtual Humans and their timeline stores', () => {
    const source = functionSource('exportFullBackup');
    assert(source.includes('companions: state.companions'));
    assert(source.includes('companionTimelines: state.companionTimelines'));
    assert(source.includes('companionThreads: state.companionThreads'));
});

test('legacy photo data migrates into a display profile without losing its generation reference', () => {
    const c = context.normalizeCompanion({ basePhoto: 'data:image/png;base64,old' });
    assert.equal(c.profilePhoto, c.basePhoto);
});

test('an explicit display profile remains separate from the generation reference', () => {
    const c = context.normalizeCompanion({
        profilePhoto: 'data:image/png;base64,profile',
        basePhoto: 'data:image/png;base64,reference'
    });
    assert.notEqual(c.profilePhoto, c.basePhoto);
});

test('out-of-range mood and baseline figures are clamped', () => {
    const c = context.normalizeCompanion({ mood: { valence: 500, arousal: -999 }, moodBaseline: { valence: -500 } });
    assert.equal(c.mood.valence, 100);
    assert.equal(c.mood.arousal, -100);
    assert.equal(c.moodBaseline.valence, -100);
});

test('an invalid sleep archetype or mood label falls back safely', () => {
    const c = context.normalizeCompanion({ sleepArchetype: 'vampire', mood: { label: 'unhinged' } });
    assert.equal(c.sleepArchetype, 'normal');
    assert.equal(c.mood.label, 'content');
});

test('location and timezone authoring offers searchable valid choices', () => {
    const locations = context.companionLocationOptions();
    const manchester = locations.find(option => option.label === 'Manchester, UK');
    assert.equal(manchester.timezone, 'Europe/London');
    assert.equal(context.isValidCompanionTimeZone(manchester.timezone), true);
    assert.equal(context.isValidCompanionTimeZone('Asia/Karachi'), true);
    assert.equal(context.isValidCompanionTimeZone('Not/A_Timezone'), false);
    assert(context.companionTimeZoneOptions().some(option => option.value === 'Asia/Karachi'));
});

test('fictional locations use their configured UTC offset as a real clock', () => {
    const c = context.normalizeCompanion({
        locationMode: 'custom',
        locationLabel: 'Aetherfall',
        timezone: 'Moonwake Standard',
        timezoneOffsetMinutes: 330
    });
    assert.equal(c.locationMode, 'custom');
    assert.equal(context.companionUsesFixedTimezoneOffset(c), true);
    assert.equal(context.formatCompanionUtcOffset(c.timezoneOffsetMinutes), 'UTC+05:30');
    const local = context.companionLocalDateInfo(c, Date.UTC(2026, 0, 1, 20, 0));
    assert.equal(local.hour, 1);
    assert.equal(local.dateKey, '2026-01-02');
});

test('the deeper human dossier is normalized and reaches the prompt', () => {
    const c = freshCompanion({
        age: 31, pronouns: 'she/her', occupation: 'architect under a brutal deadline',
        contradictions: 'claims to want stability but chooses chaos',
        relationshipStyle: 'withdraws during conflict, then repairs with practical care',
        routine: 'walks home while sending voice notes'
    });
    const prompt = context.buildCompanionSystemPrompt(c, [], new Date(2026, 0, 15, 15, 0).getTime());
    ['31', 'architect', 'chooses chaos', 'practical care', 'walks home'].forEach(detail =>
        assert(prompt.includes(detail), `dossier detail "${detail}" did not reach the simulation prompt`));
});

test('starting relationship context is preserved separately from the evolving live score', () => {
    const c = freshCompanion({
        startingRelationship: 45,
        relationshipContext: 'Former coworkers who covered for each other during a disastrous launch.',
        mood: { relationship: -22, label: 'hurt' }
    });
    const prompt = context.buildCompanionSystemPrompt(c, [], new Date(2026, 0, 15, 15, 0).getTime());
    assert.equal(c.startingRelationship, 45);
    assert.equal(c.mood.relationship, -22);
    assert(prompt.includes('Former coworkers'));
    assert(prompt.includes('(45/100)'));
    assert(prompt.includes('(-22/100)'));
    assert(prompt.includes('may deepen'));
    assert(prompt.includes('end entirely'));
});

test('call prompting explicitly changes the channel and never invents the caller', () => {
    const c = freshCompanion();
    const prompt = context.buildCompanionSystemPrompt(c, [], new Date(2026, 0, 15, 15, 0).getTime(), { channel: 'call' });
    assert(prompt.includes('on a live phone call'));
    assert(prompt.includes('THIS IS A LIVE VOICE CALL'));
    assert(prompt.includes('Never narrate actions'));
    assert(prompt.includes('invent the caller'));
});

test('malformed input of every shape does not throw', () => {
    [null, undefined, 42, 'x', [], { trauma: 'nope' }, { memory: null }, { mood: null }].forEach(raw => {
        assert.doesNotThrow(() => context.normalizeCompanion(raw), `threw on ${JSON.stringify(raw)}`);
    });
    assert.doesNotThrow(() => context.normalizeCompanionAndThread(null, 'nope'));
});

// --- deterministic randomness ------------------------------------------------

test('the same seed always rolls the same number', () => {
    assert.equal(context.companionSeededRoll('a|b|c'), context.companionSeededRoll('a|b|c'));
});

test('different seeds roll differently, and the range is [0,1)', () => {
    const a = context.companionSeededRoll('seed-one');
    const b = context.companionSeededRoll('seed-two');
    assert(a !== b, `two different seeds rolled the same value: ${a}`);
    [a, b].forEach(v => { assert(v >= 0 && v < 1, `${v} is out of range`); });
});

// --- mood: decay and the tool-call update ------------------------------------

test('no elapsed time means no decay', () => {
    const c = freshCompanion({ mood: { valence: 80, arousal: 50, lastUpdated: 1000 } });
    context.decayCompanionMood(c, 1000);
    assert.equal(c.mood.valence, 80);
    assert.equal(c.mood.arousal, 50);
});

test('mood settles toward baseline as real time passes', () => {
    const c = freshCompanion({ moodBaseline: { valence: 20, arousal: 0 }, mood: { valence: 90, arousal: 60, lastUpdated: 0 } });
    context.decayCompanionMood(c, 4 * HOUR);   // one half-life
    assert(c.mood.valence < 90 && c.mood.valence > 20, `did not settle: ${c.mood.valence}`);
    assert(Math.abs(c.mood.valence - 55) <= 3, `expected roughly halfway to baseline, got ${c.mood.valence}`);
});

test('decay never overshoots past baseline', () => {
    const c = freshCompanion({ moodBaseline: { valence: 20, arousal: 0 }, mood: { valence: 90, arousal: 60, lastUpdated: 0 } });
    context.decayCompanionMood(c, 1000 * HOUR);   // effectively forever
    assert.equal(c.mood.valence, 20);
    assert.equal(c.mood.arousal, 0);
});

test('a large gap does not decay a mood that was already at baseline into something else', () => {
    const c = freshCompanion({ moodBaseline: { valence: 20, arousal: 0 }, mood: { valence: 20, arousal: 0, lastUpdated: 0 } });
    context.decayCompanionMood(c, 100 * HOUR);
    assert.equal(c.mood.valence, 20);
    assert.equal(c.mood.arousal, 0);
});

test('applying a mood update decays first, then adds the delta on top', () => {
    const c = freshCompanion({ moodBaseline: { valence: 0, arousal: 0 }, mood: { valence: 100, arousal: 0, lastUpdated: 0 } });
    // At one half-life, valence has settled to 50 before the +10 lands.
    context.applyCompanionMoodUpdate(c, { valence_change: 10, arousal_change: 0, mood_label: 'content', relationship_change: 0 }, 4 * HOUR);
    assert(Math.abs(c.mood.valence - 60) <= 3, `expected ~60, got ${c.mood.valence}`);
});

test('mood deltas are clamped so one exchange cannot swing the whole range', () => {
    const c = freshCompanion({ mood: { valence: 0, lastUpdated: 0 } });
    context.applyCompanionMoodUpdate(c, { valence_change: 500, arousal_change: 0, mood_label: 'happy', relationship_change: 0 }, 0);
    assert(c.mood.valence <= 40, `an unclamped delta reached ${c.mood.valence}`);
});

test('the final value still respects the -100..100 bound', () => {
    const c = freshCompanion({ mood: { valence: 90, lastUpdated: 0 } });
    context.applyCompanionMoodUpdate(c, { valence_change: 40, arousal_change: 0, mood_label: 'happy', relationship_change: 0 }, 0);
    assert.equal(c.mood.valence, 100);
});

test('a mood label only changes when the tool call actually sends one', () => {
    const c = freshCompanion({ mood: { label: 'sad', lastUpdated: 0 } });
    context.applyCompanionMoodUpdate(c, { valence_change: 0, arousal_change: 0, mood_label: undefined, relationship_change: 0 }, 0);
    assert.equal(c.mood.label, 'sad', 'an absent label reset to a default instead of being left alone');
});

test('an invalid mood label is refused rather than accepted', () => {
    const c = freshCompanion({ mood: { label: 'sad', lastUpdated: 0 } });
    context.applyCompanionMoodUpdate(c, { valence_change: 0, arousal_change: 0, mood_label: 'ecstatic-rage', relationship_change: 0 }, 0);
    assert.equal(c.mood.label, 'sad');
});

test('relationship moves independently and is clamped', () => {
    const c = freshCompanion({ mood: { relationship: 90, lastUpdated: 0 } });
    context.applyCompanionMoodUpdate(c, { valence_change: 0, arousal_change: 0, mood_label: 'happy', relationship_change: 50 }, 0);
    assert.equal(c.mood.relationship, 100);
});

test('trauma is recorded and does not decay the way mood does', () => {
    const c = freshCompanion({ mood: { lastUpdated: 0 } });
    context.applyCompanionMoodUpdate(c, {
        valence_change: -30, arousal_change: 20, mood_label: 'hurt', relationship_change: -10,
        trauma_add: { label: 'was forgotten on their birthday', severity: 70 }
    }, 0);
    assert.equal(c.trauma.length, 1);
    assert.equal(c.trauma[0].label, 'was forgotten on their birthday');
    context.decayCompanionMood(c, 1000 * HOUR);
    assert.equal(c.trauma[0].severity, 70, 'trauma severity decayed, but trauma is meant to be durable');
});

test('trauma is capped so it cannot grow forever', () => {
    const c = freshCompanion({ mood: { lastUpdated: 0 } });
    for (let i = 0; i < 30; i++) {
        context.applyCompanionMoodUpdate(c, {
            valence_change: 0, arousal_change: 0, mood_label: 'hurt', relationship_change: 0,
            trauma_add: { label: `incident ${i}`, severity: 10 }
        }, i);
    }
    assert(c.trauma.length <= 20, `trauma grew to ${c.trauma.length}`);
});

test('an ordinary exchange with no trauma_add adds nothing', () => {
    const c = freshCompanion({ mood: { lastUpdated: 0 } });
    context.applyCompanionMoodUpdate(c, { valence_change: 5, arousal_change: 0, mood_label: 'happy', relationship_change: 0 }, 0);
    assert.equal(c.trauma.length, 0);
});

// --- simulated life -----------------------------------------------------------

test('each sleep archetype actually sleeps at the hours it claims to', () => {
    assert.equal(context.isCompanionAsleep('normal', 3), true);
    assert.equal(context.isCompanionAsleep('normal', 12), false);
    assert.equal(context.isCompanionAsleep('early_riser', 23), true);   // wraps past midnight
    assert.equal(context.isCompanionAsleep('early_riser', 12), false);
    assert.equal(context.isCompanionAsleep('night_owl', 5), true);
    assert.equal(context.isCompanionAsleep('night_owl', 14), false);
});

test('life state is a pure function of the timestamp — replaying gives the same answer', () => {
    const c = freshCompanion();
    const at = new Date(2026, 0, 15, 14, 30).getTime();   // a Thursday afternoon
    const first = context.companionLifeState(c, at);
    const second = context.companionLifeState(c, at);
    assert.deepEqual(first, second, 'the same instant produced two different lives');
});

test('a companion is asleep at 3am regardless of what else is true about them', () => {
    const c = freshCompanion({ sleepArchetype: 'normal' });
    const at = new Date(2026, 0, 15, 3, 0).getTime();
    assert.equal(context.companionLifeState(c, at).availability, 'asleep');
});

test('two different companions can have different lives at the same instant', () => {
    // Not a hard requirement that they always differ, but the seed must
    // include the companion id or every contact would live an identical life.
    const at = new Date(2026, 0, 15, 15, 0).getTime();
    const lives = new Set();
    for (let i = 0; i < 12; i++) {
        lives.add(context.companionLifeState(freshCompanion({ id: `c_${i}` }), at).activity);
    }
    assert(lives.size > 1, 'every companion is doing exactly the same thing at once');
});

test('malformed companions do not crash the life tick', () => {
    assert.doesNotThrow(() => context.companionLifeState({ id: 'x', sleepArchetype: 'nope' }, Date.now()));
});

test('authored routine changes the weighted life pool and weekends are not generic workdays', () => {
    const remoteStudent = freshCompanion({ occupation: 'remote university student', routine: 'gym most afternoons' });
    const weekdayPool = Array.from(context.companionActivityPool(remoteStudent, new Date(2026, 0, 15, 12, 0)));
    assert(weekdayPool.filter(item => item === 'studying').length >= 3);
    assert(!weekdayPool.includes('commuting'));
    const weekendPool = Array.from(context.companionActivityPool(freshCompanion(), new Date(2026, 0, 17, 12, 0)));
    assert(!weekendPool.includes('work'));
});

test('an initialized weekly schedule becomes authoritative situation state', () => {
    const mondayTen = Date.UTC(2026, 0, 5, 10, 0);
    const c = freshCompanion({
        locationMode: 'custom', timezoneOffsetMinutes: 0, locationLabel: 'Aetherfall',
        lifeProfile: {
            initializedAt: mondayTen - 1000,
            seed: 'schedule-test',
            places: [{ id: 'studio', label: 'North Glass Studio', kind: 'work' }],
            wardrobe: [{ id: 'work-look', label: 'work look', context: 'work', items: 'charcoal trousers and a worn blue shirt' }],
            weeklySchedule: [{
                id: 'monday-work', days: [1], startMinute: 540, endMinute: 1020,
                activity: 'reviewing a difficult client revision', placeId: 'studio',
                availability: 'busy', flexibility: 'fixed', outfitContext: 'work'
            }]
        }
    });
    const situation = context.companionSituationAt(c, mondayTen);
    assert.equal(situation.source, 'schedule');
    assert.equal(situation.activity, 'reviewing a difficult client revision');
    assert.equal(situation.placeLabel, 'North Glass Studio');
    assert.match(situation.outfit, /charcoal trousers/);
    assert.equal(situation.endsAt, Date.UTC(2026, 0, 5, 17, 0));
});

test('Active Life recovers JSON wrapped in ordinary model prose and markdown', () => {
    const payload = {
        choices: [{
            message: {
                content: 'Here is the life I designed:\n```json\n{"fashionSense":"careful vintage layers","weeklySchedule":[{"days":[1],"startMinute":540,"endMinute":600,"activity":"coffee","placeId":"home","availability":"available"}]}\n```'
            }
        }]
    };
    const parsed = context.parseCompanionLifeResponsePayload(payload);
    assert.equal(parsed.fashionSense, 'careful vintage layers');
    assert.equal(parsed.weeklySchedule[0].activity, 'coffee');
});

test('Active Life accepts structured content parts and tool-call arguments', () => {
    const fromParts = context.parseCompanionLifeResponsePayload({
        choices: [{ message: { content: [{ type: 'text', text: '{"places":[{"id":"home","label":"Home"}]}' }] } }]
    });
    assert.equal(fromParts.places[0].id, 'home');
    const fromTool = context.parseCompanionLifeResponsePayload({
        choices: [{ message: { tool_calls: [{ function: { arguments: '{"wardrobe":[{"id":"look","items":"blue coat"}]}' } }] } }]
    });
    assert.equal(fromTool.wardrobe[0].items, 'blue coat');
});

test('Active Life repairs truncated JSON and unwraps nested provider envelopes', () => {
    const parsed = context.parseCompanionLifeResponsePayload({
        choices: [{ message: { content: '{"result":{"fashionSense":"minimal","weeklySchedule":[{"days":[2],"activity":"work"' } }]
    });
    assert.equal(parsed.fashionSense, 'minimal');
    assert.equal(parsed.weeklySchedule[0].activity, 'work');
});

test('partial Active Life output keeps model details and fills missing editable sections locally', () => {
    const companion = freshCompanion({ occupation: 'designer', locationLabel: 'Karachi' });
    const merged = context.mergeCompanionLifeBuildWithStarter(companion, {
        fashionSense: 'bright tailoring',
        places: [{ id: 'studio', label: 'Design studio' }]
    }, 1000);
    assert.equal(merged.fashionSense, 'bright tailoring');
    assert.equal(merged.places[0].id, 'studio');
    assert(merged.weeklySchedule.length > 0);
    assert(merged.wardrobe.length > 0);
});

test('manual Active Life authoring is a local starter that opens the editor without calling generation', () => {
    const setup = functionSource('setupCompanionsLogic');
    const marker = "document.getElementById('cs-start-life-manual-btn').onclick";
    const start = setup.indexOf(marker);
    const end = setup.indexOf("document.getElementById('cs-initialize-life-btn').onclick", start);
    assert(start >= 0 && end > start);
    const handler = setup.slice(start, end);
    assert(handler.includes('buildProceduralCompanionLifeProfile'));
    assert(handler.includes('renderCompanionLifeEditor'));
    assert(!handler.includes('buildCompanionLifeWithAI'));
    assert(!handler.includes('fetch('));
});

test('structured busy blocks defer replies until a natural break', () => {
    const mondayTen = Date.UTC(2026, 0, 5, 10, 0);
    const c = freshCompanion({
        locationMode: 'custom', timezoneOffsetMinutes: 0,
        lifeProfile: {
            initializedAt: mondayTen - 1000,
            seed: 'reply-break',
            weeklySchedule: [{
                days: [1], startMinute: 540, endMinute: 720,
                activity: 'in a meeting', availability: 'busy', flexibility: 'fixed'
            }]
        }
    });
    const message = context.normalizeCompanionMessage({ id: 'meeting-msg', role: 'user', text: 'hey', timestamp: mondayTen });
    const plan = context.companionResponsePlan(c, message, mondayTen);
    if (plan.willReply) assert(plan.replyDueAt >= Date.UTC(2026, 0, 5, 12, 0));
});

test('wildcard catch-up is seeded, bounded and never duplicates a day', () => {
    const start = Date.UTC(2026, 0, 1, 12, 0);
    const c = freshCompanion({
        locationMode: 'custom', timezoneOffsetMinutes: 0,
        lifeWildcardsEnabled: true,
        lifeProfile: {
            initializedAt: start - 1000,
            seed: 'wildcard-test',
            wildcardDeck: [{
                id: 'locked-out', label: 'got locked out', category: 'inconvenience',
                weight: 1, minGapDays: 1, durationMinutes: 60, availability: 'busy'
            }]
        },
        lifeRuntime: { lastSimulatedAt: start }
    });
    for (let day = 1; day <= 45; day++) context.advanceCompanionLife(c, start + day * 86400000);
    const ids = c.lifeEvents.filter(event => event.id.startsWith('vh_wildcard_')).map(event => event.id);
    assert(ids.length > 0);
    assert.equal(new Set(ids).size, ids.length);
    assert(c.lifeRuntime.processedWildcardDays.length <= 45);
});

test('sleep mechanically defers reading and replying until after wake time', () => {
    const now = new Date(2026, 0, 15, 3, 0).getTime();
    const c = freshCompanion({ sleepArchetype: 'normal' });
    const message = context.normalizeCompanionMessage({ id: 'sleep-msg', role: 'user', text: 'hey', timestamp: now });
    const plan = context.companionResponsePlan(c, message, now);
    assert.equal(plan.life.availability, 'asleep');
    assert(plan.readAt >= new Date(2026, 0, 15, 7, 0).getTime());
    if (plan.willReply) assert(plan.replyDueAt > plan.readAt);
});

test('a busy human reads and answers later instead of replying immediately', () => {
    const now = new Date(2026, 0, 15, 12, 0).getTime();
    const c = freshCompanion();
    const message = context.normalizeCompanionMessage({ id: 'busy-msg', role: 'user', text: 'lunch?', timestamp: now });
    const plan = context.companionResponsePlan(c, message, now);
    assert.equal(plan.life.availability, 'busy');
    assert(plan.readAt >= now + 30_000);
    if (plan.willReply) assert(plan.replyDueAt >= plan.readAt + 3 * 60_000);
});

test('chat immersion defaults preserve the full simulation for existing timelines', () => {
    const experience = context.normalizeCompanionChatExperience(null);
    assert.deepEqual({ ...experience }, {
        realTimeLife: true,
        replyDelays: true,
        allowNoReply: true
    });
    assert.equal(context.companionExperienceLevel(experience), 'Full');
});

test('Instant Chat guarantees an immediate answer without consulting sleep or schedule', () => {
    const c = freshCompanion({ sleepArchetype: 'normal', mood: { label: 'angry', valence: -80 } });
    const now = new Date(2026, 0, 15, 3, 0).getTime();
    const message = context.normalizeCompanionMessage({ id: 'instant', role: 'user', text: 'hey', timestamp: now });
    const plan = context.companionResponsePlan(c, message, now, context.companionExperiencePreset('instant'));
    assert.equal(plan.life.availability, 'available');
    assert.equal(plan.deliveredAt, now);
    assert.equal(plan.readAt, now);
    assert.equal(plan.replyDueAt, now);
    assert.equal(plan.willReply, true);
});

test('Always Replies keeps real-time context but removes delay and refusal mechanics', () => {
    const c = freshCompanion({ sleepArchetype: 'normal', mood: { label: 'hurt', valence: -60 } });
    const now = new Date(2026, 0, 15, 3, 0).getTime();
    const plan = context.companionResponsePlan(
        c,
        context.normalizeCompanionMessage({ id: 'responsive', role: 'user', text: 'you there?', timestamp: now }),
        now,
        context.companionExperiencePreset('responsive')
    );
    assert.equal(plan.life.availability, 'asleep');
    assert.equal(plan.willReply, true);
    assert.equal(plan.replyDueAt, now);
});

test('turning down immersion releases an already delayed or unanswered message', () => {
    const now = 50_000;
    const timeline = {
        messages: [context.normalizeCompanionMessage({
            role: 'user', text: 'hello', timestamp: 1000, deliveryState: 'read',
            deferredReason: 'mood', awaitingReply: false, replyDueAt: 0
        })]
    };
    const previous = context.companionExperiencePreset('full');
    const next = context.companionExperiencePreset('instant');
    context.reconcileCompanionExperienceMessages(timeline, previous, next, now);
    assert.equal(timeline.messages[0].awaitingReply, true);
    assert.equal(timeline.messages[0].deliveryState, 'read');
    assert.equal(timeline.messages[0].replyDueAt, now);
});

test('pausing real-time life removes live schedule authority from the model prompt', () => {
    const c = freshCompanion({ sleepArchetype: 'normal', locationLabel: 'Manchester' });
    const prompt = context.buildCompanionSystemPrompt(c, [], new Date(2026, 0, 15, 3, 0).getTime(), {
        experience: context.companionExperiencePreset('instant')
    });
    assert(prompt.includes('REAL-TIME LIFE IS PAUSED'));
    assert(prompt.includes('Remain naturally available to chat'));
    assert(!prompt.includes('you are asleep and will not see this until you wake up'));
});

test('a sufficiently bad mood can leave a message on read with no scheduled reply', () => {
    const now = new Date(2026, 0, 15, 20, 0).getTime();
    const c = freshCompanion({ mood: { label: 'angry', valence: -80, lastUpdated: now } });
    let message;
    for (let i = 0; i < 100; i++) {
        const candidate = context.normalizeCompanionMessage({ id: `angry-${i}`, role: 'user', text: 'hello', timestamp: now });
        const roll = context.companionSeededRoll(`${c.id}|reply|${candidate.id}|${now}`);
        const reconsider = context.companionSeededRoll(`${c.id}|reconsider|${candidate.id}`);
        if (roll < 0.62 && reconsider < 0.35) { message = candidate; break; }
    }
    const plan = context.companionResponsePlan(c, message, now);
    assert.equal(plan.willReply, false);
    assert.equal(plan.replyDueAt, 0);
    assert.equal(plan.reason, 'mood');
});

test('a message left on read can be reconsidered and answered hours later', () => {
    const now = new Date(2026, 0, 15, 20, 0).getTime();
    const c = freshCompanion({ mood: { label: 'angry', valence: -80, lastUpdated: now } });
    let message;
    for (let i = 0; i < 200; i++) {
        const candidate = context.normalizeCompanionMessage({ id: `reconsider-${i}`, role: 'user', text: 'hello', timestamp: now });
        const roll = context.companionSeededRoll(`${c.id}|reply|${candidate.id}|${now}`);
        const reconsider = context.companionSeededRoll(`${c.id}|reconsider|${candidate.id}`);
        if (roll < 0.62 && reconsider >= 0.35) { message = candidate; break; }
    }
    const plan = context.companionResponsePlan(c, message, now);
    assert.equal(plan.willReply, true);
    assert.equal(plan.reason, 'mood');
    assert(plan.replyDueAt > plan.readAt + 40 * 60_000);
});

test('initiative timing is disabled by default and finite when enabled', () => {
    const now = new Date(2026, 0, 15, 12, 0).getTime();
    const quiet = freshCompanion({ initiativeMode: 'off', createdAt: now });
    assert.equal(context.companionNextInitiativeAt(quiet, [], now), Infinity);
    const active = freshCompanion({ initiativeMode: 'balanced', createdAt: now });
    const next = context.companionNextInitiativeAt(active, [], now);
    assert(next >= now + 6 * HOUR && next <= now + 18 * HOUR);
});

// --- memory consolidation ------------------------------------------------------

function textMessage(text, i) {
    return { id: `m${i}`, role: 'user', type: 'text', text, timestamp: i };
}

test('nothing is consolidated until the buffer would actually overflow', () => {
    const c = freshCompanion();
    const messages = Array.from({ length: 10 }, (_, i) => textMessage('a message with enough length to qualify easily', i));
    assert.equal(context.consolidateCompanionMemory(c, messages), 0);
    assert.equal(c.memory.longTerm.length, 0);
});

test('overflowing the buffer folds the oldest messages into memory', () => {
    const c = freshCompanion();
    const messages = Array.from({ length: 60 }, (_, i) => textMessage(`message number ${i} has plenty of content in it`, i));
    const added = context.consolidateCompanionMemory(c, messages);
    assert(added > 0, 'nothing was consolidated despite a full buffer');
    assert(c.memory.longTerm.length > 0);
    assert(c.memory.consolidatedThroughIndex > 0);
});

test('short throwaway messages are not worth remembering', () => {
    const c = freshCompanion();
    const messages = Array.from({ length: 60 }, (_, i) => textMessage(i % 2 === 0 ? 'lol' : 'a proper sentence with real content to remember', i));
    context.consolidateCompanionMemory(c, messages);
    assert(!c.memory.longTerm.some(entry => entry.text === 'lol'), '"lol" was stored as a durable memory');
});

test('consolidating twice on the same messages does nothing the second time', () => {
    const c = freshCompanion();
    const messages = Array.from({ length: 60 }, (_, i) => textMessage(`message number ${i} has plenty of content in it`, i));
    context.consolidateCompanionMemory(c, messages);
    const countAfterFirst = c.memory.longTerm.length;
    context.consolidateCompanionMemory(c, messages);
    assert.equal(c.memory.longTerm.length, countAfterFirst, 'the same messages were consolidated twice');
});

test('companion replies are never mistaken for the player\'s own memories', () => {
    const c = freshCompanion();
    const messages = Array.from({ length: 60 }, (_, i) => ({
        id: `m${i}`, role: i % 3 === 0 ? 'companion' : 'user', type: 'text',
        text: 'a message with plenty of content either way', timestamp: i
    }));
    context.consolidateCompanionMemory(c, messages);
    // Every stored memory must have come from a genuine user turn — verified
    // indirectly: the count consolidated cannot exceed the user-authored share.
    assert(c.memory.longTerm.length <= messages.filter(m => m.role === 'user').length);
});

// --- the prompt builder ---------------------------------------------------------

test('the prompt states mood in words, and names the actual current activity', () => {
    const c = freshCompanion({ mood: { valence: 80, arousal: 0, label: 'happy', lastUpdated: 0 } });
    const at = new Date(2026, 0, 15, 15, 0).getTime();   // mid-afternoon, awake
    const prompt = context.buildCompanionSystemPrompt(c, [], at);
    assert(/happy/.test(prompt), 'the mood label never reaches the prompt');
    assert(!/valence/.test(prompt), 'a raw internal field name leaked into the prompt');
});

test('an asleep companion is told so, explicitly, not left to guess', () => {
    const c = freshCompanion({ sleepArchetype: 'normal' });
    const at = new Date(2026, 0, 15, 3, 0).getTime();
    const prompt = context.buildCompanionSystemPrompt(c, [], at);
    assert(/asleep/.test(prompt), 'the model is not told its own companion is asleep');
});

test('the no-hallucination rule is explicit, not a vague plea for realism', () => {
    const prompt = context.buildCompanionSystemPrompt(freshCompanion(), [], Date.now());
    assert(/[Nn]ever invent a memory/.test(prompt), 'nothing forbids inventing facts about the player');
    assert(/commit_human_turn/.test(prompt), 'the model is never told the turn receipt is mandatory');
});

test('durable memories reach the prompt; a companion with none is told so honestly', () => {
    const withMemory = freshCompanion();
    withMemory.memory.longTerm.push(context.normalizeCompanionMemoryEntry({ text: 'their sister is named Odalys', weight: 80 }));
    const prompt = context.buildCompanionSystemPrompt(withMemory, [], Date.now());
    assert(/Odalys/.test(prompt), 'a durable memory never reached the prompt');

    const blank = context.buildCompanionSystemPrompt(freshCompanion(), [], Date.now());
    assert(/nothing durable remembered/.test(blank), 'a companion with no memories claims to remember something anyway');
});

test('the message list interleaves roles correctly and renders photos/voice as context, not raw data', () => {
    const c = freshCompanion();
    const thread = [
        { role: 'user', type: 'text', text: 'hey' },
        { role: 'companion', type: 'photo', text: 'me at the beach' },
        { role: 'user', type: 'voice', text: 'call me back' }
    ];
    const messages = context.buildCompanionMessages(c, thread, Date.now());
    assert.equal(messages[0].role, 'system');
    assert.equal(messages[1].role, 'user');
    assert.equal(messages[2].role, 'assistant');
    assert(/sent a photo/.test(messages[2].content));
    assert(/voice note/.test(messages[3].content));
});

test('the short-term window is bounded, so a long history does not balloon every request', () => {
    const c = freshCompanion();
    const thread = Array.from({ length: 500 }, (_, i) => ({ role: 'user', type: 'text', text: `msg ${i}` }));
    const messages = context.buildCompanionMessages(c, thread, Date.now());
    assert(messages.length <= context.COMPANION_SHORT_TERM_LIMIT + 1);
});

// --- texting bursts -------------------------------------------------------------

test('a short reply is one bubble', () => {
    assert.deepEqual(Array.from(context.splitCompanionReplyIntoBubbles('hey what are you up to')), ['hey what are you up to']);
});

test('paragraph breaks become separate bubbles, the way a real burst of texts arrives', () => {
    const bubbles = context.splitCompanionReplyIntoBubbles('omg hi\n\nwait were you actually there??\n\ni have so much to tell you');
    assert.equal(bubbles.length, 3);
});

test('a long single paragraph is still split, on sentence boundaries', () => {
    const long = 'a'.repeat(90) + '. ' + 'b'.repeat(90) + '. ' + 'c'.repeat(90) + '.';
    const bubbles = context.splitCompanionReplyIntoBubbles(long);
    assert(bubbles.length > 1, 'a 270-character single bubble was sent as one wall of text');
    bubbles.forEach(bubble => assert(bubble.length <= 210, `a bubble ran to ${bubble.length} characters`));
});

test('empty or whitespace-only content produces no phantom bubbles', () => {
    assert.deepEqual(Array.from(context.splitCompanionReplyIntoBubbles('')), []);
    assert.deepEqual(Array.from(context.splitCompanionReplyIntoBubbles('   \n\n  ')), []);
});

test('texting cleanup removes RP actions and narration without flattening ordinary emphasis', () => {
    const raw = '*smiles softly*\nI *really* missed your messages\nShe sighs and looks away\nmaking coffee rn';
    const cleaned = context.sanitizeCompanionTextReply(raw, 'Bree');
    assert(!cleaned.includes('smiles softly'));
    assert(!cleaned.includes('She sighs'));
    assert(cleaned.includes('I really missed your messages'));
    assert(cleaned.includes('making coffee rn'));
});

test('the system contract explicitly bans roleplay prose in the texting simulator', () => {
    const prompt = context.buildCompanionSystemPrompt(freshCompanion(), [], Date.now());
    ['THIS IS TEXTING, NOT ROLEPLAY PROSE', 'Never use asterisks for actions', 'third-person narration'].forEach(rule =>
        assert(prompt.includes(rule), `missing immersion rule: ${rule}`));
});

// --- photo prompt and model ranking ---------------------------------------------

test('the photo prompt names specific camera imperfections, not just the word "realistic"', () => {
    const prompt = context.buildCompanionPhotoPrompt(freshCompanion(), 'at a coffee shop, laughing');
    ['iPhone', 'handheld', 'skin texture', 'ISO', 'bloom', 'compression'].forEach(cue =>
        assert(prompt.includes(cue), `the realism cue "${cue}" is missing`));
    assert(/coffee shop/.test(prompt), 'the requested scene was dropped from the prompt');
});

test('unknown and legacy photo styles safely fall back to realistic', () => {
    const c = freshCompanion({ photoStyle: 'oil-on-mars' });
    assert.equal(c.photoStyle, 'realistic');
    assert(context.buildCompanionPhotoPrompt(c, 'at home').includes('Realistic iPhone'));
});

test('illustrated photos use the requested painterly treatment while retaining phone-photo language', () => {
    const prompt = context.buildCompanionPhotoPrompt(
        freshCompanion({ photoStyle: 'illustrated' }),
        'waiting for a late train'
    );
    ['Arcane-inspired', 'hand-painted', 'phone', 'off-center'].forEach(cue =>
        assert(prompt.includes(cue), `the illustrated cue "${cue}" is missing`));
    assert(prompt.includes('waiting for a late train'));
});

test('the additional styles generate distinct treatments while preserving character and scene', () => {
    const styles = ['film', 'instant', 'graphic_novel', 'anime'];
    const prompts = styles.map(photoStyle =>
        context.buildCompanionPhotoPrompt(freshCompanion({ photoStyle }), 'reading by the window'));
    assert.equal(new Set(prompts).size, styles.length);
    prompts.forEach(prompt => {
        assert(prompt.includes('auburn hair, freckles'));
        assert(prompt.includes('reading by the window'));
    });
});

test('the image API request sends only the generation reference, never the profile photo', () => {
    const c = freshCompanion({
        profilePhoto: 'data:image/png;base64,DISPLAY_ONLY',
        basePhoto: 'data:image/png;base64,PROVIDER_REFERENCE',
        imageModel: 'vendor/image-model'
    });
    const body = context.buildCompanionImageRequest(c, 'at a cafe');
    const serialized = JSON.stringify(body);
    assert(serialized.includes('PROVIDER_REFERENCE'));
    assert(!serialized.includes('DISPLAY_ONLY'));
    assert.equal(body.input_references[0].type, 'image_url');
});

test('GPTProto uses its documented base URL and Bearer authentication', () => {
    const previous = context.state.globalSettings.apiProvider;
    context.state.globalSettings.apiProvider = 'gptproto';
    context.state.gptprotoApiKey = 'sk-gptproto-test';
    try {
        assert.equal(context.apiBase(), 'https://gptproto.com/v1');
        assert.equal(context.apiAuthKey(), 'sk-gptproto-test');
        assert.equal(context.authHeaders().Authorization, 'Bearer sk-gptproto-test');
    } finally {
        context.state.globalSettings.apiProvider = previous;
        delete context.state.gptprotoApiKey;
    }
});

test('GPTProto photo requests use image rather than OpenRouter input_references', () => {
    const previous = context.state.globalSettings.apiProvider;
    context.state.globalSettings.apiProvider = 'gptproto';
    try {
        const companion = freshCompanion({
            imageModel: 'gpt-image-2',
            profilePhoto: 'data:image/png;base64,PROFILE',
            basePhoto: 'data:image/png;base64,IDENTITY'
        });
        const request = context.buildCompanionImageRequest(companion, 'at a cafe', {
            capabilities: {}
        });
        assert.equal(request.image, companion.basePhoto);
        assert.equal(request.input_references, undefined);
        assert(!JSON.stringify(request).includes('PROFILE'));
    } finally {
        context.state.globalSettings.apiProvider = previous;
    }
});

test('GPTProto capability profiles recover reference support missing from its model catalog', () => {
    const dola = context.gptProtoImageReferenceProfile('dola-seedream-5-0-pro-260628');
    assert.equal(dola.max, 10);
    assert.equal(dola.transport, 'seedream-async');
    const ranked = context.rankCompanionImageModels([{
        id: 'dola-seedream-5-0-pro-260628',
        name: 'Dola Seedream 5 Pro'
    }], 'gptproto');
    assert.equal(ranked[0].supportsReference, true);
    assert.equal(ranked[0].supportedParameters.input_references.max, 10);
});

test('GPTProto reference limits are family-specific rather than one universal guess', () => {
    assert.equal(context.gptProtoImageReferenceProfile('gpt-image-2').max, 16);
    assert.equal(context.gptProtoImageReferenceProfile('gemini-2.5-flash-image').max, 3);
    assert.equal(context.gptProtoImageReferenceProfile('gemini-3.1-flash-lite-image').max, 14);
    assert.equal(context.gptProtoImageReferenceProfile('grok-imagine-image').max, 1);
    assert.equal(context.gptProtoImageReferenceProfile('gpt-4o-image-vip').max, 1);
    assert.equal(context.gptProtoImageReferenceProfile('wan-2.5').max, 1);
    assert.equal(context.gptProtoImageReferenceProfile('flux-kontext-pro').transport, 'public-url-prompt');
    assert.equal(context.gptProtoImageReferenceProfile('plain-text-to-image'), null);
});

test('GPTProto model families use their documented image routes', () => {
    assert.equal(
        context.gptProtoImageEndpoint('dola-seedream-5-0-pro-260628', true),
        'https://gptproto.com/api/v3/doubao/dola-seedream-5-0-pro-260628/image-edit'
    );
    assert.equal(
        context.gptProtoImageEndpoint('dola-seedream-5-0-pro-260628', false),
        'https://gptproto.com/api/v3/doubao/dola-seedream-5-0-pro-260628/text-to-image'
    );
    assert.equal(
        context.gptProtoImageEndpoint('seedream-4-0-250828', true),
        'https://gptproto.com/api/v3/images/generations'
    );
    assert.equal(
        context.gptProtoImageEndpoint('gemini-2.5-flash-image', true),
        'https://gptproto.com/v1beta/models/gemini-2.5-flash-image:generateContent'
    );
    assert.equal(
        context.gptProtoImageEndpoint('wan-2.5', true),
        'https://gptproto.com/api/v3/alibaba/wan-2.5/image-edit'
    );
});

test('GPTProto image extraction understands synchronous, async and Gemini responses', () => {
    assert.equal(
        context.gptProtoImageFromResponse({ data: { outputs: ['https://cdn.test/async.png'] } }),
        'https://cdn.test/async.png'
    );
    assert.equal(
        context.gptProtoImageFromResponse({
            candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/webp', data: 'AAAA' } }] } }]
        }),
        'data:image/webp;base64,AAAA'
    );
    assert.equal(
        context.gptProtoImageFromResponse({ data: [{ b64_json: 'BBBB' }] }, 'image/jpeg'),
        'data:image/jpeg;base64,BBBB'
    );
    const rawBase64 = 'A'.repeat(64);
    assert.equal(
        context.gptProtoImageFromResponse({ data: { outputs: [rawBase64] } }, 'image/png'),
        `data:image/png;base64,${rawBase64}`
    );
    assert.equal(
        context.normalizeGeneratedImageSource('/temporary/output.png'),
        'https://gptproto.com/temporary/output.png'
    );
    assert.equal(context.normalizeGeneratedImageSource('completed'), '');
    assert.equal(context.generatedImageMimeFromBase64('/9j/AAAA'), 'image/jpeg');
    assert.equal(context.generatedImageMimeFromBase64('UklGRAAA'), 'image/webp');
});

test('saved photo messages repair raw base64 and discard non-image task statuses', () => {
    const rawBase64 = 'B'.repeat(64);
    assert.equal(
        context.normalizeCompanionMessage({ type: 'photo', photo: rawBase64 }).photo,
        `data:image/png;base64,${rawBase64}`
    );
    assert.equal(
        context.normalizeCompanionMessage({ type: 'photo', photo: 'completed' }).photo,
        ''
    );
});

test('the base image request does not assume universal PNG or count support', () => {
    const body = context.buildCompanionImageRequest(
        freshCompanion({ imageModel: 'sourceful/riverflow-v2.5-fast' }),
        'walking home'
    );
    assert.equal(body.n, undefined);
    assert.equal(body.output_format, undefined);
    assert.deepEqual(Object.keys(body).sort(), ['model', 'prompt']);
});

test('model descriptors allow only advertised enum values', () => {
    const capabilities = context.imageCapabilityMap({
        output_format: { type: 'enum', values: ['jpeg'] },
        output_compression: { type: 'range', min: 0, max: 100 }
    });
    assert.equal(context.imageParameterValueForDescriptor('output_format', 'png', capabilities.output_format), undefined);
    assert.equal(context.imageParameterValueForDescriptor('output_format', 'jpeg', capabilities.output_format), 'jpeg');
    assert.equal(context.imageParameterValueForDescriptor('output_compression', 500, capabilities.output_compression), 100);
});

test('Riverflow Fast sends JPEG only when the user selected its advertised format', () => {
    const capabilities = context.imageCapabilityMap({
        output_format: { type: 'enum', values: ['jpeg'] },
        n: { type: 'range', min: 1, max: 1 },
        input_references: { type: 'range', min: 0, max: 4 }
    });
    const invalid = context.buildCompanionImageRequest(
        freshCompanion({ imageParameters: { output_format: 'png' } }), 'at home', { capabilities });
    const valid = context.buildCompanionImageRequest(
        freshCompanion({ imageParameters: { output_format: 'jpeg' } }), 'at home', { capabilities });
    assert.equal(invalid.output_format, undefined);
    assert.equal(invalid.n, undefined);
    assert.equal(valid.output_format, 'jpeg');
});

test('endpoint selection preserves reference support over an incompatible preference', () => {
    const endpoints = [
        { providerTag: 'text-only', providerSlug: 'text-only', supportedParameters: {} },
        { providerTag: 'image-edit', providerSlug: 'image-edit',
            supportedParameters: { input_references: { type: 'range', min: 0, max: 1 } } }
    ];
    const chosen = context.chooseCompanionImageEndpoint(endpoints,
        freshCompanion({ imageProviderTag: 'text-only' }), true);
    assert.equal(chosen.providerTag, 'image-edit');
});

test('a selected endpoint is pinned and only allowlisted provider options are sent', () => {
    const endpoint = {
        providerTag: 'sourceful',
        providerSlug: 'sourceful',
        supportedParameters: { output_format: { type: 'enum', values: ['jpeg'] } },
        allowedPassthroughParameters: ['guidance']
    };
    const body = context.buildCompanionImageRequest(freshCompanion({
        imageParameters: { output_format: 'jpeg' },
        imageProviderOptions: { guidance: 3, secret_unsupported: 'nope' }
    }), 'outside', { endpoint, capabilities: endpoint.supportedParameters });
    assert.deepEqual(Array.from(body.provider.only), ['sourceful']);
    assert.equal(body.provider.allow_fallbacks, false);
    assert.equal(body.provider.options.sourceful.guidance, 3);
    assert.equal(body.provider.options.sourceful.secret_unsupported, undefined);
});

test('allowlisted provider-specific controls can safely retain structured JSON values', () => {
    const options = context.normalizeCompanionImageProviderOptions({
        font_inputs: [{ text: 'Horde', weight: 500 }],
        invalid_function: () => 'no'
    });
    assert.equal(options.font_inputs[0].text, 'Horde');
    assert.equal(options.font_inputs[0].weight, 500);
    assert.equal(options.invalid_function, undefined);
});

test('explicit pixel size suppresses conflicting resolution and aspect ratio', () => {
    const capabilities = context.imageCapabilityMap({
        size: { type: 'enum', values: ['2048x2048'] },
        resolution: { type: 'enum', values: ['2K'] },
        aspect_ratio: { type: 'enum', values: ['16:9'] }
    });
    const body = context.buildCompanionImageRequest(freshCompanion({
        imageParameters: { size: '2048x2048', resolution: '2K', aspect_ratio: '16:9' }
    }), 'outside', { capabilities });
    assert.equal(body.size, '2048x2048');
    assert.equal(body.resolution, undefined);
    assert.equal(body.aspect_ratio, undefined);
});

test('transparent JPEG is repaired to an opaque background before sending', () => {
    const capabilities = context.imageCapabilityMap({
        output_format: { type: 'enum', values: ['jpeg'] },
        background: { type: 'enum', values: ['auto', 'transparent', 'opaque'] }
    });
    const body = context.buildCompanionImageRequest(freshCompanion({
        imageParameters: { output_format: 'jpeg', background: 'transparent' }
    }), 'outside', { capabilities });
    assert.equal(body.output_format, 'jpeg');
    assert.equal(body.background, 'opaque');
});

test('the photo diagnostic can isolate the prompt by omitting the reference image', () => {
    const c = freshCompanion({ basePhoto: 'data:image/png;base64,REFERENCE' });
    const body = context.buildCompanionImageRequest(c, 'at a cafe', { includeReference: false });
    assert.equal(body.input_references, undefined);
});

test('provider privacy rejections are identified as upstream rather than an app filter', () => {
    const message = context.companionImageErrorMessage(
        'The request failed because the input image may contain sensitive information.',
        'bytedance-seed/seedream-4.5',
        true
    );
    assert(message.includes('provider'));
    assert(message.includes('Horde Studio did not apply this filter'));
    assert(message.includes('Use generation reference'));
    assert.equal(context.isCompanionReferencePrivacyError(
        'The request failed because the input image may contain sensitive information.'
    ), true);
});

test('reference-free recovery removes image bytes and writes a usable standalone subject prompt', () => {
    const c = freshCompanion({ basePhoto: 'data:image/png;base64,REFERENCE' });
    const body = context.buildCompanionImageRequest(c, 'walking home', { includeReference: false });
    assert.equal(body.input_references, undefined);
    assert(body.prompt.includes('auburn hair, freckles'));
    assert(body.prompt.includes('walking home'));
});

test('image model ranking prioritizes models that advertise reference input', () => {
    const ranked = context.rankCompanionImageModels([
        { id: 'vendor/text-only-image', name: 'Text only', architecture: { output_modalities: ['image'], input_modalities: ['text'] } },
        { id: 'vendor/reference-image', name: 'Reference', architecture: { output_modalities: ['image'] }, supported_parameters: ['input_references'] }
    ]);
    assert.equal(ranked[0].id, 'vendor/reference-image');
    assert.equal(ranked[0].supportsReference, true);
    assert.equal(ranked[1].supportsReference, false);
});

test('a zero-capacity reference descriptor is not marked reference ready', () => {
    assert.equal(context.modelSupportsImageReferences({
        id: 'vendor/no-reference',
        supported_parameters: { input_references: { type: 'range', min: 0, max: 0 } }
    }), false);
});

test('image model ranking preserves capability descriptors for the Studio controls', () => {
    const ranked = context.rankCompanionImageModels([{
        id: 'sourceful/riverflow-v2.5-fast',
        architecture: { output_modalities: ['image'] },
        supported_parameters: {
            output_format: { type: 'enum', values: ['jpeg'] },
            resolution: { type: 'enum', values: ['1K', '2K'] }
        },
        endpoints: '/api/v1/images/models/sourceful/riverflow-v2.5-fast/endpoints'
    }]);
    assert.deepEqual(Array.from(ranked[0].supportedParameters.output_format.values), ['jpeg']);
    assert.deepEqual(Array.from(ranked[0].supportedParameters.resolution.values), ['1K', '2K']);
    assert.match(ranked[0].endpointsPath, /riverflow/);
});

test('only models that actually output images are offered, cheapest first', () => {
    const catalog = [
        { id: 'good/cheap-image', architecture: { output_modalities: ['text', 'image'] }, pricing: { image_output: '0.00003' } },
        { id: 'good/pricier-image', architecture: { output_modalities: ['image', 'text'] }, pricing: { image_output: '0.00012' } },
        { id: 'bad/text-only', architecture: { output_modalities: ['text'] }, pricing: { image_output: '0.00001' } },
        { id: 'bad/no-modality-listed' }
    ];
    const ranked = context.rankCompanionImageModels(catalog);
    assert.deepEqual(ranked.map(m => m.id), ['good/cheap-image', 'good/pricier-image']);
});

test('Virtual Human text models exclude media-only models and prioritize tool calling', () => {
    const ranked = context.rankCompanionTextModels([
        { id: 'plain-chat', name: 'Plain', architecture: { output_modalities: ['text'] }, supported_parameters: [] },
        { id: 'tool-chat', name: 'Tool', architecture: { output_modalities: ['text'] }, supported_parameters: ['tools'] },
        { id: 'gpt-image-2', architecture: { output_modalities: ['image'] } },
        { id: 'gpt-4o-mini-tts', architecture: { output_modalities: ['speech'] } }
    ]);
    assert.deepEqual(Array.from(ranked, model => model.id), ['tool-chat', 'plain-chat']);
});

test('Virtual Human Studio exposes and persists its conversation model', () => {
    const setupSource = functionSource('setupCompanionsLogic');
    const sendSource = functionSource('sendCompanionMessage');
    assert(setupSource.includes("'cs-text-model-search'"));
    assert(setupSource.includes("'cs-use-global-model'"));
    assert(setupSource.includes("'cs-model-reasoning'"));
    assert(setupSource.includes("'cs-model-context-size'"));
    assert(setupSource.includes("'cs-text-model-custom'"));
    assert(setupSource.includes('companion.model ='));
    assert(sendSource.includes('companion.model || state.globalSettings.defaultModel'));
});

test('Active Life can use its own model without changing the conversation model', () => {
    context.state.globalSettings.defaultModel = 'global/default';
    const dedicated = context.normalizeCompanion({
        model: 'chat/model',
        lifeBuilderModel: 'life/model'
    });
    assert.equal(context.companionEffectiveLifeBuilderModel(dedicated), 'life/model');
    assert.equal(dedicated.model, 'chat/model');
    const inherited = context.normalizeCompanion({ model: 'chat/model' });
    assert.equal(context.companionEffectiveLifeBuilderModel(inherited), 'chat/model');
    const globalOnly = context.normalizeCompanion({});
    assert.equal(context.companionEffectiveLifeBuilderModel(globalOnly), 'global/default');
});

test('Virtual Human generation config sends only model-supported parameters', () => {
    const companion = context.normalizeCompanion({
        temp: 0.4,
        topP: 0.8,
        maxTokens: 1800,
        reasoning: true,
        reasoningEffort: 'high',
        supportedParams: ['temperature', 'max_tokens', 'reasoning_effort']
    });
    const body = context.applyCompanionGenerationConfig({ model: 'deepseek/test' }, companion);
    assert.equal(body.temperature, 0.4);
    assert.equal(body.max_tokens, 1800);
    assert.equal(body.reasoning_effort, 'high');
    assert(!Object.hasOwn(body, 'top_p'));
    assert(!Object.hasOwn(body, 'include_reasoning'));
});

test('Virtual Human custom models retain the full sampling configuration', () => {
    const companion = context.normalizeCompanion({
        temp: 0,
        topP: 0.7,
        minP: 0.04,
        topK: 50,
        freqPenalty: 0.2,
        presPenalty: 0.1,
        repPenalty: 1.1,
        supportedParams: []
    });
    const body = context.applyCompanionGenerationConfig({ model: 'custom/model' }, companion);
    assert.equal(body.temperature, 0);
    assert.equal(body.top_p, 0.7);
    assert.equal(body.min_p, 0.04);
    assert.equal(body.top_k, 50);
    assert.equal(body.frequency_penalty, 0.2);
    assert.equal(body.presence_penalty, 0.1);
    assert.equal(body.repetition_penalty, 1.1);
});

test('a malformed catalog does not throw', () => {
    [null, undefined, [null, 42, {}]].forEach(catalog => {
        assert.doesNotThrow(() => context.rankCompanionImageModels(catalog));
    });
});

test('speech discovery rejects audio-input-only models', () => {
    const catalog = [
        { id: 'bad/transcriber', architecture: { input_modalities: ['audio'], output_modalities: ['text'] } },
        { id: 'bad/chat-audio-model', architecture: { input_modalities: ['text'], output_modalities: ['audio'] } },
        { id: 'good/voice', architecture: { input_modalities: ['text'], output_modalities: ['speech'] } }
    ];
    assert.deepEqual(Array.from(context.rankCompanionTTSModels(catalog), model => model.id), ['good/voice']);
});

test('TTS model metadata keeps its model-specific voice catalog', () => {
    const ranked = context.rankCompanionTTSModels([{
        id: 'x-ai/grok-voice-tts-1.0',
        architecture: { output_modalities: ['speech'] },
        supported_voices: ['eve', 'rex']
    }]);
    assert.deepEqual(Array.from(ranked[0].supportedVoices), ['eve', 'rex']);
    assert.deepEqual(
        Array.from(context.normalizeTTSVoiceOptions(ranked[0].supportedVoices, ranked[0].id), voice => voice.value),
        ['eve', 'rex']
    );
});

test('known TTS providers get safe voice fallbacks when metadata is absent', () => {
    assert.deepEqual(Array.from(context.fallbackTTSVoicesForModel('x-ai/grok-voice-tts-1.0')), ['eve', 'ara', 'rex', 'sal', 'leo']);
    assert(context.fallbackTTSVoicesForModel('microsoft/mai-voice-2')[0].includes('MAI-Voice-2'));
    assert(context.fallbackTTSVoicesForModel('google/gemini-2.5-flash-preview-tts').includes('Kore'));
});

test('Gemini requests PCM while MP3-native providers stay browser-playable', () => {
    assert.equal(context.ttsResponseFormatForModel('google/gemini-2.5-flash-preview-tts'), 'pcm');
    assert.equal(context.ttsResponseFormatForModel('mistralai/voxtral-mini-tts-2603'), 'mp3');
    assert.equal(context.ttsResponseFormatForModel('openai/gpt-4o-mini-tts-2025-12-15'), 'mp3');
});

test('TTS capabilities are model-specific instead of one universal format', () => {
    const gemini = context.companionTTSCapabilities('google/gemini-3.1-flash-tts-preview');
    const microsoft = context.companionTTSCapabilities('microsoft/mai-voice-2');
    const mistral = context.companionTTSCapabilities('mistralai/voxtral-mini-tts-2603');
    assert.deepEqual(Array.from(gemini.formats), ['pcm']);
    assert.equal(gemini.sampleRate, 24000);
    assert.equal(microsoft.supportsSpeed, true);
    assert.equal(microsoft.providerSlug, 'azure');
    assert.equal(mistral.preferredFormat, 'mp3');
    assert.equal(mistral.pcmEncoding, 'float32le');
});

test('the TTS request sends only model-supported controls', () => {
    const microsoft = freshCompanion({
        ttsModel: 'microsoft/mai-voice-2',
        ttsVoice: 'en-US-Harper:MAI-Voice-2',
        ttsResponseFormat: 'mp3',
        ttsSpeed: 1.25,
        ttsProviderOptions: { style: 'cheerful', styledegree: 1.2, instructions: 'not Azure' }
    });
    const request = context.buildCompanionTTSRequest(microsoft, 'hello').body;
    assert.equal(request.response_format, 'mp3');
    assert.equal(request.speed, 1.25);
    assert.equal(request.provider.options.azure.style, 'cheerful');
    assert.equal(request.provider.options.azure.instructions, undefined);

    const mistral = context.buildCompanionTTSRequest(freshCompanion({
        ttsModel: 'mistralai/voxtral-mini-tts-2603', ttsVoice: 'alloy', ttsSpeed: 1.8
    }), 'hello').body;
    assert.equal(mistral.speed, undefined);
});

test('GPTProto speech sends only its documented model, input and voice fields', () => {
    const previous = context.state.globalSettings.apiProvider;
    context.state.globalSettings.apiProvider = 'gptproto';
    try {
        const request = context.buildCompanionTTSRequest(freshCompanion({
            ttsModel: 'gpt-4o-mini-tts',
            ttsVoice: 'nova',
            ttsResponseFormat: 'pcm',
            ttsSpeed: 1.8,
            ttsProviderOptions: { instructions: 'whisper' }
        }), 'hello').body;
        assert.deepEqual(Object.keys(request).sort(), ['input', 'model', 'voice']);
        assert.equal(request.model, 'gpt-4o-mini-tts');
        assert.equal(request.voice, 'nova');
    } finally {
        context.state.globalSettings.apiProvider = previous;
    }
});

test('raw Gemini PCM is wrapped in a valid 24 kHz mono WAV container', () => {
    const pcm = new Uint8Array([0, 0, 1, 0, 255, 127, 0, 128]);
    const wav = context.pcm16ToWavArrayBuffer(pcm, 24000, 1);
    const bytes = new Uint8Array(wav);
    const view = new DataView(wav);
    assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'RIFF');
    assert.equal(String.fromCharCode(...bytes.slice(8, 12)), 'WAVE');
    assert.equal(view.getUint32(24, true), 24000);
    assert.equal(view.getUint16(22, true), 1);
    assert.equal(view.getUint16(34, true), 16);
    assert.equal(view.getUint32(40, true), pcm.length);
});

test('float32 PCM receives a standards-compliant float WAV header', () => {
    const pcm = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 63]);
    const wav = context.pcmToWavArrayBuffer(pcm, 24000, 1, 32, 3);
    const view = new DataView(wav);
    assert.equal(view.getUint16(20, true), 3);
    assert.equal(view.getUint16(34, true), 32);
    assert.equal(view.getUint32(24, true), 24000);
});

test('audio container detection trusts byte signatures over a bad MIME label', () => {
    const wav = new Uint8Array(44);
    'RIFF'.split('').forEach((char, index) => { wav[index] = char.charCodeAt(0); });
    'WAVE'.split('').forEach((char, index) => { wav[index + 8] = char.charCodeAt(0); });
    const detected = context.sniffTTSAudioFormat(wav, 'audio/mpeg', 'mp3');
    assert.equal(detected.format, 'wav');
    assert.equal(detected.mime, 'audio/wav');
});

test('raw PCM is not misidentified as MP3 merely because its bytes contain frame-like values', () => {
    const pcm = new Uint8Array([0xff, 0xe3, 0, 0, 4, 5, 6, 7]);
    const detected = context.sniffTTSAudioFormat(pcm, 'audio/pcm', 'pcm');
    assert.equal(detected.format, 'pcm');
});

test('a provider format requirement is extracted for one safe retry', () => {
    const raw = '{"error":{"message":"Gemini TTS only supports response_format=\\"pcm\\". Got \\"mp3\\"."}}';
    const message = context.ttsErrorMessageFromText(raw, 400);
    assert.equal(context.requiredTTSFormatFromError(message), 'pcm');
    assert.equal(context.requiredTTSFormatFromError('Provider rejected response_format. Accepted: mp3'), 'mp3');
});

test('neural preview uses the dedicated speech endpoint and does not disguise failures with browser speech', () => {
    const source = functionSource('generateOpenRouterSpeech');
    assert(source.includes("'/audio/speech'"));
    assert(!source.includes("'/chat/completions'"), 'dedicated TTS failure still falls through to the incompatible chat endpoint');
});

test('studio photo and voice diagnostics reuse the production generation paths', () => {
    assert(app.includes('await generateCompanionPhoto(companion, scene, {'));
    assert(app.includes('includeReference,'));
    assert(app.includes('onReferenceFallback:'));
    assert(app.includes("speakCompanionLine(companion, sampleText, finish)"));
});

test('GPTProto media endpoints and CSP are wired into the production paths', () => {
    assert(functionSource('requestCompanionPhoto').includes("'/images/generations'"));
    assert(functionSource('generateOpenRouterSpeech').includes("'/audio/speech'"));
    assert(app.includes('https://gptproto.com'));
    assert(app.includes("['openrouter', 'gptproto', 'local']"));
});

test('the person builder demands causal, non-generic adults and strict JSON', () => {
    const prompt = context.companionBuilderSystemPrompt('deep');
    ['Preserve every fact', 'at least 18', 'contradictions', 'routine', 'ONLY one strict JSON'].forEach(rule =>
        assert(prompt.includes(rule), `builder rule "${rule}" is missing`));
});

// --- tool call extraction ------------------------------------------------------

test('state, photo, voice and link-sharing tools are offered together', () => {
    const names = Array.from(context.COMPANION_TOOLS, t => t.function.name);
    assert.deepEqual(names.sort(), ['commit_human_turn', 'companion_state', 'send_photo', 'send_voice_note', 'share_link']);
});

test('photo and voice opt-outs remove paid tools at the request boundary', () => {
    const tools = context.companionToolsFor(freshCompanion({
        allowPhotos: false, allowVoiceNotes: false, webAccess: false
    }), false);
    assert.deepEqual(Array.from(tools, t => t.function?.name).filter(Boolean), ['commit_human_turn', 'companion_state']);
});

test('media tools remain available for both replies and autonomous initiative when enabled', () => {
    const tools = context.companionToolsFor(freshCompanion({
        allowPhotos: true, allowVoiceNotes: true, webAccess: false
    }), false);
    const names = tools.map(t => t.function?.name);
    assert(names.includes('send_photo'));
    assert(names.includes('send_voice_note'));
});

test('web search is excluded for local providers while link sharing still respects permission', () => {
    const c = freshCompanion({ webAccess: true });
    const remote = context.companionToolsFor(c, false);
    const local = context.companionToolsFor(c, true);
    assert(remote.includes(context.COMPANION_WEB_SEARCH_TOOL));
    assert(!local.includes(context.COMPANION_WEB_SEARCH_TOOL));
    assert(local.some(t => t.function?.name === 'share_link'));
});

test('an asleep virtual human does not answer a live call', () => {
    const c = freshCompanion({ sleepArchetype: 'normal' });
    const plan = context.companionCallPlan(c, new Date(2026, 0, 15, 3, 0).getTime());
    assert.equal(plan.picksUp, false);
    assert.match(plan.reason, /asleep/i);
});

test('a normal reply with only a mood update extracts just that', () => {
    const calls = [{ function: { name: 'companion_state', arguments: JSON.stringify({ valence_change: 5, arousal_change: 0, mood_label: 'happy', relationship_change: 1 }) } }];
    const actions = context.extractCompanionToolCalls(calls);
    assert(actions.state);
    assert.equal(actions.state.mood_label, 'happy');
    assert.equal(actions.photo, null);
    assert.equal(actions.voice, null);
});

test('a photo and a mood update in the same reply are both extracted', () => {
    const calls = [
        { function: { name: 'companion_state', arguments: '{"valence_change":5,"arousal_change":0,"mood_label":"happy","relationship_change":1}' } },
        { function: { name: 'send_photo', arguments: '{"scene":"at the park","caption":"here"}' } }
    ];
    const actions = context.extractCompanionToolCalls(calls);
    assert(actions.state && actions.photo);
    assert.equal(actions.photo.scene, 'at the park');
});

test('provider XML tool markup is removed from chat and recovered as real actions', () => {
    const raw = `lmaoo ur pushy arent u
fine but dont say i didnt warn u
<uncensoredtoolcall>sendphoto<argkey>scene</argkey><argvalue>Jane at her kitchen table holding cereal</argvalue><argkey>caption</argkey><argvalue>glamorous i know.</argvalue></toolcall>
<uncensoredtoolcall>commithumanturn<argkey>state</argkey><argvalue>{"valencechange":2,"arousalchange":3,"moodlabel":"playful","relationshipchange":2,"trustchange":1}</argvalue><argkey>photo</argkey><argvalue>{"decision":"send","scene":"Jane at kitchen table","caption":"glamorous i know."}</argvalue><argkey>voicenote</argkey><argvalue>{"decision":"none"}</argvalue></uncensoredtoolcall>`;
    const embedded = context.extractCompanionEmbeddedToolCalls(raw);
    assert.equal(embedded.toolCalls.length, 2);
    assert(!embedded.visibleText.includes('argvalue'));
    assert(!embedded.visibleText.includes('toolcall'));
    assert.match(embedded.visibleText, /lmaoo ur pushy/);
    const actions = context.extractCompanionToolCalls(embedded.toolCalls);
    assert.equal(actions.commit.state.mood_label, 'playful');
    assert.equal(actions.commit.state.relationship_change, 2);
    assert.equal(actions.commit.state.trust_change, 1);
    assert.equal(actions.photo.scene, 'Jane at kitchen table');
    assert.equal(actions.voice, null);
});

test('an unterminated embedded tool call is quarantined instead of displayed', () => {
    const embedded = context.extractCompanionEmbeddedToolCalls(
        'normal visible reply<uncensoredtoolcall>sendphoto<argkey>scene</argkey><argvalue>private protocol');
    assert.equal(embedded.visibleText, 'normal visible reply');
    assert(!embedded.visibleText.includes('private protocol'));
});

test('already-saved protocol bubbles are collapsed back into one clean reply', () => {
    const group = 'response-1';
    const repaired = context.repairCompanionProtocolLeaks([
        context.normalizeCompanionMessage({
            id: 'a', role: 'companion', type: 'text', responseGroupId: group,
            text: 'dont judge me <uncensoredtoolcall>sendphoto<argkey>scene</argkey><argvalue>kitchen',
            timestamp: 1000
        }),
        context.normalizeCompanionMessage({
            id: 'b', role: 'companion', type: 'text', responseGroupId: group,
            text: ' table</argvalue><argkey>caption</argkey><argvalue>glamorous</argvalue></toolcall>',
            timestamp: 1400
        }),
        context.normalizeCompanionMessage({
            id: 'p', role: 'companion', type: 'photo', responseGroupId: group,
            scene: 'kitchen table', pending: true, timestamp: 1800
        })
    ], 'Jane');
    assert.equal(repaired.filter(message => message.type === 'text').length, 1);
    assert.equal(repaired.find(message => message.type === 'text').text, 'dont judge me');
    assert.equal(repaired.filter(message => message.type === 'photo').length, 1);
    assert(!JSON.stringify(repaired).includes('argvalue'));
});

test('a voice note is extracted independently of the other two', () => {
    const calls = [{ function: { name: 'send_voice_note', arguments: '{"text":"call me later ok?"}' } }];
    const actions = context.extractCompanionToolCalls(calls);
    assert.equal(actions.voice.text, 'call me later ok?');
});

test('a searched meme or video link is extracted as a shareable action', () => {
    const calls = [{ function: { name: 'share_link', arguments: '{"url":"https://example.com/video","title":"this is so you","media_type":"video"}' } }];
    const actions = context.extractCompanionToolCalls(calls);
    assert.equal(actions.link.url, 'https://example.com/video');
    assert.equal(actions.link.media_type, 'video');
});

test('no tool calls at all extracts cleanly to nothing', () => {
    const actions = context.extractCompanionToolCalls([]);
    assert.equal(actions.state, null);
    assert.equal(actions.photo, null);
    assert.equal(actions.voice, null);
    assert.equal(actions.link, null);
    assert.doesNotThrow(() => context.extractCompanionToolCalls(null));
    assert.doesNotThrow(() => context.extractCompanionToolCalls(undefined));
});

test('slightly malformed tool JSON is repaired rather than dropped', () => {
    // A trailing comma is the single most common near-miss from a model.
    const calls = [{ function: { name: 'companion_state', arguments: '{"valence_change":5,"arousal_change":0,"mood_label":"happy","relationship_change":1,}' } }];
    const actions = context.extractCompanionToolCalls(calls);
    assert(actions.state, 'a recoverable near-JSON payload was discarded entirely');
    assert.equal(actions.state.mood_label, 'happy');
});

test('a photo request with no scene is not treated as a photo the caller must handle', () => {
    // sendCompanionMessage only creates a pending photo when scene is present;
    // this is what makes that check meaningful.
    const calls = [{ function: { name: 'send_photo', arguments: '{"caption":"hi"}' } }];
    const actions = context.extractCompanionToolCalls(calls);
    assert.equal(actions.photo.scene, undefined);
});

let failures = 0;
for (const { name, fn } of tests) {
    try { fn(); console.log(`✓ ${name}`); }
    catch (error) { failures++; console.error(`✗ ${name}\n  ${error.message}`); }
}
if (failures) {
    console.error(`\n${failures} companion check(s) failed.`);
    process.exit(1);
}
console.log(`\n${tests.length} companion checks passed.`);
