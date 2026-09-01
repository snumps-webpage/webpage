import { isAdmin } from "$lib/server/admin";
import { getLatestExecutives } from "$lib/server/notion";
import type { LayoutServerLoad } from "./$types";

/**
 * Global layout data loader.
 * Leverages the membership data pre-fetched in hooks.server.ts.
 */
export const load: LayoutServerLoad = async (event) => {
  const session = await event.locals.auth();

  // Single derivation. `isAdmin` already covers the dev-preview admin, because
  // `devPreviewHandle` installs a session whose email is DEV_PREVIEW_ADMIN_EMAIL.
  // Do not add a second condition here — see `docs/code-audit` AD-16.
  const isUserAdmin = isAdmin(session?.user?.email);

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
