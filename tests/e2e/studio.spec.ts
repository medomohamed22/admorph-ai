import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import ar from '../../src/messages/ar.json';

async function enter(page: Page, arabic = false, brandName?: string) {
  if (page.url().endsWith('/settings')) await page.getByRole('link', { name: 'Campaigns', exact: true }).click(); else await page.goto('/campaigns/new');
  await page.getByRole('button', { name: 'Use sample product', exact: false }).click();
  if (brandName) await page.getByLabel('Brand Kit', { exact: true }).selectOption({ label: brandName });
  if (arabic) await page.getByLabel('Creative language', { exact: true }).selectOption('ar');
  await page.getByRole('button', { name: 'Create local sample concepts', exact: false }).click();
  const card = page.getByTestId('concept-card').first(); await card.getByRole('button', { name: 'Approve concept', exact: false }).click();
  await card.getByRole('link', { name: 'Open design editor', exact: false }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make it your own.');
  await expect(page.getByRole('button', { name: 'Download PNG', exact: false }).first()).toBeEnabled();
}
async function tab(page: Page, name: string) { const button = page.getByRole('tab', { name, exact: true }); if (await button.isVisible()) await button.click(); }
async function exportPng(page: Page, name = 'Download PNG') {
  const download = page.waitForEvent('download'); await page.getByRole('button', { name, exact: false }).first().click();
  const file = await download; const bytes = await readFile((await file.path())!);
  expect(bytes.subarray(1, 4).toString()).toBe('PNG'); expect(bytes.readUInt32BE(16)).toBe(1080); expect(bytes.readUInt32BE(20)).toBe(1350); expect(bytes.length).toBeGreaterThan(15000);
  return bytes;
}
async function configure(page: Page) {
  await page.goto('/settings'); await expect(page.getByLabel('API key', { exact: true })).toBeEnabled();
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('admorph-local-v1'); open.onerror = () => reject(new Error('db'));
    open.onsuccess = () => { const db = open.result, tx = db.transaction(['settings', 'modelCatalogCache'], 'readwrite');
      const text = { provider: 'meta', modelId: 'fixture-text' };
      tx.objectStore('settings').put({ key: 'providerSettings', value: { provider: 'meta', customBaseUrl: '', roles: { planner: text, critic: text, edit: text, image: { provider: 'meta', modelId: 'fixture-image' } } } });
      tx.objectStore('modelCatalogCache').put({ providerId: 'meta', fetchedAt: new Date().toISOString(), models: [{ id: 'fixture-text', name: 'Fixture Text', provider: 'meta', capabilities: ['text'], capabilityEvidence: 'metadata', availability: 'available' }, { id: 'fixture-image', name: 'Fixture Image', provider: 'meta', capabilities: ['image_output'], capabilityEvidence: 'metadata', availability: 'available' }] });
      tx.oncomplete = () => { db.close(); resolve(); }; };
  }));
  await page.reload(); await page.getByLabel('API key', { exact: true }).fill('fixture-only-image-key');
}

