const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');
const video = fs.readFileSync('video-worlds.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('style.css', 'utf8');
const bridge = fs.readFileSync('horde_mcp_bridge.py', 'utf8');
const portable = fs.readFileSync('scripts/build-portable.sh', 'utf8');

let passed = 0;
function test(name, fn) {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
}

test('Video Adventures use independent state and views', () => {
    assert.match(app, /videoWorlds: \[\]/);
    assert.match(app, /videoWorldSessions: \{\}/);
    assert.match(app, /videoWorlds: document\.getElementById\('video-worlds-view'\)/);
    assert.doesNotMatch(video, /state\.worlds|state\.worldInstances|activeWorldId/);
});

test('the first draft persists definitions, sessions and active selection', () => {
    assert.match(app, /videoWorlds: state\.videoWorlds/);
    assert.match(app, /videoWorldSessions: state\.videoWorldSessions/);
    assert.match(app, /activeVideoWorldId: state\.activeVideoWorldId/);
    assert.match(video, /await saveState\(\)/);
});

test('Fal is server-routed and credentials stay out of backups', () => {
    assert.match(html, /id="global-fal-key"/);
    assert.match(video, /mcpBridgeRequest\('\/fal\/video\/jobs'/);
    assert.match(bridge, /parsed_path == "\/fal\/video\/jobs"/);
    assert.doesNotMatch(app.match(/const payload = \{([\s\S]*?)\n    \};/)[1], /falApiKey/);
});

test('Fal media is selectable across Worlds and Virtual Humans', () => {
    assert.match(html, /id="w-visual-image-provider"[\s\S]*?<option value="fal">Fal<\/option>/);
    assert.match(html, /id="cs-image-source"[\s\S]*?<option value="fal">Fal<\/option>/);
    assert.match(html, /id="cs-video-provider"[\s\S]*?<option value="fal">Fal<\/option>/);
    assert.match(app, /mcpBridgeRequest\('\/fal\/image\/generate'/);
    assert.match(app, /pollCompanionFalVideoJob/);
    assert.match(bridge, /parsed_path == "\/fal\/image\/generate"/);
});

test('Video Adventures expose an ordered H3, Wan and LTX renderer chain', () => {
    assert.match(html, /id="video-world-renderer-primary"/);
    assert.match(html, /id="video-world-renderer-fallback"/);
    assert.match(video, /models: rendererChain\(world\)/);
    assert.match(video, /alibaba\/wan-3\.0/);
    assert.match(video, /fal-ai\/ltx-2\.3\/fast/);
    assert.match(video, /const VIDEO_WORLD_VERSION = 3/);
    assert.match(video, /storedVersion >= 3/);
    assert.match(video, /rendererFallback2/);
    assert.match(bridge, /FAL_VIDEO_RENDERERS/);
});

test('Fal pricing and safety defaults match the current provider contract', () => {
    assert.match(app, /falRate480: 0\.05/);
    assert.match(app, /falRate768: 0\.08/);
    assert.match(app, /migrateExpiredFalLaunchRates/);
    assert.match(app, /falPricingVersion: 2/);
    assert.match(html, /id="global-fal-safety-checker"/);
    assert.match(video, /function rendererDuration/);
    assert.match(video, /\[6, 8, 10, 12, 14, 16, 18, 20\]/);
});

test('Fal configuration is testable and expanded cards use the full modal width', () => {
    assert.match(html, /id="test-fal-conn-btn"/);
    assert.match(app, /mcpBridgeRequest\('\/fal\/video\/test'/);
    assert.match(bridge, /parsed_path == "\/fal\/video\/test"/);
    assert.match(css, /\.settings-provider-grid > \.settings-provider-card\[open\]/);
});

test('play uses a real story Director with contextual choices and exact dialogue', () => {
    assert.match(html, /id="video-world-choices"/);
    assert.match(video, /renderActionChoices/);
    assert.match(video, /requestDirectorPlan/);
    assert.match(video, /storyState/);
    assert.match(video, /Never use generic labels such as Engage/);
    assert.match(video, /Perform only this exact scripted dialogue/);
    assert.match(video, /Adventure titles are private interface metadata/);
    assert.match(video, /Adventure titles and project names are interface metadata/);
    assert.doesNotMatch(video, /`VIDEO ADVENTURE: \$\{(?:rendererSafeText\()?world\.name/);
    assert.match(video, /<d>\[\$\{line\.language/);
    assert.doesNotMatch(video, /\['Engage', 'Approach the most relevant person/);
    assert.match(video, /queueMicrotask\(\(\) => generateShot\(\)\)/);
    assert.match(video, /session\.transitionFrame = pending\.transitionFrame/);
    assert.match(css, /\.video-world-generating\.compact/);
    assert.match(html, /id="video-world-cancel-generation"/);
    assert.match(video, /waitForVideoJob/);
    assert.match(video, /pendingVideoJob/);
    assert.match(video, /resumeVideoJob/);
    assert.match(video, /setInterval\(\(\) => setGenerationDetail/);
    assert.match(app, /externalSignal\?\.addEventListener\('abort'/);
    assert.match(html, /id="video-world-preloader"/);
    assert.match(video, /nextBeat: choice\?\.nextBeat/);
    assert.match(video, /selectedChoice\?\.nextBeat/);
    assert.match(video, /const result = await waitForVideoJob/);
    assert.match(video, /Background choice preparation failed/);
    assert.doesNotMatch(video, /Promise\.all\(\[renderPromise, futureChoicesPromise/);
    assert.match(video, /session\.queuedShotId = shot\.id/);
    assert.match(video, /onended = \(\) => \{ void activateQueuedShot/);
    assert.match(html, /id="video-world-stage-generate"/);
    assert.match(bridge, /durable_body\["latencyMode"\] = "queue"/);
    assert.match(bridge, /threading\.Thread\(target=run/);
    assert.match(bridge, /cancel_fal_video_job/);
    assert.match(video, /buildPolicyRestagedPrompt/);
    assert.match(video, /content_policy_violation/);
    assert.match(video, /Unknown MCP provider/);
    assert.match(html, /id="video-world-safety-checker"/);
    assert.match(video, /enableSafetyChecker: state\.globalSettings\?\.falSafetyChecker !== false[\s\S]*?world\.falSafetyChecker !== false/);
    assert.match(video, /parseOrRepairDirectorPlan/);
    assert.match(video, /malformed JSON\. Repairing the story plan/);
    assert.match(video, /returned malformed JSON twice/);
});

test('Director and timeline controls are user-configurable', () => {
    assert.match(html, /id="video-world-director-model"/);
    assert.match(html, /id="video-world-director-model-results"/);
    assert.match(app, /inputId: 'video-world-director-model'.*providerAware: true/);
    assert.match(html, /id="video-world-test-director"/);
    assert.match(video, /const DEFAULT_DIRECTOR_MODEL = 'google\/gemma-4-31b-it'/);
    assert.match(video, /max_tokens: 900/);
    assert.match(html, /id="video-world-rename-run"/);
    assert.match(html, /id="video-world-delete-run"/);
    assert.match(video, /function deleteTimeline/);
});

test('authoring is story-first with accessible looks, viewpoint and a persistent cast', () => {
    assert.match(video, /const VIDEO_WORLD_VERSION = 3/);
    assert.match(video, /VISUAL_PRESETS/);
    assert.match(video, /viewpoint: VIEWPOINTS/);
    assert.match(video, /characters: Array\.isArray/);
    assert.match(html, /id="video-world-style-presets"/);
    assert.match(html, /data-value="first_person"/);
    assert.match(html, /id="video-world-player-reference"/);
    assert.match(html, /id="video-world-characters"/);
    assert.match(video, /Strict first-person player point of view/);
    assert.match(video, /RECURRING CAST/);
});

test('continuity, budget and local media are explicit contracts', () => {
    assert.match(video, /session\.lastFrame/);
    assert.match(video, /captureLastFrame/);
    assert.match(video, /session\.spent \+ cost > world\.sessionBudget/);
    assert.match(bridge, /VIDEO_WORLD_MEDIA_DIR/);
    assert.match(bridge, /\/video-world-media\//);
});

test('portable builds ship the separate Video Adventures runtime', () => {
    assert.match(portable, /video-worlds\.js/);
    assert.match(html, /video-worlds\.js\?v=/);
    assert.match(bridge, /"\/video-worlds\.js": \("video-worlds\.js"/);
});

console.log(`\n${passed} Video Adventures checks passed.`);
