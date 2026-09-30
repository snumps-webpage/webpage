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
import { capabilitiesFor } from "$lib/server/core/capabilities";
import { nowKstIso } from "$lib/server/core/time";
import type { Member } from "$lib/server/data/schemas";
import { actions } from "./+page.server";

/**
 * 본인 편집은 자기 프로필만 고친다 — 누구의 것인지는 세션이 정하고, 폼에
 * memberId를 실어 보내도 무시한다.
 */

function localsFor(memberId: string) {
  return {
    member: {
      memberId,
      privateInfoId: null,
      name: "회원",
      status: "regular",
      isAdmin: false,
      isAlumni: false,
      registered: true,
      capabilities: capabilitiesFor({ isAlumni: false, registered: true }),
    },
    auth: async () => ({
      user: { email: `${memberId}@snu.ac.kr`, name: "회원" },
      expires: "",
    }),
  } as unknown as App.Locals;
}

function member(id: string, roles: Member["roles"]): Member {
  return {
    id,
    name: id,
    department: "수리과학부",
    joinedAt: "2024-03-01",
    status: "regular",
    statusChangedAt: nowKstIso(),
    withdrawal: null,
    isAlumni: false,
    alumniRevoked: false,
    alumniRevocationReason: null,
    roles,
    isAdmin: false,
    publicContact: null,
    project: null,
    legacyMemberId: null,
    sourceRequestId: null,
  };
}

const VALID = {
  "department.source": "member",
  "cohort.source": "custom",
  "cohort.value": "18",
  "email.source": "hidden",
  "bio.source": "custom",
  "bio.value": "근황",
};

function post(memberId: string, fields: Record<string, string>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return actions.save({
    request: new Request("http://localhost/settings/executive-profile", {
      method: "POST",
      body,
    }),
    locals: localsFor(memberId),
  });
}

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["members", "executive-profiles"]) {
    await invalidateCache(`table_${t}`);
  }
  await mutate("members", () => [
    member("exec", [{ term: "25-1", title: "부회장" }]),
    member("other-exec", [{ term: "24-2", title: "회장" }]),
    member("plain", []),
  ]);
});

describe("settings/executive-profile ?/save", () => {
  it("saves the signed-in executive's own profile", async () => {
    const result = await post("exec", VALID);
    expect(result).toMatchObject({ success: true });
    const [row] = await getTable("executive-profiles");
    expect(row).toMatchObject({
      memberId: "exec",
      updatedBy: "exec",
      cohort: { source: "custom", value: "18" },
    });
  });

  it("ignores a memberId in the form — the session decides whose profile it is", async () => {
    await post("exec", { ...VALID, memberId: "other-exec" });
    const rows = await getTable("executive-profiles");
    expect(rows.map((r) => r.memberId)).toEqual(["exec"]);
  });

  it("answers the field issues and writes nothing on a bad form", async () => {
    const result = await post("exec", { ...VALID, "cohort.value": "2018" });
    expect(result).toMatchObject({
      status: 400,
      data: {
        error: "VALIDATION_FAILED",
        issues: { cohort: expect.any(String) },
      },
    });
    expect(await getTable("executive-profiles")).toEqual([]);
  });

  it("refuses a member who never was 회장 or 부회장", async () => {
    const result = await post("plain", VALID);
    expect(result).toMatchObject({ status: 403, data: { error: "FORBIDDEN" } });
    expect(await getTable("executive-profiles")).toEqual([]);
  });
});
