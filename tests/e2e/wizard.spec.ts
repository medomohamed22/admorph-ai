import { test, expect } from '@playwright/test';
import { wizardStep } from './wizard';

test('wizard progress survives a reload and Start over clears it', async ({ page }) => {
  test.setTimeout(120_000);
  const mask = Buffer.alloc(300 * 330, 1);
  await page.route('**/api/ai/product-box', route => route.fulfill({ json: { left: 0, top: 0, right: 1, bottom: 1 } }));
  await page.route('**/api/ai/segment', route => route.fulfill({ json: { masks: [{ objectId: 'product', left: 0, top: 0, right: 300, bottom: 330, width: 300, height: 330, rasterBase64: mask.toString('base64') }] } }));
  await page.goto('/settings');
  await page.locator('#api-key').fill('fixture-wizard-key');
  await page.getByRole('link', { name: 'Create', exact: true }).click();
  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByTestId('cutout-compare')).toBeVisible();
  // The cutout plays the SAM reveal (edge glow and scan) once.
  await expect(page.getByTestId('sam-reveal').locator('.sam-scan')).toHaveCount(1);
  await wizardStep(page, 'Brand');
  await page.getByText('Edit brand details', { exact: true }).click();
  await page.getByLabel('Brand name').fill('Saved Sora');
  await page.getByLabel('Brand description').fill('Kept across a reload.');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByTestId('wizard-step-2')).toBeVisible();
  await page.waitForTimeout(800);

  await page.reload();
  await expect(page.getByText('Your last ad was restored from this device.')).toBeVisible();
  await expect(page.getByTestId('wizard-step-2')).toBeVisible();
  await wizardStep(page, 'Brand');
  await page.getByText('Edit brand details', { exact: true }).click();
  await expect(page.getByLabel('Brand name')).toHaveValue('Saved Sora');
  await wizardStep(page, 'Arrange');
  await expect(page.getByTestId('oneshot-canvas')).toBeVisible();

  await page.getByRole('button', { name: 'Start over', exact: true }).click();
  await expect(page.getByTestId('wizard-step-0')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByText('Your last ad was restored from this device.')).toHaveCount(0);
  await expect(page.getByTestId('upload-card-product')).not.toHaveClass(/done/);
});

test('the wizard reads right to left in Arabic', async ({ page }) => {
  await page.goto('/settings');
  // Wait for the stored workspace to load, so the choice is not overwritten.
  await expect(page.locator('#api-key')).toBeEnabled();
  await page.getByRole('radio', { name: 'العربية' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByRole('link', { name: 'إنشاء', exact: true }).click();
  await expect(page.getByTestId('wizard-step-0')).toBeVisible();
  await expect(page.getByRole('button', { name: 'التالي', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'السابق', exact: true })).toBeDisabled();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
});
