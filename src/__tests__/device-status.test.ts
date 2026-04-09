import { DeviceService, type DeviceWithRelations } from "@/lib/services/device.service";

// Test the pure getDerivedStatus function — no DB needed.

function makeDevice(overrides: Partial<DeviceWithRelations> = {}): DeviceWithRelations {
  return {
    id: "dev-1",
    hostname: "test-host",
    displayName: null,
    osType: "linux",
    architecture: "x86_64",
    ipAddress: "10.0.0.1",
    status: "online",
    maintenanceMode: false,
    tags: [],
    notes: null,
    ownerUserId: null,
    teamId: null,
    lastHeartbeatAt: new Date(Date.now() - 10_000), // 10s ago — fresh
    lastSeenUser: null,
    idleSeconds: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    reservations: [],
    sessions: [],
    ...overrides,
  };
}

describe("DeviceService.getDerivedStatus", () => {
  test("returns 'enrolled' when device has no heartbeat", () => {
    const device = makeDevice({ lastHeartbeatAt: null });
    expect(DeviceService.getDerivedStatus(device)).toBe("enrolled");
  });

  test("returns 'offline' when heartbeat is stale", () => {
    const device = makeDevice({
      lastHeartbeatAt: new Date(Date.now() - 300_000), // 5 min ago
    });
    expect(DeviceService.getDerivedStatus(device)).toBe("offline");
  });

  test("returns 'maintenance' when maintenance mode is on", () => {
    const device = makeDevice({ maintenanceMode: true });
    expect(DeviceService.getDerivedStatus(device)).toBe("maintenance");
  });

  test("returns 'in_use' when there is an active session", () => {
    const device = makeDevice({
      sessions: [{ id: "sess-1", endedAt: null }],
    });
    expect(DeviceService.getDerivedStatus(device)).toBe("in_use");
  });

  test("returns 'reserved' when there is an active reservation but no session", () => {
    const device = makeDevice({
      reservations: [
        { id: "res-1", status: "active", endAt: new Date(Date.now() + 3600_000) },
      ],
    });
    expect(DeviceService.getDerivedStatus(device)).toBe("reserved");
  });

  test("returns 'reserved' for pending reservation", () => {
    const device = makeDevice({
      reservations: [
        { id: "res-1", status: "pending", endAt: new Date(Date.now() + 3600_000) },
      ],
    });
    expect(DeviceService.getDerivedStatus(device)).toBe("reserved");
  });

  test("returns 'available' when online with no reservations, sessions, or maintenance", () => {
    const device = makeDevice();
    expect(DeviceService.getDerivedStatus(device)).toBe("available");
  });

  test("offline takes precedence over maintenance", () => {
    const device = makeDevice({
      lastHeartbeatAt: new Date(Date.now() - 300_000),
      maintenanceMode: true,
    });
    expect(DeviceService.getDerivedStatus(device)).toBe("offline");
  });

  test("maintenance takes precedence over in_use", () => {
    const device = makeDevice({
      maintenanceMode: true,
      sessions: [{ id: "sess-1", endedAt: null }],
    });
    expect(DeviceService.getDerivedStatus(device)).toBe("maintenance");
  });

  test("in_use takes precedence over reserved", () => {
    const device = makeDevice({
      sessions: [{ id: "sess-1", endedAt: null }],
      reservations: [
        { id: "res-1", status: "active", endAt: new Date(Date.now() + 3600_000) },
      ],
    });
    expect(DeviceService.getDerivedStatus(device)).toBe("in_use");
  });

  test("completed sessions do not count as in_use", () => {
    const device = makeDevice({
      sessions: [{ id: "sess-1", endedAt: new Date() }],
    });
    expect(DeviceService.getDerivedStatus(device)).toBe("available");
  });

  test("completed/canceled reservations do not count as reserved", () => {
    const device = makeDevice({
      reservations: [
        { id: "res-1", status: "completed", endAt: new Date() },
        { id: "res-2", status: "canceled", endAt: new Date() },
      ],
    });
    expect(DeviceService.getDerivedStatus(device)).toBe("available");
  });
});
