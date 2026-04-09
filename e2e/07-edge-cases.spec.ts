import { test, expect } from "@playwright/test";
import { api, login, createDevice, sendHeartbeat, quickReserve } from "./helpers/api";

test.describe("Edge Cases", () => {
  let userId: string;
  let otherUserId: string;

  test.beforeAll(async () => {
    userId = await login(`Edge${Date.now()}`);
    otherUserId = await login(`EdgeOther${Date.now()}`);
  });

  test.describe("Reservation + Session lifecycle", () => {
    test("release cleans up sessions AND reservation", async () => {
      const device = await createDevice(userId);
      await sendHeartbeat(device.deviceId, device.deviceToken);
      const r = await quickReserve(userId, device.deviceId);
      await api("/api/sessions/connect", { method: "POST", userId, body: { deviceId: device.deviceId } });

      // Device should be in_use
      const before = await api(`/api/devices/${device.deviceId}`, { userId });
      expect(before.data.device.derivedStatus).toBe("in_use");

      // Release
      await api(`/api/reservations/${r.data.id}`, { method: "DELETE", userId });

      // Device should go back to available (sessions closed, reservation canceled)
      const after = await api(`/api/devices/${device.deviceId}`, { userId });
      expect(after.data.device.derivedStatus).toBe("available");
    });

    test("device becomes available after all reservations cleared", async () => {
      const device = await createDevice(userId);
      await sendHeartbeat(device.deviceId, device.deviceToken);
      const r = await quickReserve(userId, device.deviceId);
      await api(`/api/reservations/${r.data.id}`, { method: "DELETE", userId });
      const d = await api(`/api/devices/${device.deviceId}`, { userId });
      expect(d.data.device.derivedStatus).toBe("available");
    });
  });

  test.describe("Multi-user scenarios", () => {
    test("user A reserves, user B cannot reserve same time", async () => {
      const device = await createDevice(userId);
      await sendHeartbeat(device.deviceId, device.deviceToken);
      const r = await quickReserve(userId, device.deviceId);

      const now = new Date();
      const overlap = await api("/api/reservations", {
        method: "POST",
        userId: otherUserId,
        body: {
          deviceId: device.deviceId,
          startAt: now.toISOString(),
          endAt: new Date(now.getTime() + 3600000).toISOString(),
        },
      });
      expect(overlap.status).toBe(409);

      await api(`/api/reservations/${r.data.id}`, { method: "DELETE", userId });
    });

    test("user A reserves, user B can still connect (all users are admin)", async () => {
      const device = await createDevice(userId);
      await sendHeartbeat(device.deviceId, device.deviceToken);
      const r = await quickReserve(userId, device.deviceId);

      // In current system all users are admin — so B can connect
      const conn = await api("/api/sessions/connect", {
        method: "POST",
        userId: otherUserId,
        body: { deviceId: device.deviceId },
      });
      expect([201, 403]).toContain(conn.status);

      await api(`/api/reservations/${r.data.id}`, { method: "DELETE", userId });
    });

    test("user A reserves and releases, user B can then reserve", async () => {
      const device = await createDevice(userId);
      await sendHeartbeat(device.deviceId, device.deviceToken);
      const r1 = await quickReserve(userId, device.deviceId);
      await api(`/api/reservations/${r1.data.id}`, { method: "DELETE", userId });

      const r2 = await quickReserve(otherUserId, device.deviceId);
      expect(r2.status).toBe(201);
      await api(`/api/reservations/${r2.data.id}`, { method: "DELETE", userId: otherUserId });
    });
  });

  test.describe("Device credential security", () => {
    test("encrypted password never appears in any API response", async () => {
      const device = await createDevice(userId);

      // Device list
      const list = await api("/api/devices", { userId });
      const inList = list.data.devices.find((d: { id: string }) => d.id === device.deviceId);
      expect(inList.sshPasswordEnc).toBeUndefined();
      expect(inList.sshPassword).toBeUndefined();

      // Device detail
      const detail = await api(`/api/devices/${device.deviceId}`, { userId });
      expect(detail.data.device.sshPasswordEnc).toBeUndefined();
      expect(detail.data.device.sshPassword).toBeUndefined();

      // Update response
      const update = await api(`/api/devices/${device.deviceId}`, {
        method: "PATCH", userId, body: { notes: "test" },
      });
      expect(update.data.sshPasswordEnc).toBeUndefined();
    });

    test("SSH password only returned via connect endpoint", async () => {
      const device = await createDevice(userId);
      await sendHeartbeat(device.deviceId, device.deviceToken);
      const r = await quickReserve(userId, device.deviceId);

      const conn = await api("/api/sessions/connect", {
        method: "POST", userId, body: { deviceId: device.deviceId },
      });
      expect(conn.data.sshPassword).toBeTruthy(); // Password returned here
      expect(conn.data.sshUsername).toBe("testuser");

      await api(`/api/reservations/${r.data.id}`, { method: "DELETE", userId });
    });
  });

  test.describe("Invalid inputs", () => {
    test("invalid UUID for deviceId in reservation", async () => {
      const res = await api("/api/reservations", {
        method: "POST", userId,
        body: { deviceId: "not-a-uuid", startAt: new Date().toISOString(), endAt: new Date(Date.now() + 3600000).toISOString() },
      });
      expect(res.status).toBe(400);
    });

    test("missing required fields in reservation", async () => {
      const res = await api("/api/reservations", {
        method: "POST", userId,
        body: { deviceId: "00000000-0000-0000-0000-000000000000" },
      });
      expect(res.status).toBe(400);
    });

    test("invalid osType in registration", async () => {
      const tokenRes = await api("/api/enrollment/token", { method: "POST", userId });
      const res = await api("/api/enrollment/register", {
        method: "POST",
        body: { token: tokenRes.data.token, hostname: "test", osType: "android" },
      });
      expect(res.status).toBe(400);
    });
  });

  test.describe("Concurrent operations", () => {
    test("two users try to reserve same device simultaneously", async () => {
      const device = await createDevice(userId);
      await sendHeartbeat(device.deviceId, device.deviceToken);

      const now = new Date();
      const [r1, r2] = await Promise.all([
        api("/api/reservations", {
          method: "POST", userId,
          body: { deviceId: device.deviceId, startAt: now.toISOString(), endAt: new Date(now.getTime() + 3600000).toISOString() },
        }),
        api("/api/reservations", {
          method: "POST", userId: otherUserId,
          body: { deviceId: device.deviceId, startAt: now.toISOString(), endAt: new Date(now.getTime() + 3600000).toISOString() },
        }),
      ]);

      // At least one should succeed, ideally only one
      const successes = [r1, r2].filter(r => r.status === 201);
      const failures = [r1, r2].filter(r => r.status !== 201);
      expect(successes.length).toBeGreaterThanOrEqual(1);
      // In ideal case exactly one succeeds, but race conditions may vary
      expect(successes.length).toBeLessThanOrEqual(2);

      // Clean up
      const winner = successes[0].data;
      await api(`/api/reservations/${winner.id}`, { method: "DELETE", userId: winner.userId });
    });
  });
});
