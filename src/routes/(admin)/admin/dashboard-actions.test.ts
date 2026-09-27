import { beforeEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
vi.mock("$lib/server/mail", () => ({
  sendApplicationRejectedEmail: async () => undefined,
  sendSeminarStatusNotification: async () => undefined,
  sendStudyStatusNotification: async () => undefined,
  sendWelcomeEmail: async () => undefined,
}));

import { __reset } from "$lib/server/data/store-memory";
import {
  _resetDataLayerForTests,
  getQueue,
  getTable,
  mutateQueue,
} from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { createEventWithActivity } from "$lib/server/services/events";
import { actions } from "./+page.server";

/**
 * The dashboard's event and attendance editors (AdminEventLedger,
 * AdminAttendanceQueue) already render issues keyed startsAtLocal /
 * endsAtLocal / startTimeLocal / endTimeLocal, but updateEvent checked only
 * the type by hand and updateAttendanceTime converted whatever arrived —
 * outside the admin wrapper, so a malformed time surfaced as a 500. They now
 * parse with adminEventInputSchema / adminAttendanceTimeInputSchema, and every
 * id-taking action checks its ids with adminDashboardIdSchema before any read.
 */

const admin = {
  member: {
    memberId: "admin",
    privateInfoId: null,
    name: "관리자",
    status: "regular",
    isAdmin: true,
    isAlumni: false,
    registered: true,
    capabilities: [],
  },
  auth: async () => ({ user: { email: "admin@snu.ac.kr", name: "관리자" } }),
} as unknown as App.Locals;

function post(fields: Record<string, string>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return {
    request: new Request("http://localhost/admin", { method: "POST", body }),
    locals: admin,
  } as never;
}

type Failure = {
  status: number;
  data: { error: string; issues: Record<string, string> };
};

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["events", "activities", "members", "applications"])
    await invalidateCache(`table_${t}`);
});

async function draftEvent() {
  return createEventWithActivity({
    title: "정기 회의",
    startIso: "2026-09-01T19:00:00+09:00",
    type: "회의",
  });
}

describe("?/updateEvent", () => {
  const valid = {
    title: "  임시 회의  ",
    type: "기타",
    start: "2026-09-02T18:00",
    end: "2026-09-02T20:00",
  };

  it("stores a valid edit, trimmed", async () => {
    const event = await draftEvent();

    const result = await actions.updateEvent(post({ ...valid, id: event.id }));

    expect(result).toMatchObject({ success: true });
    const [row] = await getTable("events");
    expect(row).toMatchObject({
      title: "임시 회의",
      type: "기타",
      date: {
        start: "2026-09-02T18:00:00+09:00",
        end: "2026-09-02T20:00:00+09:00",
      },
    });
  });

  it.each([
    ["title", { title: " " }],
    ["title", { title: "가".repeat(161) }],
    ["type", { type: "문제 풀이" }],
    ["startsAtLocal", { start: "2026-09-02" }],
    ["endsAtLocal", { end: "2026-09-02T17:00" }],
    ["id", { id: " " }],
  ])(
    "refuses a bad %s with a field issue and keeps the row",
    async (field, over) => {
      const event = await draftEvent();

      const result = await actions.updateEvent(
        post({ id: event.id, ...valid, ...over }),
      );

      expect(result).toMatchObject({
        status: 400,
        data: {
          error: "VALIDATION_FAILED",
          issues: { [field]: expect.any(String) },
        },
      });
      const [row] = await getTable("events");
      expect(row).toMatchObject({ title: "정기 회의", type: "회의" });
    },
  );

  it("reports every bad field at once", async () => {
    const event = await draftEvent();

    const result = (await actions.updateEvent(
      post({ id: event.id, title: "", type: "x", start: "", end: "" }),
    )) as unknown as Failure;

    expect(Object.keys(result.data.issues).sort()).toEqual([
      "startsAtLocal",
      "title",
      "type",
    ]);
  });
});

