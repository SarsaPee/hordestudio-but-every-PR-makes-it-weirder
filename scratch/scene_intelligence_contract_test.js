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
const app = read('app.js');
const runtime = read('scenepulse', 'horde', 'scenepulse-source-runtime.js');
const css = read('scenepulse', 'horde', 'scene-pulse-worlds.css');
const html = read('index.html');
const sourcePanel = read('scenepulse', 'vendor', 'ScenePulse', 'src', 'ui', 'panel.js');
const sourceUpdate = read('scenepulse', 'vendor', 'ScenePulse', 'src', 'ui', 'update-panel.js');
const sourceNormalize = read('scenepulse', 'vendor', 'ScenePulse', 'src', 'normalize.js');
const sourceTimeline = read('scenepulse', 'vendor', 'ScenePulse', 'src', 'ui', 'timeline.js');
const sourceWiki = read('scenepulse', 'vendor', 'ScenePulse', 'src', 'ui', 'character-wiki.js');
const sourceWeb = read('scenepulse', 'vendor', 'ScenePulse', 'src', 'ui', 'relationship-web.js');
const sourceLoading = read('scenepulse', 'vendor', 'ScenePulse', 'src', 'ui', 'loading.js');
const sourceSetupGuide = read('scenepulse', 'vendor', 'ScenePulse', 'src', 'settings-ui', 'setup-guide.js');
const sourceI18n = read('scenepulse', 'vendor', 'ScenePulse', 'src', 'i18n.js');
const sourceSlots = read('scenepulse', 'vendor', 'ScenePulse', 'src', 'prompts', 'slots.js');
const sourceMacros = read('scenepulse', 'vendor', 'ScenePulse', 'src', 'macros.js');
const sourceCommands = read('scenepulse', 'vendor', 'ScenePulse', 'src', 'slash-commands.js');

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

const normalizer = lastFunction('normalizeSidecarReaderEnvelope');
const merger = lastFunction('mergeSidecarReaderEnvelope');
const currentTurn = lastFunction('currentSidecarAuthoredTurn');
const acceptedHandoff = lastFunction('scenePulseAcceptedHandoff');
const humanOverlay = lastFunction('scenePulseHumanOverlay');
const sourceEdit = lastFunction('commitScenePulseSourceEdit', 'async function');
const sourcePrefs = lastFunction('persistScenePulseSourceRuntimePreferences', 'async function');
const questChanges = lastFunction('scenePulseQuestChanges');
const questTranslations = lastFunction('applyScenePulseQuestEditTranslations');
const resolveQuestTranslation = lastFunction('resolveScenePulseQuestTranslation', 'async function');
const relationshipChanges = lastFunction('scenePulseRelationshipChanges');
const relationshipTranslations = lastFunction('applyScenePulseRelationshipEditTranslations');
const relationshipApply = lastFunction('applyScenePulseRelationshipChange');
const relationshipPromptProjection = lastFunction('scenePulseRelationshipPromptProjection');
const ffContextCompiler = lastFunction('compileFF54SidecarContext');
const panelMount = lastFunction('renderScenePulseWorldsWorkspace');
const nativePresentationAuthority = lastFunction('scenePulseDeclaredNativeFieldAuthority');
const readerPass = lastFunction('runSidecarSemanticReading', 'async function');
const readerRefresh = lastFunction('refreshSidecarSceneIntelligence', 'async function');
const acceptedRefresh = lastFunction('refreshAcceptedScenePulseProjection', 'async function');
const candidateEligibility = lastFunction('scenePulseCandidatePromotionEligibility');
const candidateCharacterEvidence = lastFunction('scenePulseCharacterEvidenceForCandidate');
const candidatePromotionDraft = lastFunction('scenePulseCandidatePromotionDraft');
const candidateStage = lastFunction('stageScenePulseCandidateForWorldReview', 'async function');
const candidateLink = lastFunction('linkScenePulseCandidateToCanonical', 'async function');
const impliedPromotion = lastFunction('promoteImpliedWorldRecord', 'async function');
const promotionAppearance = lastFunction('applyScenePulsePromotionAppearance');
const graphNormalizer = lastFunction('normalizeSidecarNpcRelationshipGraph');

