import { dev } from "$app/environment";
import { error, fail } from "@sveltejs/kit";
import {
  membershipApplicationInputSchema,
  membershipApplicationIssues,
} from "$lib/domain/membership-applications";
import { ensureSession } from "$lib/server/auth-guards";
import {
  getDevApplicationByEmail,
  submitDevApplication,
} from "$lib/server/dev-admin-dashboard-fixtures";
import {
  DEV_PREVIEW_APPLICANT_EMAIL,
  DEV_PREVIEW_APPLICANT_NAME,
} from "$lib/server/dev-preview";
import { normalizePhoneNumber, parseGoogleName } from "$lib/utils";
import type { Actions, PageServerLoad } from "./$types";

const PREVIEW_USER = {
  email: DEV_PREVIEW_APPLICANT_EMAIL,
  name: DEV_PREVIEW_APPLICANT_NAME,
};

function isPreview(url: URL) {
  return dev && url.searchParams.get("preview") === "1";
}

function formValue(formData: FormData, name: string) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : "";
}

export const load: PageServerLoad = async ({ locals, url }) => {
  if (isPreview(url)) {
    return {
      user: PREVIEW_USER,
      parsedInfo: parseGoogleName(PREVIEW_USER.name),
      pending: Boolean(getDevApplicationByEmail(PREVIEW_USER.email)),
      preview: true,
    };
  }

  await ensureSession(locals, url);
  throw error(503, "새 가입 신청 API 연결이 필요합니다.");
};

export const actions: Actions = {
  default: async ({ request, locals, url }) => {
    if (!isPreview(url)) {
      await ensureSession(locals, url);
      return fail(503, { error: "새 가입 신청 API 연결이 필요합니다." });
    }

    const formData = await request.formData();
    const parsed = membershipApplicationInputSchema.safeParse({
      phone: normalizePhoneNumber(formValue(formData, "phone")),
      background: formValue(formData, "background"),
      agreement: formValue(formData, "agreement"),
    });
    if (!parsed.success) {
      return fail(400, {
        error: "입력값을 확인해 주세요.",
        issues: membershipApplicationIssues(parsed.error),
      });
    }

    const profile = parseGoogleName(PREVIEW_USER.name);
    const application = submitDevApplication({
      name: profile.name,
      email: PREVIEW_USER.email,
      department: profile.department,
      phone: parsed.data.phone,
      background: parsed.data.background,
    });
    if (!application)
      return fail(409, { error: "이미 접수된 가입 신청이 있습니다." });
    return {
      success: true,
      operation: "applicationSubmitted" as const,
      applicationId: application.id,
      mailFailed: false,
    };
  },
};
