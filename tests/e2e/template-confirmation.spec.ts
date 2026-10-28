import { test, expect, type Page } from '@playwright/test';

async function tab(page: Page, name: string) {
  const button = page.getByRole('tab', { name, exact: true });
  if (await button.isVisible()) await button.click();
}

test('applied template stays visible in the select and survives reload', async ({ page }) => {
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
  const select = page.locator('#creative-template');
  await select.selectOption('split');
  await expect(select).toHaveValue('split');
  await expect(page.getByText('Current layout: Split')).toBeVisible();
  // Wait for the debounced save to commit before reloading: the save
  // indicator proves the Dexie write landed, so the reload must read it back.
  // (A reload inside the 400ms window is best-effort via the pagehide flush,
  // not a guaranteed commit, so the test does not assert that racy case.)
  await expect(page.getByTestId('studio-save')).toHaveText('Saved in this browser', { timeout: 10000 });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make it your own.');
  await tab(page, 'Layers');
  await expect(page.locator('#creative-template')).toHaveValue('split');
  await expect(page.getByText('Current layout: Split')).toBeVisible();
  expect(errors).toEqual([]);
});
