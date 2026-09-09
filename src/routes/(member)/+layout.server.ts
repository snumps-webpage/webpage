import type { LayoutServerLoad } from "./$types";

/**
 * Member zone: the guard already guaranteed an active member.
 * PRES-03's presenter flag lives in the ROOT layout — it gates a nav link the
 * root renders everywhere, so computing it here would only light the link
 * inside this zone.
 */
export const load: LayoutServerLoad = async (event) => {
  return {
    session: await event.locals.auth(),
    isMember: true,
    isAdmin: event.locals.member?.isAdmin ?? false,
  };
};
