import { expect, test } from '@playwright/test';

test('removed route /auto-ads redirects to one-shot', async ({ page }) => {
  await page.goto('/auto-ads');
  await expect(page).toHaveURL(/\/oneshot$/);
});
