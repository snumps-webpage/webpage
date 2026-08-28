import type { LayoutServerLoad } from "./$types";

/** Admin zone: the guard already 404s everyone below admin. */
export const load: LayoutServerLoad = async (event) => {
  return {
    session: await event.locals.auth(),
    isMember: true,
    isAdmin: true,
  };
};
