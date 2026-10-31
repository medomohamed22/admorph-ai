import { test, expect } from '@playwright/test';

// The plan's screen matrix: five widths, both languages, every main page.
// Runs once (desktop project); each width gets its own viewport. Every
// page must fit without horizontal scrolling, and a screenshot is kept in
// test-results for review.
const WIDTHS = [360, 390, 768, 1280, 1440];
const PAGES = ['/', '/oneshot', '/shelf', '/gallery', '/brands', '/settings', '/variants', '/themes'];

for (const locale of ['en', 'ar'] as const) {
  test(`every main page fits at 360–1440px in ${locale === 'en' ? 'English' : 'Arabic'}`, async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop', 'one matrix run is enough');
    test.setTimeout(240_000);
    const context = await browser.newContext({ locale: locale === 'ar' ? 'ar-EG' : 'en-US', baseURL: 'http://localhost:3000' });
    const page = await context.newPage();
    if (locale === 'ar') { await page.goto('/'); await page.getByRole('button', { name: 'Switch to Arabic' }).click(); await expect(page.locator('html')).toHaveAttribute('dir', 'rtl'); }
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      for (const path of PAGES) {
        await page.goto(path);
        await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
        await page.waitForTimeout(400);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} at ${width}px (${locale}) overflows by ${overflow}px`).toBeLessThanOrEqual(1);
        await page.screenshot({ path: `test-results/screens/${locale}-${width}${path === '/' ? '-home' : path.replace(/\//g, '-')}.png` });
      }
    }
    await context.close();
  });
}
