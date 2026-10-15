import { hiddenActivityIdsOf } from "./activity-visibility";
import { compareSemesters } from "./semester-order";

/**
 * 회원별 활동 기록과 회칙 기준 지위 — 순수 집계 (snumps-webpage/D-000070·071·
 * 074·075·076·078). 공개 명단·회원 페이지·관리자 화면·매일 자동 승급
 * (services/member-standing.ts)·첫 일괄 승급 ops 스크립트
 * (scripts/ops/ops-promote-regular.ts)가 같은 함수로 센다; 무엇을 넣을지(숨김
 * 활동·비공개 세미나 제외 여부)는 부르는 쪽이 정한다(server/public/member-activity.ts).
 *
 * 브라우저·ops 스크립트에서도 import한다 — `$lib` 경로를 쓰지 않는다.
 *
 * 한 사람은 id가 둘일 수 있다 — 이주된 기록은 legacy id를 가리키고, 재가입한
 * 회원의 새 행은 `legacyMemberId`로 그것을 잇는다. 그래서 id **집합**을 받고,
 * 기록 한 건은 집합의 id가 몇 개 걸리든 한 번만 센다.
 */

/** 정회원·동문이 되는 활동 기록 수 — 회칙 제4조 ②. */
export const REGULAR_RECORD_THRESHOLD = 3;

/** 활동으로 인정되는 스터디의 최소 진행 회차 — 회칙 제20조 ②. */
export const STUDY_MIN_SESSIONS = 4;

/**
 * 회칙 기준 지위. 이번 학기 등록이 있으면 정회원·준회원(제4조), 없으면
 * 동문(제5조 — 정회원이었던 적이 있는 자)·이전 회원.
 */
export type MemberStanding = "regular" | "associate" | "alumni" | "former";

export const MEMBER_STANDING_LABELS: Record<MemberStanding, string> = {
  regular: "정회원",
  associate: "준회원",
  alumni: "동문",
  former: "이전 회원",
};

/**
 * 명단 보기(D-000077·065): 현재 회원(정회원+준회원), 정회원, 전체. 공개 명단의
 * 기본은 현재 회원, 관리자 회원 목록의 기본은 전체.
 */
export const MEMBER_VIEWS = ["current", "regular", "all"] as const;
export type MemberView = (typeof MEMBER_VIEWS)[number];

export const MEMBER_VIEW_LABELS: Record<MemberView, string> = {
  current: "현재 회원",
  regular: "정회원",
  all: "전체",
};

/** 이 지위가 보기에 들어가는가. 지위가 없는(탈퇴) 회원은 전체 보기에만. */
export function inMemberView(
  standing: MemberStanding | null,
  view: MemberView,
): boolean {
  if (view === "all") return true;
  if (view === "regular") return standing === "regular";
  return standing === "regular" || standing === "associate";
}

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
  /** 출석 명단에 있는 활동, 최신순. 숨김 활동을 뺄지는 부르는 쪽이 정한다. */
  attended: ActivityRef[];
  /** 회칙 활동 기록 수(제18~20조). 숨김 활동은 세지 않는다. */
  records: number;
  /** 활동 종류별 기록 수 — 스터디 세션 묶음은 '스터디' 1회. */
  recordsByType: Record<string, number>;
};

export type MemberActivityData = {
  seminars: readonly (HostedRef & {
    presenterIds: readonly string[];
    /** 세미나의 활동 — 발표자는 이 활동의 기록을 받는다. */
    activityId: string | null;
  })[];
  studies: readonly (HostedRef & { organizerIds: readonly string[] })[];
  activities: readonly (ActivityRef & {
    attendeeIds: readonly string[];
    studyId: string | null;
    sourceRequestId: string | null;
    /**
     * 회원 면에서 가려진 활동(services/visibility.ts `hiddenActivityIdsOf`:
     * 공개되지 않은 세미나의 활동, 출석 이벤트가 모두 취소된 활동 — 취소된
     * 스터디 세션 포함). 열리지 않은 활동이라 기록으로 세지 않는다.
     */
    hidden?: boolean;
  })[];
};

type DataActivity = MemberActivityData["activities"][number];

/**
 * 스터디 세션 활동 — flow_create_study_session이 만든 것(`sourceRequestId`가
 * `<studyId>:<date>`). 이주된 스터디 활동은 키가 없어(null 등) 세션이 아니다.
 */
