import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import {
  _resetDataLayerForTests,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { AppError } from "$lib/server/core/errors";
import * as recordsAdmin from "$lib/server/services/records-admin";
import * as uploads from "$lib/server/services/uploads";
import { actions, load } from "./+page.server";

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

function post(fields: Record<string, string>, presenterIds?: string[]) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  if (presenterIds !== undefined) {
    body.delete("presenterIds");
    for (const id of presenterIds) body.append("presenterIds", id);
  }
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
  description: "공개 설명",
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("?/create", () => {
  it("stores a valid record, trimmed", async () => {
    const result = await actions.create(post(valid));

    expect(result).toMatchObject({ success: true });
    const [row] = await getTable("seminars");
    expect(row).toMatchObject({
      title: "조합론 세미나",
      semester: "26-2",
      description: "공개 설명",
      note: "확률적 방법",
      presenterIds: ["m1", "m2"],
    });
    expect(result).toMatchObject({
      operation: "seminarRecordCreated",
      scope: "record-create",
      id: row.id,
    });
  });

  it.each([
    ["title", { title: "  " }],
    ["title", { title: "가".repeat(161) }],
    ["term", { semester: "2026-2" }],
    ["description", { description: "가".repeat(2401) }],
    ["note", { note: "가".repeat(2401) }],
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
          id: "",
          issues: { [field]: expect.any(String) },
          values: { term: expect.any(String) },
          presenterIds: ["m1", "m2"],
        },
      });
      expect(await getTable("seminars")).toEqual([]);
    },
  );

  // #7 / #12 — the editor posted these and the action dropped them.
  it("stores kind, duration and prerequisites; a direct record is not announced", async () => {
    await actions.create(
      post({
        ...valid,
        kind: "irregular",
        durationMinutes: "90",
        prerequisites: "  선형대수  ",
      }),
    );

    const [row] = await getTable("seminars");
    expect(row).toMatchObject({
      kind: "irregular",
      durationMinutes: 90,
      prerequisites: "선형대수",
      announce: false,
    });
  });

  it("reads an empty kind or duration as unknown", async () => {
    await actions.create(post({ ...valid, kind: "", durationMinutes: "" }));

    const [row] = await getTable("seminars");
    expect(row).toMatchObject({ kind: null, durationMinutes: null });
  });

  it.each([
    ["kind", { kind: "weekly" }],
    ["durationMinutes", { durationMinutes: "5" }],
    ["durationMinutes", { durationMinutes: "601" }],
    ["durationMinutes", { durationMinutes: "1.5" }],
    ["durationMinutes", { durationMinutes: "한 시간" }],
    ["prerequisites", { prerequisites: "가".repeat(2001) }],
  ])(
    "refuses a bad %s with a field issue and writes nothing (%o)",
    async (field, over) => {
      const result = await actions.create(post({ ...valid, ...over }));

      expect(result).toMatchObject({
        status: 400,
        data: {
          scope: "record-create",
          issues: { [field]: expect.any(String) },
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
      "note",
      "term",
      "title",
    ]);
  });

  it("accepts every repeated checkbox and comma fragment once", async () => {
    await actions.create(post(valid, ["", "m1", "legacy-1,m2", " m1 ", ""]));
    expect((await getTable("seminars"))[0].presenterIds).toEqual([
      "m1",
      "legacy-1",
      "m2",
    ]);
  });

  it("keeps raw independent fields and presenter IDs on a service failure", async () => {
    vi.spyOn(recordsAdmin, "createSeminar").mockRejectedValueOnce(
      new AppError("SERVICE_UNAVAILABLE", { userMessage: "잠시 후 다시 시도" }),
    );
    const result = await actions.create(
      post(
        { ...valid, description: "  설명  ", note: "", unrelated: "secret" },
        ["", "legacy-1", "m2"],
      ),
    );
    expect(result).toMatchObject({
      status: 503,
      data: {
        error: "SERVICE_UNAVAILABLE",
        message: "잠시 후 다시 시도",
        scope: "record-create",
        id: "",
        values: { description: "  설명  ", note: "", term: "26-2" },
        presenterIds: ["legacy-1", "m2"],
      },
    });
    expect(
      (result as unknown as { data: { values: object } }).data.values,
    ).not.toHaveProperty("unrelated");
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
      description: "공개 설명",
      externalPresenters: "외부 연사",
    });
  });

  it("updates description and note independently, preserving omitted values", async () => {
    const seminarId = await id();
    const {
      description: _description,
      note: _note,
      presenterIds: _ids,
      ...rest
    } = valid;
    void [_description, _note, _ids];
    await actions.update(
      post({ ...rest, id: seminarId, description: "새 설명" }),
    );
    expect((await getTable("seminars"))[0]).toMatchObject({
      description: "새 설명",
      note: "확률적 방법",
      presenterIds: ["m1", "m2"],
    });
    await actions.update(post({ ...rest, id: seminarId, note: "" }));
    expect((await getTable("seminars"))[0]).toMatchObject({
      description: "새 설명",
      note: "",
    });
    await actions.update(post({ ...rest, id: seminarId, description: "" }));
    expect((await getTable("seminars"))[0].description).toBe("");
  });

  it("an explicit empty presenter field clears the existing list", async () => {
    const seminarId = await id();
    const result = await actions.update(
      post({ ...valid, id: seminarId }, [""]),
    );
    expect(result).toMatchObject({
      success: true,
      operation: "seminarRecordUpdated",
      scope: "record-update",
      id: seminarId,
    });
    expect((await getTable("seminars"))[0].presenterIds).toEqual([]);
  });

  it("edits kind, duration and prerequisites", async () => {
    await actions.update(
      post({
        ...valid,
        id: await id(),
        kind: "irregular",
        durationMinutes: "120",
        prerequisites: "위상수학",
      }),
    );

    const [row] = await getTable("seminars");
    expect(row).toMatchObject({
      kind: "irregular",
      durationMinutes: 120,
      prerequisites: "위상수학",
    });
  });

  it("leaves kind, duration and prerequisites when the editor does not send them", async () => {
    const seminarId = await id();
    const { kind: _k, durationMinutes: _d, prerequisites: _p, ...rest } = valid;
    void [_k, _d, _p];

    await actions.update(post({ ...rest, id: seminarId }));

    const [row] = await getTable("seminars");
    expect(row).toMatchObject({
      kind: "regular",
      durationMinutes: 60,
      prerequisites: "",
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

describe("scoped record operations", () => {
  it("keeps file operation names, s3Key, and target metadata", async () => {
    vi.spyOn(uploads, "promotePendingUpload").mockResolvedValueOnce(
      "seminars/material.pdf",
    );
    vi.spyOn(recordsAdmin, "setSeminarFiles").mockResolvedValue(undefined);
    expect(
      await actions.addFile(
        post({
          id: "s-target",
          field: "materials",
          pendingKey: "pending/material",
        }),
      ),
    ).toMatchObject({
      success: true,
      operation: "seminarFileAdded",
      s3Key: "seminars/material.pdf",
      scope: "record-file",
      id: "s-target",
    });
    expect(
      await actions.removeFile(
        post({
          id: "s-target",
          field: "materials",
          s3Key: "seminars/material.pdf",
        }),
      ),
    ).toMatchObject({
      success: true,
      operation: "seminarFileRemoved",
      scope: "record-file",
      id: "s-target",
    });
  });

  it("scopes an unavailable file upload with only the submitted file fields", async () => {
    vi.spyOn(uploads, "promotePendingUpload").mockRejectedValueOnce(
      new AppError("SERVICE_UNAVAILABLE"),
    );
    const result = await actions.addFile(
      post({
        id: "s-target",
        field: "materials",
        pendingKey: "pending/material",
        unrelated: "private",
      }),
    );
    expect(result).toMatchObject({
      status: 503,
      data: {
        error: "SERVICE_UNAVAILABLE",
        scope: "record-file",
        id: "s-target",
        values: { field: "materials", pendingKey: "pending/material" },
      },
    });
    expect(
      (result as unknown as { data: { values: object } }).data.values,
    ).toEqual({ field: "materials", pendingKey: "pending/material" });
  });

  it("keeps a business failure's status/message and only editor values", async () => {
    vi.spyOn(recordsAdmin, "updateSeminar").mockRejectedValueOnce(
      new AppError("CONFLICT", { userMessage: "다시 확인해 주세요." }),
    );
    const result = await actions.update(
      post({ ...valid, id: "s-target", unrelated: "private" }),
    );
    expect(result).toMatchObject({
      status: 409,
      data: {
        error: "CONFLICT",
        message: "다시 확인해 주세요.",
        scope: "record-update",
        id: "s-target",
        values: { description: "공개 설명", note: "확률적 방법" },
      },
    });
    expect(
      (result as unknown as { data: { values: object } }).data.values,
    ).not.toHaveProperty("unrelated");
  });

  it.each([
    ["delete", "record-delete", {}, {}],
    [
      "addFile",
      "record-file",
      { field: "bad", pendingKey: "pending/file" },
      { field: "bad", pendingKey: "pending/file" },
    ],
    [
      "removeFile",
      "record-file",
      { field: "bad", s3Key: "assets/file" },
      { field: "bad", s3Key: "assets/file" },
    ],
  ] as const)(
    "scopes %s failures to the target with whitelisted values",
    async (action, scope, fields, values) => {
      const result = await actions[action](
        post({ id: "missing", unrelated: "private", ...fields }),
      );
      expect(result).toMatchObject({ data: { scope, id: "missing", values } });
      expect(
        (result as unknown as { data: { values: object } }).data.values,
      ).toEqual(values);
    },
  );

  it("returns target metadata on delete success", async () => {
    await actions.create(post(valid));
    const [row] = await getTable("seminars");
    const result = await actions.delete(post({ id: row.id }));
    expect(result).toMatchObject({
      success: true,
      operation: "seminarRecordDeleted",
      scope: "record-delete",
      id: row.id,
    });
  });
});

/**
 * The page reads what is stored: kind was guessed from sourceRequestId
 * (request → 비정기, else 정기), duration defaulted to 60 minutes and
 * prerequisites came from the request (#7). "공지 재발송" is not offered for a
 * direct record — it would mail every member about an archive entry (#21).
 */
describe("load", () => {
  const HOUR = 60 * 60 * 1000;
  type Loaded = {
    dashboard: {
      seminars: {
        id: string;
        kind: string | null;
        prerequisites: string;
        canResendNotice: boolean;
      }[];
    };
    records: {
      id: string;
      kind: string | null;
      durationMinutes: number | null;
      prerequisites: string;
      description: string;
      note: string;
    }[];
  };
  const loadPage = async () =>
    (await load({ locals: admin } as never)) as unknown as Loaded;

  it("shows the stored kind, duration and prerequisites", async () => {
    await actions.create(
      post({
        ...valid,
        kind: "irregular",
        durationMinutes: "",
        prerequisites: "군론",
      }),
    );

    const page = await loadPage();

    expect(page.records[0]).toMatchObject({
      kind: "irregular",
      durationMinutes: null,
      prerequisites: "군론",
      description: "공개 설명",
      note: "확률적 방법",
    });
    expect(page.dashboard.seminars[0]).toMatchObject({
      kind: "irregular",
      prerequisites: "군론",
    });
  });

  it("does not offer 공지 재발송 for a direct record given a future date", async () => {
    await actions.create(post(valid));
    const [row] = await getTable("seminars");
    await mutate("seminars", (rows) =>
      rows.map((r) =>
        r.id === row.id
          ? {
              ...r,
              schedule: {
                startsAt: new Date(Date.now() + 72 * HOUR).toISOString(),
                startTime: null,
                endsAt: null,
                location: "27동",
              },
            }
          : r,
      ),
    );

    const page = await loadPage();

    expect(page.dashboard.seminars[0].canResendNotice).toBe(false);
    // the same row as an announcement target would be offered it
    await mutate("seminars", (rows) =>
      rows.map((r) => ({ ...r, announce: true })),
    );
    expect((await loadPage()).dashboard.seminars[0].canResendNotice).toBe(true);
  });
});
