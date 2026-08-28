import { redirect } from "@sveltejs/kit";
import { ensureSession, handleUserAction } from "$lib/server/auth-guards";
import {
  getApplicationForEmail,
  updateOwnApplication,
} from "$lib/server/services/membership";
import { normalizePhoneNumber, parseGoogleName } from "$lib/utils";
import { AppError } from "$lib/server/core/errors";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const session = await ensureSession(event.locals, event.url);

  const application = await getApplicationForEmail(session.user.email);
  if (!application) throw redirect(302, "/signup");

  return {
    user: session.user,
    parsedInfo: parseGoogleName(session.user.name),
    application: { ...application, accepted: false, submittedAt: application.createdAt },
  };
};

export const actions = {
  default: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    return handleUserAction(locals, async (session) => {
      const { name, department } = parseGoogleName(session.user.name);
      if (!name || !department) {
        throw new AppError("VALIDATION_FAILED", {
          userMessage: "계정 정보에서 이름 또는 학과를 찾을 수 없습니다.",
        });
      }

      const data = await request.formData();
      const phone = normalizePhoneNumber(data.get("phone") as string);
      if (!phone) {
        throw new AppError("VALIDATION_FAILED", {
          userMessage: "전화번호를 입력해주세요.",
        });
      }

      // Own row only — resolved by session email, never by a client-supplied id.
      await updateOwnApplication(session.user.email, {
        name,
        department,
        phone,
        background: (data.get("background") as string) ?? "",
      });
    });
  },
};
