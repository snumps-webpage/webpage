import { ensureOrganizer, handleUserAction } from "$lib/server/auth-guards";
import {
  getAttendanceSheet,
  saveStudyAttendance,
} from "$lib/server/services/studies";
import type { PageServerLoad } from "./$types";

/** STU-05: session×participant attendance sheet for the organizer. */
export const load: PageServerLoad = async ({ locals, params }) => {
  const study = await ensureOrganizer(params.id, locals.member!.memberId);
  const sheet = await getAttendanceSheet(study);
  return { studyTitle: study.title, ...sheet };
};

export const actions = {
  saveAttendance: async ({
    request,
    locals,
    params,
  }: {
    request: Request;
    locals: App.Locals;
    params: { id: string };
  }) => {
    const data = await request.formData();
    return handleUserAction(locals, async () => {
      const study = await ensureOrganizer(params.id, locals.member!.memberId);
      await saveStudyAttendance(
        study,
        data.get("eventId") as string,
        (data.getAll("attendeeIds") as string[]).filter(Boolean),
      );
      return {};
    });
  },
};
