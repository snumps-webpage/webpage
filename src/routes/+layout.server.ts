/** --- ROOT DATA ORCHESTRATION --- 
 * Global gatekeeper for authentication and membership status.
 * Reconciles Auth.js sessions with Notion membership records to enforce routing boundaries.
 */
import { redirect } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { getMemberByEmail, getPresidentName } from "$lib/server/notion";
import { isAdmin, getApplications, type Application } from "$lib/server/admin";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async (event) => {
  const devPreviewRole = resolveDevPreviewRole(event.url, event.cookies);

  let session = null;
  try {
    session = await event.locals.auth();
  } catch (error) {
    console.error("[Layout Load] Failed to resolve auth session:", error);
  }

  const presidentName = await getPresidentName().catch((e) => {
    console.error("[Layout Load] Failed to fetch president name:", e);
    return "공석";
  });

  const isUserAdmin =
    devPreviewRole === "admin" ||
    (session?.user?.email ? isAdmin(session.user.email) : false);

  if (dev && devPreviewRole && session?.user?.email) {
    return {
      session,
      isAdmin: isUserAdmin,
      isMember: true,
      application: null,
      presidentName,
    };
  }

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
        getApplications(),
      ]);

      userMember = member;
      userApplication = apps.find(
        (a: Application) => a.email === session.user?.email,
      );

      /** 
       * [Boundary: Access Control] 
       * Forces non-members/pending applicants into specialized signup or wait-states. 
       */
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
      if (e && typeof e === "object" && "status" in e && e.status === 302)
        throw e;
      console.error("[Layout Load] Membership Verification Error:", e);
    }
  }

  return {
    session,
    isAdmin: isUserAdmin,
    isMember: !!userMember,
    application: userApplication,
    presidentName,
  };
};
