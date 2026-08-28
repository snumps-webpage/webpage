import { error } from "@sveltejs/kit";
import { getPublicSeminar } from "$lib/server/public/archive";
import type { PageServerLoad } from "./$types";

export const config = { isr: { expiration: 60 } };

export const load: PageServerLoad = async ({ params }) => {
  const seminar = await getPublicSeminar(params.id);
  if (!seminar) throw error(404, "Not Found");
  return { seminar };
};
