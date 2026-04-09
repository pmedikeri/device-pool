"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const PALETTES = [
  { hair: "#e74c3c", shirt: "#3498db", skin: "#fdd9b5" },
  { hair: "#8e44ad", shirt: "#2ecc71", skin: "#fdd9b5" },
  { hair: "#f39c12", shirt: "#e74c3c", skin: "#d2a679" },
  { hair: "#2c3e50", shirt: "#f39c12", skin: "#fdd9b5" },
  { hair: "#e67e22", shirt: "#9b59b6", skin: "#d2a679" },
  { hair: "#1abc9c", shirt: "#e74c3c", skin: "#fdd9b5" },
  { hair: "#c0392b", shirt: "#27ae60", skin: "#d2a679" },
  { hair: "#2980b9", shirt: "#f1c40f", skin: "#fdd9b5" },
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pickBubble(cpu: number, mem: number, gpu: number, seed: number): string | null {
  if (gpu > 80) return ["🔥 GPU at " + Math.round(gpu) + "% — full send!", "⚡ GPU cranked to " + Math.round(gpu) + "%", "🚀 Training at GPU " + Math.round(gpu) + "%", "💪 GPU " + Math.round(gpu) + "% — going hard"][seed % 4];
  if (gpu > 40) return ["🧠 GPU warming up — " + Math.round(gpu) + "%", "⚙️ Running at GPU " + Math.round(gpu) + "%", "📊 Inference at GPU " + Math.round(gpu) + "%"][seed % 3];
  if (mem > 70) return ["📦 Big model loaded — MEM " + Math.round(mem) + "%", "🧠 MEM " + Math.round(mem) + "% — heavy weights!", "💾 Memory packed at " + Math.round(mem) + "%"][seed % 3];
  if (cpu > 50) return ["⏳ CPU busy at " + Math.round(cpu) + "%", "🔧 Crunching at CPU " + Math.round(cpu) + "%", "💻 Processing — CPU " + Math.round(cpu) + "%"][seed % 3];
  return null;
}

type ActiveUser = {
  userName: string;
  deviceName: string;
  cpu: number;
  mem: number;
  gpu: number;
  timeLeft: string;
};

function LabFloor({ devices }: { devices: { derivedStatus: string; displayName: string | null; hostname: string; cpuPercent: number | null; memPercent: number | null; gpuPercent: number | null; reservations: { status: string; endAt: string; user: { name: string } }[]; sessions: { endedAt: string | null; user: { name: string } }[] }[] }) {
  const [frame, setFrame] = useState(0);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalEl(document.getElementById("sidebar-lab"));
  }, []);

  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % 120), 200);
    return () => clearInterval(id);
  }, []);

  const activeUsers: ActiveUser[] = [];
  for (const d of devices) {
    if (d.derivedStatus !== "in_use" && d.derivedStatus !== "reserved") continue;
    const sess = d.sessions?.find(s => !s.endedAt);
    const res = d.reservations?.find(r => r.status === "active" || r.status === "pending")
      || (sess ? d.reservations?.find(r => new Date(r.endAt) > new Date() && r.user.name === sess.user.name) : undefined);
    const userName = res?.user.name || sess?.user.name;
    if (!userName) continue;

    const ms = res ? new Date(res.endAt).getTime() - Date.now() : 0;
    const mins = Math.max(0, Math.floor(ms / 60000));
    const timeLeft = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;

    activeUsers.push({
      userName,
      deviceName: d.displayName || d.hostname,
      cpu: d.cpuPercent ?? 0,
      mem: d.memPercent ?? 0,
      gpu: d.gpuPercent ?? 0,
      timeLeft,
    });
  }

  if (activeUsers.length === 0 || !portalEl) return null;

  const content = (
    <div className="space-y-3">
      <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider px-1">
        Active Users
      </div>
      {activeUsers.map((user, i) => (
        <SidebarWorkstation key={user.userName + i} user={user} frame={frame} index={i} />
      ))}
    </div>
  );

  return createPortal(content, portalEl);
}

