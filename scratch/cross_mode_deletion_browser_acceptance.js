/* Synthetic-only dual-mode deletion isolation acceptance. */
const { chromium } = require(process.env.HORDE_PLAYWRIGHT_MODULE);

const port = process.env.HORDE_ACCEPTANCE_PORT || '43140';
const suffix = Date.now();
const stockWorld = `Stock Delete Disposable ${suffix}`;
const experimentalWorld = `Experimental Counterpart Disposable ${suffix}`;
const stockCounterpart = `Stock Counterpart Disposable ${suffix}`;
const experimentalCounterpart = `Experimental Delete Disposable ${suffix}`;
const must = (condition, message) => { if (!condition) throw new Error(message); };

async function dismissUpdateNotice(page) {
    const button = page.locator('.app-update-dismiss');
    if (await button.isVisible().catch(() => false)) await button.click();
}

async function dismissSettingsModal(page) {
    const close = page.locator('#close-modal-btn');
    if (await close.isVisible().catch(() => false)) await close.click();
}

async function saveWorldAndWait(page) {
    await dismissUpdateNotice(page);
    await page.locator('#save-world-btn').click();
    await page.locator('#toast-container .toast.success').filter({ hasText: 'World Saved!' }).waitFor({ state: 'visible' });
}

function activeWorldCard(page, name) {
    return page.locator('#world-grid .char-card:not(.world-recovery-card)').filter({ hasText: name });
}

async function createWorld(page, name) {
    await dismissSettingsModal(page);
    await page.locator('#nav-worlds-btn').click();
    await page.locator('#create-new-world-btn').click();
    await page.locator('.world-studio-tab[data-tab="w-basics"]').click();
    await page.locator('#w-studio-name').fill(name);
    await saveWorldAndWait(page);
    await page.locator('#nav-worlds-btn').click();
    await activeWorldCard(page, name).waitFor({ state: 'visible' });
}

async function expectWorld(page, name, exists) {
    await dismissSettingsModal(page);
    await page.locator('#nav-worlds-btn').click();
    const card = activeWorldCard(page, name);
    if (exists) await card.waitFor({ state: 'visible' });
    else await card.waitFor({ state: 'detached' });
}

async function deleteWorld(page, name) {
    await dismissSettingsModal(page);
    await page.locator('#nav-worlds-btn').click();
    const card = activeWorldCard(page, name);
    await card.locator('.edit-world-btn').click();
    await dismissUpdateNotice(page);
    let dialogType = '';
    const dialogHandled = new Promise((resolve) => page.once('dialog', async (dialog) => {
        dialogType = dialog.type();
        await dialog.accept();
        resolve();
    }));
    await page.locator('#delete-world-btn').click();
    await dialogHandled;
    must(dialogType === 'confirm', `expected delete confirmation, got ${dialogType}`);
    await activeWorldCard(page, name).waitFor({ state: 'detached' });
}

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.HORDE_BROWSER_EXECUTABLE });
    try {
        const stock = await browser.newPage();
        const experimental = await browser.newPage();
        for (const page of [stock, experimental]) page.setDefaultTimeout(15000);
        await stock.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
        await experimental.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });

        await createWorld(stock, stockWorld);
        await createWorld(experimental, experimentalWorld);
        await createWorld(stock, stockCounterpart);
        await createWorld(experimental, experimentalCounterpart);
        console.log('fixtures:two-isolated-pairs-created');

        await deleteWorld(stock, stockWorld);
        await experimental.reload({ waitUntil: 'networkidle' });
        await expectWorld(experimental, experimentalWorld, true);
        console.log('stock-delete:experimental-unchanged');

        await deleteWorld(experimental, experimentalCounterpart);
        await stock.reload({ waitUntil: 'networkidle' });
        await expectWorld(stock, stockCounterpart, true);
        console.log('experimental-delete:stock-unchanged');
    } finally {
        void browser.close();
    }
})().catch((error) => { console.error(error); process.exitCode = 1; });
