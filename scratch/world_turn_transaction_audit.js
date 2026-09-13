/**
 * World turn transaction/session integrity regression audit.
 * Run with: node scratch/world_turn_transaction_audit.js
 */
const assert = require('node:assert/strict');
const { app, functionSource } = require('./app_source.js');

const execute = functionSource('executeWorldTurn');
const addMessage = functionSource('addWorldMessage');
const commit = functionSource('commitWorldTurnReceipt');
const render = functionSource('renderWorldPlayState');
const worldPlaySource = require('node:fs').readFileSync(
    'experiences/experimental-worlds/runtime/world-play-core.js', 'utf8'
);
const hostAdapterSource = require('node:fs').readFileSync(
    'host-adapters/experimental-worlds/experimental-worlds-mode.js', 'utf8'
);

assert(execute && addMessage && commit && render, 'transaction functions must remain extractable');

assert(/function addWorldMessage\(role, text, metadata = \{\}, targetSession = null, targetWorld = null\)/.test(addMessage),
    'world messages must accept an explicit initiating timeline and world');
assert(/const sess = targetSession \|\| getCurrentWorldSession\(\)/.test(addMessage),
    'explicit message targets must win over the currently selected timeline');
assert(/const world = targetWorld \|\| state\.worlds\.find/.test(addMessage),
    'message observations must use the initiating world');

const boundMessageCalls = execute.match(/addWorldMessage\([\s\S]*?\}, sess, world\);/g) || [];
assert(boundMessageCalls.length >= 9,
    'every normal, reroll, fallback, and rollback message path must bind to the initiating timeline');
assert(/processStructuredActions\(validation\.legacyArgs, world, sess, \{/.test(commit),
    'receipt reducers must never look up the active timeline after generation');
assert(/processStructuredActions\(\{ label: args\.label \}, world, sess\)/.test(execute),
    'secret receipt processing must use the initiating timeline');

assert(/let stateCallSeen = false/.test(execute),
    'turn execution must track whether its single canonical receipt was already consumed');
assert(/if \(stateCallSeen\) throw new Error\('Duplicate commit_world_turn ignored/.test(execute),
    'duplicate canonical receipts must be rejected before mutation');
assert(/const beforeReceipt = captureWorldTurnState\(world, sess\)/.test(execute)
    && /if \(!accepted\) restoreWorldTurnState\(world, sess, beforeReceipt\)/.test(execute),
    'a rejected receipt must restore its captured session transaction');
assert(/const auditOk = \(committed\.audit\?\.rejected \|\| \[\]\)\.length === 0/.test(execute),
    'receipt acceptance must include semantic validation and cast assertions');
assert(/successfulStateCall = candidate\.accepted/.test(execute)
    && !/successfulStateCall = true/.test(execute),
    'a rejected receipt must not suppress the repair/freeze path');

const sessionHandler = app.slice(app.indexOf("document.getElementById('world-session-select').onchange"),
    app.indexOf("document.getElementById('world-session-zero-btn').onclick"));
assert(sessionHandler.indexOf('if (worldTurnInProgress)') < sessionHandler.indexOf('.activeSessionId = e.target.value'),
    'timeline switching must be blocked before changing activeSessionId');

const exitHandler = render.slice(render.indexOf('// 3. Location & Exits'), render.indexOf('// 4. Inventory & Outfit'));
assert(exitHandler.indexOf('if (worldTurnInProgress)') < exitHandler.indexOf('movePlayerAlongWorldPath'),
    'exit clicks must be rejected before any player movement during an active turn');

assert(/div\.dataset\.worldMessageId = String\(msg\.id\)/.test(worldPlaySource),
    'durable rendered messages must expose their world-message ID for reroll replacement');
assert(/if \(isReroll\) \{[\s\S]*?aiMsgDiv\.dataset\.rerollStreaming = 'true';/.test(worldPlaySource),
    'rerolls must reuse the committed DM card while the replacement take streams');
assert(/const staleText = aiMsgDiv\.querySelector\('\.msg-text'\);[\s\S]*?staleText\.innerHTML = ''/.test(worldPlaySource),
    'a reroll must clear superseded prose before its replacement narration streams');
assert(/if \(!sidecarMode && !streamUsesCommittedTurn\) aiMsgDiv\.remove\(\);/.test(worldPlaySource),
    'the legacy streaming cleanup must never remove a committed reroll card');
assert(/rerollTakeIndex = Array\.isArray\(lastMsg\.versions\) \? lastMsg\.versions\.length : 1;/.test(worldPlaySource)
    && /takeIndex: isReroll \? rerollTakeIndex : 0,/.test(worldPlaySource)
    && /sourceTurnId: isReroll \? rerollSourceTurnId : undefined,/.test(worldPlaySource),
    'a reroll must carry its new take identity through the Reader and Sidecar pipeline');
assert(!/worldVoiceColorSpeaker|recordWorldVoiceColorSpeaker|worldVoiceColorSpeakers/.test(worldPlaySource),
    'voice colours must not become cross-line or cross-turn speaker identities');
assert(/function worldTaggedDialogueHasUnknownSpeakerCue\(paragraph, quoteEnd\)/.test(worldPlaySource),
    'an explicitly described unknown speaker must not inherit a preceding canonical portrait');
assert(/AVAILABLE LOCAL CANONICAL CAST — NOT PRESENT YET/.test(worldPlaySource)
    && /localCastOptions/.test(worldPlaySource),
    'the narrator must receive a small exact-id local cast deck without treating it as committed presence');
assert(/function narratorWorldQuestionTools\(\)/.test(worldPlaySource)
    && /name: 'ask_world_context'/.test(worldPlaySource)
    && /answerNarratorWorldQuestion\(world, sess/.test(worldPlaySource),
    'the Sidecar narrator must have a bounded read-only World-question loop');
assert(/role: 'tool', tool_call_id: call\.id/.test(worldPlaySource)
    && /\[WORLD CONTEXT ANSWER RECEIVED\]/.test(worldPlaySource),
    'a narrator question and its host answer must be returned in the same model conversation before prose');
const worldProtocolSource = require('node:fs').readFileSync(
    'experiences/experimental-worlds/runtime/world-protocol-core.js', 'utf8'
);
assert(/scenePulseSourceIdentityProjection\(rawScenePulse = \{\}, readerEnvelope = \{\}\)/.test(worldProtocolSource),
    'ScenePulse source projection must preserve exact Reader identities for its name-addressable view');
assert(/scenePulseSourceIdentityProjection\(envelope\.scenePulse, envelope\)/.test(worldProtocolSource),
    'accepted ScenePulse handoffs must project Reader candidate ids to source-visible cards');
assert(/available_local_cast/.test(worldProtocolSource),
    'the Sidecar narrator context must expose optional local canonical cast with stable ids');
assert(/resolvedQuestionAnswers/.test(worldProtocolSource)
    && /WORLD QUESTIONS AND ANSWERS/.test(worldProtocolSource),
    'resolved ScenePulse and Sidecar Q/A must be carried into the next narrator packet');
assert(/experimental-worlds-core\.generated\.mjs\?v=20260913-world-question-loop-5/.test(hostAdapterSource),
    'the host adapter must load the World-question loop bundle rather than a cached older core');

console.log('✓ World turn receipt and cross-timeline transaction guards are present');
