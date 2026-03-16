import { test, expect } from '@playwright/test';

test.describe('Hangar (Equipment Dossier)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/hangar');
    await expect(page.getByText('EQUIPMENT DOSSIER')).toBeVisible({ timeout: 10000 });
  });

  test('shows CLASSIFIED stamp', async ({ page }) => {
    await expect(page.locator('.stamp').first()).toBeVisible();
  });

  test('shows treasury balance', async ({ page }) => {
    await expect(page.getByText(/\$[\d,]+/)).toBeVisible();
  });

  test('has three tabs', async ({ page }) => {
    await expect(page.locator('.tab-bar')).toBeVisible();
    await expect(page.locator('.tab-item')).toHaveCount(3);
  });

  test('aircraft tab shows cards or empty state', async ({ page }) => {
    await page.waitForTimeout(1000);
    const cards = await page.locator('.card-dossier-tab').count();
    const empty = await page.getByText('No aircraft in fleet').isVisible().catch(() => false);
    expect(cards > 0 || empty).toBeTruthy();
  });

  test('procure button opens shop bottom sheet', async ({ page }) => {
    const procureBtn = page.getByText('PROCURE').first();
    await expect(procureBtn).toBeVisible();
    await procureBtn.click();
    await expect(page.locator('.bottom-sheet')).toBeVisible({ timeout: 5000 });
  });

  test('aircraft detail shows 6 subsystem slots', async ({ page }) => {
    await page.waitForTimeout(1000);
    const cards = page.locator('.card-dossier-tab');
    if (await cards.count() === 0) { test.skip(); return; }

    await cards.first().click();
    await expect(page.getByText('SUBSYSTEMS')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.slot-card')).toHaveCount(6, { timeout: 10000 });
  });

  test('subsystem slots show labels', async ({ page }) => {
    await page.waitForTimeout(1000);
    const cards = page.locator('.card-dossier-tab');
    if (await cards.count() === 0) { test.skip(); return; }

    await cards.first().click();
    await expect(page.locator('.slot-card')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('RADAR')).toBeVisible();
    await expect(page.getByText('ENGINE')).toBeVisible();
  });

  test('swap button opens module drawer', async ({ page }) => {
    await page.waitForTimeout(1000);
    const cards = page.locator('.card-dossier-tab');
    if (await cards.count() === 0) { test.skip(); return; }

    await cards.first().click();
    await expect(page.getByText('SWAP').first()).toBeVisible({ timeout: 10000 });
    await page.getByText('SWAP').first().click();
    await expect(page.locator('.bottom-sheet')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('CURRENTLY INSTALLED')).toBeVisible();
  });

  test('weapons tab works', async ({ page }) => {
    await page.locator('.tab-item').nth(1).click();
    await page.waitForTimeout(500);
    // Should show weapons or empty state
    const content = await page.locator('.card-dossier').count();
    const empty = await page.getByText('No weapons in stock').isVisible().catch(() => false);
    expect(content > 0 || empty).toBeTruthy();
  });

  test('ships tab works', async ({ page }) => {
    await page.locator('.tab-item').nth(2).click();
    await page.waitForTimeout(500);
    const content = await page.locator('.card-dossier-tab, .card-dossier').count();
    const empty = await page.getByText('No ships in fleet').isVisible().catch(() => false);
    expect(content > 0 || empty).toBeTruthy();
  });
});
