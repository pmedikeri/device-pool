import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/client";
import { config } from "@/lib/config";
import { NotFoundError, ConflictError, ValidationError } from "@/lib/errors";
import { encrypt } from "@/lib/crypto";
import type { EnrollmentToken, OsType, AccessMethod } from "@/generated/prisma";

// ---------------------------------------------------------------------------
// EnrollmentService — device enrollment token management
// ---------------------------------------------------------------------------

const BCRYPT_ROUNDS = 12;

export interface DeviceInfo {
  hostname: string;
  displayName?: string;
  osType: OsType;
  architecture?: string;
  ipAddress?: string;
  accessMethods?: { method: AccessMethod; port?: number }[];
  sshUsername?: string;
  sshPassword?: string;
  ownerUserId?: string;
}

export interface RegistrationResult {
  deviceId: string;
  deviceToken: string;
}

export const EnrollmentService = {
  /**
   * Create a short-lived enrollment/bootstrap token.
   * The token is stored as plaintext hex (short-lived, needs exact-match lookup).
   */
  async createToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + config.enrollmentTokenTtlMinutes * 60 * 1000
    );

    await prisma.enrollmentToken.create({
      data: {
        token,
        createdByUserId: userId,
        expiresAt,
      },
    });

    return { token, expiresAt };
  },

  /**
   * Register a device using an enrollment token.
   *
   * 1. Validate the bootstrap token (exists, not expired, not used).
   * 2. Create the Device record.
   * 3. Issue a long-lived device credential (random token), store its bcrypt hash.
   * 4. Mark the enrollment token as used.
   * 5. Return the plaintext device token (only time it is available).
   */
  async registerDevice(
    token: string,
    deviceInfo: DeviceInfo
  ): Promise<RegistrationResult> {
    // Look up the enrollment token (stored as plaintext hex)
    const enrollment = await prisma.enrollmentToken.findUnique({
      where: { token },
    });

    if (!enrollment) {
      throw new NotFoundError("Invalid enrollment token");
    }
    if (enrollment.usedAt) {
      throw new ConflictError("Enrollment token has already been used");
    }
    if (enrollment.expiresAt < new Date()) {
      throw new ValidationError("Enrollment token has expired");
    }

    // Generate a long-lived device credential
    const deviceToken = crypto.randomBytes(48).toString("hex");
    const deviceTokenHash = await bcrypt.hash(deviceToken, BCRYPT_ROUNDS);

    // Create device + mark token used in a transaction
    const device = await prisma.$transaction(async (tx) => {
      const dev = await tx.device.create({
        data: {
          hostname: deviceInfo.hostname,
          displayName: deviceInfo.displayName,
          osType: deviceInfo.osType,
          architecture: deviceInfo.architecture,
          ipAddress: deviceInfo.ipAddress,
          sshUsername: deviceInfo.sshUsername,
          sshPasswordEnc: deviceInfo.sshPassword ? encrypt(deviceInfo.sshPassword) : undefined,
          ownerUserId: deviceInfo.ownerUserId || enrollment.createdByUserId,
          status: "enrolled",
          accessMethods: deviceInfo.accessMethods
            ? {
                create: deviceInfo.accessMethods.map((am) => ({
                  method: am.method,
                  port: am.port,
                })),
              }
            : undefined,
        },
      });

      // Mark enrollment token as used and link to device
      await tx.enrollmentToken.update({
        where: { id: enrollment.id },
        data: {
          usedAt: new Date(),
          deviceId: dev.id,
          // Store the device token hash in metadata for later verification
          metadata: { deviceTokenHash },
        },
      });

      return dev;
    });

    return { deviceId: device.id, deviceToken };
  },

  /**
   * Generate a curl | sh one-liner for Linux / macOS enrollment.
   */
  generateShellCommand(token: string, platformUrl: string): string {
    return `curl -fsSL ${platformUrl}/api/enroll.sh | ENROLL_TOKEN="${token}" PLATFORM_URL="${platformUrl}" sh`;
  },

  /**
   * Generate a PowerShell command for Windows enrollment.
   */
  generatePowerShellCommand(token: string, platformUrl: string): string {
    return (
      `$env:ENROLL_TOKEN="${token}"; $env:PLATFORM_URL="${platformUrl}"; ` +
      `Invoke-RestMethod "${platformUrl}/api/enroll.ps1" | Invoke-Expression`
    );
  },

  /**
   * Verify a device token against the stored bcrypt hash.
   */
  async verifyDeviceToken(deviceId: string, token: string): Promise<boolean> {
    const enrollment = await prisma.enrollmentToken.findFirst({
      where: { deviceId, usedAt: { not: null } },
    });

    if (!enrollment) {
      return false;
    }

    const metadata = enrollment.metadata as { deviceTokenHash: string } | null;
    if (!metadata?.deviceTokenHash) {
      return false;
    }

    return bcrypt.compare(token, metadata.deviceTokenHash);
  },
};
