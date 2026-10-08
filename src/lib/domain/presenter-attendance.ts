export interface PresenterApplicantState {
  id: string;
  checked: boolean;
}

export interface PresenterActionState {
  success?: boolean;
  operation?: "presenterAttendanceSaved" | "seminarCancelled";
  eventId?: string;
  seminarId?: string;
  seminarTitle?: string;
  error?: string;
  message?: string;
  issues?: Record<string, string>;
  values?: { attendeeIds: string[] };
  applicantAttendeeIds?: string[];
  totalAttendanceCount?: number;
  mailFailed?: boolean;
}

/** Keep explicit local edits; accept fresh saved checks elsewhere in the roster. */
export function reconcilePresenterSelection(
  previous: readonly PresenterApplicantState[],
  next: readonly PresenterApplicantState[],
  selectedIds: Iterable<string>,
) {
  const previousById = new Map(previous.map((member) => [member.id, member]));
  const selected = new Set(selectedIds);
  return next
    .filter((member) => {
      const prior = previousById.get(member.id);
      return prior && selected.has(member.id) !== prior.checked
        ? selected.has(member.id)
        : member.checked;
    })
    .map((member) => member.id);
}

export function presenterInitialSelection(
  eventId: string,
  applicants: readonly PresenterApplicantState[],
  form: PresenterActionState | null,
) {
  if (
    form?.error &&
    form.operation === "presenterAttendanceSaved" &&
    form.eventId === eventId &&
    form.values
  ) {
    const posted = new Set(form.values.attendeeIds);
    return applicants
      .filter((member) => posted.has(member.id))
      .map((m) => m.id);
  }
  return applicants
    .filter((member) => member.checked)
    .map((member) => member.id);
}

export function presenterRequestStatus(status: string | null | undefined) {
  return (
    { pending: "승인 대기", approved: "요청 승인", rejected: "요청 거절" }[
      status ?? ""
    ] ?? "요청 기록"
  );
}

export function presenterFeedback(form: PresenterActionState | null) {
  if (!form?.operation) return null;
  const cancellation = form.operation === "seminarCancelled";
  if (form.success) {
    if (cancellation) {
      return {
        tone: form.mailFailed ? ("warning" as const) : ("success" as const),
        message: `${form.seminarTitle ? `‘${form.seminarTitle}’ 세미나` : "세미나"}를 취소했습니다. 기존 기록은 보존하고 공개·참가 신청 목록에서 숨깁니다.${form.mailFailed ? " 안내 메일 발송에 실패했습니다. 운영진에게 확인해 주세요." : ""}`,
      };
    }
    return {
      tone: "success" as const,
      message: `신청자 ${form.applicantAttendeeIds?.length ?? 0}명의 출석을 저장했습니다. 전체 출석 기록은 ${form.totalAttendanceCount ?? 0}명이며 명부 밖의 기존 출석은 보존했습니다.`,
    };
  }
  if (!form.error) return null;
  const detail =
    Object.values(form.issues ?? {}).find(Boolean) ??
    form.message ??
    {
      UNAUTHORIZED: "다시 로그인한 뒤 시도해 주세요.",
      FORBIDDEN: cancellation
        ? "이미 시작된 세미나이거나 취소 권한이 없습니다."
        : "발표자와 이번 학기 등록 상태를 확인해 주세요.",
      NOT_FOUND: "더 이상 사용할 수 없는 세미나 또는 출석부입니다.",
      CONFLICT: "세미나 상태가 바뀌었습니다. 현재 목록을 다시 확인해 주세요.",
      VALIDATION_FAILED: "선택한 세미나와 신청자 명부를 확인해 주세요.",
      SERVICE_UNAVAILABLE: "잠시 후 다시 시도해 주세요.",
    }[form.error] ??
    "현재 상태를 확인하고 다시 시도해 주세요.";
  return {
    tone: "error" as const,
    message: `${cancellation ? "세미나를 취소" : "출석을 저장"}하지 못했습니다. ${detail}`,
  };
}
