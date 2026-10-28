import { test, expect, type Page } from '@playwright/test';

async function tab(page: Page, name: string) {
  const button = page.getByRole('tab', { name, exact: true });
  if (await button.isVisible()) await button.click();
}

test('a background with a raised platform is blocked after one strict regeneration', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/settings');
  await expect(page.locator('#api-key')).toBeEnabled();
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('admorph-local-v1');
    open.onerror = () => reject(new Error('db open failed'));
    open.onblocked = () => reject(new Error('db blocked'));
    open.onsuccess = () => { const db = open.result, tx = db.transaction(['settings'], 'readwrite');
      const store = tx.objectStore('settings');
      store.put({ key: 'providerSettings', value: { provider: 'meta', customBaseUrl: '', roles: { planner: { provider: 'meta', modelId: 'fixture-planner' }, image: { provider: 'meta', modelId: 'fixture-image' }, critic: { provider: 'meta', modelId: 'fixture-critic' }, edit: { provider: 'meta', modelId: 'fixture-edit' } } } });
      store.put({ key: 'metaExtraRoles', value: { vision: { provider: 'meta', modelId: 'fixture-vision' } } });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(new Error('seed transaction failed')); };
      tx.onabort = () => { db.close(); reject(new Error('seed transaction aborted')); }; };
  }));
  await page.reload();
  await page.locator('#api-key').fill('fixture-vision-key');
  await page.getByRole('link', { name: 'Campaigns', exact: true }).click();
  await page.getByRole('button', { name: 'Use sample product', exact: false }).click();
  await page.getByRole('button', { name: 'Create local sample concepts', exact: false }).click();
  const card = page.getByTestId('concept-card').first();
  await card.getByRole('button', { name: 'Approve concept', exact: false }).click();
  await card.getByRole('link', { name: 'Open design editor', exact: false }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make it your own.');
  await tab(page, 'Background');
  await page.locator('[data-panel="generate"] .studio-consent input').check();
  await page.route('**/api/ai/vision-background', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    productCategory: 'cold brew can', material: 'matte aluminum', mood: 'fresh, icy', lighting: 'bright daylight', productScale: 'large-center',
    sceneIdeas: [
      { scene: 'icy studio scene', setting: 'studio', reason: 'cold and clean' },
      { scene: 'quiet cafe table', setting: 'cafe', reason: 'daily refreshment' },
      { scene: 'concrete ledge at dawn', setting: 'urban', reason: 'contrast with the dark can' },
    ],
  }) }));
  await page.getByRole('button', { name: 'Analyze product with vision', exact: true }).click();
  await expect(page.locator('.vision-scenes .scene-card')).toHaveCount(3);
  // Both background attempts return a valid image, but the check reports a
  // raised platform both times: attempt 0 must trigger the strict retry,
  // and the strict attempt must block instead of applying anything.
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  let backgroundCalls = 0;
  let checkCalls = 0;
  await page.route('**/api/ai/background', (route) => { backgroundCalls += 1; return route.fulfill({ body: pixel, contentType: 'image/png' }); });
  await page.route('**/api/ai/check-background', (route) => { checkCalls += 1; return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ hasProduct: false, found: '', hasPlatform: true, platformFound: 'a raised slab' }) }); });
  await page.getByRole('button', { name: 'Generate with Meta', exact: true }).click();
  await expect(page.locator('p[role="status"]', { hasText: 'raised platform' })).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('background-review')).toHaveCount(0);
  expect(backgroundCalls).toBe(2);
  expect(checkCalls).toBe(2);
  expect(errors).toEqual([]);
});
