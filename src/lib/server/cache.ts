/**
 * Simple in-memory cache for server-side Notion queries to reduce API latency.
 * NOTE: In serverless environments, this cache is ephemeral and per-instance.
 */

interface CacheEntry<T> {
	data: T;
	expiry: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

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
	cache.set(key, {
		data,
		expiry: now + ttlMs
	});

	return data;
}

export function invalidateCache(key: string) {
	cache.delete(key);
}
