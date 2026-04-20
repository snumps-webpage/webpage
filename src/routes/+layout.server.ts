import { isAdmin } from "$lib/server/admin";
import { getLatestExecutives } from "$lib/server/notion";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import type { LayoutServerLoad } from "./$types";

/**
 * Global layout data loader.
 * Leverages the membership data pre-fetched in hooks.server.ts.
 */
export const load: LayoutServerLoad = async (event) => {
  const session = await event.locals.auth();
  const devPreviewRole = resolveDevPreviewRole(event.url, event.cookies);

  const isUserAdmin =
    devPreviewRole === "admin" ||
    (session?.user?.email ? isAdmin(session.user.email) : false);

  return {
    session,
    isAdmin: isUserAdmin,
    isMember: !!event.locals.member,
    application: event.locals.userApplication,

    /**
     * Executives are often requested in the footer.
     * We return this as a promise so SvelteKit can stream the shell immediately.
     */
    executives: getLatestExecutives(),
  };
};
