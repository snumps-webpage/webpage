import type { DashboardRequestStatus } from "./dashboard";
import type { SeminarPublicationStatus } from "./seminars";

/** Read-only summary of a request belonging to the requester or a presenter. */
export interface OwnSeminarRequestItem {
  id: string;
  title: string;
  status: DashboardRequestStatus;
  submittedAt: string;
  publicationStatus: SeminarPublicationStatus | null;
  schedule: {
    startsAt: string;
    startTime: string | null;
    endsAt: string | null;
    location: string;
  } | null;
  publicPath: string | null;
  editPath: string | null;
}

/** These are presentation steps, not new persisted lifecycle values. */
export const SEMINAR_PROGRESS_STEPS = [
  "심사",
  "일정 조율",
  "공개 준비",
  "공개",
] as const;

export function seminarRequestProgress(
  request: Pick<OwnSeminarRequestItem, "status" | "publicationStatus">,
): {
  label: string;
  next: string;
  step: number | null;
} {
  if (
    request.status === "cancelled" ||
    request.publicationStatus === "cancelled"
  )
    return {
      label: "취소됨",
      next: "취소된 신청 기록입니다. 공개 일정에서는 보이지 않습니다.",
      step: null,
    };
  if (request.status === "rejected")
    return {
      label: "반려",
      next: "신청이 반려되었습니다. 다시 제안하려면 새 신청을 작성해 주세요.",
      step: null,
    };
  if (request.status === "withdrawn")
    return { label: "철회", next: "신청을 철회했습니다.", step: null };
  if (request.status === "pending")
    return {
      label: "심사 대기",
      next: "운영진이 주제와 발표자를 검토하고 있습니다.",
      step: 0,
    };
  switch (request.publicationStatus) {
    case "unscheduled":
      return {
        label: "승인 · 일정 조율",
        next: "발표는 승인되었습니다. 운영진과 일시·장소를 조율해 주세요.",
        step: 1,
      };
    case "scheduled":
      return {
        label: "일정 저장 · 공개 대기",
        next: "운영진이 저장한 일정입니다. 아직 회원 전체에 공개되지 않았습니다.",
        step: 2,
      };
    case "published":
      return {
        label: "공개됨",
        next: "회원과 공개 아카이브에 일정이 열렸습니다. 공개 페이지에서 내용을 확인하세요.",
        step: 3,
      };
    default:
      return {
        label: "승인됨",
        next: "승인된 신청입니다. 연결된 운영 상태를 확인 중입니다.",
        step: null,
      };
  }
}

/** Date-only migrated schedules must not invent a midnight presentation time. */
export function seminarScheduleLabel(
  schedule: NonNullable<OwnSeminarRequestItem["schedule"]>,
) {
  const start = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    ...(schedule.startTime === null
      ? {}
      : { hour: "2-digit" as const, minute: "2-digit" as const }),
  }).format(new Date(schedule.startsAt));
  if (schedule.startTime === null || !schedule.endsAt) return start;
  const day = (value: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  const crossDay = day(schedule.startsAt) !== day(schedule.endsAt);
  const end = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    ...(crossDay
      ? {
          year: "numeric" as const,
          month: "long" as const,
          day: "numeric" as const,
        }
      : {}),
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(schedule.endsAt));
  return `${start} – ${end}`;
}
