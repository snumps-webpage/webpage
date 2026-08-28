import { dev } from "$app/environment";
import { error, fail } from "@sveltejs/kit";
import {
  membershipApplicationIssues,
  membershipApplicationUpdateSchema,
} from "$lib/domain/membership-applications";
import { ensureSession } from "$lib/server/auth-guards";
import {
  getDevApplicationByEmail,
  updateDevApplication,
  withdrawDevApplication,
} from "$lib/server/dev-admin-dashboard-fixtures";
import {
  DEV_PREVIEW_APPLICANT_EMAIL,
  DEV_PREVIEW_APPLICANT_NAME,
} from "$lib/server/dev-preview";
import { normalizePhoneNumber, parseGoogleName } from "$lib/utils";
import type { Actions, PageServerLoad } from "./$types";

const PREVIEW_EMAIL = DEV_PREVIEW_APPLICANT_EMAIL;
const PREVIEW_NAME = DEV_PREVIEW_APPLICANT_NAME;

function isPreview(url: URL) {
  return dev && url.searchParams.get("preview") === "1";
}

function formValue(formData: FormData, name: string) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : "";
}

export const load: PageServerLoad = async ({ locals, url }) => {
  if (isPreview(url)) {
    const application = getDevApplicationByEmail(PREVIEW_EMAIL);
    return {
      user: { email: PREVIEW_EMAIL, name: PREVIEW_NAME },
      parsedInfo: parseGoogleName(PREVIEW_NAME),
      application,
      preview: true,
    };
  }
  await ensureSession(locals, url);
  throw error(503, "새 가입 신청 수정 API 연결이 필요합니다.");
};

export const actions: Actions = {
  updateApplication: async ({ request, locals, url }) => {
    if (!isPreview(url)) {
      await ensureSession(locals, url);
      return fail(503, { error: "새 가입 신청 수정 API 연결이 필요합니다." });
    }
    const formData = await request.formData();
    const id = formValue(formData, "id");
    const parsed = membershipApplicationUpdateSchema.safeParse({
      phone: normalizePhoneNumber(formValue(formData, "phone")),
      background: formValue(formData, "background"),
    });
    if (!parsed.success) {
      return fail(400, {
        error: "입력값을 확인해 주세요.",
        issues: membershipApplicationIssues(parsed.error),
      });
    }
    const application = updateDevApplication(id, PREVIEW_EMAIL, parsed.data);
    if (!application)
      return fail(409, { error: "이미 처리되었거나 찾을 수 없는 신청입니다." });
    return {
      success: true,
      operation: "applicationUpdated" as const,
      application,
    };
  },

  withdrawApplication: async ({ request, locals, url }) => {
    if (!isPreview(url)) {
      await ensureSession(locals, url);
      return fail(503, { error: "새 가입 신청 철회 API 연결이 필요합니다." });
    }
    const id = formValue(await request.formData(), "id");
    if (!withdrawDevApplication(id, PREVIEW_EMAIL)) {
      return fail(404, { error: "이미 처리되었거나 찾을 수 없는 신청입니다." });
    }
    return { success: true, operation: "applicationWithdrawn" as const };
  },
};
