import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __reset } from "$lib/server/data/store-memory";
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
import { assignRole } from "./executives-admin";

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
