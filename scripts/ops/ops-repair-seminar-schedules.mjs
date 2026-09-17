/**
 * 이주로 잃어버린 **세미나 일정**을 활동 테이블에서 되살린다 (감사 C-12).
 *
 * 무슨 일이 있었나: `scripts/migration/20-export-tables.ts`가 세미나를 옮기면서
 * `activityId: null`을 박아 넣었다. 이벤트는 id 맵으로 활동과 이어 줬는데
 * 세미나만 그러지 않았다. 그래서 **날짜를 가진 쪽(활동)과 날짜를 잃은 쪽(세미나)**이
 * 서로를 모르는 상태가 됐다. 활동에는 날짜가 그대로 남아 있으므로 일시는 복구할
 * 수 있다.
 *
 * 복구되지 않는 것: **장소.** 노션의 활동 DB는 제목·일정·종류·출석만 옮겼고
 * 장소 속성 자체가 매핑에 없다. 그래서 `location`에는 자리표시자가 들어간다
 * (스키마가 빈 문자열을 거절한다) — 운영진이 아는 값으로 고쳐 넣어야 한다.
 *
 *   node scripts/ops/ops-repair-seminar-schedules.mjs            # 미리보기(기본)
 *   node scripts/ops/ops-repair-seminar-schedules.mjs apply      # 실제 적용
 *   ... apply --location "27동 325호"                            # 자리표시자 대신 실제 장소
 *
 * 순수 DB 갱신 — 앱 서비스도 메일 디스패처도 부르지 않는다(발송 0 보장).
 * 이미 일정이 있는 행은 절대 덮지 않는다.
 */

/**
 * @typedef {{ start: string, end: string | null }} DateRange
 * @typedef {{ id: string, title: string, type: string, date: DateRange }} ActivityRow
 * @typedef {{ startsAt: string, startTime: string | null, endsAt: string | null, location: string }} Schedule
 * @typedef {{ id: string, title: string, semester: string, schedule: Schedule | null, activityId: string | null, sourceRequestId?: string | null }} SeminarRow
 * @typedef {{ id: string, sourceRequestId: string | null, activityId: string }} EventRow
 * @typedef {{ id: string, title: string, semester: string, via: string | null, sessions: number, startsAt: string, relinked: boolean, timeUnknown: boolean }} Planned
 * @typedef {{ id: string, title: string, semester: string, reason: string }} Unresolved
 */

/** KST 벽시계 "HH:mm" — 저장된 시각이 어느 시간대로 적혀 있든. */
/** @param {string} iso */
function kstClock(iso) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/**
 * 복구 대상 활동이 되려면 세미나 종류여야 한다.
 * @param {ActivityRow} a
 */
const isSeminarActivity = (a) => a.type === "세미나";

/**
 * 무엇을 어떻게 고칠지 **계산만** 한다 (I/O 없음 — 그래서 테스트할 수 있다).
 *
 * 활동을 찾는 순서가 곧 신뢰도 순서다:
 *   1. `activityId` — 이미 이어져 있다면 그것이 진실
 *   2. 공개 앵커 — 공개 때 심은 `seminar:<id>`를 가진 이벤트의 activityId
 *   3. 제목 — 이주분에는 앵커가 없다. "제목" 또는 "제목 N회차"를 찾고,
 *      여러 회차면 가장 이른 것을 세미나의 시작으로 본다.
 */
/**
 * @param {{ seminars: SeminarRow[], activities: ActivityRow[], events?: EventRow[], location?: string }} input
 * @returns {{ rows: SeminarRow[], planned: Planned[], unresolved: Unresolved[], changed: boolean }}
 */
