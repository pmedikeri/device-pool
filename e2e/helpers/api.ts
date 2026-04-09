const BASE = "http://localhost:3000";

export async function api(path: string, opts: { method?: string; body?: unknown; userId?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...opts.headers };
  if (opts.userId) headers["x-user-id"] = opts.userId;

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const data = await res.json().catch(() => null);
  return { status: res.status, data, ok: res.ok };
}

export async function login(name: string): Promise<string> {
  const res = await api("/api/auth/login", {
    method: "POST",
    body: { name, password: "testing123" },
  });
  if (!res.ok) throw new Error(`Login failed: ${JSON.stringify(res.data)}`);
  return res.data.user.id;
}

export async function createDevice(userId: string): Promise<{ deviceId: string; deviceToken: string }> {
  // Generate enrollment token
  const tokenRes = await api("/api/enrollment/token", { method: "POST", userId });
  if (!tokenRes.ok) throw new Error(`Token creation failed: ${JSON.stringify(tokenRes.data)}`);
  const token = tokenRes.data.token;

  // Register device
  const regRes = await api("/api/enrollment/register", {
    method: "POST",
    body: {
      token,
      hostname: `test-device-${Date.now()}`,
      displayName: "Test GPU",
      osType: "linux",
      architecture: "x86_64",
      ipAddress: "10.0.0.1",
      sshUsername: "testuser",
      sshPassword: "testpass",
      accessMethods: [{ method: "ssh", port: 22 }],
    },
  });
  if (!regRes.ok) throw new Error(`Registration failed: ${JSON.stringify(regRes.data)}`);
  return { deviceId: regRes.data.deviceId, deviceToken: regRes.data.deviceToken };
}

export async function sendHeartbeat(deviceId: string, deviceToken: string) {
  return api(`/api/devices/${deviceId}/heartbeat`, {
    method: "POST",
    headers: { "X-Device-Token": deviceToken },
    body: {
      hostname: "test-device",
      osInfo: "Linux x86_64",
      localUser: "testuser",
      idleSeconds: 0,
      sessionActive: false,
      ipAddress: "10.0.0.1",
      cpuPercent: 5,
      memPercent: 20,
      gpuPercent: 10,
      gpuMemPercent: 15,
      gpuName: "Test GPU",
    },
  });
}

export async function quickReserve(userId: string, deviceId: string, hours = 2) {
  const now = new Date();
  const end = new Date(now.getTime() + hours * 60 * 60 * 1000);
  return api("/api/reservations", {
    method: "POST",
    userId,
    body: {
      deviceId,
      startAt: now.toISOString(),
      endAt: end.toISOString(),
      reason: "test reservation",
    },
  });
}
