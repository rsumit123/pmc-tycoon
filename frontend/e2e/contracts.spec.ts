import { test, expect } from '@playwright/test';

test.describe('Contracts (Operations Center)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/contracts');
    await expect(page.getByText('OPERATIONS CENTER')).toBeVisible({ timeout: 10000 });
  });

  test('has tab bar with tabs', async ({ page }) => {
    await expect(page.locator('.tab-bar')).toBeVisible();
    await expect(page.locator('.tab-item')).toHaveCount(2);
  });

  test('available tab shows mission cards or empty state', async ({ page }) => {
    await page.waitForTimeout(1500);
    const cards = await page.locator('.card-dossier-tab, .card-dossier').count();
    const empty = await page.getByText(/No contracts available/).isVisible().catch(() => false);
    expect(cards > 0 || empty).toBeTruthy();
  });

  test('mission cards have classification stamps', async ({ page }) => {
    await page.waitForTimeout(1500);
    if (await page.locator('.card-dossier-tab').count() === 0) { test.skip(); return; }
    expect(await page.locator('.stamp').count()).toBeGreaterThan(0);
  });

  test('mission cards show payout amounts', async ({ page }) => {
    await page.waitForTimeout(1500);
    if (await page.locator('.card-dossier-tab').count() === 0) { test.skip(); return; }
    await expect(page.getByText(/\$[\d,]+/).first()).toBeVisible();
  });

  test('active tab can be selected', async ({ page }) => {
    await page.locator('.tab-item').nth(1).click();
    await page.waitForTimeout(1000);
    const cards = await page.locator('.card-dossier, .card-dossier-tab').count();
    const empty = await page.getByText(/No active operations/).isVisible().catch(() => false);
    expect(cards > 0 || empty).toBeTruthy();
  });
});
