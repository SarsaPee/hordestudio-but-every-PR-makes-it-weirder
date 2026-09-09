const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

let passed = 0;
function test(name, fn) {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
}

test('#5 local world generation has a configurable idle timeout', () => {
    assert.match(html, /id="global-local-generation-timeout"/);
    assert.match(app, /function localGenerationIdleTimeoutMs\(\)/);
    assert.match(app, /isLocalProvider\(\) \? localGenerationIdleTimeoutMs\(\) : 45000/);
    assert.match(app, /armGenerationIdleTimeout\(\)/);
    assert.match(app, /Increase or disable the local timeout/);
});

test('#6 embeddings can use a separate OpenAI-compatible server and key', () => {
    assert.match(html, /id="global-embedding-url"/);
    assert.match(html, /id="global-embedding-key"/);
    assert.match(html, /id="test-embedding-conn-btn"/);
    assert.match(app, /fetch\(embeddingApiBase\(\) \+ '\/embeddings'/);
    assert.match(app, /\.\.\.embeddingAuthHeaders\(\)/);
    assert.match(app, /getSettingsEmbeddingCatalog/);
});

test('#11 SillyTavern V2 metadata survives import and greetings are selectable', () => {
    const mapper = app.slice(app.indexOf('function mapTavernDataToNexus'), app.indexOf('// --- SillyTavern PNG Card Parser'));
    assert.match(mapper, /creator_notes/);
    assert.match(mapper, /alternate_greetings/);
    assert.match(mapper, /charData\.tags/);
    assert.match(mapper, /sourceExtensions\.chub/);
    assert.match(mapper, /sourceExtensions\.depth_prompt/);
    assert.match(app, /function characterGreetingMessage/);
    assert.match(app, /versions: versions\.length > 1/);
    assert.match(app, /targetChar\?\.tavernExtensions\?\.depth_prompt/);
});

test('#12 Virtual Humans support a dedicated local neural TTS server', () => {
    assert.match(html, /option value="local">🖥 Local Neural TTS/);
    assert.match(html, /id="global-local-tts-url"/);
    assert.match(html, /id="test-local-tts-btn"/);
    assert.match(app, /async function getLocalTTSModels/);
    assert.match(app, /useLocalTTS \? localTTSApiBase\(\) : apiBase\(\)/);
    assert.match(app, /\['openrouter', 'local'\]\.includes\(companion\.ttsMode\)/);
});

console.log(`\n${passed} GitHub open-issue regression checks passed.`);
