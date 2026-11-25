"use client";

// Browser-side API client. The access token lives only in memory; the
// refresh token is an httpOnly cookie the browser sends to /api/auth/*.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
  /** field → first message, from a Zod flattenError payload */
  get fieldErrors(): Record<string, string> {
    const fe = (this.details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors ?? {};
    return Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v?.[0] ?? "Invalid"]));
  }
}

let accessToken: string | null = null;
let refreshing: Promise<SessionPayload> | null = null;
let onSignedOut: (() => void) | null = null;

export interface SessionPayload {
  accessToken: string;
  expiresIn: number;
  user: { id: string; name: string; email: string; phone: string | null; isOwner: boolean };
  organization: {
    id: string;
    name: string;
    slug: string;
    status: string;
    plan: string;
    trialEndsAt: string | null;
    logoUrl: string | null;
  };
  locations: { id: string; name: string; isDefault: boolean; role: string }[];
  activeLocationId: string;
  role: string;
  permissions: string[];
}

export function setAccessToken(t: string | null) {
  accessToken = t;
}
export function setSignedOutHandler(fn: (() => void) | null) {
  onSignedOut = fn;
}

async function parse(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 200) };
  }
}

async function withRefreshLock(fn: () => Promise<Response>): Promise<Response> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  return locks ? await locks.request("rims-auth-refresh", fn) : fn();
}

/** Rotates the refresh cookie and returns a fresh session. Concurrent callers share one request. */
export function refreshSession(locationId?: string): Promise<SessionPayload> {
  if (refreshing && !locationId) return refreshing;
  const send = () =>
    fetch(locationId ? "/api/auth/switch-location" : "/api/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(locationId ? { locationId } : {}),
      credentials: "same-origin",
    });
  const p = (async () => {
    // Tabs share one refresh cookie, and each refresh replaces it. Take turns across
    // tabs so a second tab sends the cookie the first one just received.
    let res = await withRefreshLock(send);
    // A tab without lock support can still lose a race; the cookie is fresh by now.
    if (res.status === 401) res = await withRefreshLock(send);
    const body = await parse(res);
    if (!res.ok) {
      if (!locationId) accessToken = null;
      throw new ApiError(res.status, body?.error ?? "Session expired", body?.details);
    }
    accessToken = body.accessToken;
    return body as SessionPayload;
  })();
  if (!locationId) {
    refreshing = p;
    p.finally(() => {
      refreshing = null;
    }).catch(() => undefined);
  }
  return p;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export function withQuery(path: string, query?: Query) {
  if (!query) return path;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${path}${path.includes("?") ? "&" : "?"}${s}` : path;
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Query; form?: FormData } = {},
): Promise<T> {
  const url = withQuery(path, opts.query);
  const send = () => {
    const headers: Record<string, string> = {};
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    return fetch(url, {
      method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      credentials: "same-origin",
    });
  };

  let res = await send();
  if (res.status === 401 && !path.startsWith("/api/auth/") && !path.startsWith("/api/platform/")) {
    try {
      await refreshSession();
      res = await send();
    } catch {
      onSignedOut?.();
      throw new ApiError(401, "Your session has expired. Please sign in again.");
    }
  }
  const body = await parse(res);
  if (!res.ok) throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`, body?.details);
  return body as T;
}

export const get = <T>(path: string, query?: Query) => api<T>(path, { query });
export const post = <T>(path: string, body: unknown = {}) => api<T>(path, { method: "POST", body });
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: "PUT", body });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body });
export const del = <T>(path: string) => api<T>(path, { method: "DELETE" });

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const fields = Object.entries(err.fieldErrors);
    if (fields.length) return `${err.message}: ${fields.map(([k, v]) => `${k} — ${v}`).join("; ")}`;
    const form = (err.details as { formErrors?: string[] } | undefined)?.formErrors;
    if (form?.length) return form.join("; ");
    return err.message;
  }
  return err instanceof Error ? err.message : "Something went wrong";
}
