#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const revision = process.argv[2] || 'HEAD';
const manifestPath = 'docs/experimental-worlds/experimental-integration-manifest.txt';
const paths = readFileSync(manifestPath, 'utf8').split(/\r?\n/)
    .map(line => line.trim()).filter(line => line && !line.startsWith('#'));
if (!paths.length || new Set(paths).size !== paths.length) throw new Error('manifest is empty or has duplicate entries');
if (paths.join('\n') !== [...paths].sort().join('\n')) throw new Error('manifest paths must be sorted');
const hash = createHash('sha256');
for (const path of paths) {
    const bytes = Buffer.from(execFileSync('git', ['show', `${revision}:${path}`], { maxBuffer: 64 * 1024 * 1024 }));
    const name = Buffer.from(path);
    const header = Buffer.allocUnsafe(8);
    header.writeUInt32BE(name.length, 0); header.writeUInt32BE(bytes.length, 4);
    hash.update(header); hash.update(name); hash.update(bytes);
}
console.log(`${revision} ${hash.digest('sha256')}`);
