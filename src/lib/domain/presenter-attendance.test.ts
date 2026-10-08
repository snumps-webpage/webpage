import { describe, expect, it } from "vitest";
import {
  presenterFeedback,
  presenterInitialSelection,
  presenterRequestStatus,
  reconcilePresenterSelection,
} from "./presenter-attendance";
const original = [
  { id: "a", checked: true },
  { id: "b", checked: false },
];
describe("presenter attendance view state", () => {
  it("accepts fresh saved checks when there are no local edits", () => {
    expect(
      reconcilePresenterSelection(
        original,
        [
          { id: "a", checked: false },
          { id: "b", checked: true },
        ],
        ["a"],
      ),
    ).toEqual(["b"]);
  });
  it("preserves only explicit local edits while accepting other fresh checks", () => {
    expect(
      reconcilePresenterSelection(
        original,
        [
          { id: "a", checked: false },
          { id: "b", checked: true },
        ],
        [],
      ),
    ).toEqual(["b"]);
  });
  it("prunes removed applicants and initializes new applicants from saved truth", () => {
    expect(
      reconcilePresenterSelection(
        original,
        [{ id: "c", checked: true }],
        ["a", "b"],
      ),
    ).toEqual(["c"]);
  });
  it("a latest saved change matching an edit becomes a clean selection", () => {
    expect(
      reconcilePresenterSelection(
        original,
        [
          { id: "a", checked: false },
          { id: "b", checked: true },
        ],
        ["a", "b"],
      ),
    ).toEqual(["b"]);
  });
  it("restores native failed selection only for its event and current pool", () => {
    const form = {
      operation: "presenterAttendanceSaved" as const,
      error: "VALIDATION_FAILED",
      eventId: "event",
      values: { attendeeIds: ["b", "outsider"] },
    };
    expect(presenterInitialSelection("event", original, form)).toEqual(["b"]);
    expect(presenterInitialSelection("other", original, form)).toEqual(["a"]);
  });
  it("preserves intentionally empty native selection and ignores cancel metadata", () => {
    expect(
      presenterInitialSelection("event", original, {
        operation: "presenterAttendanceSaved",
        error: "SERVICE_UNAVAILABLE",
        eventId: "event",
        values: { attendeeIds: [] },
      }),
    ).toEqual([]);
    expect(
      presenterInitialSelection("event", original, {
        operation: "seminarCancelled",
        error: "FORBIDDEN",
        eventId: "event",
        values: { attendeeIds: [] },
      }),
    ).toEqual(["a"]);
  });
  it("uses queue decisions without inferring approval from activity checks", () => {
    expect(presenterRequestStatus("pending")).toBe("승인 대기");
    expect(presenterRequestStatus("approved")).toBe("요청 승인");
    expect(presenterRequestStatus("rejected")).toBe("요청 거절");
    expect(presenterRequestStatus(null)).toBe("요청 기록");
  });
  it("reports saved counts without calling queue requests approved", () => {
    expect(
      presenterFeedback({
        success: true,
        operation: "presenterAttendanceSaved",
        applicantAttendeeIds: ["a"],
        totalAttendanceCount: 3,
      })?.message,
    ).toContain("전체 출석 기록은 3명");
  });
  it("keeps cancellation success and failed mail visible together", () => {
    const note = presenterFeedback({
      success: true,
      operation: "seminarCancelled",
      seminarTitle: "예시",
      mailFailed: true,
    });
    expect(note?.tone).toBe("warning");
    expect(note?.message).toContain("‘예시’ 세미나를 취소했습니다");
    expect(note?.message).toContain("안내 메일 발송에 실패");
  });
  it("distinguishes failed cancellation from failed attendance and absent results", () => {
    expect(
      presenterFeedback({ operation: "seminarCancelled", error: "FORBIDDEN" })
        ?.message,
    ).toContain("세미나를 취소하지 못했습니다");
    expect(
      presenterFeedback({
        operation: "presenterAttendanceSaved",
        error: "FORBIDDEN",
      })?.message,
    ).toContain("발표자와 이번 학기 등록");
    expect(presenterFeedback(null)).toBeNull();
    expect(presenterFeedback({ success: true })).toBeNull();
  });
});
