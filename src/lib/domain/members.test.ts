import { describe, expect, it } from "vitest";
import {
  alumniRevocationInputSchema,
  memberRecordInputSchema,
  memberRolesSchema,
  memberStatusInputSchema,
  parseRolesJson,
  privateInfoInputSchema,
} from "./members";

describe("member administration domain", () => {
  it("accepts term roles and rejects duplicates", () => {
    expect(
      memberRolesSchema.safeParse([
        { term: "26-2", title: "회장" },
        { term: "26-1", title: "학술부장" },
      ]).success,
    ).toBe(true);
    // Terms follow the stored TERM_PATTERN: regular terms only.
    expect(
      memberRolesSchema.safeParse([{ term: "26-W", title: "학술부장" }])
        .success,
    ).toBe(false);
    expect(
      memberRolesSchema.safeParse([
        { term: "26-2", title: "회장" },
        { term: "26-2", title: "회장" },
      ]).success,
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
});
