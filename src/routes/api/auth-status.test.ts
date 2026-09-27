import { describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { GET as applications } from "./admin/applications/+server";
import { GET as seminarRequests } from "./admin/seminar-requests/+server";
import { GET as studyRequests } from "./admin/study-requests/+server";
import { GET as syncEvents } from "./cron/sync-events/+server";
import { GET as maintenance } from "./cron/maintenance/+server";
import { GET as health } from "./health/+server";

/**
 * C-19 — the admin queues answered 403 to everyone, so an expired session was
 * indistinguishable from a member who is not an admin. A 30-second poller can
 * act on that difference: 401 means log in again, 404 means the route is not
 * yours to know about (the page zone already hides it that way).
 *
 * C-20 — the cron endpoints answered 501 when CRON_SECRET was unset and 401
 * when it merely did not match, which told an anonymous caller whether the
 * secret is configured (CS-4). Both are now 401: the caller learns only that
 * it did not authenticate.
 */

const adminQueues = [
  ["applications", applications],
  ["seminar-requests", seminarRequests],
  ["study-requests", studyRequests],
] as const;

const cronRoutes = [
  ["sync-events", syncEvents],
  ["maintenance", maintenance],
  ["health", health],
] as const;

const event = (locals: unknown, headers: Record<string, string> = {}) =>
  ({
    locals,
    request: new Request("http://localhost/api", { headers }),
  }) as never;

const guest = { member: null, auth: async () => null };
const member = {
  member: { memberId: "m1", isAdmin: false, status: "active" },
  auth: async () => ({ user: { email: "m@snu.ac.kr" } }),
};

describe("admin queue authentication (C-19)", () => {
  for (const [name, handler] of adminQueues) {
    it(`${name}: no session is 401`, async () => {
      expect((await handler(event(guest))).status).toBe(401);
    });

    it(`${name}: a signed-in non-admin is 404`, async () => {
      expect((await handler(event(member))).status).toBe(404);
    });
  }
});

describe("cron authentication (C-20)", () => {
  for (const [name, handler] of cronRoutes) {
    it(`${name}: an unset secret is 401, not a 501 that leaks configuration`, async () => {
      delete testEnv.CRON_SECRET;
      expect((await handler(event({}))).status).toBe(401);
    });

    it(`${name}: a wrong secret is the same 401`, async () => {
      testEnv.CRON_SECRET = "right";
      const res = await handler(event({}, { authorization: "Bearer wrong" }));
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: "UNAUTHORIZED" });
    });
  }
});

describe("queue order (W-6 · FRONTEND-DECISIONS §3-5)", () => {
  const admin = {
    member: { memberId: "a1", isAdmin: true, status: "active" },
    auth: async () => ({ user: { email: "admin@snu.ac.kr" } }),
  };

  it("seminar-requests answers oldest pending first", async () => {
    const { mutate } = await import("$lib/server/data/tables");
    const { newId } = await import("$lib/server/core/id");
    const at = (iso: string) => ({
      id: newId(),
      title: `t-${iso}`,
      description: "d",
      prerequisites: "",
      duration: "",
      preferredTiming: "",
      presenterIds: [],
      attachment: "",
      posterKey: "",
      requesterId: newId(),
      status: "pending" as const,
      createdAt: iso,
    });
    await mutate("seminar-requests", () => [
      at("2026-09-03T10:00:00+09:00"),
      at("2026-09-01T10:00:00+09:00"),
      at("2026-09-02T10:00:00+09:00"),
    ]);

    const res = await seminarRequests(event(admin));
    const body = (await res.json()) as { items: { title: string }[] };

    expect(body.items.map((i) => i.title)).toEqual([
      "t-2026-09-01T10:00:00+09:00",
      "t-2026-09-02T10:00:00+09:00",
      "t-2026-09-03T10:00:00+09:00",
    ]);
  });
});
