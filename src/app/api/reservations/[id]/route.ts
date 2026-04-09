import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser, unauthorized, notFound, badRequest, handleServiceError } from "@/lib/auth";
import { ReservationService } from "@/lib/services/reservation.service";
import { ForbiddenError } from "@/lib/errors";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return unauthorized();

    const { id } = await params;
    const reservation = await ReservationService.getById(id);
    if (!reservation) return notFound("Reservation not found");

    return Response.json(reservation);
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return unauthorized();

    const { id } = await params;
    const result = await ReservationService.cancel(id, user.id);
    return Response.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}

const updateSchema = z.object({
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  reason: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return unauthorized();

    const { id } = await params;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
    }

    const result = await ReservationService.update(id, user.id, parsed.data);
    return Response.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}
