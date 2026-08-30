import { getPublicMembers } from "$lib/server/public/archive";
import type { PageServerLoad } from "./$types";

export const config = { isr: { expiration: 60 } };

/** PUB-15: the D2 public roster — its own page by explicit decision. */
export const load: PageServerLoad = async () => {
  return {
    members: await getPublicMembers(),
    dataAvailable: true,
    generatedAt: new Date().toISOString(),
  };
};
