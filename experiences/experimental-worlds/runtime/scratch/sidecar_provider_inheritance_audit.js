const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.match(html, /id="w-sidecar-provider-connection-hint"/,
    'Sidecar must state that its provider connection is inherited from global Settings');
assert.match(app, /function updateSidecarProviderConnectionHint\(providerId\)[\s\S]*?uses its global Settings connection: endpoint, credentials, and provider-specific headers/,
    'the Sidecar UI must explicitly describe the inherited connection contract');
assert.match(app, /function providerApiBase\(providerId\)[\s\S]*?localBaseUrl[\s\S]*?bedrockApiBase\(\)[\s\S]*?customApiBase\(\)/,
    'global provider endpoint configuration must include local, Bedrock, and custom providers');
assert.match(app, /function providerAuthHeaders\(providerId\)[\s\S]*?localApiKey[\s\S]*?customApiKey[\s\S]*?parseCustomHeaders\(\)[\s\S]*?gptprotoApiKey[\s\S]*?nanogptApiKey[\s\S]*?nvidiaApiKey[\s\S]*?bedrockApiKey/,
    'global provider credentials and custom headers must be centralized in providerAuthHeaders');
assert.match(app, /async function fetchSidecarModelSettings\(\)[\s\S]*?providerApiBase\(provider\)[\s\S]*?providerAuthHeaders\(provider\)[\s\S]*?providerAttributionHeaders\(provider\)/,
    'Sidecar model discovery must use global endpoint, credentials, and applicable headers');
assert.match(app, /async function fetchSidecarCompletion\(body,[\s\S]*?providerApiBase\(provider\)[\s\S]*?providerAuthHeaders\(provider\)[\s\S]*?providerAttributionHeaders\(provider\)/,
    'Sidecar requests must use global endpoint, credentials, and applicable headers');
assert.ok(!/id="w-sidecar-(?:api-key|base-url|headers|bedrock-region|local-api-key)"/.test(html),
    'Sidecar must not duplicate global provider connection controls');

console.log('✓ Sidecar providers inherit their global connection settings');
