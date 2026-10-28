import { test, expect, type Page } from '@playwright/test';

test('manual shadow direction and strength persist on the creative polish', async ({ page }) => {
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
  await page.locator('#api-key').fill('fixture-controls-key');
  await page.getByRole('link', { name: 'Campaigns', exact: true }).click();
  await page.getByRole('button', { name: 'Use sample product', exact: false }).click();
  await page.getByRole('button', { name: 'Create local sample concepts', exact: false }).click();
  const card = page.getByTestId('concept-card').first();
  await card.getByRole('button', { name: 'Approve concept', exact: false }).click();
  await card.getByRole('link', { name: 'Open design editor', exact: false }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make it your own.');
  await page.locator('.studio-tools > summary').click();
  await page.getByLabel('Light direction (shadow)').selectOption('left');
  await page.getByLabel('Shadow strength').fill('1.3');
  await expect(page.getByTestId('studio-save')).toHaveText('Saved in this browser');
  const polish = await page.evaluate(() => new Promise<{ shadowDirection?: string; shadowIntensity?: number } | null>((resolve) => {
    const open = indexedDB.open('admorph-local-v1');
    open.onerror = () => resolve(null);
    open.onsuccess = () => { const db = open.result; const tx = db.transaction('creatives'); const req = tx.objectStore('creatives').getAll(); req.onsuccess = () => { const rows = req.result as { polish?: { shadowDirection?: string; shadowIntensity?: number } }[]; const hit = rows.find((row) => row.polish); resolve(hit ? hit.polish! : null); }; tx.oncomplete = () => db.close(); };
  }));
  expect(polish?.shadowDirection).toBe('left');
  expect(polish?.shadowIntensity).toBe(1.3);
  expect(errors).toEqual([]);
});
