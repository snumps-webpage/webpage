import { env } from "$env/dynamic/private";
import { building } from "$app/environment";
import { sequence } from "@sveltejs/kit/hooks";
import { error, redirect, type Handle } from "@sveltejs/kit";
import { handle as authHandle } from "./auth";
import {
  buildDevPreviewSession,
  resolveDevPreviewRole,
} from "$lib/server/dev-preview";
import { decide, needsMemberResolution, zoneOf } from "$lib/server/guards/zone";
import { hasApplication, resolveMember } from "$lib/server/guards/resolve-member";

if (!building && !env.AUTH_SECRET) {
  console.error("FATAL: AUTH_SECRET is not set. Authentication will fail.");
}

const devPreviewHandle: Handle = async ({ event, resolve }) => {
  const devPreviewRole = resolveDevPreviewRole(event.url, event.cookies);

  if (devPreviewRole) {
    event.locals.auth = async () => buildDevPreviewSession(devPreviewRole);
    // Preview roles bypass data-layer resolution entirely.
    event.locals.member = {
      memberId: "dev-preview",
      privateInfoId: "dev-preview",
      name: "Dev Preview",
      status: "regular",
      isAdmin: devPreviewRole === "admin",
    };
  }

  return resolve(event);
};

/**
 * Zone guard (IMPLEMENTATION-SPEC BE-20): the route group IS the access zone.
 * Pure decisions live in guards/zone.ts; this handle only gathers context.
 */
const zoneGuard: Handle = async ({ event, resolve }) => {
  const routeId = event.route.id;

  // Unmatched URL — let SvelteKit render its 404, never a 500.
  if (routeId === null) return resolve(event);

  const zone = zoneOf(routeId);

  // Public fast path: no session work for ANONYMOUS visitors (prerender/ISR
  // safety). A session cookie means a logged-in user is browsing the public
  // zone — resolve them anyway, or the global nav treats them as a guest.
  const hasSessionCookie =
    event.cookies.get("__Secure-authjs.session-token") !== undefined ||
    event.cookies.get("authjs.session-token") !== undefined;
  if (
    zone === "api" ||
    (zone === "(public)" && !needsMemberResolution(routeId) && !hasSessionCookie)
  ) {
    return resolve(event);
  }

  const session = event.locals.member === undefined ? await event.locals.auth() : null;
  const email = session?.user?.email ?? null;

  if (event.locals.member === undefined) {
    event.locals.member = email ? await resolveMember(email) : null;
  }

  const member = event.locals.member;
  const hasSession = member !== null || !!email;
  const application =
    !member && email && zone !== "(public)" ? await hasApplication(email) : false;

  const decision = decide(routeId, {
    hasSession,
    member,
    hasApplication: application,
    pathname: event.url.pathname,
  });

  switch (decision.type) {
    case "allow":
      return resolve(event);
    case "redirect":
      throw redirect(303, decision.location);
    case "notFound":
      throw error(404, "Not Found");
    case "misconfigured":
      // A page outside every zone means the guard cannot protect it — fail closed.
      throw error(500, "route without zone");
  }
};

export const handle = sequence(authHandle, devPreviewHandle, zoneGuard);
