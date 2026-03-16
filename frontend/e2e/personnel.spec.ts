import { test, expect } from '@playwright/test';

test.describe('Personnel (Personnel Dossiers)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/personnel');
    await expect(page.getByText('PERSONNEL DOSSIERS')).toBeVisible({ timeout: 10000 });
  });

  test('shows payroll info', async ({ page }) => {
    await expect(page.getByText(/\$[\d,]+\/mo/)).toBeVisible();
  });

  test('shows recruit button', async ({ page }) => {
    await expect(page.getByText('RECRUIT').first()).toBeVisible();
  });

  test('recruit button opens hire sheet', async ({ page }) => {
    await page.getByText('RECRUIT').first().click();
    await expect(page.locator('.bottom-sheet')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('RECRUIT PERSONNEL')).toBeVisible();
  });

  test('contractor cards show skill level', async ({ page }) => {
    await page.waitForTimeout(1000);
    const cards = page.locator('.card-dossier');
    if (await cards.count() === 0) { test.skip(); return; }
    await expect(page.getByText('SKILL').first()).toBeVisible();
  });

  test('expanding contractor shows details', async ({ page }) => {
    await page.waitForTimeout(1000);
    const cards = page.locator('.card-dossier');
    if (await cards.count() === 0) { test.skip(); return; }
    await cards.first().click();
    await expect(page.getByText('SKILL LEVEL')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('SALARY')).toBeVisible();
  });

  test('expanded contractor has rest button', async ({ page }) => {
    await page.waitForTimeout(1000);
    const cards = page.locator('.card-dossier');
    if (await cards.count() === 0) { test.skip(); return; }
    await cards.first().click();
    await expect(page.getByText('REST')).toBeVisible({ timeout: 5000 });
  });

  test('fatigue gauge is visible', async ({ page }) => {
    await page.waitForTimeout(1000);
    const cards = page.locator('.card-dossier');
    if (await cards.count() === 0) { test.skip(); return; }
    await expect(page.locator('.gauge-bar').first()).toBeVisible();
  });
});
