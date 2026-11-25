import { redis, redisReady } from "./redis";

// Small read-through cache. Redis when available, otherwise an in-process map
// (fine for a single dev server). Never cache anything that must be exact for
// stock or money decisions — only lookups such as tenant status.

const memory = new Map<string, { value: string; expiresAt: number }>();

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    if (redisReady()) {
      const raw = await redis!.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    }
  } catch {
    /* fall through to memory */
  }
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    memory.delete(key);
    return null;
  }
  return JSON.parse(hit.value) as T;
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const raw = JSON.stringify(value);
  try {
    if (redisReady()) {
      await redis!.set(key, raw, "EX", ttlSeconds);
      return;
    }
  } catch {
    /* fall through */
  }
  memory.set(key, { value: raw, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export async function cacheDel(key: string): Promise<void> {
  memory.delete(key);
  try {
    if (redisReady()) await redis!.del(key);
  } catch {
    /* ignore */
  }
}

export async function cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const value = await load();
  if (value !== null && value !== undefined) await cacheSet(key, value, ttlSeconds);
  return value;
}

export const cacheKeys = {
  orgStatus: (orgId: string) => `rims:org:${orgId}:status`,
};
