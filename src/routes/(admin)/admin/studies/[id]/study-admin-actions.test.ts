import { beforeEach, expect, it, vi } from "vitest";
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
import {
  __reset,
  __putRawDoc,
  __auditRows,
} from "$lib/server/data/store-memory";
import {
  _resetDataLayerForTests,
  invalidateTable,
  getTable,
} from "$lib/server/data/tables";
import * as route from "./+page.server";
const actions = () =>
  (
    route as unknown as {
      actions: Record<string, (ctx: never) => Promise<unknown>>;
    }
  ).actions;
const date = "2026-11-03T19:00:00+09:00";
const admin = {
  member: { memberId: "admin", isAdmin: true },
  auth: async () => ({ user: { email: "admin@snu.ac.kr" } }),
} as unknown as App.Locals;
const post = (fields: Record<string, string>, locals = admin) =>
  ({
    params: { id: "s1" },
    locals,
    request: new Request("http://localhost/admin/studies/s1", {
      method: "POST",
      body: new URLSearchParams(fields),
    }),
  }) as never;
beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["members", "studies", "events", "activities"] as const)
    await invalidateTable(t);
  await __putRawDoc("table", "members", {
    schemaVersion: 1,
    rows: [
      {
        id: "admin",
        name: "관리자",
        department: "수리",
        joinedAt: "2024-03-01",
        status: "regular",
        statusChangedAt: date,
        withdrawal: null,
        isAlumni: false,
        alumniRevoked: false,
        alumniRevocationReason: null,
        roles: [],
        isAdmin: true,
        publicContact: null,
        project: null,
        legacyMemberId: null,
        sourceRequestId: null,
      },
    ],
  });
  await __putRawDoc("table", "studies", {
    schemaVersion: 1,
    rows: [
      {
        id: "s1",
        title: "해석학",
        semester: "26-2",
        textbook: "",
        description: "",
        note: "",
        organizerIds: ["org"],
        participantIds: ["org"],
        pendingParticipantIds: [],
        pendingTransfer: null,
        schedule: [],
        transferHistory: [],
        photos: [],
        status: "finished",
        sourceRequestId: null,
      },
    ],
  });
});
it("uses the authenticated admin actor and URL study when creating a session", async () => {
  expect(actions()).toBeDefined();
  const result = await actions().createSession(
    post({
      date: "2026-11-03T19:00",
      title: "회차",
      actorId: "org",
      studyId: "other",
    }),
  );
  expect(result).toMatchObject({ success: true, operation: "sessionCreated" });
  expect((await getTable("events"))[0].studyId).toBe("s1");
  expect((await __auditRows())[0].actor).toBe("admin");
});
it("rejects a malformed date without writing", async () => {
  expect(actions()).toBeDefined();
  expect(
    await actions().createSession(
      post({ date: "2026-02-30T19:00", title: "회차" }),
    ),
  ).toMatchObject({ status: 400, data: { error: "VALIDATION_FAILED" } });
  expect(await getTable("events")).toEqual([]);
});
it("rejects a non-admin request", async () => {
  expect(actions()).toBeDefined();
  expect(
    await actions().createSession(
      post(
        { date: "2026-11-03T19:00" },
        { ...admin, member: { ...admin.member!, isAdmin: false } },
      ),
    ),
  ).toMatchObject({ status: 403, data: { error: "FORBIDDEN" } });
});
it("admin actions edit session and attendance with the real actor, then cancel", async () => {
  await actions().createSession(
    post({ date: "2026-11-03T19:00", title: "첫 회차" }),
  );
  const eventId = (await getTable("events"))[0].id;
  expect(
    await actions().updateSession(
      post({ eventId, date: "2026-11-04T20:00", title: "변경" }),
    ),
  ).toMatchObject({ success: true });
  expect(
    await actions().saveAttendance(post({ eventId, attendeeIds: "org" })),
  ).toMatchObject({ success: true });
  expect((await getTable("activities"))[0]).toMatchObject({
    title: "변경",
    date: { start: "2026-11-04T20:00:00+09:00" },
    attendeeIds: ["org"],
  });
  expect(await actions().cancelSession(post({ eventId }))).toMatchObject({
    success: true,
  });
  expect((await getTable("events"))[0].status).toBe("cancelled");
  expect((await __auditRows()).every((row) => row.actor === "admin")).toBe(
    true,
  );
});
it("load offers a closed study's session and participant management to a non-organizer admin", async () => {
  const result = await route.load({
    locals: admin,
    params: { id: "s1" },
  } as never);
  expect(result.record).toMatchObject({
    id: "s1",
    status: "finished",
    participantIds: ["org"],
  });
  expect(result.sessions).toEqual([]);
  expect(result.pickers.map((p) => p.id)).toContain("admin");
});
