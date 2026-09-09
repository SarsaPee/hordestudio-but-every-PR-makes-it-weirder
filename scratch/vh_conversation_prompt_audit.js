const fs = require('node:fs');
const vm = require('node:vm');
const { buildContext } = require('./app_source');
const now = Date.UTC(2026, 8, 7, 12);
const ctx = { console, state: { globalSettings: {}, personas: [], activePersonaId: null, companions: [], companionThreads: {}, companionTimelines: {} },
    companionLifeState: () => ({ activity: 'home', label: 'at home', availability: 'available', situation: { label: 'at home', availability: 'available', withNames: [] } }),
    companionPendingPersonaVision: () => null, companionInputSupports: () => false };
buildContext(vm, ['normalizeCompanion', 'buildCompanionMessages', 'buildCompanionContextPacket', 'companionContextPacketText'], ctx);
const c = ctx.normalizeCompanion({ id: 'probe', name: 'Ada', contextSize: 8192,
    personality: 'Dry humour; direct, warm with old friends, easily distracted by her own projects.',
    textingStyle: 'Short conversational messages; often contributes an opinion or practical suggestion.',
    startingScenario: 'OPENING_MARKER', createdAt: now - 86400000 });
ctx.state.companions = [c];
c.continuityRuntime.conversationGoal = { type: 'practical', objective: 'GOAL_MARKER: agree where to meet tonight', reason: 'We are making plans', chosenAt: now - 1000 };
c.continuityRuntime.beliefs = [{ id: 'belief', status: 'active', proposition: 'BELIEF_MARKER: the player prefers quiet places', confidence: 85 }];
c.privateLife = 'PRIVATE_LIFE_MARKER'; c.playerKnowledge = 'KNOWLEDGE_MARKER';
const messages = [
    { id: 'a', role: 'companion', type: 'text', text: 'Do you want to try the little cafe near mine?', timestamp: now - 10000 },
    { id: 'u', role: 'user', type: 'text', text: 'yeah', deliveryState: 'read', readAt: now, timestamp: now - 1000 },
    { id: 'bad', role: 'companion', type: 'text', text: 'INVALIDATED_MARKER', invalidated: true, timestamp: now - 500 }
];
const options = { performanceOnly: true, experience: { realTimeLife: true }, startingScenarioThisTurn: 'OPENING_MARKER' };
const packet = ctx.buildCompanionContextPacket(c, messages, now, options);
const prompt = ctx.buildCompanionMessages(c, messages, now, options);
const system = prompt[0].content;
const markers = Object.fromEntries(['GOAL_MARKER', 'BELIEF_MARKER', 'PRIVATE_LIFE_MARKER', 'KNOWLEDGE_MARKER', 'OPENING_MARKER']
    .map(marker => [marker, system.includes(marker)]));
const baseline = { systemCharacters: system.length, historyCharacters: prompt.slice(1).reduce((sum,m) => sum + JSON.stringify(m.content).length, 0),
    packetContainsBelief: packet.beliefs.some(b => b.proposition.includes('BELIEF_MARKER')),
    forwardedMarkers: markers, invalidatedReplyForwarded: JSON.stringify(prompt).includes('INVALIDATED_MARKER'),
    lastModelRole: prompt[prompt.length - 1].role };
// Keep the question within the 24-message window, but use substantial authored
// persona context and a small selected context size to exercise budget eviction.
c.contextSize = 2048; c.maxTokens = 1000;
c.backstory = 'She grew up near the coast and moved away for university. '.repeat(65);
c.personality = 'She is sociable but values independence and specific shared experiences. '.repeat(30);
const history = [{ id: 'question', role: 'companion', type: 'text', text: 'QUESTION_MARKER: shall we meet at the cafe?', timestamp: now - 24000 }];
for (let i=0;i<21;i++) history.push({ id: `h${i}`, role: i%2 ? 'user':'companion', type:'text', text:'A detail from the ongoing discussion about our plans and what happened earlier today.', timestamp: now-23000+i*1000, deliveryState:'read', readAt:now-1000 });
history.push({id:'answer',role:'user',type:'text',text:'yeah',timestamp:now,deliveryState:'read',readAt:now});
const crowded = ctx.buildCompanionMessages(c, history, now, options);
const result = { generatedAt: new Date().toISOString(), baseline,
    crowded: { inputHistoryMessages: history.length, forwardedHistoryMessages: crowded.length-1,
        systemCharacters: crowded[0].content.length, approximateContextCharacters: 2048*3.5,
        approximateOutputReserveCharacters: 1000*3.5,
        initiatingQuestionRetained: JSON.stringify(crowded).includes('QUESTION_MARKER') } };
fs.writeFileSync('docs/vh-conversation-prompt-audit-results-2026-09-07.json', JSON.stringify(result,null,2)+'\n');
fs.writeFileSync('docs/vh-conversation-prompt-fixture-2026-09-07.json',JSON.stringify(prompt,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
