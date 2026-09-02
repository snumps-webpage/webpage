import { env } from "$env/dynamic/private";
import { emitMailEvent } from "./dispatch";

/**
 * S10 어댑터: 전 회원 공지·회장단 통지도 이벤트 emit으로 위임한다.
 * 수신자 결정(옵트인 필터·Bcc 배치·회장단 해석)은 dispatch.ts의 해석기가
 * 담당한다. 반환 계약(boolean)은 그대로 — 승인 흐름은 메일에 의존하지 않는다.
 */

function siteOrigin(): string {
  return env.PUBLIC_SITE_ORIGIN || "https://snumps.vercel.app";
}

/** 테스트·유틸 호환용 (dispatch의 배치 크기와 동일 규칙). */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * SEM-04: announce an approved seminar to every opted-in member.
 * Bcc-only, batched; returns false on ANY batch failure (logged, never thrown).
 */
export async function sendSeminarAnnouncement(seminar: {
  title: string;
  description: string;
}): Promise<boolean> {
  return emitMailEvent("seminar.published", {
    title: seminar.title,
    description: seminar.description,
    siteUrl: siteOrigin(),
    optOutUrl: `${siteOrigin()}/settings/notifications`,
  });
}

/**
 * MEM-07: notify the current-term president/vice-president of a withdrawal
 * request. Falls back to the admin list when no executive email resolves.
 */
export async function notifyExecutivesOfWithdrawal(memberName: string): Promise<boolean> {
  return emitMailEvent("withdrawal.requested", {
    memberName,
    adminUrl: `${siteOrigin()}/admin/members`,
  });
}
