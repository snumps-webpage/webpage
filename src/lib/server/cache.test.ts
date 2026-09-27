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

describe("invalidation against an in-flight read", () => {
  // LB03-1: a read that started before a write finished after it and planted
  // the rows it had read — the invalidation was undone, and the writer's own
  // next read (same instance, even without Redis) got the old rows for 15s.
  it("does not let a read that began before it re-plant the old value", async () => {
    let release!: (v: string) => void;
    const slow = withCache(
      "table_members",
      300_000,
      () => new Promise<string>((r) => (release = r)),
    );
    await Promise.resolve(); // the read is now waiting on its fetcher

    await invalidateCache("table_members"); // a write committed meanwhile
    release("rows from before the write");
    expect(await slow).toBe("rows from before the write"); // its caller still gets them

    let calls = 0;
    const next = await withCache("table_members", 300_000, async () => {
      calls++;
      return "rows after the write";
    });
    expect(next).toBe("rows after the write");
    expect(calls).toBe(1);
  });
});

describe("what the cache hands out", () => {
  // LB03-5: the local tier stored and returned the caller's object itself, so
  // a caller that sorted or edited it in place changed what every later
  // request on this instance read. The value is frozen, deeply: a mutation is
  // an immediate TypeError instead of silent shared state.
  it("is frozen all the way down", async () => {
    const rows = await withCache("table_members", 300_000, async () => [
      { id: "m1", tags: ["a"] },
    ]);

    expect(() => rows.push({ id: "m2", tags: [] })).toThrow(TypeError);
    expect(() => {
      rows[0].id = "changed";
    }).toThrow(TypeError);
    expect(() => rows[0].tags.push("b")).toThrow(TypeError);

    const again = await withCache("table_members", 300_000, async () => []);
    expect(again).toEqual([{ id: "m1", tags: ["a"] }]);
  });
});
