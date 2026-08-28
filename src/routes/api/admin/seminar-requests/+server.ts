import { dev } from "$app/environment";
import { json } from "@sveltejs/kit";
import { ensureAdmin } from "$lib/server/auth-guards";
import { getDevAdminSeminarRequests } from "$lib/server/dev-admin-seminar-fixtures";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url, cookies }) => {
  await ensureAdmin(locals, { silent: true });
  if (!dev || resolveDevPreviewRole(url, cookies) !== "admin") {
    return json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 });
  }
  return json({
    success: true,
    items: getDevAdminSeminarRequests(),
    generatedAt: new Date().toISOString(),
  });
};
