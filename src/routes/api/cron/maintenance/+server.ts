import { json } from "@sveltejs/kit";
import { cronFailures } from "$lib/server/services/cron-status";
import { env } from "$env/dynamic/private";
import {
  pingHeartbeat,
  runMaintenance,
} from "$lib/server/services/maintenance";
import type { RequestHandler } from "./$types";

// 잡3 (SUPABASE-MIGRATION-SPEC §5-1): daily staging cleanup + keep-alive
// SELECT, with the Sunday backup branch (§7). Same auth as sync-events.
export const GET: RequestHandler = async ({ request }) => {
  // Fail-closed (BE-04): without a configured secret this endpoint must not run.
  if (!env.CRON_SECRET) {
    return json({ error: "CRON_SECRET is not configured" }, { status: 501 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

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
