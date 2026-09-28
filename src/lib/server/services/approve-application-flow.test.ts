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
import { callFlow } from "$lib/server/data/flows";
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

// Decision #3 (audit LC11-3): approval is the one path that creates a
// member row, and no new row may start without a join date. The flow writes
// straight to the table — past the TS write gate — so the rule is its own.
describe("join date on the new member row", () => {
  const flowArgs = (id: string, today: string) => ({
    id,
    now: "2026-09-28T10:00:00+09:00",
    today,
    term: "26-2",
    adminEmailHashes: [],
    memberId: "M-NEW",
    privateInfoId: "P-NEW",
    registrationId: "R-NEW",
  });

  it("is the legacy join date, or today when the archive has none", async () => {
    await __putRawDoc("table", "legacy-members", {
      schemaVersion: 1,
      rows: [
        {
          id: "LEG1",
          name: "김기존",
          department: "수리과학부",
          joinedAt: null,
          status: "associate",
          statusChangedAt: "2022-03-05T00:00:00+09:00",
          withdrawal: null,
          isAlumni: false,
          alumniRevoked: false,
          roles: [],
          isAdmin: false,
          publicContact: null,
          alumniRevocationReason: null,
          project: null,
          legacyMemberId: null,
          sourceRequestId: null,
        },
      ],
    });
    await __putRawDoc("table", "legacy-private-info", {
      schemaVersion: 1,
      rows: [
        {
          id: "LEGP1",
          memberId: "LEG1",
          email: "old@snu.ac.kr",
          phone: "010-0000-0000",
          studentId: "",
          background: "",
          mailPrefs: { announcements: true },
          hidePublicPhone: false,
          sourceRequestId: null,
        },
      ],
    });

    const { id } = await apply("old@snu.ac.kr");
    await callFlow("flow_approve_application", flowArgs(id, "2026-09-28"));

    const [member] = await getTable("members");
    expect(member.legacyMemberId).toBe("LEG1");
    expect(member.joinedAt).toBe("2026-09-28");
  });

  it("refuses to create a member whose join date is not a date", async () => {
    const { id } = await apply("new@snu.ac.kr");

    await expect(
      callFlow("flow_approve_application", flowArgs(id, "someday")),
    ).rejects.toSatisfy((e) => codeOf(e) === "VALIDATION_FAILED");
    expect(await getTable("members")).toEqual([]);
    expect(await getTable("applications")).toHaveLength(1);
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
