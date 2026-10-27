import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import en from '../../src/messages/en.json';
import ar from '../../src/messages/ar.json';

const PRODUCT = 'public/demo/sora-product.png';

async function abortMetaCalls(page: Page) {
  let calls = 0;
  const count = () => {
    calls++;
  };
  await page.route('**/api/ai/**', (route) => {
    count();
    return route.abort();
  });
  await page.route('**/api/providers/**', (route) => {
    count();
    return route.abort();
  });
  return () => calls;
}

async function runNoKeyAd(page: Page, strings: typeof en.autoRun, navigate = true) {
  const section = page.getByTestId('auto-run-tool');
  if (navigate) await page.goto('/auto-ads');
  await expect(section.getByRole('button', { name: strings.run, exact: true })).toBeDisabled();
  await section.getByLabel(strings.brandName, { exact: true }).fill('E2E Test Brand');
  await section.getByLabel(strings.category, { exact: true }).fill('canned cold brew');
  await section.getByLabel(strings.upload, { exact: true }).setInputFiles(PRODUCT);
  await section.getByLabel(strings.consentLabel, { exact: true }).check();
  const runButton = section.getByRole('button', { name: strings.run, exact: true });
  await expect(runButton).toBeEnabled();
  await runButton.click();
  await expect(
    section.getByRole('heading', { name: strings.results, exact: true }),
  ).toBeVisible({ timeout: 60000 });
  const steps = section.locator('ol[role="status"] li');
  await expect(steps).toHaveCount(6);
  for (const item of await steps.all()) {
    await expect(item).toContainText(strings.status.done);
  }
  return section;
}

test('no-key auto run builds a hero, survives reload, and makes no Meta call', async ({
  page,
}) => {
  test.setTimeout(120000);
  const apiCalls = await abortMetaCalls(page);
  const section = await runNoKeyAd(page, en.autoRun);
  await expect(section.locator('h4')).toContainText(en.autoRun.qualityLabels.verified, {
    timeout: 30000,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  const past = page.getByRole('button', { name: /E2E Test Brand/, exact: false }).first();
  await past.click();
  await expect(
    page.getByTestId('auto-run-tool').getByRole('heading', { name: en.autoRun.results, exact: true }),
  ).toBeVisible();
  expect(apiCalls()).toBe(0);
});

test('regenerating a background keeps product, text and caption, and marks the result modified', async ({
  page,
}) => {
  test.setTimeout(120000);
  const apiCalls = await abortMetaCalls(page);
  const section = await runNoKeyAd(page, en.autoRun);
  const caption = section.getByLabel(en.autoRun.caption, { exact: true });
  const beforeCaption = await caption.inputValue();
  const pressed = section.locator('button[aria-pressed="true"]');
  const beforeTagline = await pressed.first().innerText();
  await expect(section.locator('button[aria-pressed]')).toHaveCount(4);
  await section
    .getByRole('button', { name: en.autoRun.regenerateBackground, exact: true })
    .click();
  await expect(section.locator('h4')).toContainText(en.autoRun.qualityLabels.modified, {
    timeout: 30000,
  });
  await expect(caption).toHaveValue(beforeCaption);
  await expect(section.locator('button[aria-pressed]')).toHaveCount(4);
  await expect(pressed.first()).toHaveText(beforeTagline);
  expect(apiCalls()).toBe(0);
});

test('caption export and set ZIP carry the edited caption and every result image', async ({
  page,
}) => {
  test.setTimeout(120000);
  const apiCalls = await abortMetaCalls(page);
  const section = await runNoKeyAd(page, en.autoRun);
  const caption = section.getByLabel(en.autoRun.caption, { exact: true });
  await caption.fill('E2E edited caption');
  await section.getByRole('heading', { name: en.autoRun.results, exact: true }).click();
  const txtDownload = page.waitForEvent('download');
  await section
    .getByRole('button', { name: en.autoRun.downloadCaption, exact: true })
    .click();
  const txt = await (await txtDownload).path();
  expect(await readFile(txt!, 'utf8')).toBe('E2E edited caption');
  const zipDownload = page.waitForEvent('download');
  await section.getByRole('button', { name: en.autoRun.downloadZip, exact: true }).click();
  const zipPath = await (await zipDownload).path();
  const zip = await readFile(zipPath!);
  expect(zip.subarray(0, 2).toString('ascii')).toBe('PK');
  expect(zip.includes(Buffer.from('ad-1-caption.txt', 'ascii'))).toBe(true);
  expect(zip.includes(Buffer.from('ad-1.png', 'ascii'))).toBe(true);
  expect(zip.includes(Buffer.from('ad-4.png', 'ascii'))).toBe(true);
  expect(apiCalls()).toBe(0);
});

test('an invalid product fails with a retryable error, then a valid product succeeds', async ({
  page,
}) => {
  test.setTimeout(120000);
  const apiCalls = await abortMetaCalls(page);
  const section = page.getByTestId('auto-run-tool');
  await page.goto('/auto-ads');
  await section.getByLabel(en.autoRun.brandName, { exact: true }).fill('E2E Retry Brand');
  await section.getByLabel(en.autoRun.upload, { exact: true }).setInputFiles('package.json');
  await section.getByLabel(en.autoRun.consentLabel, { exact: true }).check();
  await section.getByRole('button', { name: en.autoRun.run, exact: true }).click();
  await expect(section.getByRole('alert')).toContainText(en.autoRun.preflight.product);
  await section.getByLabel(en.autoRun.upload, { exact: true }).setInputFiles(PRODUCT);
  await section.getByRole('button', { name: en.autoRun.run, exact: true }).click();
  await expect(
    section.getByRole('heading', { name: en.autoRun.results, exact: true }),
  ).toBeVisible({ timeout: 60000 });
  expect(apiCalls()).toBe(0);
});

test('Arabic RTL run exports a 1080x1350 PNG', async ({ page }) => {
  test.setTimeout(120000);
  const apiCalls = await abortMetaCalls(page);
  await page.goto('/auto-ads');
  // The language switch is a React handler and the provider's initial
  // settings load can overwrite a switch that lands before it resolves,
  // so retry until Arabic is actually stable on the page.
  const arabicRun = page
    .getByTestId('auto-run-tool')
    .getByRole('button', { name: ar.autoRun.run, exact: true });
  const englishSwitch = page.getByRole('button', { name: en.nav.switchLanguage, exact: true });
  for (let attempt = 0; attempt < 8; attempt++) {
    if ((await page.locator('html').getAttribute('dir')) === 'rtl') {
      try {
        await expect(arabicRun).toBeVisible({ timeout: 3000 });
        break;
      } catch {
        // The switch was overwritten mid-check; loop around and retry.
      }
    }
    if ((await englishSwitch.count()) > 0) await englishSwitch.first().click();
    else await page.waitForTimeout(500);
    if (attempt === 7) throw new Error('language switch never stabilized');
  }
  const section = await runNoKeyAd(page, ar.autoRun, false);
  const pngDownload = page.waitForEvent('download');
  await section.getByRole('button', { name: ar.autoRun.download, exact: true }).click();
  const pngPath = await (await pngDownload).path();
  const png = await readFile(pngPath!);
  expect(png.readUInt32BE(16)).toBe(1080);
  expect(png.readUInt32BE(20)).toBe(1350);
  expect(apiCalls()).toBe(0);
});
