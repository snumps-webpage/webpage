import { redirect, fail } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { getMemberByEmail } from "$lib/server/notion";
import { getApplications, isAdmin, type Application } from "$lib/server/admin";
import { isValidPhoneNumber, normalizePhoneNumber } from "$lib/utils";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const isPreview = dev && event.url.searchParams.get("preview") === "1";
  const session = await event.locals.auth();

  if (isPreview) {
    const previewName = session?.user?.name || "홍길동 / 학부생 / 수리과학부";
    const parts = previewName.split("/").map((p) => p.trim());

    return {
      user: session?.user || {
        email: "preview@snu.ac.kr",
        name: previewName,
      },
      parsedInfo: {
        name: parts[0] || "홍길동",
        status: parts[1] || "학부생",
        department: parts[2] || "수리과학부",
      },
      pending: false,
      preview: true,
    };
  }

  if (!session?.user?.email) {
    throw redirect(302, "/");
  }

  const [member, apps] = await Promise.all([
    getMemberByEmail(session.user.email),
    getApplications(),
  ]);

  const isUserAdmin = isAdmin(session.user.email);

  if (member && !isUserAdmin) {
    throw redirect(302, "/");
  }

  const pending = apps.find(
    (a: Application) => a.email === session.user?.email,
  );

  if (pending && !isUserAdmin) {
    throw redirect(302, "/signup/edit");
  }

  // Parse user info from name field: "Name / Status / Dept"
  const rawName = session.user.name || "";
  const parts = rawName.split("/").map((p) => p.trim());
  const parsedInfo = {
    name: parts[0] || "",
    status: parts[1] || "",
    department: parts[2] || "",
  };

  return {
    user: session.user,
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

    const session = await locals.auth();
    if (!session?.user?.email)
      return fail(401, { error: "로그인이 필요합니다." });

    // Extract immutable info from session name
    const rawName = session.user.name || "";
    const parts = rawName.split("/").map((p) => p.trim());
    const immutableName = parts[0] || "";
    const immutableDept = parts[2] || "";

    if (!immutableName || !immutableDept) {
      return fail(400, {
        error: "계정 정보에서 이름 또는 학과를 찾을 수 없습니다.",
      });
    }

    const data = await request.formData();
    const rawPhone = ((data.get("phone") as string | null) ?? "").trim();
    const background = data.get("background") as string;
    const agreement = data.get("agreement");

    if (!agreement) {
      return fail(400, { error: "개인정보 수집 및 이용에 동의해야 합니다." });
    }

    if (!rawPhone) {
      return fail(400, { error: "전화번호를 입력해주세요." });
    }

    if (!isValidPhoneNumber(rawPhone)) {
      return fail(400, {
        error: "전화번호는 10~11자리 숫자 또는 XXX-XXX(X)-XXXX 형식으로 입력해주세요.",
      });
    }

    const phone = normalizePhoneNumber(rawPhone);

    const { addApplication } = await import("$lib/server/admin");
    const { sendSignupNotification } = await import("$lib/server/mail");

    try {
      await addApplication({
        email: session.user.email,
        name: immutableName,
        department: immutableDept,
        phone,
        background,
      });

      // Notify admins about the new registration application
      await sendSignupNotification(immutableName);

      return { success: true };
    } catch (e) {
      console.error(e);
      return fail(500, {
        error: "신청 처리에 실패했습니다. 잠시 후 다시 시도해주세요.",
      });
    }
  },
};
