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
    "registrations",
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
  it("renders an operational member with the charter standing", async () => {
    // 이번 학기 등록이 없고 기록도 없다 — 저장 지위가 regular여도 이전 회원
    await expect(run("m1")).resolves.toMatchObject({
      member: { id: "m1", name: "김수학" },
      standing: "former",
      activity: { records: 0, recordsByType: {}, attended: [] },
    });
  });

  // D-000113: the attended list marks what has not started yet
  it("marks an attended activity that has not started as upcoming", async () => {
    const at = (days: number) =>
      new Date(Date.now() + days * 86_400_000).toISOString();
    await mutate("activities", () =>
      [
        ["a-past", at(-3)],
        ["a-next", at(3)],
      ].map(([id, start]) => ({
        id,
        title: id,
        date: { start, end: null },
        type: "회식" as const,
        attendeeIds: ["m1"],
        studyId: null,
        sourceRequestId: null,
      })),
    );
    const data = (await run("m1")) as unknown as {
      activity: { attended: { id: string; upcoming: boolean }[] };
    };
    expect(data.activity.attended).toMatchObject([
      { id: "a-next", upcoming: true },
      { id: "a-past", upcoming: false },
    ]);
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
