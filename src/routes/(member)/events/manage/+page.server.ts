import { handleUserAction } from "$lib/server/auth-guards";
import { getQueue, getTable } from "$lib/server/data/tables";
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
  const [seminars, events, activities] = await Promise.all([
    getManagedSeminars(locals.member!.memberId),
    getTable("events"),
    getTable("activities"),
  ]);
  const eventById = new Map(events.map((e) => [e.id, e]));
  const activityById = new Map(activities.map((a) => [a.id, a]));

  const managedSeminars = await Promise.all(
    seminars.map(async (seminar) => {
      const event = eventById.get(seminar.id);
      const activity = event ? activityById.get(event.activityId) : undefined;
      const pool = new Set(event?.applicantIds ?? []);
      // Queue rows carry the link check-in instant (EVT-01) for each applicant.
      const checkedInAt = new Map(
        (await getQueue(seminar.id)).map((r) => [r.memberId, r.startTime]),
      );
      return {
        ...seminar,
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
};
