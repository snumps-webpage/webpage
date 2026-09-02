import { beforeEach, describe, expect, it } from "vitest";
import {
  approveDevAttendance,
  connectDevActivity,
  createDevEvent,
  deleteDevAttendance,
  deleteDevEvent,
  enqueueDevAttendance,
  getDevActivityAttendeeIds,
  getDevAdminDashboard,
  getDevApplicationByEmail,
  getDevConnectableActivities,
  publishDevEvent,
  rejectDevAttendance,
  resetDevAdminDashboardFixtures,
  submitDevApplication,
  updateDevPublishedEvent,
  updateDevApplication,
  withdrawDevApplication,
} from "$lib/server/dev-admin-dashboard-fixtures";

describe("development admin dashboard", () => {
  beforeEach(resetDevAdminDashboardFixtures);

  it("moves an approved queue member into activity attendance", () => {
    const approved = approveDevAttendance(
      "event-seminar-graph",
      "attendance-graph-applicant",
    );
    expect(approved?.status).toBe("approved");
    expect(getDevActivityAttendeeIds("activity-seminar-graph")).toContain(
      "seminar-applicant-4",
    );
    expect(
      getDevAdminDashboard().attendanceQueue.some(
        (item) => item.id === "attendance-graph-applicant",
      ),
    ).toBe(false);
  });

  it("includes every pending review queue in the unified dashboard", () => {
    const dashboard = getDevAdminDashboard();
    expect(dashboard.applications.length).toBeGreaterThan(0);
    expect(dashboard.seminarRequests.length).toBeGreaterThan(0);
    expect(dashboard.studyRequests.length).toBeGreaterThan(0);
    expect(dashboard.withdrawals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ memberId: "member-withdrawing" }),
      ]),
    );
  });

  it("requires the queue record to belong to the submitted event", () => {
    expect(
      approveDevAttendance(
        "event-study-algebra-2",
        "attendance-graph-applicant",
      ),
    ).toBeNull();
    expect(getDevActivityAttendeeIds("activity-seminar-graph")).not.toContain(
      "seminar-applicant-4",
    );
  });

  it("reverses approved attendance when rejected or deleted", () => {
    approveDevAttendance("event-seminar-graph", "attendance-graph-applicant");
    rejectDevAttendance("event-seminar-graph", "attendance-graph-applicant");
    expect(getDevActivityAttendeeIds("activity-seminar-graph")).not.toContain(
      "seminar-applicant-4",
    );
    approveDevAttendance("event-seminar-graph", "attendance-graph-applicant");
    expect(
      deleteDevAttendance("event-seminar-graph", "attendance-graph-applicant"),
    ).toBe(true);
    expect(getDevActivityAttendeeIds("activity-seminar-graph")).not.toContain(
      "seminar-applicant-4",
    );
  });

  it("blocks event deletion while a pending queue record exists", () => {
    expect(deleteDevEvent("event-seminar-graph")).toEqual({
      success: false,
      error: "CONFLICT",
    });
  });

  it("enqueues one attendance record per event and member", () => {
    const input = {
      eventId: "event-seminar-graph",
      member: {
        id: "dev-member",
        name: "Dev Member",
        department: "수리과학부",
        email: "dev-member@snu.ac.kr",
      },
      at: "2026-09-03T18:35:00+09:00",
    };
    expect(enqueueDevAttendance(input)?.isNew).toBe(true);
    expect(enqueueDevAttendance(input)?.isNew).toBe(false);
  });

  it("creates a draft with its activity and connects an existing activity once", () => {
    const draft = createDevEvent({
      title: "새 회의",
      type: "회의",
      startsAt: "2026-09-10T18:00:00+09:00",
    });
    expect(draft.status).toBe("draft");
    expect(draft.activityId).toMatch(/^activity-/);

    const activity = getDevConnectableActivities()[0];
    const connected = connectDevActivity(activity.id);
    expect(connected).toMatchObject({
      activityId: activity.id,
      status: "active",
      title: activity.title,
    });
    expect(getDevActivityAttendeeIds(activity.id)).toHaveLength(
      activity.attendeeCount,
    );
    expect(connectDevActivity(activity.id)).toBeNull();
    expect(getDevConnectableActivities()).not.toContainEqual(activity);
  });

  it("publishes a supplied activity event idempotently and updates its schedule", () => {
    const published = publishDevEvent({
      id: "event-new-seminar",
      activityId: "activity-new-seminar",
      title: "새 세미나",
      type: "세미나",
      startsAt: "2026-09-12T18:00:00+09:00",
      endsAt: "2026-09-12T19:00:00+09:00",
    });
    expect(published).toMatchObject({
      status: "active",
      pendingAttendanceCount: 0,
    });
    expect(
      publishDevEvent({
        id: "event-new-seminar",
        activityId: "activity-new-seminar",
        title: "중복",
        type: "세미나",
        startsAt: "2026-09-13T18:00:00+09:00",
        endsAt: null,
      }).title,
    ).toBe("새 세미나");
    expect(
      updateDevPublishedEvent("event-new-seminar", {
        title: "수정된 세미나",
        startsAt: "2026-09-12T19:00:00+09:00",
        endsAt: null,
      }),
    ).toMatchObject({ title: "수정된 세미나", endsAt: null });
  });

  it("submits, edits, and withdraws a membership application with consent", () => {
    const application = submitDevApplication({
      name: "홍길동",
      email: "preview-applicant@snu.ac.kr",
      phone: "010-1234-5678",
      department: "수리과학부",
      background: "문제 풀이를 좋아합니다.",
    });
    expect(application?.consentAt).toBeTruthy();
    expect(getDevApplicationByEmail("preview-applicant@snu.ac.kr")).toEqual(
      application,
    );
    expect(
      updateDevApplication(application!.id, application!.email, {
        phone: "010-9999-8888",
        background: "수정",
      })?.phone,
    ).toBe("010-9999-8888");
    expect(withdrawDevApplication(application!.id, application!.email)).toBe(
      true,
    );
    expect(getDevApplicationByEmail(application!.email)).toBeNull();
  });
});
