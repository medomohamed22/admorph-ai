import { expect, test } from '@playwright/test';
import en from '../../src/messages/en.json';

test('landing points to one-shot and brands', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('One product.');
  await page.locator('.hero-actions a[href="/oneshot"]').click();
  await expect(page).toHaveURL(/\/oneshot$/);
  await page.goto('/');
  await page.locator('.hero-actions a[href="/brands"]').click();
  await expect(page).toHaveURL(/\/brands$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('Meta-only settings handles no-key requests', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Meta', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fetch models', exact: true }).click();
  await expect(page.locator('.request-error[role=alert]')).toContainText('Enter a key');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('navigation shells and health', async ({ page, request }) => {
  for (const [route, text] of [['/brands', en.brands.title], ['/brands/new', en.brands.newTitle], ['/oneshot', en.oneshot.title], ['/settings', en.settings.title]]) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(text);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const health = await request.get('/api/health');
  expect(health.ok()).toBe(true);
  expect(await health.json()).toMatchObject({ status: 'ok', milestone: 'meta-only-m12', aiProvider: 'meta' });
});
