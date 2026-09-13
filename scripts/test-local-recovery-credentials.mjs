#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const coordinator = fs.readFileSync(new URL('../backup-domain-coordinator.js', import.meta.url), 'utf8');
const recovery = fs.readFileSync(new URL('../rolling-recovery.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

assert.match(coordinator, /definition\.serialize\(exportContext\)/,
    'backup domains must receive the export purpose and credential policy');
assert.match(recovery, /purpose:\s*'rolling-recovery'[\s\S]*?includeCredentials:\s*true/,
    'rolling recovery must explicitly opt into credentials');
assert.match(app, /if \(includeCredentials\) \{[\s\S]*?payload\.localRecoveryCredentials/,
    'host backup serialization must add credentials only when requested');
assert.match(app, /async function exportFullBackup\(\)[\s\S]*?HordeBackupDomains\.export\(\)/,
    'downloadable full backup must use the default credential-free export context');
assert.doesNotMatch(app.match(/async function exportFullBackup\(\) \{[\s\S]*?\n\}/)?.[0] || '',
    /includeCredentials/,
    'downloadable full backup must not opt into credentials');
assert.match(app, /if \(recoveryCredentials\) applyHostRecoveryCredentials\(recoveryCredentials\)/,
    'host restore must apply a supplied trusted-device credential bundle');
assert.match(app, /capturePreimage:\s*\(\) => serializeHostBackupPayload\(\{[\s\S]*?includeCredentials:\s*true/,
    'atomic rollback preimages must preserve the destination credentials');
assert.match(html, /stored unencrypted by your local bridge/,
    'the recovery UI must disclose plaintext credential storage');
assert.match(html, /Downloaded backup files omit API keys/,
    'the UI must distinguish downloadable exports from trusted-device recovery');

console.log('Local rolling recovery credentials: scoped export, restore, rollback, and disclosure checks passed');
