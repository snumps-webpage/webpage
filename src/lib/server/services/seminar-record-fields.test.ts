import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
vi.mock("$lib/server/mail/dispatch", () => ({
  emitMailEvent: async () => true,
}));

import { __reset } from "$lib/server/data/store-memory";
import { expectTablesValid } from "$lib/server/data/expect-tables-valid";
import {
  _resetDataLayerForTests,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { AppError } from "$lib/server/core/errors";
import { toKstIso } from "$lib/server/core/time";
import type { SeminarRequest } from "$lib/server/data/schemas";
import { approveSeminar, submitSeminarRequest } from "./seminar-requests";
import { cancelSeminar, publishSeminar, scheduleSeminar } from "./seminars";
import { createSeminar, deleteSeminar, updateSeminar } from "./records-admin";
import { approveAttendance, checkIn } from "./events";

const HOUR = 60 * 60 * 1000;
const at = (h: number) => toKstIso(new Date(Date.now() + h * HOUR));
const codeOf = (e: unknown) => (e instanceof AppError ? e.code : String(e));

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["seminars", "seminar-requests", "activities", "events"])
    await invalidateCache(`table_${t}`);
});
afterEach(expectTablesValid);

async function approved(over: { kind?: SeminarRequest["kind"] } = {}) {
  const req = await submitSeminarRequest({
    title: "세미나",
    description: "설명",
    prerequisites: "군론 기초",
    duration: "90분 정도",
    preferredTiming: "",
    presenterIds: ["m-a"],
    attachment: "",
    requesterId: "m-a",
    ...over,
  });
  await approveSeminar(req.id);
  return (await getTable("seminars"))[0];
}

const seminar = async () => (await getTable("seminars"))[0];

/**
 * #7 / #12 — kind (정기/비정기), duration in minutes and prerequisites are the
 * seminar's own record. The editor posted them and the actions dropped them;
 * the screens borrowed them from the request or made them up.
 */
describe("approval copies the request's kind and prerequisites (#7)", () => {
  it("copies kind and prerequisites; duration text is not parsed into minutes", async () => {
    const s = await approved({ kind: "irregular" });

    expect(s).toMatchObject({
      kind: "irregular",
      prerequisites: "군론 기초",
      durationMinutes: null,
      announce: true,
    });
  });

  it("keeps an unknown kind unknown", async () => {
    const s = await approved({ kind: null });
    expect(s.kind).toBeNull();
  });
});

describe("the record editor's fields are stored and editable (#7)", () => {
  it("createSeminar stores kind, duration and prerequisites", async () => {
    const s = await createSeminar({
      title: "직접 기록",
      semester: "26-2",
      note: "",
      presenterIds: [],
      externalPresenters: "",
      kind: "regular",
      durationMinutes: 120,
      prerequisites: "위상수학",
    });

    expect(await seminar()).toMatchObject({
      id: s.id,
      kind: "regular",
      durationMinutes: 120,
      prerequisites: "위상수학",
    });
  });

  it("updateSeminar changes them, and can clear kind and duration", async () => {
    const s = await approved({ kind: "irregular" });

    await updateSeminar(s.id, {
      kind: "regular",
      durationMinutes: 45,
      prerequisites: "없음",
    });
    expect(await seminar()).toMatchObject({
      kind: "regular",
      durationMinutes: 45,
      prerequisites: "없음",
    });

    await updateSeminar(s.id, { kind: null, durationMinutes: null });
    expect(await seminar()).toMatchObject({
      kind: null,
      durationMinutes: null,
      prerequisites: "없음",
    });
  });

  it("refuses a duration the stored schema rejects, writing nothing", async () => {
    const s = await approved();

    await expect(updateSeminar(s.id, { durationMinutes: 5 })).rejects.toSatisfy(
      (e) => codeOf(e) === "VALIDATION_FAILED",
    );
    expect((await seminar()).durationMinutes).toBeNull();
  });
});

/**
 * #14 (audit LB28-1 follow-up) — publication credits the presenters on the
 * seminar's activity. Changing presenters A→B moved the event's presenterIds
 * but left A's credit and gave B none, and A's stale credit then blocked
 * deleting the seminar once cancelled (flow_delete_seminar reads any credit
 * outside the presenters as attendance evidence).
 */
describe("changing a published seminar's presenters moves the presenter credit (#14)", () => {
  async function published() {
    const s = await approved();
    await scheduleSeminar(s.id, {
      startsAt: at(48),
      startTime: null,
      endsAt: null,
      location: "27동",
    });
    const { activityId, eventId } = await publishSeminar(s.id);
    return { id: s.id, activityId, eventId };
  }
  const attendees = async (activityId: string) =>
    (await getTable("activities")).find((a) => a.id === activityId)
      ?.attendeeIds;
  const eventOf = async (eventId: string) =>
    (await getTable("events")).find((e) => e.id === eventId)!;

  it("takes A's automatic credit away and gives B one", async () => {
    const { id, activityId } = await published();
    expect(await attendees(activityId)).toEqual(["m-a"]);

    await updateSeminar(id, { presenterIds: ["m-b"] });

    expect(await attendees(activityId)).toEqual(["m-b"]);
  });

  it("keeps A's credit when A also has an approved check-in", async () => {
    const { id, activityId, eventId } = await published();
    const row = await checkIn(await eventOf(eventId), "m-a");
    await approveAttendance(eventId, row.id);

    await updateSeminar(id, { presenterIds: ["m-b"] });

    expect(await attendees(activityId)).toEqual(["m-a", "m-b"]);
  });

  it("keeps A's credit justified by a check-in on another session of the activity", async () => {
    const { id, activityId, eventId } = await published();
    const first = await eventOf(eventId);
    await mutate("events", (rows) => [
      ...rows,
      {
        ...first,
        id: "e-second",
        pathId: "p-second",
        attendCode: "c-second",
        presenterIds: [],
        sourceRequestId: null,
      },
    ]);
    const row = await checkIn(await eventOf("e-second"), "m-a");
    await approveAttendance("e-second", row.id);

    await updateSeminar(id, { presenterIds: ["m-b"] });

    expect(await attendees(activityId)).toEqual(["m-a", "m-b"]);
  });

  it("a pending check-in is no basis", async () => {
    const { id, activityId, eventId } = await published();
    await checkIn(await eventOf(eventId), "m-a");

    await updateSeminar(id, { presenterIds: ["m-b"] });

    expect(await attendees(activityId)).toEqual(["m-b"]);
  });

  it("leaves other attendees and a presenter who stays alone", async () => {
    const { id, activityId, eventId } = await published();
    const row = await checkIn(await eventOf(eventId), "m-x");
    await approveAttendance(eventId, row.id);

    await updateSeminar(id, { presenterIds: ["m-a", "m-b"] });

    expect(await attendees(activityId)).toEqual(["m-a", "m-x", "m-b"]);
  });

  it("does not touch the activity when the presenters are not edited", async () => {
    const { id, activityId } = await published();
    await updateSeminar(id, { title: "새 제목" });
    expect(await attendees(activityId)).toEqual(["m-a"]);
  });

  it("a cancelled seminar whose presenters changed can still be deleted", async () => {
    const { id, activityId } = await published();
    await updateSeminar(id, { presenterIds: ["m-b"] });
    await cancelSeminar(id, { memberId: "admin", isAdmin: true });

    await deleteSeminar(id);

    expect(await getTable("seminars")).toEqual([]);
    expect((await getTable("activities")).map((a) => a.id)).not.toContain(
      activityId,
    );
  });
});
