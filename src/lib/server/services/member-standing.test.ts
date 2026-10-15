import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import {
  __auditRows,
  __reset,
  readVersion,
} from "$lib/server/data/store-memory";
import {
  _resetDataLayerForTests,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { currentTerm } from "$lib/server/core/semester";
import type { Member } from "$lib/server/data/schemas";
import {
  promoteQualifiedMembers,
  promotionCandidates,
} from "./member-standing";

/**
 * 매일 자동 승급 (snumps-webpage/D-000073·078·079). 운영 회원 가운데 이번 학기
 * 등록·`associate`·활동 기록 3회 이상인 회원을 `regular`로 — setStatus와 같은
 * 필드(statusChangedAt, isAlumni: alumniRevoked가 아니면 true), 한 번의
 * mutate("members"), 회원마다 audit `member.auto-promote`. 강등은 없다.
 */

const NOW = new Date("2026-10-15T04:00:00+09:00");
const TERM = currentTerm(NOW);
const OLD_STAMP = "2026-03-02T10:00:00+09:00";

function memberRow(over: Partial<Member> & Pick<Member, "id">): Member {
  return {
    name: `회원 ${over.id}`,
    department: "수리과학부",
    joinedAt: "2026-03-02",
    status: "associate",
    statusChangedAt: OLD_STAMP,
    withdrawal: null,
    isAlumni: false,
    alumniRevoked: false,
    alumniRevocationReason: null,
    roles: [],
    isAdmin: false,
    publicContact: null,
    project: null,
    legacyMemberId: null,
    sourceRequestId: null,
    ...over,
  };
}

/** 회식 n건 — 참석 1건당 기록 1회. */
function dinners(n: number, attendeeIds: string[]) {
  return Array.from({ length: n }, (_, i) => ({
    id: `d${i}`,
    title: `회식 ${i}`,
    date: { start: `2026-09-0${i + 1}T19:00:00+09:00`, end: null },
    type: "회식" as const,
    attendeeIds,
    studyId: null,
    sourceRequestId: null,
  }));
}

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of [
    "members",
    "registrations",
    "seminars",
    "studies",
    "activities",
    "events",
  ]) {
    await invalidateCache(`table_${t}`);
  }
  await mutate("members", () => [
    memberRow({ id: "m-qual" }), // 등록·기록 3 → 승급
    memberRow({ id: "m-two" }), // 등록·기록 2
    memberRow({ id: "m-unreg" }), // 미등록·기록 3
    memberRow({ id: "m-reg", status: "regular", isAlumni: true }), // 이미 정회원
    memberRow({
      id: "m-gone",
      status: "withdrawn",
      withdrawal: {
        requestedAt: OLD_STAMP,
        previousStatus: "associate",
        holdBy: null,
        holdAt: null,
      },
    }),
    memberRow({ id: "m-revoked", alumniRevoked: true }), // 등록·기록 3, 박탈 이력
  ]);
  await mutate("registrations", () =>
    ["m-qual", "m-two", "m-reg", "m-gone", "m-revoked"].map((memberId) => ({
      id: `r-${memberId}`,
      memberId,
      term: TERM,
      registeredAt: OLD_STAMP,
      sourceRequestId: null,
    })),
  );
  await mutate("activities", () => [
    ...dinners(3, ["m-qual", "m-unreg", "m-reg", "m-gone", "m-revoked"]),
    {
      ...dinners(1, ["m-two"])[0],
      id: "x1",
    },
    {
      ...dinners(1, ["m-two"])[0],
      id: "x2",
    },
  ]);
});

describe("promotionCandidates", () => {
  it("lists only registered associates with enough records", async () => {
    expect((await promotionCandidates(NOW)).sort()).toEqual([
      "m-qual",
      "m-revoked",
    ]);
  });
});

describe("promoteQualifiedMembers", () => {
  it("promotes with the fields setStatus writes and audits each member", async () => {
    expect(await promoteQualifiedMembers(NOW)).toBe(2);

    const byId = new Map((await getTable("members")).map((m) => [m.id, m]));
    expect(byId.get("m-qual")).toMatchObject({
      status: "regular",
      isAlumni: true,
    });
    expect(byId.get("m-qual")!.statusChangedAt).not.toBe(OLD_STAMP);
    // 박탈 이력이 있으면 승급해도 동문 표시는 돌아오지 않는다
    expect(byId.get("m-revoked")).toMatchObject({
      status: "regular",
      isAlumni: false,
      alumniRevoked: true,
    });
    // 나머지는 그대로
    for (const id of ["m-two", "m-unreg"])
      expect(byId.get(id)).toMatchObject({
        status: "associate",
        statusChangedAt: OLD_STAMP,
      });
    expect(byId.get("m-reg")).toMatchObject({
      status: "regular",
      statusChangedAt: OLD_STAMP,
    });
    expect(byId.get("m-gone")!.status).toBe("withdrawn");

    const audits = (await __auditRows()).filter(
      (r) => r.action === "member.auto-promote",
    );
    expect(
      audits.map((r) => [r.actor, r.target_tb, r.target_id]).sort(),
    ).toEqual([
      ["system", "members", "m-qual"],
      ["system", "members", "m-revoked"],
    ]);
  });

  it("writes the members table once, and not at all when nobody qualifies", async () => {
    const before = await readVersion("table", "members");
    await promoteQualifiedMembers(NOW);
    expect(await readVersion("table", "members")).toBe(before! + 1);

    // 두 번째 실행: 대상 없음 → 쓰지 않는다
    const after = await readVersion("table", "members");
    expect(await promoteQualifiedMembers(NOW)).toBe(0);
    expect(await readVersion("table", "members")).toBe(after);
  });
});
