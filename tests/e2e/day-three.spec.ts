import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import ar from '../../src/messages/ar.json';

const fixtureKey = 'fixture-key-never-real';
const fixturePassphrase = 'fixture passphrase with enough length';
const catalog = { models: [{ id: 'fixture-text', name: 'Fixture Text', provider: 'meta', capabilities: ['text'], availability: 'unknown' }],
  fetchedAt: '2026-10-26T10:00:00.000Z', credentialStatus: 'accepted' };
async function persistedStore(page: Page, name: string): Promise<unknown[]> {
  return page.evaluate(store => new Promise<unknown[]>((resolve, reject) => {
    const open = indexedDB.open('admorph-local-v1');
    open.onerror = () => reject(new Error('fixture read failed'));
    open.onsuccess = () => {
      const db = open.result; const tx = db.transaction(store, 'readonly');
      const get = tx.objectStore(store).getAll();
      get.onsuccess = () => resolve(get.result);
      tx.oncomplete = () => db.close();
    };
  }), name);
}
async function fillBrand(page: Page) {
  await page.getByLabel('Brand name', { exact: true }).fill('Sora Test Brand');
  await page.getByLabel('Brand description', { exact: true }).fill('A portable brand with an editable story.');
  await page.getByLabel('Primary color HEX', { exact: true }).fill('#ffffff');
  await page.getByLabel('Secondary color HEX', { exact: true }).fill('#000000');
  await page.getByLabel('Accent color HEX', { exact: true }).fill('#29b8a0');
}

test('English remains the fresh-browser default even with an Arabic device locale', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'ar-EG', baseURL: 'http://localhost:3000' }); const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('One product.');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await context.close();
});

test('provider roles and catalogs persist, keys and request consent do not', async ({ page }) => {
  await page.route('**/api/providers/*', route => route.fulfill({ json: catalog }));
  await page.goto('/settings');
  await page.getByLabel('API key', { exact: true }).fill(fixtureKey);
  await page.getByLabel("I authorise one request for the chosen task. Tests may generate an image and incur charges. No automatic paid retries.", { exact: false }).check();
  await page.getByRole('button', { name: 'Fetch models', exact: true }).click();
  for(const role of ['planner','critic','edit'])await page.locator(`#meta-${role}`).fill('fixture-text');
  await page.getByRole('button', { name: 'Save Settings', exact: true }).click();
  await expect(page.locator('.request-status')).toContainText('Settings saved locally');
  await page.reload();
  await expect(page.locator('#meta-planner')).toHaveValue('fixture-text');
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
  await expect(page.getByLabel("I authorise one request for the chosen task. Tests may generate an image and incur charges. No automatic paid retries.", { exact: false })).not.toBeChecked();
  await expect(page.getByTestId('model-card')).toContainText('Unverified');
  await page.getByLabel('API key', { exact: true }).fill(fixtureKey);
  await expect(page.locator('#meta-planner')).toHaveValue('fixture-text');
  for (const name of ['settings', 'modelCatalogCache', 'encryptedCredentials']) {
    expect(JSON.stringify(await persistedStore(page, name))).not.toContain(fixtureKey);
  }
  await page.getByRole('button', { name: 'Clear cached catalogs', exact: true }).click();
  await expect(page.getByTestId('model-card')).toHaveCount(0);
  await expect(page.locator('#meta-planner')).toHaveValue('fixture-text');
});

