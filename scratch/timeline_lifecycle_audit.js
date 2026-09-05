/**
 * World timeline lifecycle regression audit.
 * Run with: node scratch/timeline_lifecycle_audit.js
 */
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { app, functionSource } = require('./app_source.js');

const context = {
    state: { activeWorldId: 'world-a', worldInstances: { 'world-a': { activeSessionId: 'root', sessions: [] } } },
    safeJsonClone: value => JSON.parse(JSON.stringify(value)),
    saveState: async () => { context.saves++; },
    saves: 0,
    createNewWorldSession: async () => {
        context.created++;
        const inst = context.state.worldInstances['world-a'];
        inst.sessions.push({ id: 'fresh', name: 'New Timeline', sidecar: { mode: 'sidecar' } });
        inst.activeSessionId = 'fresh';
    },
    created: 0
};
vm.createContext(context);
vm.runInContext([
    functionSource('timelineForkLineage'),
    functionSource('reparentTimelineDescendants'),
    functionSource('deleteWorldTimeline'),
    'this.deleteTimeline = deleteWorldTimeline;'
].join('\n'), context);

(async () => {
    const inst = context.state.worldInstances['world-a'];
    inst.sessions = [
        { id: 'root', name: 'Root' },
        { id: 'child', name: 'Child', forkedFrom: { sessionId: 'root', turnCount: 4 } },
        { id: 'other', name: 'Other' }
    ];
    let result = await context.deleteTimeline('root');
    assert.equal(result.wasActive, true);
    assert.equal(inst.activeSessionId, 'child', 'deleting the active root must select a surviving timeline');
    assert.equal(inst.sessions.find(session => session.id === 'child').forkedFrom, undefined,
        'a child of a deleted root must become an independent timeline');
    assert.equal(inst.sessions.find(session => session.id === 'child').reparentedFrom.sessionId, 'root');

    result = await context.deleteTimeline('other');
    assert.equal(result.wasActive, false, 'unselected root timelines must be deletable');
    assert(!inst.sessions.some(session => session.id === 'other'));

    inst.sessions = [{ id: 'only', name: 'Only' }];
    inst.activeSessionId = 'only';
    result = await context.deleteTimeline('only');
    assert.equal(result.replacementCreated, true, 'the final timeline must also be deletable');
    assert.equal(context.created, 1);
    assert.equal(inst.activeSessionId, 'fresh');

    const create = functionSource('createNewWorldSession');
    assert.match(create, /sidecar:\s*\{\s*schemaVersion:\s*1,\s*mode:\s*'sidecar'\s*\}/,
        'new timelines must persist an explicit Sidecar protocol before rendering');
    assert.match(create, /normalizeWorldTimeline\(world, newSess,\s*\{\s*newWorld:\s*true\s*\}/,
        'new timelines must normalize as Sidecar independently of legacy world metadata');
    assert.match(functionSource('getCurrentWorldSession'), /\.\.\.\(options\.newWorld === true \? \{ sidecar: \{ schemaVersion: 1, mode: 'sidecar' \} \} : \{\}\)/,
        'a newly entered world instance must persist Sidecar before ordinary normalization');
    assert.match(functionSource('forkCurrentWorldTimeline'), /fork\.sidecar = \{ \.\.\.\(isPlainObject\(fork\.sidecar\) \? fork\.sidecar : \{\}\), mode: 'sidecar' \}/,
        'a newly created fork must use Sidecar when its world is configured for Sidecar');
    assert.match(functionSource('enterWorld'), /getCurrentWorldSession\(\{ newWorld: isNewInstance \}\)/,
        'a newly created world instance must seed Sidecar before first setup');
    assert.match(functionSource('enterWorld'), /inst\.activeSessionId = sessionId;\s*saveState\(\)\.catch/,
        'entering a selected hub timeline must persist the active timeline');
    assert.match(functionSource('renderWorldTimelineBrowser'), /timeline-delete-btn/,
        'timeline browser must expose deletion for every timeline');
    assert.match(functionSource('renderWorlds'), /world-hub-enter-timeline-btn/,
        'Worlds hub must expose a direct timeline entry control');
    assert.doesNotMatch(app, /active timeline is protected from deletion/i,
        'the legacy active-timeline deletion block must be removed');
    console.log('✓ timeline deletion, Sidecar defaults, and Worlds-hub entry verified');
})().catch(error => { console.error(error); process.exitCode = 1; });
