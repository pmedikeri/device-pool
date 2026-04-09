import { mockPrisma } from "./mock-prisma";
import { AuditService } from "@/lib/services/audit.service";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("AuditService.log", () => {
  test("creates an audit event", async () => {
    mockPrisma.auditEvent.create.mockResolvedValue({
      id: "evt-1",
      eventType: "device_registered",
      userId: "user-1",
      deviceId: "dev-1",
      createdAt: new Date(),
    });

    const result = await AuditService.log({
      eventType: "device_registered",
      userId: "user-1",
      deviceId: "dev-1",
      details: { hostname: "test" },
    });

    expect(result.id).toBe("evt-1");
    expect(result.eventType).toBe("device_registered");

    const createCall = mockPrisma.auditEvent.create.mock.calls[0][0];
    expect(createCall.data.eventType).toBe("device_registered");
    expect(createCall.data.userId).toBe("user-1");
    expect(createCall.data.deviceId).toBe("dev-1");
  });

  test("creates event without optional fields", async () => {
    mockPrisma.auditEvent.create.mockResolvedValue({
      id: "evt-2",
      eventType: "user_created",
      createdAt: new Date(),
    });

    await AuditService.log({ eventType: "user_created" });

    const createCall = mockPrisma.auditEvent.create.mock.calls[0][0];
    expect(createCall.data.userId).toBeUndefined();
    expect(createCall.data.deviceId).toBeUndefined();
  });
});

describe("AuditService.getEvents", () => {
  test("returns events with default pagination", async () => {
    const mockEvents = [
      { id: "evt-1", eventType: "device_registered", createdAt: new Date() },
    ];
    mockPrisma.auditEvent.findMany.mockResolvedValue(mockEvents);

    const events = await AuditService.getEvents();
    expect(events).toHaveLength(1);

    const findCall = mockPrisma.auditEvent.findMany.mock.calls[0][0];
    expect(findCall.take).toBe(50); // default limit
    expect(findCall.skip).toBe(0);
  });

  test("filters by event type", async () => {
    mockPrisma.auditEvent.findMany.mockResolvedValue([]);

    await AuditService.getEvents({ eventType: "connect_granted" });

    const findCall = mockPrisma.auditEvent.findMany.mock.calls[0][0];
    expect(findCall.where.eventType).toBe("connect_granted");
  });

  test("filters by device and user", async () => {
    mockPrisma.auditEvent.findMany.mockResolvedValue([]);

    await AuditService.getEvents({ deviceId: "dev-1", userId: "user-1" });

    const findCall = mockPrisma.auditEvent.findMany.mock.calls[0][0];
    expect(findCall.where.deviceId).toBe("dev-1");
    expect(findCall.where.userId).toBe("user-1");
  });
});
