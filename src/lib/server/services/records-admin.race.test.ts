import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
vi.mock(
  "$lib/server/data/storage",
  () => import("$lib/server/data/storage-memory"),
);

/**
 * Races found by the adversarial HTTP run (publish ∥ delete, cancel ∥ delete).
 * deleteSeminar used to decide "hidden or not" from a read and write later, so
 * a publish or cancel committing in between was ignored. It now runs as one
 * locked transaction (flow_delete_seminar): whatever committed before the
 * lock is what the delete sees. The cases below commit the racing write just
 * before the delete — the only interleaving left — and check the delete
 * followed the state it found, not the one an earlier page load showed.
 */
import { __reset } from "$lib/server/data/store-memory";
import { __reset as __resetStorage } from "$lib/server/data/storage-memory";
import {
  _resetDataLayerForTests,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { nowKstIso } from "$lib/server/core/time";
import { createActivity, createSeminar, deleteSeminar } from "./records-admin";
import { hiddenActivityIds } from "./visibility";

beforeEach(async () => {
  await __reset();
  __resetStorage();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of [
    "activities",
    "events",
    "seminars",
    "seminar-requests",
    "gallery-dinner",
  ]) {
    await invalidateCache(`table_${t}`);
  }
});

const newSeminar = async () =>
  createSeminar({
    title: "세미나",
    semester: "26-2",
    note: "",
    presenterIds: [],
    externalPresenters: "",
  });

type Patch = Partial<{
  publicationStatus: "unscheduled" | "scheduled" | "published" | "cancelled";
  activityId: string | null;
  sourceRequestId: string | null;
}>;
const patch = (id: string, p: Patch) =>
  mutate("seminars", (rows) =>
    rows.map((r) => (r.id === id ? { ...r, ...p } : r)),
  );

describe("deleteSeminar acts on the state it locked", () => {
  it("cancel then delete: retires the activity the cancel hid", async () => {
    const a = await createActivity({
      title: "세미나",
      date: { start: nowKstIso(), end: null },
      type: "세미나",
    });
    const s = await newSeminar();
    await patch(s.id, { publicationStatus: "published", activityId: a.id });
    await patch(s.id, { publicationStatus: "cancelled" }); // the admin saw "published"

    await deleteSeminar(s.id);

    expect(await getTable("seminars")).toHaveLength(0);
    // no orphan: the hidden activity went with its seminar, nothing resurfaces
    expect((await getTable("activities")).map((r) => r.id)).not.toContain(a.id);
    expect(await hiddenActivityIds()).not.toContain(a.id);
  });

  it("publish then delete: leaves the request open, as for any published seminar", async () => {
    const s = await newSeminar();
    await patch(s.id, {
      publicationStatus: "scheduled",
      sourceRequestId: "req1",
    });
    await mutate("seminar-requests", () => [
      {
        id: "req1",
        title: "세미나",
        description: "",
        prerequisites: "",
        duration: "",
        preferredTiming: "",
        presenterIds: [],
        attachment: "",
        posterKey: "",
        requesterId: "p1",
        status: "approved" as const,
        closedAs: null,
        kind: null,
        createdAt: nowKstIso(),
      },
    ]);
    await patch(s.id, { publicationStatus: "published" }); // the admin saw "scheduled"

    await deleteSeminar(s.id);

    expect(await getTable("seminars")).toHaveLength(0);
    const [request] = await getTable("seminar-requests");
    expect(request.closedAs).toBeNull(); // not marked 취소됨: it was published
  });

  it("keeps a source request another seminar still points at", async () => {
    const s1 = await newSeminar();
    const s2 = await newSeminar();
    await patch(s1.id, {
      publicationStatus: "cancelled",
      sourceRequestId: "req1",
    });
    await patch(s2.id, {
      publicationStatus: "published",
      sourceRequestId: "req1",
    });
    await mutate("seminar-requests", () => [
      {
        id: "req1",
        title: "세미나",
        description: "",
        prerequisites: "",
        duration: "",
        preferredTiming: "",
        presenterIds: [],
        attachment: "",
        posterKey: "",
        requesterId: "p1",
        status: "approved" as const,
        closedAs: null,
        kind: null,
        createdAt: nowKstIso(),
      },
    ]);

    await deleteSeminar(s1.id);

    const [request] = await getTable("seminar-requests");
    expect(request.closedAs).toBeNull(); // the published seminar still stands on it
  });
});
