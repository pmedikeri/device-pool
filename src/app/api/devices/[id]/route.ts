import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser, unauthorized, badRequest, notFound, forbidden, handleServiceError } from "@/lib/auth";
import { DeviceService } from "@/lib/services/device.service";
import { encrypt } from "@/lib/crypto";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return unauthorized();

    const { id } = await params;
    const device = await DeviceService.getById(id);
    if (!device) return notFound("Device not found");

    // Never expose encrypted password in API responses
    const { sshPasswordEnc, ...safeDevice } = device as typeof device & { sshPasswordEnc?: string };

    return Response.json({ device: safeDevice });
  } catch (err) {
    return handleServiceError(err);
  }
}

const updateDeviceSchema = z.object({
  displayName: z.string().optional(),
  ipAddress: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  teamId: z.string().uuid().nullable().optional(),
  sshUsername: z.string().optional(),
  sshPassword: z.string().optional(), // plaintext in, encrypted in DB
});

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return unauthorized();

    const { id } = await params;
    const body = await req.json();
    const parsed = updateDeviceSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
    }

    // Transform SSH credentials before persisting
    const updateData: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.sshPassword) {
      updateData.sshPasswordEnc = encrypt(parsed.data.sshPassword);
      delete updateData.sshPassword;
    }
    if (parsed.data.sshUsername !== undefined) {
      updateData.sshUsername = parsed.data.sshUsername;
    }

    const device = await DeviceService.updateDevice(id, updateData);

    // Strip encrypted password from response
    const { sshPasswordEnc, ...safeDevice } = device as typeof device & { sshPasswordEnc?: string };
    return Response.json(safeDevice);
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return unauthorized();

    const { id } = await params;

    const { prisma: db } = await import("@/lib/db/client");
    const device = await db.device.findUnique({
      where: { id },
      include: {
        reservations: {
          where: { status: { in: ["active", "pending"] } },
          include: { user: { select: { name: true } } },
        },
      },
    });
    if (!device) return notFound("Device not found");

    // Only the owner can remove the device
    if (device.ownerUserId && device.ownerUserId !== user.id) {
      return forbidden("Only the person who added this device can remove it");
    }

    // Block removal if device is currently reserved
    if (device.reservations.length > 0) {
      const reserver = device.reservations[0].user.name;
      return Response.json(
        { error: `Device is currently reserved by ${reserver} — they must release it first` },
        { status: 409 }
      );
    }

    // Revoke first (cancels reservations, ends sessions)
    await DeviceService.revokeDevice(id);

    // Then hard delete
    const { prisma } = await import("@/lib/db/client");
    await prisma.session.deleteMany({ where: { deviceId: id } });
    await prisma.reservation.deleteMany({ where: { deviceId: id } });
    await prisma.deviceHeartbeat.deleteMany({ where: { deviceId: id } });
    await prisma.deviceAccessMethod.deleteMany({ where: { deviceId: id } });
    await prisma.deviceCapability.deleteMany({ where: { deviceId: id } });
    await prisma.maintenanceWindow.deleteMany({ where: { deviceId: id } });
    await prisma.enrollmentToken.updateMany({ where: { deviceId: id }, data: { deviceId: null } });
    await prisma.device.delete({ where: { id } });

    return Response.json({ ok: true });
  } catch (err) {
    return handleServiceError(err);
  }
}
