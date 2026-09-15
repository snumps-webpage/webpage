import { handleUserAction } from "$lib/server/auth-guards";
import { AppError } from "$lib/server/core/errors";
import { getQueue, getTable } from "$lib/server/data/tables";
import {
  cancelSeminar,
  seminarHasStarted,
} from "$lib/server/services/seminars";
import {
  getManagedSeminars,
  savePresenterAttendance,
} from "$lib/server/services/events";
import type { PageServerLoad } from "./$types";

/**
 * PRES-01~04: presenter-side attendance management. The page is
 * member-visible by DESIGN — data filtering is the authorization boundary
 * (non-presenters get an empty list); the nav link hides it, nothing more.
 */
export const load: PageServerLoad = async ({ locals }) => {
  const [seminars, events, activities, seminarRows] = await Promise.all([
    getManagedSeminars(locals.member!.memberId),
    getTable("events"),
    getTable("activities"),
    getTable("seminars"),
  ]);
  const eventById = new Map(events.map((e) => [e.id, e]));
  const activityById = new Map(activities.map((a) => [a.id, a]));
  // 이 화면이 쥔 것은 **이벤트 id**이고 취소는 **세미나 id**로 한다. 다리는
  // 공개 시 심은 앵커(`seminar:<id>`)이고, 앵커가 없는 이주분은 activityId로
  // 잇는다 — 둘 다 없으면 취소할 대상을 특정할 수 없으므로 버튼을 내린다.
  // 색인을 한 번 만든다: 예전에는 이벤트 표 전체를 돌며 세미나 표를 매번
  // 훑어서, 발표자 한 사람의 화면을 그리는 데 E×S번의 비교가 들었다.
  const seminarByAnchor = new Map<string, (typeof seminarRows)[number]>(
    seminarRows.map((s) => [`seminar:${s.id}`, s]),
  );
  const seminarByActivityId = new Map(
    seminarRows
      .filter((s) => s.activityId !== null)
      .map((s) => [s.activityId!, s] as const),
  );
  const seminarOfEvent = (event: {
    sourceRequestId: string | null;
    activityId: string;
  }) =>
    (event.sourceRequestId
      ? seminarByAnchor.get(event.sourceRequestId)
      : undefined) ?? seminarByActivityId.get(event.activityId);

  const managedSeminars = await Promise.all(
    seminars.map(async (seminar) => {
      const event = eventById.get(seminar.id);
      const activity = event ? activityById.get(event.activityId) : undefined;
      const pool = new Set(event?.applicantIds ?? []);
      // Queue rows carry the link check-in instant (EVT-01) for each applicant.
      const checkedInAt = new Map(
        (await getQueue(seminar.id)).map((r) => [r.memberId, r.startTime]),
      );
      const row = event ? seminarOfEvent(event) : undefined;
      return {
        ...seminar,
        seminarId: row?.id ?? null,
        // 개설자는 **열리기 전까지만** 취소할 수 있다 (결정 6). 서버가 같은
        // 판정을 독립적으로 하므로 이것은 화면을 맞추는 값이지 관문이 아니다.
        canCancel:
          row !== undefined &&
          row.publicationStatus !== "cancelled" &&
          row.presenterIds.includes(locals.member!.memberId) &&
          !seminarHasStarted(row),
        endsAt: event?.date.end ?? null,
        nonApplicantAttendanceCount: (activity?.attendeeIds ?? []).filter(
          (id) => !pool.has(id),
        ).length,
        applicants: seminar.applicants.map((applicant) => ({
          ...applicant,
          checkedInAt: checkedInAt.get(applicant.id) ?? null,
        })),
      };
    }),
  );

  return { managedSeminars };
};

export const actions = {
  saveAttendance: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    const eventId = data.get("eventId") as string;
    return handleUserAction(locals, async () => {
      await savePresenterAttendance(
        eventId,
        locals.member!.memberId,
        (data.getAll("attendeeIds") as string[]).filter(Boolean),
      );
      // Echo the merged result so the UI can reconcile without a reload.
      const event = (await getTable("events")).find((e) => e.id === eventId);
      const activity = event
        ? (await getTable("activities")).find((a) => a.id === event.activityId)
        : undefined;
      const pool = new Set(event?.applicantIds ?? []);
      const attendeeIds = activity?.attendeeIds ?? [];
      return {
        operation: "presenterAttendanceSaved" as const,
        eventId,
        applicantAttendeeIds: attendeeIds.filter((id) => pool.has(id)),
        totalAttendanceCount: attendeeIds.length,
      };
    });
  },

  /**
   * 개설자 본인의 취소. 서비스가 두 가지를 강제한다 — 자기 세미나만, 그리고
   * **열리기 전까지만**. 이미 치른 세미나를 지우는 것은 출석 기록을 조용히
   * 없애는 일이라 관리자에게만 열려 있다.
   *
   * 주체는 폼이 아니라 세션에서 온다. 관리자가 이 경로로 들어오면 관리자
   * 규칙(확인을 곁들인 사후 취소)이 적용된다 — 권한 상승이 아니라 같은
   * 사람이 가진 같은 권한이지만, 이 라우트가 회원 구역이라는 점은 알아 둘
   * 만하다.
   */
  cancelSeminar: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    const seminarId = data.get("seminarId") as string;
    return handleUserAction(locals, async () => {
      if (!seminarId) throw new AppError("VALIDATION_FAILED");
      const { mailFailed } = await cancelSeminar(seminarId, {
        memberId: locals.member!.memberId,
        isAdmin: locals.member!.isAdmin === true,
      });
      return { operation: "seminarCancelled" as const, seminarId, mailFailed };
    });
  },
};
