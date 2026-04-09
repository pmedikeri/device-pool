import { prisma } from "@/lib/db/client";
import type { AuditEventType, AuditEvent, Prisma } from "@/generated/prisma";

// ---------------------------------------------------------------------------
// AuditService — append-only audit log
// ---------------------------------------------------------------------------

export interface LogParams {
  eventType: AuditEventType;
  userId?: string;
  deviceId?: string;
  reservationId?: string;
  sessionId?: string;
  details?: Prisma.InputJsonValue;
}

export interface EventFilters {
  eventType?: AuditEventType;
  deviceId?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}

export const AuditService = {
  /**
   * Create an audit event record.
   */
  async log(params: LogParams): Promise<AuditEvent> {
    return prisma.auditEvent.create({
      data: {
        eventType: params.eventType,
        userId: params.userId,
        deviceId: params.deviceId,
        reservationId: params.reservationId,
        sessionId: params.sessionId,
        details: params.details ?? undefined,
      },
    });
  },

  /**
   * Query audit events with optional filters.
   */
  async getEvents(filters: EventFilters = {}): Promise<AuditEvent[]> {
    const where: Prisma.AuditEventWhereInput = {};

    if (filters.eventType) where.eventType = filters.eventType;
    if (filters.deviceId) where.deviceId = filters.deviceId;
    if (filters.userId) where.userId = filters.userId;

    return prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filters.limit ?? 50,
      skip: filters.offset ?? 0,
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  },
};
