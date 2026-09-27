import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./store", () => import("./store-memory"));

import {
  __putRawDoc,
  __reset,
  __setAlwaysConflict,
  __setReadsFail,
  __setWritesFail,
} from "./store-memory";
import {
  _resetDataLayerForTests,
  getQueue,
  getTable,
  listPendingQueues,
  mutate,
  mutateQueue,
} from "./tables";
import { invalidateCache } from "$lib/server/cache";
import { AppError } from "$lib/server/core/errors";
import { newId } from "$lib/server/core/id";
import type { GalleryDinner } from "./schemas";

const row = (): GalleryDinner => ({
  id: newId(),
  year: "2026",
  photos: [],
  activityId: null,
});

const record = (eventId: string) => ({
  id: newId(),
  memberId: newId(),
  eventId,
  startTime: "2026-08-28T10:00:00+09:00",
  endTime: null,
  status: "pending" as const,
});

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  await invalidateCache("table_gallery-dinner");
});

describe("mutate — conditional writes", () => {
  it("bootstraps a missing table and persists rows", async () => {
    const a = row();
    await mutate("gallery-dinner", (rows) => [...rows, a]);
    expect(await getTable("gallery-dinner")).toEqual([a]);
  });

  it("keeps both changes under concurrent mutation", async () => {
    const [a, b] = [row(), row()];
    await Promise.all([
      mutate("gallery-dinner", (rows) => [...rows, a]),
      mutate("gallery-dinner", (rows) => [...rows, b]),
    ]);
    const ids = (await getTable("gallery-dinner")).map((r) => r.id).sort();
    expect(ids).toEqual([a.id, b.id].sort());
  });

  it("skips the write on a no-op mutation", async () => {
    const a = row();
    await mutate("gallery-dinner", (rows) => [...rows, a]);
    // identical result → no conditional PUT → succeeds even in conflict mode
    __setAlwaysConflict(true);
    await expect(mutate("gallery-dinner", (rows) => rows)).resolves.toEqual([
      a,
    ]);
  });

  it("throws WRITE_CONFLICT after exhausting retries", async () => {
    __setAlwaysConflict(true);
    await expect(
      mutate("gallery-dinner", (rows) => [...rows, row()]),
    ).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "WRITE_CONFLICT",
    );
  });

  it("rejects an unknown schemaVersion instead of silently proceeding", async () => {
    __putRawDoc("table", "gallery-dinner", { schemaVersion: 2, rows: [] });
    await invalidateCache("table_gallery-dinner");
    await expect(getTable("gallery-dinner")).rejects.toThrow(
      /envelope validation/,
    );
  });

  it("rejects rows that fail the table schema", async () => {
    __putRawDoc("table", "gallery-dinner", {
      schemaVersion: 1,
      rows: [{ id: "x" }],
    });
    await invalidateCache("table_gallery-dinner");
    await expect(getTable("gallery-dinner")).rejects.toThrow(
      /envelope validation/,
    );
  });
});

describe("mutate — what it stores is what the schema says", () => {
  /**
   * The write gate parses the rows, but the write and the instance's own
   * cache used to take the caller's objects as given — so a field the caller
   * left to its zod default read back as `undefined` on this instance, while
   * every other instance (reading from the store) saw the default.
   */
  it("reads back schema defaults right after its own write", async () => {
    await invalidateCache("table_seminar-requests");
    await mutate("seminar-requests", () => [
      {
        id: "r1",
        title: "세미나",
        description: "",
        prerequisites: "",
        duration: "",
        presenterIds: [],
        attachment: "",
        requesterId: "m1",
        status: "pending",
        createdAt: "2026-09-01T00:00:00+09:00",
      } as never, // omits the defaulted fields, as an older writer would
    ]);

    const [stored] = await getTable("seminar-requests");
    expect(stored.closedAs).toBeNull();
    expect(stored.posterKey).toBe("");
  });
});

describe("what reads and writes hand back", () => {
  // LA41-1: mutate() returned the very array it kept as this instance's
  // version memory, which has no TTL — a caller editing that result changed
  // what every later read on the instance got, until someone wrote the table.
  it("cannot be edited into this instance's cache", async () => {
    const written = await mutate("gallery-dinner", (rows) => [...rows, row()]);

    expect(() => {
      written[0].year = "1999";
    }).toThrow(TypeError);

    await invalidateCache("table_gallery-dinner"); // version memory stays
    expect((await getTable("gallery-dinner"))[0].year).toBe("2026");
  });

  it("gives getTable rows that cannot be edited either", async () => {
    await mutate("gallery-dinner", (rows) => [...rows, row()]);
    await invalidateCache("table_gallery-dinner");
    const rows = await getTable("gallery-dinner");
    expect(() => {
      rows[0].photos.push("x.jpg");
    }).toThrow(TypeError);
  });
});

describe("attendance queue — per-event objects", () => {
  it("survives a 20-writer check-in burst with zero losses", async () => {
    // Larger backoff base than the other tests: under full-suite CPU load the
    // 1ms base can exhaust the 10 retries before the writers serialize.
    _resetDataLayerForTests({ backoffBaseMs: 8 });
    const eventId = newId();
    const records = Array.from({ length: 20 }, () => record(eventId));
    await Promise.all(
      records.map((r) => mutateQueue(eventId, (rows) => [...rows, r])),
    );
    const stored = await getQueue(eventId);
    expect(stored.map((r) => r.id).sort()).toEqual(
      records.map((r) => r.id).sort(),
    );
  }, 20_000);

  it("isolates queues per event and lists only pending ones", async () => {
    const [e1, e2, e3] = [newId(), newId(), newId()];
    await mutateQueue(e1, (rows) => [...rows, record(e1)]);
    await mutateQueue(e2, (rows) => [
      ...rows,
      { ...record(e2), status: "approved" as const },
    ]);
    await mutateQueue(e3, (rows) => [...rows, record(e3)]);

    const pending = await listPendingQueues();
    expect(pending.map((q) => q.eventId).sort()).toEqual([e1, e3].sort());
    expect(
      pending.every((q) => q.rows.every((r) => r.status === "pending")),
    ).toBe(true);
  });
});

describe("an unreachable store is a 503 on every path", () => {
  afterEach(() => {
    __setReadsFail(false);
    __setWritesFail(false);
  });

  const unavailable = (e: unknown) =>
    e instanceof AppError && e.code === "SERVICE_UNAVAILABLE";

  // LA41-3: only getTable/getQueue classified a dead store as
  // SERVICE_UNAVAILABLE; mutate's read and write and the queue listing threw
  // a bare Error — the same outage was a 503 on GET and a 500 on POST.
  it("mutate: a failed read is SERVICE_UNAVAILABLE", async () => {
    __setReadsFail(true);
    await expect(
      mutate("gallery-dinner", (rows) => [...rows, row()]),
    ).rejects.toSatisfy(unavailable);
  });

  it("mutate: a failed write is SERVICE_UNAVAILABLE", async () => {
    __setWritesFail(true);
    await expect(
      mutate("gallery-dinner", (rows) => [...rows, row()]),
    ).rejects.toSatisfy(unavailable);
  });

  it("listPendingQueues: a failed listing is SERVICE_UNAVAILABLE", async () => {
    __setReadsFail(true);
    await expect(listPendingQueues()).rejects.toSatisfy(unavailable);
  });

  it("an invalid stored document stays a plain error (not availability)", async () => {
    __putRawDoc("table", "gallery-dinner", { schemaVersion: 9, rows: [] });
    await expect(mutate("gallery-dinner", (rows) => rows)).rejects.toThrow(
      /envelope validation/,
    );
  });
});
