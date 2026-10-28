import { expect, test } from '@playwright/test';

test('removed route /campaigns/new redirects to one-shot', async ({ page }) => {
  await page.goto('/campaigns/new');
  await expect(page).toHaveURL(/\/oneshot$/);
});
