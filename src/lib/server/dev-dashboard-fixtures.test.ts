import { beforeEach, describe, expect, it } from "vitest";
import {
  applyDevDashboardActivity,
  cancelDevDashboardActivity,
  getDevMemberDashboard,
  resetDevDashboardFixtures,
} from "$lib/server/dev-dashboard-fixtures";

const now = new Date("2026-08-28T12:00:00+09:00");

describe("development member dashboard", () => {
  beforeEach(resetDevDashboardFixtures);

  it("returns only the requested semester with API-computed event flags", () => {
    const dashboard = getDevMemberDashboard("member", "26-2", now)!;
    expect(dashboard.activities.every((item) => item.semester === "26-2")).toBe(
      true,
    );
    expect(
      dashboard.activities.find(
        (item) => item.eventId === "dashboard-event-geometry-problems",
      ),
    ).toMatchObject({ canApply: true, isApplied: false });
  });

  it("applies and cancels idempotently while the event is open", () => {
    const eventId = "dashboard-event-geometry-problems";
    expect(applyDevDashboardActivity("member", eventId, now)).toMatchObject({
      success: true,
      activity: { isApplied: true },
    });
    expect(applyDevDashboardActivity("member", eventId, now)).toMatchObject({
      success: true,
      activity: { isApplied: true },
    });
    expect(cancelDevDashboardActivity("member", eventId, now)).toMatchObject({
      success: true,
      activity: { isApplied: false },
    });
  });

  it("rejects application changes after an event starts", () => {
    expect(
      applyDevDashboardActivity("member", "dashboard-event-study-session", now),
    ).toEqual({ success: false, error: "EVENT_NOT_OPEN" });
  });
});
