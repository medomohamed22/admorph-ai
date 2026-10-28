import { test, expect } from '@playwright/test';

// Wordmark logo: the brand name rendered locally as a transparent PNG
// in the extracted wordmark style, saved with the brand kit. No AI call.
test('wordmark logo is generated from the brand name and saved', async ({ page }) => {
  await page.goto('/brands/new');
  await page.locator('#brand-name').fill('TALJ');
  await page.locator('#brand-description').fill('Canned cold brew for young people.');
  await page.getByRole('button', { name: 'Generate wordmark logo' }).click();
  await expect(page.locator('.logo-row')).toBeVisible();
  const save = page.getByRole('button', { name: 'Save Brand Kit' });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator('[data-testid="brand-card"]', { hasText: 'TALJ' })).toBeVisible();
});
