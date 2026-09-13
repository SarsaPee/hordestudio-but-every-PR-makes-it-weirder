'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');
const bridge = fs.readFileSync('horde_mcp_bridge.py', 'utf8');
const backup = fs.readFileSync('vh2_backup.py', 'utf8');
const hostSerialize = app.slice(app.indexOf('async function serializeHostBackupPayload'), app.indexOf('function hostBackupReadbackPayload'));
const coordinatorRegistration = app.slice(app.indexOf('async function init()'), app.indexOf('window.HordeBackupDomains?.seal?.()'));

assert.match(app, /const VH2_BACKUP_DOMAIN_ID = 'vh2-service';/);
assert.match(app, /function registerVH2ServiceBackupDomain\(\)/);
assert.match(app, /capturePreimage: serializeVH2ServiceBackupPayload/);
assert.match(app, /commit: async payload => \{\s*await replaceVH2ServiceBackupPayload\(payload\);/);
assert.match(app, /rollback: async payload => \{\s*await replaceVH2ServiceBackupPayload\(payload\);/);
assert.match(app, /VH2 service readback did not contain exactly the restored lives/);
assert.match(app, /VH2_BACKUP_JOURNAL_KEY/);
assert.match(app, /registerHostBackupDomain\(\);\s*registerVH2ServiceBackupDomain\(\);/);
assert.match(coordinatorRegistration, /registerVH2ServiceBackupDomain\(\)/);
assert.doesNotMatch(hostSerialize, /vh2ServiceArchives/);
assert.match(bridge, /parsed\.path == "\/vh2\/workspace\/backup"/);
assert.match(bridge, /parsed_path == "\/vh2\/workspace\/replace"/);
assert.match(bridge, /vh2_backup\.replace_workspace/);
assert.match(backup, /def export_workspace\(service\):/);
assert.match(backup, /def replace_workspace\(service,archives\):/);
assert.match(backup, /def workspace_archive_map\(archives\):/);
console.log('PASS VH2 is an atomic, journaled Horde backup domain rather than a host-side side effect');
