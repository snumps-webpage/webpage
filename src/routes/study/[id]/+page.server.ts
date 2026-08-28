import { dev } from "$app/environment";
import { error, fail } from "@sveltejs/kit";
import { ensureSession } from "$lib/server/auth-guards";
import {
  getDevStudyDetail,
  joinDevStudy,
  leaveDevStudy,
} from "$lib/server/dev-study-fixtures";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import type { Actions, PageServerLoad } from "./$types";

async function requireMemberPreview(
  locals: App.Locals,
  url: URL,
  cookies: Parameters<typeof resolveDevPreviewRole>[1],
) {
  await ensureSession(locals, url);
  if (!dev) throw error(503, "새 스터디 상세 API 연결이 필요합니다.");
  if (resolveDevPreviewRole(url, cookies) !== "member") {
    throw error(404, "Not Found");
  }
}

export const load: PageServerLoad = async ({
  locals,
  url,
  cookies,
  params,
}) => {
  await requireMemberPreview(locals, url, cookies);
  const study = getDevStudyDetail(params.id);
  if (!study) throw error(404, "스터디를 찾을 수 없습니다.");
  return { study };
};

export const actions: Actions = {
  join: async ({ locals, url, cookies, params }) => {
    await requireMemberPreview(locals, url, cookies);
    const study = getDevStudyDetail(params.id);
    if (!study) return fail(404, { error: "NOT_FOUND" });
    if (study.relationship !== "pending" && !study.canJoin) {
      return fail(409, { error: "현재 참여 신청을 받을 수 없습니다." });
    }
    if (!joinDevStudy(params.id)) {
      return fail(409, { error: "참여 신청을 처리하지 못했습니다." });
    }
    return {
      success: true,
      operation: "studyJoined" as const,
      studyId: params.id,
      relationship: "pending" as const,
    };
  },

  leave: async ({ locals, url, cookies, params }) => {
    await requireMemberPreview(locals, url, cookies);
    const study = getDevStudyDetail(params.id);
    if (!study) return fail(404, { error: "NOT_FOUND" });
    if (study.relationship === "organizer") {
      return fail(409, { error: "주최자는 스터디를 나갈 수 없습니다." });
    }
    if (study.relationship !== "none" && !leaveDevStudy(params.id)) {
      return fail(409, { error: "참여 상태를 변경하지 못했습니다." });
    }
    return {
      success: true,
      operation: "studyLeft" as const,
      studyId: params.id,
      relationship: "none" as const,
    };
  },
};
