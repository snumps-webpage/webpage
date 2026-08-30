import { dev } from "$app/environment";
import { error, fail } from "@sveltejs/kit";
import { studyIdSchema } from "$lib/domain/studies";
import { ensureSession } from "$lib/server/auth-guards";
import {
  acceptDevTransfer,
  declineDevTransfer,
  getDevStudyList,
  getDevTransferOffers,
} from "$lib/server/dev-study-fixtures";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import type { Actions, PageServerLoad } from "./$types";

async function requireMemberPreview(
  locals: App.Locals,
  url: URL,
  cookies: Parameters<typeof resolveDevPreviewRole>[1],
) {
  await ensureSession(locals, url);
  if (!dev) throw error(503, "새 스터디 목록 API 연결이 필요합니다.");
  if (resolveDevPreviewRole(url, cookies) !== "member") {
    throw error(404, "Not Found");
  }
}

function studyIdFrom(formData: FormData) {
  const entry = formData.get("studyId");
  return typeof entry === "string" ? entry : "";
}

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  await requireMemberPreview(locals, url, cookies);
  return {
    studies: getDevStudyList(),
    transferOffers: getDevTransferOffers(),
    generatedAt: new Date().toISOString(),
  };
};

export const actions: Actions = {
  acceptTransfer: async ({ request, locals, url, cookies }) => {
    await requireMemberPreview(locals, url, cookies);
    const studyId = studyIdFrom(await request.formData());
    if (!studyIdSchema.safeParse(studyId).success) {
      return fail(400, { error: "VALIDATION_FAILED" });
    }
    if (!acceptDevTransfer(studyId)) {
      return fail(409, { error: "유효한 주최자 전달 제안이 아닙니다." });
    }
    const study = getDevStudyList().find((item) => item.id === studyId);
    if (!study) return fail(404, { error: "NOT_FOUND" });
    return {
      success: true,
      operation: "transferAccepted" as const,
      studyId,
      study,
    };
  },

  declineTransfer: async ({ request, locals, url, cookies }) => {
    await requireMemberPreview(locals, url, cookies);
    const studyId = studyIdFrom(await request.formData());
    if (!studyIdSchema.safeParse(studyId).success) {
      return fail(400, { error: "VALIDATION_FAILED" });
    }
    if (!declineDevTransfer(studyId)) {
      return fail(409, { error: "유효한 주최자 전달 제안이 아닙니다." });
    }
    return {
      success: true,
      operation: "transferDeclined" as const,
      studyId,
    };
  },
};
