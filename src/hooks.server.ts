import { env } from "$env/dynamic/private";
import { building } from "$app/environment";
import { sequence } from "@sveltejs/kit/hooks";
import type { Handle } from "@sveltejs/kit";
import { handle as authHandle } from "./auth";
import {
  buildDevPreviewSession,
  resolveDevPreviewRole,
} from "$lib/server/dev-preview";
import { memberRepo } from "$lib/server/repositories/MemberRepository";
import { getApplicationByEmail } from "$lib/server/notion";
import { redirect } from "@sveltejs/kit";

if (!building && !env.AUTH_SECRET) {
  console.error("FATAL: AUTH_SECRET is not set. Authentication will fail.");
}

const devPreviewHandle: Handle = async ({ event, resolve }) => {
  const devPreviewRole = resolveDevPreviewRole(event.url, event.cookies);

  if (devPreviewRole) {
    event.locals.auth = async () => buildDevPreviewSession(devPreviewRole);
  }

  return resolve(event);
};

/**
 * Centralized guard for membership and application status.
 * Prevents redundant checks in every server load function.
 */
const membershipGuard: Handle = async ({ event, resolve }) => {
  const session = await event.locals.auth();
  const path = event.url.pathname;

  // Paths that are ALWAYS allowed (no session needed)
  const isPublic =
    path === "/" || path.startsWith("/auth") || path.startsWith("/api/cron");
  if (isPublic) return resolve(event);

  // AUTHENTICATION GUARD
  if (!session?.user?.email) {
    throw redirect(303, "/");
  }

  // Paths that are allowed for any AUTHENTICATED user
  const isAuthAllowed =
    path.startsWith("/signup") || path === "/wait" || path === "/signout";
  if (isAuthAllowed) return resolve(event);

  // MEMBERSHIP GUARD: Fetch from cache/DB
  const member = await memberRepo.findByEmail(session.user.email);
  event.locals.member = member;

  if (!member) {
    // Check if they have an application
    const app = await getApplicationByEmail(session.user.email);
    event.locals.userApplication = app;

    if (!app && path !== "/signup") {
      throw redirect(303, "/signup");
    }
    if (app && !app.accepted && path !== "/wait") {
      throw redirect(303, "/wait");
    }
  }

  return resolve(event);
};

export const handle = sequence(authHandle, devPreviewHandle, membershipGuard);

// NOTE: Event status sync is now handled by Vercel Cron via /api/cron/sync-events
