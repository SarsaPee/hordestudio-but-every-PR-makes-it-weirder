#!/usr/bin/env node
/**
 * Mechanical Pass-1 relocation: move the accepted Pass-0 Sidecar core out of
 * app.js without rewriting its implementation.  The source is the accepted
 * behavioral-oracle tag, never the mutable working file.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sourceRevision = 'checkpoint/experimental-worlds-dual-inplace-17.0';
const source = execFileSync('git', ['show', `${sourceRevision}:app.js`], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024
});
const lines = source.split('\n');
const start = lines.findIndex((line, index) => line === '/*' && lines[index + 1]?.includes('Sidecar runtime.'));
const end = lines.findIndex((line, index) => index > start && line === '})(window);');
if (start < 0 || end < start) throw new Error('Could not locate the accepted Sidecar source unit.');

const unit = `${lines.slice(start, end + 1).join('\n')}\n`;
const runtimePath = resolve(root, 'experiences/experimental-worlds/runtime/sidecar-core.js');
mkdirSync(dirname(runtimePath), { recursive: true });
writeFileSync(runtimePath, unit);

const appPath = resolve(root, 'app.js');
let app = readFileSync(appPath, 'utf8');
const currentStart = app.indexOf('/*\n * Sidecar runtime.  This deliberately lives in app.js:');
if (currentStart >= 0) {
  const currentEnd = app.indexOf('})(window);', currentStart);
  if (currentEnd < currentStart) throw new Error('Could not find the Sidecar unit terminator in app.js.');
  app = `${app.slice(0, currentStart)}// Experimental Worlds Sidecar core is loaded before this host bootstrap.\n${app.slice(currentEnd + '})(window);'.length)}`;
  writeFileSync(appPath, app);
}

console.log(`Relocated accepted Sidecar core from ${sourceRevision} (${end - start + 1} lines).`);
