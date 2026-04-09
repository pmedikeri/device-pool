import { mockPrisma } from "./mock-prisma";
import { EnrollmentService } from "@/lib/services/enrollment.service";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("EnrollmentService.createToken", () => {
  test("creates a token with expiry", async () => {
    mockPrisma.enrollmentToken.create.mockResolvedValue({
      id: "tok-1",
      token: "abc",
      expiresAt: new Date(),
    });

    const result = await EnrollmentService.createToken("user-1");
    expect(result.token).toBeTruthy();
    expect(result.token.length).toBe(64); // 32 bytes hex
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const createCall = mockPrisma.enrollmentToken.create.mock.calls[0][0];
    expect(createCall.data.createdByUserId).toBe("user-1");
  });
});

describe("EnrollmentService.registerDevice", () => {
  test("rejects invalid token", async () => {
    mockPrisma.enrollmentToken.findUnique.mockResolvedValue(null);

    await expect(
      EnrollmentService.registerDevice("bad-token", {
        hostname: "test",
        osType: "linux",
      })
    ).rejects.toThrow("Invalid enrollment token");
  });

  test("rejects already-used token", async () => {
    mockPrisma.enrollmentToken.findUnique.mockResolvedValue({
      id: "tok-1",
      token: "abc",
      usedAt: new Date(), // already used
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      EnrollmentService.registerDevice("abc", {
        hostname: "test",
        osType: "linux",
      })
    ).rejects.toThrow("already been used");
  });

  test("rejects expired token", async () => {
    mockPrisma.enrollmentToken.findUnique.mockResolvedValue({
      id: "tok-1",
      token: "abc",
      usedAt: null,
      expiresAt: new Date(Date.now() - 60_000), // expired
    });

    await expect(
      EnrollmentService.registerDevice("abc", {
        hostname: "test",
        osType: "linux",
      })
    ).rejects.toThrow("expired");
  });

  test("registers device with valid token", async () => {
    mockPrisma.enrollmentToken.findUnique.mockResolvedValue({
      id: "tok-1",
      token: "valid-token",
      usedAt: null,
      expiresAt: new Date(Date.now() + 600_000),
    });
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
      const tx = {
        device: {
          create: jest.fn().mockResolvedValue({ id: "dev-new" }),
        },
        enrollmentToken: {
          update: jest.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    });

    const result = await EnrollmentService.registerDevice("valid-token", {
      hostname: "new-device",
      osType: "linux",
      architecture: "x86_64",
    });

    expect(result.deviceId).toBe("dev-new");
    expect(result.deviceToken).toBeTruthy();
    expect(result.deviceToken.length).toBe(96); // 48 bytes hex
  });
});

describe("EnrollmentService.generateShellCommand", () => {
  test("generates curl one-liner with token", () => {
    const cmd = EnrollmentService.generateShellCommand("my-token", "https://pool.example.com");
    expect(cmd).toContain("curl");
    expect(cmd).toContain("my-token");
    expect(cmd).toContain("https://pool.example.com");
  });
});

describe("EnrollmentService.generatePowerShellCommand", () => {
  test("generates PowerShell command with token", () => {
    const cmd = EnrollmentService.generatePowerShellCommand("my-token", "https://pool.example.com");
    expect(cmd).toContain("Invoke-RestMethod");
    expect(cmd).toContain("my-token");
    expect(cmd).toContain("https://pool.example.com");
  });
});
