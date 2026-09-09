const fs = require('fs');
const assert = require('assert');
const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const bridge = fs.readFileSync('horde_mcp_bridge.py', 'utf8');

[
  'global-companion-always-on', 'global-always-on-daily-limit',
  'global-always-on-minimum-minutes', 'always-on-stop-btn',
  'cs-always-on-enabled', 'pause-all-agency-btn'
].forEach(id => assert(html.includes(`id="${id}"`), `missing ${id}`));
[
  'companionAlwaysOnManifest', 'importCompanionAlwaysOnEvents',
  'syncCompanionAlwaysOnRuntime', "'/always-on/ack'",
  'browserLeaseActive', 'queuePersistent', 'credentialsPersistent', "'/always-on/pause'"
].forEach(token => assert(app.includes(token) || bridge.includes(token), `missing ${token}`));
assert(bridge.includes('time.time() - self.last_heartbeat < self.handoff_seconds'));
assert(bridge.includes('self.usage_count >= self.daily_limit'));
assert(bridge.includes('Always-on control is loopback-only'));
assert(html.includes('<b>Default is off.</b>'));
console.log('Always-on Virtual Human audit passed');
