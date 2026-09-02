/**
 * Zone-based route guarding (IMPLEMENTATION-SPEC BE-20).
 * Pure decision logic — the hook feeds it context, tests exercise it directly.
 * Route groups replace prefix matching: a route's group IS its access zone.
 */

export const ZONES = ["(public)", "(applicant)", "(member)", "(admin)", "api"] as const;
export type Zone = (typeof ZONES)[number];

import { CAPABILITIES, hasCapability, type Capability } from "$lib/server/core/capabilities";

export interface MemberContext {
  memberId: string;
  privateInfoId: string | null;
  name: string;
  status: "associate" | "regular" | "withdrawn";
  isAdmin: boolean;
  /** S9: 동문 지위 (정회원 취득 이력 — 영구) */
  isAlumni: boolean;
  /** S9: 이번 학기 등록 여부 (registrations 테이블) */
  registered: boolean;
  /** S9: 파생된 원자 권한 — 가드·서비스는 이것만 본다 */
  capabilities: Capability[];
}

export interface GuardContext {
  hasSession: boolean;
  /** null = resolved and not a member; undefined = not resolved (public fast path) */
  member: MemberContext | null | undefined;
  hasApplication: boolean;
  pathname: string;
}

export type GuardDecision =
  | { type: "allow" }
  | { type: "redirect"; location: string }
  | { type: "notFound" }
  | { type: "misconfigured" };

const WITHDRAW_PENDING = "/withdraw/pending";
const ROOT_PAGE_ID = "/(public)";

export function zoneOf(routeId: string): Zone | null {
  const first = routeId.split("/").filter(Boolean)[0];
  return (ZONES as readonly string[]).includes(first) ? (first as Zone) : null;
}

/**
 * S9: 회원 존 쓰기(POST)가 요구하는 capability — 라우트 단위 중앙 등록.
 * 등록 회원만 참여 행위 가능, 동문(열람 전용)은 본인 것 관리만.
 * 새 회원 존 라우트가 생기면 여기 한 줄이 늘어난다 (zone.test가 강제).
 */
const MEMBER_POST_CAPABILITY: Record<string, Capability> = {
  "/(member)/seminar/apply": CAPABILITIES.PARTICIPATE,
  "/(member)/seminar/edit/[id]": CAPABILITIES.PARTICIPATE,
  "/(member)/study": CAPABILITIES.PARTICIPATE,
  "/(member)/study/apply": CAPABILITIES.PARTICIPATE,
  "/(member)/study/[id]": CAPABILITIES.PARTICIPATE,
  "/(member)/study/[id]/manage": CAPABILITIES.PARTICIPATE,
  "/(member)/study/[id]/attendance": CAPABILITIES.PARTICIPATE,
  "/(member)/events/[id]/[type]": CAPABILITIES.PARTICIPATE,
  "/(member)/events/manage": CAPABILITIES.PARTICIPATE,
  "/(member)/settings/notifications": CAPABILITIES.MANAGE_SELF,
  "/(member)/settings/withdraw": CAPABILITIES.MANAGE_SELF,
  "/(member)/withdraw/pending": CAPABILITIES.MANAGE_SELF,
};

/** 회원 존 POST에 필요한 capability (null = 회원 존 밖이거나 미등록 라우트). */
export function memberPostCapability(routeId: string): Capability | null {
  return MEMBER_POST_CAPABILITY[routeId] ?? null;
}

/**
 * Routes the hook must resolve the member for, even inside the public zone.
 * (Logged-in users are additionally resolved on EVERY public page via the
 * session-cookie check in hooks.server.ts, so admin-only notes work there.)
 */
export function needsMemberResolution(routeId: string): boolean {
  const zone = zoneOf(routeId);
  if (zone === "(applicant)" || zone === "(member)" || zone === "(admin)") return true;
  return routeId === ROOT_PAGE_ID; // hybrid landing/dashboard
}

export function decide(routeId: string, ctx: GuardContext): GuardDecision {
  const zone = zoneOf(routeId);

  switch (zone) {
    case null:
      // A page outside every zone is a configuration mistake — fail closed.
      return { type: "misconfigured" };

    case "api":
      // Endpoint-level auth (Bearer / ensureAdmin) lives in each handler.
      return { type: "allow" };

    case "(public)":
      if (routeId === ROOT_PAGE_ID) {
        // Hybrid `/`: a withdrawn member must land on the pending page, not the dashboard.
        if (ctx.member?.status === "withdrawn") {
          return { type: "redirect", location: WITHDRAW_PENDING };
        }
        // AUTH-03: 로그인했지만 회원이 아니면 랜딩 대신 가입 흐름으로 —
        // 미가입 → /signup, 신청 대기 중 → /wait. (다른 공개 페이지 열람은 자유.)
        if (ctx.hasSession && !ctx.member) {
          return {
            type: "redirect",
            location: ctx.hasApplication ? "/wait" : "/signup",
          };
        }
      }
      return { type: "allow" };

    case "(applicant)": {
      if (!ctx.hasSession) return { type: "redirect", location: "/login" };
      if (ctx.member?.status === "withdrawn") {
        // Grace-period members must not re-apply while their record still exists.
        return { type: "redirect", location: WITHDRAW_PENDING };
      }
      // S9: 이번 학기 등록을 마친 회원만 신청 존에서 내보낸다 —
      // 미등록 회원(동문 포함)은 재가입 신청을 위해 들어와야 한다.
      if (ctx.member && ctx.member.registered) return { type: "redirect", location: "/" };
      return { type: "allow" };
    }

    case "(member)": {
      if (!ctx.hasSession) {
        return {
          type: "redirect",
          location: `/login?redirect=${encodeURIComponent(ctx.pathname)}`,
        };
      }
      if (!ctx.member) {
        return { type: "redirect", location: ctx.hasApplication ? "/wait" : "/signup" };
      }
      if (
        ctx.member.status === "withdrawn" &&
        !routeId.startsWith(`/(member)${WITHDRAW_PENDING}`)
      ) {
        return { type: "redirect", location: WITHDRAW_PENDING };
      }
      if (ctx.member.status === "withdrawn") return { type: "allow" };
      // S9 재등록 게이트: 회원 존 열람 capability가 없으면 재가입으로 보낸다.
      // (등록 회원·동문은 통과 — 동문의 쓰기 행위는 PARTICIPATE 검사가 막는다.)
      if (!hasCapability(ctx.member.capabilities, CAPABILITIES.VIEW_MEMBER_ZONE)) {
        return { type: "redirect", location: ctx.hasApplication ? "/wait" : "/signup" };
      }
      return { type: "allow" };
    }

    case "(admin)":
      // Existence is concealed from everyone below admin.
      if (!ctx.member?.isAdmin) return { type: "notFound" };
      return { type: "allow" };
  }
}
