import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __docs, __putRawDoc, __reset } from "$lib/server/data/store-memory";
import {
  _resetDataLayerForTests,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { expectTablesValid } from "$lib/server/data/expect-tables-valid";
import type { Seminar } from "$lib/server/data/schemas";
import { invalidateCache } from "$lib/server/cache";
import { AppError } from "$lib/server/core/errors";
import { toKstIso } from "$lib/server/core/time";
import { mergeAttendees } from "$lib/server/attendance";
import { getMemberVisibleEvents } from "./visibility";
import {
  applyToEvent,
  cancelEventApplication,
  checkIn,
  createEventWithActivity,
  getManagedSeminars,
  isOpenForApplication,
  savePresenterAttendance,
} from "./events";

const future = () => toKstIso(new Date(Date.now() + 60 * 60 * 1000));
const past = () => toKstIso(new Date(Date.now() - 60 * 60 * 1000));

const cancelledSeminar: Seminar = {
  id: "s1",
  title: "세미나",
  semester: "26-2",
  note: "",
  description: "",
  presenterIds: ["presenter"],
  externalPresenters: "",
  materials: [],
  photos: [],
  posterKey: "",
  preferredTiming: "",
  publicationStatus: "cancelled",
  kind: null,
  durationMinutes: null,
  prerequisites: "",
  announce: true,
  schedule: null,
  announcedAt: null,
  semesterPinned: false,
  activityId: null,
  sourceRequestId: null,
};

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["activities", "events", "members", "seminars"])
    await invalidateCache(`table_${t}`);
});

describe("event application (EVT-02)", () => {
  it("applies and cancels idempotently before the start time", async () => {
    const event = await createEventWithActivity({
      title: "세미나",
      startIso: future(),
      type: "세미나",
      status: "active",
    });
    await applyToEvent(event.id, "m1");
    await applyToEvent(event.id, "m1"); // no-op
    expect((await getTable("events"))[0].applicantIds).toEqual(["m1"]);

    await cancelEventApplication(event.id, "m1");
    expect((await getTable("events"))[0].applicantIds).toEqual([]);
  });

  it("refuses once the event has started or is not active", async () => {
    const started = await createEventWithActivity({
      title: "시작됨",
      startIso: past(),
      type: "세미나",
      status: "active",
    });
    await expect(applyToEvent(started.id, "m1")).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "EVENT_NOT_OPEN",
    );

    const draft = await createEventWithActivity({
      title: "초안",
      startIso: future(),
      type: "세미나",
      status: "draft",
    });
    await expect(applyToEvent(draft.id, "m1")).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "EVENT_NOT_OPEN",
    );
  });
});

// Audit LB20-3: the dashboard restated "open for application" to decide its
// apply button; the service's rule was private. One exported predicate now
// serves both, so the button cannot advertise an application the action refuses.
describe("isOpenForApplication", () => {
  it("is the rule applyToEvent enforces", async () => {
    const cases = [
      { startIso: future(), status: "active" as const },
      { startIso: past(), status: "active" as const },
      { startIso: future(), status: "draft" as const },
      { startIso: future(), status: "expired" as const },
    ];
    for (const c of cases) {
      const event = await createEventWithActivity({
        title: "세미나",
        type: "세미나",
        ...c,
      });
      const applied = await applyToEvent(event.id, "m1").then(
        () => true,
        () => false,
      );
      expect(isOpenForApplication(event)).toBe(applied);
    }
  });
});

