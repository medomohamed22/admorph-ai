// Explicit opt-in: public read-only OpenRouter catalog, never generation or a user credential.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:3000/settings');
  await page.getByRole('button', { name: 'OpenRouter', exact: true }).click();
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
  await page.getByLabel('I allow this request', { exact: false }).check();
  const pending = page.waitForResponse(response => response.url().endsWith('/api/providers/models') && response.request().method() === 'POST', { timeout: 60000 });
  await page.getByRole('button', { name: 'Fetch models', exact: true }).click();
  const response = await pending;
  expect(response.ok()).toBe(true);
  await expect(page.getByText('Catalog only · credential not tested', { exact: true })).toBeVisible();
  const count = Number.parseInt(await page.locator('.catalog-summary strong').innerText(), 10);
  expect(count).toBeGreaterThan(0);
  const textId = await page.locator('#quick-model option').nth(1).getAttribute('value');
  expect(textId).toBeTruthy();
  await page.getByLabel('Text model for Planner, Critic and Edit command', { exact: true }).selectOption(textId);
  await page.getByRole('button', { name: 'Use for text roles', exact: true }).click();
  await page.getByRole('button', { name: 'Save Settings', exact: true }).click();
  await expect(page.locator('.saved-summary')).toContainText(textId);
  await expect(page.locator('.request-status')).toContainText('Settings saved locally');
  await page.reload();
  await expect(page.locator('.saved-summary')).toContainText(textId);
  await expect(page.getByText('Saved catalog · credentials not verified in this session', { exact: true })).toBeVisible();
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
  await page.getByLabel('Model capability', { exact: true }).selectOption('image_output');
  await expect(page.getByTestId('model-card').first()).toContainText('Image output');
  const imageCount = Number.parseInt(await page.locator('[aria-live="polite"]').innerText(), 10);
  await page.screenshot({ path: 'test-results/live-openrouter-settings.png', fullPage: true });
  expect(errors).toEqual([]);
  const report = { verifiedAt: new Date().toISOString(), source: 'live-public-openrouter-catalog', httpStatus: response.status(),
    models: count, credentialStatus: 'not_tested', credentialsUsed: false,
    generationCalled: false, persistedAcrossReload: true, quickTextSelection: textId, browserErrors: errors,
    imageOutputModels: imageCount, screenshot: 'test-results/live-openrouter-settings.png' };
  await writeFile('test-results/live-catalog.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
