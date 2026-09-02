import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/data/store", () => import("$lib/server/data/store-memory"));

import { __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, getTable, mutate } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { AppError } from "$lib/server/core/errors";
import { toKstIso } from "$lib/server/core/time";
import {
  applyToEvent,
  cancelEventApplication,
  checkIn,
  createEventWithActivity,
  getManagedSeminars,
  savePresenterAttendance,
} from "./events";

const future = () => toKstIso(new Date(Date.now() + 60 * 60 * 1000));
const past = () => toKstIso(new Date(Date.now() - 60 * 60 * 1000));

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["activities", "events", "members"]) await invalidateCache(`table_${t}`);
});

describe("event application (EVT-02)", () => {
  it("applies and cancels idempotently before the start time", async () => {
    const event = await createEventWithActivity({
      title: "세미나", startIso: future(), type: "세미나", status: "active",
    });
    await applyToEvent(event.id, "m1");
    await applyToEvent(event.id, "m1"); // no-op
    expect((await getTable("events"))[0].applicantIds).toEqual(["m1"]);

    await cancelEventApplication(event.id, "m1");
    expect((await getTable("events"))[0].applicantIds).toEqual([]);
  });

  it("refuses once the event has started or is not active", async () => {
    const started = await createEventWithActivity({
      title: "시작됨", startIso: past(), type: "세미나", status: "active",
    });
    await expect(applyToEvent(started.id, "m1")).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "EVENT_NOT_OPEN",
    );

    const draft = await createEventWithActivity({
      title: "초안", startIso: future(), type: "세미나", status: "draft",
    });
    await expect(applyToEvent(draft.id, "m1")).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "EVENT_NOT_OPEN",
    );
  });
});

describe("presenter attendance management (PRES-02 / BE-44)", () => {
  async function seminarWithApplicants() {
    const event = await createEventWithActivity({
      title: "세미나", startIso: future(), type: "세미나",
      status: "active", presenterIds: ["presenter"],
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
    expect(attendees.sort()).toEqual(["a1", "walkin"].sort());

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
    ).rejects.toSatisfy((e) => e instanceof AppError && e.code === "VALIDATION_FAILED");
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

  it("lists managed seminars with applicant names and current checks", async () => {
    const event = await seminarWithApplicants();
    await mutate("members", (rows) => [
      ...rows,
      {
        id: "a1", name: "김수학", department: "수리과학부", joinedAt: "2024-03-01",
        status: "regular" as const, statusChangedAt: toKstIso(new Date()),
        withdrawal: null, isAlumni: true, alumniRevoked: false, roles: [],
        isAdmin: false, publicContact: null, project: null,
        legacyMemberId: null, sourceRequestId: null,
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
