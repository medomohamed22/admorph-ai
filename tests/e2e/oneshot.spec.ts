import { test, expect } from '@playwright/test';

// Geometric cutout: isolate first asks vision for a product box. Tests
// that do not override this get a full-frame box, so their segment
// fixtures still cut exactly as before.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/ai/product-box', async (route) => { await route.fulfill({ body: JSON.stringify({ left: 0, top: 0, right: 1, bottom: 1 }), contentType: 'application/json' }); });
});

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
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByTestId('oneshot-canvas')).toBeVisible();
  await expect(page.getByText('Cutout: Meta (SAM) cutout')).toBeVisible();
  await page.getByText('Edit brand details', { exact: true }).click();
  await page.getByLabel('Brand name').fill('Sora');
  await page.getByLabel('Brand description').fill('A sample ceremonial matcha brand.');
  // Generate enables once the canvas is ready (cutout decoded, brand
  // filled, scene present, image model + key set).
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
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByTestId('oneshot-canvas')).toBeVisible();
  await page.getByText('Edit brand details', { exact: true }).click();
  await page.getByLabel('Brand name').fill('Sora');
  await page.getByLabel('Brand description').fill('A sample ceremonial matcha brand.');
  // The enhance checkbox only flips to checked after the async makeover +
  // re-cutout finish, so click (not check) and wait for the success note.
  await page.getByRole('checkbox', { name: /Improve product/ }).click();
  await expect(page.getByText('Product improved — compare it with the original below.')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('oneshot-enhance-compare')).toBeVisible();
  await expect(page.getByTestId('oneshot-enhance-compare').getByRole('img')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('One-shot SAM failure shows the precise no-mask diagnosis, not a generic error', async ({ page }) => {
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

  // SAM answers but with zero masks: the page must show the precise
  // no-mask diagnosis instead of a generic provider error.
  await page.route('**/api/ai/segment', async (route) => { await route.fulfill({ body: JSON.stringify({ masks: [] }), contentType: 'application/json' }); });
  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByText('SAM returned text but no usable mask for this photo.')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('oneshot-canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('brand picker fills identity and logo from a saved brand kit', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.locator('#api-key')).toBeEnabled();
  const brandId = await page.evaluate(async () => {
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
        tx.objectStore('brands').put({ id: brandId, name: 'Picker Brand', description: 'Picked from the kit.', colors: ['#111111', '#eeeeee', '#336699'], logoAssetId: assetId, createdAt: now, updatedAt: now });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(new Error('seed failed')); };
        tx.onabort = () => { db.close(); reject(new Error('seed aborted')); };
      };
    });
    return brandId;
  });
  await page.goto('/oneshot');
  await page.getByLabel('Choose your brand').selectOption(brandId);
  await page.getByText('Edit brand details', { exact: true }).click();
  await expect(page.getByLabel('Brand name')).toHaveValue('Picker Brand');
  await expect(page.getByLabel('Brand description')).toHaveValue('Picked from the kit.');
  await expect(page.getByLabel('color-1')).toHaveValue('#111111');
  await expect(page.getByLabel('color-2')).toHaveValue('#eeeeee');
  await expect(page.getByLabel('color-3')).toHaveValue('#336699');
  await expect(page.getByTestId('upload-card-logo').locator('img')).toBeVisible();
});

