import { handleUserAction } from "$lib/server/auth-guards";
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
  return {
    managedSeminars: await getManagedSeminars(locals.member!.memberId),
  };
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
    return handleUserAction(locals, async () => {
      await savePresenterAttendance(
        data.get("eventId") as string,
        locals.member!.memberId,
        (data.getAll("attendeeIds") as string[]).filter(Boolean),
      );
      return {};
    });
  },
};
