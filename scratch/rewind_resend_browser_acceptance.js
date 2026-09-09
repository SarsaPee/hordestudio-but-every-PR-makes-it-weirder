/*
 * Milestone-A mocked-provider proof. This remains a real browser/UI run: only
 * the OpenAI-compatible server is synthetic. It never opens a user profile,
 * user world, or production bridge namespace.
 */
const { chromium } = require(process.env.HORDE_PLAYWRIGHT_MODULE);

const port = process.env.HORDE_ACCEPTANCE_PORT || '43140';
const mockPort = process.env.HORDE_MOCK_PORT || '43202';
const worldName = `Rewind Resend 17.0 Disposable ${Date.now()}`;
const authoredTurn = 'Mocked rewind resend acceptance beat.';
const must = (condition, message) => { if (!condition) throw new Error(message); };

async function dismissUpdateNotice(page) {
    const dismiss = page.locator('.app-update-dismiss');
    if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
}

async function visible(page, selector) {
    for (const candidate of await page.locator(selector).all()) {
        if (await candidate.isVisible()) return candidate;
    }
    throw new Error(`No visible ${selector}`);
}

async function configureMock(page) {
    await page.locator('#global-settings-btn').click();
    await (await visible(page, '#global-api-provider')).selectOption('custom');
    await (await visible(page, '#global-default-model')).fill('acceptance-mock');
    await (await visible(page, '[data-settings-target="accounts"]')).click();
    const customBlock = await visible(page, '#custom-provider-block');
    if (await customBlock.getAttribute('open') === null) await customBlock.locator('summary').click();
    await (await visible(page, '#global-custom-provider-name')).fill('Disposable acceptance mock');
    await (await visible(page, '#global-custom-base-url')).fill(`http://127.0.0.1:${mockPort}/v1`);
    await (await visible(page, '#global-custom-api-key')).fill('disposable');
    await dismissUpdateNotice(page);
    await (await visible(page, '#save-global-settings')).click();
    await page.locator('#toast-container .toast.success').filter({ hasText: 'Settings saved' }).waitFor({ state: 'visible' });
    await dismissUpdateNotice(page);
}

async function waitForSettledReply(page) {
    const rewind = page.locator('.msg-user').filter({ hasText: authoredTurn }).locator('.msg-rewind-draft-btn');
    await rewind.waitFor({ state: 'visible', timeout: 12000 });
    await page.locator('#world-send-btn').waitFor({ state: 'visible' });
    return rewind;
}

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.HORDE_BROWSER_EXECUTABLE });
    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(10000);
        await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
        await configureMock(page);
        await page.locator('#nav-worlds-btn').click();
        await page.locator('#create-new-world-btn').click();
        await page.locator('.world-studio-tab[data-tab="w-basics"]').click();
        await page.locator('#w-studio-name').fill(worldName);
        await page.locator('#save-play-world-btn').click();
        await page.locator('#sz-skip-btn').click();
        await page.waitForSelector('#world-user-input:visible');
        await page.locator('#world-user-input').fill(authoredTurn);
        await page.locator('#world-send-btn').click();
        let rewind = await waitForSettledReply(page);
        console.log('draft-send:settled');

        await rewind.click();
        await rewind.getByText('Confirm?').waitFor({ state: 'visible' });
        console.log('rewind:armed');
        await rewind.click();
        await page.waitForFunction((expected) => document.getElementById('world-user-input')?.value === expected, authoredTurn);
        const restoredDraft = await page.locator('#world-user-input').inputValue();
        const remainingSubmitted = await page.locator('.msg-user').filter({ hasText: authoredTurn }).count();
        console.log(`rewind:observed:${JSON.stringify({ restoredDraft, remainingSubmitted })}`);
        must(restoredDraft === authoredTurn, 'rewind did not restore the authored draft');
        must(remainingSubmitted === 0, 'rewind left the submitted user turn in the timeline');
        console.log('rewind:draft-restored');

        await page.locator('#world-send-btn').click();
        rewind = await waitForSettledReply(page);
        console.log('resend:settled');
        await page.reload({ waitUntil: 'networkidle' });
        await page.locator('.msg-user').filter({ hasText: authoredTurn }).waitFor({ state: 'visible' });
        must(await page.locator('.msg-user').filter({ hasText: authoredTurn }).count() === 1, 'reload did not retain exactly one resent authored turn');
        await page.locator('.msg-dm').last().waitFor({ state: 'visible' });
        console.log('reload:readback-ok');
    } finally {
        void browser.close();
    }
})().catch((error) => { console.error(error); process.exitCode = 1; });
