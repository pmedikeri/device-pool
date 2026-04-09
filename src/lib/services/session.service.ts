import { prisma } from "@/lib/db/client";
import type { Session, SessionProtocol } from "@/generated/prisma";
import { ForbiddenError, ConflictError } from "@/lib/errors";
import { GuacamoleMockAdapter, type BrokerAdapter } from "./broker.adapter";
import { decrypt } from "@/lib/crypto";
import { SshKeyService } from "./ssh-key.service";

// ---------------------------------------------------------------------------
// SessionService — remote connection session management
// ---------------------------------------------------------------------------

/** Swap this out with a real adapter when integrating Guacamole. */
const broker: BrokerAdapter = new GuacamoleMockAdapter();

export interface ConnectParams {
  deviceId: string;
  userId: string;
  reservationId?: string;
}

export interface ConnectResult {
  sessionId: string;
  brokerUrl: string;
  sshCommand?: string;
  sshPassword?: string;
  sshHost?: string;
  sshPort?: number;
  sshUsername?: string;
  keyInjected?: boolean;
}

export const SessionService = {
  /**
   * Create a new remote session after authorization checks.
   */
  async connect(params: ConnectParams): Promise<ConnectResult> {
    const { deviceId, userId, reservationId } = params;

    // Load user to check role
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    // Non-admins must have an active or pending (auto check-in) reservation
    let resolvedReservationId = reservationId;

    if (user.role !== "admin") {
      const now = new Date();

      // First look for an active reservation covering the current time
      let reservation = await prisma.reservation.findFirst({
        where: {
          deviceId,
          userId,
          status: "active",
          startAt: { lte: now },
          endAt: { gte: now },
        },
      });

      // If not found, look for a pending reservation covering the current time (auto check-in)
      if (!reservation) {
        reservation = await prisma.reservation.findFirst({
          where: {
            deviceId,
            userId,
            status: "pending",
            startAt: { lte: now },
            endAt: { gte: now },
          },
        });

        if (reservation) {
          // Auto check-in: promote pending → active
          reservation = await prisma.reservation.update({
            where: { id: reservation.id },
            data: { status: "active" },
          });
        }
      }

      if (!reservation) {
        throw new ForbiddenError(
          "No active reservation found. You must have an active reservation to connect."
        );
      }

      resolvedReservationId = reservation.id;
    }

    // Close any existing sessions for this user on this device
    await prisma.session.updateMany({
      where: { deviceId, userId, endedAt: null },
      data: { endedAt: new Date(), terminationReason: "new_session" },
    });

    // Load device with access methods to determine protocol
    const device = await prisma.device.findUniqueOrThrow({
      where: { id: deviceId },
      include: { accessMethods: true },
    });

    // Determine protocol based on OS / available access methods
    let protocol: SessionProtocol;
    let port: number;

    const preferredMethod = device.accessMethods[0];

    if (preferredMethod) {
      protocol = preferredMethod.method as SessionProtocol;
      port = preferredMethod.port ?? getDefaultPort(protocol);
    } else {
      // Fallback: OS-based defaults
      if (device.osType === "windows") {
        protocol = "rdp";
        port = 3389;
      } else {
        protocol = "ssh";
        port = 22;
      }
    }

    // Decrypt SSH credentials if available
    const sshHost = device.ipAddress ?? device.hostname;
    const sshPort = port;
    const sshUser = (device as Record<string, unknown>).sshUsername as string | undefined;
    const sshPasswordEnc = (device as Record<string, unknown>).sshPasswordEnc as string | undefined;
    const sshPassword = sshPasswordEnc ? decrypt(sshPasswordEnc) : undefined;

    // Build SSH command
    let sshCommand: string | undefined;
    if (sshUser) {
      sshCommand = sshPort !== 22
        ? `ssh -p ${sshPort} ${sshUser}@${sshHost}`
        : `ssh ${sshUser}@${sshHost}`;
    }

    // Create broker connection (keeps session record)
    const brokerResult = await broker.createConnection({
      deviceId: device.id,
      hostname: sshHost,
      protocol,
      port,
      username: sshUser ?? device.lastSeenUser ?? undefined,
    });

    // Persist the session
    const session = await prisma.session.create({
      data: {
        deviceId,
        userId,
        reservationId: resolvedReservationId ?? undefined,
        protocol,
        brokerSessionId: brokerResult.brokerSessionId,
      },
    });

    // If user has an SSH public key and device has credentials, inject the key
    let keyInjected = false;
    if (user.sshPublicKey && sshUser && sshPasswordEnc) {
      try {
        await SshKeyService.addKey({
          host: sshHost,
          port: sshPort,
          username: sshUser,
          encryptedPassword: sshPasswordEnc,
          publicKey: user.sshPublicKey,
          userId: user.id,
        });
        keyInjected = true;
      } catch (err) {
        console.error("Failed to inject SSH key:", err);
        // Fall back to password-based auth
      }
    }

    return {
      sessionId: session.id,
      brokerUrl: brokerResult.connectionUrl,
      sshCommand,
      sshPassword: keyInjected ? undefined : sshPassword, // Don't show password if key was injected
      sshHost,
      sshPort,
      sshUsername: sshUser,
      keyInjected,
    };
  },

  /**
   * End a session.
   */
  async disconnect(sessionId: string, reason?: string): Promise<Session> {
    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
    });

    if (session.endedAt) {
      throw new ConflictError("Session is already ended");
    }

    // Destroy broker connection
    if (session.brokerSessionId) {
      await broker.destroyConnection(session.brokerSessionId);
    }

    return prisma.session.update({
      where: { id: sessionId },
      data: {
        endedAt: new Date(),
        terminationReason: reason ?? "user_disconnect",
      },
    });
  },

  /**
   * List sessions with optional filters.
   */
  async list(filters: {
    userId?: string;
    deviceId?: string;
    active?: boolean;
    page?: number;
    limit?: number;
  } = {}): Promise<Session[]> {
    const where: Record<string, unknown> = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.deviceId) where.deviceId = filters.deviceId;
    if (filters.active === true) where.endedAt = null;
    if (filters.active === false) where.endedAt = { not: null };

    const limit = filters.limit ?? 20;
    const page = filters.page ?? 1;

    return prisma.session.findMany({
      where,
      include: {
        device: { select: { id: true, hostname: true, osType: true } },
        user: { select: { id: true, email: true, name: true } },
      },
      orderBy: { startedAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
    });
  },

  /**
   * Get a session by ID.
   */
  async getById(id: string): Promise<Session | null> {
    return prisma.session.findUnique({
      where: { id },
      include: {
        device: { select: { id: true, hostname: true, osType: true } },
        user: { select: { id: true, email: true, name: true } },
      },
    });
  },

  /**
   * List active (not ended) sessions, optionally filtered by device.
   */
  async getActiveSessions(deviceId?: string): Promise<Session[]> {
    const where: { endedAt: null; deviceId?: string } = { endedAt: null };
    if (deviceId) where.deviceId = deviceId;

    return prisma.session.findMany({
      where,
      include: {
        device: { select: { id: true, hostname: true, osType: true } },
        user: { select: { id: true, email: true, name: true } },
      },
      orderBy: { startedAt: "desc" },
    });
  },

  /**
   * List sessions for a specific user.
   */
  async getByUser(userId: string): Promise<Session[]> {
    return prisma.session.findMany({
      where: { userId },
      include: {
        device: { select: { id: true, hostname: true, osType: true } },
      },
      orderBy: { startedAt: "desc" },
    });
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDefaultPort(protocol: SessionProtocol): number {
  switch (protocol) {
    case "ssh":
      return 22;
    case "rdp":
      return 3389;
    case "vnc":
      return 5900;
  }
}
