import { CHATROOM_CHAT_LINK, CHATROOM_NOTICE_LINK } from "$lib/constants";
import { getTable } from "$lib/server/data/tables";

/**
 * 자동 메일 템플릿의 단일 원천.
 *
 * - 기본 문구는 여기(코드)에 산다 — DB가 비어도 모든 메일이 동작한다.
 * - 관리자 대시보드(/admin/mail)의 수정은 mail-templates 테이블의
 *   오버라이드 행이 되고, 이 모듈의 render가 그것을 우선한다.
 * - enabled=false 오버라이드는 해당 메일의 발송을 끈다 (render → null).
 * - 변수는 {{name}} 표기 — 발송 지점이 넘기는 vars로 치환되고, 템플릿의
 *   변수 목록(variables)은 편집 화면의 힌트다.
 */

export interface MailTemplateDefault {
  /** 편집 화면에 보여줄 이름 */
  name: string;
  /** 수신 대상·발송 시점 설명 */
  description: string;
  /** 본문·제목에서 쓸 수 있는 {{변수}} 목록 */
  variables: string[];
  subject: string;
  body: string;
}

export const MAIL_TEMPLATE_DEFAULTS: Record<string, MailTemplateDefault> = {
  "signup-received": {
    name: "가입 신청 접수 (관리자)",
    description: "새 가입 신청이 접수되면 관리자 전원에게",
    variables: ["applicantName"],
    subject: "[SNUMPS] 새 회원 가입 신청: {{applicantName}}",
    body: `안녕하세요, 관리자님.

새로운 회원 가입 신청이 접수되었습니다.

신청자 이름: {{applicantName}}

관리자 페이지에서 확인 후 승인해주세요.`,
  },
  welcome: {
    name: "가입 승인 환영",
    description: "가입/재가입 신청 승인 시 신청자에게",
    variables: ["name", "noticeChatLink", "casualChatLink"],
    subject: "[SNUMPS] 가입이 승인되었습니다!",
    body: `안녕하세요, {{name}}님!

수학문제연구회 가입을 축하드립니다!

동아리 카카오톡 채팅방은 다음과 같습니다.
- 공지방 : {{noticeChatLink}}
- 잡담방 : {{casualChatLink}}

공지방에서는 채팅을 자제하시고, 문의 사항은 잡담방이나 회장을 통해 알려주세요. 동아리의 자료와 가이드라인은 공식 웹사이트에서 확인할 수 있습니다. 수학문제연구회에 오신 것을 환영합니다.`,
  },
  "application-rejected": {
    name: "가입 신청 거절",
    description: "가입 신청 거절 시 신청자에게 (인적사항 삭제 직전 발송)",
    variables: ["name"],
    subject: "[SNUMPS] 가입 신청 결과 안내",
    body: `안녕하세요, {{name}}님.

서울대학교 수학문제연구회 가입 신청 검토 결과, 아쉽게도 이번에는 함께하지 못하게 되었습니다.

문의 사항이 있으시면 회신으로 알려주세요. 감사합니다.`,
  },
  "attendance-request": {
    name: "출석 승인 요청 (관리자)",
    description: "회원이 행사 출석 승인을 요청하면 관리자 전원에게",
    variables: ["userName", "eventName"],
    subject: "[SNUMPS] 출석 승인 요청: {{userName}} - {{eventName}}",
    body: `안녕하세요, 관리자님.

{{userName}}님이 '{{eventName}}' 이벤트에 대한 출석 승인을 요청했습니다.

입실 및 퇴장 시간이 모두 기록되었으니, 관리자 페이지에서 확인 후 승인해주세요.`,
  },
  "seminar-request-received": {
    name: "세미나 개설 신청 접수 (관리자)",
    description: "새 세미나 개설 신청이 접수되면 관리자 전원에게",
    variables: ["applicantName", "title"],
    subject: "[SNUMPS] 새 세미나 신청: {{title}}",
    body: `안녕하세요, 관리자님.

{{applicantName}}님으로부터 새로운 세미나 개설 신청이 접수되었습니다.

주제: {{title}}

관리자 페이지에서 확인 후 승인 또는 반려해주세요.`,
  },
  "study-request-received": {
    name: "스터디 개설 신청 접수 (관리자)",
    description: "새 스터디 개설 신청이 접수되면 관리자 전원에게",
    variables: ["applicantName", "title"],
    subject: "[SNUMPS] 새 스터디 개설 신청: {{title}}",
    body: `안녕하세요, 관리자님.

{{applicantName}}님으로부터 새로운 스터디 개설 신청이 접수되었습니다.

분야: {{title}}

관리자 페이지에서 확인 후 승인 또는 반려해주세요.`,
  },
  "seminar-approved": {
    name: "세미나 신청 승인",
    description: "세미나 개설 신청 승인 시 신청자에게",
    variables: ["name", "title"],
    subject: "[SNUMPS] 세미나 신청 결과 안내: {{title}}",
    body: `안녕하세요, {{name}}님.

신청하신 세미나 '{{title}}'가 승인되었습니다.

세부 일정은 발표자와 조율한 뒤 공식 웹사이트에 게시합니다. 일정이 확정되거나 이후 변경되면 별도 안내 메일을 보내드립니다.

감사합니다.`,
  },
  "seminar-rejected": {
    name: "세미나 신청 반려",
    description: "세미나 개설 신청 반려 시 신청자에게",
    variables: ["name", "title"],
    subject: "[SNUMPS] 세미나 신청 결과 안내: {{title}}",
    body: `안녕하세요, {{name}}님.

신청하신 세미나 '{{title}}'가 반려되었습니다.

아쉽게도 이번 세미나는 개설이 어렵게 되었습니다.

감사합니다.`,
  },
  "study-approved": {
    name: "스터디 신청 승인",
    description: "스터디 개설 신청 승인 시 신청자에게",
    variables: ["name", "title"],
    subject: "[SNUMPS] 스터디 개설 신청 결과 안내: {{title}}",
    body: `안녕하세요, {{name}}님.

신청하신 스터디 '{{title}}'가 승인되었습니다.

홈페이지의 스터디 관리 페이지에서 인원과 회차를 관리할 수 있습니다.

감사합니다.`,
  },
  "study-rejected": {
    name: "스터디 신청 반려",
    description: "스터디 개설 신청 반려 시 신청자에게",
    variables: ["name", "title"],
    subject: "[SNUMPS] 스터디 개설 신청 결과 안내: {{title}}",
    body: `안녕하세요, {{name}}님.

신청하신 스터디 '{{title}}'가 반려되었습니다.

아쉽게도 이번 스터디는 개설이 어렵게 되었습니다.

감사합니다.`,
  },
  "seminar-announcement": {
    name: "새 세미나 전체 공지",
    description: "세미나 공개 시 수신 동의한 전 회원에게 (Bcc 배치)",
    variables: ["title", "description", "siteUrl", "optOutUrl"],
    subject: "[SNUMPS] 새 세미나 안내: {{title}}",
    body: `안녕하세요, 서울대학교 수학문제연구회입니다.

새 세미나가 개설되었습니다.

제목: {{title}}

{{description}}

참가 신청은 홈페이지 대시보드에서 할 수 있습니다: {{siteUrl}}/

---
이 공지 메일을 더 이상 받고 싶지 않으시면 아래에서 수신을 해제할 수 있습니다.
{{optOutUrl}}`,
  },
  "withdrawal-executive-notice": {
    name: "탈퇴 신청 통지 (회장단)",
    description: "회원이 탈퇴를 신청하면 현 학기 회장·부회장에게 (없으면 관리자)",
    variables: ["memberName", "adminUrl"],
    subject: "[SNUMPS] 회원 탈퇴 신청: {{memberName}}",
    body: `안녕하세요, 회장단님.

{{memberName}} 회원이 탈퇴를 신청했습니다.

신청일로부터 1개월 후 회원의 인적사항이 삭제 대상이 됩니다(현재 자동 삭제는 보류 상태).
정보 보존이 필요하면 관리자 페이지의 회원 상세에서 보존을 집행해 주세요.

{{adminUrl}}`,
  },
};

