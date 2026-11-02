import { test, expect } from '@playwright/test';
import ar from '../../src/messages/ar.json';
test('hackathon build record distinguishes recorded work from future plans in both languages', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Hackathon build log', exact: false }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Building, one real step at a time.');
  await expect(page.getByText('26 October–4 November 2026', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Planned next', exact: true })).toBeVisible();
  await expect(page.getByText('All three Meta models run live on the production site', { exact: false })).toBeVisible();
  await expect(page.getByText('not an independent measure', { exact: false })).toBeVisible();
  // The page must not claim that live verification is still pending.
  await expect(page.getByText(/verification pending|have not been demonstrated/i)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Official event page', exact: false })).toHaveAttribute('href', 'https://cerebralvalley.ai/e/meta-ai-developer-hackathon');
  await page.getByRole('button', { name: 'Switch to Arabic', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ar.hackathon.title);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/${info.project.name}-hackathon-ar.png`, fullPage: true });
});
