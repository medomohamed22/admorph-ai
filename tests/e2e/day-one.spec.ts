import { expect, test } from '@playwright/test';
import en from '../../src/messages/en.json';

test('landing points to the wizard and the gallery', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('From a phone photo to an Instagram ad');
  await page.locator('.home-actions a[href="/oneshot"]').click();
  await expect(page).toHaveURL(/\/oneshot$/);
  await page.goto('/');
  await page.locator('.home-actions a[href="/shelf"]').click();
  await expect(page).toHaveURL(/\/shelf$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('settings shows the three fixed Meta models and needs a key before testing', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'The three models', exact: true })).toBeVisible();
  for (const model of ['spark', 'sam', 'image']) {
    const card = page.getByTestId(`model-${model}`);
    await expect(card).toContainText('Needs your key');
    await expect(card.getByRole('button', { name: /^Test/ })).toBeDisabled();
  }
  await page.getByLabel('API key', { exact: true }).fill('fixture-key-never-real');
  await expect(page.getByTestId('model-spark').getByRole('button', { name: /^Test/ })).toBeEnabled();
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
