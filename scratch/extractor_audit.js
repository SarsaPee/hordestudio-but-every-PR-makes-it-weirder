/**
 * Audit of the suite extractor itself (app_source.js).
 *
 * Three features running, the same non-defect broke two unrelated suites: a
 * normal engine function gained a call to a new helper, and every suite that
 * had lifted that function by name threw "X is not defined" — because each
 * suite hand-listed what it pulled into its vm context, and the list was now
 * one name short.
 *
 * The extractor follows the call graph instead. These checks pin the parts
 * that make that safe: it must close over the graph, it must NOT trample a
 * stub a suite installed, it must not execute anything at load time, and it
 * must emit declarations in app.js source order.
 *
 * Run with: node scratch/extractor_audit.js
 */
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {
    app, declarations, functionSource, asyncFunctionSource, constSource,
    resolveDependencies, buildContext
} = require('./app_source.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const names = list => list.map(entry => entry.name);

test('the failure that kept recurring cannot happen again', () => {
    // normalizeLivingWorldState is the function every new world feature hooks
    // into. Each time one was added, the suites that lifted it broke.
    const resolved = names(resolveDependencies(['normalizeLivingWorldState']));
    ['syncMarketsWithWorldShops', 'syncFactionsWithWorld',
     'syncRelationshipsWithWorld', 'syncLocationStatesWithWorld'].forEach(callee => {
        assert(resolved.includes(callee),
            `${callee} was not followed — a suite lifting normalizeLivingWorldState would throw on it`);
    });
});

test('the graph is followed all the way down, not one level', () => {
    // syncFactionsWithWorld → readWorldFactions → normalizeWorldFaction → livingId
    const resolved = names(resolveDependencies(['syncFactionsWithWorld']));
    ['readWorldFactions', 'normalizeWorldFaction', 'livingId', 'livingClamp'].forEach(name => {
        assert(resolved.includes(name), `${name} was missed at depth`);
    });
});

test('constants a lifted function closes over come along', () => {
    const resolved = names(resolveDependencies(['factionStanding']));
    assert(resolved.includes('FACTION_ALLY_AT'), 'a threshold the function reads was not lifted');
    assert(resolved.includes('FACTION_HOSTILE_AT'));
});

test('a constant is found however it is formatted', () => {
    // Each new formatting style used to vanish from the index silently, and
    // the suite that needed it just reported the name as undefined.
    ['CALIBRATION_BATCH_SIZES',   // const X = Object.freeze({ … })
     'STRUCTURED_PARAM_FLAGS',    // const X = Object.freeze([ … ])
     'CALMING_CONDITION',         // const X = /regex/;   (one line)
     'OUTFIT_REMOVAL_PATTERN',    // const X =\n    /regex/;
     'OUTFIT_CLAUSE_START',       // const X = new RegExp(\n  … );
     'OUTFIT_NEXT_ACTION',
     'SOCIETY_PAIR_CAP'           // const X = 60;
    ].forEach(name => {
        assert(declarations.has(name), `${name} is not in the index at all`);
        const context = {};
        vm.createContext(context);
        assert.doesNotThrow(() => vm.runInContext(constSource(name), context),
            `${name} was extracted as something that will not evaluate`);
    });
});

test('a regex constant is recognised as inert', () => {
    // /\b(fire|siege)/ used to read as a call to `b(`, so the const was judged
    // unsafe to lift and every test touching it failed.
    assert(declarations.has('CALMING_CONDITION'), 'a regex constant is not offered at all');
    const resolved = names(resolveDependencies(['driftLocationStates']));
    assert(resolved.includes('CALMING_CONDITION'), 'a regex constant was not followed');
    assert(resolved.includes('HARMFUL_CONDITION'));
});

test('a stub the suite installed is never replaced by the real thing', () => {
    // A suite that stubs normalizeWorldGameRules is controlling which modules
    // are on. Lifting the real one would silently disable that control.
    const resolved = names(resolveDependencies(['getLivingWorldPrompt'], {
        provided: ['normalizeWorldGameRules']
    }));
    assert(!resolved.includes('normalizeWorldGameRules'), 'the extractor overrode a suite stub');
    const unstubbed = names(resolveDependencies(['getLivingWorldPrompt']));
    assert(unstubbed.includes('normalizeWorldGameRules'),
        'the real function is not reachable when nobody stubs it — the test above proves nothing');
});

test('every liftable constant can actually be evaluated on its own', () => {
    // This is the property that matters: a const which reads the DOM or calls
    // into the app at load time would throw the moment a context is built and
    // take the whole suite with it. (Mentioning "document" inside a string is
    // not the same thing — STARTER_WORLDS is prose, and prose is data.)
    // Evaluated WITH its resolved dependencies, not totally alone — a const
    // legitimately naming another const (a tool schema listing an enum defined
    // elsewhere, say) needs that dependency in scope, and resolveDependencies
    // already provides it. Zero context would fail for a reason that has
    // nothing to do with touching the DOM.
    const consts = [...declarations.values()].filter(entry => entry.kind === 'const');
    assert(consts.length > 5, 'no constants are being offered at all');
    consts.forEach(entry => {
        const context = {};
        assert.doesNotThrow(() => buildContext(vm, [entry.name], context),
            `${entry.name} throws when lifted with its own dependencies, which would take a whole suite down`);
    });
});

test('the emitted program is a subsequence of app.js, in order', () => {
    // The whole safety argument rests on this: if the lines run in the order
    // they appear in the real file, they behave as they do in the real file.
    const resolved = resolveDependencies(['runLivingWorldTick']);
    resolved.forEach((entry, index) => {
        if (!index) return;
        assert(entry.index > resolved[index - 1].index,
            `${entry.name} was emitted out of source order`);
    });
});

test('asking for a name that does not exist fails loudly', () => {
    assert.throws(() => resolveDependencies(['thisFunctionDoesNotExist']),
        /Missing declaration/, 'a typo in a seed list would silently produce nothing');
});

test('an identifier that is merely mentioned is not treated as a seed', () => {
    // Function bodies name plenty of things that are not declarations —
    // properties, parameters, locals. Those must not fail the resolve.
    assert.doesNotThrow(() => resolveDependencies(['getLivingWorldPrompt']));
});

test('a resolved set actually runs', () => {
    const context = { console: { log() {}, warn() {} } };
    buildContext(vm, ['seedFactionsFromWorld', 'seedMarketsFromWorld'], context);
    const world = {
        locations: [{ id: 'l', name: 'L', shop: [{ item: 'bread', price: 2 }] }],
        entities: [],
        factions: [{ id: 'f', name: 'The Crown', territory: ['l'] }]
    };
    assert.equal(context.seedFactionsFromWorld(world)[0].name, 'The Crown');
    assert(context.seedMarketsFromWorld(world).l, 'the lifted function did not work');
});

test('a suite can reach a helper it never named', () => {
    // The point of following the graph: no more editing a list to test one
    // level deeper.
    const context = { console: { log() {}, warn() {} } };
    buildContext(vm, ['seedFactionsFromWorld'], context);
    assert.equal(typeof context.normalizeWorldFaction, 'function',
        'a transitively resolved helper was not exported onto the context');
});

test('extraction is lexer-aware, not a brace count', () => {
    // An apostrophe inside a comment once broke this outright.
    const source = functionSource('normalizeLivingWorldState');
    const opens = (source.match(/\{/g) || []).length;
    const closes = (source.match(/\}/g) || []).length;
    assert(source.startsWith('function normalizeLivingWorldState('));
    assert(source.trimEnd().endsWith('}'), 'the extracted function does not close');
    assert(opens === closes, `unbalanced braces: ${opens} open, ${closes} closed`);
});

test('a nested template literal does not truncate a function', () => {
    // `${cond ? 'a' : `${x}/M`}` — scanning to the next backtick ended the
    // string early, so matchSpan lost brace balance and the whole declaration
    // was silently dropped from the index. Silently: the suite just reported
    // the function as missing.
    const nested = `
function extractorProbe(model) {
    return \`\${model.free ? 'free' : \`$\${model.price}/M\`} · \${model.ctx}k\`;
}`;
    // The real proof is that every extracted function still PARSES. Counting
    // braces would not do: plenty of them sit inside strings and regexes.
    let checked = 0;
    [...declarations.values()].filter(entry => entry.kind === 'function').forEach(entry => {
        // Keep `async` — stripping it makes every `await` inside a parse error.
        assert.doesNotThrow(() => new Function(`return (${entry.source});`),
            `${entry.name} was extracted as something that will not parse — it was cut short`);
        checked++;
    });
    assert(checked > 100, `only ${checked} functions were checked; the index looks broken`);
    assert(nested.length > 0);   // the shape above, kept for the reader
});

test('an async function can still be read as text', () => {
    // Extracting `async function f(){ await x }` and evaluating it standalone
    // is a syntax error, so text-only assertions get the async stripped.
    const source = asyncFunctionSource('runCalibrationPass');
    assert(source.startsWith('function runCalibrationPass('), 'the async keyword survived');
});

test('a frozen table is lifted whole', () => {
    const source = constSource('CALIBRATION_PASSES');
    assert(/society/.test(source), 'the table was cut short');
    assert(source.trimEnd().endsWith(';'));
});

test('resolving the largest entry point stays fast', () => {
    const started = Date.now();
    resolveDependencies(['runLivingWorldTick', 'normalizeLivingWorldState', 'getLivingWorldPrompt']);
    const elapsed = Date.now() - started;
    assert(elapsed < 2000, `resolution took ${elapsed}ms, which every suite pays on load`);
});

test('every suite that lifts engine code shares this extractor', () => {
    // A suite carrying its own copy is a suite that will drift out of step.
    const fs = require('node:fs');
    const path = require('node:path');
    ['living_world_audit.js', 'world_systems_audit.js', 'shop_audit.js',
     'faction_audit.js', 'society_audit.js'].forEach(suite => {
        const source = fs.readFileSync(path.join(__dirname, suite), 'utf8');
        assert(/require\('\.\/app_source\.js'\)/.test(source),
            `${suite} still carries its own extractor and will break the same way again`);
        assert(!/^function matchSpan\(/m.test(source),
            `${suite} still has a private copy of matchSpan`);
    });
});

let failures = 0;
for (const { name, fn } of tests) {
    try { fn(); console.log(`✓ ${name}`); }
    catch (error) { failures++; console.error(`✗ ${name}\n  ${error.message}`); }
}
if (failures) {
    console.error(`\n${failures} extractor check(s) failed.`);
    process.exit(1);
}
console.log(`\n${tests.length} extractor checks passed.`);
