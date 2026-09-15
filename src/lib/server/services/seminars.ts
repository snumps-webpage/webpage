import { AppError } from "$lib/server/core/errors";
import { newId, randomToken } from "$lib/server/core/id";
import { termOf } from "$lib/server/core/semester";
import { nowKstIso } from "$lib/server/core/time";
import { getTable, mutate } from "$lib/server/data/tables";
import { ensureCreated } from "$lib/server/data/idempotency";
import type { Seminar, SeminarSchedule } from "$lib/server/data/schemas";

/**
 * 활동·이벤트의 멱등 앵커. `sourceRequestId` 열에는 이미 세 종류의 키가 산다
 * (가입/세미나 신청 id, 스터디 회차 복합키) — 세미나 공개분은 접두사로 구분한다.
 */
const seminarAnchor = (seminarId: string) => `seminar:${seminarId}`;

/**
 * 취소를 요청한 주체. 규칙이 둘로 갈린다 — 개설자는 열리기 전까지만,
 * 관리자는 이후에도 가능하되 명시적 확인이 필요하다.
 */
export interface CancelActor {
  memberId: string;
  isAdmin: boolean;
  /** 이미 시작된 세미나를 취소한다는 관리자의 두 번째 확인. */
  acknowledgeStarted?: boolean;
}

/**
 * 승인된 세미나의 공개 수명주기 (FRONTEND-DECISIONS §3-1).
 *
 *   승인 → unscheduled → [일정 확정] → scheduled → [공개] → published
 *
 * 신청 자체의 수명주기(제출·수정·철회·승인·반려)는 seminar-requests.ts에 있다.
 * 여기는 **승인된 뒤**의 이야기다.
 *
 * 왜 나뉘어 있나: 예전에는 승인 한 번이 activity·event·전 회원 공지를 전부
 * 만들었고, 세미나의 시작 시각이 **승인을 누른 순간**이었다. 그래서 승인된
 * 세미나는 신청이 즉시 닫히고(`start <= now`) 그날 자정에 만료됐다. 실제
 * 일정은 관리자와 발표자가 운영 채널에서 조율한 뒤에야 정해진다.
 */

/**
 * 이미 열린 세미나인가 — 취소 규칙이 갈리는 지점이라 판정은 한 곳에만 둔다.
 * 화면(관리자 보드·발표자 관리)이 서버와 다른 규칙으로 버튼을 그리면 "눌러도
 * 거절당하는 버튼"이나 그 반대가 생긴다.
 *
 * 일정을 잃은 `published` 행(이주 사고)은 "아직 안 열렸다"가 아니라 "이미
 * 치렀다"로 읽는다 — 반대로 읽으면 몇 해 전 세미나가 개설자에게 취소 가능한
 * 것으로 열린다. 확정 전(unscheduled) 행은 일정이 없는 것이 정상이다.
 */
export function seminarHasStarted(seminar: Seminar): boolean {
  return seminar.schedule
    ? new Date(seminar.schedule.startsAt).getTime() <= Date.now()
    : seminar.publicationStatus === "published";
}

async function seminarOrThrow(id: string): Promise<Seminar> {
  const seminar = (await getTable("seminars")).find((s) => s.id === id);
  if (!seminar) throw new AppError("NOT_FOUND");
  return seminar;
}

/**
 * 일정 확정 — 아직 공개하지 않는다. 공개 전에는 출석 이벤트가 없으므로
 * 이 시각·장소의 유일한 집은 `seminars.schedule`이다.
 */
