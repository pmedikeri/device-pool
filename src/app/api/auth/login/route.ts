import { NextRequest } from "next/server";
import { z } from "zod";
import { badRequest, verifySitePassword } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

const loginSchema = z.object({
  name: z.string().min(1, "Name is required"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
    }

    if (!verifySitePassword(parsed.data.password)) {
      return Response.json({ error: "Wrong password" }, { status: 401 });
    }

    // Find or create user by name
    const name = parsed.data.name.trim();
    const email = `${name.toLowerCase().replace(/\s+/g, ".")}@devicepool.local`;

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email, name, role: "admin" },
      });
    }

    const { passwordHash: _, ...safeUser } = user;
    return Response.json({ user: safeUser });
  } catch (err) {
    console.error("POST /api/auth/login error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
