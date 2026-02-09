/**
 * Simple in-memory cache for server-side Notion queries to reduce API latency.
 * NOTE: In serverless environments, this cache is ephemeral and per-instance.
 */

interface CacheEntry<T> {
	data: T;
	expiry: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

// Maximum number of items to keep in cache to prevent OOM
const MAX_CACHE_SIZE = 1000;

function pruneCache() {
    const now = Date.now();
    for (const [key, entry] of cache.entries()) {
        if (entry.expiry <= now) {
            cache.delete(key);
        }
    }
    
    // Hard limit: if still too big after pruning, delete oldest (simple FIFO approximation)
    if (cache.size > MAX_CACHE_SIZE) {
        const keysToDelete = Array.from(cache.keys()).slice(0, cache.size - MAX_CACHE_SIZE);
        for (const k of keysToDelete) {
            cache.delete(k);
        }
    }
}

export async function withCache<T>(
    key: string, 
    ttlMs: number, 
    fetcher: () => Promise<T>,
    options?: { skipCache?: boolean }
): Promise<T> {
	const now = Date.now();
	const entry = cache.get(key);

	if (!options?.skipCache && entry && entry.expiry > now) {
		return entry.data as T;
	}

	const data = await fetcher();
	
    // Probabilistic pruning (5% chance) to avoid overhead on every write
    if (Math.random() < 0.05) {
        pruneCache();
    }

    cache.set(key, {
		data,
		expiry: now + ttlMs
	});

	return data;
}

export function invalidateCache(key: string) {
	cache.delete(key);
}
