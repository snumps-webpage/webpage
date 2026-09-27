import { beforeEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
vi.mock("$lib/server/mail/dispatch", () => ({
  emitMailEvent: async () => true,
}));

import { __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { actions } from "./+page.server";

/**
 * The seminar record editor already renders per-field issues under a
 * `scope`, but ?/create and ?/update threw one bare VALIDATION_FAILED (and
 * stored any length of text). They now parse with adminSeminarRecordSchema
 * and answer {error, scope, id, issues, values}, writing nothing.
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
    request: new Request("http://localhost/admin/seminars", {
      method: "POST",
      body,
    }),
    locals: admin,
  } as never;
}

type Failure = {
  status: number;
  data: { error: string; scope: string; issues: Record<string, string> };
};

const valid = {
  title: "  조합론 세미나  ",
  semester: "26-2",
  kind: "regular",
  durationMinutes: "60",
  note: "확률적 방법",
  prerequisites: "",
  presenterIds: "m1,m2",
};

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["seminars", "seminar-requests", "events", "activities"])
    await invalidateCache(`table_${t}`);
});

describe("?/create", () => {
  it("stores a valid record, trimmed", async () => {
    const result = await actions.create(post(valid));

    expect(result).toMatchObject({ success: true });
    const [row] = await getTable("seminars");
    expect(row).toMatchObject({
      title: "조합론 세미나",
      semester: "26-2",
      note: "확률적 방법",
      presenterIds: ["m1", "m2"],
    });
  });

  it.each([
    ["title", { title: "  " }],
    ["title", { title: "가".repeat(161) }],
    ["term", { semester: "2026-2" }],
    ["description", { note: "가".repeat(2401) }],
    ["externalPresenters", { externalPresenters: "가".repeat(501) }],
  ])(
    "refuses a bad %s with a field issue and writes nothing",
    async (field, over) => {
      const result = await actions.create(post({ ...valid, ...over }));

      expect(result).toMatchObject({
        status: 400,
        data: {
          error: "VALIDATION_FAILED",
          scope: "record-create",
          issues: { [field]: expect.any(String) },
          values: { term: expect.any(String) },
          presenterIds: ["m1", "m2"],
        },
      });
      expect(await getTable("seminars")).toEqual([]);
    },
  );

  it("reports every bad field at once", async () => {
    const result = (await actions.create(
      post({ ...valid, title: "", semester: "x", note: "가".repeat(2401) }),
    )) as unknown as Failure;

    expect(Object.keys(result.data.issues).sort()).toEqual([
      "description",
      "term",
      "title",
    ]);
  });
});

describe("?/update", () => {
  beforeEach(async () => {
    await actions.create(post({ ...valid, externalPresenters: "외부 연사" }));
  });
  const id = async () => (await getTable("seminars"))[0].id;

  it("updates the record and leaves fields the editor does not send", async () => {
    const result = await actions.update(
      post({ ...valid, id: await id(), title: "새 제목", note: "" }),
    );

    expect(result).toMatchObject({ success: true });
    const [row] = await getTable("seminars");
    expect(row).toMatchObject({
      title: "새 제목",
      note: "",
      externalPresenters: "외부 연사",
    });
  });

  it("refuses bad fields at once under the record's scope and keeps the row", async () => {
    const seminarId = await id();
    const result = (await actions.update(
      post({ ...valid, id: seminarId, title: "", semester: "26-3" }),
    )) as unknown as Failure;

    expect(result).toMatchObject({
      status: 400,
      data: {
        error: "VALIDATION_FAILED",
        scope: "record-update",
        id: seminarId,
      },
    });
    expect(Object.keys(result.data.issues).sort()).toEqual(["term", "title"]);
    const [row] = await getTable("seminars");
    expect(row).toMatchObject({ title: "조합론 세미나", semester: "26-2" });
  });
});
