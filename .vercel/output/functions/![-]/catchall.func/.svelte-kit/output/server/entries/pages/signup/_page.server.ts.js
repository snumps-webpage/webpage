import { f as fail, r as redirect } from "../../../chunks/index.js";
import { b as getMemberByEmail } from "../../../chunks/notion.js";
import { getApplications, isAdmin } from "../../../chunks/admin.js";
import { n as normalizePhoneNumber } from "../../../chunks/utils3.js";
const load = async (event) => {
  const session = await event.locals.auth();
  if (!session?.user?.email) {
    throw redirect(302, "/");
  }
  const [member, apps] = await Promise.all([
    getMemberByEmail(session.user.email),
    getApplications()
  ]);
  const isUserAdmin = isAdmin(session.user.email);
  if (member && !isUserAdmin) {
    throw redirect(302, "/");
  }
  const pending = apps.find((a) => a.email === session.user?.email);
  if (pending && !isUserAdmin) {
    throw redirect(302, "/signup/edit");
  }
  return {
    user: session.user,
    pending: !!pending
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
    const agreement = data.get("agreement");
    if (!agreement) {
      return fail(400, { error: "개인정보 수집 및 이용에 동의해야 합니다." });
    }
    if (!name || !department || !phone) {
      return fail(400, { error: "필수 정보를 모두 입력해주세요." });
    }
    const { addApplication } = await import("../../../chunks/admin.js");
    try {
      await addApplication({
        email: session.user.email,
        name,
        department,
        phone,
        background
      });
      return { success: true };
    } catch (e) {
      console.error(e);
      return fail(500, { error: "신청 처리에 실패했습니다. 잠시 후 다시 시도해주세요." });
    }
  }
};
export {
  actions,
  load
};
