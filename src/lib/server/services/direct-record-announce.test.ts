import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
const mail = vi.hoisted(() => ({ sent: [] as string[] }));
vi.mock("$lib/server/mail/dispatch", () => ({
  emitMailEvent: async (event: string) => {
    mail.sent.push(event);
    return true;
  },
}));

import { __reset } from "$lib/server/data/store-memory";
import { expectTablesValid } from "$lib/server/data/expect-tables-valid";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { toKstIso } from "$lib/server/core/time";
import { approveSeminar, submitSeminarRequest } from "./seminar-requests";
import {
  cancelSeminar,
  publishSeminar,
  scheduleSeminar,
  updateSeminarSchedule,
} from "./seminars";
import { createSeminar } from "./records-admin";

/**
 * #21 — a seminar made by "기록 직접 생성" is an archive record, not an event
 * anyone was told about. It is stored published with no schedule; giving it
 * a future date later ran the publish flow, which claimed announcedAt and
 * mailed every member. Such a seminar now carries `announce: false`: no
 * publish announcement, no schedule-change notice, no cancellation notice.
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
  mail.sent.length = 0;
  for (const t of ["seminars", "seminar-requests", "activities", "events"])
    await invalidateCache(`table_${t}`);
});
afterEach(expectTablesValid);

const direct = () =>
  createSeminar({
    title: "직접 기록",
    semester: "26-2",
    note: "",
    presenterIds: ["m-a"],
    externalPresenters: "",
  });
const seminar = async () => (await getTable("seminars"))[0];

describe("a seminar created directly as a record is not announced", () => {
  it("is stored as not an announcement target", async () => {
    await direct();
    expect((await seminar()).announce).toBe(false);
  });

  it("gets a future schedule — activity and event, but no announcement", async () => {
    const s = await direct();

    await updateSeminarSchedule(s.id, schedule(at(72)));

    expect(mail.sent).toEqual([]);
    expect((await seminar()).announcedAt).toBeNull();
    // the rest of the publish convergence is unchanged
    expect(await getTable("activities")).toHaveLength(1);
    expect(await getTable("events")).toHaveLength(1);
  });

  it("sends no schedule-change notice when its date moves again", async () => {
    const s = await direct();
    await updateSeminarSchedule(s.id, schedule(at(72)));

    await updateSeminarSchedule(s.id, schedule(at(96)));

    expect(mail.sent).toEqual([]);
  });

  it("sends no cancellation notice", async () => {
    const s = await direct();
    await updateSeminarSchedule(s.id, schedule(at(72)));

    await cancelSeminar(s.id, { memberId: "admin", isAdmin: true });

    expect(mail.sent).toEqual([]);
    expect((await seminar()).publicationStatus).toBe("cancelled");
  });

  it("a re-run of publish (the resend path) sends nothing either", async () => {
    const s = await direct();
    await updateSeminarSchedule(s.id, schedule(at(72)));

    const { mailFailed } = await publishSeminar(s.id);

    expect(mailFailed).toBe(false);
    expect(mail.sent).toEqual([]);
  });
});

describe("a seminar from a request is still announced", () => {
  it("announces on publish", async () => {
    const req = await submitSeminarRequest({
      title: "신청 세미나",
      description: "설명",
      prerequisites: "",
      duration: "60분",
      preferredTiming: "",
      presenterIds: ["m-a"],
      attachment: "",
      requesterId: "m-a",
    });
    await approveSeminar(req.id);
    const s = await seminar();
    expect(s.announce).toBe(true);
    await scheduleSeminar(s.id, schedule(at(72)));

    await publishSeminar(s.id);

    expect(mail.sent).toEqual(["seminar.published"]);
  });
});
