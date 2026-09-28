import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
// A fixed audit id lets a test make the audit insert fail (primary key).
const stamp = vi.hoisted(() => ({ id: null as string | null }));
vi.mock("$lib/server/data/audit", async (importOriginal) => {
  const real = await importOriginal<typeof import("$lib/server/data/audit")>();
  return {
    ...real,
    auditStamp: () => {
      const s = real.auditStamp();
      return stamp.id ? { ...s, auditId: stamp.id } : s;
    },
  };
});

import { __auditRows, __reset, __sql } from "$lib/server/data/store-memory";
import { expectTablesValid } from "$lib/server/data/expect-tables-valid";
import {
  _resetDataLayerForTests,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { newId } from "$lib/server/core/id";
import { nowKstIso } from "$lib/server/core/time";
import type { Member } from "$lib/server/data/schemas";
import { cancelWithdrawal, requestWithdrawal } from "./withdrawal";
import { holdWithdrawal, releaseWithdrawalHold } from "./members-admin";

/**
 * Withdrawal-lifecycle audit rows are destruction evidence (API-SPEC §1-5):
 * "audit failure fails the action". The status change used to commit first
 * and the audit insert second, so a failed insert left an unaudited
 * withdrawal behind an error page. flow_request_withdrawal and
 * flow_member_withdrawal write both in one transaction.
 */

async function seed(over: Partial<Member> = {}): Promise<Member> {
  const m: Member = {
    id: newId(),
    name: "홍길동",
    department: "수리과학부",
    joinedAt: "2024-03-01",
    status: "regular",
    statusChangedAt: nowKstIso(),
    withdrawal: null,
    isAlumni: true,
    alumniRevoked: false,
    roles: [],
    isAdmin: false,
    publicContact: null,
    alumniRevocationReason: null,
    project: null,
    legacyMemberId: null,
    sourceRequestId: null,
    ...over,
  };
  await mutate("members", (rows) => [...rows, m]);
  return m;
}
const confirm = (name: string) => ({
  ackInfo: true,
  ackDataPolicy: true,
  confirmName: ` ${name} `,
});
const takenAuditId = async () => {
  const id = newId();
  await __sql(
    `insert into audit_log (id, actor, action, target_tb, target_id)
     values ($1, 'x', 'x', 'x', 'x')`,
    [id],
  );
  return id;
};

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  stamp.id = null;
  for (const t of ["members", "studies"]) await invalidateCache(`table_${t}`);
});
afterEach(expectTablesValid);

describe("the change and its audit row commit together", () => {
  it("request: a failed audit insert leaves the member as they were", async () => {
    const m = await seed();
    stamp.id = await takenAuditId();

    await expect(requestWithdrawal(m.id, confirm(m.name))).rejects.toThrow();

    expect((await getTable("members"))[0].status).toBe("regular");
  });

  it("request: success writes exactly one withdrawal.request row", async () => {
    const m = await seed();
    await requestWithdrawal(m.id, confirm(m.name)); // name is trimmed

    const rows = (await __auditRows()).filter((r) =>
      r.action.startsWith("withdrawal."),
    );
    expect(rows.map((r) => [r.action, r.actor, r.target_id])).toEqual([
      ["withdrawal.request", m.id, m.id],
    ]);
  });

  it("cancel, hold and release: each audited, none without its row", async () => {
    const m = await seed({ status: "associate" });
    await requestWithdrawal(m.id, confirm(m.name));

    await holdWithdrawal(m.id, "admin-1");
    stamp.id = await takenAuditId();
    await expect(releaseWithdrawalHold(m.id, "admin-1")).rejects.toThrow();
    expect((await getTable("members"))[0].withdrawal?.holdBy).toBe("admin-1");

    stamp.id = null;
    await releaseWithdrawalHold(m.id, "admin-1");
    await cancelWithdrawal(m.id);

    const member = (await getTable("members"))[0];
    expect(member.status).toBe("associate"); // previous status restored
    expect(member.withdrawal).toBeNull();
    // (sorted: rows written within one millisecond have no reliable order)
    expect(
      (await __auditRows())
        .filter((r) => r.action.startsWith("withdrawal."))
        .map((r) => `${r.action} ${r.actor}`)
        .sort(),
    ).toEqual(
      [
        `withdrawal.request ${m.id}`,
        "withdrawal.hold admin-1",
        "withdrawal.release-hold admin-1",
        `withdrawal.cancel ${m.id}`,
      ].sort(),
    );
  });
});

describe("request: an organizer listed by their legacy id", () => {
  // Migrated studies list organizers by their pre-return (legacy) id. The
  // check compared the current id only, so a returning organizer could
  // withdraw without handing over (audit LB02-6).
  it("must hand over first too", async () => {
    const m = await seed({ legacyMemberId: "legacy-1" });
    await mutate("studies", () => [
      {
        id: newId(),
        title: "해석학",
        semester: "26-2",
        textbook: "",
        description: "",
        note: "",
        organizerIds: ["legacy-1"],
        participantIds: ["legacy-1"],
        pendingParticipantIds: [],
        pendingTransfer: null,
        schedule: [],
        transferHistory: [],
        photos: [],
        status: "ongoing" as const,
        sourceRequestId: null,
      },
    ]);

    await expect(requestWithdrawal(m.id, confirm(m.name))).rejects.toThrow(
      "CONFLICT",
    );
    expect((await getTable("members"))[0].status).toBe("regular");
  });
});

describe("request: an organizer must hand over first", () => {
  it("refuses while organizing an unfinished study", async () => {
    const m = await seed();
    await mutate("studies", () => [
      {
        id: newId(),
        title: "해석학",
        semester: "26-2",
        textbook: "",
        description: "",
        note: "",
        organizerIds: [m.id],
        participantIds: [m.id],
        pendingParticipantIds: [],
        pendingTransfer: null,
        schedule: [],
        transferHistory: [],
        photos: [],
        status: "ongoing" as const,
        sourceRequestId: null,
      },
    ]);

    await expect(requestWithdrawal(m.id, confirm(m.name))).rejects.toThrow(
      "CONFLICT",
    );
    expect((await getTable("members"))[0].status).toBe("regular");
    expect(await __auditRows()).toEqual([]);
  });
});
