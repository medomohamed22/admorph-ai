import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import ar from '../../src/messages/ar.json';
async function panel(page: Page, name: string) { if (test.info().project.name !== 'desktop') await page.getByRole('tab', { name, exact: true }).click(); }
async function enter(page: Page, arabic = false, brandName?: string) {
  if (page.url().endsWith('/settings')) await page.getByRole('link', { name: 'Campaigns', exact: true }).click(); else await page.goto('/campaigns/new');
  await page.getByRole('button', { name: 'Use sample product', exact: false }).click();
  if (arabic) await page.getByLabel('Creative language', { exact: true }).selectOption('ar');
  if (brandName) await page.getByLabel('Brand Kit', { exact: true }).selectOption({ label: brandName });
  await page.getByRole('button', { name: 'Create local sample concepts', exact: false }).click();
  const concept = page.getByTestId('concept-card').first(); await concept.getByRole('button', { name: 'Approve concept', exact: false }).click();
  await concept.getByRole('link', { name: 'Open design editor', exact: false }).click();
  await expect(page.getByRole('button', { name: 'Download PNG', exact: false }).first()).toBeEnabled();
}
async function configure(page: Page) {
  await page.goto('/settings'); await expect(page.getByLabel('API key', { exact: true })).toBeEnabled();
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('admorph-local-v1'); open.onerror = () => reject(new Error('db'));
    open.onsuccess = () => { const db = open.result, tx = db.transaction(['settings', 'modelCatalogCache'], 'readwrite'); const selected = { provider: 'meta', modelId: 'fixture-vision-critic' };
      tx.objectStore('settings').put({ key: 'providerSettings', value: { provider: 'meta', customBaseUrl: '', roles: { planner: selected, critic: selected, edit: selected, image: null } } });
      tx.objectStore('modelCatalogCache').put({ providerId: 'meta', fetchedAt: new Date().toISOString(), models: [{ id: 'fixture-vision-critic', name: 'Fixture Vision Critic', provider: 'meta', capabilities: ['text', 'vision', 'structured_output'], capabilityEvidence: 'metadata', availability: 'available' }] });
      tx.oncomplete = () => { db.close(); resolve(); }; };
  }));
  await page.reload(); await page.getByLabel('API key', { exact: true }).fill('critic-fixture-key-not-real');
}
const opinion = { summary: 'A clearer reading order may help this composition.', issues: [{ category: 'hierarchy', severity: 'suggestion', layerId: null, title: 'Consider the headline hierarchy', explanation: 'The headline could stand apart more clearly.', recommendation: 'Inspect the headline font size manually.' }] };

