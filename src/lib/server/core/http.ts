import { env } from "$env/dynamic/private";
import { error, isHttpError, isRedirect, json } from "@sveltejs/kit";
import { resolveAdminAccess } from "$lib/server/auth-guards";
import { AppError, type ErrCode } from "./errors";

/**
 * Load-side counterpart of runAction's AppError → fail() step (W-22).
 *
 * AppError is not SvelteKit's HttpError, and only HttpError carries a status
 * out of a load — everything else becomes 500. Actions have runAction to do the
 * conversion; loads had nothing, so a guard's NOT_FOUND surfaced as "Internal
 * Error" while the sibling route that used `throw error(404)` answered 404.
 *
 * Redirects and existing HttpErrors pass through untouched.
 */
export function toHttpError(e: unknown): never {
  if (isRedirect(e) || isHttpError(e)) throw e;
  if (e instanceof AppError) throw error(e.status, e.code);
  throw e;
}

/** Runs a load step, translating AppError into the status it already carries. */
export async function httpGuard<T>(step: () => Promise<T>): Promise<T> {
  try {
    return await step();
  } catch (e) {
    toHttpError(e);
  }
}

/** REST error body — always `{ error: <code> }`, the shape the client parses. */
export function restError(code: ErrCode, status?: number): Response {
  return json({ error: code }, { status: status ?? new AppError(code).status });
}

/**
 * Admin gate for /api handlers (C-19). Returns null when the caller may pass.
 *
 * 401 for no session, 404 for a signed-in non-admin — the page zone already
 * hides the admin tree behind a 404, and answering 403 there would confirm the
 * route exists to anyone logged in.
 */
export async function requireAdminRest(
  locals: App.Locals,
): Promise<Response | null> {
  const access = await resolveAdminAccess(locals);
  if (access === "ok") return null;
  return access === "unauthenticated"
    ? restError("UNAUTHORIZED")
    : restError("NOT_FOUND", 404);
}

/**
 * Bearer gate for the cron and health endpoints (C-20, closing CS-4).
 *
 * One answer for "no secret configured" and "wrong secret": 401. Splitting them
 * (501 vs 401) told an anonymous caller whether the deployment has a secret at
 * all. Fail-closed is unchanged — with no secret nothing can authenticate, so
 * the job fails loudly and the dead-man's switch notices.
 */
export function requireCronAuth(request: Request): Response | null {
  const secret = env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`)
    return restError("UNAUTHORIZED");
  return null;
}
