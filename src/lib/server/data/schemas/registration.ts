import { z } from "zod";
import { DateTime, Id, SourceRequestId, Term } from "./common";

/**
 * 학기별 등록 (재등록 게이트 — 결정 S9).
 * 회원 자격의 행사 권한은 학기 단위(1학기+여름 / 2학기+겨울 = Term 단위)로
 * 등록해야 생긴다. 등록은 가입/재가입 신청의 관리자 승인으로만 생성된다.
 */
export const RegistrationSchema = z.object({
  id: Id,
  memberId: Id,
  term: Term, // 등록 학기 — 승인 시점의 currentTerm()
  registeredAt: DateTime,
  sourceRequestId: SourceRequestId,
});

export type Registration = z.infer<typeof RegistrationSchema>;
