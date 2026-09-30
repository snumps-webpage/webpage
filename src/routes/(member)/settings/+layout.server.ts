import { hasExecutiveHistory } from "$lib/server/services/executive-profiles";
import type { LayoutServerLoad } from "./$types";

/** 회원 설정 탭 — "공개 프로필"은 회장·부회장 이력이 있는 회원에게만 보인다. */
export const load: LayoutServerLoad = async ({ locals }) => ({
  showExecutiveProfile: await hasExecutiveHistory(locals.member!.memberId),
});
