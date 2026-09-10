#!/usr/bin/env node
/*
 * Pass-1 ownership check: the complete, duplicated Experimental CSS closure
 * remains shipped, but cannot style an ordinary Horde route merely because
 * its link tags were parsed during bootstrap.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const ids = [
    'experimental-scenepulse-vendor-style',
    'experimental-scenepulse-host-style',
    'experimental-worlds-visual-style',
    'experimental-worlds-private-style'
];

for (const id of ids) {
    assert.match(html, new RegExp(`<link id="${id}"[^>]* disabled>`), `${id} must start disabled`);
    assert.match(app, new RegExp(`['"]${id}['"]`), `${id} must be managed by the Experimental lifecycle`);
}
assert.match(app, /function setExperimentalWorldStylesActive\(active\)/,
    'Experimental CSS needs one explicit lifecycle owner');
assert.match(app, /setExperimentalWorldStylesActive\(false\);/,
    'leaving Experimental must disable the retained World stylesheet closure');
assert.match(app, /if \(isExperimentalWorldsView\(viewName\)\) setExperimentalWorldStylesActive\(true\);/,
    'entering an Experimental route must enable the retained World stylesheet closure before render');
console.log('Experimental CSS lifecycle audit passed.');
