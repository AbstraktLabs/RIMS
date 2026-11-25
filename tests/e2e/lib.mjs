// Shared helpers for the end-to-end API suites.
// They sign up throwaway businesses and post real documents, so point them only at
// a development server with its own empty database — never at real data.

export const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(BASE) && process.env.E2E_ALLOW_REMOTE !== "1") {
  console.error(`Refusing to run against ${BASE}. These tests create data; use a local server or set E2E_ALLOW_REMOTE=1.`);
  process.exit(2);
}

/** Unique per run, so repeated runs never collide on emails or SKUs. */
export const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

let pass = 0;
let fail = 0;
const failures = [];

export function check(label, cond, extra) {
  if (cond) {
    pass++;
    console.log("  ✓", label);
  } else {
    fail++;
    failures.push(label);
    console.log("  ✗", label, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : "");
  }
}

export const near = (a, b, eps = 0.011) => Math.abs(Number(a) - Number(b)) <= eps;

/** A signed-in browser-like client: keeps the refresh cookie and the latest access token. */
export function client(name) {
  let token = null;
  const cookies = new Map();
  async function call(method, path, body, extraHeaders = {}) {
    const headers = { "content-type": "application/json", ...extraHeaders };
    if (token) headers.authorization = `Bearer ${token}`;
    if (cookies.size) headers.cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      cookies.set(kv.slice(0, i), kv.slice(i + 1));
    }
    let json = null;
    const text = await res.text();
    try {
      json = JSON.parse(text);
    } catch {
      json = text.slice(0, 300);
    }
    if (json?.accessToken) token = json.accessToken;
    return { status: res.status, json, headers: res.headers };
  }
  return {
    name,
    call,
    cookies,
    token: () => token,
    setToken: (t) => (token = t),
    get: (p, h) => call("GET", p, undefined, h),
    post: (p, b, h) => call("POST", p, b ?? {}, h),
    put: (p, b) => call("PUT", p, b),
    patch: (p, b) => call("PATCH", p, b),
    del: (p) => call("DELETE", p),
    /** Like call(), but a non-2xx response fails the check and stops the suite. */
    async ok(method, path, body) {
      const r = await call(method, path, body);
      if (r.status >= 300) {
        fail++;
        failures.push(`${method} ${path} → ${r.status}`);
        console.log(`  ✗ ${method} ${path} → ${r.status}`, JSON.stringify(r.json).slice(0, 800));
        throw new Error(`stop: ${method} ${path}`);
      }
      return r.json;
    },
  };
}

/** Sign up a fresh business and return its signed-in owner client plus the sign-up response. */
export async function newShop(label, extra = {}) {
  const c = client(label);
  const email = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${run}@example.test`;
  const reg = await c.ok("POST", "/api/auth/register", {
    businessName: `${label} ${run}`,
    ownerName: `Owner ${label}`,
    email,
    password: "Passw0rd123",
    ...extra,
  });
  return { c, reg, email, password: "Passw0rd123" };
}

/** Run a suite body, print the tally, and set the exit code. */
export function suite(name, body) {
  console.log(`\n=== ${name} ===`);
  body()
    .catch((e) => {
      fail++;
      failures.push(`aborted: ${e.message}`);
      console.log("ABORTED:", e.message);
    })
    .finally(() => {
      console.log(`\n${name}: ${pass} passed, ${fail} failed`);
      if (failures.length) console.log("Failures:\n - " + failures.join("\n - "));
      process.exitCode = fail ? 1 : 0;
    });
}
