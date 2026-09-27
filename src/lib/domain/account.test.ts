import { describe, expect, it } from "vitest";
import {
  validateMailPreferenceForm,
  validateWithdrawalRequestForm,
  withdrawalGraceEndsAt,
} from "./account";

describe("account settings validation", () => {
  it("parses the announcement preference without coercing false to true", () => {
    const formData = new FormData();
    formData.set("type", "announcements");
    formData.set("enabled", "false");

    expect(validateMailPreferenceForm(formData)).toEqual({
      success: true,
      data: { type: "announcements", enabled: false },
    });
  });

  it("requires every withdrawal confirmation on the server", () => {
    const formData = new FormData();
    formData.set("ackInfo", "on");
    formData.set("confirmName", "다른 이름");

    const result = validateWithdrawalRequestForm(formData, "김회원");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failure.issues.ackDataPolicy).toBeDefined();
      expect(result.failure.issues.confirmName).toBeDefined();
    }
  });

  it("accepts an exact name after both acknowledgements", () => {
    const formData = new FormData();
    formData.set("ackInfo", "on");
    formData.set("ackDataPolicy", "on");
    formData.set("confirmName", "김회원");

    expect(validateWithdrawalRequestForm(formData, "김회원").success).toBe(
      true,
    );
  });

  it("calculates the one-month grace-period end", () => {
    expect(withdrawalGraceEndsAt("2026-08-28T00:00:00.000Z")).toBe(
      "2026-09-28T00:00:00.000Z",
    );
  });

  // The grace period is one calendar month (API-SPEC §4-7, the "1개월" the
  // UI promises); the services used 30 days (audit LB27-1). A month-end
  // request clamps instead of rolling into the month after.
  it("clamps to the last day of a shorter month, on the KST calendar", () => {
    expect(withdrawalGraceEndsAt("2027-01-31T10:00:00+09:00")).toBe(
      new Date("2027-02-28T10:00:00+09:00").toISOString(),
    );
    expect(withdrawalGraceEndsAt("2028-01-31T10:00:00+09:00")).toBe(
      new Date("2028-02-29T10:00:00+09:00").toISOString(),
    );
    // 00:30 KST on Mar 31 is Mar 30 in UTC — the KST day decides
    expect(withdrawalGraceEndsAt("2027-03-31T00:30:00+09:00")).toBe(
      new Date("2027-04-30T00:30:00+09:00").toISOString(),
    );
  });
});
