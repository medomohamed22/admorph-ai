import { test, expect, type Page } from '@playwright/test';
import { wizardStep, fillBrand } from './wizard';

// Web research before ideas, copies and seasons. Every Meta route is intercepted: no paid call runs here.
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const concepts = [
  { angle: 'benefit', title: 'One', audienceAngle: 'a', headline: 'First Line', caption: 'c1', visualDirection: 'scene one' },
  { angle: 'offer', title: 'Two', audienceAngle: 'b', headline: 'Second Line', caption: 'c2', visualDirection: 'scene two' },
  { angle: 'lifestyle', title: 'Three', audienceAngle: 'c', headline: 'Third Line', caption: 'c3', visualDirection: 'scene three' },
];
const trends = [
  { name: 'Alpha Look', visual: 'linen and window light', copy: 'calm' },
  { name: 'Beta Look', visual: 'bold color block', copy: 'punchy' },
  { name: 'Gamma Look', visual: 'golden street', copy: 'aspirational' },
];
const research = { productType: 'tin', audience: 'tea lovers', searched: true, sources: [{ url: 'https://www.behance.net/gallery/9/x' }], trends };
const verified = { productKept: true, productNote: '', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [], extraText: [], seasonCues: ['lanterns', 'crescent', 'dates'] };

async function toIdeas(page: Page) {
  const mask = Buffer.alloc(300 * 330, 1);
  await page.route('**/api/ai/segment', route => route.fulfill({ json: { masks: [{ objectId: 'product', left: 0, top: 0, right: 300, bottom: 330, width: 300, height: 330, rasterBase64: mask.toString('base64') }] } }));
  await page.goto('/oneshot');
  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByTestId('upload-card-product')).toHaveClass(/done/);
  await fillBrand(page);
  await wizardStep(page, 'Idea');
}

test('a failed search never blocks ideas, and switching research off sends fresh library looks instead', async ({ page }) => {
  test.setTimeout(120_000);
  let researchCalls = 0;
  const briefs: string[] = [];
  await page.route('**/api/ai/market-research', route => { researchCalls++; return route.fulfill({ status: 502, json: { error: { code: 'upstream' } } }); });
  await page.route('**/api/ai/plan', route => { briefs.push(String((route.request().postDataJSON() as { brief: string }).brief)); return route.fulfill({ json: { concepts } }); });
  await toIdeas(page);
  await page.getByRole('button', { name: 'Suggest 3 ad ideas', exact: true }).click();
  await expect(page.getByRole('button', { name: 'One — First Line', exact: true })).toBeVisible();
  await expect(page.getByTestId('agent-step-research')).toHaveAttribute('data-status', 'failed');
  expect(researchCalls).toBe(1);
  expect(briefs[0]).toContain('Fresh looks to consider');
  await expect(page.getByTestId('research-box')).toHaveCount(0);

  await page.getByTestId('research-toggle').uncheck();
  await page.getByRole('button', { name: 'Suggest 3 ad ideas', exact: true }).click();
  await expect.poll(() => briefs.length).toBe(2);
  expect(researchCalls).toBe(1);
  await expect(page.getByTestId('agent-step-research')).toHaveAttribute('data-status', 'skipped');
  expect(briefs[1]).toContain('Fresh looks to consider');
  expect(briefs[1]).not.toContain('researched on the web');
});

test('new ideas reuse the research and move on to directions not used yet', async ({ page }) => {
  test.setTimeout(120_000);
  let researchCalls = 0;
  const briefs: string[] = [];
  const five = [...trends, { name: 'Delta Look', visual: 'dark studio', copy: 'precise' }, { name: 'Epsilon Look', visual: 'beach towel', copy: 'breezy' }];
  await page.route('**/api/ai/market-research', route => { researchCalls++; return route.fulfill({ json: { ...research, trends: five } }); });
  await page.route('**/api/ai/plan', route => { briefs.push(String((route.request().postDataJSON() as { brief: string }).brief)); return route.fulfill({ json: { concepts } }); });
  await toIdeas(page);
  await page.getByRole('button', { name: 'Suggest 3 ad ideas', exact: true }).click();
  await expect(page.getByTestId('research-box')).toBeVisible();
  await page.getByRole('button', { name: 'Suggest 3 ad ideas', exact: true }).click();
  await expect.poll(() => briefs.length).toBe(2);
  expect(researchCalls).toBe(1);
  const named = (brief: string) => five.map(trend => trend.name).filter(name => brief.includes(name));
  // The second round starts with the two directions the first round did not use.
  const first = named(briefs[0]), second = named(briefs[1]);
  expect(first).toHaveLength(3);
  for (const name of five.map(trend => trend.name).filter(name => !first.includes(name))) expect(second).toContain(name);
});

