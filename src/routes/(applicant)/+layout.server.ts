import { getApplicationForEmail } from "$lib/server/services/membership";
import { applicationView } from "$lib/server/data/views";
import type { LayoutServerLoad } from "./$types";

/** Applicant zone: session + application state for /signup and /wait. */
export const load: LayoutServerLoad = async (event) => {
  const session = await event.locals.auth();
  const email = session?.user?.email;
  const application = email ? await getApplicationForEmail(email) : null;
  return {
    session,
    // S9: an unregistered member re-applies here, so "has a member row" is
    // not "done applying" — only this term's registration is.
    isRegistered: event.locals.member?.registered === true,
    isAdmin: event.locals.member?.isAdmin ?? false,
    application: application ? applicationView(application) : null,
  };
};
