import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('bottom nav visible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    // Bottom nav is a fixed nav at the bottom
    const nav = page.locator('nav').last();
    await expect(nav).toBeVisible({ timeout: 10000 });
    // Should have 5 nav links
    const links = nav.locator('a');
    expect(await links.count()).toBe(5);
  });

  test('navigating between all pages works', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('COMMAND BRIEFING')).toBeVisible({ timeout: 10000 });

    await page.goto('/hangar');
    await expect(page.getByText('EQUIPMENT DOSSIER')).toBeVisible({ timeout: 10000 });

    await page.goto('/personnel');
    await expect(page.getByText('PERSONNEL DOSSIERS')).toBeVisible({ timeout: 10000 });

    await page.goto('/contracts');
    await expect(page.getByText('OPERATIONS CENTER')).toBeVisible({ timeout: 10000 });

    await page.goto('/research');
    await expect(page.getByText('R&D DIVISION')).toBeVisible({ timeout: 10000 });
  });

  test('all pages use dossier design system (have stamps)', async ({ page }) => {
    const pages = ['/', '/hangar', '/contracts', '/personnel', '/research'];
    for (const path of pages) {
      await page.goto(path);
      await page.waitForTimeout(1500);
      const stamps = page.locator('.stamp');
      expect(await stamps.count()).toBeGreaterThan(0);
    }
  });

  test('pages load within 5 seconds', async ({ page }) => {
    const pages = [
      { path: '/', marker: 'COMMAND BRIEFING' },
      { path: '/hangar', marker: 'EQUIPMENT DOSSIER' },
      { path: '/personnel', marker: 'PERSONNEL DOSSIERS' },
      { path: '/contracts', marker: 'OPERATIONS CENTER' },
      { path: '/research', marker: 'R&D DIVISION' },
    ];
    for (const { path, marker } of pages) {
      const start = Date.now();
      await page.goto(path);
      await expect(page.getByText(marker)).toBeVisible({ timeout: 5000 });
      expect(Date.now() - start).toBeLessThan(5000);
    }
  });
});

test.describe('Mobile Usability', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('no horizontal scroll on any page', async ({ page }) => {
    const pages = ['/', '/hangar', '/personnel', '/contracts', '/research'];
    for (const path of pages) {
      await page.goto(path);
      await page.waitForTimeout(1500);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
    }
  });
});
