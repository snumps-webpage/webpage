import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __putRawDoc, __reset, __sql } from "./store-memory";
import { expectTablesValid } from "./expect-tables-valid";
import { _resetDataLayerForTests, getTable } from "./tables";
import { invalidateCache } from "$lib/server/cache";
import {
  addSql,
  inspectSql,
  RULES,
  resultSql,
} from "../../../../scripts/ops/lib-add-member.mjs";

/**
 * scripts/ops/ops-add-member.mjs sends these statements through the Supabase
 * CLI. Here they run on PGlite with the same migrations: the member lands the
 * way an approved application does, a pending application with the same email
 * is refused, a refused conversion leaves nothing behind, and input cannot
 * become SQL.
 */

const TERM = "26-2";
const NOW = "2026-09-30T10:00:00+09:00";

const application = (over: Record<string, string> = {}) => ({
  id: "app-1",
  name: "김수학",
  email: "kim@snu.ac.kr",
  phone: "010-1234-5678",
  department: "수리과학부",
  studentId: "2024-12345",
  background: "",
  createdAt: NOW,
  ...over,
});
const approval = (over: Record<string, unknown> = {}) => ({
  id: "app-1",
  now: NOW,
  today: NOW.slice(0, 10),
  term: TERM,
  adminEmailHashes: [],
  memberId: "m-new",
  privateInfoId: "p-new",
  registrationId: "r-new",
  ...over,
});
const put = (name: string, rows: unknown[]) =>
  __putRawDoc("table", name, { schemaVersion: 1, rows });

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["applications", "members", "private-info", "registrations"])
    await invalidateCache(`table_${t}`);
});

describe("ops-add-member SQL", () => {
  it("adds a new member the way an approval does", async () => {
    const [state] = await __sql<Record<string, unknown>>(
      inspectSql("kim@snu.ac.kr", TERM),
    );
    expect(state).toMatchObject({
      flow_exists: true,
      pending_app: false,
      member_id: null,
      legacy: false,
    });

    await __sql(addSql(application(), approval()));

    const [done] = await __sql<Record<string, unknown>>(
      resultSql("kim@snu.ac.kr", TERM),
    );
    expect(done).toMatchObject({ member_id: "m-new", registered: true });
    const [member] = await getTable("members");
    expect(member).toMatchObject({
      name: "김수학",
      department: "수리과학부",
      status: "associate",
      isAdmin: false,
    });
    expect(await getTable("applications")).toEqual([]);
    await expectTablesValid();
  });

  it("re-registers a known email instead of creating a second member", async () => {
    await __sql(addSql(application(), approval()));
    await __sql(
      addSql(
        application({ id: "app-2", phone: "010-9999-8888" }),
        approval({
          id: "app-2",
          term: "27-1",
          memberId: "m-2",
          privateInfoId: "p-2",
          registrationId: "r-2",
        }),
      ),
    );

    expect((await getTable("members")).map((m) => m.id)).toEqual(["m-new"]);
    expect((await getTable("private-info"))[0].phone).toBe("010-9999-8888");
    expect((await getTable("registrations")).map((r) => r.term)).toEqual([
      TERM,
      "27-1",
    ]);
    await expectTablesValid();
  });

  it("refuses while an application with the same email is pending", async () => {
    await put("applications", [application({ id: "pending" })]);

    await expect(__sql(addSql(application(), approval()))).rejects.toThrow(
      /CONFLICT/,
    );

    expect((await getTable("applications")).map((a) => a.id)).toEqual([
      "pending",
    ]);
    expect(await getTable("members")).toEqual([]);
  });

  it("leaves nothing behind when the conversion is refused", async () => {
    await expect(
      __sql(addSql(application(), approval({ term: "" }))),
    ).rejects.toThrow(/VALIDATION_FAILED/);

    expect(await getTable("applications")).toEqual([]);
    expect(await getTable("members")).toEqual([]);
  });

  it("stores quotes, dollar signs and SQL-looking text as plain text", async () => {
    const name = "O'Brien $$; drop table app_tables; --";
    await __sql(addSql(application({ name }), approval()));

    expect((await getTable("members"))[0].name).toBe(name);
    expect(await getTable("private-info")).toHaveLength(1);
  });
});

describe("ops-add-member input rules", () => {
  it("normalizes a bare phone and refuses a non-SNU email", () => {
    expect(RULES.phone("01012345678")).toEqual({ value: "010-1234-5678" });
    expect(RULES.email(" Kim@SNU.ac.kr ")).toEqual({ value: "kim@snu.ac.kr" });
    expect(RULES.email("kim@gmail.com")).toHaveProperty("error");
    expect(RULES.studentId("2024-12345")).toEqual({ value: "2024-12345" });
    expect(RULES.studentId("24-1")).toHaveProperty("error");
  });
});
