/**
 * Regression checks for last-view restore on refresh.
 *
 * Run with: node scratch/workspace_restore_audit.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

assert.match(app, /function restoreLastWorkspace\(/);
assert.match(app, /function captureWorkspaceState\(/);
assert.match(app, /await loadWorkspaceState\(\)/);
assert.match(app, /restoreLastWorkspace\(\);/);
assert.doesNotMatch(app, /renderLibrary\(\);\s+switchView\('library'\);/);
assert.match(app, /WORKSPACE_STATE_MIRROR_KEY = 'horde_workspace_state_v2'/);
assert.match(app, /writeWorkspaceStateMirror\(\);/);
assert.match(app, /workspaceStateV2/);
assert.match(app, /lastWorldStudioTab: workspaceString\(state\.lastWorldStudioTab\)/);
assert.match(app, /lastStudioTab: workspaceString\(state\.lastStudioTab\)/);
assert.match(app, /lastCompanionStudioTab: workspaceString\(state\.lastCompanionStudioTab\)/);
assert.match(app, /activeVideoWorldId: workspaceString\(state\.activeVideoWorldId\)/);
assert.match(app, /editingVideoWorldId: workspaceString\(state\.editingVideoWorldId\)/);
assert.match(app, /settingsOpen: state\.settingsOpen === true/);
assert.match(app, /settingsSection: SETTINGS_SECTION_LABELS/);
assert.match(app, /openWorldStudio\(worldId = null, options = \{\}\)/);
assert.match(app, /if \(!workspaceRestoring\) \{/);
assert.match(app, /window\.addEventListener\('pagehide'.+writeWorkspaceStateMirror/s);
assert.match(app, /applyWorkspaceState\(pendingWorkspaceState\);/);
assert.match(app, /if \(state\.settingsOpen\) showGlobalSettings\(\);/);
assert.doesNotMatch(app, /state\.settingsOpen \|\| \(!hasApiCredentials\(\)/);
assert.match(html, /app\.js\?v=20260903-v1700-workspace-restore-v3/);

console.log('✓ last-view restore is wired into load, save, and init');
