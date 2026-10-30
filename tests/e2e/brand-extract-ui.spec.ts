import { test, expect } from '@playwright/test';
import en from '../../src/messages/en.json';

// The Meta call is intercepted and held for 2.5 s so the waiting moment is visible.
test('extracting a brand shows the photo being read, a seconds counter, then the result', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route('**/api/ai/brand-extract', async route => {
    await new Promise(resolve => setTimeout(resolve, 2500));
    await route.fulfill({ json: { suggestedName: 'Sora Matcha', primaryHex: '#52633c', secondaryHex: '#dce5bb', accentHex: '#f2d1bc', brandTone: 'Calm', shortDescriptionEn: 'Ceremonial matcha.', shortDescriptionAr: 'ماتشا.', recommendedFontEn: 'Inter', recommendedFontAr: 'Cairo', rationale: 'Fixture.' } });
  });
  await page.goto('/settings');
  await page.getByLabel('API key', { exact: true }).fill('fixture-extract-ui');
  await page.getByRole('link', { name: 'Brand kits', exact: true }).click();
  await page.getByRole('link', { name: en.brands.create, exact: false }).click();
  const section = page.getByTestId('brand-extraction');
  await section.getByLabel(en.meta.extractImage, { exact: true }).setInputFiles('public/demo/sora-product.png');
  // Colors measured on the device are pinned on the preview before any request.
  await expect(section.locator('.brand-extract-dot').first()).toBeVisible();
  await section.getByLabel(en.meta.shareImage, { exact: true }).check();
  await section.getByRole('button', { name: en.meta.extract, exact: true }).click();
  await expect(section.getByTestId('brand-extract-reading')).toBeVisible();
  await expect(section.locator('.brand-extract-scan')).toBeVisible();
  const busy = section.locator('.brand-extract-go');
  await expect(busy).toContainText(/Analyzing… [12]\.\d s/);
  const first = await busy.textContent();
  await page.waitForTimeout(600);
  expect(await busy.textContent()).not.toBe(first);
  const result = section.getByTestId('brand-suggestion');
  await expect(result.getByRole('heading', { name: 'Sora Matcha' })).toBeVisible({ timeout: 10000 });
  await expect(result).toContainText(/Read in [23]\.\d s/);
  await expect(result.locator('.brand-extract-swatches code')).toHaveText(['#52633C', '#DCE5BB', '#F2D1BC']);
  await expect(section.getByTestId('brand-extract-reading')).toHaveCount(0);
  await expect(section.getByRole('button', { name: en.meta.extract, exact: true })).toBeVisible();
});
