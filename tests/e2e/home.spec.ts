import { test, expect } from '@playwright/test';

test('home shows the value line, the photo-to-post story and the three models', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('From a phone photo to an Instagram ad in a minute, in your dialect.');
  // The hero tells the story: phone photo -> AdMorph's three models -> the finished ad as a post preview.
  const hero = page.getByTestId('hero-flow');
  await expect(hero).toBeVisible();
  await expect(hero.getByRole('img', { name: 'Finished ad' })).toBeVisible();
  await expect(hero.locator('.hero-flow-steps li')).toHaveText([/SAM 3\.1/, /Muse Spark/, /Muse Image/]);
  await expect(hero.locator('.hero-post')).toContainText('monoaudio');
  await expect(hero.locator('.hero-post')).toContainText('Preview as a post');
  // A preview, not a claim: no likes or other made-up numbers.
  await expect(hero.locator('.hero-post')).not.toContainText(/likes|\d{2,}/);
  // The hero is a real before/after (the phone photo and the ad made from it), so no sample label.
  await expect(page.getByTestId('home-sample-note')).toHaveCount(0);
  const powered = page.locator('.home-powered li');
  await expect(powered).toHaveCount(3);
  await expect(powered).toContainText(['Muse Spark 1.3', 'SAM 3.1', 'Muse Image 1.0']);
  // Real showcase ads, each with its certificate score.
  const showcase = page.getByTestId('home-showcase-ad');
  await expect(showcase).toHaveCount(3);
  await expect(showcase.first()).toContainText('Certificate 100/100');
  // Each showcase ad names its real product type, never a placeholder like "Other".
  await expect(showcase.locator('figcaption span')).toHaveText(['Home · 1:1', 'Beauty · 1:1', 'Drinkware · 1:1']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('home shows the visitor\'s own saved ads when there are some', async ({ page }) => {
  await page.goto('/gallery');
  await expect(page.getByTestId('gallery-empty')).toBeVisible();
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 50;
    canvas.getContext('2d')!.fillRect(0, 0, 40, 50);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), 'image/png'));
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('admorph-local-v1');
      open.onsuccess = () => { const db = open.result, tx = db.transaction(['savedAds'], 'readwrite');
        tx.objectStore('savedAds').put({ id: crypto.randomUUID(), blob, source: 'oneshot', brand: { name: 'Home Brand', description: 'x', colors: ['#111111', '#222222', '#333333'] }, headline: 'Hello', hasLogo: false, createdAt: new Date().toISOString() });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(new Error('seed failed')); };
      open.onerror = () => reject(new Error('open failed'));
    });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your latest ads' })).toBeVisible();
  await expect(page.getByTestId('home-saved-ad')).toHaveCount(1);
  await expect(page.getByTestId('home-saved-ad')).toContainText('Home Brand');
});

test('home reads right to left in Arabic with the story mirrored', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'ar-EG', baseURL: 'http://localhost:3000' });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to Arabic' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('من صورة موبايل إلى إعلان Instagram في دقيقة، بلهجتك.');
  const hero = page.getByTestId('hero-flow');
  await expect(hero.locator('.hero-post')).toContainText('معاينة كمنشور');
  await expect(hero.locator('.hero-flow-steps li').first()).toContainText('يقصّ المنتج');
  // In Arabic the story reads right to left: the phone sits on the right of the post.
  const phone = await hero.locator('.hero-phone').boundingBox(), post = await hero.locator('.hero-post').boundingBox();
  expect(phone!.x).toBeGreaterThan(post!.x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});

test('the site has its own icon, a link preview card and a title per page', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('AdMorph AI — From a phone photo to a ready ad');
  const head = page.locator('head');
  await expect(head.locator('link[rel="icon"][href^="/icon.svg"]')).toHaveCount(1);
  await expect(head.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  const og = await head.locator('meta[property="og:image"]').getAttribute('content');
  expect(og).toMatch(/^https:\/\/admorph-ai-app\.vercel\.app\/opengraph-image\.png/);
  await expect(head.locator('meta[property="og:image:alt"]')).toHaveAttribute('content', /phone photo/);
  await expect(head.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  for (const path of ['/icon.svg', '/apple-icon.png', '/favicon.ico', '/opengraph-image.png']) expect((await request.get(path)).ok(), path).toBe(true);
  for (const [path, title] of [['/shelf', 'Shelf to campaign'], ['/oneshot', 'One-shot ad studio'], ['/gallery', 'My gallery'], ['/hackathon', 'Hackathon build log']]) {
    await page.goto(path);
    await expect(page).toHaveTitle(`${title} · AdMorph AI`);
  }
});
