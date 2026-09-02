import type {
  AdminAttendanceQueueItem,
  AdminDashboardData,
  AdminConnectableActivity,
  AdminEventItem,
  AdminEventStatus,
  AdminMembershipApplicationItem,
} from "$lib/domain/admin-dashboard";
import {
  adminAttendanceCapabilities,
  adminEventCapabilities,
} from "$lib/domain/admin-dashboard";
import type { ActivityType } from "$lib/constants";
import { getDevAdminSeminarRequests } from "$lib/server/dev-admin-seminar-fixtures";
import { getDevAdminStudyRequests } from "$lib/server/dev-study-fixtures";
import { getDevAdminWithdrawalQueue } from "$lib/server/dev-member-fixtures";

interface DevEventRecord {
  id: string;
  activityId: string;
  title: string;
  type: ActivityType;
  startsAt: string;
  endsAt: string | null;
  status: AdminEventStatus;
  attendancePath: string;
}

function initialConnectableActivities(): AdminConnectableActivity[] {
  return [
    {
      id: "activity-logic-reading",
      title: "수리논리학 논문 읽기",
      type: "스터디",
      date: "2026-08-22T15:00:00+09:00",
      attendeeCount: 6,
    },
    {
      id: "activity-spring-dinner",
      title: "2026-1 종강 회식",
      type: "회식",
      date: "2026-06-19T18:30:00+09:00",
      attendeeCount: 18,
    },
  ];
}

function initialApplications(): AdminMembershipApplicationItem[] {
  return [
    {
      id: "application-analysis-1",
      name: "송해석",
      email: "analysis-applicant@snu.ac.kr",
      phone: "010-4521-8963",
      department: "수리과학부",
      studentId: "2023-11111",
      background: "해석개론을 수강했고 편미분방정식에 관심이 있습니다.",
      consentAt: "2026-08-26T10:20:00+09:00",
      submittedAt: "2026-08-26T10:20:00+09:00",
      canApprove: true,
      canReject: true,
    },
    {
      id: "application-statistics-1",
      name: "권확률",
      email: "probability-applicant@snu.ac.kr",
      phone: "010-8035-1724",
      department: "통계학과",
      studentId: "2023-11111",
      background: "확률론과 조합론 문제 풀이를 좋아합니다.",
      consentAt: "2026-08-28T13:45:00+09:00",
      submittedAt: "2026-08-28T13:45:00+09:00",
      canApprove: true,
      canReject: true,
    },
  ];
}

function initialEvents(): DevEventRecord[] {
  return [
    {
      id: "event-seminar-graph",
      activityId: "activity-seminar-graph",
      title: "그래프 스펙트럼 입문",
      type: "세미나",
      startsAt: "2026-09-03T18:30:00+09:00",
      endsAt: "2026-09-03T19:30:00+09:00",
      status: "active",
      attendancePath: "/events/graph-spectrum/checkin-graph",
    },
    {
      id: "event-study-algebra-2",
      activityId: "activity-study-algebra-2",
      title: "대수적 위상수학 읽기 모임 2회차",
      type: "스터디",
      startsAt: "2026-08-26T18:32:00+09:00",
      endsAt: null,
      status: "active",
      attendancePath: "/events/study-algebra-s2/checkin-s2",
    },
    {
      id: "event-problem-workshop",
      activityId: "activity-problem-workshop",
      title: "함수방정식 문제 창작",
      type: "문제 창작",
      startsAt: "2026-09-08T19:00:00+09:00",
      endsAt: "2026-09-08T21:00:00+09:00",
      status: "draft",
      attendancePath: "/events/function-equation/draft-code",
    },
    {
      id: "event-meeting-august",
      activityId: "activity-meeting-august",
      title: "8월 정기 회의",
      type: "회의",
      startsAt: "2026-08-15T14:00:00+09:00",
      endsAt: "2026-08-15T15:30:00+09:00",
      status: "expired",
      attendancePath: "/events/meeting-august/closed-code",
    },
  ];
}

