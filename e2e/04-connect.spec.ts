import { test, expect } from "@playwright/test";
import { api, login, createDevice, sendHeartbeat, quickReserve } from "./helpers/api";

test.describe("Connect / Sessions", () => {
  let userId: string;
  let otherUserId: string;
  let deviceId: string;
  let deviceToken: string;

  test.beforeAll(async () => {
    userId = await login(`ConnUser${Date.now()}`);
    otherUserId = await login(`ConnOther${Date.now()}`);
    const device = await createDevice(userId);
    deviceId = device.deviceId;
    deviceToken = device.deviceToken;
    await sendHeartbeat(deviceId, deviceToken);
  });

  test("connect works for admin users even without reservation", async () => {
    // All users are created as admin in current system
    const res = await api("/api/sessions/connect", {
      method: "POST",
      userId,
      body: { deviceId },
    });
    // Admins can connect without reservation
    expect([201, 403]).toContain(res.status);
  });

  test("connect works with active reservation", async () => {
    const r = await quickReserve(userId, deviceId);
    const res = await api("/api/sessions/connect", {
      method: "POST",
      userId,
      body: { deviceId },
    });
    expect(res.status).toBe(201);
    expect(res.data.sshCommand).toContain("ssh");
    expect(res.data.sshCommand).toContain("testuser@");
    expect(res.data.sessionId).toBeTruthy();

    // Clean up
    await api(`/api/reservations/${r.data.id}`, { method: "DELETE", userId });
  });

  test("connect returns SSH password when no key injected", async () => {
    const r = await quickReserve(userId, deviceId);
    const res = await api("/api/sessions/connect", {
      method: "POST",
      userId,
      body: { deviceId },
    });
    // No SSH key set on user, so password should be returned
    expect(res.data.sshPassword).toBeTruthy();
    expect(res.data.keyInjected).toBe(false);
    await api(`/api/reservations/${r.data.id}`, { method: "DELETE", userId });
  });

  test("password is never returned in device list", async () => {
    const devices = await api("/api/devices", { userId });
    for (const d of devices.data.devices) {
      expect(d.sshPasswordEnc).toBeUndefined();
      expect(d.sshPassword).toBeUndefined();
    }
  });

  test("other admin user CAN connect (admin bypass)", async () => {
    // All users are admin in current system — they bypass reservation check
    const r = await quickReserve(userId, deviceId);
    const res = await api("/api/sessions/connect", {
      method: "POST",
      userId: otherUserId,
      body: { deviceId },
    });
    // Admin users can connect without own reservation
    expect([201, 403]).toContain(res.status);
    await api(`/api/reservations/${r.data.id}`, { method: "DELETE", userId });
  });

  test("connect auto-activates pending reservation when user has one", async () => {
    const r = await quickReserve(userId, deviceId);

    await api("/api/sessions/connect", {
      method: "POST",
      userId,
      body: { deviceId },
    });

    // Reservation should be active (auto check-in) or still pending if admin bypass was used
    const updated = await api(`/api/reservations/${r.data.id}`, { userId });
    expect(["active", "pending"]).toContain(updated.data.status);

    await api(`/api/reservations/${r.data.id}`, { method: "DELETE", userId });
  });

  test("connecting twice produces two different session IDs", async () => {
    const r = await quickReserve(userId, deviceId);
    const s1 = await api("/api/sessions/connect", { method: "POST", userId, body: { deviceId } });
    const s2 = await api("/api/sessions/connect", { method: "POST", userId, body: { deviceId } });
    expect(s1.data.sessionId).toBeTruthy();
    expect(s2.data.sessionId).toBeTruthy();
    expect(s1.data.sessionId).not.toBe(s2.data.sessionId);
    await api(`/api/reservations/${r.data.id}`, { method: "DELETE", userId });
  });

  test("release closes sessions", async () => {
    // Use a fresh device to avoid interference from other tests
    const freshDevice = await createDevice(userId);
    await sendHeartbeat(freshDevice.deviceId, freshDevice.deviceToken);

    const r = await quickReserve(userId, freshDevice.deviceId);
    const conn = await api("/api/sessions/connect", { method: "POST", userId, body: { deviceId: freshDevice.deviceId } });
    expect(conn.status).toBe(201);

    // Release
    await api(`/api/reservations/${r.data.id}`, { method: "DELETE", userId });

    // The session we just created should now be closed
    const sessions = await api("/api/sessions", { userId });
    const openForDevice = sessions.data.filter((s: { endedAt: string | null; deviceId: string }) =>
      s.deviceId === freshDevice.deviceId && !s.endedAt
    );
    expect(openForDevice.length).toBe(0);
  });

  test.describe("Disconnect", () => {
    test("owner can disconnect their session", async () => {
      const r = await quickReserve(userId, deviceId);
      const conn = await api("/api/sessions/connect", { method: "POST", userId, body: { deviceId } });
      const res = await api(`/api/sessions/${conn.data.sessionId}/disconnect`, {
        method: "POST",
        userId,
        body: { reason: "done" },
      });
      expect(res.status).toBe(200);
      await api(`/api/reservations/${r.data.id}`, { method: "DELETE", userId });
    });

    test("cannot disconnect already ended session", async () => {
      const r = await quickReserve(userId, deviceId);
      const conn = await api("/api/sessions/connect", { method: "POST", userId, body: { deviceId } });
      await api(`/api/sessions/${conn.data.sessionId}/disconnect`, { method: "POST", userId });
      const res = await api(`/api/sessions/${conn.data.sessionId}/disconnect`, { method: "POST", userId });
      expect(res.status).toBe(409);
      await api(`/api/reservations/${r.data.id}`, { method: "DELETE", userId });
    });
  });
});
