import { test, expect } from '@playwright/test';

test('sticky actions and nav adapt to the viewport', async ({ page }) => {
  const width = page.viewportSize()?.width ?? 1280;
  const isPhone = width <= 860;

  await page.goto('/oneshot');
  await expect(page.locator('.sticky-generate')).toBeVisible();
  await expect(page.locator('.generate-main')).toBeHidden();

  await page.goto('/');
  if (isPhone) {
    await expect(page.locator('.bottom-nav')).toBeVisible();
    await expect(page.locator('.site-nav')).toBeHidden();
  } else {
    await expect(page.locator('.bottom-nav')).toBeHidden();
    await expect(page.locator('.site-nav')).toBeVisible();
  }

  // The sliding indicator follows the current page.
  await page.goto('/settings');
  const nav = page.locator(isPhone ? '.bottom-nav' : '.site-nav');
  await expect(nav.locator('a[aria-current=page]')).toHaveAttribute('href', '/settings');
  const pill = await nav.locator('.nav-pill').boundingBox(), link = await nav.locator('a[aria-current=page]').boundingBox();
  expect(pill && link && Math.abs(pill.x - link.x) < 2 && Math.abs(pill.width - link.width) < 2).toBe(true);
});

test('no horizontal overflow on the main pages', async ({ page }) => {
  for (const path of ['/', '/oneshot', '/gallery', '/brands', '/settings', '/variants', '/themes']) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow, `${path} overflows`).toBe(false);
  }
});
