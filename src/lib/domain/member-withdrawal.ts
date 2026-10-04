import type { WithdrawalFormFailure, WithdrawalFormValues } from "./account";

export interface MemberWithdrawalActionState {
  operation?: "withdrawalRequested" | "withdrawalCancelled";
  error?: string;
  message?: string;
  issues?: WithdrawalFormFailure["issues"];
  values?: WithdrawalFormValues;
}

/** Confirmations start unchecked; only the caller's failed submission restores them. */
export function initialWithdrawalValues(
  form: MemberWithdrawalActionState | null,
) {
  return form?.operation === "withdrawalRequested" && form.values
    ? { ...form.values }
    : { ackInfo: false, ackDataPolicy: false, confirmName: "" };
}

export function withdrawalFailureMessage(
  form: MemberWithdrawalActionState | null,
) {
  if (!form?.error) return null;
  const cancellation = form.operation === "withdrawalCancelled";
  if (form.error === "SERVICE_UNAVAILABLE") {
    return "처리 결과를 확인하지 못했습니다. 상태가 바뀌었을 수 있으니 새로고침해 확인한 뒤 다시 시도해 주세요.";
  }
  const detail =
    Object.values(form.issues ?? {}).find(Boolean) ??
    form.message ??
    {
      UNAUTHORIZED: "다시 로그인한 뒤 시도해 주세요.",
      FORBIDDEN: "현재 계정에서 처리할 수 없습니다. 계정 상태를 확인해 주세요.",
      NOT_FOUND:
        "신청이 이미 처리되었을 수 있습니다. 현재 회원 상태를 다시 확인해 주세요.",
      CONFLICT: cancellation
        ? "회원 상태가 바뀌었습니다. 현재 상태를 다시 확인해 주세요."
        : "진행 중인 스터디의 주최자를 먼저 인계해야 합니다.",
      WRITE_CONFLICT:
        "다른 처리와 겹쳤습니다. 현재 상태를 확인하고 다시 시도해 주세요.",
      VALIDATION_FAILED: "두 확인 항목과 등록된 이름을 확인해 주세요.",
    }[form.error] ??
    "현재 상태를 확인하고 다시 시도해 주세요.";
  return `${cancellation ? "탈퇴 신청을 철회" : "탈퇴를 신청"}하지 못했습니다. ${detail}`;
}

export function withdrawalTimeLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
