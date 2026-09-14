import { getPublicMembers } from "$lib/server/public/archive";
import type { PageServerLoad } from "./$types";

/**
 * PUB-15: the D2 public roster — its own page by explicit decision.
 *
 * A data-layer failure degrades to the empty state the page already renders
 * (W-5). `dataAvailable` had no producer, so that branch was unreachable and
 * the whole page answered with an error instead.
 */
export const load: PageServerLoad = async () => {
  try {
    return {
      members: await getPublicMembers(),
      dataAvailable: true,
      generatedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.error("[members] roster unavailable:", e);
    return { members: [], dataAvailable: false, generatedAt: new Date().toISOString() };
  }
};
