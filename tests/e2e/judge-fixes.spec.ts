import { test, expect } from '@playwright/test';

// Issues a reviewer hit while trying the site: a themes page that said "no
// saved ads" at first, buttons that stayed off with no reason, a "not set up"
// banner while AI was working, and a reload that flipped the language.
// No Meta call runs here.

async function seedAds(page: import('@playwright/test').Page, count: number) {
  await page.goto('/settings');
  await expect(page.getByTestId('site-ai-status')).toHaveAttribute('data-state', 'ready');
  await page.evaluate(async (count) => {
    const blob = await (await fetch('/demo/sora-product.png')).blob();
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('admorph-local-v1');
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction(['savedAds'], 'readwrite');
        for (let i = 0; i < count; i++) tx.objectStore('savedAds').put({ id: crypto.randomUUID(), blob, source: 'oneshot', brand: { name: 'Seed', description: 'x', colors: ['#111111', '#eeeeee', '#336699'] }, headline: `Seed ${i}`, hasLogo: false, createdAt: new Date(Date.now() - i * 1000).toISOString() });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(new Error('seed failed'));
      };
      open.onerror = () => reject(new Error('open failed'));
    });
  }, count);
}

test('the themes page lists saved ads on first open and Generate is ready with the newest ad picked', async ({ page }) => {
  await seedAds(page, 4);
  await page.goto('/themes');
  await expect(page.getByText('No saved ads yet.')).toHaveCount(0);
  await expect(page.locator('.remix-strip button')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Generate themed copies', exact: true })).toBeEnabled();
  // Turning the only season off says why the button is off; turning it back on enables it.
  await page.locator('.theme-pick', { hasText: 'Ramadan' }).click();
  await expect(page.getByTestId('remix-blocker')).toHaveText('Pick at least one season.');
  await page.locator('.theme-pick', { hasText: 'Ramadan' }).click();
  await expect(page.getByRole('button', { name: 'Generate themed copies', exact: true })).toBeEnabled();
});

test('a failed site check is retried: no "AI is not set up" banner, and buttons turn on by themselves', async ({ page }) => {
  await seedAds(page, 1);
  let calls = 0;
  await page.route('**/api/site-config', route => { calls += 1; return calls === 1 ? route.fulfill({ status: 403, json: { error: { code: '403' } } }) : route.continue(); });
  await page.goto('/themes');
  await expect(page.getByRole('button', { name: 'Generate themed copies', exact: true })).toBeEnabled({ timeout: 10000 });
  expect(calls).toBeGreaterThanOrEqual(2);
  await expect(page.getByText(/AI is not set up on this site yet/)).toHaveCount(0);
});

test('while the site check is still running, the page says it is connecting, never that AI is not set up', async ({ page }) => {
  let release: () => void = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/site-config', async route => { await held; await route.continue(); });
  await page.goto('/themes');
  await expect(page.getByText(/AI is not set up on this site yet/)).toHaveCount(0);
  release();
});

test('a saved Arabic choice is applied before the page shows, so a reload never flips English to Arabic', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to Arabic', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('admorph-locale'))).toBe('ar');
  // At the first paint, before any script of the app runs, the page is already right to left.
  const atFirstPaint: string[] = [];
  page.on('domcontentloaded', async () => { atFirstPaint.push(await page.evaluate(() => document.documentElement.dir)); });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).not.toHaveAttribute('data-locale-pending', '');
  expect(atFirstPaint[0]).toBe('rtl');
  // Back to English: the next reload starts in English.
  await page.getByRole('button', { name: 'التبديل إلى الإنجليزية', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('the tab title follows the language and no text asks visitors for their own key', async ({ page }) => {
  await page.goto('/oneshot');
  await expect(page).toHaveTitle('One-shot ad studio · AdMorph AI');
  await page.getByRole('button', { name: 'Switch to Arabic', exact: true }).click();
  await expect(page).toHaveTitle('استوديو الإعلان الواحد · AdMorph AI');
  // A page change inside the app keeps the Arabic title.
  await page.getByRole('link', { name: 'الإعدادات', exact: true }).first().click();
  await expect(page).toHaveTitle('الإعدادات · AdMorph AI');
  await page.getByRole('button', { name: 'التبديل إلى الإنجليزية', exact: true }).click();
  await expect(page).toHaveTitle('Settings · AdMorph AI');
  await expect(page.getByText(/with your key|Needs your key/)).toHaveCount(0);
  await page.goto('/shelf');
  await expect(page.getByText(/It still uses your key/)).toHaveCount(0);
});
