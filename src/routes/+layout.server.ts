import { building } from "$app/environment";
import { getLatestExecutives } from "$lib/server/notion";
import type { LayoutServerLoad } from "./$types";

/**
 * Root layout: session-INDEPENDENT by design (BE-23) so the public zone can
 * prerender/ISR. Session-dependent data lives in the zone layouts.
 * Executives feed the global footer; streamed so the shell renders immediately.
 * TODO(M3-cutover): source executives from members.roles + publicContact.
 */
export const load: LayoutServerLoad = async () => {
  return {
    // Never let this fetch break a render or a prerender pass — the footer
    // degrades to no-contact instead. Prerender builds skip it entirely.
    executives: building ? null : getLatestExecutives().catch(() => null),
  };
};
