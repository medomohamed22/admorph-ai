import { test, expect } from '@playwright/test';

// Swap product on the same generated background, no Meta key: the swap
// uses the local cutout, and the variant ZIP is built locally.
test('swap product keeps the same background and exports variants', async ({ page }) => {
  await page.goto('/campaigns/new');
  await page.getByRole('button', { name: 'Use sample product' }).click();
  await page.getByRole('button', { name: 'Create local sample concepts' }).click();
  await page.locator('[data-testid="concept-card"]').first().getByRole('button', { name: 'Approve concept' }).click();
  await page.getByRole('link', { name: 'Open design editor' }).click();
  await expect(page.getByRole('heading', { name: 'Make it your own.' })).toBeVisible();

  // Desktop shows every panel at once; the tab bar is mobile-only.
  const swap = page.locator('.swap-product');
  await expect(swap.getByText('Swap product on this background')).toBeVisible();
  await swap.locator('input[type="file"]').setInputFiles('public/demo/sora-product.png');
  await swap.getByRole('button', { name: 'Swap product' }).click();
  await expect(swap.getByText('Recent products')).toBeVisible();
  await expect(swap.getByText('Could not cut the new product.')).toHaveCount(0);

  // Swap back to the earlier cutout, then snapshot and ZIP the variants.
  await swap.locator('.text-button').first().click();
  await expect(swap.getByText('Could not cut the new product.')).toHaveCount(0);
  await swap.getByRole('button', { name: 'Snapshot this look' }).click();
  await expect(swap.getByText('Look saved.')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await swap.getByRole('button', { name: 'Download variants ZIP' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('admorph-variants.zip');
});
