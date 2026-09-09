import type { LayoutServerLoad } from "./$types";

/**
 * Admin zone: the guard already 404s everyone below admin, so `isAdmin: true`
 * is a fact here rather than an assumption.
 *
 * `isMember` is deliberately NOT set. The root layout computes it as
 * `!!member && member.status !== "withdrawn"`, and admin authority is top-level
 * state that survives withdrawal (decision C-18) — so a withdrawn admin is
 * legitimately inside this zone while not being a member. Restating it as a
 * literal here shadowed the root's correct value with a false one.
 */
export const load: LayoutServerLoad = async (event) => {
  return {
    session: await event.locals.auth(),
    isAdmin: true,
  };
};
