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
import { toKstIso } from "$lib/server/core/time";
import type { Event } from "$lib/server/data/schemas";
import { approveSeminar, submitSeminarRequest } from "./seminar-requests";
import {
  publishSeminar,
  scheduleSeminar,
  updateSeminarSchedule,
} from "./seminars";

/**
 * #22 — a published seminar whose date passed has its attendance event
 * expired (the cron's sweep, or an admin). Moving the seminar to a future
 * date moved the event's date but left it expired, so check-in stayed shut
 * for the new date. flow_update_seminar_schedule now reopens an expired
 * event whose new window has not ended; a cancelled event stays cancelled
 * (terminal, ADM-04) and other statuses are left as they are.
 */

const HOUR = 60 * 60 * 1000;
const at = (h: number) => toKstIso(new Date(Date.now() + h * HOUR));
const schedule = (startsAt: string) => ({
  startsAt,
  startTime: null,
  endsAt: null,
  location: "27동",
});

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["seminars", "seminar-requests", "activities", "events"])
    await invalidateCache(`table_${t}`);
});
afterEach(expectTablesValid);

async function publishedWithEventStatus(status: Event["status"]) {
  const req = await submitSeminarRequest({
    title: "세미나",
    description: "설명",
    prerequisites: "",
    duration: "60분",
    preferredTiming: "",
    presenterIds: ["m-a"],
    attachment: "",
    requesterId: "m-a",
  });
  await approveSeminar(req.id);
  const [s] = await getTable("seminars");
  await scheduleSeminar(s.id, schedule(at(-72)));
  const { eventId } = await publishSeminar(s.id);
  await mutate("events", (rows) =>
    rows.map((e) => (e.id === eventId ? { ...e, status } : e)),
  );
  return { id: s.id, eventId };
}
const eventOf = async (id: string) =>
  (await getTable("events")).find((e) => e.id === id)!;

describe("moving a published seminar's schedule", () => {
  it("reopens an expired event when the new date lies ahead", async () => {
    const { id, eventId } = await publishedWithEventStatus("expired");
    const next = at(72);

    await updateSeminarSchedule(id, schedule(next));

    expect(await eventOf(eventId)).toMatchObject({
      status: "active",
      date: { start: next, end: null },
    });
  });

  it("leaves an expired event expired when the new date has passed too", async () => {
    const { id, eventId } = await publishedWithEventStatus("expired");
    const next = at(-48);

    await updateSeminarSchedule(id, schedule(next));

    expect(await eventOf(eventId)).toMatchObject({
      status: "expired",
      date: { start: next, end: null },
    });
  });

  it.each(["cancelled", "draft"] as const)(
    "leaves a %s event's status alone",
    async (status) => {
      const { id, eventId } = await publishedWithEventStatus(status);
      const next = at(72);

      await updateSeminarSchedule(id, schedule(next));

      expect(await eventOf(eventId)).toMatchObject({
        status,
        date: { start: next, end: null },
      });
    },
  );
});
