#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const routingPath = path.resolve(__dirname, '..', 'global-openrouter-routing.js');
const source = fs.readFileSync(routingPath, 'utf8');
const converterSource = source.match(/function nullableOpenRouterMetric\(value\) \{[\s\S]*?\n\}/)?.[0];

assert.ok(converterSource, 'nullable OpenRouter metric converter must exist');
const context = {};
vm.runInNewContext(`${converterSource}; globalThis.convert = nullableOpenRouterMetric;`, context);

assert.equal(context.convert(null), null, 'missing latency must not become zero');
assert.equal(context.convert(undefined), null, 'absent throughput must remain missing');
assert.equal(context.convert(''), null, 'blank telemetry must remain missing');
assert.equal(context.convert(0), 0, 'a genuine zero must survive');
assert.equal(context.convert('866'), 866, 'numeric API values remain numeric');

assert.match(source, /performancePercentile: 'p90'/,
    'P90 must be the default provider-performance percentile');
assert.match(source, /OPENROUTER_METRIC_PERCENTILES = Object\.freeze\(\['p50', 'p75', 'p90', 'p99'\]\)/,
    'only OpenRouter-provided percentile keys may be selectable');
assert.match(source, /latencyStats: normalizeOpenRouterMetricPercentiles\(row\?\.latency_last_30m\),[\s\S]*?throughputStats: normalizeOpenRouterMetricPercentiles\(row\?\.throughput_last_30m\)/,
    'the endpoint cache must retain native percentile objects rather than inventing values');
assert.match(source, new RegExp('milliseconds / 1_000'),
    "latency display must convert the endpoint's millisecond values to seconds");

assert.match(source, /fetch\(url, \{ method: 'GET', headers, cache \}\)/,
    'endpoint diagnostic must pass its explicit cache policy to fetch');
assert.match(source, /authenticatedRequested: Boolean\(authenticated\),[\s\S]*?keyPresent: Boolean\(key\),[\s\S]*?keyLength: key\.length,[\s\S]*?authorizationHeaderPresent: Boolean\(headers\.Authorization\)/,
    'safe request trace must distinguish requested auth, stored credential and attached header');
assert.match(source, /requestOpenRouterModelEndpoints\(url, \{ authenticated: true, cache: 'no-store' \}\)[\s\S]*?requestOpenRouterModelEndpoints\(url, \{ authenticated: false, cache: 'no-store' \}\)/,
    'auth comparison must bypass browser HTTP cache in both requests');

console.log('OpenRouter provider-metrics audit passed.');
