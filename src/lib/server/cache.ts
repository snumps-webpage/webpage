import Redis from "ioredis";
import { env } from "$env/dynamic/private";
import { version } from "$app/environment";

/**
 * Hybrid cache system: Redis (shared/persistent) + In-memory (local/ephemeral).
 * Optimized for serverless environments to reduce Notion API load.
 */

const REDIS_URL = env.REDIS_URL;
let redis: Redis | null = null;

interface RedisError extends Error {
  code?: string;
}

// A Redis that is connected but does not answer must not hold a request any
// longer than the store read it stands in front of: past this, the command
// fails and the read falls back to the fetcher (audit LB03-3).
const REDIS_COMMAND_TIMEOUT_MS = 300;

let refusedReported = false;

if (REDIS_URL) {
  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
      lazyConnect: true, // Only connect on first command
    });
    redis.on("error", (err: RedisError) => {
      // Don't crash the app if Redis fails, just log it. A refused connection
      // (Redis not running) repeats on every reconnect attempt: say it once,
      // so the fall back to the local tier leaves a trace without a flood.
      if (err.code === "ECONNREFUSED") {
        if (refusedReported) return;
        refusedReported = true;
      }
      console.warn(">>> [Cache] Redis Error:", err);
    });
  } catch (e) {
    console.warn(">>> [Cache] Failed to initialize Redis:", e);
  }
}

// Every Redis key carries the build's version. A Redis hit skips the zod
// decode the fetcher does, so a value written by an older build could be a
// row of an older schema; and two deployments sharing one REDIS_URL (preview,
// production) must not read each other's values. With the version in the key
// a deploy starts from an empty key space (audit LB03-2).
const NAMESPACE = `cache:${version}:`;
const redisKey = (key: string) => NAMESPACE + key;
const redisGenKey = (key: string) => `${NAMESPACE}gen:${key}`;

// How long a generation counter outlives its last invalidation. It must
// outlive any value written under an older generation (the longest ttlMs plus
// a fetch), or an expired counter would read as 0 again and let such a value
// match; a day is far past every TTL in use.
const REDIS_GEN_TTL_MS = 86_400_000;

let writeFailureReported = false;

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const localCache = new Map<string, CacheEntry<unknown>>();
const MAX_LOCAL_SIZE = 1000;

// Invalidations seen per key on this instance. A read notes the count before
// its fetcher runs and stores nothing if it moved: an invalidation that lands
// while a read is in flight is not undone by that read (audit LB03-1). Keys
// are the data layer's tables and queues, so the map stays small.
const generations = new Map<string, number>();
const generationOf = (key: string) => generations.get(key) ?? 0;

// invalidateCache only clears the local map of the instance that wrote, so
// other warm instances would serve stale data for the full TTL. Capping the
// LOCAL tier for table_ keys bounds that staleness to 15s. Redis keeps the
// full TTL: every invalidation bumps the key's generation in Redis, and a
// value is served only while it carries the current one — so a value written
// by a read that began before the invalidation is never served after it.
//
// The cap is a default, not a law: a caller that knows its key cannot go stale
// — a table with no in-app write path — passes its own localTtlMs and opts out.
// Callers do that because the table list lives in the data layer, not here.
const LOCAL_TTL_CAPS: Array<{ prefix: string; capMs: number }> = [
  { prefix: "table_", capMs: 15_000 },
];

function localTtl(key: string, ttlMs: number, override?: number): number {
  if (override !== undefined) return Math.min(ttlMs, override);
  const cap = LOCAL_TTL_CAPS.find((c) => key.startsWith(c.prefix));
  return cap ? Math.min(ttlMs, cap.capMs) : ttlMs;
}

/**
 * Freezes a value and everything reachable from it. What the cache hands out
 * is shared by every request on this instance: a caller that sorted or edited
 * it in place would change what all later readers see (audit LB03-5). Frozen,
 * such a caller fails at once with a TypeError. Copy (`[...rows]`,
 * `structuredClone`) to change.
 */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

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

/** A Redis value: the data plus the key's generation when it was read. */
interface RedisEntry<T> {
  g: number;
  d: T;
}

/**
 * Wraps a fetcher with a two-tier caching strategy. The value returned is
 * deeply frozen (see deepFreeze).
 */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  options?: { skipCache?: boolean; localTtlMs?: number },
): Promise<T> {
  const now = Date.now();
  const generation = generationOf(key);
  // The Redis generation this read started under; null = unknown, so the
  // result is not written to Redis (it could not be checked against one).
  let redisGeneration: number | null = null;

  if (!options?.skipCache) {
    // TIER 1: Local Memory (fastest, instance-specific)
    const local = localCache.get(key);
    if (local && local.expiry > now) {
      return local.data as T;
    }

    // TIER 2: Redis (persistent, shared across lambda instances)
    if (redis) {
      try {
        const [cached, gen] = await redis.mget(redisKey(key), redisGenKey(key));
        redisGeneration = Number(gen ?? 0);
        const entry = cached ? (JSON.parse(cached) as RedisEntry<T>) : null;
        if (entry && entry.g === redisGeneration) {
          const data = deepFreeze(entry.d);
          // Back-fill local cache for faster subsequent hits in this instance
          if (generationOf(key) === generation) {
            localCache.set(key, {
              data,
              expiry:
                now +
                localTtl(key, Math.min(ttlMs, 60000), options?.localTtlMs),
            });
          }
          return data;
        }
      } catch {
        // Silently fall back to the fetcher if Redis is down
        redisGeneration = null;
      }
    }
  }

  // CACHE MISS: Execute the actual fetcher
  const data = deepFreeze(await fetcher());

  // Invalidated while the fetcher ran: what it read may predate the write, so
  // it goes to this caller only, not into either tier.
  if (generationOf(key) !== generation) return data;

  // Populate local cache
  localCache.set(key, {
    data,
    expiry: now + localTtl(key, ttlMs, options?.localTtlMs),
  });

  // Populate Redis (if available). An invalidation on another instance while
  // the fetcher ran has moved the generation on, so readers ignore this value.
  if (redis && !options?.skipCache && redisGeneration !== null) {
    try {
      const entry: RedisEntry<T> = { g: redisGeneration, d: data };
      // "PX" sets expiry in milliseconds
      await redis.set(redisKey(key), JSON.stringify(entry), "PX", ttlMs);
    } catch (e) {
      // A lost write only costs a later miss — say so once, not per request.
      if (!writeFailureReported) {
        writeFailureReported = true;
        console.warn(`>>> [Cache] Redis write failed (${key}):`, e);
      }
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
  generations.set(key, generationOf(key) + 1);
  localCache.delete(key);
  if (redis) {
    try {
      const results = await redis
        .multi()
        .incr(redisGenKey(key))
        .pexpire(redisGenKey(key), REDIS_GEN_TTL_MS)
        .del(redisKey(key))
        .exec();
      const failed = results?.find(([err]) => err);
      if (!results || failed) throw failed?.[0] ?? new Error("exec aborted");
    } catch (e) {
      // Not a performance event: other instances keep serving the old value
      // from Redis until its TTL runs out. Never thrown — the write it
      // follows has already committed — but never silent either.
      console.error(`>>> [Cache] Redis invalidation failed (${key}):`, e);
    }
  }
}
