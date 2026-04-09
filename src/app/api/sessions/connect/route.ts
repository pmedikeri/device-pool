import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser, unauthorized, badRequest, handleServiceError } from "@/lib/auth";
import { SessionService } from "@/lib/services/session.service";

const connectSchema = z.object({
  deviceId: z.string().uuid(),
  reservationId: z.string().uuid().optional(),
  protocol: z.enum(["ssh", "rdp", "vnc"]).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return unauthorized();

    const body = await req.json();
    const parsed = connectSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
    }

    const result = await SessionService.connect({
      deviceId: parsed.data.deviceId,
      reservationId: parsed.data.reservationId,
      userId: user.id,
    });

    return Response.json({
      sessionId: result.sessionId,
      sshCommand: result.sshCommand || null,
      sshPassword: result.sshPassword || null,
      sshHost: result.sshHost || null,
      sshPort: result.sshPort || null,
      sshUsername: result.sshUsername || null,
      keyInjected: result.keyInjected || false,
    }, { status: 201 });
  } catch (err) {
    return handleServiceError(err);
  }
}
