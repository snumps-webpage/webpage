import { describe, expect, it } from "vitest";
import { membershipSubmissionTime } from "./membership-onboarding";
describe("membership submission time", () => {
  it("shows Korean time independent of the browser or executor timezone", () => {
    expect(membershipSubmissionTime("2026-10-02T16:05:00Z")).toContain(
      "2026년 10월 3일",
    );
    expect(membershipSubmissionTime("2026-10-02T16:05:00Z")).toContain("01:05");
  });
  it("does not show Invalid Date for an unavailable legacy timestamp", () => {
    expect(membershipSubmissionTime("invalid")).toBe("신청 시각 확인 불가");
  });
});
