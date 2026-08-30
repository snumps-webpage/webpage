import { z } from "zod";
import { Id, SourceRequestId } from "./common";

/** 🔒 PII table. Never reaches any public load (API-SPEC §3). */
export const PrivateInfoSchema = z.object({
  id: Id,
  memberId: Id, // canonical direction of the member↔private-info relation
  // login matching key (unique when present) — 이메일 미기록 옛 회원은 빈 문자열
  email: z.string().email().or(z.literal("")),
  phone: z.string(),
  background: z.string(),
  // 학번 (S9) — 신규 가입부터 필수 수집. 형식 강제는 폼/액션 계층에서 하고,
  // 스키마는 legacy 이관·테스트 픽스처를 위해 빈 문자열을 허용한다.
  studentId: z.string().default(""),
  // Per-type mail preferences; one key today, more types add keys (not a migration).
  mailPrefs: z.object({ announcements: z.boolean() }),
  sourceRequestId: SourceRequestId,
});

export type PrivateInfo = z.infer<typeof PrivateInfoSchema>;
