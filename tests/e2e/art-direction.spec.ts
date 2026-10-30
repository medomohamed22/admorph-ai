import { wizardStep } from './wizard';
import { test, expect, type Page } from '@playwright/test';

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const mask = Buffer.alloc(300 * 330, 1);
const brief = (setting: string) => ({ setting, props: ['a bowl of lemons', 'a linen towel'], lighting: 'warm morning side light', camera: 'low angle, 50mm', composition: 'product right, headline top', palette: ['#F2E8D5', 'olive'], typeStyle: 'bold condensed sans', avoid: ['plain backdrop'] });

// Every Meta route is intercepted: no paid call runs in these tests.
async function prepare(page: Page) {
  await page.route('**/api/ai/product-box', route => route.fulfill({ json: { left: 0, top: 0, right: 1, bottom: 1 } }));
  await page.route('**/api/ai/segment', route => route.fulfill({ json: { masks: [{ objectId: 'product', left: 0, top: 0, right: 300, bottom: 330, width: 300, height: 330, rasterBase64: mask.toString('base64') }] } }));
  await page.goto('/settings');
  await page.locator('#api-key').fill('fixture-art-key');
  await page.getByRole('link', { name: 'Create', exact: true }).click();
  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByTestId('upload-card-product')).toHaveClass(/done/);
  await wizardStep(page, 'Brand');
  await page.getByText('Edit brand details', { exact: true }).click();
  await page.getByLabel('Brand name').fill('Sora');
  await page.getByLabel('Brand description').fill('A sample ceremonial matcha brand.');
}

test('ideas carry an art brief, the scene is built from it, and recent settings are avoided', async ({ page }) => {
  test.setTimeout(120_000);
  const plans: Record<string, unknown>[] = [];
  await page.route('**/api/ai/plan', async route => {
    plans.push(route.request().postDataJSON());
    await route.fulfill({ json: { concepts: [
      { angle: 'offer', title: 'Kitchen', audienceAngle: 'a', headline: 'Morning ritual', caption: 'c1', visualDirection: 'v1', artBrief: brief('a sunlit marble kitchen counter') },
      { angle: 'benefit', title: 'Desk', audienceAngle: 'b', headline: 'Calm focus', caption: 'c2', visualDirection: 'v2', artBrief: brief('a walnut desk by a rainy window') },
      { angle: 'lifestyle', title: 'Garden', audienceAngle: 'c', headline: 'Slow Sunday', caption: 'c3', visualDirection: 'v3', artBrief: brief('a stone garden table under olive trees') },
    ], fonts: ['Archivo Black', 'Comic Sans'] } });
  });
  await prepare(page);
  // Two earlier ads were set somewhere; the planner must hear about them.
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('admorph-local-v1');
      open.onsuccess = () => { const db = open.result, tx = db.transaction(['settings'], 'readwrite');
        tx.objectStore('settings').put({ key: 'recentScenes', value: ['a windy beach', 'a neon rooftop'] });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(new Error('seed failed')); };
      open.onerror = () => reject(new Error('open failed'));
    });
  });
  await wizardStep(page, 'Idea');
  await page.getByRole('button', { name: 'Suggest 3 ad ideas', exact: true }).click();
  await expect(page.getByTestId('idea-brief')).toHaveCount(3);
  expect(plans[0]).toMatchObject({ avoidScenes: ['a windy beach', 'a neon rooftop'] });
  await expect(page.getByTestId('idea-brief').first()).toContainText('a sunlit marble kitchen counter');
  await expect(page.getByTestId('idea-brief').first()).toContainText('low angle, 50mm');
  const scene = page.getByRole('textbox', { name: /^Background scene/ });
  await expect(scene).toHaveValue(/^a sunlit marble kitchen counter, with a bowl of lemons, a linen towel\. Light: warm morning side light/);
  await page.getByRole('button', { name: /^Desk — Calm focus/ }).click();
  await expect(scene).toHaveValue(/^a walnut desk by a rainy window/);

  // Only allowlisted fonts are suggested; the full list opens on demand.
  const fonts = page.getByTestId('font-pick');
  await expect(fonts.getByRole('button', { name: 'Archivo Black', exact: true })).toBeVisible();
  await expect(fonts.getByRole('button', { name: 'Comic Sans' })).toHaveCount(0);
  await fonts.getByRole('button', { name: 'More fonts', exact: true }).click();
  await fonts.getByRole('button', { name: /Abril Fatface/ }).click();
  await expect(fonts).toContainText('Headline font: Abril Fatface');
});

test('the ad size is picked before painting: the mockup, the request and the result frame all follow it', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  let painted: { format?: string; mockup: { data: string }; layout: { y: number; height: number }[] } | null = null;
  await page.route('**/api/ai/oneshot', route => { painted = route.request().postDataJSON(); return route.fulfill({ body: pixel, contentType: 'image/png' }); });
  await page.route('**/api/ai/verify-oneshot', route => route.fulfill({ json: { productKept: true, productNote: '', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [], extraText: [] } }));
  await wizardStep(page, 'Arrange');
  const sizes = page.getByTestId('format-pick');
  await expect(sizes.getByRole('radio', { name: '4:5 Feed' })).toHaveAttribute('aria-checked', 'true');
  const canvas = page.getByTestId('oneshot-canvas').locator('canvas').first();
  const feed = await canvas.boundingBox();
  await sizes.getByRole('radio', { name: '9:16 Story' }).click();
  await expect(sizes.getByRole('radio', { name: '9:16 Story' })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => { const box = await canvas.boundingBox(); return box ? Math.round(box.height / box.width * 100) : 0; }).toBe(178);
  expect(feed && Math.round(feed.height / feed.width * 100)).toBe(125);

  await wizardStep(page, 'Generate');
  const generate = page.getByRole('button', { name: 'Generate finished ad', exact: true });
  await expect(generate).toBeEnabled({ timeout: 30000 });
  await generate.click();
  await expect(page.getByTestId('oneshot-result')).toBeVisible({ timeout: 30000 });
  expect(painted!.format).toBe('1080x1920');
  expect(painted!.layout.every(element => element.y + element.height <= 1920)).toBe(true);
  const mockup = await page.evaluate(async data => { const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode(); return [image.naturalWidth, image.naturalHeight]; }, painted!.mockup.data);
  expect(mockup).toEqual([1080, 1920]);
  await expect(page.getByTestId('oneshot-result-frame')).toHaveCSS('aspect-ratio', '1080 / 1920');
  // No after-the-fact framing any more.
  await expect(page.getByTestId('size-set')).toHaveCount(0);
});
