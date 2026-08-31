import { env } from "$env/dynamic/private";
import { getTable } from "$lib/server/data/tables";
import { currentTerm } from "$lib/server/core/semester";
import { getAdminAccessToken, dispatchEmail } from "./client";
import { renderMailTemplate } from "./template-store";

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

    const rendered = await renderMailTemplate("seminar-announcement", {
      title: seminar.title,
      description: seminar.description,
      siteUrl: siteOrigin(),
      optOutUrl: `${siteOrigin()}/settings/notifications`,
    });
    if (!rendered) return true; // 관리자가 이 공지를 꺼 둠 — 승인 흐름은 성공 취급

    const accessToken = await getAdminAccessToken();
    let ok = true;
    for (const batch of chunk(recipients, BATCH_SIZE)) {
      try {
        await dispatchEmail(accessToken, batch, rendered.subject, rendered.body, { bcc: true });
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

    const rendered = await renderMailTemplate("withdrawal-executive-notice", {
      memberName,
      adminUrl: `${siteOrigin()}/admin/members`,
    });
    if (!rendered) return true; // 꺼짐 — 통지 실패로 취급하지 않는다

    const accessToken = await getAdminAccessToken();
    await dispatchEmail(accessToken, recipients, rendered.subject, rendered.body);
    return true;
  } catch (e) {
    console.error("[Mail] executive withdrawal notice failed:", e);
    return false;
  }
}
