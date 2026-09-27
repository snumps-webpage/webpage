/**
 * Error codes shared by every action and endpoint (API-SPEC §1-2).
 * Action wrappers convert AppError into fail(status, { error: code });
 * clients own the Korean message mapping.
 */

export const ERR = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  /** No usable session. Distinct from FORBIDDEN: authenticating again helps. */
  UNAUTHORIZED: "UNAUTHORIZED",
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  CONFLICT: "CONFLICT",
  WRITE_CONFLICT: "WRITE_CONFLICT",
  EVENT_NOT_OPEN: "EVENT_NOT_OPEN",
  STUDY_NOT_RECRUITING: "STUDY_NOT_RECRUITING",
  /** The data layer could not answer. Retryable — never a bare 500. */
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
} as const;

export type ErrCode = keyof typeof ERR;

const DEFAULT_STATUS: Record<ErrCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  CONFLICT: 409,
  // C-21: losing a CAS race is a conflict with the resource's current state,
  // not the service being unavailable. As a 5xx it billed user contention as
  // server failure — and 5xx is this project's cron alarm axis.
  WRITE_CONFLICT: 409,
  EVENT_NOT_OPEN: 409,
  STUDY_NOT_RECRUITING: 409,
  SERVICE_UNAVAILABLE: 503,
};

export class AppError extends Error {
  readonly code: ErrCode;
  readonly status: number;
  /** Optional human-facing Korean detail; the CODE stays the contract (§1-2). */
  readonly userMessage?: string;

  constructor(code: ErrCode, opts?: { status?: number; userMessage?: string }) {
    super(code);
    this.name = "AppError";
    this.code = code;
    this.status = opts?.status ?? DEFAULT_STATUS[code];
    this.userMessage = opts?.userMessage;
  }
}

/** Strips explicitly-undefined keys so `{...row, ...patch}` can never delete
 *  a stored field through JSON serialization (review C1). */
export function definedOnly<T extends Record<string, unknown>>(
  patch: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
