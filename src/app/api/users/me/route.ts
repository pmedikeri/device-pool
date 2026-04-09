import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser, unauthorized, badRequest, handleServiceError } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return unauthorized();
    const { passwordHash: _, ...safeUser } = user;
    return Response.json({ user: safeUser });
  } catch (err) {
    return handleServiceError(err);
  }
}

const updateSchema = z.object({
  sshPublicKey: z.string().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return unauthorized();

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
    }

    // Validate SSH public key format
    if (parsed.data.sshPublicKey) {
      const key = parsed.data.sshPublicKey.trim();
      if (!key.startsWith("ssh-") && !key.startsWith("ecdsa-") && !key.startsWith("sk-")) {
        return badRequest("Invalid SSH public key format. Should start with ssh-rsa, ssh-ed25519, etc.");
      }
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { sshPublicKey: parsed.data.sshPublicKey?.trim() || null },
    });

    const { passwordHash: _, ...safeUser } = updated;
    return Response.json({ user: safeUser });
  } catch (err) {
    return handleServiceError(err);
  }
}