test('automatic checks detect real Arabic clipping and low contrast, then update after manual edits', async ({ page }, info) => {
  let calls = 0; await page.route('**/api/ai/critic', route => { calls++; return route.abort(); });
  await enter(page, true);
  await page.getByLabel('Layer text', { exact: true }).fill('هذا عنوان عربي طويل لا يتسع داخل مربع صغير ويجب أن تظهر ملاحظة واضحة للمستخدم');
  await page.getByLabel('Font size', { exact: true }).fill('160'); await page.getByLabel('Layer width', { exact: true }).fill('120'); await page.getByLabel('Layer height', { exact: true }).fill('24');
  await page.getByLabel('Text color', { exact: true }).fill('#ffffff');
  await page.getByRole('button', { name: 'Review design', exact: true }).click(); await expect(page.getByTestId('rule-text_clipped')).toBeVisible(); await expect(page.getByTestId('rule-contrast')).toBeVisible();
  await page.getByRole('button', { name: 'Switch to Arabic', exact: true }).click();
  await expect(page.getByRole('heading', { name: ar.critic.title, exact: true })).toBeVisible(); await expect(page.getByTestId('rule-text_clipped')).toContainText(ar.critic.rules.text_clipped.title);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/${info.project.name}-critic-ar.png`, fullPage: true });
  await panel(page, ar.studio.tabs.edit); await page.getByLabel(ar.studio.text, { exact: true }).fill('لحظة إبداعية');
  await page.getByLabel(ar.studio.fontSize, { exact: true }).fill('40'); await page.getByLabel(ar.studio.positions.width, { exact: true }).fill('930'); await page.getByLabel(ar.studio.positions.height, { exact: true }).fill('265'); await page.getByLabel(ar.studio.textColor, { exact: true }).fill('#18251b');
  await panel(page, ar.studio.tabs.review); await expect(page.getByTestId('rule-text_clipped')).toHaveCount(0); await expect(page.getByTestId('rule-contrast')).toHaveCount(0);
  expect(calls).toBe(0); await expect(page.getByRole('button', { name: /Apply fixes|طبّق الإصلاحات/ })).toHaveCount(0);
});
test('geometric logo overlap is explained and inspect-layer opens its actual editable controls', async ({ page }) => {
  await page.goto('/brands/new'); await page.getByLabel('Brand name', { exact: true }).fill('Review brand'); await page.getByLabel('Brand description', { exact: true }).fill('Synthetic brand for geometric overlap checks.');
  await page.locator('#brand-logo').setInputFiles('public/demo/sora-product.png'); await page.getByRole('button', { name: 'Save Brand Kit', exact: true }).click(); await expect(page.getByTestId('brand-card')).toHaveCount(1);
  await enter(page, false, 'Review brand'); await panel(page, 'Layers'); await page.locator('.studio-layers').getByRole('button', { name: 'Brand logo', exact: true }).click();
  await page.getByLabel('Horizontal position', { exact: true }).fill('75'); await page.getByLabel('Vertical position', { exact: true }).fill('205');
  await panel(page, 'Review'); const issue = page.getByTestId('rule-logo_overlap'); await expect(issue).toContainText('Transparent padding');
  await issue.getByRole('button', { name: 'Inspect layer: Brand logo', exact: true }).click(); await expect(page.getByLabel('Vertical position', { exact: true })).toHaveValue('205');
  await page.getByLabel('Vertical position', { exact: true }).fill('0'); await page.getByLabel('Horizontal position', { exact: true }).fill('850');
  await panel(page, 'Review'); await expect(page.getByTestId('rule-logo_overlap')).toHaveCount(0);
});
test('Critic requires consent, sends a reduced preview once, stores no key/image and marks changed layouts stale', async ({ page }) => {
  await configure(page); await enter(page); let calls = 0;
  await page.route('**/api/ai/critic', async route => {
    calls++; const body = route.request().postDataJSON(); expect(body.modelId).toBe('fixture-vision-critic'); expect(body.imageConsent).toBe(true); expect(body.apiKey).toBe('critic-fixture-key-not-real');
    const meta = await sharp(Buffer.from(body.preview.data, 'base64')).metadata(); expect(meta.width).toBe(540); expect(meta.height).toBe(675); expect(meta.format).toBe('jpeg'); expect(JSON.stringify(body.creative)).not.toContain(body.apiKey);
    await route.fulfill({ json: { ...opinion, issues: [{ ...opinion.issues[0], layerId: body.creative.layers.find((layer: { kind: string }) => layer.kind === 'headline').id }] } });
  });
  await panel(page, 'Review'); const run = page.getByRole('button', { name: 'Review with Meta', exact: true }); await expect(run).toBeDisabled(); expect(calls).toBe(0);
  await page.getByRole('checkbox', { name: 'I agree to send a rendered preview', exact: false }).check(); await run.click();
  await expect(page.getByTestId('ai-review')).toContainText('AI opinion · not a measured fact'); await expect(page.getByTestId('ai-review')).toContainText(opinion.summary); expect(calls).toBe(1);
  await expect(page.getByText('Review saved locally', { exact: false })).toBeVisible();
  await panel(page, 'Edit'); await page.getByLabel('Layer text', { exact: true }).fill('A changed creative after review');
  await page.getByRole('button', { name: 'Save now', exact: true }).click(); await expect(page.getByTestId('studio-save')).toHaveText('Saved in this browser');
  await panel(page, 'Review'); await expect(page.getByTestId('ai-review')).toContainText('older layout'); await expect(run).toBeDisabled();
  await page.reload(); await panel(page, 'Review'); await expect(page.getByTestId('ai-review')).toContainText(opinion.summary); await expect(page.getByTestId('ai-review')).toContainText('older layout');
  await expect(page.getByRole('checkbox', { name: 'I agree to send a rendered preview', exact: false })).not.toBeChecked();
  const stored = await page.evaluate(() => new Promise<unknown[]>((resolve) => { const open = indexedDB.open('admorph-local-v1'); open.onsuccess = () => { const db = open.result, tx = db.transaction('creativeReviews'), rows = tx.objectStore('creativeReviews').getAll(); rows.onsuccess = () => resolve(rows.result); tx.oncomplete = () => db.close(); }; }));
  expect(JSON.stringify(stored)).not.toMatch(/critic-fixture-key-not-real|apiKey|base64|mimeType/); expect(calls).toBe(1);
});
test('failed or cancelled reviews preserve the previous opinion and never apply design changes', async ({ page }) => {
  await configure(page); await enter(page); let calls = 0;
  await page.route('**/api/ai/critic', route => { calls++; return route.fulfill(calls === 1 ? { json: opinion } : { status: 429, json: { error: { code: 'quota' } } }); });
  await panel(page, 'Review'); const consent = page.getByRole('checkbox', { name: 'I agree to send a rendered preview', exact: false }); const run = page.getByRole('button', { name: 'Review with Meta', exact: true });
  await consent.check(); await run.click(); await expect(page.getByTestId('ai-review')).toContainText(opinion.summary);
  await consent.check(); await run.click(); await expect(page.locator('.critic-panel .request-error[role=alert]')).toBeVisible(); await expect(page.getByTestId('ai-review')).toContainText(opinion.summary); expect(calls).toBe(2);
  await page.unroute('**/api/ai/critic'); await page.route('**/api/ai/critic', async route => { await new Promise(resolve => setTimeout(resolve, 500)); await route.fulfill({ json: { summary: 'Late result must not replace the earlier review.', issues: [] } }).catch(() => {}); });
  await run.click(); await page.getByRole('button', { name: 'Cancel request', exact: true }).click(); await expect(page.getByTestId('ai-review')).toContainText(opinion.summary);
  await panel(page, 'Edit'); await expect(page.getByLabel('Layer text', { exact: true })).toHaveValue('Meet Sora up close');
});
test('missing stored product assets are detected locally even when export is unavailable', async ({ page }) => {
  await enter(page); await page.getByRole('button', { name: 'Save now', exact: true }).click(); await expect(page.getByTestId('studio-save')).toHaveText('Saved in this browser');
  await page.evaluate(() => new Promise<void>((resolve) => { const open = indexedDB.open('admorph-local-v1'); open.onsuccess = () => {
    const db = open.result, tx = db.transaction(['creatives', 'assets'], 'readwrite'), rows = tx.objectStore('creatives').getAll(); rows.onsuccess = () => { const layer = rows.result[0].layers.find((item: { kind: string }) => item.kind === 'product'); tx.objectStore('assets').delete(layer.assetId); }; tx.oncomplete = () => { db.close(); resolve(); };
  }; }));
  await page.reload(); await panel(page, 'Review'); await expect(page.getByTestId('rule-asset_missing')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download PNG', exact: false }).first()).toBeDisabled(); await expect(page.getByRole('button', { name: 'Review with Meta', exact: true })).toBeDisabled();
});
test('editing during an AI request discards a late result without automatically making another request', async ({ page }) => {
  await configure(page); await enter(page); let calls = 0;
  let release!: () => void, complete!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), finished = new Promise<void>(resolve => { complete = resolve; });
  await page.route('**/api/ai/critic', async route => { calls++; await held; await route.fulfill({ json: opinion }).catch(() => {}); complete(); });
  await panel(page, 'Review'); await page.getByRole('checkbox', { name: 'I agree to send a rendered preview', exact: false }).check(); await page.getByRole('button', { name: 'Review with Meta', exact: true }).click();
  await expect.poll(() => calls).toBe(1);
  await panel(page, 'Edit'); await page.getByLabel('Layer text', { exact: true }).fill('Keep the new version'); await panel(page, 'Review');
  release(); await finished;
  await expect(page.getByRole('button', { name: 'Review with Meta', exact: true })).toBeDisabled(); await expect(page.getByTestId('ai-review')).toHaveCount(0); expect(calls).toBe(1);
});
