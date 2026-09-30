import { getPublicExecutiveHistory } from "$lib/server/public/archive";
import type { PageServerLoad } from "./$types";

/**
 * PUB-05: executive history from members.roles — never a static document (D4),
 * each holder with the public profile they chose (services/executive-profiles).
 * Degrades to the page's own empty state on a data-layer failure (W-5).
 */
export const load: PageServerLoad = async () => {
  try {
    return { terms: await getPublicExecutiveHistory(), dataAvailable: true };
  } catch (e) {
    console.error("[executives] history unavailable:", e);
    return { terms: [], dataAvailable: false };
  }
};
