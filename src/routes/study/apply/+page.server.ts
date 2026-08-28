import { dev } from "$app/environment";
import { error, fail } from "@sveltejs/kit";
import { validateStudyRequestForm } from "$lib/domain/studies";
import { ensureSession } from "$lib/server/auth-guards";
import {
  createDevStudyRequest,
  getDevStudyRequestsForMember,
  withdrawDevStudyRequest,
} from "$lib/server/dev-study-fixtures";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import { getSemesterInfo } from "$lib/utils";
import type { Actions, PageServerLoad } from "./$types";

async function requireMemberPreview(
  locals: App.Locals,
  url: URL,
  cookies: Parameters<typeof resolveDevPreviewRole>[1],
) {
  await ensureSession(locals, url);
  if (!dev) throw error(503, "새 스터디 신청 API 연결이 필요합니다.");
  if (resolveDevPreviewRole(url, cookies) !== "member") {
    throw error(404, "Not Found");
  }
}

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  await requireMemberPreview(locals, url, cookies);
  return {
    requests: getDevStudyRequestsForMember(),
    defaultSemester: getSemesterInfo().key,
  };
};

export const actions: Actions = {
  default: async ({ request, locals, url, cookies }) => {
    await requireMemberPreview(locals, url, cookies);
    const result = validateStudyRequestForm(await request.formData());
    if (!result.success) return fail(400, result.failure);
    const studyRequest = createDevStudyRequest(result.data);
    return {
      success: true,
      operation: "requestSubmitted" as const,
      request: studyRequest,
    };
  },

  withdraw: async ({ request, locals, url, cookies }) => {
    await requireMemberPreview(locals, url, cookies);
    const formData = await request.formData();
    const entry = formData.get("requestId");
    const requestId = typeof entry === "string" ? entry : "";
    if (!requestId) return fail(400, { error: "VALIDATION_FAILED" });
    if (!withdrawDevStudyRequest(requestId)) {
      return fail(409, { error: "철회할 수 없는 신청입니다." });
    }
    return {
      success: true,
      operation: "requestWithdrawn" as const,
      requestId,
    };
  },
};
