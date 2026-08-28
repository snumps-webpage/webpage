import { describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import {
  DEV_STUDY_ID,
  acceptDevTransfer,
  approveDevStudyRequest,
  cancelDevStudySession,
  createDevStudyRequest,
  createDevStudySession,
  getDevStudyDetail,
  getDevStudyCheckInEvent,
  getDevStudyManagementData,
  getDevStudyRequestsForMember,
  getDevTransferOffers,
  joinDevStudy,
  leaveDevStudy,
  recordDevStudyCheckIn,
  withdrawDevStudyRequest,
} from "./dev-study-fixtures";

describe.sequential("development study workflow", () => {
  it("returns the same session for a retried operation ID", () => {
    const before = getDevStudyManagementData().sessions.length;
    const operationId = uuidv7();
    const first = createDevStudySession(operationId);
    const retried = createDevStudySession(operationId);

    expect(retried).toEqual(first);
    expect(getDevStudyManagementData().sessions).toHaveLength(before + 1);
  });

  it("opens a created session share link and enqueues one check-in", () => {
    const session = createDevStudySession(uuidv7());
    const [, , pathId, attendCode] = session.attendancePath.split("/");
    expect(getDevStudyCheckInEvent(pathId, attendCode)).toMatchObject({
      event: { id: session.eventId, status: "active", type: "스터디" },
      context: { sessionTitle: session.title },
    });
    const member = {
      id: "member-study-checkin",
      name: "체크인 회원",
      department: "수리과학부",
      email: "checkin@snu.ac.kr",
    };
    expect(recordDevStudyCheckIn(session.eventId, member)).toEqual({
      isNew: true,
    });
    expect(recordDevStudyCheckIn(session.eventId, member)).toEqual({
      isNew: false,
    });
  });

  it("makes a cancelled session non-editable and non-reopenable", () => {
    const session = createDevStudySession(uuidv7());
    expect(cancelDevStudySession(session.id)).toBe(true);

    const cancelled = getDevStudyManagementData().sessions.find(
      (item) => item.id === session.id,
    );
    expect(cancelled).toMatchObject({
      status: "cancelled",
      canEdit: false,
      canCancel: false,
    });
    expect(cancelDevStudySession(session.id)).toBe(false);
  });

  it("creates and withdraws a schedule-free proposal", () => {
    const request = createDevStudyRequest({
      title: "편미분방정식 읽기 모임",
      textbook: "Evans, Partial Differential Equations",
      description: "약해와 소볼레프 공간을 예제와 함께 읽고 계산을 토론합니다.",
      semester: "26-2",
    });

    expect(request).not.toHaveProperty("schedule");
    expect(withdrawDevStudyRequest(request.id)).toBe(true);
    expect(
      getDevStudyRequestsForMember().find((item) => item.id === request.id),
    ).toMatchObject({ status: "withdrawn", canWithdraw: false });
    expect(withdrawDevStudyRequest(request.id)).toBe(false);
  });

  it("creates a recruiting study exactly once when an admin approves", () => {
    const request = createDevStudyRequest({
      title: "측도론 문제풀이",
      textbook: "Folland, Real Analysis",
      description: "르베그 적분과 수렴 정리의 대표 문제를 함께 풉니다.",
      semester: "26-2",
    });
    const approved = approveDevStudyRequest(request.id);

    expect(approved).toMatchObject({
      status: "recruiting",
      relationship: "organizer",
    });
    expect(approveDevStudyRequest(request.id)).toBeNull();
    expect(getDevStudyDetail(approved!.id)).toMatchObject({
      relationship: "organizer",
      canManage: true,
      canJoin: false,
    });
  });

  it("keeps join and leave idempotent while protecting the organizer", () => {
    const studyId = "study-number-theory-1";
    expect(joinDevStudy(studyId)).toBe(true);
    expect(joinDevStudy(studyId)).toBe(true);
    expect(getDevStudyDetail(studyId)).toMatchObject({
      relationship: "pending",
      canLeave: true,
    });

    expect(leaveDevStudy(studyId)).toBe(true);
    expect(leaveDevStudy(studyId)).toBe(true);
    expect(getDevStudyDetail(studyId)).toMatchObject({ relationship: "none" });
    expect(leaveDevStudy(DEV_STUDY_ID)).toBe(false);
  });

  it("replaces the organizer only after the target accepts", () => {
    const offer = getDevTransferOffers()[0];
    expect(offer).toBeDefined();
    expect(getDevStudyDetail(offer.studyId)).toMatchObject({
      relationship: "none",
    });

    expect(acceptDevTransfer(offer.studyId)).toBe(true);
    expect(getDevTransferOffers()).toEqual([]);
    expect(getDevStudyDetail(offer.studyId)).toMatchObject({
      relationship: "organizer",
      canManage: true,
    });
    expect(acceptDevTransfer(offer.studyId)).toBe(false);
  });
});
