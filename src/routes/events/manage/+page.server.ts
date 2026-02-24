import { fail, redirect } from "@sveltejs/kit";
import { invalidateCache } from "$lib/server/cache";
import { getEvent, getEvents } from "$lib/server/events";
import {
  getActivityAttendeeIds,
  getAllMembers,
  getMemberByEmail,
  replaceActivityAttendees,
} from "$lib/server/notion";
import type { Actions, PageServerLoad } from "./$types";

const SEMINAR_TYPES = new Set(["Seminar", "세미나"]);

function isSeminarType(type: string) {
  return SEMINAR_TYPES.has(type);
}

export const load: PageServerLoad = async ({ locals, url }) => {
  const session = await locals.auth();
  if (!session?.user?.email) {
    throw redirect(302, `/login?redirect=${encodeURIComponent(url.pathname)}`);
  }

  const memberLink = await getMemberByEmail(session.user.email);
  if (!memberLink) {
    return {
      managedEvents: [],
      forbidden: true,
    };
  }

  const [events, members] = await Promise.all([getEvents(), getAllMembers()]);
  const memberMap = new Map(members.map((member) => [member.id, member]));

  const managedEvents = await Promise.all(
    events
      .filter(
        (event) =>
          isSeminarType(event.type) &&
          Array.isArray(event.presenterIds) &&
          event.presenterIds.includes(memberLink.memberId),
      )
      .map(async (event) => {
        const applicantIds = Array.isArray(event.applicantIds)
          ? event.applicantIds
          : [];

        const applicants = applicantIds.map((id) => ({
          id,
          name: memberMap.get(id)?.name ?? "Unknown",
          department: memberMap.get(id)?.department ?? "",
        }));

        let checkedApplicantIds: string[] = [];
        if (event.notionPageId && applicantIds.length > 0) {
          try {
            const attendeeIds = await getActivityAttendeeIds(event.notionPageId);
            checkedApplicantIds = attendeeIds.filter((id) => applicantIds.includes(id));
          } catch (e) {
            console.error(
              `[Event Manage] Failed to load attendee ids for ${event.id}:`,
              e,
            );
          }
        }

        return {
          ...event,
          applicants,
          checkedApplicantIds,
        };
      }),
  );

  managedEvents.sort((a, b) => {
    const aTs = new Date(a.date).getTime();
    const bTs = new Date(b.date).getTime();
    if (Number.isFinite(aTs) && Number.isFinite(bTs)) return aTs - bTs;
    return 0;
  });

  return {
    managedEvents,
    forbidden: false,
  };
};

export const actions: Actions = {
  saveAttendance: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email) {
      return fail(401, { error: "로그인이 필요합니다." });
    }

    const memberLink = await getMemberByEmail(session.user.email);
    if (!memberLink) {
      return fail(403, { error: "회원 정보가 없어 접근할 수 없습니다." });
    }

    const data = await request.formData();
    const eventId = data.get("eventId") as string;
    const selectedApplicantIds = data
      .getAll("selectedApplicantIds")
      .map((value) => String(value))
      .filter(Boolean);

    if (!eventId) {
      return fail(400, { error: "이벤트 정보가 누락되었습니다." });
    }

    const event = await getEvent(eventId);
    if (!event) {
      return fail(404, { error: "이벤트를 찾을 수 없습니다." });
    }
    if (!isSeminarType(event.type)) {
      return fail(400, { error: "세미나 이벤트만 관리할 수 있습니다." });
    }
    if (!event.notionPageId) {
      return fail(400, { error: "연결된 활동 페이지가 없습니다." });
    }

    const presenterIds = Array.isArray(event.presenterIds) ? event.presenterIds : [];
    if (!presenterIds.includes(memberLink.memberId)) {
      return fail(403, { error: "본인이 발표자인 세미나만 관리할 수 있습니다." });
    }

    const applicantIds = Array.isArray(event.applicantIds) ? event.applicantIds : [];
    const applicantIdSet = new Set(applicantIds);
    if (selectedApplicantIds.some((id) => !applicantIdSet.has(id))) {
      return fail(400, { error: "신청자 외 인원은 출석 처리할 수 없습니다." });
    }

    try {
      const currentAttendees = await getActivityAttendeeIds(event.notionPageId);
      const attendeesOutsideApplicants = currentAttendees.filter(
        (id) => !applicantIdSet.has(id),
      );
      const finalAttendees = Array.from(
        new Set([...attendeesOutsideApplicants, ...selectedApplicantIds]),
      );

      await replaceActivityAttendees(event.notionPageId, finalAttendees);

      const affectedMemberIds = new Set([...currentAttendees, ...finalAttendees]);
      for (const memberId of affectedMemberIds) {
        invalidateCache(`user_activities_${memberId}`);
      }

      return { success: true, eventId };
    } catch (e) {
      console.error("[Event Manage] Failed to save attendance:", e);
      return fail(500, { error: "출석 저장 중 오류가 발생했습니다." });
    }
  },
};

