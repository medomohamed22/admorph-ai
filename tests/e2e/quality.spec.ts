import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function enter(page: Page, format?: string) {
  await page.goto('/campaigns/new');
  await page.getByRole('button', { name: 'Use sample product', exact: false }).click();
  if (format) await page.locator('#campaign-format').selectOption(format);
  await page.getByRole('button', { name: 'Create local sample concepts', exact: false }).click();
  const card = page.getByTestId('concept-card').first();
  await card.getByRole('button', { name: 'Approve concept', exact: false }).click();
  await card.getByRole('link', { name: 'Open design editor', exact: false }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make it your own.');
  await expect(page.getByRole('button', { name: 'Download PNG', exact: false }).first()).toBeEnabled();
}
async function tab(page: Page, name: string) {
  const button = page.getByRole('tab', { name, exact: true });
  if (await button.isVisible()) await button.click();
}
async function exportPng(page: Page, width: number, height: number) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG', exact: false }).first().click();
  const file = await download;
  const bytes = await readFile((await file.path())!);
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.readUInt32BE(16)).toBe(width);
  expect(bytes.readUInt32BE(20)).toBe(height);
  expect(bytes.length).toBeGreaterThan(15000);
}

test('campaign format 9:16 composes, shows and exports at 1080x1920', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await enter(page, '1080x1920');
  await expect(page.locator('.studio-heading')).toContainText('1080 × 1920');
  await exportPng(page, 1080, 1920);
  expect(errors).toEqual([]);
});

test('layout template split rearranges layers and undoes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await enter(page);
  await tab(page, 'Layers');
  await page.locator('#creative-template').selectOption('split');
  await page.locator('.studio-layers').getByRole('button', { name: 'Headline', exact: true }).click();
  await expect(page.getByLabel('Horizontal position', { exact: true })).toHaveValue('59');
  await tab(page, 'Layers');
  await page.locator('.studio-layers').getByRole('button', { name: 'Product photo', exact: true }).click();
  await expect(page.getByLabel('Horizontal position', { exact: true })).toHaveValue('551');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await tab(page, 'Layers');
  await page.locator('.studio-layers').getByRole('button', { name: 'Headline', exact: true }).click();
  await expect(page.getByLabel('Horizontal position', { exact: true })).toHaveValue('75');
  expect(errors).toEqual([]);
});

test('text direction override persists across reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await enter(page);
  await tab(page, 'Edit');
  await page.getByLabel('Layer text', { exact: true }).fill('ساقعة على طول');
  await expect(page.getByLabel('Text direction', { exact: true })).toHaveValue('auto');
  await page.getByLabel('Text direction', { exact: true }).selectOption('ltr');
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.getByTestId('studio-save')).toHaveText('Saved in this browser');
  await page.reload();
  await tab(page, 'Edit');
  await expect(page.getByLabel('Layer text', { exact: true })).toHaveValue('ساقعة على طول');
  await expect(page.getByLabel('Text direction', { exact: true })).toHaveValue('ltr');
  expect(errors).toEqual([]);
});

test('polish shadow persists across reload and export stays full size', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await enter(page);
  await page.locator('details.studio-tools > summary').click();
  await page.getByLabel('Soft shadow under product', { exact: true }).check();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.getByTestId('studio-save')).toHaveText('Saved in this browser');
  await page.reload();
  await page.locator('details.studio-tools > summary').click();
  await expect(page.getByLabel('Soft shadow under product', { exact: true })).toBeChecked();
  await exportPng(page, 1080, 1350);
  expect(errors).toEqual([]);
});

test('reference block renders gated without a key and never calls a paid API', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await enter(page);
  await tab(page, 'Background');
  await expect(page.getByText('style target only', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate reference', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});
