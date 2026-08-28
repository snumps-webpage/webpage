import { describe, expect, it, vi } from "vitest";
import {
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