function initialAttendanceQueue(): AdminAttendanceQueueItem[] {
  return [
    {
      id: "attendance-graph-applicant",
      eventId: "event-seminar-graph",
      eventTitle: "그래프 스펙트럼 입문",
      activityId: "activity-seminar-graph",
      member: {
        id: "seminar-applicant-4",
        name: "최관심",
        department: "컴퓨터공학부",
        email: "interest@snu.ac.kr",
      },
      startTime: "2026-09-03T18:27:00+09:00",
      endTime: "2026-09-03T18:27:00+09:00",
      status: "pending",
      createdAt: "2026-09-03T18:27:00+09:00",
      ...adminAttendanceCapabilities("pending"),
    },
    {
      id: "attendance-study-member",
      eventId: "event-study-algebra-2",
      eventTitle: "대수적 위상수학 읽기 모임 2회차",
      activityId: "activity-study-algebra-2",
      member: {
        id: "member-study-3",
        name: "정조합",
        department: "컴퓨터공학부",
        email: "combinatorics@snu.ac.kr",
      },
      startTime: "2026-08-26T18:31:00+09:00",
      endTime: "2026-08-26T18:31:00+09:00",
      status: "pending",
      createdAt: "2026-08-26T18:31:00+09:00",
      ...adminAttendanceCapabilities("pending"),
    },
  ];
}

function initialActivityAttendees() {
  return new Map<string, string[]>([
    ["activity-seminar-graph", ["seminar-applicant-1", "member-walk-in"]],
    ["activity-study-algebra-2", ["dev-member", "member-study-1"]],
    [
      "activity-study-algebra-1",
      ["dev-member", "member-study-1", "member-study-2"],
    ],
    ["activity-problem-workshop", []],
    ["activity-meeting-august", ["dev-member"]],
    [
      "activity-seminar-number-theory",
      ["seminar-applicant-2", "seminar-applicant-3"],
    ],
    [
      "activity-logic-reading",
      Array.from({ length: 6 }, (_, index) => `logic-member-${index + 1}`),
    ],
    [
      "activity-spring-dinner",
      Array.from({ length: 18 }, (_, index) => `dinner-member-${index + 1}`),
    ],
  ]);
}

let applications = initialApplications();
let events = initialEvents();
let attendanceQueue = initialAttendanceQueue();
let activityAttendees = initialActivityAttendees();
let connectableActivities = initialConnectableActivities();

function clone<T>(value: T): T {
  return structuredClone(value);
}

function pendingCount(eventId: string) {
  return attendanceQueue.filter(
    (record) => record.eventId === eventId && record.status === "pending",
  ).length;
}

function projectEvent(event: DevEventRecord): AdminEventItem {
  const count = pendingCount(event.id);
  return clone({
    ...event,
    pendingAttendanceCount: count,
    ...adminEventCapabilities(event.status, count),
  });
}

function projectAttendance(record: AdminAttendanceQueueItem) {
  return clone({
    ...record,
    ...adminAttendanceCapabilities(record.status),
  });
}

export function getDevAdminDashboard(): AdminDashboardData {
  return {
    applications: clone(
      [...applications].sort((a, b) =>
        a.submittedAt.localeCompare(b.submittedAt),
      ),
    ),
    seminarRequests: getDevAdminSeminarRequests(),
    studyRequests: getDevAdminStudyRequests(),
    events: events
      .map(projectEvent)
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
    attendanceQueue: attendanceQueue
      .filter((record) => record.status === "pending")
      .map(projectAttendance)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    withdrawals: getDevAdminWithdrawalQueue(),
    generatedAt: new Date().toISOString(),
  };
}

export function getDevConnectableActivities() {
  const connectedIds = new Set(events.map((event) => event.activityId));
  return clone(
    connectableActivities.filter((activity) => !connectedIds.has(activity.id)),
  );
}

function createAttendancePath(activityId: string) {
  const token = crypto.randomUUID().slice(0, 8);
  return `/events/${activityId}/${token}`;
}

