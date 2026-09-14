import { json } from "@sveltejs/kit";
import { requireAdminRest } from "$lib/server/core/http";
import { getTable } from "$lib/server/data/tables";
import type { RequestHandler } from "./$types";

/** Admin polling: pending membership applications (§8-3). */
export const GET: RequestHandler = async ({ locals }) => {
  const denied = await requireAdminRest(locals);
  if (denied) return denied;

  const apps = await getTable("applications");
  const { adminApplicationItem } =
    await import("$lib/server/data/admin-queue-views");
  const { nowKstIso } = await import("$lib/server/core/time");
  const sorted = [...apps].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  return json({
    // The queue envelope — FRONTEND-DECISIONS §3-5 declares these three keys
    // and no others; the client parses with that schema and strips the rest.
    success: true,
    items: sorted.map(adminApplicationItem),
    generatedAt: nowKstIso(),
  });
};
