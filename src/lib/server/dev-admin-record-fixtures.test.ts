import { describe, expect, it } from "vitest";
import {
  createDevAdminActivity,
  deleteDevAdminActivity,
  getDevAdminActivities,
  createDevAdminSeminarRecord,
  createDevAdminStudyRecord,
  deleteDevAdminSeminarRecord,
  deleteDevAdminStudyRecord,
  getDevAdminStudyRecords,
  publishDevAdminSeminarRecord,
  scheduleDevAdminSeminarRecord,
  setDevAdminStudyOrganizer,
  setDevAdminActivityAttendees,
  updateDevAdminActivity,
} from "./dev-admin-record-fixtures";
import { getDevPublicArchive } from "./dev-public-content-fixtures";

describe("dev admin record fixtures", () => {
  it("keeps activity editor changes visible in the public archive", () => {
    const created = createDevAdminActivity({
      title: "정수론 문제 풀이",
      type: "문제 풀이",
      date: "2026-08-28",
    });
    updateDevAdminActivity(created.id, {
      title: "정수론 집중 문제 풀이",
      type: "문제 풀이",
      date: "2026-08-29",
    });
    expect(getDevPublicArchive().activities).toContainEqual({
      id: created.id,
      title: "정수론 집중 문제 풀이",
      type: "문제 풀이",
      date: "2026-08-29",
    });
    const publicRecord = getDevPublicArchive().activities.find(
      (activity) => activity.id === created.id,
    );
    expect(publicRecord).not.toHaveProperty("attendeeIds");
    expect(publicRecord).not.toHaveProperty("linkedEventIds");
    expect(
      setDevAdminActivityAttendees(created.id, ["dev-member", "dev-member"])
        ?.attendeeIds,
    ).toEqual(["dev-member"]);
    expect(deleteDevAdminActivity(created.id)).toBe("deleted");
  });

  it("blocks deletion when an event references the activity", () => {
    const linked = getDevAdminActivities().find(
      (activity) => activity.linkedEventIds.length,
    );
    expect(linked).toBeDefined();
    expect(deleteDevAdminActivity(linked!.id)).toBe("conflict");
  });

  it("syncs seminar and study records without exposing admin-only fields", () => {
    const seminar = createDevAdminSeminarRecord({
      title: "프리뷰 세미나",
      term: "26-2",
      kind: "regular",
      description: "관리자 레코드 편집 흐름을 검증하는 세미나입니다.",
      prerequisites: "없음",
      durationMinutes: 60,
      presenterIds: ["dev-member"],
      presenterNames: ["Dev Member"],
    });
    expect(
      getDevPublicArchive().seminars.some((record) => record.id === seminar.id),
    ).toBe(false);
    scheduleDevAdminSeminarRecord(seminar.id, {
      startsAt: "2026-09-20T18:00:00+09:00",
      endsAt: "2026-09-20T19:00:00+09:00",
      location: "129동 101호",
    });
    publishDevAdminSeminarRecord(
      seminar.id,
      `activity-${seminar.id}`,
      `event-${seminar.id}`,
    );
    const publicSeminar = getDevPublicArchive().seminars.find(
      (record) => record.id === seminar.id,
    );
    expect(publicSeminar).not.toHaveProperty("presenterIds");
    expect(publicSeminar).not.toHaveProperty("sourceRequestId");
    expect(getDevAdminActivities()).toContainEqual(
      expect.objectContaining({
        id: `activity-${seminar.id}`,
        linkedEventIds: [`event-${seminar.id}`],
      }),
    );
    expect(getDevPublicArchive().activities).toContainEqual(
      expect.objectContaining({
        id: `activity-${seminar.id}`,
        date: "2026-09-20",
      }),
    );
    expect(deleteDevAdminSeminarRecord(seminar.id)).toBe("conflict");

    const study = createDevAdminStudyRecord({
      title: "프리뷰 스터디",
      term: "26-2",
      description: "관리자 주최자 변경 흐름을 검증하는 스터디입니다.",
      material: "자체 노트",
      organizerId: "dev-member",
      organizerName: "Dev Member",
    });
    const changed = setDevAdminStudyOrganizer(study.id, {
      id: "member-editor",
      name: "이편집",
    });
    expect(changed?.pendingTransfer).toBeNull();
    expect(changed?.transferHistory.at(-1)).toMatchObject({ byAdmin: true });
    const publicStudy = getDevPublicArchive().studies.find(
      (record) => record.id === study.id,
    );
    expect(publicStudy).not.toHaveProperty("pendingTransfer");
    expect(
      getDevAdminStudyRecords().some((record) => record.id === study.id),
    ).toBe(true);
    expect(deleteDevAdminStudyRecord(study.id)).toBe("deleted");
  });
});
