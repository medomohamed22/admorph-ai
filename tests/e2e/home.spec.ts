import { test, expect } from '@playwright/test';

test('home shows the value line, a working before/after and the three models', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('From a phone photo to an Instagram ad in a minute, in your dialect.');
  const slider = page.getByRole('slider', { name: 'Compare before and after' });
  await expect(slider).toBeVisible();
  // Keyboard moves the divider; the "after" image is clipped to match.
  await slider.focus();
  await page.waitForTimeout(3500); // let the one-time intro sweep finish
  await slider.fill('20');
  await expect(page.locator('.ba-after')).toHaveAttribute('style', /inset\(0px 80% 0px 0px\)/);
  // The hero is a real before/after (the phone photo and the ad made from it), so no sample label.
  await expect(page.getByTestId('home-sample-note')).toHaveCount(0);
  const powered = page.locator('.home-powered li');
  await expect(powered).toHaveCount(3);
  await expect(powered).toContainText(['Muse Spark 1.3', 'SAM 3.1', 'Muse Image 1.0']);
  // Real showcase ads, each with its certificate score.
  const showcase = page.getByTestId('home-showcase-ad');
  await expect(showcase).toHaveCount(3);
  await expect(showcase.first()).toContainText('Certificate 100/100');
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

test('home reads right to left in Arabic with the before/after mirrored', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'ar-EG', baseURL: 'http://localhost:3000' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('من صورة موبايل إلى إعلان Instagram في دقيقة، بلهجتك.');
  const slider = page.getByRole('slider', { name: 'قارن قبل وبعد' });
  await page.waitForTimeout(3500);
  await slider.fill('20');
  await expect(page.locator('.ba-after')).toHaveAttribute('style', /inset\(0px 0px 0px 80%\)/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
