import {
  redirect,
  error,
  fail,
  isRedirect,
  isHttpError,
  isActionFailure,
  type ActionFailure,
} from "@sveltejs/kit";
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
 * Ensures the user is an admin, for use in `load`.
 *
 * Answers 404 by default so that an admin-only path is indistinguishable from a
 * path that does not exist. Pass `{ onDenied: "redirect" }` only where the
 * existence of the route is already public knowledge.
 *
 * This is the ONLY admin gate for `load` functions. Do not re-implement
 * `isAdmin(...)` checks inline — see `docs/code-audit` AD-2.
 */
export async function ensureAdmin(
  locals: App.Locals,
  options: { onDenied?: "notFound" | "redirect" } = {},
): Promise<AuthenticatedSession> {
  const session = await locals.auth();

  if (!session?.user?.email || !checkIsAdmin(session.user.email)) {
    if (options.onDenied === "redirect") throw redirect(302, "/");
    throw error(404, "Not Found");
  }

  return session as AuthenticatedSession;
}

/**
 * Helper for form actions to verify admin status.
 */
export type AdminCheck =
  | { allowed: true; session: AuthenticatedSession; response?: undefined }
  | {
      allowed: false;
      session?: undefined;
      response: ActionFailure<{ error: string }>;
    };

export async function requireAdminAction(
  locals: App.Locals,
): Promise<AdminCheck> {
  const session = await locals.auth();
  if (!session?.user?.email || !checkIsAdmin(session.user.email)) {
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
    if (isRedirect(e)) throw e;
    console.error(`[Action Auth Error]`, e);
    return fail(401, { error: "Authentication required" });
  }

  try {
    const result = await logic(session);

    if (isActionFailure(result)) {
      // `isActionFailure` narrows to ActionFailure<undefined>; the failure built
      // by `logic` carries its own data shape, which we pass through untouched.
      return result as unknown as ActionFailure<Record<string, unknown>>;
    }

    if (options.invalidate) {
      const { invalidateCache } = await import("./cache");
      const keys = Array.isArray(options.invalidate)
        ? options.invalidate
        : [options.invalidate];
      await Promise.all(keys.map((key) => invalidateCache(key)));
    }

    if (result && typeof result === "object") {
      return { success: true, ...(result as T) };
    }

    return { success: true };
  } catch (e) {
    // Control-flow throws must not be flattened into a 500.
    if (isRedirect(e)) throw e;
    if (isHttpError(e)) {
      // Preserve the status a deliberate `error(4xx)` chose, instead of
      // flattening every thrown control-flow error into a 500.
      return fail(e.status, { error: e.body.message });
    }
    console.error(`[Action Error]`, e);
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
  const check = await requireAdminAction(locals);
  if (!check.allowed) return check.response;
  const session = check.session;

  try {
    const result = await logic(session);

    if (isActionFailure(result)) {
      // `isActionFailure` narrows to ActionFailure<undefined>; the failure built
      // by `logic` carries its own data shape, which we pass through untouched.
      return result as unknown as ActionFailure<Record<string, unknown>>;
    }

    if (options.invalidate) {
      const { invalidateCache } = await import("./cache");
      const keys = Array.isArray(options.invalidate)
        ? options.invalidate
        : [options.invalidate];
      await Promise.all(keys.map((key) => invalidateCache(key)));
    }

    if (result && typeof result === "object") {
      return { success: true, ...(result as T) };
    }
    return { success: true };
  } catch (e) {
    // Control-flow throws must not be flattened into a 500.
    if (isRedirect(e)) throw e;
    if (isHttpError(e)) {
      // Preserve the status a deliberate `error(4xx)` chose, instead of
      // flattening every thrown control-flow error into a 500.
      return fail(e.status, { error: e.body.message });
    }
    console.error(`[Action Error]`, e);
    return fail(500, { error: (e as Error).message || "Internal server error" });
  }
}
