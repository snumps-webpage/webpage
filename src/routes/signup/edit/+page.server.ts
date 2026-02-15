import { redirect, fail } from "@sveltejs/kit";
import { getMemberByEmail } from "$lib/server/notion";
import {
  getApplications,
  isAdmin,
  updateApplication,
  type Application,
} from "$lib/server/admin";
import { normalizePhoneNumber } from "$lib/utils";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const session = await event.locals.auth();
  if (!session?.user?.email) {
    throw redirect(302, "/");
  }

  const [member, apps] = await Promise.all([
    getMemberByEmail(session.user.email),
    getApplications(),
  ]);

  // Admins can view for testing, others must be non-members with pending app
  if (member && !isAdmin(session.user.email)) {
    throw redirect(302, "/");
  }

  const pending = apps.find(
    (a: Application) => a.email === session.user?.email,
  );

  if (!pending && !isAdmin(session.user.email)) {
    throw redirect(302, "/signup");
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
    application: pending,
  };
};

export const actions = {
  default: async ({ request, locals }) => {
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
    const phone = normalizePhoneNumber(data.get("phone") as string);
    const background = data.get("background") as string;
    const appId = data.get("id") as string;

    if (!appId) {
      return fail(400, { error: "수정할 신청 내역을 찾을 수 없습니다." });
    }

    if (!phone) {
      return fail(400, { error: "전화번호를 입력해주세요." });
    }

    try {
      await updateApplication(appId, {
        name: immutableName,
        department: immutableDept,
        phone,
        background,
      });
      return { success: true };
    } catch (e: unknown) {
      console.error("[Application Edit] Error:", e);
      const isNotFound =
        e instanceof Error &&
        (e.message?.includes("Could not find page") ||
          (e as { status?: number }).status === 404);

      if (isNotFound) {
        return fail(404, {
          error:
            "신청 내역을 찾을 수 없습니다. 이미 처리되었거나 삭제되었을 수 있습니다.",
        });
      }
      return fail(500, {
        error: "정보 수정에 실패했습니다. 잠시 후 다시 시도해주세요.",
      });
    }
  },
};
