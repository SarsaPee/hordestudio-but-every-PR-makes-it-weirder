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
const sourceTimeline = read('scenepulse', 'vendor', 'ScenePulse', 'src', 'ui', 'timeline.js');
const sourceWiki = read('scenepulse', 'vendor', 'ScenePulse', 'src', 'ui', 'character-wiki.js');
const sourceWeb = read('scenepulse', 'vendor', 'ScenePulse', 'src', 'ui', 'relationship-web.js');
const sourceSlots = read('scenepulse', 'vendor', 'ScenePulse', 'src', 'prompts', 'slots.js');

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
const panelMount = lastFunction('renderScenePulseWorldsWorkspace');

assert.match(normalizer, /semanticSuppliedFields/, 'normalizer must retain semantic supplied-field provenance');
assert.match(merger, /semanticProvided/, 'delta merger must retain nested semantic field provenance');
assert.match(currentTurn, /sess\.history.*\.reverse\(\)/s, 'current authored turn must follow visible history');
assert.match(app, /const SCENEPULSE_TOUR_EXAMPLE_DATA = Object\.freeze/, 'the actual source tutorial fixture must remain present');
assert.match(acceptedHandoff, /scenePulseHumanOverlay\(protocol, fixtureWithPreferences\)/, 'fixture state must accept an explicit human edit overlay without registry backfill');
assert.match(acceptedHandoff, /settlementStatus === 'settled'[\s\S]*snapshot\?\.turnId/, 'live handoff must be exact-turn settled');
assert.doesNotMatch(acceptedHandoff, /world\.entities|world\.quests|sess\.quests/, 'accepted ScenePulse handoff must not borrow Horde registry fields');

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
assert.doesNotMatch(runtime, /import\(`\$\{ROOT\}\/index\.js`\)/, 'runtime must not launch ScenePulse autonomous ST/provider interceptor');
assert.match(runtime, /modules\.panel\.createPanel\(\)/, 'source must create its own panel DOM');
assert.match(runtime, /modules\.updatePanel\.updatePanel\(normalized, true\)/, 'source must render its own normalized panel');
assert.match(runtime, /modules\.timeline\.renderTimeline\(\)/, 'source must render its own history UI');
assert.match(runtime, /modules\.thoughts\.updateThoughts\(normalized\)/, 'source thought module must render its own panel');
assert.match(runtime, /materializeNativeTracker/, 'fixture-backed fields must be materialized before source render');
assert.match(runtime, /if \(!authority\.size\) return fixture/, 'the native source surface must remain fixture-only until a field sync path is explicitly granted');
assert.match(runtime, /nativeFieldAuthority/, 'field-by-field authority must be explicit rather than inferred from live mode');
assert.match(runtime, /!clear\.has\(key\).*?!replace\.has\(key\).*?!hasValue\(value\)/s, 'implicit empty live values must not shrink source fixture data');
assert.match(runtime, /for \(let index = 0; index < 12; index \+= 1\)/, 'fixture-only source mount must exercise the populated tutorial timeline');
assert.match(runtime, /ScenePulse source materialization beside Sidecar’s settled handoff/, 'the native and Sidecar readings need a visible comparison surface');
assert.match(runtime, /disagreement is retained for review; neither column is silently overwritten/i, 'conflicts must remain inspectable');
assert.match(runtime, /refresh-scene-pulse/, 'source refresh controls must dispatch to Sidecar');
assert.match(runtime, /stage-story-idea/, 'source Story Idea controls must dispatch to Horde actions');
assert.match(runtime, /commit-scenepulse-source-edit/, 'source edit saves must cross an auditable host boundary');
assert.match(runtime, /persist-scenepulse-source-settings/, 'source preference saves must use a separate host boundary');

assert.match(sourcePanel, /export function createPanel\(\)/, 'vendored source panel must remain the actual panel creator');
assert.match(sourcePanel, /sp-tb-wiki/, 'source toolbar must retain Character Wiki');
assert.match(sourcePanel, /sp-tb-edit/, 'source edit mode must remain present');
assert.match(sourceUpdate, /sp-idea-paste.*sp-idea-inject/s, 'source Story Ideas must retain source action controls');
assert.match(sourceUpdate, /sp-meter-bar-track/, 'source relationship meter renderer must remain present');
assert.match(sourceTimeline, /export function renderTimeline\(\)/, 'source timeline must remain callable');
assert.match(sourceWiki, /export function openCharacterWiki\(\)/, 'source Wiki must remain a full focused source view');
assert.match(sourceWiki, /document\.body\.appendChild\(overlay\)/, 'source Wiki must retain viewport takeover behavior');
assert.match(sourceWeb, /export function openRelationshipWeb\(entries\)/, 'source relationship graph must remain callable');
assert.match(sourceSlots, /ONLY return fields whose values CHANGED/, 'source delta contract must remain compact');
assert.match(sourceSlots, /ALWAYS include: time, date, elapsed/, 'source delta contract must retain temporal continuity');

assert.match(css, /#sp-panel\[data-horde-source-runtime="true"\]/, 'native source panel must be styled as World HUD, not a narrow ST sidebar');
assert.match(css, /\.sp-horde-compare-overlay/, 'comparison UI must be visibly styled');
assert.match(css, /\.sp-horde-compare-disagrees/, 'comparison UI must distinguish disagreement');
assert.match(css, /\.sp-horde-source-bridge-controls/, 'native source global Save/Discard controls must be styled');

assert.match(sourceEdit, /type: 'scene_pulse_human_edit'/, 'direct edits must become human ScenePulse history nodes');
assert.match(sourceEdit, /author: 'human'/, 'direct edit author must be preserved');
assert.match(sourceEdit, /before,[\s\S]*after,[\s\S]*rawPatch: patch,[\s\S]*undo:/, 'direct edit must preserve before, after, raw patch, and undo data');
assert.match(app, /function scenePulseHumanStatePromptContext\(/, 'human ScenePulse state needs a compact prompt context');
assert.match(app, /const readerPrompt = prompt \+ humanSceneStateContext/, 'human ScenePulse state must reach the Reader prompt');
assert.match(app, /ffStack\.prompt \+ ffHandoffContract \+ narratorHumanSceneState/, 'human ScenePulse state must reach the Narrator prompt');
assert.match(app, /do not describe them as editing/, 'model context must preserve story-state language rather than UI terminology');
assert.match(humanOverlay, /sidecarScenePulse/, 'human overlay must preserve unmodified Sidecar reading for comparison');
assert.match(humanOverlay, /Human ScenePulse edit/, 'human edit must appear in source history');
assert.match(sourcePrefs, /customPanels: schema/, 'source custom-panel definition must persist as World schema');
assert.match(app, /nativeFieldAuthority/, 'Horde preference storage must preserve the explicit source-to-Sidecar field authority ledger');
assert.match(app, /detail\.action === 'commit-scenepulse-source-edit'/, 'Horde must claim source edit commits');
assert.match(app, /detail\.action === 'persist-scenepulse-source-settings'/, 'Horde must claim source preference saves');
assert.match(app, /detail\.action === 'stage-story-idea'/, 'Horde must claim source Story Idea actions');
assert.match(app, /detail\.action === 'refresh-scene-pulse'/, 'Horde must claim source Reader refresh actions');

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
