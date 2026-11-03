import { beforeEach, expect, it, vi } from "vitest";
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
vi.mock(
  "$lib/server/data/storage",
  () => import("$lib/server/data/storage-memory"),
);
import { __reset, __sql, __putRawDoc } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { createSeminar } from "./records-admin";

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["seminars", "seminar-series", "members"])
    await invalidateCache(`table_${t}`);
});

it("direct admin records create a parent and first session atomically", async () => {
  const seminar = await createSeminar({
    title: "대수",
    semester: "26-2",
    note: "",
    presenterIds: ["p"],
    externalPresenters: "",
  });
  const [stored] = await getTable("seminars");
  expect(stored).toMatchObject({
    id: seminar.id,
    seriesId: seminar.id,
    sessionNo: 1,
  });
  const out = await __sql<{ doc: { rows: unknown[] } }>(
    "select doc from app_tables where name='seminar-series'",
  );
  expect(out[0].doc.rows).toEqual([
    { id: seminar.id, title: "대수", description: "" },
  ]);
});

it("backfill preserves complete legacy records and is idempotent", async () => {
  const legacy = {
    id: "old",
    title: "기존",
    description: "소개",
    activityId: "activity",
    materials: ["paper.pdf"],
    announcedAt: "2026-10-01T00:00:00Z",
    schedule: null,
    sourceRequestId: "request",
  };
  await __putRawDoc("table", "seminars", { schemaVersion: 1, rows: [legacy] });
  await expect(
    __sql("select flow_link_seminar_series('{}'::jsonb)"),
  ).resolves.toBeDefined();
  await __sql("select flow_link_seminar_series('{}'::jsonb)");
  const out = await __sql<{ name: string; doc: { rows: unknown[] } }>(
    "select name,doc from app_tables where name in ('seminars','seminar-series') order by name",
  );
  expect(out[0].doc.rows).toEqual([
    { id: "old", title: "기존", description: "소개" },
  ]);
  expect(out[1].doc.rows).toEqual([
    { ...legacy, seriesId: "old", sessionNo: 1 },
  ]);
});

it("only a stored administrator can create a series", async () => {
  await expect(
    __sql("select flow_admin_seminar_series($1::jsonb)", [
      JSON.stringify({
        operation: "create",
        actorMemberId: "visitor",
        series: { id: "series", title: "제목", description: "" },
        auditId: "audit",
        auditAt: "2026-11-03T00:00:00Z",
      }),
    ]),
  ).rejects.toThrow("FORBIDDEN");
});

it("concurrent sessions get unique numbers and independent publication state", async () => {
  await __putRawDoc("table", "members", {
    schemaVersion: 1,
    rows: [
      { id: "admin", isAdmin: true, status: "regular" },
      { id: "one", status: "regular" },
      { id: "two", status: "regular" },
    ],
  });
  const args = { actorMemberId: "admin", auditAt: "2026-11-03T00:00:00Z" };
  await expect(
    __sql("select flow_admin_seminar_series($1::jsonb)", [
      JSON.stringify({
        ...args,
        operation: "create",
        series: { id: "parent", title: "위상", description: "소개" },
        auditId: "created",
      }),
    ]),
  ).resolves.toBeDefined();
  await Promise.all(
    ["one", "two"].map((id) =>
      __sql("select flow_admin_seminar_series($1::jsonb)", [
        JSON.stringify({
          ...args,
          operation: "session",
          seriesId: "parent",
          seminar: {
            id,
            title: "",
            publicationStatus: "unscheduled",
            presenterIds: [id],
            announce: true,
          },
          auditId: `audit-${id}`,
        }),
      ]),
    ),
  );
  const rows = await __sql<{
    doc: {
      rows: Array<{
        sessionNo: number;
        presenterIds: string[];
        publicationStatus: string;
      }>;
    };
  }>("select doc from app_tables where name='seminars'");
  expect(rows[0].doc.rows.map((r) => r.sessionNo)).toEqual([1, 2]);
  expect(rows[0].doc.rows.map((r) => r.presenterIds)).toEqual([
    ["one"],
    ["two"],
  ]);
  expect(
    rows[0].doc.rows.every((r) => r.publicationStatus === "unscheduled"),
  ).toBe(true);
});

