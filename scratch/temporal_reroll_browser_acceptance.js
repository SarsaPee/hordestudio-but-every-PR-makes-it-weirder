/*
 * Browser regression for the live Melbourne reroll finding. The provider is
 * intentionally mocked, but the World creation, send, reroll, receipt,
 * persistence, and reload paths are the real staged Experimental Worlds UI.
 */
const { chromium } = require(process.env.HORDE_PLAYWRIGHT_MODULE);

const port = process.env.HORDE_ACCEPTANCE_PORT || '43136';
const mockPort = process.env.HORDE_MOCK_PORT || '43203';
const worldName = `Temporal Reroll Disposable ${Date.now()}`;
const authoredTurn = 'ACCEPTANCE_TEMPORAL_SAME_DAY_ROLLBACK';
const must = (condition, message) => { if (!condition) throw new Error(message); };

async function visible(page, selector) {
    for (const candidate of await page.locator(selector).all()) if (await candidate.isVisible()) return candidate;
    throw new Error(`No visible ${selector}`);
}

async function configureMock(page) {
    await page.locator('#global-settings-btn').click();
    await (await visible(page, '#global-api-provider')).selectOption('custom');
    await (await visible(page, '#global-default-model')).fill('acceptance-mock');
    await (await visible(page, '[data-settings-target="accounts"]')).click();
    const customBlock = await visible(page, '#custom-provider-block');
    if (await customBlock.getAttribute('open') === null) await customBlock.locator('summary').click();
    await (await visible(page, '#global-custom-provider-name')).fill('Disposable temporal acceptance mock');
    await (await visible(page, '#global-custom-base-url')).fill(`http://127.0.0.1:${mockPort}/v1`);
    await (await visible(page, '#global-custom-api-key')).fill('disposable');
    await (await visible(page, '#save-global-settings')).click();
    await page.locator('#toast-container .toast.success').filter({ hasText: 'Settings saved' }).waitFor({ state: 'visible' });
}

async function waitForSettledReply(page) {
    await page.locator('.msg-user').filter({ hasText: authoredTurn }).locator('.msg-rewind-draft-btn').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#world-send-btn').waitFor({ state: 'visible' });
}

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.HORDE_BROWSER_EXECUTABLE });
    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(15000);
        await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
        await configureMock(page);
        await page.locator('#nav-worlds-btn').click();
        await page.locator('#create-new-world-btn').click();
        await page.locator('.world-studio-tab[data-tab="w-basics"]').click();
        await page.locator('#w-studio-name').fill(worldName);
        await page.locator('#save-play-world-btn').click();
        await page.locator('#sz-skip-btn').click();
        await page.waitForSelector('#world-user-input:visible');
        await (await fetch(`http://127.0.0.1:${mockPort}/temporal-reset`, { method: 'POST' })).json();
        await page.locator('#world-user-input').fill(authoredTurn);
        await page.locator('#world-send-btn').click();
        await waitForSettledReply(page);
        const before = (await page.locator('#world-clock-display').textContent()).trim();
        await page.locator('#world-reroll-btn').click();
        await page.locator('.reroll-count').filter({ hasText: '2 / 2' }).waitFor({ state: 'visible' });
        must((await page.locator('.msg-dm').last().textContent()).includes('Time 6:32 PM'),
            'the staged browser did not render the deliberately malformed same-Day header');
        const after = (await page.locator('#world-clock-display').textContent()).trim();
        must(before === after, `same-Day backward header changed canonical clock: ${before} -> ${after}`);
        await page.reload({ waitUntil: 'networkidle' });
        const reloaded = (await page.locator('#world-clock-display').textContent()).trim();
        must(reloaded === before, `reload changed canonical clock: ${before} -> ${reloaded}`);
        const audit = await (await fetch(`http://127.0.0.1:${mockPort}/audit`)).json();
        must(audit.requests.filter(item => item.reader === false).length >= 3,
            'the disposable narrator did not receive both the authored send and reroll requests');
        console.log(`same-day-rollback:clock:${before}`);
        console.log('same-day-rollback:reload-readback-ok');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
