/**
 * ops-promote-regular.ts의 순수 부분 — 읽기 SQL, 조회 결과 → 승급 후보, 적용 SQL.
 * 부작용이 없어 src/lib/server/data/ops-promote-regular.test.ts가 PGlite(같은
 * 마이그레이션) 위에서 검사한다(snumps-webpage/D-000080).
 *
 * 후보는 매일 cron(services/member-standing.ts)과 **같은 순수 함수**로 고른다 —
 * `src/lib/domain/member-activity.ts`를 상대 경로로 import한다(`$lib` 별칭은 vite
 * 밖에서 깨진다, scripts/seed-dev.ts와 같은 방식). 적용은 `setStatus`와 같은
 * 필드(status, statusChangedAt, isAlumni: 박탈 이력이 없으면 true)를 쓰고, 쓰는
 * 순간에도 `associate`인 행만 바꾸며, 바꾼 행마다 audit `member.auto-promote`를
 * 같은 트랜잭션에 남긴다.
 */
import {
  memberActivityData,
  selectPromotionCandidates,
  type ActivityTables,
} from "../../src/lib/domain/member-activity";
import { termOf } from "../../src/lib/domain/term";
import { jsonOf } from "./lib-add-member.mjs";

/** 승급 판정에 필요한 표 — 회원은 id·legacyMemberId·status만(이름 등은 읽지 않는다). */
export const readSql = () => `
select
  (select coalesce(jsonb_agg(jsonb_build_object(
            'id', m ->> 'id',
            'legacyMemberId', m -> 'legacyMemberId',
            'status', m ->> 'status')), '[]'::jsonb)
     from app_tables t, jsonb_array_elements(t.doc -> 'rows') m
    where t.name = 'members') as members,
  ${["registrations", "seminars", "studies", "activities", "events"]
    .map(
      (name) =>
        `coalesce((select doc -> 'rows' from app_tables where name = '${name}'), '[]'::jsonb) as ${name}`,
    )
    .join(",\n  ")};
`;

export type PromotionTables = ActivityTables & {
  members: { id: string; legacyMemberId: string | null; status: string }[];
  registrations: { memberId: string; term: string }[];
};

/** CLI 출력의 jsonb 열은 값으로도, 문자열로도 올 수 있다. */
function jsonValue(value: unknown): unknown {
  return typeof value === "string" ? JSON.parse(value) : value;
}

/** `readSql()` 결과 행 하나 → 표들. */
export function tablesFrom(row: Record<string, unknown>): PromotionTables {
  const list = (key: string) => {
    const value = jsonValue(row[key]);
    if (!Array.isArray(value)) throw new Error(`${key}: 행 배열이 아니다`);
    return value;
  };
  return {
    members: list("members").map((m) => ({
      id: String(m.id),
      legacyMemberId: m.legacyMemberId ?? null,
      status: String(m.status),
    })),
    registrations: list("registrations"),
    seminars: list("seminars"),
    studies: list("studies"),
    activities: list("activities"),
    events: list("events"),
  };
}

/** 지금 학기의 승급 후보 — cron과 같은 규칙(selectPromotionCandidates). */
export function candidatesFrom(tables: PromotionTables, now: Date): string[] {
  const { data } = memberActivityData(tables, { publicOnly: false });
  return selectPromotionCandidates({
    members: tables.members,
    registrations: tables.registrations,
    term: termOf(now),
    data,
  });
}

/**
 * 후보를 `regular`로 — 한 트랜잭션(DO 블록, ops-add-member의 addSql과 같은 방식).
 * 회원 표를 잠근 뒤 그때도 `associate`인 후보만 바꾸고, 바꾼 행에만 audit 행을
 * 남긴다. 바뀐 것이 없으면 쓰지 않는다. 결과는 `resultSql`로 다시 읽는다.
 * `audits`는 후보마다 audit id 하나(앱의 audit id와 같은 ULID).
 */
export const applySql = (input: {
  memberIds: string[];
  now: string;
  audits: { id: string; memberId: string }[];
}) => `
do $$
declare
  j jsonb := ${jsonOf(input)};
  v_rows jsonb;
  v_promoted text[];
begin
  perform app_lock(array['members']);
  v_rows := app_rows('members');
  select coalesce(array_agg(m ->> 'id'), '{}') into v_promoted
    from jsonb_array_elements(v_rows) m
   where m ->> 'status' = 'associate' and (j -> 'memberIds') ? (m ->> 'id');
  if cardinality(v_promoted) = 0 then return; end if;

  perform app_put('members', (
    select jsonb_agg(
             case when m ->> 'id' = any (v_promoted)
                  then m || jsonb_build_object(
                         'status', 'regular',
                         'statusChangedAt', j ->> 'now',
                         'isAlumni', case when coalesce((m ->> 'alumniRevoked')::boolean, false)
                                          then m -> 'isAlumni' else 'true'::jsonb end)
                  else m end
             order by ord)
      from jsonb_array_elements(v_rows) with ordinality as x(m, ord)));

  insert into audit_log (id, at, actor, action, target_tb, target_id, detail)
  select a ->> 'id', (j ->> 'now')::timestamptz, 'system', 'member.auto-promote',
         'members', a ->> 'memberId',
         '{"status": "regular", "source": "ops-promote-regular"}'::jsonb
    from jsonb_array_elements(j -> 'audits') a
   where a ->> 'memberId' = any (v_promoted);
end $$;
`;

/** 적용 뒤 재조회 — 회원 id와 저장 지위만. */
export const resultSql = (memberIds: string[]) => `
with input as (select ${jsonOf({ memberIds })} as j)
select m ->> 'id' as id, m ->> 'status' as status
  from app_tables t, jsonb_array_elements(t.doc -> 'rows') m, input
 where t.name = 'members' and (input.j -> 'memberIds') ? (m ->> 'id')
 order by m ->> 'id';
`;
