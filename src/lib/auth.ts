import { prisma } from "@/lib/db/client";
import { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";

const SITE_PASSWORD = process.env.SITE_PASSWORD || "testing123";

export async function getCurrentUser(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

export async function getOrCreateUser(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

export function verifySitePassword(password: string): boolean {
  return password === SITE_PASSWORD;
}

export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbidden() {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

export function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found") {
  return Response.json({ error: message }, { status: 404 });
}

export function handleServiceError(err: unknown): Response {
  if (err instanceof AppError) {
    return Response.json({ error: err.message }, { status: err.statusCode });
  }
  console.error("Unhandled service error:", err);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
