/**
 * Sidecar semantic-time regression audit.
 * Run with: node scratch/sidecar_semantic_time_audit.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function sourceOf(name) {
    const start = app.indexOf(`function ${name}(`);
    assert(start >= 0, `missing ${name}`);
    const open = app.indexOf('{', start);
    let depth = 0;
    for (let index = open; index < app.length; index++) {
        if (app[index] === '{') depth++;
        if (app[index] === '}' && --depth === 0) return app.slice(start, index + 1);
    }
    throw new Error(`unclosed ${name}`);
}

const context = {};
vm.createContext(context);
vm.runInContext([
    'function isPlainObject(value) { return !!value && typeof value === "object" && !Array.isArray(value); }',
    'const SIDECAR_MAX_EXPLICIT_TIME_SKIP_MINUTES = 1440;',
    sourceOf('sidecarTemporalStatement'),
    sourceOf('parseSidecarClockEndpoint'),
    sourceOf('sidecarEndpointMinuteOfDay'),
    sourceOf('deriveSidecarExplicitTimeSkip'),
    sourceOf('applySidecarTemporalAuthority'),
    'this.derive = deriveSidecarExplicitTimeSkip; this.apply = applySidecarTemporalAuthority;'
].join('\n'), context);

const handoff = text => `ANSWER core.time:\n- ${text}\nANSWER core.location:\n- Same place.`;
const clock = minute => ({ canonicalTotalMinutes: minute });

assert.equal(context.derive(handoff('8:57 → 8:58'), clock(8 * 60 + 57)).minutes, 1,
    'matching unmarked endpoint pair must advance one minute');
assert.equal(context.derive(handoff('from 18:10 to 18:45'), clock(18 * 60 + 10)).minutes, 35,
    'matching 24-hour endpoints must advance their exact delta');
assert.equal(context.derive(handoff('11:59 PM → 12:01 AM'), clock(23 * 60 + 59)).minutes, 2,
    'explicit midnight rollover must advance safely');
assert.equal(context.derive(handoff('a moment later'), clock(8 * 60 + 57)), null,
    'vague time language must not move the clock');
assert.equal(context.derive(handoff('8:56 → 8:58'), clock(8 * 60 + 57)), null,
    'an endpoint pair whose source disagrees with canonical time must be rejected');
assert.equal(context.derive(handoff('8:57 → 8:56'), clock(8 * 60 + 57)), null,
    'an unmarked backwards pair must be rejected');
assert.equal(context.derive(handoff('11:59 PM → 12:01'), clock(23 * 60 + 59)), null,
    'an endpoint that crosses midnight without an explicit target meridiem must be rejected');

const receipt = { events: [{ type: 'time', minutes_elapsed: 45 }, { type: 'activity' }], state_updates: { time_skip_minutes: 45, ledger_update: 'A beat passed.' } };
const evidence = context.apply(receipt, handoff('8:57 → 8:58'), clock(8 * 60 + 57));
assert.equal(evidence.minutes, 1);
assert.deepEqual(receipt.events, [{ type: 'activity' }], 'model-authored time events must be removed');
assert.equal(receipt.state_updates.time_skip_minutes, 1, 'runtime must supply the endpoint-derived delta');

assert.match(app, /sidecarTemporalAuthority: true/, 'Sidecar commits must carry temporal authority context');
assert.match(app, /sidecar_time_not_authorized/, 'validator must guard Sidecar time against unauthorized values');
console.log('✓ Sidecar semantic-time endpoint authority verified');
