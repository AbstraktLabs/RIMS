import Redis from "ioredis";

// Redis is used for caching and rate limiting. In development it is optional:
// when REDIS_URL is unset, callers fall back to an in-process store.

declare global {
  var _rimsRedis: Redis | null | undefined;
}

function createClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2, enableOfflineQueue: false });
  client.on("error", (err) => console.error("[redis]", err.message));
  client.connect().catch(() => undefined);
  return client;
}

export const redis: Redis | null = global._rimsRedis !== undefined ? global._rimsRedis : createClient();

if (process.env.NODE_ENV !== "production") {
  global._rimsRedis = redis;
}

export function redisReady(): boolean {
  return !!redis && redis.status === "ready";
}
