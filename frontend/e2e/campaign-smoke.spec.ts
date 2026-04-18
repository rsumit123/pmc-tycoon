import { test, expect } from "@playwright/test";

test.describe("Campaign critical path", () => {
  test("create campaign and land on map", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Sovereign Shield|New Campaign/i)).toBeVisible();

    // Fill campaign form
    const nameInput = page.getByLabel(/name/i).or(page.getByPlaceholder(/name/i));
    if (await nameInput.isVisible()) {
      await nameInput.fill("E2E Test Campaign");
    }

    // Click create button
    const createBtn = page.getByRole("button", { name: /create|start/i });
    await createBtn.click();

    // Should navigate to map view
    await expect(page).toHaveURL(/\/campaign\/\d+/);
    await expect(page.getByText(/End Turn/i)).toBeVisible();
  });

  test("advance turn changes quarter", async ({ page }) => {
    await page.goto("/");

    const nameInput = page.getByLabel(/name/i).or(page.getByPlaceholder(/name/i));
    if (await nameInput.isVisible()) {
      await nameInput.fill("E2E Turn Test");
    }
    await page.getByRole("button", { name: /create|start/i }).click();
    await expect(page).toHaveURL(/\/campaign\/\d+/);

    // Note initial quarter
    const headerText = await page.locator("header p").textContent();
    expect(headerText).toContain("Q2");

    // Click End Turn
    await page.getByRole("button", { name: /End Turn/i }).click();
    await page.waitForTimeout(1000);

    // Quarter should advance
    const updatedText = await page.locator("header p").textContent();
    expect(updatedText).toContain("Q3");
  });

  test("navigate to procurement tabs", async ({ page }) => {
    await page.goto("/");

    const nameInput = page.getByLabel(/name/i).or(page.getByPlaceholder(/name/i));
    if (await nameInput.isVisible()) {
      await nameInput.fill("E2E Procurement Test");
    }
    await page.getByRole("button", { name: /create|start/i }).click();
    await expect(page).toHaveURL(/\/campaign\/\d+/);

    // Navigate to procurement
    await page.getByText("Procurement").click();
    await expect(page).toHaveURL(/procurement/);

    // Check tabs exist
    await expect(page.getByText(/Budget/i)).toBeVisible();
    await expect(page.getByText(/R&D/i)).toBeVisible();
    await expect(page.getByText(/Acquisitions/i)).toBeVisible();
  });

  test("navigate to intel inbox", async ({ page }) => {
    await page.goto("/");

    const nameInput = page.getByLabel(/name/i).or(page.getByPlaceholder(/name/i));
    if (await nameInput.isVisible()) {
      await nameInput.fill("E2E Intel Test");
    }
    await page.getByRole("button", { name: /create|start/i }).click();
    await expect(page).toHaveURL(/\/campaign\/\d+/);

    // Advance a turn to generate intel
    await page.getByRole("button", { name: /End Turn/i }).click();
    await page.waitForTimeout(1000);

    // Navigate to intel
    await page.getByText("Intel").click();
    await expect(page).toHaveURL(/intel/);
  });
});
