#!/usr/bin/env node
/*
 * Report the host declarations the Experimental Worlds source still reaches.
 * This deliberately starts from every named Experimental declaration, follows
 * the real current call graph, and classifies only declarations originating in
 * app.js as compatibility work.  It is an extraction audit, not a runtime
 * substitute: every reported host declaration must either move to an
 * Experimental-owned compatibility file or become an explicit adapter call.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve('.');
const manifest = fs.readFileSync(path.join(root, 'docs/experimental-worlds/experimental-core-manifest.txt'), 'utf8')
    .split(/\r?\n/).map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.endsWith('.js'));
const { app, declarations, resolveDependencies } = require('../scratch/app_source.js');
const appLength = fs.readFileSync(path.join(root, 'app.js'), 'utf8').length;
const functionPattern = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
const seeds = new Set();

for (const relative of manifest) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    let match;
    while ((match = functionPattern.exec(source))) {
        if (declarations.has(match[1])) seeds.add(match[1]);
    }
}

const closure = resolveDependencies([...seeds]);
const host = closure.filter(entry => entry.index < appLength);
const result = {
    experimentalSeedCount: seeds.size,
    closureDeclarationCount: closure.length,
    hostCompatibilityDeclarationCount: host.length,
    hostCompatibilityDeclarations: host.map(entry => ({ name: entry.name, kind: entry.kind, index: entry.index }))
};

if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
else {
    console.log(`Experimental declarations: ${result.experimentalSeedCount}`);
    console.log(`Transitive closure: ${result.closureDeclarationCount}`);
    console.log(`Host compatibility declarations: ${result.hostCompatibilityDeclarationCount}`);
    host.forEach(entry => console.log(`${entry.kind}\t${entry.name}`));
}
