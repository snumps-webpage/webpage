import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, mutate } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { currentTerm } from "$lib/server/core/semester";
import { nowKstIso } from "$lib/server/core/time";
import type { Member, PrivateInfo } from "$lib/server/data/schemas";
import { getPublicExecutives } from "./archive";

/**
 * The current president/vice-president's phone is published automatically
 * unless they opted out (hidePublicPhone). A returning member's opt-out only
 * removed the entry under their new id, and the lookup then fell back to the
 * old archive row under their legacy id — the opted-out phone was published
 * on every page (audit 🔴 LB16-1, reproduced). A withdrawing executive's
 * phone was published too (LB16-2).
 */

const term = () => currentTerm();

const member = (over: Partial<Member>): Member => ({
  id: "m",
  name: "회장",
  department: "수리과학부",
  joinedAt: "2024-03-01",
  status: "regular",
  statusChangedAt: nowKstIso(),
  withdrawal: null,
  isAlumni: false,
  alumniRevoked: false,
  roles: [{ term: term(), title: "회장" }],
  isAdmin: false,
  publicContact: null,
  project: null,
  legacyMemberId: null,
  sourceRequestId: null,
  ...over,
});
const info = (over: Partial<PrivateInfo>): PrivateInfo => ({
  id: `p-${over.memberId}`,
  memberId: "m",
  email: `${over.memberId}@snu.ac.kr`,
  phone: "010-1111-2222",
  background: "",
  studentId: "",
  mailPrefs: { announcements: true },
  hidePublicPhone: false,
  sourceRequestId: null,
  ...over,
});

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of [
    "members",
    "private-info",
    "legacy-members",
    "legacy-private-info",
  ])
    await invalidateCache(`table_${t}`);
});

const currentContact = async () => {
  const [latest] = await getPublicExecutives();
  expect(latest.term).toBe(term());
  return latest.holders[0].contact;
};

describe("public executives' phone", () => {
  it("honours a returning member's opt-out over their archived phone", async () => {
    await mutate("members", () => [
      member({ id: "new", legacyMemberId: "old" }),
    ]);
    await mutate("private-info", () => [
      info({ memberId: "new", phone: "010-1111-2222", hidePublicPhone: true }),
    ]);
    await mutate("legacy-members", () => [member({ id: "old", roles: [] })]);
    await mutate("legacy-private-info", () => [
      info({ memberId: "old", phone: "010-9999-8888" }),
    ]);

    expect(await currentContact()).toBeNull();
  });

  it("still falls back to the archive when the current row has no phone", async () => {
    await mutate("members", () => [
      member({ id: "new", legacyMemberId: "old" }),
    ]);
    await mutate("private-info", () => [info({ memberId: "new", phone: "" })]);
    await mutate("legacy-members", () => [member({ id: "old", roles: [] })]);
    await mutate("legacy-private-info", () => [
      info({ memberId: "old", phone: "010-9999-8888" }),
    ]);

    expect(await currentContact()).toBe("010-9999-8888");
  });

  it("publishes no phone for an executive who is withdrawing", async () => {
    await mutate("members", () => [
      member({
        id: "w",
        status: "withdrawn",
        withdrawal: {
          requestedAt: nowKstIso(),
          previousStatus: "regular",
          holdBy: null,
          holdAt: null,
        },
      }),
    ]);
    await mutate("private-info", () => [info({ memberId: "w" })]);

    expect(await currentContact()).toBeNull();
  });
});
