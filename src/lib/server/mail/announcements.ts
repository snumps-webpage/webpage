import { env } from "$env/dynamic/private";
import { getTable } from "$lib/server/data/tables";
import { currentTerm } from "$lib/server/core/semester";
import { getAdminAccessToken, dispatchEmail } from "./client";

/**
 * Data-layer-aware mail (BE-45): all-member announcements and the executive
 * notice for withdrawals. Separate from templates.ts, which stays free of
 * table imports.
 * ⚠️ Sender account must be Google Workspace — consumer Gmail's 500
 * recipients/day cap is nearly exhausted by two full-member announcements.
 */

const BATCH_SIZE = 80; // comfortably under Gmail's per-message recipient cap

function siteOrigin(): string {
  return env.PUBLIC_SITE_ORIGIN || "https://snumps.vercel.app";
}

/** Opted-in member emails, deduped (§5-7 step 1). */
async function announcementRecipients(): Promise<string[]> {
  const infos = await getTable("private-info");
  return [
    ...new Set(
      infos
        .filter((i) => i.email && i.mailPrefs.announcements !== false)
        .map((i) => i.email.toLowerCase()),
    ),
  ];
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * SEM-04: announce an approved seminar to every opted-in member.
 * Bcc-only, batched; returns false on ANY batch failure (logged, never thrown —
 * the approval transaction must not depend on mail).
 */
export async function sendSeminarAnnouncement(seminar: {
  title: string;
  description: string;
}): Promise<boolean> {
  try {
    const recipients = await announcementRecipients();
    if (recipients.length === 0) return true;

    const accessToken = await getAdminAccessToken();
    const subject = `[SNUMPS] 새 세미나 안내: ${seminar.title}`;
    const body = `안녕하세요, 서울대학교 수학문제연구회입니다.

새 세미나가 개설되었습니다.

제목: ${seminar.title}

${seminar.description}

참가 신청은 홈페이지 대시보드에서 할 수 있습니다: ${siteOrigin()}/

---
이 공지 메일을 더 이상 받고 싶지 않으시면 아래에서 수신을 해제할 수 있습니다.
${siteOrigin()}/settings/notifications`;

    let ok = true;
    for (const batch of chunk(recipients, BATCH_SIZE)) {
      try {
        await dispatchEmail(accessToken, batch, subject, body, { bcc: true });
      } catch (e) {
        console.error("[Mail] announcement batch failed:", e);
        ok = false; // no retry — an approval re-run must not double-send
      }
    }
    return ok;
  } catch (e) {
    console.error("[Mail] announcement failed:", e);
    return false;
  }
}

/**
 * MEM-07: notify the current-term president/vice-president of a withdrawal
 * request. Falls back to the admin list when no executive email resolves.
 */
export async function notifyExecutivesOfWithdrawal(memberName: string): Promise<boolean> {
  try {
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
    let recipients = infos
      .filter((i) => executiveIds.includes(i.memberId) && i.email)
      .map((i) => i.email);
    if (recipients.length === 0) {
      recipients = (env.ADMINS_EMAILS || "").split(",").map((e) => e.trim()).filter(Boolean);
    }
    if (recipients.length === 0) return false;

    const accessToken = await getAdminAccessToken();
    await dispatchEmail(
      accessToken,
      recipients,
      `[SNUMPS] 회원 탈퇴 신청: ${memberName}`,
      `안녕하세요, 회장단님.

${memberName} 회원이 탈퇴를 신청했습니다.

신청일로부터 1개월 후 회원의 인적사항이 삭제 대상이 됩니다(현재 자동 삭제는 보류 상태).
정보 보존이 필요하면 관리자 페이지의 회원 상세에서 보존을 집행해 주세요.

${siteOrigin()}/admin/members`,
    );
    return true;
  } catch (e) {
    console.error("[Mail] executive withdrawal notice failed:", e);
    return false;
  }
}
