const assert = require('node:assert/strict');
const { app } = require('./app_source.js');
const storageStart = app.indexOf('const HordeDB = {');
const storageSource = app.slice(storageStart, app.indexOf('\n};', storageStart) + 3);
const { chromium } = require(process.env.HORDE_PLAYWRIGHT_MODULE || 'playwright');

(async () => {
    const browser = await chromium.launch({ headless: true,
        ...(process.env.HORDE_BROWSER_EXECUTABLE ? { executablePath: process.env.HORDE_BROWSER_EXECUTABLE } : {}) });
    try {
        const context = await browser.newContext();
        // Entirely isolated origin/profile: no user's app or browser data.
        await context.route('https://horde-storage.test/**', route => route.fulfill({
            contentType: 'text/html', body: '<!doctype html><title>Storage audit</title>'
        }));
        const source = `const DB_NAME = 'HordeStorageAudit'; const DB_VERSION = 1; const STORE_NAME = 'state';
            ${storageSource}
            window.storage = HordeDB;`;
        async function client() {
            const page = await context.newPage();
            await page.goto('https://horde-storage.test/');
            await page.addScriptTag({ content: source });
            await page.evaluate(() => storage.init());
            return page;
        }
        const a = await client();
        const b = await client();
        await a.evaluate(() => storage.setMultiple({ worlds: ['A'], worldInstances: { a: 1 } }));
        const conflict = await b.evaluate(async () => {
            try { await storage.setMultiple({ worlds: ['B'], worldInstances: { b: 1 } }); }
            catch (error) { return { code: error.code, conflicted: storage.conflicted }; }
        });
        assert.deepEqual(conflict, { code: 'STATE_CONFLICT', conflicted: true });
        assert.deepEqual(await a.evaluate(() => storage.get('worlds')), ['A']);
        assert.deepEqual(await a.evaluate(() => storage.get('worldInstances')), { a: 1 });
        console.log('PASS: a stale tab cannot partially or wholly overwrite another tab');

        await a.evaluate(() => Promise.all([
            storage.setMultiple({ worlds: ['A2'] }),
            storage.setMultiple({ worlds: ['A3'] })
        ]));
        assert.deepEqual(await a.evaluate(() => storage.get('worlds')), ['A3']);
        assert.equal(await a.evaluate(() => storage.revision), 3);
        console.log('PASS: overlapping writes in one tab serialize without a false conflict');

        const cloneError = await a.evaluate(async () => {
            try { await storage.setMultiple({ worlds: ['bad'], unserializable: () => {} }); }
            catch (error) { return error.name; }
        });
        assert.equal(cloneError, 'DataCloneError');
        assert.deepEqual(await a.evaluate(() => storage.get('worlds')), ['A3']);
        assert.equal(await a.evaluate(() => storage.revision), 3);
        console.log('PASS: cloning failure rolls back every record and leaves the revision unchanged');

        const c = await client();
        const outcomes = await Promise.all([a, c].map((page, index) => page.evaluate(async index => {
            try { await storage.set('worldInstances', { winner: index }); return 'saved'; }
            catch (error) { return error.code; }
        }, index)));
        assert.deepEqual(outcomes.sort(), ['STATE_CONFLICT', 'saved']);
        assert.equal(await c.evaluate(() => storage.get('stateRevision')), 4);
        console.log('PASS: racing clients have exactly one canonical writer');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
