import { dev } from "$app/environment";
import { env } from "$env/dynamic/private";
import { error, fail } from "@sveltejs/kit";
import {
  dashboardEventIdSchema,
  dashboardProfileInputSchema,
  dashboardProfileIssues,
} from "$lib/domain/dashboard";
import { ensureSession } from "$lib/server/auth-guards";
import {
  applyDevDashboardActivity,
  cancelDevDashboardActivity,
  getDevMemberDashboard,
} from "$lib/server/dev-dashboard-fixtures";
import { updateDevDashboardProfile } from "$lib/server/dev-member-fixtures";
import {
  resolveDevPreviewRole,
  type DevPreviewRole,
} from "$lib/server/dev-preview";
import { getSemesterInfo, normalizePhoneNumber } from "$lib/utils";
import type { Actions, PageServerLoad } from "./$types";

async function requireDashboardPreview(
  locals: App.Locals,
  url: URL,
  cookies: Parameters<typeof resolveDevPreviewRole>[1],
) {
  await ensureSession(locals, url);
  const role = resolveDevPreviewRole(url, cookies);
  if (!dev || !role) {
    throw error(503, "새 회원 대시보드 API 연결이 필요합니다.");
  }
  return role;
}

function formValue(formData: FormData, name: string) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : "";
}

function activityMutationFailure(result: {
  success: false;
  error: "NOT_FOUND" | "EVENT_NOT_OPEN";
}) {
  return result.error === "NOT_FOUND"
    ? fail(404, { error: result.error })
    : fail(409, { error: result.error });
}

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  const previewRole = resolveDevPreviewRole(url, cookies);
  const session = previewRole || env.AUTH_SECRET ? await locals.auth() : null;
  const semester = getSemesterInfo();

  if (!session?.user) {
    return {
      semester: semester.name,
      dashboard: null,
    };
  }

  if (dev && previewRole) {
    const selectedSemester = url.searchParams.get("semester") ?? semester.key;
    const dashboard = getDevMemberDashboard(previewRole, selectedSemester);
    if (!dashboard) throw error(404, "회원 정보를 찾을 수 없습니다.");
    return {
      semester: semester.name,
      dashboard,
    };
  }

  throw error(503, "새 회원 대시보드 API 연결이 필요합니다.");
};

export const actions: Actions = {
  updateProfile: async ({ request, locals, url, cookies }) => {
    const role = await requireDashboardPreview(locals, url, cookies);
    const formData = await request.formData();
    const parsed = dashboardProfileInputSchema.safeParse({
      phone: normalizePhoneNumber(formValue(formData, "phone")),
      background: formValue(formData, "background"),
    });
    if (!parsed.success) {
      return fail(400, {
        error: "VALIDATION_FAILED",
        issues: dashboardProfileIssues(parsed.error),
      });
    }
    const profile = updateDevDashboardProfile(role, parsed.data);
    if (!profile) return fail(404, { error: "NOT_FOUND" });
    return {
      success: true,
      operation: "profileUpdated" as const,
      profile,
    };
  },

  applyActivity: async ({ request, locals, url, cookies }) => {
    const role = await requireDashboardPreview(locals, url, cookies);
    return mutateActivity(await request.formData(), role, true);
  },

  cancelActivity: async ({ request, locals, url, cookies }) => {
    const role = await requireDashboardPreview(locals, url, cookies);
    return mutateActivity(await request.formData(), role, false);
  },
};

function mutateActivity(
  formData: FormData,
  role: DevPreviewRole,
  apply: boolean,
) {
  const eventId = formValue(formData, "eventId");
  if (!dashboardEventIdSchema.safeParse(eventId).success) {
    return fail(400, { error: "VALIDATION_FAILED" });
  }
  const result = apply
    ? applyDevDashboardActivity(role, eventId)
    : cancelDevDashboardActivity(role, eventId);
  if (!result.success) return activityMutationFailure(result);
  return {
    success: true,
    operation: apply
      ? ("activityApplied" as const)
      : ("activityCancelled" as const),
    activity: result.activity,
  };
}
