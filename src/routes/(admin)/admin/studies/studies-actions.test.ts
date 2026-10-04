import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __reset } from "$lib/server/data/store-memory";
import {
  _resetDataLayerForTests,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { nowKstIso } from "$lib/server/core/time";
import { AppError } from "$lib/server/core/errors";
import * as recordsAdmin from "$lib/server/services/records-admin";
import * as uploads from "$lib/server/services/uploads";
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
  // A study's organizer must be a real member (audit LB28-4).
  await mutate("members", () => [
    {
      id: "m1",
      name: "회원",
      department: "수리과학부",
      joinedAt: "2024-03-01",
      status: "regular",
      statusChangedAt: nowKstIso(),
      withdrawal: null,
      isAlumni: false,
      alumniRevoked: false,
      roles: [],
      isAdmin: false,
      publicContact: null,
      alumniRevocationReason: null,
      project: null,
      legacyMemberId: null,
      sourceRequestId: null,
    },
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
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
    expect(result).toMatchObject({
      operation: "studyRecordCreated",
      scope: "record-create",
      id: row.id,
    });
  });

  it("retains mapped raw values on a business validation failure", async () => {
    const result = await actions.create(
      post({ ...valid, organizerId: "ghost", unrelated: "private" }),
    );
    expect(result).toMatchObject({
      status: 400,
      data: {
        error: "VALIDATION_FAILED",
        scope: "record-create",
        id: "",
        values: {
          title: valid.title,
          term: "26-2",
          material: "Apostol",
          description: "소수의 분포",
          note: "",
          organizerId: "ghost",
        },
      },
    });
    const values = (result as unknown as { data: { values: object } }).data
      .values;
    expect(values).not.toHaveProperty("semester");
    expect(values).not.toHaveProperty("textbook");
    expect(values).not.toHaveProperty("unrelated");
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
    expect(result).toMatchObject({
      operation: "studyRecordUpdated",
      scope: "record-update",
      id: row.id,
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
      data: {
        error: "VALIDATION_FAILED",
        scope: "record-update",
        values: { status: "archived" },
      },
    });
    expect((await getTable("studies"))[0].status).toBe("recruiting");
  });
});

describe("scoped record operations", () => {
  it("retains raw mapped editor values on an unavailable update", async () => {
    vi.spyOn(recordsAdmin, "updateStudy").mockRejectedValueOnce(
      new AppError("SERVICE_UNAVAILABLE", {
        userMessage: "다시 시도해 주세요.",
      }),
    );
    const result = await actions.update(
      post({
        ...valid,
        id: "study-1",
        textbook: "  교재  ",
        unrelated: "private",
      }),
    );
    expect(result).toMatchObject({
      status: 503,
      data: {
        error: "SERVICE_UNAVAILABLE",
        message: "다시 시도해 주세요.",
        scope: "record-update",
        id: "study-1",
        values: { material: "  교재  ", term: "26-2" },
      },
    });
    expect(
      (result as unknown as { data: { values: object } }).data.values,
    ).not.toHaveProperty("unrelated");
  });

  it("scopes organizer failures with only the selected organizer", async () => {
    const result = await actions.setOrganizer(
      post({ id: "study-1", organizerId: "ghost", title: "private" }),
    );
    expect(result).toMatchObject({
      status: 400,
      data: {
        error: "VALIDATION_FAILED",
        scope: "record-organizer",
        id: "study-1",
        values: { organizerId: "ghost" },
      },
    });
    expect(
      (result as unknown as { data: { values: object } }).data.values,
    ).toEqual({ organizerId: "ghost" });
  });

  it("scopes delete failures without unrelated raw values", async () => {
    const result = await actions.delete(
      post({ id: "missing", title: "private" }),
    );
    expect(result).toMatchObject({
      status: 404,
      data: {
        error: "NOT_FOUND",
        scope: "record-delete",
        id: "missing",
        values: {},
      },
    });
    expect(
      (result as unknown as { data: { values: object } }).data.values,
    ).toEqual({});
  });

  it("scopes file failures to their action's submitted fields", async () => {
    vi.spyOn(uploads, "promotePendingUpload").mockRejectedValueOnce(
      new AppError("SERVICE_UNAVAILABLE"),
    );
    const added = await actions.addFile(
      post({
        id: "study-1",
        pendingKey: "pending/photo",
        unrelated: "private",
      }),
    );
    expect(added).toMatchObject({
      status: 503,
      data: {
        error: "SERVICE_UNAVAILABLE",
        scope: "record-file",
        id: "study-1",
        values: { pendingKey: "pending/photo" },
      },
    });
    expect(
      (added as unknown as { data: { values: object } }).data.values,
    ).toEqual({ pendingKey: "pending/photo" });
    const removed = await actions.removeFile(
      post({ id: "missing", s3Key: "studies/photo", unrelated: "private" }),
    );
    expect(removed).toMatchObject({
      status: 404,
      data: {
        scope: "record-file",
        id: "missing",
        values: { s3Key: "studies/photo" },
      },
    });
    expect(
      (removed as unknown as { data: { values: object } }).data.values,
    ).toEqual({ s3Key: "studies/photo" });
  });

  it("keeps operation names, s3Key, and target metadata on file success", async () => {
    vi.spyOn(uploads, "promotePendingUpload").mockResolvedValueOnce(
      "studies/photo",
    );
    vi.spyOn(recordsAdmin, "setStudyPhotos").mockResolvedValue(undefined);
    expect(
      await actions.addFile(
        post({ id: "study-1", pendingKey: "pending/photo" }),
      ),
    ).toMatchObject({
      success: true,
      operation: "studyFileAdded",
      s3Key: "studies/photo",
      scope: "record-file",
      id: "study-1",
    });
    expect(
      await actions.removeFile(post({ id: "study-1", s3Key: "studies/photo" })),
    ).toMatchObject({
      success: true,
      operation: "studyFileRemoved",
      scope: "record-file",
      id: "study-1",
    });
  });

  it("returns target metadata after organizer and delete success", async () => {
    await actions.create(post(valid));
    const [row] = await getTable("studies");
    expect(
      await actions.setOrganizer(post({ id: row.id, organizerId: "m1" })),
    ).toMatchObject({
      success: true,
      operation: "studyOrganizerSet",
      scope: "record-organizer",
      id: row.id,
    });
    expect(await actions.delete(post({ id: row.id }))).toMatchObject({
      success: true,
      operation: "studyRecordDeleted",
      scope: "record-delete",
      id: row.id,
    });
  });
});
