import Redis from "ioredis";
import { env } from "$env/dynamic/private";

/**
 * Hybrid cache system: Redis (shared/persistent) + In-memory (local/ephemeral).
 * Optimized for serverless environments to reduce Notion API load.
 */

const REDIS_URL = env.REDIS_URL;
let redis: Redis | null = null;

interface RedisError extends Error {
  code?: string;
}

if (REDIS_URL) {
  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      lazyConnect: true, // Only connect on first command
    });
    redis.on("error", (err: RedisError) => {
      // Don't crash the app if Redis fails, just log it.
      if (err.code !== "ECONNREFUSED") {
        console.warn(">>> [Cache] Redis Error:", err);
      }
    });
  } catch {
    console.warn(">>> [Cache] Failed to initialize Redis");
  }
}

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const localCache = new Map<string, CacheEntry<unknown>>();
const MAX_LOCAL_SIZE = 1000;

/**
 * Prunes expired and excessive entries from local memory.
 */
function pruneLocalCache() {
  const now = Date.now();
  for (const [key, entry] of localCache.entries()) {
    if (entry.expiry <= now) {
      localCache.delete(key);
    }
  }

  if (localCache.size > MAX_LOCAL_SIZE) {
    const keysToDelete = Array.from(localCache.keys()).slice(
      0,
      localCache.size - MAX_LOCAL_SIZE,
    );
    for (const k of keysToDelete) {
      localCache.delete(k);
    }
  }
}

/**
 * Wraps a fetcher with a two-tier caching strategy.
 */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  options?: { skipCache?: boolean },
): Promise<T> {
  const now = Date.now();

  if (!options?.skipCache) {
    // TIER 1: Local Memory (fastest, instance-specific)
    const local = localCache.get(key);
    if (local && local.expiry > now) {
      return local.data as T;
    }

    // TIER 2: Redis (persistent, shared across lambda instances)
    if (redis) {
      try {
        const cached = await redis.get(key);
        if (cached) {
          const data = JSON.parse(cached);
          // Back-fill local cache for faster subsequent hits in this instance
          localCache.set(key, { data, expiry: now + Math.min(ttlMs, 60000) });
          return data as T;
        }
      } catch {
        // Silently fail to Notion fetcher if Redis is down
      }
    }
  }

  // CACHE MISS: Execute the actual fetcher
  const data = await fetcher();

  // Populate local cache
  localCache.set(key, { data, expiry: now + ttlMs });

  // Populate Redis (if available)
  if (redis && !options?.skipCache) {
    try {
      // "PX" sets expiry in milliseconds
      await redis.set(key, JSON.stringify(data), "PX", ttlMs);
    } catch {
      // Silently fail
    }
  }

  // Periodic maintenance
  if (Math.random() < 0.05) {
    pruneLocalCache();
  }

  return data;
}

/**
 * Invalidates a specific key in both cache tiers.
 */
export async function invalidateCache(key: string) {
  localCache.delete(key);
  if (redis) {
    try {
      await redis.del(key);
    } catch {
      // Silently fail
    }
  }
}
