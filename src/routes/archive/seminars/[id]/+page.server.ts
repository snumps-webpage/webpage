import { dev } from "$app/environment";
import { error } from "@sveltejs/kit";
import { getDevPublicSeminar } from "$lib/server/dev-public-content-fixtures";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
  if (!dev) return { seminar: null, dataAvailable: false };
  const seminar = getDevPublicSeminar(params.id);
  if (!seminar) throw error(404, "세미나 기록을 찾을 수 없습니다.");
  return { seminar, dataAvailable: true };
};
