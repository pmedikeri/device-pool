import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser, unauthorized, badRequest, forbidden, handleServiceError } from "@/lib/auth";
import { AuditService } from "@/lib/services/audit.service";

const listAuditSchema = z.object({
  eventType: z.string().optional(),
  userId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return unauthorized();

    const params = Object.fromEntries(req.nextUrl.searchParams);
    const parsed = listAuditSchema.safeParse(params);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
    }

    const events = await AuditService.getEvents({
      eventType: parsed.data.eventType as import("@/generated/prisma").AuditEventType | undefined,
      userId: parsed.data.userId,
      deviceId: parsed.data.deviceId,
      limit: parsed.data.limit,
      offset: (parsed.data.page - 1) * parsed.data.limit,
    });
    return Response.json({ events });
  } catch (err) {
    return handleServiceError(err);
  }
}
