import { test, expect, type Page } from '@playwright/test';

async function tab(page: Page, name: string) {
  const button = page.getByRole('tab', { name, exact: true });
  if (await button.isVisible()) await button.click();
}

test('product-blend review offers a grade repair that lands on the creative', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // The sample product on the light sample backdrop blends in (contrast
  // ~1.20, observed), so the grade repair is offered; applying it sets the
  // grade to the lightest sample brand color.
  await page.goto('/campaigns/new');
  await page.getByRole('button', { name: 'Use sample product', exact: false }).click();
  await page.getByRole('button', { name: 'Create local sample concepts', exact: false }).click();
  const card = page.getByTestId('concept-card').first();
  await card.getByRole('button', { name: 'Approve concept', exact: false }).click();
  await card.getByRole('link', { name: 'Open design editor', exact: false }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make it your own.');
  await tab(page, 'Background');
  await page.getByRole('button', { name: 'Create local background', exact: true }).click();
  const review = page.getByTestId('background-review');
  await expect(review).toBeVisible({ timeout: 15000 });
  await review.getByRole('button', { name: 'Lighten background grade', exact: true }).click();
  await expect(page.getByTestId('studio-save')).toHaveText('Saved in this browser', { timeout: 10000 });
  const grade = await page.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open('admorph-local-v1');
    open.onsuccess = () => { const db = open.result, tx = db.transaction(['creatives'], 'readonly');
      const req = tx.objectStore('creatives').getAll();
      req.onsuccess = () => { const rows = req.result as { polish?: { grade: string | null } }[]; const hit = rows.find((row) => row.polish?.grade); resolve(hit ? hit.polish!.grade : null); };
      req.onerror = () => resolve('getall-error'); };
    open.onerror = () => resolve('open-error');
  }));
  expect(grade).toBe('#dce5bb');
  expect(errors).toEqual([]);
});
