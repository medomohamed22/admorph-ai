import { test, expect } from '@playwright/test';

test('sticky actions and nav adapt to the viewport', async ({ page }) => {
  const width = page.viewportSize()?.width ?? 1280;
  const isPhone = width <= 750;

  await page.goto('/oneshot');
  await expect(page.locator('.sticky-generate')).toBeVisible();
  await expect(page.locator('.generate-main')).toBeHidden();

  await page.goto('/settings');
  await expect(page.locator('.sticky-save')).toBeVisible();

  await page.goto('/');
  if (isPhone) {
    await expect(page.locator('.mobile-nav')).toBeVisible();
    await expect(page.locator('header nav .nav-page-link').first()).toBeHidden();
  } else {
    await expect(page.locator('.mobile-nav')).toBeHidden();
    await expect(page.locator('header nav .nav-page-link').first()).toBeVisible();
  }
});

test('no horizontal overflow on the main pages', async ({ page }) => {
  for (const path of ['/', '/oneshot', '/brands']) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow, `${path} overflows`).toBe(false);
  }
});
