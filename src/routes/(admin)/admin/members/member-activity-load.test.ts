import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __putRawDoc, __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, mutate } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { nowKstIso } from "$lib/server/core/time";
import { currentTerm } from "$lib/server/core/semester";
import { load as listLoad } from "./+page.server";
import { load as detailLoad } from "./[id]/+page.server";

/**
 * 관리자 회원 화면의 활동 기록·지위 (snumps-webpage/D-000065·069·070·078).
 * 관리자 면은 숨김 활동·미게시 세미나·취소된 스터디도 목록에 보이되 '공개 면
 * 숨김'으로 표시하고, 기록 수에는 숨김 활동을 넣지 않는다. 재가입 회원은
 * legacy id의 기록까지 합친다. 지위는 저장 지위와 계산 지위를 함께 싣는다.
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
  status: "associate" as const,
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
  type: "세미나" | "스터디" | "회식",
  start: string,
  attendeeIds: string[],
  studyId: string | null = null,
) {
  return {
    id,
    title: `활동 ${id}`,
    date: { start, end: null },
    type,
    attendeeIds,
    studyId,
    sourceRequestId: null,
  };
}

function seminarRow(
  id: string,
  publicationStatus: "published" | "scheduled",
  activityId: string,
) {
  return {
    id,
    title: `세미나 ${id}`,
    semester: "26-2",
    note: "",
    description: "",
    presenterIds: ["m1"],
    externalPresenters: "",
    materials: [],
    photos: [],
    posterKey: "",
    preferredTiming: "",
    publicationStatus,
    kind: null,
    durationMinutes: null,
    prerequisites: "",
    announce: true,
    schedule: null,
    announcedAt: null,
    semesterPinned: false,
    videos: [],
    activityId,
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
    "registrations",
  ]) {
    await invalidateCache(`table_${t}`);
  }
  __putRawDoc("table", "legacy-members", {
    schemaVersion: 1,
    rows: [{ ...base, id: "L1", name: "옛이름" }],
  });
  await mutate("members", () => [
    // 저장 준회원, 등록·기록 3 → 계산 정회원
    { ...base, id: "m1", name: "김수학", legacyMemberId: "L1" },
    // 저장 정회원, 미등록·isAlumni → 동문
    { ...base, id: "m2", name: "이조용", status: "regular", isAlumni: true },
    // 등록·기록 0 → 준회원
    { ...base, id: "m3", name: "박신입" },
    {
      ...base,
      id: "m4",
      name: "최탈퇴",
      status: "withdrawn",
      withdrawal: {
        requestedAt: nowKstIso(),
        previousStatus: "associate",
        holdBy: null,
        holdAt: null,
      },
    },
  ]);
  await mutate("registrations", () =>
    ["m1", "m3"].map((memberId) => ({
      id: `r-${memberId}`,
      memberId,
      term: currentTerm(),
      registeredAt: nowKstIso(),
      sourceRequestId: null,
    })),
  );
  await mutate("seminars", () => [
    seminarRow("s-pub", "published", "a-pub"),
    seminarRow("s-draft", "scheduled", "a-draft"),
  ]);
  await mutate("studies", () => [
    {
      id: "st-cancel",
      title: "취소된 스터디",
      semester: "26-2",
      textbook: "",
      description: "",
      note: "",
      organizerIds: ["m1"],
      participantIds: ["m1"],
      pendingParticipantIds: [],
      pendingTransfer: null,
      schedule: [],
      transferHistory: [],
      photos: [],
      status: "cancelled" as const,
      sourceRequestId: null,
    },
  ]);
  await mutate("activities", () => [
    // 비공개 세미나의 활동 — 숨김: 목록에는 표시, 기록에는 없음
    activityRow("a-draft", "세미나", daysAgo(10), ["m1"]),
    // 발표한 공개 세미나 → 1
    activityRow("a-pub", "세미나", daysAgo(20), []),
    // 이주된 스터디 활동(L1 = m1) → 1
    activityRow("a-old", "스터디", daysAgo(900), ["L1"], null),
    activityRow("a-dinner", "회식", daysAgo(3), ["m1"]),
  ]);
});

describe("admin member list", () => {
  it("carries the stored status and the computed standing", async () => {
    const data = (await listLoad({ locals: admin } as never)) as unknown as {
      members: { id: string; status: string; standing: string | null }[];
    };
    expect(
      Object.fromEntries(
        data.members.map((m) => [m.id, [m.status, m.standing]]),
      ),
    ).toEqual({
      m1: ["associate", "regular"],
      m2: ["regular", "alumni"],
      m3: ["associate", "associate"],
      m4: ["withdrawn", null],
    });
  });
});

describe("admin member detail", () => {
  it("returns the records and marks what the public side leaves out", async () => {
    const data = (await detailLoad({
      locals: admin,
      params: { id: "m1" },
    } as never)) as unknown as {
      standing: string | null;
      registeredThisTerm: boolean;
      activity: {
        records: number;
        recordsByType: Record<string, number>;
        hostedSeminars: { id: string; hidden: boolean }[];
        hostedStudies: { id: string; hidden: boolean }[];
        attended: { id: string; hidden: boolean }[];
      };
    };
    expect(data.standing).toBe("regular");
    expect(data.registeredThisTerm).toBe(true);
    expect(data.activity.records).toBe(3);
    expect(data.activity.recordsByType).toEqual({
      세미나: 1,
      스터디: 1,
      회식: 1,
    });
    expect(
      data.activity.hostedSeminars
        .map((s) => ({ id: s.id, hidden: s.hidden }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual([
      { id: "s-draft", hidden: true },
      { id: "s-pub", hidden: false },
    ]);
    expect(data.activity.hostedStudies).toEqual([
      {
        id: "st-cancel",
        title: "취소된 스터디",
        semester: "26-2",
        hidden: true,
      },
    ]);
    expect(
      data.activity.attended.map((a) => ({ id: a.id, hidden: a.hidden })),
    ).toEqual([
      { id: "a-dinner", hidden: false },
      { id: "a-draft", hidden: true },
      { id: "a-old", hidden: false },
    ]);
  });
});
