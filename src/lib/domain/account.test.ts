import { describe, expect, it } from "vitest";
import {
  validateMailPreferenceForm,
  validatePhonePreferenceForm,
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

  it.each(["true", "false"])("accepts explicit phone visibility %s", (hide) => {
    const formData = new FormData();
    formData.set("hide", hide);
    expect(validatePhonePreferenceForm(formData)).toEqual({
      success: true,
      data: { hide: hide === "true" },
    });
  });
  it.each([undefined, "", "yes", "FALSE"])(
    "refuses a missing or malformed privacy choice %s",
    (hide) => {
      const formData = new FormData();
      if (hide !== undefined) formData.set("hide", hide);
      expect(validatePhonePreferenceForm(formData)).toMatchObject({
        success: false,
        failure: {
          error: "VALIDATION_FAILED",
          issues: { hide: expect.any(String) },
          values: { hide: hide ?? "" },
        },
      });
    },
  );
  it("refuses a file in place of the privacy choice", () => {
    const formData = new FormData();
    formData.set("hide", new File(["false"], "choice.txt"));
    expect(validatePhonePreferenceForm(formData).success).toBe(false);
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
