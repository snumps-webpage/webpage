import { z } from "zod/v4";

export const ADMIN_QUEUE_PATHS = [
  "/api/admin/applications",
  "/api/admin/seminar-requests",
  "/api/admin/study-requests",
] as const;
export type AdminQueuePath = (typeof ADMIN_QUEUE_PATHS)[number];

export const API_ERROR_CODES = [
  "VALIDATION_FAILED",
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
  filename: z.string().trim().min(1),
  contentType: z.string().trim().min(1),
  size: z.int().positive(),
});
export type PresignRequest = z.infer<typeof presignRequestSchema>;

/** Mirrors POST /api/uploads/presign — the endpoint shape is the contract. */
export const presignSuccessSchema = z.object({
  success: z.literal(true),
  uploadUrl: z.url(),
  s3Key: z.string().min(1),
});
export type PresignSuccess = z.infer<typeof presignSuccessSchema>;
