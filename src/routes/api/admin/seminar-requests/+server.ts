import { json } from "@sveltejs/kit";
import { requireAdminAction } from "$lib/server/auth-guards";
import { getTable } from "$lib/server/data/tables";
import type { MemberSummaryMap } from "$lib/server/data/admin-queue-views";
import type { RequestHandler } from "./$types";

/** Admin polling: pending seminar proposals (§8-3). */
export const GET: RequestHandler = async ({ locals }) => {
  const { allowed } = await requireAdminAction(locals);
  if (!allowed) return json({ error: "FORBIDDEN" }, { status: 403 });

  const requests = await getTable("seminar-requests");
  const { seminarRequestView } = await import("$lib/server/data/views");
  const { adminSeminarRequestItem, directorySummaryIndex } =
    await import("$lib/server/data/admin-queue-views");
  const { nowKstIso } = await import("$lib/server/core/time");
  const pending = requests.filter((r) => r.status === "pending");
  // Polled every 30s by two dashboards; with an empty queue the index has
  // nothing to resolve, and building it reads the legacy archive as well.
  const summaries: MemberSummaryMap =
    pending.length > 0 ? await directorySummaryIndex() : new Map();
  return json({
    seminarRequests: pending.map(seminarRequestView),
    // Shared queue envelope for the admin poller (client/api.ts).
    success: true,
    items: pending.map((r) => adminSeminarRequestItem(r, summaries)),
    generatedAt: nowKstIso(),
  });
};
