/**
 * ops-fix-approval-dates.mjs의 순수 부분 — 대상 검출 SQL, 입력 → 일정, 적용 SQL.
 * 부작용이 없어 src/lib/server/data/ops-fix-approval-dates.test.ts가 PGlite(같은
 * 마이그레이션) 위에서 검사한다(snumps-webpage/D-000012).
 *
 * 대상: 9/15 수정(837676e) 전 승인 코드가 남긴 세미나 — 신청 경유이고 공개됐는데
 * 세미나에 일정이 없고, 연결된 활동과 출석 이벤트의 시각이 같은(승인을 누른 시각)
 * 것. 고치는 길은 관리자 화면의 "일정 수정"과 같은 SQL 흐름
 * (flow_update_seminar_schedule)이다 — 세미나·활동·이벤트를 한 트랜잭션에 바꾸고,
 * 메일은 서비스 계층만 보내므로 여기서는 나가지 않는다.
 */
import { jsonOf } from "./lib-add-member.mjs";

/** 장소 상한 — 관리자 일정 입력(domain/admin-seminars.ts)과 같다. */
const LOCATION_MAX = 160;

export const targetsSql = () => `
select s ->> 'id' as id,
       s ->> 'title' as title,
       a -> 'date' ->> 'start' as wrong_start
  from app_tables st
 cross join lateral jsonb_array_elements(st.doc -> 'rows') s
  join app_tables at on at.name = 'activities'
 cross join lateral jsonb_array_elements(at.doc -> 'rows') a
 where st.name = 'seminars'
   and coalesce(s ->> 'sourceRequestId', '') <> ''
   and s ->> 'publicationStatus' = 'published'
   and jsonb_typeof(s -> 'schedule') is distinct from 'object'
   and a ->> 'id' = s ->> 'activityId'
   and exists (
     select 1
       from app_tables et, jsonb_array_elements(et.doc -> 'rows') e
      where et.name = 'events'
        and e ->> 'activityId' = s ->> 'activityId'
        and e -> 'date' ->> 'start' = a -> 'date' ->> 'start')
 order by a -> 'date' ->> 'start', s ->> 'id';
`;

/** @param {string} value */
function validDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = m.slice(1).map(Number);
  if (y < 2000 || y > 2099) return false;
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}
/** @param {string} value */
const validTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/**
 * 운영자 입력 → 일정. 시작을 비우면 시각 미정(자정 + startTime null), 그때
 * 종료는 버린다 — 시작을 모르는데 종료만 있는 일정은 앞뒤가 맞지 않는다.
 * @param {{ date: string, start: string, end: string, location: string }} input
 * @returns {{ ok: true, schedule: { startsAt: string, startTime: string | null, endsAt: string | null, location: string } } | { ok: false, issue: string }}
 */
export function scheduleFrom(input) {
  const date = input.date.trim();
  const start = input.start.trim();
  const end = input.end.trim();
  const location = input.location.trim();
  if (!validDate(date))
    return { ok: false, issue: "날짜는 YYYY-MM-DD 형식의 실제 날짜" };
  if (start && !validTime(start))
    return { ok: false, issue: "시작 시각은 HH:MM (24시간)" };
  if (start && end && !validTime(end))
    return { ok: false, issue: "종료 시각은 HH:MM (24시간)" };
  if (start && end && end <= start)
    return { ok: false, issue: "종료는 시작보다 뒤여야 함" };
  if (!location) return { ok: false, issue: "장소를 입력해야 함" };
  if (location.length > LOCATION_MAX)
    return { ok: false, issue: `장소는 ${LOCATION_MAX}자 이하` };
  return {
    ok: true,
    schedule: {
      startsAt: `${date}T${start || "00:00"}:00+09:00`,
      startTime: start || null,
      endsAt: start && end ? `${date}T${end}:00+09:00` : null,
      location,
    },
  };
}

/**
 * @param {string} id
 * @param {{ startsAt: string, startTime: string | null, endsAt: string | null, location: string }} schedule
 * @param {string} now  KST ISO — 흐름이 만료된 이벤트를 다시 열지 판단할 때 쓴다
 */
export const applySql = (id, schedule, now) =>
  `select flow_update_seminar_schedule(${jsonOf({ id, schedule, now })}) as result;`;

/** 적용 뒤 재조회 — 세미나 일정과 활동·이벤트 시각. @param {string[]} ids */
export const resultSql = (ids) => `
with input as (select ${jsonOf(ids)} as j)
select s ->> 'id' as id,
       s ->> 'title' as title,
       s -> 'schedule' as schedule,
       (select a -> 'date' from app_tables at, jsonb_array_elements(at.doc -> 'rows') a
         where at.name = 'activities' and a ->> 'id' = s ->> 'activityId') as activity_date,
       (select jsonb_agg(e -> 'date') from app_tables et, jsonb_array_elements(et.doc -> 'rows') e
         where et.name = 'events' and e ->> 'activityId' = s ->> 'activityId') as event_dates
  from app_tables st, jsonb_array_elements(st.doc -> 'rows') s, input
 where st.name = 'seminars' and (input.j ? (s ->> 'id'));
`;
