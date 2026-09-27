import { AppError } from "$lib/server/core/errors";
import { newId, randomToken } from "$lib/server/core/id";
import { nowKstIso } from "$lib/server/core/time";
import { mutate } from "$lib/server/data/tables";
import { callFlow, type FlowResult } from "$lib/server/data/flows";
import {
  SeminarSchema,
  type Seminar,
  type SeminarSchedule,
} from "$lib/server/data/schemas";

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
 *
 * 취소 판정은 flow_cancel_seminar가 같은 규칙으로 SQL 안에서 한다 — 규칙을
 * 바꾸면 둘을 함께 바꾼다.
 */
export function seminarHasStarted(seminar: Seminar): boolean {
  return seminar.schedule
    ? new Date(seminar.schedule.startsAt).getTime() <= Date.now()
    : seminar.publicationStatus === "published";
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
 * 상태 전이·학기 도출·활동/이벤트 생성·활동 연결·공지 선점이 한 트랜잭션
 * (flow_publish_seminar)이다. 예전에는 단계마다 따로 쓰느라 취소가 그 사이에
 * 끼어들면 취소된 세미나에 살아 있는 출석 이벤트가 남았다(실측) — 이제 그
 * 틈이 없다.
 *
 * **재실행은 막지 않고 수렴시킨다.** 이미 `published`인 세미나로 다시 들어오면
 * 빠진 활동·이벤트만 채우고, 공지는 `announcedAt`이 비어 있을 때만 선점된다.
 * 그래서 "커밋 성공 → 메일 실패"가 영구 침묵이 되지 않고, 공지가 두 번
 * 나가지도 않는다.
 */
export async function publishSeminar(id: string): Promise<{
  seminar: Seminar;
  activityId: string;
  eventId: string;
  mailFailed: boolean;
}> {
  const out = await callFlow<
    FlowResult & {
      seminar: unknown;
      activityId: string;
      eventId: string;
      claimed: boolean;
    }
  >("flow_publish_seminar", {
    id,
    now: nowKstIso(),
    activityId: newId(),
    eventId: newId(),
    pathId: randomToken(),
    attendCode: randomToken(),
  });
  const seminar = SeminarSchema.parse(out.seminar);
  const mailFailed = out.claimed ? await announce(id, seminar) : false;
  return {
    seminar,
    activityId: out.activityId,
    eventId: out.eventId,
    mailFailed,
  };
}

/**
 * 공지는 정확히 한 번. 선점(`announcedAt`)은 공개 트랜잭션이 이미 했고, 여기는
 * **이긴 실행만** 들어온다. 발송이 실패하면 선점을 **되돌려** 다음 재실행이
 * 다시 보낸다.
 *
 * 남는 창: 선점과 되돌리기 사이에 프로세스가 죽으면 "보냈다고 표시됐지만 실제로는
 * 못 보낸" 상태가 된다. 반대쪽(중복 발송)보다 이쪽을 택했다 — 전 회원 메일은
 * 한 번 더 가는 것이 안 가는 것보다 나쁘고, 관리자는 공개 화면에서 재발송을
 * 요청할 수 있다.
 *
 * 이미 지난 일정으로 공개하는 것은 기록 정정이지 안내가 아니다 — 전 회원에게
 * "지난 세미나가 열립니다"를 보내지 않는다. 선점만 남겨 되살아나지 않게 한다.
 */
async function announce(id: string, seminar: Seminar): Promise<boolean> {
  const schedule = seminar.schedule!;
  if (new Date(schedule.startsAt).getTime() <= Date.now()) return false; // 기록 정정

  const { sendSeminarAnnouncement } =
    await import("$lib/server/mail/announcements");
  const sent = await sendSeminarAnnouncement({
    title: seminar.title,
    description: seminar.note,
    schedule,
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
 * 산다** — 세미나(의도된 일정) · 활동(기록) · 이벤트(출석 창). 셋을 한
 * 트랜잭션(flow_update_seminar_schedule)에서 맞춘다.
 *
 * 이주로 일정을 잃은 레거시 행(`published` + `schedule: null`)을 고치는 입구도
 * 여기다. 그 행들은 `scheduleSeminar`가 받지 않는다(이미 공개됐으므로).
 */
export async function updateSeminarSchedule(
  id: string,
  schedule: SeminarSchedule,
): Promise<{ seminar: Seminar; mailFailed: boolean }> {
  const out = await callFlow<
    FlowResult & { seminar: unknown; changed: boolean }
  >("flow_update_seminar_schedule", { id, schedule });
  const seminar = SeminarSchema.parse(out.seminar);

  // 공지는 **공개된 세미나의 일정이 바뀌었을 때만**. 같은 값을 다시 저장하는
  // 것은 변경이 아니고, 지난 일정으로 고치는 것은 기록 정정이지 안내가 아니다.
  // 발송 결과를 버리면 실패가 조용해진다 — 같은 값을 다시 저장해도 `changed`가
  // false라 재시도되지 않으므로, 관리자가 모르면 그 공지는 영영 나가지 않는다.
  let mailFailed = false;
  if (
    seminar.publicationStatus === "published" &&
    out.changed &&
    new Date(schedule.startsAt).getTime() > Date.now()
  ) {
    const { sendSeminarScheduleChange } =
      await import("$lib/server/mail/announcements");
    mailFailed = !(await sendSeminarScheduleChange({
      title: seminar.title,
      schedule,
    }));
  }
  return { seminar, mailFailed };
}

/**
 * 취소 — 세미나를 `cancelled`로, 연결된 출석 이벤트도 `cancelled`로. 권한
 * 판정(개설자는 열리기 전까지만, 관리자는 이후에도 확인과 함께)부터 두 문서의
 * 쓰기까지 한 트랜잭션(flow_cancel_seminar)이다 — 판정이 낡은 캐시를 보면
 * 이미 치른 세미나의 출석 기록이 개설자 손에 사라진다(실측).
 *
 * 활동과 출석 기록은 **지우지 않는다.** 기록 삭제는 되돌릴 수 없고, 이 저장소는
 * 아카이브를 사료로 다룬다(C-16). 대신 회원·공개 면에서 보이지 않게 하는 것은
 * 읽기 쪽(services/visibility.ts)이 맡는다 — "안 그린다"가 아니라 "페이로드에
 * 싣지 않는다"여야 한다(ZR-8의 교훈).
 *
 * 두 번 호출해도 한 번과 같다.
 */
export async function cancelSeminar(
  id: string,
  actor: CancelActor,
): Promise<{ seminar: Seminar; mailFailed: boolean }> {
  const out = await callFlow<
    FlowResult & {
      seminar: unknown;
      flipped: boolean;
      wasAnnounced: boolean;
      started: boolean;
    }
  >("flow_cancel_seminar", {
    id,
    memberId: actor.memberId,
    isAdmin: actor.isAdmin,
    acknowledgeStarted: actor.acknowledgeStarted ?? false,
    now: nowKstIso(),
  });
  const seminar = SeminarSchema.parse(out.seminar);

  // 공지는 **알린 적 있는** 세미나에만. 알린 적 없는 것의 취소를 알리면
  // "있었는지도 몰랐던 세미나가 취소됐다"가 된다. 이미 치른 세미나의 취소는
  // 기록 정정이므로 역시 알리지 않는다.
  let mailFailed = false;
  if (out.flipped && out.wasAnnounced && !out.started) {
    const { sendSeminarCancellation } =
      await import("$lib/server/mail/announcements");
    mailFailed = !(await sendSeminarCancellation({ title: seminar.title }));
  }
  return { seminar, mailFailed };
}
