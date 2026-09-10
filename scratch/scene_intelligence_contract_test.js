/**
 * ScenePulse / Worlds native-source integration checks.
 * Run with: node scratch/scene_intelligence_contract_test.js
 *
 * This guards the product boundary, not a copied adapter implementation:
 * ScenePulse must render through its vendored modules, Sidecar must own its
 * provider/settlement boundary, and direct source edits must remain auditable.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
// Pass 1 deliberately relocates the Experimental World implementation out of
// the host bootstrap.  The integration contract therefore inspects the host
// plus the complete mode-owned runtime, while still leaving ordinary host
// checks (navigation, workspace persistence and backup seams) against app.js.
const app = [
    read('app.js'),
    read('experiences', 'experimental-worlds', 'runtime', 'dossier-claims.js'),
    read('experiences', 'experimental-worlds', 'runtime', 'sidecar-core.js'),
    read('experiences', 'experimental-worlds', 'runtime', 'world-intelligence-core.js'),
    read('experiences', 'experimental-worlds', 'runtime', 'world-play-core.js'),
    read('experiences', 'experimental-worlds', 'runtime', 'world-protocol-core.js'),
    read('experiences', 'experimental-worlds', 'runtime', 'world-session-core.js'),
    read('experiences', 'experimental-worlds', 'runtime', 'world-studio-core.js')
].join('\n');
const sidecarCore = read('experiences', 'experimental-worlds', 'runtime', 'sidecar-core.js');
const runtime = read('experiences', 'experimental-worlds', 'scenepulse', 'scenepulse-source-runtime.js');
const css = read('experiences', 'experimental-worlds', 'styles', 'scene-pulse-worlds.css');
const html = read('index.html');
const source = (...parts) => read('experiences', 'experimental-worlds', 'scenepulse', 'vendor', 'ScenePulse', ...parts);
const sourcePanel = source('src', 'ui', 'panel.js');
const sourceUpdate = source('src', 'ui', 'update-panel.js');
const sourceNormalize = source('src', 'normalize.js');
const sourceTimeline = source('src', 'ui', 'timeline.js');
const sourceWiki = source('src', 'ui', 'character-wiki.js');
const sourceCharacterHistory = source('src', 'ui', 'character-history.js');
const sourceWeb = source('src', 'ui', 'relationship-web.js');
const sourceSparklines = source('src', 'ui', 'sparklines.js');
const sourceRelationshipsCss = source('css', 'relationships.css');
const sourceConstants = source('src', 'constants.js');
const sourceGuidedTour = source('src', 'settings-ui', 'guided-tour.js');
const sourceLoading = source('src', 'ui', 'loading.js');
const sourceSettings = source('src', 'settings.js');
const sourceSetupGuide = source('src', 'settings-ui', 'setup-guide.js');
const sourceI18n = source('src', 'i18n.js');
const sourceSlots = source('src', 'prompts', 'slots.js');
const sourceMacros = source('src', 'macros.js');
const sourceCommands = source('src', 'slash-commands.js');

function lastFunction(name, prefix = 'function') {
    const start = app.lastIndexOf(`${prefix} ${name}(`);
    assert(start >= 0, `missing ${name}`);
    const open = app.indexOf('{', app.indexOf(') {', start));
    let depth = 0;
    for (let index = open; index < app.length; index += 1) {
        if (app[index] === '{') depth += 1;
        if (app[index] === '}' && --depth === 0) return app.slice(start, index + 1);
    }
    throw new Error(`unclosed ${name}`);
}

function lastRuntimeFunction(name, prefix = 'function') {
    const start = runtime.lastIndexOf(`${prefix} ${name}(`);
    assert(start >= 0, `missing runtime ${name}`);
    const open = runtime.indexOf('{', runtime.indexOf(') {', start));
    let depth = 0;
    for (let index = open; index < runtime.length; index += 1) {
        if (runtime[index] === '{') depth += 1;
        if (runtime[index] === '}' && --depth === 0) return runtime.slice(start, index + 1);
    }
    throw new Error(`unclosed runtime ${name}`);
}

function lastSourceFunction(source, name, prefix = 'function') {
    const start = source.lastIndexOf(`${prefix} ${name}(`);
    assert(start >= 0, `missing source ${name}`);
    // Vendored ScenePulse uses both `function name() {` and the compact
    // `function name(){` style. Find the body after its own closing
    // parameter delimiter instead of assuming a formatting space.
    const open = source.indexOf('{', source.indexOf(')', source.indexOf('(', start)));
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`unclosed source ${name}`);
}

function frozenRuntimeStringArray(name) {
    const start = runtime.indexOf(`const ${name} = Object.freeze([`);
    assert(start >= 0, `missing ${name}`);
    const expressionStart = runtime.indexOf('Object.freeze(', start);
    const expressionEnd = runtime.indexOf(');', expressionStart);
    assert(expressionEnd > expressionStart, `unclosed ${name}`);
    return vm.runInNewContext(runtime.slice(expressionStart, expressionEnd + 1));
}

function objectLiteralAfter(source, marker) {
    const markerIndex = source.indexOf(marker);
    assert(markerIndex >= 0, `missing ${marker}`);
    const open = source.indexOf('{', markerIndex + marker.length);
    assert(open >= 0, `missing object literal after ${marker}`);
    let quote = '';
    let escaped = false;
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            if (escaped) { escaped = false; continue; }
            if (char === '\\') { escaped = true; continue; }
            if (char === quote) quote = '';
            continue;
        }
        if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
        if (char === '{') depth += 1;
        if (char === '}' && --depth === 0) return source.slice(open, index + 1);
    }
    throw new Error(`unclosed object literal after ${marker}`);
}

const normalizer = lastFunction('normalizeSidecarReaderEnvelope');
const merger = lastFunction('mergeSidecarReaderEnvelope');
const characterPresenceNormalizer = lastFunction('normalizeSidecarPresenceMode');
const characterIntelligenceNormalizer = lastFunction('normalizeSidecarCharacterIntelligence');
const cognitionThoughtFallback = lastFunction('sidecarCognitionThoughtFallback');
const scenePulseCharacterCognitionBridge = lastFunction('scenePulseCharacterCognitionBridge');
const currentTurn = lastFunction('currentSidecarAuthoredTurn');
const acceptedHandoff = lastFunction('scenePulseAcceptedHandoff');
const humanOverlay = lastFunction('scenePulseHumanOverlay');
const sourceEdit = lastFunction('commitScenePulseSourceEdit', 'async function');
const sourcePrefs = lastFunction('persistScenePulseSourceRuntimePreferences', 'async function');
const sourcePreferenceNormalizer = lastFunction('normalizeScenePulseWorldsPreferences');
const questChanges = lastFunction('scenePulseQuestChanges');
const questTranslations = lastFunction('applyScenePulseQuestEditTranslations');
const resolveQuestTranslation = lastFunction('resolveScenePulseQuestTranslation', 'async function');
const relationshipChanges = lastFunction('scenePulseRelationshipChanges');
const relationshipTranslations = lastFunction('applyScenePulseRelationshipEditTranslations');
const relationshipApply = lastFunction('applyScenePulseRelationshipChange');
const relationshipPromptProjection = lastFunction('scenePulseRelationshipPromptProjection');
const ffContextCompiler = lastFunction('compileFF54SidecarContext');
const panelMount = lastFunction('renderScenePulseWorldsWorkspace');
const switchViewFunction = lastFunction('switchView');
const enterWorldFunction = lastFunction('enterWorld');
const nativePresentationAuthority = lastFunction('scenePulseDeclaredNativeFieldAuthority');
const readerPass = lastFunction('runSidecarSemanticReading', 'async function');
const readerRefresh = lastFunction('refreshSidecarSceneIntelligence', 'async function');
const acceptedReaderRefresh = lastFunction('acceptSidecarReaderRefresh');
const acceptedRefresh = lastFunction('refreshAcceptedScenePulseProjection', 'async function');
const snapshotRawEnvelope = lastFunction('sidecarReaderSnapshotRawEnvelope');
const candidateEligibility = lastFunction('scenePulseCandidatePromotionEligibility');
const candidateCharacterEvidence = lastFunction('scenePulseCharacterEvidenceForCandidate');
const controlledCandidatePredicate = lastFunction('scenePulseCandidateIsControlledCharacter');
const candidatePromotionDraft = lastFunction('scenePulseCandidatePromotionDraft');
const candidateStage = lastFunction('stageScenePulseCandidateForWorldReview', 'async function');
const candidateLink = lastFunction('linkScenePulseCandidateToCanonical', 'async function');
const candidateDuplicateResolution = lastFunction('resolveScenePulseCandidateDuplicate', 'async function');
const impliedPromotion = lastFunction('promoteImpliedWorldRecord', 'async function');
const promotionAppearance = lastFunction('applyScenePulsePromotionAppearance');
const promotionLocation = lastFunction('applyScenePulsePromotionLocation');
const graphNormalizer = lastFunction('normalizeSidecarNpcRelationshipGraph');
const worldStatusResize = lastFunction('initWorldStatusResizeHandle');
const restoreScenePulseStatusWidth = lastFunction('restoreScenePulseStatusColumnWidth');
const sharedLibraryInit = lastFunction('initializeSharedLibrarySync', 'async function');
const workspacePersist = lastFunction('persistWorkspaceState', 'async function');
const statePersist = lastFunction('persistStateSnapshot', 'async function');
const sourceMacroOrigin = lastRuntimeFunction('sourceMacroOrigin');
const sourceCommandStatus = lastRuntimeFunction('sourceCommandStatus');
const sourceCommand = lastRuntimeFunction('runSourceCommand', 'async function');
const sourceRefresh = lastRuntimeFunction('beginReaderRefresh');
const sourceSetup = lastRuntimeFunction('showWorldsSetupGuide');
const sourceBridgeControls = lastRuntimeFunction('injectBridgeControls');
const sourceDiscard = lastRuntimeFunction('discardSourceEphemeralEditors');
const sourceDiscardChanges = lastRuntimeFunction('discardSourceChanges');
const sourceSnapshotHandoff = lastRuntimeFunction('handoffForCurrentSnapshot');
const sourceClockCanonicalizer = lastRuntimeFunction('sourceCanonicalClockValue');
const sourceNormalizedRetention = lastRuntimeFunction('retainSourceNormalizedSnapshot');
const sourceHumanFieldOrigin = lastRuntimeFunction('nativeFieldSource');
const sourceFieldComparator = lastRuntimeFunction('scenePulseFieldEquivalent');
const sourceSectionAccessibility = lastRuntimeFunction('enhanceSourceSectionAccessibility');
const sourceControlledRecordFilter = lastRuntimeFunction('stripControlledSourceRecords');
const sourcePlayerIdentity = lastRuntimeFunction('declaredSourcePlayerName');
const sourceNormalizedSnapshot = lastRuntimeFunction('retainSourceNormalizedSnapshot');
const sourceUnmount = lastRuntimeFunction('unmount');
const sourceControlledPlayerComparison = lastRuntimeFunction('controlledPlayerBoundaryEquivalent');
const sourceGraphComparison = lastRuntimeFunction('relationshipGraphReviewMarkup');
const sourceCompleteRelationship = lastRuntimeFunction('hasCompleteSourceRelationshipProjection');
const sourceRelationshipFixtureSupport = lastRuntimeFunction('preserveFixtureRelationshipDisplaySupport');
const sourceSnapshotRenderable = lastRuntimeFunction('sourceSnapshotHasRenderableScene');
const sourcePanelRenderRecovery = lastRuntimeFunction('scheduleSourcePanelRenderRecovery');
const freshSourceModules = lastRuntimeFunction('loadFreshSourceModules');
const sourceModuleLoader = lastRuntimeFunction('loadModules', 'async function');
const sourceRelationshipPhaseRenderer = lastRuntimeFunction('sourceRelationshipPhaseForRenderer');
const sourceRelationshipPhaseAdapter = lastRuntimeFunction('adaptSourceRelationshipPhases');
const hostActionHandler = lastFunction('bindScenePulseWorldsHostActions');
const sourceHostActions = frozenRuntimeStringArray('SOURCE_HOST_ACTIONS');

assert.match(normalizer, /semanticSuppliedFields/, 'normalizer must retain semantic supplied-field provenance');
assert.match(merger, /semanticProvided/, 'delta merger must retain nested semantic field provenance');
assert.match(normalizer, /scenePulseCharacterCognitionBridge/, 'a rich ScenePulse character card must be able to supplement the existing cognition lane');
assert.match(characterPresenceNormalizer, /in_person/, 'a declared in-person Reader presence must normalize to the ScenePulse active lane');
assert.match(app, /character_turn_cognition_reader_thought_fallback/, 'an invalid optional cognition-model response must retain the accepted ScenePulse thought rather than dropping it');
assert.match(scenePulseCharacterCognitionBridge, /if \(!stableId \|\| !name \|\| !thought \|\| controlledCard/, 'card cognition may not use a display name or invent a subject identity');
assert.match(scenePulseCharacterCognitionBridge, /const presenceMode = rosterPresence\(stableId, name, card\);[\s\S]*?if \(!presenceMode\) return;/, 'card cognition may not invent current-scene presence');
assert.match(scenePulseCharacterCognitionBridge, /controlledCard\(card, stableId\)/, 'a rich ScenePulse card must never create an unexpressed player thought');
assert.equal((app.match(/^function normalizeSidecarReaderEnvelope\(/gm) || []).length, 1, 'only one active Sidecar Reader normalizer may exist');
assert.equal((app.match(/^function parseSidecarReaderOutput\(/gm) || []).length, 1, 'only one active Sidecar Reader parser may exist');
assert.equal((app.match(/^function mergeSidecarReaderEnvelope\(/gm) || []).length, 1, 'only one active Sidecar Reader delta merger may exist');
assert.equal((app.match(/^function attachSidecarReaderSnapshot\(/gm) || []).length, 1, 'only one active Sidecar Reader snapshot attachment path may exist');
assert.ok(app.includes('const FF_VOICE_TAG_PATTERN = /<([a-z][a-z0-9]*)(?::([a-z][a-z0-9_-]*))?>'), 'the narrative presenter must recognize optional FF delivery cues on colour tags');
assert.match(app, /function ffVoiceTags\(text\)[\s\S]*?tone !== String\(closingTone \|\| ''\)\.toLowerCase\(\)/, 'a qualified FF voice tag must require matching colour and delivery cue at both ends');
assert.match(app, /const voiceTags = ffVoiceTags\(paragraph\)/, 'qualified FF voice tags must feed the dialogue-card renderer');
assert.match(app, /function stripFFVoiceTags\(text\)[\s\S]*?FF_VOICE_TAG_PATTERN/, 'non-cinematic rendering must remove only structurally valid qualified FF voice tags');
assert.match(currentTurn, /sess\.history.*\.reverse\(\)/s, 'current authored turn must follow visible history');
assert.match(app, /const SCENEPULSE_TOUR_EXAMPLE_DATA = Object\.freeze/, 'the actual source tutorial fixture must remain present');
const vendoredTourFixture = vm.runInNewContext(`(${objectLiteralAfter(sourceConstants, 'export const TOUR_EXAMPLE_DATA=')})`);
const hordeTourFixture = vm.runInNewContext(`(${objectLiteralAfter(app, 'const SCENEPULSE_TOUR_EXAMPLE_DATA = Object.freeze(')})`);
assert.deepEqual(JSON.parse(JSON.stringify(hordeTourFixture)), JSON.parse(JSON.stringify(vendoredTourFixture)),
    'Horde must mount the vendored TOUR_EXAMPLE_DATA verbatim, field for field, as the sealed Golden fixture');
assert.match(acceptedHandoff, /scenePulseHumanOverlay\(protocol, fixtureWithPreferences\)/, 'fixture state must accept an explicit human edit overlay without registry backfill');
assert.match(acceptedHandoff, /settlementStatus === 'settled'[\s\S]*snapshot\?\.turnId/, 'live handoff must be exact-turn settled');
assert.match(acceptedHandoff, /const settledForLatestTurn = latestTurnAccepted[\s\S]*?const settled = settledForLatestTurn \|\| historySnapshots\.at\(-1\) \|\| null/, 'an incomplete newest turn must retain the last settled ScenePulse packet rather than substitute the tutorial');
assert.match(acceptedHandoff, /lastKnown: retainingLastKnownScene/, 'last-known presentation must be explicit provenance, not a disguised current handoff');
assert.match(acceptedHandoff, /normalizeSidecarScenePulseShape\(envelope\.scenePulse\)/, 'restored accepted snapshots must receive the same source-shape normalization as new Reader input');
assert.match(acceptedHandoff, /normalizeSidecarScenePulseShape\(snapshot\.envelope\.scenePulse\)/, 'historical source materializations must preserve repaired field shapes too');
assert.doesNotMatch(acceptedHandoff, /world\.entities|world\.quests|sess\.quests/, 'accepted ScenePulse handoff must not borrow Horde registry fields');
assert.match(nativePresentationAuthority, /SCENEPULSE_NATIVE_PRESENTATION_FIELDS/, 'the ScenePulse-facing ownership family must be explicit');
assert.match(acceptedHandoff, /nativeFieldAuthority/, 'each accepted handoff must carry the declared source-field authority');
assert.match(acceptedHandoff, /candidateReview/, 'settled identity handoffs must remain beside the ScenePulse tracker rather than inside it');
assert.match(workspacePersist, /await HordeDB\.set\('workspaceStateV2', snapshot\);[\s\S]*?pendingWorkspaceState = snapshot;/, 'the persisted workspace point must become the next startup freshness baseline');
assert.match(statePersist, /const workspaceSnapshot = captureWorkspaceState\(\);/, 'a full save must capture one explicit workspace point');
assert.match(statePersist, /await HordeDB\.setMultiple\(records\);[\s\S]*?pendingWorkspaceState = workspaceSnapshot;/, 'a successful full save must update the shared-library reload guard with the actual persisted workspace point');
assert.match(acceptedHandoff, /relationshipReview/, 'saved ScenePulse relationship translations must remain Inspect-only beside the source tracker');
assert.match(app, /function scenePulseActiveSourceProfile\(/, 'the selected source Profile must be resolvable at the Reader boundary');
assert.match(app, /function scenePulseEffectiveSourceCustomPanels\(/, 'the native panel and Reader must share one effective source custom-panel schema');
assert.match(nativePresentationAuthority, /scenePulseEffectiveSourceCustomPanels\(uiPreferences\)/, 'tour custom-panel keys must be declared for field-by-field Reader adoption');
assert.match(acceptedHandoff, /scenePulseWorldsHandoffPreferences/, 'the accepted handoff must carry source-resolved custom panels to the native runtime');
assert.match(app, /function scenePulseSourceProfilePromptContext\(/, 'the selected source Profile needs a constrained Reader prompt context');
assert.match(readerPass, /sourceProfileContext\.instruction/, 'source Profile instructions must reach the Sidecar Reader');
assert.match(app, /function scenePulseResolvedPromptSlotEntries\(/, 'source Profile slot resolution must have a direct, testable Reader boundary');
assert.match(readerPass, /scenePulseResolvedPromptSlotEntries\(/, 'source Profile slot overrides must be resolved at the Reader boundary');
assert.match(app, /function scenePulseSourceProfileFieldConfiguration\(/, 'source Profile dynamic field configuration must have a constrained Reader boundary');
assert.match(readerPass, /sourceProfileFieldInstruction/, 'source Profile panel and field choices must reach the Sidecar Reader');
assert.match(readerPass, /SCENEPULSE SOURCE FIELD CONFIGURATION/, 'source Profile dynamic field guidance must stay explicit in the Reader prompt');
assert.match(readerPass, /sourcePromptSlotInstruction/, 'source Profile slot overrides must become an explicit Reader prompt block');
assert.match(readerPass, /sourcePromptSlotEntries\.length \?/, 'a source Profile slot edit must work even when no bundled preset is selected');
assert.match(app, /\{ \.\.\.presetOverrides, \.\.\.profileOverrides \}/, 'source Profile slot edits must override advisory preset slots');
assert.doesNotMatch(readerPass, /const presetInstruction = sourcePreset\?\.id/, 'source Profile slot edits must not be hidden behind a preset-only prompt branch');
assert.match(readerPass, /scenePulseSourceProfile/, 'accepted Reader metadata must retain source Profile provenance');
assert.match(readerPass, /SCENEPULSE NPC RELATIONSHIP WEB/, 'the one Sidecar Reader pass must own the source NPC graph interpretation');
assert.match(readerPass, /Do not make a second graph-generation call/, 'the Reader contract must forbid an independent ScenePulse graph inference');
assert.match(readerPass, /SCENEPULSE STABLE RECORD IDENTITIES/, 'the first rich ScenePulse projection must require stable source record identities');
assert.match(readerPass, /Every branch is exactly \{type, name, hook\}/, 'the Reader prompt must keep Story Idea category, title and hook distinct');
const stageStoryIdea = lastFunction('stageScenePulseStoryIdea');
assert.match(stageStoryIdea, /isPlainObject\(direction\)/, 'Story Idea source objects must be converted at the host boundary rather than coerced into the draft');
assert.ok(stageStoryIdea.includes("const article = /^[aeiou]/i.test(type) ? 'an' : 'a';"), 'Story Idea host staging must choose a grammatical source OOC article for every source category');
assert.match(stageStoryIdea, /Take the story in \$\{article\} \$\{type\} direction/, 'Story Idea host staging must preserve the source OOC direction format');
assert.doesNotMatch(stageStoryIdea, /const text = String\(direction \|\| ''\)/, 'Story Idea source objects must never produce [object Object] drafts');
const stagedStoryIdeaComposer = { value: '', dispatchEvent() {}, focus() {} };
vm.runInNewContext(`${stageStoryIdea}; stageScenePulseStoryIdea({ direction: { type: 'exploratory', name: 'Line check', hook: 'Test the repaired cider line.' } });`, {
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value),
    document: { getElementById: id => id === 'world-user-input' ? stagedStoryIdeaComposer : null },
    Event: class Event { constructor(type, options) { this.type = type; this.options = options; } },
    resizeWorldMessageInput() {},
    ExperimentalWorldsHost: { notify() {} }
});
assert.match(stagedStoryIdeaComposer.value, /^\[OOC: Take the story in an exploratory direction — "Line check"\. Test the repaired cider line\.\]$/, 'the native Exploratory card must produce grammatical OOC text before it reaches the World composer');
assert.match(readerPass, /Do not derive an ID from a display name/, 'Reader identity must never be inferred from a mutable source label');
assert.match(readerPass, /complete aliases array in the same changed-only ScenePulse patch/, 'an explicit visible alias change must survive the compact ScenePulse delta');
assert.match(readerPass, /Each relationship record MUST include relationshipId and its characterId/, 'relationship dimensions need stable identity from their first source projection');
assert.match(readerPass, /const priorReaderSnapshotId = String\(options\.priorReaderSnapshotId/, 'a delta Reader must receive the actual accepted snapshot identity rather than guess it');
assert.match(readerPass, /COMPLETION BUDGET — HARD/, 'the Reader must favor a complete compact delta over a truncated verbose packet');
assert.match(readerPass, /Reader compact recovery/, 'a completion-capped Reader response must receive one bounded compact reread of the same beat');
assert.match(readerPass, /const finalResponseRound = maxRounds \+ 1/, 'a Reader that reaches its lookup limit must get one final response round');
assert.match(readerPass, /const forceFinalReaderResponse = round === finalResponseRound/, 'the final Reader response must be an explicit bounded phase');
assert.match(readerPass, /if \(!forceFinalReaderResponse\) \{[\s\S]*?body\.tools = tools;/, 'the final Reader response must omit lookup tools');
assert.match(readerPass, /Reader forcing final JSON response after tool limit/, 'the forced final Reader response must remain auditable');
assert.match(app, /forceWithoutReasoning = false/, 'bounded recovery must be able to explicitly suppress optional provider reasoning');
const reconciliationPass = lastFunction('runSidecarReconciliation', 'async function');
assert.match(reconciliationPass, /COMPACT SIDECAR COMMIT RECOVERY/, 'a completion-capped reconciliation must retain one compact receipt recovery');
assert.match(reconciliationPass, /tools: \[compactSidecarCommitTool\(commitTool\)\], tool_choice: 'required'/, 'compact recovery must retain the one native commit boundary');
assert.match(reconciliationPass, /retryPolicy: 'none', forceWithoutReasoning: true/, 'compact recovery must not consume budget on a second reasoning pass');
assert.match(reconciliationPass, /Reconciliation compact commit recovery/, 'compact recovery attempts must remain auditable');
assert.match(sharedLibraryInit, /const localSavedAt = Number\(pendingWorkspaceState\?\.savedAt\) \|\| 0/, 'startup sync must compare the durable local snapshot timestamp before replacing it');
assert.match(sharedLibraryInit, /const localSnapshotIsNewer = hasPublishableLocalLibrary\(\)[\s\S]*?localSavedAt > \(Number\(status\?\.updatedAt\) \|\| 0\)/, 'a bridge revision must not outrank a newer local snapshot by itself');
assert.match(sharedLibraryInit, /remoteWasNewer && !localSnapshotIsNewer/, 'auto-pull must be limited to remote snapshots that are not older than local data');
assert.match(sharedLibraryInit, /Shared-library auto-pull deferred: a newer local snapshot is protected/, 'a protected local fork must produce auditable conflict evidence rather than silent replacement');
assert.match(readerPass, /relationship\.meterDeltas as signed numeric changes/, 'Reader relationship updates must use compact signed meter deltas after their baseline');
assert.match(readerPass, /missing any of those five meters or five named labels is also unbaselined/, 'an incomplete legacy relationship must receive a full visible meter-and-label baseline before delta-only updates begin');
assert.match(readerPass, /affectionLabel, trustLabel, desireLabel, stressLabel, compatibilityLabel/, 'a relationship baseline must provide all five named ScenePulse meter labels');
assert.match(readerPass, /Never substitute a generic labels array/, 'the Reader may not collapse distinct source meter labels into an ambiguous list');
assert.match(readerPass, /SCENEPULSE ACTIVE RELATIONSHIP COVERAGE/, 'an active authored exchange must populate a real ScenePulse relationship instead of leaving a source-generated unknown stub');
assert.match(app, /if \(options\.renderReview !== false\) renderWorldPlayState\(\)/, 'a native source refresh must be able to stage a valid Reader packet without remounting before acceptance');
assert.match(lastFunction('refreshAcceptedScenePulseProjection', 'async function'), /renderReview: false/, 'foreground ScenePulse refreshes must use the atomic stage-and-accept route');
assert.match(sidecarCore, /readerSnapshots: \[\], readerRefreshes: \[\]/, 'the Sidecar protocol must persist Reader refreshes until they are accepted or rejected');
assert.match(sidecarCore, /'readerSnapshots','readerRefreshes','sceneProjections'/, 'the timeline normalizer must retain the Reader review ledger through refresh staging');
assert.match(app, /rawEnvelope: safeJsonClone\(source\)/, 'each settled Reader snapshot must retain its exact compact packet beside its cumulative projection');
assert.match(snapshotRawEnvelope, /snapshot\?\.rawEnvelope/, 'the source handoff must prefer a snapshot-specific packet over the authored turn fallback');
assert.match(acceptedReaderRefresh, /mode: replacesProjection \? 'full' : 'delta'/, 'a focused ScenePulse refresh must preserve compact-delta mode through acceptance');
assert.match(acceptedReaderRefresh, /fullRefresh: replacesProjection/, 'only an explicitly full Reader reread may replace the settled projection');
assert.match(acceptedHandoff, /sidecarReaderSnapshotRawEnvelope\(settled, sourceTurn\)/, 'Inspect must read the currently settled refresh packet, not an older authored-turn delta');
assert.match(acceptedHandoff, /const acceptedScenePulse = settledScenePulse;/, 'the render boundary must not apply an accepted compact delta twice');
assert.match(lastFunction('retrySidecarSceneUpdate', 'async function'), /reusableReaderSnapshot/, 'retry may reuse only Reader evidence which crossed the snapshot boundary');
assert.match(normalizer, /npcRelationshipGraph/, 'Reader normalization must retain the compact NPC graph beside ScenePulse fields');
assert.match(merger, /providedField\('npcRelationshipGraph'\)/, 'NPC graph cache updates must honor nested delta-field provenance');
assert.match(acceptedHandoff, /npcRelationshipGraph/, 'accepted handoffs must retain Reader graph data beside the source tracker');

assert.match(html, /scenepulse-source-runtime\.js/, 'native source runtime must be loaded before app.js');
assert.match(panelMount, /HordeScenePulseSourceRuntime\.mount\(host, handoff\)/, 'World HUD must mount native source runtime');
assert.match(panelMount, /if \(sidecar\) restoreScenePulseStatusColumnWidth\(column\);/, 'ScenePulse must restore its own compact sidebar width rather than inherit an oversized HUD column');
assert.doesNotMatch(panelMount.slice(0, panelMount.indexOf('// Gate B adapter below')), /HordeScenePulseWorlds\.mount\(host, handoff\)/, 'native source failure must not silently fall back to the hand-drawn adapter');
assert.match(panelMount, /intentionally not substituted with a host lookalike/, 'failure state must remain truthful');
assert.match(panelMount, /if \((?:ExperimentalWorldsState|state)\.view !== 'worldPlay'\)[\s\S]*?HordeScenePulseSourceRuntime\?\.unmount/, 'a late World redraw may not mount ScenePulse over a library route');
assert.match(switchViewFunction, /state\.view === 'worldPlay' && viewName !== 'worldPlay'[\s\S]*?HordeScenePulseSourceRuntime\?\.unmount/, 'leaving World Play must remove the source runtime and its document-level effects');
assert.ok(enterWorldFunction.indexOf("switchView('worldPlay');") < enterWorldFunction.indexOf('renderWorldPlayState();'), 'entering a World must activate the World route before mounting the ScenePulse runtime');

assert.match(runtime, /native-source-modules-via-horde-compatibility-scaffold/, 'runtime must identify its temporary compatibility role');
assert.match(runtime, /SOURCE_REL_PHASE_DISPLAY_ALIASES/, 'the source bridge must adapt known legacy phase tokens only at the display boundary');
assert.match(sourceRelationshipPhaseAdapter, /sourceRelationshipPhaseForRenderer/, 'the native tracker must adapt relationship phases before source normalization');
assert.equal(vm.runInNewContext(`${sourceRelationshipPhaseRenderer}\nsourceRelationshipPhaseForRenderer('established_regular')`, {
    SOURCE_REL_PHASE_DISPLAY_ALIASES: { established_regular: 'Friendly', established_kinship: 'Close' }
}), 'Friendly', 'the known regular-relationship token must render with ScenePulse’s Friendly phase');
assert.equal(vm.runInNewContext(`${sourceRelationshipPhaseRenderer}\nsourceRelationshipPhaseForRenderer('established_kinship')`, {
    SOURCE_REL_PHASE_DISPLAY_ALIASES: { established_regular: 'Friendly', established_kinship: 'Close' }
}), 'Close', 'the known kinship token must render with ScenePulse’s Close phase');
assert.equal(vm.runInNewContext(`${sourceRelationshipPhaseRenderer}\nsourceRelationshipPhaseForRenderer('Volatile')`, {
    SOURCE_REL_PHASE_DISPLAY_ALIASES: { established_regular: 'Friendly', established_kinship: 'Close' }
}), 'Volatile', 'an existing source phase must pass through unchanged');
assert.equal(vm.runInNewContext(`${sourceRelationshipPhaseRenderer}\nsourceRelationshipPhaseForRenderer('unresolved_horde_phase')`, {
    SOURCE_REL_PHASE_DISPLAY_ALIASES: { established_regular: 'Friendly', established_kinship: 'Close' }
}), 'unresolved_horde_phase', 'an unknown phase must remain available for the source coercer instead of being invented by Horde');
assert.match(runtime, /SOURCE_MODULE_PATHS/, 'runtime must name the exact source module loading set');
assert.match(runtime, /'ui\/panel\.js'/, 'runtime must import the source panel module');
assert.match(runtime, /'ui\/update-panel\.js'/, 'runtime must import the source panel renderer');
assert.match(runtime, /'ui\/timeline\.js'/, 'runtime must import the source history renderer');
assert.match(runtime, /'ui\/character-wiki\.js'/, 'runtime must load source wiki behavior');
assert.match(runtime, /'ui\/relationship-web\.js'/, 'runtime must load source relationship-web behavior');
assert.match(runtime, /'ui\/loading\.js'/, 'runtime must load the source loading lifecycle primitives');
assert.match(runtime, /for \(const relative of SOURCE_MODULE_PATHS\)[\s\S]*?await import\(`\$\{ROOT\}\/\$\{relative\}\$\{suffix\}`\)/, 'source modules must load sequentially to avoid cold-reload request bursts');
assert.match(runtime, /\?horde_source_retry=\$\{encodeURIComponent\(retryToken\)\}/, 'a rejected cold-load module record must use a distinct URL for its one retry');
assert.match(freshSourceModules, /return loadSourceModules\(retryToken\)/, 'the retry must still load ScenePulse source modules rather than a Horde substitute');
assert.match(sourceModuleLoader, /Source module import failed; retrying the pinned local source once/, 'a fresh source import retry must be explicitly auditable');
assert.match(sourceModuleLoader, /retryError\.cause = firstError/, 'final source failure must retain the original module-load cause');
assert.doesNotMatch(runtime, /import\(`\$\{ROOT\}\/index\.js`\)/, 'runtime must not launch ScenePulse autonomous ST/provider interceptor');
assert.match(runtime, /modules\.panel\.createPanel\(\)/, 'source must create its own panel DOM');
assert.match(runtime, /const current = active\(\);\s*if \(current\?\.host && panel\.parentElement !== current\.host\) current\.host\.appendChild\(panel\);/, 'the source mount must resolve its active Horde host before reparenting the panel');
assert.match(runtime, /current\?\.host && panel\.parentElement !== current\.host\) current\.host\.appendChild\(panel\)/, 'the source panel must be reparented into the World status column rather than cover the app viewport');
assert.match(runtime, /modules\.updatePanel\.updatePanel\(normalized, true\)/, 'source must render its own normalized panel');
assert.match(runtime, /modules\.timeline\.renderTimeline\(\)/, 'source must render its own history UI');
assert.match(runtime, /modules\.thoughts\.updateThoughts\(normalized\)/, 'source thought module must render its own panel');
assert.match(runtime, /enhanceSourceSectionAccessibility\(panel\);/, 'native sections must receive the Worlds keyboard disclosure enhancement after each source redraw');
assert.match(sourceSectionAccessibility, /title\.setAttribute\('role', 'button'\)/, 'the existing source title must become the keyboard disclosure control without replacing the source header');
assert.match(sourceSectionAccessibility, /title\.setAttribute\('aria-controls', contentId\)/, 'the keyboard disclosure control must name its source section body');
assert.match(sourceSectionAccessibility, /title\.setAttribute\('aria-expanded'/, 'the source disclosure control must expose its current state to assistive technology');
assert.match(sourceSectionAccessibility, /event\.key !== 'Enter' && event\.key !== ' '/, 'source section disclosure must support both Enter and Space');
assert.match(sourceSectionAccessibility, /title\.click\(\)/, 'keyboard disclosure must delegate to the original source header click behavior');
assert.match(sourceSectionAccessibility, /queueMicrotask\(sync\)/, 'the accessibility state must follow the source click handler rather than duplicate its open-state logic');
assert.match(runtime, /function enhanceSourceStoryIdeaActions\(/, 'source Story Ideas actions must retain keyboard semantics without replacing source cards');
assert.match(runtime, /stage-story-idea/, 'source Story Ideas actions must cross the named World draft boundary');
assert.match(runtime, /SOURCE_STORY_IDEA_TYPES\.has\(name\.replace\('sp-idea-', ''\)\)/, 'Story Idea action extraction must ignore the shared sp-idea-card class and retain the visible source category');
assert.match(runtime, /ScenePulse action did not reach the active World/, 'an unclaimed source action must surface source recovery rather than silently resolve as a no-op');
assert.match(runtime, /materializeNativeTracker/, 'fixture-backed fields must be materialized before source render');
assert.match(sourceControlledRecordFilter, /controlledSourceCharacter/, 'an explicitly tagged controlled character must be filtered before building source history');
assert.match(sourceControlledRecordFilter, /tracker\.charactersPresent.*?filter/s, 'the controlled character cannot remain in a source present roster');
assert.match(sourceControlledRecordFilter, /tracker\.relationships.*?filter/s, 'the controlled character cannot become a second Relationship Web tie');
assert.match(sourcePlayerIdentity, /handoff\?\.scenePulse/, 'the Relationship Web centre must retain the handoff-declared player name after source filtering');
assert.match(sourceNormalizedSnapshot, /baselineSnapshots/, 'source-normalized presentation must keep its save baseline aligned with the visible source snapshot');
assert.match(runtime, /retainSourceNormalizedSnapshot\(current, modules\.normalize\.normalizeTracker\(repairSourceStoryIdeaShape\(snapshot\)\)\)/, 'Wiki, Web, and panel must share the exact source-normalized snapshot after the narrow Story Ideas repair');
assert.match(sourceControlledPlayerComparison, /\['characters', 'charactersPresent'\]/, 'only the controlled-player roster fields may receive this explicit source comparison boundary');
assert.match(sourceControlledPlayerComparison, /stripControlledSourceRecords\(clone\(sidecar/, 'the comparison must retain raw Sidecar data and test only the source-compatible view');
assert.match(sourceGraphComparison, /Awaiting second NPC/, 'a one-NPC scene must explain why the source NPC graph is not mounted');
assert.match(sourceGraphComparison, /Player excluded from NPC graph/, 'a graph packet that includes the controlled player must remain visibly withheld rather than silently altered');
assert.match(sourceCompleteRelationship, /\['name', 'relType', 'relPhase', 'timeTogether', 'milestone'\]/, 'a live relationship must provide every source-visible metadata field before it replaces the populated fixture collection');
assert.match(sourceCompleteRelationship, /\['affection', 'trust', 'desire', 'stress', 'compatibility'\]/, 'a live relationship must provide the complete five-dimensional source meter set before adoption');
assert.match(sourceRelationshipFixtureSupport, /fixture\.relationships/, 'missing live relationship data must retain the sealed fixture relationship cards');
assert.match(sourceRelationshipFixtureSupport, /tracker\._spViewFiltered = true/, 'fixture relationship support must stop the source filter from synthesizing an unknown relationship stub');
assert.match(runtime, /fixtureDisplaySupport = fixtureDisplaySupportFields/, 'fixture-supported source cards must remain visibly provenance-labelled during partial live adoption');
assert.match(runtime, /const customPanels = Array\.isArray\(prefs\.customPanels\) \? clone\(prefs\.customPanels\) : \[\];/, 'native runtime must render the handoff source schema rather than recreate a Horde-local tour panel');
assert.doesNotMatch(runtime, /RPG Stats \(Tour Example\)/, 'the upstream tour panel schema must enter through the source handoff, not a duplicate runtime fallback');
assert.match(runtime, /if \(!authority\.size\) return adaptSourceRelationshipPhases\(stripControlledSourceRecords\(fixture\)\)/, 'an older handoff with no declared field path must remain fixture-backed without duplicating the controlled player');
assert.match(runtime, /nativeFieldAuthority/, 'field-by-field authority must be explicit rather than inferred from live mode');
assert.match(runtime, /nativeFieldHasAcceptedValue/, 'a declared field must still prove an accepted value before replacing the tutorial support');
assert.match(runtime, /!clear\.has\(key\).*?!replace\.has\(key\).*?!hasValue\(value\)/s, 'implicit empty live values must not shrink source fixture data');
assert.match(sourceNormalize, /preserveConfiguredCustomPanelFields\(d,o\)/, 'the native normalizer must retain configured custom-panel values for the source renderer');
const sourceCustomPanelValues = vm.runInNewContext(`${lastSourceFunction(sourceNormalize, 'preserveConfiguredCustomPanelFields')}\npreserveConfiguredCustomPanelFields({ cider_line_status: 'Sarah wrestling regulator in cellar', unrelated_horde_field: 'must not render' }, {})`, {
    getActivePanels: () => [{ fields: [{ key: 'cider_line_status', enabled: true }, { key: 'disabled_field', enabled: false }] }]
});
assert.deepEqual(JSON.parse(JSON.stringify(sourceCustomPanelValues)), {
    cider_line_status: 'Sarah wrestling regulator in cellar'
}, 'the native normalizer must retain only declared active custom-panel values, not arbitrary Horde fields');
assert.match(sourceRelationshipsCss, /\.sp-meter-row \{ display: grid; grid-template-columns: auto 1fr minmax\(0, 70px\) 44px;/, 'source relationship meters must retain horizontal grid tracks');
assert.match(sourceRelationshipsCss, /\.sp-meter-bar-fill \{ height: 100%;[\s\S]*?transition: width/, 'the coloured relationship fill must encode current horizontal width');
assert.match(sourceRelationshipsCss, /\.sp-meter-bar-prev \{ position: absolute; top: 0; bottom: 0; width: 2px;/, 'the previous-value delta marker must remain a vertical line on the horizontal track');
assert.ok(html.indexOf('experiences/experimental-worlds/scenepulse/vendor/ScenePulse/style.css') < html.indexOf('experiences/experimental-worlds/styles/scene-pulse-worlds.css'), 'the native Experimental Worlds bridge stylesheet must load after the vendored source CSS');
assert.match(css, /#world-sidecar-workspace > #sp-panel\[data-horde-source-runtime="true"\]:not\(\.sp-mode-mobile\):not\(\.sp-mode-tablet\) \{ position: relative !important; inset: auto !important;/, 'desktop native ScenePulse must stay contained in the World status column');
assert.doesNotMatch(css, /#sp-panel\[data-horde-source-runtime="true"\] \{ position: fixed !important; inset: 0 !important;/, 'the native bridge must not turn the desktop ScenePulse sidebar into a viewport takeover');
assert.match(css, /#world-play-view \.world-status-col\.is-sidecar \{ width: var\(--world-scenepulse-sidebar-w,340px\) !important; min-width: 280px !important; max-width: 520px !important; flex: 0 0 var\(--world-scenepulse-sidebar-w,340px\) !important; \}/, 'ScenePulse needs its own compact resizable World column');
assert.match(worldStatusResize, /column\.classList\.contains\('is-sidecar'\).*?applyScenePulseStatusColumnWidth\(column, value\)/s, 'the existing resize handle must control the ScenePulse column independently');
assert.match(worldStatusResize, /hordeScenePulseSidebarWidthV2/, 'ScenePulse sidebar width must persist after a manual resize');
assert.match(restoreScenePulseStatusWidth, /const fallback = 340/, 'a fresh ScenePulse World must open at the compact sidebar width');
assert.match(restoreScenePulseStatusWidth, /The old full-status-column width is deliberately not migrated/, 'a stale broad HUD setting must not force ScenePulse back into a split view');
assert.match(app, /column\.style\.setProperty\('flex-basis', `\$\{width\}px`, 'important'\)/, 'the compact source width must win over broad late HUD CSS');
assert.match(css, /#world-sidecar-workspace \.sp-meter-row \{ grid-template-columns: auto minmax\(0,1fr\) minmax\(0,70px\) 44px; \}/, 'the final native bridge cascade must preserve a horizontal relationship-meter row');
assert.match(css, /#world-sidecar-workspace \.sp-meter-bar-wrap \{ position: relative; display: block; min-width: 0; height: 8px; overflow: visible; border-radius: 5px; \}/, 'the native bridge must retain a horizontal meter track box');
assert.match(css, /#world-sidecar-workspace \.sp-meter-bar-track \{ position: absolute; inset: 0; overflow: hidden; border-radius: 5px; \}/, 'the native bridge must clip the current fill inside its horizontal track');
assert.match(css, /#world-sidecar-workspace \.sp-meter-bar-fill \{ display: block; height: 100%; border-radius: 5px; transition: width/, 'the final native bridge fill must remain width-driven rather than height-driven');
assert.match(css, /#world-sidecar-workspace \.sp-meter-bar-prev \{ position: absolute; top: 0; bottom: 0; width: 2px; z-index: 2; \}/, 'the final native bridge must retain the prior-turn vertical delta marker');
assert.doesNotMatch(css, /#world-sidecar-workspace \.sp-meter-bar-fill \{[^}]*?(?:writing-mode|flex-direction:\s*column)/, 'the native bridge must not reorient source relationship fills vertically');
assert.match(sourceGuidedTour, /s\.customPanels\.push\(\{name:'RPG Stats \(Tour Example\)'/, 'the tour custom-panel schema must remain defined by upstream guided-tour behavior');
assert.doesNotMatch(sourceConstants, /\bhealth\s*:/, 'TOUR_EXAMPLE_DATA must not fabricate a health value for its schema-only custom panel');
assert.match(runtime, /const fixtureSnapshotCount = handoff\?\.fixturePreview \? 1 : 12/, 'fixture-only source mount must retain the populated tutorial timeline outside the guided preview');
assert.match(runtime, /const fixtureSnapshotCount = handoff\?\.fixturePreview \? 1 : 12/, 'the guided-tour preview may not fabricate a repeated fixture history');
assert.match(runtime, /The upstream guided tour paints its own illustrative 12-node[\s\S]*?stagnation\/history code would/, 'the tour’s visible history must not become false scene history');
assert.match(runtime, /ScenePulse handoff review/, 'the native and Sidecar readings need a visible comparison surface');
assert.match(runtime, /A difference is evidence to review, not a cue to erase either system/i, 'conflicts must remain inspectable');
assert.match(runtime, /Tutorial support retained/, 'unsupported fields must remain visibly scaffolded instead of disappearing');
assert.match(runtime, /Settled handoff adopted/, 'the comparison must distinguish a real accepted replacement from fixture support');
assert.match(runtime, /current\.handoff\?\.lastKnown \? 'Last known scene'/, 'an incomplete latest handoff must leave the source panel visibly anchored to its last known scene');
assert.match(runtime, /installHistorySelectionCapture/, 'source timeline and Browse All selections must keep the comparison aligned with the selected source snapshot');
assert.match(runtime, /\.sp-graph-overlay \.sp-graph-dot-hit/, 'source relationship-history graph points must select the corresponding historical ScenePulse snapshot');
assert.match(runtime, /\.sp-graph-overlay \.sp-graph-xlabel/, 'source relationship-history graph labels must select the corresponding historical ScenePulse snapshot');
assert.match(runtime, /derived Reader cache, not a source edit/, 'history selection must classify the Reader relationship graph as derived state rather than a source edit');
assert.match(runtime, /if \(baseScenePulse\) delete baseScenePulse\.relationshipGraph/, 'a historical source view must remove the derived graph cache from both live and baseline metadata');
assert.match(runtime, /loadOptionalSourceModule/, 'an optional source utility may not prevent the foreground ScenePulse panel from mounting');
assert.match(runtime, /profileManager: 'settings-ui\/profiles-manager\.js'/, 'source Profiles must remain a real vendored surface');
assert.match(runtime, /guidedTour: 'settings-ui\/guided-tour\.js'/, 'source Guided Tour must remain a real vendored surface');
assert.match(runtime, /async function openFixtureGuidedTour\(\)/, 'Guided Tour must explicitly enter its sealed fixture context');
assert.match(runtime, /function fixturePreviewHandoff\(current\)[\s\S]*?status: 'accepted_fixture'/, 'the tour preview must be an accepted fixture handoff, not a live adapter state');
assert.match(runtime, /history: \[\],[\s\S]*?candidateReview: \[\],[\s\S]*?relationshipReview: \[\]/, 'the tour preview must remove live history and review surfaces before source rendering');
assert.match(runtime, /await mount\(current\.host, fixturePreviewHandoff\(current\)\)/, 'the source tour must remount fixture metadata before its upstream renderer runs');
assert.match(runtime, /data-horde-source-return-live/, 'fixture tour must expose a return path to the saved live scene');
assert.match(runtime, /promptEditor: 'ui\/prompt-editor\.js'/, 'source Prompt Editor must remain a real vendored surface');
assert.match(runtime, /presetBrowser: 'ui\/preset-browser\.js'/, 'source Preset Browser must remain a real vendored surface');
assert.match(runtime, /presetCatalogue: 'presets\/built-in\.js'/, 'source preset application must resolve the actual vendored preset catalogue');
assert.match(runtime, /SOURCE_HOST_ACTIONS\.includes\(name\)/, 'the native bridge must reject unclaimed source action events');
sourceHostActions.forEach(action => assert.match(hostActionHandler,
    new RegExp(`detail\\.action === '${action}'`), `Horde must claim the native source action ${action}`));
assert.match(runtime, /syncSourceReaderPreset/, 'a source Profile preset must synchronize to the Reader prompt provenance');
assert.match(runtime, /dispatch\('apply-scenepulse-preset', \{ preset: preset \? clone\(preset\) : null \}\)/,
    'preset selection and clearing must cross a named host boundary rather than becoming a local-only browser state');
assert.match(hostActionHandler, /detail\.action === 'apply-scenepulse-preset'/,
    'Horde must claim the source preset apply action');
assert.match(app, /if \(!isPlainObject\(rawPreset\) \|\| !Object\.keys\(rawPreset\)\.length\)/,
    'clearing a source preset must remove only its Reader-prompt overlay');
assert.match(runtime, /debugInspector: 'ui\/debug-inspector\.js'/, 'source Debug Inspector must remain a lazy vendored surface');
assert.match(runtime, /openDebugInspector\?\.\('activity'\)/, 'native toolbar diagnostics must call the upstream Debug Inspector');
assert.match(runtime, /macros: 'macros\.js'/, 'native commands must inspect the actual source macro vocabulary');
assert.match(runtime, /showSourceCommandOverlay/, 'native runtime must expose a real ScenePulse command surface');
assert.match(runtime, /\/sp regen \[section\]/, 'source slash command help must retain section regeneration');
assert.match(runtime, /\/sp refresh/, 'source slash command help must retain complete refresh');
assert.match(runtime, /\/sp clear/, 'source slash command help must retain clear semantics');
assert.match(runtime, /export-scenepulse-history/, 'source command export must cross the narrow Horde action boundary');
assert.match(runtime, /clear-scenepulse-history/, 'source command clear must cross the narrow Horde action boundary');
assert.match(runtime, /forceFull: false/, 'source regen must preserve compact Sidecar delta cadence');
assert.match(runtime, /forceFull: true/, 'source refresh must request one full Sidecar projection');
assert.match(runtime, /sourceMacroProjection/, 'macro previews need their own fixture-safe source projection');
assert.match(runtime, /return clone\(current\?\.sidecarTracker \|\| \{\}\)/, 'live macro previews must read accepted Sidecar data rather than fixture support');
assert.doesNotMatch(runtime, /generateTracker/, 'native source commands must not start ScenePulse autonomous generation');
assert.match(runtime, /sourceProfiles: clone\(settings\?\.profiles \|\| \[\]\)/, 'source Profile edits must return through the settings bridge');
assert.match(runtime, /refresh-scene-pulse/, 'source refresh controls must dispatch to Sidecar');
assert.match(runtime, /#sp-thought-panel \.sp-tp-regen/, 'the body-level source Thoughts refresh must also cross the Reader boundary');
assert.match(sourceUnmount, /'#sp-thought-panel'/, 'leaving World Play must remove the scene-local Thoughts surface from non-World routes');
assert.match(sourceUnmount, /const sourceRouteSurfaces = \[/, 'route teardown must keep a bounded inventory of ScenePulse-owned body-level surfaces');
assert.match(sourceUnmount, /'#sp-diff-overlay'/, 'route teardown must remove the source payload inspector outside World Play');
assert.match(sourceUnmount, /'\.sp-wiki-overlay'/, 'route teardown must remove the source full-window character Wiki outside World Play');
assert.match(sourceUnmount, /'\.sp-browse-overlay'/, 'route teardown must remove the source Browse All overlay outside World Play');
assert.doesNotMatch(sourceUnmount, /querySelectorAll\(['\"]\[id\^=/, 'route teardown must not broadly erase source preferences or reusable panel-local state');
assert.match(runtime, /runSourceReaderRefresh/, 'native source refresh affordances must use one source-styled Reader lifecycle');
assert.match(runtime, /showLoadingOverlay/, 'section and full-panel refreshes must visibly use source loading overlays');
assert.match(runtime, /showThoughtLoading/, 'Thought regeneration must visibly use the source thought-loading overlay');
assert.match(runtime, /sp-stop-btn/, 'Reader stop must retain the source stop-button visual treatment');
assert.match(runtime, /stop-scene-pulse-refresh/, 'the native stop control must cross a narrow Reader-only host action');
assert.match(runtime, /sp-recovery-card/, 'failed rereads must retain the source recovery-card treatment');
assert.match(sourceLoading, /export function showLoadingOverlay/, 'vendored source loading overlays must remain callable');
assert.match(sourceLoading, /export function showThoughtLoading/, 'vendored source thought loading must remain callable');
assert.match(runtime, /sourceRelationshipGraphCache/, 'the source relationship web needs a roster-checked Sidecar cache seam');
assert.match(runtime, /requestScenePulseRelationshipGraph/, 'native source graph generation must cross a named Reader boundary');
assert.match(runtime, /npcRelationshipGraph: true/, 'the source relationship-web affordance must remain available in Worlds');
assert.match(runtime, /Return ScenePulse history to the current scene/, 'historical source views must not refresh or relabel the newest NPC graph');
assert.match(runtime, /stage-story-idea/, 'source Story Idea controls must dispatch to Horde actions');
assert.match(runtime, /commit-scenepulse-source-edit/, 'source edit saves must cross an auditable host boundary');
assert.match(runtime, /questTranslationMarkup/, 'Inspect must expose source Quest Journal outcomes without replacing the native journal');
assert.match(runtime, /relationshipTranslationMarkup/, 'Inspect must expose explicit relationship outcomes without replacing native meters');
assert.match(runtime, /only changed values as deltas/i, 'relationship Inspect cards must surface compact meter deltas');
assert.match(runtime, /resolve-scenepulse-quest-translation/, 'only an identical-title collision may request an Inspect-only World decision');
assert.match(runtime, /persist-scenepulse-source-settings/, 'source preference saves must use a separate host boundary');
assert.match(runtime, /function sourceChatPanelsForPersistence\(current\)/, 'the native source editor must preserve its chat-local custom-panel schema at the Horde boundary');
assert.match(runtime, /hasChatPanels: sourcePanels\.hasChatPanels/, 'the source boundary must distinguish an empty schema from an absent chat override');
assert.match(runtime, /setupGuide: 'settings-ui\/setup-guide\.js'/, 'source Setup Guide must remain an imported utility');
assert.match(runtime, /showWorldsSetupGuide/, 'Worlds must provide a truthful source-styled setup mapping');
assert.match(runtime, /showScenePulseWorldsSetup/, 'the source guide must receive its Worlds-specific setup capability narrowly');
assert.match(sourceSetupGuide, /showScenePulseWorldsSetup/, 'vendored Setup Guide must delegate only when the Worlds capability is present');
assert.match(sourceBridgeControls, /\[data-horde-source-discard\]\'\)\.addEventListener\('click'/, 'Discard remains a real source-toolbar action');
assert.match(sourceBridgeControls, /discardSourceChanges\(panel\);/, 'Discard clears source editor DOM before restoring the fixture or live snapshot');
assert.match(sourceDiscard, /querySelector\('#sp-panel-mgr'\)\?\.remove\(\)/, 'Discard removes the stale source panel manager');
assert.match(sourceDiscard, /querySelector\('\.sp-cp-tmpl-menu'\)\?\.remove\(\)/, 'Discard removes a stale custom-panel template menu');
assert.match(sourceDiscardChanges, /current\.context\.chatMetadata = clone\(current\.baseMetadata\)/, 'Discard restores the selected ScenePulse snapshot');
assert.match(sourceSnapshotHandoff, /snapshot\?\._spMeta\?\.hordeSnapshotId/, 'source history selection must use the stable Horde snapshot identity rather than relying only on timeline position');
assert.match(runtime, /canonicalizeCurrentSourceClock\(current\)/, 'a source dialog must not persist its AM\/PM display string as a different scene clock');
assert.match(sourceNormalizedRetention, /!current\.dirtyMetadata/, 'source normalization must not overwrite the pre-edit baseline while the native Save action is pending');
assert.match(sourceHumanFieldOrigin, /humanAuthoredField\(handoff, key\)/, 'a direct source edit must mark only its compact patch fields as authored');
assert.match(sourceHumanFieldOrigin, /humanSourceBaseline\(handoff\)/, 'unchanged fixture and Reader fields must retain their prior source provenance after a direct source edit');
assert.match(runtime, /SOURCE_LANGUAGE_OPTIONS/, 'the complete source locale set must remain available');
assert.match(runtime, /简体中文 — Chinese \(Simplified\)/, 'the source language picker must retain native source locale labels');
assert.match(runtime, /עברית — Hebrew/, 'the source language picker must retain the complete shipped locale list');
assert.match(runtime, /showSourceLanguagePicker/, 'language selection must be a real ScenePulse configuration action');
assert.match(runtime, /modules\.i18n\?\.initI18n/, 'the source locale loader must initialize before source render');
assert.match(sourceI18n, /export async function initI18n/, 'vendored source locale files must remain the locale authority');
const normalSceneCopy = [sourceMacroOrigin, sourceCommandStatus, sourceCommand, sourceRefresh, sourceSetup].join('\n');
assert.match(normalSceneCopy, /Reviewing the current scene/, 'normal ScenePulse refresh UI must describe the current scene rather than a backend acceptance state');
assert.match(normalSceneCopy, /ScenePulse presets/, 'normal setup controls must use ScenePulse configuration language');
assert.doesNotMatch(normalSceneCopy, /accepted turn|selected reader preset|Reader-focused source template|Reader presets|no Reader call/i, 'normal ScenePulse controls must keep Reader/acceptance jargon inside Inspect');
assert.doesNotMatch(app, /Cleared \$\{count\} ScenePulse Reader snapshot/, 'history clear feedback must describe a scene, not backend Reader storage');
assert.doesNotMatch(app, /No accepted authored turn is available to refresh/, 'refresh feedback must describe the missing authored scene without settlement jargon');
assert.doesNotMatch(app, /Committed continuity/, 'normal World messages may not expose internal commitment terminology');
assert.match(app, /\$\{failed \? 'Scene needs attention' : 'Scene ready'\}/, 'normal backstage summaries must use player-facing scene status');

assert.match(sourcePanel, /export function createPanel\(\)/, 'vendored source panel must remain the actual panel creator');
assert.match(sourcePanel, /sp-tb-wiki/, 'source toolbar must retain Character Wiki');
assert.match(sourcePanel, /sp-tb-edit/, 'source edit mode must remain present');
assert.match(sourceUpdate, /sp-idea-paste.*sp-idea-inject/s, 'source Story Ideas must retain source action controls');
assert.match(runtime, /function repairSourceStoryIdeaShape\(/, 'source bridge must repair only the known category-as-title Story Ideas wire shape');
assert.match(runtime, /SOURCE_STORY_IDEA_TYPES/, 'source Story Ideas repair must retain the five vendored categories');
assert.match(runtime, /normalizeTracker\(repairSourceStoryIdeaShape\(snapshot\)\)/, 'every native ScenePulse render path must normalize repaired Story Ideas');
assert.match(runtime, /function normalizeSourceHistorySnapshots\(current\)/, 'all bridge history snapshots must use the same source normalizer as the current render');
assert.match(runtime, /normalizeSourceHistorySnapshots\(current\);/, 'history normalisation must happen before the source renderer reads prior meter values');
assert.match(sourcePanelRenderRecovery, /currentSnapshot\(current\)/, 'a source panel reset must rehydrate the exact selected ScenePulse snapshot');
assert.match(sourcePanelRenderRecovery, /sourcePanelShowsRenderedScene/, 'source render recovery must be conditional and leave healthy source panels alone');
assert.doesNotMatch(sourcePanelRenderRecovery, /materializeNativeTracker|fixtureScenePulse|dispatch\(/, 'source render recovery may not substitute fixture data, read Horde state, or call a new model pass');
const sourceRenderability = vm.runInNewContext(`${sourceSnapshotRenderable}
({
    empty: sourceSnapshotHasRenderableScene({}),
    scene: sourceSnapshotHasRenderableScene({ sceneSummary: 'The regulator finally gives.' }),
    character: sourceSnapshotHasRenderableScene({ characters: [{ name: 'Charlotte' }] })
})`, {
    plain: value => !!value && typeof value === 'object' && !Array.isArray(value),
    hasValue: value => Array.isArray(value) ? value.length > 0 : (value != null && String(value).trim() !== '')
});
assert.deepEqual(JSON.parse(JSON.stringify(sourceRenderability)), { empty: false, scene: true, character: true }, 'empty-shell recovery must run only when the accepted source snapshot has actual visible scene material');
assert.match(sourceSettings, /currentMeta\.hordeScenePulseBridge===true/, 'the source predecessor helper must identify a tagged Horde ScenePulse snapshot');
assert.match(sourceSettings, /hordeTurnId.*!==currentTurn/, 'the source predecessor helper must skip same-turn Horde rereads for turn deltas');
// ScenePulse may retain several source snapshots for a focused reread of one
// authored beat. Relationship markers are explicitly turn deltas, so a
// reread must look past its same-turn predecessor without changing ordinary
// upstream snapshot behaviour.
const sourceGetPrevSnapshot = lastSourceFunction(sourceSettings, 'getPrevSnapshot', 'export function').replace(/^export\s+/, '');
const sourceTurnPredecessor = vm.runInNewContext(`${sourceGetPrevSnapshot}
({
    firstReread: getPrevSnapshot(1001)?._spMeta?.hordeTurnId || '',
    nextTurn: getPrevSnapshot(1002)?._spMeta?.hordeTurnId || '',
    secondReread: getPrevSnapshot(1003)?._spMeta?.hordeTurnId || '',
    upstreamFallback: getPrevSnapshot(1004)?.marker || ''
})`, {
    getTrackerData: () => ({ snapshots: {
        '1000': { marker: 'turn-one', _spMeta: { hordeScenePulseBridge: true, hordeTurnId: 'turn-1' } },
        '1001': { marker: 'turn-one-reread', _spMeta: { hordeScenePulseBridge: true, hordeTurnId: 'turn-1' } },
        '1002': { marker: 'turn-two', _spMeta: { hordeScenePulseBridge: true, hordeTurnId: 'turn-2' } },
        '1003': { marker: 'turn-two-reread', _spMeta: { hordeScenePulseBridge: true, hordeTurnId: 'turn-2' } },
        '1004': { marker: 'ordinary-source-snapshot' }
    } })
});
assert.deepEqual(JSON.parse(JSON.stringify(sourceTurnPredecessor)), {
    firstReread: '', nextTurn: 'turn-1', secondReread: 'turn-1', upstreamFallback: 'turn-two-reread'
}, 'Horde relationship markers must compare the preceding authored turn while untouched upstream history still uses its immediate predecessor');
assert.match(sourceUpdate, /sp-meter-bar-track/, 'source relationship meter renderer must remain present');
assert.match(sourceUpdate, /const _relStableKey=entry=>/, 'source meter history must retain a stable relationship identity key');
assert.match(sourceUpdate, /const _previousRelationship=rel=>/, 'source meter history must resolve the preceding relationship by stable identity');
assert.match(sourceUpdate, /const _prevRel=_previousRelationship\(rel\)/, 'the vertical prior-value marker must use the stable predecessor lookup');
assert.match(sourceUpdate, /_sameStoredRelationship\(r,rel\)/, 'source relationship metadata edits must update the stable stored relationship');
assert.match(sourceUpdate, /const _characterStableKey=entry=>/, 'source relationship cards must retain stable character identity for portrait/dossier matching');
assert.match(sourceUpdate, /const sameCharacter=relCharacterKey&&charKey\?relCharacterKey===charKey/, 'source relationship cards must prefer stable character identity before display names');
assert.match(sourceUpdate, /const _charStableKey=entry=>/, 'source character change markers must retain stable character identity');
assert.match(sourceUpdate, /const exact=prev\.filter\(candidate=>_charStableKey\(candidate\)===stable\)/, 'source character change markers must compare the preceding card by stable identity');
assert.match(sourceUpdate, /legacy\.length===1\?legacy\[0\]:null/, 'source character change markers must refuse ambiguous legacy alias matches');
assert.match(sourceUpdate, /createSparklineCanvas\(rel,m\.k\)/, 'source relationship sparklines must receive the full stable source record');
assert.match(sourceSparklines, /function _relationshipStableKey\(entry\)/, 'source sparklines must resolve a stable relationship identity');
assert.match(sourceSparklines, /rels\.find\(rel => _sameHistoryRelationship\(rel, target\)\)/, 'source history must use stable relationship identity rather than fuzzy names');
assert.doesNotMatch(sourceSparklines, /nameFirst/, 'source history must not fall back to first-name matching');
assert.match(sourceSparklines, /const clearGraphTooltips = \(\) => document\.querySelectorAll\('\.sp-graph-tooltip'\)/, 'source graph navigation must clear document-level hover tips');
assert.match(sourceSparklines, /function _navigateTo\(key\) \{\s*clearGraphTooltips\(\);/s, 'navigating a graph point must clear its old-scene tooltip before changing snapshots');
assert.match(sourceTimeline, /export function renderTimeline\(\)/, 'source timeline must remain callable');
assert.match(sourceWiki, /export function openCharacterWiki\(\)/, 'source Wiki must remain a full focused source view');
assert.match(sourceWiki, /document\.body\.appendChild\(overlay\)/, 'source Wiki must retain viewport takeover behavior');
assert.match(sourceCharacterHistory, /const stableMeta = new Map\(\)/, 'source dossier history must retain stable character identity beside display labels');
assert.match(sourceCharacterHistory, /const incompatibleIdentity =/, 'source dossier history must not merge distinct stable identities through aliases');
assert.match(sourceWiki, /const _sourceIdentityFor = item => kind === 'relationships'/, 'source Wiki must use the subject identity for relationship dossier lookup');
assert.match(sourceWiki, /_findLatest\('characters', aliasesLow, m\.sourceIdentity \|\| ''\)/, 'source Wiki must choose the latest character dossier by stable source identity');
assert.match(sourceWiki, /const prevRel = _previousRelationship\(rel\)/, 'source Wiki relationship delta must use stable predecessor identity');
assert.match(sourceWeb, /export function openRelationshipWeb\(entries\)/, 'source relationship graph must remain callable');
assert.match(sourceWeb, /Scene-only graph/, 'the normal source web must label a non-World graph without backend jargon');
assert.match(sourceWeb, /Refresh NPC graph/, 'the normal source web must retain NPC graph refresh');
assert.doesNotMatch(sourceWeb, /Reader-derived scene graph/, 'Reader provenance belongs in Inspect rather than the normal source web');
assert.doesNotMatch(sourceWeb, /Refresh NPC graph through Reader/, 'normal source actions must not expose the bridge implementation');
assert.match(sourceWeb, /npcGraphSource = fresh\.source/, 'a refreshed source graph must retain its provenance');
const sourceRelationshipGraph = read('scenepulse', 'vendor', 'ScenePulse', 'src', 'ui', 'relationship-graph.js');
assert.match(sourceRelationshipGraph, /requestScenePulseRelationshipGraph/, 'vendored graph generation must prefer the Worlds Reader hook before provider dispatch');
assert.match(sourceRelationshipGraph, /if \(typeof worldsReaderGraph === 'function'\) \{[\s\S]*?return \{ edges: cache\.edges, organizations: cache\.organizations, source: cache\.source \};[\s\S]*?\}\n\n    let userName/s,
    'the Worlds Reader hook must return before the source quiet-prompt provider path begins');
assert.match(sourceSlots, /ONLY return fields whose values CHANGED/, 'source delta contract must remain compact');
assert.match(sourceSlots, /ALWAYS include: time, date, elapsed/, 'source delta contract must retain temporal continuity');
assert.match(sourceMacros, /sp_relationships/, 'vendored macro vocabulary must retain relationship context');
assert.match(sourceCommands, /\/sp refresh/, 'vendored slash vocabulary must retain full refresh');

assert.match(css, /#sp-panel\[data-horde-source-runtime="true"\]/, 'native source panel must be styled as World HUD, not a narrow ST sidebar');
assert.match(css, /\.sp-horde-compare-overlay/, 'comparison UI must be visibly styled');
assert.match(css, /\.sp-horde-compare-disagrees/, 'comparison UI must distinguish disagreement');
assert.match(css, /\.sp-horde-source-bridge-controls/, 'native source global Save/Discard controls must be styled');
assert.match(css, /#world-sidecar-workspace #sp-panel\[data-horde-source-runtime="true"\] \.sp-toolbar \{[^}]*z-index: 70/, 'source Save/Discard must remain clickable over the source panel manager');
assert.match(css, /\.sp-horde-command-overlay/, 'native source command surface must have a viewport overlay treatment');

assert.match(sourceEdit, /type: 'scene_pulse_human_edit'/, 'direct edits must become human ScenePulse history nodes');
assert.match(sourceEdit, /author: 'human'/, 'direct edit author must be preserved');
assert.match(sourceEdit, /before,[\s\S]*after,[\s\S]*rawPatch: patch,[\s\S]*undo:/, 'direct edit must preserve before, after, raw patch, and undo data');
assert.match(runtime, /const editedHandoff = current\.selectedHandoff \|\| current\.handoff \|\| \{\}/, 'a source save must target the ScenePulse history point being edited');
assert.match(runtime, /targetSnapshotId: editedHandoff\.provenance\?\.snapshotId \|\| editedHandoff\.id \|\| 'fixture'/, 'a source save must preserve the selected handoff snapshot identity');
assert.match(runtime, /targetTurnId: editedHandoff\.provenance\?\.turnId \|\| ''/, 'a source save must preserve the selected authored turn identity');
assert.match(sourceEdit, /applyScenePulseQuestEditTranslations/, 'a saved live Quest Journal action must translate through the explicit World boundary');
assert.match(sourceEdit, /applyScenePulseRelationshipEditTranslations/, 'a saved live relationship action must use an explicit Horde translation');
assert.match(sourceEdit, /edit\.questReview = safeJsonClone\(questTranslations\)/, 'a saved quest action must remain attached to its authored ScenePulse history node after reload');
assert.match(sourceEdit, /edit\.relationshipReview = safeJsonClone\(relationshipTranslations\)/, 'a saved relationship action must remain attached to its authored ScenePulse history node after reload');
assert.match(questTranslations, /edit\.targetSnapshotId === 'fixture'/, 'fixture Quest Journal actions must remain fixture-local');
assert.doesNotMatch(questTranslations, /!edit\?\.targetTurnId/, 'a settled snapshot must remain translatable when a historical Reader path has no parallel turn id');
assert.match(questTranslations, /!edit\?\.targetSnapshotId \|\| edit\.targetSnapshotId === 'fixture'/, 'only fixture or unidentifiable Quest Journal edits may remain local');
assert.match(relationshipTranslations, /edit\.targetSnapshotId === 'fixture'/, 'fixture relationship actions must remain fixture-local');
assert.match(questTranslations, /scenePulseQuestChanges\(edit\.before, edit\.after\)/, 'the translator must derive actual source quest mutations rather than inventing World data');
assert.match(relationshipTranslations, /scenePulseRelationshipChanges\(edit\.before, edit\.after\)/, 'relationship translation must derive exact source meter changes');
assert.match(relationshipApply, /scenePulseRelationshipTarget/, 'relationship translation must resolve a named identity boundary before writing Horde state');
assert.match(relationshipApply, /lastMeterDeltas/, 'Horde relationship state must retain compact signed source meter deltas');
assert.doesNotMatch(relationshipApply, /\.find\([^\n]*name/i, 'relationship translation must not look up a Horde person by display name');
assert.match(ffContextCompiler, /scenePulseRelationshipPromptProjection/, 'the Narrator active-cast prompt must receive a bounded ScenePulse relationship projection');
assert.match(ffContextCompiler, /scenePulse_relationship_note/, 'the Narrator prompt must distinguish a signed delta from the current relationship meter');
assert.match(resolveQuestTranslation, /\['link', 'create'\]/, 'a title collision must require an explicit link-or-separate decision');
assert.match(app, /detail\.action === 'resolve-scenepulse-quest-translation'/, 'Horde must claim the narrow unresolved Quest Journal decision');
assert.match(css, /\.sp-horde-quest-translation-review/, 'Inspect Quest Journal outcomes must retain a source-styled review treatment');
assert.match(css, /\.sp-horde-relationship-translation-review/, 'Inspect relationship outcomes must retain a source-styled review treatment');
assert.match(sourceNormalize, /nr\.relationshipId/, 'source-side relationship normalization must retain compact relationship identity');
assert.match(sourceNormalize, /const _sameRelationship=\(left,right\)=>/, 'source relationship carry-forward must prefer stable identity before legacy names');
assert.match(sourceNormalize, /find\(pr=>_sameRelationship\(pr,rel\)\)/, 'source relationship carry-forward must preserve continuity across a name reveal');
assert.match(sourceNormalize, /find\(pr=>_sameRelationship\(pr,_rel\)\)/, 'source relationship milestones must preserve continuity across a name reveal');
assert.match(sourceNormalize, /if\(_spCharacterId\)o\.characterId=/, 'source character normalization must retain compact character identity');
assert.match(sourceNormalize, /const _sameCharacter=\(left,right\)=>/, 'source character carry-forward must prefer stable identity before legacy names');
assert.match(sourceNormalize, /find\(pc=>_sameCharacter\(pc,_ch\)\)/, 'source character fields must survive an alias/name reveal');
assert.match(sourceNormalize, /const _characterStableId=entry=>/, 'source view filtering must retain character identity in source stubs');
assert.match(sourceNormalize, /if\(characterId\)stub\.characterId=characterId/, 'source-generated character and relationship stubs must retain stable identity');
assert.match(app, /function scenePulseHumanStatePromptContext\(/, 'human ScenePulse state needs a compact prompt context');
assert.match(app, /const readerPrompt = prompt \+ humanSceneStateContext/, 'human ScenePulse state must reach the Reader prompt');
assert.match(app, /ffStack\.prompt \+ ffHandoffContract \+ narratorHumanSceneState/, 'human ScenePulse state must reach the Narrator prompt');
assert.match(app, /do not describe them as editing/, 'model context must preserve story-state language rather than UI terminology');
assert.match(humanOverlay, /sidecarScenePulse/, 'human overlay must preserve unmodified Sidecar reading for comparison');
assert.match(humanOverlay, /scenePulseHumanHistory\(/, 'human overlay must retain source-history edits rather than only the latest overlay');
assert.match(app, /label: 'Human ScenePulse edit'/, 'human edit must appear in source history');
assert.match(humanOverlay, /questReview: scenePulseHumanReviewRecords\(currentEdit/, 'the current authored ScenePulse successor must retain its exact quest-action review');
assert.match(humanOverlay, /relationshipReview: scenePulseHumanReviewRecords\(currentEdit/, 'the current authored ScenePulse successor must retain its exact relationship-action review');
assert.match(runtime, /function adoptCommittedSourceEdit\(current, editedHandoff, saved, after\)/, 'a source save must install its committed successor before Inspect runs');
assert.match(runtime, /const saved = await dispatch\('commit-scenepulse-source-edit'/, 'a source save must retain the exact host lifecycle result');
assert.match(runtime, /adoptCommittedSourceEdit\(current, editedHandoff, saved, after\)/, 'a source save must attach its action result to the active source selection');
assert.match(sourcePrefs, /customPanels: schema/, 'source custom-panel definition must persist as World schema');
assert.match(sourcePrefs, /hasChatPanels === true/, 'an explicitly empty native custom-panel schema must survive rather than falling back to stale defaults');
assert.match(sourcePrefs, /sourceProfiles: incoming\.sourceProfiles/, 'source Profiles must persist through the scoped World preference boundary');
assert.match(sourcePrefs, /sourceActiveProfileId: incoming\.sourceActiveProfileId/, 'the active source Profile must persist through the scoped World preference boundary');
assert.match(sourcePrefs, /dashCards: incoming\.dashCards/, 'source dashboard-card choices must persist through the scoped World preference boundary');
assert.match(sourcePrefs, /fieldToggles: incoming\.fieldToggles/, 'source field-visibility choices must persist through the scoped World preference boundary');
assert.match(sourcePrefs, /setupDismissed: incoming\.setupDismissed === true/, 'source setup completion must persist as a scoped UI preference');
assert.match(sourcePrefs, /thoughtPanelFit|thoughtFit: incoming\.thoughtFit/, 'source thought-panel behavior must persist through the scoped World preference boundary');

const characterHistoryStart = sourceCharacterHistory.indexOf('const _characterStableId = entry =>');
const characterHistoryEnd = sourceCharacterHistory.indexOf('/**\n * Get the cached history map', characterHistoryStart);
assert(characterHistoryStart >= 0 && characterHistoryEnd > characterHistoryStart,
    'source character identity history must remain extractable for the reveal-continuity contract');
const sourceCharacterHistoryResult = vm.runInNewContext(`
const getTrackerData = () => ({ snapshots: {
    1: { location: 'Wharf', charactersPresent: ['Hooded Stranger'], characters: [{ characterId: 'cand_yvette', name: 'Hooded Stranger', outfit: 'cloak' }] },
    2: { location: 'Wharf', charactersPresent: ['Yvette'], characters: [{ characterId: 'cand_yvette', name: 'Yvette', outfit: 'leather coat' }] }
} });
${sourceCharacterHistory.slice(characterHistoryStart, characterHistoryEnd)}
Array.from(_buildHistory().values()).map(meta => ({ canonical: meta.canonical, sourceIdentity: meta.sourceIdentity, firstSeen: meta.firstSeen, lastSeen: meta.lastSeen, appearances: meta.appearances, aliases: [...meta.aliasesLow].sort() }));
`);
assert.deepEqual(JSON.parse(JSON.stringify(sourceCharacterHistoryResult)), [{
    canonical: 'Yvette', sourceIdentity: 'cand_yvette', firstSeen: 1, lastSeen: 2, appearances: 2,
    aliases: ['hooded stranger', 'yvette']
}], 'source Wiki history must retain one dossier across a stable-ID reveal even before a legacy alias is available');

const sparkIdentityStart = sourceSparklines.indexOf('function _relationshipStableKey(entry)');
const sparkHistoryStart = sourceSparklines.indexOf('export function getMeterHistory(relationship)');
const sparkHistoryEnd = sourceSparklines.indexOf('/**\n * Draw a mini sparkline', sparkHistoryStart);
assert(sparkIdentityStart >= 0 && sparkHistoryStart > sparkIdentityStart && sparkHistoryEnd > sparkHistoryStart,
    'source sparkline identity helpers and history reader must remain extractable for the continuity contract');
const sparkHistorySource = [
    sourceSparklines.slice(sparkIdentityStart, sparkHistoryStart),
    'const getTrackerData = () => ({ snapshots: {',
    "  1: { relationships: [{ relationshipId: 'rel_yvette', name: 'Hooded Stranger', affection: 12 }] },",
    "  2: { relationships: [{ relationshipId: 'rel_yvette', name: 'Yvette', affection: 30 }] },",
    "  3: { relationships: [{ relationshipId: 'rel_other', name: 'Yvette', affection: 99 }] }",
    '} });',
    sourceSparklines.slice(sparkHistoryStart, sparkHistoryEnd).replace('export function', 'function')
].join('\n');
const sparkHistory = vm.runInNewContext(`${sparkHistorySource}\ngetMeterHistory({ relationshipId: 'rel_yvette', name: 'Yvette' })`);
assert.deepEqual(JSON.parse(JSON.stringify(sparkHistory.affection)), [12, 30, null],
    'source relationship history must survive a name reveal but not attach a same-named different relationship');

assert.match(app, /nativeFieldAuthority/, 'Horde preference storage must preserve the explicit source-to-Sidecar field authority ledger');
assert.match(app, /detail\.action === 'commit-scenepulse-source-edit'/, 'Horde must claim source edit commits');
assert.match(app, /detail\.action === 'persist-scenepulse-source-settings'/, 'Horde must claim source preference saves');
assert.match(app, /detail\.hasChatPanels === true/, 'the host must forward native custom-panel override presence to the persistence boundary');

const sourceChatPanelPersistence = lastRuntimeFunction('sourceChatPanelsForPersistence');
const nativeCustomSchema = vm.runInNewContext(`${sourceChatPanelPersistence}\n(() => {\n    const current = { context: { chatMetadata: { scenepulse: { chatPanels: [{ name: 'Venue check', fields: [{ key: 'cider_line_status', label: 'Cider-line status', type: 'text' }] }] } }, extensionSettings: { scenepulse: { customPanels: [{ name: 'Stale default', fields: [{ key: 'stale' }] }] } } } };\n    const result = sourceChatPanelsForPersistence(current);\n    return { result, mirrored: current.context.extensionSettings.scenepulse.customPanels };\n})()`, { clone: value => JSON.parse(JSON.stringify(value)) });
assert.equal(nativeCustomSchema.result.hasChatPanels, true, 'a native chat schema must declare that it is authoritative');
assert.equal(nativeCustomSchema.result.schema[0].fields[0].key, 'cider_line_status', 'a native custom field must cross the source boundary intact');
assert.equal(nativeCustomSchema.mirrored[0].fields[0].key, 'cider_line_status', 'the source settings patch must mirror the live chat-local schema');

const bridgeSaveStart = runtime.indexOf("bridge.querySelector('[data-horde-source-save]').addEventListener");
const bridgeSaveEnd = runtime.indexOf("bridge.querySelector('[data-horde-source-discard]')", bridgeSaveStart);
assert(bridgeSaveStart >= 0 && bridgeSaveEnd > bridgeSaveStart,
    'the native toolbar Save handler must remain available for the source schema persistence contract');
const bridgeSave = runtime.slice(bridgeSaveStart, bridgeSaveEnd);
assert.match(bridgeSave, /const sourcePanels = sourceChatPanelsForPersistence\(current\)/,
    'toolbar Save must collect a chat-local custom schema even when no tracker value changed');
assert.match(bridgeSave, /await dispatch\('persist-scenepulse-source-settings'/,
    'toolbar Save must persist a schema-only source edit before reporting success');
assert.match(bridgeSave, /hasChatPanels: sourcePanels\.hasChatPanels/,
    'toolbar Save must preserve an intentional empty custom-panel schema');

const persistedExplicitEmptySchema = vm.runInNewContext(`${sourcePreferenceNormalizer}\n${sourcePrefs}\n(() => {\n    const protocol = { workspaceUi: { scenePulseWorlds: { customPanels: [{ name: 'Prior panel', fields: [{ key: 'prior' }] }] } } };\n    void persistScenePulseSourceRuntimePreferences(protocol, {}, { customPanels: [{ name: 'Stale default', fields: [{ key: 'stale' }] }] }, [], true);\n    return protocol.workspaceUi.scenePulseWorlds.customPanels;\n})()`, {
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value),
    protocolForSidecarTimeline: world => world,
    ExperimentalWorldsHost: { persist: async () => {} }
});
assert.deepEqual(JSON.parse(JSON.stringify(persistedExplicitEmptySchema)), [], 'an explicitly empty native custom schema must not resurrect stale source defaults');
assert.match(app, /detail\.action === 'stage-story-idea'/, 'Horde must claim source Story Idea actions');
assert.match(app, /detail\.action === 'refresh-scene-pulse'/, 'Horde must claim source Reader refresh actions');
assert.match(app, /detail\.action === 'stop-scene-pulse-refresh'/, 'Horde must claim source Reader stop actions');
assert.match(app, /if \(!workspaceEntityExists\(state\.worlds, state\.activeWorldId\)\s*&& workspaceEntityExists\(state\.worlds, storedActiveWorldId\)\)/, 'a newer valid workspace World selection must survive reload instead of being overwritten by a legacy activeWorldId');
assert.match(app, /activeWorldSessionId: workspaceString\(state\.activeWorldId/, 'workspace state must retain the selected World timeline as well as the World');
assert.match(app, /enterWorld\(state\.activeWorldId, lastWorldSessionId\)/, 'World restore must request the exact saved timeline');
assert.match(app, /activeSessionId = e\.target\.value;\s*ExperimentalWorldsHost\.persist\(\)\.catch\(\(\) => \{\}\);/s, 'changing the World timeline must persist through the Experimental-owned workspace snapshot');
assert.match(acceptedRefresh, /scenePulseReaderRefreshController/, 'a ScenePulse stop must use a separate Reader controller');
assert.match(acceptedRefresh, /The current scene was left unchanged/, 'stopping a reread must preserve the accepted scene');
assert.match(readerRefresh, /signal: options\.signal/, 'the Sidecar Reader fetch must receive the native stop signal');
assert.match(app, /forceFull: detail\.forceFull === true/, 'Horde must preserve source regen versus full-refresh intent');
assert.match(app, /SCENEPULSE FOCUSED SECTION REFRESH/, 'section refresh must focus the single Sidecar Reader pass without invoking Narrator');
assert.match(app, /armGenerationIdleTimeout\(configuredIdleTimeout === 0 \? 0 : Math\.max\(90000, configuredIdleTimeout\)\);/,
    'a completed Narrator response must give the separate Sidecar stage a fresh practical idle window');
assert.doesNotMatch(app, /if \(sidecarError\?\.name === 'AbortError'\) throw sidecarError;/,
    'a downstream Sidecar abort must journal the authored beat rather than rolling it back as an unsent draft');
assert.match(app, /An aborted Sidecar[\s\S]*?Retry Scene Update/,
    'a failed downstream Sidecar request must remain retryable against the exact authored narration');
assert.match(runtime, /save-scenepulse-portrait/, 'source portraits must cross a named portable host boundary');
assert.match(runtime, /clear-scenepulse-portrait/, 'source portrait clearing must cross a named portable host boundary');
assert.match(runtime, /portraitIdentityForCharacter/, 'portrait associations must use ScenePulse stable identities, not a canonical registry fallback');
assert.match(runtime, /Accepted compact delta for this selection/, 'comparison must show the compact handoff that explains a disagreement');
assert.match(runtime, /this view makes no authority change by itself/i, 'comparison must expose conflicts without silently choosing an authority');
assert.match(runtime, /Scene identity handoffs/, 'Inspect must expose the ScenePulse-to-Horde identity scaffold alongside field comparison');
assert.doesNotMatch(runtime, /Reader confidence/, 'visible ScenePulse identity handoffs must not display a provider-style confidence score');
assert.match(runtime, /stage-scenepulse-candidate-review/, 'candidate review must use an explicit narrow host action');
assert.match(runtime, /promote-scenepulse-candidate/, 'a staged candidate must be able to request explicit durable promotion');
assert.match(runtime, /Create with author decision/, 'an early durable decision must be visibly distinct from ordinary promotion readiness');
assert.match(runtime, /link-scenepulse-candidate/, 'a verified Reader identity match must require an explicit link action');
assert.match(runtime, /keep-scenepulse-candidate-scene-only/, 'the author must be able to keep an incomplete bridge visibly ScenePulse-only');
assert.match(css, /\.sp-horde-candidate-review/, 'identity handoff cards must have a distinct comparison treatment');

assert.match(candidateEligibility, /settlementStatus !== 'settled'/, 'candidate promotion must reject unsettled Reader state');
assert.match(candidateEligibility, /sourceTurnIds\.length >= 2/, 'candidate promotion readiness must reward repeated settled evidence');
assert.match(candidateEligibility, /sceneClosed/, 'scene closure must be a valid review boundary');
assert.match(candidateStage, /scenePulseCandidateId/, 'the promotion bridge must retain stable Reader candidate identity');
assert.match(candidateStage, /scenePulseEvidence/, 'the promotion bridge must retain Reader evidence instead of only a display label');
assert.match(candidateStage, /scenePulseAppearance/, 'the promotion bridge must preserve observed appearance for the visuals path');
assert.match(candidateStage, /scenePulseSpecialist/, 'the promotion bridge must retain source specialist character state without flattening it');
assert.match(candidateStage, /scenePulseGoals/, 'the promotion bridge must retain source needs and goals for explicit graduation');
assert.match(candidateCharacterEvidence, /matches\.length !== 1/, 'a candidate may adopt a same-packet card only through a unique source match');
assert.match(candidateCharacterEvidence, /scenePulseCharacter/, 'candidate graduation must retain the complete source-character evidence seam');
assert.match(app, /function scenePulseCharacterCandidatesFromCards/, 'stable source cards must retain a pre-canonical candidate route when the Reader omits its optional candidate array');
assert.match(app, /accepted_scenepulse_character_card/, 'source-card candidate evidence must retain its ScenePulse provenance');
assert.match(app, /explicitCanonicalId/, 'a source card with an explicit canonical ID must not be recast as a new candidate');
assert.match(acceptedReaderRefresh, /recordSidecarReaderCandidates\(world, sess, packet, turn, snapshot\.id\)/, 'an accepted native ScenePulse refresh must publish its source-only character candidate handoffs');
assert.match(app, /controlled_player_candidate_exclusion/, 'the controlled player must never remain in the ScenePulse promotion lane');
assert.match(candidatePromotionDraft, /fertStatus/, 'specialist source fields must survive the explicit graduation draft');
assert.match(promotionAppearance, /scenePulseObservedState/, 'graduated specialist state must retain observed-source provenance');
assert.match(promotionAppearance, /!String\(canonical\.goal/, 'a ScenePulse goal may seed only an otherwise empty World goal');
assert.match(promotionLocation, /scenePulseLocationEvidence/, 'a graduated place must retain its ScenePulse provenance on the Horde Location');
assert.match(promotionLocation, /scenePulseEvidence/, 'a graduated place must retain its established Reader evidence');
assert.match(impliedPromotion, /awaiting_scene_evidence/, 'an incomplete source candidate must remain visible rather than being promoted early');
assert.match(impliedPromotion, /explicit author decision, not an automatic promotion/, 'an early promotion must disclose that it is a deliberate override');
assert.match(impliedPromotion, /applyScenePulsePromotionAppearance/, 'explicit promotion must feed observed outfit and appearance into Horde visuals');
assert.match(impliedPromotion, /applyScenePulsePromotionLocation/, 'explicit promotion must retain observed ScenePulse place details on a new Horde Location');
assert.match(impliedPromotion, /markScenePulseCandidatePromotionOutcome/, 'explicit promotion must write canonical identity back to the Reader candidate');
assert.match(candidateLink, /Reader did not provide a verified canonical identity/, 'name similarity alone must not silently link a ScenePulse candidate');
assert.match(candidateDuplicateResolution, /duplicateCanonicalCandidates/, 'a promotion collision must remain an explicit Inspect comparison');
assert.match(candidateDuplicateResolution, /\['link', 'create'\]/, 'a candidate collision must require an explicit link-or-create author choice');
assert.match(candidateDuplicateResolution, /allowDuplicate: true/, 'an explicit separate-record choice must be the only path that can request a same-named promotion');
assert.doesNotMatch(impliedPromotion, /queueSidecarQuestion/, 'a ScenePulse promotion collision must not create a player-flow Sidecar question');
assert.match(impliedPromotion, /duplicateCanonicalCandidates/, 'a possible duplicate must remain stored beside the staged source candidate for Inspect');
assert.match(impliedPromotion, /scenePulseSeparatePromotionId/, 'same-named promotion requires a private explicit-author capability');
assert.match(impliedPromotion, /location\.id === introducedId/, 'a separate location promotion must resolve the newly created record by stable ID');
assert.match(impliedPromotion, /entity\.id === introducedId/, 'a separate character promotion must resolve the newly created record by stable ID');
assert.match(app, /detail\.action === 'stage-scenepulse-candidate-review'/, 'Horde must claim candidate review staging');
assert.match(app, /detail\.action === 'promote-scenepulse-candidate'/, 'Horde must claim candidate promotion');
assert.match(app, /detail\.action === 'link-scenepulse-candidate'/, 'Horde must claim canonical identity linking');
assert.match(app, /detail\.action === 'resolve-scenepulse-candidate-duplicate'/, 'Horde must claim the Inspect-only duplicate resolution action');
assert.match(runtime, /data-horde-candidate-duplicate-link/, 'Inspect must render an explicit duplicate-link control');
assert.match(runtime, /data-horde-candidate-duplicate-create/, 'Inspect must render an explicit separate-record control');
assert.match(app, /explicitSeparatePromotion/, 'the Horde reducer must recognize only the explicit ScenePulse duplicate-promotion capability');

const candidateEligibilitySource = [
    lastFunction('scenePulseCandidatePromotionKind'),
    lastFunction('scenePulseCandidateSourceTurnIds'),
    lastFunction('scenePulseCandidatePromotionEligibility')
].join('\n');
const candidateEligibilityContext = {};
const onceSeenCandidate = vm.runInNewContext(`${candidateEligibilitySource}\nscenePulseCandidatePromotionEligibility({}, ${JSON.stringify({ candidateType: 'character', label: 'Mira', settlementStatus: 'settled', sourceTurnIds: ['turn_1'] })})`, candidateEligibilityContext);
assert.equal(onceSeenCandidate.reviewable, true, 'a settled named candidate should be eligible for visible World review');
assert.equal(onceSeenCandidate.ready, false, 'one settled appearance alone must not silently earn a durable record');
const repeatedCandidate = vm.runInNewContext(`${candidateEligibilitySource}\nscenePulseCandidatePromotionEligibility({}, ${JSON.stringify({ candidateType: 'character', label: 'Mira', settlementStatus: 'settled', sourceTurnIds: ['turn_1', 'turn_2'] })})`, candidateEligibilityContext);
assert.equal(repeatedCandidate.ready, true, 'the same candidate recurring across settled turns should become ready for explicit promotion');
const closedSceneCandidate = vm.runInNewContext(`${candidateEligibilitySource}\nscenePulseCandidatePromotionEligibility(${JSON.stringify({ scenes: [{ id: 'scene_1', status: 'closed' }] })}, ${JSON.stringify({ candidateType: 'location', label: 'Lantern Court', settlementStatus: 'settled', sourceTurnIds: ['turn_1'], sourceSceneId: 'scene_1' })})`, candidateEligibilityContext);
assert.equal(closedSceneCandidate.ready, true, 'a closed source scene should be a valid review boundary for a local place');

const candidateCharacterEvidenceContext = {
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value)
};
const matchedScenePulseCharacter = vm.runInNewContext(`${candidateCharacterEvidence}\nscenePulseCharacterEvidenceForCandidate(${JSON.stringify({
    semanticInterpretation: { scenePulse: { characters: [
        { id: 'cand_mira', name: 'Mira', aliases: ['The Courier'], outfit: 'rain-dark coat', posture: 'leaning close', proximity: 'at the bar', fertStatus: 'N/A', fertNotes: 'No relevant state', immediateNeed: 'Hear the offer', shortTermGoal: 'Leave unseen', longTermGoal: 'Clear her name', inventory: ['sealed letter'] },
        { id: 'cand_oren', name: 'Oren', outfit: 'work shirt' }
    ] } }
})}, ${JSON.stringify({ candidateId: 'cand_mira', label: 'Mira' })})`, candidateCharacterEvidenceContext);
assert.deepEqual(JSON.parse(JSON.stringify(matchedScenePulseCharacter)), {
    name: 'Mira', aliases: ['The Courier'], hair: '', face: '', outfit: 'rain-dark coat', posture: 'leaning close', proximity: 'at the bar', notableDetails: '', inventory: ['sealed letter'], fertStatus: 'N/A', fertNotes: 'No relevant state', immediateNeed: 'Hear the offer', shortTermGoal: 'Leave unseen', longTermGoal: 'Clear her name'
}, 'a uniquely identified ScenePulse character card must retain rich fields beside its candidate');
assert.equal(vm.runInNewContext(`${candidateCharacterEvidence}\nscenePulseCharacterEvidenceForCandidate(${JSON.stringify({
    semanticInterpretation: { scenePulse: { characters: [{ name: 'Mira' }, { name: 'Mira' }] } }
})}, ${JSON.stringify({ label: 'Mira' })})`, candidateCharacterEvidenceContext), null,
    'ambiguous source character display names must never supply a graduation record');

const sourceCardCandidateContext = {
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value)
};
const sourceCardCandidate = vm.runInNewContext(`${[
    lastFunction('scenePulseCharacterCardIdentity'),
    lastFunction('scenePulseCharacterCardEvidence'),
    lastFunction('scenePulseCharacterCardHistory'),
    lastFunction('scenePulseCharacterCandidatesFromCards')
].join('\n')}\nscenePulseCharacterCandidatesFromCards(${JSON.stringify({
    scenePulse: { characters: [{ characterId: 'cand_mira', name: 'Mira', role: 'Courier', outfit: 'rain-dark coat', immediateNeed: 'Deliver the letter', longTermGoal: 'Clear her name' }] }
})}, ${JSON.stringify({
    readerCandidates: [], readerSnapshots: [{ status: 'accepted_historical', settlementStatus: 'settled', turnId: 'turn_1', id: 'snapshot_1', envelope: { scenePulse: { characters: [{ characterId: 'cand_mira', name: 'Mira', role: 'Courier' }] } } }]
})}, ${JSON.stringify({ id: 'turn_2' })}, 'snapshot_2')`, sourceCardCandidateContext);
assert.equal(sourceCardCandidate.length, 1, 'a stable accepted ScenePulse card must produce a reviewable source candidate if the Reader omitted candidateStructures');
assert.deepEqual(JSON.parse(JSON.stringify(sourceCardCandidate[0].sourceTurnIds)), ['turn_1', 'turn_2'], 'source-card candidates must retain repeated accepted turn evidence without a registry lookup');
assert.equal(sourceCardCandidate[0].details.outfit, 'rain-dark coat', 'source-card candidate fallback must retain rich presentation evidence');
assert.equal(vm.runInNewContext(`${[
    lastFunction('scenePulseCharacterCardIdentity'),
    lastFunction('scenePulseCharacterCardEvidence'),
    lastFunction('scenePulseCharacterCardHistory'),
    lastFunction('scenePulseCharacterCandidatesFromCards')
].join('\n')}\nscenePulseCharacterCandidatesFromCards(${JSON.stringify({
    scenePulse: { characters: [{ characterId: 'ent_mira', canonicalId: 'ent_mira', name: 'Mira' }] }
})}, { readerCandidates: [], readerSnapshots: [] }, { id: 'turn_2' }, 'snapshot_2').length`, sourceCardCandidateContext), 0,
    'an explicitly canonical source card must not create a duplicate candidate bridge');

assert.equal(vm.runInNewContext(`${controlledCandidatePredicate}\nscenePulseCandidateIsControlledCharacter(${JSON.stringify({ candidateType: 'character', candidateId: 'player_alex', label: 'Alex' })}, { id: 'player_alex', names: new Set(['alex']) })`, {
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value), Set
}), true, 'the controlled player must not surface as a ScenePulse graduation candidate');
assert.equal(vm.runInNewContext(`${controlledCandidatePredicate}\nscenePulseCandidateIsControlledCharacter(${JSON.stringify({ candidateType: 'character', candidateId: 'cand_charlotte', label: 'Charlotte' })}, { id: 'player_alex', names: new Set(['alex']) })`, {
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value), Set
}), false, 'a scene NPC with another stable ID must remain reviewable');

const candidatePromotionDraftContext = {
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value)
};
const richPromotionDraft = vm.runInNewContext(`${lastFunction('scenePulseCandidatePromotionKind')}\n${candidatePromotionDraft}\nscenePulseCandidatePromotionDraft(${JSON.stringify({
    candidateType: 'character', label: 'Mira', scenePulseCharacter: matchedScenePulseCharacter
})})`, candidatePromotionDraftContext);
assert.equal(richPromotionDraft.specialist.fertStatus, 'N/A', 'graduation must preserve a supplied specialist state exactly');
assert.equal(richPromotionDraft.goals.longTermGoal, 'Clear her name', 'graduation must retain ScenePulse long-term goals as evidence');

const promotedLocation = vm.runInNewContext(`${promotionLocation}\nconst location = { id: 'loc_lantern_court' };\nconst outcome = applyScenePulsePromotionLocation(location, ${JSON.stringify({
    kind: 'location', scenePulseCandidateId: 'cand_lantern_court', readerSnapshotIds: ['snapshot_8'], readerSourceTurnIds: ['turn_7', 'turn_8'],
    description: 'A rain-dark service court beneath the east viaduct.', region: 'Old Quarter', mapType: 'courtyard', floor: 'lower level', parentHint: 'loc_east_viaduct',
    scenePulseEvidence: [{ sourceTurnId: 'turn_8', detail: 'Mira crosses Lantern Court beneath the viaduct.' }]
})});\nJSON.stringify({ outcome, location });`, {
    safeJsonClone: value => JSON.parse(JSON.stringify(value))
});
const promotedLocationResult = JSON.parse(promotedLocation);
assert.deepEqual(promotedLocationResult.outcome, { locationEvidence: true }, 'a location promotion must report its retained evidence outcome');
const { promotedAt: promotedLocationAt, ...promotedLocationEvidence } = promotedLocationResult.location.scenePulseLocationEvidence;
assert.deepEqual(promotedLocationEvidence, {
    source: 'explicit_scenepulse_candidate_promotion', candidateId: 'cand_lantern_court', readerSnapshotIds: ['snapshot_8'], sourceTurnIds: ['turn_7', 'turn_8'],
    location: { description: 'A rain-dark service court beneath the east viaduct.', region: 'Old Quarter', mapType: 'courtyard', floor: 'lower level', parentHint: 'loc_east_viaduct' },
    evidence: [{ sourceTurnId: 'turn_8', detail: 'Mira crosses Lantern Court beneath the viaduct.' }]
}, 'a promoted location must preserve exact observed place evidence without inferring a new environment');
assert.match(promotedLocationAt, /^\d{4}-\d{2}-\d{2}T/, 'location provenance must retain the promotion timestamp');

const graphContext = {
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value)
};
const normalizedGraph = vm.runInNewContext(`${graphNormalizer}\nnormalizeSidecarNpcRelationshipGraph(${JSON.stringify({
    roster: ['Mira', 'Oren'],
    edges: [
        { from: 'mira', to: 'OREN', type: 'ally', label: 'shared escape plan', direction: 'reciprocal' },
        { from: 'Mira', to: 'Unknown', type: 'friend', label: 'must be rejected' }
    ],
    organizations: [{ name: 'Lantern Crew', kind: 'crew', members: ['Mira', 'Oren', 'Unknown'] }]
})})`, graphContext);
assert.deepEqual(JSON.parse(JSON.stringify(normalizedGraph)), {
    version: 1,
    roster: ['Mira', 'Oren'],
    edges: [{ from: 'Mira', to: 'Oren', type: 'ally', label: 'shared escape plan', direction: 'reciprocal', evidence: '' }],
    organizations: [{ name: 'Lantern Crew', kind: 'crew', members: ['Mira', 'Oren'] }]
}, 'NPC graph normalization must keep only declared roster names and compact source-safe fields');
assert.equal(vm.runInNewContext(`${graphNormalizer}\nnormalizeSidecarNpcRelationshipGraph(${JSON.stringify({ roster: ['Mira'], edges: [] })})`, graphContext), null,
    'a graph with fewer than two declared scene characters must remain absent rather than becoming a misleading cache');

const questDiffSource = [
    "const SCENEPULSE_QUEST_TIERS = Object.freeze(['mainQuests', 'sideQuests']);",
    'const safeJsonClone = value => JSON.parse(JSON.stringify(value));',
    lastFunction('scenePulseQuestTextKey'),
    lastFunction('scenePulseQuestSourceKey'),
    lastFunction('scenePulseQuestUrgency'),
    lastFunction('scenePulseQuestSourceEntry'),
    lastFunction('scenePulseQuestEntries'),
    lastFunction('scenePulseQuestSameContent'),
    lastFunction('scenePulseQuestSameNonNameContent'),
    lastFunction('scenePulseQuestChange'),
    questChanges
].join('\n');
const questDiff = vm.runInNewContext(`${questDiffSource}\nscenePulseQuestChanges(${JSON.stringify({
    mainQuests: [{ name: 'Find the signal', urgency: 'high', detail: 'Trace the radio tower.' }],
    sideQuests: [{ name: 'Meet Rowan', urgency: 'low', detail: 'At the ferry.' }]
})}, ${JSON.stringify({
    mainQuests: [{ name: 'Find the signal', urgency: 'resolved', detail: 'Trace the radio tower.' }],
    sideQuests: [{ name: 'Meet Rowan at the ferry', urgency: 'low', detail: 'At the ferry.' }]
})})`);
assert.deepEqual(JSON.parse(JSON.stringify(questDiff.map(change => ({ operation: change.operation, sourceKey: change.sourceKey, previousSourceKey: change.previousSourceKey })))), [
    { operation: 'complete', sourceKey: 'mainQuests:find the signal', previousSourceKey: 'mainQuests:find the signal' },
    { operation: 'rename', sourceKey: 'sideQuests:meet rowan at the ferry', previousSourceKey: 'sideQuests:meet rowan' }
], 'Quest Journal translation must preserve a resolved action and only match a rename when its source detail is uniquely unchanged');

const relationshipDiffSource = [
    "const SCENEPULSE_RELATIONSHIP_METERS = Object.freeze(['affection', 'trust', 'desire', 'stress', 'compatibility']);",
    "const SCENEPULSE_RELATIONSHIP_TEXT_FIELDS = Object.freeze(['name', 'relType', 'relPhase', 'timeTogether', 'milestone']);",
    'const safeJsonClone = value => JSON.parse(JSON.stringify(value));',
    'const isPlainObject = value => !!value && typeof value === \'object\' && !Array.isArray(value);',
    lastFunction('scenePulseRelationshipSafeId'),
    lastFunction('scenePulseRelationshipMeter'),
    lastFunction('scenePulseRelationshipSourceEntry'),
    lastFunction('scenePulseRelationshipEntries'),
    lastFunction('scenePulseRelationshipEqual'),
    lastFunction('scenePulseRelationshipChangedMeters'),
    lastFunction('scenePulseRelationshipChangedFields'),
    lastFunction('scenePulseRelationshipChange'),
    relationshipChanges
].join('\n');
const relationshipBefore = { relationships: [{
    relationshipId: 'rel_yvette', characterId: 'cand_yvette', name: 'Yvette', relType: 'Ally', relPhase: 'Wary', timeTogether: '3 weeks', milestone: 'Old promise',
    affection: 3, affectionLabel: 'minimal', trust: 25, trustLabel: 'growing', desire: 0, desireLabel: 'none', stress: 55, stressLabel: 'moderate', compatibility: 30, compatibilityLabel: 'uncertain'
}] };
const relationshipAfter = { relationships: [{
    relationshipId: 'rel_yvette', characterId: 'cand_yvette', name: 'Yvette', relType: 'Ally', relPhase: 'Wary', timeTogether: '3 weeks', milestone: 'Offered a route out',
    affection: 5, affectionLabel: 'warming', trust: 38, trustLabel: 'building', desire: 0, desireLabel: 'none', stress: 55, stressLabel: 'moderate', compatibility: 30, compatibilityLabel: 'uncertain'
}] };
const relationshipDiff = vm.runInNewContext(`${relationshipDiffSource}\nscenePulseRelationshipChanges(${JSON.stringify(relationshipBefore)}, ${JSON.stringify(relationshipAfter)})`);
assert.deepEqual(JSON.parse(JSON.stringify(relationshipDiff.map(change => ({ operation: change.operation, sourceKey: change.sourceKey, meterDeltas: change.meterDeltas, changedFields: change.changedFields })))), [{
    operation: 'update', sourceKey: 'relationship:rel_yvette', meterDeltas: { affection: 2, trust: 13 },
    changedFields: ['milestone', 'affection', 'affectionLabel', 'trust', 'trustLabel']
}], 'relationship edits must preserve full five-meter state while recording only changed numeric meters as deltas');

const relationshipApplySource = [
    "const SCENEPULSE_RELATIONSHIP_METERS = Object.freeze(['affection', 'trust', 'desire', 'stress', 'compatibility']);",
    "const SCENEPULSE_RELATIONSHIP_TEXT_FIELDS = Object.freeze(['name', 'relType', 'relPhase', 'timeTogether', 'milestone']);",
    'const safeJsonClone = value => JSON.parse(JSON.stringify(value));',
    'const isPlainObject = value => !!value && typeof value === \'object\' && !Array.isArray(value);',
    lastFunction('scenePulseRelationshipSafeId'),
    lastFunction('scenePulseRelationshipMeter'),
    lastFunction('scenePulseRelationshipSourceEntry'),
    lastFunction('scenePulseRelationshipEntries'),
    lastFunction('scenePulseRelationshipEqual'),
    lastFunction('scenePulseRelationshipChangedMeters'),
    lastFunction('scenePulseRelationshipChangedFields'),
    lastFunction('scenePulseRelationshipChange'),
    lastFunction('scenePulseRelationshipLinks'),
    lastFunction('scenePulseRelationshipSourceKeys'),
    lastFunction('linkScenePulseRelationship'),
    lastFunction('scenePulseRelationshipControlledEntity'),
    lastFunction('scenePulseRelationshipTarget'),
    lastFunction('scenePulseRelationshipTranslationResult'),
    relationshipApply
].join('\n');
const relationshipApplyContext = {
    crypto: { randomUUID: () => 'relationship-test' },
    relationshipKey: (a, b) => [String(a), String(b)].sort().join('|')
};
const relationshipApplyResult = vm.runInNewContext(`${relationshipApplySource}\n(() => {\n    const world = { entities: [{ id: 'yvette', type: 'npc', name: 'Yvette' }] };\n    const sess = { controlledEntityId: 'player', playerIdentity: { name: 'Fei' }, npcRelationships: {} };\n    const protocol = { activeSequenceId: 'seq_1', sequences: [{ id: 'seq_1', controlledEntityId: 'player' }], readerCandidates: [{ candidateId: 'cand_yvette', candidateType: 'character', status: 'promoted', canonicalMatchId: 'yvette' }] };\n    const change = scenePulseRelationshipChange('update', scenePulseRelationshipSourceEntry(${JSON.stringify(relationshipBefore.relationships[0])}), scenePulseRelationshipSourceEntry(${JSON.stringify(relationshipAfter.relationships[0])}));\n    const result = applyScenePulseRelationshipChange(world, sess, protocol, change, { sourceEditId: 'edit_1', targetSnapshotId: 'snapshot_1', targetTurnId: 'turn_1' });\n    return { result, record: sess.npcRelationships['player|yvette'], links: protocol.scenePulseRelationshipLinks };\n})()`, relationshipApplyContext);
assert.equal(relationshipApplyResult.result.status, 'applied', 'a promoted stable candidate must permit an explicit relationship-state translation');
assert.deepEqual(JSON.parse(JSON.stringify(relationshipApplyResult.record.scenePulse.meters)), {
    affection: 5, trust: 38, desire: 0, stress: 55, compatibility: 30
}, 'Horde must retain all five ScenePulse current dimensions without reducing them to score');
assert.deepEqual(JSON.parse(JSON.stringify(relationshipApplyResult.record.scenePulse.lastMeterDeltas)), {
    affection: 2, trust: 13
}, 'Horde must retain the compact source delta vector for prompt generation');
assert.equal(relationshipApplyResult.links[0].targetEntityId, 'yvette', 'the source relationship must retain an explicit stable identity link after promotion');

const relationshipPromptSource = [
    "const SCENEPULSE_RELATIONSHIP_METERS = Object.freeze(['affection', 'trust', 'desire', 'stress', 'compatibility']);",
    'const isPlainObject = value => !!value && typeof value === \'object\' && !Array.isArray(value);',
    lastFunction('scenePulseRelationshipMeter'),
    relationshipPromptProjection
].join('\n');
const promptRelationships = vm.runInNewContext(`${relationshipPromptSource}\nscenePulseRelationshipPromptProjection(${JSON.stringify({
    npcRelationships: {
        'player|yvette': {
            scenePulse: {
                status: 'current', sourceKey: 'relationship:rel_yvette', name: 'Yvette', relType: 'ally', relPhase: 'warming',
                meters: { affection: 5, trust: 38, desire: 0, stress: 55, compatibility: 30 },
                labels: { affection: 'warm', trust: 'building' }, lastMeterDeltas: { affection: 2, trust: 13 },
                history: [{ relationship: { name: 'this audit must not reach the prompt' } }]
            }
        },
        'player|gone': { scenePulse: { status: 'historical', meters: { trust: 99 }, lastMeterDeltas: { trust: 1 } } }
    }
})}, ['yvette'], 'player')`);
assert.deepEqual(JSON.parse(JSON.stringify(promptRelationships)), [{
    between: ['player', 'yvette'], status: 'current', sourceKey: 'relationship:rel_yvette', name: 'Yvette', relType: 'ally', relPhase: 'warming',
    timeTogether: '', milestone: '', meters: { affection: 5, trust: 38, desire: 0, stress: 55, compatibility: 30 },
    labels: { affection: 'warm', trust: 'building' }, lastMeterDeltas: { affection: 2, trust: 13 }, sourceTurnId: ''
}], 'Narrator relationship context must carry current dimensions and compact deltas without audit history or retired scene state');

const sourceRuntimeContext = {
    window: {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    console
};
sourceRuntimeContext.window.setTimeout = sourceRuntimeContext.setTimeout;
sourceRuntimeContext.window.clearTimeout = sourceRuntimeContext.clearTimeout;
vm.runInNewContext(runtime, sourceRuntimeContext);
const materializeSourceTracker = sourceRuntimeContext.window.HordeScenePulseSourceRuntime.materializeNativeTracker;
const customPanelAuthoritySource = [
    "const SCENEPULSE_TOUR_CUSTOM_PANELS = [{ name: 'RPG Stats (Tour Example)', fields: [{ key: 'health' }, { key: 'mana' }, { key: 'reputation' }] }];",
    "const SCENEPULSE_NATIVE_PRESENTATION_FIELDS = ['time'];",
    lastFunction('scenePulseEffectiveSourceCustomPanels'),
    lastFunction('scenePulseDeclaredNativeFieldAuthority')
].join('\n');
const effectiveCustomPanelAuthority = vm.runInNewContext(`${customPanelAuthoritySource}\n({ tour: scenePulseEffectiveSourceCustomPanels({}), profile: scenePulseEffectiveSourceCustomPanels({ sourceProfiles: [{ id: 'profile_1', customPanels: [{ name: 'Profile fields', fields: [{ key: 'morale' }] }] }], sourceActiveProfileId: 'profile_1' }), direct: scenePulseEffectiveSourceCustomPanels({ customPanels: [{ name: 'World fields', fields: [{ key: 'focus' }] }] }), authority: scenePulseDeclaredNativeFieldAuthority({}) })`);
assert.deepEqual(JSON.parse(JSON.stringify(effectiveCustomPanelAuthority)), {
    tour: [{ name: 'RPG Stats (Tour Example)', fields: [{ key: 'health' }, { key: 'mana' }, { key: 'reputation' }] }],
    profile: [{ name: 'Profile fields', fields: [{ key: 'morale' }] }],
    direct: [{ name: 'World fields', fields: [{ key: 'focus' }] }],
    authority: ['time', 'health', 'mana', 'reputation']
}, 'one source schema resolver must preserve precedence and declare exactly the resulting Reader-adoptable keys');
const sourceProfileSlotContext = {
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value),
    expandScenePulseSourceMacros: (template, prior) => String(template).replace(/\{\{sp_topic\}\}/g, String(prior?.sceneTopic || ''))
};
const sourceProfileSlotEntries = vm.runInNewContext(`${lastFunction('scenePulseResolvedPromptSlotEntries')}\nscenePulseResolvedPromptSlotEntries(${JSON.stringify({ promptOverrides: { role: 'preset role', criticalRules: 'preset critical rules' } })}, ${JSON.stringify({ overrides: { role: 'profile role for {{sp_topic}}' } })}, ${JSON.stringify({ sceneTopic: 'the ferry crossing' })}, {})`, sourceProfileSlotContext);
assert.deepEqual(JSON.parse(JSON.stringify(sourceProfileSlotEntries)), [
    ['role', 'profile role for the ferry crossing'],
    ['criticalRules', 'preset critical rules']
], 'a selected source Profile must send its prompt slots without a preset and override only its matching preset slots');
const sourceProfileFieldConfiguration = vm.runInNewContext(`${lastFunction('scenePulseSourceProfileFieldConfiguration')}\nscenePulseSourceProfileFieldConfiguration(${JSON.stringify({
    panels: { dashboard: false, characters: true, unknown: false },
    dashCards: { time: false, location: true, unexpected: true },
    fieldToggles: { char_innerThought: false, rel_trust: true, 'not-a-key': true, invalid: 'yes' }
})})`, sourceProfileSlotContext);
assert.deepEqual(JSON.parse(JSON.stringify(sourceProfileFieldConfiguration)), {
    panels: { dashboard: false, characters: true },
    dashCards: { time: false, location: true },
    fieldToggles: { char_innerThought: false, rel_trust: true }
}, 'a source Profile must carry only its declared dynamic panel/card/field choices into the Reader');
const fixtureTracker = {
    time: '3:08 PM',
    relationships: [{ relationshipId: 'yvette', name: 'Yvette', trust: 25 }],
    characters: [{ characterId: 'yvette', name: 'Yvette', innerThought: 'fixture thought' }]
};
const scaffoldBase = {
    status: 'accepted_live',
    fixtureScenePulse: fixtureTracker,
    nativeFieldAuthority: ['time', 'relationships', 'characters']
};
assert.deepEqual(
    JSON.parse(JSON.stringify(materializeSourceTracker({ ...scaffoldBase, scenePulse: { time: '3:18 PM', relationships: [] } }).relationships)),
    fixtureTracker.relationships,
    'an unnamed empty Sidecar collection must not erase the working ScenePulse tutorial feature'
);
assert.equal(
    materializeSourceTracker({ ...scaffoldBase, scenePulse: { time: '3:18 PM', relationships: [] } }).time,
    '3:18 PM',
    'an accepted populated field must replace just that supported ScenePulse field'
);
assert.deepEqual(
    JSON.parse(JSON.stringify(materializeSourceTracker({ ...scaffoldBase, scenePulse: { relationships: [] }, replaceCollections: ['relationships'] }).relationships)),
    [],
    'a named replacement may intentionally clear a supported ScenePulse collection'
);
assert.deepEqual(
    JSON.parse(JSON.stringify(materializeSourceTracker({ ...scaffoldBase, scenePulse: { time: '3:18 PM' } }).characters)),
    fixtureTracker.characters,
    'an omitted Sidecar field must keep its complete source fixture support'
);
assert.equal(
    materializeSourceTracker({
        status: 'accepted_live', fixtureScenePulse: fixtureTracker,
        nativeFieldAuthority: ['health'], scenePulse: { health: 64 }
    }).health,
    64,
    'a declared upstream custom-panel key must be able to replace its blank fixture field from an accepted compact Reader delta'
);

const scenePulseMergeContext = {
    safeJsonClone: value => JSON.parse(JSON.stringify(value)),
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value)
};
const mergeSource = [
    lastFunction('sidecarMergeReaderObject'),
    lastFunction('sidecarMergeReaderRecords'),
    lastFunction('sidecarScenePulseRecordKey'),
    lastFunction('sidecarScenePulseStableIdentity'),
    lastFunction('sidecarScenePulseIdentityAliases'),
    lastFunction('sidecarScenePulseRevealMatchIndex'),
    lastFunction('sidecarScenePulseRecords'),
    lastFunction('sidecarMergeScenePulse')
].join('\n');
const merged = vm.runInNewContext(`${mergeSource}\nsidecarMergeScenePulse(${JSON.stringify({ characters: [{ characterId: 'elena', name: 'Elena', innerThought: 'old' }], relationships: [{ relationshipId: 'elena-rel', name: 'Elena', trust: 55 }] })}, ${JSON.stringify({ characters: [{ characterId: 'elena', innerThought: 'new' }], relationships: [{ relationshipId: 'elena-rel', trust: 61 }] })})`, scenePulseMergeContext);
assert.deepEqual(merged.characters[0], { characterId: 'elena', name: 'Elena', innerThought: 'new' }, 'compact character delta must preserve source fields');
assert.deepEqual(merged.relationships[0], { relationshipId: 'elena-rel', name: 'Elena', trust: 61 }, 'compact relationship delta must preserve source fields');
const relationshipDeltaMerged = vm.runInNewContext(`${mergeSource}\nsidecarMergeScenePulse(${JSON.stringify({ relationships: [{ relationshipId: 'charlotte-rel', name: 'Charlotte', affection: 42, trust: 54, desire: 8, stress: 31, compatibility: 58 }] })}, ${JSON.stringify({ relationships: [{ relationshipId: 'charlotte-rel', meterDeltas: { affection: 3, trust: -2, stress: 4 } }] })})`, scenePulseMergeContext);
assert.deepEqual(relationshipDeltaMerged.relationships[0], { relationshipId: 'charlotte-rel', name: 'Charlotte', affection: 45, trust: 52, desire: 8, stress: 35, compatibility: 58 }, 'a compact signed relationship delta must resolve into current source meter values without leaking a second runtime field');

// The exact same nested packet shape that the one Sidecar Reader emits must
// preserve a configured source custom-panel key through normalization and a
// compact delta merge. The fixture renderer then decides whether that
// accepted field supersedes its tutorial value.
const readerEnvelopeContext = {
    safeJsonClone: value => JSON.parse(JSON.stringify(value)),
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value)
};
const readerEnvelopeSource = [
    lastFunction('sidecarReaderValue'),
    lastFunction('sidecarReaderClaim'),
    characterPresenceNormalizer,
    characterIntelligenceNormalizer,
    scenePulseCharacterCognitionBridge,
    graphNormalizer,
    lastFunction('normalizeSidecarScenePulseShape'),
    normalizer,
    mergeSource,
    merger,
    lastFunction('parseSidecarReaderOutput')
].join('\n');
readerEnvelopeContext.safeParseJSONRepair = raw => { try { return JSON.parse(String(raw)); } catch (_) { return null; } };
const customPanelEnvelope = vm.runInNewContext(`${readerEnvelopeSource}\n(() => {\n    const base = normalizeSidecarReaderEnvelope({ mode: 'full', semantic_interpretation: { scenePulse: { health: 40 } } });\n    const patch = normalizeSidecarReaderEnvelope({ mode: 'delta', changed_fields: ['scenePulse.health'], semantic_interpretation: { scenePulse: { health: 64 } } });\n    const parsed = parseSidecarReaderOutput(JSON.stringify({ mode: 'full', semantic_interpretation: { scenePulse: { health: 64 } } }));\n    return { base, patch, merged: mergeSidecarReaderEnvelope(base, patch), parsed };\n})()`, readerEnvelopeContext);
assert.equal(customPanelEnvelope.base.scenePulse.health, 40, 'a nested Sidecar full reading must retain a configured custom-panel field');
assert.equal(customPanelEnvelope.patch.scenePulse.health, 64, 'a nested Sidecar custom-panel delta must retain its updated value');
assert.equal(customPanelEnvelope.merged.scenePulse.health, 64, 'a compact Sidecar custom-panel delta must replace only its named accepted field');
assert.equal(customPanelEnvelope.parsed.valid, true, 'a supported ScenePulse-only full reading must be accepted rather than discarded as empty');
assert.equal(customPanelEnvelope.parsed.scenePulse.health, 64, 'parser acceptance must retain the ScenePulse custom-panel value it validated');

const witnessShapeEnvelope = vm.runInNewContext(`${readerEnvelopeSource}\n(() => {\n    const full = normalizeSidecarReaderEnvelope({ mode: 'full', semantic_interpretation: { scenePulse: { witnesses: 'Early Friday patrons entering the venue' } } });\n    const delta = normalizeSidecarReaderEnvelope({ mode: 'delta', semantic_interpretation: { scenePulse: { witnesses: ['Door staff', { label: 'Security camera' }] } } });\n    return { full, delta, merged: mergeSidecarReaderEnvelope(full, delta) };\n})()`, readerEnvelopeContext);
assert.deepEqual(JSON.parse(JSON.stringify(witnessShapeEnvelope.full.scenePulse.witnesses)), ['Early Friday patrons entering the venue'], 'a scalar Reader witness must reach the source list as one exact observer, not vanish');
assert.deepEqual(JSON.parse(JSON.stringify(witnessShapeEnvelope.delta.scenePulse.witnesses)), ['Door staff', 'Security camera'], 'structured witness entries must normalize to their supplied source labels');
assert.deepEqual(JSON.parse(JSON.stringify(witnessShapeEnvelope.merged.scenePulse.witnesses)), ['Door staff', 'Security camera'], 'a later witness assertion must replace the prior per-turn witness list');

// A source section refresh is intentionally sparse. It must update its
// relationship packet without erasing the accepted Quest Journal projection
// simply because the Reader was not asked to reread quests.
const focusedRelationshipRefresh = vm.runInNewContext(`${readerEnvelopeSource}\n(() => {
    const base = normalizeSidecarReaderEnvelope({ mode: 'full', semantic_interpretation: {
        scenePulse: {
            mainQuests: [{ questId: 'quest_post', title: 'The New Post', priority: 'moderate' }],
            relationships: [{ relationshipId: 'rel_charlotte', characterId: 'npc_charlotte', name: 'Charlotte', relType: 'friendly_bartender', relPhase: 'established_regular', timeTogether: '3 years', milestone: 'Regular patron banter', affection: 47, trust: 58, desire: 10, stress: 12, compatibility: 54, affectionLabel: 'Fond Familiarity', trustLabel: 'Reliable Confidante', desireLabel: 'Strictly Platonic', stressLabel: 'Easygoing Calm', compatibilityLabel: 'Sharp Banter' }]
        }
    } });
    const focusedDelta = normalizeSidecarReaderEnvelope({ mode: 'delta', changed_fields: ['scenePulse.relationships'], semantic_interpretation: {
        scenePulse: { relationships: [{ relationshipId: 'rel_charlotte', affectionLabel: 'Warm Regard', trustLabel: 'Reliable Confidante' }] }
    } });
    return { merged: mergeSidecarReaderEnvelope(base, focusedDelta), focusedDelta };
})()`, readerEnvelopeContext);
assert.equal(focusedRelationshipRefresh.merged.scenePulse.mainQuests[0].title, 'The New Post', 'a relationship-only Reader refresh must retain the already accepted Quest Journal');
assert.equal(focusedRelationshipRefresh.merged.scenePulse.relationships[0].affectionLabel, 'Warm Regard', 'a relationship-only Reader refresh must update the focused source field');
assert.deepEqual(JSON.parse(JSON.stringify(focusedRelationshipRefresh.focusedDelta.scenePulse.mainQuests || [])), [], 'the compact refresh packet must remain sparse for Inspect rather than being rewritten as a fake full packet');

// A card-only compact ScenePulse delta still has to reach the subject-scoped
// cognition lane. This is a same-packet bridge: it needs a stable ID and
// explicit roster membership, never a Horde name lookup. The memory worker
// already consumes characterIntelligence, so this preserves the rich source
// thought without introducing another memory system.
const scenePulseCognitionEnvelope = vm.runInNewContext(`${readerEnvelopeSource}\n(() => {\n    const base = normalizeSidecarReaderEnvelope({ mode: 'full', semantic_interpretation: {\n        characterIntelligence: [{ subjectRef: 'cand_mira', candidateId: 'cand_mira', name: 'Mira', presence: { mode: 'active' }, sceneLocalImpression: 'Old cautious thought.' }],\n        scenePulse: { charactersPresent: [{ candidateId: 'cand_mira', mode: 'active' }], characters: [{ characterId: 'cand_mira', name: 'Mira', innerThought: 'Old cautious thought.' }] }\n    } }, { controlledEntityId: 'player' });\n    const patch = normalizeSidecarReaderEnvelope({ mode: 'delta', semantic_interpretation: {\n        scenePulse: { charactersPresent: [{ candidateId: 'cand_mira', mode: 'active' }], characters: [{ characterId: 'cand_mira', name: 'Mira', role: 'Courier', innerThought: 'I need to get the package out before anyone notices.', immediateNeed: 'Reach the east gate', shortTermGoal: 'Avoid the patrol', longTermGoal: 'Clear her brother', outfit: 'Rain-dark courier coat', posture: 'Ready to run' }] }\n    } }, { controlledEntityId: 'player' });\n    const cardOnly = normalizeSidecarReaderEnvelope({ mode: 'full', semantic_interpretation: {\n        scenePulse: { charactersPresent: [{ candidateId: 'cand_nia', mode: 'nearby' }], characters: [{ characterId: 'cand_nia', name: 'Nia', innerThought: 'I can hear the argument through the door.', outfit: 'Blue work jacket' }] }\n    } }, { controlledEntityId: 'player' });\n    const controlled = normalizeSidecarReaderEnvelope({ mode: 'full', semantic_interpretation: {\n        scenePulse: { charactersPresent: ['player'], characters: [{ characterId: 'player', name: 'Fei', role: 'Player', innerThought: 'This must not enter cognition.' }] }\n    } }, { controlledEntityId: 'player' });\n    return { base, patch, merged: mergeSidecarReaderEnvelope(base, patch, { controlledEntityId: 'player' }), cardOnly, controlled };\n})()`, readerEnvelopeContext);
assert(scenePulseCognitionEnvelope.patch.semanticSuppliedFields.includes('characterIntelligence'), 'a card-only delta must explicitly reach the character-intelligence merge lane');
assert.equal(scenePulseCognitionEnvelope.merged.characterIntelligence[0].sceneLocalImpression.text, 'I need to get the package out before anyone notices.', 'a current ScenePulse thought must replace the prior subject-scoped provisional thought');
assert.equal(scenePulseCognitionEnvelope.merged.characterIntelligence[0].immediateObjectiveOrConcern[0].text, 'Reach the east gate', 'a card-only ScenePulse thought must retain its paired immediate need for cognition');
assert.equal(scenePulseCognitionEnvelope.merged.characterIntelligence[0].visibleState.outfit, 'Rain-dark courier coat', 'a card-only ScenePulse observation must retain visible state beside its thought');
assert.equal(scenePulseCognitionEnvelope.cardOnly.characterIntelligence[0].sceneLocalImpression.source, 'scenepulse_character_card', 'a card-derived thought must remain labeled as a same-packet provisional source');
assert.equal(scenePulseCognitionEnvelope.cardOnly.characterIntelligence[0].presence.mode, 'nearby', 'the bridge must preserve explicit ScenePulse roster presence rather than inventing active presence');
assert.equal(scenePulseCognitionEnvelope.controlled.characterIntelligence.length, 0, 'the bridge must never create private cognition from a controlled-player ScenePulse card');

// Gemini's live packet labels a direct participant `in_person`. That is an
// explicit synonym, not a new inference: it must become the same active lane
// consumed by the existing turn-cognition queue.
const inPersonCognitionEnvelope = vm.runInNewContext(`${readerEnvelopeSource}\n(() => normalizeSidecarReaderEnvelope({ mode: 'full', semantic_interpretation: {
    characterIntelligence: [{ subjectRef: 'npc_charlotte', name: 'Charlotte', presence: { mode: 'in_person', location: 'loc_guildhall_bar' }, sceneLocalImpression: 'A crisp collar means something happened today.' }]
} }))()`, readerEnvelopeContext);
assert.equal(inPersonCognitionEnvelope.characterIntelligence[0].presence.mode, 'active', 'declared in-person Reader presence must normalize to active rather than suppressing cognition');

const cognitionQueueSource = [
    lastFunction('sidecarProjectionClaimText'),
    lastFunction('sidecarCognitionAccessForPresence'),
    lastFunction('sidecarTurnCognitionEvidence'),
    lastFunction('queueSidecarTurnCognitionJobs')
].join('\n');
const cardThoughtCognitionJob = vm.runInNewContext(`${cognitionQueueSource}\n(() => {\n    const protocol = { readerCandidates: [{ candidateId: 'cand_nia', candidateType: 'character', settlementStatus: 'settled' }] };\n    const turn = { id: 'turn_card', readerSnapshotId: 'snapshot_card', readerEnvelope: ${JSON.stringify(scenePulseCognitionEnvelope.cardOnly)}, sceneId: 'scene_card', sequenceId: 'sequence_card' };\n    const ids = queueSidecarTurnCognitionJobs({ entities: [] }, {}, protocol, turn);\n    return { ids, job: protocol.jobs[0] };\n})()`, {
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value),
    safeJsonClone: value => JSON.parse(JSON.stringify(value)),
    window: { ExperimentalWorldsSidecarMemoryGraph: { ensureJobs: protocol => { protocol.jobs = protocol.jobs || []; return protocol.jobs; } } }
});
assert.deepEqual(JSON.parse(JSON.stringify(cardThoughtCognitionJob.ids)), ['turn_cognition:turn_card:cand_nia'], 'a same-packet ScenePulse card thought must queue exactly one existing turn-cognition job');
assert.equal(cardThoughtCognitionJob.job.candidateId, 'cand_nia', 'the cognition job must retain the ScenePulse stable candidate ID');
assert.equal(cardThoughtCognitionJob.job.provisionalIntelligence.sceneLocalImpression.source, 'scenepulse_character_card', 'the cognition job must retain the card-thought source marker for its existing memory pipeline');
assert.match(cardThoughtCognitionJob.job.perceptionEvidence, /I can hear the argument through the door/, 'the existing cognition job must receive the same current ScenePulse thought as perception evidence');

const inPersonCognitionJob = vm.runInNewContext(`${cognitionQueueSource}\n(() => {
    const protocol = {};
    const turn = { id: 'turn_live_presence', readerSnapshotId: 'snapshot_live_presence', readerEnvelope: ${JSON.stringify(inPersonCognitionEnvelope)}, sceneId: 'scene_live_presence', sequenceId: 'sequence_live_presence' };
    const ids = queueSidecarTurnCognitionJobs({ entities: [{ id: 'npc_charlotte', type: 'npc', name: 'Charlotte' }] }, {}, protocol, turn);
    return { ids, job: protocol.jobs[0] };
})()`, {
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value),
    safeJsonClone: value => JSON.parse(JSON.stringify(value)),
    window: { ExperimentalWorldsSidecarMemoryGraph: { ensureJobs: protocol => { protocol.jobs = protocol.jobs || []; return protocol.jobs; } } }
});
assert.deepEqual(JSON.parse(JSON.stringify(inPersonCognitionJob.ids)), ['turn_cognition:turn_live_presence:npc_charlotte'], 'a declared in-person live Reader participant must enter the existing cognition queue');
assert.equal(inPersonCognitionJob.job.access, 'visual', 'a normalized in-person participant receives visual cognition access');

const acceptedThoughtFallback = vm.runInNewContext(`${lastFunction('sidecarProjectionClaimText')}\n${cognitionThoughtFallback}\nsidecarCognitionThoughtFallback(${JSON.stringify({
    sourceTurnIds: ['turn_live_presence'],
    provisionalIntelligence: { sceneLocalImpression: { text: 'Nobody shows up in an ironed collar on a sodden Friday without a proper excuse.', confidence: 0.85 } }
})})`, {
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value)
});
assert.equal(acceptedThoughtFallback.length, 1, 'a settled ScenePulse thought must survive an optional cognition-model format failure');
assert.equal(acceptedThoughtFallback[0].text, 'Nobody shows up in an ironed collar on a sodden Friday without a proper excuse.', 'the fallback must retain the exact accepted thought instead of synthesizing a new memory');
assert.equal(acceptedThoughtFallback[0].epistemicStatus, 'interpretation', 'the fallback must remain provisional interpretation rather than durable fact');
assert.deepEqual(JSON.parse(JSON.stringify(acceptedThoughtFallback[0].sourceTurnIds)), ['turn_live_presence'], 'the fallback must retain its authored-turn provenance');

// A deliberate Thoughts reread replaces only the derived perception lane for
// the same turn. Its old cognition remains inspectable as superseded evidence;
// its replacement job is pinned to the newly accepted Reader snapshot.
const refreshedThoughtCognitionJob = vm.runInNewContext(`${cognitionQueueSource}\n(() => {\n    const original = ${JSON.stringify(scenePulseCognitionEnvelope.cardOnly)};\n    const refreshed = JSON.parse(JSON.stringify(original));\n    refreshed.characterIntelligence[0].sceneLocalImpression.text = 'The argument has turned dangerous; keep clear of the door.';\n    const protocol = {\n        readerCandidates: [{ candidateId: 'cand_nia', candidateType: 'character', settlementStatus: 'settled' }],\n        jobs: [{ id: 'turn_cognition:turn_card:cand_nia', type: 'turn_cognition', status: 'completed', turnId: 'turn_card', subjectRef: 'cand_nia', readerSnapshotId: 'snapshot_card' }],\n        memoryGraph: { cognition: [{ id: 'cognition_old', status: 'active', turnCognitionJobId: 'turn_cognition:turn_card:cand_nia', provenance: { readerSnapshotId: 'snapshot_card' } }] }\n    };\n    const turn = { id: 'turn_card', readerSnapshotId: 'snapshot_thought_refresh', readerEnvelope: refreshed, sceneId: 'scene_card', sequenceId: 'sequence_card' };\n    const ids = queueSidecarTurnCognitionJobs({ entities: [] }, {}, protocol, turn);\n    return { ids, oldJob: protocol.jobs[0], newJob: protocol.jobs[1], oldCognition: protocol.memoryGraph.cognition[0] };\n})()`, {
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value),
    safeJsonClone: value => JSON.parse(JSON.stringify(value)),
    window: { ExperimentalWorldsSidecarMemoryGraph: {
        ensureJobs: protocol => { protocol.jobs = protocol.jobs || []; return protocol.jobs; },
        graph: protocol => protocol.memoryGraph
    } }
});
assert.deepEqual(JSON.parse(JSON.stringify(refreshedThoughtCognitionJob.ids)), ['turn_cognition:turn_card:cand_nia:snapshot_thought_refresh'], 'an accepted Thoughts reread must receive a snapshot-versioned cognition job');
assert.equal(refreshedThoughtCognitionJob.oldJob.status, 'superseded', 'the earlier Reader-based cognition job must stay inspectable but no longer act as current');
assert.equal(refreshedThoughtCognitionJob.oldCognition.status, 'superseded', 'completed cognition from the earlier Reader snapshot must remain historical rather than silently active');
assert.equal(refreshedThoughtCognitionJob.newJob.readerSnapshotId, 'snapshot_thought_refresh', 'the replacement cognition job must be pinned to the accepted Thoughts snapshot');
assert.match(refreshedThoughtCognitionJob.newJob.perceptionEvidence, /turned dangerous/, 'the replacement cognition job must use the refreshed ScenePulse thought');
assert.match(app, /queueSidecarTurnCognitionJobs\(world, sess, protocol, turn, projection\)/, 'accepting a Reader refresh must queue snapshot-versioned cognition when its ScenePulse thought changed');
assert.match(app, /source: 'scenepulse_thought_refresh'/, 'the explicit Thoughts action must dispatch only its new background cognition work');

// A saved source edit against a historical Reader snapshot must stay in the
// source timeline after reload. It is not allowed to vanish merely because a
// newer accepted ScenePulse packet becomes the default visible scene.
const humanHistorySource = [
    lastFunction('scenePulseQuestReviewProjection'),
    lastFunction('scenePulseRelationshipReviewProjection'),
    lastFunction('scenePulseHumanReviewRecords'),
    lastFunction('scenePulseHumanHistoryEntry'),
    lastFunction('scenePulseHumanHistory'),
    lastFunction('scenePulseCurrentHumanSuccessor'),
    lastFunction('scenePulseHumanOverlay')
].join('\n');
const historicHumanProjection = vm.runInNewContext(`${humanHistorySource}\n(() => {
    const protocol = {
        scenePulseHumanEdits: [
            { id: 'human_historic', status: 'active', targetSnapshotId: 'reader_1', targetTurnId: '', createdAt: '2026-09-09T00:00:00.000Z', before: { mainQuests: [] }, after: { mainQuests: [{ name: 'Source lifecycle bridge' }] }, rawPatch: [{ key: 'mainQuests' }] },
            { id: 'human_chain', status: 'active', targetSnapshotId: 'human_historic', targetTurnId: '', createdAt: '2026-09-09T00:01:00.000Z', before: { mainQuests: [{ name: 'Source lifecycle bridge' }] }, after: { mainQuests: [{ name: 'Source lifecycle bridge', status: 'completed' }] }, rawPatch: [{ key: 'mainQuests' }] }
        ],
        scenePulseQuestTranslations: [{ type: 'scene_pulse_quest_translation', sourceEditId: 'human_historic', targetSnapshotId: 'reader_1', status: 'applied' }],
        scenePulseRelationshipTranslations: []
    };
    const handoff = {
        id: 'reader_handoff', status: 'accepted_live', provenance: { snapshotId: 'reader_2', turnId: 'turn_2' }, scenePulse: { sceneTopic: 'Current reader scene' },
        history: [
            { id: 'reader_1', turnId: 'turn_1', scenePulse: { sceneTopic: 'Earlier reader scene' } },
            { id: 'reader_2', turnId: 'turn_2', scenePulse: { sceneTopic: 'Current reader scene' } }
        ]
    };
    return scenePulseHumanOverlay(protocol, handoff);
})()`, {
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value),
    safeJsonClone: value => JSON.parse(JSON.stringify(value))
});
assert.equal(historicHumanProjection.status, 'accepted_live', 'a historic human edit must not replace the newer accepted Reader scene by default');
assert.deepEqual(JSON.parse(JSON.stringify(historicHumanProjection.history.map(entry => entry.id))), ['reader_1', 'human_historic', 'human_chain', 'reader_2'], 'historic ScenePulse saves must remain as ordered, selectable source-history nodes, including edits made from an authored successor');
assert.equal(historicHumanProjection.history[1].questReview[0].status, 'applied', 'a historical human successor must retain its exact accepted quest-translation review');

// The current source view receives the same exact review without a browser
// reload. The source Save control re-materializes from this result, so the
// author sees the Horde lifecycle record attached to the ScenePulse state
// they just saved rather than an earlier unedited packet.
const currentHumanProjection = vm.runInNewContext(`${humanHistorySource}\n(() => {
    const protocol = {
        scenePulseHumanEdits: [{ id: 'human_current', status: 'active', targetSnapshotId: 'reader_current', targetTurnId: 'turn_current', createdAt: '2026-09-09T00:00:00.000Z', before: { mainQuests: [] }, after: { mainQuests: [{ name: 'Current source lifecycle' }] }, rawPatch: [{ key: 'mainQuests' }] }],
        scenePulseQuestTranslations: [{ type: 'scene_pulse_quest_translation', sourceEditId: 'human_current', targetSnapshotId: 'reader_current', targetTurnId: 'turn_current', operation: 'add', status: 'applied' }],
        scenePulseRelationshipTranslations: []
    };
    return scenePulseHumanOverlay(protocol, {
        id: 'reader_handoff', status: 'accepted_live', provenance: { snapshotId: 'reader_current', turnId: 'turn_current' }, scenePulse: { mainQuests: [] }, history: [{ id: 'reader_current', turnId: 'turn_current', scenePulse: { mainQuests: [] } }]
    });
})()`, {
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value),
    safeJsonClone: value => JSON.parse(JSON.stringify(value))
});
assert.equal(currentHumanProjection.status, 'accepted_human', 'the selected ScenePulse state must become an authored successor after a current source save');
assert.equal(currentHumanProjection.questReview[0].operation, 'add', 'the current authored successor must immediately expose its exact Horde quest lifecycle outcome');

const chainedHumanProjection = vm.runInNewContext(`${humanHistorySource}\n(() => {
    const protocol = {
        scenePulseHumanEdits: [
            { id: 'human_base', status: 'active', targetSnapshotId: 'reader_current', targetTurnId: 'turn_current', createdAt: '2026-09-09T00:00:00.000Z', before: { mainQuests: [] }, after: { mainQuests: [{ name: 'First source quest' }] }, rawPatch: [{ key: 'mainQuests' }] },
            { id: 'human_tip', status: 'active', targetSnapshotId: 'human_base', targetTurnId: 'turn_current', createdAt: '2026-09-09T00:01:00.000Z', before: { mainQuests: [{ name: 'First source quest' }] }, after: { mainQuests: [{ name: 'First source quest' }, { name: 'Latest source quest' }] }, rawPatch: [{ key: 'mainQuests' }] }
        ],
        scenePulseQuestTranslations: [{ type: 'scene_pulse_quest_translation', sourceEditId: 'human_tip', operation: 'add', status: 'applied' }],
        scenePulseRelationshipTranslations: []
    };
    return scenePulseHumanOverlay(protocol, {
        id: 'reader_handoff', status: 'accepted_live', provenance: { snapshotId: 'reader_current', turnId: 'turn_current' }, scenePulse: { mainQuests: [] }, history: [{ id: 'reader_current', turnId: 'turn_current', scenePulse: { mainQuests: [] } }]
    });
})()`, {
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value),
    safeJsonClone: value => JSON.parse(JSON.stringify(value))
});
assert.equal(chainedHumanProjection.humanEdit.id, 'human_tip', 'a repeated source save must select the latest authored successor rather than its first ancestor');
assert.equal(chainedHumanProjection.scenePulse.mainQuests[1].name, 'Latest source quest', 'the latest authored successor must remain the foreground ScenePulse state');
assert.equal(chainedHumanProjection.questReview[0].sourceEditId, 'human_tip', 'Inspect must retain the lifecycle action made by the selected authored successor');

// The compact action is stored on the authored history node as a persistence
// fallback. A timeline-wide index is useful for review and later resolution,
// but reload must never be able to erase a World outcome that the save itself
// already confirmed.
const persistedHumanActionProjection = vm.runInNewContext(`${humanHistorySource}\n(() => {
    const protocol = { scenePulseHumanEdits: [{
        id: 'human_persisted', status: 'active', targetSnapshotId: 'reader_current', targetTurnId: 'turn_current', createdAt: '2026-09-09T00:00:00.000Z',
        before: { mainQuests: [] }, after: { mainQuests: [{ name: 'Persisted source lifecycle' }] }, rawPatch: [{ key: 'mainQuests' }],
        questReview: [{ id: 'persisted-action', type: 'scene_pulse_quest_translation', sourceEditId: 'human_persisted', operation: 'add', status: 'applied' }]
    }], scenePulseQuestTranslations: [], scenePulseRelationshipTranslations: [] };
    return scenePulseHumanOverlay(protocol, {
        id: 'reader_handoff', status: 'accepted_live', provenance: { snapshotId: 'reader_current', turnId: 'turn_current' },
        scenePulse: { mainQuests: [] }, history: [{ id: 'reader_current', turnId: 'turn_current', scenePulse: { mainQuests: [] } }]
    });
})()`, {
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value),
    safeJsonClone: value => JSON.parse(JSON.stringify(value))
});
assert.equal(persistedHumanActionProjection.questReview[0].id, 'persisted-action', 'a saved lifecycle action must survive even when the historic protocol projection is unavailable');

// Native source snapshots retain their Horde identity in _spMeta. The
// rendered source timeline may be reordered (fixture, Reader, and human
// successors), so a post-reload comparison must resolve the selected node by
// that identity rather than by the snapshot array index.
const sourceSnapshotIdentityProjection = vm.runInNewContext(`
function snapshotKeys() { return [1000, 1001]; }
${sourceSnapshotHandoff}
handoffForCurrentSnapshot({
    currentKey: 1001,
    context: { chatMetadata: { scenepulse: { snapshots: {
        '1001': { _spMeta: { hordeSnapshotId: 'scene-pulse-human-edit-persisted' } }
    } } } },
    handoff: {
        id: 'reader_handoff', status: 'accepted_live', questReview: [],
        history: [
            { id: 'scene-pulse-human-edit-persisted', scenePulse: { mainQuests: [{ name: 'Persisted source lifecycle' }] }, questReview: [{ id: 'persisted-action', operation: 'add', status: 'applied' }] },
            { id: 'reader_current', scenePulse: { mainQuests: [] }, questReview: [] }
        ]
    }
})`, {
    clone: value => JSON.parse(JSON.stringify(value))
});
assert.equal(sourceSnapshotIdentityProjection.status, 'accepted_human', 'the source must restore the authored successor selected by its stable snapshot ID');
assert.equal(sourceSnapshotIdentityProjection.questReview[0].id, 'persisted-action', 'the selected authored successor must retain its Quest Journal action after reload');

const sourceClockRoundTrip = vm.runInNewContext(`${sourceClockCanonicalizer}\n({ evening: sourceCanonicalClockValue('6:34 PM'), noon: sourceCanonicalClockValue('12:00 PM'), midnight: sourceCanonicalClockValue('12:00 AM'), twentyFourHour: sourceCanonicalClockValue('18:34'), opaque: sourceCanonicalClockValue('after the rush') })`);
assert.deepEqual(JSON.parse(JSON.stringify(sourceClockRoundTrip)), {
    evening: '18:34', noon: '12:00', midnight: '00:00', twentyFourHour: '18:34', opaque: 'after the rush'
}, 'the source clock boundary must retain the same instant across its AM/PM dashboard display and never rewrite unparseable prose');

const sourceFieldComparison = vm.runInNewContext(`${sourceClockCanonicalizer}\n${sourceFieldComparator}\n({ sameTime: scenePulseFieldEquivalent('time', '18:34', '6:34 PM'), differentTime: scenePulseFieldEquivalent('time', '18:34', '6:35 PM'), sameText: scenePulseFieldEquivalent('weather', 'Brewing storm', 'Brewing storm') })`, {
    semanticEqual: (left, right) => JSON.stringify(left) === JSON.stringify(right)
});
assert.deepEqual(JSON.parse(JSON.stringify(sourceFieldComparison)), {
    sameTime: true, differentTime: false, sameText: true
}, 'Inspect must not flag ScenePulse 24-hour clock normalization as a conflicting authored field');

const pendingSourceEditBaseline = vm.runInNewContext(`${sourceClockCanonicalizer}\n${sourceNormalizedRetention}\n(() => {
    const current = {
        currentKey: 1000,
        dirtyMetadata: true,
        context: { chatMetadata: { scenepulse: { snapshots: {
            '1000': { time: '6:34 PM', sideQuests: [{ name: 'Existing quest' }, { name: 'New source quest' }] }
        } } } },
        baseMetadata: { scenepulse: { snapshots: {
            '1000': { time: '18:34', sideQuests: [{ name: 'Existing quest' }] }
        } } }
    };
    retainSourceNormalizedSnapshot(current, { time: '6:34 PM', sideQuests: [{ name: 'Existing quest' }, { name: 'New source quest' }] });
    return current;
})()`, {
    plain: value => !!value && typeof value === 'object' && !Array.isArray(value),
    clone: value => JSON.parse(JSON.stringify(value)),
    own: (object, key) => Object.prototype.hasOwnProperty.call(object, key)
});
assert.equal(pendingSourceEditBaseline.context.chatMetadata.scenepulse.snapshots['1000'].time, '18:34', 'the AM/PM dashboard display must be repaired before a source save is calculated');
assert.equal(pendingSourceEditBaseline.baseMetadata.scenepulse.snapshots['1000'].sideQuests.length, 1, 'a pending source Quest Journal edit must retain its original baseline for the Save action');

console.log('ScenePulse native-source integration contract passed.');