assert.match(normalizer, /semanticSuppliedFields/, 'normalizer must retain semantic supplied-field provenance');
assert.match(merger, /semanticProvided/, 'delta merger must retain nested semantic field provenance');
assert.match(currentTurn, /sess\.history.*\.reverse\(\)/s, 'current authored turn must follow visible history');
assert.match(app, /const SCENEPULSE_TOUR_EXAMPLE_DATA = Object\.freeze/, 'the actual source tutorial fixture must remain present');
assert.match(acceptedHandoff, /scenePulseHumanOverlay\(protocol, fixtureWithPreferences\)/, 'fixture state must accept an explicit human edit overlay without registry backfill');
assert.match(acceptedHandoff, /settlementStatus === 'settled'[\s\S]*snapshot\?\.turnId/, 'live handoff must be exact-turn settled');
assert.doesNotMatch(acceptedHandoff, /world\.entities|world\.quests|sess\.quests/, 'accepted ScenePulse handoff must not borrow Horde registry fields');
assert.match(nativePresentationAuthority, /SCENEPULSE_NATIVE_PRESENTATION_FIELDS/, 'the ScenePulse-facing ownership family must be explicit');
assert.match(acceptedHandoff, /nativeFieldAuthority/, 'each accepted handoff must carry the declared source-field authority');
assert.match(acceptedHandoff, /candidateReview/, 'settled identity handoffs must remain beside the ScenePulse tracker rather than inside it');
assert.match(acceptedHandoff, /relationshipReview/, 'saved ScenePulse relationship translations must remain Inspect-only beside the source tracker');
assert.match(app, /function scenePulseActiveSourceProfile\(/, 'the selected source Profile must be resolvable at the Reader boundary');
assert.match(app, /function scenePulseSourceProfilePromptContext\(/, 'the selected source Profile needs a constrained Reader prompt context');
assert.match(readerPass, /sourceProfileContext\.instruction/, 'source Profile instructions must reach the Sidecar Reader');
assert.match(readerPass, /scenePulseSourceProfile/, 'accepted Reader metadata must retain source Profile provenance');
assert.match(readerPass, /SCENEPULSE NPC RELATIONSHIP WEB/, 'the one Sidecar Reader pass must own the source NPC graph interpretation');
assert.match(readerPass, /Do not make a second graph-generation call/, 'the Reader contract must forbid an independent ScenePulse graph inference');
assert.match(normalizer, /npcRelationshipGraph/, 'Reader normalization must retain the compact NPC graph beside ScenePulse fields');
assert.match(merger, /providedField\('npcRelationshipGraph'\)/, 'NPC graph cache updates must honor nested delta-field provenance');
assert.match(acceptedHandoff, /npcRelationshipGraph/, 'accepted handoffs must retain Reader graph data beside the source tracker');

assert.match(html, /scenepulse-source-runtime\.js/, 'native source runtime must be loaded before app.js');
assert.match(panelMount, /HordeScenePulseSourceRuntime\.mount\(host, handoff\)/, 'World HUD must mount native source runtime');
assert.doesNotMatch(panelMount.slice(0, panelMount.indexOf('// Gate B adapter below')), /HordeScenePulseWorlds\.mount\(host, handoff\)/, 'native source failure must not silently fall back to the hand-drawn adapter');
assert.match(panelMount, /intentionally not substituted with a host lookalike/, 'failure state must remain truthful');

assert.match(runtime, /native-source-modules-via-horde-compatibility-scaffold/, 'runtime must identify its temporary compatibility role');
assert.match(runtime, /import\(`\$\{ROOT\}\/ui\/panel\.js`\)/, 'runtime must import the source panel module');
assert.match(runtime, /import\(`\$\{ROOT\}\/ui\/update-panel\.js`\)/, 'runtime must import the source panel renderer');
assert.match(runtime, /import\(`\$\{ROOT\}\/ui\/timeline\.js`\)/, 'runtime must import the source history renderer');
assert.match(runtime, /import\(`\$\{ROOT\}\/ui\/character-wiki\.js`\)/, 'runtime must load source wiki behavior');
assert.match(runtime, /import\(`\$\{ROOT\}\/ui\/relationship-web\.js`\)/, 'runtime must load source relationship-web behavior');
assert.match(runtime, /import\(`\$\{ROOT\}\/ui\/loading\.js`\)/, 'runtime must load the source loading lifecycle primitives');
assert.doesNotMatch(runtime, /import\(`\$\{ROOT\}\/index\.js`\)/, 'runtime must not launch ScenePulse autonomous ST/provider interceptor');
assert.match(runtime, /modules\.panel\.createPanel\(\)/, 'source must create its own panel DOM');
assert.match(runtime, /modules\.updatePanel\.updatePanel\(normalized, true\)/, 'source must render its own normalized panel');
assert.match(runtime, /modules\.timeline\.renderTimeline\(\)/, 'source must render its own history UI');
assert.match(runtime, /modules\.thoughts\.updateThoughts\(normalized\)/, 'source thought module must render its own panel');
assert.match(runtime, /materializeNativeTracker/, 'fixture-backed fields must be materialized before source render');
assert.match(runtime, /if \(!authority\.size\) return fixture/, 'an older handoff with no declared field path must remain fixture-backed');
assert.match(runtime, /nativeFieldAuthority/, 'field-by-field authority must be explicit rather than inferred from live mode');
assert.match(runtime, /nativeFieldHasAcceptedValue/, 'a declared field must still prove an accepted value before replacing the tutorial support');
assert.match(runtime, /!clear\.has\(key\).*?!replace\.has\(key\).*?!hasValue\(value\)/s, 'implicit empty live values must not shrink source fixture data');
assert.match(runtime, /for \(let index = 0; index < 12; index \+= 1\)/, 'fixture-only source mount must exercise the populated tutorial timeline');
assert.match(runtime, /ScenePulse handoff review/, 'the native and Sidecar readings need a visible comparison surface');
assert.match(runtime, /A difference is evidence to review, not a cue to erase either system/i, 'conflicts must remain inspectable');
assert.match(runtime, /Tutorial support retained/, 'unsupported fields must remain visibly scaffolded instead of disappearing');
assert.match(runtime, /Settled handoff adopted/, 'the comparison must distinguish a real accepted replacement from fixture support');
assert.match(runtime, /installHistorySelectionCapture/, 'source timeline and Browse All selections must keep the comparison aligned with the selected source snapshot');
assert.match(runtime, /loadOptionalSourceModule/, 'an optional source utility may not prevent the foreground ScenePulse panel from mounting');
assert.match(runtime, /profileManager: 'settings-ui\/profiles-manager\.js'/, 'source Profiles must remain a real vendored surface');
assert.match(runtime, /guidedTour: 'settings-ui\/guided-tour\.js'/, 'source Guided Tour must remain a real vendored surface');
assert.match(runtime, /promptEditor: 'ui\/prompt-editor\.js'/, 'source Prompt Editor must remain a real vendored surface');
assert.match(runtime, /presetBrowser: 'ui\/preset-browser\.js'/, 'source Preset Browser must remain a real vendored surface');
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
assert.match(runtime, /setupGuide: 'settings-ui\/setup-guide\.js'/, 'source Setup Guide must remain an imported utility');
assert.match(runtime, /showWorldsSetupGuide/, 'Worlds must provide a truthful source-styled setup mapping');
assert.match(runtime, /showScenePulseWorldsSetup/, 'the source guide must receive its Worlds-specific setup capability narrowly');
assert.match(sourceSetupGuide, /showScenePulseWorldsSetup/, 'vendored Setup Guide must delegate only when the Worlds capability is present');
assert.match(runtime, /SOURCE_LANGUAGE_OPTIONS/, 'the complete source locale set must remain available');
assert.match(runtime, /简体中文 — Chinese \(Simplified\)/, 'the source language picker must retain native source locale labels');
assert.match(runtime, /עברית — Hebrew/, 'the source language picker must retain the complete shipped locale list');
assert.match(runtime, /showSourceLanguagePicker/, 'language selection must be a real ScenePulse configuration action');
assert.match(runtime, /modules\.i18n\?\.initI18n/, 'the source locale loader must initialize before source render');
assert.match(sourceI18n, /export async function initI18n/, 'vendored source locale files must remain the locale authority');

assert.match(sourcePanel, /export function createPanel\(\)/, 'vendored source panel must remain the actual panel creator');
assert.match(sourcePanel, /sp-tb-wiki/, 'source toolbar must retain Character Wiki');
assert.match(sourcePanel, /sp-tb-edit/, 'source edit mode must remain present');
assert.match(sourceUpdate, /sp-idea-paste.*sp-idea-inject/s, 'source Story Ideas must retain source action controls');
assert.match(sourceUpdate, /sp-meter-bar-track/, 'source relationship meter renderer must remain present');
assert.match(sourceTimeline, /export function renderTimeline\(\)/, 'source timeline must remain callable');
assert.match(sourceWiki, /export function openCharacterWiki\(\)/, 'source Wiki must remain a full focused source view');
assert.match(sourceWiki, /document\.body\.appendChild\(overlay\)/, 'source Wiki must retain viewport takeover behavior');
assert.match(sourceWeb, /export function openRelationshipWeb\(entries\)/, 'source relationship graph must remain callable');
assert.match(sourceWeb, /Reader-derived scene graph/, 'the source web must disclose a Sidecar Reader-derived cache');
assert.match(sourceWeb, /Refresh NPC graph through Reader/, 'the source web must label its bridged generation route');
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
assert.match(css, /\.sp-horde-command-overlay/, 'native source command surface must have a viewport overlay treatment');

assert.match(sourceEdit, /type: 'scene_pulse_human_edit'/, 'direct edits must become human ScenePulse history nodes');
assert.match(sourceEdit, /author: 'human'/, 'direct edit author must be preserved');
assert.match(sourceEdit, /before,[\s\S]*after,[\s\S]*rawPatch: patch,[\s\S]*undo:/, 'direct edit must preserve before, after, raw patch, and undo data');
assert.match(sourceEdit, /applyScenePulseQuestEditTranslations/, 'a saved live Quest Journal action must translate through the explicit World boundary');
assert.match(sourceEdit, /applyScenePulseRelationshipEditTranslations/, 'a saved live relationship action must use an explicit Horde translation');
assert.match(questTranslations, /edit\.targetSnapshotId === 'fixture'/, 'fixture Quest Journal actions must remain fixture-local');
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
assert.match(app, /function scenePulseHumanStatePromptContext\(/, 'human ScenePulse state needs a compact prompt context');
assert.match(app, /const readerPrompt = prompt \+ humanSceneStateContext/, 'human ScenePulse state must reach the Reader prompt');
assert.match(app, /ffStack\.prompt \+ ffHandoffContract \+ narratorHumanSceneState/, 'human ScenePulse state must reach the Narrator prompt');
assert.match(app, /do not describe them as editing/, 'model context must preserve story-state language rather than UI terminology');
assert.match(humanOverlay, /sidecarScenePulse/, 'human overlay must preserve unmodified Sidecar reading for comparison');
assert.match(humanOverlay, /Human ScenePulse edit/, 'human edit must appear in source history');
assert.match(sourcePrefs, /customPanels: schema/, 'source custom-panel definition must persist as World schema');
assert.match(sourcePrefs, /sourceProfiles: incoming\.sourceProfiles/, 'source Profiles must persist through the scoped World preference boundary');
assert.match(sourcePrefs, /sourceActiveProfileId: incoming\.sourceActiveProfileId/, 'the active source Profile must persist through the scoped World preference boundary');
assert.match(sourcePrefs, /dashCards: incoming\.dashCards/, 'source dashboard-card choices must persist through the scoped World preference boundary');
assert.match(sourcePrefs, /fieldToggles: incoming\.fieldToggles/, 'source field-visibility choices must persist through the scoped World preference boundary');
assert.match(sourcePrefs, /setupDismissed: incoming\.setupDismissed === true/, 'source setup completion must persist as a scoped UI preference');
assert.match(sourcePrefs, /thoughtPanelFit|thoughtFit: incoming\.thoughtFit/, 'source thought-panel behavior must persist through the scoped World preference boundary');
assert.match(app, /nativeFieldAuthority/, 'Horde preference storage must preserve the explicit source-to-Sidecar field authority ledger');
assert.match(app, /detail\.action === 'commit-scenepulse-source-edit'/, 'Horde must claim source edit commits');
assert.match(app, /detail\.action === 'persist-scenepulse-source-settings'/, 'Horde must claim source preference saves');
assert.match(app, /detail\.action === 'stage-story-idea'/, 'Horde must claim source Story Idea actions');
assert.match(app, /detail\.action === 'refresh-scene-pulse'/, 'Horde must claim source Reader refresh actions');
assert.match(app, /detail\.action === 'stop-scene-pulse-refresh'/, 'Horde must claim source Reader stop actions');
assert.match(acceptedRefresh, /scenePulseReaderRefreshController/, 'a ScenePulse stop must use a separate Reader controller');
assert.match(acceptedRefresh, /The current scene was left unchanged/, 'stopping a reread must preserve the accepted scene');
assert.match(readerRefresh, /signal: options\.signal/, 'the Sidecar Reader fetch must receive the native stop signal');
assert.match(app, /forceFull: detail\.forceFull === true/, 'Horde must preserve source regen versus full-refresh intent');
assert.match(app, /SCENEPULSE FOCUSED SECTION REFRESH/, 'section refresh must focus the single Sidecar Reader pass without invoking Narrator');
assert.match(runtime, /save-scenepulse-portrait/, 'source portraits must cross a named portable host boundary');
assert.match(runtime, /clear-scenepulse-portrait/, 'source portrait clearing must cross a named portable host boundary');
assert.match(runtime, /portraitIdentityForCharacter/, 'portrait associations must use ScenePulse stable identities, not a canonical registry fallback');
assert.match(runtime, /Accepted compact delta for this selection/, 'comparison must show the compact handoff that explains a disagreement');
assert.match(runtime, /this view makes no authority change by itself/i, 'comparison must expose conflicts without silently choosing an authority');
assert.match(runtime, /Scene identity handoffs/, 'Inspect must expose the ScenePulse-to-Horde identity scaffold alongside field comparison');
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
assert.match(candidatePromotionDraft, /fertStatus/, 'specialist source fields must survive the explicit graduation draft');
assert.match(promotionAppearance, /scenePulseObservedState/, 'graduated specialist state must retain observed-source provenance');
assert.match(promotionAppearance, /!String\(canonical\.goal/, 'a ScenePulse goal may seed only an otherwise empty World goal');
assert.match(impliedPromotion, /awaiting_scene_evidence/, 'an incomplete source candidate must remain visible rather than being promoted early');
assert.match(impliedPromotion, /explicit author decision, not an automatic promotion/, 'an early promotion must disclose that it is a deliberate override');
assert.match(impliedPromotion, /applyScenePulsePromotionAppearance/, 'explicit promotion must feed observed outfit and appearance into Horde visuals');
assert.match(impliedPromotion, /markScenePulseCandidatePromotionOutcome/, 'explicit promotion must write canonical identity back to the Reader candidate');
assert.match(candidateLink, /Reader did not provide a verified canonical identity/, 'name similarity alone must not silently link a ScenePulse candidate');
assert.match(app, /detail\.action === 'stage-scenepulse-candidate-review'/, 'Horde must claim candidate review staging');
assert.match(app, /detail\.action === 'promote-scenepulse-candidate'/, 'Horde must claim candidate promotion');
assert.match(app, /detail\.action === 'link-scenepulse-candidate'/, 'Horde must claim canonical identity linking');

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

const candidatePromotionDraftContext = {
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value)
};
const richPromotionDraft = vm.runInNewContext(`${lastFunction('scenePulseCandidatePromotionKind')}\n${candidatePromotionDraft}\nscenePulseCandidatePromotionDraft(${JSON.stringify({
    candidateType: 'character', label: 'Mira', scenePulseCharacter: matchedScenePulseCharacter
})})`, candidatePromotionDraftContext);
assert.equal(richPromotionDraft.specialist.fertStatus, 'N/A', 'graduation must preserve a supplied specialist state exactly');
assert.equal(richPromotionDraft.goals.longTermGoal, 'Clear her name', 'graduation must retain ScenePulse long-term goals as evidence');

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

console.log('ScenePulse native-source integration contract passed.');
