import { NextRequest } from "next/server";
import { z } from "zod";
import { badRequest, notFound, handleServiceError } from "@/lib/auth";
import { DeviceService } from "@/lib/services/device.service";
import { EnrollmentService } from "@/lib/services/enrollment.service";

type Params = { params: Promise<{ id: string }> };

const heartbeatSchema = z.object({
  hostname: z.string().min(1),
  osInfo: z.string().optional(),
  localUser: z.string().optional(),
  idleSeconds: z.number().int().optional(),
  sessionActive: z.boolean().optional(),
  ipAddress: z.string().optional(),
  cpuPercent: z.number().optional(),
  memPercent: z.number().optional(),
  gpuPercent: z.number().optional(),
  gpuMemPercent: z.number().optional(),
  gpuName: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const deviceToken = req.headers.get("x-device-token");
    if (!deviceToken) {
      return Response.json({ error: "Missing device token" }, { status: 401 });
    }
    const { id } = await params;
    const valid = await EnrollmentService.verifyDeviceToken(id, deviceToken);
    if (!valid) {
      return Response.json({ error: "Invalid device token" }, { status: 401 });
    }
    const body = await req.json();
    const parsed = heartbeatSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
    }

    const heartbeat = await DeviceService.processHeartbeat(id, parsed.data);
    if (!heartbeat) return notFound("Device not found");

    return Response.json({ ok: true });
  } catch (err) {
    return handleServiceError(err);
  }
}
