import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schemas for API input validation
// ---------------------------------------------------------------------------

export const CreateReservationSchema = z.object({
  deviceId: z.string().uuid(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  teamId: z.string().uuid().optional(),
  reason: z.string().max(500).optional(),
});
export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;

export const RegisterDeviceSchema = z.object({
  token: z.string().min(1, "Enrollment token is required"),
  hostname: z.string().min(1).max(255),
  osType: z.enum(["linux", "macos", "windows"]),
  architecture: z.string().max(64).optional(),
  ipAddress: z.string().ipv4().optional(),
  accessMethods: z
    .array(
      z.object({
        method: z.enum(["ssh", "rdp", "vnc"]),
        port: z.number().int().min(1).max(65535).optional(),
      })
    )
    .optional(),
});
export type RegisterDeviceInput = z.infer<typeof RegisterDeviceSchema>;

export const CreateEnrollmentTokenSchema = z.object({
  /** No body fields required — the user ID comes from the auth session. */
});
export type CreateEnrollmentTokenInput = z.infer<typeof CreateEnrollmentTokenSchema>;

export const UpdateDeviceSchema = z.object({
  displayName: z.string().max(255).optional(),
  tags: z.array(z.string().max(64)).optional(),
  notes: z.string().max(2000).optional(),
  osType: z.enum(["linux", "macos", "windows"]).optional(),
  ipAddress: z.string().ipv4().optional(),
  teamId: z.string().uuid().nullable().optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
});
export type UpdateDeviceInput = z.infer<typeof UpdateDeviceSchema>;

export const ConnectSchema = z.object({
  deviceId: z.string().uuid(),
  reservationId: z.string().uuid().optional(),
});
export type ConnectInput = z.infer<typeof ConnectSchema>;

export const HeartbeatSchema = z.object({
  hostname: z.string().min(1).max(255),
  osInfo: z.string().max(500).optional(),
  localUser: z.string().max(128).optional(),
  idleSeconds: z.number().int().min(0).optional(),
  sessionActive: z.boolean().optional(),
});
export type HeartbeatInput = z.infer<typeof HeartbeatSchema>;
