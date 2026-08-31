import { z } from "zod";
import { MemberSchema } from "./member";
import { PrivateInfoSchema } from "./private-info";
import { ActivitySchema } from "./activity";
import { EventSchema } from "./event";
import { ApplicationSchema } from "./application";
import { SeminarRequestSchema } from "./seminar-request";
import { StudyRequestSchema } from "./study-request";
import { StudySchema } from "./study";
import { SeminarSchema } from "./seminar";
import { GalleryDinnerSchema } from "./gallery-dinner";
import { RegistrationSchema } from "./registration";
import { MailTemplateSchema } from "./mail-template";
import { MailRuleSchema } from "./mail-rule";
import { MailVariableSchema } from "./mail-variable";
import { MailRuleHistorySchema } from "./mail-rule-history";

/**
 * The table registry — the single source of truth for what lives in S3
 * and what shape it has (API-SPEC §2). The attendance queue is deliberately
 * NOT here: it is stored per event (see ./attendance-record).
 */
export const TABLES = {
  members: MemberSchema,
  "private-info": PrivateInfoSchema,
  // S9: 학기별 등록제 — 등록 행 (승인이 생성)
  registrations: RegistrationSchema,
  // S9: 노션 이주분 원본 — 순수 기록용 아카이브. 운영 로직은 절대 쓰지(write) 않는다.
  "legacy-members": MemberSchema,
  "legacy-private-info": PrivateInfoSchema,
  activities: ActivitySchema,
  events: EventSchema,
  applications: ApplicationSchema,
  "seminar-requests": SeminarRequestSchema,
  "study-requests": StudyRequestSchema,
  studies: StudySchema,
  seminars: SeminarSchema,
  "gallery-dinner": GalleryDinnerSchema,
  // 자동 메일 템플릿 오버라이드 — 관리자 대시보드에서 편집 (기본값은 코드)
  "mail-templates": MailTemplateSchema,
  // S10: 이벤트→템플릿→수신자 발송 규칙 (이벤트·수신자 종류는 코드의 닫힌 집합)
  "mail-rules": MailRuleSchema,
  // S10 확장: 전 템플릿 공용 {{변수}} — 코드 기본값 오버라이드 + 관리자 정의
  "mail-variables": MailVariableSchema,
  // 이벤트별 규칙의 직전 스냅숏 (되돌리기 1단계)
  "mail-rule-history": MailRuleHistorySchema,
} as const;

export type TableName = keyof typeof TABLES;
export type RowOf<N extends TableName> = z.infer<(typeof TABLES)[N]>;

export const TABLE_NAMES = Object.keys(TABLES) as TableName[];

/** Every stored object is wrapped so field-shape changes can branch on version. */
export const envelope = <S extends z.ZodTypeAny>(row: S) =>
  z.object({ schemaVersion: z.literal(1), rows: z.array(row) });

export const SCHEMA_VERSION = 1;

export * from "./common";
export * from "./member";
export * from "./private-info";
export * from "./activity";
export * from "./event";
export * from "./attendance-record";
export * from "./application";
export * from "./seminar-request";
export * from "./study-request";
export * from "./study";
export * from "./seminar";
export * from "./gallery-dinner";
export * from "./registration";
export * from "./mail-template";
export * from "./mail-rule";
export * from "./mail-variable";
export * from "./mail-rule-history";