test('ideas generate from the product photo and brand with no written brief', async ({ page }) => {
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
      tx.onabort = () => { db.close(); reject(new Error('seed aborted')); }; };
  }));
  await page.reload();
  await page.locator('#api-key').fill('fixture-image-key');
  await page.getByRole('link', { name: 'One-shot', exact: true }).click();
  const mask = Buffer.alloc(300 * 330, 1);
  await page.route('**/api/ai/segment', async (route) => { await route.fulfill({ body: JSON.stringify({ masks: [{ objectId: 'product', left: 0, top: 0, right: 300, bottom: 330, width: 300, height: 330, rasterBase64: mask.toString('base64') }] }), contentType: 'application/json' }); });
  let planBody: Record<string, unknown> | null = null;
  await page.route('**/api/ai/plan', async (route) => {
    planBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ body: JSON.stringify({ concepts: [
      { angle: 'offer', title: 'Cold Offer', audienceAngle: 'thirsty youth', headline: 'Ice Cold One', caption: 'First caption', visualDirection: 'Icy scene one' },
      { angle: 'benefit', title: 'Fresh Benefit', audienceAngle: 'busy workers', headline: 'Fresh All Day', caption: 'Second caption', visualDirection: 'Icy scene two' },
      { angle: 'lifestyle', title: 'Chill Lifestyle', audienceAngle: 'friends out', headline: 'Chill With Friends', caption: 'Third caption', visualDirection: 'Icy scene three' },
    ] }), contentType: 'application/json' });
  });
  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByTestId('oneshot-canvas')).toBeVisible();
  await page.getByText('Edit brand details', { exact: true }).click();
  await page.getByLabel('Brand name').fill('Sora');
  await page.getByLabel('Brand description').fill('A sample ceremonial matcha brand.');
  await expect(page.getByLabel('Extra direction (optional)')).toHaveValue('');
  await page.getByRole('button', { name: 'Suggest 3 ad ideas', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cold Offer — Ice Cold One', exact: true })).toBeVisible();
  await expect(planBody).toMatchObject({ brief: '' });
  expect(planBody).toHaveProperty('product');
  await expect(page.getByLabel('Background scene')).toHaveValue('Icy scene one');
});

