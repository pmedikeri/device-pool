import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser, unauthorized, badRequest, notFound, forbidden, handleServiceError } from "@/lib/auth";
import { ReservationService } from "@/lib/services/reservation.service";

type Params = { params: Promise<{ id: string }> };

const overrideSchema = z.object({
  reason: z.string().min(1, "Reason is required for admin override"),
});

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return unauthorized();

    const { id } = await params;
    const body = await req.json();
    const parsed = overrideSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
    }

    const result = await ReservationService.adminOverride(
      id,
      user.id,
      parsed.data.reason
    );

    return Response.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}