describe("presenter attendance management (PRES-02 / BE-44)", () => {
  async function seminarWithApplicants() {
    const event = await createEventWithActivity({
      title: "세미나",
      startIso: future(),
      type: "세미나",
      status: "active",
      presenterIds: ["presenter"],
    });
    await applyToEvent(event.id, "a1");
    await applyToEvent(event.id, "a2");
    return (await getTable("events"))[0];
  }

  it("merges selections while PRESERVING walk-in check-in attendees", async () => {
    const event = await seminarWithApplicants();
    // walk-in: not an applicant, checked in directly and approved by admin
    await mutate("activities", (rows) =>
      rows.map((a) =>
        a.id === event.activityId ? { ...a, attendeeIds: ["walkin"] } : a,
      ),
    );

    await savePresenterAttendance(event.id, "presenter", ["a1"]);

    const attendees = (await getTable("activities"))[0].attendeeIds;
    expect([...attendees].sort()).toEqual(["a1", "walkin"].sort());

    // Unchecking a1 later still keeps the walk-in.
    await savePresenterAttendance(event.id, "presenter", []);
    expect((await getTable("activities"))[0].attendeeIds).toEqual(["walkin"]);
  });

  it("refuses non-presenters and selections outside the applicant pool", async () => {
    const event = await seminarWithApplicants();
    await expect(
      savePresenterAttendance(event.id, "not-presenter", ["a1"]),
    ).rejects.toSatisfy((e) => e instanceof AppError && e.code === "FORBIDDEN");
    await expect(
      savePresenterAttendance(event.id, "presenter", ["outsider"]),
    ).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "VALIDATION_FAILED",
    );
  });

  it("regression: a checked-in member survives the presenter's save (함정 A)", async () => {
    const event = await seminarWithApplicants();
    const stored = (await getTable("events"))[0];
    const rec = await checkIn(stored, "walkin-member");
    // admin approves the walk-in onto the activity
    const { approveAttendance } = await import("./events");
    await approveAttendance(event.id, rec.id);

    await savePresenterAttendance(event.id, "presenter", ["a1", "a2"]);
    const attendees = (await getTable("activities"))[0].attendeeIds;
    expect(attendees).toContain("walkin-member");
  });

  // W-4: the freshness net. A member reads their own history right after an
  // admin approves their check-in — and lands on an instance whose local cache
  // already holds the pre-write rows. What makes the read fresh is mutate()
  // invalidating `table_activities`, nothing else.
  it("shows an approved check-in to the very next read of the member's history", async () => {
    const { getActivitiesOf } = await import("$lib/server/data/repos");
    const event = await seminarWithApplicants();
    const stored = (await getTable("events"))[0];
    const rec = await checkIn(stored, "walkin-member");
    expect(await getActivitiesOf("walkin-member")).toEqual([]); // warms the cache

    const { approveAttendance } = await import("./events");
    await approveAttendance(event.id, rec.id);

    expect(await getActivitiesOf("walkin-member")).toHaveLength(1);
  });

  // Audit LB20-2: the save decided "visible, mine, in the pool" on this
  // instance's cached events and wrote the activity separately. A cancel (or
  // a withdrawn application) committed elsewhere inside the cache window was
  // not seen: attendance landed on a cancelled seminar and then blocked its
  // deletion. The flow now decides on the stored event under a lock.
  describe("decides on the stored event, not a cached copy", () => {
    /** Another instance's write: straight to the store, no cache invalidation. */
    const writeElsewhere = async (name: string, rows: unknown[]) =>
      __putRawDoc("table", name, { schemaVersion: 1, rows });

    it("refuses a seminar whose event was cancelled since the cache was filled", async () => {
      const event = await seminarWithApplicants();
      await getMemberVisibleEvents(); // this instance's cache holds it active
      await writeElsewhere("events", [{ ...event, status: "cancelled" }]);

      await expect(
        savePresenterAttendance(event.id, "presenter", ["a1"]),
      ).rejects.toSatisfy(
        (e) => e instanceof AppError && e.code === "NOT_FOUND",
      );
      expect((await __docs("table")).get("activities")?.doc).toMatchObject({
        rows: [{ attendeeIds: [] }],
      });
    });

    it("refuses a seminar that stopped being published since the cache was filled", async () => {
      const event = await seminarWithApplicants();
      await getMemberVisibleEvents();
      await writeElsewhere("seminars", [
        { ...cancelledSeminar, activityId: event.activityId },
      ]);

      await expect(
        savePresenterAttendance(event.id, "presenter", ["a1"]),
      ).rejects.toSatisfy(
        (e) => e instanceof AppError && e.code === "NOT_FOUND",
      );
    });

    it("refuses an applicant who withdrew since the cache was filled", async () => {
      const event = await seminarWithApplicants();
      await getMemberVisibleEvents();
      await writeElsewhere("events", [{ ...event, applicantIds: ["a2"] }]);

      await expect(
        savePresenterAttendance(event.id, "presenter", ["a1"]),
      ).rejects.toSatisfy(
        (e) => e instanceof AppError && e.code === "VALIDATION_FAILED",
      );
    });

    it("refuses a presenter removed since the cache was filled", async () => {
      const event = await seminarWithApplicants();
      await getMemberVisibleEvents();
      await writeElsewhere("events", [{ ...event, presenterIds: ["other"] }]);

      await expect(
        savePresenterAttendance(event.id, "presenter", ["a1"]),
      ).rejects.toSatisfy(
        (e) => e instanceof AppError && e.code === "FORBIDDEN",
      );
    });

    it("refuses an event that is not a seminar", async () => {
      const event = await createEventWithActivity({
        title: "회의",
        startIso: future(),
        type: "회의",
        status: "active",
        presenterIds: ["presenter"],
      });
      await expect(
        savePresenterAttendance(event.id, "presenter", []),
      ).rejects.toSatisfy(
        (e) => e instanceof AppError && e.code === "VALIDATION_FAILED",
      );
    });

    // The flow restates mergeAttendees in SQL (studies still use the TS one);
    // pinned against it here, order and duplicates included.
    it.each([
      [["walkin", "a2", "late"], ["a1"]],
      [
        ["walkin", "a2", "late"],
        ["a1", "a1", "a2"],
      ],
      [["a1", "a2"], []],
      [["x", "x", "a1"], ["a2"]],
      [[], ["a2", "a1"]],
    ])(
      "merges %j with %j as mergeAttendees does",
      async (current, selected) => {
        const event = await seminarWithApplicants(); // pool: a1, a2
        await mutate("activities", (rows) =>
          rows.map((a) => ({ ...a, attendeeIds: current })),
        );
        await savePresenterAttendance(event.id, "presenter", selected);
        expect((await getTable("activities"))[0].attendeeIds).toEqual(
          mergeAttendees(current, event.applicantIds, selected),
        );
        await expectTablesValid();
      },
    );
  });

  it("lists managed seminars with applicant names and current checks", async () => {
    const event = await seminarWithApplicants();
    await mutate("members", (rows) => [
      ...rows,
      {
        id: "a1",
        name: "김수학",
        department: "수리과학부",
        joinedAt: "2024-03-01",
        status: "regular" as const,
        statusChangedAt: toKstIso(new Date()),
        withdrawal: null,
        isAlumni: true,
        alumniRevoked: false,
        roles: [],
        isAdmin: false,
        publicContact: null,
        alumniRevocationReason: null,
        project: null,
        legacyMemberId: null,
        sourceRequestId: null,
      },
    ]);
    await savePresenterAttendance(event.id, "presenter", ["a1"]);

    const managed = await getManagedSeminars("presenter");
    expect(managed).toHaveLength(1);
    expect(managed[0].attendPath).toMatch(/^\/events\/[a-z0-9]+\/[a-z0-9]+$/);
    const a1 = managed[0].applicants.find((a) => a.id === "a1");
    expect(a1).toMatchObject({ name: "김수학", checked: true });
    expect(await getManagedSeminars("someone-else")).toEqual([]);
  });
});
