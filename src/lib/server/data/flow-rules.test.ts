import { describe, expect, it } from "vitest";
import { __sql } from "./store-memory";
import { termOf } from "$lib/server/core/semester";

/**
 * The SQL mirrors of TS rules (supabase/migrations/20260928000000_atomic_flows.sql
 * §1b). A flow that derives a term differently from the TS readers files a
 * seminar under the wrong semester, so each mirror is checked against its
 * TS original on the edges.
 */

const sqlTerm = async (at: string) =>
  (await __sql<{ term: string }>("select app_term_of($1) as term", [at]))[0]
    .term;

describe("app_term_of mirrors termOf", () => {
  it.each([
    "2026-03-01T00:00:00+09:00", // first KST minute of term 1
    "2026-02-28T23:59:00+09:00", // last of the previous term 2
    "2026-02-28T15:30:00Z", // Mar 1 00:30 KST, still Feb 28 in UTC
    "2026-08-31T23:59:00+09:00",
    "2026-09-01T00:00:00+09:00",
    "2026-08-31T15:00:00Z", // Sep 1 00:00 KST
    "2026-12-31T23:59:00+09:00",
    "2027-01-01T00:00:00+09:00", // January belongs to 26-2
    "2028-02-29T12:00:00+09:00", // leap day
    "2099-10-01T19:00:00+09:00",
    "2100-01-15T19:00:00+09:00", // year % 100 = 0 → "99-2"
  ])("%s", async (at) => {
    expect(await sqlTerm(at)).toBe(termOf(new Date(at)));
  });
});

describe("app_may_derive_semester", () => {
  const may = async (sem: object) =>
    (
      await __sql<{ ok: boolean }>(
        "select app_may_derive_semester($1::jsonb) as ok",
        [JSON.stringify(sem)],
      )
    )[0].ok;

  it("derives a regular, unpinned term", async () => {
    expect(await may({ semester: "26-2", semesterPinned: false })).toBe(true);
    expect(await may({ semester: "26-1" })).toBe(true); // key absent = unpinned
  });

  it("keeps a pinned or vacation term", async () => {
    expect(await may({ semester: "26-2", semesterPinned: true })).toBe(false);
    expect(await may({ semester: "26-S" })).toBe(false);
    expect(await may({ semester: "26-W" })).toBe(false);
  });
});
