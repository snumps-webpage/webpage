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
import { AppError } from "$lib/server/core/errors";
import * as recordsAdmin from "$lib/server/services/records-admin";
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

function post(fields: Record<string, string>, attendeeIds?: string[]) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  if (attendeeIds !== undefined) {
    body.delete("attendeeIds");
    for (const id of attendeeIds) body.append("attendeeIds", id);
  }
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

afterEach(() => {
  vi.restoreAllMocks();
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
    expect(result).toMatchObject({
      operation: "activityCreated",
      scope: "record-create",
      id: row.id,
    });
  });

  it("stores the native date-only form as KST midnight", async () => {
    const result = await actions.create(
      post({ title: "회의", type: "회의", date: "2026-09-02" }),
    );
    const [row] = await getTable("activities");
    expect(row.date).toEqual({ start: "2026-09-02T00:00:00+09:00", end: null });
    expect(result).toMatchObject({
      success: true,
      scope: "record-create",
      id: row.id,
    });
  });

  it.each(["2026-02-30", "2026-09-31", "invalid"])(
    "refuses the raw invalid native date %s",
    async (date) => {
      const result = await actions.create(
        post({ title: "회의", type: "회의", date }),
      );
      expect(result).toMatchObject({
        status: 400,
        data: {
          scope: "record-create",
          id: "",
          issues: { date: expect.any(String) },
          values: { date },
        },
      });
      expect(await getTable("activities")).toEqual([]);
    },
  );

  it.each([
    ["title", { title: "   " }],
    ["title", { title: "가".repeat(161) }],
    ["type", { type: "workshop" }],
    // offered by the shared constants once, but activities.type cannot store it
    ["type", { type: "문제 풀이" }],
    ["start", { start: "2026-09-01" }],
    ["end", { end: "tomorrow" }],
    // audit LC02-2 / LC03-1: impossible dates and reversed ranges
    ["start", { start: "2026-09-31T19:00" }],
    ["end", { end: "2026-09-01T18:00" }],
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

  it("allows a title/type save with an unchanged historical native date", async () => {
    const activityId = await id();
    const stored = {
      start: "1999-10-02T19:15:30+09:00",
      end: "1999-10-02T21:30:45+09:00",
    };
    await mutate("activities", (rows) =>
      rows.map((row) => ({ ...row, date: stored })),
    );
    const result = await actions.update(
      post({
        id: activityId,
        title: "수정한 회의",
        type: "기타",
        date: "1999-10-02",
      }),
    );
    expect(result).toMatchObject({
      success: true,
      operation: "activityUpdated",
      scope: "record-update",
      id: activityId,
    });
    expect((await getTable("activities"))[0]).toMatchObject({
      title: "수정한 회의",
      type: "기타",
      date: stored,
    });
  });

  it("still refuses an attempted date change into 1999", async () => {
    const activityId = await id();
    const result = await actions.update(
      post({
        id: activityId,
        title: "정기 회의",
        type: "회의",
        date: "1999-10-02",
      }),
    );
    expect(result).toMatchObject({
      status: 400,
      data: {
        error: "VALIDATION_FAILED",
        scope: "record-update",
        id: activityId,
        values: { date: "1999-10-02" },
      },
    });
    expect((await getTable("activities"))[0].date.start).toBe(
      "2026-09-01T19:00:00+09:00",
    );
  });

  it("preserves the actual stored range for the same KST calendar date", async () => {
    const activityId = await id();
    const stored = {
      start: "2026-09-01T15:30:25Z",
      end: "2026-09-02T02:20:35+09:00",
    };
    await mutate("activities", (rows) =>
      rows.map((row) => ({ ...row, date: stored })),
    );
    const result = await actions.update(
      post({
        id: activityId,
        title: "정기 회의",
        type: "기타",
        date: "2026-09-02",
        oldDate: "1999-01-01",
      }),
    );
    expect(result).toMatchObject({
      success: true,
      operation: "activityUpdated",
      scope: "record-update",
      id: activityId,
    });
    expect((await getTable("activities"))[0].date).toEqual(stored);
  });

  it("honors a changed native date regardless of the client oldDate", async () => {
    const activityId = await id();
    await actions.update(
      post({
        id: activityId,
        title: "정기 회의",
        type: "회의",
        date: "2026-09-03",
        oldDate: "2026-09-03",
      }),
    );
    expect((await getTable("activities"))[0].date).toEqual({
      start: "2026-09-03T00:00:00+09:00",
      end: null,
    });
  });

  it("retains the existing start/end datetime API when date is also sent", async () => {
    const activityId = await id();
    await actions.update(
      post({
        id: activityId,
        ...valid,
        start: "2026-09-04T10:30",
        end: "2026-09-04T11:00",
        date: "2026-09-03",
      }),
    );
    expect((await getTable("activities"))[0].date).toEqual({
      start: "2026-09-04T10:30:00+09:00",
      end: "2026-09-04T11:00:00+09:00",
    });
  });

  it("rejects an invalid date even alongside a valid datetime", async () => {
    const activityId = await id();
    const result = await actions.update(
      post({ id: activityId, ...valid, date: "2026-02-30" }),
    );
    expect(result).toMatchObject({
      status: 400,
      data: {
        issues: { date: expect.any(String) },
        scope: "record-update",
        id: activityId,
      },
    });
  });

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

  // Audit LB28-2: a study session's activity takes its title and date from
  // the study editor; the refusal reaches the page as a 409 with its reason.
  it("refuses a paired activity's title change with the owner's name", async () => {
    const activityId = await id();
    await mutate("events", (rows) => [
      ...rows,
      {
        id: "e1",
        title: "정기 회의",
        date: { start: "2026-09-01T19:00:00+09:00", end: null },
        type: "회의" as const,
        status: "active" as const,
        pathId: "p",
        attendCode: "c",
        activityId,
        applicantIds: [],
        presenterIds: [],
        studyId: "study-1",
        sessionNo: 1,
        autoGenerated: false,
        sourceRequestId: null,
      },
    ]);

    const result = await actions.update(
      post({ id: activityId, title: "새 제목", type: "회의" }),
    );

    expect(result).toMatchObject({
      status: 409,
      data: {
        error: "CONFLICT",
        message: expect.stringContaining("스터디"),
        scope: "record-update",
        id: activityId,
        values: {
          title: "새 제목",
          type: "회의",
          date: "",
          start: "",
          end: "",
        },
      },
    });
    expect((await getTable("activities"))[0].title).toBe("정기 회의");
  });

  // Audit LC03-1: an end sent without a start used to be dropped silently.
  it("refuses an end without a start instead of dropping it", async () => {
    const result = await actions.update(
      post({ id: await id(), ...valid, start: "", end: "2026-09-01T21:00" }),
    );

    expect(result).toMatchObject({
      status: 400,
      data: {
        error: "VALIDATION_FAILED",
        issues: { start: expect.any(String) },
      },
    });
    const [row] = await getTable("activities");
    expect(row.date.end).toBeNull();
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

describe("scoped record failures and completion", () => {
  it("returns whitelisted raw values for an unavailable create", async () => {
    vi.spyOn(recordsAdmin, "createActivity").mockRejectedValueOnce(
      new AppError("SERVICE_UNAVAILABLE"),
    );
    const result = await actions.create(
      post({ ...valid, unrelated: "private" }),
    );
    expect(result).toMatchObject({
      status: 503,
      data: {
        error: "SERVICE_UNAVAILABLE",
        scope: "record-create",
        id: "",
        values: {
          title: valid.title,
          type: valid.type,
          start: valid.start,
          end: "",
          date: "",
        },
      },
    });
    expect(
      (result as unknown as { data: { values: object } }).data.values,
    ).not.toHaveProperty("unrelated");
  });

  it("scopes delete failures without echoing unrelated fields", async () => {
    const result = await actions.delete(
      post({ id: "missing", title: "unrelated", private: "secret" }),
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

  it("scopes attendee failures and preserves the submitted array separately", async () => {
    const result = await actions.setAttendees(
      post({ id: "missing", unrelated: "private" }, ["", "legacy-1", "m2"]),
    );
    expect(result).toMatchObject({
      status: 404,
      data: {
        error: "NOT_FOUND",
        scope: "record-attendees",
        id: "missing",
        values: {},
        attendeeIds: ["legacy-1", "m2"],
      },
    });
    expect(
      (result as unknown as { data: { values: object } }).data.values,
    ).toEqual({});
  });

  it("returns target metadata on attendee and delete success", async () => {
    await actions.create(post(valid));
    const [row] = await getTable("activities");
    expect(
      await actions.setAttendees(post({ id: row.id }, ["m1"])),
    ).toMatchObject({
      success: true,
      operation: "attendeesReplaced",
      scope: "record-attendees",
      id: row.id,
    });
    expect(await actions.delete(post({ id: row.id }))).toMatchObject({
      success: true,
      operation: "activityDeleted",
      scope: "record-delete",
      id: row.id,
    });
  });
});
