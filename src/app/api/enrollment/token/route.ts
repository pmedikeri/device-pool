import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser, unauthorized, badRequest, forbidden } from "@/lib/auth";
import { EnrollmentService } from "@/lib/services/enrollment.service";

const createTokenSchema = z.object({
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return unauthorized();

    let body = {};
    try {
      body = await req.json();
    } catch {
      // Body is optional
    }

    const parsed = createTokenSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
    }

    const result = await EnrollmentService.createToken(user.id);
    const host = req.headers.get("host") || "localhost:3000";
    const proto = req.headers.get("x-forwarded-proto") || "http";
    const platformUrl = `${proto}://${host}`;

    return Response.json({
      token: result.token,
      expiresAt: result.expiresAt.toISOString(),
      shellCommand: EnrollmentService.generateShellCommand(result.token, platformUrl),
      powershellCommand: EnrollmentService.generatePowerShellCommand(result.token, platformUrl),
    }, { status: 201 });
  } catch (err) {
    console.error("POST /api/enrollment/token error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
