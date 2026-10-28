import { expect, test } from '@playwright/test';

test('removed route /studio/sample redirects to one-shot', async ({ page }) => {
  await page.goto('/studio/sample');
  await expect(page).toHaveURL(/\/oneshot$/);
});
