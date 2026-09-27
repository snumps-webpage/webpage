import { z } from "zod/v4";
import { backgroundInput, phoneInput } from "$lib/domain/members";

/**
 * Signup rules — the single source; the signup actions validate with these.
 * Phone and background are copied into private-info on approval, so they take
 * the members' rules (audit LC11-4).
 */
export const membershipApplicationInputSchema = z.object({
  phone: phoneInput,
  studentId: z
    .string()
    .trim()
    .regex(/^\d{4}-?\d{4,6}$/, "학번을 2024-12345 형식으로 입력해 주세요."),
  background: backgroundInput,
  agreement: z.literal("on", {
    message: "개인정보 수집 및 이용에 동의해 주세요.",
  }),
});

export const membershipApplicationUpdateSchema =
  membershipApplicationInputSchema.omit({
    agreement: true,
  });
