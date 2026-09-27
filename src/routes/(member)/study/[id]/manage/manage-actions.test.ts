import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __reset } from "$lib/server/data/store-memory";
import {
  _resetDataLayerForTests,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { capabilitiesFor } from "$lib/server/core/capabilities";
import { nowKstIso } from "$lib/server/core/time";
import type { Member, Study } from "$lib/server/data/schemas";
import { actions } from "./+page.server";

/**
 * The organizer actions cast raw form values: a bad status threw a ZodError
 * (500), a malformed session date a bare VALIDATION_FAILED, a missing id
 * reached the service as null. They now validate with the study domain
 * schemas and answer {error: VALIDATION_FAILED, issues, values} before any
 * write — the session dialog renders issues.title / issues.startedAtLocal.
 */

const ORG = "org";
const STUDY_ID = "s1";

const locals = {
  member: {
    memberId: ORG,
    privateInfoId: "p-org",
    name: "주최자",
    status: "regular",
    isAdmin: false,
    isAlumni: false,
    registered: true,
    capabilities: capabilitiesFor({ isAlumni: false, registered: true }),
  },
  auth: async () => ({
    user: { email: "org@snu.ac.kr", name: "주최자" },
    expires: "",
  }),
} as unknown as App.Locals;

function post(fields: Record<string, string>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return {
    request: new Request(`http://localhost/study/${STUDY_ID}/manage`, {
      method: "POST",
      body,
    }),
    locals,
    params: { id: STUDY_ID },
  };
}

const member = (id: string, name: string): Member => ({
  id,
  name,
  department: "수리과학부",
  joinedAt: "2024-03-01",
  status: "regular",
  statusChangedAt: nowKstIso(),
  withdrawal: null,
  isAlumni: false,
  alumniRevoked: false,
  roles: [],
  isAdmin: false,
  publicContact: null,
  project: null,
  legacyMemberId: null,
  sourceRequestId: null,
});

const study: Study = {
  id: STUDY_ID,
  title: "해석학",
  semester: "26-2",
  textbook: "",
  description: "",
  note: "",
  organizerIds: [ORG],
  participantIds: [ORG, "p1"],
  pendingParticipantIds: ["p2"],
  pendingTransfer: null,
  schedule: [],
  transferHistory: [],
  photos: [],
  status: "ongoing",
  sourceRequestId: null,
};

const theStudy = async () =>
  (await getTable("studies")).find((s) => s.id === STUDY_ID)!;
const theEvents = async () =>
  (await getTable("events")).filter((e) => e.studyId === STUDY_ID);

function expectIssue(result: unknown, field: string) {
  expect(result).toMatchObject({
    status: 400,
    data: {
      error: "VALIDATION_FAILED",
      issues: { [field]: expect.any(String) },
      values: expect.any(Object),
    },
  });
}

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["members", "studies", "events", "activities"]) {
    await invalidateCache(`table_${t}`);
  }
  await mutate("members", () => [
    member(ORG, "주최자"),
    member("p1", "참여자"),
    member("p2", "대기자"),
  ]);
  await mutate("studies", () => [study]);
});

describe("setStudyStatus", () => {
  it("changes the status", async () => {
    const result = await actions.setStudyStatus(post({ status: "recruiting" }));
    expect(result).toMatchObject({ success: true });
    expect((await theStudy()).status).toBe("recruiting");
  });

  it.each<Record<string, string>>([{ status: "paused" }, {}])(
    "refuses an unknown status %o with a field issue",
    async (fields) => {
      expectIssue(await actions.setStudyStatus(post(fields)), "status");
      expect((await theStudy()).status).toBe("ongoing");
    },
  );
});

