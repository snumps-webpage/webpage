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
 * The gallery editor's create checked the year by hand and update checked
 * nothing (an empty year silently kept the old one). Both now parse with
 * adminGalleryRecordSchema and answer {error, issues, values}.
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
    request: new Request("http://localhost/admin/gallery", {
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

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["gallery-dinner", "activities"])
    await invalidateCache(`table_${t}`);
});

describe("?/create", () => {
  it("stores a valid entry, trimmed, and an empty activity as null", async () => {
    const result = await actions.create(
      post({ year: " 2026 ", activityId: "" }),
    );

    expect(result).toMatchObject({ success: true });
    const [row] = await getTable("gallery-dinner");
    expect(row).toMatchObject({ year: "2026", activityId: null });
  });

  it.each([
    ["year", { year: "  " }],
    ["year", { year: "2".repeat(21) }],
    ["activityId", { year: "2026", activityId: "a".repeat(201) }],
  ])(
    "refuses a bad %s with a field issue and writes nothing",
    async (field, fields) => {
      const result = await actions.create(post(fields));

      expect(result).toMatchObject({
        status: 400,
        data: {
          error: "VALIDATION_FAILED",
          issues: { [field]: expect.any(String) },
          values: { year: expect.any(String) },
        },
      });
      expect(await getTable("gallery-dinner")).toEqual([]);
    },
  );

  it("reports every bad field at once", async () => {
    const result = (await actions.create(
      post({ year: "", activityId: "a".repeat(201) }),
    )) as unknown as Failure;

    expect(Object.keys(result.data.issues).sort()).toEqual([
      "activityId",
      "year",
    ]);
  });
});

describe("?/update", () => {
  beforeEach(async () => {
    await actions.create(post({ year: "2025", activityId: "" }));
  });
  const id = async () => (await getTable("gallery-dinner"))[0].id;

  it("updates the year", async () => {
    const result = await actions.update(
      post({ id: await id(), year: "미상", activityId: "" }),
    );

    expect(result).toMatchObject({ success: true });
    expect((await getTable("gallery-dinner"))[0].year).toBe("미상");
  });

  it("refuses an empty year instead of silently keeping the old one", async () => {
    const result = (await actions.update(
      post({ id: await id(), year: "", activityId: "" }),
    )) as unknown as Failure;

    expect(result).toMatchObject({
      status: 400,
      data: {
        error: "VALIDATION_FAILED",
        issues: { year: expect.any(String) },
      },
    });
    expect((await getTable("gallery-dinner"))[0].year).toBe("2025");
  });
});
