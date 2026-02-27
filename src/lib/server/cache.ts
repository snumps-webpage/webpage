/** --- PERFORMANCE LAYER --- 
 * In-memory cache for reducing Notion API latency.
 * [Performance: Ephemeral] In serverless environments (Vercel), this is per-instance 
 * and resets on cold starts. It is not a distributed cache (like Redis).
 */

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

/** [Constraint: OOM Prevention] Hard limit on total entries. */
const MAX_CACHE_SIZE = 1000;

function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiry <= now) {
      cache.delete(key);
    }
  }

  if (cache.size > MAX_CACHE_SIZE) {
    const keysToDelete = Array.from(cache.keys()).slice(
      0,
      cache.size - MAX_CACHE_SIZE,
    );
    for (const k of keysToDelete) {
      cache.delete(k);
    }
  }
}

/** 
 * [Performance: Probabilistic Pruning] 
 * Uses a 5% chance on write to trigger pruning, avoiding high-cost Map iterations on every request.
 */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  options?: { skipCache?: boolean },
): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key);

  if (!options?.skipCache && entry && entry.expiry > now) {
    return entry.data as T;
  }

  const data = await fetcher();

  if (Math.random() < 0.05) {
    pruneCache();
  }

  cache.set(key, {
    data,
    expiry: now + ttlMs,
  });

  return data;
}

export function invalidateCache(key: string) {
  cache.delete(key);
}
