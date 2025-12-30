/**
 * Simple in-memory cache for server-side Notion queries to reduce API latency.
 */

interface CacheEntry<T> {
	data: T;
	expiry: number;
}

const cache = new Map<string, CacheEntry<any>>();

export async function withCache<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
	const now = Date.now();
	const entry = cache.get(key);

	if (entry && entry.expiry > now) {
		return entry.data;
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
