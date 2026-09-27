import { json } from "@sveltejs/kit";
import { requireCronAuth } from "$lib/server/core/http";
import { runCron } from "$lib/server/services/events";
import { pingHeartbeat } from "$lib/server/services/maintenance";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ request }) => {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    const { counts, failures } = await runCron();
    // runCron isolates each step and reports failure in `failures` rather than
    // throwing, so the catch below never sees a step failure (audit LB19-1).
    if (failures.length > 0) {
      console.error("[Cron] Sync reported failures:", failures, counts);
      // Non-2xx is the load-bearing half: cron-job.org alerts on status, and it
      // is the only alarm currently configured (OPERATOR-TODO §4).
      return json({ ...counts, success: false, failures }, { status: 500 });
    }
    // Dead-man's switch (SUPABASE-MIGRATION-SPEC §5-3): ping ONLY on success.
    await pingHeartbeat();
    return json({ ...counts, success: true });
  } catch (e) {
    console.error("[Cron] Sync failed:", e);
    return json({ error: "Sync failed" }, { status: 500 });
  }
};
