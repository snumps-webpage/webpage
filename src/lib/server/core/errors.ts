/**
 * Error codes shared by every action and endpoint (API-SPEC §1-2).
 * Action wrappers convert AppError into fail(status, { error: code });
 * clients own the Korean message mapping.
 */

export const ERR = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  CONFLICT: "CONFLICT",
  WRITE_CONFLICT: "WRITE_CONFLICT",
  EVENT_NOT_OPEN: "EVENT_NOT_OPEN",
  STUDY_NOT_RECRUITING: "STUDY_NOT_RECRUITING",
} as const;

export type ErrCode = keyof typeof ERR;

const DEFAULT_STATUS: Record<ErrCode, number> = {
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  CONFLICT: 409,
  WRITE_CONFLICT: 503,
  EVENT_NOT_OPEN: 409,
  STUDY_NOT_RECRUITING: 409,
};

export class AppError extends Error {
  readonly code: ErrCode;
  readonly status: number;

  constructor(code: ErrCode, status?: number) {
    super(code);
    this.name = "AppError";
    this.code = code;
    this.status = status ?? DEFAULT_STATUS[code];
  }
}
