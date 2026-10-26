import { test, expect, type Page } from '@playwright/test';

const fixtureKey = 'fixture-key-not-real';
const models = [
  { id: 'fixture/text', name: 'Fixture Text', provider: 'gemini', capabilities: ['text'], availability: 'unknown' },
  { id: 'fixture/vision', name: 'Fixture Vision', provider: 'gemini', capabilities: ['text', 'vision'], availability: 'available' },
  { id: 'fixture/image', name: 'Fixture Image', provider: 'gemini', capabilities: ['image_output'], availability: 'available' },
];
const catalog = { models, fetchedAt: '2026-10-26T10:00:00.000Z', credentialStatus: 'accepted' };
async function setup(page: Page) {
  // Browser fixtures exercise UI states. Adapter/real handler behavior is tested separately in unit tests.
  await page.route('**/api/providers/*', route => route.fulfill({ json: catalog }));
  await page.goto('/settings');
  await page.getByLabel('API key', { exact: true }).fill(fixtureKey);
  await page.getByLabel('I allow this request', { exact: false }).check();
}

test('no key and consent guards do not send provider requests', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/providers/*', route => { requests++; return route.abort(); });
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Fetch models', exact: true }).click();
  await expect(page.locator('.request-error[role=alert]')).toContainText('Enter a key');
  await page.getByLabel('API key', { exact: true }).fill(fixtureKey);
  await page.getByRole('button', { name: 'Test connection', exact: true }).click();
  await expect(page.locator('.request-error[role=alert]')).toContainText('Accept the request consent');
  expect(requests).toBe(0);
});

test('catalog filters, image-role guard, quick setup and session save work', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await setup(page);
  await page.getByRole('button', { name: 'Fetch models', exact: true }).click();
  await expect(page.getByTestId('model-card')).toHaveCount(3);
  await expect(page.getByText('Credential accepted by the provider', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search models', exact: true }).fill('vision');
  await expect(page.getByTestId('model-card')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search models', exact: true }).fill('');
  await page.getByLabel('Model capability', { exact: true }).selectOption('image_output');
  await expect(page.getByTestId('model-card')).toHaveCount(1);
  await expect(page.getByTestId('model-card')).toContainText('Fixture Image');
  await page.getByLabel('Model capability', { exact: true }).selectOption('all');
  await page.getByLabel('Available only (provider-reported)', { exact: true }).check();
  await expect(page.getByTestId('model-card')).toHaveCount(2);
  await page.getByLabel('Available only (provider-reported)', { exact: true }).uncheck();
  await page.getByLabel('Text model for Planner, Critic and Edit command', { exact: true }).selectOption('fixture/text');
  await page.getByRole('button', { name: 'Use for text roles', exact: true }).click();
  await page.getByText('Advanced: per-role provider and model', { exact: true }).click();
  await expect(page.locator('#role-image option[value="fixture/text"]')).toBeDisabled();
  await page.getByLabel('Image maker model', { exact: true }).selectOption('fixture/image');
  await page.getByRole('button', { name: 'Save Settings', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Settings saved locally');
  await expect(page.locator('.saved-summary')).toContainText('fixture/image');
  await page.getByRole('button', { name: 'Show key', exact: true }).click();
  await expect(page.getByLabel('API key', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide key', exact: true }).click();
  await page.getByRole('link', { name: 'Brand kits', exact: true }).click();
  await page.getByRole('link', { name: 'Settings', exact: false }).click();
  await expect(page.locator('.saved-summary')).toContainText('fixture/text');
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue(fixtureKey);
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain(fixtureKey);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/${info.project.name}-day2-settings.png`, fullPage: true });
  await page.getByRole('button', { name: 'Clear key', exact: true }).click();
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
  await expect(page.getByTestId('model-card')).toHaveCount(3);
  await expect(page.locator('.saved-summary')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('keys remain scoped to providers and disappear on reload', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'OpenRouter', exact: true }).click();
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Gemini', exact: true }).click();
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue(fixtureKey);
  await page.reload();
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('I allow this request', { exact: false })).not.toBeChecked();
});

test('per-role providers mix without discarding previously loaded catalogs', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Fetch models', exact: true }).click();
  await page.getByLabel('Text model for Planner, Critic and Edit command', { exact: true }).selectOption('fixture/text');
  await page.getByRole('button', { name: 'Use for text roles', exact: true }).click();
  await page.route('**/api/providers/*', route => route.fulfill({ json: {
    ...catalog, credentialStatus: 'not_tested',
    models: models.map(model => ({ ...model, provider: 'openrouter', id: `router/${model.id}` })),
  } }));
  await page.getByRole('button', { name: 'OpenRouter', exact: true }).click();
  await page.getByLabel('I allow this request', { exact: false }).check();
  await page.getByRole('button', { name: 'Fetch models', exact: true }).click();
  await page.getByText('Advanced: per-role provider and model', { exact: true }).click();
  await page.getByLabel('Image maker provider', { exact: true }).selectOption('openrouter');
  await page.getByLabel('Image maker model', { exact: true }).selectOption('router/fixture/image');
  await page.getByRole('button', { name: 'Save Settings', exact: true }).click();
  await expect(page.locator('.saved-summary')).toContainText('Gemini / fixture/text');
  await expect(page.locator('.saved-summary')).toContainText('OpenRouter / router/fixture/image');
  await page.getByRole('button', { name: 'Gemini', exact: true }).click();
  await expect(page.getByTestId('model-card')).toHaveCount(3);
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue(fixtureKey);
  await expect(page.locator('.saved-summary')).toContainText('OpenRouter / router/fixture/image');
});

test('401, empty, retry and cancellation states are explicit', async ({ page }) => {
  await setup(page);
  await page.route('**/api/providers/*', route => route.fulfill({ status: 401, json: { error: { code: 'unauthorized' } } }));
  await page.getByRole('button', { name: 'Test connection', exact: true }).click();
  await expect(page.locator('.request-error[role=alert]')).toContainText('provider rejected this key');
  await page.route('**/api/providers/*', route => route.fulfill({ json: { ...catalog, models: [] } }));
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('No models match these filters.', { exact: true })).toBeVisible();
  await page.route('**/api/providers/*', async route => { await new Promise(resolve => setTimeout(resolve, 500)); await route.fulfill({ json: catalog }).catch(() => {}); });
  await page.getByRole('button', { name: 'Fetch models', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fetch models', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Request cancelled');
  await page.waitForTimeout(600);
  await expect(page.getByTestId('model-card')).toHaveCount(0);
});

test('manual text IDs require acknowledgment and cannot assign image role', async ({ page }) => {
  await page.goto('/settings');
  await page.getByText('Manual model ID fallback', { exact: true }).click();
  await page.getByLabel('Manual model ID · Gemini', { exact: true }).fill('fixture-manual-text');
  await page.getByRole('button', { name: 'Assign text model', exact: true }).click();
  await expect(page.locator('.request-error[role=alert]')).toContainText('Acknowledge the limitations');
  await page.getByLabel('I understand this text model', { exact: false }).check();
  await page.getByRole('button', { name: 'Assign text model', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Manual text model assigned');
  await expect(page.locator('#manual-role option[value="image"]')).toHaveCount(0);
  await page.getByText('Advanced: per-role provider and model', { exact: true }).click();
  await expect(page.getByLabel('Planner model', { exact: true })).toHaveValue('fixture-manual-text');
  await page.getByRole('button', { name: 'Save Settings', exact: true }).click();
  await expect(page.locator('.request-error[role=alert]')).toContainText('Select models for Planner, Critic and Edit command');
});

test('custom requests are direct HTTPS, require endpoint consent and show CORS errors', async ({ page }) => {
  let serverRequests = 0, directRequests = 0;
  await page.route('**/api/providers/*', route => { serverRequests++; return route.abort(); });
  await page.route('https://example.com/v1/models', route => {
    directRequests++;
    return route.fulfill({ json: { data: [{ id: 'custom-text', output_modalities: ['text'] }] },
      headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Custom', exact: true }).click();
  await page.getByLabel('API base URL', { exact: true }).fill('http://example.com/v1');
  await page.getByLabel('I allow this request', { exact: false }).check();
  await page.getByRole('button', { name: 'Fetch models', exact: true }).click();
  await expect(page.locator('.request-error[role=alert]')).toContainText('valid HTTPS');
  expect(directRequests).toBe(0);
  await page.getByLabel('API base URL', { exact: true }).fill('https://example.com/v1');
  await expect(page.getByLabel('I allow this request', { exact: false })).not.toBeChecked();
  await page.getByLabel('I allow this request', { exact: false }).check();
  await page.getByRole('button', { name: 'Fetch models', exact: true }).click();
  await expect(page.getByTestId('model-card')).toHaveCount(1);
  await expect(page.getByText('Endpoint reachable · credential validity not confirmed', { exact: true })).toBeVisible();
  await page.route('https://example.com/v1/models', route => route.abort('failed'));
  await page.getByRole('button', { name: 'Fetch models', exact: true }).click();
  await expect(page.locator('.request-error[role=alert]')).toContainText('Check CORS');
  expect(serverRequests).toBe(0);
});

test('real local API rejects unsafe forwarding, missing keys and missing origin', async ({ request }) => {
  const headers = { Origin: 'http://localhost:3000' };
  const noKey = await request.post('/api/providers/models', { headers, data: { providerId: 'gemini', apiKey: '', consent: true } });
  expect(noKey.status()).toBe(400); expect(await noKey.json()).toEqual({ error: { code: 'missing_key' } });
  const custom = await request.post('/api/providers/models', { headers, data: { providerId: 'custom', apiKey: '', consent: true } });
  expect(custom.status()).toBe(400); expect(await custom.json()).toEqual({ error: { code: 'custom_server' } });
  const crossOrigin = await request.post('/api/providers/test', { data: { providerId: 'gemini', apiKey: fixtureKey, consent: true } });
  expect(crossOrigin.status()).toBe(403);
  expect(await crossOrigin.text()).not.toContain(fixtureKey);
});
