const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('style.css', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
let passed = 0;
function test(name, check) {
    check();
    passed += 1;
    console.log(`✓ ${name}`);
}

test('official Discord is available from the persistent sidebar', () => {
    assert(html.includes('https://discord.gg/9eyjcMbsST'));
    assert(html.includes('rel="noopener noreferrer"'));
});

test('Chat Library character cards expose explicit Play and Edit actions', () => {
    assert(app.includes('class="btn btn-primary char-card-play"'));
    assert(app.includes('class="btn btn-ghost char-card-edit"'));
    assert(app.includes("editCharacter(char.id);"));
});

test('all three studios expose a save-and-enter path', () => {
    assert(html.includes('id="save-chat-studio-btn"'));
    assert(html.includes('id="open-companion-chat-btn"'));
    assert(html.includes('id="save-play-world-btn"'));
    assert(html.includes('id="close-chat-studio-btn"'));
    assert(html.includes('id="close-companion-studio-btn"'));
    assert(html.includes('id="close-world-studio-btn"'));
});

test('Character Identity uses a bounded responsive grid and styled media field', () => {
    assert(html.includes('class="chat-identity-grid"'));
    assert(html.includes('class="media-file-field"'));
    assert(css.includes('grid-template-columns: 220px minmax(0, 1fr)'));
    assert(css.includes('.chat-identity-grid { grid-template-columns: minmax(0, 1fr)'));
});

test('world play identifies the world rather than a generic Dungeon Master', () => {
    assert(html.includes('id="world-dm-name">Untitled World'));
    assert(app.includes("document.getElementById('world-dm-name').textContent = world.name"));
    assert(app.includes("worldAvatar.style.backgroundImage = world.banner"));
});

test('cinematic cards use translucent glass instead of an opaque black slab', () => {
    assert(css.includes('calc(var(--world-panel-opacity,.88) * .70)'));
    assert(css.includes('backdrop-filter:blur(8px)'));
});

test('Virtual Human chat exposes per-timeline silence consequences', () => {
    assert(html.includes('id="cc-silence-consequences"'));
    assert(app.includes('returnGapMs: returnSilence.unanswered.shouldAcknowledgeSilence'));
    assert(app.includes('applyCompanionSilenceProgress(companion, timeline, nowMs)'));
    assert(css.includes('.companion-gap-separator'));
});

test('release accessibility keeps icon controls named and keyboard focus visible', () => {
    assert(app.includes("control.setAttribute('aria-labelledby', label.id)"));
    assert(app.includes('aria-label="${isFav ? \'Remove from favorites\' : \'Add to favorites\'}"'));
    assert(html.includes('aria-label="Send message"'));
    assert(html.includes('aria-label="Close settings"'));
    assert(css.includes('[role="button"], [tabindex]):focus-visible'));
    assert(css.includes('@media (prefers-reduced-motion: reduce)'));
});

test('library artwork has a deliberate text fallback and release assets are cache-busted', () => {
    assert(app.includes('function displayInitials('));
    assert(app.includes('const avatarInitials = displayInitials(char.name)'));
    assert(app.includes("char-card-avatar${char.avatar ? ' has-image' : ''}"));
    assert(app.includes("message-avatar${avatarUrl ? ' has-image' : ''}"));
    assert(css.includes('.char-card-avatar.has-image'));
    assert(html.includes('20260810-pip-providers-v2'));
});

test('World Studio navigation fits laptop heights with a safe short-window fallback', () => {
    assert(css.includes('#world-studio-view .studio-nav {'));
    assert(css.includes('padding: clamp(8px, 1.25vh, 12px) 10px'));
    assert(css.includes('#world-studio-view .world-studio-tab {'));
    assert(css.includes('overflow-y: auto'));
});

test('large worlds use searchable card directories and full-record modals', () => {
    assert(html.includes('id="world-record-overlay"'));
    assert(html.includes('data-tab="w-entities">People</button>'));
    assert(html.includes('data-tab="w-items">Items</button>'));
    assert(html.includes('id="w-items-list"'));
    assert(app.includes('function renderWorldLocationDirectory('));
    assert(app.includes('function renderWorldEntityDirectory('));
    assert(app.includes("renderWorldEntities('items')"));
    assert(app.includes("filter(entity => entity?.type === 'item')"));
    assert(app.includes("groupBy: 'household'"));
    assert(app.includes('Persona &amp; voice'));
    assert(app.includes('ent-simulation-depth'));
    assert(css.includes('.modal.world-record-modal'));
    assert(css.includes('.world-directory-toolbar'));
});

test('world inspectors use explicit tab ownership instead of DOM position guesses', () => {
    assert(app.includes('data-inspector-section="connections"'));
    assert(app.includes('data-inspector-section="commerce"'));
    assert(app.includes("['placement', 'Placement']"));
    assert(!app.includes("sectionText.includes('EXITS')"));
});

test('world references use stable canonical ids behind editable names', () => {
    assert(app.includes('function normalizeWorldDirectoryData('));
    assert(app.includes('record.targetLocationId = target.id'));
    assert(app.includes('value="${escapeHTML(location.id)}"'));
    assert(app.includes('function removeWorldLocationRecord('));
});

test('large worlds expose first-class regions and canonical transit links', () => {
    assert(app.includes('function renderWorldRegionInspector('));
    assert(app.includes('function upsertWorldTravelConnection('));
    assert(app.includes("transit: 'Transit hub'"));
    assert(app.includes('const WORLD_TRAVEL_MODES'));
    assert(app.includes('function describeWorldTravelLeg('));
    assert(app.includes('Narrate the journey or arrival in a way that respects the transport mode'));
});

test('location authoring presents rooms as a real containment hierarchy', () => {
    assert(app.includes('function worldLocationLineage('));
    assert(app.includes('function worldLocationDirectChildren('));
    assert(app.includes('function renderWorldRegionLocationTreeHTML('));
    assert(app.includes("['map', 'Rooms & map']"));
    assert(app.includes('class="world-contained-place-grid"'));
    assert(app.includes('data-open-child='));
    assert(app.includes('Do not enable it for every building or room'));
    assert(app.includes("option value=\"auto\""));
    assert(css.includes('.world-location-tree-children'));
    assert(css.includes('.world-contained-place-card'));
});

test('message composers use one rounded focus treatment instead of nested outlines', () => {
    assert(css.includes('.input-row:focus-within { border-color: var(--red); }'));
    assert(css.includes('.input-row > .msg-input:focus-visible'));
    assert(css.includes('outline: none !important'));
});

console.log(`\n${passed} cross-mode UX checks passed.`);
