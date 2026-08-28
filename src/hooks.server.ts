import { env } from "$env/dynamic/private";
import { building } from "$app/environment";
import { sequence } from "@sveltejs/kit/hooks";
import { error, redirect } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit";
import { handle as authHandle } from "./auth";
import {
  buildDevPreviewSession,
  resolveDevPreviewRole,
} from "$lib/server/dev-preview";
import { shouldBypassMembershipGuard } from "$lib/server/route-policy";
import { getDevAccountSettings } from "$lib/server/dev-member-fixtures";

if (!building && !env.AUTH_SECRET) {
  console.error("FATAL: AUTH_SECRET is not set. Authentication will fail.");
}

const devPreviewHandle: Handle = async ({ event, resolve }) => {
  const devPreviewRole = resolveDevPreviewRole(event.url, event.cookies);

  if (devPreviewRole) {
    const account = getDevAccountSettings(devPreviewRole);
    event.locals.auth = async () => buildDevPreviewSession(devPreviewRole);
    event.locals.member = {
      memberId: account?.memberId ?? `dev-${devPreviewRole}`,
      privateInfoId: `${account?.memberId ?? `dev-${devPreviewRole}`}-private`,
      status: account?.status,
      isAdmin: devPreviewRole === "admin",
    };
    event.locals.userApplication = null;
  }

  return resolve(event);
};

/**
 * Centralized guard for membership and application status.
 * Prevents redundant checks in every server load function.
 */
const membershipGuard: Handle = async ({ event, resolve }) => {
  const path = event.url.pathname;

  // Public pages bypass membership checks; API handlers perform their own auth.
  const bypassMembershipGuard = shouldBypassMembershipGuard(path);

  if (event.locals.member?.status === "withdrawn") {
    if (path === "/withdraw/pending") return resolve(event);
    if (path === "/" || !bypassMembershipGuard)
      throw redirect(303, "/withdraw/pending");
    return resolve(event);
  }

  if (event.locals.member) return resolve(event);

  if (bypassMembershipGuard) return resolve(event);

  const redirectTo = `${event.url.pathname}${event.url.search}`;
  if (!env.AUTH_SECRET) {
    throw redirect(303, `/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  const session = await event.locals.auth();

  // AUTHENTICATION GUARD
  if (!session?.user?.email) {
    throw redirect(303, `/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  // Paths that are allowed for any AUTHENTICATED user
  const isAuthAllowed =
    path.startsWith("/signup") || path === "/wait" || path === "/signout";
  if (isAuthAllowed) return resolve(event);

  // The AWS auth/backend integration must hydrate member/application locals.
  // Never fall back to the retired Notion data source.
  throw error(503, "새 회원 인증 API 연결이 필요합니다.");
};

export const handle = sequence(authHandle, devPreviewHandle, membershipGuard);
