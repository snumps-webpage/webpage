import { redirect, fail } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { ensureSession, handleUserAction } from "$lib/server/auth-guards";
import {
  getApplicationForEmail,
  submitApplication,
} from "$lib/server/services/membership";
import { normalizePhoneNumber, parseGoogleName } from "$lib/utils";
import { AppError } from "$lib/server/core/errors";
import { stripInvisibles } from "$lib/server/core/strings";
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

  // 대기 중 신청이 있어도 리디렉션하지 않는다: ①페이지 접근을 가로채고
  // ②제출 직후 load 재실행이 완료 안내 화면(SuccessScreen)까지 삼킨다.
  // pending 상태 UI가 접수 사실 + 대기/수정 링크를 보여주고, 중복 제출은
  // 서비스의 CONFLICT가 막는다.
  const pending = (await getApplicationForEmail(user.email)) !== null;

  return {
    user,
    parsedInfo: parseGoogleName(user.name),
    pending,
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
      const studentId = stripInvisibles((data.get("studentId") as string) ?? "").trim();
      const background = (data.get("background") as string) ?? "";
      if (!/^\d{4}-?\d{4,6}$/.test(studentId)) {
        throw new AppError("VALIDATION_FAILED", {
          userMessage: "학번을 2024-12345 형식으로 입력해 주세요.",
        });
      }
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
          studentId,
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
