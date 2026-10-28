import { test, expect } from '@playwright/test';

// Makeover limit: a Meta edit result larger than 2 MB must be accepted
// for comparison (the old code rejected it with the upload cap), and the
// accepted variant must be fitted back under 2 MB so later Meta calls
// that send the product still pass the server's 2 MiB input cap.
test('makeover accepts a large Meta result and fits the accepted variant', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings');
  await expect(page.locator('#api-key')).toBeEnabled();
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('admorph-local-v1');
    open.onerror = () => reject(new Error('db open failed'));
    open.onblocked = () => reject(new Error('db blocked'));
    open.onsuccess = () => { const db = open.result, tx = db.transaction(['settings'], 'readwrite');
      const store = tx.objectStore('settings');
      store.put({ key: 'providerSettings', value: { provider: 'meta', customBaseUrl: '', roles: { planner: { provider: 'meta', modelId: 'fixture-planner' }, image: { provider: 'meta', modelId: 'fixture-image' }, critic: { provider: 'meta', modelId: 'fixture-critic' }, edit: { provider: 'meta', modelId: 'fixture-edit' } } } });
      store.put({ key: 'metaExtraRoles', value: { image_edit: { provider: 'meta', modelId: 'fixture-edit' } } });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(new Error('seed transaction failed')); };
      tx.onabort = () => { db.close(); reject(new Error('seed transaction aborted')); }; };
  }));
  await page.reload();
  await page.locator('#api-key').fill('fixture-makeover-key');

  // SPA navigation only: a full reload would wipe the in-memory key.
  await page.getByRole('link', { name: 'Campaigns', exact: true }).click();
  await page.getByRole('button', { name: 'Use sample product' }).click();
  await page.getByRole('radio', { name: 'My product photo needs improvement' }).check();

  // A genuinely valid, noisy PNG well over 2 MB, as Meta would return.
  const big = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600; canvas.height = 1600;
    const ctx = canvas.getContext('2d')!;
    const data = ctx.createImageData(1600, 1600);
    for (let i = 0; i < data.data.length; i += 4) {
      data.data[i] = Math.floor(Math.random() * 256);
      data.data[i + 1] = Math.floor(Math.random() * 256);
      data.data[i + 2] = Math.floor(Math.random() * 256);
      data.data[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return [...new Uint8Array(await blob!.arrayBuffer())];
  });
  expect(big.length).toBeGreaterThan(2 * 1024 * 1024);
  await page.route('**/api/ai/product-makeover', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(big) }));

  await page.locator('details.feature-card input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Request Meta variant' }).click();
  await expect(page.getByTestId('makeover-comparison')).toBeVisible({ timeout: 30000 });

  await page.getByRole('button', { name: 'Accept variant for future concepts' }).click();
  await expect(page.getByRole('button', { name: 'Use saved variant' })).toBeVisible();
  const storedSize = await page.evaluate(() => new Promise<number | null>((resolve) => {
    const open = indexedDB.open('admorph-local-v1');
    open.onerror = () => resolve(null);
    open.onsuccess = () => { const db = open.result;
      const tx = db.transaction(['productVariants', 'assets'], 'readonly');
      const variantsReq = tx.objectStore('productVariants').getAll();
      variantsReq.onsuccess = () => {
        const rows = variantsReq.result as { assetId: string; approved: boolean }[];
        const row = rows.find((item) => item.approved);
        if (!row) { db.close(); resolve(null); return; }
        const assetReq = tx.objectStore('assets').get(row.assetId);
        assetReq.onsuccess = () => { const asset = assetReq.result as { blob: Blob } | undefined; db.close(); resolve(asset ? asset.blob.size : null); };
        assetReq.onerror = () => { db.close(); resolve(null); };
      };
      variantsReq.onerror = () => { db.close(); resolve(null); };
    };
  }));
  expect(storedSize).not.toBeNull();
  expect(storedSize!).toBeLessThanOrEqual(2 * 1024 * 1024);
});