export function planSeminarRepairs({
  seminars,
  activities,
  events = [],
  location = "기록 없음",
}) {
  const activityById = new Map(activities.map((a) => [a.id, a]));
  const seminarActivities = activities.filter(isSeminarActivity);

  /** @type {Planned[]} */
  const planned = [];
  /** @type {Unresolved[]} */
  const unresolved = [];

  const rows = seminars.map((s) => {
    // 손으로 고쳐 둔 일정을 되돌려 놓지 않는다.
    if (s.schedule) return s;

    // 신청 흐름으로 만들어진 세미나는 이주 사고의 피해자가 아니다. 그 행의
    // 활동은 **예전 승인 경로**가 만든 것이라 시작 시각이 "승인을 누른 순간"이다
    // — 그 값을 일정으로 복사하면 고친 버그를 데이터에 고착시킨다. 관리자가
    // 화면에서 직접 넣어야 할 행이다.
    if (s.sourceRequestId) {
      unresolved.push({
        id: s.id,
        title: s.title,
        semester: s.semester,
        reason: "신청 흐름 — 관리자가 입력",
      });
      return s;
    }

    /** @type {string | null} */
    let via = null;
    let sessions = 1;
    /** @type {ActivityRow | null | undefined} */
    let activity = null;

    if (s.activityId && activityById.has(s.activityId)) {
      activity = activityById.get(s.activityId);
      via = "activityId";
    }

    if (!activity) {
      const anchored = events.find(
        (e) => e.sourceRequestId === `seminar:${s.id}` && e.activityId,
      );
      if (anchored && activityById.has(anchored.activityId)) {
        activity = activityById.get(anchored.activityId);
        via = "anchor";
      }
    }

    if (!activity) {
      const candidates = seminarActivities.filter(
        (a) => a.title === s.title || a.title.startsWith(`${s.title} `),
      );
      if (candidates.length > 0) {
        const sorted = [...candidates].sort((x, y) =>
          x.date.start.localeCompare(y.date.start),
        );
        activity = sorted[0];
        sessions = candidates.length;
        via = "title";
      }
    }

    if (!activity || !isSeminarActivity(activity)) {
      unresolved.push({
        id: s.id,
        title: s.title,
        semester: s.semester,
        reason: "활동 없음",
      });
      return s;
    }

    // 날짜 없는 활동에서는 복구할 것이 없다. 빈 시각을 박으면 저장 스키마가
    // 거절하고, 그 실패는 표 전체의 쓰기를 막는다.
    if (!activity.date?.start) {
      unresolved.push({
        id: s.id,
        title: s.title,
        semester: s.semester,
        reason: "활동에 날짜 없음",
      });
      return s;
    }

    // 노션 `일정`이 날짜만인 행이 많다 — 자정은 시각을 모른다는 뜻이다.
    // 모르는 것은 `startTime: null`로 적는다: 화면이 "오전 12:00"이라는 없던
    // 사실을 말하지 않게 하는 유일한 방법이다.
    const clock = kstClock(activity.date.start);
    const timeUnknown = clock === "00:00";

    planned.push({
      id: s.id,
      title: s.title,
      semester: s.semester,
      via,
      sessions,
      startsAt: activity.date.start,
      relinked: s.activityId !== activity.id,
      timeUnknown,
    });

    return {
      ...s,
      activityId: activity.id,
      schedule: {
        startsAt: activity.date.start,
        startTime: timeUnknown ? null : clock,
        endsAt: activity.date.end ?? null,
        location,
      },
    };
  });

  return { rows, planned, unresolved, changed: planned.length > 0 };
}

// ---- CLI ------------------------------------------------------------------
// 테스트가 이 파일을 import 할 때는 실행되지 않는다.
if (
  process.argv[1] &&
  process.argv[1].endsWith("ops-repair-seminar-schedules.mjs")
) {
  const { createClient } = await import("@supabase/supabase-js");
  const { loadDotenv } = await import("./lib-env.mjs");
  loadDotenv();

  const APPLY = process.argv.includes("apply");
  const locationArg = process.argv.indexOf("--location");
  const location =
    locationArg !== -1 ? process.argv[locationArg + 1] : "기록 없음";

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    console.error(
      "env missing: SUPABASE_URL / SUPABASE_SECRET_KEY (리포 루트 .env 또는 환경변수)",
    );
    process.exit(1);
  }

  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
  );

  /** @param {string} name */
  const doc = async (name) => {
    const { data, error } = await sb
      .from("app_tables")
      .select("version, doc")
      .eq("name", name)
      .single();
    if (error) throw error;
    return data;
  };

  const [seminars, activities, events] = await Promise.all([
    doc("seminars"),
    doc("activities"),
    doc("events"),
  ]);

  const { rows, planned, unresolved, changed } = planSeminarRepairs({
    seminars: seminars.doc.rows,
    activities: activities.doc.rows,
    events: events.doc.rows,
    location,
  });

  const already = seminars.doc.rows.filter(
    /** @param {SeminarRow} s */ (s) => s.schedule,
  ).length;
  console.log(
    `세미나 ${seminars.doc.rows.length}건 — 이미 일정 있음 ${already} · 복구 대상 ${planned.length} · 손댈 수 없음 ${unresolved.length}`,
  );

  if (planned.length) {
    console.log("\n[복구]");
    console.table(
      planned.map((p) => ({
        제목: p.title.slice(0, 28),
        학기: p.semester,
        근거: p.via,
        회차: p.sessions,
        시작: p.startsAt.slice(0, 16).replace("T", " "),
        시각: p.timeUnknown ? "미상" : "있음",
        재연결: p.relinked ? "예" : "-",
      })),
    );
  }

  if (unresolved.length) {
    console.log("\n[손댈 수 없음 — 운영진 확인 필요]");
    console.table(
      unresolved.map((u) => ({
        제목: u.title.slice(0, 28),
        학기: u.semester,
        사유: u.reason,
      })),
    );
  }

  const unknownTimes = planned.filter((p) => p.timeUnknown).length;
  console.log(
    `\n장소는 노션 원본에 없었다 — 전부 "${location}" 으로 들어간다. 아는 값은 관리자 화면에서 고칠 것.`,
  );
  if (unknownTimes) {
    console.log(
      `시각을 모르는 행 ${unknownTimes}건 — 노션 \`일정\`이 날짜만이라 자정으로 들어간다. 아는 시각은 관리자 화면에서 고칠 것.`,
    );
  }

  if (!APPLY) {
    console.log("\n(미리보기 — 적용하려면 'apply' 인자)");
    process.exit(0);
  }
  if (!changed) {
    console.log("\n바꿀 것이 없다.");
    process.exit(0);
  }

  const { data, error } = await sb
    .from("app_tables")
    .update({
      doc: { ...seminars.doc, rows },
      version: seminars.version + 1,
    })
    .eq("name", "seminars")
    .eq("version", seminars.version)
    .select("name");
  if (error) throw error;
  if (!data.length) throw new Error("CAS 실패 — 다시 실행할 것");
  console.log(`\n적용 완료: ${planned.length}건 (메일 발송 경로 미사용)`);
}
