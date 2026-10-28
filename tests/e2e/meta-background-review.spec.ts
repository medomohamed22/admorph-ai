import { test, expect, type Page } from '@playwright/test';

async function tab(page: Page, name: string) {
  const button = page.getByRole('tab', { name, exact: true });
  if (await button.isVisible()) await button.click();
}

test('Meta background without vision shows the review box, and the reference hint tracks consent', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Seed an image role first (no paid call will happen: the background
  // request is intercepted and returned as a 1x1 PNG).
  await page.goto('/settings');
  // Wait for the app session (and its Dexie database) to be ready before
  // touching IndexedDB directly: opening the database first would create a
  // schemaless v1 copy and block the app's own upgrade.
  await expect(page.locator('#api-key')).toBeEnabled();
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('admorph-local-v1');
    open.onerror = () => reject(new Error('db open failed'));
    open.onblocked = () => reject(new Error('db blocked'));
    open.onsuccess = () => { const db = open.result, tx = db.transaction(['settings'], 'readwrite');
      const store = tx.objectStore('settings');
      store.put({ key: 'providerSettings', value: { provider: 'meta', customBaseUrl: '', roles: { planner: { provider: 'meta', modelId: 'fixture-planner' }, image: { provider: 'meta', modelId: 'fixture-image' }, critic: { provider: 'meta', modelId: 'fixture-critic' }, edit: { provider: 'meta', modelId: 'fixture-edit' } } } });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(new Error('seed transaction failed')); };
      tx.onabort = () => { db.close(); reject(new Error('seed transaction aborted')); }; };
  }));
  await page.reload();
  await page.locator('#api-key').fill('fixture-image-key');
  // Client-side navigation only from here, so the session key survives.
  await page.getByRole('link', { name: 'Campaigns', exact: true }).click();
  await page.getByRole('button', { name: 'Use sample product', exact: false }).click();
  await page.getByRole('button', { name: 'Create local sample concepts', exact: false }).click();
  const card = page.getByTestId('concept-card').first();
  await card.getByRole('button', { name: 'Approve concept', exact: false }).click();
  await card.getByRole('link', { name: 'Open design editor', exact: false }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make it your own.');
  await tab(page, 'Background');
  // The Meta background route is stubbed: no vision scenes exist here, so
  // this is exactly the path the live retest took (Meta background, no vision).
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.route('**/api/ai/background', (route) => route.fulfill({ body: pixel, contentType: 'image/png' }));
  // With a key, an approved concept and a product, consent is the only thing
  // blocking the reference button — the hint must say so.
  const hint = page.locator('.reference-block').getByText('Check the consent box above');
  await expect(hint).toBeVisible();
  await page.locator('[data-panel="generate"] .studio-consent input').check();
  await expect(hint).toHaveCount(0);
  await page.getByRole('button', { name: 'Generate with Meta', exact: true }).click();
  const review = page.getByTestId('background-review');
  await expect(review).toBeVisible({ timeout: 30000 });
  await expect(review).toContainText('Background review');
  await expect(review).toContainText('Integration polish applied automatically');
  // The integration polish must survive the debounced save, not just the render.
  await expect(page.getByTestId('studio-save')).toHaveText('Saved in this browser');
  const polish = await page.evaluate(() => new Promise<{ shadow: boolean; reflection: boolean } | null>((resolve) => {
    const open = indexedDB.open('admorph-local-v1');
    open.onerror = () => resolve(null);
    open.onsuccess = () => { const db = open.result; const tx = db.transaction('creatives'); const req = tx.objectStore('creatives').getAll(); req.onsuccess = () => { const rows = req.result as { polish?: { shadow: boolean; reflection: boolean } }[]; const hit = rows.find((row) => row.polish); resolve(hit ? hit.polish! : null); }; tx.oncomplete = () => db.close(); };
  }));
  expect(polish?.shadow).toBe(true);
  expect(polish?.reflection).toBe(false);
  expect(errors).toEqual([]);
});
