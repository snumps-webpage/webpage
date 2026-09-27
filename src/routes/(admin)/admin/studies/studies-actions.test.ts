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
 * The study record editor already renders per-field issues under a `scope`,
 * but ?/create and ?/update threw one bare VALIDATION_FAILED (update checked
 * nothing and stored any semester shape). They now parse with
 * adminStudyRecordSchema and answer {error, scope, id, issues, values}.
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
    request: new Request("http://localhost/admin/studies", {
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
  title: "  수론 스터디  ",
  semester: "26-2",
  organizerId: "m1",
  description: "소수의 분포",
  textbook: "Apostol",
};

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["studies", "events", "members", "study-requests"])
    await invalidateCache(`table_${t}`);
});

describe("?/create", () => {
  it("stores a valid record, trimmed", async () => {
    const result = await actions.create(post(valid));

    expect(result).toMatchObject({ success: true });
    const [row] = await getTable("studies");
    expect(row).toMatchObject({
      title: "수론 스터디",
      semester: "26-2",
      organizerIds: ["m1"],
      description: "소수의 분포",
      textbook: "Apostol",
    });
  });

  it.each([
    ["title", { title: " " }],
    ["title", { title: "가".repeat(161) }],
    ["term", { semester: "2026-2" }],
    ["organizerId", { organizerId: "" }],
    ["description", { description: "가".repeat(2401) }],
    ["material", { textbook: "가".repeat(501) }],
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
          values: { organizerId: expect.any(String) },
        },
      });
      expect(await getTable("studies")).toEqual([]);
    },
  );

  it("reports every bad field at once", async () => {
    const result = (await actions.create(
      post({ title: "", semester: "", organizerId: "" }),
    )) as unknown as Failure;

    expect(Object.keys(result.data.issues).sort()).toEqual([
      "organizerId",
      "term",
      "title",
    ]);
  });
});

describe("?/update", () => {
  beforeEach(async () => {
    await actions.create(post(valid));
  });
  const id = async () => (await getTable("studies"))[0].id;

  it("updates the record, and an empty description is allowed", async () => {
    const result = await actions.update(
      post({
        id: await id(),
        title: "해석학 스터디",
        semester: "26-S",
        description: "",
        textbook: "Rudin",
      }),
    );

    expect(result).toMatchObject({ success: true });
    const [row] = await getTable("studies");
    expect(row).toMatchObject({
      title: "해석학 스터디",
      semester: "26-S",
      description: "",
      textbook: "Rudin",
    });
  });

  it("refuses bad fields at once under the record's scope and keeps the row", async () => {
    const studyId = await id();
    const result = (await actions.update(
      post({
        id: studyId,
        title: "",
        semester: "2026",
        description: "",
        textbook: "",
      }),
    )) as unknown as Failure;

    expect(result).toMatchObject({
      status: 400,
      data: { error: "VALIDATION_FAILED", scope: "record-update", id: studyId },
    });
    expect(Object.keys(result.data.issues).sort()).toEqual(["term", "title"]);
    const [row] = await getTable("studies");
    expect(row).toMatchObject({ title: "수론 스터디", semester: "26-2" });
  });

  // The editor never sends a status, but a crafted one used to reach
  // StudyStatus.parse and answer 500.
  it("refuses an unknown status with 400 and keeps the row", async () => {
    const result = (await actions.update(
      post({
        id: await id(),
        title: "수론 스터디",
        semester: "26-2",
        description: "",
        textbook: "",
        status: "archived",
      }),
    )) as unknown as Failure;

    expect(result).toMatchObject({
      status: 400,
      data: { error: "VALIDATION_FAILED" },
    });
    expect((await getTable("studies"))[0].status).toBe("recruiting");
  });
});
