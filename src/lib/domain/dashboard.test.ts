import { describe, expect, it, vi } from "vitest";
import {
  dashboardActivityErrorMessage,
  dashboardActivityState,
  type DashboardActivityItem,
} from "$lib/domain/dashboard";

function activity(
  overrides: Partial<DashboardActivityItem>,
): DashboardActivityItem {
  return {
    id: "activity-1",
    title: "활동",
    type: "세미나",
    startsAt: "2026-09-03T18:30:00+09:00",
    semester: "26-2",
    detailUrl: null,
    eventId: "event-1",
    isApplied: false,
    canApply: false,
    pendingAttendance: false,
    attended: false,
    ...overrides,
  };
}

describe("dashboardActivityState", () => {
  it("prioritizes confirmed and pending attendance over applications", () => {
    expect(
      dashboardActivityState(
        activity({ attended: true, pendingAttendance: true, isApplied: true }),
      ),
    ).toBe("attended");
    expect(
      dashboardActivityState(
        activity({ pendingAttendance: true, isApplied: true }),
      ),
    ).toBe("pending");
  });

  it("distinguishes applied and available future events", () => {
    expect(dashboardActivityState(activity({ isApplied: true }))).toBe(
      "applied",
    );
    expect(dashboardActivityState(activity({ canApply: true }))).toBe(
      "available",
    );
  });

  it("marks past non-attendance as absent", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T12:00:00+09:00"));
    expect(
      dashboardActivityState(
        activity({ startsAt: "2026-08-20T18:00:00+09:00" }),
      ),
    ).toBe("absent");
    vi.useRealTimers();
  });
});

describe("dashboardActivityErrorMessage", () => {
  it("says the window closed for an event that has started", () => {
    expect(dashboardActivityErrorMessage("EVENT_NOT_OPEN")).toBe(
      "신청 가능한 시간이 지났습니다.",
    );
  });

  // A cancelled event answers 404: for members it no longer exists.
  it("says the activity is gone for a cancelled or removed event", () => {
    expect(dashboardActivityErrorMessage("NOT_FOUND")).toBe(
      "더 이상 신청할 수 없는 활동입니다. 새로고침해 주세요.",
    );
  });

  it("says who may take part when the member may not", () => {
    expect(dashboardActivityErrorMessage("FORBIDDEN")).toBe(
      "이번 학기 등록 회원만 참여할 수 있습니다.",
    );
  });

  it("falls back to a generic message", () => {
    expect(dashboardActivityErrorMessage(undefined)).toBe(
      "참여 상태를 변경하지 못했습니다.",
    );
  });
});
