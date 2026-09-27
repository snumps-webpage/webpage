import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __putRawDoc, __reset } from "$lib/server/data/store-memory";
import {
  _resetDataLayerForTests,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { AppError } from "$lib/server/core/errors";
import { currentTerm } from "$lib/server/core/semester";
import { nowKstIso } from "$lib/server/core/time";
import type { Member } from "$lib/server/data/schemas";
import { assignRole, unassignRole } from "./executives-admin";

/**
 * The executives page offered only non-withdrawn candidates, but assignRole
 * itself accepted anyone — and a withdrawing 회장 then appeared on the public
 * roster (and received the club's withdrawal notices) (audit LB22-2).
 */

const member = (over: Partial<Member>): Member => ({
  id: "m1",
  name: "회원",
  department: "수리과학부",
  joinedAt: "2024-03-01",
  status: "regular",
  statusChangedAt: nowKstIso(),
  withdrawal: null,
  isAlumni: false,
  alumniRevoked: false,
  roles: [],
  isAdmin: false,
  publicContact: null,
  project: null,
  legacyMemberId: null,
  sourceRequestId: null,
  ...over,
});

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["members", "role-titles"])
    await invalidateCache(`table_${t}`);
});

describe("assignRole", () => {
  it("refuses a member with a pending withdrawal", async () => {
    await mutate("members", () => [
      member({
        status: "withdrawn",
        withdrawal: {
          requestedAt: nowKstIso(),
          previousStatus: "regular",
          holdBy: null,
          holdAt: null,
        },
      }),
    ]);

    await expect(
      assignRole({
        memberId: "m1",
        term: currentTerm(),
        title: "회장",
        actorId: "a",
      }),
    ).rejects.toSatisfy((e) => e instanceof AppError && e.code === "CONFLICT");
    expect((await getTable("members"))[0].roles).toEqual([]);
  });

  it("assigns an active member", async () => {
    await mutate("members", () => [member({})]);
    await assignRole({
      memberId: "m1",
      term: currentTerm(),
      title: "회장",
      actorId: "a",
    });
    expect((await getTable("members"))[0].roles).toEqual([
      { term: currentTerm(), title: "회장" },
    ]);
  });
});

// Assign and unassign read the member through the cache, built the whole
// roles array from that row and overwrote the member's roles with it: an
// edit another instance made within the cache's lifetime was silently
// undone (audit LB22-1). The change is now applied to the latest row.
describe("role changes apply to the latest row", () => {
  const behindTheCache = async (roles: Member["roles"]) => {
    await getTable("members"); // this instance caches the old row
    await __putRawDoc("table", "members", {
      schemaVersion: 1,
      rows: [member({ roles })],
    });
  };

  it("assignRole keeps a role added elsewhere", async () => {
    await mutate("members", () => [member({})]);
    await behindTheCache([{ term: currentTerm(), title: "총무" }]);

    await assignRole({
      memberId: "m1",
      term: currentTerm(),
      title: "회장",
      actorId: "a",
    });

    expect((await getTable("members"))[0].roles).toEqual([
      { term: currentTerm(), title: "총무" },
      { term: currentTerm(), title: "회장" },
    ]);
  });

  it("unassignRole keeps a role added elsewhere", async () => {
    await mutate("members", () => [
      member({ roles: [{ term: currentTerm(), title: "회장" }] }),
    ]);
    await behindTheCache([
      { term: currentTerm(), title: "회장" },
      { term: currentTerm(), title: "총무" },
    ]);

    await unassignRole({
      memberId: "m1",
      term: currentTerm(),
      title: "회장",
      actorId: "a",
    });

    expect((await getTable("members"))[0].roles).toEqual([
      { term: currentTerm(), title: "총무" },
    ]);
  });
});
