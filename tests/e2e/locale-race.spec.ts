import { test, expect } from '@playwright/test';

// Reproduces the race behind the flaky Arabic tests: the language is picked
// while the stored workspace is still loading. Reads of the settings store
// are held back for 1.5 s so the tap always lands first.
test('a language picked while the workspace is loading is kept and saved', async ({ page }) => {
  await page.addInitScript(() => {
    const getAll = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (...args: Parameters<typeof getAll>) {
      const request = getAll.apply(this, args);
      if (this.name !== 'settings' || sessionStorage.getItem('slow-done')) return request;
      let handler: ((event: Event) => void) | null = null;
      request.addEventListener('success', event => { setTimeout(() => { sessionStorage.setItem('slow-done', '1'); handler?.call(request, event); }, 1500); });
      Object.defineProperty(request, 'onsuccess', { configurable: true, get: () => handler, set: value => { handler = value; } });
      return request;
    };
  });
  await page.goto('/settings');
  const arabic = page.getByRole('radio', { name: 'العربية' });
  await arabic.click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  // The slow load finishes; the choice must survive it.
  await page.waitForTimeout(2200);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(arabic).toHaveAttribute('aria-checked', 'true');
  // And it was saved: a reload (no slow read now) opens in Arabic.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('radio', { name: 'العربية' })).toHaveAttribute('aria-checked', 'true');
});
