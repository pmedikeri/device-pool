import { prisma } from "@/lib/db/client";
import { config } from "@/lib/config";
import type {
  AccessMethod,
  Device,
  DeviceHeartbeat,
  OsType,
  DeviceStatus,
  Prisma,
} from "@/generated/prisma";

// ---------------------------------------------------------------------------
// DeviceService
// ---------------------------------------------------------------------------

/** Composite status derived at runtime from multiple signals. */
export type DerivedStatus =
  | "offline"
  | "maintenance"
  | "in_use"
  | "reserved"
  | "available"
  | "enrolled";

export interface DeviceListFilters {
  osType?: OsType;
  status?: DeviceStatus;
  search?: string;
  tags?: string[];
}

export interface HeartbeatData {
  hostname: string;
  osInfo?: string;
  localUser?: string;
  idleSeconds?: number;
  sessionActive?: boolean;
  ipAddress?: string;
  cpuPercent?: number;
  memPercent?: number;
  gpuPercent?: number;
  gpuMemPercent?: number;
  gpuName?: string;
}

/** Device with its relations loaded for derived-status computation. */
export type DeviceWithRelations = Device & {
  reservations?: { id: string; status: string; endAt: Date }[];
  sessions?: { id: string; endedAt: Date | null }[];
};

export const DeviceService = {
  // ── List ────────────────────────────────────────────────────────────────

  async list(filters: DeviceListFilters = {}) {
    // Clean up expired reservations and orphaned sessions on every list call
    const { ReservationService } = await import("./reservation.service");
    await ReservationService.processExpired().catch(() => {});
    const where: Prisma.DeviceWhereInput = {};

    if (filters.osType) where.osType = filters.osType;
    if (filters.status) where.status = filters.status;
    if (filters.search) {
      where.OR = [
        { hostname: { contains: filters.search, mode: "insensitive" } },
        { displayName: { contains: filters.search, mode: "insensitive" } },
        { ipAddress: { contains: filters.search, mode: "insensitive" } },
      ];
    }
    if (filters.tags && filters.tags.length > 0) {
      where.tags = { hasSome: filters.tags };
    }

    const devices = await prisma.device.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        accessMethods: true,
        capabilities: true,
        reservations: {
          where: { status: { in: ["pending", "active"] } },
          select: { id: true, status: true, startAt: true, endAt: true, userId: true, user: { select: { id: true, name: true } } },
        },
        sessions: {
          where: { endedAt: null },
          select: { id: true, endedAt: true, user: { select: { name: true } } },
        },
      },
      orderBy: { hostname: "asc" },
    });

    return devices.map((d) => {
      const { sshPasswordEnc, ...rest } = d as typeof d & { sshPasswordEnc?: string };
      return {
        ...rest,
        hasCredentials: !!sshPasswordEnc,
        derivedStatus: DeviceService.getDerivedStatus(d),
      };
    });
  },

  // ── Create ──────────────────────────────────────────────────────────────

  async create(data: {
    hostname: string;
    displayName?: string;
    osType: OsType;
    architecture?: string;
    ipAddress?: string;
    tags?: string[];
    notes?: string;
    teamId?: string;
    ownerUserId?: string;
    accessMethods?: { method: AccessMethod; port?: number; metadata?: Record<string, unknown> }[];
  }): Promise<Device> {
    return prisma.device.create({
      data: {
        hostname: data.hostname,
        displayName: data.displayName,
        osType: data.osType,
        architecture: data.architecture,
        ipAddress: data.ipAddress,
        tags: data.tags ?? [],
        notes: data.notes,
        teamId: data.teamId,
        ownerUserId: data.ownerUserId,
        status: "enrolled",
        accessMethods: data.accessMethods
          ? {
              create: data.accessMethods.map((am) => ({
                method: am.method,
                port: am.port,
              })),
            }
          : undefined,
      },
      include: {
        accessMethods: true,
        capabilities: true,
      },
    });
  },

  // ── Get by ID ───────────────────────────────────────────────────────────

  async getById(id: string) {
    const device = await prisma.device.findUniqueOrThrow({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        team: { select: { id: true, name: true } },
        accessMethods: true,
        capabilities: true,
        reservations: {
          orderBy: { startAt: "desc" },
          take: 10,
          include: { user: { select: { id: true, name: true } } },
        },
        sessions: {
          orderBy: { startedAt: "desc" },
          take: 10,
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });

    const { sshPasswordEnc, ...safeDevice } = device as typeof device & { sshPasswordEnc?: string };
    return {
      ...safeDevice,
      hasCredentials: !!sshPasswordEnc,
      derivedStatus: DeviceService.getDerivedStatus(device),
    };
  },

  // ── Derived status (pure) ───────────────────────────────────────────────

  getDerivedStatus(device: DeviceWithRelations): DerivedStatus {
    if (!device.lastHeartbeatAt) {
      return "enrolled";
    }

    const staleMs = config.heartbeatStaleSeconds * 1000;
    if (Date.now() - device.lastHeartbeatAt.getTime() > staleMs) {
      return "offline";
    }

    if (device.maintenanceMode) {
      return "maintenance";
    }

    // Active session (someone clicked Connect) → in use
    const activeSessions = device.sessions?.filter((s) => s.endedAt === null) ?? [];
    if (activeSessions.length > 0) {
      return "in_use";
    }

    // Has an active reservation but no session yet → reserved
    const activeReservations =
      device.reservations?.filter(
        (r) => r.status === "active" || r.status === "pending"
      ) ?? [];
    if (activeReservations.length > 0) {
      return "reserved";
    }

    return "available";
  },

  // ── Heartbeat ───────────────────────────────────────────────────────────

  async processHeartbeat(
    deviceId: string,
    data: HeartbeatData
  ): Promise<DeviceHeartbeat> {
    // Update the device record with latest heartbeat info
    await prisma.device.update({
      where: { id: deviceId },
      data: {
        lastHeartbeatAt: new Date(),
        status: "online",
        hostname: data.hostname,
        lastSeenUser: data.localUser ?? undefined,
        idleSeconds: data.idleSeconds ?? undefined,
        ipAddress: data.ipAddress ?? undefined,
        cpuPercent: data.cpuPercent ?? undefined,
        memPercent: data.memPercent ?? undefined,
        gpuPercent: (data.gpuPercent != null && data.gpuPercent >= 0) ? data.gpuPercent : undefined,
        gpuMemPercent: (data.gpuMemPercent != null && data.gpuMemPercent >= 0) ? data.gpuMemPercent : undefined,
        displayName: data.gpuName || undefined,
      },
    });

    // Create heartbeat history record
    return prisma.deviceHeartbeat.create({
      data: {
        deviceId,
        hostname: data.hostname,
        osInfo: data.osInfo,
        localUser: data.localUser,
        idleSeconds: data.idleSeconds,
        sessionActive: data.sessionActive ?? false,
      },
    });
  },

  // ── Update ──────────────────────────────────────────────────────────────

  async updateDevice(
    id: string,
    data: Prisma.DeviceUpdateInput
  ): Promise<Device> {
    return prisma.device.update({ where: { id }, data });
  },

  // ── Maintenance mode ────────────────────────────────────────────────────

  async setMaintenanceMode(
    id: string,
    enabled: boolean,
    reason?: string
  ): Promise<Device> {
    const device = await prisma.device.update({
      where: { id },
      data: { maintenanceMode: enabled },
    });

    if (enabled) {
      await prisma.maintenanceWindow.create({
        data: { deviceId: id, reason, startAt: new Date() },
      });
    } else {
      // Close the most recent open maintenance window
      const openWindow = await prisma.maintenanceWindow.findFirst({
        where: { deviceId: id, endAt: null },
        orderBy: { startAt: "desc" },
      });
      if (openWindow) {
        await prisma.maintenanceWindow.update({
          where: { id: openWindow.id },
          data: { endAt: new Date() },
        });
      }
    }

    return device;
  },

  // ── Revoke ──────────────────────────────────────────────────────────────

  async revokeDevice(id: string): Promise<Device> {
    // Cancel any active/pending reservations
    await prisma.reservation.updateMany({
      where: { deviceId: id, status: { in: ["pending", "active"] } },
      data: { status: "canceled" },
    });

    // End any active sessions
    await prisma.session.updateMany({
      where: { deviceId: id, endedAt: null },
      data: { endedAt: new Date(), terminationReason: "device_revoked" },
    });

    // Mark device as offline (soft-delete equivalent)
    return prisma.device.update({
      where: { id },
      data: { status: "offline", maintenanceMode: true },
    });
  },
};
