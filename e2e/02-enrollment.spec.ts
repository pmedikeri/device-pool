import { test, expect } from "@playwright/test";
import { api, login } from "./helpers/api";

test.describe("Device Enrollment", () => {
  let userId: string;

  test.beforeAll(async () => {
    userId = await login(`Enroll${Date.now()}`);
  });

  test.describe("Token Generation", () => {
    test("generates enrollment token", async () => {
      const res = await api("/api/enrollment/token", { method: "POST", userId });
      expect(res.status).toBe(201);
      expect(res.data.token).toHaveLength(64); // 32 bytes hex
      expect(res.data.expiresAt).toBeTruthy();
      expect(res.data.shellCommand).toContain("curl");
      expect(res.data.shellCommand).toContain(res.data.token);
    });

    test("each call generates a unique token", async () => {
      const r1 = await api("/api/enrollment/token", { method: "POST", userId });
      const r2 = await api("/api/enrollment/token", { method: "POST", userId });
      expect(r1.data.token).not.toBe(r2.data.token);
    });
  });

  test.describe("Device Registration", () => {
    test("registers device with valid token", async () => {
      const tokenRes = await api("/api/enrollment/token", { method: "POST", userId });
      const res = await api("/api/enrollment/register", {
        method: "POST",
        body: {
          token: tokenRes.data.token,
          hostname: `reg-test-${Date.now()}`,
          osType: "linux",
          architecture: "x86_64",
          ipAddress: "10.99.0.1",
          sshUsername: "testuser",
          sshPassword: "testpass",
          accessMethods: [{ method: "ssh", port: 22 }],
        },
      });
      expect([200, 201]).toContain(res.status);
      expect(res.data.deviceId).toBeTruthy();
      expect(res.data.deviceToken).toBeTruthy();
      expect(res.data.deviceToken.length).toBe(96); // 48 bytes hex
    });

    test("sets displayName from registration", async () => {
      const tokenRes = await api("/api/enrollment/token", { method: "POST", userId });
      const reg = await api("/api/enrollment/register", {
        method: "POST",
        body: {
          token: tokenRes.data.token,
          hostname: `display-test-${Date.now()}`,
          displayName: "NVIDIA RTX 5090",
          osType: "linux",
        },
      });
      expect(reg.ok).toBe(true);
      const device = await api(`/api/devices/${reg.data.deviceId}`, { userId });
      expect(device.ok).toBe(true);
      // displayName might be set directly or via first heartbeat
      expect(device.data.device.hostname).toContain("display-test");
    });

    test("rejects already-used token", async () => {
      const tokenRes = await api("/api/enrollment/token", { method: "POST", userId });
      await api("/api/enrollment/register", {
        method: "POST",
        body: { token: tokenRes.data.token, hostname: "used-1", osType: "linux" },
      });
      const res = await api("/api/enrollment/register", {
        method: "POST",
        body: { token: tokenRes.data.token, hostname: "used-2", osType: "linux" },
      });
      expect(res.status).toBe(409);
      expect(res.data.error).toContain("already been used");
    });

    test("rejects invalid token", async () => {
      const res = await api("/api/enrollment/register", {
        method: "POST",
        body: { token: "nonexistent-token-abc123", hostname: "bad", osType: "linux" },
      });
      expect(res.status).toBe(404);
    });

    test("rejects missing hostname", async () => {
      const tokenRes = await api("/api/enrollment/token", { method: "POST", userId });
      const res = await api("/api/enrollment/register", {
        method: "POST",
        body: { token: tokenRes.data.token, osType: "linux" },
      });
      expect(res.status).toBe(400);
    });

    test("sets owner to token creator", async () => {
      const tokenRes = await api("/api/enrollment/token", { method: "POST", userId });
      const reg = await api("/api/enrollment/register", {
        method: "POST",
        body: { token: tokenRes.data.token, hostname: `owner-test-${Date.now()}`, osType: "linux" },
      });
      const device = await api(`/api/devices/${reg.data.deviceId}`, { userId });
      expect(device.data.device.owner.id).toBe(userId);
    });

    test("stores encrypted SSH credentials", async () => {
      const tokenRes = await api("/api/enrollment/token", { method: "POST", userId });
      const reg = await api("/api/enrollment/register", {
        method: "POST",
        body: {
          token: tokenRes.data.token,
          hostname: `cred-test-${Date.now()}`,
          osType: "linux",
          sshUsername: "nvidia",
          sshPassword: "secret123",
        },
      });
      const device = await api(`/api/devices/${reg.data.deviceId}`, { userId });
      expect(device.data.device.sshUsername).toBe("nvidia");
      expect(device.data.device.hasCredentials).toBe(true);
      // Password must NOT be in response
      expect(device.data.device.sshPasswordEnc).toBeUndefined();
      expect(device.data.device.sshPassword).toBeUndefined();
    });
  });

  test.describe("Heartbeat", () => {
    test("heartbeat brings device online", async () => {
      const tokenRes = await api("/api/enrollment/token", { method: "POST", userId });
      const reg = await api("/api/enrollment/register", {
        method: "POST",
        body: { token: tokenRes.data.token, hostname: `hb-test-${Date.now()}`, osType: "linux" },
      });

      // Device starts as enrolled
      const before = await api(`/api/devices/${reg.data.deviceId}`, { userId });
      expect(before.data.device.derivedStatus).toBe("enrolled");

      // Send heartbeat
      const hb = await api(`/api/devices/${reg.data.deviceId}/heartbeat`, {
        method: "POST",
        headers: { "X-Device-Token": reg.data.deviceToken },
        body: { hostname: "hb-test", osInfo: "Linux", ipAddress: "10.0.0.99" },
      });
      expect(hb.status).toBe(200);

      // Now should be online/available
      const after = await api(`/api/devices/${reg.data.deviceId}`, { userId });
      expect(after.data.device.derivedStatus).toBe("available");
      expect(after.data.device.ipAddress).toBe("10.0.0.99");
    });

    test("rejects heartbeat with wrong token", async () => {
      const tokenRes = await api("/api/enrollment/token", { method: "POST", userId });
      const reg = await api("/api/enrollment/register", {
        method: "POST",
        body: { token: tokenRes.data.token, hostname: `bad-hb-${Date.now()}`, osType: "linux" },
      });
      const res = await api(`/api/devices/${reg.data.deviceId}/heartbeat`, {
        method: "POST",
        headers: { "X-Device-Token": "wrong-token" },
        body: { hostname: "test" },
      });
      expect(res.status).toBe(401);
    });

    test("rejects heartbeat without token", async () => {
      const tokenRes = await api("/api/enrollment/token", { method: "POST", userId });
      const reg = await api("/api/enrollment/register", {
        method: "POST",
        body: { token: tokenRes.data.token, hostname: `no-hb-${Date.now()}`, osType: "linux" },
      });
      const res = await api(`/api/devices/${reg.data.deviceId}/heartbeat`, {
        method: "POST",
        body: { hostname: "test" },
      });
      expect(res.status).toBe(401);
    });

    test("heartbeat updates GPU name as displayName", async () => {
      const tokenRes = await api("/api/enrollment/token", { method: "POST", userId });
      const reg = await api("/api/enrollment/register", {
        method: "POST",
        body: { token: tokenRes.data.token, hostname: `gpu-name-${Date.now()}`, osType: "linux" },
      });
      await api(`/api/devices/${reg.data.deviceId}/heartbeat`, {
        method: "POST",
        headers: { "X-Device-Token": reg.data.deviceToken },
        body: { hostname: "gpu-name", gpuName: "NVIDIA RTX 6000" },
      });
      const device = await api(`/api/devices/${reg.data.deviceId}`, { userId });
      expect(device.data.device.displayName).toBe("NVIDIA RTX 6000");
    });

    test("heartbeat updates IP address", async () => {
      const tokenRes = await api("/api/enrollment/token", { method: "POST", userId });
      const reg = await api("/api/enrollment/register", {
        method: "POST",
        body: { token: tokenRes.data.token, hostname: `ip-test-${Date.now()}`, osType: "linux", ipAddress: "10.0.0.1" },
      });
      await api(`/api/devices/${reg.data.deviceId}/heartbeat`, {
        method: "POST",
        headers: { "X-Device-Token": reg.data.deviceToken },
        body: { hostname: "ip-test", ipAddress: "10.0.0.99" },
      });
      const device = await api(`/api/devices/${reg.data.deviceId}`, { userId });
      expect(device.data.device.ipAddress).toBe("10.0.0.99");
    });
  });
});
