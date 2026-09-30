import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import {
  __auditRows,
  __putRawDoc,
  __reset,
} from "$lib/server/data/store-memory";
import {
  _resetDataLayerForTests,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { AppError } from "$lib/server/core/errors";
import { nowKstIso } from "$lib/server/core/time";
import { currentTerm } from "$lib/server/core/semester";
import {
  HIDDEN_PROFILE,
  type ExecutiveProfileSettings,
} from "$lib/domain/executive-profile";
import type { Member, PrivateInfo } from "$lib/server/data/schemas";
import { getPublicExecutiveHistory } from "$lib/server/public/archive";
import {
  getProfileEditor,
  hasExecutiveHistory,
  listExecutiveProfileCandidates,
  saveExecutiveProfile,
} from "./executive-profiles";

/**
 * 역대 회장단 공개 프로필. 사람은 셋이다:
 * - m1: 운영 회원, 현 학기 회장. 회원 정보에 학과·학번·이메일이 다 있다.
 * - L1: 재가입하지 않은 옛 부회장 — legacy 행뿐이다(로그인 불가, 관리자 대리 입력).
 * - m4: 재가입한 옛 회장(legacy L2). 운영 private-info에 학번이 없어 legacy에서 읽는다.
 * m3은 회장단 이력이 없는 회원이다.
 */

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

function info(
  over: Partial<PrivateInfo> & Pick<PrivateInfo, "id" | "memberId">,
): PrivateInfo {
  return {
    email: "",
    phone: "",
    background: "",
    studentId: "",
    mailPrefs: { announcements: true },
    hidePublicPhone: false,
    sourceRequestId: null,
    ...over,
  };
}

const TERM = currentTerm();

async function seed() {
  await mutate("members", () => [
    member({
      id: "m1",
      name: "김회장",
      roles: [{ term: TERM, title: "회장" }],
    }),
    member({
      id: "m3",
      name: "박회원",
      roles: [{ term: TERM, title: "기획부장" }],
    }),
    member({
      id: "m4",
      name: "최복귀",
      department: "통계학과",
      roles: [{ term: "20-1", title: "회장" }],
      legacyMemberId: "L2",
    }),
  ]);
  await mutate("private-info", () => [
    info({
      id: "p1",
      memberId: "m1",
      email: "m1@snu.ac.kr",
      studentId: "2018-12345",
      phone: "010-1111-2222",
    }),
    info({ id: "p4", memberId: "m4", email: "m4@snu.ac.kr" }),
  ]);
  await __putRawDoc("table", "legacy-members", {
    schemaVersion: 1,
    rows: [
      member({
        id: "L1",
        name: "이옛날",
        department: "물리천문학부",
        roles: [{ term: "19-1", title: "부회장" }],
      }),
      member({
        id: "L2",
        name: "최복귀",
        roles: [{ term: "20-1", title: "회장" }],
      }),
    ],
  });
  await __putRawDoc("table", "legacy-private-info", {
    schemaVersion: 1,
    rows: [
      info({
        id: "lp1",
        memberId: "L1",
        email: "old@snu.ac.kr",
        studentId: "2015-11111",
      }),
      info({ id: "lp2", memberId: "L2", studentId: "2016-22222" }),
    ],
  });
}

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of [
    "members",
    "private-info",
    "legacy-members",
    "legacy-private-info",
    "executive-profiles",
  ]) {
    await invalidateCache(`table_${t}`);
  }
  await seed();
});

/**
 * An admin filled the profile in while the person was legacy-only; they have
 * re-joined since (m4 ← L2), so the row still carries the legacy id.
 */
async function seedLegacyKeyedProfile(settings: ExecutiveProfileSettings) {
  await mutate("executive-profiles", () => [
    {
      id: "ep1",
      memberId: "L2",
      ...settings,
      updatedAt: nowKstIso(),
      updatedBy: "admin",
    },
  ]);
}

const code = (p: Promise<unknown>) =>
  p.then(
    () => "resolved",
    (e: unknown) => (e instanceof AppError ? e.code : String(e)),
  );

