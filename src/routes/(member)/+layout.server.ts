import type { LayoutServerLoad } from "./$types";

/** Member zone: the guard already guaranteed an active member. */
export const load: LayoutServerLoad = async (event) => {
  return {
    session: await event.locals.auth(),
    isMember: true,
    isAdmin: event.locals.member?.isAdmin ?? false,
  };
};
