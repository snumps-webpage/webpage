import { env } from "$env/dynamic/private";
import { building } from "$app/environment";
import { sequence } from "@sveltejs/kit/hooks";
import { error, type Handle } from "@sveltejs/kit";
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

/**
 * 캐시 실드 (2026-09-01 실사고 — 최외곽 핸들).
 * prod 엣지가 쿠키·쿼리·cache-control과 무관하게 경로 단위로 SSR 응답을
 * 재생하는 것이 실측됐다(무작위 쿼리에도 HIT, no-store 응답도 HIT) — 그 결과
 * A에게 렌더된 개인화 페이지가 B에게 서빙되는 교차 유출이 발생했다.
 * 모든 SSR 응답에 브라우저·CDN 캐시를 전면 금지한다. Vercel CDN은
 * Vercel-CDN-Cache-Control을 최우선으로 존중한다. 정적 자산(/_app 등)은
 * 훅을 거치지 않으므로 영향 없다. 공개 페이지 캐시 재도입은 유출 원인의
 * 플랫폼 측 규명 이후에만 검토한다.
 */
const cacheShield: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("vercel-cdn-cache-control", "no-store");
  response.headers.set("cdn-cache-control", "no-store");
  return response;
};

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
  // 루트(하이브리드 랜딩)는 공개 존이지만 AUTH-03 리디렉션 분기에 신청 여부가 필요하다.
  const needsApplicationLookup =
    email !== null &&
    (zone !== "(public)" || needsMemberResolution(routeId)) &&
    (!member || !member.registered);
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
      return resolve(event); // 캐시 금지는 최외곽 cacheShield가 전 응답에 부착
    }
    case "redirect":
      // throw 하면 실드 핸들을 우회한다 — 캐시 금지 헤더를 직접 부착해 반환.
      return new Response(null, {
        status: 303,
        headers: {
          location: decision.location,
          "cache-control": "private, no-store",
          "vercel-cdn-cache-control": "no-store",
          "cdn-cache-control": "no-store",
        },
      });
    case "notFound":
      throw error(404, "Not Found");
    case "misconfigured":
      // A page outside every zone means the guard cannot protect it — fail closed.
      throw error(500, "route without zone");
  }
};

export const handle = sequence(cacheShield, authHandle, devPreviewHandle, zoneGuard);
