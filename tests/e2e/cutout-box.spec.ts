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
