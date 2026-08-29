import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/data/store", () => import("$lib/server/data/store-memory"));

import { __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, getQueue, getTable, mutate } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { AppError } from "$lib/server/core/errors";
import { toKstIso } from "$lib/server/core/time";
import { mergeAttendees } from "$lib/server/attendance";
import {
  approveAttendance,
  checkIn,
  createEventWithActivity,
  deleteEventChecked,
  effectiveStatus,
  rejectAttendance,
  runCron,
} from "./events";

async function clearCaches() {
  for (const t of ["activities", "events"]) await invalidateCache(`table_${t}`);
}

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  await clearCaches();
});

const future = () => toKstIso(new Date(Date.now() + 60 * 60 * 1000));
const past = () => toKstIso(new Date(Date.now() - 48 * 60 * 60 * 1000));

describe("mergeAttendees — the one merge rule", () => {
  it("preserves attendees who arrived outside the allowed pool", () => {
    expect(mergeAttendees(["walkin", "a"], ["a", "b"], ["b"])).toEqual(["walkin", "b"]);
  });
  it("dedupes and rejects selections outside the pool", () => {
    expect(mergeAttendees([], ["a"], ["a"])).toEqual(["a"]);
    expect(() => mergeAttendees([], ["a"], ["x"])).toThrow(AppError);
  });
});

describe("check-in (EVT-01)", () => {
  it("records a one-click pending row and refuses a second one", async () => {
    const event = await createEventWithActivity({
      title: "세미나", startIso: future(), type: "세미나", status: "active",
    });
    const rec = await checkIn(event, "m1");
    expect(rec.status).toBe("pending");
    expect(rec.startTime).toBe(rec.endTime);
    await expect(checkIn(event, "m1")).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "CONFLICT",
    );
  });

  it("refuses check-in on a lazily-expired event even while status says active", async () => {
    const event = await createEventWithActivity({
      title: "지난 세미나", startIso: past(), type: "세미나", status: "active",
    });
    expect(effectiveStatus(event)).toBe("expired");
    await expect(checkIn(event, "m1")).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "EVENT_NOT_OPEN",
    );
  });
});

describe("queue administration (ADM-03)", () => {
  it("approval lands the member on the activity; rejecting it afterwards reverses", async () => {
    const event = await createEventWithActivity({
      title: "세미나", startIso: future(), type: "세미나", status: "active",
    });
    const rec = await checkIn(event, "m1");

    await approveAttendance(event.id, rec.id);
    let activity = (await getTable("activities"))[0];
    expect(activity.attendeeIds).toContain("m1");
    expect((await getQueue(event.id))[0].status).toBe("approved");

    await rejectAttendance(event.id, rec.id);
    activity = (await getTable("activities"))[0];
    expect(activity.attendeeIds).not.toContain("m1");
    expect((await getQueue(event.id))[0].status).toBe("rejected");
  });

  it("delete refuses while a pending check-in exists, then removes event + queue", async () => {
    const event = await createEventWithActivity({
      title: "세미나", startIso: future(), type: "세미나", status: "active",
    });
    const rec = await checkIn(event, "m1");

    await expect(deleteEventChecked(event.id)).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "CONFLICT",
    );

    await rejectAttendance(event.id, rec.id);
    await deleteEventChecked(event.id);
    expect(await getTable("events")).toHaveLength(0);
    expect(await getQueue(event.id)).toHaveLength(0);
  });
});

describe("cron (§8-1)", () => {
  it("expires past-due active events and reports the count", async () => {
    await createEventWithActivity({
      title: "지난 것", startIso: past(), type: "세미나", status: "active",
    });
    await createEventWithActivity({
      title: "다가올 것", startIso: future(), type: "세미나", status: "active",
    });

    const results = await runCron();
    expect(results.expired).toBe(1);
    const events = await getTable("events");
    expect(events.find((e) => e.title === "지난 것")?.status).toBe("expired");
    expect(events.find((e) => e.title === "다가올 것")?.status).toBe("active");
  });

  it("never resurrects a cancelled event", async () => {
    const event = await createEventWithActivity({
      title: "취소된 것", startIso: past(), type: "세미나", status: "active",
    });
    await mutate("events", (rows) =>
      rows.map((e) => (e.id === event.id ? { ...e, status: "cancelled" as const } : e)),
    );
    await runCron();
    expect((await getTable("events"))[0].status).toBe("cancelled");
  });

  it("uses date.end when present for expiry", async () => {
    const event = await createEventWithActivity({
      title: "이틀 전 시작", startIso: past(), type: "세미나", status: "active",
    });
    await mutate("events", (rows) =>
      rows.map((e) =>
        e.id === event.id ? { ...e, date: { start: e.date.start, end: future() } } : e,
      ),
    );
    const updated = (await getTable("events"))[0];
    expect(effectiveStatus(updated)).toBe("active");
  });
});
