import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser, unauthorized, badRequest, handleServiceError } from "@/lib/auth";
import { ReservationService } from "@/lib/services/reservation.service";

const listReservationsSchema = z.object({
  mine: z.string().optional(),
  userId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return unauthorized();

    const params = Object.fromEntries(req.nextUrl.searchParams);
    const parsed = listReservationsSchema.safeParse(params);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
    }

    // Non-admin users can only see their own reservations.
    // When mine=true, force userId filter even for admins.
    const filters =
      user.role === "admin" && parsed.data.mine !== "true"
        ? parsed.data
        : { ...parsed.data, userId: user.id };

    const reservations = await ReservationService.list(filters);
    return Response.json({ reservations });
  } catch (err) {
    return handleServiceError(err);
  }
}

const createReservationSchema = z.object({
  deviceId: z.string().uuid(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  reason: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return unauthorized();

    const body = await req.json();
    const parsed = createReservationSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
    }

    const reservation = await ReservationService.create({
      ...parsed.data,
      userId: user.id,
    });

    return Response.json(reservation, { status: 201 });
  } catch (err) {
    return handleServiceError(err);
  }
}