test('editable composition persists text, layer geometry and local background; PNG stays full size when zoomed', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await enter(page);
  await page.getByLabel('Layer text', { exact: true }).fill('A real editable headline');
  await page.getByLabel('Horizontal position', { exact: true }).fill('9999');
  expect(Number(await page.getByLabel('Horizontal position', { exact: true }).inputValue())).toBeLessThanOrEqual(150);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Horizontal position', { exact: true })).toHaveValue('75');
  await tab(page, 'Background'); await page.getByRole('button', { name: 'Create local background', exact: true }).click();
  await expect(page.locator('.studio-status').getByText('Local sample background · no AI request', { exact: true })).toBeVisible();
  await tab(page, 'Edit');
  const originalUrl = page.url();
  await page.getByLabel('Layer text', { exact: true }).fill('Keep edits when switching concepts');
  await page.getByRole('link', { name: 'Back to campaigns', exact: false }).click();
  const second = page.getByTestId('concept-card').nth(1); await second.getByRole('button', { name: 'Approve concept', exact: false }).click();
  await second.getByRole('link', { name: 'Open design editor', exact: false }).click();
  await expect(page.getByLabel('Layer text', { exact: true })).not.toHaveValue('Keep edits when switching concepts');
  await page.goto(originalUrl);
  await expect(page.getByLabel('Layer text', { exact: true })).toHaveValue('Keep edits when switching concepts');
  await page.getByLabel('Canvas zoom', { exact: true }).selectOption('2');
  await exportPng(page);
  await page.getByRole('button', { name: 'Save now', exact: true }).click(); await expect(page.getByTestId('studio-save')).toHaveText('Saved in this browser');
  await page.reload(); await expect(page.getByRole('button', { name: 'Download PNG', exact: false }).first()).toBeEnabled();
  await expect(page.getByLabel('Layer text', { exact: true })).toHaveValue('Keep edits when switching concepts');
  await expect(page.locator('.studio-status').getByText('Local sample background · no AI request', { exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/${info.project.name}-studio.png`, fullPage: true });
  const overflow = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth, elements: [...document.querySelectorAll('main *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(el => ({ tag: el.tagName, className: el.className, width: el.getBoundingClientRect().width, display: getComputedStyle(el).display })) }));
  expect(overflow.width, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport); expect(errors).toEqual([]);
});
test('product photo can be selected, dragged, nudged and resized without flattening text', async ({ page }) => {
  await enter(page); await tab(page, 'Layers'); await page.locator('.studio-layers').getByRole('button', { name: 'Product photo', exact: true }).click();
  await expect(page.getByLabel('Layer width', { exact: true })).toHaveValue('640');
  const canvas = page.locator('.konvajs-content'); await canvas.scrollIntoViewIfNeeded(); const box = (await canvas.boundingBox())!;
  if (test.info().project.name === 'mobile') {
    const touch = await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * .5, y: box.y + box.height * .62 }] });
    for (let step = 1; step <= 5; step++) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * (.5 + .014 * step), y: box.y + box.height * (.62 + .006 * step) }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await touch.detach();
  } else { await page.mouse.move(box.x + box.width * .5, box.y + box.height * .62); await page.mouse.down(); await page.mouse.move(box.x + box.width * .57, box.y + box.height * .65, { steps: 5 }); await page.mouse.up(); }
  expect(Number(await page.getByLabel('Horizontal position', { exact: true }).inputValue())).toBeGreaterThan(220);
  await page.getByRole('group', { name: 'Editable design canvas', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  await page.getByLabel('Layer width', { exact: true }).fill('500');
  await expect(page.getByLabel('Layer width', { exact: true })).toHaveValue('500');
  await exportPng(page);
});
test('Arabic copy stays editable in Cairo and exports after switching the interface to RTL', async ({ page }, info) => {
  await enter(page, true); await expect(page.getByLabel('Font family', { exact: true })).toHaveValue('Cairo');
  await page.getByLabel('Layer text', { exact: true }).fill('لحظة إبداعية على ذوقك');
  await page.getByRole('button', { name: 'Switch to Arabic', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ar.studio.title); await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByLabel(ar.studio.text, { exact: true })).toHaveValue('لحظة إبداعية على ذوقك');
  await exportPng(page, ar.studio.download); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/${info.project.name}-studio-ar.png`, fullPage: true });
});
test('image consent controls one selected-model request; failed regeneration preserves the composition', async ({ page }) => {
  await configure(page); await enter(page); let calls = 0;
  await page.getByLabel('Layer text', { exact: true }).fill('Keep my exact headline');
  const image = await readFile('public/demo/sora-product.png');
  await page.route('**/api/ai/background', async route => {
    calls++; const body = route.request().postDataJSON(); expect(body.modelId).toBe('fixture-image'); expect(body.approved).toBe(true); expect(body.consent).toBe(true); expect(body.product).toBeUndefined(); expect(body.apiKey).toBe('fixture-only-image-key');
    await route.fulfill(calls === 1 ? { contentType: 'image/png', body: image } : { status: 429, json: { error: { code: 'quota' } } });
  });
  await tab(page, 'Background'); const generate = page.getByRole('button', { name: 'Generate with Meta', exact: true });
  await expect(generate).toBeDisabled(); expect(calls).toBe(0);
  await page.getByRole('checkbox', { name: 'I authorize one', exact: false }).check(); await generate.click();
  await expect(page.locator('.studio-status').getByText('Meta background · editable composition', { exact: true })).toBeVisible(); expect(calls).toBe(1);
  await expect(generate).toBeDisabled(); await page.getByRole('checkbox', { name: 'I authorize one', exact: false }).check(); await generate.click();
  await expect(page.locator('.studio-page>.request-error[role=alert]')).toBeVisible(); expect(calls).toBe(2);
  await tab(page, 'Edit'); await expect(page.getByLabel('Layer text', { exact: true })).toHaveValue('Keep my exact headline');
  await exportPng(page); await expect(page.locator('.studio-status').getByText('Meta background · editable composition', { exact: true })).toBeVisible();
  await page.unroute('**/api/ai/background');
  await page.route('**/api/ai/background', async route => { await new Promise(resolve => setTimeout(resolve, 400)); await route.fulfill({ contentType: 'image/png', body: image }).catch(() => {}); });
  await tab(page, 'Background'); await generate.click(); await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
  await expect(page.locator('.studio-page>.request-error[role=alert]')).toBeVisible();
  await tab(page, 'Edit'); await expect(page.getByLabel('Layer text', { exact: true })).toHaveValue('Keep my exact headline');
});
test('unverified Meta image IDs save without invented support',async({page})=>{await configure(page);await page.locator('#meta-image').fill('unverified-image-model');await page.getByRole('button',{name:'Save Settings',exact:true}).click();await page.reload();await expect(page.locator('#meta-image')).toHaveValue('unverified-image-model');await expect(page.getByTestId('support-image')).toHaveText("Unverified for this task/account");});
test('denied local storage keeps an editable exportable creative and reports session-only status', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { get() { throw new Error('denied'); } }));
  await enter(page); await page.getByLabel('Layer text', { exact: true }).fill('Session-only design');
  await page.getByRole('button', { name: 'Save now', exact: true }).click(); await expect(page.getByTestId('studio-save')).toContainText('Session only');
  await exportPng(page);
});
test('a real saved brand logo remains an independent layer and is present in the PNG', async ({ page }) => {
  await page.goto('/brands/new'); await page.getByLabel('Brand name', { exact: true }).fill('Logo test brand');
  await page.getByLabel('Brand description', { exact: true }).fill('A synthetic brand for layer verification.');
  await page.locator('#brand-logo').setInputFiles('public/demo/sora-product.png');
  await page.getByRole('button', { name: 'Save Brand Kit', exact: true }).click(); await expect(page.getByTestId('brand-card')).toHaveCount(1);
  await enter(page, false, 'Logo test brand'); await tab(page, 'Layers');
  await page.locator('.studio-layers').getByRole('button', { name: 'Brand logo', exact: true }).click();
  const withLogo = await exportPng(page); await page.getByRole('checkbox', { name: 'Show layer', exact: true }).uncheck();
  const withoutLogo = await exportPng(page); expect(withLogo.equals(withoutLogo)).toBe(false);
});
