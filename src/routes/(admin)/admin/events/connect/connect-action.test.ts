import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { isRedirect } from "@sveltejs/kit";
import { __reset } from "$lib/server/data/store-memory";
import {
  _resetDataLayerForTests,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { actions } from "./+page.server";

/**
 * Connecting an activity took any activityId, checked it before the admin
 * check, and answered success with 302. The id now goes through
 * adminDashboardIdSchema inside the admin wrapper, and success redirects with
 * 303 (audit W-26).
 */

const admin = {
  member: {
    memberId: "admin",
    privateInfoId: null,
    name: "관리자",
    status: "regular",
    isAdmin: true,
    isAlumni: false,
    registered: true,
    capabilities: [],
  },
  auth: async () => ({ user: { email: "admin@snu.ac.kr", name: "관리자" } }),
} as unknown as App.Locals;
const outsider = {
  member: null,
  auth: async () => null,
} as unknown as App.Locals;

function post(fields: Record<string, string>, locals = admin) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return {
    request: new Request("http://localhost/admin/events/connect", {
      method: "POST",
      body,
    }),
    locals,
  } as never;
}

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["events", "activities"]) await invalidateCache(`table_${t}`);
  await mutate("activities", () => [
    {
      id: "a1",
      title: "정기 회의",
      type: "회의" as const,
      date: { start: "2026-09-01T19:00:00+09:00", end: null },
      attendeeIds: [],
      sourceRequestId: null,
    },
  ]);
});

describe("events/connect", () => {
  it("connects the activity and redirects with 303", async () => {
    const thrown = await actions
      .publish(post({ activityId: " a1 " }))
      .catch((e: unknown) => e);

    expect(isRedirect(thrown)).toBe(true);
    expect(thrown).toMatchObject({ status: 303, location: "/admin" });
    expect((await getTable("events"))[0]).toMatchObject({ activityId: "a1" });
  });

  it.each([
    ["missing", {}],
    ["blank", { activityId: "   " }],
    ["overlong", { activityId: "a".repeat(201) }],
  ])(
    "refuses a %s id with VALIDATION_FAILED and writes nothing",
    async (_label, fields) => {
      const result = await actions.publish(post(fields));

      expect(result).toMatchObject({
        status: 400,
        data: {
          error: "VALIDATION_FAILED",
          issues: { activityId: expect.any(String) },
        },
      });
      expect(await getTable("events")).toEqual([]);
    },
  );

  it("keeps NOT_FOUND for an id that matches no activity", async () => {
    const result = await actions.publish(post({ activityId: "nope" }));

    expect(result).toMatchObject({ status: 404 });
  });

  it("checks the admin before it reads the input", async () => {
    const result = await actions.publish(post({}, outsider));

    expect(result).toMatchObject({ status: 403 });
  });
});
