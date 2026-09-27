import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

type Tally = { sent: number; failed: number };
const mail = vi.hoisted(() => ({
  sent: [] as string[],
  /** what the next emit reports: batches sent / failed */
  next: { sent: 1, failed: 0 },
}));
vi.mock("$lib/server/mail/dispatch", () => ({
  emitMailEvent: async (
    event: string,
    _vars: unknown,
    context: { tally?: Tally } = {},
  ) => {
    mail.sent.push(event);
    const { sent, failed } = mail.next;
    if (context.tally) {
      context.tally.sent += sent;
      context.tally.failed += failed;
    }
    return failed === 0;
  },
}));

import { __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { toKstIso } from "$lib/server/core/time";
import { approveSeminar, submitSeminarRequest } from "./seminar-requests";
import {
  publishSeminar,
  scheduleSeminar,
  updateSeminarSchedule,
} from "./seminars";

/**
 * announcedAt meant both "the announcement went out" and "suppressed because
 * the date had passed", and a failure released the claim even when some
 * batches had gone out (audit LB30-1, LB11-1, reproduced):
 * - a seminar published with a past date and then moved to a future date got
 *   a "schedule changed" mail although it was never announced, and its
 *   announcement never went out;
 * - a partly failed announcement released the claim, so the retry sent it to
 *   everyone again.
 */

const HOUR = 60 * 60 * 1000;
const at = (h: number) => toKstIso(new Date(Date.now() + h * HOUR));

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  mail.sent.length = 0;
  mail.next = { sent: 1, failed: 0 };
  for (const t of ["seminars", "seminar-requests", "activities", "events"])
    await invalidateCache(`table_${t}`);
});

async function scheduled(startsAt: string) {
  const req = await submitSeminarRequest({
    title: "세미나",
    description: "설명",
    prerequisites: "",
    duration: "60분",
    preferredTiming: "",
    presenterIds: ["m1"],
    attachment: "",
    requesterId: "m1",
  });
  await approveSeminar(req.id);
  const [s] = await getTable("seminars");
  await scheduleSeminar(s.id, {
    startsAt,
    startTime: null,
    endsAt: null,
    location: "27동",
  });
  return s.id;
}
const seminar = async () => (await getTable("seminars"))[0];

describe("announcedAt means the announcement went out", () => {
  it("is not stamped when a past-dated seminar is published", async () => {
    const id = await scheduled(at(-48));
    await publishSeminar(id);
    expect((await seminar()).announcedAt).toBeNull();
    expect(mail.sent).toEqual([]);
  });

  it("announces a never-announced seminar when it is moved to a future date", async () => {
    const id = await scheduled(at(-48));
    await publishSeminar(id);

    await updateSeminarSchedule(id, {
      startsAt: at(72),
      startTime: null,
      endsAt: null,
      location: "27동",
    });

    expect(mail.sent).toEqual(["seminar.published"]);
    expect((await seminar()).announcedAt).not.toBeNull();
  });

  it("sends a schedule change only for an announced seminar", async () => {
    const id = await scheduled(at(48));
    await publishSeminar(id);
    mail.sent.length = 0;

    await updateSeminarSchedule(id, {
      startsAt: at(72),
      startTime: null,
      endsAt: null,
      location: "27동",
    });

    expect(mail.sent).toEqual(["seminar.schedule-changed"]);
  });
});

describe("a failed announcement", () => {
  it("keeps the claim when some batches went out, so a retry does not resend", async () => {
    const id = await scheduled(at(48));
    mail.next = { sent: 1, failed: 1 };

    const { mailFailed } = await publishSeminar(id);

    expect(mailFailed).toBe(true);
    expect((await seminar()).announcedAt).not.toBeNull();
    mail.next = { sent: 1, failed: 0 };
    mail.sent.length = 0;
    await publishSeminar(id); // the resend button
    expect(mail.sent).toEqual([]);
  });

  it("releases the claim when nothing went out, so a retry sends it", async () => {
    const id = await scheduled(at(48));
    mail.next = { sent: 0, failed: 1 };

    const { mailFailed } = await publishSeminar(id);

    expect(mailFailed).toBe(true);
    expect((await seminar()).announcedAt).toBeNull();
    mail.next = { sent: 1, failed: 0 };
    mail.sent.length = 0;
    await publishSeminar(id);
    expect(mail.sent).toEqual(["seminar.published"]);
  });
});
