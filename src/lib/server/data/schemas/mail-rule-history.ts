import { z } from "zod";
import { DateTime } from "./common";

/**
 * 이벤트별 발송 규칙의 직전 스냅숏 (이벤트당 1행, 이력은 1단계만).
 * 규칙 변경(추가/제거/켬끔) 직전의 규칙 세트를 담고, "직전으로 되돌리기"는
 * 현재 세트와 이 스냅숏을 맞바꾼다.
 */
export const MailRuleHistorySchema = z.object({
  event: z.string().min(1),
  rules: z.array(
    z.object({
      templateKey: z.string().min(1),
      recipient: z.string().min(1),
      enabled: z.boolean(),
    }),
  ),
  updatedAt: DateTime,
});

export type MailRuleHistory = z.infer<typeof MailRuleHistorySchema>;
