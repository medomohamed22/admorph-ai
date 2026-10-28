import { test, expect, type Page } from '@playwright/test';

async function tab(page: Page, name: string) {
  const button = page.getByRole('tab', { name, exact: true });
  if (await button.isVisible()) await button.click();
}

test('vision scene ideas render as compact cards and the request carries the site language', async ({ page }) => {
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
  let sentLanguage: unknown;
  await page.route('**/api/ai/vision-background', async (route) => {
    sentLanguage = (route.request().postDataJSON() as { language?: string }).language;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      productCategory: 'cold brew can', material: 'matte aluminum', mood: 'fresh, icy', lighting: 'bright daylight', productScale: 'large-center',
      sceneIdeas: [
        { scene: 'مشهد استوديو ثلجي بسيط', setting: 'خلفية ثلج', reason: 'يبرز برودة المشروب بدون زحمة' },
        { scene: 'طاولة مقهى هادية', setting: 'مقهى', reason: 'لحظة انتعاش يومية' },
        { scene: 'حافة خرسانية وقت الفجر', setting: 'سطح حضري', reason: 'تباين واضح مع الكان الغامق' },
      ],
    }) });
  });
  await page.getByRole('button', { name: 'Analyze product with vision', exact: true }).click();
  const cards = page.locator('.vision-scenes .scene-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toContainText('مشهد استوديو ثلجي بسيط');
  await expect(cards.first()).toContainText('يبرز برودة المشروب بدون زحمة');
  await expect(cards.first()).toHaveClass(/selected/);
  expect(sentLanguage).toBe('en');
  expect(errors).toEqual([]);
});
