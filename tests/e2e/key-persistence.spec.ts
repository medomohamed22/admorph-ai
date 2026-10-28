import { test, expect, type Page } from '@playwright/test';

const TEST_KEY = 'test-only-persistence-key';
const PASSPHRASE = 'test-passphrase-1234';

async function openVault(page: Page) {
  // The vault details auto-open when a key is present with no saved copy, or
  // when a saved copy exists with an empty session. Fall back to the summary
  // click if the auto-open has not fired yet.
  const input = page.locator('#vault-passphrase');
  if (!(await input.isVisible())) await page.locator('details.credential-vault > summary').click();
  await expect(input).toBeVisible();
}

test('API key survives reload through the encrypted vault and survives in-site navigation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/settings');
  const keyField = page.locator('#api-key');
  await expect(keyField).toBeEnabled();
  await keyField.fill(TEST_KEY);
  await openVault(page);
  await page.locator('#vault-passphrase').fill(PASSPHRASE);
  const remember = page.getByRole('button', { name: 'Remember key on this device', exact: true });
  await expect(remember).toBeEnabled();
  await remember.click();
  await expect(page.locator('.vault-result')).toHaveText('Encrypted key saved. The passphrase field has been cleared.');

  // Full reload wipes the in-memory key by design; the vault must restore it.
  await page.reload();
  await expect(page.locator('#api-key')).toHaveValue('');
  await openVault(page);
  await expect(page.locator('.vault-result, details.credential-vault')).toContainText('An encrypted key is saved on this device.');
  await page.locator('#vault-passphrase').fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock saved key', exact: true }).click();
  await expect(page.locator('.vault-result')).toHaveText('Key unlocked into memory. Request consent is still required.');
  await expect(page.locator('#api-key')).toHaveValue(TEST_KEY);

  // Client-side navigation inside the site must not wipe the session key.
  await page.getByRole('link', { name: 'Campaigns', exact: true }).click();
  await expect(page).toHaveURL(/\/campaigns/);
  await page.getByRole('link', { name: '⚙ Settings', exact: true }).click();
  await expect(page.locator('#api-key')).toHaveValue(TEST_KEY);

  // Locking clears the session key but keeps the vault record restorable.
  const lock = page.getByRole('button', { name: 'Lock session keys', exact: true });
  if (await lock.isVisible()) {
    await lock.click();
    await expect(page.locator('#api-key')).toHaveValue('');
    await openVault(page);
    await page.locator('#vault-passphrase').fill(PASSPHRASE);
    await page.getByRole('button', { name: 'Unlock saved key', exact: true }).click();
    await expect(page.locator('#api-key')).toHaveValue(TEST_KEY);
    await page.getByRole('button', { name: 'Forget saved key', exact: true }).click();
    await expect(page.locator('.vault-result')).toHaveText('Saved encrypted key removed.');
  }
  expect(errors).toEqual([]);
});
