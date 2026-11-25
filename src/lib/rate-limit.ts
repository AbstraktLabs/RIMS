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

/** Counts an attempt; throws 429 once the limit is exceeded within the window. */
export async function enforceRateLimit({ scope, identifier, limit, windowSeconds }: RateLimitOptions) {
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

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
