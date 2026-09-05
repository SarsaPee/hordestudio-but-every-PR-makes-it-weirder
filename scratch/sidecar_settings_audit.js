const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const helpSystem = fs.readFileSync(path.join(root, 'help-system.js'), 'utf8');

assert.match(html, /<details id="w-sidecar-settings"[\s\S]*?<summary[\s\S]*?Sidecar settings/,
    'Sidecar settings must be a collapsed disclosure');
assert.match(html, /id="w-sidecar-inherit-narrator"[\s\S]*?Use Narrator model and routing/,
    'Sidecar must offer narrator model/routing inheritance');
assert.match(html, /id="w-sidecar-override-config"/,
    'Sidecar provider/model overrides must have a separately hideable container');
assert.match(html, /id="w-sidecar-model" type="search" class="form-input"[\s\S]*?aria-controls="w-sidecar-model-results"/,
    'Sidecar model selection must support searchable provider suggestions');
assert.match(html, /id="w-sidecar-model-results" class="searchable-dropdown-results hidden"/,
    'Sidecar model suggestions must have their own results list');
assert.match(html, /id="w-sidecar-fetch-model-btn"[^>]*>Fetch models/,
    'Sidecar provider models must be explicitly fetchable');
assert.match(html, /id="w-sidecar-debug"[^>]*> Retain unabridged prompt\/reply traces/,
    'trace capture must sit on its own line');
assert.strictEqual((html.match(/id="w-sidecar-provider"/g) || []).length, 1, 'provider control must not be duplicated');
assert.strictEqual((html.match(/id="w-sidecar-model"/g) || []).length, 1, 'model control must not be duplicated');
assert.match(app, /async function fetchSidecarModelSettings\(\)[\s\S]*?providerApiBase\(provider\).*?\/models[\s\S]*?providerAuthHeaders\(provider\)/,
    'metadata fetch must use the selected provider endpoint and credentials');
assert.match(app, /sidecarProviderModelCatalogs\.set\(provider, models\)[\s\S]*?renderSidecarModelOptions\(provider, selected\)/,
    'fetched provider models must populate the Sidecar search catalog');
assert.match(app, /function setupSidecarModelSearch\(\)[\s\S]*?input\.addEventListener\('focus', renderSidecarModelSearchResults\)[\s\S]*?input\.addEventListener\('input', renderSidecarModelSearchResults\)/,
    'Sidecar model input must search fetched models as the user types');
assert.match(app, /No provider model matches\. You can still enter an exact model ID\./,
    'Sidecar must accept exact custom model IDs not yet in a provider catalog');
assert.match(app, /applySidecarSelectedModelMetadata\(\)[\s\S]*?supportedParams/,
    'selecting a provider model must retain its capabilities');
assert.match(css, /\.sidecar-provider-model-row \{ display:grid; grid-template-columns:25% minmax\(0, 1fr\);/,
    'the provider must use one quarter of the provider/model row');
assert.match(app, /function updateSidecarOverrideVisibility\(\)[\s\S]*?w-sidecar-override-config.*?hidden.*?inheriting/,
    'narrator inheritance must hide Sidecar-specific provider/model controls');
assert.match(app, /function openRouterRoutingVisible\(scope\)[\s\S]*?scope === 'sidecar'[\s\S]*?w-sidecar-inherit-narrator[\s\S]*?return false;/,
    'narrator inheritance must also suppress the redundant Sidecar routing panel');
assert.ok(!/w-sidecar-(?:reader-max-tokens|max-tokens)[^>]*value="0"/.test(html),
    'adaptive Sidecar token fields must not display a misleading zero override');
assert.match(html, /w-sidecar-reader-max-tokens[^>]*placeholder="Adaptive default · 3,000"/,
    'reader token default must be a descriptive placeholder');
assert.match(html, /w-sidecar-max-tokens[^>]*placeholder="Adaptive default · 6,000"/,
    'receipt token default must be a descriptive placeholder');
assert.match(app, /readerInput\.value = readerTokens \|\| ''/,
    'saved zero reader overrides must render as a blank adaptive field');
assert.match(css, /\.form-label\[data-help\]::after,[\s\S]*?summary\[data-help\]::after/,
    'standard help bubbles must appear on Sidecar setting headers and disclosure summaries');
assert.match(css, /\.form-label > \.help-glyph \{ display: none; \}/,
    'legacy inline help text must not create a duplicate visible glyph');
assert.ok(!/w-sidecar-settings'\) && !element\.classList\.contains\('help-glyph'\)/.test(helpSystem),
    'Sidecar headings must retain standard header-hover tooltips');
assert.match(helpSystem, /element\.closest\?\.\('#world-sidecar-openrouter-routing'\)\) return '';/,
    'the Sidecar provider-routing editor must not receive automatic tooltips');
assert.ok(!/or-routing-model" title=/.test(app),
    'the Sidecar provider-routing model badge must not retain a native hover');

console.log('✓ Sidecar settings are consolidated and provider-aware');
