import { redirect } from "@sveltejs/kit";
import { safeInternalRedirect } from "$lib/domain/navigation";
import { signedIn } from "$lib/server/auth-guards";
import type { PageServerLoad } from "./$types";

/** Auth.js lands here with ?error=… (pages.error, signIn callback). */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  InvalidDomain:
    "서울대학교(@snu.ac.kr) Google 계정으로만 로그인할 수 있습니다.",
  AccessDenied:
    "서울대학교(@snu.ac.kr) Google 계정으로만 로그인할 수 있습니다.",
};

/** AUTH-04: dedicated sign-in page; bounces authenticated users back. */
export const load: PageServerLoad = async ({ locals, url }) => {
  // Only same-site relative paths — a browser reads `/\host` as `//host`.
  const target = safeInternalRedirect(url.searchParams.get("redirect"));
  // The same "signed in" as the zone guard, or the two bounce a user (LB02-1).
  if (signedIn(await locals.auth())) throw redirect(303, target);
  const errorCode = url.searchParams.get("error");
  return {
    redirectTo: target,
    errorMessage: errorCode
      ? (AUTH_ERROR_MESSAGES[errorCode] ??
        "로그인 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.")
      : null,
  };
};