describe("getProfileEditor", () => {
  it("shows everything hidden and previews the linked values before any save", async () => {
    const editor = await getProfileEditor("m1");
    expect(editor).toMatchObject({
      memberId: "m1",
      name: "김회장",
      settings: HIDDEN_PROFILE,
      linked: {
        department: "수리과학부",
        cohort: "18",
        email: "m1@snu.ac.kr",
      },
    });
  });

  it("reads a legacy-only person's linked values from the legacy archive", async () => {
    const editor = await getProfileEditor("L1");
    expect(editor.linked).toEqual({
      department: "물리천문학부",
      cohort: "15",
      email: "old@snu.ac.kr",
    });
  });

  it("falls back to the legacy student id when the current row has none", async () => {
    const editor = await getProfileEditor("m4");
    expect(editor.linked).toEqual({
      department: "통계학과",
      cohort: "16",
      email: "m4@snu.ac.kr",
    });
  });

  it("refuses someone who never was 회장 or 부회장", async () => {
    expect(await code(getProfileEditor("m3"))).toBe("FORBIDDEN");
  });

  it("does not know an id that is nobody", async () => {
    expect(await code(getProfileEditor("nobody"))).toBe("NOT_FOUND");
  });
});

describe("saveExecutiveProfile", () => {
  const settings = {
    department: { source: "member" as const },
    cohort: { source: "custom" as const, value: "17" },
    email: { source: "hidden" as const },
    bio: { source: "custom" as const, value: "근황입니다" },
  };

  it("stores the member's own choices under their id", async () => {
    await saveExecutiveProfile("m1", settings, {
      actorId: "m1",
      byAdmin: false,
    });
    const rows = await getTable("executive-profiles");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      memberId: "m1",
      updatedBy: "m1",
      ...settings,
    });
    expect((await getProfileEditor("m1")).settings).toEqual(settings);
  });

  it("audits which sources were chosen — never the values", async () => {
    await saveExecutiveProfile("m1", settings, {
      actorId: "admin",
      byAdmin: true,
    });
    const [row] = await __auditRows();
    expect(row).toMatchObject({
      actor: "admin",
      action: "executive-profile.update",
      target_tb: "executive-profiles",
      target_id: "m1",
      detail: {
        byAdmin: true,
        sources: {
          department: "member",
          cohort: "custom",
          email: "hidden",
          bio: "custom",
        },
      },
    });
    expect(JSON.stringify(row.detail)).not.toContain("근황입니다");
    expect(JSON.stringify(row.detail)).not.toContain("17");
  });

  it("lets an admin fill in a legacy-only person", async () => {
    await saveExecutiveProfile("L1", settings, {
      actorId: "admin",
      byAdmin: true,
    });
    const rows = await getTable("executive-profiles");
    expect(rows.map((r) => r.memberId)).toEqual(["L1"]);
  });

  it("moves a profile kept under the legacy id to the current id on the next save", async () => {
    await seedLegacyKeyedProfile(settings);
    // L2 is m4 now — the editor finds the row by either id
    expect((await getProfileEditor("m4")).settings).toEqual(settings);

    await saveExecutiveProfile(
      "m4",
      { ...settings, email: { source: "member" } },
      { actorId: "m4", byAdmin: false },
    );
    const rows = await getTable("executive-profiles");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      memberId: "m4",
      email: { source: "member" },
    });
  });

  it("refuses a member with no 회장·부회장 history, writing nothing", async () => {
    expect(
      await code(
        saveExecutiveProfile("m3", settings, { actorId: "m3", byAdmin: false }),
      ),
    ).toBe("FORBIDDEN");
    expect(await getTable("executive-profiles")).toEqual([]);
  });
});

describe("hasExecutiveHistory — whether the settings tab shows", () => {
  it.each([
    ["m1", true],
    ["m4", true],
    ["m3", false],
    ["nobody", false],
  ])("%s → %s", async (id, expected) => {
    expect(await hasExecutiveHistory(id)).toBe(expected);
  });
});

describe("listExecutiveProfileCandidates", () => {
  it("lists every past 회장·부회장 once, newest term first — legacy-only people included, re-joined ones by their current id", async () => {
    await saveExecutiveProfile("m1", HIDDEN_PROFILE, {
      actorId: "m1",
      byAdmin: false,
    });
    const list = await listExecutiveProfileCandidates();
    expect(list.map((c) => [c.id, c.name, c.hasProfile, c.legacyOnly])).toEqual(
      [
        ["m1", "김회장", true, false],
        ["m4", "최복귀", false, false],
        ["L1", "이옛날", false, true],
      ],
    );
    expect(list[0].roles).toEqual([{ term: TERM, title: "회장" }]);
  });
});

