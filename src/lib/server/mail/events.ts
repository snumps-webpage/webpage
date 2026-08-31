/**
 * 자동 메일 이벤트 카탈로그 (S10) — 코드에 고정되는 닫힌 집합.
 *
 * 이벤트 = 도메인 수명주기의 발생 시점. 각 이벤트는 제공 변수와 허용 수신자
 * 종류, 그리고 기본 규칙(어떤 템플릿을 누구에게)을 선언한다. 실제 발송 규칙은
 * mail-rules 테이블이 덮어쓴다 — 그 이벤트의 행이 하나라도 있으면 테이블이
 * 전체 진실, 없으면 여기의 defaultRules가 쓰인다.
 *
 * 새 이벤트 추가 = 여기 선언 + 발생 지점에 emitMailEvent() 한 줄.
 * 새 수신자 종류 추가 = RECIPIENTS에 해석기 등록.
 */

export const RECIPIENTS = {
  party: "당사자 (이벤트의 대상 본인 — 신청자·회원)",
  admins: "관리자 전원 (ADMINS_EMAILS)",
  executives: "현 학기 회장·부회장 (없으면 관리자)",
  "members-opted-in": "수신 동의한 전 회원 (Bcc 배치)",
} as const;

export type RecipientKind = keyof typeof RECIPIENTS;

export interface MailEventDef {
  name: string;
  description: string;
  /** 이 이벤트가 템플릿에 제공하는 변수 */
  variables: string[];
  /** 규칙에서 고를 수 있는 수신자 종류 */
  allowedRecipients: RecipientKind[];
  /** mail-rules에 행이 없을 때의 기본 규칙 */
  defaultRules: { templateKey: string; recipient: RecipientKind }[];
}

export const MAIL_EVENTS: Record<string, MailEventDef> = {
  "application.submitted": {
    name: "가입 신청 접수",
    description: "회원 가입/재가입 신청서가 제출된 순간",
    variables: ["applicantName"],
    allowedRecipients: ["admins", "executives"],
    defaultRules: [{ templateKey: "signup-received", recipient: "admins" }],
  },
  "application.approved": {
    name: "가입 신청 승인",
    description: "관리자가 가입/재가입 신청을 승인한 순간",
    variables: ["name"],
    allowedRecipients: ["party", "admins", "executives"],
    defaultRules: [{ templateKey: "welcome", recipient: "party" }],
  },
  "application.rejected": {
    name: "가입 신청 거절",
    description: "관리자가 가입 신청을 거절한 순간 (인적사항 삭제 직전)",
    variables: ["name"],
    allowedRecipients: ["party", "admins", "executives"],
    defaultRules: [{ templateKey: "application-rejected", recipient: "party" }],
  },
  "attendance.requested": {
    name: "출석 승인 요청",
    description: "회원이 행사 출석 승인을 요청한 순간",
    variables: ["userName", "eventName"],
    allowedRecipients: ["admins", "executives"],
    defaultRules: [{ templateKey: "attendance-request", recipient: "admins" }],
  },
  "seminar-request.submitted": {
    name: "세미나 개설 신청 접수",
    description: "세미나 개설 신청서가 제출된 순간",
    variables: ["applicantName", "title"],
    allowedRecipients: ["admins", "executives"],
    defaultRules: [{ templateKey: "seminar-request-received", recipient: "admins" }],
  },
  "seminar-request.approved": {
    name: "세미나 신청 승인",
    description: "관리자가 세미나 개설 신청을 승인한 순간",
    variables: ["name", "title"],
    allowedRecipients: ["party", "admins", "executives"],
    defaultRules: [{ templateKey: "seminar-approved", recipient: "party" }],
  },
  "seminar-request.rejected": {
    name: "세미나 신청 반려",
    description: "관리자가 세미나 개설 신청을 반려한 순간",
    variables: ["name", "title"],
    allowedRecipients: ["party", "admins", "executives"],
    defaultRules: [{ templateKey: "seminar-rejected", recipient: "party" }],
  },
  "study-request.submitted": {
    name: "스터디 개설 신청 접수",
    description: "스터디 개설 신청서가 제출된 순간",
    variables: ["applicantName", "title"],
    allowedRecipients: ["admins", "executives"],
    defaultRules: [{ templateKey: "study-request-received", recipient: "admins" }],
  },
  "study-request.approved": {
    name: "스터디 신청 승인",
    description: "관리자가 스터디 개설 신청을 승인한 순간",
    variables: ["name", "title"],
    allowedRecipients: ["party", "admins", "executives"],
    defaultRules: [{ templateKey: "study-approved", recipient: "party" }],
  },
  "study-request.rejected": {
    name: "스터디 신청 반려",
    description: "관리자가 스터디 개설 신청을 반려한 순간",
    variables: ["name", "title"],
    allowedRecipients: ["party", "admins", "executives"],
    defaultRules: [{ templateKey: "study-rejected", recipient: "party" }],
  },
  "seminar.published": {
    name: "세미나 공개",
    description: "세미나가 일정과 함께 공개된 순간",
    variables: ["title", "description", "siteUrl", "optOutUrl"],
    allowedRecipients: ["members-opted-in", "admins", "executives"],
    defaultRules: [{ templateKey: "seminar-announcement", recipient: "members-opted-in" }],
  },
  "withdrawal.requested": {
    name: "회원 탈퇴 신청",
    description: "회원이 탈퇴를 신청한 순간",
    variables: ["memberName", "adminUrl"],
    allowedRecipients: ["executives", "admins"],
    defaultRules: [{ templateKey: "withdrawal-executive-notice", recipient: "executives" }],
  },
};

export type MailEventKey = keyof typeof MAIL_EVENTS;
