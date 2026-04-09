import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser, unauthorized, badRequest } from "@/lib/auth";
import { SessionService } from "@/lib/services/session.service";

const listSessionsSchema = z.object({
  userId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional(),
  active: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return unauthorized();

    const params = Object.fromEntries(req.nextUrl.searchParams);
    const parsed = listSessionsSchema.safeParse(params);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
    }

    // Non-admin users can only see their own sessions
    const filters =
      user.role === "admin"
        ? parsed.data
        : { ...parsed.data, userId: user.id };

    const result = await SessionService.list(filters);
    return Response.json(result);
  } catch (err) {
    console.error("GET /api/sessions error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
