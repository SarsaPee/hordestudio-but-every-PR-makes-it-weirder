#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const experimentalRoot = resolve(projectRoot, 'experiences/experimental-worlds');
const shellPath = resolve(experimentalRoot, 'experimental-worlds-shell.html');
const hostPath = resolve(projectRoot, 'index.html');
const mapPath = resolve(projectRoot, 'docs/experimental-worlds/experimental-dom-id-map.json');
const shellOnly = process.argv.includes('--shell-only');
const failures = [];

function fail(message) {
  failures.push(message);
}

function walk(directory) {
  return readdirSync(directory).flatMap(name => {
    const path = resolve(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function parseIds(source) {
  return [...source.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/g)].map(match => match[2]);
}

function duplicates(values) {
  const seen = new Set();
  const result = new Set();
  for (const value of values) {
    if (seen.has(value)) result.add(value);
    seen.add(value);
  }
  return [...result].sort();
}

function discoverIdReferences(source) {
  const references = [];
  const attributes = [
    'for', 'list', 'aria-activedescendant', 'aria-controls', 'aria-describedby',
    'aria-details', 'aria-errormessage', 'aria-flowto', 'aria-labelledby',
    'aria-owns', 'data-dismiss-fallback'
  ];
  const pattern = new RegExp(`\\b(${attributes.join('|')})\\s*=\\s*(["'])([^"']*)\\2`, 'g');
  for (const match of source.matchAll(pattern)) {
    for (const token of match[3].split(/\s+/).filter(Boolean)) {
      references.push({ attribute: match[1], id: token });
    }
  }
  for (const match of source.matchAll(/\b(?:href|xlink:href)\s*=\s*(["'])#([^"']+)\1/g)) {
    references.push({ attribute: 'fragment', id: match[2] });
  }
  return references;
}

const manifest = JSON.parse(readFileSync(mapPath, 'utf8'));
const shell = readFileSync(shellPath, 'utf8');
const host = readFileSync(hostPath, 'utf8');
const shellIds = parseIds(shell);
const hostIds = parseIds(host);
const shellIdSet = new Set(shellIds);
const hostIdSet = new Set(hostIds);
const mapByOld = new Map(manifest.entries.map(entry => [entry.source, entry.namespaced]));
const mapByNew = new Map(manifest.entries.map(entry => [entry.namespaced, entry.source]));
const dynamicByOld = new Map((manifest.dynamicPrefixes || []).map(entry => [entry.source, entry.namespaced]));
const protectedIds = new Set(manifest.protectedIds || []);
const isProtected = id => protectedIds.has(id) || (manifest.protectedPrefixes || []).some(value => id.startsWith(value));
const externalHostIds = new Set(manifest.externalHostReferences || []);

const shellDuplicates = duplicates(shellIds);
if (shellDuplicates.length) fail(`duplicate IDs inside Experimental shell: ${shellDuplicates.join(', ')}`);

const hostDuplicates = duplicates(hostIds);
if (hostDuplicates.length) fail(`duplicate IDs already present in native host document: ${hostDuplicates.join(', ')}`);

const crossDocumentDuplicates = [...shellIdSet].filter(id => hostIdSet.has(id)).sort();
if (crossDocumentDuplicates.length) {
  fail(`native host and Experimental shell share IDs: ${crossDocumentDuplicates.join(', ')}`);
}

const mappedCollisions = manifest.entries
  .map(entry => entry.namespaced)
  .filter(id => hostIdSet.has(id))
  .sort();
if (mappedCollisions.length) {
  fail(`native host reserves mapped Experimental IDs: ${mappedCollisions.join(', ')}`);
}

const duplicateMappedIds = duplicates(manifest.entries.map(entry => entry.namespaced));
if (duplicateMappedIds.length) fail(`generated map contains duplicate targets: ${duplicateMappedIds.join(', ')}`);

for (const id of shellIds) {
  if (isProtected(id)) continue;
  if (!id.startsWith(manifest.namespace)) fail(`un-namespaced Experimental shell ID: ${id}`);
  if (id.startsWith(`${manifest.namespace}sp-`)) fail(`ScenePulse private ID was renamed: ${id}`);
  if (!mapByNew.has(id)) fail(`Experimental shell ID is absent from generated map: ${id}`);
}

for (const [route, id] of Object.entries(manifest.roots)) {
  if (!shellIdSet.has(id)) fail(`missing ${route} shell root ${id}`);
}

for (const entry of manifest.entries.filter(entry => entry.kinds.includes('shell'))) {
  if (!shellIdSet.has(entry.namespaced)) fail(`mapped shell ID is missing: ${entry.namespaced}`);
  if (shellIdSet.has(entry.source)) fail(`legacy shell ID remains: ${entry.source}`);
}

for (const reference of discoverIdReferences(shell)) {
  if (isProtected(reference.id)) continue;
  if (!reference.id.startsWith(manifest.namespace)) {
    fail(`un-namespaced ${reference.attribute} reference: ${reference.id}`);
  } else if (!shellIdSet.has(reference.id)) {
    fail(`${reference.attribute} points to missing Experimental ID: ${reference.id}`);
  }
}

const stylePaths = walk(resolve(experimentalRoot, 'styles')).filter(path => path.endsWith('.css')).sort();
for (const path of stylePaths) {
  const source = readFileSync(path, 'utf8');
  if (source.includes(`${manifest.namespace}sp-`)) fail(`${relative(projectRoot, path)} renamed an sp-* selector`);
  for (const entry of manifest.entries) {
    const legacySelector = new RegExp(`#${entry.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_-])`);
    if (legacySelector.test(source)) fail(`${relative(projectRoot, path)} retains legacy selector #${entry.source}`);
  }
  for (const match of source.matchAll(/#([A-Za-z_][\w-]*)/g)) {
    const id = match[1];
    // Hex colours share CSS's # syntax but cannot be selectors here.
    if (/^(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(id)) continue;
    if (mapByNew.has(id) || isProtected(id) || externalHostIds.has(id)) continue;
    fail(`${relative(projectRoot, path)} has an unclassified CSS ID selector #${id}`);
  }
}

if (!shellOnly) {
  const runtimePaths = [
    ...walk(resolve(experimentalRoot, 'runtime')),
    ...walk(resolve(experimentalRoot, 'mechanics')),
    ...walk(resolve(experimentalRoot, 'visuals')),
    resolve(experimentalRoot, 'scenepulse/scene-pulse-worlds.js'),
    resolve(experimentalRoot, 'scenepulse/scenepulse-source-runtime.js'),
    resolve(experimentalRoot, 'experimental-worlds-core.generated.mjs')
  ].filter(path => existsSync(path) && /\.m?js$/.test(path)).sort();
  const external = externalHostIds;
  for (const path of runtimePaths) {
    const source = readFileSync(path, 'utf8');
    if (source.includes(`${manifest.namespace}sp-`)) fail(`${relative(projectRoot, path)} renamed an sp-* ID`);
    for (const match of source.matchAll(/getElementById\(\s*(["'])([^"']+)\1\s*\)/g)) {
      const id = match[2];
      if (isProtected(id) || external.has(id) || id.startsWith(manifest.namespace)) continue;
      fail(`${relative(projectRoot, path)} has an unowned getElementById('${id}') reference`);
    }
    for (const match of source.matchAll(/(?:querySelector(?:All)?|closest|matches)\(\s*(["'`])([^"'`]+)\1/g)) {
      for (const selector of match[2].matchAll(/#([A-Za-z_][\w:-]*)/g)) {
        const id = selector[1];
        if (isProtected(id) || external.has(id) || id.startsWith(manifest.namespace)) continue;
        fail(`${relative(projectRoot, path)} has an unowned selector #${id}`);
      }
    }
    for (const match of source.matchAll(/(?:^|[<\s])id=(?:\\?["'])([A-Za-z_][\w:-]*)/gm)) {
      const id = match[1];
      if (isProtected(id) || id.startsWith(manifest.namespace)) continue;
      fail(`${relative(projectRoot, path)} creates unowned markup ID ${id}`);
    }
    for (const match of source.matchAll(/\.id\s*=\s*(["'])([^"']+)\1/g)) {
      const id = match[2];
      if (isProtected(id) || external.has(id) || id.startsWith(manifest.namespace)) continue;
      fail(`${relative(projectRoot, path)} assigns unowned DOM ID ${id}`);
    }
    for (const match of source.matchAll(/\.setAttribute\(\s*(['"])id\1\s*,\s*([^;\n]+?)\s*\)/g)) {
      for (const literal of match[2].matchAll(/(['"])([A-Za-z_][\w:-]*)\1/g)) {
        const id = literal[2];
        if (isProtected(id) || external.has(id) || id.startsWith(manifest.namespace)) continue;
        fail(`${relative(projectRoot, path)} sets unowned DOM ID ${id}`);
      }
    }
    for (const match of source.matchAll(/getElementById\(\s*`([^`]*?)\$\{/g)) {
      const idPrefix = match[1];
      if (isProtected(idPrefix) || idPrefix.startsWith(manifest.namespace)) continue;
      fail(`${relative(projectRoot, path)} retains unowned dynamic ID prefix ${idPrefix}`);
    }
    for (const match of source.matchAll(/\.id\s*=\s*`([^`]*?)\$\{/g)) {
      const idPrefix = match[1];
      if (isProtected(idPrefix) || idPrefix.startsWith(manifest.namespace)) continue;
      if (dynamicByOld.has(idPrefix)) {
        fail(`${relative(projectRoot, path)} creates a legacy dynamic DOM ID prefix ${idPrefix}`);
      }
    }
    for (const match of source.matchAll(/(?:for|list|aria-controls|aria-describedby|aria-labelledby)=(?:\\?["'])([A-Za-z_][\w:-]*)/g)) {
      const id = match[1];
      if (isProtected(id) || external.has(id) || id.startsWith(manifest.namespace)) continue;
      if (mapByOld.has(id)) fail(`${relative(projectRoot, path)} retains legacy markup IDREF ${id}`);
    }
    for (const match of source.matchAll(/(?:href|xlink:href)=(?:\\?["'])#([A-Za-z_][\w:-]*)/g)) {
      const id = match[1];
      if (isProtected(id) || external.has(id) || id.startsWith(manifest.namespace)) continue;
      if (mapByOld.has(id)) fail(`${relative(projectRoot, path)} retains legacy fragment #${id}`);
    }
  }
}

try {
  execFileSync(process.execPath, [resolve(projectRoot, 'scripts/namespace-experimental-worlds.mjs'), '--check'], {
    cwd: projectRoot,
    stdio: 'pipe'
  });
} catch (error) {
  fail(`generated namespace map is stale: ${String(error.stderr || error.message || error).trim()}`);
}

if (failures.length) {
  console.error(`Experimental DOM boundary verification failed (${failures.length}):`);
  failures.forEach(message => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log(`Experimental DOM boundary verified: ${shellIds.length} unique shell IDs, ${manifest.entries.length} mapped IDs, ${stylePaths.length} stylesheets, zero host collisions${shellOnly ? ' (runtime rewrite pending)' : ''}.`);
}