export async function scheduleSeminar(
  id: string,
  schedule: SeminarSchedule,
): Promise<Seminar> {
  let saved: Seminar | undefined;
  await mutate("seminars", (rows) => {
    const idx = rows.findIndex((s) => s.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    const status = rows[idx].publicationStatus;
    // 공개된 세미나의 일정 수정은 activity·event까지 함께 고쳐야 하므로
    // 별도 경로(updateSeminarSchedule)다. 취소된 것은 되살리지 않는다.
    if (status !== "unscheduled" && status !== "scheduled") {
      throw new AppError("CONFLICT");
    }
    rows[idx] = { ...rows[idx], schedule, publicationStatus: "scheduled" };
    saved = rows[idx];
    return rows;
  });
  return saved!;
}

/**
 * 공개 — 확정된 일정으로 활동과 출석 이벤트를 만들고 전 회원에게 알린다.
 *
 * **순서가 계약이다.** 상태 전이를 `mutate` 안의 CAS로 **먼저** 확정하고,
 * 부수효과는 그 뒤에 만든다. 반대로 하면 중간 실패가 "공개되지 않은 세미나의
 * 활동"을 공개 캘린더에 남긴다(실측). CAS는 `publicationStatus`뿐 아니라
 * **일정 스냅샷까지** 비교한다 — 그러지 않으면 공개 도중 일정이 바뀔 때
 * 세미나·활동·이벤트가 서로 다른 날짜로 갈라진다(실측).
 *
 * **재실행은 막지 않고 수렴시킨다.** 이미 `published`인 세미나로 다시 들어오면
 * `ensureCreated`가 빠진 활동·이벤트만 채우고, 공지는 `announcedAt`이 비어
 * 있을 때만 나간다. 그래서 "CAS 성공 → 메일 실패"가 영구 침묵이 되지 않고,
 * 상태를 되감아도 공지가 두 번 나가지 않는다.
 */
export async function publishSeminar(id: string): Promise<{
  seminar: Seminar;
  activityId: string;
  eventId: string;
  mailFailed: boolean;
}> {
  const entry = await seminarOrThrow(id);
  if (
    entry.publicationStatus !== "scheduled" &&
    entry.publicationStatus !== "published"
  ) {
    throw new AppError("CONFLICT");
  }

  // 1) 소유권을 먼저 잡는다. 캐시는 최대 15초 낡을 수 있으므로 판정은 전부
  //    mutate 안에서, 그 순간의 행으로 한다.
  let seminar: Seminar | undefined;
  await mutate("seminars", (rows) => {
    const idx = rows.findIndex((s) => s.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    const row = rows[idx];
    if (row.publicationStatus === "published") {
      seminar = row; // 재실행 — 아래에서 빠진 것만 채운다
      return rows;
    }
    if (row.publicationStatus !== "scheduled" || !row.schedule)
      throw new AppError("CONFLICT");
    rows[idx] = {
      ...row,
      publicationStatus: "published",
      // 학기는 승인 시각이 아니라 실제로 열리는 날이 정한다 — 관리자가 직접
      // 정해 둔 경우는 그 결정이 위다.
      semester: row.semesterPinned
        ? row.semester
        : termOf(new Date(row.schedule.startsAt)),
    };
    seminar = rows[idx];
    return rows;
  });

  const schedule = seminar!.schedule;
  if (!schedule) throw new AppError("CONFLICT"); // 일정 없는 레거시 published 행

  // 2) 부수효과. 앵커는 세미나 id — 신청 id를 쓰면 취소된 회차가 키를 점유하는
  //    studies.ts의 M2 결함을 그대로 들여오게 된다.
  const anchor = seminarAnchor(seminar!.id);
  const activity = await ensureCreated("activities", anchor, () => ({
    id: newId(),
    title: seminar!.title,
    date: { start: schedule.startsAt, end: schedule.endsAt },
    type: "세미나" as const,
    // 발표자는 자기 세미나의 참가자다 — 구 승인 경로가 하던 것을 유지한다.
    attendeeIds: [...seminar!.presenterIds],
    sourceRequestId: anchor,
  }));

  const event = await ensureCreated("events", anchor, () => ({
    id: newId(),
    title: seminar!.title,
    date: { start: schedule.startsAt, end: schedule.endsAt },
    type: "세미나" as const,
    status: "active" as const,
    pathId: randomToken(),
    attendCode: randomToken(),
    activityId: activity.id,
    applicantIds: [],
    presenterIds: [...seminar!.presenterIds],
    studyId: null,
    sessionNo: null,
    autoGenerated: false,
    sourceRequestId: anchor,
  }));

  if (seminar!.activityId !== activity.id) {
    await mutate("seminars", (rows) => {
      const idx = rows.findIndex((s) => s.id === id);
      if (idx === -1) throw new AppError("NOT_FOUND");
      rows[idx] = { ...rows[idx], activityId: activity.id };
      seminar = rows[idx];
      return rows;
    });
  }

  const mailFailed = await announceOnce(id, seminar!, schedule);
  return {
    seminar: seminar!,
    activityId: activity.id,
    eventId: event.id,
    mailFailed,
  };
}

/**
 * 공지는 정확히 한 번. 순서가 그것을 만든다 — **먼저 선점하고, 그다음 보낸다.**
 *
 * 스냅샷을 보고 "아직 안 보냈네" 판단하면 동시 실행 둘이 모두 통과해 메일이
 * 두 번 나간다(실측했다). 그래서 `announcedAt` 쓰기를 `mutate` 안에서 선점으로
 * 처리하고, 이긴 실행만 발송한다. 발송이 실패하면 앵커를 **되돌려** 다음
 * 재실행이 다시 보낸다.
 *
 * 남는 창: 선점과 되돌리기 사이에 프로세스가 죽으면 "보냈다고 표시됐지만 실제로는
 * 못 보낸" 상태가 된다. 반대쪽(중복 발송)보다 이쪽을 택했다 — 전 회원 메일은
 * 한 번 더 가는 것이 안 가는 것보다 나쁘고, 관리자는 공개 화면에서 재발송을
 * 요청할 수 있다.
 *
 * 이미 지난 일정으로 공개하는 것은 기록 정정이지 안내가 아니다 — 전 회원에게
 * "지난 세미나가 열립니다"를 보내지 않는다. 앵커만 찍어 되살아나지 않게 한다.
 */
async function announceOnce(
  id: string,
  seminar: Seminar,
  schedule: SeminarSchedule,
): Promise<boolean> {
  let claimed = false;
  await mutate("seminars", (rows) => {
    // 이 콜백은 CAS에 지면 **다시 불린다**. 바깥 플래그를 매 시도마다 초기화하지
    // 않으면, 진 시도가 켜 놓은 값이 남아 패자도 발송한다 — 동시성 테스트가
    // 3회 중 1회 빈도로 잡아낸 실제 결함이다.
    claimed = false;
    const idx = rows.findIndex((s) => s.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    if (rows[idx].announcedAt !== null) return rows; // 이미 보냈거나 다른 실행이 선점
    rows[idx] = { ...rows[idx], announcedAt: nowKstIso() };
    claimed = true;
    return rows;
  });
  if (!claimed) return false;

  if (new Date(schedule.startsAt).getTime() <= Date.now()) return false; // 기록 정정

  const { sendSeminarAnnouncement } =
    await import("$lib/server/mail/announcements");
  const sent = await sendSeminarAnnouncement({
    title: seminar.title,
    description: seminar.note,
  });
  if (sent) return false;

  await mutate("seminars", (rows) => {
    const idx = rows.findIndex((s) => s.id === id);
    if (idx === -1) return rows;
    rows[idx] = { ...rows[idx], announcedAt: null }; // 되돌린다 — 다음 재실행이 재시도
    return rows;
  });
  return true;
}

/**
 * 일정 변경.
 *
 * 공개 전에는 세미나 행 하나로 끝난다. **공개 후에는 같은 일정이 세 문서에
 * 산다** — 세미나(의도된 일정) · 활동(기록) · 이벤트(출석 창). 하나만 고치면
 * 회원 화면과 공개 아카이브가 서로 다른 날짜를 말하므로 셋을 한 흐름에서
 * 맞춘다. 중간에 실패하면 같은 호출을 다시 하는 것이 복구다 — 각 단계가
 * 목표 상태를 그대로 쓰기 때문에 재실행이 수렴한다.
 *
 * 이주로 일정을 잃은 레거시 행(`published` + `schedule: null`)을 고치는 입구도
 * 여기다. 그 행들은 `scheduleSeminar`가 받지 않는다(이미 공개됐으므로).
 */
export async function updateSeminarSchedule(
  id: string,
  schedule: SeminarSchedule,
): Promise<Seminar> {
  let seminar: Seminar | undefined;
  await mutate("seminars", (rows) => {
    const idx = rows.findIndex((s) => s.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    const row = rows[idx];
    if (
      row.publicationStatus === "cancelled" ||
      row.publicationStatus === "unscheduled"
    ) {
      throw new AppError("CONFLICT");
    }
    rows[idx] = {
      ...row,
      schedule,
      // 공개된 세미나만 학기가 확정된다 — 확정 전 학기는 공개 시 다시 계산된다.
      // 관리자가 직접 정한 학기(semesterPinned)는 자동 도출이 덮지 않는다.
      semester:
        row.publicationStatus === "published" && !row.semesterPinned
          ? termOf(new Date(schedule.startsAt))
          : row.semester,
    };
    seminar = rows[idx];
    return rows;
  });

  if (seminar!.publicationStatus !== "published") return seminar!;

  const date = { start: schedule.startsAt, end: schedule.endsAt };
  const anchor = seminarAnchor(id);
  await mutate("activities", (rows) =>
    rows.map((a) =>
      a.id === seminar!.activityId || a.sourceRequestId === anchor
        ? { ...a, date }
        : a,
    ),
  );
  await mutate("events", (rows) =>
    rows.map((e) =>
      e.sourceRequestId === anchor ||
      (seminar!.activityId && e.activityId === seminar!.activityId)
        ? { ...e, date }
        : e,
    ),
  );
  return seminar!;
}

/**
 * 취소 — 세미나를 `cancelled`로, 연결된 출석 이벤트도 `cancelled`로.
 *
 * 활동과 출석 기록은 **지우지 않는다.** 기록 삭제는 되돌릴 수 없고, 이 저장소는
 * 아카이브를 사료로 다룬다(C-16). 대신 회원·공개 면에서 보이지 않게 하는 것은
 * 읽기 쪽(services/visibility.ts)이 맡는다 — "안 그린다"가 아니라 "페이로드에
 * 싣지 않는다"여야 한다(ZR-8의 교훈).
 *
 * 두 번 호출해도 한 번과 같다. 이미 취소된 이벤트에 상태를 다시 쓰지 않는다.
 */
export async function cancelSeminar(
  id: string,
  actor: CancelActor,
): Promise<Seminar> {
  const target = await seminarOrThrow(id);
  const started = seminarHasStarted(target);
  const isPresenter = target.presenterIds.includes(actor.memberId);

  if (!actor.isAdmin) {
    // 개설자는 자기 세미나만, 그리고 **열리기 전까지만** 취소할 수 있다.
    // 이미 치른 세미나를 지우는 것은 출석 기록을 조용히 없애는 일이다.
    if (!isPresenter || started) throw new AppError("FORBIDDEN");
  } else if (started && !actor.acknowledgeStarted) {
    // 관리자에게는 길이 열려 있되 되돌릴 수 없는 조작이므로 명시적 확인을
    // 요구한다 — 화면의 확인 대화상자만으로는 보장이 되지 않는다.
    throw new AppError("CONFLICT");
  }

  let seminar: Seminar | undefined;
  await mutate("seminars", (rows) => {
    const idx = rows.findIndex((s) => s.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    seminar = rows[idx];
    if (rows[idx].publicationStatus === "cancelled") return rows; // 멱등
    rows[idx] = { ...rows[idx], publicationStatus: "cancelled" };
    seminar = rows[idx];
    return rows;
  });

  const anchor = seminarAnchor(id);
  await mutate("events", (rows) =>
    rows.map((e) =>
      (e.sourceRequestId === anchor ||
        (seminar!.activityId && e.activityId === seminar!.activityId)) &&
      e.status !== "cancelled"
        ? { ...e, status: "cancelled" as const }
        : e,
    ),
  );
  return seminar!;
}
