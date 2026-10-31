import { wizardStep } from './wizard';
import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const mask = Buffer.alloc(300 * 330, 1);

// Every Meta route is intercepted: no paid call runs in these tests.
async function prepare(page: Page) {
  await page.route('**/api/ai/product-box', route => route.fulfill({ json: { left: 0, top: 0, right: 1, bottom: 1 } }));
  await page.route('**/api/ai/segment', route => route.fulfill({ json: { masks: [{ objectId: 'product', left: 0, top: 0, right: 300, bottom: 330, width: 300, height: 330, rasterBase64: mask.toString('base64') }] } }));
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Create', exact: true }).click();
  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByTestId('upload-card-product')).toHaveClass(/done/);
  await wizardStep(page, 'Brand');
  await page.getByText('Edit brand details', { exact: true }).click();
  await page.getByLabel('Brand name').fill('Sora');
  await page.getByLabel('Brand description').fill('A sample ceremonial matcha brand.');
}

test('a white logo background is cleared on the device, with no request', async ({ page }) => {
  test.setTimeout(90_000);
  await prepare(page);
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/ai/')) requests.push(request.url()); });
  const mark = await sharp({ create: { width: 60, height: 30, channels: 3, background: '#7c5cff' } }).png().toBuffer();
  const logo = await sharp({ create: { width: 160, height: 80, channels: 3, background: '#ffffff' } }).composite([{ input: mark, left: 50, top: 25 }]).png().toBuffer();
  await page.getByTestId('upload-card-logo').locator('input[type=file]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: logo });
  await page.getByRole('button', { name: 'Make the logo background transparent', exact: true }).click();
  await expect(page.getByTestId('logo-note')).toHaveText('Background removed on your device.');
  const corner = await page.getByTestId('upload-card-logo').locator('img').evaluate(async image => {
    const source = image as HTMLImageElement; await source.decode();
    const canvas = document.createElement('canvas'); canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
    const context = canvas.getContext('2d')!; context.drawImage(source, 0, 0);
    return [context.getImageData(0, 0, 1, 1).data[3], context.getImageData(80, 40, 1, 1).data[3]];
  });
  expect(corner).toEqual([0, 255]);
  // A second press says so instead of pretending.
  await page.getByRole('button', { name: 'Make the logo background transparent', exact: true }).click();
  await expect(page.getByTestId('logo-note')).toHaveText('This logo is already transparent.');
  expect(requests).toHaveLength(0);
});

test('layers, badges, text style and alignment shape the mockup the painter receives', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  let painted: { layout: Record<string, unknown>[]; mockup: unknown } | null = null;
  await page.route('**/api/ai/oneshot', route => { painted = route.request().postDataJSON(); return route.fulfill({ body: pixel, contentType: 'image/png' }); });
  await page.route('**/api/ai/verify-oneshot', route => route.fulfill({ json: { productKept: true, productNote: '', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [], extraText: [] } }));
  await wizardStep(page, 'Arrange');
  const tools = page.getByTestId('canvas-tools');
  await expect(tools.getByTestId('layer-count')).toHaveText('2/20');

  await tools.getByLabel('Badge text').fill('45 EGP');
  await tools.getByRole('button', { name: 'Add price tag', exact: true }).click();
  await expect(tools.getByTestId('layer-count')).toHaveText('3/20');
  // The new badge is selected: its style tools are open.
  const style = tools.getByTestId('text-style');
  await expect(style).toBeVisible();
  await style.getByRole('slider', { name: 'Size' }).fill('80');
  await expect(style.locator('output')).toHaveText('80');
  await tools.getByRole('button', { name: 'Center', exact: true }).first().click();

  await tools.getByLabel('Badge text').fill('Order now');
  await tools.getByRole('button', { name: 'Add button', exact: true }).click();
  await expect(tools.getByTestId('layer-count')).toHaveText('4/20');
  // Top of the list is the top of the stack: the button, then the price tag.
  const layers = tools.getByTestId('layer-list').locator('li');
  await expect(layers.first()).toContainText('Button: Order now');
  await expect(layers.nth(1)).toContainText('Price tag: 45 EGP');
  await tools.getByRole('button', { name: 'Send backward: Button: Order now', exact: true }).click();
  await expect(layers.first()).toContainText('Price tag: 45 EGP');
  await tools.getByRole('button', { name: 'Delete: Button: Order now', exact: true }).click();
  await expect(tools.getByTestId('layer-count')).toHaveText('3/20');
  // The built-in icon library is gone; only the user's own icon upload remains.
  await expect(tools.getByRole('button', { name: /^Add icon:/ })).toHaveCount(0);

  await wizardStep(page, 'Generate');
  const generate = page.getByRole('button', { name: 'Generate finished ad', exact: true });
  await expect(generate).toBeEnabled({ timeout: 30000 });
  await generate.click();
  await expect(page.getByTestId('oneshot-result')).toBeVisible({ timeout: 30000 });
  const badge = painted!.layout.find(element => element.badge === 'price');
  expect(badge).toMatchObject({ kind: 'text', text: '45 EGP', badge: 'price', x: 380 });
  expect(badge).not.toHaveProperty('fill');
  expect(badge).not.toHaveProperty('fontSize');
});
