import { redirect, error, type ActionFailure } from "@sveltejs/kit";
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
export async function ensureSession(
  locals: App.Locals,
  url?: URL,
): Promise<AuthenticatedSession> {
  const session = await locals.auth();
  if (!session?.user?.email || !session.user.name) {
    const loginPath = url
      ? `/login?redirect=${encodeURIComponent(url.pathname)}`
      : "/login";
    throw redirect(302, loginPath);
  }
  return session as AuthenticatedSession;
}

/**
 * Ensures the user is an admin.
 * Throws 404 if not (Security by Obscurity).
 */
export async function ensureAdmin(
  locals: App.Locals,
  options: { silent?: boolean } = {},
): Promise<AuthenticatedSession> {
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
      response: fail(403, {
        error: "Access denied. Admin privileges required.",
      }),
    };
  }
  return { allowed: true, session: session as AuthenticatedSession };
}

/**
 * Standard wrapper for user actions.
 */
export async function handleUserAction<T extends Record<string, unknown>>(
  locals: App.Locals,
  logic: (
    session: AuthenticatedSession,
  ) => Promise<T | void | ActionFailure<Record<string, unknown>>>,
  options: { invalidate?: string | string[] } = {},
): Promise<
  | ActionFailure<{ error: string }>
  | ActionFailure<Record<string, unknown>>
  | (T & { success: true })
  | { success: true }
> {
  let session;
  try {
    session = await ensureSession(locals);
  } catch (e) {
    const { fail } = await import("@sveltejs/kit");
    return fail(401, {
      error: (e as Error).message || "Authentication required",
    });
  }

  try {
    const result = await logic(session);

    if (
      result &&
      typeof result === "object" &&
      "status" in result &&
      typeof result.status === "number" &&
      result.status >= 400
    ) {
      return result as ActionFailure<Record<string, unknown>>;
    }

    if (options.invalidate) {
      const { invalidateCache } = await import("./cache");
      const keys = Array.isArray(options.invalidate)
        ? options.invalidate
        : [options.invalidate];
      keys.forEach((key) => invalidateCache(key));
    }

    if (result && typeof result === "object") {
      return { success: true, ...(result as T) };
    }

    return { success: true };
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "status" in e &&
      (e as { status: number }).status >= 300 &&
      (e as { status: number }).status < 400
    )
      throw e;
    console.error(`[Action Error]`, e);
    const { fail } = await import("@sveltejs/kit");
    return fail(500, { error: (e as Error).message || "Action failed" });
  }
}

/**
 * Standard wrapper for admin actions.
 */
export async function handleAdminAction<T extends Record<string, unknown>>(
  locals: App.Locals,
  logic: (
    session: AuthenticatedSession,
  ) => Promise<T | void | ActionFailure<Record<string, unknown>>>,
  options: { successMessage?: string; invalidate?: string | string[] } = {},
): Promise<
  | ActionFailure<{ error: string }>
  | ActionFailure<Record<string, unknown>>
  | (T & { success: true })
  | { success: true }
> {
  const { allowed, response, session } = await requireAdminAction(locals);
  if (!allowed || !session) return response!;

  try {
    const result = await logic(session);

    if (
      result &&
      typeof result === "object" &&
      "status" in result &&
      typeof result.status === "number" &&
      result.status >= 400
    ) {
      return result as ActionFailure<Record<string, unknown>>;
    }

    if (options.invalidate) {
      const { invalidateCache } = await import("./cache");
      const keys = Array.isArray(options.invalidate)
        ? options.invalidate
        : [options.invalidate];
      keys.forEach((key) => invalidateCache(key));
    }

    if (result && typeof result === "object") {
      return { success: true, ...(result as T) };
    }
    return { success: true };
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "status" in e &&
      (e as { status: number }).status >= 300 &&
      (e as { status: number }).status < 400
    )
      throw e;
    console.error(`[Action Error]`, e);
    const { fail } = await import("@sveltejs/kit");
    return fail(500, {
      error: (e as Error).message || "Internal server error",
    });
  }
}
