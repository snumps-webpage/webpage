import { describe, expect, it } from "vitest";
import { capabilitiesFor } from "$lib/server/core/capabilities";
import { zoneGuard } from "../hooks.server";

/**
 * W-23: the zone guard's refusals used to be thrown, and a throw skips
 * cacheShield — so a 404/403/500 left without no-store, the same family of
 * gap as the 2026-09-01 cross-user leak. The guard now returns the refusal
 * itself, headers attached, shaped the way Kit's own fatal-error path would
 * (JSON for data/JSON requests, the plain error page otherwise).
 */

const NO_STORE = {
  "cache-control": "private, no-store",
  "vercel-cdn-cache-control": "no-store",
  "cdn-cache-control": "no-store",
};

type GuardEvent = Parameters<typeof zoneGuard>[0]["event"];

function event(
  routeId: string,
  opts: {
    method?: string;
    accept?: string;
    member?: unknown;
    isDataRequest?: boolean;
    /** an enhanced form submission (use:enhance) */
    action?: boolean;
  } = {},
): GuardEvent {
  return {
    route: { id: routeId },
    url: new URL("http://localhost/x"),
    request: new Request("http://localhost/x", {
      method: opts.method ?? "GET",
      headers: {
        accept: opts.accept ?? "text/html",
        ...(opts.action ? { "x-sveltekit-action": "true" } : {}),
      },
    }),
    cookies: { get: () => undefined },
    isDataRequest: opts.isDataRequest ?? false,
    locals: {
      member: opts.member ?? null,
      auth: async () => null,
    },
  } as unknown as GuardEvent;
}

const neverResolve = (async () => {
  throw new Error("the guard must not render a refused route");
}) as unknown as Parameters<typeof zoneGuard>[0]["resolve"];

async function refuse(e: GuardEvent) {
  return zoneGuard({ event: e, resolve: neverResolve });
}

function expectNoStore(res: Response) {
  for (const [k, v] of Object.entries(NO_STORE)) {
    expect(res.headers.get(k), k).toBe(v);
  }
}

const unregistered = {
  memberId: "m1",
  privateInfoId: "p1",
  name: "회원",
  status: "regular",
  isAdmin: false,
  isAlumni: true,
  registered: false,
  capabilities: capabilitiesFor({ isAlumni: true, registered: false }),
};

describe("zone guard refusals carry no-store", () => {
  it("404 for a non-admin in the admin zone — html page", async () => {
    const res = await refuse(event("/(admin)/admin"));
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
    expectNoStore(res);
  });

  it("404 as JSON for a data request", async () => {
    const res = await refuse(event("/(admin)/admin", { isDataRequest: true }));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ message: "Not Found" });
    expectNoStore(res);
  });

  it("403 when a member POSTs without the route's capability", async () => {
    const res = await refuse(
      event("/(member)/study/apply", {
        method: "POST",
        accept: "application/json",
        member: unregistered,
      }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      message: "이번 학기 등록 회원만 할 수 있는 작업입니다.",
    });
    expectNoStore(res);
  });

  it("500 for a route outside every zone", async () => {
    const res = await refuse(event("/outside"));
    expect(res.status).toBe(500);
    expectNoStore(res);
  });
});

/**
 * An enhanced form (use:enhance) parses the response as a Kit ActionResult.
 * The guard's bare 303 was followed to an HTML page the client could not
 * parse (SyntaxError → the 500 error page), and `{message}` without a `type`
 * did nothing at all (audit LD01-1, reproduced). For action requests the
 * guard now answers the way Kit's own action handler does.
 */
describe("zone guard and enhanced form submissions", () => {
  it("answers a guest's enhanced POST with a redirect ActionResult", async () => {
    const res = await refuse(
      event("/(member)/study/apply", {
        method: "POST",
        accept: "application/json",
        action: true,
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      type: "redirect",
      status: 303,
      location: expect.stringMatching(/^\/login/),
    });
    expectNoStore(res);
  });

  it("answers a refused enhanced POST with an error ActionResult and its status", async () => {
    const res = await refuse(
      event("/(member)/study/apply", {
        method: "POST",
        accept: "application/json",
        action: true,
        member: unregistered,
      }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      type: "error",
      error: { message: "이번 학기 등록 회원만 할 수 있는 작업입니다." },
    });
    expectNoStore(res);
  });

  it("keeps the plain 303 for a form posted without JavaScript", async () => {
    const res = await refuse(
      event("/(member)/study/apply", { method: "POST" }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/^\/login/);
  });
});
