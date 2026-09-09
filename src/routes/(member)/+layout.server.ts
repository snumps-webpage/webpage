import type { LayoutServerLoad } from "./$types";

/**
 * Member zone: the guard already guaranteed an active member.
 * PRES-03's presenter flag lives in the ROOT layout — it gates a nav link the
 * root renders everywhere, so computing it here would only light the link
 * inside this zone.
 */
export const load: LayoutServerLoad = async (event) => {
  // `session` deliberately absent: the root layout already resolves it, and in
  // this zone the guard guarantees a member, so the root's
  // `member ? locals.auth() : null` is never the null branch here. Re-calling
  // locals.auth() is a second JWT decode and cookie write per request for a
  // value the parent already merged in.
  return {
    isMember: true,
    isAdmin: event.locals.member?.isAdmin ?? false,
  };
};
