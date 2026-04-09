"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { StatusBadge } from "@/components/StatusBadge";
import { OsIcon } from "@/components/OsIcon";

type DeviceDetail = {
  id: string; hostname: string; displayName: string | null; osType: string;
  architecture: string | null; ipAddress: string | null; derivedStatus: string;
  maintenanceMode: boolean; tags: string[]; notes: string | null;
  lastHeartbeatAt: string | null; lastSeenUser: string | null; idleSeconds: number | null;
  hasCredentials?: boolean;
  owner: { id: string; name: string } | null; team: { name: string } | null;
  accessMethods: { method: string; port: number | null }[];
  capabilities: { name: string; value: string | null }[];
  reservations: { id: string; startAt: string; endAt: string; status: string; user: { name: string } }[];
  sessions: { id: string; protocol: string; startedAt: string; endedAt: string | null; user: { name: string } }[];
};

type ConnectResponse = {
  sessionId: string;
  sshCommand: string;
  sshPassword: string;
  sshHost: string;
  sshPort: number;
  sshUsername: string;
};

function copyText(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export default function DeviceDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [device, setDevice] = useState<DeviceDetail | null>(null);
  const [error, setError] = useState("");
  const [reserveOpen, setReserveOpen] = useState(false);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [reason, setReason] = useState("");
  const [reserveError, setReserveError] = useState("");
  const [reserveSuccess, setReserveSuccess] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");

  // SSH connect banner state
  const [sshInfo, setSshInfo] = useState<ConnectResponse | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);

  // Credential setup state
  const [credUsername, setCredUsername] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [credSaving, setCredSaving] = useState(false);
  const [credError, setCredError] = useState("");
  const [credSuccess, setCredSuccess] = useState(false);

  useEffect(() => { loadDevice(); }, [id]);

  // Auto-hide password after 10 seconds
  useEffect(() => {
    if (!showPassword) return;
    const timer = setTimeout(() => setShowPassword(false), 10000);
    return () => clearTimeout(timer);
  }, [showPassword]);

  async function loadDevice() {
    try {
      const data = await apiFetch<{ device: DeviceDetail }>(`/api/devices/${id}`);
      setDevice(data.device);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load device");
    }
  }

  async function handleReserve(e: React.FormEvent) {
    e.preventDefault();
    setReserveError(""); setReserveSuccess(false);
    try {
      await apiFetch("/api/reservations", { method: "POST", body: { deviceId: id, startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString(), reason: reason || undefined } });
      setReserveSuccess(true);
      setReserveOpen(false);
      setStartAt(""); setEndAt(""); setReason("");
      loadDevice();
    } catch (err) {
      setReserveError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleConnect() {
    setConnectError("");
    setSshInfo(null);
    setConnecting(true);
    try {
      const data = await apiFetch<ConnectResponse>("/api/sessions/connect", { method: "POST", body: { deviceId: id } });
      // Copy SSH command to clipboard
      copyText(data.sshCommand);
      setSshInfo(data);
      setShowPassword(false);
      setPasswordCopied(false);
      loadDevice();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect";
      setConnectError(
        message.includes("reservation")
          ? "You need an active reservation to connect. Click Reserve to book this device first."
          : message
      );
    } finally {
      setConnecting(false);
    }
  }

  function handleCopyPassword() {
    if (sshInfo) {
      copyText(sshInfo.sshPassword);
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 2000);
    }
  }

  async function handleSaveCredentials(e: React.FormEvent) {
    e.preventDefault();
    setCredError(""); setCredSuccess(false); setCredSaving(true);
    try {
      await apiFetch(`/api/devices/${id}`, { method: "PATCH", body: { sshUsername: credUsername, sshPassword: credPassword } });
      setCredSuccess(true);
      setCredUsername(""); setCredPassword("");
      loadDevice();
    } catch (err) {
      setCredError(err instanceof Error ? err.message : "Failed to save credentials");
    } finally {
      setCredSaving(false);
    }
  }

  if (error) return <div className="bg-danger-light text-danger text-sm p-4 rounded-lg">{error}</div>;
  if (!device) return <div className="text-text-muted text-sm py-12 text-center">Loading...</div>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <a href="/" className="text-text-muted hover:text-text-secondary text-sm">&larr; Devices</a>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{device.displayName || device.hostname}</h1>
            <OsIcon os={device.osType} />
            <StatusBadge status={device.derivedStatus} />
          </div>
          {device.displayName && <p className="text-sm text-text-muted mt-0.5">{device.hostname}</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleConnect}
            disabled={connecting || device.derivedStatus === "offline" || device.derivedStatus === "maintenance"}
            className="btn btn-success"
          >
            {connecting ? "Connecting..." : "Connect"}
          </button>
          <button
            onClick={() => setReserveOpen(!reserveOpen)}
            disabled={device.derivedStatus === "maintenance"}
            className="btn btn-primary"
          >
            Reserve
          </button>
        </div>
      </div>

      {reserveSuccess && (
        <div className="bg-success-light text-success text-sm p-3 rounded-lg mb-4">Reservation created successfully!</div>
      )}

      {connectError && (
        <div className="bg-danger-light text-danger text-sm p-3 rounded-lg mb-4 flex items-center justify-between">
          <span>{connectError}</span>
          <button onClick={() => setConnectError("")} className="ml-4 text-xs hover:underline">Dismiss</button>
        </div>
      )}

      {/* SSH Connection Banner */}
      {sshInfo && (
        <div className="card p-5 mb-4 border-success/30 bg-success-light/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-success-light text-success flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <span className="font-semibold text-success text-sm">SSH command copied to clipboard!</span>
            </div>
            <button onClick={() => setSshInfo(null)} className="text-text-muted hover:text-text-secondary text-xs">Dismiss</button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">SSH Command</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm font-mono text-text">
                  {sshInfo.sshCommand}
                </code>
                <button
                  onClick={() => { copyText(sshInfo.sshCommand); }}
                  className="btn btn-ghost text-xs shrink-0"
                >
                  Copy
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Password</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm font-mono text-text">
                  {showPassword ? sshInfo.sshPassword : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}
                </code>
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="btn btn-ghost text-xs shrink-0"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
                <button
                  onClick={handleCopyPassword}
                  className="btn btn-ghost text-xs shrink-0"
                >
                  {passwordCopied ? "Copied!" : "Copy password"}
                </button>
              </div>
              {showPassword && (
                <p className="text-[10px] text-text-muted mt-1">Password will auto-hide in 10 seconds</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Info Card */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-text-secondary mb-4">Device Information</h2>
            <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
              {[
                ["Hostname", device.hostname],
                ["OS", `${device.osType}${device.architecture ? ` (${device.architecture})` : ""}`],
                ["IP Address", device.ipAddress || "—"],
                ["Owner", device.owner?.name || "—"],
                ["Team", device.team?.name || "—"],
                ["Last heartbeat", device.lastHeartbeatAt ? new Date(device.lastHeartbeatAt).toLocaleString() : "Never"],
                ["Last user", device.lastSeenUser || "—"],
                ["Idle time", device.idleSeconds != null ? `${device.idleSeconds}s` : "—"],
                ["Maintenance", device.maintenanceMode ? "Yes" : "No"],
              ].map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-text-muted">{label}</dt>
                  <dd className={label === "Maintenance" && device.maintenanceMode ? "text-orange font-medium" : ""}>{value}</dd>
                </div>
              ))}
            </div>
            {device.tags.length > 0 && (
              <div className="flex gap-1.5 mt-4 pt-4 border-t border-border-light">
                {device.tags.map((t) => (
                  <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-primary-light text-primary font-medium">{t}</span>
                ))}
              </div>
            )}
            {device.notes && (
              <div className="mt-4 p-3 bg-warning-light text-warning text-sm rounded-lg">{device.notes}</div>
            )}
          </div>

          {/* Access Methods & Capabilities */}
          {(device.accessMethods.length > 0 || device.capabilities.length > 0) && (
            <div className="grid grid-cols-2 gap-5">
              {device.accessMethods.length > 0 && (
                <div className="card p-5">
                  <h2 className="text-sm font-semibold text-text-secondary mb-3">Access Methods</h2>
                  <div className="space-y-2">
                    {device.accessMethods.map((am) => (
                      <div key={am.method} className="flex items-center gap-2 text-sm">
                        <span className="w-2 h-2 rounded-full bg-success" />
                        <span className="font-medium">{am.method.toUpperCase()}</span>
                        {am.port && <span className="text-text-muted">port {am.port}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {device.capabilities.length > 0 && (
                <div className="card p-5">
                  <h2 className="text-sm font-semibold text-text-secondary mb-3">Capabilities</h2>
                  <div className="space-y-2">
                    {device.capabilities.map((c) => (
                      <div key={c.name} className="flex items-center justify-between text-sm">
                        <span className="text-text-muted">{c.name}</span>
                        <span className="font-medium">{c.value || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reservations */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-text-secondary mb-3">Recent Reservations</h2>
            {device.reservations.length === 0 ? (
              <p className="text-sm text-text-muted">No reservations yet</p>
            ) : (
              <div className="space-y-2">
                {device.reservations.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 text-sm py-2 border-b border-border-light last:border-0">
                    <StatusBadge status={r.status} />
                    <span className="text-text-secondary">{r.user.name}</span>
                    <span className="text-text-muted text-xs ml-auto">
                      {new Date(r.startAt).toLocaleDateString()} {new Date(r.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {" — "}
                      {new Date(r.endAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sessions */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-text-secondary mb-3">Recent Sessions</h2>
            {device.sessions.length === 0 ? (
              <p className="text-sm text-text-muted">No sessions yet</p>
            ) : (
              <div className="space-y-2">
                {device.sessions.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 text-sm py-2 border-b border-border-light last:border-0">
                    <span className="px-2 py-0.5 rounded bg-info-light text-info text-xs font-medium">{s.protocol.toUpperCase()}</span>
                    <span className="text-text-secondary">{s.user.name}</span>
                    <span className={`ml-auto text-xs ${s.endedAt ? "text-text-muted" : "text-success font-medium"}`}>
                      {s.endedAt ? `Ended ${new Date(s.endedAt).toLocaleString()}` : "Active now"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column — Actions Sidebar */}
        <div className="space-y-5">
          {/* Reservation Form */}
          {reserveOpen && (
            <div className="card p-5 sticky top-8">
              <h2 className="text-sm font-semibold mb-4">New Reservation</h2>
              <form onSubmit={handleReserve} className="space-y-3">
                <div>
                  <label className="block text-xs text-text-muted mb-1">Start time</label>
                  <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface" />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">End time</label>
                  <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} required
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface" />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">Reason (optional)</label>
                  <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What will you be using this for?"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface" />
                </div>
                {reserveError && <div className="bg-danger-light text-danger text-xs p-2 rounded-lg">{reserveError}</div>}
                <button type="submit" className="btn btn-primary w-full">Confirm Reservation</button>
                <button type="button" onClick={() => setReserveOpen(false)} className="btn btn-ghost w-full text-xs">Cancel</button>
              </form>
            </div>
          )}

          {/* Credential Setup Card */}
          {device.hasCredentials === false && (
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-orange-light text-orange flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0110 0v4"/>
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Setup Credentials</h2>
                  <p className="text-[10px] text-text-muted">SSH credentials needed for remote access</p>
                </div>
              </div>
              <form onSubmit={handleSaveCredentials} className="space-y-3">
                <div>
                  <label className="block text-xs text-text-muted mb-1">SSH Username</label>
                  <input
                    type="text"
                    value={credUsername}
                    onChange={(e) => setCredUsername(e.target.value)}
                    placeholder="e.g. nvidia"
                    required
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">SSH Password</label>
                  <input
                    type="password"
                    value={credPassword}
                    onChange={(e) => setCredPassword(e.target.value)}
                    placeholder="Device SSH password"
                    required
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">Owner</label>
                  <div className="text-sm text-text-secondary px-3 py-2 bg-surface-hover rounded-lg">
                    {device.owner?.name || "Unassigned"}
                  </div>
                </div>
                {credError && <div className="bg-danger-light text-danger text-xs p-2 rounded-lg">{credError}</div>}
                {credSuccess && <div className="bg-success-light text-success text-xs p-2 rounded-lg">Credentials saved!</div>}
                <button type="submit" disabled={credSaving} className="btn btn-primary w-full">
                  {credSaving ? "Saving..." : "Save Credentials"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
