import { json } from "@sveltejs/kit";
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
    // Dead-man's switch (SUPABASE-MIGRATION-SPEC §5-3): ping ONLY on success.
    await pingHeartbeat();
    return json({ success: true, ...results });
  } catch (e) {
    console.error("[Cron] Sync failed:", e);
    return json({ error: "Sync failed" }, { status: 500 });
  }
};
