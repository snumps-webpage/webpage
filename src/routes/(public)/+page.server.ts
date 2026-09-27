import { dev } from "$app/environment";
import { fail } from "@sveltejs/kit";
import { handleUserAction, requireCapability } from "$lib/server/auth-guards";
import { getDirectoryIndex } from "$lib/server/data/directory";
import { CAPABILITIES, hasCapability } from "$lib/server/core/capabilities";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import { getTable, mutate } from "$lib/server/data/tables";
import { getMemberVisibleEvents } from "$lib/server/services/visibility";
import {
  getActivitiesBetween,
  getActivitiesOf,
  getPrivateInfoOf,
} from "$lib/server/data/repos";
import {
  effectiveStatus,
  applyToEvent,
  cancelEventApplication,
} from "$lib/server/services/events";
import { seminarRequestView } from "$lib/server/data/views";
import { currentTerm, termRange } from "$lib/server/core/semester";
import { AppError } from "$lib/server/core/errors";
import { formatPhoneForDisplay, normalizePhoneNumber } from "$lib/utils";
import { termLabel, termOfDateString } from "$lib/domain/term";
import type { ActivityType } from "$lib/constants";
import {
  dashboardEventIdSchema,
  dashboardProfileInputSchema,
  dashboardProfileIssues,
  type DashboardActivityItem,
} from "$lib/domain/dashboard";
import { formText } from "$lib/domain/form-data";
import type {
  Activity,
  Event,
  RequestStatus,
  StudyStatus,
} from "$lib/server/data/schemas";
import type { PageServerLoad } from "./$types";
import { acceptTransfer, declineTransfer } from "$lib/server/services/studies";

/** The streamed member-dashboard payload (FUNCTIONAL-SPEC MEM-04·05, EVT-02·03, STU-07). */
export type DashboardData = {
  activities: {
    id: string;
    name: string;
    date: string;
    type: ActivityType;
    attended: boolean;
    url: string;
    semester: string;
    eventId: string | null;
    isApplied: boolean;
    canApply: boolean;
    pendingAttendance: boolean;
  }[];
  seminarRequests: {
    id: string;
    title: string;
    status: RequestStatus | "cancelled";
    submittedAt: string;
  }[];
  myStudies: {
    id: string;
    title: string;
    semester: string;
    status: StudyStatus;
    role: "organizer" | "participant" | "pending";
  }[];
  pendingTransfers: {
    studyId: string;
    title: string;
    fromMemberName: string;
    requestedAt: string;
  }[];
  myAttendanceStats: { total: number; attended: number };
  profile: {
    name: string;
    department: string;
    email: string;
    phone: string;
    background: string;
  };
  semesters: string[];
  generatedAt: string;
};

/** EVT-02·03: one member's participation state for one activity row. */
function participationState(
  activity: Activity,
  event: Event | undefined,
  myIds: ReadonlySet<string>,
  memberId: string,
  now: Date,
  mayParticipate: boolean,
) {
  const attended = activity.attendeeIds.some((id) => myIds.has(id));
  const isApplied = event?.applicantIds.includes(memberId) ?? false;
  const started = event ? new Date(event.date.start) <= now : true;
  return {
    attended,
    isApplied,
    // effectiveStatus, not the stored value — a lazily-expired event must
    // not advertise an apply button it will reject (review low-16). Same for
    // a member without PARTICIPATE (alumni, unregistered): the action 403s.
    canApply:
      mayParticipate &&
      !!event &&
      effectiveStatus(event, now) === "active" &&
      !started,
    pendingAttendance:
      isApplied && started && !attended && activity.type === "세미나",
  };
}

/**
 * The ledger keeps its rows in local state and replaces one only from the
 * action result (DashboardOperationResult) — so apply/cancel must answer with
 * the row as it now stands, read back after the write.
 */
async function ledgerRowFor(
  eventId: string,
  memberId: string,
): Promise<DashboardActivityItem> {
  const [events, activities, members] = await Promise.all([
    getTable("events"),
    getTable("activities"),
    getTable("members"),
  ]);
  const event = events.find((e) => e.id === eventId);
  const activity = event && activities.find((a) => a.id === event.activityId);
  if (!event || !activity) throw new AppError("NOT_FOUND");
  const legacyId =
    members.find((m) => m.id === memberId)?.legacyMemberId ?? null;
  const myIds = new Set([memberId, ...(legacyId ? [legacyId] : [])]);
  return {
    id: activity.id,
    title: activity.title,
    type: activity.type,
    startsAt: activity.date.start,
    semester: termOfDateString(activity.date.start),
    detailUrl: null,
    eventId: event.id,
    // Only reached after requireCapability(PARTICIPATE) passed.
    ...participationState(activity, event, myIds, memberId, new Date(), true),
  };
}

