import { test, expect } from '@playwright/test';
import { wizardStep } from './wizard';

// Brand fixes: a saved brand whose logo asset is missing must not keep the
// previous brand's logo on screen, and deleting a brand must not depend on
// a native confirm dialog (automated browsers dismiss those silently,
// which made Delete look dead).

test('brand with a missing logo clears the previous logo and warns', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/settings');
  await expect(page.locator('#api-key')).toBeEnabled();
  await page.evaluate(async () => {
    const blob = await (await fetch('/demo/sora-product.png')).blob();
    const brandA = crypto.randomUUID();
    const brandB = crypto.randomUUID();
    const assetA = crypto.randomUUID();
    const missingAsset = crypto.randomUUID();
    const now = new Date().toISOString();
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('admorph-local-v1');
      open.onerror = () => reject(new Error('db open failed'));
      open.onblocked = () => reject(new Error('db blocked'));
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction(['settings', 'assets', 'brands'], 'readwrite');
        tx.objectStore('settings').put({ key: 'providerSettings', value: { provider: 'meta', customBaseUrl: '', roles: { planner: { provider: 'meta', modelId: 'fixture-planner' }, image: { provider: 'meta', modelId: 'fixture-image' }, critic: { provider: 'meta', modelId: 'fixture-critic' }, edit: { provider: 'meta', modelId: 'fixture-edit' } } } });
        tx.objectStore('settings').put({ key: 'metaExtraRoles', value: { vision: { provider: 'meta', modelId: 'fixture-vision' }, segment: { provider: 'meta', modelId: 'sam-3.1' } } });
        tx.objectStore('assets').put({ id: assetA, kind: 'logo', blob, createdAt: now });
        tx.objectStore('brands').put({ id: brandA, name: 'Brand A', description: 'First kit brand.', colors: ['#111111', '#eeeeee', '#336699'], logoAssetId: assetA, createdAt: now, updatedAt: now });
        tx.objectStore('brands').put({ id: brandB, name: 'Brand B', description: 'Logo asset is gone.', colors: ['#222222', '#dddddd', '#4477aa'], logoAssetId: missingAsset, createdAt: now, updatedAt: now });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(new Error('seed failed')); };
        tx.onabort = () => { db.close(); reject(new Error('seed aborted')); };
      };
    });
    return { brandA, brandB };
  });
  await page.reload();
  await page.locator('#api-key').fill('fixture-image-key');
  await page.getByRole('link', { name: 'Create', exact: true }).click();
  await page.route('**/api/ai/product-box', async (route) => { await route.fulfill({ body: JSON.stringify({ left: 0, top: 0, right: 1, bottom: 1 }), contentType: 'application/json' }); });
  const mask = Buffer.alloc(300 * 330, 1);
  await page.route('**/api/ai/segment', async (route) => { await route.fulfill({ body: JSON.stringify({ masks: [{ objectId: 'product', left: 0, top: 0, right: 300, bottom: 330, width: 300, height: 330, rasterBase64: mask.toString('base64') }] }), contentType: 'application/json' }); });
  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByTestId('upload-card-product')).toHaveClass(/done/);
  await wizardStep(page, 'Brand');
  await page.getByRole('button', { name: 'Brand A', exact: true }).click();
  await expect(page.getByTestId('upload-card-logo').locator('img.upload-preview')).toBeVisible();
  await page.getByRole('button', { name: 'Brand B', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Brand B', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('upload-card-logo').locator('img.upload-preview')).toHaveCount(0);
  await expect(page.getByText("This brand's saved logo could not be loaded, so no logo is shown.")).toBeVisible();
  expect(errors).toEqual([]);
});

test('deleting a brand asks in-page and removes the card', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings');
  await expect(page.locator('#api-key')).toBeEnabled();
  await page.evaluate(async () => {
    const blob = await (await fetch('/demo/sora-product.png')).blob();
    const brandId = crypto.randomUUID();
    const assetId = crypto.randomUUID();
    const now = new Date().toISOString();
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('admorph-local-v1');
      open.onerror = () => reject(new Error('db open failed'));
      open.onblocked = () => reject(new Error('db blocked'));
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction(['assets', 'brands'], 'readwrite');
        tx.objectStore('assets').put({ id: assetId, kind: 'logo', blob, createdAt: now });
        tx.objectStore('brands').put({ id: brandId, name: 'Delete Me', description: 'Seeded for the delete test.', colors: ['#111111', '#eeeeee', '#336699'], logoAssetId: assetId, createdAt: now, updatedAt: now });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(new Error('seed failed')); };
        tx.onabort = () => { db.close(); reject(new Error('seed aborted')); };
      };
    });
  });
  await page.goto('/brands');
  const card = page.locator('[data-testid="brand-card"]', { hasText: 'Delete Me' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Confirm delete', exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Confirm delete', exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByText('Brand Kit deleted.')).toBeVisible();
});