it("admin attendance changes only the selected session and keeps actor audit", async () => {
  await __putRawDoc("table", "members", {
    schemaVersion: 1,
    rows: [{ id: "admin", isAdmin: true, status: "regular" }, { id: "person" }],
  });
  await __putRawDoc("table", "seminar-series", {
    schemaVersion: 1,
    rows: [{ id: "parent", title: "상위", description: "" }],
  });
  await __putRawDoc("table", "seminars", {
    schemaVersion: 1,
    rows: [
      {
        id: "one",
        seriesId: "parent",
        activityId: "a1",
        publicationStatus: "published",
      },
      {
        id: "two",
        seriesId: "parent",
        activityId: "a2",
        publicationStatus: "published",
      },
    ],
  });
  await __putRawDoc("table", "activities", {
    schemaVersion: 1,
    rows: [
      { id: "a1", attendeeIds: [] },
      { id: "a2", attendeeIds: ["other"] },
    ],
  });
  await __putRawDoc("table", "events", {
    schemaVersion: 1,
    rows: [{ id: "e1", activityId: "a1", studyId: null }],
  });
  const { setSeminarSessionAttendance } = await import("./seminar-series");
  await expect(
    setSeminarSessionAttendance("admin", "parent", "one", ["person"]),
  ).resolves.toBeUndefined();
  const rows = await __sql<{ doc: { rows: unknown[] } }>(
    "select doc from app_tables where name='activities'",
  );
  expect(rows[0].doc.rows).toEqual([
    { id: "a1", attendeeIds: ["person"] },
    { id: "a2", attendeeIds: ["other"] },
  ]);
  const audit = await __sql<{ actor: string }>(
    "select actor from audit_log where action='seminar-series.attendance'",
  );
  expect(audit[0].actor).toBe("admin");
});

it("an old writer cannot detach a grouped session during rolling deployment", async () => {
  await __putRawDoc("table", "seminar-series", {
    schemaVersion: 1,
    rows: [{ id: "parent", title: "기존 상위", description: "" }],
  });
  await __putRawDoc("table", "seminars", {
    schemaVersion: 1,
    rows: [{ id: "session", title: "2회차", seriesId: "parent", sessionNo: 2 }],
  });
  await __putRawDoc("table", "seminars", {
    schemaVersion: 1,
    rows: [{ id: "session", title: "수정 제목" }],
  });
  await __sql("select flow_link_seminar_series('{}'::jsonb)");
  const sessions = await __sql<{ doc: { rows: unknown[] } }>(
    "select doc from app_tables where name='seminars'",
  );
  expect(sessions[0].doc.rows).toEqual([
    { id: "session", title: "수정 제목", seriesId: "parent", sessionNo: 2 },
  ]);
  const parents = await __sql<{ doc: { rows: unknown[] } }>(
    "select doc from app_tables where name='seminar-series'",
  );
  expect(parents[0].doc.rows).toHaveLength(1);
});

