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
import { nowKstIso } from "$lib/server/core/time";
import { resolveMember } from "$lib/server/guards/resolve-member";
import { updatePrivateInfo } from "./members-admin";

/**
 * The private-info email is the login key: resolveMember takes the first row
 * whose email matches. An admin edit could give a second member the same
 * address, and one member's Google login then opened the other member's
 * record — with their admin rights (audit 🔴 LB25-1, reproduced).
 */

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["members", "private-info", "registrations"])
    await invalidateCache(`table_${t}`);
  const member = (id: string, name: string, isAdmin: boolean) => ({
    id,
    name,
    department: "수리과학부",
    joinedAt: "2024-03-01",
    status: "regular" as const,
    statusChangedAt: nowKstIso(),
    withdrawal: null,
    isAlumni: false,
    alumniRevoked: false,
    roles: [],
    isAdmin,
    publicContact: null,
    project: null,
    legacyMemberId: null,
    sourceRequestId: null,
  });
  const info = (id: string, memberId: string, email: string) => ({
    id,
    memberId,
    email,
    phone: "010-1111-2222",
    background: "",
    studentId: "",
    mailPrefs: { announcements: true },
    hidePublicPhone: false,
    sourceRequestId: null,
  });
  await mutate("members", () => [
    member("bob", "밥", true),
    member("alice", "앨리스", false),
  ]);
  await mutate("private-info", () => [
    info("p-bob", "bob", "bob@snu.ac.kr"),
    info("p-alice", "alice", "alice@snu.ac.kr"),
  ]);
});

const isConflict = (e: unknown) =>
  e instanceof AppError && e.code === "CONFLICT";

describe("updatePrivateInfo keeps the login email unique", () => {
  it.each([" Alice@SNU.ac.kr ", "alice@snu.ac.kr"])(
    "refuses to give one member another member's address (%s)",
    async (email) => {
      await expect(
        updatePrivateInfo("bob", { email }, "admin"),
      ).rejects.toSatisfy(isConflict);

      const bob = (await getTable("private-info")).find(
        (p) => p.memberId === "bob",
      );
      expect(bob?.email).toBe("bob@snu.ac.kr");
      expect((await resolveMember("alice@snu.ac.kr"))?.memberId).toBe("alice");
      expect((await resolveMember("bob@snu.ac.kr"))?.memberId).toBe("bob");
    },
  );

  it("still lets a member keep, re-case or change their own address", async () => {
    await updatePrivateInfo("bob", { email: "BOB@snu.ac.kr" }, "admin");
    await updatePrivateInfo("bob", { email: "bob2@snu.ac.kr" }, "admin");
    expect((await resolveMember("bob2@snu.ac.kr"))?.memberId).toBe("bob");
  });
});
