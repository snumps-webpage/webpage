import { error, isHttpError, isRedirect } from "@sveltejs/kit";
import { AppError } from "./errors";

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
