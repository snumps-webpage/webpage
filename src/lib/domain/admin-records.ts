import { z } from "zod/v4";
import { RECORD_ACTIVITY_TYPES } from "$lib/constants";
import { localDateTimeSchema } from "$lib/domain/admin-dashboard";
import type { PublicFileReference } from "$lib/domain/public-content";
import type { SeminarKind } from "$lib/domain/seminars";

export interface AdminContentFile extends Omit<PublicFileReference, "url"> {
  url: string | null;
  contentType: string;
  size: number;
}

export interface AdminSeminarRecord {
  id: string;
  sourceRequestId: string | null;
  kind: SeminarKind;
  title: string;
  term: string;
  description: string;
  prerequisites: string;
  durationMinutes: number;
  /** 신청자 선호 세미나 시점 (빈 문자열이면 미선택) */
  preferredTiming: string;
  presenterIds: string[];
  presenterNames: string[];
  scheduledAt: string | null;
  endsAt: string | null;
  location: string | null;
  activityId: string | null;
  eventId: string | null;
  files: AdminContentFile[];
}

export interface AdminStudyTransferHistoryEntry {
  fromMemberId: string;
  toMemberId: string;
  changedAt: string;
  byAdmin: boolean;
}

export interface AdminStudyRecord {
  id: string;
  sourceRequestId: string | null;
  title: string;
  term: string;
  description: string;
  material: string;
  organizerIds: string[];
  organizerNames: string[];
  pendingTransfer: { toMemberId: string; requestedAt: string } | null;
  transferHistory: AdminStudyTransferHistoryEntry[];
  sessionCount: number;
  files: AdminContentFile[];
}

/*
 * Input rules for the record editors' ?/create and ?/update actions, keyed by
 * the field names the editors render issues under; the actions check nothing
 * by hand. Free text is bounded. Text that migrated rows often lack
 * (descriptions, materials) is not required, so an old record can still be
 * edited without inventing content for it.
 */

const termSchema = z
  .string()
  .trim()
  .regex(/^\d{2}-(?:[12SW])$/, "학기는 YY-1·YY-2·YY-S·YY-W 형식이어야 합니다.");

/** A picked record id (activity, member); "" when nothing is picked. */
const pickedIdSchema = z.string().trim().max(200, "선택 값을 확인해 주세요.");

/** Fields: title, type, start / end (KST `datetime-local`, end optional). */
export const adminActivityRecordSchema = z.object({
  title: z.string().trim().min(1, "활동명을 입력해 주세요.").max(160),
  type: z.enum(RECORD_ACTIVITY_TYPES, {
    message: "활동 유형을 선택해 주세요.",
  }),
  start: localDateTimeSchema,
  end: z.union([z.literal(""), localDateTimeSchema]),
});

/** Update leaves the date alone when the editor sends no `start`. */
export const adminActivityRecordUpdateSchema = adminActivityRecordSchema.extend(
  { start: z.union([z.literal(""), localDateTimeSchema]) },
);

/** The dinner gallery: a year label ("2026", or "미상" from the migration). */
export const adminGalleryRecordSchema = z.object({
  year: z.string().trim().min(1, "연도를 입력해 주세요.").max(20),
  activityId: pickedIdSchema,
});

/** Fields: title, term (posted as `semester`), description (posted as `note`). */
export const adminSeminarRecordSchema = z.object({
  title: z.string().trim().min(1, "세미나 제목을 입력해 주세요.").max(160),
  term: termSchema,
  description: z
    .string()
    .trim()
    .max(2400, "세미나 설명은 2400자 이하로 입력해 주세요."),
  externalPresenters: z
    .string()
    .trim()
    .max(500, "외부 발표자는 500자 이하로 입력해 주세요."),
});

/** Fields: title, term (`semester`), description, material (`textbook`). */
export const adminStudyRecordSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "스터디 제목을 2자 이상 입력해 주세요.")
    .max(160),
  term: termSchema,
  description: z
    .string()
    .trim()
    .max(2400, "스터디 설명은 2400자 이하로 입력해 주세요."),
  material: z
    .string()
    .trim()
    .max(500, "교재 또는 자료는 500자 이하로 입력해 주세요."),
  note: z.string().trim().max(2400, "메모는 2400자 이하로 입력해 주세요."),
});

/** Create also picks the organizer (update changes it via ?/setOrganizer). */
export const adminStudyRecordCreateSchema = adminStudyRecordSchema.extend({
  organizerId: pickedIdSchema.min(1, "주최자를 선택해 주세요."),
});
