import { prisma } from "@/lib/db/client";
import { config } from "@/lib/config";
import { ValidationError, ForbiddenError, ConflictError } from "@/lib/errors";
import { SshKeyService } from "./ssh-key.service";
import type {
  Reservation,
  ReservationStatus,
  Prisma,
} from "@/generated/prisma";

// ---------------------------------------------------------------------------
// ReservationService
// ---------------------------------------------------------------------------

export interface CreateReservationParams {
  deviceId: string;
  userId: string;
  teamId?: string;
  startAt: Date;
  endAt: Date;
  reason?: string;
}

export const ReservationService = {
  // ── Create ──────────────────────────────────────────────────────────────

  async create(params: CreateReservationParams): Promise<Reservation> {
    const { deviceId, userId, teamId, startAt, endAt, reason } = params;
    const now = new Date();

    // --- Validation ---

    // startAt must be in the future (1 minute tolerance for "book now")
    const toleranceMs = 60 * 1000;
    if (startAt.getTime() < now.getTime() - toleranceMs) {
      throw new ValidationError("Reservation start time must be in the future");
    }

    // endAt after startAt
    if (endAt <= startAt) {
      throw new ValidationError("End time must be after start time");
    }

    // Max duration
    const durationHours =
      (endAt.getTime() - startAt.getTime()) / (1000 * 60 * 60);
    if (durationHours > config.maxReservationHours) {
      throw new ValidationError(
        `Reservation duration exceeds maximum of ${config.maxReservationHours} hours`
      );
    }

    // Device must exist and not be in maintenance
    const device = await prisma.device.findUniqueOrThrow({
      where: { id: deviceId },
    });

    if (device.maintenanceMode) {
      throw new ConflictError("Device is currently in maintenance mode");
    }

    // --- Overlap check with row-level locking ---
    // Use a raw query with FOR UPDATE to prevent concurrent double-booking.
    const overlapping = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM reservations
      WHERE "deviceId" = ${deviceId}
        AND status IN ('pending', 'active')
        AND "startAt" < ${endAt}
        AND "endAt" > ${startAt}
      FOR UPDATE
    `;

    if (overlapping.length > 0) {
      throw new ConflictError(
        "Device already has an overlapping reservation for the requested time window"
      );
    }

    // --- Create ---
    const checkInDeadlineAt = new Date(
      startAt.getTime() + config.reservationGraceMinutes * 60 * 1000
    );

    return prisma.reservation.create({
      data: {
        deviceId,
        userId,
        teamId,
        startAt,
        endAt,
        reason,
        status: "pending",
        checkInDeadlineAt,
      },
    });
  },

  // ── Update (extend/change time) ────────────────────────────────────────

  async update(
    reservationId: string,
    userId: string,
    data: { startAt?: Date; endAt?: Date; reason?: string }
  ): Promise<Reservation> {
    const reservation = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservationId },
    });

    if (reservation.userId !== userId) {
      throw new ForbiddenError("Only the reservation owner can modify it");
    }

    if (!["pending", "active"].includes(reservation.status)) {
      throw new ConflictError(
        `Cannot modify a reservation with status "${reservation.status}"`
      );
    }

    const newStartAt = data.startAt || reservation.startAt;
    const newEndAt = data.endAt || reservation.endAt;

    if (newEndAt <= newStartAt) {
      throw new ValidationError("End time must be after start time");
    }

    const durationHours =
      (newEndAt.getTime() - newStartAt.getTime()) / (1000 * 60 * 60);
    if (durationHours > config.maxReservationHours) {
      throw new ValidationError(
        `Reservation duration exceeds maximum of ${config.maxReservationHours} hours (${Math.round(config.maxReservationHours / 24)} days)`
      );
    }

    // Check for overlaps with OTHER reservations (exclude self)
    const overlapping = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM reservations
      WHERE "deviceId" = ${reservation.deviceId}
        AND id != ${reservationId}
        AND status IN ('pending', 'active')
        AND "startAt" < ${newEndAt}
        AND "endAt" > ${newStartAt}
      FOR UPDATE
    `;

    if (overlapping.length > 0) {
      throw new ConflictError("Updated time conflicts with another reservation");
    }

    return prisma.reservation.update({
      where: { id: reservationId },
      data: {
        startAt: data.startAt,
        endAt: data.endAt,
        reason: data.reason !== undefined ? data.reason : undefined,
        checkInDeadlineAt: data.startAt
          ? new Date(newStartAt.getTime() + config.reservationGraceMinutes * 60 * 1000)
          : undefined,
      },
    });
  },

  // ── Cancel ──────────────────────────────────────────────────────────────

  async cancel(reservationId: string, userId: string): Promise<Reservation> {
    const reservation = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservationId },
    });

    if (reservation.userId !== userId) {
      throw new ForbiddenError("Only the reservation owner can cancel it");
    }

    if (!["pending", "active"].includes(reservation.status)) {
      throw new ConflictError(
        `Cannot cancel a reservation with status "${reservation.status}"`
      );
    }

    // End any active sessions for this device+user
    await prisma.session.updateMany({
      where: {
        deviceId: reservation.deviceId,
        userId: reservation.userId,
        endedAt: null,
      },
      data: { endedAt: new Date(), terminationReason: "reservation_released" },
    });

    // Remove SSH key from device
    try {
      const device = await prisma.device.findUnique({ where: { id: reservation.deviceId } });
      if (device && device.sshPasswordEnc && device.sshUsername) {
        console.log(`Removing SSH key for user ${reservation.userId} from ${device.hostname}`);
        await SshKeyService.removeKey({
          host: device.ipAddress ?? device.hostname,
          port: 22,
          username: device.sshUsername,
          encryptedPassword: device.sshPasswordEnc,
          userId: reservation.userId,
        });
        console.log("SSH key removed successfully");
      } else {
        console.log("Skipping SSH key removal — no device credentials found");
      }
    } catch (err) {
      console.error("Failed to remove SSH key on release:", err);
    }

    return prisma.reservation.update({
      where: { id: reservationId },
      data: { status: "canceled" },
    });
  },

  // ── Admin override ──────────────────────────────────────────────────────

  async adminOverride(
    reservationId: string,
    adminUserId: string,
    reason?: string
  ): Promise<Reservation> {
    const reservation = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservationId },
    });

    if (!["pending", "active"].includes(reservation.status)) {
      throw new ConflictError(
        `Cannot override a reservation with status "${reservation.status}"`
      );
    }

    return prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: "canceled",
        overrideByUserId: adminUserId,
        reason: reason
          ? `[Admin override] ${reason}`
          : `[Admin override] Canceled by admin`,
      },
    });
  },

  // ── Check-in ────────────────────────────────────────────────────────────

  async checkIn(reservationId: string, userId: string): Promise<Reservation> {
    const reservation = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservationId },
    });

    if (reservation.userId !== userId) {
      throw new ForbiddenError("Only the reservation owner can check in");
    }

    if (reservation.status !== "pending") {
      throw new ConflictError(
        `Cannot check in to a reservation with status "${reservation.status}"`
      );
    }

    return prisma.reservation.update({
      where: { id: reservationId },
      data: { status: "active" },
    });
  },

  // ── List ────────────────────────────────────────────────────────────────

  async list(filters: {
    userId?: string;
    deviceId?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<Reservation[]> {
    const where: Prisma.ReservationWhereInput = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.deviceId) where.deviceId = filters.deviceId;
    if (filters.status) where.status = filters.status as ReservationStatus;

    const limit = filters.limit ?? 20;
    const page = filters.page ?? 1;

    return prisma.reservation.findMany({
      where,
      orderBy: { startAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
      include: {
        user: { select: { id: true, email: true, name: true } },
        device: { select: { id: true, hostname: true, displayName: true, osType: true } },
      },
    });
  },

  // ── Get by ID ──────────────────────────────────────────────────────────

  async getById(id: string): Promise<Reservation | null> {
    return prisma.reservation.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true } },
        device: { select: { id: true, hostname: true, osType: true } },
      },
    });
  },

  // ── Queries ─────────────────────────────────────────────────────────────

  async getByDevice(deviceId: string): Promise<Reservation[]> {
    return prisma.reservation.findMany({
      where: { deviceId },
      orderBy: { startAt: "desc" },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  },

  async getByUser(userId: string): Promise<Reservation[]> {
    return prisma.reservation.findMany({
      where: { userId },
      orderBy: { startAt: "desc" },
      include: { device: { select: { id: true, hostname: true, osType: true } } },
    });
  },

  async getActiveForDevice(deviceId: string): Promise<Reservation | null> {
    return prisma.reservation.findFirst({
      where: {
        deviceId,
        status: "active",
      },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  },

  // ── Cron: process expired / no-show ─────────────────────────────────────

  async processExpired(): Promise<{
    expired: number;
    noShow: number;
    completed: number;
  }> {
    const now = new Date();

    // 1. Active reservations past their endAt → completed + close sessions + remove SSH keys
    const expiredActiveReservations = await prisma.reservation.findMany({
      where: { status: "active", endAt: { lt: now } },
      include: { device: true },
    });

    for (const res of expiredActiveReservations) {
      // Close sessions
      await prisma.session.updateMany({
        where: { deviceId: res.deviceId, userId: res.userId, endedAt: null },
        data: { endedAt: now, terminationReason: "reservation_expired" },
      });
      // Remove SSH key
      try {
        if (res.device.sshPasswordEnc && res.device.sshUsername) {
          await SshKeyService.removeKey({
            host: res.device.ipAddress ?? res.device.hostname,
            port: 22,
            username: res.device.sshUsername,
            encryptedPassword: res.device.sshPasswordEnc,
            userId: res.userId,
          });
        }
      } catch (err) {
        console.error(`Failed to remove SSH key for expired reservation ${res.id}:`, err);
      }
    }

    const completed = await prisma.reservation.updateMany({
      where: { status: "active", endAt: { lt: now } },
      data: { status: "completed" },
    });

    // 2. Pending reservations whose endAt has passed → expired
    const expired = await prisma.reservation.updateMany({
      where: { status: "pending", endAt: { lt: now } },
      data: { status: "expired" },
    });

    // 3. Pending reservations past check-in deadline → no_show (only if no session was started)
    //    If a session exists (linked or unlinked but same device+user), promote to active instead.
    const deadlinePassed = await prisma.reservation.findMany({
      where: {
        status: "pending",
        checkInDeadlineAt: { lt: now },
        endAt: { gte: now },
      },
      select: { id: true, deviceId: true, userId: true },
    });

    const promoteIds: string[] = [];
    const noShowIds: string[] = [];
    for (const r of deadlinePassed) {
      const hasSession = await prisma.session.findFirst({
        where: {
          deviceId: r.deviceId,
          userId: r.userId,
          endedAt: null,
        },
      });
      if (hasSession) {
        promoteIds.push(r.id);
      } else {
        noShowIds.push(r.id);
      }
    }
    if (promoteIds.length > 0) {
      await prisma.reservation.updateMany({
        where: { id: { in: promoteIds } },
        data: { status: "active" },
      });
    }
    if (noShowIds.length > 0) {
      await prisma.reservation.updateMany({
        where: { id: { in: noShowIds } },
        data: { status: "no_show" },
      });
    }
    const noShow = { count: noShowIds.length };

    // 4. Close orphaned sessions (reservation ended/cancelled — but NOT no_show, user may reconnect)
    await prisma.session.updateMany({
      where: {
        endedAt: null,
        reservation: { status: { in: ["expired", "completed", "canceled"] } },
      },
      data: { endedAt: now, terminationReason: "reservation_ended" },
    });

    return {
      expired: expired.count,
      noShow: noShow.count,
      completed: completed.count,
    };
  },
};
