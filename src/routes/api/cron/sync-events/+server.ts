import { json } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { syncEventStatuses } from "$lib/server/events";
import type { RequestHandler } from "./$types";

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
    console.log("[Cron] Syncing event statuses...");
    await syncEventStatuses();
    return json({ success: true });
  } catch (e) {
    console.error("[Cron] Sync failed:", e);
    return json({ error: "Sync failed" }, { status: 500 });
  }
};
