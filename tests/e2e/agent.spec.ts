import { wizardStep } from './wizard';
import { test, expect, type Page } from '@playwright/test';

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const mask = Buffer.alloc(300 * 330, 1);

// Every Meta route is intercepted: no paid call runs in these tests.
async function prepare(page: Page) {
  await page.route('**/api/ai/product-box', route => route.fulfill({ json: { left: 0, top: 0, right: 1, bottom: 1 } }));
  await page.route('**/api/ai/segment', route => route.fulfill({ json: { masks: [{ objectId: 'product', left: 0, top: 0, right: 300, bottom: 330, width: 300, height: 330, rasterBase64: mask.toString('base64') }] } }));
  await page.goto('/settings');
  await page.locator('#api-key').fill('fixture-agent-key');
  await page.getByRole('link', { name: 'Create', exact: true }).click();
  await page.getByLabel('Product photo', { exact: true }).setInputFiles('public/demo/sora-product.png');
  await page.getByRole('button', { name: 'Isolate background', exact: true }).click();
  await expect(page.getByTestId('upload-card-product')).toHaveClass(/done/);
  await wizardStep(page, 'Brand');
  await page.getByText('Edit brand details', { exact: true }).click();
  await page.getByLabel('Brand name').fill('Sora');
  await page.getByLabel('Brand description').fill('A sample ceremonial matcha brand.');
}

test('the agent shows each step with its model, time and result', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  const agent = page.getByTestId('agent-pipeline');
  await wizardStep(page, 'Generate');
  await expect(agent.getByTestId('agent-step-locate')).toHaveAttribute('data-status', 'done');
  await expect(agent.getByTestId('agent-step-locate')).toContainText('Muse Spark 1.3');
  await expect(agent.getByTestId('agent-step-cutout')).toHaveAttribute('data-status', 'done');
  await expect(agent.getByTestId('agent-step-cutout')).toContainText('SAM 3.1');
  await expect(agent.getByTestId('agent-step-cutout')).toContainText('Cut from the Muse Spark box');
  await expect(agent.getByTestId('agent-step-paint')).toHaveAttribute('data-status', 'waiting');

  await page.route('**/api/ai/oneshot', async route => { await new Promise(resolve => setTimeout(resolve, 1200)); await route.fulfill({ body: pixel, contentType: 'image/png' }); });
  await page.route('**/api/ai/verify-oneshot', route => route.fulfill({ json: { productKept: true, productNote: 'same can', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [] } }));
  await wizardStep(page, 'Generate');
  const generate = page.getByRole('button', { name: 'Generate finished ad', exact: true });
  await expect(generate).toBeEnabled({ timeout: 30000 });
  await generate.click();
  await expect(agent.getByTestId('agent-step-paint')).toHaveAttribute('data-status', 'running');
  await expect(agent.getByTestId('agent-step-paint')).toContainText('Muse Image 1.0');
  await expect(agent.getByTestId('agent-step-critic')).toHaveAttribute('data-status', 'done', { timeout: 30000 });
  await expect(agent.getByTestId('agent-step-critic')).toContainText('Certificate 100/100');
  await expect(agent.getByTestId('agent-step-check')).toHaveAttribute('data-status', 'done');
  await expect(agent.getByTestId('agent-step-repair')).toHaveCount(0);

  // Show details opens the structured request without the key.
  await agent.getByTestId('agent-step-paint').getByRole('button', { name: 'Show details', exact: true }).click();
  const details = agent.getByTestId('agent-step-paint').locator('.agent-details');
  await expect(details).toContainText('muse-image-1.0');
  await expect(details).not.toContainText('fixture-agent-key');
});

