import { test, expect, type Page } from '@playwright/test';

async function tab(page: Page, name: string) {
  const button = page.getByRole('tab', { name, exact: true });
  if (await button.isVisible()) await button.click();
}

test('new compositions lock the CTA to the brand palette and the review agrees', async ({ page }) => {
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
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(new Error('seed transaction failed')); };
      tx.onabort = () => { db.close(); reject(new Error('seed transaction aborted')); }; };
  }));
  await page.reload();
  await page.locator('#api-key').fill('fixture-image-key');
  await page.getByRole('link', { name: 'Campaigns', exact: true }).click();
  await page.getByRole('button', { name: 'Use sample product', exact: false }).click();
  await page.getByRole('button', { name: 'Create local sample concepts', exact: false }).click();
  const card = page.getByTestId('concept-card').first();
  await card.getByRole('button', { name: 'Approve concept', exact: false }).click();
  await card.getByRole('link', { name: 'Open design editor', exact: false }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make it your own.');
  // The sample brand is Sora: the CTA must wear its darkest color with its
  // lightest text, not the old hardcoded dark green.
  await expect(page.getByTestId('studio-save')).toHaveText('Saved in this browser');
  const cta = await page.evaluate(() => new Promise<{ fill: string; color: string } | null>((resolve) => {
    const open = indexedDB.open('admorph-local-v1');
    open.onerror = () => resolve(null);
    open.onsuccess = () => { const db = open.result; const tx = db.transaction('creatives'); const req = tx.objectStore('creatives').getAll(); req.onsuccess = () => { const rows = req.result as { layers: { kind: string; fill: string; color: string }[] }[]; const creative = rows[0]; const layer = creative?.layers.find((item) => item.kind === 'cta'); resolve(layer ? { fill: layer.fill, color: layer.color } : null); }; tx.oncomplete = () => db.close(); };
  }));
  expect(cta).toEqual({ fill: '#52633c', color: '#dce5bb' });
  await tab(page, 'Review');
  const brandCheck = page.locator('.critic-checks li', { hasText: 'Brand' });
  await expect(brandCheck).toBeVisible();
  await expect(brandCheck.locator('strong')).toHaveAttribute('data-status', 'pass');
  expect(errors).toEqual([]);
});
