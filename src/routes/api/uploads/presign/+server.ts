import { json } from "@sveltejs/kit";
import { requireAdminAction } from "$lib/server/auth-guards";
import { AppError } from "$lib/server/core/errors";
import { createPresignedUpload } from "$lib/server/services/uploads";
import type { RequestHandler } from "./$types";

/** SYS-03: presigned PUT issuance. Admin-only — uploads exist only in editors. */
export const POST: RequestHandler = async ({ request, locals }) => {
  const { allowed } = await requireAdminAction(locals);
  if (!allowed) return json({ error: "Forbidden" }, { status: 403 });

  let body: { purpose?: string; filename?: string; contentType?: string; size?: number };
  try {
    body = await request.json();
  } catch {
    return json({ error: "VALIDATION_FAILED" }, { status: 400 });
  }

  try {
    const result = await createPresignedUpload({
      purpose: body.purpose ?? "",
      filename: body.filename ?? "",
      contentType: body.contentType ?? "",
      size: body.size ?? 0,
    });
    return json({ success: true, ...result });
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.code }, { status: e.status });
    throw e;
  }
};
