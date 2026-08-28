import { redirect } from "@sveltejs/kit";
import { safeInternalRedirect } from "$lib/domain/navigation";
import type { PageServerLoad } from "./$types";

const ERROR_MESSAGES: Record<string, string> = {
  InvalidDomain: "서울대학교 Google 계정(@snu.ac.kr)으로 로그인해 주세요.",
  OAuthSignin:
    "Google 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  OAuthCallbackError: "Google 로그인 응답을 확인하지 못했습니다.",
  OAuthAccountNotLinked: "같은 이메일이 다른 로그인 방식에 연결되어 있습니다.",
  AccessDenied: "이 계정에는 로그인 권한이 없습니다.",
  Configuration: "로그인 설정을 확인하는 중 문제가 발생했습니다.",
};

export const load: PageServerLoad = async ({ parent, url }) => {
  const redirectTo = safeInternalRedirect(url.searchParams.get("redirectTo"));
  const { session } = await parent();
  if (session?.user) throw redirect(303, redirectTo);

  const errorCode = url.searchParams.get("error");
  return {
    redirectTo,
    errorMessage: errorCode
      ? (ERROR_MESSAGES[errorCode] ?? "로그인 중 문제가 발생했습니다.")
      : null,
  };
};
