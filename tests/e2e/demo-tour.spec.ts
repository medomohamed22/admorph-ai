import { test, expect, type Page } from '@playwright/test';

// The guided demo, end to end. Every Meta route is intercepted: no paid call runs here.
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const concepts = [
  { angle: 'benefit', title: 'Long Comfort', audienceAngle: 'commuters', headline: 'Quiet Comfort All Day', caption: 'c1', visualDirection: 'a calm reading nook' },
  { angle: 'offer', title: 'Focus', audienceAngle: 'students', headline: 'Focus Sounds Better', caption: 'c2', visualDirection: 'a tidy desk' },
  { angle: 'lifestyle', title: 'Travel', audienceAngle: 'travellers', headline: 'Your Quiet Seat', caption: 'c3', visualDirection: 'a train window' },
];
const detection = { products: [
  { name: 'TALJ Vanilla Latte', category: 'beverage', box: { left: 0.03, top: 0.2, right: 0.33, bottom: 0.8 }, priceText: '45 EGP' },
  { name: 'White running shoe', category: 'fashion', box: { left: 0.35, top: 0.48, right: 0.66, bottom: 0.79 }, priceText: '1,250 EGP' },
  { name: 'Black headphones', category: 'electronics', box: { left: 0.69, top: 0.27, right: 0.98, bottom: 0.8 }, priceText: '2,900 EGP' },
] };
const shelfPlan = { campaignName: 'Corner Picks', products: [
  { id: 'p1', headline: 'Cold and Smooth', cta: 'Order now', scene: 'a sunny cafe counter', caption: 'latte' },
  { id: 'p2', headline: 'Walk Lighter', cta: 'Order now', scene: 'a city track at sunrise', caption: 'shoe' },
  { id: 'p3', headline: 'Your Own Sound', cta: 'Order now', scene: 'a cosy desk', caption: 'headphones' },
] };
const verified = { productKept: true, productNote: 'same headphones', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [], extraText: [], seasonCues: ['lanterns', 'crescent', 'dates'] };

async function mockMeta(page: Page) {
  const calls = { box: 0, segment: 0, plan: 0, paint: 0, verify: 0, remix: [] as Record<string, unknown>[], detect: 0, shelfPlan: 0 };
  await page.route('**/api/ai/product-box', route => { calls.box++; return route.fulfill({ json: { left: 0.15, top: 0.1, right: 0.85, bottom: 0.9 } }); });
  await page.route('**/api/ai/segment', route => {
    calls.segment++;
    const body = route.request().postDataJSON() as { box?: { left: number; top: number; right: number; bottom: number } };
    const box = body.box ?? { left: 0, top: 0, right: 100, bottom: 100 };
    const dx = Math.round((box.right - box.left) * 0.12), dy = Math.round((box.bottom - box.top) * 0.12);
    return route.fulfill({ json: { masks: [{ objectId: 'product', left: box.left + dx, top: box.top + dy, right: box.right - dx, bottom: box.bottom - dy, width: 8, height: 8, rasterBase64: Buffer.alloc(64, 1).toString('base64') }] } });
  });
  await page.route('**/api/ai/plan', route => { calls.plan++; return route.fulfill({ json: { concepts } }); });
  await page.route('**/api/ai/oneshot', route => { calls.paint++; return route.fulfill({ body: pixel, contentType: 'image/png' }); });
  await page.route('**/api/ai/verify-oneshot', route => { calls.verify++; return route.fulfill({ json: verified }); });
  await page.route('**/api/ai/ad-remix', route => { calls.remix.push(route.request().postDataJSON()); return route.fulfill({ body: pixel, contentType: 'image/png' }); });
  await page.route('**/api/ai/shelf-detect', route => { calls.detect++; return route.fulfill({ json: detection }); });
  await page.route('**/api/ai/shelf-plan', route => { calls.shelfPlan++; return route.fulfill({ json: shelfPlan }); });
  return calls;
}

test('the guided demo plays the whole site by itself: ad, Ramadan copy, shelf campaign', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const calls = await mockMeta(page);
  await page.goto('/');
  await page.getByTestId('demo-start').click();
  await expect(page.getByRole('heading', { name: 'The full AdMorph demo' })).toBeVisible();
  await expect(page.getByText(/about 20–30 Meta requests/)).toBeVisible();
  await page.getByTestId('demo-start-auto').click();

  const bar = page.getByTestId('demo-bar');
  await expect(page).toHaveURL(/\/oneshot$/);
  await expect(bar).toHaveAttribute('data-step', 'product');
  await expect(bar).toContainText('Step 1 of 8');
  await expect(bar).toContainText('SAM 3.1');
  await expect(bar).toHaveAttribute('data-step', 'paint', { timeout: 60_000 });
  await expect(page).toHaveURL(/\/themes\?ad=/, { timeout: 60_000 });
  await expect(page.locator('[data-testid="remix-result"]')).toHaveCount(1, { timeout: 60_000 });
  await expect(page).toHaveURL(/\/shelf$/, { timeout: 60_000 });
  await expect(bar).toHaveAttribute('data-state', 'finished', { timeout: 120_000 });
  await expect(bar).toContainText('8 of 8 steps finished');
  // Two shelf products only, painted with the sample store brand.
  await expect(page.getByTestId('shelf-ad-image')).toHaveCount(2);
  expect(calls.remix[0]).toMatchObject({ theme: 'ramadan' });
  expect(calls.detect).toBe(1);
  expect(calls.paint).toBe(3);
  expect(errors).toEqual([]);
  await bar.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(bar).toHaveCount(0);
});

test('step-by-step mode waits for Next, and Exit stops the run', async ({ page }) => {
  test.setTimeout(120_000);
  const calls = await mockMeta(page);
  await page.goto('/');
  await page.getByTestId('demo-start').click();
  await page.getByTestId('demo-start-step').click();
  const bar = page.getByTestId('demo-bar');
  await expect(bar).toHaveAttribute('data-step', 'product');
  await expect(bar.getByTestId('demo-next')).toBeVisible({ timeout: 60_000 });
  await expect(bar).toContainText('Done');
  // Nothing moves on until Next is pressed.
  await page.waitForTimeout(2500);
  await expect(bar).toHaveAttribute('data-step', 'product');
  expect(calls.plan).toBe(0);
  await bar.getByTestId('demo-next').click();
  await expect(bar).toHaveAttribute('data-step', 'brand');
  await expect(bar.getByTestId('demo-next')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Brand name')).toHaveValue('Mono Audio');
  // The run survives a reload, then Exit ends it for good.
  await page.reload();
  await expect(bar).toHaveAttribute('data-step', 'brand');
  await bar.getByRole('button', { name: 'Exit the demo', exact: true }).click();
  await expect(bar).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('demo-bar')).toHaveCount(0);
});

test('the demo reads in Arabic too', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to Arabic', exact: true }).click();
  await expect(page.getByTestId('demo-start')).toHaveText('شاهد العرض الكامل');
  await page.getByTestId('demo-start').click();
  await expect(page.getByRole('heading', { name: 'العرض الكامل لـ AdMorph' })).toBeVisible();
  await expect(page.getByTestId('demo-start-auto')).toHaveText('تشغيل تلقائي');
});
