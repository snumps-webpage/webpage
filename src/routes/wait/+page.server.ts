import { dev } from "$app/environment";
import { error, fail, redirect } from "@sveltejs/kit";
import {
  getDevApplicationByEmail,
  withdrawDevApplication,
} from "$lib/server/dev-admin-dashboard-fixtures";
import {
  DEV_PREVIEW_APPLICANT_EMAIL,
  DEV_PREVIEW_APPLICANT_NAME,
} from "$lib/server/dev-preview";
import { ensureSession } from "$lib/server/auth-guards";
import type { Actions, PageServerLoad } from "./$types";

function isPreview(url: URL) {
  return dev && url.searchParams.get("preview") === "1";
}

export const load: PageServerLoad = async (event) => {
  if (isPreview(event.url)) {
    const application = getDevApplicationByEmail(DEV_PREVIEW_APPLICANT_EMAIL);
    if (!application) throw redirect(303, "/signup?preview=1");
    return {
      user: {
        email: DEV_PREVIEW_APPLICANT_EMAIL,
        name: DEV_PREVIEW_APPLICANT_NAME,
      },
      application,
      preview: true,
    };
  }
  const { session, isMember, application, isAdmin } = await event.parent();

  if (!session?.user) {
    throw redirect(302, "/");
  }

  // If already a member, no need to be on the wait page (Admins can stay for preview)
  if (isMember && !isAdmin) {
    throw redirect(302, "/");
  }

  // If no application at all, go to signup (Admins can skip this)
  if (!application && !isAdmin) {
    throw redirect(302, "/signup");
  }

  return {
    user: session.user,
    application,
    preview: false,
  };
};

export const actions: Actions = {
  withdrawApplication: async ({ request, locals, url }) => {
    const formData = await request.formData();
    const entry = formData.get("id");
    const applicationId = typeof entry === "string" ? entry : "";
    if (!applicationId) return fail(400, { error: "VALIDATION_FAILED" });
    if (isPreview(url)) {
      if (!withdrawDevApplication(applicationId, DEV_PREVIEW_APPLICANT_EMAIL)) {
        return fail(404, { error: "NOT_FOUND" });
      }
      throw redirect(303, "/signup?preview=1");
    }
    await ensureSession(locals, url);
    throw error(503, "새 가입 신청 철회 API 연결이 필요합니다.");
  },
};
