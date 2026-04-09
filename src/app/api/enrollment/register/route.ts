import { NextRequest } from "next/server";
import { z } from "zod";
import { badRequest, handleServiceError } from "@/lib/auth";
import { EnrollmentService } from "@/lib/services/enrollment.service";

const registerSchema = z.object({
  token: z.string().min(1, "Bootstrap token is required"),
  hostname: z.string().min(1, "Hostname is required"),
  displayName: z.string().optional(),
  osType: z.enum(["linux", "macos", "windows"]),
  architecture: z.string().optional(),
  ipAddress: z.string().optional(),
  accessMethods: z
    .array(
      z.object({
        method: z.enum(["ssh", "rdp", "vnc"]),
        port: z.number().int().optional(),
      })
    )
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  sshUsername: z.string().optional(),
  sshPassword: z.string().optional(),
  ownerUserId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
    }

    const { token, hostname, osType, architecture, ipAddress, accessMethods, sshUsername, sshPassword, ownerUserId } = parsed.data;
    const result = await EnrollmentService.registerDevice(token, {
      hostname,
      osType,
      architecture,
      ipAddress,
      accessMethods: accessMethods as import("@/lib/services/enrollment.service").DeviceInfo["accessMethods"],
      sshUsername,
      sshPassword,
      ownerUserId,
    });

    return Response.json(result, { status: 201 });
  } catch (err) {
    return handleServiceError(err);
  }
}
