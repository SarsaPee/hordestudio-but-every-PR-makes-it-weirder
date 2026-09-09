/*
 * F16 acceptance: exercise the native Experimental Worlds portrait file input
 * in a disposable browser profile and a disposable bridge-mirror namespace.
 * The fixture and image are deliberately synthetic; this must never target a
 * user world or a production browser profile.
 */
const { chromium } = require(process.env.HORDE_PLAYWRIGHT_MODULE);

const image = `${process.cwd()}/assets/worlds/policy-panic/mara-voss.jpg`;
const port = process.env.HORDE_ACCEPTANCE_PORT || '43139';
const worldName = `F16 Portrait Disposable ${Date.now()}`;
const must = (condition, message) => {
    if (!condition) throw new Error(message);
};

async function openPerson(page) {
    await page.locator('#nav-worlds-btn').click();
    const card = page.locator('#world-grid .char-card').filter({ hasText: worldName });
    await card.locator('.edit-world-btn').click();
    await page.locator('.world-studio-tab[data-tab="w-entities"]').click();
    await page.locator('.world-directory-card').filter({ hasText: 'Mira' }).click();
    await page.locator('.ent-portrait-clear').waitFor({ state: 'visible' });
}

async function saveWorldAndWait(page) {
    await page.locator('#save-world-btn').click();
    await page.locator('#toast-container .toast.success').filter({ hasText: 'World Saved!' }).waitFor({ state: 'visible' });
}

(async () => {
    const browser = await chromium.launch({
        headless: true,
        executablePath: process.env.HORDE_BROWSER_EXECUTABLE,
    });
    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(15000);
        await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
        await page.locator('#nav-worlds-btn').click();
        await page.locator('#create-new-world-btn').click();
        await page.locator('.world-studio-tab[data-tab="w-basics"]').click();
        await page.locator('#w-studio-name').fill(worldName);
        await page.locator('#save-play-world-btn').click();
        await page.locator('#sz-skip-btn').click();
        await page.waitForSelector('#world-user-input:visible');

        await page.locator('#world-studio-btn').click();
        await page.locator('.world-studio-tab[data-tab="w-entities"]').click();
        await page.locator('#add-entity-btn').click();
        await page.locator('.ent-name').fill('Mira');
        await page.locator('.ent-portrait-input').setInputFiles(image);
        await page.locator('#world-visual-editor-modal').waitFor({ state: 'visible', timeout: 30000 });
        await page.locator('#world-visual-save-close').click();
        await page.locator('.ent-portrait-clear').waitFor({ state: 'visible' });
        must(!(await page.locator('.ent-portrait-clear').isDisabled()), 'portrait was not attached');
        console.log('upload:attached');
        await page.locator('#world-record-done').click();

        console.log('save:portrait');
        await saveWorldAndWait(page);
        console.log('reload:portrait');
        await page.reload({ waitUntil: 'networkidle' });
        await openPerson(page);
        must(!(await page.locator('.ent-portrait-clear').isDisabled()), 'reload lost portrait association');
        console.log('upload:reload-readback');

        await page.locator('.ent-portrait-clear').click();
        must(await page.locator('.ent-portrait-clear').isDisabled(), 'clear did not remove portrait');
        await page.locator('#world-record-done').click();
        console.log('save:clear');
        await saveWorldAndWait(page);
        console.log('reload:clear');
        await page.reload({ waitUntil: 'networkidle' });
        await openPerson(page);
        must(await page.locator('.ent-portrait-clear').isDisabled(), 'reload restored cleared portrait');
        const preview = await page.locator('.world-media-preview.is-portrait').evaluate((element) => ({
            text: element.textContent.trim(),
            style: element.getAttribute('style') || '',
        }));
        console.log(`clear:preview:${JSON.stringify(preview)}`);
        // `displayInitials` uses a one-letter fallback for the single-token
        // fixture name "Mira". The important condition is that it replaces
        // the media background rather than leaving a stale portrait URL.
        must(preview.text === 'M' && !preview.style.includes('background-image'), 'fallback did not replace cleared portrait');
        console.log('clear:reload-fallback-ok');
    } finally {
        // A failed file-picker run can leave Chrome's shutdown callback open
        // after its renderer has exited. Do not conceal the actual assertion
        // or locator failure behind that harness-only shutdown wait.
        void browser.close();
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
