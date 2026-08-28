import { dev } from "$app/environment";
import { getDevPublicExecutiveHistory } from "$lib/server/dev-member-fixtures";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => ({
  history: dev ? getDevPublicExecutiveHistory() : [],
  dataAvailable: dev,
});
