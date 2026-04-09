"use client";

const osData: Record<string, { label: string; color: string; bgColor: string }> = {
  linux: { label: "Linux", color: "text-warning", bgColor: "bg-warning-light" },
  macos: { label: "macOS", color: "text-text-secondary", bgColor: "bg-surface-hover" },
  windows: { label: "Windows", color: "text-info", bgColor: "bg-info-light" },
};

export function OsIcon({ os }: { os: string }) {
  const cfg = osData[os] || { label: os, color: "text-text-muted", bgColor: "bg-surface-hover" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.color} ${cfg.bgColor}`}>
      {cfg.label}
    </span>
  );
}
