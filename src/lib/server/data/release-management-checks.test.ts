// @vitest-environment node
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { __putRawDoc, __reset, __sql } from "./store-memory";

const script = readFileSync("scripts/ops/release-prod.sh", "utf8");
const sql = script.match(
  /write_check_sql\(\) \{\s+cat > "\$1" << 'SQL'\n([\s\S]*?)\nSQL/,
)![1];
const put = (name: string, rows: unknown[]) =>
  __putRawDoc("table", name, { schemaVersion: 1, rows });

beforeEach(async () => {
  await __reset();
  await __sql(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated;
    end if;
  end $$`);
});

describe("production release management checks", () => {
  it("matches the actual migrated flow count and rejects anonymous admin-flow execution", async () => {
    const [row] = await __sql<Record<string, unknown>>(sql);
    const expectedCount = Number(
      script.match(/const want = \{ flow_fns: (\d+)/)![1],
    );
    expect(Number(row.flow_fns)).toBe(expectedCount);
    expect(row.admin_anon_can_exec).toBe(false);
    expect(row.admin_authenticated_can_exec).toBe(false);
  });

  it("detects missing and dangling seminar-series links before accepting a release", async () => {
    await put("seminar-series", [{ id: "series" }]);
    await put("seminars", [
      { id: "ok", seriesId: "series", sessionNo: 1 },
      { id: "missing" },
      { id: "dangling", seriesId: "gone", sessionNo: 1 },
    ]);
    const [row] = await __sql<Record<string, unknown>>(sql);
    expect(Number(row.sem_bad_series)).toBe(2);
    expect(Number(row.sem_duplicate_session_slots)).toBe(0);
  });

  it("detects duplicate session numbers inside a series, allowing the same number across series", async () => {
    await put("seminar-series", [{ id: "one" }, { id: "two" }]);
    await put("seminars", [
      { id: "a", seriesId: "one", sessionNo: 1 },
      { id: "b", seriesId: "one", sessionNo: 1 },
      { id: "c", seriesId: "two", sessionNo: 1 },
    ]);
    const [row] = await __sql<Record<string, unknown>>(sql);
    expect(Number(row.sem_bad_series)).toBe(0);
    expect(Number(row.sem_duplicate_session_slots)).toBe(1);
  });
});
