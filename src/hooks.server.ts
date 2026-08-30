import { env } from "$env/dynamic/private";
import { building } from "$app/environment";
import { sequence } from "@sveltejs/kit/hooks";
import { error, redirect, type Handle } from "@sveltejs/kit";
import { handle as authHandle } from "./auth";
import {
  buildDevPreviewSession,
  resolveDevPreviewRole,
} from "$lib/server/dev-preview";
import {
  decide,
  memberPostCapability,
  needsMemberResolution,
  zoneOf,
} from "$lib/server/guards/zone";
import { hasApplication, resolveMember } from "$lib/server/guards/resolve-member";
import { capabilitiesFor } from "$lib/server/core/capabilities";

if (!building && !env.AUTH_SECRET) {
  console.error("FATAL: AUTH_SECRET is not set. Authentication will fail.");
}

const devPreviewHandle: Handle = async ({ event, resolve }) => {
  const devPreviewRole = resolveDevPreviewRole(event.url, event.cookies);

  if (devPreviewRole) {
    event.locals.auth = async () => buildDevPreviewSession(devPreviewRole);
    // Preview roles bypass data-layer resolution entirely.
    event.locals.member = {
      memberId: "dev-preview",
      privateInfoId: "dev-preview",
      name: "Dev Preview",
      status: "regular",
      isAdmin: devPreviewRole === "admin",
      isAlumni: false,
      registered: true,
      capabilities: capabilitiesFor({ isAlumni: false, registered: true }),
    };
  }

  return resolve(event);
};

/**
 * Zone guard (IMPLEMENTATION-SPEC BE-20): the route group IS the access zone.
 * Pure decisions live in guards/zone.ts; this handle only gathers context.
 */
const zoneGuard: Handle = async ({ event, resolve }) => {
  const routeId = event.route.id;

  // Unmatched URL — let SvelteKit render its 404, never a 500.
  if (routeId === null) return resolve(event);

  const zone = zoneOf(routeId);

  // Public fast path: no session work for ANONYMOUS visitors (prerender/ISR
  // safety). A session cookie means a logged-in user is browsing the public
  // zone — resolve them anyway, or the global nav treats them as a guest.
  const hasSessionCookie =
    event.cookies.get("__Secure-authjs.session-token") !== undefined ||
    event.cookies.get("authjs.session-token") !== undefined;
  if (
    zone === "api" ||
    (zone === "(public)" && !needsMemberResolution(routeId) && !hasSessionCookie)
  ) {
    return resolve(event);
  }

  const session = event.locals.member === undefined ? await event.locals.auth() : null;
  const email = session?.user?.email ?? null;

  if (event.locals.member === undefined) {
    event.locals.member = email ? await resolveMember(email) : null;
  }

  const member = event.locals.member;
  const hasSession = member !== null || !!email;
  // S9: 미등록 회원(재가입 대기)도 신청 여부가 판정에 필요하다 — 비회원과 동일 조건.
  const needsApplicationLookup =
    email !== null && zone !== "(public)" && (!member || !member.registered);
  const application = needsApplicationLookup ? await hasApplication(email) : false;

  const decision = decide(routeId, {
    hasSession,
    member,
    hasApplication: application,
    pathname: event.url.pathname,
  });

  // TODO(S9-diag): /signup 리디렉션 진단용 임시 로그 — 원인 확정 후 제거.
  if (zone === "(applicant)") {
    console.log(
      `[applicant-guard] path=${event.url.pathname} decision=${decision.type}` +
        `${"location" in decision ? `→${decision.location}` : ""}` +
        ` hasSession=${hasSession} member=${member ? "yes" : "no"}` +
        ` registered=${member?.registered ?? "n/a"} isAdmin=${member?.isAdmin ?? "n/a"}` +
        ` hasApp=${application}`,
    );
  }

  switch (decision.type) {
    case "allow": {
      // S9: 회원 존 쓰기 게이트 — 열람은 위 decide가, 쓰기는 capability가 막는다.
      if (event.request.method === "POST" && zone === "(member)" && member) {
        const needed = memberPostCapability(routeId);
        if (needed && !member.capabilities.includes(needed)) {
          throw error(403, "이번 학기 등록 회원만 할 수 있는 작업입니다.");
        }
      }
      return resolve(event);
    }
    case "redirect":
      throw redirect(303, decision.location);
    case "notFound":
      throw error(404, "Not Found");
    case "misconfigured":
      // A page outside every zone means the guard cannot protect it — fail closed.
      throw error(500, "route without zone");
  }
};

export const handle = sequence(authHandle, devPreviewHandle, zoneGuard);
