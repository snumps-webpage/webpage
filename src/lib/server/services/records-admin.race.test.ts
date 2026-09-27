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
 * deleteSeminar decides "hidden or not" from a read; a publish or cancel that
 * commits between that read and the delete's own write used to be ignored.
 * Here the read is made stale on purpose — the deterministic form of the race.
 */
const stale = vi.hoisted(() => ({ seminars: null as unknown[] | null }));
vi.mock("$lib/server/data/tables", async (importOriginal) => {
  const real = await importOriginal<typeof import("$lib/server/data/tables")>();
  return {
    ...real,
    getTable: (async (name: string) => {
      if (name === "seminars" && stale.seminars) {
        const rows = stale.seminars;
        stale.seminars = null;
        return rows;
      }
      return real.getTable(name as never);
    }) as typeof real.getTable,
  };
});

import { __reset } from "$lib/server/data/store-memory";
import { __reset as __resetStorage } from "$lib/server/data/storage-memory";
import {
  _resetDataLayerForTests,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { AppError } from "$lib/server/core/errors";
import { nowKstIso } from "$lib/server/core/time";
import { createActivity, createSeminar, deleteSeminar } from "./records-admin";
import { hiddenActivityIds } from "./visibility";

beforeEach(async () => {
  __reset();
  __resetStorage();
  stale.seminars = null;
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

const isWriteConflict = (e: unknown) =>
  e instanceof AppError && e.code === "WRITE_CONFLICT";

describe("deleteSeminar re-checks the state it decided on", () => {
  it("cancel ∥ delete: refuses when the seminar was cancelled after the read", async () => {
    const a = await createActivity({
      title: "세미나",
      date: { start: nowKstIso(), end: null },
      type: "세미나",
    });
    const s = await newSeminar();
    await patch(s.id, { publicationStatus: "published", activityId: a.id });
    stale.seminars = await getTable("seminars"); // delete reads "published"
    await patch(s.id, { publicationStatus: "cancelled" }); // cancel commits

    await expect(deleteSeminar(s.id)).rejects.toSatisfy(isWriteConflict);
    expect(await getTable("seminars")).toHaveLength(1);
    expect(await hiddenActivityIds()).toContain(a.id);
  });

  it("publish ∥ delete: refuses when the seminar was published after the read", async () => {
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
        createdAt: nowKstIso(),
      },
    ]);
    stale.seminars = await getTable("seminars"); // delete reads "scheduled"
    await patch(s.id, { publicationStatus: "published" }); // publish's CAS

    await expect(deleteSeminar(s.id)).rejects.toSatisfy(isWriteConflict);
    expect(await getTable("seminars")).toHaveLength(1);
    expect(await getTable("seminar-requests")).toHaveLength(1);
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
        createdAt: nowKstIso(),
      },
    ]);

    await deleteSeminar(s1.id);

    const [request] = await getTable("seminar-requests");
    expect(request.closedAs).toBeNull(); // the published seminar still stands on it
  });
});