describe("createSession", () => {
  it("creates a session at the posted KST time", async () => {
    const result = await actions.createSession(
      post({ date: "2026-09-15T18:30" }),
    );
    expect(result).toMatchObject({ success: true });
    const [event] = await theEvents();
    expect(event.date.start).toBe("2026-09-15T18:30:00+09:00");
    expect(event.title).toBe("해석학 1회차");
  });

  it.each([
    ["startedAtLocal", { date: "" }],
    ["startedAtLocal", { date: "2026-09-15" }],
    ["startedAtLocal", { date: "2026-02-30T18:30" }],
    ["title", { date: "2026-09-15T18:30", title: "가".repeat(121) }],
  ])(
    "refuses a bad %s with a field issue and writes nothing",
    async (field, fields) => {
      expectIssue(await actions.createSession(post(fields)), field);
      expect(await theEvents()).toEqual([]);
    },
  );
});

describe("updateSession", () => {
  let eventId: string;
  beforeEach(async () => {
    await actions.createSession(post({ date: "2026-09-15T18:30" }));
    eventId = (await theEvents())[0].id;
  });

  it("corrects the title and start time", async () => {
    const result = await actions.updateSession(
      post({ eventId, title: "  정정된 회차  ", date: "2026-09-16T19:00" }),
    );
    expect(result).toMatchObject({ success: true });
    const [event] = await theEvents();
    expect(event.title).toBe("정정된 회차");
    expect(event.date.start).toBe("2026-09-16T19:00:00+09:00");
  });

  it.each([
    ["title", { title: "   " }],
    ["title", { title: "가".repeat(121) }],
    ["startedAtLocal", { date: "" }],
    ["startedAtLocal", { date: "2026-13-01T10:00" }],
    ["eventId", { eventId: "" }],
  ])(
    "refuses a bad %s with a field issue and writes nothing",
    async (field, over) => {
      const result = await actions.updateSession(
        post({ eventId, title: "새 제목", date: "2026-09-16T19:00", ...over }),
      );
      expectIssue(result, field);
      const [event] = await theEvents();
      expect(event.title).toBe("해석학 1회차");
      expect(event.date.start).toBe("2026-09-15T18:30:00+09:00");
    },
  );

  it("reports every bad field at once, not the first one", async () => {
    const result = (await actions.updateSession(
      post({ title: "", date: "x" }),
    )) as unknown as { data: { issues: Record<string, string> } };

    expect(Object.keys(result.data.issues).sort()).toEqual([
      "eventId",
      "startedAtLocal",
      "title",
    ]);
  });
});

describe("id-only actions", () => {
  it("cancelSession refuses a missing eventId and cancels nothing", async () => {
    await actions.createSession(post({ date: "2026-09-15T18:30" }));
    expectIssue(await actions.cancelSession(post({})), "eventId");
    expect((await theEvents())[0].status).not.toBe("cancelled");
  });

  it("acceptParticipant accepts a posted member, refuses a missing one", async () => {
    expectIssue(await actions.acceptParticipant(post({})), "memberId");
    expect((await theStudy()).participantIds).toEqual([ORG, "p1"]);

    await actions.acceptParticipant(post({ memberId: "p2" }));
    expect((await theStudy()).participantIds).toEqual([ORG, "p1", "p2"]);
  });

  it("removeParticipant refuses a missing memberId", async () => {
    expectIssue(await actions.removeParticipant(post({})), "memberId");
    expect((await theStudy()).participantIds).toEqual([ORG, "p1"]);
  });

  it("proposeTransfer refuses a missing toMemberId", async () => {
    expectIssue(await actions.proposeTransfer(post({})), "toMemberId");
    expect((await theStudy()).pendingTransfer).toBeNull();
  });
});

describe("guard order", () => {
  it("a non-organizer is refused before the input is looked at", async () => {
    const stranger = {
      ...post({ status: "paused" }),
      locals: {
        ...locals,
        member: { ...locals.member!, memberId: "p1" },
      } as unknown as App.Locals,
    };
    expect(await actions.setStudyStatus(stranger)).toMatchObject({
      status: 403,
    });
  });
});
