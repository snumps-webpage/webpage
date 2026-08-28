import { redirect, error, type ActionFailure } from "@sveltejs/kit";
import { AppError } from "./core/errors";
import { resolveMember } from "./guards/resolve-member";
import type { MemberContext } from "./guards/zone";

/** Admin truth is the member record (D4). Resolves lazily for /api handlers. */
async function resolveAdminContext(
  locals: App.Locals,
): Promise<{ session: AuthenticatedSession; member: MemberContext } | null> {
  const session = await locals.auth();
  if (!session?.user?.email) return null;
  const member =
    locals.member !== undefined ? locals.member : await resolveMember(session.user.email);
  locals.member = member;
  if (!member?.isAdmin) return null;
  return { session: session as AuthenticatedSession, member };
}

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
  const ctx = await resolveAdminContext(locals);
  if (!ctx) {
    if (options.silent) throw error(404, "Not Found");
    throw redirect(302, "/");
  }
  return ctx.session;
}

/**
 * Helper for form actions and /api handlers to verify admin status.
 */
export async function requireAdminAction(locals: App.Locals) {
  const ctx = await resolveAdminContext(locals);
  if (!ctx) {
    const { fail } = await import("@sveltejs/kit");
    return {
      allowed: false,
      response: fail(403, {
        error: "Access denied. Admin privileges required.",
      }),
    };
  }
  return { allowed: true, session: ctx.session };
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
    if (e instanceof AppError) {
      const { fail } = await import("@sveltejs/kit");
      return fail(e.status, { error: e.code });
    }
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
    if (e instanceof AppError) {
      const { fail } = await import("@sveltejs/kit");
      return fail(e.status, { error: e.code });
    }
    console.error(`[Action Error]`, e);
    const { fail } = await import("@sveltejs/kit");
    return fail(500, {
      error: (e as Error).message || "Internal server error",
    });
  }
}

/**
 * Action-level guards (API-SPEC §1-1): both re-fetch the record instead of
 * trusting anything client-supplied or cached on locals.
 */
export async function ensurePresenter(eventId: string, memberId: string) {
  const { getTable } = await import("./data/tables");
  const event = (await getTable("events")).find((e) => e.id === eventId);
  if (!event) throw new AppError("NOT_FOUND");
  if (!event.presenterIds.includes(memberId)) throw new AppError("FORBIDDEN");
  return event;
}

export async function ensureOrganizer(studyId: string, memberId: string) {
  const { getTable } = await import("./data/tables");
  const study = (await getTable("studies")).find((s) => s.id === studyId);
  if (!study) throw new AppError("NOT_FOUND");
  if (!study.organizerIds.includes(memberId)) throw new AppError("FORBIDDEN");
  return study;
}
