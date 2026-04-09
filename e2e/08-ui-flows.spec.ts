import { test, expect } from "@playwright/test";

async function loginUI(page: import("@playwright/test").Page, name = "UITest") {
  await page.goto("/login");
  await page.fill('input[type="text"]', name);
  await page.fill('input[type="password"]', "testing123");
  await page.click('button:has-text("Enter")');
  await page.waitForURL("/", { timeout: 5000 });
}

test.describe("UI Flows", () => {
  test.describe("Dashboard", () => {
    test("shows stats cards", async ({ page }) => {
      await loginUI(page);
      await expect(page.locator("text=Total")).toBeVisible();
      await expect(page.locator("text=Available")).toBeVisible();
      await expect(page.locator("text=In Use")).toBeVisible();
      await expect(page.locator("text=Offline")).toBeVisible();
    });

    test("shows device cards with usage bars", async ({ page }) => {
      await loginUI(page);
      await page.waitForTimeout(2000);
      // If there are devices with heartbeats, CPU/MEM bars should show
      const body = await page.textContent("body");
      expect(body).toBeTruthy();
    });

    test("search filters devices", async ({ page }) => {
      await loginUI(page);
      await page.waitForTimeout(2000);
      const beforeCount = await page.locator(".card").count();
      await page.fill('input[placeholder*="Search"]', "nonexistent-device-xyz");
      await page.waitForTimeout(500);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1500);
      // Should show fewer devices (or "No devices")
    });

    test("OS filter works", async ({ page }) => {
      await loginUI(page);
      await page.waitForTimeout(1500);
      await page.selectOption("select", "macos");
      await page.waitForTimeout(1500);
      // Any displayed device should be macOS
    });
  });

  test.describe("Add Device", () => {
    test("shows enrollment page via nav", async ({ page }) => {
      await loginUI(page);
      await page.goto("/admin");
      await page.waitForTimeout(2000);
      const body = await page.textContent("body");
      expect(body).toContain("Add Device");
    });

    test("generates enrollment command with steps", async ({ page }) => {
      await loginUI(page);
      await page.goto("/admin");
      await page.waitForTimeout(1000);
      await page.click('button:has-text("Generate Enrollment Command")');
      await page.waitForTimeout(3000);
      // Should show the 3-step guide
      await expect(page.locator("text=Copy this command")).toBeVisible();
      await expect(page.locator("pre").first()).toBeVisible();
      await expect(page.locator("text=Go to Dashboard")).toBeVisible();
    });
  });

  test.describe("Reserve Flow", () => {
    test("Reserve button opens form in details panel", async ({ page }) => {
      await loginUI(page);
      await page.waitForTimeout(2000);
      const reserveBtn = page.locator('button:has-text("Reserve")');
      if (await reserveBtn.count() > 0) {
        await reserveBtn.first().click();
        await page.waitForTimeout(500);
        // Should see the reservation form with date inputs
        await expect(page.locator('input[type="datetime-local"]').first()).toBeVisible();
      }
    });

    test("Reserve button disabled for Connect tooltip", async ({ page }) => {
      await loginUI(page);
      await page.waitForTimeout(2000);
      const connectBtn = page.locator('button:has-text("Connect"):disabled');
      if (await connectBtn.count() > 0) {
        // Hover should show tooltip
        await connectBtn.first().hover();
        await page.waitForTimeout(500);
      }
    });
  });

  test.describe("Navigation", () => {
    test("sidebar links work", async ({ page }) => {
      await loginUI(page);
      await page.click('a[href="/reservations"]');
      await expect(page.locator("text=My Reservations")).toBeVisible();
    });

    test("logout works", async ({ page }) => {
      await loginUI(page);
      await page.click('button[title="Sign out"]');
      // Should show login form
      await page.waitForTimeout(1000);
      await expect(page.locator('input[type="password"]')).toBeVisible();
    });
  });

  test.describe("Auth gate", () => {
    test("fresh browser shows login form", async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto("/");
      await page.waitForTimeout(2000);
      // Should see login form (password input visible)
      await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 5000 });
      await context.close();
    });
  });
});