async function seedAd(page: Page, withResearch: boolean) {
  await page.goto('/settings');
  await page.evaluate(async (saved) => {
    const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 50;
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), 'image/png'));
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('admorph-local-v1');
      open.onsuccess = () => { const db = open.result, tx = db.transaction(['savedAds'], 'readwrite');
        tx.objectStore('savedAds').put({ id: 'seeded-ad', blob, cutout: blob, source: 'oneshot', brand: { name: 'Sora', description: 'tea', colors: ['#111111', '#222222', '#333333'] }, headline: 'Calm tea', hasLogo: false, createdAt: new Date().toISOString(), ...(saved ? { research: saved } : {}) });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(new Error('seed failed')); };
      open.onerror = () => reject(new Error('open failed'));
    });
  }, withResearch ? { ...research, used: ['Alpha Look'] } : null);
}

test('copies reuse the research saved with the ad: no new search, one unused direction per copy', async ({ page }) => {
  test.setTimeout(120_000);
  let researchCalls = 0, brief = '';
  await seedAd(page, true);
  await page.route('**/api/ai/market-research', route => { researchCalls++; return route.fulfill({ json: research }); });
  await page.route('**/api/ai/plan', route => { brief = String((route.request().postDataJSON() as { brief: string }).brief); return route.fulfill({ json: { concepts } }); });
  await page.route('**/api/ai/ad-remix', route => route.fulfill({ body: pixel, contentType: 'image/png' }));
  await page.route('**/api/ai/verify-oneshot', route => route.fulfill({ json: verified }));
  await page.goto('/variants?ad=seeded-ad');
  await expect(page.getByTestId('remix-research-toggle')).toBeChecked();
  await page.getByRole('button', { name: 'Generate variants', exact: true }).click();
  await expect(page.getByTestId('remix-result')).toHaveCount(2, { timeout: 60_000 });
  expect(researchCalls).toBe(0);
  // Alpha was already used for this ad, so the two copies follow Beta and Gamma.
  expect(brief).toContain('Beta Look'); expect(brief).toContain('Gamma Look'); expect(brief).not.toContain('Alpha Look');
  expect(brief.length).toBeLessThanOrEqual(2000);
  const chips = await page.getByTestId('remix-inspired').locator('.research-chip').allTextContents();
  expect(chips.sort()).toEqual(['Beta Look', 'Gamma Look']);
  await expect(page.getByTestId('remix-inspired').first().getByRole('link', { name: 'behance.net' })).toBeVisible();
});

test('seasons search once per season, side by side, and say which direction each copy followed', async ({ page }) => {
  test.setTimeout(120_000);
  const seasons: string[] = [];
  await seedAd(page, false);
  await page.route('**/api/ai/market-research', async route => { seasons.push(String((route.request().postDataJSON() as { season?: string }).season)); await new Promise(resolve => setTimeout(resolve, 600)); return route.fulfill({ json: research }); });
  await page.route('**/api/ai/plan', route => route.fulfill({ json: { concepts } }));
  await page.route('**/api/ai/ad-remix', route => route.fulfill({ body: pixel, contentType: 'image/png' }));
  await page.route('**/api/ai/verify-oneshot', route => route.fulfill({ json: verified }));
  await page.goto('/themes?ad=seeded-ad');
  await page.getByRole('button', { name: 'Summer', exact: true }).click();
  await page.getByRole('button', { name: 'Generate themed copies', exact: true }).click();
  await expect(page.locator('.remix-go [data-testid="waiting-indicator"]')).toContainText('Researching current ad trends');
  await expect(page.getByTestId('remix-result')).toHaveCount(2, { timeout: 60_000 });
  expect(seasons.sort()).toEqual(['ramadan', 'summer']);
  await expect(page.getByTestId('remix-inspired')).toHaveCount(2);
});
