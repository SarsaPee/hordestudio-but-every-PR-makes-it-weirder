const fs = require('fs');
const assert = require('assert');

const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const guide = fs.readFileSync('labs-guide.js', 'utf8');
const help = fs.readFileSync('help-system.js', 'utf8');

assert.match(html, /option value="nvidia"[^>]*>[^<]*NVIDIA NIM/);
assert.match(html, /option value="bedrock"[^>]*>[^<]*AWS Bedrock/);
assert.match(html, /id="cs-text-provider"[\s\S]*option value="nvidia"[\s\S]*option value="bedrock"/);
const imageSourceSelect = html.match(/<select id="cs-image-source"[\s\S]*?<\/select>/)?.[0] || '';
assert.doesNotMatch(imageSourceSelect, /option value="nvidia"/);
assert.doesNotMatch(imageSourceSelect, /option value="bedrock"/);
assert.match(html, /connect-src[^>]*integrate\.api\.nvidia\.com[^>]*\*\.api\.aws/);

assert.match(app, /integrate\.api\.nvidia\.com\/v1/);
assert.match(app, /bedrock-mantle\.\$\{normalizedBedrockRegion[\s\S]*?\.api\.aws\/v1/);
assert.match(app, /TEXT_PROVIDER_IDS[\s\S]*?'nvidia'[\s\S]*?'bedrock'/);
assert.match(app, /horde_nvidia_api_key/);
assert.match(app, /horde_bedrock_api_key/);
assert.match(app, /nvidiaApiKey: state\.globalSettings\.rememberApiKey/);
assert.match(app, /bedrockApiKey: state\.globalSettings\.rememberApiKey/);
assert.match(app, /return \['openrouter', 'gptproto', 'nanogpt', 'local'\]\.includes\(provider\) \? provider : 'openrouter'/);

assert.match(guide, /NVIDIA NIM is available as a first-class text provider/);
assert.match(guide, /Amazon Bedrock is available through its OpenAI-compatible Mantle endpoint/);
assert.match(help, /global-nvidia-key/);
assert.match(help, /global-bedrock-region/);

console.log('PASS NVIDIA NIM and AWS Bedrock text-provider audit');
