import { dev } from "$app/environment";
import type { PublicArchiveSnapshot } from "$lib/domain/public-content";
import { getDevPublicArchive } from "$lib/server/dev-public-content-fixtures";
import type { LayoutServerLoad } from "./$types";

const emptyArchive: PublicArchiveSnapshot = {
  seminars: [],
  studies: [],
  activities: [],
  gallery: [],
  projects: [],
};

export const load: LayoutServerLoad = async () => ({
  archive: dev ? getDevPublicArchive() : emptyArchive,
  dataAvailable: dev,
  generatedAt: new Date().toISOString(),
});
