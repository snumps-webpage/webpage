import { z } from "zod";
import { DateTime, Id } from "./common";

export const RequestStatus = z.enum([
  "pending",
  "approved",
  "rejected",
  "withdrawn",
]);
export type RequestStatus = z.infer<typeof RequestStatus>;

// 선호 세미나 시점 옵션의 단일 소스는 domain 계층 — 서버는 재수출만 한다.
export { SEMINAR_TIMING_OPTIONS } from "$lib/domain/seminars";
import { SEMINAR_KINDS } from "$lib/domain/seminars";

export const SeminarRequestSchema = z.object({
  id: Id,
  title: z.string().min(1),
  description: z.string(),
  prerequisites: z.string(),
  duration: z.string(),
  // 선호 세미나 시점 — SEMINAR_TIMING_OPTIONS 중 하나 또는 빈 문자열(미선택)
  preferredTiming: z.string().default(""),
  presenterIds: z.array(Id),
  attachment: z.string(), // external material link (upload path arrives with SYS-03)
  // 직접 업로드한 포스터의 assets 키 (없으면 빈 문자열 — 자동 생성 포스터 사용)
  posterKey: z.string().default(""),
  /**
   * 정기/비정기 (FRONTEND-DECISIONS §3-1). The form always asks; rows from
   * before it was stored read as null.
   */
  kind: z.enum(SEMINAR_KINDS).nullable().default(null),
  requesterId: Id,
  status: RequestStatus,
  /**
   * The seminar this request became was cancelled or deleted (decision
   * 2026-09-27). The row stays as history and the presenter's dashboard shows
   * it as "취소됨". `status` keeps what the review decided ("approved").
   * A cancelled seminar is also recognised from the seminar row itself; the
   * marker is what survives once that row is deleted.
   */
  closedAs: z.enum(["cancelled", "deleted"]).nullable().default(null),
  createdAt: DateTime,
});

export type SeminarRequest = z.infer<typeof SeminarRequestSchema>;
