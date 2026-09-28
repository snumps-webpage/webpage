import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __auditRows, __reset } from "$lib/server/data/store-memory";
import {
  _resetDataLayerForTests,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { nowKstIso } from "$lib/server/core/time";
import type { Member, PrivateInfo } from "$lib/server/data/schemas";
import { actions } from "./+page.server";

/**
 * The member authority actions checked their input by hand, one rule at a
 * time, or not at all (an empty name, a 26-W role or an arbitrary email as the
 * login key went straight to storage). They now validate with the domain
 * schemas in $lib/domain/members — the single source of the rules — and answer
 * {error: VALIDATION_FAILED, issues, values} without writing or auditing.
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

const ID = "m1";

const member: Member = {
  id: ID,
  name: "홍길동",
  department: "수리과학부",
  joinedAt: "2024-03-01",
  status: "regular",
  statusChangedAt: nowKstIso(),
  withdrawal: null,
  isAlumni: true,
  alumniRevoked: false,
  roles: [{ term: "26-1", title: "총무" }],
  isAdmin: false,
  publicContact: null,
  alumniRevocationReason: null,
  project: null,
  legacyMemberId: null,
  sourceRequestId: null,
};

const privateInfo: PrivateInfo = {
  id: "p1",
  memberId: ID,
  email: "hong@snu.ac.kr",
  phone: "010-1111-2222",
  background: "해석학",
  studentId: "2024-12345",
  mailPrefs: { announcements: true },
  hidePublicPhone: false,
  sourceRequestId: null,
};

type Action = keyof typeof actions;

function post(action: Action, fields: Record<string, string>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return actions[action]({
    request: new Request(`http://localhost/admin/members/${ID}?/${action}`, {
      method: "POST",
      body,
    }),
    locals: admin,
    params: { id: ID },
  });
}

async function storedMember() {
  return (await getTable("members")).find((m) => m.id === ID)!;
}

async function storedPrivateInfo() {
  return (await getTable("private-info")).find((p) => p.memberId === ID)!;
}

async function expectRefused(result: unknown, fields: string[]) {
  expect(result).toMatchObject({
    status: 400,
    data: { error: "VALIDATION_FAILED", values: expect.any(Object) },
  });
  const issues = (result as { data: { issues: Record<string, string> } }).data
    .issues;
  expect(Object.keys(issues).sort()).toEqual([...fields].sort());
  for (const field of fields) expect(issues[field]).toEqual(expect.any(String));
  expect(await __auditRows()).toEqual([]);
}

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["members", "private-info"]) {
    await invalidateCache(`table_${t}`);
  }
  await mutate("members", () => [structuredClone(member)]);
  await mutate("private-info", () => [structuredClone(privateInfo)]);
});

describe("updateMember", () => {
  const valid = {
    name: "  홍길순 ",
    department: " 수학교육과 ",
    joinedAt: "2024-03-02",
    projectTitle: " 문제 아카이브 ",
    projectUrl: "https://example.com/archive",
  };

  it("stores the parsed record, trimmed", async () => {
    const result = await post("updateMember", valid);

    expect(result).toMatchObject({ success: true });
    expect(await storedMember()).toMatchObject({
      name: "홍길순",
      department: "수학교육과",
      joinedAt: "2024-03-02",
      project: { title: "문제 아카이브", url: "https://example.com/archive" },
    });
  });

  // Decision #1/#19 (audit LB16-3, LC11-1): publicContact is written by
  // nobody. A posted value is ignored, and a stored value in any shape —
  // the seed's "github.com/dev-regular" used to block the name edit — stays
  // as it was while the record saves.
  it("ignores a posted publicContact and keeps the stored one untouched", async () => {
    await mutate("members", () => [
      { ...member, publicContact: "github.com/dev-regular" },
    ]);

    const result = await post("updateMember", {
      ...valid,
      publicContact: "01012345678 · president@snumps.org",
    });

    expect(result).toMatchObject({ success: true });
    expect(await storedMember()).toMatchObject({
      name: "홍길순",
      publicContact: "github.com/dev-regular",
    });
  });

  // Decision #3 (audit LC11-3): a member stored without a join date can
  // have one filled in — the record form is the way to close the gap.
  it("fills in a missing join date", async () => {
    await mutate("members", () => [{ ...member, joinedAt: null }]);

    const result = await post("updateMember", valid);

    expect(result).toMatchObject({ success: true });
    expect((await storedMember()).joinedAt).toBe("2024-03-02");
  });

  it("drops an empty project", async () => {
    await post("updateMember", { ...valid, projectTitle: "", projectUrl: "" });

    expect((await storedMember()).project).toBeNull();
  });

  it.each([
    ["name", { name: "  " }],
    ["name", { name: "가".repeat(61) }],
    ["department", { department: "" }],
    ["joinedAt", { joinedAt: "" }],
    ["joinedAt", { joinedAt: "2024-13-45" }],
    ["projectTitle", { projectTitle: "", projectUrl: "https://example.com" }],
    ["projectTitle", { projectTitle: "가".repeat(101) }],
    ["projectUrl", { projectUrl: "not a url" }],
    ["projectUrl", { projectUrl: "javascript:alert(1)" }],
    ["projectUrl", { projectUrl: `https://example.com/${"a".repeat(200)}` }],
  ])(
    "refuses a bad %s with a field issue and writes nothing",
    async (field, over) => {
      const result = await post("updateMember", { ...valid, ...over });

      await expectRefused(result, [field]);
      expect(await storedMember()).toEqual(member);
    },
  );

  it("reports every bad field at once", async () => {
    const result = await post("updateMember", {
      name: "",
      department: "",
      joinedAt: "x",
      projectTitle: "",
      projectUrl: "nope",
    });

    await expectRefused(result, [
      "department",
      "joinedAt",
      "name",
      "projectTitle",
      "projectUrl",
    ]);
  });
});

describe("setStatus", () => {
  it("changes the status and audits it", async () => {
    await mutate("members", () => [{ ...member, status: "associate" }]);

    const result = await post("setStatus", { status: "regular" });

    expect(result).toMatchObject({ success: true });
    expect((await storedMember()).status).toBe("regular");
    expect((await __auditRows()).map((r) => r.action)).toEqual([
      "member.set-status",
    ]);
  });

  it.each(["withdrawn", "", "admin"])(
    "refuses status %j without writing or auditing",
    async (status) => {
      const result = await post("setStatus", { status });

      await expectRefused(result, ["status"]);
      expect((await storedMember()).status).toBe("regular");
    },
  );
});

describe("revokeAlumni", () => {
  // Decision #18 (audit LA30-1): the reason is free text about one member.
  // It lives on the member row — erased with the member — and the
  // append-only audit log records only that a reason was given.
  it("stores the trimmed reason on the member and audits only that one was given", async () => {
    const result = await post("revokeAlumni", {
      reason: "  회칙상 유고 처리  ",
    });

    expect(result).toMatchObject({ success: true });
    expect(await storedMember()).toMatchObject({
      isAlumni: false,
      alumniRevoked: true,
      alumniRevocationReason: "회칙상 유고 처리",
    });
    const [row] = await __auditRows();
    expect(row).toMatchObject({ action: "member.revoke-alumni" });
    expect(row.detail).toEqual({ hasReason: true });
  });

  it.each([
    ["empty", ""],
    ["too short", " 사유 "],
    ["too long", "가".repeat(501)],
  ])("refuses a %s reason without writing or auditing", async (_, reason) => {
    const result = await post("revokeAlumni", { reason });

    await expectRefused(result, ["reason"]);
    expect(await storedMember()).toMatchObject({
      isAlumni: true,
      alumniRevoked: false,
    });
  });
});

describe("setRoles", () => {
  it("stores one role per '26-2 회장' line and audits it", async () => {
    const result = await post("setRoles", {
      roles: "26-2 회장\n 26-1  학술 부장 \n\n",
    });

    expect(result).toMatchObject({ success: true });
    expect((await storedMember()).roles).toEqual([
      { term: "26-2", title: "회장" },
      { term: "26-1", title: "학술 부장" },
    ]);
    expect(await __auditRows()).toMatchObject([
      { action: "member.set-roles", detail: { count: 2 } },
    ]);
  });

  it("clears the roles when no line is sent", async () => {
    const result = await post("setRoles", { roles: "" });

    expect(result).toMatchObject({ success: true });
    expect((await storedMember()).roles).toEqual([]);
  });

  it.each([
    ["a vacation term (TERM_PATTERN is YY-1/YY-2)", "26-W 회장"],
    ["a malformed term", "2026-2 회장"],
    ["a missing title", "26-2"],
    ["an over-long title", `26-2 ${"가".repeat(41)}`],
    ["a duplicate role", "26-2 회장\n26-2 회장"],
    [
      "more than 30 roles",
      Array.from({ length: 31 }, (_, i) => `26-1 직책${i}`).join("\n"),
    ],
  ])("refuses %s without writing or auditing", async (_, roles) => {
    const result = await post("setRoles", { roles });

    await expectRefused(result, ["roles"]);
    expect((await storedMember()).roles).toEqual(member.roles);
  });

  it("names the offending line", async () => {
    const result = (await post("setRoles", {
      roles: "26-2 회장\n26-3 총무",
    })) as unknown as { data: { issues: { roles: string } } };

    expect(result.data.issues.roles).toMatch(/^2번째 직책: /);
  });
});

describe("setAdmin", () => {
  it("grants admin and audits it", async () => {
    const result = await post("setAdmin", { isAdmin: "true" });

    expect(result).toMatchObject({ success: true });
    expect((await storedMember()).isAdmin).toBe(true);
    expect(await __auditRows()).toMatchObject([
      { action: "member.set-admin", detail: { isAdmin: true } },
    ]);
  });

  it("revokes admin", async () => {
    // the acting admin stays one: the last admin cannot be revoked (LB25-2)
    await mutate("members", () => [
      { ...member, isAdmin: true },
      { ...member, id: "admin", name: "관리자", isAdmin: true },
    ]);

    await post("setAdmin", { isAdmin: "false" });

    expect((await storedMember()).isAdmin).toBe(false);
  });

  it("refuses to revoke the last admin and says why", async () => {
    await mutate("members", () => [{ ...member, isAdmin: true }]);

    const result = await post("setAdmin", { isAdmin: "false" });

    expect(result).toMatchObject({
      status: 409,
      data: {
        error: "CONFLICT",
        message: "마지막 관리자의 권한은 회수할 수 없습니다.",
      },
    });
    expect((await storedMember()).isAdmin).toBe(true);
  });

  it.each(["", "yes", "TRUE"])(
    "refuses isAdmin %j instead of reading it as a revocation",
    async (isAdmin) => {
      await mutate("members", () => [{ ...member, isAdmin: true }]);

      const result = await post("setAdmin", { isAdmin });

      await expectRefused(result, ["isAdmin"]);
      expect((await storedMember()).isAdmin).toBe(true);
    },
  );
});

describe("updatePrivateInfo", () => {
  const valid = {
    email: " new@snu.ac.kr ",
    phone: "010 9999 8888",
    background: "  대수학  ",
  };

  it("stores the parsed fields, phone normalized, and audits field names", async () => {
    const result = await post("updatePrivateInfo", valid);

    expect(result).toMatchObject({ success: true });
    expect(await storedPrivateInfo()).toMatchObject({
      email: "new@snu.ac.kr",
      phone: "010-9999-8888",
      background: "대수학",
    });
    const [row] = await __auditRows();
    expect(row).toMatchObject({
      action: "private-info.update",
      detail: { fields: ["phone", "background", "email"] },
    });
  });

  it("keeps the stored email and phone when those fields are blank", async () => {
    const result = await post("updatePrivateInfo", {
      email: "",
      phone: " ",
      background: "",
    });

    expect(result).toMatchObject({ success: true });
    expect(await storedPrivateInfo()).toMatchObject({
      email: "hong@snu.ac.kr",
      phone: "010-1111-2222",
      background: "",
    });
  });

  it.each([
    ["email", { email: "not-an-email" }],
    ["email", { email: "someone@gmail.com" }],
    ["email", { email: `${"a".repeat(200)}@snu.ac.kr` }],
    ["phone", { phone: "12" }],
    ["phone", { phone: "02-123-4567" }],
    ["background", { background: "가".repeat(2001) }],
  ])(
    "refuses a bad %s with a field issue and writes nothing",
    async (field, over) => {
      const result = await post("updatePrivateInfo", { ...valid, ...over });

      await expectRefused(result, [field]);
      expect(await storedPrivateInfo()).toEqual(privateInfo);
    },
  );

  it("reports every bad field at once", async () => {
    const result = await post("updatePrivateInfo", {
      email: "x",
      phone: "1",
      background: "가".repeat(2001),
    });

    await expectRefused(result, ["background", "email", "phone"]);
  });
});
