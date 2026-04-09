"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api-client";

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

export default function ProfilePageWrapper() {
  return (
    <Suspense fallback={<div className="text-text-muted text-sm py-12 text-center">Loading...</div>}>
      <ProfilePage />
    </Suspense>
  );
}

function ProfilePage() {
  const searchParams = useSearchParams();
  const fromReserve = searchParams.get("from") === "reserve";
  const returnDeviceId = searchParams.get("deviceId");

  const [sshKey, setSshKey] = useState("");
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ user: { sshPublicKey: string | null } }>("/api/users/me")
      .then(({ user }) => {
        if (user.sshPublicKey) {
          setSshKey(user.sshPublicKey);
          setSavedKey(user.sshPublicKey);
        }
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await apiFetch("/api/users/me", {
        method: "PATCH",
        body: { sshPublicKey: sshKey || null },
      });
      setSavedKey(sshKey || null);
      if (fromReserve) {
        setMessage("SSH key saved! Redirecting back to reserve...");
        setTimeout(() => { window.location.href = "/"; }, 1500);
        return;
      }
      setMessage("SSH key saved! It will be used next time you Connect to a device.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      {fromReserve && (
        <div className="bg-warning-light border border-warning/30 text-warning rounded-xl p-4 mb-6 text-sm">
          <div className="font-semibold mb-1">Set up your SSH key to continue</div>
          <div className="text-xs text-warning/80">
            You need an SSH public key to connect to devices. Paste your key below, then you{"'"}ll be redirected back to reserve the device.
          </div>
        </div>
      )}

      <h1 className="text-2xl font-bold mb-1">SSH Key Settings</h1>
      <p className="text-sm text-text-secondary mb-6">
        Add your SSH public key so you can connect to devices without entering a password.
      </p>

      <div className="card p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-primary-light text-primary flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
            </svg>
          </div>
          <div>
            <h2 className="font-semibold">SSH Public Key</h2>
            <p className="text-xs text-text-muted">
              {savedKey ? "Key configured — passwordless SSH enabled" : "No key set — using password authentication"}
            </p>
          </div>
          {savedKey && (
            <span className="ml-auto text-xs bg-success-light text-success px-2 py-1 rounded-full font-medium">Active</span>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">Public Key</label>
            <textarea
              value={sshKey}
              onChange={(e) => setSshKey(e.target.value)}
              placeholder="ssh-ed25519 AAAAC3Nza... your-email@example.com"
              rows={4}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface font-mono text-xs resize-none"
            />
          </div>

          {message && <div className="bg-success-light text-success text-sm p-3 rounded-lg">{message}</div>}
          {error && <div className="bg-danger-light text-danger text-sm p-3 rounded-lg">{error}</div>}

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="btn btn-primary">
              {saving ? "Saving..." : savedKey ? "Update Key" : "Save Key"}
            </button>
            {savedKey && (
              <button
                onClick={() => { setSshKey(""); handleSave(); }}
                className="btn btn-ghost text-danger border-danger hover:bg-danger-light"
              >
                Remove Key
              </button>
            )}
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="card p-6">
        <h3 className="font-semibold mb-3">How it works</h3>
        <ol className="space-y-2 text-sm text-text-secondary">
          <li className="flex gap-2">
            <span className="text-primary font-bold">1.</span>
            <div>
              <span>Paste your public key above. To get it, run:</span>
              <div className="mt-1.5 space-y-1">
                <code className="block bg-surface-hover px-2 py-1 rounded text-xs">cat ~/.ssh/id_ed25519.pub</code>
                <span className="text-xs text-text-muted">or</span>
                <code className="block bg-surface-hover px-2 py-1 rounded text-xs">cat ~/.ssh/id_rsa.pub</code>
              </div>
            </div>
          </li>
          <li className="flex gap-2">
            <span className="text-primary font-bold">2.</span>
            <span>When you <strong>Connect</strong> to a device, your key is automatically added to its <code className="bg-surface-hover px-1 rounded text-xs">authorized_keys</code></span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary font-bold">3.</span>
            <span>SSH in without a password: just <code className="bg-surface-hover px-1 rounded text-xs">ssh user@&lt;ip_address&gt;</code></span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary font-bold">4.</span>
            <span>When you <strong>Release</strong> the device, your key is automatically removed</span>
          </li>
        </ol>

        <div className="mt-4 p-3 bg-surface-hover rounded-lg text-xs text-text-muted">
          <strong>Don{"'"}t have an SSH key?</strong> Generate one:
          <div className="mt-1">
            <code className="bg-white/50 px-1.5 py-0.5 rounded">ssh-keygen -t ed25519</code>
            <span className="ml-2">then paste the contents of <code className="bg-white/50 px-1 rounded">~/.ssh/id_ed25519.pub</code></span>
          </div>
        </div>
      </div>
    </div>
  );
}
