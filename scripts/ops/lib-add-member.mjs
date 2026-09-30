/**
 * ops-add-member.mjs의 순수 부분 — 입력 규칙, 시각·학기, SQL. 부작용이 없어
 * src/lib/server/data/ops-add-member.test.ts가 PGlite(같은 마이그레이션) 위에서 검사한다.
 */

/** @param {unknown} value */
const b64 = (value) =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64");
/**
 * 입력값을 SQL 문자열로 만들지 않는다 — base64로 넘겨 DB 안에서 jsonb로 푼다.
 * @param {unknown} value
 */
export const jsonOf = (value) =>
  `convert_from(decode('${b64(value)}', 'base64'), 'UTF8')::jsonb`;

/**
 * src/lib/utils.ts normalizePhoneNumber와 같다.
 * @param {string} phone
 */
export function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11)
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone.trim();
}

/** @typedef {{ value: string } | { error: string }} RuleResult */

/** 가입 폼과 같은 규칙. @type {Record<'name'|'department'|'phone'|'studentId'|'email'|'background', (v: string) => RuleResult>} */
export const RULES = {
  name: (v) => {
    const s = v.trim();
    if (!s) return { error: "이름을 입력해 주세요." };
    if (s.length > 60) return { error: "이름은 60자 이하로 입력해 주세요." };
    return { value: s };
  },
  department: (v) => {
    const s = v.trim();
    if (!s) return { error: "학과를 입력해 주세요." };
    if (s.length > 100) return { error: "학과는 100자 이하로 입력해 주세요." };
    return { value: s };
  },
  phone: (v) => {
    const s = normalizePhone(v);
    return /^010-\d{4}-\d{4}$/.test(s)
      ? { value: s }
      : { error: "전화번호는 010-XXXX-XXXX 형식이어야 합니다." };
  },
  studentId: (v) => {
    const s = v.trim();
    return /^\d{4}-?\d{4,6}$/.test(s)
      ? { value: s }
      : { error: "학번을 2024-12345 형식으로 입력해 주세요." };
  },
  email: (v) => {
    const s = v.trim().toLowerCase();
    if (s.length > 200)
      return { error: "이메일은 200자 이하로 입력해 주세요." };
    if (!/^[^\s@,;<>()"'\\[\]]+@snu\.ac\.kr$/.test(s))
      return { error: "서울대학교 이메일(@snu.ac.kr)을 입력해 주세요." };
    return { value: s };
  },
  background: (v) => {
    const s = v.trim();
    return s.length > 2000
      ? { error: "배경지식은 2,000자 이하로 입력해 주세요." }
      : { value: s };
  },
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** @param {Date} d */
export function toKstIso(d) {
  const t = new Date(d.getTime() + KST_OFFSET_MS);
  /** @param {number} n @param {number} [w] */
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return (
    `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}` +
    `T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}+09:00`
  );
}
/** @param {Date} d */
export function termOf(d) {
  const t = new Date(d.getTime() + KST_OFFSET_MS);
  const year = t.getUTCFullYear();
  const month = t.getUTCMonth() + 1;
  /** @param {number} y */
  const yy = (y) => String(y % 100).padStart(2, "0");
  if (month >= 3 && month <= 8) return `${yy(year)}-1`;
  return `${yy(month >= 9 ? year : year - 1)}-2`;
}

/** 지금 상태에서 무엇이 일어날지 — 입력한 이메일에 관한 것만 읽는다. */
/** @param {string} email @param {string} term */
export const inspectSql = (email, term) => `
with input as (select ${jsonOf({ email, term })} as j),
info as (
  select i from app_tables t, jsonb_array_elements(t.doc -> 'rows') i, input
   where t.name = 'private-info' and lower(trim(i ->> 'email')) = input.j ->> 'email'
   limit 1),
member as (
  select m from app_tables t, jsonb_array_elements(t.doc -> 'rows') m
   where t.name = 'members' and m ->> 'id' = (select i ->> 'memberId' from info)
   limit 1)
select
  exists (select 1 from pg_proc where proname = 'flow_approve_application') as flow_exists,
  exists (select 1 from app_tables t, jsonb_array_elements(t.doc -> 'rows') a, input
           where t.name = 'applications'
             and lower(trim(a ->> 'email')) = input.j ->> 'email') as pending_app,
  (select i ->> 'memberId' from info) as info_member_id,
  (select m ->> 'id' from member) as member_id,
  (select m ->> 'name' from member) as member_name,
  (select m ->> 'status' from member) as member_status,
  exists (select 1 from app_tables t, jsonb_array_elements(t.doc -> 'rows') r, input
           where t.name = 'registrations'
             and r ->> 'memberId' = (select m ->> 'id' from member)
             and r ->> 'term' = input.j ->> 'term') as registered,
  exists (select 1 from app_tables t, jsonb_array_elements(t.doc -> 'rows') l, input
           where t.name = 'legacy-private-info'
             and lower(trim(l ->> 'email')) = input.j ->> 'email') as legacy;
`;

/**
 * 신청 행 추가와 승인 전환을 한 트랜잭션에서. 흐름이 거부하면(예외) 신청 행까지 되돌아간다.
 * 신청 표를 먼저 잠그고 같은 이메일의 대기 신청을 잠근 상태에서 다시 본다.
 */
/** @param {Record<string, unknown>} application @param {Record<string, unknown>} approval */
export const addSql = (application, approval) => `
do $$
declare
  j jsonb := ${jsonOf({ application, approval })};
  v_apps jsonb;
begin
  perform app_lock(array['applications']);
  v_apps := app_rows('applications');
  if exists (select 1 from jsonb_array_elements(v_apps) a
              where lower(trim(a ->> 'email')) = j -> 'application' ->> 'email') then
    raise exception 'CONFLICT' using detail = 'pending-application';
  end if;
  perform app_put('applications', v_apps || jsonb_build_array(j -> 'application'));
  perform flow_approve_application(j -> 'approval');
end $$;
`;

/** @param {string} email @param {string} term */
export const resultSql = (email, term) => `
with input as (select ${jsonOf({ email, term })} as j)
select i ->> 'memberId' as member_id,
       exists (select 1 from app_tables t2, jsonb_array_elements(t2.doc -> 'rows') r
                where t2.name = 'registrations'
                  and r ->> 'memberId' = i ->> 'memberId'
                  and r ->> 'term' = input.j ->> 'term') as registered
  from app_tables t, jsonb_array_elements(t.doc -> 'rows') i, input
 where t.name = 'private-info' and lower(trim(i ->> 'email')) = input.j ->> 'email'
 limit 1;
`;
