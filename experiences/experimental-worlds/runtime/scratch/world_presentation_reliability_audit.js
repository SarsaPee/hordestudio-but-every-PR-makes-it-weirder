const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { buildContext } = require('./app_source.js');

const app = fs.readFileSync('app.js', 'utf8');
const css = fs.readFileSync('style.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
let passed = 0;
function test(name, fn) {
    fn();
    passed++;
    console.log(`✓ ${name}`);
}

test('presentation normalization preserves live editor references', () => {
    const context = {
        isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value),
        cssColor: (value, fallback) => value || fallback,
        livingClamp: (value, min, max) => Math.max(min, Math.min(max, Number(value))),
        WORLD_MEDIA_ASSET_LIMIT: 10000
    };
    buildContext(vm, ['normalizeWorldPresentation'], context);
    const world = { presentation: { enabled: false }, mediaAssets: [] };
    const live = context.normalizeWorldPresentation(world);
    context.normalizeWorldPresentation(world);
    live.enabled = true;
    assert.equal(world.presentation.enabled, true);
    assert.strictEqual(context.normalizeWorldPresentation(world), live);
});

test('image response decoder accepts dedicated and nested provider shapes', () => {
    const context = {
        isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value)
    };
    buildContext(vm, ['gptProtoImageFromResponse'], context);
    const dedicated = context.gptProtoImageFromResponse({ data: [{ b64_json: 'iVBORw0KGgoAAAABBBB' }] });
    assert.match(dedicated, /^data:image\/png;base64,/);
    const nested = context.gptProtoImageFromResponse({
        choices: [{ message: { images: [{ image_url: { url: 'https://example.com/generated.png' } }] } }]
    });
    assert.equal(nested, 'https://example.com/generated.png');
});

test('pronoun-tagged lines keep discourse focus instead of stealing a name from dialogue', () => {
    const context = {
        parseHordeMarkdown: value => String(value),
        worldMediaSource: () => '',
        cssColor: value => value || '#e63946',
        escapeHTML: value => String(value),
        cssUrl: value => value
    };
    buildContext(vm, ['renderWorldNarrativeHtml'], context);
    const world = {
        entities: [
            { id: 'gloria', type: 'npc', name: 'Gloria Bell', visuals: { dialogueColor: '#bb2255' } },
            { id: 'wade', type: 'npc', name: 'Wade Greeley', visuals: { dialogueColor: '#884422' } }
        ]
    };
    const prose = 'Gloria Bell checks the switchboard.\n\nShe glances over her shoulder. “Don’t mind me,” she says, warm and easy. “Just borrowing the closet for a minute. Wade and I have an understanding.”\n\nWade Greeley grunts.\n\n“Understanding is she brings me the office mail,” he says.';
    const rendered = context.renderWorldNarrativeHtml(world, prose);
    const gloriaCards = (rendered.match(/data-speaker-id="gloria"/g) || []).length;
    const wadeCards = (rendered.match(/data-speaker-id="wade"/g) || []).length;
    assert.equal(gloriaCards, 2);
    assert.equal(wadeCards, 1);
});

test('ambiguous dialogue stays prose instead of receiving a false portrait', () => {
    const context = {
        parseHordeMarkdown: value => String(value),
        worldMediaSource: () => '',
        cssColor: value => value || '#e63946',
        escapeHTML: value => String(value),
        cssUrl: value => value
    };
    buildContext(vm, ['renderWorldNarrativeHtml'], context);
    const world = { entities: [
        { id: 'a', type: 'npc', name: 'Alex North', visuals: {} },
        { id: 'b', type: 'npc', name: 'Blair West', visuals: {} }
    ] };
    const rendered = context.renderWorldNarrativeHtml(world, 'Alex North and Blair West stare at each other.\n\n“Fine.”');
    assert(!rendered.includes('data-speaker-id='));
    assert(rendered.includes('“Fine.”'));
});

test('world identity layout has explicit non-collapsing columns', () => {
    assert(html.includes('class="world-identity-grid"'));
    assert(css.includes('grid-template-columns: 180px minmax(0, 1fr)'));
    assert(css.includes('.world-identity-fields .form-input'));
});

test('all world visual generators restore their button in finally blocks', () => {
    assert.equal((app.match(/button\.textContent = 'Generating…';/g) || []).length, 3);
    assert((app.match(/finally \{\s*button\.disabled = false;\s*button\.textContent = '✨ Generate';/g) || []).length >= 3);
});

console.log(`\n${passed} world-presentation reliability checks passed.`);
