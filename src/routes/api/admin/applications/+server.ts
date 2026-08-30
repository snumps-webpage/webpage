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
  const { adminApplicationItem } = await import("$lib/server/data/admin-queue-views");
  const { nowKstIso } = await import("$lib/server/core/time");
  const sorted = [...apps].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  return json({
    applications: sorted.map(applicationView),
    // Shared queue envelope for the admin poller (client/api.ts).
    success: true,
    items: sorted.map(adminApplicationItem),
    generatedAt: nowKstIso(),
  });
};
