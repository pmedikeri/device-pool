import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser, unauthorized, badRequest, forbidden, handleServiceError } from "@/lib/auth";
import { DeviceService } from "@/lib/services/device.service";

const listDevicesSchema = z.object({
  status: z.string().optional(),
  osType: z.string().optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return unauthorized();

    const params = Object.fromEntries(req.nextUrl.searchParams);
    const parsed = listDevicesSchema.safeParse(params);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
    }

    const devices = await DeviceService.list({
      status: parsed.data.status as import("@/generated/prisma").DeviceStatus | undefined,
      osType: parsed.data.osType as import("@/generated/prisma").OsType | undefined,
      search: parsed.data.search,
      tags: parsed.data.tag ? [parsed.data.tag] : undefined,
    });
    return Response.json({ devices });
  } catch (err) {
    return handleServiceError(err);
  }
}

const createDeviceSchema = z.object({
  hostname: z.string().min(1),
  displayName: z.string().optional(),
  osType: z.enum(["linux", "macos", "windows"]),
  architecture: z.string().optional(),
  ipAddress: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  teamId: z.string().uuid().optional(),
  accessMethods: z
    .array(
      z.object({
        method: z.enum(["ssh", "rdp", "vnc"]),
        port: z.number().int().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return unauthorized();

    const body = await req.json();
    const parsed = createDeviceSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
    }

    const device = await DeviceService.create({
      ...parsed.data,
      ownerUserId: user.id,
    });
    return Response.json(device, { status: 201 });
  } catch (err) {
    return handleServiceError(err);
  }
}
