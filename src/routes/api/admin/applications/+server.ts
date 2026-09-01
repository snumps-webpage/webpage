import { json } from "@sveltejs/kit";
import { getApplications } from "$lib/server/admin";
import { ensureAdmin } from "$lib/server/auth-guards";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  await ensureAdmin(locals);

  const apps = await getApplications();
  const sortedApps = apps.sort(
    (a, b) =>
      new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
  );

  return json(sortedApps);
};