export function createDevEvent(input: {
  title: string;
  type: ActivityType;
  startsAt: string;
}) {
  const activityId = `activity-${crypto.randomUUID()}`;
  const record: DevEventRecord = {
    id: `event-${crypto.randomUUID()}`,
    activityId,
    title: input.title,
    type: input.type,
    startsAt: input.startsAt,
    endsAt: null,
    status: "draft",
    attendancePath: createAttendancePath(activityId),
  };
  events = [record, ...events];
  activityAttendees.set(activityId, []);
  return projectEvent(record);
}

export function publishDevEvent(input: {
  id: string;
  activityId: string;
  title: string;
  type: ActivityType;
  startsAt: string;
  endsAt: string | null;
}) {
  const existing = events.find((event) => event.id === input.id);
  if (existing) return projectEvent(existing);
  const record: DevEventRecord = {
    ...input,
    status: "active",
    attendancePath: createAttendancePath(input.activityId),
  };
  events = [record, ...events];
  if (!activityAttendees.has(input.activityId)) {
    activityAttendees.set(input.activityId, []);
  }
  return projectEvent(record);
}

export function updateDevPublishedEvent(
  eventId: string,
  input: Pick<DevEventRecord, "title" | "startsAt" | "endsAt">,
) {
  const record = events.find((event) => event.id === eventId);
  if (!record) return null;
  Object.assign(record, input);
  return projectEvent(record);
}

export function connectDevActivity(activityId: string) {
  if (events.some((event) => event.activityId === activityId)) return null;
  const activity = connectableActivities.find((item) => item.id === activityId);
  if (!activity) return null;
  const record: DevEventRecord = {
    id: `event-${crypto.randomUUID()}`,
    activityId: activity.id,
    title: activity.title,
    type: activity.type,
    startsAt: activity.date,
    endsAt: null,
    status: "active",
    attendancePath: createAttendancePath(activity.id),
  };
  events = [record, ...events];
  if (!activityAttendees.has(activity.id))
    activityAttendees.set(activity.id, []);
  return projectEvent(record);
}

export function approveDevApplication(applicationId: string) {
  const application = applications.find((item) => item.id === applicationId);
  if (!application) return false;
  applications = applications.filter((item) => item.id !== applicationId);
  return true;
}

export function getDevApplicationByEmail(email: string) {
  const application = applications.find((item) => item.email === email);
  return application ? clone(application) : null;
}

export function submitDevApplication(input: {
  name: string;
  email: string;
  phone: string;
  department: string;
  background: string;
}) {
  if (applications.some((item) => item.email === input.email)) return null;
  const submittedAt = new Date().toISOString();
  const application: AdminMembershipApplicationItem = {
    id: `application-${crypto.randomUUID()}`,
    studentId: "",
    ...clone(input),
    consentAt: submittedAt,
    submittedAt,
    canApprove: true,
    canReject: true,
  };
  applications = [...applications, application];
  return clone(application);
}

export function updateDevApplication(
  applicationId: string,
  email: string,
  input: Pick<AdminMembershipApplicationItem, "phone" | "background">,
) {
  const application = applications.find(
    (item) => item.id === applicationId && item.email === email,
  );
  if (!application) return null;
  application.phone = input.phone;
  application.background = input.background;
  return clone(application);
}

export function withdrawDevApplication(applicationId: string, email: string) {
  const application = applications.find(
    (item) => item.id === applicationId && item.email === email,
  );
  if (!application) return false;
  applications = applications.filter((item) => item.id !== applicationId);
  return true;
}

export function rejectDevApplication(applicationId: string) {
  return approveDevApplication(applicationId);
}

export function setDevEventStatus(eventId: string, status: AdminEventStatus) {
  const event = events.find((item) => item.id === eventId);
  if (!event) return null;
  const allowed =
    (status === "active" &&
      (event.status === "draft" || event.status === "expired")) ||
    (status === "expired" && event.status === "active");
  if (!allowed) return null;
  event.status = status;
  return projectEvent(event);
}

export function updateDevEvent(
  eventId: string,
  input: Pick<DevEventRecord, "title" | "type" | "startsAt" | "endsAt">,
) {
  const event = events.find((item) => item.id === eventId);
  if (!event) return null;
  Object.assign(event, clone(input));
  attendanceQueue = attendanceQueue.map((record) =>
    record.eventId === eventId
      ? { ...record, eventTitle: input.title }
      : record,
  );
  return projectEvent(event);
}

