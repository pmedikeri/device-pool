import { PrismaClient } from "../src/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashSync } from "bcryptjs";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://devicepool:devicepool@localhost:5432/devicepool?schema=public";

const adapter = new PrismaPg(connectionString);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Clean existing data
  await prisma.auditEvent.deleteMany();
  await prisma.session.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.deviceHeartbeat.deleteMany();
  await prisma.deviceCapability.deleteMany();
  await prisma.deviceAccessMethod.deleteMany();
  await prisma.maintenanceWindow.deleteMany();
  await prisma.enrollmentToken.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.device.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();

  // Create users
  const admin = await prisma.user.create({
    data: {
      email: "admin@example.com",
      name: "Admin User",
      role: "admin",
      passwordHash: hashSync("admin123", 10),
    },
  });

  const alice = await prisma.user.create({
    data: {
      email: "alice@example.com",
      name: "Alice Engineer",
      role: "user",
      passwordHash: hashSync("alice123", 10),
    },
  });

  const bob = await prisma.user.create({
    data: {
      email: "bob@example.com",
      name: "Bob Developer",
      role: "user",
      passwordHash: hashSync("bob123", 10),
    },
  });

  const auditor = await prisma.user.create({
    data: {
      email: "auditor@example.com",
      name: "Audit User",
      role: "auditor",
      passwordHash: hashSync("auditor123", 10),
    },
  });

  // Create teams
  const mlTeam = await prisma.team.create({
    data: { name: "ML Platform" },
  });

  const infraTeam = await prisma.team.create({
    data: { name: "Infrastructure" },
  });

  await prisma.teamMember.createMany({
    data: [
      { userId: admin.id, teamId: infraTeam.id, role: "admin" },
      { userId: alice.id, teamId: mlTeam.id, role: "user" },
      { userId: bob.id, teamId: mlTeam.id, role: "user" },
      { userId: bob.id, teamId: infraTeam.id, role: "user" },
    ],
  });

  // Create devices
  const now = new Date();
  const recentHeartbeat = new Date(now.getTime() - 30 * 1000); // 30s ago
  const staleHeartbeat = new Date(now.getTime() - 300 * 1000); // 5 min ago

  const dgxSpark = await prisma.device.create({
    data: {
      hostname: "dgx-spark-01",
      displayName: "DGX Spark #1",
      osType: "linux",
      architecture: "aarch64",
      ipAddress: "10.0.1.10",
      status: "online",
      tags: ["gpu", "dgx", "spark"],
      ownerUserId: admin.id,
      teamId: mlTeam.id,
      lastHeartbeatAt: recentHeartbeat,
      lastSeenUser: "alice",
      idleSeconds: 120,
      accessMethods: {
        create: [{ method: "ssh", port: 22 }],
      },
      capabilities: {
        create: [
          { name: "gpu", value: "GB10" },
          { name: "vram", value: "128GB" },
          { name: "cuda", value: "13.0" },
        ],
      },
    },
  });

  const devServer = await prisma.device.create({
    data: {
      hostname: "dev-server-01",
      displayName: "Dev Server Ubuntu",
      osType: "linux",
      architecture: "x86_64",
      ipAddress: "10.0.1.20",
      status: "online",
      tags: ["dev", "ubuntu"],
      ownerUserId: alice.id,
      teamId: infraTeam.id,
      lastHeartbeatAt: recentHeartbeat,
      idleSeconds: 3600,
      accessMethods: {
        create: [{ method: "ssh", port: 22 }],
      },
    },
  });

  const winWorkstation = await prisma.device.create({
    data: {
      hostname: "win-ws-01",
      displayName: "Windows Workstation",
      osType: "windows",
      architecture: "x86_64",
      ipAddress: "10.0.1.30",
      status: "online",
      tags: ["windows", "workstation"],
      ownerUserId: bob.id,
      teamId: infraTeam.id,
      lastHeartbeatAt: recentHeartbeat,
      accessMethods: {
        create: [{ method: "rdp", port: 3389 }],
      },
    },
  });

  const macMini = await prisma.device.create({
    data: {
      hostname: "mac-mini-01",
      displayName: "Mac Mini M2",
      osType: "macos",
      architecture: "arm64",
      ipAddress: "10.0.1.40",
      status: "online",
      tags: ["macos", "apple-silicon"],
      ownerUserId: alice.id,
      teamId: mlTeam.id,
      lastHeartbeatAt: recentHeartbeat,
      idleSeconds: 60,
      accessMethods: {
        create: [
          { method: "ssh", port: 22 },
          { method: "vnc", port: 5900 },
        ],
      },
    },
  });

  const offlineDevice = await prisma.device.create({
    data: {
      hostname: "old-server-01",
      displayName: "Legacy Server (Offline)",
      osType: "linux",
      architecture: "x86_64",
      ipAddress: "10.0.1.50",
      status: "offline",
      tags: ["legacy"],
      ownerUserId: admin.id,
      teamId: infraTeam.id,
      lastHeartbeatAt: staleHeartbeat,
    },
  });

  const maintenanceDevice = await prisma.device.create({
    data: {
      hostname: "gpu-node-02",
      displayName: "GPU Node #2 (Maintenance)",
      osType: "linux",
      architecture: "x86_64",
      ipAddress: "10.0.1.60",
      status: "online",
      tags: ["gpu", "a100"],
      maintenanceMode: true,
      ownerUserId: admin.id,
      teamId: mlTeam.id,
      lastHeartbeatAt: recentHeartbeat,
      notes: "Scheduled for firmware update",
      accessMethods: {
        create: [{ method: "ssh", port: 22 }],
      },
      capabilities: {
        create: [{ name: "gpu", value: "A100" }],
      },
    },
  });

  // Create sample reservations
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  const inThreeHours = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayEnd = new Date(yesterday.getTime() + 2 * 60 * 60 * 1000);

  // Active reservation on DGX
  await prisma.reservation.create({
    data: {
      deviceId: dgxSpark.id,
      userId: alice.id,
      teamId: mlTeam.id,
      startAt: new Date(now.getTime() - 30 * 60 * 1000), // started 30 min ago
      endAt: inOneHour,
      checkInDeadlineAt: new Date(now.getTime() - 20 * 60 * 1000),
      status: "active",
      reason: "Running ML training job",
    },
  });

  // Future reservation
  await prisma.reservation.create({
    data: {
      deviceId: devServer.id,
      userId: bob.id,
      teamId: infraTeam.id,
      startAt: inOneHour,
      endAt: inThreeHours,
      checkInDeadlineAt: new Date(inOneHour.getTime() + 10 * 60 * 1000),
      status: "pending",
      reason: "Need to debug deployment issue",
    },
  });

  // Completed reservation
  await prisma.reservation.create({
    data: {
      deviceId: winWorkstation.id,
      userId: alice.id,
      startAt: yesterday,
      endAt: yesterdayEnd,
      status: "completed",
      reason: "Testing Windows build",
    },
  });

  // Create audit events
  await prisma.auditEvent.createMany({
    data: [
      { eventType: "device_registered", userId: admin.id, deviceId: dgxSpark.id, details: { hostname: "dgx-spark-01" } },
      { eventType: "device_registered", userId: alice.id, deviceId: devServer.id, details: { hostname: "dev-server-01" } },
      { eventType: "reservation_created", userId: alice.id, deviceId: dgxSpark.id, details: { reason: "ML training" } },
      { eventType: "connect_granted", userId: alice.id, deviceId: dgxSpark.id, details: { protocol: "ssh" } },
      { eventType: "device_maintenance_on", userId: admin.id, deviceId: maintenanceDevice.id, details: { reason: "Firmware update" } },
    ],
  });

  console.log("Seed data created successfully:");
  console.log(`  Users: ${admin.email}, ${alice.email}, ${bob.email}, ${auditor.email}`);
  console.log(`  Teams: ${mlTeam.name}, ${infraTeam.name}`);
  console.log(`  Devices: ${[dgxSpark, devServer, winWorkstation, macMini, offlineDevice, maintenanceDevice].map(d => d.hostname).join(", ")}`);
  console.log("  Reservations: 3 (1 active, 1 pending, 1 completed)");
  console.log("  Audit events: 5");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
