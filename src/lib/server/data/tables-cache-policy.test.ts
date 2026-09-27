import { beforeEach, describe, expect, it, vi } from "vitest";

type CacheCall = { key: string; ttlMs: number; localTtlMs?: number };
const calls = vi.hoisted(() => [] as CacheCall[]);

vi.mock("$lib/server/cache", () => ({
  withCache: async (
    key: string,
    ttlMs: number,
    fetcher: () => Promise<unknown>,
    options?: { localTtlMs?: number },
  ) => {
    calls.push({ key, ttlMs, localTtlMs: options?.localTtlMs });
    return fetcher();
  },
  invalidateCache: async () => {},
  deepFreeze: <T>(value: T) => value,
}));
vi.mock("./store", () => import("./store-memory"));

import { getTable } from "./tables";

/**
 * The local cache tier bounds how long ANOTHER instance serves rows written
 * here. For tables the app never writes — the legacy archive, frozen by
 * contract in schemas/index.ts — that bound buys nothing, so they carry a
 * longer local TTL. Tables behind admin or member actions keep the short one.
 */

beforeEach(() => {
  calls.length = 0;
});

const lastCall = () => calls[calls.length - 1];

describe("per-table local cache TTL", () => {
  it("gives the frozen legacy tables a long local TTL", async () => {
    await getTable("legacy-members");
    expect(lastCall().localTtlMs).toBe(120_000);

    await getTable("legacy-private-info");
    expect(lastCall().localTtlMs).toBe(120_000);
  });

  it("leaves tables with in-app writers on the default cap", async () => {
    for (const name of [
      "members",
      "activities",
      "applications",
      "seminars",
    ] as const) {
      await getTable(name);
      expect(lastCall(), name).toMatchObject({ localTtlMs: undefined });
    }
  });

  it("keeps the shared TTL unchanged", async () => {
    await getTable("legacy-members");
    expect(lastCall().ttlMs).toBe(300_000);
  });
});