test('stepper tracks progress and the canvas blurs while generating', async ({ page }) => {
  test.setTimeout(120_000);
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
      tx.onabort = () => { db.close(); reject(new Error('seed aborted')); }; };
  }));
  await page.reload();
  await page.locator('#api-key').fill('fixture-image-key');
  await page.getByRole('link', { name: 'One-shot', exact: true }).click();
  const steps = page.locator('.oneshot-stepper li');
  await expect(steps).toHaveCount(5);
  await expect(steps.first()).toHaveClass(/current/);
  await expect(steps.first()).toContainText('Product');
  // The result frame is visible from the start, above the generate button.
  const frame = page.getByTestId('oneshot-result-frame');
  await expect(frame).toBeVisible();
  await expect(frame).toContainText('Your finished ad will appear here.');
  const framePrecedesGenerate = await page.evaluate(() => {
    const frameEl = document.querySelector('[data-testid="oneshot-result-frame"]');
    const button = document.querySelector('.generate-main');
    return !!frameEl && !!button && Boolean(frameEl.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(framePrecedesGenerate).toBe(true);
  const mask = Buffer.alloc(300 * 330, 1);
  await page.route('**/api/ai/segment', async (route) => { await route.fulfill({ body: JSON.stringify({ masks: [{ objectId: 'product', left: 0, top: 0, right: 300, bottom: 330, width: 300, height: 330, rasterBase64: mask.toString('base64') }] }), contentType: 'application/json' }); });
  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByTestId('oneshot-canvas')).toBeVisible();
  await expect(steps.first()).toHaveClass(/done/);
  await page.getByText('Edit brand details', { exact: true }).click();
  await page.getByLabel('Brand name').fill('Sora');
  await page.getByLabel('Brand description').fill('A sample ceremonial matcha brand.');
  // The sticky bar carries the same generate button for small screens; the
  // in-flow button is hidden there, so exactly one is ever visible.
  await expect(page.locator('.sticky-generate button')).toHaveCount(1);
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.route('**/api/ai/oneshot', async (route) => { await new Promise(resolve => setTimeout(resolve, 1500)); await route.fulfill({ body: pixel, contentType: 'image/png' }); });
  await page.route('**/api/ai/verify-oneshot', async (route) => { await route.fulfill({ body: JSON.stringify({ productKept: true, productNote: 'same can', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [] }), contentType: 'application/json' }); });
  await page.getByRole('button', { name: 'Generate finished ad', exact: true }).click();
  await expect(page.getByTestId('oneshot-generating')).toBeVisible();
  await expect(page.getByTestId('oneshot-generating')).toContainText('Painting your finished ad…');
  // The blur lives in the result frame now, not on the canvas.
  await expect(frame.getByTestId('oneshot-generating')).toBeVisible();
  // The generating overlay must never widen the page: on a phone the
  // shimmer sliding outside the canvas used to spill across the screen.
  // Sample a full shimmer cycle (1.6s) — a single instant can miss it.
  const maxHorizontalOverflow = await page.evaluate(async () => {
    let max = 0;
    const started = Date.now();
    while (Date.now() - started < 2000) {
      max = Math.max(max, document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return max;
  });
  expect(maxHorizontalOverflow).toBeLessThanOrEqual(1);
  const result = page.getByTestId('oneshot-result');
  await expect(result).toBeVisible({ timeout: 30000 });
  await expect(result).toHaveClass(/oneshot-reveal/);
  // The finished image lands inside the same frame that blurred.
  await expect(frame.getByTestId('oneshot-result')).toBeVisible();
  await expect(page.getByTestId('oneshot-certificate')).toBeVisible({ timeout: 30000 });
  await expect(steps.nth(4)).toHaveClass(/done/);
});

test('brand extraction applies its font to the headline', async ({ page }) => {
  test.setTimeout(120_000);
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
      tx.onabort = () => { db.close(); reject(new Error('seed aborted')); }; };
  }));
  await page.reload();
  await page.locator('#api-key').fill('fixture-image-key');
  await page.getByRole('link', { name: 'One-shot', exact: true }).click();
  const mask = Buffer.alloc(300 * 330, 1);
  await page.route('**/api/ai/segment', async (route) => { await route.fulfill({ body: JSON.stringify({ masks: [{ objectId: 'product', left: 0, top: 0, right: 300, bottom: 330, width: 300, height: 330, rasterBase64: mask.toString('base64') }] }), contentType: 'application/json' }); });
  await page.route('**/api/ai/brand-extract', async (route) => { await route.fulfill({ body: JSON.stringify({ suggestedName: 'Sora', primaryHex: '#52633c', secondaryHex: '#dce5bb', accentHex: '#f2d1bc', brandTone: 'calm', shortDescriptionEn: 'A sample matcha brand.', shortDescriptionAr: 'براند ماتشا تجريبي.', recommendedFontEn: 'Inter', recommendedFontAr: 'Cairo', rationale: 'Fixture.', fontFamily: 'Montserrat' }), contentType: 'application/json' }); });
  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByTestId('oneshot-canvas')).toBeVisible();
  await page.getByText('Edit brand details', { exact: true }).click();
  await page.getByLabel('Brand name').fill('Sora');
  await page.getByLabel('Brand description').fill('A sample ceremonial matcha brand.');
  await page.getByRole('button', { name: 'Extract brand from photo', exact: true }).click();
  await expect(page.getByText('Headline font: Montserrat')).toBeVisible({ timeout: 30000 });
});