test('optional encrypted credentials need a passphrase after reload and clear removes ciphertext', async ({ page }) => {
  await page.goto('/settings');
  await page.getByLabel('API key', { exact: true }).fill(fixtureKey);
  await page.getByText('Optional encrypted key storage', { exact: true }).click();
  await page.getByLabel('Encryption passphrase', { exact: true }).fill(fixturePassphrase);
  await page.getByRole('button', { name: 'Remember key on this device', exact: true }).click();
  await expect(page.locator('.vault-result')).toContainText('Encrypted key saved');
  await expect(page.getByLabel('Encryption passphrase', { exact: true })).toHaveValue('');
  const encrypted = JSON.stringify(await persistedStore(page, 'encryptedCredentials'));
  expect(encrypted).not.toContain(fixtureKey); expect(encrypted).not.toContain(fixturePassphrase);
  await page.reload();
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
  await page.getByText('Optional encrypted key storage', { exact: true }).click();
  await page.getByLabel('Encryption passphrase', { exact: true }).fill('wrong passphrase');
  await page.getByRole('button', { name: 'Unlock saved key', exact: true }).click();
  await expect(page.locator('.vault-result')).toContainText('Could not unlock');
  await page.getByLabel('Encryption passphrase', { exact: true }).fill(fixturePassphrase);
  await page.getByRole('button', { name: 'Unlock saved key', exact: true }).click();
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue(fixtureKey);
  await expect(page.getByLabel("I authorise one request for the chosen task. Tests may generate an image and incur charges. No automatic paid retries.", { exact: false })).not.toBeChecked();
  await page.getByRole('button', { name: 'Clear key', exact: true }).click();
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
  expect(await persistedStore(page, 'encryptedCredentials')).toEqual([]);
});

