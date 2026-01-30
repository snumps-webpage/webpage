import { redirect, fail } from "@sveltejs/kit";
import { b as getMemberByEmail } from "../../../../chunks/notion.js";
import { getApplications, isAdmin, updateApplication } from "../../../../chunks/admin.js";
import { n as normalizePhoneNumber } from "../../../../chunks/utils3.js";
const load = async (event) => {
  const session = await event.locals.auth();
  if (!session?.user?.email) {
    throw redirect(302, "/");
  }
  const [member, apps] = await Promise.all([
    getMemberByEmail(session.user.email),
    getApplications()
  ]);
  if (member && !isAdmin(session.user.email)) {
    throw redirect(302, "/");
  }
  const pending = apps.find((a) => a.email === session.user?.email);
  if (!pending && !isAdmin(session.user.email)) {
    throw redirect(302, "/signup");
  }
  return {
    user: session.user,
    application: pending
  };
};
const actions = {
  default: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email) return fail(401, { error: "로그인이 필요합니다." });
    const data = await request.formData();
    const name = data.get("name");
    const department = data.get("department");
    const phone = normalizePhoneNumber(data.get("phone"));
    const background = data.get("background");
    const appId = data.get("id");
    if (!appId) {
      return fail(400, { error: "수정할 신청 내역을 찾을 수 없습니다." });
    }
    if (!name || !department || !phone) {
      return fail(400, { error: "필수 정보를 모두 입력해주세요." });
    }
    try {
      await updateApplication(appId, {
        name,
        department,
        phone,
        background
      });
      return { success: true };
    } catch (e) {
      console.error(e);
      return fail(500, { error: "정보 수정에 실패했습니다. 잠시 후 다시 시도해주세요." });
    }
  }
};
export {
  actions,
  load
};
