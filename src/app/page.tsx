"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { StatusBadge } from "@/components/StatusBadge";
import { LabFloor } from "@/components/PixelAvatar";
import { OsIcon } from "@/components/OsIcon";

type Device = {
  id: string;
  hostname: string;
  displayName: string | null;
  osType: string;
  derivedStatus: string;
  architecture: string | null;
  ipAddress: string | null;
  tags: string[];
  lastHeartbeatAt: string | null;
  sshUsername: string | null;
  hasCredentials: boolean;
  cpuPercent: number | null;
  memPercent: number | null;
  gpuPercent: number | null;
  gpuMemPercent: number | null;
  owner: { id: string; name: string } | null;
  team: { name: string } | null;
  reservations: { id: string; startAt: string; endAt: string; status: string; userId: string; user: { id: string; name: string } }[];
  sessions: { id: string; endedAt: string | null; user: { name: string } }[];
};

type ConnectResponse = {
  sessionId: string;
  sshCommand: string;
  sshPassword: string | null;
  keyInjected: boolean;
};

function copyText(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

function timeRemaining(endAt: string): string {
  const ms = new Date(endAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m left`;
}

export default function Home() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [search, setSearch] = useState("");
  const [osFilter, setOsFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Per-device connect state
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectResult, setConnectResult] = useState<{ deviceId: string; cmd: string; pwd: string | null; keyInjected: boolean } | null>(null);
  const [showPwd, setShowPwd] = useState(false);
  const [connectError, setConnectError] = useState<{ deviceId: string; msg: string } | null>(null);

  // Expanded device for details/reservation
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reserveForm, setReserveForm] = useState<{ deviceId: string; startAt: string; endAt: string; reason: string; sshKey: string } | null>(null);
  const [reserveError, setReserveError] = useState("");
  const [reserveSuccess, setReserveSuccess] = useState("");

  // Credential setup
  const [credForm, setCredForm] = useState<{ deviceId: string; username: string; password: string } | null>(null);
  const [credSaving, setCredSaving] = useState(false);

  // Update reservation
  const [editReservation, setEditReservation] = useState<{ id: string; endAt: string } | null>(null);
  const [showSshHelp, setShowSshHelp] = useState(false);
  const [confirmReserve, setConfirmReserve] = useState(false);

  const stats = {
    total: devices.length,
    available: devices.filter((d) => d.derivedStatus === "available").length,
    inUse: devices.filter((d) => ["reserved", "in_use"].includes(d.derivedStatus)).length,
    offline: devices.filter((d) => d.derivedStatus === "offline").length,
  };

  useEffect(() => { loadDevices(); }, []);
  useEffect(() => { if (!loading) loadDevices(); }, [osFilter]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => { loadDevices(); }, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadDevices() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (osFilter) params.set("osType", osFilter);
      const data = await apiFetch<{ devices: Device[] }>(`/api/devices?${params}`);
      setDevices(data.devices);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect(deviceId: string) {
    setConnectingId(deviceId);
    setConnectError(null);
    setConnectResult(null);
    try {
      const data = await apiFetch<ConnectResponse>("/api/sessions/connect", {
        method: "POST",
        body: { deviceId },
      });
      copyText(data.sshCommand);
      setConnectResult({ deviceId, cmd: data.sshCommand, pwd: data.sshPassword, keyInjected: data.keyInjected });
      setShowPwd(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      setConnectError({
        deviceId,
        msg: msg.includes("reservation")
          ? "Reserve this device first before connecting."
          : msg,
      });
    } finally {
      setConnectingId(null);
    }
  }

  function handleReserveSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reserveForm) return;
    if (!reserveForm.sshKey.trim()) return;
    setConfirmReserve(true);
  }

  async function handleReserveConfirm() {
    if (!reserveForm) return;
    setReserveError("");
    setConfirmReserve(false);
    try {
      if (reserveForm.sshKey.trim()) {
        await apiFetch("/api/users/me", { method: "PATCH", body: { sshPublicKey: reserveForm.sshKey.trim() } });
      }

      await apiFetch("/api/reservations", {
        method: "POST",
        body: {
          deviceId: reserveForm.deviceId,
          startAt: new Date(reserveForm.startAt).toISOString(),
          endAt: new Date(reserveForm.endAt).toISOString(),
          reason: reserveForm.reason || undefined,
        },
      });
      setReserveSuccess(reserveForm.deviceId);
      setReserveForm(null);
      setTimeout(() => setReserveSuccess(""), 5000);
      loadDevices();
    } catch (err) {
      setReserveError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleSaveCredentials() {
    if (!credForm) return;
    setCredSaving(true);
    try {
      await apiFetch(`/api/devices/${credForm.deviceId}`, {
        method: "PATCH",
        body: { sshUsername: credForm.username, sshPassword: credForm.password },
      });
      setCredForm(null);
      loadDevices();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setCredSaving(false);
    }
  }

  async function handleDeleteDevice(deviceId: string, hostname: string, ownerId: string | null) {
    const currentUserId = localStorage.getItem("devicepool-user-id");
    if (ownerId && ownerId !== currentUserId) {
      alert("Only the person who added this device can remove it.");
      return;
    }
    const device = devices.find(d => d.id === deviceId);
    const active = device ? getActiveReservation(device) : null;
    if (active) {
      alert(`Cannot remove — device is currently reserved by ${active.user.name}.\nThey must release it first.`);
      return;
    }
    const confirmed = confirm(`Remove "${hostname}" from the pool?\n\nThis will permanently delete the device and all its data.`);
    if (!confirmed) return;
    try {
      await apiFetch(`/api/devices/${deviceId}`, { method: "DELETE" });
      loadDevices();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove device");
    }
  }

  async function handleUpdateReservation() {
    if (!editReservation) return;
    try {
      await apiFetch(`/api/reservations/${editReservation.id}`, {
        method: "PATCH",
        body: { endAt: new Date(editReservation.endAt).toISOString() },
      });
      setEditReservation(null);
      loadDevices();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update");
    }
  }

  function handleReserveClick(deviceId: string) {
    const now = new Date();
    const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const fmt = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    setReserveForm({ deviceId, startAt: fmt(now), endAt: fmt(end), reason: "", sshKey: "" });
    setExpandedId(deviceId);
    setReserveError("");
  }

  async function handleRelease(reservationId: string) {
    const confirmed = confirm(
      "Release this device?\n\n" +
      "• Your SSH key will be removed from the device\n" +
      "• You'll need to paste your key again on next reservation\n" +
      "• Any active SSH sessions will stop working"
    );
    if (!confirmed) return;
    try {
      await apiFetch(`/api/reservations/${reservationId}`, { method: "DELETE" });
      setConnectResult(null);
      loadDevices();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to release");
    }
  }

  function getActiveReservation(d: Device) {
    return d.reservations?.find((r) => r.status === "active" || r.status === "pending");
  }

  return (
    <div>
      {/* Dashboard Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Device Pool</h1>
        <a href="/admin" className="btn btn-primary text-sm">+ Add Device</a>
      </div>

      {/* Stats */}
      <div className="flex gap-3 mb-6">
        <div className="card px-4 py-3 flex-1">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-text-muted">Total</div>
        </div>
        <div className="card px-4 py-3 flex-1">
          <div className="text-2xl font-bold text-success">{stats.available}</div>
          <div className="text-xs text-text-muted">Available</div>
        </div>
        <div className="card px-4 py-3 flex-1">
          <div className="text-2xl font-bold text-info">{stats.inUse}</div>
          <div className="text-xs text-text-muted">In Use</div>
        </div>
        <div className="card px-4 py-3 flex-1">
          <div className="text-2xl font-bold text-danger">{stats.offline}</div>
          <div className="text-xs text-text-muted">Offline</div>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-3 mb-5">
        <input
          type="text"
          placeholder="Search devices..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadDevices()}
          className="flex-1 max-w-sm border border-border rounded-lg px-3 py-2 text-sm bg-surface"
        />
        <select value={osFilter} onChange={(e) => setOsFilter(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text-secondary">
          <option value="">All OS</option>
          <option value="linux">Linux</option>
          <option value="macos">macOS</option>
          <option value="windows">Windows</option>
        </select>
      </div>

      {error && <div className="bg-danger-light text-danger text-sm p-3 rounded-lg mb-4">{error}</div>}

      {loading && devices.length === 0 ? (
        <div className="text-text-muted text-sm py-12 text-center">Loading...</div>
      ) : devices.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-text-muted mb-4">No devices yet</p>
          <a href="/admin" className="btn btn-primary">Add your first device</a>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Available devices */}
          {devices.filter(d => d.derivedStatus === "available" || d.derivedStatus === "online").length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-success flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-success" /> Available
              </h2>
              <div className="space-y-2">
                {devices.filter(d => d.derivedStatus === "available" || d.derivedStatus === "online").map(d => renderDeviceCard(d))}
              </div>
            </div>
          )}

          {/* In Use devices — reserved or has active session */}
          {devices.filter(d => d.derivedStatus === "reserved" || d.derivedStatus === "in_use").length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-info flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-info" /> In Use
              </h2>
              <div className="space-y-2">
                {devices.filter(d => d.derivedStatus === "reserved" || d.derivedStatus === "in_use").map(d => renderDeviceCard(d))}
              </div>
            </div>
          )}

          {/* Offline / Enrolled / Maintenance */}
          {devices.filter(d => ["offline", "enrolled", "maintenance"].includes(d.derivedStatus)).length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-text-muted flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-text-muted" /> Offline
              </h2>
              <div className="space-y-2">
                {devices.filter(d => ["offline", "enrolled", "maintenance"].includes(d.derivedStatus)).map(d => renderDeviceCard(d))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lab Floor renders into sidebar via portal */}
      <LabFloor devices={devices} />

      {/* Reservation Confirmation Modal */}
      {confirmReserve && reserveForm && (() => {
        const device = devices.find(d => d.id === reserveForm.deviceId);
        const userName = typeof window !== "undefined" ? localStorage.getItem("devicepool-user-name") : "";
        const start = new Date(reserveForm.startAt);
        const end = new Date(reserveForm.endAt);
        const durationMs = end.getTime() - start.getTime();
        const durationHrs = Math.floor(durationMs / 3600000);
        const durationMins = Math.floor((durationMs % 3600000) / 60000);

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setConfirmReserve(false)}>
            <div className="card p-6 max-w-md w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold mb-4">Confirm Reservation</h3>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Device</span>
                  <span className="font-medium">{device?.displayName || device?.hostname || "Unknown"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">IP Address</span>
                  <span className="font-mono text-xs">{device?.ipAddress || "—"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Reserved by</span>
                  <span className="font-medium">{userName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">From</span>
                  <span>{start.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Until</span>
                  <span>{end.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Duration</span>
                  <span>{durationHrs > 0 ? `${durationHrs}h ` : ""}{durationMins}m</span>
                </div>
                {reserveForm.reason && (
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">Reason</span>
                    <span>{reserveForm.reason}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">SSH Key</span>
                  <span className="text-success text-xs">Provided ✓</span>
                </div>
              </div>

              <div className="bg-info-light text-info text-xs p-3 rounded-lg mb-4">
                After confirming, click <strong>Connect</strong> on the device card. Your SSH key will be injected automatically.
              </div>

              <div className="flex gap-2">
                <button onClick={handleReserveConfirm} className="btn btn-primary flex-1">
                  Confirm Reservation
                </button>
                <button onClick={() => setConfirmReserve(false)} className="btn btn-ghost">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );

  function renderDeviceCard(d: Device) {
            const active = getActiveReservation(d);
            const isExpanded = expandedId === d.id;
            const currentUserId = typeof window !== "undefined" ? localStorage.getItem("devicepool-user-id") : null;
            const isMyReservation = active && active.userId === currentUserId;

            return (
              <div key={d.id} className="card overflow-hidden">
                {/* Main row */}
                <div className="flex items-center px-5 py-4 gap-4">
                  {/* Device name + IP + owner */}
                  <div className="min-w-0 w-44 shrink-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-[15px]">{d.displayName || d.hostname}</span>
                    </div>
                    <div className="text-xs text-text-muted font-mono">{d.ipAddress || "—"}</div>
                    <div className="text-[11px] text-text-muted mt-0.5">
                      {d.owner ? `by ${d.owner.name}` : ""}
                      {active ? <> &middot; <span className="text-info font-medium">{active.user.name}</span> <span className="text-text-muted">({timeRemaining(active.endAt)})</span></> : ""}
                    </div>
                  </div>

                  {/* Status */}
                  <div className="w-20 shrink-0">
                    <StatusBadge status={active ? "in use" : d.derivedStatus} />
                  </div>

                  {/* Usage bars */}
                  <div className="flex gap-3 flex-1 min-w-0">
                    {d.cpuPercent != null && <UsageBar label="CPU" percent={d.cpuPercent} color="bg-info" />}
                    {d.memPercent != null && <UsageBar label="MEM" percent={d.memPercent} color="bg-warning" />}
                    {d.gpuPercent != null && d.gpuPercent >= 0 && <UsageBar label="GPU" percent={d.gpuPercent} color="bg-success" />}
                    {d.gpuMemPercent != null && d.gpuMemPercent >= 0 && <UsageBar label="VRAM" percent={d.gpuMemPercent} color="bg-primary" />}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 shrink-0">
                    {active ? (
                      <>
                        {isMyReservation && (
                          <button
                            onClick={() => handleConnect(d.id)}
                            disabled={connectingId === d.id}
                            className="btn btn-success text-xs py-2 px-4"
                          >
                            {connectingId === d.id ? "..." : "Connect"}
                          </button>
                        )}
                        {isMyReservation && (
                          <button
                            onClick={() => handleRelease(active.id)}
                            className="btn btn-ghost text-xs py-2 px-3 text-danger border-danger hover:bg-danger-light"
                          >
                            Release
                          </button>
                        )}
                        {!isMyReservation && (
                          <span className="text-xs text-text-muted px-2">Reserved by {active.user.name}</span>
                        )}
                      </>
                    ) : d.derivedStatus === "available" || d.derivedStatus === "online" ? (
                      <>
                        <div className="relative group">
                          <button
                            disabled
                            className="btn btn-ghost text-xs py-2 px-4 opacity-40 cursor-not-allowed"
                          >
                            Connect
                          </button>
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-text text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none">
                            Reserve first to connect
                          </div>
                        </div>
                        <button
                          onClick={() => handleReserveClick(d.id)}
                          className="btn btn-primary text-xs py-2 px-4"
                        >
                          Reserve
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-text-muted px-2">{d.derivedStatus}</span>
                    )}
                    <button
                      onClick={() => {
                        if (isExpanded) { setExpandedId(null); setReserveForm(null); setCredForm(null); }
                        else setExpandedId(d.id);
                      }}
                      className="btn btn-ghost text-xs py-2 px-2"
                    >
                      {isExpanded ? "✕" : "⋯"}
                    </button>
                  </div>
                </div>

                {/* Connect result */}
                {connectResult?.deviceId === d.id && (
                  <div className="px-5 pb-4">
                    <div className="border border-success/30 bg-success-light/50 rounded-xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-success"><polyline points="20 6 9 17 4 12"/></svg>
                          </div>
                          <span className="font-semibold text-sm">SSH command copied!</span>
                        </div>
                        <button onClick={() => setConnectResult(null)} className="text-text-muted hover:text-text text-xs">✕</button>
                      </div>

                      <div className="space-y-3">
                        {/* Command */}
                        <div>
                          <div className="text-[11px] text-text-muted uppercase tracking-wide mb-1.5">Command</div>
                          <div className="flex items-center gap-2 bg-white rounded-lg border border-border p-3">
                            <code className="flex-1 text-sm font-mono text-text">{connectResult.cmd}</code>
                            <button onClick={() => copyText(connectResult.cmd)} className="btn btn-ghost text-xs py-1 px-2 shrink-0">Copy</button>
                          </div>
                        </div>

                        {/* Password */}
                        {connectResult.pwd && (
                          <div>
                            <div className="text-[11px] text-text-muted uppercase tracking-wide mb-1.5">Password</div>
                            <div className="flex items-center gap-2 bg-white rounded-lg border border-border p-3">
                              <code className="flex-1 text-sm font-mono text-text">
                                {showPwd ? connectResult.pwd : "•".repeat(12)}
                              </code>
                              <button onClick={() => setShowPwd(!showPwd)} className="btn btn-ghost text-xs py-1 px-2 shrink-0">
                                {showPwd ? "Hide" : "Reveal"}
                              </button>
                              <button onClick={() => copyText(connectResult.pwd!)} className="btn btn-ghost text-xs py-1 px-2 shrink-0">Copy</button>
                            </div>
                          </div>
                        )}
                      </div>

                      <p className="text-[11px] text-text-muted mt-3">
                        {connectResult.keyInjected
                          ? "Your SSH key has been added to the device. Just paste the command — no password needed!"
                          : connectResult.pwd
                            ? "Paste the command, then enter the password when prompted."
                            : "Paste the command in your terminal to connect."
                        }
                      </p>
                    </div>
                  </div>
                )}

                {/* Connect error */}
                {connectError?.deviceId === d.id && (
                  <div className="px-5 pb-4">
                    <div className="bg-danger-light text-danger text-sm p-3 rounded-lg flex justify-between">
                      <span>{connectError.msg}</span>
                      <button onClick={() => setConnectError(null)} className="text-xs hover:underline ml-4">Dismiss</button>
                    </div>
                  </div>
                )}

                {/* Reserve success */}
                {reserveSuccess === d.id && (
                  <div className="px-5 pb-4">
                    <div className="bg-success-light text-success text-sm p-4 rounded-lg">
                      <div className="font-medium mb-1">Device reserved!</div>
                      <div className="text-xs text-success/80">
                        Click <strong>Connect</strong> to get SSH access. Your key will be added to the device automatically.
                      </div>
                    </div>
                  </div>
                )}

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-border-light px-5 py-4 bg-surface-hover/30">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Left: device info */}
                      <div className="text-sm space-y-2">
                        <div className="text-xs font-semibold text-text-secondary mb-2">DEVICE INFO</div>
                        <div className="grid grid-cols-2 gap-1 text-xs">
                          <span className="text-text-muted">Hostname</span><span>{d.hostname}</span>
                          <span className="text-text-muted">OS</span><span>{d.osType} {d.architecture || ""}</span>
                          <span className="text-text-muted">IP</span><span className="font-mono">{d.ipAddress || "—"}</span>
                          <span className="text-text-muted">SSH User</span><span>{d.sshUsername || "—"}</span>
                          <span className="text-text-muted">Owner</span><span>{d.owner?.name || "—"}</span>
                          <span className="text-text-muted">Heartbeat</span>
                          <span>{d.lastHeartbeatAt ? new Date(d.lastHeartbeatAt).toLocaleString() : "Never"}</span>
                        </div>

                        {/* Credential setup */}
                        {!d.hasCredentials && (
                          <div className="mt-3 p-3 bg-warning-light rounded-lg">
                            <div className="text-xs font-medium text-warning mb-2">SSH credentials needed</div>
                            {credForm?.deviceId === d.id ? (
                              <div className="space-y-2">
                                <input type="text" placeholder="SSH Username" value={credForm.username}
                                  onChange={(e) => setCredForm({ ...credForm, username: e.target.value })}
                                  className="w-full border border-border rounded px-2 py-1 text-xs bg-surface" />
                                <input type="password" placeholder="SSH Password" value={credForm.password}
                                  onChange={(e) => setCredForm({ ...credForm, password: e.target.value })}
                                  className="w-full border border-border rounded px-2 py-1 text-xs bg-surface" />
                                <div className="flex gap-2">
                                  <button onClick={handleSaveCredentials} disabled={credSaving}
                                    className="btn btn-primary text-xs py-1 px-2">
                                    {credSaving ? "Saving..." : "Save"}
                                  </button>
                                  <button onClick={() => setCredForm(null)} className="btn btn-ghost text-xs py-1 px-2">Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => setCredForm({ deviceId: d.id, username: "", password: "" })}
                                className="text-xs text-warning hover:underline">
                                Set credentials
                              </button>
                            )}
                          </div>
                        )}

                        {/* Delete device */}
                        {(!d.owner || d.owner.id === localStorage.getItem("devicepool-user-id")) && (
                          <div className="mt-4 pt-4 border-t border-border-light">
                            <button
                              onClick={() => handleDeleteDevice(d.id, d.hostname, d.owner?.id || null)}
                              className="w-full btn text-sm py-2.5 bg-white border-2 border-danger text-danger hover:bg-danger hover:text-white font-medium"
                            >
                              Remove from Pool
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Right: reserve */}
                      <div>
                        <div className="text-xs font-semibold text-text-secondary mb-2">RESERVATION</div>
                        {active ? (
                          <div className="text-xs space-y-2">
                            <div>Reserved by <span className="font-medium">{active.user.name}</span></div>
                            <div className="text-text-muted">
                              {new Date(active.startAt).toLocaleString()} — {new Date(active.endAt).toLocaleString()}
                            </div>
                            <div className="text-info font-medium">{timeRemaining(active.endAt)}</div>

                            {isMyReservation && (
                              <div className="flex flex-col gap-2 mt-2">
                                {/* Extend */}
                                {editReservation?.id === active.id ? (
                                  <div className="flex items-center gap-2">
                                    <input type="datetime-local" value={editReservation.endAt}
                                      onChange={(e) => setEditReservation({ ...editReservation, endAt: e.target.value })}
                                      className="border border-border rounded px-2 py-1 text-xs bg-surface flex-1" />
                                    <button onClick={handleUpdateReservation} className="btn btn-primary text-xs py-1 px-2">Save</button>
                                    <button onClick={() => setEditReservation(null)} className="btn btn-ghost text-xs py-1 px-2">Cancel</button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => {
                                      const fmt = (d: Date) => {
                                        const pad = (n: number) => String(n).padStart(2, "0");
                                        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                                      };
                                      setEditReservation({ id: active.id, endAt: fmt(new Date(active.endAt)) });
                                    }}
                                    className="btn btn-ghost text-xs py-1 px-3 text-primary border-primary"
                                  >
                                    Extend / Change Time
                                  </button>
                                )}
                                {/* Release */}
                                <button
                                  onClick={() => handleRelease(active.id)}
                                  className="btn text-xs py-1 px-3 bg-white border border-danger text-danger hover:bg-danger-light"
                                >
                                  Release Device
                                </button>
                              </div>
                            )}
                          </div>
                        ) : reserveForm?.deviceId === d.id ? (
                          <form onSubmit={handleReserveSubmit} className="space-y-3">
                            {/* Duration */}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] text-text-muted">From</label>
                                <input type="datetime-local" value={reserveForm.startAt} required
                                  onChange={(e) => setReserveForm({ ...reserveForm, startAt: e.target.value })}
                                  className="w-full border border-border rounded px-2 py-1.5 text-xs bg-surface" />
                              </div>
                              <div>
                                <label className="text-[10px] text-text-muted">Until</label>
                                <input type="datetime-local" value={reserveForm.endAt} required
                                  onChange={(e) => setReserveForm({ ...reserveForm, endAt: e.target.value })}
                                  className="w-full border border-border rounded px-2 py-1.5 text-xs bg-surface" />
                              </div>
                            </div>

                            {/* Reason */}
                            <input type="text" placeholder="What will you use this for?" value={reserveForm.reason}
                              onChange={(e) => setReserveForm({ ...reserveForm, reason: e.target.value })}
                              className="w-full border border-border rounded px-2 py-1.5 text-xs bg-surface" />

                            {/* SSH key */}
                            <div className="bg-primary-light/50 border border-primary/10 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-medium text-primary flex items-center gap-1">
                                  SSH Public Key <span className="text-danger">*</span>
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setShowSshHelp(!showSshHelp)}
                                  className="text-primary text-xs hover:underline"
                                >
                                  {showSshHelp ? "Hide help" : "How to get this?"}
                                </button>
                              </div>

                              {showSshHelp && (
                                <div className="bg-text text-white text-[11px] rounded-lg p-3 mb-3 leading-relaxed">
                                  <p className="font-medium mb-2">On your local machine, run:</p>
                                  <code className="block bg-white/20 px-2 py-1.5 rounded mb-2 select-all cursor-text">cat ~/.ssh/id_ed25519.pub</code>
                                  <p className="mb-2">Copy the entire output and paste below.</p>
                                  <p className="text-white/70 mb-1">Don{"'"}t have an SSH key? Generate one:</p>
                                  <code className="block bg-white/20 px-2 py-1.5 rounded select-all cursor-text">ssh-keygen -t ed25519</code>
                                  <p className="text-white/50 mt-2 text-[10px]">Then run the cat command above and paste the output.</p>
                                </div>
                              )}

                              <textarea
                                value={reserveForm.sshKey}
                                onChange={(e) => setReserveForm({ ...reserveForm, sshKey: e.target.value })}
                                placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI..."
                                rows={2}
                                className="w-full border border-primary/20 rounded-lg px-3 py-2 text-xs bg-white font-mono resize-none focus:border-primary"
                              />
                              <p className="text-[10px] text-primary/60 mt-1.5">
                                Your key is added to the device when you Connect, and removed when you Release.
                              </p>
                            </div>

                            {reserveError && <p className="text-danger text-xs">{reserveError}</p>}
                            <div className="flex gap-2">
                              <button type="submit" disabled={!reserveForm.sshKey.trim()} className="btn btn-primary text-xs py-1.5 px-3 disabled:opacity-40 disabled:cursor-not-allowed">Reserve</button>
                              <button type="button" onClick={() => { setReserveForm(null); setReserveError(""); }}
                                className="btn btn-ghost text-xs py-1.5 px-2">Cancel</button>
                            </div>
                          </form>
                        ) : (
                          <button
                            onClick={() => handleReserveClick(d.id)}
                            disabled={d.derivedStatus === "maintenance" || d.derivedStatus === "offline"}
                            className="btn btn-primary text-xs py-1.5 px-3 disabled:opacity-50"
                          >
                            Reserve this device
                          </button>
                        )}

                        {/* Past reservations */}
                        {d.reservations && d.reservations.filter(r => !["active", "pending"].includes(r.status)).length > 0 && (
                          <div className="mt-3">
                            <div className="text-xs text-text-muted mb-1">Recent:</div>
                            {d.reservations.filter(r => !["active", "pending"].includes(r.status)).slice(0, 3).map((r) => (
                              <div key={r.id} className="text-[11px] text-text-muted flex items-center gap-2 py-0.5">
                                <StatusBadge status={r.status} />
                                <span>{r.user.name}</span>
                                <span>{timeRemaining(r.endAt)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
  } // end renderDeviceCard
} // end Home

function UsageBar({ label, percent, color }: { label: string; percent: number; color: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-[10px] text-text-muted w-8 shrink-0">{label}</span>
      <div className="h-2 w-16 bg-border-light rounded-full overflow-hidden shrink-0">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-text-muted w-8 shrink-0">{pct}%</span>
    </div>
  );
}
