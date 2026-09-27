import { env } from "$env/dynamic/private";
import { building } from "$app/environment";
import { sequence } from "@sveltejs/kit/hooks";
import {
  json,
  type Handle,
  type HandleServerError,
  type RequestEvent,
} from "@sveltejs/kit";
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
import {
  hasApplication,
  resolveMember,
} from "$lib/server/guards/resolve-member";
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
const NO_STORE = {
  "cache-control": "private, no-store",
  "vercel-cdn-cache-control": "no-store",
  "cdn-cache-control": "no-store",
} as const;

const cacheShield: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  for (const [k, v] of Object.entries(NO_STORE)) response.headers.set(k, v);
  return response;
};

/**
 * A guard refusal, returned rather than thrown (W-23): a throw leaves through
 * Kit's fatal-error path and skips cacheShield, so 404/403/500 went out
 * without no-store. Shaped like that path — JSON for data/JSON requests, the
 * plain error page otherwise (a throw from `handle` never rendered
 * +error.svelte either).
 */
function guardRefusal(event: RequestEvent, status: number, message: string) {
  const accept = event.request.headers.get("accept") ?? "";
  if (event.isDataRequest || accept.includes("application/json")) {
    return json({ message }, { status, headers: NO_STORE });
  }
  const safe = message.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return new Response(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${status}</title></head>` +
      `<body><h1>${status}</h1><p>${safe}</p><p><a href="/">처음으로</a></p></body></html>`,
    {
      status,
      headers: { ...NO_STORE, "content-type": "text/html; charset=utf-8" },
    },
  );
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
export const zoneGuard: Handle = async ({ event, resolve }) => {
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
    (zone === "(public)" &&
      !needsMemberResolution(routeId) &&
      !hasSessionCookie)
  ) {
    return resolve(event);
  }

  const session =
    event.locals.member === undefined ? await event.locals.auth() : null;
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
  const application = needsApplicationLookup
    ? await hasApplication(email)
    : false;

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
          return guardRefusal(
            event,
            403,
            "이번 학기 등록 회원만 할 수 있는 작업입니다.",
          );
        }
      }
      return resolve(event); // 캐시 금지는 최외곽 cacheShield가 전 응답에 부착
    }
    case "redirect":
      // throw 하면 실드 핸들을 우회한다 — 캐시 금지 헤더를 직접 부착해 반환.
      return new Response(null, {
        status: 303,
        headers: { location: decision.location, ...NO_STORE },
      });
    case "notFound":
      return guardRefusal(event, 404, "Not Found");
    case "misconfigured":
      // A page outside every zone means the guard cannot protect it — fail
      // closed. The route id goes to the log, not to the browser (W-35).
      console.error(`[guard] route without zone: ${routeId}`);
      return guardRefusal(event, 500, "Internal Error");
  }
};

export const handle = sequence(
  cacheShield,
  authHandle,
  devPreviewHandle,
  zoneGuard,
);

/**
 * Shapes what an UNCAUGHT error becomes (W-22 / HS-4). Kit derives the status
 * before calling this — it cannot change 500 into anything else — so this is
 * about the body, which matters twice over:
 *
 *   1. `/api/**` answered `{"message":"Internal Error"}`, which the client's
 *      restErrorEnvelopeSchema rejects, so the admin dashboard could only say
 *      "refresh failed" no matter what broke.
 *   2. The raw exception text (Postgres DSNs, fetch URLs) must not travel to a
 *      browser. It is logged here instead.
 *
 * A data-layer outage is thrown as AppError("SERVICE_UNAVAILABLE") by
 * tables.ts; loads wrapped in httpGuard turn it into 503. One that escapes
 * uncaught (from this hook or an /api handler) still leaves as 500 — Kit
 * fixes the status before calling here. Retry-After is still missing (W-30).
 */
export const handleError: HandleServerError = ({
  error: e,
  event,
  status,
  message,
}) => {
  console.error(`[${status}] ${event.request.method} ${event.url.pathname}`, e);
  return { message, error: "SERVICE_UNAVAILABLE" };
};
