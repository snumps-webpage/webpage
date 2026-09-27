import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __reset } from "$lib/server/data/store-memory";
import { expectTablesValid } from "$lib/server/data/expect-tables-valid";
import {
  _resetDataLayerForTests,
  getQueue,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { AppError } from "$lib/server/core/errors";
import { toKstIso } from "$lib/server/core/time";
import type { Event } from "$lib/server/data/schemas";
import {
  approveAttendance,
  checkIn,
  createEventWithActivity,
  deleteAttendanceRecord,
  deleteEventChecked,
  rejectAttendance,
} from "./events";

/**
 * Races the adversarial review found in the attendance flows, now closed by
 * running each flow as one transaction (flow_check_in,
 * flow_decide_attendance, flow_delete_event):
 *   - approve ∥ reject on one row could leave a REJECTED row whose member
 *     still had the credit (both read "pending"; the reject skipped the
 *     reversal, the approve added the credit);
 *   - delete event ∥ check-in could queue a pending row for an event that no
 *     longer exists.
 * Each case runs the pair concurrently and checks the invariant whichever
 * side commits first.
 */

const codeOf = (e: unknown) => (e instanceof AppError ? e.code : String(e));
const future = () => toKstIso(new Date(Date.now() + 60 * 60 * 1000));

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["activities", "events"]) await invalidateCache(`table_${t}`);
});
afterEach(expectTablesValid);

async function openEvent(): Promise<Event> {
  return createEventWithActivity({
    title: "세미나",
    startIso: future(),
    type: "세미나",
    status: "active",
  });
}

const attendeesOf = async (event: Event) =>
  (await getTable("activities")).find((a) => a.id === event.activityId)!
    .attendeeIds;

describe("approve ∥ reject on one row", () => {
  it.each([1, 2, 3, 4, 5])(
    "credit matches the final status (run %i)",
    async () => {
      const event = await openEvent();
      const rec = await checkIn(event, "m1");

      await Promise.allSettled([
        approveAttendance(event.id, rec.id),
        rejectAttendance(event.id, rec.id),
      ]);

      const [row] = await getQueue(event.id);
      expect(row.status).not.toBe("pending");
      expect((await attendeesOf(event)).includes("m1")).toBe(
        row.status === "approved",
      );
    },
  );
});

describe("approve ∥ delete on one row", () => {
  it("never leaves credit without its row", async () => {
    const event = await openEvent();
    const rec = await checkIn(event, "m1");

    await Promise.allSettled([
      approveAttendance(event.id, rec.id),
      deleteAttendanceRecord(event.id, rec.id),
    ]);

    const rows = await getQueue(event.id);
    const approved = rows.some((r) => r.status === "approved");
    expect((await attendeesOf(event)).includes("m1")).toBe(approved);
  });
});

describe("delete event ∥ check-in", () => {
  it.each([1, 2, 3, 4, 5])(
    "no pending row outlives its event (run %i)",
    async () => {
      const event = await openEvent();

      const [del, chk] = await Promise.allSettled([
        deleteEventChecked(event.id),
        checkIn(event, "m1"),
      ]);

      const gone = !(await getTable("events")).some((e) => e.id === event.id);
      if (gone) {
        expect(del.status).toBe("fulfilled");
        expect(await getQueue(event.id)).toEqual([]);
        if (chk.status === "rejected") {
          expect(codeOf(chk.reason)).toBe("NOT_FOUND");
        }
      } else {
        // the check-in won; the delete saw its pending row and refused
        expect(del.status === "rejected" && codeOf(del.reason)).toBe(
          "CONFLICT",
        );
        expect((await getQueue(event.id)).map((r) => r.status)).toEqual([
          "pending",
        ]);
      }
    },
  );
});

describe("check-in re-reads the event", () => {
  it("refuses an event cancelled after the page read it", async () => {
    const event = await openEvent(); // the member's copy says "active"
    await mutate("events", (rows) =>
      rows.map((e) =>
        e.id === event.id ? { ...e, status: "cancelled" as const } : e,
      ),
    );

    await expect(checkIn(event, "m1")).rejects.toSatisfy(
      (e) => codeOf(e) === "EVENT_NOT_OPEN",
    );
    expect(await getQueue(event.id)).toEqual([]);
  });

  it("refuses an event deleted after the page read it", async () => {
    const event = await openEvent();
    await deleteEventChecked(event.id);

    await expect(checkIn(event, "m1")).rejects.toSatisfy(
      (e) => codeOf(e) === "NOT_FOUND",
    );
    expect(await getQueue(event.id)).toEqual([]);
  });
});
