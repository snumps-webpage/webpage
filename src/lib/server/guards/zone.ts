/**
 * Zone-based route guarding (IMPLEMENTATION-SPEC BE-20).
 * Pure decision logic — the hook feeds it context, tests exercise it directly.
 * Route groups replace prefix matching: a route's group IS its access zone.
 */

export const ZONES = ["(public)", "(applicant)", "(member)", "(admin)", "api"] as const;
export type Zone = (typeof ZONES)[number];

export interface MemberContext {
  memberId: string;
  privateInfoId: string | null;
  name: string;
  status: "associate" | "regular" | "withdrawn";
  isAdmin: boolean;
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
 * Public pages that show an admin-only operational note (SourcePendingNotice):
 * the hook must resolve the member here so isAdmin reaches the layout data.
 */
const PUBLIC_WITH_ADMIN_NOTE = new Set([
  "/(public)/about/charter",
  "/(public)/about/charter/history/[period]",
  "/(public)/about/elections",
  "/(public)/about/finance",
  "/(public)/about/press",
  "/(public)/archive/problems",
  "/(public)/archive/discussions",
  "/(public)/archive/misc/integration-bee",
]);

/** Routes the hook must resolve the member for, even inside the public zone. */
export function needsMemberResolution(routeId: string): boolean {
  const zone = zoneOf(routeId);
  if (zone === "(applicant)" || zone === "(member)" || zone === "(admin)") return true;
  if (PUBLIC_WITH_ADMIN_NOTE.has(routeId)) return true;
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
      // Hybrid `/`: a withdrawn member must land on the pending page, not the dashboard.
      if (routeId === ROOT_PAGE_ID && ctx.member?.status === "withdrawn") {
        return { type: "redirect", location: WITHDRAW_PENDING };
      }
      return { type: "allow" };

    case "(applicant)": {
      if (!ctx.hasSession) return { type: "redirect", location: "/login" };
      if (ctx.member?.status === "withdrawn") {
        // Grace-period members must not re-apply while their record still exists.
        return { type: "redirect", location: WITHDRAW_PENDING };
      }
      if (ctx.member) return { type: "redirect", location: "/" };
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
      return { type: "allow" };
    }

    case "(admin)":
      // Existence is concealed from everyone below admin.
      if (!ctx.member?.isAdmin) return { type: "notFound" };
      return { type: "allow" };
  }
}
