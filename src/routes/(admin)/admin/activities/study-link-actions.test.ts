import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __docs, __putRawDoc, __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { actions, load } from "./+page.server";

/**
 * 관리자 활동 화면의 스터디 지정(계획 2026-10-14 Task 2). 종류가 '스터디'인
 * 활동만 연결한다(snumps-webpage/D-000053). 빈 studyId는 연결 해제. 없는
 * 활동·없는 스터디는 서로 다른 문구로 알린다(D-000062).
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
    request: new Request("http://localhost/admin/activities", {
      method: "POST",
      body,
    }),
    locals: admin,
  } as never;
}

const activity = (id: string, type: string, studyId: string | null) => ({
  id,
  title: id,
  date: { start: "2025-03-01T19:00:00+09:00", end: null },
  type,
  attendeeIds: [],
  studyId,
  sourceRequestId: null,
});

const study = (id: string, title: string, semester: string) => ({
  id,
  title,
  semester,
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
});

type Refusal = { status: number; data: { error: string; message: string } };

const version = async () => (await __docs("table")).get("activities")?.version;
const studyIdOf = async (id: string) =>
  (await getTable("activities")).find((a) => a.id === id)?.studyId;

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of [
    "activities",
    "events",
    "members",
    "legacy-members",
    "studies",
  ])
    await invalidateCache(`table_${t}`);
  await __putRawDoc("table", "studies", {
    schemaVersion: 1,
    rows: [study("s1", "해석학", "25-1"), study("s2", "대수학", "25-2")],
  });
  await __putRawDoc("table", "activities", {
    schemaVersion: 1,
    rows: [
      activity("a-study", "스터디", null),
      activity("a-linked", "스터디", "s1"),
      activity("a-meeting", "회의", null),
    ],
  });
});

describe("activity editor load", () => {
  it("offers every study by term and title", async () => {
    const data = (await load({ locals: admin } as never)) as {
      studies: unknown[];
    };
    expect(data.studies).toEqual([
      { id: "s2", title: "대수학", semester: "25-2" },
      { id: "s1", title: "해석학", semester: "25-1" },
    ]);
  });
});

describe("?/setStudy", () => {
  it("links a study activity to the chosen study", async () => {
    const result = await actions.setStudy(
      post({ id: "a-study", studyId: "s2" }),
    );
    expect(result).toMatchObject({ success: true, operation: "studyLinked" });
    expect(await studyIdOf("a-study")).toBe("s2");
  });

  it("unlinks when the study is left empty", async () => {
    const result = await actions.setStudy(
      post({ id: "a-linked", studyId: "" }),
    );
    expect(result).toMatchObject({ success: true, operation: "studyLinked" });
    expect(await studyIdOf("a-linked")).toBeNull();
  });

  it("refuses an activity of another type, writing nothing", async () => {
    const before = await version();
    const result = await actions.setStudy(
      post({ id: "a-meeting", studyId: "s1" }),
    );
    expect(result).toMatchObject({
      status: 400,
      data: { error: "VALIDATION_FAILED", message: expect.any(String) },
    });
    expect(await version()).toBe(before);
    expect(await studyIdOf("a-meeting")).toBeNull();
  });

  it("refuses a study that does not exist, writing nothing", async () => {
    const before = await version();
    const result = (await actions.setStudy(
      post({ id: "a-study", studyId: "nope" }),
    )) as unknown as Refusal;
    expect(result).toMatchObject({
      status: 400,
      data: { error: "VALIDATION_FAILED" },
    });
    expect(result.data.message).toContain("스터디");
    expect(await version()).toBe(before);
  });

  it("says the activity is gone, in other words than a missing study", async () => {
    const gone = (await actions.setStudy(
      post({ id: "missing", studyId: "s1" }),
    )) as unknown as Refusal;
    const noStudy = (await actions.setStudy(
      post({ id: "a-study", studyId: "nope" }),
    )) as unknown as Refusal;
    expect(gone).toMatchObject({ status: 404, data: { error: "NOT_FOUND" } });
    expect(gone.data.message).toContain("활동");
    expect(gone.data.message).not.toBe(noStudy.data.message);
  });
});
