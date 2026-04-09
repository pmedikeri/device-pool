import { test, expect } from "@playwright/test";
import { api, login } from "./helpers/api";

test.describe("SSH Key Management", () => {
  let userId: string;

  test.beforeAll(async () => {
    userId = await login(`SshKey${Date.now()}`);
  });

  test("saves valid SSH public key", async () => {
    const key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKeyForE2E test@e2e";
    const res = await api("/api/users/me", {
      method: "PATCH",
      userId,
      body: { sshPublicKey: key },
    });
    expect(res.status).toBe(200);
    expect(res.data.user.sshPublicKey).toBe(key);
  });

  test("accepts ssh-rsa key", async () => {
    const key = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC test@rsa";
    const res = await api("/api/users/me", { method: "PATCH", userId, body: { sshPublicKey: key } });
    expect(res.status).toBe(200);
  });

  test("accepts ecdsa key", async () => {
    const key = "ecdsa-sha2-nistp256 AAAAE2VjZHNh test@ecdsa";
    const res = await api("/api/users/me", { method: "PATCH", userId, body: { sshPublicKey: key } });
    expect(res.status).toBe(200);
  });

  test("rejects invalid key format", async () => {
    const res = await api("/api/users/me", {
      method: "PATCH",
      userId,
      body: { sshPublicKey: "not-a-valid-ssh-key" },
    });
    expect(res.status).toBe(400);
    expect(res.data.error).toContain("Invalid SSH public key");
  });

  test("removes key by setting empty string", async () => {
    await api("/api/users/me", {
      method: "PATCH",
      userId,
      body: { sshPublicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA test@e2e" },
    });
    const res = await api("/api/users/me", {
      method: "PATCH",
      userId,
      body: { sshPublicKey: "" },
    });
    expect(res.status).toBe(200);
    expect(res.data.user.sshPublicKey).toBeNull();
  });

  test("trims whitespace from key", async () => {
    const res = await api("/api/users/me", {
      method: "PATCH",
      userId,
      body: { sshPublicKey: "  ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA test@e2e  " },
    });
    expect(res.status).toBe(200);
    expect(res.data.user.sshPublicKey).not.toMatch(/^\s/);
  });

  test("get profile returns key", async () => {
    const key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIProfileTest test@profile";
    await api("/api/users/me", { method: "PATCH", userId, body: { sshPublicKey: key } });
    const res = await api("/api/users/me", { userId });
    expect(res.status).toBe(200);
    expect(res.data.user.sshPublicKey).toBe(key);
  });

  test("profile never returns passwordHash", async () => {
    const res = await api("/api/users/me", { userId });
    expect(res.data.user.passwordHash).toBeUndefined();
  });
});