/**
 * Checked BEFORE the write: an apply that succeeds and then cannot build its
 * answer would report 404 for a change it already made. Member-visible events
 * only — cancelled ones and those on a hidden seminar's activity do not exist
 * for members (services/visibility.ts).
 */
async function assertLedgerTarget(eventId: string): Promise<void> {
  const [events, activities] = await Promise.all([
    getMemberVisibleEvents(),
    getTable("activities"),
  ]);
  const event = events.find((e) => e.id === eventId);
  if (!event || !activities.some((a) => a.id === event.activityId)) {
    throw new AppError("NOT_FOUND");
  }
}

function buildDevDashboardPreview(semesterKey: string): DashboardData {
  const today = new Date();
  const toDate = (offsetDays: number) =>
    new Date(today.getTime() + offsetDays * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

  const activities: DashboardData["activities"] = [
    {
      id: "preview-activity-1",
      name: "조합론 세미나",
      date: toDate(-9),
      type: "세미나",
      attended: true,
      url: "https://example.com/preview/seminar-1",
      semester: semesterKey,
      eventId: null,
      isApplied: false,
      canApply: false,
      pendingAttendance: false,
    },
    {
      id: "preview-activity-2",
      name: "기하학 문제풀이",
      date: toDate(-4),
      type: "문제 풀이",
      attended: false,
      url: "https://example.com/preview/geometry",
      semester: semesterKey,
      eventId: null,
      isApplied: false,
      canApply: false,
      pendingAttendance: false,
    },
    {
      id: "preview-activity-3",
      name: "수리논리 학습회",
      date: toDate(-1),
      type: "스터디",
      attended: true,
      url: "https://example.com/preview/logic",
      semester: semesterKey,
      eventId: null,
      isApplied: false,
      canApply: false,
      pendingAttendance: false,
    },
  ];

  return {
    activities,
    seminarRequests: [
      {
        id: "preview-req-1",
        status: "pending",
        title: "대수적 위상수학 입문",
        submittedAt: new Date(
          today.getTime() - 6 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      },
    ],
    myStudies: [],
    pendingTransfers: [],
    myAttendanceStats: {
      total: activities.length,
      attended: activities.filter((activity) => activity.attended).length,
    },
    profile: {
      name: "미리보기 회원",
      department: "수리과학부",
      email: "preview@snu.ac.kr",
      phone: "010-1234-5678",
      background: "대수학, 해석학, 조합론에 관심이 있습니다.",
    },
    semesters: [semesterKey],
    generatedAt: new Date().toISOString(),
  };
}

export const load: PageServerLoad = async (event) => {
  const devPreviewRole = resolveDevPreviewRole(event.url, event.cookies);
  let session = null;
  try {
    session = await event.locals.auth();
  } catch (error) {
    console.error("[Dashboard Load] Failed to resolve auth session:", error);
  }
  const term = currentTerm();
  const semester = { key: term, name: termLabel(term) };

  if (dev && devPreviewRole) {
    return {
      session,
      isAdmin: devPreviewRole === "admin",
      semester: semester.name,
      currentSemesterKey: semester.key,
      isMember: true,
      application: null,
      streamed: { dashboard: buildDevDashboardPreview(semester.key) },
    };
  }

  if (!session?.user?.email) {
    return {
      session: null,
      isAdmin: false,
      semester: semester.name,
      currentSemesterKey: semester.key,
      streamed: { dashboard: null },
    };
  }

  const member = event.locals.member ?? null;

  const dashboardPromise = async (): Promise<
    DashboardData | { error: string } | null
  > => {
    if (!member) return null;

    try {
      const range = termRange(currentTerm());
      // S9: 재가입 회원의 과거(legacy) 기록 연결 — 본인 행의 legacyMemberId
      const legacyId =
        (await getTable("members")).find((m) => m.id === member.memberId)
          ?.legacyMemberId ?? null;
      const myIds = new Set([member.memberId, ...(legacyId ? [legacyId] : [])]);
      const [
        currentRaw,
        attendedRaw,
        allRequests,
        privateInfo,
        allSeminars,
        allEvents,
        allStudies,
        allMembers,
      ] = await Promise.all([
        getActivitiesBetween(range.start, range.end),
        getActivitiesOf(member.memberId, legacyId),
        getTable("seminar-requests"),
        getPrivateInfoOf(member.memberId),
        getTable("seminars"),
        // 취소된 세미나는 회원 화면에서 사라진다 (services/visibility.ts).
        getMemberVisibleEvents(),
        getTable("studies"),
        getTable("members"),
      ]);
      const eventByActivityId = new Map(
        allEvents.map((e) => [e.activityId, e]),
      );
      const directory = await getDirectoryIndex();
      // S9: 과거 기록은 legacy id를 가리킨다 — 이름 해석은 통합 디렉터리로.
      const memberNameById = new Map(
        [...directory.entries()].map(([id, m]) => [id, m.name]),
      );
      const memberRow =
        allMembers.find((m) => m.id === member.memberId) ?? null;
      const now = new Date();

      // 취소는 세미나 행만 뒤집는다 — 신청 행은 "승인됨"인 채로 남는다. 발표자
      // 화면에는 "취소됨"으로 보여 준다(결정 2026-09-27, 예전의 "숨김"을 뒤집음).
      // 세미나가 취소 상태이거나, 그 세미나가 삭제되며 신청에 closedAs를 남긴 경우.
      const cancelledRequestIds = new Set(
        allSeminars
          .filter(
            (s) => s.publicationStatus === "cancelled" && s.sourceRequestId,
          )
          .map((s) => s.sourceRequestId),
      );
      const requests = allRequests
        .filter(
          (r) =>
            r.presenterIds.some((id) => myIds.has(id)) ||
            myIds.has(r.requesterId),
        )
        .map((r) => ({
          ...seminarRequestView(r),
          status:
            r.closedAs || cancelledRequestIds.has(r.id)
              ? ("cancelled" as const)
              : r.status,
        }));

      const currentActivities = currentRaw.map((a) => {
        const event = eventByActivityId.get(a.id);
        return {
          id: a.id,
          name: a.title,
          date: a.date.start,
          type: a.type,
          url: "",
          semester: semester.key,
          eventId: event?.id ?? null,
          ...participationState(
            a,
            event,
            myIds,
            member.memberId,
            now,
            hasCapability(member.capabilities, CAPABILITIES.PARTICIPATE),
          ),
        };
      });

      const semesters = Array.from(
        new Set(attendedRaw.map((a) => termOfDateString(a.date.start))),
      );
      if (!semesters.includes(semester.key)) semesters.push(semester.key);
      semesters.sort().reverse();

      const pastAttended = attendedRaw
        .filter((a) => termOfDateString(a.date.start) !== semester.key)
        .map((a) => ({
          id: a.id,
          name: a.title,
          date: a.date.start,
          type: a.type,
          attended: true,
          url: "",
          semester: termOfDateString(a.date.start),
          eventId: null,
          isApplied: false,
          canApply: false,
          pendingAttendance: false,
        }));

      return {
        activities: [...currentActivities, ...pastAttended],
        seminarRequests: requests,
        myStudies: allStudies
          .filter(
            (s) =>
              s.organizerIds.includes(member.memberId) ||
              s.participantIds.includes(member.memberId) ||
              s.pendingParticipantIds.includes(member.memberId),
          )
          .map((s) => ({
            id: s.id,
            title: s.title,
            semester: s.semester,
            status: s.status,
            role: s.organizerIds.some((id) => myIds.has(id))
              ? "organizer"
              : s.participantIds.some((id) => myIds.has(id))
                ? "participant"
                : "pending",
          })),
        // STU-07: transfer proposals addressed to me — the acceptance entry point
        pendingTransfers: allStudies
          .filter((s) => s.pendingTransfer?.toMemberId === member.memberId)
          .map((s) => ({
            studyId: s.id,
            title: s.title,
            // STU invariant: exactly one organizer — transfers always come from them.
            fromMemberName: memberNameById.get(s.organizerIds[0]) ?? "주최자",
            requestedAt: s.pendingTransfer?.requestedAt ?? "",
          })),
        myAttendanceStats: {
          total: currentActivities.length,
          attended: currentActivities.filter((a) => a.attended).length,
        },
        profile: {
          name: member.name,
          department: memberRow?.department ?? "",
          email: session?.user?.email ?? "",
          phone: formatPhoneForDisplay(privateInfo?.phone || ""),
          background: privateInfo?.background || "",
        },
        semesters,
        generatedAt: new Date().toISOString(),
      };
    } catch (e) {
      console.error("[Dashboard Load] Promise Error:", e);
      return { error: "데이터를 처리하는 중 오류가 발생했습니다." };
    }
  };

  return {
    session,
    isAdmin: member?.isAdmin ?? false,
    semester: semester.name,
    currentSemesterKey: semester.key,
    isMember: !!member,
    application: null,
    // Awaited, not streamed (W-21): an unsettled promise here makes the whole
    // response streamed, and Kit's streaming branch drops the status — which
    // silently turned every action failure on this page into a 200.
    streamed: { dashboard: await dashboardPromise() },
  };
};

export const actions = {
  /** EVT-02: apply to a not-yet-started seminar from the activity table. */
  applyActivity: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    return handleUserAction(locals, async () => {
      const member = locals.member;
      if (!member) throw new AppError("FORBIDDEN");
      requireCapability(locals, CAPABILITIES.PARTICIPATE);
      // The id is checked before the ledger lookup — a bad one costs no read.
      const parsed = dashboardEventIdSchema.safeParse(
        formText(data, "eventId"),
      );
      if (!parsed.success) {
        return fail(400, {
          error: "VALIDATION_FAILED",
          issues: { eventId: parsed.error.issues[0].message },
        });
      }
      const eventId = parsed.data;
      await assertLedgerTarget(eventId);
      await applyToEvent(eventId, member.memberId);
      return {
        operation: "activityApplied" as const,
        activity: await ledgerRowFor(eventId, member.memberId),
      };
    });
  },

  cancelActivity: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    return handleUserAction(locals, async () => {
      const member = locals.member;
      if (!member) throw new AppError("FORBIDDEN");
      requireCapability(locals, CAPABILITIES.PARTICIPATE);
      // The id is checked before the ledger lookup — a bad one costs no read.
      const parsed = dashboardEventIdSchema.safeParse(
        formText(data, "eventId"),
      );
      if (!parsed.success) {
        return fail(400, {
          error: "VALIDATION_FAILED",
          issues: { eventId: parsed.error.issues[0].message },
        });
      }
      const eventId = parsed.data;
      await assertLedgerTarget(eventId);
      await cancelEventApplication(eventId, member.memberId);
      return {
        operation: "activityCancelled" as const,
        activity: await ledgerRowFor(eventId, member.memberId),
      };
    });
  },

  /** STU-07: the transfer target accepts/declines from the dashboard. */
  acceptTransfer: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const studyId = (await request.formData()).get("studyId") as string;
    return handleUserAction(locals, async () => {
      const member = locals.member;
      if (!member) throw new AppError("FORBIDDEN");
      // `/` is public-zone: the guard's POST capability gate never runs here.
      requireCapability(locals, CAPABILITIES.PARTICIPATE);
      await acceptTransfer(studyId, member.memberId);
      return {};
    });
  },

  declineTransfer: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const studyId = (await request.formData()).get("studyId") as string;
    return handleUserAction(locals, async () => {
      const member = locals.member;
      if (!member) throw new AppError("FORBIDDEN");
      requireCapability(locals, CAPABILITIES.PARTICIPATE);
      await declineTransfer(studyId, member.memberId);
      return {};
    });
  },

  updateProfile: async ({
    request,
    locals,
    url,
    cookies,
  }: {
    request: Request;
    locals: App.Locals;
    url: URL;
    cookies: import("@sveltejs/kit").Cookies;
  }) => {
    const devPreviewRole = resolveDevPreviewRole(url, cookies);
    if (dev && devPreviewRole) return { success: true, preview: true };

    const data = await request.formData();
    const parsed = dashboardProfileInputSchema.safeParse({
      phone: normalizePhoneNumber((data.get("phone") as string | null) ?? ""),
      background: (data.get("background") as string | null) ?? "",
    });

    return handleUserAction(locals, async () => {
      const member = locals.member;
      if (!member) throw new AppError("FORBIDDEN");
      requireCapability(locals, CAPABILITIES.MANAGE_SELF);
      if (!parsed.success) {
        return fail(400, {
          error: "VALIDATION_FAILED",
          issues: dashboardProfileIssues(parsed.error),
        });
      }
      const profile = parsed.data;
      // MEM-04: own row only — resolved from the session, never from the form.
      await mutate("private-info", (rows) => {
        const idx = rows.findIndex((p) => p.memberId === member.memberId);
        if (idx === -1) throw new AppError("NOT_FOUND");
        rows[idx] = { ...rows[idx], ...profile };
        return rows;
      });
      return { operation: "profileUpdated" as const, profile };
    });
  },
};
