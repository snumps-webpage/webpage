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
import type { Member } from "$lib/server/data/schemas";
import { getPublicMembers } from "./archive";
import { getPublicMember, memberActivityIndex } from "./member-activity";

/**
 * 회원별 활동 기록·지위의 로드 (snumps-webpage/D-000063·064·070·074·077·078).
 *
 * - 공개 집계는 회원 면과 같은 숨김 규칙을 따른다: 숨김 활동(비공개 세미나의
 *   활동, 이벤트가 모두 취소된 활동)과 공개 아카이브에 없는 세미나, 취소된
 *   스터디는 공개 면의 목록에 없다. 기록 수는 어느 면에서나 숨김 활동을 세지 않는다.
 * - 지위는 이번 학기 등록(사람의 id 어느 쪽이든)과 기록 수로 정한다.
 * - 재가입 회원은 새 id와 legacy id의 기록을 합쳐 한 사람으로 센다.
 * - 명단 행에는 참석 목록을 싣지 않는다(공개 페이지에만).
 */

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

function memberRow(over: Partial<Member> & Pick<Member, "id" | "name">) {
  return {
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
    ...over,
  };
}

function seminarRow(
  id: string,
  presenterIds: string[],
  publicationStatus: "published" | "scheduled" | "cancelled",
  activityId: string | null,
) {
  return {
    id,
    title: `세미나 ${id}`,
    semester: "26-2",
    note: "",
    description: "",
    presenterIds,
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

function studyRow(
  id: string,
  organizerIds: string[],
  status: "finished" | "cancelled",
) {
  return {
    id,
    title: `스터디 ${id}`,
    semester: "23-2",
    textbook: "",
    description: "",
    note: "",
    organizerIds,
    participantIds: organizerIds,
    pendingParticipantIds: [],
    pendingTransfer: null,
    schedule: [],
    transferHistory: [],
    photos: [],
    status,
    sourceRequestId: null,
  };
}

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

function registration(memberId: string, term: string) {
  return {
    id: `r-${memberId}-${term}`,
    memberId,
    term,
    registeredAt: nowKstIso(),
    sourceRequestId: null,
  };
}

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of [
    "members",
    "legacy-members",
    "seminars",
    "studies",
    "activities",
    "events",
    "registrations",
  ]) {
    await invalidateCache(`table_${t}`);
  }

  // L1: 이주된 옛 회원 행, m1이 재가입하며 잇는다. L2: 재가입하지 않은 옛 회원.
  // L3: m3가 잇는 옛 행 — 이번 학기 등록이 legacy id로 남아 있다.
  __putRawDoc("table", "legacy-members", {
    schemaVersion: 1,
    rows: [
      memberRow({ id: "L1", name: "옛김수학", joinedAt: "2019-03-01" }),
      memberRow({ id: "L2", name: "박옛날", joinedAt: "2018-03-01" }),
      memberRow({ id: "L3", name: "옛최", joinedAt: "2018-03-01" }),
    ],
  });
  await mutate("members", () => [
    memberRow({ id: "m1", name: "김수학", legacyMemberId: "L1" }),
    memberRow({
      id: "m2",
      name: "이탈퇴",
      status: "withdrawn",
      withdrawal: {
        requestedAt: nowKstIso(),
        previousStatus: "regular",
        holdBy: null,
        holdAt: null,
      },
    }),
    memberRow({ id: "m3", name: "최준", legacyMemberId: "L3" }),
    memberRow({ id: "m4", name: "정동문", status: "regular", isAlumni: true }),
  ]);
  await mutate("registrations", () => [
    registration("m1", currentTerm()),
    registration("L3", currentTerm()),
    // 지난 학기 등록은 현재 회원이 아니다
    registration("m4", "20-1"),
  ]);
  await mutate("seminars", () => [
    seminarRow("s-pub", ["m1"], "published", "a-sem"),
    seminarRow("s-old", ["L1"], "published", null),
    seminarRow("s-draft", ["m1"], "scheduled", "a-draft"),
  ]);
  await mutate("studies", () => [
    studyRow("st1", ["L1"], "finished"),
    studyRow("st-cancel", ["m1"], "cancelled"),
  ]);
  await mutate("activities", () => [
    // m1: 발표한 세미나(참석 명단에는 없음) → 기록 1
    activityRow("a-sem", "세미나", daysAgo(400), []),
    // 이주된 스터디 활동(L1 = m1) → 기록 1
    activityRow("a-old", "스터디", daysAgo(900), ["L1", "L2"], "st1"),
    // 비공개 세미나의 활동 — 숨김, 세지 않음
    activityRow("a-draft", "세미나", daysAgo(10), ["m1"]),
    // 출석 이벤트가 모두 취소된 활동 — 숨김, 세지 않음
    activityRow("a-cancelled", "회식", daysAgo(5), ["m1"]),
    activityRow("a-dinner", "회식", daysAgo(3), ["m1", "L2", "m3"]),
    activityRow("a-dinner2", "회식", daysAgo(2), ["m3"]),
  ]);
  await mutate("events", () => [
    {
      id: "e1",
      title: "취소된 모임",
      date: { start: daysAgo(5), end: null },
      type: "회식" as const,
      status: "cancelled" as const,
      pathId: "p1",
      attendCode: "c1",
      activityId: "a-cancelled",
      applicantIds: [],
      presenterIds: [],
      studyId: null,
      sessionNo: null,
      autoGenerated: false,
      sourceRequestId: null,
    },
  ]);
});

