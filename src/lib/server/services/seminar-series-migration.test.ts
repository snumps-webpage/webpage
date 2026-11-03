// @vitest-environment node
import { expect, it } from "vitest";
import { SeminarSeriesSchema } from "$lib/server/data/schemas";
import { freshDatabase } from "$lib/server/data/pglite-bootstrap";
const migrations = import.meta.glob("/supabase/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const target = "/supabase/migrations/20261103000100_seminar_series.sql";
it("migration replay preserves existing record ids, materials, notices and attendance", async () => {
  const db = await freshDatabase(
    (f) => migrations[f],
    Object.keys(migrations).filter((f) => f !== target),
  );
  try {
    const old = {
      id: "s1",
      title: "원래",
      description: "소개",
      materials: ["paper.pdf"],
      activityId: "a1",
      sourceRequestId: "request1",
      announcedAt: "2026-10-01T00:00:00Z",
      publicationStatus: "published",
      schedule: null,
    };
    const legacy = [
      old,
      { ...old, id: "long-title", title: "긴".repeat(301), activityId: null },
      {
        ...old,
        id: "long-description",
        description: "긴".repeat(20001),
        activityId: null,
      },
      { ...old, id: "whitespace-title", title: "   ", activityId: null },
    ];
    await db.query(
      "insert into app_tables(name,version,doc) values ('seminars',1,$1::jsonb),('events',1,$2::jsonb),('activities',1,$3::jsonb) on conflict(name) do update set doc=excluded.doc",
      [
        JSON.stringify({ schemaVersion: 1, rows: legacy }),
        JSON.stringify({
          schemaVersion: 1,
          rows: [
            {
              id: "e1",
              activityId: "a1",
              pathId: "kept-path",
              attendCode: "kept-code",
              applicantIds: ["person"],
            },
          ],
        }),
        JSON.stringify({
          schemaVersion: 1,
          rows: [{ id: "a1", attendeeIds: ["person"] }],
        }),
      ],
    );
    const before = (
      await db.query(
        "select name,doc from app_tables where name in ('events','activities') order by name",
      )
    ).rows;
    await db.exec(migrations[target]);
    await db.exec(migrations[target]);
    expect(
      (
        await db.query(
          "select name,doc from app_tables where name in ('events','activities') order by name",
        )
      ).rows,
    ).toEqual(before);
    const rows = (
      await db.query<{ doc: { rows: unknown[] } }>(
        "select doc from app_tables where name='seminars'",
      )
    ).rows;
    expect(rows[0].doc.rows).toEqual(
      legacy.map((row) => ({ ...row, seriesId: row.id, sessionNo: 1 })),
    );
    const parents = (
      await db.query<{ doc: { rows: unknown[] } }>(
        "select doc from app_tables where name='seminar-series'",
      )
    ).rows;
    expect(parents[0].doc.rows).toEqual(
      legacy.map(({ id, title, description }) => ({ id, title, description })),
    );
    expect(() =>
      SeminarSeriesSchema.array().parse(parents[0].doc.rows),
    ).not.toThrow();
  } finally {
    await db.close();
  }
}, 20000);
