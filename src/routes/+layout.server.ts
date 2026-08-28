import { dev } from "$app/environment";
import { env } from "$env/dynamic/private";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import { getDevPublicExecutives } from "$lib/server/dev-member-fixtures";
import { hasDevPresenterEvents } from "$lib/server/dev-presenter-event-fixtures";
import type { LayoutServerLoad } from "./$types";

/**
 * Global layout data loader.
 * Leverages the membership data pre-fetched in hooks.server.ts.
 */
export const load: LayoutServerLoad = async (event) => {
  const devPreviewRole = resolveDevPreviewRole(event.url, event.cookies);
  const session =
    devPreviewRole || env.AUTH_SECRET ? await event.locals.auth() : null;

  const isUserAdmin =
    devPreviewRole === "admin" || event.locals.member?.isAdmin === true;

  return {
    session,
    isAdmin: isUserAdmin,
    isMember:
      !!event.locals.member && event.locals.member.status !== "withdrawn",
    memberStatus: event.locals.member?.status ?? null,
    hasPresenterEvents:
      dev && event.locals.member?.memberId
        ? hasDevPresenterEvents(event.locals.member.memberId)
        : false,
    application: event.locals.userApplication,

    // The AWS public loader will supply this DTO. Do not read private-info as a
    // fallback: only explicitly granted publicContact data may reach the UI.
    executives: dev ? getDevPublicExecutives() : null,
  };
};
