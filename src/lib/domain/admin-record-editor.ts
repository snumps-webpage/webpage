import { adminActionErrorMessage } from "./admin-dashboard";

export interface AdminRecordActionState {
  success?: boolean;
  operation?: string;
  scope?: string;
  id?: string;
  error?: string;
  message?: string;
  issues?: Record<string, string>;
  values?: Record<string, string>;
  presenterIds?: string[];
  attendeeIds?: string[];
}

export function scopedRecordAction(
  form: AdminRecordActionState | null | undefined,
  scope: string,
  id?: string,
) {
  return form?.scope === scope && (id === undefined || form.id === id)
    ? form
    : null;
}

/** Empty submitted text is deliberate; never fall back to the saved record. */
export function recordFieldValue(
  form: AdminRecordActionState | null | undefined,
  scope: string,
  id: string | undefined,
  field: string,
  saved: string | number,
) {
  return scopedRecordAction(form, scope, id)?.values?.[field] ?? saved;
}

export function recordPresenterIds(
  form: AdminRecordActionState | null | undefined,
  scope: string,
  id: string | undefined,
  saved: string[],
) {
  return scopedRecordAction(form, scope, id)?.presenterIds ?? saved;
}

export function recordFailureMessage(
  form: AdminRecordActionState | null | undefined,
) {
  if (!form?.error || !form.scope?.startsWith("record-")) return null;
  if (form.error === "SERVICE_UNAVAILABLE") {
    return "처리 결과를 확인하지 못했습니다. 상태가 바뀌었을 수 있으니 새로고침해 확인한 뒤 다시 시도해 주세요.";
  }
  if (
    form.error === "VALIDATION_FAILED" &&
    Object.values(form.issues ?? {}).some(Boolean)
  ) {
    return `입력값을 확인해 주세요. ${Object.values(form.issues ?? {})
      .filter(Boolean)
      .join(" · ")}`;
  }
  return adminActionErrorMessage(
    form,
    "기록을 처리하지 못했습니다. 현재 상태를 확인해 주세요.",
  );
}

/** The date-only picker uses the stored instant's KST calendar, not its ISO prefix. */
export function recordCalendarDate(value: string) {
  return new Date(Date.parse(value) + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}
