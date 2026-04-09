import bcrypt from "bcryptjs";
import type { Role } from "@/generated/prisma";

// ---------------------------------------------------------------------------
// AuthService — password hashing & role helpers
// ---------------------------------------------------------------------------

const BCRYPT_ROUNDS = 12;

/** Ordered from least to most privileged. */
const ROLE_HIERARCHY: Record<Role, number> = {
  user: 0,
  auditor: 1,
  admin: 2,
};

export const AuthService = {
  /**
   * Hash a plaintext password with bcrypt.
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  },

  /**
   * Compare a plaintext password against a bcrypt hash.
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  },

  /**
   * Returns true if `userRole` meets or exceeds `requiredRole` in the
   * privilege hierarchy (admin > auditor > user).
   */
  requireRole(userRole: Role, requiredRole: Role): boolean {
    return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
  },

  /**
   * Shorthand: is the role admin?
   */
  isAdmin(role: Role): boolean {
    return role === "admin";
  },
};
