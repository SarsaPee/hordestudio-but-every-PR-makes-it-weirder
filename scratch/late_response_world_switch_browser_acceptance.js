/* A held provider reply must never render or persist into a newly selected World. */
const { chromium } = require(process.env.HORDE_PLAYWRIGHT_MODULE);
const port = process.env.HORDE_ACCEPTANCE_PORT || '43136';
const mockPort = process.env.HORDE_MOCK_PORT || '43206';
const suffix = Date.now();
const sourceWorld = `Late Source 17.4 Disposable ${suffix}`;
const destinationWorld = `Late Destination 17.4 Disposable ${suffix}`;
const delayedTurn = 'ACCEPTANCE_DELAY same-tab-world-switch';
const must = (condition, message) => { if (!condition) throw new Error(message); };

async function visible(page, selector) {
    for (const candidate of await page.locator(selector).all()) if (await candidate.isVisible()) return candidate;
    throw new Error(`No visible ${selector}`);
}
async function dismissUpdateNotice(page) {
    const dismiss = page.locator('.app-update-dismiss');
    if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
}
async function configureMock(page) {
    await page.locator('#global-settings-btn').click();
    await (await visible(page, '#global-api-provider')).selectOption('custom');
    await (await visible(page, '#global-default-model')).fill('acceptance-mock');
    await (await visible(page, '[data-settings-target="accounts"]')).click();
    const customBlock = await visible(page, '#custom-provider-block');
    if (await customBlock.getAttribute('open') === null) await customBlock.locator('summary').click();
    await (await visible(page, '#global-custom-provider-name')).fill('Disposable delayed acceptance mock');
    await (await visible(page, '#global-custom-base-url')).fill(`http://127.0.0.1:${mockPort}/v1`);
    await (await visible(page, '#global-custom-api-key')).fill('disposable');
    await dismissUpdateNotice(page);
    await (await visible(page, '#save-global-settings')).click();
    await page.locator('#toast-container .toast.success').filter({ hasText: 'Settings saved' }).waitFor({ state: 'visible' });
    await dismissUpdateNotice(page);
}
async function createAndEnterWorld(page, name) {
    await page.locator('#nav-worlds-btn').click();
    await page.locator('#create-new-world-btn').click();
    await page.locator('.world-studio-tab[data-tab="w-basics"]').click();
    await page.locator('#w-studio-name').fill(name);
    await page.locator('#save-play-world-btn').click();
    await page.locator('#sz-skip-btn').click();
    await page.waitForSelector('#world-user-input:visible');
}
async function waitForDelayedRequest() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const audit = await (await fetch(`http://127.0.0.1:${mockPort}/audit`)).json();
        if (audit.requests.some(item => item.delayed)) return;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('the delayed narrator request never reached the disposable transport');
}

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.HORDE_BROWSER_EXECUTABLE });
    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(15000);
        await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
        await configureMock(page);
        await createAndEnterWorld(page, sourceWorld);
        await (await fetch(`http://127.0.0.1:${mockPort}/delay-next`, { method: 'POST' })).json();
        await page.locator('#world-user-input').fill(delayedTurn);
        await page.locator('#world-send-btn').click();
        await waitForDelayedRequest();
        console.log('late-response:provider-held');
        await createAndEnterWorld(page, destinationWorld);
        console.log('late-response:destination-entered');
        const messagesBeforeRelease = await page.locator('.msg').count();
        await (await fetch(`http://127.0.0.1:${mockPort}/release`, { method: 'POST' })).json();
        await page.waitForTimeout(1500);
        const messagesAfterRelease = await page.locator('.msg').count();
        console.log(`late-response:counts:${messagesBeforeRelease}->${messagesAfterRelease}`);
        must(messagesAfterRelease === messagesBeforeRelease,
            'the held source response rendered into the newly selected World');
        must(await page.locator('.msg-user').filter({ hasText: delayedTurn }).count() === 0,
            'the source user turn appeared in the newly selected World');
        await page.reload({ waitUntil: 'networkidle' });
        must(await page.locator('.msg-user').filter({ hasText: delayedTurn }).count() === 0,
            'reload imported the held source turn into the newly selected World');
        console.log('late-response:same-tab-world-switch-unchanged');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
