import { z } from "zod";
import { DateTime } from "./common";

/**
 * `.eml` 업로드 한 건마다 하나인 편집 초안 (D-000192). 본문 HTML은 staging의
 * `<확장자 뗀 키>/draft.html`에 있고, 이 행은 메타만 가진다. `removedAttachments`는
 * 발송에서 뺄 첨부 번호.
 */
export const MailBroadcastDraftSchema = z.object({
  id: z.string().min(1),
  s3Key: z.string().min(1),
  messageId: z.string().min(1),
  subject: z.string().min(1),
  removedAttachments: z.array(z.number().int().min(0)),
  savedBy: z.string().min(1),
  savedAt: DateTime,
});

export type MailBroadcastDraft = z.infer<typeof MailBroadcastDraftSchema>;
