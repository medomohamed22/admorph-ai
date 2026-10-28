import { test, expect, type Page } from '@playwright/test';

async function tab(page: Page, name: string) {
  const button = page.getByRole('tab', { name, exact: true });
  if (await button.isVisible()) await button.click();
}

test('local dark background triggers the pixel review and the text auto-fix', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // An all-dark brand makes the local brand-color backdrop dark, so the dark
  // sample headline is unreadable on it until the review fixes the color.
  await page.goto('/brands/new');
  await page.locator('#brand-name').fill('Dark test brand');
  await page.locator('#brand-description').fill('A test brand with an all-dark palette.');
  const hexInputs = page.locator('.palette-input input[dir="ltr"]');
  await hexInputs.nth(0).fill('#16100c');
  await hexInputs.nth(1).fill('#241a12');
  await hexInputs.nth(2).fill('#33241a');
  await page.locator('form button[type="submit"]').click();
  await page.goto('/brands');
  await expect(page.getByTestId('brand-card').filter({ hasText: 'Dark test brand' })).toBeVisible();
  await page.goto('/campaigns/new');
  await page.getByRole('button', { name: 'Use sample product', exact: false }).click();
  // NB: the sample-product button resets the brand to the sample brand, so
  // the dark brand must be picked after it, not before.
  await page.locator('#campaign-brand').selectOption({ label: 'Dark test brand' });
  await page.getByRole('button', { name: 'Create local sample concepts', exact: false }).click();
  const card = page.getByTestId('concept-card').first();
  await card.getByRole('button', { name: 'Approve concept', exact: false }).click();
  await card.getByRole('link', { name: 'Open design editor', exact: false }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make it your own.');
  await tab(page, 'Background');
  await page.getByRole('button', { name: 'Create local background', exact: true }).click();
  const review = page.getByTestId('background-review');
  await expect(review).toBeVisible({ timeout: 15000 });
  await expect(review).toContainText('Text color adjusted to the lightest brand color for readability (undoable).');
  // The fix landed on the headline layer itself, not just in the note.
  await tab(page, 'Layers');
  await page.locator('.studio-layers').getByRole('button', { name: 'Headline', exact: true }).click();
  await expect(page.locator('#layer-color')).toHaveValue('#33241a');
  expect(errors).toEqual([]);
});
