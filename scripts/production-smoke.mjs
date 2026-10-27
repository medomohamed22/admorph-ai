import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';

const base = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const ar = JSON.parse(await readFile(new URL('../src/messages/ar.json', import.meta.url), 'utf8'));
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
  await page.getByRole('button', { name: 'التبديل إلى الإنجليزية', exact: true }).click();
  await page.getByTestId('concept-card').first().getByRole('link', { name: 'Open design editor', exact: false }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make it your own.');
  await expect(page.getByRole('button', { name: 'Download PNG', exact: false }).first()).toBeEnabled();
  await page.getByLabel('Layer text', { exact: true }).fill('Production studio verification');
  await page.getByRole('tab', { name: 'Background', exact: true }).click();
  await page.getByRole('button', { name: 'Create local background', exact: true }).click();
  await expect(page.locator('.studio-status').getByText('Local sample background · no AI request', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download PNG', exact: false }).first()).toBeEnabled();
  const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download PNG', exact: false }).first().click();
  const png = await readFile((await (await downloaded).path()));
  expect(png.readUInt32BE(16)).toBe(1080); expect(png.readUInt32BE(20)).toBe(1350);
  await writeFile('test-results/production-studio-export.png', png);
  await page.getByRole('button', { name: 'Save now', exact: true }).click(); await expect(page.getByTestId('studio-save')).toHaveText('Saved in this browser');
  await page.reload(); await expect(page.getByLabel('Layer text', { exact: true })).toHaveValue('Production studio verification');
  await page.getByRole('button', { name: 'Switch to Arabic', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('اجعله على ذوقك.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/production-studio-ar.png', fullPage: true });
  await page.getByRole('button', { name: 'راجع التصميم', exact: true }).click();
  await expect(page.getByTestId('local-review-status')).toBeVisible();
  await page.getByRole('tab', { name: 'التعديل', exact: true }).click();
  await page.getByLabel('نص الطبقة', { exact: true }).fill('عنوان عربي طويل لا يتسع داخل المربع الصغير ويحتاج إلى مراجعة واضحة');
  await page.getByLabel('حجم الخط', { exact: true }).fill('160'); await page.getByLabel('ارتفاع الطبقة', { exact: true }).fill('24');
  await page.getByLabel('لون النص', { exact: true }).fill('#ffffff');
  await page.getByRole('button', { name: 'راجع التصميم', exact: true }).click();
  await expect(page.getByTestId('rule-text_clipped')).toBeVisible(); await expect(page.getByTestId('rule-contrast_unavailable')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/production-critic-ar.png', fullPage: true });
  await expect(page.getByRole('button', { name: 'راجع باستخدام Meta', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: ar.repair.local, exact: true }).click();
  await expect(page.getByRole('button', { name: ar.repair.apply, exact: true })).toBeEnabled();
  await page.getByRole('button', { name: ar.repair.preview, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const comparison = await page.getByRole('dialog').locator('img').evaluateAll(images => images.map(image => image.src));
  expect(comparison).toHaveLength(2); expect(comparison[0]).not.toBe(comparison[1]);
  for (const [index, source] of comparison.entries()) { const bytes = Buffer.from(source.split(',')[1], 'base64'); expect(bytes.readUInt32BE(16)).toBe(1080); expect(bytes.readUInt32BE(20)).toBe(1350); await writeFile(`test-results/repair-${index ? 'after' : 'before'}.png`, bytes); }
  await page.screenshot({ path: 'test-results/production-repair-comparison-ar.png', fullPage: true });
  await page.getByRole('button', { name: ar.repair.close, exact: true }).click();
  await page.getByRole('button', { name: ar.repair.apply, exact: true }).click();
  await expect(page.getByTestId('repair-receipt')).toContainText(ar.repair.saved);
  await expect(page.getByTestId('rule-text_clipped')).toHaveCount(0); await expect(page.getByTestId('rule-contrast')).toHaveCount(0);
  await page.reload(); await page.getByRole('tab', { name: ar.studio.tabs.review, exact: true }).click();
  await page.getByRole('button', { name: ar.repair.undo, exact: true }).click(); await expect(page.getByTestId('rule-text_clipped')).toBeVisible();
  await page.getByRole('button', { name: ar.repair.redo, exact: true }).click(); await expect(page.getByTestId('rule-text_clipped')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const health = await page.request.get(`${base}/api/health`);
  expect((await health.json()).milestone).toBe('meta-only-m12');
  const noKey = await page.request.post(`${base}/api/providers/models`, { headers: { Origin: base }, data: { providerId: 'meta', apiKey: '', consent: true } });
  expect(noKey.status()).toBe(400); expect(await noKey.json()).toEqual({ error: { code: 'missing_key' } });
  const custom = await page.request.post(`${base}/api/providers/models`, { headers: { Origin: base }, data: { providerId: 'custom', apiKey: '', consent: true } });
  expect(custom.status()).toBe(400);
  const unsafePlan = await page.request.post(`${base}/api/ai/plan`, { headers: { Origin: 'https://untrusted.test' }, data: {} });
  expect(unsafePlan.status()).toBe(403);
  const incompletePlan = await page.request.post(`${base}/api/ai/plan`, { headers: { Origin: base }, data: {} });
  expect(incompletePlan.status()).toBe(400);
  const unsafeImage = await page.request.post(`${base}/api/ai/background`, { headers: { Origin: 'https://untrusted.test' }, data: {} });
  expect(unsafeImage.status()).toBe(403);
  const incompleteImage = await page.request.post(`${base}/api/ai/background`, { headers: { Origin: base }, data: {} });
  expect(incompleteImage.status()).toBe(400);
  const unsafeCritic = await page.request.post(`${base}/api/ai/critic`, { headers: { Origin: 'https://untrusted.test' }, data: {} });
  expect(unsafeCritic.status()).toBe(403);
  const incompleteCritic = await page.request.post(`${base}/api/ai/critic`, { headers: { Origin: base }, data: {} });
  expect(incompleteCritic.status()).toBe(400);
  for (const path of ['/api/ai/repairs','/api/ai/brand-extract','/api/ai/shift-copy','/api/ai/product-makeover','/api/providers/task-test','/api/providers/meta-smoke']) {
    expect((await page.request.post(`${base}${path}`, { headers: { Origin: 'https://untrusted.test' }, data: {} })).status()).toBe(403);
    expect((await page.request.post(`${base}${path}`, { headers: { Origin: base }, data: {} })).status()).toBe(400);
  }
  expect(errors).toEqual([]);
  // Auto-ads: one full no-key run in the browser, then a ZIP download.
  const sharp = (await import('sharp')).default;
  const smokeProduct = await sharp({
    create: { width: 400, height: 400, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([
      {
        input: await sharp({
          create: { width: 200, height: 200, channels: 3, background: { r: 22, g: 16, b: 12 } },
        })
          .png()
          .toBuffer(),
        top: 100,
        left: 100,
      },
    ])
    .png()
    .toBuffer();
  await page.goto(`${base}/auto-ads`);
  await expect(page.getByTestId('auto-run-tool')).toBeVisible();
  // The earlier sections leave the persisted locale on Arabic; let that
  // load settle, then force English so the rest of the section can use
  // the English labels. Without the settle, the flip can land mid-form.
  await page.waitForTimeout(1000);
  if ((await page.locator('html').getAttribute('dir')) === 'rtl') {
    await page.getByRole('button', { name: 'التبديل إلى الإنجليزية', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Build the ad', exact: true })).toBeDisabled();
  }
  await page.getByLabel('Brand name', { exact: true }).fill('Smoke auto brand');
  await page.getByLabel('Product category', { exact: true }).fill('canned cold brew');
  await page
    .getByLabel('Product photo', { exact: true })
    .setInputFiles({ name: 'smoke-product.png', buffer: smokeProduct, mimeType: 'image/png' });
  await page.getByLabel('I agree to run the local steps', { exact: true }).check();
  await page.getByRole('button', { name: 'Build the ad', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Results', exact: true })).toBeVisible();
  await expect(page.locator('h4')).toContainText('Verified');
  const zipEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download set (ZIP)', exact: true }).click();
  const zipBytes = await readFile((await (await zipEvent).path()));
  expect(zipBytes.subarray(0, 2).toString('ascii')).toBe('PK');
  expect(zipBytes.includes(Buffer.from('ad-1.png', 'ascii'))).toBe(true);
  await page.screenshot({ path: 'test-results/production-auto-ads.png', fullPage: true });
  const result = { checkedAtUTC: new Date().toISOString(), base, mode: 'local-production-build',
    passed: ['home', 'hackathon-en-ar', 'mobile-overflow', 'brand-save-reload', 'campaign-sample-edit-approve-reload-en-ar', 'studio-layers-background-edit-reload-ar-png-1080x1350', 'automatic-critic-real-text-clipping-contrast-unavailable-ar', 'approved-repair-real-before-after-1080x1350', 'repair-reload-undo-redo', 'health', 'missing-key', 'custom-proxy-rejection', 'image-origin-and-consent-guards', 'critic-origin-and-consent-guards', 'repair-and-meta-origin-consent-guards', 'auto-ads-no-key-run-verified-zip'],
    browserErrors: errors, paidApiCalls: false, remoteDeploymentVerified: false };
  await writeFile('test-results/production-smoke.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally { await browser.close(); }
