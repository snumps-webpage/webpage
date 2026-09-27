import { z } from "zod/v4";
import { fieldIssues, formText } from "$lib/domain/form-data";

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

/**
 * The mail types a member can turn off — the one list behind the toggle's
 * rule, the stored `private-info.mailPrefs` keys and their defaults (audit
 * LC01-3). A type added here is stored, not stripped by the table gate.
 */
export const MAIL_PREFERENCE_TYPES = ["announcements"] as const;
export type MailPreferenceType = (typeof MAIL_PREFERENCE_TYPES)[number];
export type MailPrefs = Record<MailPreferenceType, boolean>;

/** Every type is on until the member turns it off. */
export const DEFAULT_MAIL_PREFS: Readonly<MailPrefs> = Object.freeze(
  Object.fromEntries(
    MAIL_PREFERENCE_TYPES.map((type) => [type, true]),
  ) as MailPrefs,
);

const mailPreferenceInputSchema = z.object({
  type: z.enum(MAIL_PREFERENCE_TYPES, {
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

  const issues: WithdrawalFormFailure["issues"] = fieldIssues(result.error, [
    "ackInfo",
    "ackDataPolicy",
    "confirmName",
  ] as const);

  return {
    ...result,
    failure: {
      error: "VALIDATION_FAILED" as const,
      issues,
      values,
    } satisfies WithdrawalFormFailure,
  };
}

/**
 * The end of the withdrawal grace period: one calendar month after the
 * request (API-SPEC §4-7 — the "1개월" the pages promise), on the KST
 * calendar, clamped to the last day of a shorter month (Jan 31 → Feb 28).
 * The single definition — the services use it (audit LB27-1: they used a
 * separate 30-day constant).
 */
export function withdrawalGraceEndsAt(requestedAt: string): string {
  const KST = 9 * 60 * 60 * 1000;
  const k = new Date(new Date(requestedAt).getTime() + KST); // KST wall clock in UTC fields
  const y = k.getUTCFullYear();
  const m = k.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const end = Date.UTC(
    y,
    m,
    Math.min(k.getUTCDate(), lastDay),
    k.getUTCHours(),
    k.getUTCMinutes(),
    k.getUTCSeconds(),
    k.getUTCMilliseconds(),
  );
  return new Date(end - KST).toISOString();
}
