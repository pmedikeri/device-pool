"use client";

import { useState } from "react";

export default function LoginPage() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!name || !password) {
      setError("Enter your name and the access password");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      localStorage.setItem("devicepool-user-id", data.user.id);
      localStorage.setItem("devicepool-user-name", data.user.name);
      localStorage.setItem("devicepool-user-role", data.user.role);
      window.location.replace("/");
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary text-white flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold">Device Pool</h1>
          <p className="text-sm text-text-secondary mt-1">Enter your name to get started</p>
        </div>

        <div className="card p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Your Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-surface"
              placeholder="e.g. John Smith"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Access Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-surface"
              placeholder="Enter team password"
            />
          </div>
          {error && (
            <div className="bg-danger-light text-danger text-sm p-3 rounded-lg">{error}</div>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={handleLogin}
            className="btn btn-primary w-full py-2.5"
          >
            {loading ? "Entering..." : "Enter"}
          </button>
        </div>
    </div>
  );
}
