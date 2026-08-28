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
    executives: getLatestExecutives(),
  };
};