test('canvas controls resize and nudge the selected element', async ({ page }) => {
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
      tx.onabort = () => { db.close(); reject(new Error('seed aborted')); }; };
  }));
  await page.reload();
  await page.locator('#api-key').fill('fixture-image-key');
  await page.getByRole('link', { name: 'One-shot', exact: true }).click();
  const mask = Buffer.alloc(300 * 330, 1);
  await page.route('**/api/ai/segment', async (route) => { await route.fulfill({ body: JSON.stringify({ masks: [{ objectId: 'product', left: 0, top: 0, right: 300, bottom: 330, width: 300, height: 330, rasterBase64: mask.toString('base64') }] }), contentType: 'application/json' }); });
  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByTestId('oneshot-canvas')).toBeVisible();
  await page.getByText('Edit brand details', { exact: true }).click();
  await page.getByLabel('Brand name').fill('Sora');
  await page.getByLabel('Brand description').fill('A sample ceremonial matcha brand.');
  // An added text line becomes the selected element, so the move/resize
  // buttons appear for it. It starts at 800x120 at (140, 500).
  await page.getByLabel('Your headline').fill('Hello');
  await page.getByRole('button', { name: 'Add text', exact: true }).click();
  await page.getByRole('button', { name: 'Enlarge', exact: true }).click();
  await page.getByRole('button', { name: 'Move left', exact: true }).click();
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  type LayoutItem = { id: string; kind: string; x: number; y: number; width: number; height: number; text?: string };
  const captured: { layout?: LayoutItem[] } = {};
  await page.route('**/api/ai/oneshot', async (route) => { captured.layout = (route.request().postDataJSON() as { layout: LayoutItem[] }).layout; await route.fulfill({ body: pixel, contentType: 'image/png' }); });
  await page.route('**/api/ai/verify-oneshot', async (route) => { await route.fulfill({ body: JSON.stringify({ productKept: true, productNote: 'same', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [] }), contentType: 'application/json' }); });
  await page.getByRole('button', { name: 'Generate finished ad', exact: true }).click();
  await expect(page.getByTestId('oneshot-result')).toBeVisible({ timeout: 30000 });
  // Enlarge x1.2 around the center, then one 10px nudge left.
  const text = captured.layout?.find(item => item.text === 'Hello');
  expect(text?.width).toBe(960);
  expect(text?.height).toBe(144);
  expect(text?.x).toBe(50);
  expect(text?.y).toBe(488);
  expect(errors).toEqual([]);
});

test('canvas undo and redo restore the selected text', async ({ page }) => {
  test.setTimeout(120_000);
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
      tx.onabort = () => { db.close(); reject(new Error('seed aborted')); }; };
  }));
  await page.reload();
  await page.locator('#api-key').fill('fixture-image-key');
  await page.getByRole('link', { name: 'One-shot', exact: true }).click();
  const mask = Buffer.alloc(300 * 330, 1);
  await page.route('**/api/ai/segment', async (route) => { await route.fulfill({ body: JSON.stringify({ masks: [{ objectId: 'product', left: 0, top: 0, right: 300, bottom: 330, width: 300, height: 330, rasterBase64: mask.toString('base64') }] }), contentType: 'application/json' }); });
  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByTestId('oneshot-canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await page.getByLabel('Your headline').fill('Hello');
  await page.getByRole('button', { name: 'Add text', exact: true }).click();
  await expect(page.getByLabel('Selected text')).toHaveValue('Hello');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Selected text')).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByLabel('Selected text')).toHaveValue('Hello');
});

test('mockup check flags text overlapping the product', async ({ page }) => {
  test.setTimeout(120_000);
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
      tx.onabort = () => { db.close(); reject(new Error('seed aborted')); }; };
  }));
  await page.reload();
  await page.locator('#api-key').fill('fixture-image-key');
  await page.getByRole('link', { name: 'One-shot', exact: true }).click();
  const mask = Buffer.alloc(300 * 330, 1);
  await page.route('**/api/ai/segment', async (route) => { await route.fulfill({ body: JSON.stringify({ masks: [{ objectId: 'product', left: 0, top: 0, right: 300, bottom: 330, width: 300, height: 330, rasterBase64: mask.toString('base64') }] }), contentType: 'application/json' }); });
  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByTestId('oneshot-canvas')).toBeVisible();
  await expect(page.getByText('No issues found.')).toBeVisible();
  // The added line starts at (140, 500) 800x120, squarely over the product
  // box (340, 380) 400x600.
  await page.getByLabel('Your headline').fill('Hello');
  await page.getByRole('button', { name: 'Add text', exact: true }).click();
  await expect(page.getByText('Element overlaps the product')).toBeVisible();
  await expect(page.getByText('No issues found.')).toHaveCount(0);
});

