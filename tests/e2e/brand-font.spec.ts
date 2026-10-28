import { test, expect, type Page } from '@playwright/test';

async function seed(page: Page, brandId: string | null) {
  await page.goto('/settings');
  await expect(page.locator('#api-key')).toBeEnabled();
  await page.evaluate((id) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('admorph-local-v1');
    open.onerror = () => reject(new Error('db open failed'));
    open.onblocked = () => reject(new Error('db blocked'));
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction(['settings', 'brands'], 'readwrite');
      tx.objectStore('settings').put({ key: 'providerSettings', value: { provider: 'meta', customBaseUrl: '', roles: { planner: { provider: 'meta', modelId: 'fixture-planner' }, image: { provider: 'meta', modelId: 'fixture-image' }, critic: { provider: 'meta', modelId: 'fixture-critic' }, edit: { provider: 'meta', modelId: 'fixture-edit' } } } });
      if (id) tx.objectStore('brands').put({ id, name: 'TALJ Bold', description: 'Bold wordmark test brand.', colors: ['#16100C', '#F5EEDF', '#7ED3E0'], logoAssetId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), wordmarkStyle: 'Bold geometric sans', wordmarkBold: true });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(new Error('seed transaction failed')); };
      tx.onabort = () => { db.close(); reject(new Error('seed transaction aborted')); };
    };
  }), brandId);
  await page.reload();
  await page.locator('#api-key').fill('fixture-image-key');
}

test('a brand with a bold wordmark composes bold brand and headline layers', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const brandId = crypto.randomUUID();
  await seed(page, brandId);
  await page.getByRole('link', { name: 'Campaigns', exact: true }).click();
  await page.getByRole('button', { name: 'Use sample product', exact: false }).click();
  // The sample product resets the brand: pick the seeded brand after it.
  await page.locator('#campaign-brand').selectOption(brandId);
  await page.getByRole('button', { name: 'Create local sample concepts', exact: false }).click();
  const card = page.getByTestId('concept-card').first();
  await card.getByRole('button', { name: 'Approve concept', exact: false }).click();
  await card.getByRole('link', { name: 'Open design editor', exact: false }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make it your own.');
  await expect(page.getByTestId('studio-save')).toHaveText('Saved in this browser');
  const styles = await page.evaluate(() => new Promise<Record<string, string | undefined> | null>((resolve) => {
    const open = indexedDB.open('admorph-local-v1');
    open.onerror = () => resolve(null);
    open.onsuccess = () => { const db = open.result; const tx = db.transaction('creatives'); const req = tx.objectStore('creatives').getAll(); req.onsuccess = () => { const rows = req.result as { layers: { kind: string; fontStyle?: string }[] }[]; const layers = rows[0]?.layers ?? []; resolve({ brand: layers.find((item) => item.kind === 'brand')?.fontStyle, headline: layers.find((item) => item.kind === 'headline')?.fontStyle, cta: layers.find((item) => item.kind === 'cta')?.fontStyle }); }; tx.oncomplete = () => db.close(); };
  }));
  expect(styles?.brand).toBe('bold');
  expect(styles?.headline).toBe('bold');
  expect(styles?.cta).not.toBe('bold');
  expect(errors).toEqual([]);
});

test('the extraction demo shows the wordmark and fills the brand form', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/brands/new');
  await page.getByRole('button', { name: 'Try sample packaging locally', exact: false }).click();
  const suggestion = page.getByTestId('brand-suggestion');
  await expect(suggestion).toBeVisible();
  await expect(suggestion).toContainText(/Wordmark font: Calm rounded sans/);
  // Before accepting, the wordmark line exists only in the suggestion.
  await expect(page.getByText(/Wordmark font: Calm rounded sans/)).toHaveCount(1);
  await suggestion.getByRole('button', { name: 'Use editable suggestion', exact: true }).click();
  await expect(page.locator('#brand-name')).toHaveValue('Sora');
  // After accepting, the same line also appears on the brand form itself.
  await expect(page.getByText(/Wordmark font: Calm rounded sans/)).toHaveCount(2);
  expect(errors).toEqual([]);
});
