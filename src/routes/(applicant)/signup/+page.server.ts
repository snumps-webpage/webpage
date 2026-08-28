import { redirect, fail } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { ensureSession, handleUserAction } from "$lib/server/auth-guards";
import {
  getApplicationForEmail,
  submitApplication,
} from "$lib/server/services/membership";
import { normalizePhoneNumber, parseGoogleName } from "$lib/utils";
import { AppError } from "$lib/server/core/errors";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const isPreview = dev && event.url.searchParams.get("preview") === "1";
  const session = await (isPreview
    ? event.locals.auth()
    : ensureSession(event.locals, event.url));

  if (isPreview) {
    const previewName = session?.user?.name || "홍길동 / 학부생 / 수리과학부";
    return {
      user: session?.user || { email: "preview@snu.ac.kr", name: previewName },
      parsedInfo: parseGoogleName(previewName),
      pending: false,
      preview: true,
    };
  }

  const user = session!.user!;
  if (!user.email) throw redirect(302, "/");

  // The zone guard already bounced members; a pending applicant edits instead.
  if (await getApplicationForEmail(user.email)) {
    throw redirect(302, "/signup/edit");
  }

  return {
    user,
    parsedInfo: parseGoogleName(user.name),
    pending: false,
    preview: false,
  };
};

export const actions = {
  default: async ({
    request,
    locals,
    url,
  }: {
    request: Request;
    locals: App.Locals;
    url: URL;
  }) => {
    if (dev && url.searchParams.get("preview") === "1") {
      return fail(400, { error: "미리보기 모드에서는 신청을 제출할 수 없습니다." });
    }

    return handleUserAction(locals, async (session) => {
      const { name, department } = parseGoogleName(session.user.name);
      if (!name || !department) {
        throw new AppError("VALIDATION_FAILED", {
          userMessage: "계정 정보에서 이름 또는 학과를 찾을 수 없습니다.",
        });
      }

      const data = await request.formData();
      const phone = normalizePhoneNumber(data.get("phone") as string);
      const background = (data.get("background") as string) ?? "";
      if (!data.get("agreement")) {
        throw new AppError("VALIDATION_FAILED", {
          userMessage: "개인정보 수집 및 이용에 동의해야 합니다.",
        });
      }
      if (!phone) {
        throw new AppError("VALIDATION_FAILED", {
          userMessage: "전화번호를 입력해주세요.",
        });
      }

      try {
        await submitApplication({
          email: session.user.email,
          name,
          department,
          phone,
          background,
        });
      } catch (e) {
        if (e instanceof AppError && e.code === "CONFLICT") {
          throw new AppError("CONFLICT", {
            userMessage: "이미 제출된 신청이 있습니다. 수정 화면을 이용해 주세요.",
          });
        }
        throw e;
      }

      const { sendSignupNotification } = await import("$lib/server/mail");
      await sendSignupNotification(name);
    });
  },
};
