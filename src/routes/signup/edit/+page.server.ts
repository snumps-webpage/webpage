import { redirect } from "@sveltejs/kit";
import { getMemberByEmail } from "$lib/server/notion";
import {
  getApplications,
  isAdmin,
  updateApplication,
  type Application,
} from "$lib/server/admin";
import { ensureSession, handleUserAction } from "$lib/server/auth-guards";
import {
  PHONE_FORMAT_MESSAGE,
  isValidPhoneNumber,
  normalizePhoneNumber,
  parseGoogleName,
} from "$lib/utils";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const session = await ensureSession(event.locals, event.url);

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
  const parsedInfo = parseGoogleName(session.user.name);

  return {
    user: session.user,
    parsedInfo,
    application: pending,
  };
};

export const actions = {
  default: async ({ request, locals }) => {
    return handleUserAction(
      locals,
      async (session) => {
        const { name: immutableName, department: immutableDept } =
          parseGoogleName(session.user.name);

        if (!immutableName || !immutableDept) {
          throw new Error("계정 정보에서 이름 또는 학과를 찾을 수 없습니다.");
        }

        const data = await request.formData();
        const rawPhone = ((data.get("phone") as string | null) ?? "").trim();
        const background = data.get("background") as string;
        const appId = data.get("id") as string;

        if (!appId) throw new Error("수정할 신청 내역을 찾을 수 없습니다.");
        if (!rawPhone) throw new Error("전화번호를 입력해주세요.");
        if (!isValidPhoneNumber(rawPhone))
          throw new Error(PHONE_FORMAT_MESSAGE);

        const phone = normalizePhoneNumber(rawPhone);

        await updateApplication(appId, {
          name: immutableName,
          department: immutableDept,
          phone,
          background,
        });
      },
      { invalidate: "all_applications" },
    );
  },
};