test('evidence export downloads a ZIP and editing clears the certificate', async ({ page }) => {
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
      tx.onabort = () => { db.close(); reject(new Error('seed aborted')); }; };
  }));
  await page.reload();
  await page.locator('#api-key').fill('fixture-image-key');
  await page.getByRole('link', { name: 'One-shot', exact: true }).click();
  const mask = Buffer.alloc(300 * 330, 1);
  await page.route('**/api/ai/segment', async (route) => { await route.fulfill({ body: JSON.stringify({ masks: [{ objectId: 'product', left: 0, top: 0, right: 300, bottom: 330, width: 300, height: 330, rasterBase64: mask.toString('base64') }] }), contentType: 'application/json' }); });
  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByTestId('oneshot-canvas')).toBeVisible();
  await page.getByText('Edit brand details', { exact: true }).click();
  await page.getByLabel('Brand name').fill('Sora');
  await page.getByLabel('Brand description').fill('A sample ceremonial matcha brand.');
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.route('**/api/ai/oneshot', async (route) => { await route.fulfill({ body: pixel, contentType: 'image/png' }); });
  await page.route('**/api/ai/verify-oneshot', async (route) => { await route.fulfill({ body: JSON.stringify({ productKept: true, productNote: 'same can', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [] }), contentType: 'application/json' }); });
  await page.getByRole('button', { name: 'Generate finished ad', exact: true }).click();
  await expect(page.getByTestId('oneshot-certificate')).toBeVisible({ timeout: 30000 });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export evidence ZIP', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  // Any mockup edit after verification invalidates the on-screen
  // certificate: it described a mockup that no longer exists.
  await page.getByLabel('Your headline').fill('Hello');
  await page.getByRole('button', { name: 'Add text', exact: true }).click();
  await expect(page.getByTestId('oneshot-certificate')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('planner suggests three fonts and picking one applies it to the headline', async ({ page }) => {
  test.setTimeout(120_000);
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
      tx.onabort = () => { db.close(); reject(new Error('seed aborted')); }; };
  }));
  await page.reload();
  await page.locator('#api-key').fill('fixture-image-key');
  await page.getByRole('link', { name: 'One-shot', exact: true }).click();
  const mask = Buffer.alloc(300 * 330, 1);
  await page.route('**/api/ai/segment', async (route) => { await route.fulfill({ body: JSON.stringify({ masks: [{ objectId: 'product', left: 0, top: 0, right: 300, bottom: 330, width: 300, height: 330, rasterBase64: mask.toString('base64') }] }), contentType: 'application/json' }); });
  await page.route('**/api/ai/plan', async (route) => { await route.fulfill({ body: JSON.stringify({ concepts: [
    { angle: 'offer', title: 'Cold Offer', audienceAngle: 'thirsty youth', headline: 'Ice Cold One', caption: 'First caption', visualDirection: 'Icy scene one' },
    { angle: 'benefit', title: 'Fresh Benefit', audienceAngle: 'busy workers', headline: 'Fresh All Day', caption: 'Second caption', visualDirection: 'Icy scene two' },
    { angle: 'lifestyle', title: 'Chill Lifestyle', audienceAngle: 'friends out', headline: 'Chill With Friends', caption: 'Third caption', visualDirection: 'Icy scene three' },
  ], fonts: ['Montserrat', 'Poppins', 'Oswald'] }), contentType: 'application/json' }); });
  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByTestId('oneshot-canvas')).toBeVisible();
  await page.getByText('Edit brand details', { exact: true }).click();
  await page.getByLabel('Brand name').fill('Sora');
  await page.getByLabel('Brand description').fill('A sample ceremonial matcha brand.');
  await page.getByRole('button', { name: 'Suggest 3 ad ideas', exact: true }).click();
  await expect(page.getByText('Suggested fonts')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Poppins', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Poppins', exact: true }).click();
  await expect(page.getByText('Headline font: Poppins')).toBeVisible();
});

