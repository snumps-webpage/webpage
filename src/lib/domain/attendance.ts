import { z } from "zod/v4";

/** UI labels for the existing action contract; no new attendance state. */
export function attendanceActionError(
  code: unknown,
  scope: "request" | "sheet",
) {
  if (code === "UNAUTHORIZED")
    return "로그인이 풀렸습니다. 다시 로그인한 뒤 시도해 주세요.";
  if (code === "FORBIDDEN")
    return scope === "request"
      ? "이번 학기 등록 회원만 출석을 요청할 수 있습니다. 현재 계정을 확인해 주세요."
      : "출석부를 수정할 권한이 없습니다. 주최자와 이번 학기 등록 상태를 확인해 주세요.";
  if (code === "NOT_FOUND")
    return "더 이상 사용할 수 없는 출석 링크 또는 회차입니다.";
  if (code === "EVENT_NOT_OPEN")
    return "출석 요청 접수가 종료되었습니다. 주최자에게 기록 확인을 부탁해 주세요.";
  if (code === "CONFLICT")
    return scope === "request"
      ? "이미 접수된 출석 요청 기록이 있습니다. 이 응답만으로 승인 여부를 알 수는 없으니 운영진에게 확인해 주세요."
      : "회차 상태가 바뀌었습니다. 새로고침해서 현재 출석부를 확인해 주세요.";
  if (code === "WRITE_CONFLICT")
    return "다른 작업과 겹쳤습니다. 새로고침한 뒤 다시 시도해 주세요.";
  if (code === "VALIDATION_FAILED")
    return "선택한 참여자와 회차를 확인해 주세요.";
  if (code === "SERVICE_UNAVAILABLE")
    return "출석 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  return scope === "request"
    ? "출석 요청을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요."
    : "출석부를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function attendanceSessionLabel(status: string) {
  return (
    (
      {
        active: "출석 접수 중",
        expired: "접수 종료 · 기록 정정 가능",
        draft: "접수 전 · 기록 정정 가능",
        cancelled: "취소된 회차",
      } as Record<string, string>
    )[status] ?? status
  );
}

export function attendanceDateLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export type PresenterAttendanceOperationResult = {
  success: true;
  operation: "presenterAttendanceSaved";
  eventId: string;
  applicantAttendeeIds: string[];
  totalAttendanceCount: number;
};

export const managedEventIdSchema = z
  .string()
  .trim()
  .min(1, "대상을 선택해 주세요.")
  .max(200, "대상 id를 확인해 주세요.");

export function mergeManagedAttendance(
  existingAttendeeIds: string[],
  submittedAttendeeIds: string[],
  managedMemberIds: string[],
) {
  const managed = new Set(managedMemberIds);
  const unknownMemberId = submittedAttendeeIds.find((id) => !managed.has(id));
  if (unknownMemberId) {
    return {
      success: false as const,
      error: "VALIDATION_FAILED" as const,
      unknownMemberId,
    };
  }

  const preserved = existingAttendeeIds.filter((id) => !managed.has(id));
  return {
    success: true as const,
    attendeeIds: [...new Set([...preserved, ...submittedAttendeeIds])],
  };
}
