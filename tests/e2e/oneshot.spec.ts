import { test, expect } from '@playwright/test';

test('One-shot studio generates from the arranged mockup and shows the fidelity certificate', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Seed image + vision roles first (no paid call will happen: both Meta
  // routes are intercepted below).
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
      store.put({ key: 'metaExtraRoles', value: { vision: { provider: 'meta', modelId: 'fixture-vision' }, segment: { provider: 'meta', modelId: 'sam-3.1' } } });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(new Error('seed transaction failed')); };
      tx.onabort = () => { db.close(); reject(new Error('seed transaction aborted')); }; };
  }));
  await page.reload();
  await page.locator('#api-key').fill('fixture-image-key');
  // Client-side navigation only from here, so the session key survives.
  await page.getByRole('link', { name: 'One-shot', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('One-shot ad studio');

  // Upload the sample product; the SAM cutout is intercepted with a
  // full-opaque 300x330 mask (the sample's dimensions), so no Meta call runs.
  const mask = Buffer.alloc(300 * 330, 1);
  await page.route('**/api/ai/segment', async (route) => { await route.fulfill({ body: JSON.stringify({ masks: [{ objectId: 'product', left: 0, top: 0, right: 300, bottom: 330, width: 300, height: 330, rasterBase64: mask.toString('base64') }] }), contentType: 'application/json' }); });
  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await expect(page.getByTestId('oneshot-canvas')).toBeVisible();
  await expect(page.getByText('Cutout: Meta (SAM) cutout')).toBeVisible();
  await page.getByLabel('Brand name').fill('Sora');
  await page.getByLabel('Brand description').fill('A sample ceremonial matcha brand.');
  // The consent box only enables once the canvas is ready (cutout decoded,
  // brand filled, scene present, image model + key set) — so waiting on it
  // is also the readiness wait for Generate.
  const consentBox = page.getByLabel('I agree to send this mockup to Meta');
  await expect(consentBox).toBeEnabled({ timeout: 30000 });
  await consentBox.check();
  const generate = page.getByRole('button', { name: 'Generate finished ad', exact: true });
  await expect(generate).toBeEnabled({ timeout: 30000 });

  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  type CapturedBody = { layout?: { kind: string }[]; mockup?: unknown };
  const captured: { oneshot?: CapturedBody; verify?: CapturedBody } = {};
  await page.route('**/api/ai/oneshot', async (route) => { captured.oneshot = route.request().postDataJSON() as CapturedBody; await route.fulfill({ body: pixel, contentType: 'image/png' }); });
  await page.route('**/api/ai/verify-oneshot', async (route) => { captured.verify = route.request().postDataJSON() as CapturedBody; await route.fulfill({ body: JSON.stringify({ productKept: true, productNote: 'same can', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [] }), contentType: 'application/json' }); });

  await generate.click();
  await expect(page.getByTestId('oneshot-result')).toBeVisible({ timeout: 30000 });
  const certificate = page.getByTestId('oneshot-certificate');
  await expect(certificate).toBeVisible({ timeout: 30000 });
  await expect(certificate).toContainText('Score: 100');
  await expect(certificate).toContainText('Product kept');
  // The arranged mockup (not a hardcoded prompt) reached both Meta calls.
  expect(captured.oneshot?.mockup).toBeTruthy();
  expect(captured.oneshot?.layout?.some(item => item.kind === 'product')).toBe(true);
  expect(captured.verify?.layout?.some(item => item.kind === 'product')).toBe(true);
  expect(errors).toEqual([]);
});

test('One-shot enhance shows a success note and a before/after preview', async ({ page }) => {
  test.setTimeout(120_000);
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
      store.put({ key: 'metaExtraRoles', value: { vision: { provider: 'meta', modelId: 'fixture-vision' }, segment: { provider: 'meta', modelId: 'sam-3.1' } } });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(new Error('seed transaction failed')); };
      tx.onabort = () => { db.close(); reject(new Error('seed transaction aborted')); }; };
  }));
  await page.reload();
  await page.locator('#api-key').fill('fixture-image-key');
  await page.getByRole('link', { name: 'One-shot', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('One-shot ad studio');

  const mask = Buffer.alloc(300 * 330, 1);
  await page.route('**/api/ai/segment', async (route) => { await route.fulfill({ body: JSON.stringify({ masks: [{ objectId: 'product', left: 0, top: 0, right: 300, bottom: 330, width: 300, height: 330, rasterBase64: mask.toString('base64') }] }), contentType: 'application/json' }); });
  const { readFileSync } = await import('node:fs');
  const sample = readFileSync('public/demo/sora-product.png');
  await page.route('**/api/ai/product-makeover', async (route) => { await route.fulfill({ body: sample, contentType: 'image/png' }); });

  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await expect(page.getByTestId('oneshot-canvas')).toBeVisible();
  await page.getByLabel('Brand name').fill('Sora');
  await page.getByLabel('Brand description').fill('A sample ceremonial matcha brand.');
  const consentBox = page.getByLabel('I agree to send this mockup to Meta');
  await expect(consentBox).toBeEnabled({ timeout: 30000 });
  await consentBox.check();
  // The enhance checkbox only flips to checked after the async makeover +
  // re-cutout finish, so click (not check) and wait for the success note.
  await page.getByRole('checkbox', { name: /Improve product/ }).click();
  await expect(page.getByText('Product improved — compare it with the original below.')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('oneshot-enhance-compare')).toBeVisible();
  await expect(page.getByTestId('oneshot-enhance-compare').getByRole('img')).toHaveCount(2);
  expect(errors).toEqual([]);
});
