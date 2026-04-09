import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser, unauthorized, badRequest, notFound, forbidden, handleServiceError } from "@/lib/auth";
import { DeviceService } from "@/lib/services/device.service";

type Params = { params: Promise<{ id: string }> };

const revokeSchema = z.object({
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
      // Body is optional
    }

    const parsed = revokeSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
    }

    const device = await DeviceService.revokeDevice(id);
    return Response.json(device);
  } catch (err) {
    return handleServiceError(err);
  }
}
