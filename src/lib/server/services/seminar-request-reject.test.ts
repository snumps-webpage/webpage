import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __putRawDoc, __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { AppError } from "$lib/server/core/errors";
import { rejectSeminar } from "./seminar-requests";

/**
 * rejectSeminar judged existence on the cached table (the same defect as
 * rejectStudy, audit LB31-5): a request submitted on another instance was
 * refused for up to the cache's lifetime, a row the cache had but the store
 * did not was "rejected" without a write while the caller mailed the
 * requester, and it returned the row as it was before the rejection.
 */

const request = {
  id: "r1",
  title: "세미나",
  description: "",
  prerequisites: "",
  duration: "60분",
  preferredTiming: "",
  presenterIds: ["m1"],
  attachment: "",
  posterKey: "",
  requesterId: "m1",
  status: "pending",
  closedAs: null,
  kind: "regular",
  createdAt: "2026-09-01T10:00:00+09:00",
};

const store = (rows: unknown[]) =>
  __putRawDoc("table", "seminar-requests", { schemaVersion: 1, rows });

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  await invalidateCache("table_seminar-requests");
});

describe("rejectSeminar", () => {
  it("rejects a request the cache has not seen yet, and returns it rejected", async () => {
    await getTable("seminar-requests"); // this instance caches "no requests"
    await store([request]);

    const rejected = await rejectSeminar("r1");

    expect(rejected.status).toBe("rejected");
    expect((await getTable("seminar-requests"))[0].status).toBe("rejected");
  });

  it("refuses a request the store no longer has", async () => {
    await store([request]);
    await getTable("seminar-requests"); // cached with the row
    await store([]);

    await expect(rejectSeminar("r1")).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "NOT_FOUND",
    );
  });
});
