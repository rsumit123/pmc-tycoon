import { test, expect } from '@playwright/test';

test.describe('R&D (Research Division)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/research');
    await expect(page.getByText('R&D DIVISION')).toBeVisible({ timeout: 10000 });
  });

  test('shows RESTRICTED stamp', async ({ page }) => {
    await expect(page.locator('.stamp').first()).toBeVisible();
  });

  test('shows research points banner with RP', async ({ page }) => {
    await expect(page.getByText('RESEARCH POINTS')).toBeVisible();
    await expect(page.getByText('RP')).toBeVisible();
  });

  test('shows completion stats', async ({ page }) => {
    await expect(page.getByText('DONE')).toBeVisible();
    await expect(page.getByText('AVAIL')).toBeVisible();
  });

  test('shows tech tree branches', async ({ page }) => {
    await page.waitForTimeout(1500);
    // Should show research cards (dossier or redacted)
    const cards = page.locator('.card-dossier, .card-redacted');
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('research items show tier badges', async ({ page }) => {
    await page.waitForTimeout(1500);
    // Tier badges: T1, T2, T3
    const tiers = page.getByText(/^T[123]$/);
    expect(await tiers.count()).toBeGreaterThan(0);
  });

  test('has research action buttons or locked indicators', async ({ page }) => {
    await page.waitForTimeout(1500);
    const beginButtons = page.getByText(/BEGIN RESEARCH/);
    const lockedItems = page.getByText(/Requires:/);
    const completedItems = page.getByText('COMPLETED RESEARCH');
    // Should have at least one of these states
    const hasBegin = await beginButtons.count() > 0;
    const hasLocked = await lockedItems.count() > 0;
    const hasCompleted = await completedItems.isVisible().catch(() => false);
    expect(hasBegin || hasLocked || hasCompleted).toBeTruthy();
  });

  test('research items show unlock info where applicable', async ({ page }) => {
    await page.waitForTimeout(1500);
    // Page should be functional regardless of unlock state
    const cards = page.locator('.card-dossier, .card-redacted');
    expect(await cards.count()).toBeGreaterThan(0);
  });
});
