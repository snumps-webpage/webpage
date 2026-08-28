import { dev } from "$app/environment";
import { error, fail, redirect } from "@sveltejs/kit";
import { ACTIVITY_TYPES } from "$lib/constants";
import {
  adminEventInputSchema,
  adminFormIssues,
  localAdminDateTimeToIso,
} from "$lib/domain/admin-dashboard";
import { ensureAdmin } from "$lib/server/auth-guards";
import { createDevEvent } from "$lib/server/dev-admin-dashboard-fixtures";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import type { Actions, PageServerLoad } from "./$types";

function formValue(formData: FormData, name: string) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : "";
}

function requirePreview(
  url: URL,
  cookies: Parameters<typeof resolveDevPreviewRole>[1],
) {
  if (!dev || resolveDevPreviewRole(url, cookies) !== "admin") {
    throw error(503, "새 이벤트 생성 API 연결이 필요합니다.");
  }
}

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  await ensureAdmin(locals, { silent: true });
  requirePreview(url, cookies);
  return { activityTypes: ACTIVITY_TYPES };
};

export const actions: Actions = {
  default: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requirePreview(url, cookies);
    const formData = await request.formData();
    const parsed = adminEventInputSchema.safeParse({
      title: formValue(formData, "title"),
      type: formValue(formData, "type"),
      startsAtLocal: formValue(formData, "date"),
      endsAtLocal: "",
    });
    if (!parsed.success) {
      const issues = adminFormIssues(parsed.error);
      return fail(400, {
        error: "입력값을 확인해 주세요.",
        issues: {
          title: issues.title,
          type: issues.type,
          date: issues.startsAtLocal,
        },
      });
    }
    createDevEvent({
      title: parsed.data.title,
      type: parsed.data.type,
      startsAt: localAdminDateTimeToIso(parsed.data.startsAtLocal),
    });
    throw redirect(303, "/admin?dev_preview=admin");
  },
};
