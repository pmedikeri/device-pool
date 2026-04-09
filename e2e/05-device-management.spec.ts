import { test, expect } from "@playwright/test";
import { api, login, createDevice, sendHeartbeat } from "./helpers/api";

test.describe("Device Management", () => {
  let userId: string;
  let otherUserId: string;

  test.beforeAll(async () => {
    userId = await login(`DevMgmt${Date.now()}`);
    otherUserId = await login(`DevOther${Date.now()}`);
  });

  test.describe("Device List", () => {
    test("lists devices with derived status", async () => {
      const device = await createDevice(userId);
      const res = await api("/api/devices", { userId });
      expect(res.status).toBe(200);
      expect(res.data.devices.length).toBeGreaterThan(0);
      const d = res.data.devices.find((d: { id: string }) => d.id === device.deviceId);
      expect(d).toBeTruthy();
      expect(d.derivedStatus).toBe("enrolled"); // no heartbeat yet
    });

    test("search filters by hostname", async () => {
      const hn = `searchable-${Date.now()}`;
      const tokenRes = await api("/api/enrollment/token", { method: "POST", userId });
      await api("/api/enrollment/register", {
        method: "POST",
        body: { token: tokenRes.data.token, hostname: hn, osType: "linux" },
      });
      const res = await api(`/api/devices?search=${hn}`, { userId });
      expect(res.data.devices.length).toBe(1);
      expect(res.data.devices[0].hostname).toBe(hn);
    });

    test("filters by osType", async () => {
      const res = await api("/api/devices?osType=windows", { userId });
      for (const d of res.data.devices) {
        expect(d.osType).toBe("windows");
      }
    });

    test("never returns encrypted passwords", async () => {
      const res = await api("/api/devices", { userId });
      for (const d of res.data.devices) {
        expect(d.sshPasswordEnc).toBeUndefined();
      }
    });

    test("includes hasCredentials boolean", async () => {
      const device = await createDevice(userId); // createDevice sets SSH creds
      const res = await api("/api/devices", { userId });
      const d = res.data.devices.find((d: { id: string }) => d.id === device.deviceId);
      expect(d.hasCredentials).toBe(true);
    });
  });

  test.describe("Device Detail", () => {
    test("returns full device info", async () => {
      const device = await createDevice(userId);
      const res = await api(`/api/devices/${device.deviceId}`, { userId });
      expect(res.status).toBe(200);
      expect(res.data.device.id).toBe(device.deviceId);
      expect(res.data.device.owner).toBeTruthy();
      expect(res.data.device.sshPasswordEnc).toBeUndefined();
    });

    test("404 for non-existent device", async () => {
      const res = await api("/api/devices/00000000-0000-0000-0000-000000000000", { userId });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  test.describe("Update Device", () => {
    test("updates SSH credentials", async () => {
      const device = await createDevice(userId);
      const res = await api(`/api/devices/${device.deviceId}`, {
        method: "PATCH",
        userId,
        body: { sshUsername: "newuser", sshPassword: "newpass" },
      });
      expect(res.status).toBe(200);
      const detail = await api(`/api/devices/${device.deviceId}`, { userId });
      expect(detail.data.device.sshUsername).toBe("newuser");
      expect(detail.data.device.hasCredentials).toBe(true);
    });

    test("updates display name", async () => {
      const device = await createDevice(userId);
      await api(`/api/devices/${device.deviceId}`, {
        method: "PATCH",
        userId,
        body: { displayName: "My Custom Name" },
      });
      const detail = await api(`/api/devices/${device.deviceId}`, { userId });
      expect(detail.data.device.displayName).toBe("My Custom Name");
    });
  });

  test.describe("Delete Device", () => {
    test("deletes device and all related data", async () => {
      const device = await createDevice(userId);
      const res = await api(`/api/devices/${device.deviceId}`, { method: "DELETE", userId });
      expect(res.status).toBe(200);

      // Should be gone
      const detail = await api(`/api/devices/${device.deviceId}`, { userId });
      expect(detail.status).toBeGreaterThanOrEqual(400);
    });

    test("deletes device with active reservation (cascade)", async () => {
      const device = await createDevice(userId);
      await sendHeartbeat(device.deviceId, device.deviceToken);
      await api("/api/reservations", {
        method: "POST",
        userId,
        body: {
          deviceId: device.deviceId,
          startAt: new Date().toISOString(),
          endAt: new Date(Date.now() + 3600000).toISOString(),
        },
      });
      const res = await api(`/api/devices/${device.deviceId}`, { method: "DELETE", userId });
      expect(res.status).toBe(200);
    });
  });

  test.describe("Maintenance Mode", () => {
    test("enable and disable maintenance", async () => {
      const device = await createDevice(userId);
      await sendHeartbeat(device.deviceId, device.deviceToken);

      // Enable
      const on = await api(`/api/devices/${device.deviceId}/maintenance`, {
        method: "POST",
        userId,
        body: { enabled: true, reason: "testing" },
      });
      expect(on.status).toBe(200);

      const d1 = await api(`/api/devices/${device.deviceId}`, { userId });
      expect(d1.data.device.maintenanceMode).toBe(true);
      expect(d1.data.device.derivedStatus).toBe("maintenance");

      // Disable
      await api(`/api/devices/${device.deviceId}/maintenance`, {
        method: "POST",
        userId,
        body: { enabled: false },
      });
      const d2 = await api(`/api/devices/${device.deviceId}`, { userId });
      expect(d2.data.device.maintenanceMode).toBe(false);
      expect(d2.data.device.derivedStatus).toBe("available");
    });

    test("cannot reserve device in maintenance", async () => {
      const device = await createDevice(userId);
      await sendHeartbeat(device.deviceId, device.deviceToken);
      await api(`/api/devices/${device.deviceId}/maintenance`, {
        method: "POST", userId,
        body: { enabled: true },
      });
      const res = await api("/api/reservations", {
        method: "POST",
        userId,
        body: { deviceId: device.deviceId, startAt: new Date().toISOString(), endAt: new Date(Date.now() + 3600000).toISOString() },
      });
      expect(res.status).toBe(409);
      expect(res.data.error).toContain("maintenance");
    });
  });

  test.describe("Derived Status", () => {
    test("enrolled → no heartbeat", async () => {
      const device = await createDevice(userId);
      const d = await api(`/api/devices/${device.deviceId}`, { userId });
      expect(d.data.device.derivedStatus).toBe("enrolled");
    });

    test("available → after heartbeat", async () => {
      const device = await createDevice(userId);
      await sendHeartbeat(device.deviceId, device.deviceToken);
      const d = await api(`/api/devices/${device.deviceId}`, { userId });
      expect(d.data.device.derivedStatus).toBe("available");
    });

    test("reserved → with active reservation", async () => {
      const device = await createDevice(userId);
      await sendHeartbeat(device.deviceId, device.deviceToken);
      const r = await api("/api/reservations", {
        method: "POST", userId,
        body: { deviceId: device.deviceId, startAt: new Date().toISOString(), endAt: new Date(Date.now() + 3600000).toISOString() },
      });
      const d = await api(`/api/devices/${device.deviceId}`, { userId });
      expect(["reserved", "in_use"]).toContain(d.data.device.derivedStatus);
      await api(`/api/reservations/${r.data.id}`, { method: "DELETE", userId });
    });

    test("in_use → with active session", async () => {
      const device = await createDevice(userId);
      await sendHeartbeat(device.deviceId, device.deviceToken);
      const r = await api("/api/reservations", {
        method: "POST", userId,
        body: { deviceId: device.deviceId, startAt: new Date().toISOString(), endAt: new Date(Date.now() + 3600000).toISOString() },
      });
      await api("/api/sessions/connect", { method: "POST", userId, body: { deviceId: device.deviceId } });
      const d = await api(`/api/devices/${device.deviceId}`, { userId });
      expect(d.data.device.derivedStatus).toBe("in_use");
      await api(`/api/reservations/${r.data.id}`, { method: "DELETE", userId });
    });

    test("maintenance → takes precedence", async () => {
      const device = await createDevice(userId);
      await sendHeartbeat(device.deviceId, device.deviceToken);
      await api(`/api/devices/${device.deviceId}/maintenance`, {
        method: "POST", userId, body: { enabled: true },
      });
      const d = await api(`/api/devices/${device.deviceId}`, { userId });
      expect(d.data.device.derivedStatus).toBe("maintenance");
    });
  });
});
