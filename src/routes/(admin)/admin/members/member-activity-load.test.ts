import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __putRawDoc, __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, mutate } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { nowKstIso } from "$lib/server/core/time";
import { load as listLoad } from "./+page.server";
import { load as detailLoad } from "./[id]/+page.server";

/**
 * 관리자 회원 화면의 활동 정도 (snumps-webpage/D-000041·042). 관리자 면은
 * 숨김 활동(비공개 세미나의 활동)도 센다 — 대신 숨김임을 표시한다.
 * 재가입 회원은 legacy id의 기록까지 합친다.
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

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

const base = {
  department: "수리과학부",
  joinedAt: "2024-03-01",
  status: "regular" as const,
  statusChangedAt: nowKstIso(),
  withdrawal: null,
  isAlumni: false,
  alumniRevoked: false,
  roles: [],
  isAdmin: false,
  publicContact: null,
  alumniRevocationReason: null,
  project: null,
  legacyMemberId: null,
  sourceRequestId: null,
};

function activityRow(
  id: string,
  type: "세미나" | "스터디",
  start: string,
  attendeeIds: string[],
) {
  return {
    id,
    title: `활동 ${id}`,
    date: { start, end: null },
    type,
    attendeeIds,
    studyId: null,
    sourceRequestId: null,
  };
}

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of [
    "members",
    "legacy-members",
    "private-info",
    "role-titles",
    "seminars",
    "studies",
    "activities",
    "events",
  ]) {
    await invalidateCache(`table_${t}`);
  }
  __putRawDoc("table", "legacy-members", {
    schemaVersion: 1,
    rows: [{ ...base, id: "L1", name: "옛이름" }],
  });
  await mutate("members", () => [
    { ...base, id: "m1", name: "김수학", legacyMemberId: "L1" },
    { ...base, id: "m2", name: "이조용" },
  ]);
  await mutate("seminars", () => [
    {
      id: "s-draft",
      title: "공개 전 세미나",
      semester: "26-2",
      note: "",
      description: "",
      presenterIds: ["m1"],
      externalPresenters: "",
      materials: [],
      photos: [],
      posterKey: "",
      preferredTiming: "",
      publicationStatus: "scheduled" as const,
      kind: null,
      durationMinutes: null,
      prerequisites: "",
      announce: true,
      schedule: null,
      announcedAt: null,
      semesterPinned: false,
      videos: [],
      activityId: "a-draft",
      sourceRequestId: null,
    },
  ]);
  await mutate("activities", () => [
    // 비공개 세미나의 활동 — 공개 면에서는 숨김, 관리자 면에서는 센다
    activityRow("a-draft", "세미나", daysAgo(10), ["m1"]),
    activityRow("a-old", "스터디", daysAgo(900), ["L1"]),
  ]);
});

describe("admin member list", () => {
  it("carries the active flag, counting hidden activities", async () => {
    const data = (await listLoad({ locals: admin } as never)) as unknown as {
      members: { id: string; active: boolean }[];
    };
    expect(
      Object.fromEntries(data.members.map((m) => [m.id, m.active])),
    ).toEqual({ m1: true, m2: false });
  });
});

describe("admin member detail", () => {
  it("returns the merged activity with hidden activities marked", async () => {
    const data = (await detailLoad({
      locals: admin,
      params: { id: "m1" },
    } as never)) as unknown as {
      activity: {
        active: boolean;
        hostedSeminars: { id: string }[];
        attended: { id: string; hidden: boolean }[];
        countsByType: Record<string, number>;
      };
    };
    expect(data.activity.active).toBe(true);
    expect(data.activity.hostedSeminars.map((s) => s.id)).toEqual(["s-draft"]);
    expect(
      data.activity.attended.map((a) => ({ id: a.id, hidden: a.hidden })),
    ).toEqual([
      { id: "a-draft", hidden: true },
      { id: "a-old", hidden: false },
    ]);
    expect(data.activity.countsByType).toEqual({ 세미나: 1, 스터디: 1 });
  });
});
