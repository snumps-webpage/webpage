import { getPublicExecutives } from "$lib/server/public/archive";
import type { PageServerLoad } from "./$types";

export const config = { isr: { expiration: 60 } };

/** PUB-05: executive history from members.roles — never a static document (D4). */
export const load: PageServerLoad = async () => {
  return { terms: await getPublicExecutives() };
};
