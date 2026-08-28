import { getApplicationByEmail } from "$lib/server/admin";
import type { LayoutServerLoad } from "./$types";

/** Applicant zone: session + application state for /signup and /wait. */
export const load: LayoutServerLoad = async (event) => {
  const session = await event.locals.auth();
  const email = session?.user?.email;
  return {
    session,
    isMember: !!event.locals.member,
    isAdmin: event.locals.member?.isAdmin ?? false,
    application: email ? await getApplicationByEmail(email) : null,
  };
};
