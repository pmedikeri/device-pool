"use client";

import "./globals.css";
import { useEffect, useState } from "react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [userName, setUserName] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const name = localStorage.getItem("devicepool-user-name");
    const role = localStorage.getItem("devicepool-user-role");
    setUserName(name);
    setUserRole(role);
    setMounted(true);

    // Redirect to login if not signed in (except on /login page)
    if (!localStorage.getItem("devicepool-user-id") && !window.location.pathname.startsWith("/login")) {
      window.location.replace("/login");
    }
  }, []);

  function handleLogout() {
    localStorage.removeItem("devicepool-user-id");
    localStorage.removeItem("devicepool-user-name");
    localStorage.removeItem("devicepool-user-role");
    window.location.href = "/login";
  }

  return (
    <html lang="en">
      <head>
        <title>Device Pool</title>
        <meta name="description" content="Internal device reservation and access platform" />
{/* Using system font stack — no external font dependency */}
      </head>
      <body style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
        {/* Show login popup if not signed in */}
        {mounted && !userName ? (
          <div className="min-h-screen bg-bg flex items-center justify-center">
            <div className="max-w-sm w-full px-4">{children}</div>
          </div>
        ) : (
          <div className="flex min-h-screen">
            {/* Sidebar */}
            <aside className="w-60 bg-surface border-r border-border flex flex-col shrink-0">
              <div className="px-5 py-5 border-b border-border">
                <a href="/" className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                      <line x1="8" y1="21" x2="16" y2="21"/>
                      <line x1="12" y1="17" x2="12" y2="21"/>
                    </svg>
                  </div>
                  <span className="font-semibold text-[15px] text-text">Device Pool</span>
                </a>
              </div>

              <nav className="px-3 py-4 space-y-1">
                <NavLink href="/" icon="M4 6h16M4 12h16M4 18h16" label="Devices" />
                <NavLink href="/reservations" icon="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" label="Reservations" />
                <NavLink href="/admin" icon="M12 4v16m8-8H4" label="Add Device" />
              </nav>

              {/* Lab Floor panel — populated by page.tsx via portal */}
              <div id="sidebar-lab" className="flex-1 px-3 overflow-y-auto" />

              <div className="px-4 py-4 border-t border-border">
                {userName && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary-light text-primary flex items-center justify-center text-sm font-semibold shrink-0">
                        {userName.charAt(0).toUpperCase()}
                      </div>
                      <div className="text-sm font-medium truncate">{userName}</div>
                    </div>
                    <button onClick={handleLogout} className="text-text-muted hover:text-danger text-xs p-1" title="Sign out">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                        <polyline points="16 17 21 12 16 7"/>
                        <line x1="21" y1="12" x2="9" y2="12"/>
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </aside>

            <main className="flex-1 overflow-auto">
              <div className="max-w-6xl mx-auto px-8 py-8">
                {children}
              </div>
            </main>
          </div>
        )}
      </body>
    </html>
  );
}

function NavLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-hover hover:text-text font-medium"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d={icon} />
      </svg>
      {label}
    </a>
  );
}
