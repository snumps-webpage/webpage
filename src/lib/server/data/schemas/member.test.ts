import { describe, expect, it } from "vitest";
import { MemberSchema } from "./member";

// "http(s) only" lived in the admin input schema alone, while the stored
// schema took any string: a row written past the form (migration, script,
// SQL flow) could carry `javascript:` into a public link (audit LA21-2).
// The 2026-09-17 backup holds no project URL at all, so the rule costs no row.
describe("MemberSchema project.url", () => {
  const member = (url?: string) => ({
    id: "m1",
    name: "회원",
    department: "수리과학부",
    joinedAt: "2024-03-01",
    status: "regular",
    statusChangedAt: "2026-09-01T00:00:00+09:00",
    withdrawal: null,
    isAlumni: false,
    alumniRevoked: false,
    alumniRevocationReason: null,
    roles: [],
    isAdmin: false,
    publicContact: null,
    project: { title: "프로젝트", ...(url === undefined ? {} : { url }) },
    legacyMemberId: null,
    sourceRequestId: null,
  });

  it("accepts an http(s) URL or none", () => {
    expect(MemberSchema.safeParse(member("https://example.com")).success).toBe(
      true,
    );
    expect(MemberSchema.safeParse(member()).success).toBe(true);
  });

  it("refuses any other scheme", () => {
    expect(MemberSchema.safeParse(member("javascript:alert(1)")).success).toBe(
      false,
    );
    expect(MemberSchema.safeParse(member("example.com")).success).toBe(false);
  });
});
