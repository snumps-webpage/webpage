import { json } from "@sveltejs/kit";
import { requireCronAuth } from "$lib/server/core/http";
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
    const { counts, failures } = await runMaintenance();
    // runMaintenance isolates each step and reports failure in `failures` rather than
    // throwing, so the catch below never sees a step failure (audit LB19-1).
    if (failures.length > 0) {
      console.error("[Cron] Maintenance reported failures:", failures, counts);
      return json({ ...counts, success: false, failures }, { status: 500 });
    }
    // Dead-man's switch (SUPABASE-MIGRATION-SPEC §5-3): ping ONLY on success.
    await pingHeartbeat();
    return json({ ...counts, success: true });
  } catch (e) {
    console.error("[Cron] Maintenance failed:", e);
    return json({ error: "Maintenance failed" }, { status: 500 });
  }
};
