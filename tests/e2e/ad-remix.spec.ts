import { test, expect } from '@playwright/test';

// Remix pages: pick a saved ad from the gallery and make new versions of
// it — variants with new angles, or themed copies. All Meta calls are
// intercepted, so no paid call runs.

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const concepts = [
  { angle: 'offer', title: 'Fresh deal', audienceAngle: 'Daily drinkers', headline: 'Fresh taste daily', caption: 'Fresh every day.', visualDirection: 'Bright morning kitchen light' },
  { angle: 'benefit', title: 'Bold nights', audienceAngle: 'Night owls', headline: 'Bold flavor night', caption: 'Bold all night.', visualDirection: 'Moody evening cafe light' },
  { angle: 'lifestyle', title: 'Easy days', audienceAngle: 'Busy people', headline: 'Light and easy', caption: 'Easy every day.', visualDirection: 'Airy daylight studio' },
];

async function seedGallery(page: import('@playwright/test').Page) {
  await page.goto('/settings');
  await expect(page.locator('#api-key')).toBeEnabled();
  await page.evaluate(async () => {
    const blob = await (await fetch('/demo/sora-product.png')).blob();
    const now = new Date().toISOString();
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('admorph-local-v1');
      open.onerror = () => reject(new Error('db open failed'));
      open.onblocked = () => reject(new Error('db blocked'));
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction(['settings', 'savedAds'], 'readwrite');
        tx.objectStore('settings').put({ key: 'providerSettings', value: { provider: 'meta', customBaseUrl: '', roles: { planner: { provider: 'meta', modelId: 'fixture-planner' }, image: { provider: 'meta', modelId: 'fixture-image' }, critic: { provider: 'meta', modelId: 'fixture-critic' }, edit: { provider: 'meta', modelId: 'fixture-edit' } } } });
        tx.objectStore('settings').put({ key: 'metaExtraRoles', value: { vision: { provider: 'meta', modelId: 'fixture-vision' }, segment: { provider: 'meta', modelId: 'sam-3.1' } } });
        tx.objectStore('savedAds').put({ id: crypto.randomUUID(), blob, source: 'oneshot', brand: { name: 'Seed Brand', description: 'Seeded for remix.', colors: ['#111111', '#eeeeee', '#336699'] }, headline: 'Seed headline', hasLogo: true, createdAt: now });
        tx.objectStore('savedAds').put({ id: crypto.randomUUID(), blob, source: 'oneshot', brand: { name: 'Seed Brand', description: 'Seeded for remix.', colors: ['#111111', '#eeeeee', '#336699'] }, headline: 'Second seed', hasLogo: true, createdAt: now });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(new Error('seed failed')); };
        tx.onabort = () => { db.close(); reject(new Error('seed aborted')); };
      };
    });
  });
  await page.reload();
  await page.locator('#api-key').fill('fixture-image-key');
}

async function interceptRemix(page: import('@playwright/test').Page) {
  await page.route('**/api/ai/plan', async (route) => { await route.fulfill({ body: JSON.stringify({ concepts }), contentType: 'application/json' }); });
  await page.route('**/api/ai/ad-remix', async (route) => { await route.fulfill({ body: pixel, contentType: 'image/png' }); });
  await page.route('**/api/ai/verify-oneshot', async (route) => { await route.fulfill({ body: JSON.stringify({ productKept: true, productNote: 'same', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [{ id: 'headline', expected: 'x', found: 'x', match: true }] }), contentType: 'application/json' }); });
}

test('variants page makes 2 new versions of a saved ad', async ({ page }) => {
  test.setTimeout(120_000);
  await seedGallery(page);
  await page.getByRole('link', { name: 'Variants', exact: true }).click();
  await interceptRemix(page);
  await expect(page.locator('[data-testid="remix-source-card"]')).toHaveCount(2);
  await page.locator('[data-testid="remix-source-card"]').first().locator('button').first().click();
  await page.getByRole('button', { name: 'Generate variants', exact: true }).click();
  await expect(page.locator('[data-testid="remix-result"]')).toHaveCount(2, { timeout: 60000 });
  await expect(page.locator('[data-testid="remix-result"]').first().locator('img')).toHaveClass(/media-reveal/);
  await expect(page.getByText('Certificate score: 100').first()).toBeVisible();
  await expect(page.locator('[data-testid="remix-source-card"]')).toHaveCount(4);
});

