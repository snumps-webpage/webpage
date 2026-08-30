import { beforeEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));
vi.mock("$lib/server/data/store", () => import("$lib/server/data/store-memory"));

import { __putRawDoc, __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { currentTerm } from "$lib/server/core/semester";
import { resolveMember } from "./resolve-member";

/** S9: 관리자 부트스트랩(ADMINS_EMAILS) + 등록 파생 capability 판정. */

const ADMIN_EMAIL = "boot-admin@snu.ac.kr";

function seedTables(over: Partial<Record<string, unknown[]>> = {}) {
  const tables: Record<string, unknown[]> = {
    members: [],
    "private-info": [],
    registrations: [],
    ...over,
  };
  for (const [name, rows] of Object.entries(tables)) {
    __putRawDoc("table", name, { schemaVersion: 1, rows });
  }
}

const memberRow = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  name: "회원",
  department: "수리과학부",
  joinedAt: "2026-03-01",
  status: "associate",
  statusChangedAt: "2026-03-01T00:00:00+09:00",
  withdrawal: null,
  isAlumni: false,
  alumniRevoked: false,
  roles: [],
  isAdmin: false,
  publicContact: null,
  project: null,
  legacyMemberId: null,
  sourceRequestId: null,
  ...over,
});

const infoRow = (email: string) => ({
  id: "p1",
  memberId: "m1",
  email,
  phone: "010-0000-0000",
  studentId: "2024-12345",
  background: "",
  mailPrefs: { announcements: true },
  sourceRequestId: null,
});

describe("resolveMember (S9)", () => {
  beforeEach(async () => {
    __reset();
    _resetDataLayerForTests();
    for (const t of ["members", "private-info", "registrations"]) {
      await invalidateCache(`table_${t}`);
    }
    testEnv.ADMINS_EMAILS = `other@snu.ac.kr, ${ADMIN_EMAIL}`;
  });

  it("bootstraps an admin context from ADMINS_EMAILS when no member row exists", async () => {
    seedTables();
    const ctx = await resolveMember(ADMIN_EMAIL);
    expect(ctx).not.toBeNull();
    expect(ctx!.isAdmin).toBe(true);
    expect(ctx!.registered).toBe(false);
    expect(ctx!.capabilities).toEqual([]); // 회원 존은 못 들어감 — 재가입 필요
    expect(ctx!.privateInfoId).toBeNull();
  });

  it("returns null for a non-admin email with no member row", async () => {
    seedTables();
    expect(await resolveMember("nobody@snu.ac.kr")).toBeNull();
  });

  it("ORs env-admin onto a real member row (post-approval continuity)", async () => {
    seedTables({
      members: [memberRow({ isAdmin: false })],
      "private-info": [infoRow(ADMIN_EMAIL)],
      registrations: [
        {
          id: "r1",
          memberId: "m1",
          term: currentTerm(),
          registeredAt: "2026-03-02T00:00:00+09:00",
          sourceRequestId: null,
        },
      ],
    });
    const ctx = await resolveMember(ADMIN_EMAIL);
    expect(ctx!.isAdmin).toBe(true); // env가 부트스트랩 권위
    expect(ctx!.registered).toBe(true);
    expect(ctx!.capabilities).toContain("member.participate");
  });

  it("marks an unregistered associate with no capabilities", async () => {
    seedTables({
      members: [memberRow()],
      "private-info": [infoRow("plain@snu.ac.kr")],
    });
    const ctx = await resolveMember("plain@snu.ac.kr");
    expect(ctx!.registered).toBe(false);
    expect(ctx!.capabilities).toEqual([]);
  });

  it("gives an unregistered alumni view+self only", async () => {
    seedTables({
      members: [memberRow({ isAlumni: true, status: "regular" })],
      "private-info": [infoRow("alumni@snu.ac.kr")],
    });
    const ctx = await resolveMember("alumni@snu.ac.kr");
    expect(ctx!.capabilities).toContain("member.view");
    expect(ctx!.capabilities).toContain("member.self");
    expect(ctx!.capabilities).not.toContain("member.participate");
  });
});
