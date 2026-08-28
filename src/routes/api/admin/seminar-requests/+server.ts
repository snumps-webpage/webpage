import { json } from "@sveltejs/kit";
import { requireAdminAction } from "$lib/server/auth-guards";
import { getTable } from "$lib/server/data/tables";
import type { RequestHandler } from "./$types";

/** Admin polling: pending seminar proposals (§8-3). */
export const GET: RequestHandler = async ({ locals }) => {
  const { allowed } = await requireAdminAction(locals);
  if (!allowed) return json({ error: "Forbidden" }, { status: 403 });

  const requests = await getTable("seminar-requests");
  return json({
    seminarRequests: requests
      .filter((r) => r.status === "pending")
      .map((r) => ({ ...r, speakerIds: r.presenterIds, submittedAt: r.createdAt })),
  });
};
