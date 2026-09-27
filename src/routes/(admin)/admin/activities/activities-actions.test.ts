import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { actions } from "./+page.server";

/**
 * The activity editor's create/update actions checked title and type by hand
 * and threw one bare VALIDATION_FAILED. They now parse with
 * adminActivityRecordSchema and answer {error, issues, values} with every bad
 * field at once, writing nothing.
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

function post(fields: Record<string, string>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return {
    request: new Request("http://localhost/admin/activities", {
      method: "POST",
      body,
    }),
    locals: admin,
  } as never;
}

type Failure = {
  status: number;
  data: { error: string; issues: Record<string, string> };
};

const valid = {
  title: "  정기 회의  ",
  type: "회의",
  start: "2026-09-01T19:00",
};

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["activities", "events", "gallery-dinner", "seminars"])
    await invalidateCache(`table_${t}`);
});

describe("?/create", () => {
  it("stores a valid activity, trimmed", async () => {
    const result = await actions.create(post(valid));

    expect(result).toMatchObject({ success: true });
    const [row] = await getTable("activities");
    expect(row).toMatchObject({
      title: "정기 회의",
      type: "회의",
      date: { start: "2026-09-01T19:00:00+09:00", end: null },
    });
  });

  it.each([
    ["title", { title: "   " }],
    ["title", { title: "가".repeat(161) }],
    ["type", { type: "workshop" }],
    // offered by the shared constants once, but activities.type cannot store it
    ["type", { type: "문제 풀이" }],
    ["start", { start: "2026-09-01" }],
    ["end", { end: "tomorrow" }],
  ])(
    "refuses a bad %s with a field issue and writes nothing",
    async (field, over) => {
      const result = await actions.create(post({ ...valid, ...over }));

      expect(result).toMatchObject({
        status: 400,
        data: {
          error: "VALIDATION_FAILED",
          issues: { [field]: expect.any(String) },
          values: { title: expect.any(String) },
        },
      });
      expect(await getTable("activities")).toEqual([]);
    },
  );

  it("reports every bad field at once", async () => {
    const result = (await actions.create(
      post({ title: "", type: "x", start: "" }),
    )) as unknown as Failure;

    expect(Object.keys(result.data.issues).sort()).toEqual([
      "start",
      "title",
      "type",
    ]);
  });
});

describe("?/update", () => {
  beforeEach(async () => {
    await actions.create(post(valid));
  });
  const id = async () => (await getTable("activities"))[0].id;

  it("updates title and type and keeps the date when none is sent", async () => {
    const result = await actions.update(
      post({ id: await id(), title: "임시 회의", type: "기타" }),
    );

    expect(result).toMatchObject({ success: true });
    const [row] = await getTable("activities");
    expect(row).toMatchObject({
      title: "임시 회의",
      type: "기타",
      date: { start: "2026-09-01T19:00:00+09:00" },
    });
  });

  it("refuses bad fields at once and keeps the row", async () => {
    const result = (await actions.update(
      post({ id: await id(), title: "", type: "문제 창작", start: "x" }),
    )) as unknown as Failure;

    expect(result).toMatchObject({
      status: 400,
      data: { error: "VALIDATION_FAILED" },
    });
    expect(Object.keys(result.data.issues).sort()).toEqual([
      "start",
      "title",
      "type",
    ]);
    const [row] = await getTable("activities");
    expect(row).toMatchObject({ title: "정기 회의", type: "회의" });
  });
});
