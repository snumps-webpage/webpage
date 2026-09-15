import { createSignedAssetUrl } from "$lib/server/data/storage";
import { resolveAssetAccess } from "$lib/server/services/asset-access";
import { resolveAdminAccess } from "$lib/server/auth-guards";
import type { RequestHandler } from "./$types";

/**
 * 비공개 `assets` 버킷의 **유일한** 읽기 통로.
 *
 * 예전에는 버킷이 공개였고, 그래서 "URL을 아는 것"이 곧 권한이었다. 세미나를
 * 취소해도 이미 나간 절대 URL은 파일을 계속 내려 줬다(감사 C-22). 이제 링크는
 * 안정적인 앱 경로(`/media/<key>`)이고, 권한은 **요청마다** 다시 판정한다.
 *
 * 바이트는 이 함수를 통과하지 않는다 — 판정 후 수명이 짧은 서명 URL로
 * 302 리디렉트한다. Vercel 함수 대역폭을 쓰지 않으면서도, 링크가 오래 살지
 * 않는다.
 *
 * 거절은 전부 **404**다. 403은 "그 파일은 존재한다"를 알려 주는데, 취소된
 * 세미나의 자료에 대해서는 그 사실 자체가 새어 나가면 안 되는 것이다.
 */

/** 서명 URL의 수명. 짧게 두되, 큰 PDF를 내려받을 시간은 남긴다. */
const SIGNED_URL_TTL_SECONDS = 300;

/**
 * 이 경로의 답은 **요청자에 따라 다르다.** 그러므로 공유 캐시에 올라가면 안 된다.
 *
 * 헤더를 여기서 직접 붙이는 이유: `setHeaders`로 남기면 두 가지가 어긋난다.
 * 하나, 전역 `cacheShield`가 어차피 덮어써서 이 라우트의 의도는 실행되지 않는다
 * (있으나 마나 한 코드가 남고, 나중에 shield를 손대면 조용히 캐시 가능해진다).
 * 둘, `error()`로 던진 404는 shield를 **건너뛰고** 나가므로 캐시 헤더가 아예
 * 붙지 않는다(W-23) — 404는 휴리스틱 캐시 대상이라, 게스트가 받은 404가
 * 관리자에게 재생되면 관리자가 자기 자료를 못 받는다. 이 저장소는 경로 단위
 * 엣지 재생을 실측한 적이 있다(hooks.server.ts).
 */
const NO_STORE = {
  "cache-control": "private, no-store",
  "vercel-cdn-cache-control": "no-store",
  "cdn-cache-control": "no-store",
};

const notFound = () =>
  new Response("Not Found", { status: 404, headers: NO_STORE });

export const GET: RequestHandler = async ({ params, locals }) => {
  const key = params.key ?? "";
  const access = await resolveAssetAccess(key);
  if (access === "none") return notFound();

  // 관리자 판정은 세션이 아니라 회원 레코드에서 나온다(D4). 미인증과 비관리자를
  // 여기서는 굳이 가르지 않는다 — 둘 다 "그런 파일 없음"으로 답한다.
  if (access === "admin" && (await resolveAdminAccess(locals)) !== "ok") {
    return notFound();
  }

  const url = await createSignedAssetUrl(key, SIGNED_URL_TTL_SECONDS);
  // 기록에는 남아 있는데 바이트가 없는 경우 — 관리자가 지웠거나 이주 누락이다.
  // 깨진 이미지를 그리게 두지 않고 없다고 답한다.
  if (!url) return notFound();

  return new Response(null, {
    status: 302,
    headers: { ...NO_STORE, location: url },
  });
};
