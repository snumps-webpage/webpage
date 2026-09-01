import { ensureAdmin } from "$lib/server/auth-guards";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async (event) => {
  await ensureAdmin(event.locals);
  return {};
};
