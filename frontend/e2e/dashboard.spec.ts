import { test, expect } from '@playwright/test';

test.describe('Dashboard (Command Briefing)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('COMMAND BRIEFING')).toBeVisible({ timeout: 10000 });
  });

  test('shows CLASSIFIED stamp', async ({ page }) => {
    await expect(page.locator('.stamp').first()).toBeVisible();
  });

  test('displays treasury with dollar amount', async ({ page }) => {
    await expect(page.getByText('TREASURY')).toBeVisible();
    await expect(page.getByText(/\$[\d,]+/)).toBeVisible();
  });

  test('displays reputation standing', async ({ page }) => {
    await expect(page.getByText('STANDING')).toBeVisible();
  });

  test('displays tech level', async ({ page }) => {
    await expect(page.getByText('TECH')).toBeVisible();
    await expect(page.getByText(/TIER \d/)).toBeVisible();
  });

  test('shows PMC rank badge', async ({ page }) => {
    await expect(page.getByText('PMC RANK')).toBeVisible();
    await expect(page.locator('.rank-badge')).toBeVisible();
  });

  test('shows quick stat cards', async ({ page }) => {
    await expect(page.getByText('AIRCRAFT')).toBeVisible();
    await expect(page.getByText('ACTIVE OPS')).toBeVisible();
    await expect(page.getByText('PERSONNEL')).toBeVisible();
  });

  test('browse ops link navigates to contracts', async ({ page }) => {
    await page.getByText('BROWSE OPS').click();
    await expect(page).toHaveURL(/\/contracts/);
  });

  test('manage fleet link navigates to hangar', async ({ page }) => {
    await page.getByText('MANAGE FLEET').click();
    await expect(page).toHaveURL(/\/hangar/);
  });

  test('shows mission history section', async ({ page }) => {
    await expect(page.getByText('RECENT INTEL')).toBeVisible();
  });
});