test('product drag moves the product and the canvas owns touch', async ({ page }) => {
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
      tx.onabort = () => { db.close(); reject(new Error('seed aborted')); }; };
  }));
  await page.reload();
  await page.locator('#api-key').fill('fixture-image-key');
  await page.getByRole('link', { name: 'One-shot', exact: true }).click();
  const mask = Buffer.alloc(300 * 330, 1);
  await page.route('**/api/ai/segment', async (route) => { await route.fulfill({ body: JSON.stringify({ masks: [{ objectId: 'product', left: 0, top: 0, right: 300, bottom: 330, width: 300, height: 330, rasterBase64: mask.toString('base64') }] }), contentType: 'application/json' }); });
  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByTestId('oneshot-canvas')).toBeVisible();
  await page.getByTestId('oneshot-canvas').scrollIntoViewIfNeeded();
  // The canvas owns the gesture: no page scroll starts from it.
  const touchAction = await page.locator('.design-canvas-host').evaluate((element) => getComputedStyle(element).touchAction);
  expect(touchAction).toBe('none');
  // Drag the product by (80, 60) logical units, converting through the
  // stage scale measured from the rendered canvas.
  const stageBox = await page.locator('.design-canvas-host canvas').first().boundingBox();
  expect(stageBox).not.toBeNull();
  const scale = stageBox!.width / 1080;
  // One device pixel is 1/scale logical units (about 4 at phone scale),
  // so a fixed 2-unit tolerance sits below screen resolution and flakes
  // with pointer rounding. Allow the original 2 units plus one pixel.
  const dragTolerance = 2 + 1 / scale;
  const startX = stageBox!.x + 540 * scale;
  const startY = stageBox!.y + 680 * scale;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 80 * scale, startY + 60 * scale, { steps: 5 });
  await page.mouse.up();
  await page.getByText('Edit brand details', { exact: true }).click();
  await page.getByLabel('Brand name').fill('Sora');
  await page.getByLabel('Brand description').fill('A sample ceremonial matcha brand.');
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  type LayoutItem = { id: string; kind: string; x: number; y: number; width: number; height: number; text?: string };
  const captured: { layout?: LayoutItem[] } = {};
  await page.route('**/api/ai/oneshot', async (route) => { captured.layout = (route.request().postDataJSON() as { layout: LayoutItem[] }).layout; await route.fulfill({ body: pixel, contentType: 'image/png' }); });
  await page.route('**/api/ai/verify-oneshot', async (route) => { await route.fulfill({ body: JSON.stringify({ productKept: true, productNote: 'same', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [] }), contentType: 'application/json' }); });
  await page.getByRole('button', { name: 'Generate finished ad', exact: true }).click();
  await expect(page.getByTestId('oneshot-result')).toBeVisible({ timeout: 30000 });
  // The product started at (340, 380); the drag adds (80, 60), within a
  // couple of units of pointer rounding.
  const product = captured.layout?.find(item => item.kind === 'product');
  expect(Math.abs((product?.x ?? 0) - 420)).toBeLessThan(dragTolerance);
  expect(Math.abs((product?.y ?? 0) - 440)).toBeLessThan(dragTolerance);
  expect(errors).toEqual([]);
});

