import { dev } from "$app/environment";
import { getDevPublicMembers } from "$lib/server/dev-member-fixtures";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => ({
  members: dev ? getDevPublicMembers() : [],
  dataAvailable: dev,
  generatedAt: new Date().toISOString(),
});
