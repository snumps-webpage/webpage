import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Redis tier against an in-memory fake of ioredis. Every `import("./cache")`
 * after `vi.resetModules()` is a separate server instance with its own local
 * tier, all sharing the one fake Redis — the shape of a Vercel deployment.
 */

type Handler = (err: unknown) => void;

const fake = vi.hoisted(() => ({
  store: new Map<string, string>(),
  options: [] as Record<string, unknown>[],
  clients: [] as { emit(event: string, err: unknown): void }[],
  failWrites: false,
  version: "build-1",
}));

vi.mock("$env/dynamic/private", () => ({
  env: { REDIS_URL: "redis://fake:6379" },
}));
vi.mock("$app/environment", () => ({
  get version() {
    return fake.version;
  },
}));
vi.mock("ioredis", () => {
  class FakeRedis {
    private handlers = new Map<string, Handler>();
    constructor(_url: string, options: Record<string, unknown>) {
      fake.options.push(options);
      fake.clients.push(this);
    }
    on(event: string, handler: Handler) {
      this.handlers.set(event, handler);
      return this;
    }
    emit(event: string, err: unknown) {
      this.handlers.get(event)?.(err);
    }
    private write() {
      if (fake.failWrites) throw new Error("fake redis: writes are down");
    }
    async get(key: string) {
      return fake.store.get(key) ?? null;
    }
    async mget(...keys: string[]) {
      return keys.map((k) => fake.store.get(k) ?? null);
    }
    async set(key: string, value: string) {
      this.write();
      fake.store.set(key, value);
      return "OK";
    }
    async del(...keys: string[]) {
      this.write();
      for (const k of keys) fake.store.delete(k);
      return keys.length;
    }
    async incr(key: string) {
      this.write();
      const next = Number(fake.store.get(key) ?? 0) + 1;
      fake.store.set(key, String(next));
      return next;
    }
    async pexpire() {
      this.write();
      return 1;
    }
    multi() {
      const ops: (() => Promise<unknown>)[] = [];
      const chain = {
        incr: (k: string) => (ops.push(() => this.incr(k)), chain),
        pexpire: () => (ops.push(() => this.pexpire()), chain),
        del: (k: string) => (ops.push(() => this.del(k)), chain),
        exec: async () => {
          const out: [Error | null, unknown][] = [];
          for (const op of ops) {
            try {
              out.push([null, await op()]);
            } catch (e) {
              out.push([e as Error, null]);
            }
          }
          return out;
        },
      };
      return chain;
    }
  }
  return { default: FakeRedis };
});

type CacheModule = typeof import("./cache");
/** A fresh server instance: its own local tier, the shared fake Redis. */
async function instance(): Promise<CacheModule> {
  vi.resetModules();
  return import("./cache");
}

const TTL = 300_000;

beforeEach(() => {
  fake.store.clear();
  fake.options.length = 0;
  fake.clients.length = 0;
  fake.failWrites = false;
  fake.version = "build-1";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Redis tier", () => {
  it("serves another instance's read from Redis", async () => {
    const a = await instance();
    const b = await instance();
    await a.withCache("table_members", TTL, async () => ["row"]);

    let calls = 0;
    const got = await b.withCache("table_members", TTL, async () => {
      calls++;
      return ["fetched"];
    });
    expect(got).toEqual(["row"]);
    expect(calls).toBe(0);
  });

  // LB03-1: an instance whose read began before another instance's write
  // wrote the old rows back into Redis after that write deleted the key —
  // every instance then served them for the full 300s TTL.
  it("does not let an in-flight read re-plant a value another instance invalidated", async () => {
    const reader = await instance();
    const writer = await instance();

    let release!: (v: string[]) => void;
    const slow = reader.withCache(
      "table_members",
      TTL,
      () => new Promise<string[]>((r) => (release = r)),
    );
    await new Promise((r) => setTimeout(r, 0)); // reader is waiting on its fetcher
    await writer.invalidateCache("table_members");
    release(["from before the write"]);
    await slow;

    const third = await instance();
    let calls = 0;
    const got = await third.withCache("table_members", TTL, async () => {
      calls++;
      return ["after the write"];
    });
    expect(got).toEqual(["after the write"]);
    expect(calls).toBe(1);
  });

  // LB03-2: keys were the caller's bare `table_<name>`, and a Redis hit skips
  // the zod decode — after a deploy that changed a schema, rows shaped by the
  // old one were served as the new type, and two deployments sharing one
  // REDIS_URL read each other's values.
  it("keeps each build's values apart", async () => {
    fake.version = "build-1";
    const oldDeploy = await instance();
    await oldDeploy.withCache("table_members", TTL, async () => ["old shape"]);

    fake.version = "build-2";
    const newDeploy = await instance();
    let calls = 0;
    const got = await newDeploy.withCache("table_members", TTL, async () => {
      calls++;
      return ["new shape"];
    });
    expect(got).toEqual(["new shape"]);
    expect(calls).toBe(1);
  });

  it("does not read a value stored under the bare, unversioned key", async () => {
    fake.store.set("table_members", JSON.stringify(["pre-namespace"]));
    const c = await instance();
    const got = await c.withCache("table_members", TTL, async () => ["fresh"]);
    expect(got).toEqual(["fresh"]);
  });

  // LB03-3: no commandTimeout — ioredis waits forever on a connected Redis
  // that does not answer, and every local-tier miss (the zone guard first)
  // hangs behind it instead of falling back to the store.
  it("bounds every Redis command in time", async () => {
    await instance();
    const timeout = fake.options.at(-1)?.commandTimeout;
    expect(typeof timeout).toBe("number");
    expect(timeout as number).toBeGreaterThan(0);
    expect(timeout as number).toBeLessThanOrEqual(1000);
  });

  // LB03-4: a failed invalidation leaves old rows readable for 300s — a
  // consistency event — and was swallowed by an empty catch.
  it("logs an invalidation it could not carry out", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = await instance();
    fake.failWrites = true;

    await expect(c.invalidateCache("table_members")).resolves.toBeUndefined();

    expect(error).toHaveBeenCalled();
    expect(String(error.mock.calls[0])).toContain("table_members");
  });

  // LB03-4: ECONNREFUSED — Redis not running, the most common failure — was
  // filtered out of the error log, so the cache fell back to one tier with
  // no trace. Said once, not on every reconnect attempt.
  it("reports a refused connection once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await instance();
    const client = fake.clients.at(-1)!;
    const refused = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });

    client.emit("error", refused);
    client.emit("error", refused);

    expect(warn).toHaveBeenCalledTimes(1);
  });
});