it("refuses a presenter outside the current non-withdrawn member list", async () => {
  await __putRawDoc("table", "members", {
    schemaVersion: 1,
    rows: [
      { id: "admin", isAdmin: true, status: "regular" },
      { id: "gone", status: "withdrawn" },
    ],
  });
  await __putRawDoc("table", "seminar-series", {
    schemaVersion: 1,
    rows: [{ id: "parent", title: "제목", description: "" }],
  });
  const { createSeminarSeriesSession } = await import("./seminar-series");
  await expect(
    createSeminarSeriesSession("admin", "parent", {
      semester: "26-2",
      presenterIds: ["gone"],
    }),
  ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  const rows = await __sql<{ doc: { rows: unknown[] } }>(
    "select doc from app_tables where name='seminars'",
  );
  expect(rows[0]?.doc.rows ?? []).toEqual([]);
});

it("publishing and recording attendance in one session leaves its sibling untouched", async () => {
  await __putRawDoc("table", "members", {
    schemaVersion: 1,
    rows: [
      { id: "admin", isAdmin: true, status: "regular" },
      { id: "p1", status: "regular" },
      { id: "p2", status: "regular" },
      { id: "attendee", status: "regular" },
    ],
  });
  const {
    createSeminarSeries,
    createSeminarSeriesSession,
    setSeminarSessionAttendance,
  } = await import("./seminar-series");
  const { scheduleSeminar, publishSeminar } = await import("./seminars");
  const parent = await createSeminarSeries("admin", {
    title: "다회차",
    description: "",
  });
  const first = await createSeminarSeriesSession("admin", parent.id, {
    semester: "26-2",
    presenterIds: ["p1"],
  });
  const second = await createSeminarSeriesSession("admin", parent.id, {
    semester: "26-2",
    presenterIds: ["p2"],
  });
  await scheduleSeminar(first.id, {
    startsAt: "2031-11-03T19:00:00+09:00",
    startTime: "19:00",
    endsAt: null,
    location: "27동",
  });
  const published = await publishSeminar(first.id);
  await setSeminarSessionAttendance("admin", parent.id, first.id, [
    "p1",
    "attendee",
  ]);
  const stored = await getTable("seminars");
  expect(stored.find((s) => s.id === second.id)).toMatchObject({
    publicationStatus: "unscheduled",
    schedule: null,
    activityId: null,
    announcedAt: null,
    presenterIds: ["p2"],
  });
  expect(await getTable("activities")).toMatchObject([
    {
      id: published.activityId,
      attendeeIds: expect.arrayContaining(["p1", "attendee"]),
    },
  ]);
  expect(await getTable("events")).toHaveLength(1);
});

it("backfill preserves every generated legacy payload and converges on replay", async () => {
  // Seeded generation exercises Unicode, optional keys and unrelated nested data.
  let seed = 7361;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  const legacy = Array.from({ length: 20 }, (_, i) => ({
    id: `generated-${i}`,
    title: `위상 ${next()} <제목>`,
    description: i % 2 ? "" : `소개 ${next()}`,
    materials: [`자료/${next()}.pdf`],
    activityId: i % 3 ? `a-${i}` : null,
    announcedAt: i % 2 ? null : "2026-10-01T00:00:00Z",
    extra: { untouched: [next(), next()] },
  }));
  await __putRawDoc("table", "seminars", { schemaVersion: 1, rows: legacy });
  await __sql("select flow_link_seminar_series('{}'::jsonb)");
  const before = await __sql<{ doc: unknown }>(
    "select doc from app_tables where name in ('seminars','seminar-series') order by name",
  );
  await __sql("select flow_link_seminar_series('{}'::jsonb)");
  expect(
    await __sql(
      "select doc from app_tables where name in ('seminars','seminar-series') order by name",
    ),
  ).toEqual(before);
  const sessions = await __sql<{
    doc: { rows: Array<Record<string, unknown>> };
  }>("select doc from app_tables where name='seminars'");
  for (const original of legacy)
    expect(sessions[0].doc.rows.find((s) => s.id === original.id)).toEqual({
      ...original,
      seriesId: original.id,
      sessionNo: 1,
    });
});

it.each([
  { title: "긴".repeat(301), description: "소개" },
  { title: "제목", description: "긴".repeat(20001) },
  { title: "   ", description: "공백 제목도 기존 유효 기록" },
])(
  "reads backfilled valid legacy text without applying new-input limits",
  async (text) => {
    const original = await createSeminar({
      title: text.title,
      semester: "26-2",
      note: "",
      presenterIds: [],
      externalPresenters: "",
    });
    await __putRawDoc("table", "seminars", {
      schemaVersion: 1,
      rows: [
        {
          ...original,
          seriesId: null,
          sessionNo: null,
          description: text.description,
        },
      ],
    });
    await __putRawDoc("table", "seminar-series", {
      schemaVersion: 1,
      rows: [],
    });
    await __sql("select flow_link_seminar_series('{}'::jsonb)");
    await __sql("select flow_link_seminar_series('{}'::jsonb)");
    const { getSeminarSeries } = await import("./seminar-series");
    await expect(getSeminarSeries()).resolves.toMatchObject([
      { id: original.id, ...text },
    ]);
  },
);

it.each([
  { title: "   ", description: "" },
  { title: "긴".repeat(301), description: "" },
  { title: "제목", description: "긴".repeat(20001) },
])(
  "rejects invalid new inputs while keeping legacy storage readable",
  async (input) => {
    const { createSeminarSeries, updateSeminarSeries } =
      await import("./seminar-series");
    await expect(createSeminarSeries("admin", input)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(
      updateSeminarSeries("admin", "parent", input),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  },
);
