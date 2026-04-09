import { mockPrisma } from "./mock-prisma";
import { ReservationService } from "@/lib/services/reservation.service";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ReservationService.create", () => {
  const baseParams = {
    deviceId: "dev-1",
    userId: "user-1",
    startAt: new Date(Date.now() + 60_000), // 1 min in future
    endAt: new Date(Date.now() + 3600_000), // 1 hour in future
  };

  test("rejects start time in the past", async () => {
    await expect(
      ReservationService.create({
        ...baseParams,
        startAt: new Date(Date.now() - 120_000), // 2 min ago
      })
    ).rejects.toThrow("start time must be in the future");
  });

  test("rejects end time before start time", async () => {
    const start = new Date(Date.now() + 60_000);
    await expect(
      ReservationService.create({
        ...baseParams,
        startAt: start,
        endAt: new Date(start.getTime() - 1000),
      })
    ).rejects.toThrow("End time must be after start time");
  });

  test("rejects duration exceeding maximum", async () => {
    const start = new Date(Date.now() + 60_000);
    await expect(
      ReservationService.create({
        ...baseParams,
        startAt: start,
        endAt: new Date(start.getTime() + 25 * 3600_000), // 25 hours
      })
    ).rejects.toThrow("exceeds maximum");
  });

  test("rejects reservation on device in maintenance", async () => {
    mockPrisma.device.findUniqueOrThrow.mockResolvedValue({
      id: "dev-1",
      maintenanceMode: true,
    });

    await expect(ReservationService.create(baseParams)).rejects.toThrow(
      "maintenance mode"
    );
  });

  test("rejects overlapping reservation", async () => {
    mockPrisma.device.findUniqueOrThrow.mockResolvedValue({
      id: "dev-1",
      maintenanceMode: false,
    });
    mockPrisma.$queryRaw.mockResolvedValue([{ id: "existing-res" }]);

    await expect(ReservationService.create(baseParams)).rejects.toThrow(
      "overlapping reservation"
    );
  });

  test("creates reservation when all validations pass", async () => {
    mockPrisma.device.findUniqueOrThrow.mockResolvedValue({
      id: "dev-1",
      maintenanceMode: false,
      status: "online",
    });
    mockPrisma.$queryRaw.mockResolvedValue([]); // no overlaps
    mockPrisma.reservation.create.mockResolvedValue({
      id: "res-1",
      ...baseParams,
      status: "pending",
    });

    const result = await ReservationService.create(baseParams);
    expect(result.id).toBe("res-1");
    expect(result.status).toBe("pending");
    expect(mockPrisma.reservation.create).toHaveBeenCalledTimes(1);
  });

  test("sets checkInDeadlineAt based on grace period", async () => {
    mockPrisma.device.findUniqueOrThrow.mockResolvedValue({
      id: "dev-1",
      maintenanceMode: false,
    });
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.reservation.create.mockImplementation(({ data }) => {
      return Promise.resolve({ id: "res-1", ...data });
    });

    await ReservationService.create(baseParams);

    const createCall = mockPrisma.reservation.create.mock.calls[0][0];
    const deadline = new Date(createCall.data.checkInDeadlineAt);
    const start = new Date(createCall.data.startAt);
    const graceMs = deadline.getTime() - start.getTime();
    // Default grace is 10 minutes = 600000ms
    expect(graceMs).toBe(10 * 60 * 1000);
  });
});

describe("ReservationService.cancel", () => {
  test("allows owner to cancel pending reservation", async () => {
    mockPrisma.reservation.findUniqueOrThrow.mockResolvedValue({
      id: "res-1",
      userId: "user-1",
      status: "pending",
    });
    mockPrisma.reservation.update.mockResolvedValue({
      id: "res-1",
      status: "canceled",
    });

    const result = await ReservationService.cancel("res-1", "user-1");
    expect(result.status).toBe("canceled");
  });

  test("rejects cancel by non-owner", async () => {
    mockPrisma.reservation.findUniqueOrThrow.mockResolvedValue({
      id: "res-1",
      userId: "user-1",
      status: "pending",
    });

    await expect(
      ReservationService.cancel("res-1", "other-user")
    ).rejects.toThrow("Only the reservation owner");
  });

  test("rejects cancel of completed reservation", async () => {
    mockPrisma.reservation.findUniqueOrThrow.mockResolvedValue({
      id: "res-1",
      userId: "user-1",
      status: "completed",
    });

    await expect(
      ReservationService.cancel("res-1", "user-1")
    ).rejects.toThrow("Cannot cancel");
  });
});

describe("ReservationService.adminOverride", () => {
  test("admin can force-cancel active reservation", async () => {
    mockPrisma.reservation.findUniqueOrThrow.mockResolvedValue({
      id: "res-1",
      userId: "user-1",
      status: "active",
    });
    mockPrisma.reservation.update.mockResolvedValue({
      id: "res-1",
      status: "canceled",
      overrideByUserId: "admin-1",
    });

    const result = await ReservationService.adminOverride("res-1", "admin-1", "Need device urgently");
    expect(result.status).toBe("canceled");
    expect(mockPrisma.reservation.update.mock.calls[0][0].data.overrideByUserId).toBe("admin-1");
  });

  test("rejects override of already completed reservation", async () => {
    mockPrisma.reservation.findUniqueOrThrow.mockResolvedValue({
      id: "res-1",
      status: "expired",
    });

    await expect(
      ReservationService.adminOverride("res-1", "admin-1")
    ).rejects.toThrow("Cannot override");
  });
});

describe("ReservationService.checkIn", () => {
  test("activates pending reservation for owner", async () => {
    mockPrisma.reservation.findUniqueOrThrow.mockResolvedValue({
      id: "res-1",
      userId: "user-1",
      status: "pending",
    });
    mockPrisma.reservation.update.mockResolvedValue({
      id: "res-1",
      status: "active",
    });

    const result = await ReservationService.checkIn("res-1", "user-1");
    expect(result.status).toBe("active");
  });

  test("rejects check-in by non-owner", async () => {
    mockPrisma.reservation.findUniqueOrThrow.mockResolvedValue({
      id: "res-1",
      userId: "user-1",
      status: "pending",
    });

    await expect(
      ReservationService.checkIn("res-1", "other-user")
    ).rejects.toThrow("Only the reservation owner");
  });
});

describe("ReservationService.processExpired", () => {
  test("transitions expired, no-show, and completed reservations", async () => {
    // findMany for expired active reservations (for session cleanup)
    mockPrisma.reservation.findMany.mockResolvedValueOnce([]);
    // updateMany calls: completed, expired, no_show, orphan sessions
    mockPrisma.reservation.updateMany
      .mockResolvedValueOnce({ count: 2 }) // completed (active past endAt)
      .mockResolvedValueOnce({ count: 3 }) // expired (pending past endAt)
      .mockResolvedValueOnce({ count: 1 }); // no_show (pending past checkInDeadline, endAt still future)
    mockPrisma.session.updateMany.mockResolvedValue({ count: 0 }); // orphan sessions

    const result = await ReservationService.processExpired();
    expect(result).toEqual({ expired: 3, noShow: 1, completed: 2 });
  });
});
