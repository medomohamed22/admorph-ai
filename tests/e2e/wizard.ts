import { expect, type Page } from '@playwright/test';

export type WizardStep = 'Product' | 'Brand' | 'Idea' | 'Arrange' | 'Generate';

/** Open a one-shot wizard step from the step rail (it must be reachable). */
export async function wizardStep(page: Page, label: WizardStep) {
  const button = page.getByRole('navigation', { name: 'Your ad in 5 steps' }).getByRole('button', { name: label, exact: true });
  await expect(button).toBeEnabled({ timeout: 30000 });
  await button.click();
  await expect(button).toHaveAttribute('aria-current', 'step');
}

/** Fill the brand step (name + description) so later steps open. */
export async function fillBrand(page: Page) {
  await wizardStep(page, 'Brand');
  await page.getByText('Edit brand details', { exact: true }).click();
  await page.getByLabel('Brand name').fill('Sora');
  await page.getByLabel('Brand description').fill('A sample ceremonial matcha brand.');
}
