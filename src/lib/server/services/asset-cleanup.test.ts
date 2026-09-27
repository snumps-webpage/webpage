import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
const removed = vi.hoisted(() => [] as string[][]);
vi.mock("$lib/server/data/storage", () => ({
  removeAssets: async (paths: string[]) => {
    removed.push(paths);
  },
}));

import { __putRawDoc, __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { forgetUnreferencedAssets } from "./asset-cleanup";

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["seminars", "seminar-requests", "studies", "gallery-dinner"])
    await invalidateCache(`table_${t}`);
  removed.length = 0;
});

const dinner = (photos: string[]) => ({
  id: "g1",
  year: "2026",
  photos,
  activityId: null,
});

describe("forgetUnreferencedAssets", () => {
  it("deletes a key no record points at", async () => {
    await forgetUnreferencedAssets(["gallery/a.jpg", null, ""]);
    expect(removed).toEqual([["gallery/a.jpg"]]);
  });

  it("keeps a key a record still points at", async () => {
    await __putRawDoc("table", "gallery-dinner", {
      schemaVersion: 1,
      rows: [dinner(["gallery/a.jpg"])],
    });
    await forgetUnreferencedAssets(["gallery/a.jpg"]);
    expect(removed).toEqual([]);
  });

  // LB18-1: "is it still referenced?" was answered from the cache — up to 15s
  // (300s if a Redis invalidation is lost) behind another instance's write —
  // and the delete that follows cannot be undone. A reference written where
  // this instance's cache cannot see it must still keep the file.
  it("sees a reference this instance's cache has not caught up with", async () => {
    expect(await getTable("gallery-dinner")).toEqual([]); // cached: no rows
    await __putRawDoc("table", "gallery-dinner", {
      schemaVersion: 1,
      rows: [dinner(["gallery/a.jpg"])],
    }); // another instance's write — nothing invalidates this cache
    expect(await getTable("gallery-dinner")).toEqual([]); // still stale

    await forgetUnreferencedAssets(["gallery/a.jpg"]);

    expect(removed).toEqual([]);
  });
});
