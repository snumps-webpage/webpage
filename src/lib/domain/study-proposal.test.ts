import { describe, expect, it } from "vitest";
import {
  orderStudyProposals,
  studyProposalDate,
  studyWithdrawalError,
  STUDY_PROPOSAL_STATUS,
} from "./study-proposal";

describe("study proposal history", () => {
  it("puts pending requests first without reordering within groups or mutating the load", () => {
    const rows = [
      { id: "a", status: "approved" as const },
      { id: "p1", status: "pending" as const },
      { id: "w", status: "withdrawn" as const },
      { id: "p2", status: "pending" as const },
    ];
    expect(orderStudyProposals(rows).map((row) => row.id)).toEqual([
      "p1",
      "p2",
      "a",
      "w",
    ]);
    expect(rows.map((row) => row.id)).toEqual(["a", "p1", "w", "p2"]);
  });
  it("labels every persisted status and distinguishes approval from review", () => {
    expect(Object.keys(STUDY_PROPOSAL_STATUS).sort()).toEqual([
      "approved",
      "pending",
      "rejected",
      "withdrawn",
    ]);
    expect(STUDY_PROPOSAL_STATUS.pending.label).toBe("검토 중");
    expect(STUDY_PROPOSAL_STATUS.approved.description).toContain("스터디 목록");
  });
  it("formats submission dates in KST, independent of the executor timezone", () => {
    expect(studyProposalDate("2026-10-02T16:00:00Z")).toBe("2026년 10월 3일");
    expect(studyProposalDate("not-a-date")).toBe("제출일 미상");
  });
  it("does not put submission errors or successful withdrawals into the withdrawal error rail", () => {
    expect(
      studyWithdrawalError({
        operation: "requestSubmitted",
        error: "CONFLICT",
      }),
    ).toBeNull();
    expect(
      studyWithdrawalError({ operation: "requestWithdrawn", success: true }),
    ).toBeNull();
    expect(studyWithdrawalError(null)).toBeNull();
  });
  it("gives conflicts and missing targets actionable messages without raw codes", () => {
    expect(
      studyWithdrawalError({
        operation: "requestWithdrawn",
        error: "CONFLICT",
      }),
    ).toContain("최신 상태");
    expect(
      studyWithdrawalError({
        operation: "requestWithdrawn",
        error: "NOT_FOUND",
      }),
    ).toContain("찾을 수 없습니다");
    expect(
      studyWithdrawalError({
        operation: "requestWithdrawn",
        error: "SERVICE_UNAVAILABLE",
      }),
    ).not.toContain("SERVICE_UNAVAILABLE");
    expect(
      studyWithdrawalError({
        operation: "requestWithdrawn",
        issues: { _form: "대상 확인" },
      }),
    ).toBe("대상 확인");
  });
});
