import { test, expect } from '@playwright/test';

// Mode 2 entry: the campaign asks how the product photo is, and the
// "needs improvement" mode opens the makeover expanded. The makeover is
// enhance-only: no recreate option, and the note says shape, colors
// and lettering stay as they are.
test('mode entry opens enhance-only makeover', async ({ page }) => {
  await page.goto('/campaigns/new');
  await page.getByRole('button', { name: 'Use sample product' }).click();
  await expect(page.getByRole('button', { name: 'Request Meta variant' })).toBeHidden();
  await page.getByRole('radio', { name: 'My product photo needs improvement' }).check();
  await expect(page.getByText('Enhance only: the product shape, colors and lettering stay as they are.')).toBeVisible();
  await expect(page.getByText('Recreate Photo')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Request Meta variant' })).toBeVisible();
  await page.getByRole('radio', { name: 'My product photo is ready' }).check();
  await expect(page.getByText('Enhance only: the product shape, colors and lettering stay as they are.')).toBeHidden();
});
