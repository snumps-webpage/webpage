import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** Auth.js lands here with ?error=… (pages.error, signIn callback). */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  InvalidDomain: "서울대학교(@snu.ac.kr) Google 계정으로만 로그인할 수 있습니다.",
  AccessDenied: "서울대학교(@snu.ac.kr) Google 계정으로만 로그인할 수 있습니다.",
};

/** AUTH-04: dedicated sign-in page; bounces authenticated users back. */
export const load: PageServerLoad = async ({ locals, url }) => {
  const session = await locals.auth();
  if (session?.user) {
    const target = url.searchParams.get("redirect") ?? "/";
    // Only same-site relative paths — never an absolute URL from the query.
    throw redirect(303, target.startsWith("/") && !target.startsWith("//") ? target : "/");
  }
  const errorCode = url.searchParams.get("error");
  return {
    redirectTo: url.searchParams.get("redirect") ?? "/",
    errorMessage: errorCode
      ? (AUTH_ERROR_MESSAGES[errorCode] ??
        "로그인 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.")
      : null,
  };
};
