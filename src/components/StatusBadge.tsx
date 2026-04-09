"use client";

const statusConfig: Record<string, { bg: string; text: string; dot: string }> = {
  available: { bg: "bg-success-light", text: "text-success", dot: "bg-success" },
  online: { bg: "bg-success-light", text: "text-success", dot: "bg-success" },
  reserved: { bg: "bg-warning-light", text: "text-warning", dot: "bg-warning" },
  in_use: { bg: "bg-info-light", text: "text-info", dot: "bg-info" },
  "in use": { bg: "bg-info-light", text: "text-info", dot: "bg-info" },
  maintenance: { bg: "bg-orange-light", text: "text-orange", dot: "bg-orange" },
  offline: { bg: "bg-danger-light", text: "text-danger", dot: "bg-danger" },
  enrolled: { bg: "bg-surface-hover", text: "text-text-muted", dot: "bg-text-muted" },
  pending: { bg: "bg-warning-light", text: "text-warning", dot: "bg-warning" },
  active: { bg: "bg-success-light", text: "text-success", dot: "bg-success" },
  completed: { bg: "bg-surface-hover", text: "text-text-secondary", dot: "bg-text-muted" },
  canceled: { bg: "bg-danger-light", text: "text-danger", dot: "bg-danger" },
  expired: { bg: "bg-danger-light", text: "text-danger", dot: "bg-danger" },
  no_show: { bg: "bg-orange-light", text: "text-orange", dot: "bg-orange" },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] || { bg: "bg-surface-hover", text: "text-text-muted", dot: "bg-text-muted" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {status.replace("_", " ")}
    </span>
  );
}
