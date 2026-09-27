import { z } from "zod/v4";

export const ADMIN_QUEUE_PATHS = [
  "/api/admin/applications",
  "/api/admin/seminar-requests",
  "/api/admin/study-requests",
] as const;
export type AdminQueuePath = (typeof ADMIN_QUEUE_PATHS)[number];

export const API_ERROR_CODES = [
  "VALIDATION_FAILED",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "FORBIDDEN",
  "CONFLICT",
  "WRITE_CONFLICT",
  "EVENT_NOT_OPEN",
  "STUDY_NOT_RECRUITING",
  "SERVICE_UNAVAILABLE",
] as const;
export const apiErrorCodeSchema = z.enum(API_ERROR_CODES);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const restErrorEnvelopeSchema = z.object({ error: apiErrorCodeSchema });
export type RestErrorEnvelope = z.infer<typeof restErrorEnvelopeSchema>;

export const queueResponseEnvelopeSchema = z.object({
  success: z.literal(true),
  items: z.array(z.unknown()),
  generatedAt: z.iso.datetime({ offset: true }),
});
export interface QueueResponse<T> {
  success: true;
  items: T[];
  generatedAt: string;
}

export const UPLOAD_PURPOSES = [
  "seminar-material",
  "seminar-photo",
  "seminar-poster",
  "study-photo",
  "gallery-photo",
] as const;
export const uploadPurposeSchema = z.enum(UPLOAD_PURPOSES);
export type UploadPurpose = z.infer<typeof uploadPurposeSchema>;

export const presignRequestSchema = z.object({
  operationId: z.uuid(),
  purpose: uploadPurposeSchema,
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(100),
  size: z.int().positive(),
});
export type PresignRequest = z.infer<typeof presignRequestSchema>;

/**
 * What POST /api/uploads/presign reads: the operationId stays client-side
 * (the editor's idempotent registration step), so the body omits it.
 */
export const presignBodySchema = presignRequestSchema.omit({
  operationId: true,
});

/** Mirrors POST /api/uploads/presign — the endpoint shape is the contract. */
export const presignSuccessSchema = z.object({
  success: z.literal(true),
  uploadUrl: z.url(),
  s3Key: z.string().min(1),
});
export type PresignSuccess = z.infer<typeof presignSuccessSchema>;

const ERROR_TEXT: Record<ApiErrorCode, string> = {
  VALIDATION_FAILED: "입력값을 확인해 주세요.",
  UNAUTHORIZED: "다시 로그인해 주세요.",
  NOT_FOUND: "대상을 찾을 수 없습니다. 새로고침해 주세요.",
  FORBIDDEN: "이 작업을 할 권한이 없습니다.",
  CONFLICT: "지금 상태에서는 처리할 수 없습니다. 새로고침 후 확인해 주세요.",
  WRITE_CONFLICT: "동시에 다른 변경이 있었습니다. 다시 시도해 주세요.",
  EVENT_NOT_OPEN: "지금은 열려 있지 않은 이벤트입니다.",
  STUDY_NOT_RECRUITING: "지금은 모집 중인 스터디가 아닙니다.",
  SERVICE_UNAVAILABLE: "잠시 후 다시 시도해 주세요.",
};

/**
 * What a form shows for a failed action: the server's Korean message when it
 * sent one, else a sentence for the code, else `fallback`. Never the bare
 * code — the code is the contract, not the text (the action wrapper stopped
 * sending raw exception text, audit LB02-2).
 */
export function actionErrorText(
  result: object | null | undefined,
  fallback: string,
): string {
  // any action result shape — success variants simply carry neither key
  const data = result as { error?: unknown; message?: unknown } | null;
  if (typeof data?.message === "string" && data.message) return data.message;
  const code = apiErrorCodeSchema.safeParse(data?.error);
  return code.success ? ERROR_TEXT[code.data] : fallback;
}
