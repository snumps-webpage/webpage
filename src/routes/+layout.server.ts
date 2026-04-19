import { redirect } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { getMemberByEmail, getLatestExecutives } from "$lib/server/notion";
import { isAdmin } from "$lib/server/admin";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async (event) => {
  console.log(`>>> [Layout Load] Starting for path: ${event.url.pathname}`);
  const devPreviewRole = resolveDevPreviewRole(event.url, event.cookies);

  let session = null;
  try {
    session = await event.locals.auth();
  } catch (error) {
    console.error("[Layout Load] Failed to resolve auth session:", error);
  }

  const executives = await getLatestExecutives().catch((e) => {
    console.error("Failed to fetch latest executives:", e);
    return {
      president: { name: "공석", phone: "" },
      vicePresident: { name: "공석", phone: "" },
    };
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
      executives,
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
      // OPTIMIZATION: Use getApplicationByEmail instead of getApplications to avoid fetching ALL applications.
      // Memoize results in locals for other load functions in the same request.
      const [member, app] = await Promise.all([
        getMemberByEmail(session.user.email),
        import("$lib/server/admin").then((m) =>
          m.getApplicationByEmail(session.user!.email!),
        ),
      ]);

      event.locals.member = member;
      event.locals.userApplication = app;

      userMember = member;
      userApplication = app;

      const isAllowedPath =
        isSignupPage || isWaitPage || isApi || isAuth || isSignOut;

      if (!userMember && !isUserAdmin) {
        if (userApplication && !userApplication.accepted) {
          // Pending state: only allow /wait, /signup (edit), and auth/api

          if (!isAllowedPath) {
            throw redirect(302, "/wait");
          }
        } else if (!userApplication) {
          // New user state: only allow /signup and auth/api

          if (!isSignupPage && !isApi && !isAuth && !isSignOut) {
            throw redirect(302, "/signup");
          }
        }
      }
    } catch (e) {
      if (e && typeof e === "object" && "status" in e && e.status === 302)
        throw e;

      console.error("Layout Membership Verification Error:", e);
    }
  }

  return {
    session,

    isAdmin: isUserAdmin,

    isMember: !!userMember,

    application: userApplication,

    /**
     * Executives are often requested in the footer.
     * We return this as a promise so SvelteKit can stream the shell immediately.
     */
    executives: getLatestExecutives(),
  };
};
