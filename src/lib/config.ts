export const config = {
  enrollmentTokenTtlMinutes: parseInt(process.env.ENROLLMENT_TOKEN_TTL_MINUTES || "15", 10),
  heartbeatStaleSeconds: parseInt(process.env.HEARTBEAT_STALE_SECONDS || "120", 10),
  reservationGraceMinutes: parseInt(process.env.RESERVATION_GRACE_MINUTES || "10", 10),
  maxReservationHours: parseInt(process.env.MAX_RESERVATION_HOURS || "24", 10),
  guacamoleUrl: process.env.GUACAMOLE_URL || "http://localhost:8080/guacamole",
  guacamoleAdminUser: process.env.GUACAMOLE_ADMIN_USER || "guacadmin",
  guacamoleAdminPassword: process.env.GUACAMOLE_ADMIN_PASSWORD || "guacadmin",
};