test('a low critic score sends its notes back to the painter once and shows both versions', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  const paints: { fixNotes?: string[] }[] = [];
  let verifies = 0;
  await page.route('**/api/ai/oneshot', route => { paints.push(route.request().postDataJSON()); return route.fulfill({ body: pixel, contentType: 'image/png' }); });
  await page.route('**/api/ai/verify-oneshot', route => {
    verifies += 1;
    return route.fulfill({ json: verifies === 1
      ? { productKept: false, productNote: 'bottle became a can', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [] }
      : { productKept: true, productNote: 'same bottle', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [] } });
  });
  await wizardStep(page, 'Generate');
  const generate = page.getByRole('button', { name: 'Generate finished ad', exact: true });
  await expect(generate).toBeEnabled({ timeout: 30000 });
  await generate.click();
  const repair = page.getByTestId('agent-step-repair');
  await expect(repair).toHaveAttribute('data-status', 'done', { timeout: 30000 });
  await expect(repair).toContainText('First try 53 → repaired 100');
  expect(paints).toHaveLength(2);
  expect(paints[0].fixNotes).toBeUndefined();
  expect(paints[1].fixNotes?.[0]).toContain('bottle became a can');
  // Both versions stay visible; the higher score is shown and the user can switch.
  await wizardStep(page, 'Generate');
  await expect(page.getByTestId('oneshot-attempt')).toHaveCount(2);
  await expect(page.getByTestId('oneshot-certificate')).toContainText('Score: 100');
  await page.getByRole('button', { name: 'Use this version', exact: true }).click();
  await expect(page.getByTestId('oneshot-certificate')).toContainText('Score: 53');
  expect(verifies).toBe(2);
});

test('a failed painting step shows the error and a retry on its card', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  let calls = 0;
  await page.route('**/api/ai/oneshot', route => { calls += 1; return calls === 1 ? route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } }) : route.fulfill({ body: pixel, contentType: 'image/png' }); });
  await page.route('**/api/ai/verify-oneshot', route => route.fulfill({ json: { productKept: true, productNote: '', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [] } }));
  await wizardStep(page, 'Generate');
  const generate = page.getByRole('button', { name: 'Generate finished ad', exact: true });
  await expect(generate).toBeEnabled({ timeout: 30000 });
  await generate.click();
  const paint = page.getByTestId('agent-step-paint');
  await expect(paint).toHaveAttribute('data-status', 'failed', { timeout: 30000 });
  await paint.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(paint).toHaveAttribute('data-status', 'done', { timeout: 30000 });
  await expect(page.getByTestId('oneshot-result')).toBeVisible();
});

test('certificate card shows the score ring and four checks; the trust panel shows models, hashes and checks', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  await page.route('**/api/ai/oneshot', route => route.fulfill({ body: pixel, contentType: 'image/png' }));
  await page.route('**/api/ai/verify-oneshot', route => route.fulfill({ json: { productKept: true, productNote: 'same bottle', logoKept: false, logoNote: '', layoutKept: true, layoutNote: '', texts: [] } }));
  await wizardStep(page, 'Generate');
  const generate = page.getByRole('button', { name: 'Generate finished ad', exact: true });
  await expect(generate).toBeEnabled({ timeout: 30000 });
  await generate.click();
  const card = page.getByTestId('oneshot-certificate');
  await expect(card).toBeVisible({ timeout: 30000 });
  await expect(card.getByRole('img', { name: 'Fidelity certificate: 100/100' })).toBeVisible();
  await expect(card.getByTestId('cert-product')).toHaveClass(/is-ok/);
  await expect(card.getByTestId('cert-product')).toContainText('same bottle');
  // No logo was placed and no text was written: those checks read "not applicable", not failed.
  await expect(card.getByTestId('cert-logo')).toHaveClass(/is-na/);
  await expect(card.getByTestId('cert-text')).toHaveClass(/is-na/);
  await expect(card.getByTestId('cert-layout')).toHaveClass(/is-ok/);

  await page.getByRole('button', { name: 'Why trust this ad?', exact: true }).click();
  const panel = page.getByTestId('trust-panel');
  await expect(panel).toContainText('muse-spark-1.3-contributor');
  await expect(panel).toContainText('muse-image-1.0');
  await expect(panel).toContainText('sam-3.1');
  const { createHash } = await import('node:crypto');
  await expect(panel.getByTestId('trust-final-hash')).toHaveText(createHash('sha256').update(pixel).digest('hex'));
  await expect(panel).toContainText('Certificate: valid for this exact mockup.');
});