const m1 = () => memberRow({ id: "m1", name: "김수학", legacyMemberId: "L1" });

describe("memberActivityIndex", () => {
  it("leaves hidden activities, unpublished seminars and cancelled studies out of the public lists", async () => {
    const index = await memberActivityIndex({ publicOnly: true });
    const { activity } = index.of(m1());

    expect(activity.attended.map((a) => a.id)).toEqual(["a-dinner", "a-old"]);
    expect(activity.hostedSeminars.map((s) => s.id).sort()).toEqual([
      "s-old",
      "s-pub",
    ]);
    expect(activity.hostedStudies.map((s) => s.id)).toEqual(["st1"]);
    expect(activity.records).toBe(3);
    expect(activity.recordsByType).toEqual({ 세미나: 1, 스터디: 1, 회식: 1 });
  });

  it("lists everything for the admin view but still counts no hidden activity", async () => {
    const index = await memberActivityIndex({ publicOnly: false });
    const { activity } = index.of(m1());

    expect(activity.attended.map((a) => a.id)).toEqual([
      "a-dinner",
      "a-cancelled",
      "a-draft",
      "a-old",
    ]);
    expect(activity.hostedSeminars.map((s) => s.id).sort()).toEqual([
      "s-draft",
      "s-old",
      "s-pub",
    ]);
    expect(activity.hostedStudies.map((s) => s.id).sort()).toEqual([
      "st-cancel",
      "st1",
    ]);
    expect(activity.records).toBe(3);
    expect(index.hiddenFromPublic).toEqual({
      seminars: new Set(["s-draft"]),
      studies: new Set(["st-cancel"]),
      activities: new Set(["a-draft", "a-cancelled"]),
    });
  });

  it("gives the charter standing from this term's registration and the records", async () => {
    const index = await memberActivityIndex({ publicOnly: true });
    const standingOf = (row: Member) => index.of(row).standing;

    // 등록·기록 3 → 정회원(저장 지위는 준회원)
    expect(standingOf(m1())).toBe("regular");
    // legacy id로 남은 등록도 그 사람의 등록 — 기록 2 → 준회원
    expect(
      standingOf(memberRow({ id: "m3", name: "최준", legacyMemberId: "L3" })),
    ).toBe("associate");
    // 지난 학기 등록뿐, isAlumni → 동문
    expect(
      standingOf(
        memberRow({
          id: "m4",
          name: "정동문",
          status: "regular",
          isAlumni: true,
        }),
      ),
    ).toBe("alumni");
    // 미등록, 기록 2 → 이전 회원
    expect(standingOf(memberRow({ id: "L2", name: "박옛날" }))).toBe("former");
  });

  it("has no standing for a withdrawn member", async () => {
    const index = await memberActivityIndex({ publicOnly: false });
    expect(
      index.of(memberRow({ id: "m2", name: "이탈퇴", status: "withdrawn" }))
        .standing,
    ).toBeNull();
  });
});

describe("getPublicMembers", () => {
  it("merges a rejoined member's legacy records into one row with the standing", async () => {
    const roster = await getPublicMembers();
    expect(roster.map((m) => m.id)).toEqual(["m1", "L2", "m4", "m3"]);

    expect(roster.find((m) => m.id === "m1")).toEqual({
      id: "m1",
      name: "김수학",
      department: "수리과학부",
      joinedAt: "2024-03-01",
      roles: [],
      standing: "regular",
      hostedSeminars: 2,
      hostedStudies: 1,
    });
    expect(Object.fromEntries(roster.map((m) => [m.id, m.standing]))).toEqual({
      m1: "regular",
      L2: "former",
      m3: "associate",
      m4: "alumni",
    });
  });

  it("carries no attendance list and no stored status", async () => {
    const json = JSON.stringify(await getPublicMembers());
    expect(json).not.toContain('"attended"');
    expect(json).not.toContain('"attendeeIds"');
    expect(json).not.toContain('"status"');
    expect(json).not.toContain('"isAlumni"');
  });
});

describe("getPublicMember", () => {
  it("returns the public profile, the standing and the merged public activity", async () => {
    const result = await getPublicMember("m1");
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("redirectTo");
    const { member, activity, standing } = result as Exclude<
      typeof result,
      null | { redirectTo: string }
    >;
    expect(member).toEqual({
      id: "m1",
      name: "김수학",
      department: "수리과학부",
      joinedAt: "2024-03-01",
      roles: [],
    });
    expect(standing).toBe("regular");
    expect(activity.records).toBe(3);
    expect(activity.attended.map((a) => a.id)).toEqual(["a-dinner", "a-old"]);
  });

  it("answers a rejoined member's legacy id with the current page", async () => {
    expect(await getPublicMember("L1")).toEqual({ redirectTo: "/members/m1" });
  });

  it("shows a legacy member who never rejoined under the legacy id", async () => {
    const result = await getPublicMember("L2");
    expect(result).toMatchObject({
      member: { id: "L2", name: "박옛날" },
      standing: "former",
    });
  });

  it("knows no withdrawn or unknown member", async () => {
    expect(await getPublicMember("m2")).toBeNull();
    expect(await getPublicMember("nobody")).toBeNull();
  });
});
