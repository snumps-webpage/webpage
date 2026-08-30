import { describe, expect, it } from "vitest";
import {
  alumniRevocationInputSchema,
  memberRecordInputSchema,
  memberRolesSchema,
  memberStatusInputSchema,
  parseRolesJson,
  privateInfoInputSchema,
  projectPublicExecutiveHistory,
  projectPublicMembers,
  publicContactInputSchema,
} from "./members";
import {
  getDevAdminMember,
  getDevAdminMembers,
  getDevPublicExecutives,
  revokeDevMemberAlumni,
  setDevMemberStatus,
} from "$lib/server/dev-member-fixtures";

describe("member administration domain", () => {
  it("accepts term roles and rejects duplicates", () => {
    expect(
      memberRolesSchema.safeParse([
        { term: "26-2", title: "회장" },
        { term: "26-W", title: "학술부장" },
      ]).success,
    ).toBe(true);
    expect(
      memberRolesSchema.safeParse([
        { term: "26-2", title: "회장" },
        { term: "26-2", title: "회장" },
      ]).success,
    ).toBe(false);
  });

  it("requires both phone and email when public contact is granted", () => {
    expect(
      publicContactInputSchema.safeParse({
        status: "granted",
        phone: "010-1234-5678",
        email: "president@snumps.org",
      }).success,
    ).toBe(true);
    expect(
      publicContactInputSchema.safeParse({
        status: "granted",
        phone: "",
        email: "president@snumps.org",
      }).success,
    ).toBe(false);
  });

  it("rejects malformed role JSON", () => {
    expect(parseRolesJson("not-json").success).toBe(false);
  });

  it("normalizes an optional project while validating member records", () => {
    expect(
      memberRecordInputSchema.parse({
        name: " 홍길동 ",
        department: " 수리과학부 ",
        joinedAt: "2026-03-02",
        projectTitle: "문제 아카이브",
        projectUrl: "https://example.com/archive",
      }),
    ).toEqual({
      name: "홍길동",
      department: "수리과학부",
      joinedAt: "2026-03-02",
      project: {
        title: "문제 아카이브",
        url: "https://example.com/archive",
      },
    });
    expect(
      memberRecordInputSchema.safeParse({
        name: "홍길동",
        department: "수리과학부",
        joinedAt: "2026-03-02",
        projectTitle: "",
        projectUrl: "https://example.com/archive",
      }).success,
    ).toBe(false);
  });

  it("accepts only managed statuses and SNU private email addresses", () => {
    expect(
      memberStatusInputSchema.safeParse({ status: "regular" }).success,
    ).toBe(true);
    expect(
      memberStatusInputSchema.safeParse({ status: "withdrawn" }).success,
    ).toBe(false);
    expect(
      privateInfoInputSchema.safeParse({
        email: "member@snu.ac.kr",
        phone: "010-1234-5678",
        background: "해석학",
      }).success,
    ).toBe(true);
    expect(
      privateInfoInputSchema.safeParse({
        email: "member@example.com",
        phone: "010-1234-5678",
        background: "",
      }).success,
    ).toBe(false);
  });

  it("requires an auditable alumni revocation reason", () => {
    expect(alumniRevocationInputSchema.safeParse({ reason: "" }).success).toBe(
      false,
    );
    expect(
      alumniRevocationInputSchema.safeParse({ reason: "회칙상 유고 처리" })
        .success,
    ).toBe(true);
  });

  it("keeps alumni sticky across demotion and honors a revocation on promotion", () => {
    const memberId = "member-vice-president";
    expect(setDevMemberStatus(memberId, "regular")?.isAlumni).toBe(true);
    expect(setDevMemberStatus(memberId, "associate")?.isAlumni).toBe(true);
    expect(revokeDevMemberAlumni(memberId)).toBe(true);
    expect(setDevMemberStatus(memberId, "regular")?.isAlumni).toBe(false);
    expect(getDevAdminMember(memberId)).toMatchObject({
      isAlumni: false,
      alumniRevoked: true,
    });
  });

  it("projects only consented current executives into the public roster", () => {
    const roster = getDevPublicExecutives();
    expect(roster.president).toMatchObject({
      title: "회장",
      phone: expect.stringMatching(/^010-/),
      email: expect.stringContaining("@"),
    });
    expect(roster.vicePresident).toMatchObject({ title: "부회장" });
    expect(getDevPublicExecutives("99-1")).toMatchObject({
      president: null,
      vicePresident: null,
    });
  });

  it("projects a public member roster without operational or private fields", () => {
    const publicMembers = projectPublicMembers(
      getDevAdminMembers().map((member) => getDevAdminMember(member.id)!),
    );
    expect(publicMembers.length).toBeGreaterThan(0);
    expect(publicMembers[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        department: expect.any(String),
        roles: expect.any(Array),
      }),
    );
    expect(publicMembers[0]).not.toHaveProperty("status");
    expect(publicMembers[0]).not.toHaveProperty("isAdmin");
    expect(publicMembers[0]).not.toHaveProperty("privateInfo");
    expect(
      publicMembers.some((member) => member.id === "member-withdrawing"),
    ).toBe(false);
  });

  it("exposes consented contact only for current president roles", () => {
    const members = getDevAdminMembers().map((member) =>
      getDevAdminMember(member.id)!,
    );
    const history = projectPublicExecutiveHistory(
      members,
      getDevPublicExecutives().term,
    );
    expect(history[0]?.executives.some((entry) => entry.contact)).toBe(true);
    for (const term of history.slice(1)) {
      expect(term.executives.every((entry) => entry.contact === null)).toBe(
        true,
      );
    }
    expect(history.flatMap((term) => term.executives)).not.toContainEqual(
      expect.objectContaining({ title: "총무" }),
    );
  });
});