export function deleteDevEvent(eventId: string) {
  const event = events.find((item) => item.id === eventId);
  if (!event) return { success: false as const, error: "NOT_FOUND" as const };
  if (pendingCount(eventId) > 0) {
    return { success: false as const, error: "CONFLICT" as const };
  }
  events = events.filter((item) => item.id !== eventId);
  attendanceQueue = attendanceQueue.filter(
    (record) => record.eventId !== eventId,
  );
  activityAttendees.delete(event.activityId);
  return { success: true as const };
}

export function getDevActivityAttendeeIds(activityId: string) {
  return [...(activityAttendees.get(activityId) ?? [])];
}

export function replaceDevActivityAttendees(
  activityId: string,
  attendeeIds: string[],
) {
  activityAttendees.set(activityId, [...new Set(attendeeIds)]);
  return getDevActivityAttendeeIds(activityId);
}

function setAttendanceStatus(
  eventId: string,
  attendanceId: string,
  status: "approved" | "rejected",
) {
  const record = attendanceQueue.find(
    (item) => item.eventId === eventId && item.id === attendanceId,
  );
  if (!record) return null;
  const attendeeIds = new Set(getDevActivityAttendeeIds(record.activityId));
  if (status === "approved") attendeeIds.add(record.member.id);
  else attendeeIds.delete(record.member.id);
  replaceDevActivityAttendees(record.activityId, [...attendeeIds]);
  record.status = status;
  return projectAttendance(record);
}

export function approveDevAttendance(eventId: string, attendanceId: string) {
  return setAttendanceStatus(eventId, attendanceId, "approved");
}

export function rejectDevAttendance(eventId: string, attendanceId: string) {
  return setAttendanceStatus(eventId, attendanceId, "rejected");
}

export function updateDevAttendanceTime(
  eventId: string,
  attendanceId: string,
  startTime: string,
  endTime: string,
) {
  const record = attendanceQueue.find(
    (item) => item.eventId === eventId && item.id === attendanceId,
  );
  if (!record) return null;
  record.startTime = startTime;
  record.endTime = endTime;
  return projectAttendance(record);
}

export function deleteDevAttendance(eventId: string, attendanceId: string) {
  const record = attendanceQueue.find(
    (item) => item.eventId === eventId && item.id === attendanceId,
  );
  if (!record) return false;
  if (record.status === "approved") {
    const attendeeIds = getDevActivityAttendeeIds(record.activityId).filter(
      (memberId) => memberId !== record.member.id,
    );
    replaceDevActivityAttendees(record.activityId, attendeeIds);
  }
  attendanceQueue = attendanceQueue.filter(
    (item) => item.eventId !== eventId || item.id !== attendanceId,
  );
  return true;
}

export function enqueueDevAttendance(input: {
  eventId: string;
  member: AdminAttendanceQueueItem["member"];
  at?: string;
}) {
  const event = events.find((item) => item.id === input.eventId);
  if (!event || event.status !== "active") return null;
  const existing = attendanceQueue.find(
    (record) =>
      record.eventId === input.eventId && record.member.id === input.member.id,
  );
  if (existing)
    return { record: projectAttendance(existing), isNew: false } as const;
  const at = input.at ?? new Date().toISOString();
  const record: AdminAttendanceQueueItem = {
    id: `attendance-${crypto.randomUUID()}`,
    eventId: event.id,
    eventTitle: event.title,
    activityId: event.activityId,
    member: clone(input.member),
    startTime: at,
    endTime: at,
    status: "pending",
    createdAt: at,
    ...adminAttendanceCapabilities("pending"),
  };
  attendanceQueue = [...attendanceQueue, record];
  return { record: projectAttendance(record), isNew: true } as const;
}

export function resetDevAdminDashboardFixtures() {
  applications = initialApplications();
  events = initialEvents();
  attendanceQueue = initialAttendanceQueue();
  activityAttendees = initialActivityAttendees();
  connectableActivities = initialConnectableActivities();
}
