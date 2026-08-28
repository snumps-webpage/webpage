import { getPublicStudies } from "$lib/server/public/archive";
import type { PageServerLoad } from "./$types";

export const config = { isr: { expiration: 60 } };

export const load: PageServerLoad = async () => {
  return { studies: await getPublicStudies() };
};
