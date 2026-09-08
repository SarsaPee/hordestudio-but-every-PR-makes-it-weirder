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
const sourceCharacterHistory = read('scenepulse', 'vendor', 'ScenePulse', 'src', 'ui', 'character-history.js');
const sourceWeb = read('scenepulse', 'vendor', 'ScenePulse', 'src', 'ui', 'relationship-web.js');
const sourceSparklines = read('scenepulse', 'vendor', 'ScenePulse', 'src', 'ui', 'sparklines.js');
const sourceRelationshipsCss = read('scenepulse', 'vendor', 'ScenePulse', 'css', 'relationships.css');
const sourceConstants = read('scenepulse', 'vendor', 'ScenePulse', 'src', 'constants.js');
const sourceGuidedTour = read('scenepulse', 'vendor', 'ScenePulse', 'src', 'settings-ui', 'guided-tour.js');
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
const characterIntelligenceNormalizer = lastFunction('normalizeSidecarCharacterIntelligence');
const scenePulseCharacterCognitionBridge = lastFunction('scenePulseCharacterCognitionBridge');
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
const switchViewFunction = lastFunction('switchView');
const enterWorldFunction = lastFunction('enterWorld');
const nativePresentationAuthority = lastFunction('scenePulseDeclaredNativeFieldAuthority');
const readerPass = lastFunction('runSidecarSemanticReading', 'async function');
const readerRefresh = lastFunction('refreshSidecarSceneIntelligence', 'async function');
const acceptedRefresh = lastFunction('refreshAcceptedScenePulseProjection', 'async function');
const candidateEligibility = lastFunction('scenePulseCandidatePromotionEligibility');
const candidateCharacterEvidence = lastFunction('scenePulseCharacterEvidenceForCandidate');
const candidatePromotionDraft = lastFunction('scenePulseCandidatePromotionDraft');
const candidateStage = lastFunction('stageScenePulseCandidateForWorldReview', 'async function');
const candidateLink = lastFunction('linkScenePulseCandidateToCanonical', 'async function');
const candidateDuplicateResolution = lastFunction('resolveScenePulseCandidateDuplicate', 'async function');
const impliedPromotion = lastFunction('promoteImpliedWorldRecord', 'async function');
const promotionAppearance = lastFunction('applyScenePulsePromotionAppearance');
const graphNormalizer = lastFunction('normalizeSidecarNpcRelationshipGraph');
const sourceMacroOrigin = lastRuntimeFunction('sourceMacroOrigin');
const sourceCommandStatus = lastRuntimeFunction('sourceCommandStatus');
const sourceCommand = lastRuntimeFunction('runSourceCommand', 'async function');
const sourceRefresh = lastRuntimeFunction('beginReaderRefresh');
const sourceSetup = lastRuntimeFunction('showWorldsSetupGuide');
const hostActionHandler = lastFunction('bindScenePulseWorldsHostActions');
const sourceHostActions = frozenRuntimeStringArray('SOURCE_HOST_ACTIONS');

