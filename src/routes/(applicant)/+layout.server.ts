import { getApplicationForEmail } from "$lib/server/services/membership";
import type { LayoutServerLoad } from "./$types";

/** Applicant zone: session + application state for /signup and /wait. */
export const load: LayoutServerLoad = async (event) => {
  const session = await event.locals.auth();
  const email = session?.user?.email;
  const application = email ? await getApplicationForEmail(email) : null;
  return {
    session,
    isMember: !!event.locals.member,
    isAdmin: event.locals.member?.isAdmin ?? false,
    application: application
      ? { ...application, accepted: false, submittedAt: application.createdAt }
      : null,
  };
};
