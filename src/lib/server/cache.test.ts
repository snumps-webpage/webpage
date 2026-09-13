import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: {} })); // no REDIS_URL — local tier only

import { invalidateCache, withCache } from "./cache";

/**
 * The local tier is per-instance: a write clears the map of the instance that
 * wrote it and nothing else, so the local TTL is the upper bound on how long
 * another warm instance keeps serving the old rows. 15s is the default for
 * `table_` keys; tables that no in-app path writes can afford far longer, and
 * say so per call.
 */

const SECOND = 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-13T00:00:00.000Z"));
});

afterEach(async () => {
  await invalidateCache("table_members");
  await invalidateCache("table_legacy-members");
  vi.useRealTimers();
});

async function countedFetches(key: string, localTtlMs?: number) {
  let calls = 0;
  const read = () =>
    withCache(
      key,
      300_000,
      async () => ++calls,
      localTtlMs ? { localTtlMs } : undefined,
    );
  return { read, calls: () => calls };
}

describe("local tier TTL", () => {
  it("caps table_ keys at 15s by default", async () => {
    const { read, calls } = await countedFetches("table_members");

    await read();
    vi.advanceTimersByTime(14 * SECOND);
    await read();
    expect(calls()).toBe(1);

    vi.advanceTimersByTime(2 * SECOND);
    await read();
    expect(calls()).toBe(2);
  });

  it("honours a longer localTtlMs from the caller", async () => {
    const { read, calls } = await countedFetches(
      "table_legacy-members",
      120 * SECOND,
    );

    await read();
    vi.advanceTimersByTime(60 * SECOND);
    await read();
    expect(calls()).toBe(1); // still live — the 15s cap does not apply

    vi.advanceTimersByTime(61 * SECOND);
    await read();
    expect(calls()).toBe(2); // expired at 120s
  });

  it("still drops the entry on invalidation, whatever the TTL", async () => {
    const { read, calls } = await countedFetches(
      "table_legacy-members",
      120 * SECOND,
    );

    await read();
    await invalidateCache("table_legacy-members");
    await read();

    expect(calls()).toBe(2);
  });
});
