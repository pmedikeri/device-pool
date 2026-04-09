const API_BASE = "";

type FetchOptions = {
  method?: string;
  body?: unknown;
  userId?: string;
};

export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // In dev, pass user ID from localStorage
  if (typeof window !== "undefined") {
    const userId = localStorage.getItem("devicepool-user-id");
    if (userId) headers["x-user-id"] = userId;
  }
  if (opts.userId) headers["x-user-id"] = opts.userId;

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return res.json();
}
