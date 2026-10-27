import { test, expect, type Page } from '@playwright/test';
import ar from '../../src/messages/ar.json';
import { samplePlan } from '../../src/lib/campaign/sample';
import { newCampaign } from '../../src/lib/campaign/schema';

async function sample(page: Page) {
  if (page.url().endsWith('/settings')) await page.getByRole('link', { name: 'Campaigns', exact: true }).click();
  else await page.goto('/campaigns/new');
  await page.getByRole('button', { name: 'Use sample product', exact: false }).click();
  await expect(page.getByAltText('Campaign product preview')).toBeVisible();
  await page.getByRole('button', { name: 'Create local sample concepts', exact: false }).click();
  await expect(page.getByTestId('concept-card')).toHaveCount(3);
}
async function configure(page: Page) {
  await page.goto('/settings'); await expect(page.getByLabel('API key', { exact: true })).toBeEnabled();
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('admorph-local-v1'); request.onerror = () => reject(new Error('open'));
    request.onsuccess = () => {
      const db = request.result; const tx = db.transaction(['settings', 'modelCatalogCache'], 'readwrite');
      tx.objectStore('settings').put({ key: 'providerSettings', value: { provider: 'meta', customBaseUrl: '', roles: { planner: { provider: 'meta', modelId: 'test-selected-planner' }, image: null, critic: null, edit: null } } });
      tx.objectStore('modelCatalogCache').put({ providerId: 'meta', fetchedAt: new Date().toISOString(), models: [{ id: 'test-selected-planner', name: 'Test selected planner', provider: 'meta', capabilities: ['text', 'vision', 'structured_output'], availability: 'available' }] });
      tx.oncomplete = () => { db.close(); resolve(); };
    };
  }));
  await page.reload(); await page.getByLabel('API key', { exact: true }).fill('fixture-key-never-real');
}
test('local campaign edits, approvals, input changes and product persist without external AI calls', async ({ page }, info) => {
  let calls = 0; await page.route('**/api/ai/plan', route => { calls++; return route.abort(); });
  await sample(page);
  const card = page.getByTestId('concept-card').first();
  await card.getByLabel('Headline', { exact: true }).fill('A headline saved by the user');
  await card.getByRole('button', { name: 'Approve concept', exact: false }).click();
  await expect(card.getByRole('button', { name: 'Reopen concept', exact: false })).toBeEnabled();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.getByTestId('campaign-save')).toHaveText('Saved in this browser');
  await page.reload();
  await expect(page.getByAltText('Campaign product preview')).toBeVisible();
  await expect(page.getByTestId('concept-card').first().getByLabel('Headline', { exact: true })).toHaveValue('A headline saved by the user');
  await expect(page.getByTestId('concept-card').first().getByRole('button', { name: 'Reopen concept', exact: false })).toBeVisible();
  await page.getByTestId('concept-card').first().getByLabel('Headline', { exact: true }).fill('Edited after approval');
  await expect(page.getByTestId('concept-card').first().getByRole('button', { name: 'Approve concept', exact: false })).toBeEnabled();
  await page.getByLabel('Campaign brief', { exact: true }).fill('A new brief requiring a fresh concept plan.');
  await expect(page.getByRole('button', { name: 'Approve concept', exact: false }).first()).toBeDisabled();
  await expect(page.getByText('The campaign inputs changed.', { exact: false })).toBeVisible();
  const id = await page.getByLabel('Your campaigns', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'New campaign', exact: false }).click();
  await expect(page.getByLabel('Campaign brief', { exact: true })).toHaveValue('');
  await page.getByLabel('Your campaigns', { exact: true }).selectOption(id);
  await expect(page.getByLabel('Campaign brief', { exact: true })).toHaveValue('A new brief requiring a fresh concept plan.');
  expect(calls).toBe(0); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/${info.project.name}-campaign.png`, fullPage: true });
});
test('Arabic creatives, invalid product upload and saved campaigns work on mobile and desktop', async ({ page }) => {
  await sample(page); await page.getByLabel('Creative language', { exact: true }).selectOption('ar');
  await page.getByRole('button', { name: 'Create local sample concepts', exact: false }).click();
  await expect(page.getByTestId('concept-card').first().getByLabel('Headline', { exact: true })).toHaveValue(/اكتشف/);
  await page.getByRole('button', { name: 'Switch to Arabic', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ar.campaign.title);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByLabel(ar.campaign.product, { exact: true }).setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not a real image') });
  await expect(page.locator('.request-error[role=alert]')).toContainText(ar.settings.errors.product_image);
  await expect(page.getByAltText(ar.campaign.productAlt)).toBeVisible();
  await page.getByLabel(ar.campaign.product, { exact: true }).setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) });
  await expect(page.locator('.request-error[role=alert]')).toContainText(ar.settings.errors.product_size);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('draft survives provider navigation and approvals wait for all valid concepts', async ({ page }) => {
  await sample(page);
  await page.getByRole('link', { name: 'Open provider settings', exact: false }).click();
  await page.getByRole('link', { name: 'Campaigns', exact: true }).click();
  await expect(page.getByTestId('concept-card')).toHaveCount(3);
  for (const card of await page.getByTestId('concept-card').all()) await card.getByRole('button', { name: 'Approve concept', exact: false }).click();
  await expect(page.getByText('All concepts are approved and saved for the next stage.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open design editor', exact: false })).toHaveCount(3);
  await page.getByTestId('concept-card').first().getByLabel('Caption', { exact: true }).fill('');
  await expect(page.getByTestId('concept-card').first().getByRole('button', { name: 'Approve concept', exact: false })).toBeDisabled();
});
test('campaign remains usable when browser storage is denied without claiming a saved draft', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { get() { throw new Error('storage denied'); } }); });
  await sample(page);
  await page.getByTestId('concept-card').first().getByLabel('Headline', { exact: true }).fill('A session-only campaign');
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.getByTestId('campaign-save')).toContainText('Session only');
  await expect(page.getByTestId('concept-card').first().getByLabel('Headline', { exact: true })).toHaveValue('A session-only campaign');
});
test('saved Meta model, explicit file consent and one validated response are respected', async ({ page }) => {
  await configure(page); let calls = 0;
  await page.route('**/api/ai/plan', async route => {
    calls++; const body = route.request().postDataJSON(); expect(body.modelId).toBe('test-selected-planner');
    expect(body.imageConsent).toBe(true); expect(body.apiKey).toBe('fixture-key-never-real'); expect(body.product.data.length).toBeGreaterThan(10);
    await route.fulfill({ json: samplePlan(newCampaign()) });
  });
  await sample(page); const plan = page.getByRole('button', { name: 'Plan with Meta', exact: false });
  await expect(plan).toBeDisabled(); expect(calls).toBe(0);
  await page.getByRole('checkbox', { name: 'I agree to send this product image', exact: false }).check();
  await plan.click(); await expect(page.getByText('Meta plan', { exact: true })).toBeVisible(); expect(calls).toBe(1);
  await page.getByRole('button', { name: 'Save now', exact: true }).click(); await expect(page.getByTestId('campaign-save')).toHaveText('Saved in this browser');
  const values = await page.evaluate(() => new Promise<unknown[]>((resolve) => { const open = indexedDB.open('admorph-local-v1'); open.onsuccess = () => { const db = open.result; const tx = db.transaction('campaigns'); const get = tx.objectStore('campaigns').getAll(); get.onsuccess = () => resolve(get.result); tx.oncomplete = () => db.close(); }; }));
  expect(JSON.stringify(values)).not.toContain('fixture-key-never-real');
  await page.reload(); await expect(page.getByRole('checkbox', { name: 'I agree to send this product image', exact: false })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Plan with Meta', exact: false })).toBeDisabled();
});
test('failed planning keeps edited concepts and cancelled requests do not replace them', async ({ page }) => {
  await configure(page); await sample(page);
  await page.getByTestId('concept-card').first().getByLabel('Headline', { exact: true }).fill('Keep this successful edit');
  await page.route('**/api/ai/plan', route => route.fulfill({ status: 502, json: { error: { code: 'plan_invalid' } } }));
  await page.getByRole('checkbox', { name: 'I agree to send this product image', exact: false }).check();
  await page.getByRole('button', { name: 'Plan with Meta', exact: false }).click();
  await expect(page.locator('.request-error[role=alert]')).toContainText('previous concepts have been kept');
  await expect(page.getByTestId('concept-card').first().getByLabel('Headline', { exact: true })).toHaveValue('Keep this successful edit');
  await page.unroute('**/api/ai/plan');
  await page.route('**/api/ai/plan', async route => { await new Promise(resolve => setTimeout(resolve, 500)); await route.fulfill({ json: samplePlan(newCampaign()) }).catch(() => {}); });
  await page.getByRole('button', { name: 'Plan with Meta', exact: false }).click();
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
  await expect(page.getByTestId('concept-card').first().getByLabel('Headline', { exact: true })).toHaveValue('Keep this successful edit');
  await expect(page.getByRole('button', { name: 'Plan with Meta', exact: false })).toBeEnabled();
});