test('variants page fits an oversized saved ad before sending it', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings');
  await expect(page.locator('#api-key')).toBeEnabled();
  const oversizedBytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(1080, 1350);
    let seed = 123456789;
    for (let i = 0; i < image.data.length; i += 4) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      image.data[i] = seed % 256; image.data[i + 1] = (seed >> 8) % 256; image.data[i + 2] = (seed >> 16) % 256; image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), 'image/png'));
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('admorph-local-v1');
      open.onerror = () => reject(new Error('db open failed'));
      open.onblocked = () => reject(new Error('db blocked'));
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction(['settings', 'savedAds'], 'readwrite');
        tx.objectStore('settings').put({ key: 'providerSettings', value: { provider: 'meta', customBaseUrl: '', roles: { planner: { provider: 'meta', modelId: 'fixture-planner' }, image: { provider: 'meta', modelId: 'fixture-image' }, critic: { provider: 'meta', modelId: 'fixture-critic' }, edit: { provider: 'meta', modelId: 'fixture-edit' } } } });
        tx.objectStore('settings').put({ key: 'metaExtraRoles', value: { vision: { provider: 'meta', modelId: 'fixture-vision' }, segment: { provider: 'meta', modelId: 'sam-3.1' } } });
        tx.objectStore('savedAds').put({ id: crypto.randomUUID(), blob, source: 'oneshot', brand: { name: 'Seed Brand', description: 'Seeded for remix.', colors: ['#111111', '#eeeeee', '#336699'] }, headline: 'Seed headline', hasLogo: true, createdAt: new Date().toISOString() });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(new Error('seed failed')); };
        tx.onabort = () => { db.close(); reject(new Error('seed aborted')); };
      };
    });
    return blob.size;
  });
  expect(oversizedBytes).toBeGreaterThan(2 * 1024 * 1024);
  await page.reload();
  await page.locator('#api-key').fill('fixture-image-key');
  await page.getByRole('link', { name: 'Variants', exact: true }).click();
  let planBytes = 0;
  await page.route('**/api/ai/plan', async (route) => { planBytes = JSON.stringify(route.request().postDataJSON()).length; await route.fulfill({ body: JSON.stringify({ concepts }), contentType: 'application/json' }); });
  await page.route('**/api/ai/ad-remix', async (route) => { await route.fulfill({ body: pixel, contentType: 'image/png' }); });
  await page.route('**/api/ai/verify-oneshot', async (route) => { await route.fulfill({ body: JSON.stringify({ productKept: true, productNote: 'same', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [{ id: 'headline', expected: 'x', found: 'x', match: true }] }), contentType: 'application/json' }); });
  await expect(page.locator('[data-testid="remix-source-card"]')).toHaveCount(1);
  await page.locator('[data-testid="remix-source-card"]').first().locator('button').first().click();
  await page.getByRole('button', { name: 'Generate variants', exact: true }).click();
  await expect(page.locator('[data-testid="remix-result"]')).toHaveCount(2, { timeout: 60000 });
  expect(planBytes).toBeGreaterThan(0);
  expect(planBytes).toBeLessThan(3 * 1024 * 1024);
});

test('themes page makes a Ramadan and an Eid copy of a saved ad', async ({ page }) => {
  test.setTimeout(120_000);
  await seedGallery(page);
  await page.getByRole('link', { name: 'Themes', exact: true }).click();
  await interceptRemix(page);
  await expect(page.locator('[data-testid="remix-source-card"]')).toHaveCount(2);
  await page.locator('[data-testid="remix-source-card"]').first().locator('button').first().click();
  await page.getByRole('button', { name: 'Eid', exact: true }).click();
  await page.getByRole('button', { name: 'Generate themed copies', exact: true }).click();
  await expect(page.locator('[data-testid="remix-result"]')).toHaveCount(2, { timeout: 60000 });
  await expect(page.getByText('Certificate score: 100').first()).toBeVisible();
});

test('waiting indicator shows a live seconds counter while generating', async ({ page }) => {
  test.setTimeout(120_000);
  await seedGallery(page);
  await page.getByRole('link', { name: 'Variants', exact: true }).click();
  await page.route('**/api/ai/plan', async (route) => { await route.fulfill({ body: JSON.stringify({ concepts }), contentType: 'application/json' }); });
  await page.route('**/api/ai/ad-remix', async (route) => { await new Promise((resolve) => setTimeout(resolve, 3000)); await route.fulfill({ body: pixel, contentType: 'image/png' }); });
  await page.route('**/api/ai/verify-oneshot', async (route) => { await route.fulfill({ body: JSON.stringify({ productKept: true, productNote: 'same', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [{ id: 'headline', expected: 'x', found: 'x', match: true }] }), contentType: 'application/json' }); });
  await expect(page.locator('[data-testid="remix-source-card"]')).toHaveCount(2);
  await page.locator('[data-testid="remix-source-card"]').first().locator('button').first().click();
  await page.getByRole('button', { name: 'Generate variants', exact: true }).click();
  const indicator = page.locator('[data-testid="waiting-indicator"]');
  await expect(indicator).toBeVisible({ timeout: 60000 });
  const first = await indicator.textContent();
  await page.waitForTimeout(1300);
  const second = await indicator.textContent();
  expect(first).toMatch(/\d/);
  expect(second).not.toBe(first);
  await expect(page.locator('[data-testid="remix-result"]')).toHaveCount(2, { timeout: 60000 });
});
