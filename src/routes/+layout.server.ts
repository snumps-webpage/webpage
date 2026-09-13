import { building } from "$app/environment";
import { getPublicExecutives } from "$lib/server/public/archive";
import { hasPresenterEvents } from "$lib/server/services/events";
import type { LayoutServerLoad } from "./$types";

/**
 * Root layout. BE-23 wanted this session-independent for public prerender;
 * the merged UI shell (nav) needs member state, so we read what the zone
 * guard already resolved on locals — public fast-path routes leave it
 * undefined and the nav renders the guest view without extra data-layer work.
 * PRES-03: hasPresenterEvents gates the Attendance link in the nav. The nav is
 * rendered by the ROOT layout on every route, so the flag has to be computed
 * here — a (member)-zone computation would make the link appear and disappear
 * as the user navigates into and out of that zone.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
  const member = locals.member ?? null;
  return {
    session: member ? await locals.auth() : null,
    isAdmin: member?.isAdmin === true,
    isMember: !!member && member.status !== "withdrawn",
    memberStatus: member?.status ?? null,
    // A read failure must not hide the whole nav; the link degrades to hidden.
    hasPresenterEvents: member
      ? await hasPresenterEvents(member.memberId).catch((e) => {
          console.error("[nav] presenter lookup failed:", e);
          return false;
        })
      : false,
    application: null,
    // Never let this fetch break a render or a prerender pass — the footer
    // degrades to no-contact instead. Prerender builds skip it entirely.
    //
    // AWAITED ON PURPOSE (W-1). An unawaited promise here makes EVERY page a
    // streamed response, and Kit's streaming branch constructs its Response
    // without a status (kit#12533, kit#12987) — so unmatched routes and failed
    // loads both answered 200 while rendering the 404/500 page. This load runs
    // for error pages too, so the leak was total. Cost: the footer lookup now
    // precedes the first byte; it reads four cached tables, two of which are
    // the frozen ones on the 120s local TTL (W-19).
    executives: building ? null : await getPublicExecutives().catch(() => null),
  };
};
