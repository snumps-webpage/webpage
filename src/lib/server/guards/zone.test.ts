import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CAPABILITIES, capabilitiesFor } from "$lib/server/core/capabilities";
import {
  decide,
  memberPostCapability,
  zoneOf,
  type GuardContext,
  type MemberContext,
  type Zone,
} from "./zone";

/**
 * BE-24: the guard matrix. Every route in src/routes must be registered here
 * with its zone — an unregistered route fails the suite, so nothing ships
 * outside the guard's knowledge. Role expectations are then asserted per zone.
 */

// ---- route discovery -------------------------------------------------------

const ROUTES_DIR = join(__dirname, "../../../routes");

function discoverRouteIds(dir = ROUTES_DIR, prefix = ""): string[] {
  const ids: string[] = [];
  const entries = readdirSync(dir);
  const hasPage = entries.some(
    (e) => e === "+page.svelte" || e === "+server.ts" || e === "+server.js",
  );
  if (hasPage) ids.push(prefix === "" ? "/" : prefix);
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      ids.push(...discoverRouteIds(full, `${prefix}/${entry}`));
    }
  }
  return ids;
}

// ---- the registry ----------------------------------------------------------

const REGISTERED: Record<string, Zone> = {
  "/(public)": "(public)",
  "/(public)/login": "(public)",
  "/(public)/about": "(public)",
  "/(public)/about/charter": "(public)",
  "/(public)/about/charter/history/[period]": "(public)",
  "/(public)/about/executives": "(public)",
  "/(public)/about/elections": "(public)",
  "/(public)/about/press": "(public)",
  "/(public)/about/finance": "(public)",
  "/(public)/archive": "(public)",
  "/(public)/archive/seminars": "(public)",
  "/(public)/archive/seminars/[id]": "(public)",
  "/(public)/archive/studies": "(public)",
  "/(public)/archive/activities": "(public)",
  "/(public)/archive/gallery": "(public)",
  "/(public)/archive/projects": "(public)",
  "/(public)/archive/misc": "(public)",
  "/(public)/archive/misc/integration-bee": "(public)",
  "/(public)/archive/problems": "(public)",
  "/(public)/archive/discussions": "(public)",
  "/(public)/members": "(public)",
  "/(public)/robots.txt": "(public)",
  "/(public)/sitemap.xml": "(public)",
  "/(applicant)/signup": "(applicant)",
  "/(applicant)/signup/edit": "(applicant)",
  "/(applicant)/wait": "(applicant)",
  "/(member)/seminar/apply": "(member)",
  "/(member)/seminar/edit/[id]": "(member)",
  "/(member)/events/[id]/[type]": "(member)",
  "/(member)/events/manage": "(member)",
  "/(member)/study": "(member)",
  "/(member)/study/apply": "(member)",
  "/(member)/study/[id]": "(member)",
  "/(member)/study/[id]/manage": "(member)",
  "/(member)/study/[id]/attendance": "(member)",
  "/(member)/settings/notifications": "(member)",
  "/(member)/settings/withdraw": "(member)",
  "/(member)/withdraw/pending": "(member)",
  "/(member)/experiment/index": "(member)",
  "/(member)/experiment/1": "(member)",
  "/(member)/experiment/2": "(member)",
  "/(member)/experiment/3": "(member)",
  "/(member)/experiment/4": "(member)",
  "/(admin)/admin": "(admin)",
  "/(admin)/admin/events/new": "(admin)",
  "/(admin)/admin/events/connect": "(admin)",
  "/(admin)/admin/members": "(admin)",
  "/(admin)/admin/members/[id]": "(admin)",
  "/(admin)/admin/activities": "(admin)",
  "/(admin)/admin/seminars": "(admin)",
  "/(admin)/admin/studies": "(admin)",
  "/(admin)/admin/gallery": "(admin)",
  "/(admin)/admin/mail": "(admin)",
  "/(admin)/admin/executives": "(admin)",
  "/api/admin/applications": "api",
  "/api/admin/seminar-requests": "api",
  "/api/admin/study-requests": "api",
  "/api/cron/maintenance": "api",
  "/api/cron/sync-events": "api",
  "/api/health": "api",
  "/api/uploads/presign": "api",
  "/api/posters/seminar/png": "api",
};

describe("route registry", () => {
  it("covers every route on disk — add new routes to REGISTERED with a zone", () => {
    const discovered = discoverRouteIds();
    const unregistered = discovered.filter((id) => !(id in REGISTERED));
    expect(unregistered).toEqual([]);
  });

  it("agrees with zoneOf for every registered route", () => {
    for (const [routeId, zone] of Object.entries(REGISTERED)) {
      expect(zoneOf(routeId), routeId).toBe(zone);
    }
  });

  it("treats an ungrouped page as misconfigured (fail closed)", () => {
    expect(zoneOf("/rogue-page")).toBeNull();
    expect(decide("/rogue-page", ROLES.guest).type).toBe("misconfigured");
  });
});

// ---- role fixtures ---------------------------------------------------------

