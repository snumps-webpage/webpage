export type PreferenceOperation =
  "mailPreferenceUpdated" | "phonePreferenceUpdated";

export interface PreferenceActionState {
  operation?: PreferenceOperation;
  success?: boolean;
  error?: string;
  message?: string;
  issues?: Partial<Record<"type" | "enabled" | "hide" | "_form", string>>;
}

export function preferenceFeedback(form: PreferenceActionState | null) {
  if (!form?.operation) return null;
  const subject =
    form.operation === "phonePreferenceUpdated"
      ? "전화번호 공개 설정"
      : "공지 메일 설정";
  if (form.success) return { error: false, text: `${subject}을 저장했습니다.` };
  if (!form.error) return null;
  const explanation =
    Object.values(form.issues ?? {}).find(Boolean) ??
    form.message ??
    {
      UNAUTHORIZED: "다시 로그인한 뒤 시도해 주세요.",
      FORBIDDEN: "이 계정에서 변경할 수 없는 설정입니다.",
      NOT_FOUND: "회원 연락 정보를 찾을 수 없습니다. 운영진에게 문의해 주세요.",
      CONFLICT:
        "설정이 변경되었습니다. 현재 상태를 확인하고 다시 시도해 주세요.",
      SERVICE_UNAVAILABLE: "잠시 후 다시 시도해 주세요.",
    }[form.error] ??
    "현재 상태를 확인하고 다시 시도해 주세요.";
  return {
    error: true,
    text: `${subject}을 저장하지 못했습니다. ${explanation}`,
  };
}
