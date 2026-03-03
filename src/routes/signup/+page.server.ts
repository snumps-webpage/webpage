import { redirect, fail } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { getMemberByEmail } from "$lib/server/notion";
import { getApplications, isAdmin, type Application } from "$lib/server/admin";
import { ensureSession, handleUserAction } from "$lib/server/auth-guards";
import { normalizePhoneNumber, parseGoogleName } from "$lib/utils";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const isPreview = dev && event.url.searchParams.get("preview") === "1";
  const session = await (isPreview
    ? event.locals.auth()
    : ensureSession(event.locals, event.url));

  if (isPreview) {
    const previewName = session?.user?.name || "홍길동 / 학부생 / 수리과학부";
    const parsedInfo = parseGoogleName(previewName);

    return {
      user: session?.user || {
        email: "preview@snu.ac.kr",
        name: previewName,
      },
      parsedInfo,
      pending: false,
      preview: true,
    };
  }

  // At this point, session is guaranteed by ensureSession
  const user = session!.user!;
  if (!user.email) throw redirect(302, "/");

  const [member, apps] = await Promise.all([
    getMemberByEmail(user.email),
    getApplications(),
  ]);

  const isUserAdmin = isAdmin(user.email);

  if (member && !isUserAdmin) {
    throw redirect(302, "/");
  }

  const pending = apps.find((a: Application) => a.email === user.email);

  if (pending && !isUserAdmin) {
    throw redirect(302, "/signup/edit");
  }

  // Parse user info from name field: "Name / Status / Dept"
  const parsedInfo = parseGoogleName(user.name);

  return {
    user,
    parsedInfo,
    pending: !!pending,
    preview: false,
  };
};

export const actions = {
  default: async ({ request, locals, url }) => {
    if (dev && url.searchParams.get("preview") === "1") {
      return fail(400, {
        error: "미리보기 모드에서는 신청을 제출할 수 없습니다.",
      });
    }

    return handleUserAction(
      locals,
      async (session) => {
        const user = session.user;
        const { name: immutableName, department: immutableDept } =
          parseGoogleName(user.name);

        if (!immutableName || !immutableDept) {
          throw new Error("계정 정보에서 이름 또는 학과를 찾을 수 없습니다.");
        }

        const data = await request.formData();
        const phone = normalizePhoneNumber(data.get("phone") as string);
        const background = data.get("background") as string;
        const agreement = data.get("agreement");

        if (!agreement)
          throw new Error("개인정보 수집 및 이용에 동의해야 합니다.");
        if (!phone) throw new Error("전화번호를 입력해주세요.");

        const { addApplication } = await import("$lib/server/admin");
        const { sendSignupNotification } = await import("$lib/server/mail");

        await addApplication({
          email: user.email,
          name: immutableName,
          department: immutableDept,
          phone,
          background,
        });

        await sendSignupNotification(immutableName);
      },
      { invalidate: "all_applications" },
    );
  },
};
