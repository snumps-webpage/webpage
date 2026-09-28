import { beforeEach, describe, expect, it } from "vitest";
import backfill from "/supabase/migrations/20260928000400_member_revocation_reason.sql?raw";
import { __docs, __putRawDoc, __reset, __sql } from "./store-memory";

/**
 * Decision #18 (audit LA30-1): MemberSchema gained a required, nullable
 * `alumniRevocationReason`. The backfill writes `null` into every member and
 * legacy-member row that predates the field — the reasons given before it
 * live only in the append-only audit log and stay there.
 */

const row = (id: string, extra: object = {}) => ({ id, name: id, ...extra });
const rowsOf = async (name: string) =>
  (
    (await __docs("table")).get(name) as {
      doc: { rows: Record<string, unknown>[] };
    }
  ).doc.rows;

beforeEach(async () => {
  await __reset();
});

describe("20260928000400_member_revocation_reason", () => {
  it("writes null where the key is missing and keeps every stored value", async () => {
    for (const name of ["members", "legacy-members"]) {
      await __putRawDoc("table", name, {
        schemaVersion: 1,
        rows: [
          row("old"),
          row("given", { alumniRevocationReason: "회칙상 유고" }),
          row("none", { alumniRevocationReason: null }),
        ],
      });
    }

    await __sql(backfill);

    for (const name of ["members", "legacy-members"]) {
      const rows = await rowsOf(name);
      expect(rows.map((r) => [r.id, r.alumniRevocationReason])).toEqual([
        ["old", null],
        ["given", "회칙상 유고"],
        ["none", null],
      ]);
      expect("alumniRevocationReason" in rows[0]).toBe(true);
      expect(rows[0].name).toBe("old"); // the rest of the row untouched
    }
  });

  it("is idempotent: a second run changes nothing, not even the version", async () => {
    await __putRawDoc("table", "members", {
      schemaVersion: 1,
      rows: [row("old")],
    });
    await __sql(backfill);
    const first = (await __docs("table")).get("members");

    await __sql(backfill);

    expect((await __docs("table")).get("members")).toEqual(first);
  });

  it("leaves missing documents alone", async () => {
    await __sql(backfill);
    const docs = await __docs("table");
    expect(docs.has("members")).toBe(false);
    expect(docs.has("legacy-members")).toBe(false);
  });
});
