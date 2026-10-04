import { getPublicExecutives } from "$lib/server/public/archive";
import { currentTerm } from "$lib/server/core/semester";
import type { PageServerLoad } from "./$types";

/**
 * PUB-05: executive history from members.roles — never a static document (D4).
 * Degrades to the page's own empty state on a data-layer failure (W-5).
 */
export const load: PageServerLoad = async () => {
  const term = currentTerm();
  try {
    return {
      terms: await getPublicExecutives(),
      dataAvailable: true,
      currentTerm: term,
    };
  } catch (e) {
    console.error("[executives] history unavailable:", e);
    return { terms: [], dataAvailable: false, currentTerm: term };
  }
};
