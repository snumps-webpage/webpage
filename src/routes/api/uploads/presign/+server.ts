import { json } from "@sveltejs/kit";
import {
  requireAdminAction,
  requireCapabilityAction,
} from "$lib/server/auth-guards";
import { AppError } from "$lib/server/core/errors";
import { CAPABILITIES } from "$lib/server/core/capabilities";
import { createPresignedUpload } from "$lib/server/services/uploads";
import { presignBodySchema, uploadPurposeSchema } from "$lib/domain/api";
import type { RequestHandler } from "./$types";

/**
 * SYS-03: presigned PUT issuance. 기본은 관리자 전용(에디터 업로드)이나,
 * 세미나 신청자가 직접 포스터를 올릴 수 있도록 `seminar-poster` purpose는
 * 참여 권한(등록 회원)에게 허용한다. 스테이징은 private이고, 승격 시
 * stagedInfo가 크기·타입을 재검증하므로 서명 URL만으로는 오염이 불가능하다.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "VALIDATION_FAILED" }, { status: 400 });
  }

  // `locals.member` is NOT populated in the api zone — the guard returns before
  // resolving it — so the capability has to be resolved here, not read off locals.
  const purpose = uploadPurposeSchema.safeParse(
    typeof body === "object" && body !== null && "purpose" in body
      ? body.purpose
      : undefined,
  );
  const isMemberPoster =
    purpose.data === "seminar-poster" &&
    (await requireCapabilityAction(locals, CAPABILITIES.PARTICIPATE)).allowed;
  if (!isMemberPoster) {
    const { allowed } = await requireAdminAction(locals);
    if (!allowed) return json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // The domain schema is the shape; the service still checks the type and
  // size the purpose allows.
  const parsed = presignBodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "VALIDATION_FAILED" }, { status: 400 });
  }

  try {
    const result = await createPresignedUpload(parsed.data);
    return json({ success: true, ...result });
  } catch (e) {
    if (e instanceof AppError)
      return json({ error: e.code }, { status: e.status });
    throw e;
  }
};