describe("getPublicExecutiveHistory — the public profile", () => {
  const holder = async (name: string) =>
    (await getPublicExecutiveHistory())
      .flatMap((t) => t.holders)
      .find((h) => h.name === name)!;

  it("carries nothing for a person with no profile row", async () => {
    expect((await holder("김회장")).profile).toBeNull();
  });

  it("resolves linked fields from the member DB and custom ones as typed", async () => {
    await saveExecutiveProfile(
      "m1",
      {
        department: { source: "member" },
        cohort: { source: "member" },
        email: { source: "custom", value: "public@example.com" },
        bio: { source: "custom", value: "대학원생" },
      },
      { actorId: "m1", byAdmin: false },
    );
    expect((await holder("김회장")).profile).toEqual({
      department: "수리과학부",
      cohort: "18",
      publicEmail: "public@example.com",
      bio: "대학원생",
    });
  });

  it("reads linked values live — a changed member record shows at once", async () => {
    await saveExecutiveProfile(
      "m1",
      { ...HIDDEN_PROFILE, department: { source: "member" } },
      { actorId: "m1", byAdmin: false },
    );
    await mutate("members", (rows) =>
      rows.map((m) => (m.id === "m1" ? { ...m, department: "수학교육과" } : m)),
    );
    expect((await holder("김회장")).profile?.department).toBe("수학교육과");
  });

  it("leaves a linked field out when the member DB has nothing for it", async () => {
    await mutate("private-info", (rows) =>
      rows.map((p) =>
        p.memberId === "m1" ? { ...p, studentId: "학번없음" } : p,
      ),
    );
    await saveExecutiveProfile(
      "m1",
      {
        ...HIDDEN_PROFILE,
        cohort: { source: "member" },
        department: { source: "member" },
      },
      { actorId: "m1", byAdmin: false },
    );
    expect((await holder("김회장")).profile).toEqual({
      department: "수리과학부",
      cohort: null,
      publicEmail: null,
      bio: null,
    });
  });

  it("shows a legacy-only person's profile on their past term", async () => {
    await saveExecutiveProfile(
      "L1",
      { ...HIDDEN_PROFILE, email: { source: "member" } },
      { actorId: "admin", byAdmin: true },
    );
    expect((await holder("이옛날")).profile).toEqual({
      department: null,
      cohort: null,
      publicEmail: "old@snu.ac.kr",
      bio: null,
    });
  });

  it("finds a profile kept under the legacy id after the person re-joined", async () => {
    await seedLegacyKeyedProfile({
      ...HIDDEN_PROFILE,
      cohort: { source: "member" },
    });
    expect((await holder("최복귀")).profile?.cohort).toBe("16");
  });

  it("publishes nothing for a withdrawn member", async () => {
    await saveExecutiveProfile(
      "m1",
      { ...HIDDEN_PROFILE, bio: { source: "custom", value: "근황" } },
      { actorId: "m1", byAdmin: false },
    );
    await mutate("members", (rows) =>
      rows.map((m) => (m.id === "m1" ? { ...m, status: "withdrawn" } : m)),
    );
    expect((await holder("김회장")).profile).toBeNull();
  });

  it("never carries the raw student id or a private-info key (BE-64)", async () => {
    for (const id of ["m1", "L1", "L2"]) {
      await saveExecutiveProfile(
        id,
        {
          department: { source: "member" },
          cohort: { source: "member" },
          email: { source: "member" },
          bio: { source: "custom", value: "근황" },
        },
        { actorId: "admin", byAdmin: true },
      );
    }
    const json = JSON.stringify(await getPublicExecutiveHistory());
    for (const key of ["email", "phone", "studentId", "background"]) {
      expect(json).not.toContain(`"${key}"`);
    }
    for (const raw of ["2018-12345", "2015-11111", "2016-22222"]) {
      expect(json).not.toContain(raw);
    }
  });
});