test('brand picker keeps the arranged logo position', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/settings');
  await expect(page.locator('#api-key')).toBeEnabled();
  const ids = await page.evaluate(async () => {
    const blob = await (await fetch('/demo/sora-product.png')).blob();
    const brandA = crypto.randomUUID();
    const brandB = crypto.randomUUID();
    const assetA = crypto.randomUUID();
    const assetB = crypto.randomUUID();
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
        tx.objectStore('assets').put({ id: assetB, kind: 'logo', blob, createdAt: now });
        tx.objectStore('brands').put({ id: brandA, name: 'Brand A', description: 'First kit brand.', colors: ['#111111', '#eeeeee', '#336699'], logoAssetId: assetA, createdAt: now, updatedAt: now });
        tx.objectStore('brands').put({ id: brandB, name: 'Brand B', description: 'Second kit brand.', colors: ['#222222', '#dddddd', '#4477aa'], logoAssetId: assetB, createdAt: now, updatedAt: now });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(new Error('seed failed')); };
        tx.onabort = () => { db.close(); reject(new Error('seed aborted')); };
      };
    });
    return { brandA, brandB };
  });
  await page.reload();
  await page.locator('#api-key').fill('fixture-image-key');
  await page.getByRole('link', { name: 'One-shot', exact: true }).click();
  const mask = Buffer.alloc(300 * 330, 1);
  await page.route('**/api/ai/segment', async (route) => { await route.fulfill({ body: JSON.stringify({ masks: [{ objectId: 'product', left: 0, top: 0, right: 300, bottom: 330, width: 300, height: 330, rasterBase64: mask.toString('base64') }] }), contentType: 'application/json' }); });
  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByTestId('oneshot-canvas')).toBeVisible();
  await page.getByLabel('Choose your brand').selectOption(ids.brandA);
  await page.getByText('Edit brand details', { exact: true }).click();
  await expect(page.getByLabel('Brand name')).toHaveValue('Brand A');
  // Select the logo by clicking its center, then nudge it 10px left: the
  // logo starts at (830, 40) 200x80, so it must land at x 820.
  await page.getByTestId('oneshot-canvas').scrollIntoViewIfNeeded();
  const stageBox = await page.locator('.design-canvas-host canvas').first().boundingBox();
  expect(stageBox).not.toBeNull();
  const scale = stageBox!.width / 1080;
  await page.mouse.click(stageBox!.x + 930 * scale, stageBox!.y + 80 * scale);
  await page.getByRole('button', { name: 'Move left', exact: true }).click();
  // Picking another brand swaps the logo image only — the arranged
  // position must survive.
  await page.getByLabel('Choose your brand').selectOption(ids.brandB);
  await expect(page.getByLabel('Brand name')).toHaveValue('Brand B');
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  type LayoutItem = { id: string; kind: string; x: number; y: number; width: number; height: number; text?: string };
  const captured: { layout?: LayoutItem[] } = {};
  await page.route('**/api/ai/oneshot', async (route) => { captured.layout = (route.request().postDataJSON() as { layout: LayoutItem[] }).layout; await route.fulfill({ body: pixel, contentType: 'image/png' }); });
  await page.route('**/api/ai/verify-oneshot', async (route) => { await route.fulfill({ body: JSON.stringify({ productKept: true, productNote: 'same', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [] }), contentType: 'application/json' }); });
  await page.getByRole('button', { name: 'Generate finished ad', exact: true }).click();
  await expect(page.getByTestId('oneshot-result')).toBeVisible({ timeout: 30000 });
  const logo = captured.layout?.find(item => item.kind === 'logo');
  expect(logo?.x).toBe(820);
  expect(logo?.y).toBe(40);
  expect(logo?.width).toBe(200);
  expect(logo?.height).toBe(80);
  expect(errors).toEqual([]);
});

