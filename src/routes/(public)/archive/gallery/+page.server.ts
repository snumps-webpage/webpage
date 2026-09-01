import { getPublicGallery } from "$lib/server/public/archive";
import type { PageServerLoad } from "./$types";


export const load: PageServerLoad = async () => {
  return { photos: await getPublicGallery() };
};