test('brand logo, palette, theme and portable import/export survive reload', async ({ page }, info) => {
  await page.goto('/brands/new'); await fillBrand(page);
  const logo = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#29b8a0'; ctx.fillRect(0, 0, 32, 32);
    return canvas.toDataURL('image/png');
  });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose logo', exact: true }).click();
  await (await chooser).setFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(logo.split(',')[1], 'base64') });
  await expect(page.locator('.logo-row img')).toBeVisible();
  await page.screenshot({ path: `test-results/${info.project.name}-day3-brand-form.png`, fullPage: true });
  await page.getByRole('button', { name: 'Save Brand Kit', exact: true }).click();
  await expect(page.getByTestId('brand-card')).toHaveCount(1); await page.reload();
  const card = page.getByTestId('brand-card').first();
  await expect(card.getByRole('heading')).toHaveText('Sora Test Brand');
  await expect(card.getByAltText('Brand logo', { exact: true })).toBeVisible();
  await expect(card.locator('.active-badge')).toHaveText('Active brand');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--coral').trim())).toBe('#ffffff');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary-fg').trim())).toBe('#000000');
  const downloadPromise = page.waitForEvent('download');
  await card.getByRole('button', { name: 'Export Brand Kit', exact: true }).click();
  const download = await downloadPromise; const json = await readFile((await download.path())!, 'utf8');
  expect(download.suggestedFilename()).toBe('brand-kit.json');
  const parsed = JSON.parse(json);
  expect(parsed.brand).toMatchObject({ name: 'Sora Test Brand', colors: ['#ffffff', '#000000', '#29b8a0'], logo });
  expect(json).not.toContain('apiKey'); expect(json).not.toContain('passphrase');
  await page.locator('#brand-import').setInputFiles({ name: 'brand-kit.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await expect(page.getByTestId('brand-card')).toHaveCount(2);
  const records = await persistedStore(page, 'brands') as { id: string }[];
  expect(new Set(records.map(record => record.id)).size).toBe(2);
  await page.getByTestId('brand-card').first().getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Brand name', { exact: true }).fill('Edited brand');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByTestId('brand-card').first()).toContainText('Edited brand');
  page.once('dialog', dialog => dialog.accept());
  await page.getByTestId('brand-card').first().getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByTestId('brand-card')).toHaveCount(1);
  await page.reload(); await expect(page.getByTestId('brand-card')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Arabic switching translates all screens, persists and preserves edits', async ({ page }, info) => {
  await page.goto('/brands/new'); await fillBrand(page);
  await page.getByRole('button', { name: 'Switch to Arabic', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByLabel(ar.brands.name, { exact: true })).toHaveValue('Sora Test Brand');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ar.brands.newTitle);
  await expect(page.locator('#brand-logo')).toBeHidden();
  await expect(page.getByRole('button', { name: ar.brands.chooseLogo, exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/${info.project.name}-day3-ar-brand.png`, fullPage: true });
  await page.getByRole('link', { name: ar.nav.settings, exact: false }).click();
  await page.getByLabel(ar.settings.language, { exact: true }).selectOption('en');
  await page.getByRole('link', { name: 'Brand kits', exact: true }).click();
  await page.getByRole('link', { name: 'Create a Brand Kit', exact: false }).click();
  await expect(page.getByLabel('Brand name', { exact: true })).toHaveValue('Sora Test Brand');
  await page.getByRole('button', { name: 'Switch to Arabic', exact: true }).click();
  for (const [route, heading] of [['/settings', ar.settings.title], ['/brands', ar.brands.title]]) {
    await page.goto(route); await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto('/settings');
  await expect(page.getByLabel(ar.settings.language, { exact: true })).toHaveValue('ar');
  await page.getByRole('button', { name: ar.settings.fetch, exact: true }).click();
  await expect(page.locator('.request-error[role=alert]')).toContainText(ar.settings.errors.missing_key);
  await page.screenshot({ path: `test-results/${info.project.name}-day3-ar-settings.png`, fullPage: true });
  await page.goto('/'); await expect(page.getByRole('heading', { level: 1 })).toContainText(ar.hero.title);
  await page.getByRole('button', { name: ar.nav.switchLanguage, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('One product.');
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('invalid import and scriptable/oversized logo inputs are rejected', async ({ page }) => {
  await page.goto('/brands');
  await page.locator('#brand-import').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"admorph-brand-kit","version":99}') });
  await expect(page.locator('.request-error')).toContainText('not a supported version 1');
  await expect(page.getByTestId('brand-card')).toHaveCount(0);
  await page.goto('/brands/new');
  await page.getByRole('button', { name: 'Save Brand Kit', exact: true }).click();
  await expect(page.locator('.request-error')).toContainText('Enter a name');
  await page.getByLabel('Logo (optional)', { exact: true }).setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg onload="alert(1)"/>') });
  await expect(page.locator('.request-error')).toContainText('PNG, JPEG or WebP');
  await page.getByLabel('Logo (optional)', { exact: true }).setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) });
  await expect(page.locator('.request-error')).toContainText('no larger than 2 MB');
});

test('storage failure keeps an exportable session and shows an honest warning', async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => { throw new DOMException('Fixture storage disabled', 'SecurityError'); };
  });
  await page.goto('/brands/new'); await fillBrand(page);
  await expect(page.locator('.storage-banner.warning')).toContainText('Local storage is unavailable');
  await page.getByRole('button', { name: 'Save Brand Kit', exact: true }).click();
  await expect(page.locator('.request-status')).toContainText('available in this tab only');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Brand Kit', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('brand-kit.json');
});

test('persistent-storage denial is shown without promising unlimited storage', async ({ page }) => {
  await page.addInitScript(() => { if (navigator.storage) navigator.storage.persist = async () => false; });
  await page.goto('/settings');
  await expect(page.getByText('Approximate storage usage', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Request persistent storage', exact: true }).click();
  await expect(page.locator('#setting-3')).toContainText('did not grant persistent storage');
});

test('quota failure does not claim a saved brand or delete the exportable draft', async ({ page }) => {
  await page.goto('/brands/new'); await fillBrand(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'brands') throw new DOMException('Fixture quota exceeded', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Save Brand Kit', exact: true }).click();
  await expect(page.locator('.request-status')).toContainText('available in this tab only');
  await expect(page.locator('.storage-banner.warning')).toBeVisible();
  expect(await persistedStore(page, 'brands')).toEqual([]);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Brand Kit', exact: true }).click();
  const json = await readFile((await (await pending).path())!, 'utf8');
  expect(JSON.parse(json).brand.name).toBe('Sora Test Brand');
});
