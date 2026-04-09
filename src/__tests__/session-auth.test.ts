import { mockPrisma } from "./mock-prisma";
import { SessionService } from "@/lib/services/session.service";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("SessionService.connect — permission checks", () => {
  test("denies connection when user has no active reservation", async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "user-1",
      role: "user",
    });
    mockPrisma.reservation.findFirst.mockResolvedValue(null);

    await expect(
      SessionService.connect({ deviceId: "dev-1", userId: "user-1" })
    ).rejects.toThrow("No active reservation");
  });

  test("allows admin to connect without reservation", async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "admin-1",
      role: "admin",
    });
    mockPrisma.device.findUniqueOrThrow.mockResolvedValue({
      id: "dev-1",
      osType: "linux",
      hostname: "test-host",
      ipAddress: "10.0.0.1",
      accessMethods: [{ method: "ssh", port: 22 }],
    });
    mockPrisma.session.create.mockResolvedValue({
      id: "sess-1",
      protocol: "ssh",
    });

    const result = await SessionService.connect({
      deviceId: "dev-1",
      userId: "admin-1",
    });
    expect(result.sessionId).toBe("sess-1");
    // Should NOT have called reservation.findFirst
    expect(mockPrisma.reservation.findFirst).not.toHaveBeenCalled();
  });

  test("allows user with active reservation to connect", async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "user-1",
      role: "user",
    });
    mockPrisma.reservation.findFirst.mockResolvedValue({
      id: "res-1",
      status: "active",
    });
    mockPrisma.device.findUniqueOrThrow.mockResolvedValue({
      id: "dev-1",
      osType: "windows",
      hostname: "win-host",
      ipAddress: "10.0.0.2",
      accessMethods: [{ method: "rdp", port: 3389 }],
    });
    mockPrisma.session.create.mockResolvedValue({
      id: "sess-2",
      protocol: "rdp",
    });

    const result = await SessionService.connect({
      deviceId: "dev-1",
      userId: "user-1",
    });
    expect(result.sessionId).toBe("sess-2");
  });

  test("uses correct protocol for Windows (RDP) when no access methods defined", async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "admin-1",
      role: "admin",
    });
    mockPrisma.device.findUniqueOrThrow.mockResolvedValue({
      id: "dev-1",
      osType: "windows",
      hostname: "win-host",
      ipAddress: "10.0.0.2",
      accessMethods: [],
    });
    mockPrisma.session.create.mockImplementation(({ data }) => {
      return Promise.resolve({ id: "sess-3", ...data });
    });

    await SessionService.connect({ deviceId: "dev-1", userId: "admin-1" });

    const createCall = mockPrisma.session.create.mock.calls[0][0];
    expect(createCall.data.protocol).toBe("rdp");
  });

  test("uses SSH for Linux when no access methods defined", async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "admin-1",
      role: "admin",
    });
    mockPrisma.device.findUniqueOrThrow.mockResolvedValue({
      id: "dev-1",
      osType: "linux",
      hostname: "linux-host",
      ipAddress: "10.0.0.3",
      accessMethods: [],
    });
    mockPrisma.session.create.mockImplementation(({ data }) => {
      return Promise.resolve({ id: "sess-4", ...data });
    });

    await SessionService.connect({ deviceId: "dev-1", userId: "admin-1" });

    const createCall = mockPrisma.session.create.mock.calls[0][0];
    expect(createCall.data.protocol).toBe("ssh");
  });
});

describe("SessionService.disconnect", () => {
  test("ends an active session", async () => {
    mockPrisma.session.findUniqueOrThrow.mockResolvedValue({
      id: "sess-1",
      endedAt: null,
      brokerSessionId: "broker-1",
    });
    mockPrisma.session.update.mockResolvedValue({
      id: "sess-1",
      endedAt: new Date(),
      terminationReason: "user_disconnect",
    });

    const result = await SessionService.disconnect("sess-1");
    expect(result.endedAt).toBeTruthy();
  });

  test("rejects disconnect of already ended session", async () => {
    mockPrisma.session.findUniqueOrThrow.mockResolvedValue({
      id: "sess-1",
      endedAt: new Date(),
    });

    await expect(SessionService.disconnect("sess-1")).rejects.toThrow(
      "already ended"
    );
  });
});
