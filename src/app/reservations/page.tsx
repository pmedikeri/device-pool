"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { StatusBadge } from "@/components/StatusBadge";

type Reservation = {
  id: string; deviceId: string; startAt: string; endAt: string;
  status: string; reason: string | null;
  device: { hostname: string; displayName: string | null; osType: string };
};

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { loadReservations(); }, []);

  async function loadReservations() {
    try {
      const data = await apiFetch<{ reservations: Reservation[] }>("/api/reservations?mine=true");
      setReservations(data.reservations);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function cancelReservation(id: string) {
    if (!confirm("Cancel this reservation?")) return;
    try {
      await apiFetch(`/api/reservations/${id}`, { method: "DELETE" });
      loadReservations();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  }

  const active = reservations.filter((r) => ["pending", "active"].includes(r.status));
  const past = reservations.filter((r) => !["pending", "active"].includes(r.status));

  if (loading) return <div className="text-text-muted text-sm py-12 text-center">Loading...</div>;
  if (error) return <div className="bg-danger-light text-danger text-sm p-4 rounded-lg">{error}</div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">My Reservations</h1>
        <p className="text-sm text-text-secondary mt-0.5">{reservations.length} total reservations</p>
      </div>

      {/* Active */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-success" />
          Active & Upcoming
        </h2>
        {active.length === 0 ? (
          <div className="card p-6 text-center text-sm text-text-muted">
            No active reservations. <a href="/devices" className="text-primary hover:underline">Browse devices</a> to make one.
          </div>
        ) : (
          <div className="space-y-3">
            {active.map((r) => (
              <div key={r.id} className="card p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <a href={`/devices/${r.deviceId}`} className="font-medium hover:text-primary">
                      {r.device.displayName || r.device.hostname}
                    </a>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="text-xs text-text-muted">
                    {new Date(r.startAt).toLocaleDateString()} {new Date(r.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {" — "}
                    {new Date(r.endAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {r.reason && <span className="ml-2 text-text-secondary">· {r.reason}</span>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <a href={`/devices/${r.deviceId}`} className="btn btn-success text-xs py-1.5 px-3">Connect</a>
                  <button onClick={() => cancelReservation(r.id)} className="btn btn-danger text-xs py-1.5 px-3">Cancel</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Past */}
      {past.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-text-secondary mb-3">Past Reservations</h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-hover/50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-text-secondary uppercase tracking-wider">Device</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-text-secondary uppercase tracking-wider">Time</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-text-secondary uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {past.map((r) => (
                  <tr key={r.id} className="border-b border-border-light last:border-0">
                    <td className="px-4 py-3 text-text-secondary">{r.device.displayName || r.device.hostname}</td>
                    <td className="px-4 py-3 text-text-muted text-xs">
                      {new Date(r.startAt).toLocaleDateString()} {new Date(r.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {" — "}{new Date(r.endAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
