import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser, unauthorized, badRequest, notFound, forbidden, handleServiceError } from "@/lib/auth";
import { DeviceService } from "@/lib/services/device.service";

type Params = { params: Promise<{ id: string }> };

const maintenanceSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return unauthorized();

    const { id } = await params;
    const body = await req.json();
    const parsed = maintenanceSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
    }

    const device = await DeviceService.setMaintenanceMode(
      id,
      parsed.data.enabled,
      parsed.data.reason
    );
    return Response.json(device);
  } catch (err) {
    return handleServiceError(err);
  }
}
