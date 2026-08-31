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

  // 프리렌더 크롤 중에는 가드를 끈다: 빌드엔 세션이 없으므로 여기서 던진
  // 게스트용 303이 정적 라우트로 구워져, 배포 후 로그인 사용자까지 무조건
  // 튕겨낸다 (실사고: /signup → /login 정적 리디렉션). 세션 의존 존은
  // prerender=false라 크롤러가 렌더 자체를 건너뛴다 — 가드 부재가 아니다.
  if (building) return resolve(event);

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

  switch (decision.type) {
    case "allow": {
      // S9: 회원 존 쓰기 게이트 — 열람은 위 decide가, 쓰기는 capability가 막는다.
      if (event.request.method === "POST" && zone === "(member)" && member) {
        const needed = memberPostCapability(routeId);
        if (needed && !member.capabilities.includes(needed)) {
          throw error(403, "이번 학기 등록 회원만 할 수 있는 작업입니다.");
        }
      }
      const response = await resolve(event);
      // 세션 의존 응답은 절대 공유 캐시에 저장되면 안 된다. 기본 cache-control
      // (public, max-age=0)에 Vary: Cookie가 없어 Vercel 엣지가 개인화된 HTML을
      // 캐시해 다른 사용자에게 재생한 실사고가 있었다(/signup/edit에 타인 신청서
      // 노출). 익명 공개 페이지(위 fast path)만 캐시 가능하게 남긴다.
      response.headers.set("cache-control", "private, no-store");
      return response;
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
