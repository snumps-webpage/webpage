import { env } from "$env/dynamic/private";
import { emitMailEvent } from "./dispatch";

/**
 * S10 어댑터: 전 회원 공지·회장단 통지도 이벤트 emit으로 위임한다.
 * 수신자 결정(옵트인 필터·Bcc 배치·회장단 해석)은 dispatch.ts의 해석기가
 * 담당한다. 반환 계약(boolean)은 그대로 — 승인 흐름은 메일에 의존하지 않는다.
 */

// Not PUBLIC_-prefixed: SvelteKit strips those keys from the private env, so
// the old PUBLIC_SITE_ORIGIN read here was always undefined (env-prefix.test.ts).
function siteOrigin(): string {
  return env.SITE_ORIGIN || "https://snumps.vercel.app";
}

/** 테스트·유틸 호환용 (dispatch의 배치 크기와 동일 규칙). */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface AnnouncedSchedule {
  startsAt: string;
  endsAt: string | null;
  location: string;
}

/**
 * 메일 본문의 일시 표기. 회원이 캘린더를 열지 않고도 읽을 수 있어야 하므로
 * ISO가 아니라 한국어 표기로, 언제나 KST로 찍는다 — 서버 시간대와 무관하게.
 */
export function formatAnnouncedSchedule(schedule: AnnouncedSchedule): string {
  const date = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(schedule.startsAt));
  if (!schedule.endsAt) return date;

  const end = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(schedule.endsAt));
  return `${date} – ${end}`;
}

/** 일정이 없는(이주로 잃은) 행도 공지는 나가야 한다 — 자리만 비운다. */
function scheduleVars(schedule: AnnouncedSchedule | null) {
  return schedule
    ? { schedule: formatAnnouncedSchedule(schedule), location: schedule.location }
    : { schedule: "추후 공지", location: "추후 공지" };
}

/**
 * SEM-04: announce an approved seminar to every opted-in member.
 * Bcc-only, batched; returns false on ANY batch failure (logged, never thrown).
 */
export async function sendSeminarAnnouncement(seminar: {
  title: string;
  description: string;
  schedule?: AnnouncedSchedule | null;
}): Promise<boolean> {
  return emitMailEvent("seminar.published", {
    title: seminar.title,
    description: seminar.description,
    ...scheduleVars(seminar.schedule ?? null),
    siteUrl: siteOrigin(),
    optOutUrl: `${siteOrigin()}/settings/notifications`,
  });
}

/** 공개된 세미나의 일정이 바뀌면 같은 수신자에게 변경을 알린다. */
export async function sendSeminarScheduleChange(seminar: {
  title: string;
  schedule: AnnouncedSchedule;
}): Promise<boolean> {
  return emitMailEvent("seminar.schedule-changed", {
    title: seminar.title,
    ...scheduleVars(seminar.schedule),
    siteUrl: siteOrigin(),
    optOutUrl: `${siteOrigin()}/settings/notifications`,
  });
}

/**
 * 취소 공지 — **사실만** 싣는다. 사유를 담을 변수를 만들지 않는 것이 결정이다:
 * 자리를 만들면 그 자리가 채워지고, 발표자의 사정이 전 회원에게 나간다.
 */
export async function sendSeminarCancellation(seminar: {
  title: string;
}): Promise<boolean> {
  return emitMailEvent("seminar.cancelled", {
    title: seminar.title,
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
