import type { ActivityType } from "$lib/constants";
import type {
  DashboardActivityItem,
  DashboardRequestItem,
  MemberDashboardData,
} from "$lib/domain/dashboard";
import { getDevDashboardProfile } from "$lib/server/dev-member-fixtures";
import {
  getDevStudyList,
  getDevStudyRequestsForMember,
  getDevTransferOffers,
} from "$lib/server/dev-study-fixtures";
import { getDevSeminarRequestsForMember } from "$lib/server/dev-admin-seminar-fixtures";
import type { DevPreviewRole } from "$lib/server/dev-preview";

interface DevDashboardEvent {
  id: string;
  status: "draft" | "active" | "expired";
  applicantIds: string[];
  pendingAttendanceIds: string[];
}

interface DevDashboardActivity {
  id: string;
  title: string;
  type: ActivityType;
  startsAt: string;
  semester: string;
  detailUrl: string | null;
  attendeeIds: string[];
  event: DevDashboardEvent | null;
}

const memberIdByRole: Record<DevPreviewRole, string> = {
  member: "dev-member",
  admin: "dev-admin",
};

function initialActivities(): DevDashboardActivity[] {
  return [
    {
      id: "dashboard-activity-graph-seminar",
      title: "그래프 스펙트럼 입문",
      type: "세미나",
      startsAt: "2026-09-03T18:30:00+09:00",
      semester: "26-2",
      detailUrl: null,
      attendeeIds: [],
      event: {
        id: "dashboard-event-graph-seminar",
        status: "active",
        applicantIds: ["dev-member"],
        pendingAttendanceIds: [],
      },
    },
    {
      id: "dashboard-activity-geometry-problems",
      title: "기하학 문제 풀이 모임",
      type: "문제 풀이",
      startsAt: "2026-09-05T15:00:00+09:00",
      semester: "26-2",
      detailUrl: null,
      attendeeIds: [],
      event: {
        id: "dashboard-event-geometry-problems",
        status: "active",
        applicantIds: [],
        pendingAttendanceIds: [],
      },
    },
    {
      id: "dashboard-activity-study-session",
      title: "대수적 위상수학 읽기 모임 2회차",
      type: "스터디",
      startsAt: "2026-08-26T18:32:00+09:00",
      semester: "26-2",
      detailUrl: "/study/study-algebra-1",
      attendeeIds: [],
      event: {
        id: "dashboard-event-study-session",
        status: "expired",
        applicantIds: ["dev-member"],
        pendingAttendanceIds: ["dev-member"],
      },
    },
    {
      id: "dashboard-activity-problem-writing",
      title: "함수방정식 문제 창작",
      type: "문제 창작",
      startsAt: "2026-08-20T19:00:00+09:00",
      semester: "26-2",
      detailUrl: null,
      attendeeIds: ["dev-member"],
      event: null,
    },
    {
      id: "dashboard-activity-dinner",
      title: "2학기 개강 회식",
      type: "회식",
      startsAt: "2026-08-16T18:00:00+09:00",
      semester: "26-2",
      detailUrl: null,
      attendeeIds: [],
      event: null,
    },
    {
      id: "dashboard-activity-analysis",
      title: "실해석학 문제 풀이",
      type: "문제 풀이",
      startsAt: "2026-03-21T14:00:00+09:00",
      semester: "26-1",
      detailUrl: null,
      attendeeIds: ["dev-member"],
      event: null,
    },
  ];
}

let activities = initialActivities();

function clone<T>(value: T): T {
  return structuredClone(value);
}

function projectActivity(
  activity: DevDashboardActivity,
  memberId: string,
  now: Date,
): DashboardActivityItem {
  const event = activity.event;
  const canApply =
    !!event &&
    event.status === "active" &&
    new Date(activity.startsAt).getTime() > now.getTime();
  return clone({
    id: activity.id,
    title: activity.title,
    type: activity.type,
    startsAt: activity.startsAt,
    semester: activity.semester,
    detailUrl: activity.detailUrl,
    eventId: event?.id ?? null,
    isApplied: event?.applicantIds.includes(memberId) ?? false,
    canApply,
    pendingAttendance: event?.pendingAttendanceIds.includes(memberId) ?? false,
    attended: activity.attendeeIds.includes(memberId),
  });
}

function memberRequests(): DashboardRequestItem[] {
  const seminarRequests = getDevSeminarRequestsForMember("dev-member").map(
    (request): DashboardRequestItem => ({
      id: request.id,
      type: "seminar",
      title: request.title,
      status: request.status,
      submittedAt: request.submittedAt,
      actionPath: request.canEdit ? `/seminar/edit/${request.id}` : null,
    }),
  );
  const studyRequests = getDevStudyRequestsForMember("dev-member").map(
    (request): DashboardRequestItem => ({
      id: request.id,
      type: "study",
      title: request.title,
      status: request.status,
      submittedAt: request.createdAt,
      actionPath: request.canWithdraw ? "/study/apply" : null,
    }),
  );
  return [...seminarRequests, ...studyRequests].sort((a, b) =>
    b.submittedAt.localeCompare(a.submittedAt),
  );
}

export function getDevMemberDashboard(
  role: DevPreviewRole,
  selectedSemester = "26-2",
  now = new Date(),
): MemberDashboardData | null {
  const profile = getDevDashboardProfile(role);
  if (!profile) return null;
  const memberId = memberIdByRole[role];
  const semesters = [
    ...new Set(activities.map((activity) => activity.semester)),
  ]
    .sort()
    .reverse();
  const validSemester = semesters.includes(selectedSemester)
    ? selectedSemester
    : semesters[0];
  const isMemberPreview = role === "member";

  return {
    profile,
    selectedSemester: validSemester,
    semesters,
    activities: activities
      .filter((activity) => activity.semester === validSemester)
      .map((activity) => projectActivity(activity, memberId, now))
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
    myRequests: isMemberPreview ? memberRequests() : [],
    myStudies: isMemberPreview
      ? getDevStudyList().filter((study) => study.relationship !== "none")
      : [],
    pendingTransfer: isMemberPreview
      ? (getDevTransferOffers(memberId)[0] ?? null)
      : null,
    generatedAt: now.toISOString(),
  };
}

function mutateApplication(
  eventId: string,
  memberId: string,
  apply: boolean,
  now: Date,
) {
  const activity = activities.find((item) => item.event?.id === eventId);
  if (!activity?.event)
    return { success: false as const, error: "NOT_FOUND" as const };
  const eventOpen =
    activity.event.status === "active" &&
    new Date(activity.startsAt).getTime() > now.getTime();
  if (!eventOpen) {
    return { success: false as const, error: "EVENT_NOT_OPEN" as const };
  }
  const applicantIds = new Set(activity.event.applicantIds);
  if (apply) applicantIds.add(memberId);
  else applicantIds.delete(memberId);
  activity.event.applicantIds = [...applicantIds];
  return {
    success: true as const,
    activity: projectActivity(activity, memberId, now),
  };
}

export function applyDevDashboardActivity(
  role: DevPreviewRole,
  eventId: string,
  now = new Date(),
) {
  return mutateApplication(eventId, memberIdByRole[role], true, now);
}

export function cancelDevDashboardActivity(
  role: DevPreviewRole,
  eventId: string,
  now = new Date(),
) {
  return mutateApplication(eventId, memberIdByRole[role], false, now);
}

export function resetDevDashboardFixtures() {
  activities = initialActivities();
}
