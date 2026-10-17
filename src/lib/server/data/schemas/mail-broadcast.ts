import { z } from "zod";
import { DateTime } from "./common";

export const BROADCAST_STATUSES = [
  "sending",
  "sent",
  "partial",
  "failed",
] as const;

/**
 * 전체 회원 `.eml` 발송 기록 (발송 1건당 1행). 수신자 주소·본문은 저장하지
 * 않고 건수만 남긴다. 같은 messageId는 `failed`가 아닌 한 한 번만 선점된다
 * (D-000110).
 */
export const MailBroadcastSchema = z.object({
  id: z.string().min(1),
  messageId: z.string().min(1),
  subject: z.string(),
  sentBy: z.string().min(1),
  startedAt: DateTime,
  finishedAt: DateTime.nullable(),
  recipientCount: z.number().int().min(0),
  batchesSent: z.number().int().min(0),
  batchesFailed: z.number().int().min(0),
  status: z.enum(BROADCAST_STATUSES),
});

export type MailBroadcast = z.infer<typeof MailBroadcastSchema>;
