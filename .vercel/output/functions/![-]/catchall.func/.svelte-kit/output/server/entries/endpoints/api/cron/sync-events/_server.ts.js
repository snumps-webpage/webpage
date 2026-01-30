import { json } from "@sveltejs/kit";
import { b as private_env } from "../../../../../chunks/shared-server.js";
import { s as syncEventStatuses } from "../../../../../chunks/events.js";
const GET = async ({ request }) => {
  const authHeader = request.headers.get("authorization");
  if (private_env.CRON_SECRET && authHeader !== `Bearer ${private_env.CRON_SECRET}`) {
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
export {
  GET
};
