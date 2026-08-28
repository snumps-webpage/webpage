import { json } from "@sveltejs/kit";
import { requireAdminAction } from "$lib/server/auth-guards";
import { getTable } from "$lib/server/data/tables";
import type { RequestHandler } from "./$types";

/** Admin polling: pending study proposals (§8-3 / BE-56). */
export const GET: RequestHandler = async ({ locals }) => {
  const { allowed } = await requireAdminAction(locals);
  if (!allowed) return json({ error: "FORBIDDEN" }, { status: 403 });

  const requests = await getTable("study-requests");
  const { studyRequestView } = await import("$lib/server/data/views");
  return json({
    studyRequests: requests.filter((r) => r.status === "pending").map(studyRequestView),
  });
};
