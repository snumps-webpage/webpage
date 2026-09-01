import { json } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { syncEventStatuses } from "$lib/server/events";
import type { RequestHandler } from "./$types";

/**
 * Vercel Cron target. `syncEventStatuses` mutates event state (and can expire
 * events), so this endpoint fails CLOSED: without a configured `CRON_SECRET`
 * there is no way to tell Vercel's scheduler apart from an anonymous caller,
 * and this path is in the public allow-list of `hooks.server.ts`.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` automatically once the
 * variable is set on the project.
 */
export const GET: RequestHandler = async ({ request }) => {
  const secret = env.CRON_SECRET;

  if (!secret) {
    console.error(
      "[Cron] CRON_SECRET is not set; refusing to run sync-events. Set it in the project environment.",
    );
    return json({ error: "Cron is not configured" }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
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
