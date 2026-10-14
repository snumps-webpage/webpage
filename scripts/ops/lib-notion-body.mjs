/**
 * ops-notion-backfill-body.mjs의 순수 부분 — 노션 페이지 본문 블록에서 영상
 * 링크·선수지식·소요시간 후보를 뽑고, 노션 행과 앱 세미나를 짝짓고, 빈 칸을 채우는
 * SQL을 만든다(snumps-webpage/D-000007, D-000011). 부작용이 없어
 * src/lib/server/data/ops-notion-body.test.ts가 PGlite 위에서 검사한다.
 *
 * 후보는 **제안**이다 — 어느 것도 자동으로 쓰지 않는다. 운영자가 CLI에서 하나씩
 * 채택·수정·건너뛴다. 문장 속 표기(kind "sentence")는 그 문장을 그대로 보여 준다.
 */
import { jsonOf } from "./lib-add-member.mjs";

/**
 * 앱 규칙과 같은 상한 — 원천은 src/lib/domain/seminar-videos.ts(SEMINAR_VIDEO_LIMITS)와
 * src/lib/domain/seminars.ts(SEMINAR_DURATION_MINUTES). 노드 스크립트는 TS를 직접
 * 못 읽어 값을 옮겨 적고, 테스트가 둘이 같은지 본다.
 */
export const LIMITS = {
  video: { count: 10, title: 80, url: 2_048 },
  duration: { min: 10, max: 600 },
  // 세미나 신청서의 선수지식 상한(domain/seminars.ts)
  prerequisites: 2_000,
};

const YOUTUBE =
  /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/[^\s)<>"']+|youtu\.be\/[^\s)<>"']+)/g;
const TRAILING = /[.,;:!?。」）)\]]+$/;
const PREREQ = /선수\s*지식/;
const PREREQ_LABEL = /선수\s*지식\s*[:：]\s*(.+)$/;
const DURATION = /소요\s*시간/;
const DURATION_LABEL = /소요\s*시간\s*[:：]/;

