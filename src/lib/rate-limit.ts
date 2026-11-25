import { NextRequest } from "next/server";
import { redis, redisReady } from "./redis";
import { AppError } from "./errors";

const memory = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitOptions {
  scope: string; // "login", "register", "forgot-password"
  identifier: string;
  limit: number;
  windowSeconds: number;
}

// Local test runs may switch off named limits (e.g. RATE_LIMIT_SKIP=register) so an
// end-to-end suite can create many tenants. Never honoured in production.
const skipped = new Set(
  process.env.NODE_ENV === "production"
    ? []
    : (process.env.RATE_LIMIT_SKIP ?? "").split(",").map((s) => s.trim()).filter(Boolean),
);

function pruneMemory(now: number) {
  if (memory.size < 10_000) return;
  for (const [k, v] of memory) if (v.resetAt < now) memory.delete(k);
}

/** Counts an attempt; throws 429 once the limit is exceeded within the window. */
export async function enforceRateLimit({ scope, identifier, limit, windowSeconds }: RateLimitOptions) {
  if (skipped.has(scope)) return;
  const key = `rims:ratelimit:${scope}:${identifier.toLowerCase()}`;
  let count: number;
  let retryAfter = windowSeconds;

  if (redisReady()) {
    count = await redis!.incr(key);
    if (count === 1) await redis!.expire(key, windowSeconds);
    const ttl = await redis!.ttl(key);
    if (ttl > 0) retryAfter = ttl;
  } else {
    const now = Date.now();
    pruneMemory(now);
    const entry = memory.get(key);
    if (!entry || entry.resetAt < now) {
      memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      count = 1;
    } else {
      entry.count += 1;
      count = entry.count;
      retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    }
  }

  if (count > limit) {
    throw new AppError(429, `Too many attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`, {
      retryAfterSeconds: retryAfter,
    });
  }
}

export async function resetRateLimit(scope: string, identifier: string) {
  const key = `rims:ratelimit:${scope}:${identifier.toLowerCase()}`;
  memory.delete(key);
  if (redisReady()) await redis!.del(key).catch(() => undefined);
}

/**
 * The caller's IP for rate limiting. Proxies append to X-Forwarded-For, so only the
 * entries they added can be trusted; anything to their left was sent by the client and
 * could be made up to dodge a limit. TRUSTED_PROXY_COUNT is how many proxies sit in
 * front of the app (default 1); the client IP is that many entries from the right.
 */
export function clientIp(req: NextRequest): string {
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_COUNT ?? 1) || 1);
  const chain = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (chain.length) return chain[Math.max(0, chain.length - hops)];
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