function SidebarWorkstation({ user, frame, index }: { user: ActiveUser; frame: number; index: number }) {
  const p = PALETTES[hash(user.userName) % PALETTES.length];
  const typing = frame % 8 < 5;

  const bubble = pickBubble(user.cpu, user.mem, user.gpu, Math.floor(frame / 30) + hash(user.userName));

  return (
    <div className="rounded-lg border border-border bg-surface p-2.5">
      {/* Metric badge — only shows when something is active */}
      {bubble && (
        <div className="mb-1.5">
          <div className="bg-surface-hover border border-border rounded px-2 py-0.5 text-[9px] font-mono text-text-secondary inline-block">
            {bubble}
          </div>
        </div>
      )}

      <div className="flex items-end gap-1">
        {/* Character sitting */}
        <svg width="44" height="52" viewBox="0 0 44 52" className="shrink-0">
          {/* Chair */}
          <rect x="4" y="42" width="22" height="3" rx="1.5" fill="#bbb" />
          <rect x="6" y="45" width="2" height="6" fill="#999" />
          <rect x="22" y="45" width="2" height="6" fill="#999" />

          {/* Hair */}
          <rect x="8" y="4" width="16" height="7" rx="4" fill={p.hair} />
          {/* Head */}
          <rect x="9" y="7" width="14" height="12" rx="3" fill={p.skin} />
          {/* Eyes — blink occasionally */}
          {frame % 30 < 28 ? (
            <>
              <circle cx="14" cy="14" r="1.2" fill="#333" />
              <circle cx="20" cy="14" r="1.2" fill="#333" />
            </>
          ) : (
            <>
              <rect x="13" y="13.5" width="2.5" height="0.8" rx="0.4" fill="#333" />
              <rect x="19" y="13.5" width="2.5" height="0.8" rx="0.4" fill="#333" />
            </>
          )}

          {/* Body */}
          <rect x="8" y="19" width="16" height="14" rx="2" fill={p.shirt} />

          {/* Left arm */}
          <g transform={`translate(24, ${typing ? 24 : 26}) rotate(${typing ? -15 : -5})`}>
            <rect x="0" y="0" width="12" height="3.5" rx="1.5" fill={p.skin} />
            <circle cx="12" cy="1.7" r="2" fill={p.skin} />
          </g>
          {/* Right arm */}
          <g transform={`translate(24, ${typing ? 28 : 30}) rotate(${typing ? 5 : -2})`}>
            <rect x="0" y="0" width="12" height="3.5" rx="1.5" fill={p.skin} />
            <circle cx="12" cy="1.7" r="2" fill={p.skin} />
          </g>

          {/* Legs */}
          <rect x="10" y="33" width="6" height="10" rx="1" fill="#445" />
          <rect x="18" y="33" width="6" height="10" rx="1" fill="#445" />
          {/* Shoes */}
          <rect x="9" y="42" width="7" height="3" rx="1" fill="#333" />
          <rect x="17" y="42" width="7" height="3" rx="1" fill="#333" />

          {/* Keyboard */}
          <rect x="30" y="33" width="12" height="3" rx="1" fill="#ccc" stroke="#bbb" strokeWidth="0.5" />
          {typing && (
            <rect x={32 + (frame % 3) * 3} y="33.5" width="2" height="1.5" rx="0.3" fill="#999" />
          )}

          {/* Desk */}
          <rect x="26" y="36" width="18" height="2" rx="0.5" fill="#d4a76a" />
          <rect x="26" y="38" width="2" height="13" fill="#c49a5c" />
          <rect x="42" y="38" width="2" height="13" fill="#c49a5c" />
        </svg>

        {/* Monitor */}
        <div className="flex flex-col items-center -ml-1 mb-3">
          <div className="rounded" style={{ width: 100, padding: 4, border: "3px solid #222", background: "#111" }}>
            <div className="text-[7px] font-mono text-info truncate">{user.userName}</div>
            <div className="text-[8px] font-mono text-success truncate leading-tight mt-0.5">{user.deviceName}</div>
            <div className="text-[6px] font-mono text-text-muted mt-1">Time Left: <span className="text-warning font-bold text-[8px]">{user.timeLeft}</span></div>
          </div>
          <div style={{ width: 4, height: 6, background: "#333", margin: "0 auto" }} />
          <div style={{ width: 16, height: 3, background: "#333", borderRadius: 1, margin: "0 auto" }} />
        </div>
      </div>

      {/* Name + device */}
      <div className="text-xs font-medium text-text mt-1 truncate">{user.userName}</div>
      <div className="text-[10px] text-text-muted truncate">{user.deviceName}</div>
    </div>
  );
}

export { LabFloor };
