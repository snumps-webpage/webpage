import { json } from "@sveltejs/kit";
import { requireAdminRest } from "$lib/server/core/http";
import {
  byCreatedAtAsc,
  adminApplicationItem,
} from "$lib/server/data/admin-queue-views";
import { getTable } from "$lib/server/data/tables";
import type { RequestHandler } from "./$types";
import { nowKstIso } from "$lib/server/core/time";

/** Admin polling: pending membership applications (§8-3). */
export const GET: RequestHandler = async ({ locals }) => {
  const denied = await requireAdminRest(locals);
  if (denied) return denied;

  const apps = await getTable("applications");
  const sorted = [...apps].sort(byCreatedAtAsc);
  return json({
    // The queue envelope — FRONTEND-DECISIONS §3-5 declares these three keys
    // and no others; the client parses with that schema and strips the rest.
    success: true,
    items: sorted.map(adminApplicationItem),
    generatedAt: nowKstIso(),
  });
};
