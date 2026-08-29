import { json } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { keepAliveSelect } from "$lib/server/services/maintenance";
import type { RequestHandler } from "./$types";

// 잡2 (SUPABASE-MIGRATION-SPEC §5-1, S5): Bearer-authed health check that
// performs one real SELECT — keep-alive credit AND a liveness probe.
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
    await keepAliveSelect();
    return json({ ok: true });
  } catch (e) {
    console.error("[Health] keep-alive SELECT failed:", e);
    return json({ ok: false }, { status: 500 });
  }
};
