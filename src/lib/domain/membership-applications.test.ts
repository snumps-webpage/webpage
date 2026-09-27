import { describe, expect, it } from "vitest";
import {
  membershipApplicationInputSchema,
  membershipApplicationUpdateSchema,
} from "$lib/domain/membership-applications";
import { dashboardProfileInputSchema } from "$lib/domain/dashboard";
import { privateInfoInputSchema } from "$lib/domain/members";

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

  // Audit LC11-4: signup had its own phone copy with its own message
  // ("010-0000-0000 형식으로 입력해 주세요."). Signup, the member's dashboard
  // and the admin edit now share one rule — normalization included — and
  // one message, so a number accepted at signup is one the member can save.
  it("takes phone and background by the members' rule, as every entry point does", () => {
    const base = { studentId: "2024-12345", background: "", agreement: "on" };
    const signup = (phone: string, background = "") =>
      membershipApplicationInputSchema.safeParse({
        ...base,
        phone,
        background,
      });
    const dashboard = (phone: string, background = "") =>
      dashboardProfileInputSchema.safeParse({ phone, background });
    const adminPhone = privateInfoInputSchema.shape.phone;

    expect(signup("010 1234 5678").data?.phone).toBe("010-1234-5678");
    expect(dashboard("01012345678").data?.phone).toBe("010-1234-5678");
    expect(adminPhone.parse("010 1234 5678")).toBe("010-1234-5678");

    for (const parse of [signup, dashboard]) {
      const refused = parse("02-123-4567");
      expect(refused.error?.issues[0]).toMatchObject({
        path: ["phone"],
        message: "전화번호는 010-XXXX-XXXX 형식이어야 합니다.",
      });
      expect(
        parse("010-1234-5678", "가".repeat(2001)).error?.issues[0],
      ).toMatchObject({
        path: ["background"],
        message: "배경지식은 2,000자 이하로 입력해 주세요.",
      });
    }
    expect(adminPhone.safeParse("02-123-4567").error?.issues[0].message).toBe(
      "전화번호는 010-XXXX-XXXX 형식이어야 합니다.",
    );
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
