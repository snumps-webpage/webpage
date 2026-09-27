import { z } from "zod/v4";

/** Signup rules — the single source; the signup actions validate with these. */
export const membershipApplicationInputSchema = z.object({
  phone: z
    .string()
    .regex(/^010-\d{4}-\d{4}$/, "010-0000-0000 형식으로 입력해 주세요."),
  studentId: z
    .string()
    .trim()
    .regex(/^\d{4}-?\d{4,6}$/, "학번을 2024-12345 형식으로 입력해 주세요."),
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
