/**
 * Scene Intelligence source-bound regression checks.
 * Run with: node scratch/scene_intelligence_contract_test.js
 *
 * These assertions intentionally inspect the actual integrated runtime. They
 * guard the two failure modes that made a correct Reader envelope invisible:
 * nested semantic delta fields being discarded, and UI selection following a
 * bookkeeping array instead of the latest authored take.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const scenePulseModule = fs.readFileSync(path.join(__dirname, '..', 'scenepulse', 'horde', 'scene-pulse-worlds.js'), 'utf8');
const scenePulseCss = fs.readFileSync(path.join(__dirname, '..', 'scenepulse', 'horde', 'scene-pulse-worlds.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sourcePromptSlots = fs.readFileSync(path.join(__dirname, '..', 'scenepulse', 'vendor', 'ScenePulse', 'src', 'prompts', 'slots.js'), 'utf8');

function lastFunction(name, prefix = 'function') {
    const start = app.lastIndexOf(`${prefix} ${name}(`);
    assert(start >= 0, `missing ${name}`);
    const open = app.indexOf('{', app.indexOf(') {', start));
    let depth = 0;
    for (let index = open; index < app.length; index++) {
        if (app[index] === '{') depth++;
        if (app[index] === '}' && --depth === 0) return app.slice(start, index + 1);
    }
    throw new Error(`unclosed ${name}`);
}

const normalizer = lastFunction('normalizeSidecarReaderEnvelope');
const merger = lastFunction('mergeSidecarReaderEnvelope');
const workspace = lastFunction('buildSidecarWorkspaceModel');
const currentTurn = lastFunction('currentSidecarAuthoredTurn');
const message = lastFunction('appendWorldMessageUI');
const adapter = lastFunction('scenePulseWorldsAdapter');
const panel = lastFunction('renderScenePulseWorldsWorkspace');
const switcher = lastFunction('switchView');
const thoughts = lastFunction('scenePulseThoughtPanel');
const thoughtRefresh = lastFunction('refreshScenePulseThoughts', 'async function');
const dossiers = lastFunction('scenePulseDossiers');
const acceptedHandoff = lastFunction('scenePulseAcceptedHandoff');

assert.match(normalizer, /semanticSuppliedFields/, 'normalizer must preserve nested semantic-field provenance');
assert.match(merger, /semanticProvided/, 'delta merger must check nested semantic-field provenance');
assert.match(merger, /merged\.semanticSuppliedFields = \[\.\.\.new Set\(incoming\.semanticSuppliedFields \|\| \[\]\)\]/,
    'nested supplied fields must describe the current packet rather than stale cumulative state');
assert.match(currentTurn, /sess\.history.*\.reverse\(\)/s,
    'current authored turn must follow visible history rather than protocol array position');
assert.match(workspace, /const latestTurn = currentSidecarAuthoredTurn\(protocol, sess\)/,
    'workspace freshness must be evaluated against the latest visible authored take');
assert.match(adapter, /model\.latestTurn\?\.reader/, 'live ScenePulse must prefer the Reader packet attached to the latest authored turn');
assert.match(adapter, /scenePulse/, 'rich ScenePulse fields must survive at the adapter boundary');
assert.match(adapter, /elapsed/, 'source scene timing fields must survive at the adapter boundary');
assert.match(adapter, /witnesses/, 'source scene witness fields must survive at the adapter boundary');
assert.match(app, /const SCENEPULSE_TOUR_EXAMPLE_DATA = Object\.freeze/, 'the actual ScenePulse tour fixture must be present in the host runtime');
const gateAReturn = panel.indexOf('window.HordeScenePulseWorlds.mount(host, handoff);');
const legacyAdapter = panel.indexOf('const model = buildSidecarWorkspaceModel(world, sess);');
assert(gateAReturn >= 0, 'the source panel must mount through its accepted handoff boundary');
assert(legacyAdapter > gateAReturn, 'legacy generic adapter must remain below the source-panel early return while it is removed');
const gateA = panel.slice(0, panel.indexOf('return;', gateAReturn) + 'return;'.length);
assert.match(gateA, /scenePulseAcceptedHandoff\(world, sess\)/, 'the source panel must choose only fixture or exact accepted Reader handoffs');
assert.match(app, /scenePulse: sealScenePulseTourFixture\(safeJsonClone\(SCENEPULSE_TOUR_EXAMPLE_DATA\)\)/, 'the tutorial payload must be recursively sealed before the imported surface receives it');
assert.doesNotMatch(gateA, /buildSidecarWorkspaceModel|scenePulseWorldsAdapter|scenePulseDossiers/, 'the source panel must not use the legacy generic workspace adapter');
assert.match(acceptedHandoff, /protocolForSidecarTimeline[\s\S]*currentSidecarAuthoredTurn/, 'the live handoff must be bound to the current authored turn');
assert.match(acceptedHandoff, /settlementStatus === 'settled'[\s\S]*snapshot\?\.turnId/, 'the live handoff must require settled snapshot ancestry for that exact turn');
assert.match(acceptedHandoff, /acceptedScenePulse[\s\S]*Object\.keys\(acceptedScenePulse\)\.length/, 'an empty Reader ScenePulse result must retain the fixture rather than collapse the surface');
assert.doesNotMatch(acceptedHandoff, /world\.entities|world\.quests|sess\.quests|scenePulseWorldsAdapter/, 'the live handoff must not backfill Reader fields from Horde registries or the legacy adapter');
assert.match(scenePulseModule, /\['accepted_fixture', 'accepted_live'\]/, 'the import must reject unaccepted input while accepting only settled fixture/live handoffs');
assert.match(scenePulseModule, /function composeFixtureBackedScenePulse/, 'the imported source surface must layer a live handoff over the sealed fixture');
assert.match(scenePulseModule, /fixtureScenePulse[\s\S]*origins/, 'field provenance must survive the fixture/live composition boundary');
assert.match(scenePulseModule, /function fixtureChip[\s\S]*fixture-backed/, 'unsynced source fields must remain visibly fixture-backed in live mode');
assert.match(scenePulseModule, /function hasLiveScenePulseValue[\s\S]*Array\.isArray\(value\)\) return value\.length > 0/, 'an empty model collection must be distinguished from usable live ScenePulse data');
assert.match(scenePulseModule, /!clear\.has\(key\) && !replace\.has\(key\) && !hasLiveScenePulseValue\(live\[key\]\)\) return/, 'an implicit blank must not collapse the source fixture; only explicit clear/replace can do so');
assert.match(acceptedHandoff, /clearFields:[\s\S]*deltaScenePulse\.clearFields/, 'the accepted handoff must carry an explicit model clear declaration separately from its merged projection');
assert.match(scenePulseModule, /previousData: accepted\.status === 'accepted_live' && accepted\.previousScenePulse \? clone\(accepted\.previousScenePulse\) : null/,
    'a later settled predecessor must be kept separate from the current merged ScenePulse projection');
assert.doesNotMatch(scenePulseModule, /world\.entities|model\.snapshots|#world-user-input|buildSidecarWorkspaceModel/, 'the fixture surface must not borrow Melbourne/registry data or a Horde draft');
assert.match(switcher, /state\.view === 'worldPlay' && viewName !== 'worldPlay'[\s\S]*HordeScenePulseWorlds\?\.unmount/, 'leaving World Play must tear down source body-level fixture effects');
assert.match(scenePulseModule, /id="sp-panel"/, 'the whole source panel shell must be mounted');
assert.match(scenePulseModule, /function sourceViewportMode\(\)/, 'the source class-driven mobile and tablet modes must be selected by the host viewport');
assert.match(scenePulseModule, /width <= 600\) return 'mobile';[\s\S]*width <= 1024\) return 'tablet'/, 'the source viewport boundaries must retain mobile and tablet distinctions');
assert.match(scenePulseModule, /sp-mode-\$\{mode\}/, 'narrow host views must mount the source panel mode class instead of a squeezed desktop sidebar');
assert.match(scenePulseModule, /mobile-minimize|mobile-restore|sp-mobile-topbar|sp-mobile-fab/, 'source mobile chrome must retain minimize and restore controls');
assert.match(scenePulseModule, /sp-section-refresh/, 'source section refresh controls must remain visible');
assert.match(scenePulseModule, /Character Wiki|Relationship Web|Payload & Diff Inspector|Panel Manager|Custom Panels/, 'source focused views and managers must be part of the imported surface');
const renderedFixtureActions = [...new Set([...scenePulseModule.matchAll(/data-action="([^"]+)"/g)].map(match => match[1]))];
const handledFixtureActions = new Set([...scenePulseModule.matchAll(/action === '([^']+)'/g)].map(match => match[1]));
assert.deepEqual(renderedFixtureActions.filter(action => !handledFixtureActions.has(action)), [], 'every visible ScenePulse fixture action must have a real handler');
assert.match(scenePulseModule, /id="sp-thought-panel"/, 'source-derived Inner Thoughts panel must be mounted by the imported surface');
assert.match(scenePulseModule, /thought-snap|thought-ghost|data-resize-handle/, 'thought drag/resize/ghost/snap controls must be present');
assert.match(scenePulseModule, /class="sp-feat-item" data-action="feature" data-feature="\$\{key\}"/,
    'the source feature-menu label must own its reliable fixture-local action');
assert.match(scenePulseModule, /action === 'feature'[\s\S]*event\.preventDefault\(\)[\s\S]*target\.dataset\.feature === 'thoughts'\) state\.thoughtsOpen = enabled/,
    'the source Thoughts feature control must restore the floating panel after it is hidden');
assert.match(scenePulseModule, /CHAR_SECTION_ICON/, 'character cards must retain source subsection iconography');
for (const characterGroup of ['Right Now', 'Appearance', 'Carrying', 'Goals']) {
    assert.match(scenePulseModule, new RegExp(`characterSubsection\\('${characterGroup}'`), `character cards must preserve the source ${characterGroup} hierarchy`);
}
assert.match(scenePulseModule, /sp-char-inventory-item/, 'character carrying must retain source individual-item chips');
assert.match(scenePulseModule, /edit-character-field/, 'fixture character values must be editable through the source edit affordance');
assert.match(scenePulseModule, /contentEditable = 'true'/, 'fixture character editing must be truly inline rather than a dead control');
assert.match(scenePulseModule, /no Horde record changed/, 'fixture character edits must explicitly remain isolated from Horde state');
assert.doesNotMatch(scenePulseModule, /#world-user-input/, 'inline fixture edits must not target the Horde message draft');
assert.match(scenePulseModule, /edit-scene-field/, 'source Scene Details must retain a working local edit affordance');
assert.match(scenePulseModule, /no Horde scene record changed/, 'fixture scene edits must explicitly remain isolated from Horde state');
assert.match(scenePulseModule, /Paste|Inject/, 'Story Ideas must preserve the source actions');
assert.match(scenePulseModule, /IDEA_CATEGORY.*sp-idea-icon/s, 'Story Ideas must retain the source category icon and colour system');
assert.match(scenePulseModule, /IDEA_ACTION_ICON.*sp-idea-paste.*sp-idea-inject/s, 'Story Idea actions must stay in the source card header rather than become generic body buttons');
assert.match(scenePulseModule, /startsWith\('idea-'\).*state\.cards\[key\] === true/s, 'source Story Ideas must toggle from their collapsed default state');
assert.match(scenePulseCss, /sp-idea-card \{ display: block;.*border-left: 3px solid var\(--idea-color/s, 'the source category colour must override Horde legacy card styling');
assert.match(scenePulseModule, /sp-quest-dialog/, 'fixture quest addition must use the source-style dialog rather than an empty dispatcher');
assert.match(scenePulseModule, /quest-complete|quest-restore|quest-confirm-remove/, 'fixture quest lifecycle actions must work locally without invoking Horde');
assert.match(scenePulseModule, /edit-quest-field/, 'source quest name, detail, and North Star editing must have a real fixture-local path');
assert.match(scenePulseModule, /no Horde quest changed/, 'fixture quest actions must state their isolation from the host');
assert.match(scenePulseModule, /TOUR_TIMELINE/, 'the source tour timeline must be rendered without fake live history');
assert.match(scenePulseModule, /webPositions\(rels, state\.webClassic\)/, 'Relationship Web must use the source-derived seeded layout rather than decorative card coordinates');
assert.match(scenePulseModule, /sp-wiki-export-btn" data-action="relationship-web"/, 'the source Character Wiki must remain the main-panel route to Relationship Web');
assert.doesNotMatch(scenePulseModule, /sp-rel-actions/, 'main relationship cards must not retain invented generic web/history buttons');
assert.match(scenePulseModule, /No NPC-to-NPC analysis is fabricated/, 'fixture graph must not invent unsupported NPC ties');
assert.match(scenePulseModule, /All Snapshots/, 'the source timeline browser surface must remain available');
assert.match(scenePulseModule, /No trend line is drawn: a single accepted tutorial reading is not history/, 'fixture relationship graphs must not fabricate a time series');
assert.match(scenePulseModule, /diff-mode|profile-tab/, 'source inspector and profile tabs must retain local working modes');
assert.match(scenePulseModule, /rawDelta \? state\.deltaData : state\.data/, 'Copy payload must copy the raw compact Reader patch when the Delta Payload tab is selected');
assert.match(scenePulseModule, /new CustomEvent\('horde-scenepulse-action'/, 'source actions must cross to Horde through a named host boundary rather than import composer knowledge');
assert.match(scenePulseModule, /requestHostAction\(host, 'stage-story-idea'/, 'source Paste/Inject must request the Horde story-direction action');
assert.match(scenePulseModule, /requestHostAction\(host, 'refresh-scene-pulse'/, 'source refresh must request a Reader-only Horde refresh');
assert.match(scenePulseModule, /\.sp-idea-paste, \.sp-idea-inject'\)\.forEach\(button => button\.addEventListener\('click'/,
    'Story Idea controls must keep the source direct-listener pattern so card expansion cannot swallow Paste/Inject');
assert.match(scenePulseModule, /source\.hook !== source\.name/, 'a compact Reader branch must not duplicate its single description when staged as a new prompt direction');
assert.match(app, /function bindScenePulseWorldsHostActions\(/, 'Horde must claim source host actions at the accepted handoff boundary');
assert.match(app, /detail\.action === 'stage-story-idea'/, 'Horde must wire the source Paste/Inject event to its existing composer behavior');
assert.match(app, /detail\.action === 'refresh-scene-pulse'/, 'Horde must wire source refresh without falling back to a generic sidebar');
assert.match(scenePulseModule, /OVERLAY_ROOT_ID = 'sp-worlds-overlay-root'/, 'focused ScenePulse views need an application-level overlay root');
assert.match(scenePulseModule, /document\.body\.appendChild\(root\)/, 'the overlay root must escape the narrow Worlds column');
assert.match(scenePulseModule, /root\.innerHTML = overlays/, 'focused source views must render in the application-level root');
assert.match(scenePulseModule, /sp-meter-bar-wrap.*sp-meter-bar-track.*sp-meter-bar-fill/s, 'relationship meters must use the source horizontal bar structure');
assert.match(scenePulseModule, /sp-meter-bar-prev.*Previous accepted value/, 'the marker must represent a previous accepted reading');
assert.match(scenePulseModule, /function acceptedRelationshipGraphSamples\(/, 'relationship history must read accepted Reader snapshots separately from visible fixture fallback');
assert.match(scenePulseModule, /Fixture fallback is not plotted as story history/, 'relationship history must not render fixture fallback as fabricated multi-turn data');
assert.match(scenePulseModule, /data-action="timeline" data-snapshot/, 'accepted relationship graph points must return to their complete historical ScenePulse projection');
assert.match(scenePulseModule, /function detectAcceptedScenePulseStagnation\(/, 'the source stagnation diagnostic must be present in the Worlds adapter');
assert.match(scenePulseModule, /state\.mode !== 'accepted_live' \|\| state\.viewingHistory/, 'stagnation must not treat the fixture or a historical scrub as current live tracking');
assert.match(scenePulseModule, /data-action="stagnation-dismiss"/, 'stagnation needs the source dismiss affordance rather than permanent home-screen noise');
assert.match(app, /const finishReaderMetrics = packet =>/, 'Reader calls must preserve measured latency and provider-reported usage for ScenePulse analytics');
assert.match(app, /source: 'reader_call'/, 'analytics must distinguish measured Reader-call metrics from legacy placeholder metadata');
assert.match(app, /usage: safeJsonClone\(packet\.readerMetrics/, 'accepted Reader snapshots must retain call metrics with the settled envelope');
assert.match(scenePulseModule, /function analytics\(state\)/, 'the source analytics surface must be available on demand');
assert.match(scenePulseModule, /Provider-reported tokens/, 'analytics must distinguish unavailable provider usage from an invented token count');
assert.match(scenePulseModule, /return value < 100 \? '<0\.1s'/, 'measured sub-tenth-second calls must not be rounded into a fabricated zero duration');
assert.match(scenePulseModule, /Delta savings compare the real compact ScenePulse patch/, 'analytics must name byte reduction precisely rather than presenting an estimated token saving as fact');
assert.match(scenePulseModule, /function debugInspector\(state\)/, 'the source Debug Inspector must remain an available focused ScenePulse surface');
assert.match(scenePulseModule, /Raw compact Reader ScenePulse patch only/, 'debug packet inspection must not misrepresent a compact accepted delta as the full provider transport');
assert.match(scenePulseModule, /Proxy metrics only: browsers do not expose actual GPU load/, 'performance diagnostics must name the browser capability boundary rather than invent GPU telemetry');
assert.match(scenePulseModule, /Player prose and provider request\/response bodies are intentionally excluded/, 'diagnostic export must protect authored content and provider bodies by default');
assert.match(scenePulseModule, /function presetBrowser\(state\)/, 'the source bundled preset browser must be available from the imported ScenePulse surface');
assert.match(scenePulseModule, /sampler hints are advisory only/, 'source sampler hints must remain display-only rather than a hidden provider mutation');
assert.match(scenePulseModule, /root\.oninput = onInput/, 'source preset discovery must filter while typing rather than require a blur');
assert.match(scenePulseModule, /apply-scenepulse-preset/, 'a preset selection must cross an explicit Horde host boundary');
assert.match(app, /function applyScenePulseReaderPreset\(/, 'Horde must persist a selected source preset only in the World Reader profile');
assert.match(app, /does not change Narrator or canonical authority/, 'applying a Reader preset must not be treated as a Narrator or canonical mutation');
assert.match(app, /\[APPLIED SCENEPULSE SOURCE PRESET\]/, 'future Reader prompts must carry the applied source preset explicitly');
assert.match(scenePulseModule, /src\/macros\.js.*src\/slash-commands\.js/s, 'the imported source inventory must include ScenePulse macros and slash commands');
assert.match(scenePulseModule, /function commandConsole\(state\)/, 'the source macro and slash-command surface must be visible in Worlds');
assert.match(scenePulseModule, /function sourceMacroValues\(state\)[\s\S]*raw accepted Reader projection/, 'live macro display must reject presentation-only fixture fallback');
assert.match(app, /function scenePulseSourceMacroValues\(/, 'Horde must resolve source macros at the Reader prompt boundary');
assert.match(app, /priorScenePulseForMacros[\s\S]*options\.priorReaderEnvelope\.scenePulse/, 'prompt macros must resolve only from a prior accepted Reader projection');
assert.doesNotMatch(lastFunction('scenePulseSourceMacroValues'), /world\.entities|fixtureScenePulse|TOUR_EXAMPLE_DATA/, 'prompt macro values must not borrow registry or fixture data');
assert.match(app, /export-scenepulse-history|clear-scenepulse-history/, 'source command export and clear must cross named Horde boundaries');
assert.match(app, /Narration,[\s\/]*canonical state, entities, receipts and the composer/s, 'source clear must remain limited to derived ScenePulse Reader data');
assert.match(app, /function normalizeScenePulseWorldsPreferences\(/, 'source-panel view preferences must be whitelisted before persistence');
assert.match(app, /uiPreferences[\s\S]*scenePulseWorlds/, 'accepted handoffs must carry only stored UI preferences alongside, not inside, scene data');
assert.match(scenePulseModule, /function scenePulseViewPreferences\(state\)/, 'the source adapter must serialize only its own view preferences');
assert.match(scenePulseModule, /persist-scenepulse-view-preferences/, 'view preference persistence must cross a named host boundary');
assert.match(scenePulseModule, /Native source form controls commit on change[\s\S]*panel-toggle/, 'delegated adapter clicks must not cancel source Panel Manager form controls');
assert.match(scenePulseModule, /function characterIdentity\(state, character, index\)/, 'portrait and note associations must be stable-identity keyed rather than name or card-order keyed');
assert.match(scenePulseModule, /state\.portraitAssetIds\[identity\][\s\S]*state\.portraitOverrides\[identity\]/, 'portrait upload must retain both its stable Horde asset reference and its display source');
assert.match(scenePulseModule, /save-scenepulse-portrait/, 'portrait upload must cross an explicit Horde media boundary');
assert.match(scenePulseModule, /clear-scenepulse-portrait/, 'portrait clear must cross an explicit Horde media boundary');
assert.match(scenePulseModule, /data-note-id/, 'Wiki notes must be keyed by the same stable ScenePulse identity');
assert.match(app, /function saveScenePulsePortraitOverride\(/, 'Horde must store a ScenePulse portrait in its portable media system');
assert.match(app, /addWorldMediaAsset\(world, data, 'scenepulse_portrait'/, 'portrait persistence must use Horde media storage rather than a fixture-only data URL');
assert.match(app, /function clearScenePulsePortraitOverride\([\s\S]*Retain the shared\/reusable media asset/, 'clearing a portrait override must not delete shared user media');
assert.match(app, /function scenePulseWorldsHandoffPreferences\([\s\S]*portraitSources/, 'the accepted handoff may resolve presentation media separately from Reader fields');
assert.match(app, /portraitAssetIds, wikiNotes/, 'the preference whitelist must include only bounded portrait references and local notes, not image bytes');
assert.match(scenePulseModule, /delta !== null/, 'the previous-value marker must be conditional on an actual delta');
assert.match(scenePulseModule, /previousRelationship\(state, rel\)/, 'relationship deltas must compare matching settled predecessor records');
assert.match(scenePulseModule, /relationship \? previousRelationship\(state, relationship\) : null/, 'Wiki relationship meters must retain the accepted relationship identity for prior-value matching');
assert.match(scenePulseModule, /focusedRel \? previousRelationship\(state, focusedRel\) : null/, 'Relationship Web meters must retain the accepted relationship identity for prior-value matching');
assert.match(scenePulseModule, /relationshipId \|\| record\?\.characterId/, 'relationship delta matching must prefer a stable accepted identity over a mutable display name');
assert.match(scenePulseModule, /METER_DELTA_FACES/, 'accepted relationship deltas must retain the source-style meter-specific direction faces');
assert.match(scenePulseModule, /meterDeltaFace\(key, delta\)/, 'a signed accepted delta must render beside the current value');
assert.match(scenePulseModule, /function applyHistorySelection\(/, 'history selection must replace the visible ScenePulse projection rather than only highlighting a timeline node');
assert.match(scenePulseModule, /state\.data = composed\.data/, 'a selected accepted snapshot must provide the entire rendered scene projection');
assert.match(scenePulseModule, /state\.viewingHistory = state\.selectedTimeline !== currentId/, 'historical browsing must be explicit and read-only');
assert.match(scenePulseModule, /History is read-only\. Return to current before refreshing this scene\./, 'refresh must not reinterpret a historical snapshot as the active turn');
assert.match(acceptedHandoff, /scenePulse: safeJsonClone\(projection\)/, 'each timeline node must carry its own accepted ScenePulse projection');
assert.match(acceptedHandoff, /deltaScenePulse: safeJsonClone\(rawDelta\)/, 'each historical view must retain that moment\'s compact Reader patch');
assert.match(scenePulseModule, /edit-relationship-field/, 'source relationship metadata must retain a real fixture-local edit path');
assert.match(scenePulseModule, /no Horde relationship changed/, 'fixture relationship edits must explicitly remain isolated from Horde state');
assert.match(scenePulseModule, /data-fixture-samples="1"/, 'a single accepted fixture state must identify itself as one sample');
assert.match(scenePulseModule, /no prior value or delta/, 'fixture meter affordances must not imply an invented predecessor');
assert.match(scenePulseModule, /src\/prompts\/slots\.js/, 'the imported profile surface must retain the source delta-mode slot');
assert.match(sourcePromptSlots, /ONLY return fields whose values CHANGED/, 'the pinned source delta contract must require compact changed-only output');
assert.match(sourcePromptSlots, /ALWAYS include: time, date, elapsed/, 'the compact source delta contract must retain temporal continuity');
assert.match(app, /\[SCENEPULSE DELTA CONTRACT\]/, 'the Horde Reader prompt must make ScenePulse a compact delta projection');
assert.match(app, /scenePulse\.replaceCollections/, 'the Reader prompt must distinguish a deliberate collection replacement from an unchanged omitted collection');
assert.match(app, /function sidecarMergeScenePulse\(/, 'ScenePulse record patches must have a deterministic merge path');
assert.match(app, /sidecarMergeScenePulse\(prior\.scenePulse, incoming\.scenePulse\)/, 'nested ScenePulse deltas must use the specialized record merge');
const scenePulseMergeContext = {
    safeJsonClone: value => JSON.parse(JSON.stringify(value)),
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value)
};
const scenePulseMergeSource = [
    lastFunction('sidecarMergeReaderObject'),
    lastFunction('sidecarMergeReaderRecords'),
    lastFunction('sidecarScenePulseRecordKey'),
    lastFunction('sidecarScenePulseStableIdentity'),
    lastFunction('sidecarScenePulseIdentityAliases'),
    lastFunction('sidecarScenePulseRevealMatchIndex'),
    lastFunction('sidecarScenePulseRecords'),
    lastFunction('sidecarMergeScenePulse')
].join('\n');
const mergedScenePulse = vm.runInNewContext(`${scenePulseMergeSource}\nsidecarMergeScenePulse(${JSON.stringify({
    characters: [{ characterId: 'elena', name: 'Elena', hair: 'dark', innerThought: 'old thought' }],
    relationships: [{ relationshipId: 'elena-rel', name: 'Elena', trust: 55, stress: 30, milestone: 'covered a shift' }],
    mainQuests: [{ questId: 'save-cafe', name: 'Save the cafe', urgency: 'high', detail: 'old detail' }],
    plotBranches: [{ branchId: 'a', category: 'dramatic', name: 'Old direction' }]
})}, ${JSON.stringify({
    charactersPresent: ['elena'],
    characters: [{ characterId: 'elena', innerThought: 'new thought' }],
    relationships: [{ relationshipId: 'elena-rel', trust: 61 }],
    mainQuests: [{ questId: 'save-cafe', detail: 'new detail' }],
    plotBranches: [{ branchId: 'b', category: 'dramatic', name: 'New direction' }],
    replaceCollections: ['plotBranches']
})})`, scenePulseMergeContext);
assert.deepEqual(mergedScenePulse.characters[0], { characterId: 'elena', name: 'Elena', hair: 'dark', innerThought: 'new thought' }, 'character patches must preserve untouched source fields');
assert.deepEqual(mergedScenePulse.relationships[0], { relationshipId: 'elena-rel', name: 'Elena', trust: 61, stress: 30, milestone: 'covered a shift' }, 'relationship patches must preserve untouched meter and milestone fields');
assert.deepEqual(mergedScenePulse.mainQuests[0], { questId: 'save-cafe', name: 'Save the cafe', urgency: 'high', detail: 'new detail' }, 'quest patches must preserve untouched source quest fields');
assert.deepEqual(mergedScenePulse.plotBranches, [{ branchId: 'b', category: 'dramatic', name: 'New direction' }], 'explicit replacement must refresh an ephemeral collection without retaining stale ideas');
assert.deepEqual(mergedScenePulse.charactersPresent, ['elena'], 'current presence must be replaced as a per-turn coverage assertion');
const removedRelationship = vm.runInNewContext(`${scenePulseMergeSource}\nsidecarMergeScenePulse(${JSON.stringify({ relationships: [{ relationshipId: 'elena-rel', name: 'Elena' }] })}, ${JSON.stringify({ relationships: [{ relationshipId: 'elena-rel', operation: 'remove' }] })})`, scenePulseMergeContext);
assert.deepEqual(JSON.parse(JSON.stringify(removedRelationship.relationships)), [], 'record removal must not require sending a full relationship collection');
const keyedCharacterRecords = vm.runInNewContext(`${scenePulseMergeSource}\nsidecarMergeScenePulse({}, ${JSON.stringify({
    characters: {
        cand_barista: { name: 'Arcade Barista', role: 'Barista', innerThought: 'Keep the line moving.' },
        player: { name: 'Alex', role: 'Applicant / Patron' }
    }
})})`, scenePulseMergeContext);
assert.deepEqual(JSON.parse(JSON.stringify(keyedCharacterRecords.characters)), [
    { characterId: 'cand_barista', name: 'Arcade Barista', role: 'Barista', innerThought: 'Keep the line moving.' },
    { characterId: 'player', name: 'Alex', role: 'Applicant / Patron' }
], 'compact keyed character patches must retain their stable map ids and renderable source records');
const revealedCharacter = vm.runInNewContext(`${scenePulseMergeSource}\nsidecarMergeScenePulse(${JSON.stringify({
    characters: [{ name: 'Officer Buzzcut', role: 'Patrol officer', hair: 'buzzcut', innerThought: 'Keep the scene contained.' }],
    relationships: [{ name: 'Officer Buzzcut', relType: 'Official', trust: 18, stress: 45 }]
})}, ${JSON.stringify({
    characters: [{ name: 'Jack Browning', aliases: ['Officer Buzzcut'], innerThought: 'They know my name now; stay professional.' }],
    relationships: [{ name: 'Jack Browning', aliases: ['Officer Buzzcut'], trust: 24 }]
})})`, scenePulseMergeContext);
assert.equal(revealedCharacter.characters.length, 1, 'an exact declared alias reveal must update the existing character rather than append a duplicate');
assert.deepEqual(JSON.parse(JSON.stringify(revealedCharacter.characters[0])), {
    name: 'Jack Browning', role: 'Patrol officer', hair: 'buzzcut', aliases: ['Officer Buzzcut'], innerThought: 'They know my name now; stay professional.'
}, 'a compact name-reveal patch must retain old visual detail and the declared alias');
assert.equal(revealedCharacter.relationships.length, 1, 'an exact declared alias reveal must update the existing relationship rather than append a duplicate');
assert.deepEqual(JSON.parse(JSON.stringify(revealedCharacter.relationships[0])), {
    name: 'Jack Browning', relType: 'Official', aliases: ['Officer Buzzcut'], trust: 24, stress: 45
}, 'relationship display names must promote through the same declared alias without losing prior meters');
assert.match(app, /On a name reveal, retain the same stable ID/, 'the Reader must emit a single stable-ID ScenePulse patch when a name is revealed');
assert.match(scenePulseModule, /fixture-profile-duplicate|fixture-profile-export|fixture-profile-select/, 'fixture source-profile actions must duplicate, select, and export locally rather than dispatching empty controls');
assert.match(scenePulseModule, /no Horde profile changed/, 'fixture profile duplication must explicitly remain isolated from Horde storage');
assert.match(scenePulseModule, /SOURCE_DASHBOARD_ASSET/, 'the dashboard should use the pinned source renderer asset rather than a generic card replacement');
assert.match(scenePulseModule, /sp-dash-card-date.*sp-dash-card-time.*sp-dash-card-temp.*sp-dash-card-weather/s, 'the full four-card source dashboard must stay mounted');
assert.match(scenePulseModule, /edit-dashboard-field/, 'source dashboard values must have a real fixture-local edit path');
assert.match(scenePulseModule, /data-action="edit-dashboard-field" data-field="\$\{field\}" role="button" tabindex="0"/, 'source dashboard edit targets must remain keyboard-addressable in the Horde host');
assert.match(scenePulseModule, /Updated dashboard .*no Horde scene record changed/, 'dashboard edits must explicitly remain isolated from Horde state');
assert.match(scenePulseModule, /state\.dashboardCalendar = sourceTemplate\(source, 'calSvg'\)/, 'the pinned source calendar SVG must hydrate into the dashboard');
for (const sourceDashboardElement of ['sp-dash-clock', 'sp-temp-bar-svg', 'sp-wx-svg']) {
    assert.match(scenePulseModule, new RegExp(sourceDashboardElement), `the source dashboard visual element ${sourceDashboardElement} must stay present`);
}
assert.match(scenePulseModule, /EFFECTS_ROOT_ID = 'sp-worlds-effects-root'/, 'source effects need their own behind-the-panel body paint root');
assert.match(scenePulseModule, /effects\?\.dataset\.owner === 'scenepulse-worlds'\) effects\.replaceChildren\(\)/, 'leaving the ScenePulse route must tear down fixture effects instead of leaving a stale world overlay');
assert.match(scenePulseModule, /global\.removeEventListener\('resize', state\.viewportListener\)/, 'unmount must remove source mobile-mode resize wiring');
assert.match(scenePulseModule, /function ambientEffects\(state, mode = sourceViewportMode\(\)\)/, 'the imported surface must compose source weather, tint, and transitions from the fixture state');
assert.match(scenePulseModule, /mode === 'desktop' && state\.features\.timeTint/, 'source time tint must stay desktop ambience rather than covering a mobile panel');
assert.match(scenePulseModule, /mode === 'desktop' && state\.features\.weather/, 'source weather particles must stay desktop ambience rather than covering a mobile panel');
assert.match(scenePulseModule, /id="sp-weather-overlay".*sourceWeatherParticles/s, 'weather must retain the source full-viewport overlay and particles');
assert.match(scenePulseModule, /id="sp-time-tint".*sp-time-\$\{timePeriod\(state\.data\.time\)\}/s, 'time tint must retain source time-period classes');
assert.match(scenePulseModule, /id="sp-scene-transition".*sp-st-show/s, 'fixture-local time or location edits must be able to demonstrate the source transition card');
assert.match(scenePulseModule, /triggerFixtureTransition\(state, previous\)/, 'a tutorial time/location edit must trigger only the isolated source transition');
assert.match(scenePulseModule, /function transitionPeriod\(value\)/, 'scene transitions must retain the source coarser cadence rather than treating every tint shift as a scene change');
assert.match(app, /const SCENEPULSE_TOUR_CUSTOM_PANELS = Object\.freeze/, 'the source guided-tour custom-panel schema must be explicit without inventing tour values');
assert.match(app, /function scenePulseReaderCustomPanelSchema\(/, 'custom-panel configuration must reach the Reader boundary');
assert.match(app, /\[SCENEPULSE CUSTOM PANEL SCHEMA\]/, 'the Reader prompt must name custom fields and their delta contract');
assert.match(app, /Do not initialise a health, mana, reputation/, 'a visible custom schema must not become permission to fabricate tracker values');
assert.match(app, /scenePulseCustomPanelSchemaFingerprint/, 'a semantic custom-panel schema change must force one compatible full Reader projection');
assert.match(app, /hasPriorReaderProjection[\s\S]*priorCustomPanelSchemaFingerprint !== customPanelSchemaFingerprint/, 'a pre-schema accepted Reader projection must be treated as incompatible once rather than silently delta-merged');
assert.match(app, /options: Array\.isArray\(field\?\.options\)/, 'custom-panel enum options must survive bounded preference persistence');
assert.match(app, /invert: field\?\.invert === true/, 'custom-panel meter inversion must survive bounded preference persistence');
assert.match(scenePulseModule, /function customPanelData\(state, panel, index\)/, 'configured custom fields must render in the actual ScenePulse panel, not only in Panel Manager');
assert.match(scenePulseModule, /sp-cp-meter.*sp-cp-enum-chip.*sp-cp-list-chips/s, 'custom-panel meter, enum, and list source renderers must remain distinct');
assert.match(scenePulseModule, /data-custom-drag-panel.*data-custom-drop-panel/s, 'custom field ordering must retain source-style native drag/drop');
assert.match(scenePulseModule, /This tutorial has no invented values/, 'unpopulated custom-tour fields must remain visibly blank until an accepted Reader delta exists');
assert.match(scenePulseModule, /function sanitizeCustomPanels\(/, 'custom-panel import must validate a bounded source schema before it reaches UI preferences');
assert.match(scenePulseModule, /custom-export.*custom-import-trigger/s, 'custom-panel schema export and non-destructive import controls must be present');
assert.match(scenePulseModule, /schemas only; no tutorial or accepted Reader values/i, 'custom-panel export must reject fixture and Reader values as configuration content');
assert.match(scenePulseModule, /existing panels and all Reader values were left unchanged/, 'custom-panel import must append schemas rather than replace accepted data');
const customPanelPatch = vm.runInNewContext(`${scenePulseMergeSource}\nsidecarMergeScenePulse(${JSON.stringify({ health: 72, mana: 41, reputation: 'known' })}, ${JSON.stringify({ health: 68 })})`, scenePulseMergeContext);
assert.deepEqual(JSON.parse(JSON.stringify(customPanelPatch)), { health: 68, mana: 41, reputation: 'known' }, 'a compact custom-field delta must preserve untouched configured tracker fields');
const clearedCustomField = vm.runInNewContext(`${scenePulseMergeSource}\nsidecarMergeScenePulse(${JSON.stringify({ health: 68, mana: 41 })}, ${JSON.stringify({ clearFields: ['health'] })})`, scenePulseMergeContext);
assert.deepEqual(JSON.parse(JSON.stringify(clearedCustomField)), { mana: 41 }, 'an explicit custom-field clear must be the only way to remove its accepted value');
for (const sourceWeatherParticle of ['sp-wx-drop', 'sp-wx-flake', 'sp-wx-fog-layer', 'sp-wx-dust-cloud', 'sp-wx-wind-dust', 'sp-wx-aurora-ribbon', 'sp-wx-star', 'sp-wx-ash-flake']) {
    assert.match(scenePulseModule, new RegExp(sourceWeatherParticle), `the source ${sourceWeatherParticle} weather vocabulary must be preserved`);
}
assert.match(scenePulseModule, /sp-diff-overlay sp-diff-visible.*sp-diff-container/s, 'the source diff view must be visible and viewport-level');
assert.match(scenePulseCss, /#world-sidecar-workspace #sp-panel/, 'the bridge must adapt source panel geometry into the existing runtime');
assert.match(scenePulseCss, /#world-sidecar-workspace \{ position: relative; isolation: isolate; min-height: 0; overflow: visible/, 'the source feature dropdown must not be clipped by the Horde sidecar shell');
assert.match(scenePulseCss, /#world-sidecar-workspace #sp-panel \{[^}]*overflow: visible/s, 'the mounted source panel must allow its source menus to escape while its body scrolls');
assert.match(scenePulseCss, /#sp-worlds-overlay-root \{ position: fixed/, 'focused ScenePulse views must have a viewport-level host');
assert.match(scenePulseCss, /#sp-worlds-overlay-root > \* \{ pointer-events: auto/, 'the viewport-level source views must remain interactive');
assert.match(scenePulseCss, /#sp-worlds-effects-root \{ display: contents/, 'ambient source effects must retain body-level paint order behind the scene panel');
assert.match(scenePulseCss, /#sp-worlds-effects-root > #sp-weather-overlay,[\s\S]*#sp-worlds-effects-root > #sp-time-tint,[\s\S]*#sp-worlds-effects-root > #sp-scene-transition \{ pointer-events: none/, 'ambient effects and scene transitions must never block the host controls');
assert.match(scenePulseCss, /@media \(max-width: 1024px\)[\s\S]*#world-sidecar-workspace #sp-panel\.sp-mode-mobile,[\s\S]*#world-sidecar-workspace #sp-panel\.sp-mode-tablet/, 'narrow views must give source mobile/tablet modes a full-screen ScenePulse workspace');
assert.match(scenePulseCss, /sp-web-svg-wrap/, 'the source-style SVG relationship web must be styled in the Horde mount');
assert.match(scenePulseCss, /sp-browse-container/, 'the source-style timeline browser must be styled in the Horde mount');
assert.match(html, /scenepulse\/vendor\/ScenePulse\/style\.css/, 'the original ordered ScenePulse stylesheet must load whole');
assert.match(html, /scenepulse\/horde\/scene-pulse-worlds\.js/, 'the source-derived Horde bridge must be served');
assert.doesNotMatch(message, /msg-rewind-confirm|msg-rewind-yes|msg-rewind-no/,
    'rewind confirmation must stay in the original button, not add a second control');
assert.doesNotMatch(message, /msg-del-btn/,
    'world turns are recovered by rewind, never deleted');
assert.match(message, /rewindDraftBtn\.textContent = 'Confirm\?'/,
    'first rewind click must confirm in place');

console.log('✓ Scene Intelligence delta, authored-turn selection, and rewind-only recovery contracts verified');
