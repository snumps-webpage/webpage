import { describe, expect, it } from "vitest";
import {
  membershipApplicationInputSchema,
  membershipApplicationUpdateSchema,
} from "$lib/domain/membership-applications";

describe("membership application input", () => {
  it("requires normalized phone and explicit consent on initial submission", () => {
    expect(
      membershipApplicationInputSchema.safeParse({
        phone: "010-1234-5678",
        studentId: "2024-12345",
        background: "조합론에 관심이 있습니다.",
        agreement: "on",
      }).success,
    ).toBe(true);
    expect(
      membershipApplicationInputSchema.safeParse({
        phone: "010-1234-5678",
        studentId: "2024-12345",
        background: "",
        agreement: "",
      }).success,
    ).toBe(false);
  });

  it("requires the student id in the 2024-12345 shape", () => {
    const base = { phone: "010-1234-5678", background: "", agreement: "on" };
    expect(
      membershipApplicationInputSchema.safeParse({ ...base, studentId: "abc" })
        .success,
    ).toBe(false);
    expect(
      membershipApplicationInputSchema.safeParse({
        ...base,
        studentId: "202412345",
      }).success,
    ).toBe(true);
  });

  it("does not request consent again when editing an existing application", () => {
    expect(
      membershipApplicationUpdateSchema.safeParse({
        phone: "010-1234-5678",
        studentId: "2024-12345",
        background: "수정된 내용",
      }).success,
    ).toBe(true);
  });
});
