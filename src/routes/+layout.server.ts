import { building } from "$app/environment";
import { getLatestExecutives } from "$lib/server/notion";
import type { LayoutServerLoad } from "./$types";

/**
 * Root layout. BE-23 wanted this session-independent for public prerender;
 * the merged UI shell (nav) needs member state, so we read what the zone
 * guard already resolved on locals — public fast-path routes leave it
 * undefined and the nav renders the guest view without extra data-layer work.
 * TODO(M3-cutover): source executives from members.roles + publicContact.
 * TODO(integration): hasPresenterEvents — wire to the events service (PRES-03).
 */
export const load: LayoutServerLoad = async ({ locals }) => {
  const member = locals.member ?? null;
  return {
    session: member ? await locals.auth() : null,
    isAdmin: member?.isAdmin === true,
    isMember: !!member && member.status !== "withdrawn",
    memberStatus: member?.status ?? null,
    hasPresenterEvents: false,
    application: null,
    // Never let this fetch break a render or a prerender pass — the footer
    // degrades to no-contact instead. Prerender builds skip it entirely.
    executives: building ? null : getLatestExecutives().catch(() => null),
  };
};
