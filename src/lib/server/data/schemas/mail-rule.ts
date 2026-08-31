import { z } from "zod";
import { DateTime, Id } from "./common";

/**
 * 자동 메일 발송 규칙 (S10): "이벤트 → 템플릿 → 수신자" 한 행.
 *
 * 이벤트·수신자 종류는 코드의 닫힌 집합(mail/events.ts)이고, 이 테이블은
 * 어떤 이벤트에 어떤 템플릿을 누구에게 보낼지의 운영 가변부만 담는다.
 * 특정 이벤트의 행이 하나도 없으면 코드의 기본 규칙 세트가 쓰인다 —
 * 관리자가 그 이벤트를 처음 편집하는 순간 기본 규칙이 행으로 실체화된다.
 */
export const MailRuleSchema = z.object({
  id: Id,
  /** mail/events.ts MAIL_EVENTS의 키 */
  event: z.string().min(1),
  /** mail-templates 오버라이드 행 또는 코드 기본 템플릿의 키 */
  templateKey: z.string().min(1),
  /** mail/events.ts RECIPIENTS의 키 (party|admins|executives|members-opted-in) */
  recipient: z.string().min(1),
  enabled: z.boolean(),
  updatedAt: DateTime,
});

export type MailRule = z.infer<typeof MailRuleSchema>;
