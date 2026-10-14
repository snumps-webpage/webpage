import { compareSemesters } from "./semester-order";

/**
 * 멤버별 활동 정도 — 노션 회원 DB의 주최·참석·활동회원 칸을 옮긴 순수 집계
 * (snumps-webpage/D-000042). 공개 명단과 관리자 화면이 같은 함수로 그린다;
 * 무엇을 넣을지(숨김 활동·비공개 세미나 제외 여부)는 부르는 쪽이 정한다
 * (server/public/member-activity.ts).
 *
 * 한 사람은 id가 둘일 수 있다 — 이주된 기록은 legacy id를 가리키고, 재가입한
 * 회원의 새 행은 `legacyMemberId`로 그것을 잇는다. 그래서 id **집합**을 받고,
 * 기록 한 건은 집합의 id가 몇 개 걸리든 한 번만 센다.
 */

/**
 * 활동회원 창(일). 노션 공식 `dateBetween(now(), dateEnd(일정), "days") <= 183`.
 */
export const ACTIVE_WINDOW_DAYS = 183;

/** 활동회원 판정에 들어가는 활동 종류 — 회식·회의·기타는 세지 않는다. */
const ACTIVE_TYPES: ReadonlySet<string> = new Set(["세미나", "스터디"]);

const DAY_MS = 86_400_000;

export type ActivityRef = {
  id: string;
  title: string;
  type: string;
  start: string;
  end: string | null;
};

export type HostedRef = { id: string; title: string; semester: string };

export type MemberActivity = {
  hostedSeminars: HostedRef[];
  hostedStudies: HostedRef[];
  /** 최신순 */
  attended: ActivityRef[];
  countsByType: Record<string, number>;
  active: boolean;
};

export type MemberActivityData = {
  seminars: readonly (HostedRef & { presenterIds: readonly string[] })[];
  studies: readonly (HostedRef & { organizerIds: readonly string[] })[];
  activities: readonly (ActivityRef & { attendeeIds: readonly string[] })[];
};

/**
 * 노션 `dateBetween(now, 끝, "days")`처럼 지난 날수를 정수로 잘라 비교한다.
 * 미래 활동은 음수라 언제나 창 안이다.
 */
function withinActiveWindow(a: ActivityRef, now: Date): boolean {
  const elapsedDays = Math.floor(
    (now.getTime() - Date.parse(a.end ?? a.start)) / DAY_MS,
  );
  return elapsedDays <= ACTIVE_WINDOW_DAYS;
}

function hostedBy<T extends HostedRef>(
  rows: readonly T[],
  hostIds: (row: T) => readonly string[],
  ids: ReadonlySet<string>,
): HostedRef[] {
  return rows
    .filter((row) => hostIds(row).some((id) => ids.has(id)))
    .map(({ id, title, semester }) => ({ id, title, semester }))
    .sort((a, b) => compareSemesters(b.semester, a.semester));
}

export function memberActivity(
  ids: ReadonlySet<string>,
  data: MemberActivityData,
  now: Date,
): MemberActivity {
  const attended = data.activities
    .filter((a) => a.attendeeIds.some((id) => ids.has(id)))
    .map(({ id, title, type, start, end }) => ({ id, title, type, start, end }))
    // instant 비교 — 오프셋이 다른 ISO 문자열은 사전식 순서가 틀린다(LA26-1)
    .sort((a, b) => Date.parse(b.start) - Date.parse(a.start));

  const countsByType: Record<string, number> = {};
  for (const a of attended)
    countsByType[a.type] = (countsByType[a.type] ?? 0) + 1;

  return {
    hostedSeminars: hostedBy(data.seminars, (s) => s.presenterIds, ids),
    hostedStudies: hostedBy(data.studies, (s) => s.organizerIds, ids),
    attended,
    countsByType,
    active: attended.some(
      (a) => ACTIVE_TYPES.has(a.type) && withinActiveWindow(a, now),
    ),
  };
}