test('repair loop proposes a fix, applies it, and undo reverses it', async ({ page }) => {
  test.setTimeout(120_000);
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
      tx.onabort = () => { db.close(); reject(new Error('seed aborted')); }; };
  }));
  await page.reload();
  await page.locator('#api-key').fill('fixture-image-key');
  await page.getByRole('link', { name: 'One-shot', exact: true }).click();
  const mask = Buffer.alloc(300 * 330, 1);
  await page.route('**/api/ai/segment', async (route) => { await route.fulfill({ body: JSON.stringify({ masks: [{ objectId: 'product', left: 0, top: 0, right: 300, bottom: 330, width: 300, height: 330, rasterBase64: mask.toString('base64') }] }), contentType: 'application/json' }); });
  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByTestId('oneshot-canvas')).toBeVisible();
  // The added line starts at (140, 500) 800x120, squarely over the product
  // box (340, 380) 400x600.
  await page.getByLabel('Your headline').fill('Hello');
  await page.getByRole('button', { name: 'Add text', exact: true }).click();
  await expect(page.getByText('Element overlaps the product')).toBeVisible();
  // Inspect -> propose -> apply: the fix moves the line below the product
  // (y = 380 + 600 + 16 = 996), and the re-run inspect must come back clean.
  await page.getByRole('button', { name: 'Apply fix', exact: true }).click();
  await expect(page.getByText('No issues found.')).toBeVisible();
  await expect(page.getByText('Applied fixes')).toBeVisible();
  await expect(page.getByText(/moved to \(140, 996\)/)).toBeVisible();
  // The fix is an ordinary canvas edit, so Undo reverses it and the
  // finding comes back — the loop is reversible, not destructive.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('Element overlaps the product')).toBeVisible();
});

test('Geometric cutout rescues a product the noun phrase cannot ground', async ({ page }) => {
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

  // The noun phrase fails for this product, but the vision box cuts it.
  const seen: { prompt?: string; box?: unknown; point?: unknown }[] = [];
  const mask = Buffer.alloc(300 * 330, 1);
  await page.route('**/api/ai/segment', async (route) => {
    const body = route.request().postDataJSON() as { prompt?: string; box?: unknown; point?: unknown };
    seen.push(body);
    if (body.box) await route.fulfill({ body: JSON.stringify({ masks: [{ objectId: 'product', left: 0, top: 0, right: 300, bottom: 330, width: 300, height: 330, rasterBase64: mask.toString('base64') }] }), contentType: 'application/json' });
    else await route.fulfill({ status: 502, body: JSON.stringify({ error: { code: 'sam_no_mask' } }), contentType: 'application/json' });
  });
  await page.route('**/api/ai/product-box', async (route) => { await route.fulfill({ body: JSON.stringify({ left: 0.05, top: 0.05, right: 0.95, bottom: 0.95 }), contentType: 'application/json' }); });

  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByTestId('oneshot-canvas')).toBeVisible();
  await expect(page.getByText('Cutout: Meta (SAM) cutout')).toBeVisible();
  expect(seen.some((body) => body.box)).toBe(true);
  expect(seen.some((body) => body.prompt)).toBe(false);
  expect(errors).toEqual([]);
});

test('Tap-to-cut rescues a product when automatic cutout fails twice', async ({ page }) => {
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

  // Box and text both fail; only the tap point cuts.
  const mask = Buffer.alloc(300 * 330, 1);
  await page.route('**/api/ai/segment', async (route) => {
    const body = route.request().postDataJSON() as { point?: unknown };
    if (body.point) await route.fulfill({ body: JSON.stringify({ masks: [{ objectId: 'product', left: 0, top: 0, right: 300, bottom: 330, width: 300, height: 330, rasterBase64: mask.toString('base64') }] }), contentType: 'application/json' });
    else await route.fulfill({ status: 502, body: JSON.stringify({ error: { code: 'sam_no_mask' } }), contentType: 'application/json' });
  });
  await page.route('**/api/ai/product-box', async (route) => { await route.fulfill({ body: JSON.stringify({ left: 0.05, top: 0.05, right: 0.95, bottom: 0.95 }), contentType: 'application/json' }); });

  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByText(/Tap the product in the photo/)).toBeVisible({ timeout: 30000 });
  await page.getByTestId('cutout-tap-photo').click();
  await expect(page.getByTestId('oneshot-canvas')).toBeVisible();
  await expect(page.getByText('Cutout: Meta (SAM) cutout')).toBeVisible();
  expect(errors).toEqual([]);
});
