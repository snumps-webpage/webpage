import { json } from "@sveltejs/kit";
import { requireAdminAction } from "$lib/server/auth-guards";
import { getTable } from "$lib/server/data/tables";
import type { RequestHandler } from "./$types";

/** Admin polling: pending membership applications (§8-3). */
export const GET: RequestHandler = async ({ locals }) => {
  const { allowed } = await requireAdminAction(locals);
  if (!allowed) return json({ error: "FORBIDDEN" }, { status: 403 });

  const apps = await getTable("applications");
  const { applicationView } = await import("$lib/server/data/views");
  return json({
    applications: apps
      .map(applicationView)
      .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()),
  });
};
