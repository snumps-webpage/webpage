import { z } from "zod/v4";
import { formText } from "$lib/domain/form-data";
import type { MemberStatus } from "$lib/domain/members";

export interface AccountSettingsData {
  memberId: string;
  name: string;
  email: string;
  status: MemberStatus;
  announcementsEnabled: boolean;
  withdrawal: {
    requestedAt: string;
    graceEndsAt: string;
    holdBy: string | null;
  } | null;
}

export interface MailPreferenceFormFailure {
  error: "VALIDATION_FAILED";
  issues: Partial<Record<"type" | "enabled", string>>;
  values: { type: string; enabled: string };
}

export interface WithdrawalFormValues {
  ackInfo: boolean;
  ackDataPolicy: boolean;
  confirmName: string;
}

export interface WithdrawalFormFailure {
  error: "VALIDATION_FAILED";
  issues: Partial<
    Record<"ackInfo" | "ackDataPolicy" | "confirmName" | "_form", string>
  >;
  values: WithdrawalFormValues;
}

const mailPreferenceInputSchema = z.object({
  type: z.literal("announcements", {
    error: "지원하지 않는 알림 유형입니다.",
  }),
  enabled: z.enum(["true", "false"], {
    error: "알림 수신 여부를 확인해 주세요.",
  }),
});

/** Mail preference rules — the single source; setMailPref validates with it. */
export function validateMailPreferenceForm(formData: FormData) {
  const values = {
    type: formText(formData, "type"),
    enabled: formText(formData, "enabled"),
  };
  const result = mailPreferenceInputSchema.safeParse(values);

  if (result.success) {
    return {
      success: true as const,
      data: {
        type: result.data.type,
        enabled: result.data.enabled === "true",
      },
    };
  }

  const issues: MailPreferenceFormFailure["issues"] = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (field === "type" || field === "enabled")
      issues[field] ??= issue.message;
  }
  return {
    success: false as const,
    failure: {
      error: "VALIDATION_FAILED" as const,
      issues,
      values,
    } satisfies MailPreferenceFormFailure,
  };
}

export function withdrawalValuesFromFormData(
  formData: FormData,
): WithdrawalFormValues {
  return {
    ackInfo: formText(formData, "ackInfo") === "on",
    ackDataPolicy: formText(formData, "ackDataPolicy") === "on",
    confirmName: formText(formData, "confirmName"),
  };
}

/**
 * Withdrawal rules — the single source; the withdraw action validates with
 * these, and services/withdrawal.ts re-checks the three factors atomically.
 * The name is compared trimmed, as the service compares it.
 */
export function validateWithdrawalRequestForm(
  formData: FormData,
  expectedName: string,
) {
  const values = withdrawalValuesFromFormData(formData);
  const schema = z
    .object({
      ackInfo: z
        .boolean()
        .refine(Boolean, "탈퇴 후 접근 제한 안내를 확인해 주세요."),
      ackDataPolicy: z
        .boolean()
        .refine(Boolean, "개인정보 처리 정책을 확인해 주세요."),
      confirmName: z
        .string()
        .trim()
        .min(1, "본인 이름을 입력해 주세요.")
        .max(200, "이름은 200자 이하로 입력해 주세요."),
    })
    .superRefine((value, context) => {
      if (value.confirmName !== expectedName) {
        context.addIssue({
          code: "custom",
          path: ["confirmName"],
          message: "회원 정보에 등록된 이름과 정확히 일치해야 합니다.",
        });
      }
    });
  const result = schema.safeParse(values);
  if (result.success) return result;

  const issues: WithdrawalFormFailure["issues"] = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (
      field === "ackInfo" ||
      field === "ackDataPolicy" ||
      field === "confirmName"
    ) {
      issues[field] ??= issue.message;
    } else {
      issues._form ??= issue.message;
    }
  }

  return {
    ...result,
    failure: {
      error: "VALIDATION_FAILED" as const,
      issues,
      values,
    } satisfies WithdrawalFormFailure,
  };
}

export function withdrawalGraceEndsAt(requestedAt: string) {
  const date = new Date(requestedAt);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString();
}