describe("?/updateAttendanceTime", () => {
  async function pendingRecord() {
    const event = await draftEvent();
    const record = {
      id: "q1",
      memberId: "m1",
      eventId: event.id,
      startTime: "2026-09-01T19:00:00+09:00",
      endTime: null,
      status: "pending" as const,
    };
    await mutateQueue(event.id, () => [record]);
    return record;
  }

  it("stores a valid time range", async () => {
    const record = await pendingRecord();

    const result = await actions.updateAttendanceTime(
      post({
        eventId: record.eventId,
        id: record.id,
        startTime: "2026-09-01T19:10",
        endTime: "2026-09-01T21:00",
      }),
    );

    expect(result).toMatchObject({ success: true });
    const [row] = await getQueue(record.eventId);
    expect(row).toMatchObject({
      startTime: "2026-09-01T19:10:00+09:00",
      endTime: "2026-09-01T21:00:00+09:00",
    });
  });

  it.each([
    ["startTimeLocal", { startTime: "19:10" }],
    ["endTimeLocal", { endTime: "" }],
    ["endTimeLocal", { endTime: "2026-09-01T18:00" }],
    ["eventId", { eventId: "" }],
    ["id", { id: "" }],
  ])(
    "refuses a bad %s with a field issue and keeps the row",
    async (field, over) => {
      const record = await pendingRecord();

      const result = await actions.updateAttendanceTime(
        post({
          eventId: record.eventId,
          id: record.id,
          startTime: "2026-09-01T19:10",
          endTime: "2026-09-01T21:00",
          ...over,
        }),
      );

      expect(result).toMatchObject({
        status: 400,
        data: {
          error: "VALIDATION_FAILED",
          issues: { [field]: expect.any(String) },
        },
      });
      const [row] = await getQueue(record.eventId);
      expect(row.startTime).toBe("2026-09-01T19:00:00+09:00");
    },
  );

  it("reports every bad field at once", async () => {
    const record = await pendingRecord();

    const result = (await actions.updateAttendanceTime(
      post({ eventId: record.eventId, id: "", startTime: "x", endTime: "" }),
    )) as unknown as Failure;

    expect(Object.keys(result.data.issues).sort()).toEqual([
      "endTimeLocal",
      "id",
      "startTimeLocal",
    ]);
  });
});

describe("id-taking actions", () => {
  it.each([
    ["approve", {}],
    ["reject", { id: "  " }],
    ["activateEvent", {}],
    ["expireEvent", {}],
    ["deleteEvent", { id: "" }],
    ["approveSeminar", {}],
    ["rejectSeminar", {}],
    ["approveStudy", {}],
    ["rejectStudy", {}],
    ["approveAttendance", { eventId: "e1" }],
    ["rejectAttendance", { id: "q1" }],
    ["deleteAttendanceRecord", {}],
  ] as const)(
    "?/%s answers a missing id with VALIDATION_FAILED",
    async (name, fields) => {
      const action = actions[name] as (e: never) => Promise<unknown>;

      const result = await action(post(fields));

      expect(result).toMatchObject({
        status: 400,
        data: { error: "VALIDATION_FAILED", issues: expect.any(Object) },
      });
    },
  );

  it("names each missing id", async () => {
    const result = (await actions.approveAttendance(
      post({}),
    )) as unknown as Failure;

    expect(Object.keys(result.data.issues).sort()).toEqual(["eventId", "id"]);
  });

  it("still runs the action for a present id", async () => {
    const event = await draftEvent();

    const result = await actions.activateEvent(post({ id: event.id }));

    expect(result).toMatchObject({ success: true });
    expect((await getTable("events"))[0].status).toBe("active");
  });

  it("keeps NOT_FOUND for a well-formed id that matches nothing", async () => {
    const result = await actions.activateEvent(post({ id: "missing" }));

    expect(result).toMatchObject({ status: 404 });
  });
});
