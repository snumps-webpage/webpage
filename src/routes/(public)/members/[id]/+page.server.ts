import { error, redirect } from "@sveltejs/kit";
import { httpGuard } from "$lib/server/core/http";
import { getPublicMember } from "$lib/server/public/member-activity";
import type { PageServerLoad } from "./$types";

/**
 * 회원별 공개 페이지 (snumps-webpage/D-000051). 운영 id와 legacy id를 받는다 —
 * 이주된 기록은 legacy id로 사람을 가리키기 때문이다. 재가입 회원의 legacy id는
 * 새 id의 주소로 영구 이동하고, 탈퇴·없는 id는 404다.
 */
export const load: PageServerLoad = async ({ params }) => {
  // 404(없는 회원)와 503(데이터 계층에 닿지 못함)은 다른 사실이다 — httpGuard가
  // AppError의 상태를 그대로 둔다.
  const result = await httpGuard(() => getPublicMember(params.id));
  if (!result) throw error(404, "Not Found");
  if ("redirectTo" in result) throw redirect(301, result.redirectTo);
  return { ...result, generatedAt: new Date().toISOString() };
};
