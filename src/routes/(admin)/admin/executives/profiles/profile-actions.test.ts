import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __putRawDoc, __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { nowKstIso } from "$lib/server/core/time";
import { actions } from "./+page.server";

/** 관리자 대리 편집 — 로그인하지 않는 옛 회장단(legacy 전용)도 채울 수 있다. */

function localsFor(isAdmin: boolean) {
  return {
    member: {
      memberId: isAdmin ? "admin" : "someone",
      privateInfoId: null,
      name: "관리자",
      status: "regular",
      isAdmin,
      isAlumni: false,
      registered: true,
      capabilities: [],
    },
    auth: async () => ({
      user: { email: "admin@snu.ac.kr", name: "관리자" },
    }),
  } as unknown as App.Locals;
}

function post(
  isAdmin: boolean,
  fields: Record<string, string>,
  action: keyof typeof actions = "save",
) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return actions[action]({
    request: new Request("http://localhost/admin/executives/profiles", {
      method: "POST",
      body,
    }),
    locals: localsFor(isAdmin),
  });
}

const FORM = {
  memberId: "L1",
  "department.source": "custom",
  "department.value": "물리학과",
  "cohort.source": "hidden",
  "email.source": "member",
  "bio.source": "hidden",
};

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["members", "legacy-members", "executive-profiles"]) {
    await invalidateCache(`table_${t}`);
  }
  await __putRawDoc("table", "legacy-members", {
    schemaVersion: 1,
    rows: [
      {
        id: "L1",
        name: "이옛날",
        department: "물리천문학부",
        joinedAt: null,
        status: "regular",
        statusChangedAt: nowKstIso(),
        withdrawal: null,
        isAlumni: true,
        alumniRevoked: false,
        alumniRevocationReason: null,
        roles: [{ term: "19-1", title: "부회장" }],
        isAdmin: false,
        publicContact: null,
        project: null,
        legacyMemberId: null,
        sourceRequestId: null,
      },
    ],
  });
});

describe("admin/executives/profiles ?/save", () => {
  it("saves a legacy-only person's profile on their behalf", async () => {
    const result = await post(true, FORM);
    expect(result).toMatchObject({ success: true });
    const [row] = await getTable("executive-profiles");
    expect(row).toMatchObject({
      memberId: "L1",
      updatedBy: "admin",
      department: { source: "custom", value: "물리학과" },
      email: { source: "member" },
    });
  });

  it("refuses a non-admin", async () => {
    const result = await post(false, FORM);
    expect(result).toMatchObject({ status: 403 });
    expect(await getTable("executive-profiles")).toEqual([]);
  });

  it("answers the field issues on a bad form", async () => {
    const result = await post(true, { ...FORM, "email.source": "public" });
    expect(result).toMatchObject({
      status: 400,
      data: { issues: { email: expect.any(String) } },
    });
  });
});

// 탈퇴 뒤에는 자리에 남은 것을 관리자만 고친다 — 연동 없이 이름 포함.
describe("admin/executives/profiles ?/saveWithdrawn", () => {
  const WITHDRAWN_FORM = {
    memberId: "L1",
    "name.source": "hidden",
    "department.source": "custom",
    "department.value": "물리학과",
    "cohort.source": "hidden",
    "email.source": "hidden",
    "bio.source": "hidden",
  };

  async function markWithdrawn() {
    const [row] = await getTable("legacy-members");
    await invalidateCache("table_legacy-members");
    await __putRawDoc("table", "legacy-members", {
      schemaVersion: 1,
      rows: [{ ...row, status: "withdrawn" }],
    });
  }

  it("rewrites what a withdrawn executive's seat shows", async () => {
    await markWithdrawn();
    const result = await post(true, WITHDRAWN_FORM, "saveWithdrawn");
    expect(result).toMatchObject({ success: true });
    const [row] = await getTable("executive-profiles");
    expect(row.afterWithdrawal).toMatchObject({
      name: { source: "hidden" },
      department: { source: "custom", value: "물리학과" },
    });
  });

  it("answers CONFLICT for someone who has not withdrawn", async () => {
    const result = await post(true, WITHDRAWN_FORM, "saveWithdrawn");
    expect(result).toMatchObject({ status: 409 });
  });

  it("refuses a linked source", async () => {
    await markWithdrawn();
    const result = await post(
      true,
      { ...WITHDRAWN_FORM, "email.source": "member" },
      "saveWithdrawn",
    );
    expect(result).toMatchObject({
      status: 400,
      data: { issues: { email: expect.any(String) } },
    });
  });
});
