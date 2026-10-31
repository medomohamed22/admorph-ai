import { test, expect } from '@playwright/test';
import sharp from 'sharp';

// A 6000x4000 photo of about 7 MB, like a modern phone camera's.
async function bigPhoto() {
  const width = 6000, height = 4000, raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = ((i * 2654435761) >>> 24) & 0xff;
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 70 }).toBuffer();
}

test('a large phone photo is compressed on the device instead of refused', async ({ page }) => {
  test.setTimeout(120_000);
  const photo = await bigPhoto();
  expect(photo.length).toBeGreaterThan(2 * 1024 * 1024);
  let sent = 0;
  const mask = Buffer.alloc(8 * 8, 1);
  await page.route('**/api/ai/product-box', route => route.fulfill({ json: { left: 0.1, top: 0.1, right: 0.9, bottom: 0.9 } }));
  await page.route('**/api/ai/segment', route => {
    const body = route.request().postDataJSON();
    sent = Math.round(body.image.data.length * 0.75);
    const { left, top, right, bottom } = body.box;
    return route.fulfill({ json: { masks: [{ objectId: 'product', left: left + 20, top: top + 20, right: right - 20, bottom: bottom - 20, width: 8, height: 8, rasterBase64: mask.toString('base64') }] } });
  });
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Create', exact: true }).click();
  await page.getByLabel('Product photo', { exact: true }).setInputFiles({ name: 'phone.jpg', mimeType: 'image/jpeg', buffer: photo });
  await expect(page.locator('.wizard-error')).toHaveCount(0);
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByTestId('upload-card-product')).toHaveClass(/done/, { timeout: 60000 });
  expect(sent).toBeGreaterThan(0);
  expect(sent).toBeLessThanOrEqual(2 * 1024 * 1024);
});

test('the shelf asks for an upload, not the live camera', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Create', exact: true }).click();
  await page.locator('a[href="/shelf"]:visible').first().click();
  for (const input of await page.locator('input[type=file]').all()) expect(await input.getAttribute('capture')).toBeNull();
});
