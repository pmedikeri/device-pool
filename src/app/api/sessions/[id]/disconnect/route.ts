import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser, unauthorized, notFound, forbidden, badRequest, handleServiceError } from "@/lib/auth";
import { SessionService } from "@/lib/services/session.service";

type Params = { params: Promise<{ id: string }> };

const disconnectSchema = z.object({
  reason: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return unauthorized();

    const { id } = await params;

    let body = {};
    try {
      body = await req.json();
    } catch {
      // Body is optional for disconnect
    }

    const parsed = disconnectSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
    }

    const session = await SessionService.getById(id);
    if (!session) return notFound("Session not found");

    // Only the session owner or an admin can disconnect
    if (user.role !== "admin" && session.userId !== user.id) {
      return forbidden();
    }

    const result = await SessionService.disconnect(id, parsed.data.reason);

    return Response.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}
