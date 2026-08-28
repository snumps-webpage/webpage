import { beforeEach, describe, expect, it } from "vitest";
import {
  getDevPresenterEventAttendeeIds,
  getDevPresenterEventManagement,
  hasDevPresenterEvents,
  recordDevCheckIn,
  resetDevPresenterEventFixtures,
  saveDevPresenterEventAttendance,
} from "./dev-presenter-event-fixtures";
import { getDevAdminDashboard } from "./dev-admin-dashboard-fixtures";

describe("presenter event preview", () => {
  beforeEach(() => resetDevPresenterEventFixtures());

  it("filters the list at the presenter authorization boundary", () => {
    expect(hasDevPresenterEvents("dev-member")).toBe(true);
    expect(hasDevPresenterEvents("dev-admin")).toBe(false);
    expect(getDevPresenterEventManagement("dev-admin")).toBeNull();
  });

  it("retains a walk-in attendance record after presenter saves", () => {
    const eventId = "event-seminar-graph";
    const saved = saveDevPresenterEventAttendance(eventId, "dev-member", [
      "member-walk-in",
      "seminar-applicant-2",
    ]);
    expect(saved?.attendanceCount).toBe(2);
    expect(getDevPresenterEventAttendeeIds(eventId)).toEqual([
      "member-walk-in",
      "seminar-applicant-2",
    ]);
  });

  it("rejects a save by a non-presenter", () => {
    expect(
      saveDevPresenterEventAttendance("event-seminar-graph", "dev-admin", []),
    ).toBeNull();
  });

  it("records an active share-link check-in once", () => {
    const member = {
      id: "dev-member",
      name: "Dev Member",
      department: "수리과학부",
      email: "member@snu.ac.kr",
    };
    expect(recordDevCheckIn("event-seminar-graph", member)).toEqual({
      isNew: true,
    });
    expect(recordDevCheckIn("event-seminar-graph", member)).toEqual({
      isNew: false,
    });
    expect(
      getDevAdminDashboard().attendanceQueue.some(
        (record) => record.member.id === "dev-member",
      ),
    ).toBe(true);
  });
});
