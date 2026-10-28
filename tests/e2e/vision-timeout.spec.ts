import { test, expect, type Page } from '@playwright/test';

async function tab(page: Page, name: string) {
  const button = page.getByRole('tab', { name, exact: true });
  if (await button.isVisible()) await button.click();
}

test('failed vision analysis surfaces an inline error and re-enables the button', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Seed a vision role first (no paid call will happen: the request is intercepted).
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
      // The studio consent checkbox and the analyze button also need a saved
      // image role (imageReady) plus the session key; the vision extra role
      // alone leaves them disabled.
      store.put({ key: 'providerSettings', value: { provider: 'meta', customBaseUrl: '', roles: { planner: { provider: 'meta', modelId: 'fixture-planner' }, image: { provider: 'meta', modelId: 'fixture-image' }, critic: { provider: 'meta', modelId: 'fixture-critic' }, edit: { provider: 'meta', modelId: 'fixture-edit' } } } });
      store.put({ key: 'metaExtraRoles', value: { vision: { provider: 'meta', modelId: 'fixture-vision' } } });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(new Error('seed transaction failed')); };
      tx.onabort = () => { db.close(); reject(new Error('seed transaction aborted')); }; };
  }));
  await page.reload();
  await page.locator('#api-key').fill('fixture-vision-key');
  // Client-side navigation only from here, so the session key survives.
  await page.getByRole('link', { name: 'Campaigns', exact: true }).click();
  await page.getByRole('button', { name: 'Use sample product', exact: false }).click();
  await page.getByRole('button', { name: 'Create local sample concepts', exact: false }).click();
  const card = page.getByTestId('concept-card').first();
  await card.getByRole('button', { name: 'Approve concept', exact: false }).click();
  await card.getByRole('link', { name: 'Open design editor', exact: false }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make it your own.');
  await tab(page, 'Background');
  await page.locator('[data-panel="generate"] .studio-consent input').check();
  await page.route('**/api/ai/vision-background', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'upstream' } }) }));
  await page.getByRole('button', { name: 'Analyze product with vision', exact: true }).click();
  await expect(page.locator('.vision-first .request-error')).toHaveText('The provider request failed. Check the provider status and account, then retry.');
  await expect(page.getByRole('button', { name: 'Analyze product with vision', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});
