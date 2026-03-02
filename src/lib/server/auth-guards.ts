import { redirect, error } from "@sveltejs/kit";
import { isAdmin as checkIsAdmin } from "./admin";

export interface AuthenticatedSession {
  user: {
    name: string;
    email: string;
    image?: string;
  };
  expires: string;
}

/**
 * Ensures a valid session exists, otherwise redirects to login.
 */
export async function ensureSession(locals: App.Locals, url?: URL): Promise<AuthenticatedSession> {
  const session = await locals.auth();
  if (!session?.user?.email || !session.user.name) {
    const loginPath = url ? `/login?redirect=${encodeURIComponent(url.pathname)}` : "/login";
    throw redirect(302, loginPath);
  }
  return session as AuthenticatedSession;
}

/**
 * Ensures the user is an admin. 
 * Throws 404 if not (Security by Obscurity).
 */
export async function ensureAdmin(locals: App.Locals, options: { silent?: boolean } = {}): Promise<AuthenticatedSession> {
  const session = await locals.auth();
  const isAdmin = checkIsAdmin(session?.user?.email);

  if (!session?.user?.email || !isAdmin) {
    if (options.silent) throw error(404, "Not Found");
    throw redirect(302, "/");
  }

  return session as AuthenticatedSession;
}

/**
 * Helper for form actions to verify admin status.
 */
export async function requireAdminAction(locals: App.Locals) {
  const session = await locals.auth();
  if (!session?.user?.email || !checkIsAdmin(session.user.email)) {
    const { fail } = await import("@sveltejs/kit");
    return {
      allowed: false,
      response: fail(403, { error: "Access denied. Admin privileges required." }),
    };
  }
  return { allowed: true, session: session as AuthenticatedSession };
}

/**
 * Standard wrapper for user actions.
 */
export async function handleUserAction(
  locals: App.Locals,
  logic: (session: AuthenticatedSession) => Promise<any>,
  options: { invalidate?: string | string[] } = {}
) {
  let session;
  try {
    session = await ensureSession(locals);
  } catch (e) {
    const { fail } = await import("@sveltejs/kit");
    return fail(401, { error: "Authentication required" });
  }

  try {
    const result = await logic(session);
    
    if (options.invalidate) {
      const { invalidateCache } = await import("./cache");
      const keys = Array.isArray(options.invalidate) ? options.invalidate : [options.invalidate];
      keys.forEach(key => invalidateCache(key));
    }

    return { success: true, ...result };
  } catch (e) {
    if (e && typeof e === "object" && "status" in e && (e as any).status >= 300 && (e as any).status < 400) throw e;
    console.error(`[Action Error]`, e);
    const { fail } = await import("@sveltejs/kit");
    return fail(500, { error: (e as Error).message || "Action failed" });
  }
}

/**
 * Standard wrapper for admin actions.
 */
export async function handleAdminAction(
  locals: App.Locals,
  logic: (session: AuthenticatedSession) => Promise<any>,
  options: { successMessage?: string; invalidate?: string | string[] } = {}
) {
  const { allowed, response, session } = await requireAdminAction(locals);
  if (!allowed || !session) return response;

  try {
    const result = await logic(session);
    
    if (options.invalidate) {
      const { invalidateCache } = await import("./cache");
      const keys = Array.isArray(options.invalidate) ? options.invalidate : [options.invalidate];
      keys.forEach(key => invalidateCache(key));
    }

    return { success: true, ...result };
  } catch (e) {
    if (e && typeof e === "object" && "status" in e && (e as any).status >= 300 && (e as any).status < 400) throw e;
    console.error(`[Action Error]`, e);
    const { fail } = await import("@sveltejs/kit");
    return fail(500, { error: (e as Error).message || "Internal server error" });
  }
}

