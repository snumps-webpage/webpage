import { json } from "@sveltejs/kit";
import { requireCronAuth } from "$lib/server/core/http";
import { cronFailures } from "$lib/server/services/cron-status";
import {
  pingHeartbeat,
  runMaintenance,
} from "$lib/server/services/maintenance";
import type { RequestHandler } from "./$types";

// 잡3 (SUPABASE-MIGRATION-SPEC §5-1): daily staging cleanup + keep-alive
// SELECT, with the Sunday backup branch (§7). Same auth as sync-events.
export const GET: RequestHandler = async ({ request }) => {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    const results = await runMaintenance();
    // runMaintenance isolates each phase and reports failure as a result key
    // rather than throwing, so the catch below never sees a phase failure.
    // A failing keep-alive or weekly backup used to return 200 and ping anyway.
    const failures = cronFailures(results);
    if (failures.length > 0) {
      console.error("[Cron] Maintenance reported failures:", failures, results);
      return json({ success: false, failures, ...results }, { status: 500 });
    }
    // Dead-man's switch (§5-3): ping ONLY on the success path.
    await pingHeartbeat();
    return json({ success: true, ...results });
  } catch (e) {
    console.error("[Cron] Maintenance failed:", e);
    return json({ error: "Maintenance failed" }, { status: 500 });
  }
};
