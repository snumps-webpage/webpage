import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __auditRows, __reset, __sql, readVersion } from "./store-memory";
import { expectTablesValid } from "./expect-tables-valid";
import { _resetDataLayerForTests, getTable, mutate } from "./tables";
import { invalidateCache } from "$lib/server/cache";
import { currentTerm } from "$lib/server/core/semester";
import type { Member } from "./schemas";
import { promotionCandidates } from "$lib/server/services/member-standing";
import {
  applySql,
  candidatesFrom,
  readSql,
  resultSql,
  tablesFrom,
} from "../../../../scripts/ops/lib-promote-regular";

/**
 * scripts/ops/ops-promote-regular.ts — 첫 일괄 승급(snumps-webpage/D-000080).
 * 같은 마이그레이션을 쓰는 PGlite에서 읽기 SQL → 후보 → 적용 SQL을 돌린다.
 * 후보는 매일 cron(services/member-standing.ts)과 같은 순수 함수로 고르고,
 * 적용은 setStatus와 같은 필드 + audit `member.auto-promote`를 쓴다.
 */

const NOW = new Date("2026-10-15T12:00:00+09:00");
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

/** 스터디 세션 활동 — `<studyId>:<date>` 키. */
function session(no: number, attendeeIds: string[]) {
  const start = `2026-09-${String(no).padStart(2, "0")}T19:00:00+09:00`;
  return {
    id: `st1-s${no}`,
    title: `스터디 ${no}회차`,
    date: { start, end: null },
    type: "스터디" as const,
    attendeeIds,
    studyId: "st1",
    sourceRequestId: `st1:${start}`,
  };
}

const TABLES = [
  "members",
  "registrations",
  "seminars",
  "studies",
  "activities",
  "events",
];

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of TABLES) await invalidateCache(`table_${t}`);

  await mutate("members", () => [
    // 세션 4개 중 3 참석(1) + 회식 2 = 3 → 후보
    memberRow({ id: "m-qual" }),
    // legacy id의 기록·등록까지 합쳐 3 → 후보, 박탈 이력
    memberRow({ id: "m-legacy", legacyMemberId: "L1", alumniRevoked: true }),
    // 세션 4개 중 2 참석(0) + 회식 2 = 2 → 아님
    memberRow({ id: "m-two" }),
    memberRow({ id: "m-reg", status: "regular", isAlumni: true }),
  ]);
  await mutate("registrations", () =>
    [
      ["m-qual", currentTerm(NOW)],
      ["L1", currentTerm(NOW)],
      ["m-two", currentTerm(NOW)],
      ["m-reg", currentTerm(NOW)],
    ].map(([memberId, term]) => ({
      id: `r-${memberId}`,
      memberId,
      term,
      registeredAt: OLD_STAMP,
      sourceRequestId: null,
    })),
  );
  await mutate("activities", () => [
    session(1, ["m-qual", "m-two"]),
    session(2, ["m-qual", "m-two"]),
    session(3, ["m-qual"]),
    session(4, []),
    ...[1, 2].map((i) => ({
      id: `d${i}`,
      title: `회식 ${i}`,
      date: { start: `2026-10-0${i}T19:00:00+09:00`, end: null },
      type: "회식" as const,
      attendeeIds: ["m-qual", "m-two", "m-reg", "L1"],
      studyId: null,
      sourceRequestId: null,
    })),
    {
      id: "old",
      title: "이주된 스터디",
      date: { start: "2023-09-01T00:00:00+09:00", end: null },
      type: "스터디" as const,
      attendeeIds: ["L1"],
      studyId: null,
      sourceRequestId: null,
    },
  ]);
});
afterEach(expectTablesValid);

async function readTables() {
  const [row] = await __sql<Record<string, unknown>>(readSql());
  return tablesFrom(row);
}

describe("readSql + candidatesFrom", () => {
  it("picks the same members as the daily cron", async () => {
    const fromScript = candidatesFrom(await readTables(), NOW).sort();
    expect(fromScript).toEqual(["m-legacy", "m-qual"]);
    expect((await promotionCandidates(NOW)).sort()).toEqual(fromScript);
  });

  it("reads no member name", async () => {
    const [row] = await __sql<Record<string, unknown>>(readSql());
    expect(JSON.stringify(row.members)).not.toContain("회원 ");
  });
});

describe("applySql", () => {
  const apply = (memberIds: string[]) =>
    __sql(
      applySql({
        memberIds,
        now: "2026-10-15T12:00:00+09:00",
        audits: memberIds.map((memberId) => ({
          id: `a-${memberId}`,
          memberId,
        })),
      }),
    );

  it("promotes with the setStatus fields and one audit row each", async () => {
    await apply(["m-qual", "m-legacy"]);
    for (const t of TABLES) await invalidateCache(`table_${t}`);

    const byId = new Map((await getTable("members")).map((m) => [m.id, m]));
    expect(byId.get("m-qual")).toMatchObject({
      status: "regular",
      statusChangedAt: "2026-10-15T12:00:00+09:00",
      isAlumni: true,
    });
    expect(byId.get("m-legacy")).toMatchObject({
      status: "regular",
      isAlumni: false,
      alumniRevoked: true,
    });
    expect(byId.get("m-two")).toMatchObject({
      status: "associate",
      statusChangedAt: OLD_STAMP,
    });

    const audits = (await __auditRows()).filter(
      (r) => r.action === "member.auto-promote",
    );
    expect(audits.map((r) => [r.id, r.actor, r.target_id])).toEqual([
      ["a-m-legacy", "system", "m-legacy"],
      ["a-m-qual", "system", "m-qual"],
    ]);

    const result = await __sql<{ id: string; status: string }>(
      resultSql(["m-qual", "m-legacy"]),
    );
    expect(result).toEqual([
      { id: "m-legacy", status: "regular" },
      { id: "m-qual", status: "regular" },
    ]);
  });

  it("touches only rows still associate — no write and no audit otherwise", async () => {
    const before = await readVersion("table", "members");
    await apply(["m-reg"]);
    expect(await readVersion("table", "members")).toBe(before);
    expect(
      (await __auditRows()).filter((r) => r.action === "member.auto-promote"),
    ).toEqual([]);
  });
});
