import { describe, expect, it } from "vitest";
import { API_ERROR_CODES } from "$lib/domain/api";
import { AppError, ERR } from "./errors";

/**
 * The status a code carries is a contract, not a detail: it reaches operators
 * through HTTP, monitoring through 4xx/5xx rates, and clients through the REST
 * envelope. Two decisions are pinned here.
 *
 * C-21 — WRITE_CONFLICT is 409, not 503. Exhausting the CAS retries means the
 * request lost a race with another user, not that the service is unavailable;
 * as a 5xx it billed user contention as server failure, in a project that also
 * reads 5xx as its cron alarm.
 *
 * C-19 — a missing session is 401, distinct from 403 for an authenticated
 * caller who still may not.
 */

describe("AppError status contract", () => {
  it("gives a write conflict 409", () => {
    expect(new AppError("WRITE_CONFLICT").status).toBe(409);
  });

  it("gives a missing session 401 under its own code", () => {
    expect(new AppError("UNAUTHORIZED").status).toBe(401);
  });

  it("can express an unavailable data layer", () => {
    expect(new AppError("SERVICE_UNAVAILABLE").status).toBe(503);
  });

  it("keeps every code inside the client-facing enum", () => {
    const unknown = Object.keys(ERR).filter(
      (code) => !(API_ERROR_CODES as readonly string[]).includes(code),
    );
    expect(unknown).toEqual([]);
  });
});
