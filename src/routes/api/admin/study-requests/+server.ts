import { json } from "@sveltejs/kit";
import { requireAdminRest } from "$lib/server/core/http";
import { getTable } from "$lib/server/data/tables";
import type { MemberSummaryMap } from "$lib/server/data/admin-queue-views";
import type { RequestHandler } from "./$types";

/** Admin polling: pending study proposals (§8-3 / BE-56). */
export const GET: RequestHandler = async ({ locals }) => {
  const denied = await requireAdminRest(locals);
  if (denied) return denied;

  const requests = await getTable("study-requests");
  const { adminStudyRequestItem, byCreatedAtAsc, directorySummaryIndex } =
    await import("$lib/server/data/admin-queue-views");
  const { nowKstIso } = await import("$lib/server/core/time");
  const pending = requests
    .filter((r) => r.status === "pending")
    .sort(byCreatedAtAsc);
  // Polled every 30s by two dashboards; with an empty queue the index has
  // nothing to resolve, and building it reads the legacy archive as well.
  const summaries: MemberSummaryMap =
    pending.length > 0 ? await directorySummaryIndex() : new Map();
  return json({
    // The queue envelope — FRONTEND-DECISIONS §3-5 declares these three keys
    // and no others; the client parses with that schema and strips the rest.
    success: true,
    items: pending.map((r) => adminStudyRequestItem(r, summaries)),
    generatedAt: nowKstIso(),
  });
};
