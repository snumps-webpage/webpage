import { redirect } from "@sveltejs/kit";
import { a as getPresidentName, b as getMemberByEmail } from "../../chunks/notion.js";
import { isAdmin, getApplications } from "../../chunks/admin.js";
import { g as getSemesterInfo } from "../../chunks/utils3.js";
const load = async (event) => {
  console.log(`>>> [Layout Load] Starting for path: ${event.url.pathname}`);
  const today = /* @__PURE__ */ new Date();
  const semester = getSemesterInfo(today);
  const [session, presidentName] = await Promise.all([
    event.locals.auth(),
    getPresidentName(semester.key).catch((e) => {
      console.error("Failed to fetch president name:", e);
      return "공석";
    })
  ]);
  const isUserAdmin = session?.user?.email ? isAdmin(session.user.email) : false;
  let userMember = null;
  let userApplication = null;
  if (session?.user?.email) {
    const path = event.url.pathname;
    const isSignupPage = path.startsWith("/signup");
    const isWaitPage = path === "/wait";
    const isApi = path.startsWith("/api");
    const isAuth = path.startsWith("/auth");
    const isSignOut = path.includes("signout");
    try {
      const [member, apps] = await Promise.all([
        getMemberByEmail(session.user.email),
        getApplications()
      ]);
      userMember = member;
      userApplication = apps.find((a) => a.email === session.user?.email);
      const isAllowedPath = isSignupPage || isWaitPage || isApi || isAuth || isSignOut;
      if (!userMember && !isUserAdmin) {
        if (userApplication && !userApplication.accepted) {
          if (!isAllowedPath) {
            throw redirect(302, "/wait");
          }
        } else if (!userApplication) {
          if (!isSignupPage && !isApi && !isAuth && !isSignOut) {
            throw redirect(302, "/signup");
          }
        }
      }
    } catch (e) {
      if (e && typeof e === "object" && "status" in e && e.status === 302) throw e;
      console.error("Layout Membership Verification Error:", e);
    }
  }
  return {
    session,
    isAdmin: isUserAdmin,
    isMember: !!userMember,
    application: userApplication,
    presidentName
  };
};
export {
  load
};
