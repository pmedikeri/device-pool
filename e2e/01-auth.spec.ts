import { test, expect } from "@playwright/test";
import { api } from "./helpers/api";

test.describe("Authentication", () => {
  test.describe("Login API", () => {
    test("rejects empty name", async () => {
      const res = await api("/api/auth/login", { method: "POST", body: { name: "", password: "testing123" } });
      expect(res.status).toBe(400);
    });

    test("rejects wrong password", async () => {
      const res = await api("/api/auth/login", { method: "POST", body: { name: "Test", password: "wrong" } });
      expect(res.status).toBe(401);
      expect(res.data.error).toContain("Wrong password");
    });

    test("creates new user on first login", async () => {
      const name = `NewUser${Date.now()}`;
      const res = await api("/api/auth/login", { method: "POST", body: { name, password: "testing123" } });
      expect(res.status).toBe(200);
      expect(res.data.user.name).toBe(name);
      expect(res.data.user.id).toBeTruthy();
    });

    test("returns same user on repeat login", async () => {
      const name = `RepeatUser${Date.now()}`;
      const r1 = await api("/api/auth/login", { method: "POST", body: { name, password: "testing123" } });
      const r2 = await api("/api/auth/login", { method: "POST", body: { name, password: "testing123" } });
      expect(r1.data.user.id).toBe(r2.data.user.id);
    });

    test("name is case-insensitive", async () => {
      const base = `CaseTest${Date.now()}`;
      const r1 = await api("/api/auth/login", { method: "POST", body: { name: base.toUpperCase(), password: "testing123" } });
      const r2 = await api("/api/auth/login", { method: "POST", body: { name: base.toLowerCase(), password: "testing123" } });
      expect(r1.data.user.id).toBe(r2.data.user.id);
    });

    test("never returns passwordHash", async () => {
      const res = await api("/api/auth/login", { method: "POST", body: { name: "Test", password: "testing123" } });
      expect(res.data.user.passwordHash).toBeUndefined();
    });
  });

  test.describe("Auth enforcement", () => {
    test("device list rejects unauthenticated", async () => {
      const res = await api("/api/devices");
      expect(res.status).toBe(401);
    });

    test("reservation list rejects unauthenticated", async () => {
      const res = await api("/api/reservations");
      expect(res.status).toBe(401);
    });

    test("enrollment token rejects unauthenticated", async () => {
      const res = await api("/api/enrollment/token", { method: "POST" });
      expect(res.status).toBe(401);
    });
  });

  test.describe("Login UI", () => {
    test("shows login form on fresh visit", async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto("/");
      await page.waitForTimeout(2000);
      await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 5000 });
      await context.close();
    });

    test("login and redirect to dashboard", async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto("/");
      await page.waitForTimeout(2000);
      await page.fill('input[type="text"]', `E2E${Date.now()}`);
      await page.fill('input[type="password"]', "testing123");
      await page.click('button:has-text("Enter")');
      await page.waitForTimeout(5000);
      // After login, sidebar should be visible (contains nav links)
      const hasSidebar = await page.locator("nav").count();
      expect(hasSidebar).toBeGreaterThan(0);
      await context.close();
    });
  });
});
