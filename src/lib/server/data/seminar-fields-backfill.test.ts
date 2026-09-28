import { beforeEach, describe, expect, it } from "vitest";
import backfill from "/supabase/migrations/20260928000300_seminar_fields.sql?raw";
import { __docs, __putRawDoc, __reset, __sql } from "./store-memory";

/**
 * The backfill that lets SeminarSchema require kind, durationMinutes,
 * prerequisites and announce (decisions #7, #12, #21) without a zod default:
 *   - a seminar approved from a request takes the request's kind and
 *     prerequisites (what approval now copies); any other row has kind null
 *     and prerequisites "";
 *   - durationMinutes is null — the request's duration is free text, never
 *     parsed into minutes;
 *   - announce is true — every existing row is an announcement target today
 *     (a published row with announcedAt null and a future date is announced),
 *     and rows made by the record editor cannot be told apart from migrated
 *     ones on disk.
 */

type Row = Record<string, unknown>;
const seminarsDoc = async () =>
  (await __docs("table")).get("seminars") as {
    doc: { rows: Row[] };
    version: number;
  };

const request = (id: string, over: Row = {}) => ({
  id,
  kind: "regular",
  prerequisites: "군론 기초",
  ...over,
});

beforeEach(async () => {
  await __reset();
});

describe("20260928000300_seminar_fields", () => {
  it("fills the four fields where missing, from the source request when there is one", async () => {
    await __putRawDoc("table", "seminar-requests", {
      schemaVersion: 1,
      rows: [request("r1"), request("r2", { kind: null, prerequisites: "" })],
    });
    await __putRawDoc("table", "seminars", {
      schemaVersion: 1,
      rows: [
        { id: "legacy", title: "이주", sourceRequestId: null },
        { id: "fromRequest", title: "신청", sourceRequestId: "r1" },
        { id: "nullKind", title: "신청2", sourceRequestId: "r2" },
        { id: "orphan", title: "고아", sourceRequestId: "gone" },
      ],
    });

    await __sql(backfill);

    const { doc } = await seminarsDoc();
    const pick = (r: Row) => [
      r.id,
      r.kind,
      r.durationMinutes,
      r.prerequisites,
      r.announce,
    ];
    expect(doc.rows.map(pick)).toEqual([
      ["legacy", null, null, "", true],
      ["fromRequest", "regular", null, "군론 기초", true],
      ["nullKind", null, null, "", true],
      ["orphan", null, null, "", true],
    ]);
    // the rest of the row untouched, keys written out (not left to a default)
    expect(doc.rows[0]).toMatchObject({ title: "이주", sourceRequestId: null });
    for (const r of doc.rows) {
      for (const key of [
        "kind",
        "durationMinutes",
        "prerequisites",
        "announce",
      ])
        expect(key in r).toBe(true);
    }
  });

  it("keeps every value already written, null included", async () => {
    const written = {
      id: "s",
      kind: null,
      durationMinutes: null,
      prerequisites: "직접 적음",
      announce: false,
      sourceRequestId: "r1",
    };
    await __putRawDoc("table", "seminar-requests", {
      schemaVersion: 1,
      rows: [request("r1")],
    });
    await __putRawDoc("table", "seminars", {
      schemaVersion: 1,
      rows: [
        written,
        { ...written, id: "t", kind: "irregular", durationMinutes: 90 },
      ],
    });
    const before = await seminarsDoc();

    await __sql(backfill);

    // nothing to fill → not even the version moves
    expect(await seminarsDoc()).toEqual(before);
  });

  it("replaces a value of the wrong type", async () => {
    await __putRawDoc("table", "seminars", {
      schemaVersion: 1,
      rows: [
        {
          id: "s",
          kind: 3,
          durationMinutes: "60분",
          prerequisites: null,
          announce: "yes",
          sourceRequestId: null,
        },
      ],
    });

    await __sql(backfill);

    const { doc } = await seminarsDoc();
    expect(doc.rows[0]).toMatchObject({
      kind: null,
      durationMinutes: null,
      prerequisites: "",
      announce: true,
    });
  });

  it("is idempotent: a second run changes nothing, not even the version", async () => {
    await __putRawDoc("table", "seminars", {
      schemaVersion: 1,
      rows: [{ id: "legacy", sourceRequestId: null }],
    });
    await __sql(backfill);
    const first = await seminarsDoc();

    await __sql(backfill);

    expect(await seminarsDoc()).toEqual(first);
  });

  it("leaves an empty or missing seminars document alone", async () => {
    await __sql(backfill);
    expect((await __docs("table")).has("seminars")).toBe(false);
  });
});
