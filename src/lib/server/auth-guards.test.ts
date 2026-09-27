import { afterEach, describe, expect, it, vi } from "vitest";
import { error, fail, isRedirect, redirect } from "@sveltejs/kit";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import {
  ensureSession,
  handleUserAction,
  resolveAdminAccess,
} from "./auth-guards";

function localsWith(
  session: unknown,
  member: App.Locals["member"] = null,
): App.Locals {
  return { member, auth: vi.fn(async () => session) } as unknown as App.Locals;
}

const NAMELESS = { user: { email: "a@snu.ac.kr", name: null }, expires: "" };
const SIGNED_IN = {
  user: { email: "a@snu.ac.kr", name: "홍길동 / 학부생 / 수리과학부" },
  expires: "",
};

afterEach(() => {
  vi.restoreAllMocks();
});

// LB02-1: ensureSession also demanded a name, which the zone guard and /login
// do not — a signed-in account without one was sent to /login, bounced back,
// and looped. "Signed in" is one predicate: an email.
describe("a session without a name (LB02-1)", () => {
  it("passes ensureSession, with the name as an empty string", async () => {
    const session = await ensureSession(localsWith(NAMELESS));
    expect(session.user).toMatchObject({ email: "a@snu.ac.kr", name: "" });
  });

  it("runs a user action instead of answering 401", async () => {
    const result = await handleUserAction(localsWith(NAMELESS), async () => ({
      ran: true,
    }));
    expect(result).toEqual({ success: true, ran: true });
  });

  it("still redirects a session without an email to login", async () => {
    const e = await ensureSession(
      localsWith({ user: { name: "x" }, expires: "" }),
    ).catch((err) => err);
    expect(isRedirect(e)).toBe(true);
  });
});

// LB02-1 (aside): resolveAdminAccess asked Auth.js for the session twice.
it("resolveAdminAccess reads the session once", async () => {
  const locals = localsWith(SIGNED_IN);
  expect(await resolveAdminAccess(locals)).toBe("not-admin");
  expect(locals.auth).toHaveBeenCalledTimes(1);
});

// LB02-2: runAction guessed failures from a numeric `status`, sent a thrown
// error's raw text to the browser as the error code, turned a Kit HttpError
// into 500, and handleUserAction reported an auth outage as "not signed in".
describe("runAction classifies with Kit's own predicates (LB02-2)", () => {
  const run = (logic: () => Promise<unknown>) =>
    handleUserAction(localsWith(SIGNED_IN), logic as never);

  it("answers an unexpected throw with a fixed code, the raw text only logged", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await run(async () => {
      throw new Error("table envelope validation failed: secret detail");
    });
    expect(result).toMatchObject({
      status: 500,
      data: { error: "SERVICE_UNAVAILABLE" },
    });
    expect(JSON.stringify(result)).not.toContain("secret detail");
    expect(log).toHaveBeenCalled();
  });

  it("turns a thrown HttpError into a failure with its status", async () => {
    const result = await run(async () => {
      error(404, "Not Found");
    });
    expect(result).toMatchObject({ status: 404, data: { error: "NOT_FOUND" } });
  });

  it("passes an ActionFailure through", async () => {
    const result = await run(async () => fail(409, { error: "CONFLICT" }));
    expect(result).toMatchObject({ status: 409, data: { error: "CONFLICT" } });
  });

  it("does not mistake a result with a numeric status for a failure", async () => {
    const result = await run(async () => ({ status: 404 }));
    expect(result).toEqual({ success: true, status: 404 });
  });

  it("rethrows a redirect", async () => {
    const e = await run(async () => {
      redirect(303, "/done");
    }).catch((err) => err);
    expect(isRedirect(e)).toBe(true);
  });

  it("lets an auth backend failure surface instead of answering 401", async () => {
    const locals = {
      member: null,
      auth: async () => {
        throw new Error("auth backend down");
      },
    } as unknown as App.Locals;
    await expect(handleUserAction(locals, async () => ({}))).rejects.toThrow(
      "auth backend down",
    );
  });
});
