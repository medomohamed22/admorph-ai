import { test, expect, type Page } from '@playwright/test';

async function tab(page: Page, name: string) {
  const button = page.getByRole('tab', { name, exact: true });
  if (await button.isVisible()) await button.click();
}

test('local review flags an Arabic headline forced to LTR', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/campaigns/new');
  await page.getByRole('button', { name: 'Use sample product', exact: false }).click();
  await page.getByRole('button', { name: 'Create local sample concepts', exact: false }).click();
  const card = page.getByTestId('concept-card').first();
  await card.getByRole('button', { name: 'Approve concept', exact: false }).click();
  await card.getByRole('link', { name: 'Open design editor', exact: false }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make it your own.');
  await tab(page, 'Layers');
  await page.locator('.studio-layers').getByRole('button', { name: 'Headline', exact: true }).click();
  await page.locator('#layer-text').fill('ساقعة على طول');
  await page.locator('#layer-dir').selectOption('ltr');
  await tab(page, 'Review');
  const finding = page.getByTestId('rule-direction_mismatch');
  await expect(finding).toBeVisible({ timeout: 15000 });
  await expect(finding).toContainText('Text direction conflicts with its content');
  expect(errors).toEqual([]);
});
