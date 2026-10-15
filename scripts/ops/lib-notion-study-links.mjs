/**
 * ops-notion-backfill-study-links.mjs의 순수 부분 — 노션 스터디 DB의 `활동 기록`
 * relation을 앱 스터디·활동과 짝짓고, 활동의 빈 `studyId`를 채우는 SQL을 만든다
 * (snumps-webpage/D-000045, D-000050). 부작용이 없어
 * src/lib/server/data/ops-notion-study-links.test.ts가 PGlite 위에서 검사한다.
 *
 * 짝짓기: 스터디는 제목+학기, 활동은 제목+시작일(YYYY-MM-DD) — 앞뒤 공백 제거, 노션·앱
 * 양쪽 모두 하나일 때만. **빈 칸만** — 이미 studyId가 있는 활동은 후보로 내지 않는다.
 * 종류가 '스터디'가 아닌 앱 활동도 내지 않는다(스터디 연결 대상, D-000053).
 * 그 밖은 건드리지 않고 이유와 함께 보고한다.
 */
import { jsonOf } from "./lib-add-member.mjs";

/**
 * @typedef {{ id: string, title: string, semester: string, activityIds: string[], relationTruncated: boolean }} NotionStudy
 * @typedef {{ id: string, title: string, start: string | null, type: string }} NotionActivity
 * @typedef {{ id: string, title: string, semester: string }} AppStudy
 * @typedef {{ id: string, title: string, start: string | null, type: string, studyId: string | null }} AppActivity
 * @typedef {{ studyId: string, activityId: string, notionStudy: NotionStudy, notionActivity: NotionActivity }} Pair
 */

/** 시작 시각의 날짜 부분 — "2025-03-05T19:00:00+09:00" → "2025-03-05". @param {string | null} start */
const dayOf = (start) => (start ? start.trim().slice(0, 10) : "");

/** @param {{ title: string, semester: string }} r */
const studyKey = (r) => JSON.stringify([r.title.trim(), r.semester.trim()]);
/** @param {{ title: string, start: string | null }} r */
const activityKey = (r) => JSON.stringify([r.title.trim(), dayOf(r.start)]);

/**
 * @template T
 * @param {T[]} rows @param {(r: T) => string} key
 * @returns {Map<string, T[]>}
 */
function groupBy(rows, key) {
  /** @type {Map<string, T[]>} */
  const out = new Map();
  for (const r of rows) out.set(key(r), [...(out.get(key(r)) ?? []), r]);
  return out;
}

/**
 * @param {NotionStudy[]} notionStudies
 * @param {NotionActivity[]} notionActivities
 * @param {AppStudy[]} appStudies
 * @param {AppActivity[]} appActivities
 * @returns {{ pairs: Pair[], unmatched: { title: string, reason: string }[] }}
 */