/** @param {string} raw */
function normalizeVideoUrl(raw) {
  return raw.replace(TRAILING, "").replace(/^http:\/\//, "https://");
}

/** "1시간 30분" → 90, 숫자가 없거나 앱 범위 밖이면 null. @param {string} text */
function minutesIn(text) {
  const rest = text.replace(DURATION, " ");
  const h = /(\d+)\s*시간/.exec(rest);
  const m = /(\d+)\s*분/.exec(rest);
  if (!h && !m) return null;
  const minutes = (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
  return minutes >= LIMITS.duration.min && minutes <= LIMITS.duration.max
    ? minutes
    : null;
}

/**
 * @typedef {{ type: string, text: string, links: { href: string, text: string }[] }} Block
 * @typedef {{ videos: { url: string, title: string }[], prerequisites: { value: string, kind: "label" | "sentence" }[], duration: { minutes: number | null, text: string, kind: "label" | "sentence" }[] }} Candidates
 */

/** @param {Block[]} blocks @returns {Candidates} */
export function candidatesFrom(blocks) {
  /** @type {Map<string, string>} */
  const videos = new Map();
  /** @type {Candidates["prerequisites"]} */
  const prerequisites = [];
  /** @type {Candidates["duration"]} */
  const duration = [];
  for (const b of blocks) {
    const text = b.text.trim();
    for (const link of b.links) {
      if (/youtu/.test(link.href)) {
        const url = normalizeVideoUrl(link.href);
        const label = link.text.trim();
        const title = label && normalizeVideoUrl(label) !== url ? label : "";
        if (!videos.has(url) || (!videos.get(url) && title))
          videos.set(url, title);
      }
    }
    for (const m of text.matchAll(YOUTUBE)) {
      const url = normalizeVideoUrl(m[0]);
      if (!videos.has(url)) videos.set(url, "");
    }
    if (PREREQ.test(text)) {
      const label = PREREQ_LABEL.exec(text);
      prerequisites.push(
        label
          ? { value: label[1].trim(), kind: "label" }
          : { value: text, kind: "sentence" },
      );
    }
    if (DURATION.test(text)) {
      duration.push({
        minutes: minutesIn(text),
        text,
        kind: DURATION_LABEL.test(text) ? "label" : "sentence",
      });
    }
  }
  return {
    videos: [...videos].map(([url, title]) => ({ url, title })),
    prerequisites,
    duration,
  };
}

/**
 * 노션 행 ↔ 앱 세미나 짝짓기 — 제목·학기(앞뒤 공백 제거)가 같고 양쪽 모두 하나일
 * 때만. 그 밖은 건드리지 않고 이유와 함께 보고한다(ops-notion-backfill-seminars와 같은 규칙).
 * @param {{ id: string, title: string, semester: string }[]} notionRows
 * @param {{ id: string, title: string, semester: string }[]} seminars
 */
export function matchSeminars(notionRows, seminars) {
  /** @param {{ title: string, semester: string }} r */
  const keyOf = (r) => JSON.stringify([r.title.trim(), r.semester.trim()]);
  /** @type {Map<string, typeof notionRows>} */
  const byNotion = new Map();
  for (const r of notionRows)
    byNotion.set(keyOf(r), [...(byNotion.get(keyOf(r)) ?? []), r]);
  /** @type {Map<string, typeof seminars>} */
  const bySeminar = new Map();
  for (const s of seminars)
    bySeminar.set(keyOf(s), [...(bySeminar.get(keyOf(s)) ?? []), s]);

  /** @type {{ notionId: string, seminarId: string }[]} */
  const pairs = [];
  /** @type {{ title: string, semester: string, reason: string }[]} */
  const unmatched = [];
  for (const [key, rows] of byNotion) {
    const { title, semester } = {
      title: rows[0].title.trim(),
      semester: rows[0].semester.trim(),
    };
    const apps = bySeminar.get(key) ?? [];
    if (rows.length > 1)
      unmatched.push({
        title,
        semester,
        reason: `노션에 같은 제목·학기 ${rows.length}개`,
      });
    else if (apps.length === 0)
      unmatched.push({ title, semester, reason: "앱에 같은 제목·학기 없음" });
    else if (apps.length > 1)
      unmatched.push({
        title,
        semester,
        reason: `앱에 같은 제목·학기 ${apps.length}개`,
      });
    else pairs.push({ notionId: rows[0].id, seminarId: apps[0].id });
  }
  return { pairs, unmatched };
}

/** 빈 칸 판단에 쓰는 세미나 필드 — 영상·선수지식·소요시간. */
export const currentSql = () => `
select s ->> 'id' as id,
       s ->> 'title' as title,
       s ->> 'semester' as semester,
       coalesce(s -> 'videos', '[]'::jsonb) as videos,
       coalesce(s ->> 'prerequisites', '') as prerequisites,
       (s ->> 'durationMinutes')::int as duration_minutes
  from app_tables t, jsonb_array_elements(t.doc -> 'rows') s
 where t.name = 'seminars'
 order by s ->> 'semester', s ->> 'title';
`;

/**
 * @typedef {{ videos?: { url: string, title: string }[], prerequisites?: string, durationMinutes?: number }} Patch
 */

/**
 * 쓰기 전 검사 — flow_update_seminar_record에는 zod 관문이 없으므로 앱 규칙을
 * 여기서 먼저 본다. 문제가 없으면 null.
 * @param {Patch} patch
 */
export function patchIssue(patch) {
  if (patch.videos) {
    if (patch.videos.length > LIMITS.video.count)
      return `영상은 ${LIMITS.video.count}개까지`;
    for (const v of patch.videos) {
      if (!/^https:\/\/\S+$/.test(v.url) || v.url.length > LIMITS.video.url)
        return `영상 링크가 규칙에 맞지 않음: ${v.url}`;
      if (v.title.length > LIMITS.video.title)
        return `영상 제목은 ${LIMITS.video.title}자 이하`;
    }
  }
  if (patch.prerequisites !== undefined) {
    if (!patch.prerequisites.trim()) return "선수지식이 비어 있음";
    if (patch.prerequisites.length > LIMITS.prerequisites)
      return `선수지식은 ${LIMITS.prerequisites}자 이하`;
  }
  if (patch.durationMinutes !== undefined) {
    const m = patch.durationMinutes;
    if (
      !Number.isInteger(m) ||
      m < LIMITS.duration.min ||
      m > LIMITS.duration.max
    )
      return `소요 시간은 ${LIMITS.duration.min}~${LIMITS.duration.max}분 정수`;
  }
  return null;
}

/** @param {string} id @param {Patch} patch */
export const patchSql = (id, patch) =>
  `select flow_update_seminar_record(${jsonOf({ id, patch })}) as result;`;
