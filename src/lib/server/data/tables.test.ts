import { beforeEach, describe, expect, it, vi } from "vitest";
import { gzipSync } from "node:zlib";

vi.mock("./s3", () => import("./s3-memory"));

import { __putRaw, __reset, __setAlwaysConflict } from "./s3-memory";
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
    await expect(mutate("gallery-dinner", (rows) => rows)).resolves.toEqual([a]);
  });

  it("throws WRITE_CONFLICT after exhausting retries", async () => {
    __setAlwaysConflict(true);
    await expect(
      mutate("gallery-dinner", (rows) => [...rows, row()]),
    ).rejects.toSatisfy((e) => e instanceof AppError && e.code === "WRITE_CONFLICT");
  });

  it("rejects an unknown schemaVersion instead of silently proceeding", async () => {
    __putRaw(
      "tables/gallery-dinner.json.gz",
      gzipSync(JSON.stringify({ schemaVersion: 2, rows: [] })),
    );
    await invalidateCache("table_gallery-dinner");
    await expect(getTable("gallery-dinner")).rejects.toThrow(/envelope validation/);
  });

  it("rejects rows that fail the table schema", async () => {
    __putRaw(
      "tables/gallery-dinner.json.gz",
      gzipSync(JSON.stringify({ schemaVersion: 1, rows: [{ id: "x" }] })),
    );
    await invalidateCache("table_gallery-dinner");
    await expect(getTable("gallery-dinner")).rejects.toThrow(/envelope validation/);
  });
});

describe("attendance queue — per-event objects", () => {
  it("survives a 20-writer check-in burst with zero losses", async () => {
    const eventId = newId();
    const records = Array.from({ length: 20 }, () => record(eventId));
    await Promise.all(
      records.map((r) => mutateQueue(eventId, (rows) => [...rows, r])),
    );
    const stored = await getQueue(eventId);
    expect(stored.map((r) => r.id).sort()).toEqual(records.map((r) => r.id).sort());
  }, 20_000);

  it("isolates queues per event and lists only pending ones", async () => {
    const [e1, e2, e3] = [newId(), newId(), newId()];
    await mutateQueue(e1, (rows) => [...rows, record(e1)]);
    await mutateQueue(e2, (rows) => [...rows, { ...record(e2), status: "approved" as const }]);
    await mutateQueue(e3, (rows) => [...rows, record(e3)]);

    const pending = await listPendingQueues();
    expect(pending.map((q) => q.eventId).sort()).toEqual([e1, e3].sort());
    expect(pending.every((q) => q.rows.every((r) => r.status === "pending"))).toBe(true);
  });
});
