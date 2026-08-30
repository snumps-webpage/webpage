import { json } from "@sveltejs/kit";
import { requireAdminAction } from "$lib/server/auth-guards";
import { getTable } from "$lib/server/data/tables";
import type { RequestHandler } from "./$types";

/** Admin polling: pending study proposals (§8-3 / BE-56). */
export const GET: RequestHandler = async ({ locals }) => {
  const { allowed } = await requireAdminAction(locals);
  if (!allowed) return json({ error: "FORBIDDEN" }, { status: 403 });

  const requests = await getTable("study-requests");
  const members = await getTable("members");
  const { studyRequestView } = await import("$lib/server/data/views");
  const { adminStudyRequestItem, memberSummaryById } = await import(
    "$lib/server/data/admin-queue-views"
  );
  const { nowKstIso } = await import("$lib/server/core/time");
  const pending = requests.filter((r) => r.status === "pending");
  const summaries = memberSummaryById(members);
  return json({
    studyRequests: pending.map(studyRequestView),
    // Shared queue envelope for the admin poller (client/api.ts).
    success: true,
    items: pending.map((r) => adminStudyRequestItem(r, summaries)),
    generatedAt: nowKstIso(),
  });
};
