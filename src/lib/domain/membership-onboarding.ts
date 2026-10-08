export interface MembershipFormValues {
  phone: string;
  studentId: string;
  background: string;
  agreement?: string;
}
export interface MembershipActionState {
  success?: boolean;
  operation?:
    "applicationSubmitted" | "applicationUpdated" | "applicationWithdrawn";
  error?: string;
  message?: string;
  issues?: Partial<Record<keyof MembershipFormValues | "_form", string>>;
  values?: MembershipFormValues;
}
export function membershipSubmissionTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "신청 시각 확인 불가"
    : new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: false,
      }).format(date);
}