function sessionStudyOf(a: DataActivity): string | null {
  if (!a.studyId || !a.sourceRequestId) return null;
  return a.sourceRequestId.startsWith(`${a.studyId}:`) ? a.studyId : null;
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

const touches = (list: readonly string[], ids: ReadonlySet<string>) =>
  list.some((id) => ids.has(id));

/**
 * 활동 기록(회칙 제18~20조, D-000071·075·076):
 *
 * - 세미나: 참석했거나 그 세미나(`seminar.activityId`)의 발표자면 활동 1건당 1회.
 * - 스터디 세션: 스터디별로 묶어 숨김이 아닌 세션이 `STUDY_MIN_SESSIONS`개 이상이고
 *   그 과반에 참석했으면 그 스터디로 1회.
 * - 그 밖의 활동(이주된 스터디 활동·회식·회의·기타): 참석 1건당 1회.
 */
export function memberActivity(
  ids: ReadonlySet<string>,
  data: MemberActivityData,
): MemberActivity {
  const presented = new Set(
    data.seminars
      .filter((s) => s.activityId && touches(s.presenterIds, ids))
      .map((s) => s.activityId as string),
  );

  const recordsByType: Record<string, number> = {};
  const record = (type: string) =>
    (recordsByType[type] = (recordsByType[type] ?? 0) + 1);

  /** studyId → [진행 세션 수, 참석 세션 수] */
  const sessions = new Map<string, { held: number; attended: number }>();
  for (const a of data.activities) {
    if (a.hidden) continue;
    const studyId = sessionStudyOf(a);
    const attended = touches(a.attendeeIds, ids);
    if (studyId) {
      const tally = sessions.get(studyId) ?? { held: 0, attended: 0 };
      tally.held += 1;
      if (attended) tally.attended += 1;
      sessions.set(studyId, tally);
    } else if (attended || presented.has(a.id)) {
      record(a.type);
    }
  }
  for (const { held, attended } of sessions.values()) {
    if (held >= STUDY_MIN_SESSIONS && attended * 2 > held) record("스터디");
  }

  const attended = data.activities
    .filter((a) => touches(a.attendeeIds, ids))
    .map(({ id, title, type, start, end }) => ({ id, title, type, start, end }))
    // instant 비교 — 오프셋이 다른 ISO 문자열은 사전식 순서가 틀린다(LA26-1)
    .sort((a, b) => Date.parse(b.start) - Date.parse(a.start));

  return {
    hostedSeminars: hostedBy(data.seminars, (s) => s.presenterIds, ids),
    hostedStudies: hostedBy(data.studies, (s) => s.organizerIds, ids),
    attended,
    records: Object.values(recordsByType).reduce((n, c) => n + c, 0),
    recordsByType,
  };
}

/**
 * 회칙 기준 지위(D-000070·074·078). 탈퇴 회원은 부르는 쪽에서 뺀다.
 *
 * - 이번 학기 등록 있음: 저장 지위가 `regular`이거나 기록이 기준 이상이면 정회원
 *   (제4조 ②·④ — 요건 충족 즉시), 아니면 준회원.
 * - 등록 없음: 기록이 기준 이상이었거나 `isAlumni`면 동문(제5조 ①), 아니면 이전 회원.
 */
export function memberStanding(input: {
  registeredThisTerm: boolean;
  storedStatus: "associate" | "regular";
  isAlumni: boolean;
  records: number;
}): MemberStanding {
  const qualified = input.records >= REGULAR_RECORD_THRESHOLD;
  if (input.registeredThisTerm) {
    return input.storedStatus === "regular" || qualified
      ? "regular"
      : "associate";
  }
  return qualified || input.isAlumni ? "alumni" : "former";
}

/** 이 사람의 기록이 가리킬 수 있는 id 전부 — 새 id와 잇는 legacy id. */
export function personIdsOf(member: {
  id: string;
  legacyMemberId: string | null;
}): Set<string> {
  return new Set(
    [member.id, member.legacyMemberId].filter((id): id is string => !!id),
  );
}

/** 집계에 쓰는 표들 — 저장 행의 필요한 필드만(서버 schemas와 같은 모양). */
export type ActivityTables = {
  seminars: readonly (HostedRef & {
    presenterIds: readonly string[];
    activityId: string | null;
    publicationStatus: string;
  })[];
  studies: readonly (HostedRef & {
    organizerIds: readonly string[];
    status: string;
  })[];
  activities: readonly {
    id: string;
    title: string;
    type: string;
    date: { start: string; end: string | null };
    attendeeIds: readonly string[];
    studyId: string | null;
    sourceRequestId: string | null;
  }[];
  events: readonly { activityId: string; status: string }[];
};

/** 공개 면에서 빠지는 것 — 관리자 화면의 '공개 면 숨김' 표시용(D-000069). */
export type HiddenFromPublic = {
  /** 공개되지 않은 세미나 */
  seminars: Set<string>;
  /** 취소된 스터디(D-000064) */
  studies: Set<string>;
  /** 숨김 활동(`hiddenActivityIdsOf`) */
  activities: Set<string>;
};

/**
 * 표 → 집계 입력. `publicOnly`면 공개 면에서 빠지는 것(숨김 활동, 공개되지 않은
 * 세미나, 취소된 스터디)을 아예 넣지 않는다. 아니면 전부 넣되 숨김 활동에
 * `hidden`을 단다 — 기록 수는 어느 쪽이든 같다(숨김 활동은 세지 않는다).
 */
export function memberActivityData(
  tables: ActivityTables,
  { publicOnly }: { publicOnly: boolean },
): { data: MemberActivityData; hiddenFromPublic: HiddenFromPublic } {
  const hiddenFromPublic: HiddenFromPublic = {
    seminars: new Set(
      tables.seminars
        .filter((s) => s.publicationStatus !== "published")
        .map((s) => s.id),
    ),
    studies: new Set(
      tables.studies.filter((s) => s.status === "cancelled").map((s) => s.id),
    ),
    activities: hiddenActivityIdsOf(tables.seminars, tables.events),
  };
  const shown = <T extends { id: string }>(
    rows: readonly T[],
    hidden: Set<string>,
  ) => (publicOnly ? rows.filter((r) => !hidden.has(r.id)) : rows);
  return {
    hiddenFromPublic,
    data: {
      seminars: shown(tables.seminars, hiddenFromPublic.seminars).map((s) => ({
        id: s.id,
        title: s.title,
        semester: s.semester,
        presenterIds: s.presenterIds,
        activityId: s.activityId,
      })),
      studies: shown(tables.studies, hiddenFromPublic.studies).map((s) => ({
        id: s.id,
        title: s.title,
        semester: s.semester,
        organizerIds: s.organizerIds,
      })),
      activities: shown(tables.activities, hiddenFromPublic.activities).map(
        (a) => ({
          id: a.id,
          title: a.title,
          type: a.type,
          start: a.date.start,
          end: a.date.end,
          attendeeIds: a.attendeeIds,
          studyId: a.studyId,
          sourceRequestId: a.sourceRequestId,
          hidden: hiddenFromPublic.activities.has(a.id),
        }),
      ),
    },
  };
}

/** 이 학기에 등록한 사람의 id 전부(운영 id·legacy id 무엇으로 등록됐든). */
export function registeredIdsOf(
  registrations: readonly { memberId: string; term: string }[],
  term: string,
): Set<string> {
  return new Set(
    registrations.filter((r) => r.term === term).map((r) => r.memberId),
  );
}

/**
 * 자동 승급 대상(D-000073·078·079) — 운영 회원 가운데 이번 학기 등록이 있고,
 * 저장 지위가 `associate`이며, 활동 기록이 기준 이상인 회원의 id. 강등은 없다.
 * 매일 maintenance cron(services/member-standing.ts)과 첫 일괄 승급 ops
 * 스크립트(scripts/ops/ops-promote-regular.ts)가 같은 함수로 고른다.
 */
export function selectPromotionCandidates(input: {
  members: readonly {
    id: string;
    legacyMemberId: string | null;
    status: string;
  }[];
  registrations: readonly { memberId: string; term: string }[];
  term: string;
  data: MemberActivityData;
}): string[] {
  const registered = registeredIdsOf(input.registrations, input.term);
  return input.members
    .filter((m) => {
      if (m.status !== "associate") return false;
      const ids = personIdsOf(m);
      if (![...ids].some((id) => registered.has(id))) return false;
      return (
        memberActivity(ids, input.data).records >= REGULAR_RECORD_THRESHOLD
      );
    })
    .map((m) => m.id);
}
