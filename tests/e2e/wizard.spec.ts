import { test, expect } from '@playwright/test';
import { wizardStep, fillBrand } from './wizard';

test('wizard progress survives a reload and Start over clears it', async ({ page }) => {
  test.setTimeout(120_000);
  const mask = Buffer.alloc(300 * 330, 1);
  await page.route('**/api/ai/product-box', route => route.fulfill({ json: { left: 0, top: 0, right: 1, bottom: 1 } }));
  await page.route('**/api/ai/segment', route => route.fulfill({ json: { masks: [{ objectId: 'product', left: 0, top: 0, right: 300, bottom: 330, width: 300, height: 330, rasterBase64: mask.toString('base64') }] } }));
  await page.goto('/settings');
  await page.locator('#api-key').fill('fixture-wizard-key');
  await page.getByRole('link', { name: 'Create', exact: true }).click();
  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByTestId('cutout-compare')).toBeVisible();
  // The cutout plays the SAM reveal (edge glow and scan) once.
  await expect(page.getByTestId('sam-reveal').locator('.sam-scan')).toHaveCount(1);
  await wizardStep(page, 'Brand');
  await page.getByText('Edit brand details', { exact: true }).click();
  await page.getByLabel('Brand name').fill('Saved Sora');
  await page.getByLabel('Brand description').fill('Kept across a reload.');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByTestId('wizard-step-2')).toBeVisible();
  await page.waitForTimeout(800);

  await page.reload();
  await expect(page.getByText('Your last ad was restored from this device.')).toBeVisible();
  await expect(page.getByTestId('wizard-step-2')).toBeVisible();
  await wizardStep(page, 'Brand');
  await page.getByText('Edit brand details', { exact: true }).click();
  await expect(page.getByLabel('Brand name')).toHaveValue('Saved Sora');
  await wizardStep(page, 'Arrange');
  await expect(page.getByTestId('oneshot-canvas')).toBeVisible();

  await page.getByRole('button', { name: 'Start over', exact: true }).click();
  await expect(page.getByTestId('wizard-step-0')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByText('Your last ad was restored from this device.')).toHaveCount(0);
  await expect(page.getByTestId('upload-card-product')).not.toHaveClass(/done/);
});

test('the wizard reads right to left in Arabic', async ({ page }) => {
  await page.goto('/settings');
  // Wait for the stored workspace to load, so the choice is not overwritten.
  await expect(page.locator('#api-key')).toBeEnabled();
  await page.getByRole('radio', { name: 'العربية' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByRole('link', { name: 'إنشاء', exact: true }).click();
  await expect(page.getByTestId('wizard-step-0')).toBeVisible();
  await expect(page.getByRole('button', { name: 'التالي', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'السابق', exact: true })).toBeDisabled();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
});

test('the dialect picker previews the tone and the planner receives the chosen dialect', async ({ page }) => {
  test.setTimeout(120_000);
  const mask = Buffer.alloc(300 * 330, 1);
  await page.route('**/api/ai/product-box', route => route.fulfill({ json: { left: 0, top: 0, right: 1, bottom: 1 } }));
  await page.route('**/api/ai/segment', route => route.fulfill({ json: { masks: [{ objectId: 'product', left: 0, top: 0, right: 300, bottom: 330, width: 300, height: 330, rasterBase64: mask.toString('base64') }] } }));
  let planBody: Record<string, unknown> | null = null;
  await page.route('**/api/ai/plan', async route => {
    planBody = route.request().postDataJSON();
    await route.fulfill({ json: { concepts: [
      { angle: 'offer', title: 'Gulf one', audienceAngle: 'thirsty youth', headline: 'طعمه يونّس', caption: 'First caption', visualDirection: 'Icy scene one' },
      { angle: 'benefit', title: 'Gulf two', audienceAngle: 'busy workers', headline: 'زين كل يوم', caption: 'Second caption', visualDirection: 'Icy scene two' },
      { angle: 'lifestyle', title: 'Gulf three', audienceAngle: 'friends out', headline: 'حلو مع الربع', caption: 'Third caption', visualDirection: 'Icy scene three' },
    ] } });
  });
  await page.goto('/settings');
  await page.locator('#api-key').fill('fixture-dialect-key');
  await page.getByRole('link', { name: 'Create', exact: true }).click();
  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByTestId('upload-card-product')).toHaveClass(/done/);
  await fillBrand(page);
  await wizardStep(page, 'Idea');
  // English interface: English copy is the starting choice.
  await expect(page.getByRole('radio', { name: 'English', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: 'Gulf', exact: true }).click();
  await expect(page.getByTestId('dialect-preview')).toContainText('يونّس من أول رشفة');
  await expect(page.getByTestId('dialect-preview')).toHaveAttribute('dir', 'rtl');
  await page.getByRole('button', { name: 'Suggest 3 ad ideas', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Gulf one — طعمه يونّس', exact: true })).toBeVisible();
  expect(planBody).toMatchObject({ dialect: 'ar_gulf', creativeLanguage: 'ar' });
});

test('deleting a saved ad in the gallery confirms with a toast', async ({ page }) => {
  await page.goto('/gallery');
  await expect(page.getByTestId('gallery-empty')).toBeVisible();
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 50;
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), 'image/png'));
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('admorph-local-v1');
      open.onsuccess = () => { const db = open.result, tx = db.transaction(['savedAds'], 'readwrite');
        tx.objectStore('savedAds').put({ id: crypto.randomUUID(), blob, source: 'oneshot', brand: { name: 'Toast Brand', description: 'x', colors: ['#111111', '#222222', '#333333'] }, headline: '', hasLogo: false, createdAt: new Date().toISOString() });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(new Error('seed failed')); };
      open.onerror = () => reject(new Error('open failed'));
    });
  });
  await page.reload();
  const card = page.getByTestId('gallery-card');
  await card.getByRole('button', { name: 'Delete', exact: true }).click();
  await card.getByRole('button', { name: 'Confirm delete', exact: true }).click();
  await expect(page.getByTestId('toast')).toHaveText('Saved ad deleted.');
  await expect(page.getByTestId('gallery-card')).toHaveCount(0);
  await expect(page.getByTestId('toast')).toHaveCount(0, { timeout: 6000 });
});
