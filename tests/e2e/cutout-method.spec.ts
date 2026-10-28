import { test, expect } from '@playwright/test';

test('studio shows which cutout method produced the applied cutout', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/campaigns/new');
  await page.getByRole('button', { name: 'Use sample product', exact: false }).click();
  await page.getByRole('button', { name: 'Create local sample concepts', exact: false }).click();
  const card = page.getByTestId('concept-card').first();
  await card.getByRole('button', { name: 'Approve concept', exact: false }).click();
  await card.getByRole('link', { name: 'Open design editor', exact: false }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make it your own.');
  // No key is entered, so SAM is unavailable and any cutout here is local.
  const cutButton = page.getByRole('button', { name: 'Cut out product', exact: true });
  if (await cutButton.isVisible()) await cutButton.click();
  // The cutout is applied when the action flips to restoring the original.
  await expect(page.getByRole('button', { name: 'Use the original photo', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.studio-status')).toContainText('Local browser cutout');
  expect(errors).toEqual([]);
});

test('reused library cutout and reopened cutout keep showing their method', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/campaigns/new');
  await page.getByRole('button', { name: 'Use sample product', exact: false }).click();
  await page.getByRole('button', { name: 'Create local sample concepts', exact: false }).click();
  const cards = page.getByTestId('concept-card');
  const first = cards.first();
  await first.getByRole('button', { name: 'Approve concept', exact: false }).click();
  await first.getByRole('link', { name: 'Open design editor', exact: false }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make it your own.');
  const cutButton = page.getByRole('button', { name: 'Cut out product', exact: true });
  if (await cutButton.isVisible()) await cutButton.click();
  await expect(page.getByRole('button', { name: 'Use the original photo', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.studio-status')).toContainText('Local browser cutout');
  // Reopening the same creative keeps the method: the layer is already a cutout.
  await expect(page.getByTestId('studio-save')).toHaveText('Saved in this browser');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make it your own.');
  await expect(page.locator('.studio-status')).toContainText('Local browser cutout');
  // A fresh creative for the same product reuses the library cutout — and its method.
  await page.goBack();
  await page.locator('#campaign-autocutout').selectOption('local');
  const second = cards.nth(1);
  await second.getByRole('button', { name: 'Approve concept', exact: false }).click();
  await second.getByRole('link', { name: 'Open design editor', exact: false }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make it your own.');
  await expect(page.getByRole('button', { name: 'Use the original photo', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.studio-status')).toContainText('Local browser cutout');
  expect(errors).toEqual([]);
});