const memberCtx = (over: Partial<MemberContext> = {}): MemberContext => ({
  memberId: "m1",
  privateInfoId: "p1",
  name: "회원",
  status: "regular",
  isAdmin: false,
  isAlumni: false,
  registered: true,
  capabilities: capabilitiesFor({ isAlumni: false, registered: true }),
  ...over,
});

const ROLES: Record<string, GuardContext> = {
  guest: { hasSession: false, member: null, hasApplication: false, pathname: "/x" },
  newcomer: { hasSession: true, member: null, hasApplication: false, pathname: "/x" },
  applicant: { hasSession: true, member: null, hasApplication: true, pathname: "/x" },
  member: { hasSession: true, member: memberCtx(), hasApplication: false, pathname: "/x" },
  withdrawn: {
    hasSession: true,
    member: memberCtx({ status: "withdrawn" }),
    hasApplication: false,
    pathname: "/x",
  },
  admin: {
    hasSession: true,
    member: memberCtx({ isAdmin: true }),
    hasApplication: false,
    pathname: "/x",
  },
  // S9: 준회원 이력만 있고 이번 학기 미등록 — capability 없음, 재가입 대상
  unregistered: {
    hasSession: true,
    member: memberCtx({ registered: false, isAlumni: false, capabilities: [] }),
    hasApplication: false,
    pathname: "/x",
  },
  // S9: 동문(정회원 이력) + 이번 학기 미등록 — 회원 존 열람은 유지
  alumni: {
    hasSession: true,
    member: memberCtx({
      registered: false,
      isAlumni: true,
      capabilities: capabilitiesFor({ isAlumni: true, registered: false }),
    }),
    hasApplication: false,
    pathname: "/x",
  },
};

// ---- the matrix ------------------------------------------------------------

type Expect = "allow" | `redirect:${string}` | "404";

const MATRIX: Array<[routeId: string, expectations: Record<string, Expect>]> = [
  [
    "/(public)/login",
    {
      guest: "allow",
      newcomer: "allow",
      applicant: "allow",
      member: "allow",
      withdrawn: "allow",
      admin: "allow",
    },
  ],
  [
    "/(public)", // hybrid landing/dashboard
    {
      guest: "allow",
      member: "allow",
      admin: "allow",
      withdrawn: "redirect:/withdraw/pending",
    },
  ],
  [
    "/(applicant)/signup",
    {
      guest: "redirect:/login",
      newcomer: "allow",
      applicant: "allow",
      member: "redirect:/",
      withdrawn: "redirect:/withdraw/pending",
      admin: "redirect:/",
      unregistered: "allow", // S9: 미등록 회원은 재가입 신청을 위해 들어온다
      alumni: "allow", // S9: 동문도 미등록이면 재등록 신청 가능
    },
  ],
  [
    "/(member)/seminar/apply",
    {
      guest: "redirect:/login?redirect=%2Fx",
      newcomer: "redirect:/signup",
      applicant: "redirect:/wait",
      member: "allow",
      withdrawn: "redirect:/withdraw/pending",
      admin: "allow",
      unregistered: "redirect:/signup", // S9: VIEW_MEMBER_ZONE 없음 → 재가입으로
      alumni: "allow", // S9: 동문은 열람 허용 (쓰기는 PARTICIPATE 검사가 막는다)
    },
  ],
  [
    "/(member)/events/[id]/[type]",
    {
      guest: "redirect:/login?redirect=%2Fx",
      applicant: "redirect:/wait",
      member: "allow",
      withdrawn: "redirect:/withdraw/pending",
    },
  ],
  [
    "/(admin)/admin",
    {
      guest: "404",
      newcomer: "404",
      applicant: "404",
      member: "404",
      withdrawn: "404",
      admin: "allow",
    },
  ],
  [
    "/(admin)/admin/members",
    { guest: "404", member: "404", admin: "allow" },
  ],
  [
    "/api/cron/sync-events", // endpoint-level auth — the zone allows through
    { guest: "allow", member: "allow", admin: "allow" },
  ],
];

describe("guard matrix", () => {
  for (const [routeId, expectations] of MATRIX) {
    for (const [role, expected] of Object.entries(expectations)) {
      it(`${routeId} × ${role} → ${expected}`, () => {
        const decision = decide(routeId, ROLES[role]);
        if (expected === "allow") {
          expect(decision).toEqual({ type: "allow" });
        } else if (expected === "404") {
          expect(decision).toEqual({ type: "notFound" });
        } else {
          expect(decision).toEqual({
            type: "redirect",
            location: expected.slice("redirect:".length),
          });
        }
      });
    }
  }

  it("lets a withdrawn member reach the pending page itself", () => {
    expect(decide("/(member)/withdraw/pending", ROLES.withdrawn)).toEqual({
      type: "allow",
    });
  });
});

describe("memberPostCapability (S9)", () => {
  it("maps participation routes to PARTICIPATE", () => {
    expect(memberPostCapability("/(member)/study/apply")).toBe(CAPABILITIES.PARTICIPATE);
  });

  it("maps self-management routes to MANAGE_SELF", () => {
    expect(memberPostCapability("/(member)/settings/withdraw")).toBe(CAPABILITIES.MANAGE_SELF);
  });

  it("returns null outside the member zone", () => {
    expect(memberPostCapability("/(public)/about")).toBeNull();
  });
});
