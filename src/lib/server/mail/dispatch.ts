import { env } from "$env/dynamic/private";
import { currentTerm } from "$lib/server/core/semester";
import { getTable } from "$lib/server/data/tables";
import { getAdminAccessToken, dispatchEmail } from "./client";
import { MAIL_EVENTS, type MailEventKey, type RecipientKind } from "./events";
import { renderMailTemplate } from "./template-store";

/**
 * 자동 메일 디스패처 (S10).
 *
 * 발생 지점은 emitMailEvent("이벤트", 변수, 컨텍스트) 한 줄만 호출한다.
 * 규칙(mail-rules — 없으면 이벤트의 기본 규칙)마다 템플릿을 렌더하고 수신자를
 * 해석해 발송한다. 메일은 본 동작을 절대 막지 않는다: 모든 실패는 로그 +
 * false 반환으로 끝난다 (§5-7).
 */

const BATCH_SIZE = 80; // Gmail 건당 수신자 한도 아래

export interface MailEventContext {
  /** recipient=party 규칙이 쓸 당사자 주소 (신청 행 등에서 발생 지점이 공급) */
  partyEmail?: string;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function adminEmails(): string[] {
  return (env.ADMINS_EMAILS || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

/** 현 학기 회장·부회장 이메일 — 없으면 관리자 명단으로 폴백 (MEM-07). */
async function executiveEmails(): Promise<string[]> {
  const term = currentTerm();
  const [members, infos] = await Promise.all([
    getTable("members"),
    getTable("private-info"),
  ]);
  const executiveIds = members
    .filter((m) =>
      m.roles.some((r) => r.term === term && ["회장", "부회장"].includes(r.title)),
    )
    .map((m) => m.id);
  const found = infos
    .filter((i) => executiveIds.includes(i.memberId) && i.email)
    .map((i) => i.email);
  return found.length > 0 ? found : adminEmails();
}

/** 수신 동의 회원 전체, 중복 제거 (§5-7 step 1). */
async function optedInMemberEmails(): Promise<string[]> {
  const infos = await getTable("private-info");
  return [
    ...new Set(
      infos
        .filter((i) => i.email && i.mailPrefs.announcements !== false)
        .map((i) => i.email.toLowerCase()),
    ),
  ];
}

async function resolveRecipients(
  kind: RecipientKind,
  context: MailEventContext,
): Promise<{ emails: string[]; bcc: boolean }> {
  switch (kind) {
    case "party":
      return { emails: context.partyEmail ? [context.partyEmail] : [], bcc: false };
    case "admins":
      return { emails: adminEmails(), bcc: false };
    case "executives":
      return { emails: await executiveEmails(), bcc: false };
    case "members-opted-in":
      return { emails: await optedInMemberEmails(), bcc: true };
  }
}

/** 이벤트의 유효 규칙: 테이블에 행이 있으면 그것이 전체 진실, 없으면 기본 규칙. */
export async function effectiveRules(
  event: MailEventKey,
): Promise<{ templateKey: string; recipient: RecipientKind; enabled: boolean }[]> {
  const def = MAIL_EVENTS[event];
  try {
    const rows = (await getTable("mail-rules")).filter((r) => r.event === event);
    if (rows.length > 0) {
      return rows.map((r) => ({
        templateKey: r.templateKey,
        recipient: r.recipient as RecipientKind,
        enabled: r.enabled,
      }));
    }
  } catch (e) {
    console.error(`[Mail] rule lookup failed for "${event}" — using defaults:`, e);
  }
  return def.defaultRules.map((r) => ({ ...r, enabled: true }));
}

/**
 * 이벤트 발생 통지 → 규칙별 발송. 반환값: 모든 발송이 성공(또는 스킵)이면 true.
 */
export async function emitMailEvent(
  event: MailEventKey,
  vars: Record<string, string>,
  context: MailEventContext = {},
): Promise<boolean> {
  let ok = true;
  try {
    const rules = await effectiveRules(event);
    for (const rule of rules) {
      if (!rule.enabled) continue;
      try {
        const rendered = await renderMailTemplate(rule.templateKey, vars);
        if (!rendered) continue; // 템플릿이 꺼져 있거나 삭제됨 — 이 규칙만 스킵
        const { emails, bcc } = await resolveRecipients(rule.recipient, context);
        if (emails.length === 0) continue;
        const accessToken = await getAdminAccessToken();
        for (const batch of chunk(emails, BATCH_SIZE)) {
          try {
            await dispatchEmail(accessToken, batch, rendered.subject, rendered.body, { bcc });
          } catch (e) {
            console.error(`[Mail] ${event}/${rule.templateKey} batch failed:`, e);
            ok = false; // 재시도 없음 — 승인 재실행이 이중 발송하면 안 된다
          }
        }
      } catch (e) {
        console.error(`[Mail] ${event}/${rule.templateKey} failed:`, e);
        ok = false;
      }
    }
  } catch (e) {
    console.error(`[Mail] emit "${event}" failed:`, e);
    ok = false;
  }
  return ok;
}
