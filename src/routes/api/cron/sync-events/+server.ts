import { json } from "@sveltejs/kit";
import { cronFailures } from "$lib/server/services/cron-status";
import { env } from "$env/dynamic/private";
import { registerCronStep, runCron } from "$lib/server/services/events";
import { pingHeartbeat } from "$lib/server/services/maintenance";
import { studySessionCronStep } from "$lib/server/services/studies";
import type { RequestHandler } from "./$types";

// BE-49: session auto-generation joins the cron here, not inside BE-35 code.
registerCronStep(studySessionCronStep);

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
    const results = await runCron();
    // runCron isolates each step and reports failure as a result key rather than
    // throwing, so the catch below never sees a step failure — the census does.
    const failures = cronFailures(results);
    if (failures.length > 0) {
      console.error("[Cron] Sync reported failures:", failures, results);
      // Non-2xx is the load-bearing half: cron-job.org alerts on status, and it
      // is the only alarm currently configured (OPERATOR-TODO §4).
      return json({ success: false, failures, ...results }, { status: 500 });
    }
    // Dead-man's switch (SUPABASE-MIGRATION-SPEC §5-3): ping ONLY on success.
    await pingHeartbeat();
    return json({ success: true, ...results });
  } catch (e) {
    console.error("[Cron] Sync failed:", e);
    return json({ error: "Sync failed" }, { status: 500 });
  }
};
