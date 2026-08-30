import { dev } from "$app/environment";
import { error } from "@sveltejs/kit";
import { ensureAdmin } from "$lib/server/auth-guards";
import { getDevAdminMembers } from "$lib/server/dev-member-fixtures";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  await ensureAdmin(locals, { silent: true });
  if (!dev || resolveDevPreviewRole(url, cookies) !== "admin") {
    throw error(503, "새 회원 관리 API 연결이 필요합니다.");
  }
  return {
    members: getDevAdminMembers(),
    generatedAt: new Date().toISOString(),
  };
};
