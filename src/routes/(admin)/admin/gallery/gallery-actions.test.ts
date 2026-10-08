import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { AppError } from "$lib/server/core/errors";
import * as recordsAdmin from "$lib/server/services/records-admin";
import * as uploads from "$lib/server/services/uploads";
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("?/create", () => {
  it("stores a valid entry, trimmed, and an empty activity as null", async () => {
    const result = await actions.create(
      post({ year: " 2026 ", activityId: "" }),
    );

    expect(result).toMatchObject({ success: true });
    const [row] = await getTable("gallery-dinner");
    expect(row).toMatchObject({ year: "2026", activityId: null });
    expect(result).toMatchObject({
      operation: "galleryCreated",
      scope: "record-create",
      id: row.id,
    });
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
    expect(result).toMatchObject({
      operation: "galleryUpdated",
      scope: "record-update",
      id: await id(),
    });
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

describe("scoped record operations", () => {
  it("preserves raw gallery values on an unavailable create", async () => {
    vi.spyOn(recordsAdmin, "createGalleryEntry").mockRejectedValueOnce(
      new AppError("SERVICE_UNAVAILABLE"),
    );
    const result = await actions.create(
      post({ year: " 2026 ", activityId: "", unrelated: "private" }),
    );
    expect(result).toMatchObject({
      status: 503,
      data: {
        error: "SERVICE_UNAVAILABLE",
        scope: "record-create",
        id: "",
        values: { year: " 2026 ", activityId: "" },
      },
    });
    expect(
      (result as unknown as { data: { values: object } }).data.values,
    ).toEqual({ year: " 2026 ", activityId: "" });
  });

  it("keeps a business failure's status/message and target metadata", async () => {
    vi.spyOn(recordsAdmin, "updateGalleryEntry").mockRejectedValueOnce(
      new AppError("CONFLICT", { userMessage: "새로고침해 주세요." }),
    );
    const result = await actions.update(
      post({
        id: "gallery-1",
        year: "2026",
        activityId: "a1",
        unrelated: "private",
      }),
    );
    expect(result).toMatchObject({
      status: 409,
      data: {
        error: "CONFLICT",
        message: "새로고침해 주세요.",
        scope: "record-update",
        id: "gallery-1",
        values: { year: "2026", activityId: "a1" },
      },
    });
    expect(
      (result as unknown as { data: { values: object } }).data.values,
    ).toEqual({ year: "2026", activityId: "a1" });
  });

  it("keeps an unexpected error's original unavailable classification", async () => {
    vi.spyOn(recordsAdmin, "updateGalleryEntry").mockRejectedValueOnce(
      new Error("private driver error"),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await actions.update(
      post({ id: "gallery-1", year: "2026", activityId: "" }),
    );
    expect(result).toMatchObject({
      status: 500,
      data: {
        error: "SERVICE_UNAVAILABLE",
        scope: "record-update",
        id: "gallery-1",
        values: { year: "2026", activityId: "" },
      },
    });
    expect((result as unknown as { data: object }).data).not.toHaveProperty(
      "message",
    );
  });

  it("scopes delete failures with an empty values whitelist", async () => {
    const result = await actions.delete(
      post({ id: "missing", year: "private" }),
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

  it("scopes file failures with only their submitted key", async () => {
    vi.spyOn(uploads, "promotePendingUpload").mockRejectedValueOnce(
      new AppError("SERVICE_UNAVAILABLE"),
    );
    const added = await actions.addPhoto(
      post({
        id: "gallery-1",
        pendingKey: "pending/photo",
        unrelated: "private",
      }),
    );
    expect(added).toMatchObject({
      status: 503,
      data: {
        error: "SERVICE_UNAVAILABLE",
        scope: "record-file",
        id: "gallery-1",
        values: { pendingKey: "pending/photo" },
      },
    });
    expect(
      (added as unknown as { data: { values: object } }).data.values,
    ).toEqual({ pendingKey: "pending/photo" });
    const removed = await actions.removePhoto(
      post({ id: "missing", s3Key: "gallery/photo", unrelated: "private" }),
    );
    expect(removed).toMatchObject({
      status: 404,
      data: {
        scope: "record-file",
        id: "missing",
        values: { s3Key: "gallery/photo" },
      },
    });
    expect(
      (removed as unknown as { data: { values: object } }).data.values,
    ).toEqual({ s3Key: "gallery/photo" });
  });

  it("returns unchanged file operation names and s3Key with target metadata", async () => {
    vi.spyOn(uploads, "promotePendingUpload").mockResolvedValueOnce(
      "gallery/photo",
    );
    vi.spyOn(recordsAdmin, "setGalleryPhotos").mockResolvedValue(undefined);
    expect(
      await actions.addPhoto(
        post({ id: "gallery-1", pendingKey: "pending/photo" }),
      ),
    ).toMatchObject({
      success: true,
      operation: "galleryPhotoAdded",
      s3Key: "gallery/photo",
      scope: "record-file",
      id: "gallery-1",
    });
    expect(
      await actions.removePhoto(
        post({ id: "gallery-1", s3Key: "gallery/photo" }),
      ),
    ).toMatchObject({
      success: true,
      operation: "galleryPhotoRemoved",
      scope: "record-file",
      id: "gallery-1",
    });
  });

  it("returns target metadata on delete success", async () => {
    await actions.create(post({ year: "2026", activityId: "" }));
    const [row] = await getTable("gallery-dinner");
    expect(await actions.delete(post({ id: row.id }))).toMatchObject({
      success: true,
      operation: "galleryDeleted",
      scope: "record-delete",
      id: row.id,
    });
  });
});
