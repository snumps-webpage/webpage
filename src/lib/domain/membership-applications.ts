import { z } from "zod";

export const membershipApplicationInputSchema = z.object({
  phone: z
    .string()
    .regex(/^010-\d{4}-\d{4}$/, "010-0000-0000 형식으로 입력해 주세요."),
  background: z
    .string()
    .trim()
    .max(2000, "배경지식은 2,000자 이하로 입력해 주세요."),
  agreement: z.literal("on", {
    message: "개인정보 수집 및 이용에 동의해 주세요.",
  }),
});

export const membershipApplicationUpdateSchema =
  membershipApplicationInputSchema.omit({
    agreement: true,
  });

export function membershipApplicationIssues(error: z.ZodError) {
  const issues: Record<string, string> = {};
  for (const issue of error.issues) {
    issues[String(issue.path[0] ?? "_form")] ??= issue.message;
  }
  return issues;
}
