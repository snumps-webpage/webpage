import { actionErrorText } from "./api";
import type {
  StudyRequestFormIssues,
  StudyRequestFormValues,
  StudyRequestStatus,
} from "./studies";

/** Response identity keeps a withdrawal result out of the proposal draft. */
export interface StudyProposalActionState {
  success?: boolean;
  operation?: "requestSubmitted" | "requestWithdrawn";
  requestId?: string;
  error?: string;
  message?: string;
  issues?: StudyRequestFormIssues;
  values?: StudyRequestFormValues;
}

export interface StudyProposalRecord extends StudyRequestFormValues {
  id: string;
  status: StudyRequestStatus;
  submittedAt: string;
}

export const STUDY_PROPOSAL_STATUS: Record<
  StudyRequestStatus,
  { label: string; description: string }
> = {
  pending: {
    label: "검토 중",
    description:
      "운영진이 개설 내용을 검토하고 있습니다. 승인 전에는 철회할 수 있습니다.",
  },
  approved: {
    label: "승인됨",
    description:
      "개설이 승인되었습니다. 스터디 목록에서 모집과 회차를 관리해 주세요.",
  },
  rejected: {
    label: "반려됨",
    description:
      "이 신청은 개설되지 않았습니다. 내용을 다시 준비해 새 신청을 제출할 수 있습니다.",
  },
  withdrawn: {
    label: "철회됨",
    description: "이 신청은 검토 대상에서 제외되었습니다.",
  },
};

export function orderStudyProposals<T extends { status: StudyRequestStatus }>(
  requests: readonly T[],
): T[] {
  // Keep the server's newest-first order inside each group.
  return [
    ...requests.filter((request) => request.status === "pending"),
    ...requests.filter((request) => request.status !== "pending"),
  ];
}

export function studyProposalDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "제출일 미상"
    : new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(date);
}

export function studyWithdrawalError(
  form: StudyProposalActionState | null | undefined,
): string | null {
  if (form?.operation !== "requestWithdrawn" || form.success) return null;
  if (form.error === "CONFLICT")
    return "신청 상태가 바뀌어 철회하지 못했습니다. 아래 최신 상태를 확인해 주세요.";
  if (form.error === "NOT_FOUND")
    return "철회할 신청을 찾을 수 없습니다. 목록을 새로고침해 주세요.";
  return (
    form.issues?._form ??
    actionErrorText(
      form,
      "신청을 철회하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    )
  );
}
