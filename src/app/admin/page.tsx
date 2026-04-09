"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

type EnrollmentResult = {
  token: string;
  expiresAt: string;
  shellCommand: string;
  powershellCommand: string;
};

function copyText(text: string, setCopied: (v: string | null) => void, label: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  setCopied(label);
  setTimeout(() => setCopied(null), 2000);
}

export default function AdminPage() {
  const [result, setResult] = useState<EnrollmentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  async function generateToken() {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<EnrollmentResult>("/api/enrollment/token", { method: "POST" });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Add Device</h1>
        <p className="text-sm text-text-secondary mt-0.5">Add a new device to the pool in 3 steps</p>
      </div>

      {!result ? (
        <div className="card p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary-light text-primary flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-2">Ready to add a device?</h2>
          <p className="text-sm text-text-secondary mb-6 max-w-sm mx-auto">
            Generate a one-time enrollment command. Run it on the target device to register it with the pool.
          </p>
          <button onClick={generateToken} disabled={loading} className="btn btn-primary px-6 py-2.5">
            {loading ? "Generating..." : "Generate Enrollment Command"}
          </button>
          {error && <div className="bg-danger-light text-danger text-sm p-3 rounded-lg mt-4">{error}</div>}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Step 1 — Copy */}
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">1</div>
              <div>
                <div className="font-semibold text-sm">Copy this command</div>
                <div className="text-xs text-text-muted">Expires {new Date(result.expiresAt).toLocaleString()}</div>
              </div>
            </div>
            <div className="relative">
              <pre className="bg-bg border border-border rounded-lg p-4 pr-20 text-xs overflow-x-auto font-mono text-success leading-relaxed">{result.shellCommand}</pre>
              <button
                onClick={() => copyText(result.shellCommand, setCopied, "cmd")}
                className="absolute top-2 right-2 btn btn-primary text-xs py-1.5 px-3"
              >
                {copied === "cmd" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Step 2 — SSH and paste */}
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">2</div>
              <div>
                <div className="font-semibold text-sm">SSH into the target device and paste</div>
                <div className="text-xs text-text-muted">It will ask for the SSH username and password for that device</div>
              </div>
            </div>
            <div className="bg-bg border border-border rounded-lg p-4 text-xs font-mono text-text-secondary space-y-1">
              <div className="text-text-muted">$ <span className="text-text">ssh nvidia@10.x.x.x</span></div>
              <div className="text-text-muted">$ <span className="text-success">[paste command]</span></div>
              <div className="text-text-muted">SSH username: <span className="text-text">nvidia</span></div>
              <div className="text-text-muted">SSH password: <span className="text-text">••••••</span></div>
              <div className="text-success mt-2">✓ Registered! Device ID: abc123...</div>
              <div className="text-success">✓ Heartbeat agent started</div>
            </div>
          </div>

          {/* Step 3 — Done */}
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">3</div>
              <div>
                <div className="font-semibold text-sm">Device appears on the dashboard</div>
                <div className="text-xs text-text-muted">Within 30 seconds, with live CPU/GPU metrics. IP auto-updates.</div>
              </div>
            </div>
            <a href="/" className="btn btn-ghost text-sm">Go to Dashboard</a>
          </div>

          {/* Generate another */}
          <div className="text-center pt-2">
            <button onClick={() => setResult(null)} className="text-sm text-text-muted hover:text-text">
              + Add another device
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