export function matchStudyLinks(
  notionStudies,
  notionActivities,
  appStudies,
  appActivities,
) {
  const notionById = new Map(notionActivities.map((a) => [a.id, a]));
  const notionByKey = groupBy(
    notionActivities.filter((a) => dayOf(a.start)),
    activityKey,
  );
  const appStudiesByKey = groupBy(appStudies, studyKey);
  const appActsByKey = groupBy(
    appActivities.filter((a) => dayOf(a.start)),
    activityKey,
  );

  /** @type {(Pair & { label: string })[]} */
  const found = [];
  /** @type {{ title: string, reason: string }[]} */
  const unmatched = [];
  for (const [key, rows] of groupBy(notionStudies, studyKey)) {
    const study = rows[0];
    const title = study.title.trim();
    const semester = study.semester.trim();
    const apps = appStudiesByKey.get(key) ?? [];
    /** @param {string} reason */
    const skip = (reason) => unmatched.push({ title, reason });
    if (rows.length > 1) {
      skip(`노션에 같은 분야명·학기(${semester}) ${rows.length}개`);
      continue;
    }
    if (apps.length === 0) {
      skip(`앱에 같은 제목·학기(${semester}) 없음`);
      continue;
    }
    if (apps.length > 1) {
      skip(`앱에 같은 제목·학기(${semester}) ${apps.length}개`);
      continue;
    }
    if (study.relationTruncated) {
      skip("노션 활동 기록 relation이 일부만 읽힘 — 직접 확인");
      continue;
    }
    if (study.activityIds.length === 0) {
      skip("노션 활동 기록 relation 없음");
      continue;
    }
    const appStudy = apps[0];
    for (const notionId of study.activityIds) {
      const na = notionById.get(notionId);
      if (!na) {
        skip("relation의 활동을 노션 활동 DB에서 찾지 못함");
        continue;
      }
      const day = dayOf(na.start);
      const label = `「${na.title.trim()}」 ${day}`;
      if (!day) {
        skip(`노션 활동에 일정 없음: 「${na.title.trim()}」`);
        continue;
      }
      const twins = notionByKey.get(activityKey(na)) ?? [];
      if (twins.length > 1) {
        skip(`노션에 같은 활동명·일정 ${twins.length}개: ${label}`);
        continue;
      }
      const acts = appActsByKey.get(activityKey(na)) ?? [];
      if (acts.length === 0) {
        skip(`앱에 같은 제목·시작일 활동 없음: ${label}`);
        continue;
      }
      if (acts.length > 1) {
        skip(`앱에 같은 제목·시작일 활동 ${acts.length}개: ${label}`);
        continue;
      }
      const act = acts[0];
      if (act.type !== "스터디") {
        skip(`앱 활동 종류가 스터디가 아님(${act.type}): ${label}`);
        continue;
      }
      if (act.studyId !== null) {
        skip(
          act.studyId === appStudy.id
            ? `이미 이 스터디에 연결됨: ${label}`
            : `이미 다른 스터디에 연결됨: ${label}`,
        );
        continue;
      }
      found.push({
        studyId: appStudy.id,
        activityId: act.id,
        notionStudy: study,
        notionActivity: na,
        label,
      });
    }
  }

  // 한 앱 활동을 여러 노션 스터디가 가리키면 어느 쪽도 쓰지 않는다
  const byActivity = groupBy(found, (p) => p.activityId);
  /** @type {Pair[]} */
  const pairs = [];
  for (const { label, ...pair } of found) {
    const n = byActivity.get(pair.activityId)?.length ?? 0;
    if (n > 1)
      unmatched.push({
        title: pair.notionStudy.title.trim(),
        reason: `노션 스터디 ${n}개가 같은 앱 활동을 가리킴: ${label}`,
      });
    else pairs.push(pair);
  }
  return { pairs, unmatched };
}

/** 짝짓기와 빈 칸 판단에 쓰는 앱 행 — 스터디(제목·학기)와 활동(제목·시작·종류·studyId). */
export const currentSql = () => `
select 'study' as kind,
       s ->> 'id' as id,
       s ->> 'title' as title,
       s ->> 'semester' as semester,
       null::text as start,
       null::text as type,
       null::text as study_id
  from app_tables t, jsonb_array_elements(t.doc -> 'rows') s
 where t.name = 'studies'
union all
select 'activity',
       a ->> 'id',
       a ->> 'title',
       null,
       a -> 'date' ->> 'start',
       a ->> 'type',
       a ->> 'studyId'
  from app_tables t, jsonb_array_elements(t.doc -> 'rows') a
 where t.name = 'activities'
 order by kind desc, title, id;
`;

/**
 * currentSql 결과 → { studies, activities }.
 * @param {Record<string, unknown>[]} rows
 * @returns {{ studies: AppStudy[], activities: AppActivity[] }}
 */
export function appRowsFrom(rows) {
  /** @param {unknown} v */
  const str = (v) => (v === null || v === undefined ? "" : String(v));
  /** @param {unknown} v */
  const orNull = (v) => (v === null || v === undefined ? null : String(v));
  return {
    studies: rows
      .filter((r) => r.kind === "study")
      .map((r) => ({
        id: str(r.id),
        title: str(r.title),
        semester: str(r.semester),
      })),
    activities: rows
      .filter((r) => r.kind === "activity")
      .map((r) => ({
        id: str(r.id),
        title: str(r.title),
        start: orNull(r.start),
        type: str(r.type),
        studyId: orNull(r.study_id),
      })),
  };
}

/** 활동 하나를 스터디에 잇는다(flow_set_activity_study, 메일 없음). @param {string} activityId @param {string} studyId */
export const linkSql = (activityId, studyId) =>
  `select flow_set_activity_study(${jsonOf({ activityId, studyId })}) as result;`;
