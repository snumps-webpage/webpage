import { adminActionErrorMessage } from "./admin-dashboard";

export interface AdminUtilityActionState {
  success?: boolean;
  scope?: string;
  action?: string;
  operation?: string;
  targetKey?: string;
  viewTerm?: string;
  targetTerm?: string;
  message?: string;
  error?: string;
  values?: Record<string, string>;
  count?: number;
}

export function utilityFailureMessage(
  form: AdminUtilityActionState | null | undefined,
) {
  if (!form?.error) return null;
  if (form.error === "SERVICE_UNAVAILABLE")
    return "처리 결과를 확인하지 못했습니다. 상태가 바뀌었을 수 있으니 새로고침해 확인한 뒤 다시 시도해 주세요.";
  return adminActionErrorMessage(
    form,
    "처리하지 못했습니다. 현재 상태를 확인해 주세요.",
  );
}

/** GET context stays in native named POSTs; service inputs remain in the body. */
export function executiveActionUrl(
  action: string,
  term: string,
  title: string,
) {
  const query = new URLSearchParams({ term });
  if (title) query.set("title", title);
  return `?${query}&/${action}`;
}

export function executiveNotice(
  form: AdminUtilityActionState | null | undefined,
) {
  if (form?.scope !== "executive") return null;
  const error = utilityFailureMessage(form);
  if (error) return { tone: "error" as const, message: error };
  if (!form?.success) return null;
  const labels: Record<string, string> = {
    assigned: `${form.targetTerm ?? form.viewTerm ?? ""} ${form.targetKey ?? ""} 직책을 배정하고 감사 기록을 남겼습니다.`,
    unassigned: `${form.targetTerm ?? form.viewTerm ?? ""} ${form.targetKey ?? ""} 직책을 해제하고 감사 기록을 남겼습니다.`,
    "title-added": "직위 옵션을 추가했습니다.",
    "title-removed": "직위 옵션을 제거했습니다. 과거 배정 기록은 유지합니다.",
  };
  return {
    tone: "success" as const,
    message: labels[form.operation ?? ""] ?? "처리했습니다.",
  };
}
