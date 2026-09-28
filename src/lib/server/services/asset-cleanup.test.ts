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
import {
  _resetDataLayerForTests,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { forgetUnreferencedAssets } from "./asset-cleanup";
import { resolveAssetAccess } from "./asset-access";

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

/**
 * LB17-1: the access check and the delete guard each kept their own list of
 * "which record fields hold asset keys". A field on one list and not the other
 * is served but deleted as unreferenced (or kept but 404). Every field a
 * record can hold a file in must be both servable and kept.
 */
describe("access and cleanup agree on which records hold files", () => {
  it("every stored file field is served and kept", async () => {
    const keys = {
      poster: "seminars/posters/s1/a-poster.png",
      material: "seminars/s1/b-slides.pdf",
      photo: "seminars/s1/c-photo.jpg",
      requestPoster: "seminars/posters/r1/d-poster.png",
      study: "studies/st1/e-photo.jpg",
      dinner: "gallery/g1/f-photo.jpg",
    };
    await mutate("seminars", () => [
      {
        id: "s1",
        title: "세미나",
        semester: "26-2",
        note: "",
        description: "",
        presenterIds: [],
        externalPresenters: "",
        publicationStatus: "published",
        schedule: null,
        announcedAt: null,
        kind: null,
        durationMinutes: null,
        prerequisites: "",
        announce: true,
        semesterPinned: false,
        materials: [keys.material],
        photos: [keys.photo],
        posterKey: keys.poster,
        preferredTiming: "",
        activityId: null,
        sourceRequestId: null,
      },
    ]);
    await mutate("seminar-requests", () => [
      {
        id: "r1",
        title: "신청",
        description: "",
        prerequisites: "",
        duration: "60",
        preferredTiming: "",
        presenterIds: [],
        attachment: "",
        posterKey: keys.requestPoster,
        requesterId: "m1",
        status: "pending",
        closedAs: null,
        kind: null,
        createdAt: "2026-09-01T00:00:00+09:00",
      },
    ]);
    await mutate("studies", () => [
      {
        id: "st1",
        title: "스터디",
        semester: "26-2",
        textbook: "",
        description: "",
        note: "",
        status: "finished",
        organizerIds: ["m1"],
        participantIds: ["m1"],
        pendingParticipantIds: [],
        pendingTransfer: null,
        schedule: [],
        transferHistory: [],
        photos: [keys.study],
        sourceRequestId: null,
      },
    ]);
    await mutate("gallery-dinner", () => [dinner([keys.dinner])]);

    for (const key of Object.values(keys)) {
      expect(await resolveAssetAccess(key), key).not.toBe("none");
      await forgetUnreferencedAssets([key]);
    }
    expect(removed).toEqual([]);
  });
});
