import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { isRedirect } from "@sveltejs/kit";
import { __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { actions } from "./+page.server";

/**
 * The new-event form checked its fields by hand, before the admin check, and
 * answered success with 302. It now parses with adminEventInputSchema inside
 * the admin wrapper and redirects with 303 — the status that turns a POST
 * into a GET (audit W-26).
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
    request: new Request("http://localhost/admin/events/new", {
      method: "POST",
      body,
    }),
    locals,
  } as never;
}

type Failure = {
  status: number;
  data: { error: string; issues: Record<string, string> };
};

const valid = { title: "  개강총회  ", date: "2026-09-01T19:00", type: "회의" };

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["events", "activities"]) await invalidateCache(`table_${t}`);
});

describe("events/new", () => {
  it("creates the draft and redirects with 303", async () => {
    const thrown = await actions.default(post(valid)).catch((e: unknown) => e);

    expect(isRedirect(thrown)).toBe(true);
    expect(thrown).toMatchObject({ status: 303, location: "/admin" });
    const [event] = await getTable("events");
    expect(event).toMatchObject({
      title: "개강총회",
      type: "회의",
      date: { start: "2026-09-01T19:00:00+09:00" },
    });
  });

  it.each([
    ["title", { title: "" }],
    ["title", { title: "가".repeat(161) }],
    ["startsAtLocal", { date: "" }],
    ["startsAtLocal", { date: "2026-09-01" }],
    ["type", { type: "문제 창작" }],
  ])(
    "refuses a bad %s with a field issue and writes nothing",
    async (field, over) => {
      const result = await actions.default(post({ ...valid, ...over }));

      expect(result).toMatchObject({
        status: 400,
        data: {
          error: "VALIDATION_FAILED",
          issues: { [field]: expect.any(String) },
          values: { title: expect.any(String) },
        },
      });
      expect(await getTable("events")).toEqual([]);
      expect(await getTable("activities")).toEqual([]);
    },
  );

  it("reports every bad field at once", async () => {
    const result = (await actions.default(
      post({ title: "", date: "", type: "" }),
    )) as unknown as Failure;

    expect(Object.keys(result.data.issues).sort()).toEqual([
      "startsAtLocal",
      "title",
      "type",
    ]);
  });

  it("checks the admin before it reads the input", async () => {
    const result = await actions.default(post({}, outsider));

    expect(result).toMatchObject({ status: 403 });
  });
});
