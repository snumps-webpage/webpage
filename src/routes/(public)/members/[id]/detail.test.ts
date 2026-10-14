import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __putRawDoc, __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, mutate } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { nowKstIso } from "$lib/server/core/time";
import { load } from "./+page.server";

/**
 * /members/[id] (snumps-webpage/D-000051): 운영 id와 legacy id를 모두 받는다.
 * 재가입 회원의 legacy id는 새 id의 주소로 영구 이동(301), 탈퇴·없는 id는 404.
 */

const base = {
  department: "수리과학부",
  joinedAt: "2024-03-01",
  status: "regular" as const,
  statusChangedAt: nowKstIso(),
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
};

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of [
    "members",
    "legacy-members",
    "seminars",
    "studies",
    "activities",
    "events",
  ]) {
    await invalidateCache(`table_${t}`);
  }
  __putRawDoc("table", "legacy-members", {
    schemaVersion: 1,
    rows: [{ ...base, id: "L1", name: "옛이름" }],
  });
  await mutate("members", () => [
    { ...base, id: "m1", name: "김수학", legacyMemberId: "L1" },
  ]);
});

const run = (id: string) => load({ params: { id } } as never);

describe("public member page", () => {
  it("renders an operational member", async () => {
    await expect(run("m1")).resolves.toMatchObject({
      member: { id: "m1", name: "김수학" },
      activity: { active: false, attended: [] },
    });
  });

  it("moves a rejoined member's legacy id to the current id for good", async () => {
    await expect(run("L1")).rejects.toMatchObject({
      status: 301,
      location: "/members/m1",
    });
  });

  it("answers 404 for an unknown id", async () => {
    await expect(run("nobody")).rejects.toMatchObject({ status: 404 });
  });
});
