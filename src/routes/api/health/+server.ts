import { json } from "@sveltejs/kit";
import { requireCronAuth } from "$lib/server/core/http";
import { keepAliveSelect } from "$lib/server/services/maintenance";
import type { RequestHandler } from "./$types";

// 잡2 (SUPABASE-MIGRATION-SPEC §5-1, S5): Bearer-authed health check that
// performs one real SELECT — keep-alive credit AND a liveness probe.
export const GET: RequestHandler = async ({ request }) => {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    await keepAliveSelect();
    return json({ ok: true });
  } catch (e) {
    console.error("[Health] keep-alive SELECT failed:", e);
    return json({ ok: false }, { status: 500 });
  }
};
