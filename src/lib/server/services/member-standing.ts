import { getTable, mutate } from "$lib/server/data/tables";
import { audit } from "$lib/server/data/audit";
import { currentTerm } from "$lib/server/core/semester";
import { toKstIso } from "$lib/server/core/time";
import {
  memberActivityData,
  selectPromotionCandidates,
} from "$lib/domain/member-activity";

/**
 * 매일 자동 승급 (snumps-webpage/D-000073·078·079) — 회칙 제4조 ④ "정회원 자격은
 * 요건 충족 즉시 자동적으로 취득된다". maintenance cron의 한 단계로 돈다
 * (services/maintenance.ts `promote`).
 *
 * 대상은 운영 `members`뿐이다 — legacy 행은 읽기 전용이다(`data/directory.ts`).
 * 활동 기록은 legacy id의 것까지 그 사람의 것으로 센다(`legacyMemberId`).
 * 강등은 하지 않는다.
 */

/** 이번 학기 등록·`associate`·활동 기록 기준 이상인 운영 회원 id. */
export async function promotionCandidates(now: Date): Promise<string[]> {
  const [members, registrations, seminars, studies, activities, events] =
    await Promise.all([
      getTable("members"),
      getTable("registrations"),
      getTable("seminars"),
      getTable("studies"),
      getTable("activities"),
      getTable("events"),
    ]);
  const { data } = memberActivityData(
    { seminars, studies, activities, events },
    { publicOnly: false },
  );
  return selectPromotionCandidates({
    members,
    registrations,
    term: currentTerm(now),
    data,
  });
}

/**
 * 후보를 `regular`로 — `setStatus`와 같은 필드(statusChangedAt, isAlumni:
 * 박탈 이력이 없으면 true). 한 번의 `mutate("members")`로 쓰고, 쓰는 순간에도
 * `associate`인 행만 바꾼다(그 사이 관리자가 바꾼 지위를 덮지 않는다). 대상이
 * 없으면 쓰지 않는다. 회원마다 audit `member.auto-promote`. 승급한 수를 돌려준다.
 */
export async function promoteQualifiedMembers(now: Date): Promise<number> {
  const candidates = new Set(await promotionCandidates(now));
  if (candidates.size === 0) return 0;

  let promoted: string[] = [];
  await mutate("members", (rows) => {
    // CAS 충돌로 다시 불릴 수 있다 — 매번 새로 센다
    promoted = [];
    return rows.map((m) => {
      if (!candidates.has(m.id) || m.status !== "associate") return m;
      promoted.push(m.id);
      return {
        ...m,
        status: "regular" as const,
        statusChangedAt: toKstIso(now),
        isAlumni: m.alumniRevoked ? m.isAlumni : true,
      };
    });
  });
  for (const targetId of promoted) {
    await audit({
      actorMemberId: "system",
      action: "member.auto-promote",
      targetTable: "members",
      targetId,
      detail: { status: "regular" },
    });
  }
  return promoted.length;
}
