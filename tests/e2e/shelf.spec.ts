import { test, expect, type Page } from '@playwright/test';

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const detection = { products: [
  { name: 'TALJ Vanilla Latte', category: 'beverage', box: { left: 0.1, top: 0.2, right: 0.25, bottom: 0.77 }, priceText: '45 EGP' },
  { name: 'White running shoe', category: 'fashion', box: { left: 0.34, top: 0.53, right: 0.66, bottom: 0.79 }, priceText: '1,250 EGP' },
  { name: 'Black headphones', category: 'electronics', box: { left: 0.7, top: 0.16, right: 0.95, bottom: 0.77 }, priceText: '2,900 EGP' },
] };
const plan = { campaignName: 'Shelf Stars', products: [
  { id: 'p1', headline: 'برودة تفرّحك', cta: 'اطلب الحين', scene: 'a sunny cafe counter with ice and vanilla flowers', caption: 'لاتيه فانيليا بارد' },
  { id: 'p2', headline: 'امشِ بخفّة', cta: 'اطلبه', scene: 'a city running track at sunrise with dew on the grass', caption: 'حذاء خفيف' },
  { id: 'p3', headline: 'صوتك الخاص', cta: 'اطلب', scene: 'a cosy studio desk with vinyl records and warm lamp light', caption: 'سماعات مريحة' },
] };

// Every Meta route is intercepted: no paid call runs here.
async function mockMeta(page: Page) {
  const calls = { detect: 0, segment: 0, plan: [] as Record<string, unknown>[], paint: [] as { layout: { id: string; text?: string }[] }[], verify: 0 };
  await page.route('**/api/ai/shelf-detect', route => { calls.detect++; return route.fulfill({ json: detection }); });
  await page.route('**/api/ai/segment', route => {
    calls.segment++;
    const body = route.request().postDataJSON() as { box: { left: number; top: number; right: number; bottom: number } };
    // The product sits inside the (padded) box with air around it, so no wider retry is needed.
    const { left, top, right, bottom } = body.box, dx = Math.round((right - left) * 0.12), dy = Math.round((bottom - top) * 0.12);
    return route.fulfill({ json: { masks: [{ objectId: 'product', left: left + dx, top: top + dy, right: right - dx, bottom: bottom - dy, width: 8, height: 8, rasterBase64: Buffer.alloc(64, 1).toString('base64') }] } });
  });
  await page.route('**/api/ai/shelf-plan', route => { calls.plan.push(route.request().postDataJSON()); return route.fulfill({ json: plan }); });
  await page.route('**/api/ai/oneshot', route => { calls.paint.push(route.request().postDataJSON()); return route.fulfill({ body: pixel, contentType: 'image/png' }); });
  await page.route('**/api/ai/verify-oneshot', route => { calls.verify++; return route.fulfill({ json: { productKept: true, productNote: '', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [], extraText: [] } }); });
  return calls;
}

test('shelf to campaign: find, cut live, pick, and paint one ad per product', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const calls = await mockMeta(page);
  await page.goto('/settings');
  await page.locator('#api-key').fill('fixture-shelf-key');
  await page.getByRole('link', { name: 'Create', exact: true }).first().click();
  await page.getByRole('link', { name: 'Whole shelf? Make a campaign', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shoot the shelf. Get a campaign.');
  await expect(page.getByTestId('shelf-capture')).toBeVisible();

  await page.getByRole('button', { name: 'Try the sample shelf', exact: true }).click();
  // Muse Spark's boxes appear on the photo, then SAM cuts each one.
  await expect(page.getByTestId('shelf-box')).toHaveCount(3);
  // Biggest product first: the headphones, then the latte, then the shoe.
  await expect(page.getByTestId('shelf-box').nth(1)).toContainText('TALJ Vanilla Latte');
  await expect(page.getByTestId('shelf-box').nth(1)).toContainText('45 EGP');
  await expect(page.locator('[data-testid="shelf-card"].is-cut')).toHaveCount(3, { timeout: 30000 });
  expect(calls.detect).toBe(1);
  expect(calls.segment).toBe(3);

  // Edit a price and leave the shoe out.
  const cards = page.getByTestId('shelf-card');
  await cards.nth(1).getByLabel('Price (as on the tag)').fill('40 EGP');
  await cards.nth(2).getByRole('switch', { name: 'In the campaign' }).click();
  await expect(cards.nth(2)).toHaveClass(/is-off/);

  const brief = page.getByTestId('shelf-brief');
  const make = brief.getByRole('button', { name: 'Make the campaign (2 ads)', exact: true });
  await expect(make).toBeDisabled();
  await brief.getByLabel('Shop name').fill('Corner Shop');
  await brief.getByLabel('What you sell, in a few words').fill('Drinks and gadgets');
  await brief.getByRole('radio', { name: 'Gulf', exact: true }).click();
  await expect(brief).toContainText('about 5 requests');
  await make.click();

  const campaign = page.getByTestId('shelf-campaign');
  await expect(campaign.getByTestId('shelf-campaign-name')).toHaveText('Shelf Stars', { timeout: 30000 });
  await expect(campaign.getByTestId('shelf-ad-image')).toHaveCount(2, { timeout: 60000 });
  await expect(campaign).toContainText('2 of 2 ads ready');
  // One planner call for the whole shelf, in the chosen dialect, with the edited price.
  expect(calls.plan).toHaveLength(1);
  expect(calls.plan[0]).toMatchObject({ dialect: 'ar_gulf' });
  expect((calls.plan[0].products as { id: string; priceText: string }[]).map(item => item.id)).toEqual(['p1', 'p2']);
  expect((calls.plan[0].products as { priceText: string }[])[1].priceText).toBe('40 EGP');
  expect(calls.paint).toHaveLength(2);
  expect(calls.paint[0].layout.find(item => item.id === 'headline')?.text).toBe('برودة تفرّحك');
  expect(calls.paint[1].layout.find(item => item.id === 'price')?.text).toBe('40 EGP');
  expect(calls.verify).toBe(2);

  const download = page.waitForEvent('download');
  await campaign.getByRole('button', { name: 'Download the campaign (ZIP)', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('admorph-shelf-campaign.zip');

  // Every ad lands in the gallery as a shelf ad.
  await page.getByRole('link', { name: 'Open my gallery', exact: true }).click();
  await expect(page.getByTestId('gallery-card')).toHaveCount(2);
  await expect(page.getByTestId('gallery-card').first()).toContainText('Shelf campaign');
  expect(errors).toEqual([]);
});

test('a shelf with nothing on it says so and stays on the capture step', async ({ page }) => {
  await page.route('**/api/ai/shelf-detect', route => route.fulfill({ json: { products: [] } }));
  await page.goto('/settings');
  await page.locator('#api-key').fill('fixture-shelf-key');
  await page.getByRole('link', { name: 'Create', exact: true }).first().click();
  await page.getByRole('link', { name: 'Whole shelf? Make a campaign', exact: true }).click();
  await page.getByRole('button', { name: 'Try the sample shelf', exact: true }).click();
  await expect(page.locator('.shelf-error')).toContainText('No products were found');
  await expect(page.getByTestId('shelf-capture')).toBeVisible();
});

test('without a key the shelf page asks for one and does not start', async ({ page }) => {
  await page.goto('/shelf');
  await expect(page.getByText('Add your Meta key in Settings to start.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try the sample shelf', exact: true })).toBeDisabled();
});
