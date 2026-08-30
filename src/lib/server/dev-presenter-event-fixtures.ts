import type {
  PresenterEventApplicant,
  PresenterEventManagementData,
  PresenterEventSummary,
  CheckInEvent,
} from "$lib/domain/attendance";
import {
  enqueueDevAttendance,
  getDevActivityAttendeeIds,
  replaceDevActivityAttendees,
  resetDevAdminDashboardFixtures,
} from "$lib/server/dev-admin-dashboard-fixtures";

interface PresenterEventFixture {
  summary: Omit<PresenterEventSummary, "applicantCount" | "attendanceCount">;
  presenterIds: string[];
  presenterNames: string[];
  applicants: Omit<PresenterEventApplicant, "attended" | "checkedInAt">[];
  checkedInAtByMemberId: Record<string, string>;
  pathId: string;
  attendCode: string;
}

const WALK_IN_ID = "member-walk-in";

function initialFixtures(): PresenterEventFixture[] {
  return [
    {
      summary: {
        id: "event-seminar-graph",
        seminarId: "seminar-graph",
        activityId: "activity-seminar-graph",
        title: "그래프 스펙트럼 입문",
        kind: "regular",
        startsAt: "2026-09-03T18:30:00+09:00",
        endsAt: "2026-09-03T19:30:00+09:00",
        location: "27동 220호",
        status: "active",
        attendancePath: "/events/graph-spectrum/checkin-graph",
      },
      presenterIds: ["dev-member"],
      presenterNames: ["Dev Member"],
      applicants: [
        { id: "seminar-applicant-1", name: "김신청", department: "수리과학부" },
        { id: "seminar-applicant-2", name: "이참여", department: "통계학과" },
        {
          id: "seminar-applicant-3",
          name: "박수강",
          department: "물리천문학부",
        },
        {
          id: "seminar-applicant-4",
          name: "최관심",
          department: "컴퓨터공학부",
        },
      ],
      checkedInAtByMemberId: {
        "seminar-applicant-1": "2026-09-03T18:27:00+09:00",
        [WALK_IN_ID]: "2026-09-03T18:35:00+09:00",
      },
      pathId: "graph-spectrum",
      attendCode: "checkin-graph",
    },
    {
      summary: {
        id: "event-seminar-number-theory",
        seminarId: "seminar-number-theory",
        activityId: "activity-seminar-number-theory",
        title: "정수론의 해석적 도구",
        kind: "irregular",
        startsAt: "2026-08-20T17:00:00+09:00",
        endsAt: "2026-08-20T18:20:00+09:00",
        location: "129동 406호",
        status: "expired",
        attendancePath: "/events/analytic-number-theory/checkin-ant",
      },
      presenterIds: ["dev-member", "member-number-organizer"],
      presenterNames: ["Dev Member", "윤정수"],
      applicants: [
        { id: "seminar-applicant-2", name: "이참여", department: "통계학과" },
        {
          id: "seminar-applicant-3",
          name: "박수강",
          department: "물리천문학부",
        },
      ],
      checkedInAtByMemberId: {
        "seminar-applicant-2": "2026-08-20T16:55:00+09:00",
        "seminar-applicant-3": "2026-08-20T17:02:00+09:00",
      },
      pathId: "analytic-number-theory",
      attendCode: "checkin-ant",
    },
  ];
}

let fixtures = initialFixtures();

function clone<T>(value: T): T {
  return structuredClone(value);
}

function summary(fixture: PresenterEventFixture): PresenterEventSummary {
  const attendeeIds = getDevActivityAttendeeIds(fixture.summary.activityId);
  return {
    ...clone(fixture.summary),
    applicantCount: fixture.applicants.length,
    attendanceCount: new Set(attendeeIds).size,
  };
}

function presenterFixtures(memberId: string) {
  return fixtures.filter((fixture) => fixture.presenterIds.includes(memberId));
}

export function hasDevPresenterEvents(memberId: string) {
  return presenterFixtures(memberId).length > 0;
}

export function getDevPresenterEventSummaries(memberId: string) {
  return presenterFixtures(memberId).map(summary);
}

export function getDevPresenterEventManagement(
  memberId: string,
  selectedEventId?: string | null,
): PresenterEventManagementData | null {
  const available = presenterFixtures(memberId);
  const selected = selectedEventId
    ? available.find((fixture) => fixture.summary.id === selectedEventId)
    : available[0];
  if (!selected) return null;

  const selectedAttendeeIds = getDevActivityAttendeeIds(
    selected.summary.activityId,
  );
  const attendeeIds = new Set(selectedAttendeeIds);
  const applicantIds = new Set(selected.applicants.map((member) => member.id));
  return clone({
    events: available.map(summary),
    selectedEvent: summary(selected),
    applicants: selected.applicants.map((member) => ({
      ...member,
      attended: attendeeIds.has(member.id),
      checkedInAt: selected.checkedInAtByMemberId[member.id] ?? null,
    })),
    nonApplicantAttendanceCount: selectedAttendeeIds.filter(
      (memberId) => !applicantIds.has(memberId),
    ).length,
    canSave: selected.summary.status !== "cancelled",
    generatedAt: new Date().toISOString(),
  });
}

export function getDevPresenterEventAttendeeIds(eventId: string) {
  const fixture = fixtures.find((item) => item.summary.id === eventId);
  return fixture ? getDevActivityAttendeeIds(fixture.summary.activityId) : null;
}

export function saveDevPresenterEventAttendance(
  eventId: string,
  presenterId: string,
  attendeeIds: string[],
) {
  const fixture = fixtures.find((item) => item.summary.id === eventId);
  if (!fixture || !fixture.presenterIds.includes(presenterId)) return null;
  replaceDevActivityAttendees(fixture.summary.activityId, attendeeIds);
  return summary(fixture);
}

export function getDevCheckInEvent(pathId: string, attendCode: string) {
  const fixture = fixtures.find(
    (item) => item.pathId === pathId && item.attendCode === attendCode,
  );
  if (!fixture) return null;
  const event: CheckInEvent = {
    id: fixture.summary.id,
    title: fixture.summary.title,
    date: fixture.summary.startsAt,
    type: "세미나",
    status:
      fixture.summary.status === "cancelled"
        ? "expired"
        : fixture.summary.status,
    pathId: fixture.pathId,
    attendCode: fixture.attendCode,
  };
  return clone({
    event,
    context: {
      location: fixture.summary.location,
      presenterNames: fixture.presenterNames,
    },
  });
}

export function recordDevCheckIn(
  eventId: string,
  member: {
    id: string;
    name: string;
    department: string;
    email: string;
  },
) {
  const fixture = fixtures.find((item) => item.summary.id === eventId);
  if (!fixture || fixture.summary.status !== "active") return null;
  const result = enqueueDevAttendance({ eventId, member });
  if (!result) return null;
  if (result.isNew) {
    fixture.checkedInAtByMemberId[member.id] = result.record.createdAt;
  }
  return { isNew: result.isNew } as const;
}

export function resetDevPresenterEventFixtures() {
  fixtures = initialFixtures();
  resetDevAdminDashboardFixtures();
}
