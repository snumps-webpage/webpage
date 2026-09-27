import { beforeEach, describe, expect, it } from "vitest";
import backfill from "/supabase/migrations/20260928000100_seminar_publication_status.sql?raw";
import { __docs, __putRawDoc, __reset, __sql } from "./store-memory";

/**
 * The backfill that replaces SeminarSchema's `publicationStatus` default:
 * rows written before the field existed are published seminars.
 */

const row = (id: string, extra: object = {}) => ({ id, title: id, ...extra });
const seminarsDoc = async () =>
  (await __docs("table")).get("seminars") as {
    doc: { rows: Record<string, unknown>[] };
    version: number;
  };

beforeEach(async () => {
  await __reset();
});

describe("20260928000100_seminar_publication_status", () => {
  it("writes 'published' where the key is missing and keeps every explicit value", async () => {
    await __putRawDoc("table", "seminars", {
      schemaVersion: 1,
      rows: [
        row("legacy"),
        row("cancelled", { publicationStatus: "cancelled" }),
        row("unscheduled", { publicationStatus: "unscheduled" }),
      ],
    });

    await __sql(backfill);

    const { doc } = await seminarsDoc();
    expect(doc.rows.map((r) => [r.id, r.publicationStatus])).toEqual([
      ["legacy", "published"],
      ["cancelled", "cancelled"],
      ["unscheduled", "unscheduled"],
    ]);
    expect(doc.rows[0].title).toBe("legacy"); // the rest of the row untouched
  });

  it("is idempotent: a second run changes nothing, not even the version", async () => {
    await __putRawDoc("table", "seminars", {
      schemaVersion: 1,
      rows: [row("legacy")],
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
