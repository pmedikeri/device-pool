import { test, expect } from "@playwright/test";
import { api, login, createDevice, sendHeartbeat, quickReserve } from "./helpers/api";

test.describe("Reservations", () => {
  let userId: string;
  let otherUserId: string;
  let deviceId: string;
  let deviceToken: string;

  test.beforeAll(async () => {
    userId = await login(`ResUser${Date.now()}`);
    otherUserId = await login(`OtherUser${Date.now()}`);
    const device = await createDevice(userId);
    deviceId = device.deviceId;
    deviceToken = device.deviceToken;
    await sendHeartbeat(deviceId, deviceToken);
  });

  test.describe("Create Reservation", () => {
    test("creates reservation for available device", async () => {
      const res = await quickReserve(userId, deviceId);
      expect(res.status).toBe(201);
      expect(res.data.status).toBe("pending");
      expect(res.data.deviceId).toBe(deviceId);
      expect(res.data.userId).toBe(userId);
      // Clean up
      await api(`/api/reservations/${res.data.id}`, { method: "DELETE", userId });
    });

    test("rejects end time before start time", async () => {
      const now = new Date();
      const res = await api("/api/reservations", {
        method: "POST",
        userId,
        body: {
          deviceId,
          startAt: new Date(now.getTime() + 60000).toISOString(),
          endAt: new Date(now.getTime() - 60000).toISOString(),
        },
      });
      expect(res.status).toBe(400);
      expect(res.data.error).toContain("End time must be after start time");
    });

    test("rejects start time in the past", async () => {
      const res = await api("/api/reservations", {
        method: "POST",
        userId,
        body: {
          deviceId,
          startAt: new Date(Date.now() - 120000).toISOString(),
          endAt: new Date(Date.now() + 60000).toISOString(),
        },
      });
      expect(res.status).toBe(400);
      expect(res.data.error).toContain("future");
    });

    test("rejects duration exceeding max (168 hours)", async () => {
      const now = new Date();
      const res = await api("/api/reservations", {
        method: "POST",
        userId,
        body: {
          deviceId,
          startAt: now.toISOString(),
          endAt: new Date(now.getTime() + 169 * 60 * 60 * 1000).toISOString(),
        },
      });
      expect(res.status).toBe(400);
      expect(res.data.error).toContain("exceeds maximum");
    });

    test("prevents overlapping reservations", async () => {
      const now = new Date();
      const r1 = await api("/api/reservations", {
        method: "POST",
        userId,
        body: {
          deviceId,
          startAt: new Date(now.getTime() + 60000).toISOString(),
          endAt: new Date(now.getTime() + 3600000).toISOString(),
        },
      });
      expect(r1.status).toBe(201);

      // Overlapping reservation from different user
      const r2 = await api("/api/reservations", {
        method: "POST",
        userId: otherUserId,
        body: {
          deviceId,
          startAt: new Date(now.getTime() + 1800000).toISOString(), // 30 min into first
          endAt: new Date(now.getTime() + 5400000).toISOString(),
        },
      });
      expect(r2.status).toBe(409);
      expect(r2.data.error).toContain("overlapping");

      // Clean up
      await api(`/api/reservations/${r1.data.id}`, { method: "DELETE", userId });
    });

    test("allows non-overlapping reservations", async () => {
      const now = new Date();
      const r1 = await api("/api/reservations", {
        method: "POST",
        userId,
        body: {
          deviceId,
          startAt: new Date(now.getTime() + 60000).toISOString(),
          endAt: new Date(now.getTime() + 3600000).toISOString(),
        },
      });
      // After first ends
      const r2 = await api("/api/reservations", {
        method: "POST",
        userId: otherUserId,
        body: {
          deviceId,
          startAt: new Date(now.getTime() + 3600001).toISOString(),
          endAt: new Date(now.getTime() + 7200000).toISOString(),
        },
      });
      expect(r2.status).toBe(201);

      await api(`/api/reservations/${r1.data.id}`, { method: "DELETE", userId });
      await api(`/api/reservations/${r2.data.id}`, { method: "DELETE", userId: otherUserId });
    });

    test("rejects reservation on maintenance device", async () => {
      await api(`/api/devices/${deviceId}/maintenance`, {
        method: "POST",
        userId,
        body: { enabled: true, reason: "test" },
      });

      const res = await quickReserve(userId, deviceId);
      expect(res.status).toBe(409);
      expect(res.data.error).toContain("maintenance");

      // Clean up
      await api(`/api/devices/${deviceId}/maintenance`, {
        method: "POST",
        userId,
        body: { enabled: false },
      });
    });
  });

  test.describe("Cancel / Release", () => {
    test("owner can cancel their reservation", async () => {
      const r = await quickReserve(userId, deviceId);
      const res = await api(`/api/reservations/${r.data.id}`, { method: "DELETE", userId });
      expect(res.status).toBe(200);
      expect(res.data.status).toBe("canceled");
    });

    test("non-owner CANNOT cancel someone else's reservation", async () => {
      const r = await quickReserve(userId, deviceId);
      const res = await api(`/api/reservations/${r.data.id}`, { method: "DELETE", userId: otherUserId });
      expect(res.status).toBe(403);
      // Clean up
      await api(`/api/reservations/${r.data.id}`, { method: "DELETE", userId });
    });

    test("cannot cancel already canceled reservation", async () => {
      const r = await quickReserve(userId, deviceId);
      await api(`/api/reservations/${r.data.id}`, { method: "DELETE", userId });
      const res = await api(`/api/reservations/${r.data.id}`, { method: "DELETE", userId });
      expect(res.status).toBe(409);
    });
  });

  test.describe("Extend / Update", () => {
    test("owner can extend end time", async () => {
      const r = await quickReserve(userId, deviceId);
      const newEnd = new Date(Date.now() + 4 * 60 * 60 * 1000);
      const res = await api(`/api/reservations/${r.data.id}`, {
        method: "PATCH",
        userId,
        body: { endAt: newEnd.toISOString() },
      });
      expect(res.status).toBe(200);
      // Clean up
      await api(`/api/reservations/${r.data.id}`, { method: "DELETE", userId });
    });

    test("non-owner CANNOT extend", async () => {
      const r = await quickReserve(userId, deviceId);
      const res = await api(`/api/reservations/${r.data.id}`, {
        method: "PATCH",
        userId: otherUserId,
        body: { endAt: new Date(Date.now() + 4 * 3600000).toISOString() },
      });
      expect(res.status).toBe(403);
      await api(`/api/reservations/${r.data.id}`, { method: "DELETE", userId });
    });

    test("rejects extension that exceeds max duration", async () => {
      const r = await quickReserve(userId, deviceId);
      const res = await api(`/api/reservations/${r.data.id}`, {
        method: "PATCH",
        userId,
        body: { endAt: new Date(Date.now() + 200 * 3600000).toISOString() },
      });
      expect(res.status).toBe(400);
      expect(res.data.error).toContain("exceeds maximum");
      await api(`/api/reservations/${r.data.id}`, { method: "DELETE", userId });
    });

    test("rejects extension that overlaps another reservation", async () => {
      const now = new Date();
      const r1 = await api("/api/reservations", {
        method: "POST", userId,
        body: { deviceId, startAt: new Date(now.getTime() + 60000).toISOString(), endAt: new Date(now.getTime() + 3600000).toISOString() },
      });
      const r2 = await api("/api/reservations", {
        method: "POST", userId: otherUserId,
        body: { deviceId, startAt: new Date(now.getTime() + 3700000).toISOString(), endAt: new Date(now.getTime() + 7200000).toISOString() },
      });

      // Try to extend r1 into r2's time
      const res = await api(`/api/reservations/${r1.data.id}`, {
        method: "PATCH", userId,
        body: { endAt: new Date(now.getTime() + 5000000).toISOString() },
      });
      expect(res.status).toBe(409);

      await api(`/api/reservations/${r1.data.id}`, { method: "DELETE", userId });
      await api(`/api/reservations/${r2.data.id}`, { method: "DELETE", userId: otherUserId });
    });
  });

  test.describe("Listing", () => {
    test("user sees own reservations with mine=true", async () => {
      const r = await quickReserve(userId, deviceId);
      const list = await api("/api/reservations?mine=true", { userId });
      expect(list.status).toBe(200);
      const mine = list.data.reservations.filter((r: { userId: string }) => r.userId === userId);
      expect(mine.length).toBeGreaterThan(0);
      await api(`/api/reservations/${r.data.id}`, { method: "DELETE", userId });
    });
  });
});
