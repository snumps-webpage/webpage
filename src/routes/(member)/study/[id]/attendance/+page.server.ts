import { ensureOrganizer, handleUserAction } from "$lib/server/auth-guards";
import { httpGuard } from "$lib/server/core/http";
import {
  getAttendanceSheet,
  saveStudyAttendance,
} from "$lib/server/services/studies";
import type { PageServerLoad } from "./$types";
import { CAPABILITIES, hasCapability } from "$lib/server/core/capabilities";

/** STU-05: session×participant attendance sheet for the organizer. */
export const load: PageServerLoad = async ({ locals, params }) => {
  const study = await httpGuard(() =>
    ensureOrganizer(params.id, locals.member!.memberId),
  );
  const sheet = await getAttendanceSheet(study);
  return {
    studyId: study.id,
    studyTitle: study.title,
    ...sheet,
    // Correction rights do not depend on study/session being ongoing.
    canSave: hasCapability(
      locals.member?.capabilities,
      CAPABILITIES.PARTICIPATE,
    ),
  };
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
      const eventId = data.get("eventId") as string;
      await saveStudyAttendance(
        study,
        eventId,
        (data.getAll("attendeeIds") as string[]).filter(Boolean),
      );
      // Identifies this response only; does not add persisted attendance state.
      return { eventId };
    });
  },
};
