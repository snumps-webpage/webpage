import { beforeEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
vi.mock("$lib/server/mail/dispatch", () => ({
  emitMailEvent: async () => true,
}));

import { __putRawDoc, __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { nowKstIso } from "$lib/server/core/time";
import type { Member } from "$lib/server/data/schemas";
import { actions, load } from "./+page.server";

/**
 * 발표자 편집기(snumps-webpage/D-000048~49). 체크 목록이 운영 명단만 보여서
 * 이주된 발표자(legacy id)가 체크로 보이지 않았고, 다른 발표자를 체크해
 * 저장하면 빠졌다. 명단 밖의 기록된 발표자를 따로 내려 보존한다.
 */

const admin = {
  member: {
    memberId: "admin",
    privateInfoId: null,
    name: "관리자",
    status: "regular",
    isAdmin: true,
    isAlumni: false,
    registered: true,
    capabilities: [],
  },
  auth: async () => ({ user: { email: "admin@snu.ac.kr", name: "관리자" } }),
} as unknown as App.Locals;

function member(over: Partial<Member> & Pick<Member, "id" | "name">): Member {
  return {
    department: "수리과학부",
    joinedAt: "2024-03-01",
    status: "regular",
    statusChangedAt: nowKstIso(),
    withdrawal: null,
    isAlumni: false,
    alumniRevoked: false,
    alumniRevocationReason: null,
    roles: [],
    isAdmin: false,
    publicContact: null,
    project: null,
    legacyMemberId: null,
    sourceRequestId: null,
    ...over,
  };
}

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of [
    "seminars",
    "seminar-requests",
    "events",
    "activities",
    "members",
    "legacy-members",
  ])
    await invalidateCache(`table_${t}`);
  await __putRawDoc("table", "members", {
    schemaVersion: 1,
    rows: [
      member({ id: "m1", name: "현재" }),
      member({ id: "m2", name: "재가입", legacyMemberId: "L2" }),
    ],
  });
  await __putRawDoc("table", "legacy-members", {
    schemaVersion: 1,
    rows: [
      member({ id: "L1", name: "옛발표자", department: "물리천문학부" }),
      member({ id: "L2", name: "재가입" }),
    ],
  });
  const body = new FormData();
  for (const [k, v] of Object.entries({
    title: "이주된 세미나",
    semester: "25-1",
    kind: "regular",
    durationMinutes: "60",
    note: "",
    prerequisites: "",
    presenterIds: "L1,L2,m1",
  }))
    body.set(k, v);
  await actions.create({
    request: new Request("http://localhost/admin/seminars", {
      method: "POST",
      body,
    }),
    locals: admin,
  } as never);
});

describe("presenter editor load", () => {
  it("offers the roster with each member's old id", async () => {
    const data = (await load({ locals: admin } as never)) as {
      members: { id: string; legacyMemberId: string | null }[];
    };
    expect(data.members).toEqual([
      expect.objectContaining({ id: "m1", legacyMemberId: null }),
      expect.objectContaining({ id: "m2", legacyMemberId: "L2" }),
    ]);
  });

  it("sends the recorded presenters the roster cannot show, named", async () => {
    const data = (await load({ locals: admin } as never)) as {
      records: { title: string; formerPresenters: unknown[] }[];
    };
    const record = data.records.find((r) => r.title === "이주된 세미나");
    expect(record?.formerPresenters).toEqual([
      { id: "L1", name: "옛발표자", department: "물리천문학부" },
    ]);
  });
});
