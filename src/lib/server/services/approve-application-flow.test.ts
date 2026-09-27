import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __putRawDoc, __reset } from "$lib/server/data/store-memory";
import { expectTablesValid } from "$lib/server/data/expect-tables-valid";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { AppError } from "$lib/server/core/errors";
import {
  approveApplication,
  rejectApplication,
  submitApplication,
} from "./membership";

/**
 * flow_approve_application: the S9 conversion as one transaction. The
 * bootstrap-admin stamp travels as email hashes, and an approve racing a
 * reject can no longer leave a member behind a rejected application.
 */

const codeOf = (e: unknown) => (e instanceof AppError ? e.code : String(e));
const apply = (email: string) =>
  submitApplication({
    email,
    name: "지원자",
    department: "수리과학부",
    phone: "010-1234-5678",
    studentId: "2024-12345",
    background: "",
  });

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  testEnv.ADMINS_EMAILS = "";
  for (const t of ["applications", "members", "private-info", "registrations"])
    await invalidateCache(`table_${t}`);
});
afterEach(expectTablesValid);

describe("bootstrap admin stamp", () => {
  it("stamps isAdmin on a new member whose email is on the list", async () => {
    testEnv.ADMINS_EMAILS = "other@snu.ac.kr, Boss@SNU.ac.kr ";
    await approveApplication((await apply("boss@snu.ac.kr")).id);
    await approveApplication((await apply("plain@snu.ac.kr")).id);

    const infos = await getTable("private-info");
    const adminOf = async (email: string) => {
      const memberId = infos.find((i) => i.email === email)!.memberId;
      return (await getTable("members")).find((m) => m.id === memberId)!
        .isAdmin;
    };
    expect(await adminOf("boss@snu.ac.kr")).toBe(true);
    expect(await adminOf("plain@snu.ac.kr")).toBe(false);
  });

  it("stamps a returning member too, and never takes it away", async () => {
    await approveApplication((await apply("back@snu.ac.kr")).id);
    expect((await getTable("members"))[0].isAdmin).toBe(false);

    testEnv.ADMINS_EMAILS = "back@snu.ac.kr";
    await approveApplication((await apply("back@snu.ac.kr")).id);
    expect((await getTable("members"))[0].isAdmin).toBe(true);

    testEnv.ADMINS_EMAILS = "";
    await approveApplication((await apply("back@snu.ac.kr")).id);
    expect((await getTable("members"))[0].isAdmin).toBe(true);
  });
});

describe("approve ∥ reject", () => {
  it.each([1, 2, 3, 4, 5])(
    "a rejected applicant never becomes a member (run %i)",
    async () => {
      const { id } = await apply("race@snu.ac.kr");

      const [ok, no] = await Promise.allSettled([
        approveApplication(id),
        rejectApplication(id),
      ]);

      const members = await getTable("members");
      expect(await getTable("applications")).toEqual([]);
      if (ok.status === "fulfilled") {
        // approve committed first; the reject found nothing to reject
        expect(no.status === "rejected" && codeOf(no.reason)).toBe("NOT_FOUND");
        expect(members).toHaveLength(1);
        expect(await getTable("registrations")).toHaveLength(1);
      } else {
        expect(codeOf(ok.reason)).toBe("NOT_FOUND");
        expect(members).toEqual([]);
        expect(await getTable("private-info")).toEqual([]);
        expect(await getTable("registrations")).toEqual([]);
      }
    },
  );

  it("approve after a reject the cache has not seen creates nothing", async () => {
    const { id } = await apply("late@snu.ac.kr");
    await getTable("applications"); // this instance caches the row
    // another instance rejects: the store changes, this cache does not
    await __putRawDoc("table", "applications", { schemaVersion: 1, rows: [] });

    await expect(approveApplication(id)).rejects.toSatisfy(
      (e) => codeOf(e) === "NOT_FOUND",
    );
    expect(await getTable("members")).toEqual([]);
    expect(await getTable("private-info")).toEqual([]);
  });
});
