import { z } from "zod";
import { DateTime, Id } from "./common";

/**
 * 메일 공용 변수 (S10 확장): 모든 템플릿에서 {{key}}로 쓸 수 있는 상수 값.
 * 코드 기본값(카톡 링크 등)의 오버라이드이거나 관리자가 새로 만든 변수다.
 * 이벤트가 발송 시점에 공급하는 런타임 변수(name·title 등)와 키가 겹치면
 * 이벤트 값이 우선한다.
 */
export const MailVariableSchema = z.object({
  id: Id,
  /** {{key}}로 참조 — 영문자로 시작, 영숫자만 */
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/),
  value: z.string(),
  description: z.string().default(""),
  updatedAt: DateTime,
});

export type MailVariable = z.infer<typeof MailVariableSchema>;
