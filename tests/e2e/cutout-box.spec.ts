import { test, expect } from '@playwright/test';

const mask = Buffer.alloc(300 * 330, 1);

// No paid call: the vision box and SAM are both intercepted.
test('a tight vision box is padded, and a cut that runs into the box edge is retried once wider', async ({ page }) => {
  test.setTimeout(90_000);
  const boxes: { left: number; top: number; right: number; bottom: number }[] = [];
  await page.route('**/api/ai/product-box', route => route.fulfill({ json: { left: 0.2, top: 0.2, right: 0.8, bottom: 0.8 } }));
  await page.route('**/api/ai/segment', route => {
    boxes.push(route.request().postDataJSON().box);
    // The whole photo is "product", so any box short of the frame clips it.
    return route.fulfill({ json: { masks: [{ objectId: 'product', left: 0, top: 0, right: 300, bottom: 330, width: 300, height: 330, rasterBase64: mask.toString('base64') }] } });
  });
  await page.goto('/settings');
  await page.locator('#api-key').fill('fixture-box-key');
  await page.getByRole('link', { name: 'Create', exact: true }).click();
  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByTestId('upload-card-product')).toHaveClass(/done/);
  expect(boxes).toHaveLength(2);
  const [first, second] = boxes;
  // 0.2..0.8 of 300x330, grown 5% of its own size, then 20%.
  expect(first).toEqual({ left: 51, top: 56, right: 250, bottom: 274 });
  expect(second.left).toBeLessThan(first.left);
  expect(second.right).toBeGreaterThan(first.right);
  // Floating point puts the 20% edge a pixel either way; it is well outside the first box.
  expect(second.left).toBeLessThanOrEqual(24);
  expect(second.top).toBeLessThanOrEqual(26);
  expect(second.bottom - second.top).toBeGreaterThan(first.bottom - first.top);
});

// Live finding (30 Oct): after "Improve product" the app cut the improved photo
// with the text prompt only; SAM answered with no mask and the improvement was
// thrown away. The cut must follow the box path and the improvement must stay.
test('Improve product keeps the improved photo and cuts it along the Muse Spark box', async ({ page }) => {
  test.setTimeout(90_000);
  const prompts: string[] = [];
  const product = await page.context().request.get('/demo/sora-product.png').then(response => response.body()).catch(() => null);
  await page.route('**/api/ai/product-makeover', async route => route.fulfill({ body: product ?? Buffer.alloc(0), contentType: 'image/png' }));
  await page.route('**/api/ai/product-box', route => route.fulfill({ json: { left: 0.1, top: 0.1, right: 0.9, bottom: 0.9 } }));
  await page.route('**/api/ai/segment', route => {
    const body = route.request().postDataJSON();
    prompts.push(body.box ? 'box' : body.prompt ? 'text' : 'point');
    // Like the live run: the text prompt finds nothing, the box does.
    if (!body.box) return route.fulfill({ status: 502, json: { error: { code: 'sam_no_mask', details: { source: 'meta', message: 'SAM returned no mask records' } } } });
    const { left, top, right, bottom } = body.box, dx = Math.round((right - left) * 0.1), dy = Math.round((bottom - top) * 0.1);
    return route.fulfill({ json: { masks: [{ objectId: 'product', left: left + dx, top: top + dy, right: right - dx, bottom: bottom - dy, width: 8, height: 8, rasterBase64: Buffer.alloc(64, 1).toString('base64') }] } });
  });
  await page.goto('/settings');
  await page.locator('#api-key').fill('fixture-enhance-key');
  await page.getByRole('link', { name: 'Create', exact: true }).click();
  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await page.getByLabel(/Improve product/).click();
  await expect(page.getByTestId('oneshot-enhance-compare')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('upload-card-product')).toHaveClass(/done/);
  await expect(page.getByLabel(/Improve product/)).toBeChecked();
  expect(prompts).toEqual(['box']);
});
