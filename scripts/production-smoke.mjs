import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.SMOKE_BASE_URL ?? 'http://localhost:3101';
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('One product.');
  await page.getByRole('link', { name: 'Hackathon build log', exact: false }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Building, one real step at a time.');
  await expect(page.getByText('26 October–4 November 2026', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Switch to Arabic', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('نبني المشروع، خطوة فعلية كل مرة.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/production-hackathon-ar.png', fullPage: true });
  await page.getByRole('button', { name: 'التبديل إلى الإنجليزية', exact: true }).click();
  await page.goto(`${base}/brands/new`);
  await page.getByLabel('Brand name', { exact: true }).fill('Production verification brand');
  await page.getByLabel('Brand description', { exact: true }).fill('Synthetic local-only production smoke data.');
  await page.getByRole('button', { name: 'Save Brand Kit', exact: true }).click();
  await expect(page.getByTestId('brand-card')).toHaveCount(1);
  await page.reload(); await expect(page.getByTestId('brand-card')).toHaveCount(1);
  await page.goto(`${base}/campaigns/new`);
  await page.getByRole('button', { name: 'Use sample product', exact: false }).click();
  await page.getByRole('button', { name: 'Create local sample concepts', exact: false }).click();
  await expect(page.getByTestId('concept-card')).toHaveCount(3);
  await page.getByTestId('concept-card').first().getByLabel('Headline', { exact: true }).fill('Verified production campaign');
  await page.getByTestId('concept-card').first().getByRole('button', { name: 'Approve concept', exact: false }).click();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.getByTestId('campaign-save')).toHaveText('Saved in this browser');
  await page.reload();
  await expect(page.getByTestId('concept-card').first().getByLabel('Headline', { exact: true })).toHaveValue('Verified production campaign');
  await expect(page.getByTestId('concept-card').first().getByRole('button', { name: 'Reopen concept', exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/production-campaign-en.png', fullPage: true });
  await page.getByRole('button', { name: 'Switch to Arabic', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('حملتك القادمة تبدأ هنا.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/production-campaign-ar.png', fullPage: true });
  const health = await page.request.get(`${base}/api/health`);
  expect((await health.json()).milestone).toBe(4);
  const noKey = await page.request.post(`${base}/api/providers/models`, { headers: { Origin: base }, data: { providerId: 'gemini', apiKey: '', consent: true } });
  expect(noKey.status()).toBe(400); expect(await noKey.json()).toEqual({ error: { code: 'missing_key' } });
  const custom = await page.request.post(`${base}/api/providers/models`, { headers: { Origin: base }, data: { providerId: 'custom', apiKey: '', consent: true } });
  expect(custom.status()).toBe(400);
  const unsafePlan = await page.request.post(`${base}/api/ai/plan`, { headers: { Origin: 'https://untrusted.test' }, data: {} });
  expect(unsafePlan.status()).toBe(403);
  const incompletePlan = await page.request.post(`${base}/api/ai/plan`, { headers: { Origin: base }, data: {} });
  expect(incompletePlan.status()).toBe(400);
  expect(errors).toEqual([]);
  const result = { checkedAtUTC: new Date().toISOString(), base, mode: 'local-production-build',
    passed: ['home', 'hackathon-en-ar', 'mobile-overflow', 'brand-save-reload', 'campaign-sample-edit-approve-reload-en-ar', 'health', 'missing-key', 'custom-proxy-rejection'],
    browserErrors: errors, paidApiCalls: false, remoteDeploymentVerified: false };
  await writeFile('test-results/production-smoke.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally { await browser.close(); }