export type MailTemplateKey = keyof typeof MAIL_TEMPLATE_DEFAULTS;

/** 발송 지점이 넘기지 않아도 항상 쓸 수 있는 공용 변수. */
function builtinVars(): Record<string, string> {
  return {
    noticeChatLink: CHATROOM_NOTICE_LINK,
    casualChatLink: CHATROOM_CHAT_LINK,
  };
}

function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

/**
 * key의 현행 템플릿(오버라이드 우선)을 변수 치환해 반환.
 * null = 이 메일이 꺼져 있음(enabled=false) — 호출부는 발송을 건너뛴다.
 * 템플릿 조회 실패는 기본값으로 폴백한다 — 메일이 본 동작을 막으면 안 된다.
 */
export async function renderMailTemplate(
  key: MailTemplateKey,
  vars: Record<string, string>,
): Promise<{ subject: string; body: string } | null> {
  const fallback = MAIL_TEMPLATE_DEFAULTS[key];
  let subject = fallback.subject;
  let body = fallback.body;
  try {
    const row = (await getTable("mail-templates")).find((t) => t.key === key);
    if (row) {
      if (!row.enabled) return null;
      subject = row.subject;
      body = row.body;
    }
  } catch (e) {
    console.error(`[Mail] template lookup failed for "${key}" — using default:`, e);
  }
  const merged = { ...builtinVars(), ...vars };
  return { subject: interpolate(subject, merged), body: interpolate(body, merged) };
}
