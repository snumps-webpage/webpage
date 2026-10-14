import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __putRawDoc, __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { nowKstIso } from "$lib/server/core/time";
import type { Member } from "$lib/server/data/schemas";
import { load } from "./+page.server";

/**
 * 출석 편집기(snumps-webpage/D-000047~49). 체크 목록이 운영 명단만 보여서
 * 이주된 출석(legacy id)과 탈퇴 회원의 출석이 체크로 보이지 않았고, '참석자
 * 교체'를 누르면 지워졌다. 명단 밖의 기록된 사람은 따로 내려 보존한다.
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
  for (const t of ["activities", "events", "members", "legacy-members"])
    await invalidateCache(`table_${t}`);
  await __putRawDoc("table", "members", {
    schemaVersion: 1,
    rows: [
      member({ id: "m1", name: "현재" }),
      member({ id: "m2", name: "재가입", legacyMemberId: "L2" }),
      member({ id: "w1", name: "탈퇴", status: "withdrawn" }),
    ],
  });
  await __putRawDoc("table", "legacy-members", {
    schemaVersion: 1,
    rows: [
      member({ id: "L1", name: "옛회원", department: "물리천문학부" }),
      member({ id: "L2", name: "재가입" }),
    ],
  });
  await __putRawDoc("table", "activities", {
    schemaVersion: 1,
    rows: [
      {
        id: "a1",
        title: "스터디 1회",
        date: { start: "2025-03-01T19:00:00+09:00", end: null },
        type: "스터디",
        attendeeIds: ["L1", "m1", "L2", "w1"],
        studyId: null,
        sourceRequestId: null,
      },
    ],
  });
});

describe("attendee editor load", () => {
  it("offers the roster with each member's old id", async () => {
    const data = (await load({ locals: admin } as never)) as {
      members: { id: string; legacyMemberId: string | null }[];
    };
    expect(data.members).toEqual([
      expect.objectContaining({ id: "m1", legacyMemberId: null }),
      expect.objectContaining({ id: "m2", legacyMemberId: "L2" }),
    ]);
  });

  it("sends the recorded people the roster cannot show, named", async () => {
    const data = (await load({ locals: admin } as never)) as {
      activities: { formerAttendees: unknown[] }[];
    };
    expect(data.activities[0].formerAttendees).toEqual([
      { id: "L1", name: "옛회원", department: "물리천문학부" },
      { id: "w1", name: "탈퇴", department: "수리과학부" },
    ]);
  });
});