assert.match(normalizer, /semanticSuppliedFields/, 'normalizer must retain semantic supplied-field provenance');
assert.match(merger, /semanticProvided/, 'delta merger must retain nested semantic field provenance');
assert.match(normalizer, /scenePulseCharacterCognitionBridge/, 'a rich ScenePulse character card must be able to supplement the existing cognition lane');
assert.match(scenePulseCharacterCognitionBridge, /if \(!stableId \|\| !name \|\| !thought \|\| controlledCard/, 'card cognition may not use a display name or invent a subject identity');
assert.match(scenePulseCharacterCognitionBridge, /const presenceMode = rosterPresence\(stableId, name, card\);[\s\S]*?if \(!presenceMode\) return;/, 'card cognition may not invent current-scene presence');
assert.match(scenePulseCharacterCognitionBridge, /controlledCard\(card, stableId\)/, 'a rich ScenePulse card must never create an unexpressed player thought');
assert.equal((app.match(/^function normalizeSidecarReaderEnvelope\(/gm) || []).length, 1, 'only one active Sidecar Reader normalizer may exist');
assert.equal((app.match(/^function parseSidecarReaderOutput\(/gm) || []).length, 1, 'only one active Sidecar Reader parser may exist');
assert.equal((app.match(/^function mergeSidecarReaderEnvelope\(/gm) || []).length, 1, 'only one active Sidecar Reader delta merger may exist');
assert.equal((app.match(/^function attachSidecarReaderSnapshot\(/gm) || []).length, 1, 'only one active Sidecar Reader snapshot attachment path may exist');
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
assert.doesNotMatch(acceptedHandoff, /world\.entities|world\.quests|sess\.quests/, 'accepted ScenePulse handoff must not borrow Horde registry fields');
assert.match(nativePresentationAuthority, /SCENEPULSE_NATIVE_PRESENTATION_FIELDS/, 'the ScenePulse-facing ownership family must be explicit');
assert.match(acceptedHandoff, /nativeFieldAuthority/, 'each accepted handoff must carry the declared source-field authority');
assert.match(acceptedHandoff, /candidateReview/, 'settled identity handoffs must remain beside the ScenePulse tracker rather than inside it');
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
assert.match(readerPass, /Do not derive an ID from a display name/, 'Reader identity must never be inferred from a mutable source label');
assert.match(readerPass, /Each relationship record MUST include relationshipId and its characterId/, 'relationship dimensions need stable identity from their first source projection');
assert.match(normalizer, /npcRelationshipGraph/, 'Reader normalization must retain the compact NPC graph beside ScenePulse fields');
assert.match(merger, /providedField\('npcRelationshipGraph'\)/, 'NPC graph cache updates must honor nested delta-field provenance');
assert.match(acceptedHandoff, /npcRelationshipGraph/, 'accepted handoffs must retain Reader graph data beside the source tracker');

assert.match(html, /scenepulse-source-runtime\.js/, 'native source runtime must be loaded before app.js');
assert.match(panelMount, /HordeScenePulseSourceRuntime\.mount\(host, handoff\)/, 'World HUD must mount native source runtime');
assert.doesNotMatch(panelMount.slice(0, panelMount.indexOf('// Gate B adapter below')), /HordeScenePulseWorlds\.mount\(host, handoff\)/, 'native source failure must not silently fall back to the hand-drawn adapter');
assert.match(panelMount, /intentionally not substituted with a host lookalike/, 'failure state must remain truthful');
assert.match(panelMount, /if \(state\.view !== 'worldPlay'\)[\s\S]*?HordeScenePulseSourceRuntime\?\.unmount/, 'a late World redraw may not mount ScenePulse over a library route');
assert.match(switchViewFunction, /state\.view === 'worldPlay' && viewName !== 'worldPlay'[\s\S]*?HordeScenePulseSourceRuntime\?\.unmount/, 'leaving World Play must remove the source runtime and its document-level effects');
assert.ok(enterWorldFunction.indexOf("switchView('worldPlay');") < enterWorldFunction.indexOf('renderWorldPlayState();'), 'entering a World must activate the World route before mounting the ScenePulse runtime');

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
assert.match(runtime, /const customPanels = Array\.isArray\(prefs\.customPanels\) \? clone\(prefs\.customPanels\) : \[\];/, 'native runtime must render the handoff source schema rather than recreate a Horde-local tour panel');
assert.doesNotMatch(runtime, /RPG Stats \(Tour Example\)/, 'the upstream tour panel schema must enter through the source handoff, not a duplicate runtime fallback');
assert.match(runtime, /if \(!authority\.size\) return fixture/, 'an older handoff with no declared field path must remain fixture-backed');
assert.match(runtime, /nativeFieldAuthority/, 'field-by-field authority must be explicit rather than inferred from live mode');
assert.match(runtime, /nativeFieldHasAcceptedValue/, 'a declared field must still prove an accepted value before replacing the tutorial support');
assert.match(runtime, /!clear\.has\(key\).*?!replace\.has\(key\).*?!hasValue\(value\)/s, 'implicit empty live values must not shrink source fixture data');
assert.match(sourceRelationshipsCss, /\.sp-meter-row \{ display: grid; grid-template-columns: auto 1fr minmax\(0, 70px\) 44px;/, 'source relationship meters must retain horizontal grid tracks');
assert.match(sourceRelationshipsCss, /\.sp-meter-bar-fill \{ height: 100%;[\s\S]*?transition: width/, 'the coloured relationship fill must encode current horizontal width');
assert.match(sourceRelationshipsCss, /\.sp-meter-bar-prev \{ position: absolute; top: 0; bottom: 0; width: 2px;/, 'the previous-value delta marker must remain a vertical line on the horizontal track');
assert.ok(html.indexOf('scenepulse/vendor/ScenePulse/style.css') < html.indexOf('scenepulse/horde/scene-pulse-worlds.css'), 'the native Horde bridge stylesheet must load after the vendored source CSS');
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
assert.match(humanOverlay, /Human ScenePulse edit/, 'human edit must appear in source history');
assert.match(sourcePrefs, /customPanels: schema/, 'source custom-panel definition must persist as World schema');
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
    characterIntelligenceNormalizer,
    scenePulseCharacterCognitionBridge,
    graphNormalizer,
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

const cognitionQueueSource = [
    lastFunction('sidecarProjectionClaimText'),
    lastFunction('sidecarCognitionAccessForPresence'),
    lastFunction('sidecarTurnCognitionEvidence'),
    lastFunction('queueSidecarTurnCognitionJobs')
].join('\n');
const cardThoughtCognitionJob = vm.runInNewContext(`${cognitionQueueSource}\n(() => {\n    const protocol = { readerCandidates: [{ candidateId: 'cand_nia', candidateType: 'character', settlementStatus: 'settled' }] };\n    const turn = { id: 'turn_card', readerSnapshotId: 'snapshot_card', readerEnvelope: ${JSON.stringify(scenePulseCognitionEnvelope.cardOnly)}, sceneId: 'scene_card', sequenceId: 'sequence_card' };\n    const ids = queueSidecarTurnCognitionJobs({ entities: [] }, {}, protocol, turn);\n    return { ids, job: protocol.jobs[0] };\n})()`, {
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value),
    safeJsonClone: value => JSON.parse(JSON.stringify(value)),
    window: { HordeSidecarMemoryGraph: { ensureJobs: protocol => { protocol.jobs = protocol.jobs || []; return protocol.jobs; } } }
});
assert.deepEqual(JSON.parse(JSON.stringify(cardThoughtCognitionJob.ids)), ['turn_cognition:turn_card:cand_nia'], 'a same-packet ScenePulse card thought must queue exactly one existing turn-cognition job');
assert.equal(cardThoughtCognitionJob.job.candidateId, 'cand_nia', 'the cognition job must retain the ScenePulse stable candidate ID');
assert.equal(cardThoughtCognitionJob.job.provisionalIntelligence.sceneLocalImpression.source, 'scenepulse_character_card', 'the cognition job must retain the card-thought source marker for its existing memory pipeline');
assert.match(cardThoughtCognitionJob.job.perceptionEvidence, /I can hear the argument through the door/, 'the existing cognition job must receive the same current ScenePulse thought as perception evidence');

// A deliberate Thoughts reread replaces only the derived perception lane for
// the same turn. Its old cognition remains inspectable as superseded evidence;
// its replacement job is pinned to the newly accepted Reader snapshot.
const refreshedThoughtCognitionJob = vm.runInNewContext(`${cognitionQueueSource}\n(() => {\n    const original = ${JSON.stringify(scenePulseCognitionEnvelope.cardOnly)};\n    const refreshed = JSON.parse(JSON.stringify(original));\n    refreshed.characterIntelligence[0].sceneLocalImpression.text = 'The argument has turned dangerous; keep clear of the door.';\n    const protocol = {\n        readerCandidates: [{ candidateId: 'cand_nia', candidateType: 'character', settlementStatus: 'settled' }],\n        jobs: [{ id: 'turn_cognition:turn_card:cand_nia', type: 'turn_cognition', status: 'completed', turnId: 'turn_card', subjectRef: 'cand_nia', readerSnapshotId: 'snapshot_card' }],\n        memoryGraph: { cognition: [{ id: 'cognition_old', status: 'active', turnCognitionJobId: 'turn_cognition:turn_card:cand_nia', provenance: { readerSnapshotId: 'snapshot_card' } }] }\n    };\n    const turn = { id: 'turn_card', readerSnapshotId: 'snapshot_thought_refresh', readerEnvelope: refreshed, sceneId: 'scene_card', sequenceId: 'sequence_card' };\n    const ids = queueSidecarTurnCognitionJobs({ entities: [] }, {}, protocol, turn);\n    return { ids, oldJob: protocol.jobs[0], newJob: protocol.jobs[1], oldCognition: protocol.memoryGraph.cognition[0] };\n})()`, {
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value),
    safeJsonClone: value => JSON.parse(JSON.stringify(value)),
    window: { HordeSidecarMemoryGraph: {
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

console.log('ScenePulse native-source integration contract passed.');
