#!/usr/bin/env node

/**
 * Deterministically namespace the light-DOM surface owned by Experimental
 * Worlds.  ScenePulse's private sp-* surface is deliberately excluded.
 *
 * Usage:
 *   node scripts/namespace-experimental-worlds.mjs --write
 *   node scripts/namespace-experimental-worlds.mjs --write --include-runtime
 *   node scripts/namespace-experimental-worlds.mjs --check
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const experimentalRoot = resolve(projectRoot, 'experiences/experimental-worlds');
const shellPath = resolve(experimentalRoot, 'experimental-worlds-shell.html');
const mapPath = resolve(projectRoot, 'docs/experimental-worlds/experimental-dom-id-map.json');
const prefix = 'ew-';

const stylePaths = [
  resolve(experimentalRoot, 'styles/experimental-worlds-isolated.css'),
  resolve(experimentalRoot, 'styles/world-visuals-and-sidecar.css'),
  resolve(experimentalRoot, 'styles/scene-pulse-worlds.css')
];

// These belong to the 17.4 host (or to the upstream ScenePulse compatibility
// probe), not to the Experimental light-DOM shell.  The runtime adapter must
// reach host behaviour through services rather than renaming these nodes.
const externalHostReferences = Object.freeze([
  'app',
  'cc-mood-badge',
  'chat',
  'companion-chat-view',
  'companion-studio-view',
  'companions-view',
  'confirm-modal-overlay',
  'cs-voice-sample-text',
  'experimental-worlds-portal-root',
  'experimental-worlds-root',
  'labs-guide-status',
  'labs-install-progress-fill',
  'labs-needle-progress-fill',
  'library-view',
  'multiplayer-campaign-list',
  'multiplayer-copy-setup',
  'multiplayer-hub-invite',
  'multiplayer-hub-join',
  'multiplayer-hub-name',
  'multiplayer-online-config',
  'multiplayer-relay-url',
  'multiplayer-source-list',
  'multiplayer-source-search',
  'mp-session-dice',
  'open-vector-memory-btn',
  'persona-ai-generation-status',
  'pip-clear-chat-btn',
  'pip-configure-btn',
  'pip-view',
  'rightSendForm',
  'send_but',
  'send_form',
  'send_textarea',
  'sheld',
  'show_more_messages',
  'stock-worlds-pass0-mount',
  'rooms-view',
  'settings-view',
  'top-bar',
  'top-settings-holder'
].sort((a, b) => a.localeCompare(b)));

const runtimeDirectories = [
  resolve(experimentalRoot, 'runtime'),
  resolve(experimentalRoot, 'mechanics'),
  resolve(experimentalRoot, 'visuals')
];

function walk(directory) {
  return readdirSync(directory).flatMap(name => {
    const path = resolve(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function runtimePaths() {
  return runtimeDirectories.flatMap(walk).filter(path => path.endsWith('.js')).sort();
}

function oldId(value) {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function isPreservedId(value) {
  const normalized = oldId(value);
  return normalized.startsWith('sp-') || normalized === 'spClkBg' || normalized === 'spTempGrad';
}

function addKind(found, value, kind) {
  const normalized = oldId(value);
  if (!normalized || isPreservedId(normalized) || externalHostReferences.includes(normalized)) return;
  if (!found.has(normalized)) found.set(normalized, new Set());
  found.get(normalized).add(kind);
}

function discoverShellIds(source, found) {
  for (const match of source.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/g)) {
    addKind(found, match[2], 'shell');
  }
}

function discoverRuntimeIds(source, found, dynamicPrefixes) {
  for (const match of source.matchAll(/getElementById\(\s*(["'])([^"']+)\1\s*\)/g)) {
    addKind(found, match[2], 'runtime-getElementById');
  }
  for (const match of source.matchAll(/(?:querySelector(?:All)?|closest|matches)\(\s*(["'`])([^"'`]+)\1/g)) {
    for (const selector of match[2].matchAll(/#([A-Za-z_][\w:-]*)/g)) {
      addKind(found, selector[1], 'runtime-selector');
    }
  }
  for (const match of source.matchAll(/(?:^|[<\s])id=(?:\\?["'])([A-Za-z_][\w:-]*)/gm)) {
    addKind(found, match[1], 'runtime-markup');
  }
  // The ID argument may be a literal or a small conditional expression.  Pull
  // every quoted candidate from that expression so paired SVG definitions and
  // url(#...) references receive the same deterministic mapping.
  for (const match of source.matchAll(/\.setAttribute\(\s*(['"])id\1\s*,\s*([^;\n]+?)\s*\)/g)) {
    for (const literal of match[2].matchAll(/(['"])([A-Za-z_][\w:-]*)\1/g)) {
      addKind(found, literal[2], 'runtime-created');
    }
  }
  for (const match of source.matchAll(/getElementById\(\s*`([^`]*?)\$\{/g)) {
    const value = oldId(match[1]);
    if (value && !isPreservedId(value)) dynamicPrefixes.add(value);
  }
}

function buildManifest() {
  const found = new Map();
  const dynamicPrefixes = new Set();
  const shell = readFileSync(shellPath, 'utf8');
  discoverShellIds(shell, found);
  for (const path of runtimePaths()) {
    discoverRuntimeIds(readFileSync(path, 'utf8'), found, dynamicPrefixes);
  }
  const entries = [...found.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([source, kinds]) => ({
      source,
      namespaced: `${prefix}${source}`,
      kinds: [...kinds].sort()
    }));
  return {
    schemaVersion: 1,
    namespace: prefix,
    generatedFrom: [
      relative(projectRoot, shellPath),
      'experiences/experimental-worlds/runtime/**/*.js',
      'experiences/experimental-worlds/mechanics/**/*.js',
      'experiences/experimental-worlds/visuals/**/*.js',
      'experiences/experimental-worlds/styles/**/*.css'
    ],
    protectedPrefixes: ['sp-'],
    protectedIds: ['spClkBg', 'spTempGrad'],
    externalHostReferences,
    roots: {
      library: 'ew-worlds-view',
      studio: 'ew-world-studio-view',
      play: 'ew-world-play-view'
    },
    entries,
    dynamicPrefixes: [...dynamicPrefixes]
      .filter(value => !externalHostReferences.includes(value))
      .sort((a, b) => a.localeCompare(b))
      .map(source => ({ source, namespaced: `${prefix}${source}` }))
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rewriteShell(source, manifest) {
  const mapping = new Map(manifest.entries.map(entry => [entry.source, entry.namespaced]));
  source = source.replace(/\bid\s*=\s*(["'])([^"']+)\1/g, (whole, quote, value) => {
    const replacement = mapping.get(oldId(value));
    return replacement ? `id=${quote}${replacement}${quote}` : whole;
  });

  const idReferenceAttributes = [
    'for', 'list', 'aria-activedescendant', 'aria-controls', 'aria-describedby',
    'aria-details', 'aria-errormessage', 'aria-flowto', 'aria-labelledby',
    'aria-owns', 'data-dismiss-fallback'
  ];
  const idReferencePattern = new RegExp(`\\b(${idReferenceAttributes.join('|')})\\s*=\\s*(["'])([^"']*)\\2`, 'g');
  source = source.replace(idReferencePattern, (whole, attribute, quote, value) => {
    const rewritten = value.split(/(\s+)/).map(token => {
      const replacement = mapping.get(oldId(token));
      return replacement || token;
    }).join('');
    return `${attribute}=${quote}${rewritten}${quote}`;
  });
  source = source.replace(/\b(href|xlink:href)\s*=\s*(["'])#([^"']+)\2/g, (whole, attribute, quote, value) => {
    const replacement = mapping.get(oldId(value));
    return replacement ? `${attribute}=${quote}#${replacement}${quote}` : whole;
  });
  return source;
}

function rewriteCss(source, manifest) {
  const replacements = [
    ...manifest.entries.map(({ source: from, namespaced: to }) => ({ from, to })),
    ...manifest.dynamicPrefixes.map(({ source: from, namespaced: to }) => ({ from, to }))
  ].sort((left, right) => right.from.length - left.from.length);
  for (const { from, to } of replacements) {
    source = source.replace(new RegExp(`#${escapeRegExp(from)}(?![A-Za-z0-9_-])`, 'g'), `#${to}`);
  }
  return source;
}

function rewriteRuntime(source, manifest) {
  const replacements = manifest.entries
    .map(({ source: from, namespaced: to }) => ({ from, to }))
    .sort((left, right) => right.from.length - left.from.length);
  for (const { from, to } of replacements) {
    const escaped = escapeRegExp(from);
    // Exact string literals used by getElementById, ID arrays and assignments.
    source = source.replace(new RegExp(`(["'\\x60])${escaped}\\1`, 'g'), (_, quote) => `${quote}${to}${quote}`);
    // Selectors and static ID/IDREF attributes embedded in markup strings.
    source = source.replace(new RegExp(`#${escaped}(?![A-Za-z0-9_-])`, 'g'), `#${to}`);
    source = source.replace(new RegExp(`((?:^|[<\\s])id=(?:\\\\?["']))${escaped}(?=["'])`, 'gm'), `$1${to}`);
    source = source.replace(new RegExp(`((?:for|list|aria-controls|aria-describedby|aria-labelledby)=(?:\\\\?["']))${escaped}(?=["'])`, 'g'), `$1${to}`);
  }
  for (const { source: from, namespaced: to } of manifest.dynamicPrefixes) {
    // A dynamic ID prefix must agree at creation and lookup sites.  Limiting
    // this rewrite to getElementById left generated element IDs behind.
    source = source.replace(new RegExp(`(\\x60)${escapeRegExp(from)}(?=\\$\\{)`, 'g'), `$1${to}`);
  }
  return source;
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const args = new Set(process.argv.slice(2));
const write = args.has('--write');
const includeRuntime = args.has('--include-runtime');
const manifest = buildManifest();
const manifestJson = stableJson(manifest);

if (write) {
  writeFileSync(mapPath, manifestJson);
  const shell = readFileSync(shellPath, 'utf8');
  writeFileSync(shellPath, rewriteShell(shell, manifest));
  for (const path of stylePaths) {
    writeFileSync(path, rewriteCss(readFileSync(path, 'utf8'), manifest));
  }
  if (includeRuntime) {
    for (const path of runtimePaths()) {
      writeFileSync(path, rewriteRuntime(readFileSync(path, 'utf8'), manifest));
    }
  }
  console.log(`Wrote ${manifest.entries.length} static IDs and ${manifest.dynamicPrefixes.length} dynamic prefixes to ${relative(projectRoot, mapPath)}.`);
  console.log(`Rewrote shell and ${stylePaths.length} stylesheets${includeRuntime ? ` plus ${runtimePaths().length} runtime files` : ''}.`);
} else {
  const expected = readFileSync(mapPath, 'utf8');
  if (expected !== manifestJson) {
    console.error(`${relative(projectRoot, mapPath)} is stale. Run this script with --write${includeRuntime ? ' --include-runtime' : ''}.`);
    process.exitCode = 1;
  } else {
    console.log(`Experimental DOM namespace map is current (${manifest.entries.length} static IDs, ${manifest.dynamicPrefixes.length} dynamic prefixes).`);
  }
}
