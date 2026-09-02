import { z } from "zod";
import { DateTime, Id } from "./common";

/**
 * 자동 전송 메일 템플릿 오버라이드 (관리자 대시보드에서 편집).
 *
 * 행이 없으면 코드의 기본 문구(mail/template-store.ts)가 쓰인다 — 이 테이블은
 * "기본값과 달라진 것"만 담는 오버라이드 계층이다. enabled=false는 해당 자동
 * 메일의 발송 자체를 끈다 (행 삭제 = 기본 문구로 복원).
 */
export const MailTemplateSchema = z.object({
  id: Id,
  /** 기본 템플릿 오버라이드 키(예: "welcome") 또는 커스텀 키("custom-…") */
  key: z.string().min(1),
  /** 커스텀 템플릿의 표시 이름 (기본 템플릿 오버라이드는 빈 문자열) */
  name: z.string().default(""),
  subject: z.string().min(1),
  body: z.string().min(1),
  enabled: z.boolean(),
  /** 직전 버전 스냅숏 — 되돌리기는 현재와 이걸 맞바꾼다 (이력은 1단계만) */
  previous: z
    .object({ subject: z.string(), body: z.string(), enabled: z.boolean() })
    .nullable()
    .default(null),
  updatedAt: DateTime,
});

export type MailTemplate = z.infer<typeof MailTemplateSchema>;
