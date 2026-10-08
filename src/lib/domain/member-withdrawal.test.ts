import { describe, expect, it } from "vitest";
import {
  initialWithdrawalValues,
  withdrawalFailureMessage,
  withdrawalTimeLabel,
} from "./member-withdrawal";
describe("member withdrawal view state", () => {
  it("starts both confirmations unchecked without a previous request", () => {
    expect(initialWithdrawalValues(null)).toEqual({
      ackInfo: false,
      ackDataPolicy: false,
      confirmName: "",
    });
  });
  it("restores explicit checked and unchecked choices,including raw name", () => {
    expect(
      initialWithdrawalValues({
        operation: "withdrawalRequested",
        error: "VALIDATION_FAILED",
        values: {
          ackInfo: true,
          ackDataPolicy: false,
          confirmName: "  예시 회원  ",
        },
      }),
    ).toEqual({
      ackInfo: true,
      ackDataPolicy: false,
      confirmName: "  예시 회원  ",
    });
  });
  it("does not borrow confirmations from cancellation metadata", () => {
    expect(
      initialWithdrawalValues({
        operation: "withdrawalCancelled",
        error: "NOT_FOUND",
        values: { ackInfo: true, ackDataPolicy: true, confirmName: "회원" },
      }).ackInfo,
    ).toBe(false);
  });
  it("makes an outage uncertainty different from permanent cancellation refusal", () => {
    expect(
      withdrawalFailureMessage({
        operation: "withdrawalCancelled",
        error: "SERVICE_UNAVAILABLE",
      }),
    ).toContain("상태가 바뀌었을 수");
    expect(
      withdrawalFailureMessage({
        operation: "withdrawalCancelled",
        error: "SERVICE_UNAVAILABLE",
      }),
    ).not.toContain("철회할 수 없는");
  });
  it("reports confirmation and organizer failures with the correct operation", () => {
    expect(
      withdrawalFailureMessage({
        operation: "withdrawalRequested",
        error: "VALIDATION_FAILED",
        issues: { ackInfo: "접근 안내를 확인" },
      }),
    ).toContain("접근 안내를 확인");
    expect(
      withdrawalFailureMessage({
        operation: "withdrawalRequested",
        error: "CONFLICT",
      }),
    ).toContain("주최자를 먼저 인계");
    expect(
      withdrawalFailureMessage({
        operation: "withdrawalCancelled",
        error: "NOT_FOUND",
      }),
    ).toContain("탈퇴 신청을 철회하지 못했습니다");
  });
  it("uses safe server explanation and no result for absent error", () => {
    expect(
      withdrawalFailureMessage({
        operation: "withdrawalRequested",
        error: "FORBIDDEN",
        message: "계정 확인 안내",
      }),
    ).toContain("계정 확인 안내");
    expect(withdrawalFailureMessage(null)).toBeNull();
  });
  it("formats the original instant on the Korean calendar", () => {
    expect(withdrawalTimeLabel("2026-09-30T23:00:00Z")).toContain(
      "2026년 10월 1일",
    );
  });
});
