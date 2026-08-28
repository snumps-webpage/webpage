import { dev } from "$app/environment";
import { error, fail, redirect } from "@sveltejs/kit";
import { adminDashboardIdSchema } from "$lib/domain/admin-dashboard";
import { ensureAdmin } from "$lib/server/auth-guards";
import {
  connectDevActivity,
  getDevConnectableActivities,
} from "$lib/server/dev-admin-dashboard-fixtures";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import { getSemesterKeyFromDate } from "$lib/utils";
import type { Actions, PageServerLoad } from "./$types";

function requirePreview(
  url: URL,
  cookies: Parameters<typeof resolveDevPreviewRole>[1],
) {
  if (!dev || resolveDevPreviewRole(url, cookies) !== "admin") {
    throw error(503, "새 활동 연결 API 연결이 필요합니다.");
  }
}

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  await ensureAdmin(locals, { silent: true });
  requirePreview(url, cookies);
  const activities = getDevConnectableActivities();
  return {
    activities,
    semesters: [
      ...new Set(
        activities.map((activity) => getSemesterKeyFromDate(activity.date)),
      ),
    ]
      .sort()
      .reverse(),
  };
};

export const actions: Actions = {
  publish: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requirePreview(url, cookies);
    const formData = await request.formData();
    const parsed = adminDashboardIdSchema.safeParse(formData.get("activityId"));
    if (!parsed.success)
      return fail(400, { error: "연결할 활동을 선택해 주세요." });
    if (!connectDevActivity(parsed.data)) {
      return fail(409, { error: "이미 연결됐거나 찾을 수 없는 활동입니다." });
    }
    throw redirect(303, "/admin?dev_preview=admin");
  },
};
