import { z } from "zod/v4";
import { ACTIVITY_TYPES, type ActivityType } from "$lib/constants";
import type { PublicFileReference } from "$lib/domain/public-content";
import type { SeminarKind } from "$lib/domain/seminars";

export interface AdminActivityRecord {
  id: string;
  title: string;
  type: ActivityType;
  date: string;
  attendeeIds: string[];
  linkedEventIds: string[];
}

export interface AdminGalleryPhoto {
  name: string;
  contentType: string;
  size: number;
  thumbnailUrl: string | null;
  displayUrl: string | null;
}

export interface AdminGalleryRecord {
  id: string;
  title: string;
  category: "seminar" | "study" | "dinner";
  date: string;
  alt: string;
  photo: AdminGalleryPhoto | null;
}

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

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 확인해 주세요.");

export const adminActivityRecordSchema = z.object({
  title: z.string().trim().min(1, "활동명을 입력해 주세요.").max(160),
  type: z.enum(ACTIVITY_TYPES, { message: "활동 유형을 선택해 주세요." }),
  date: dateSchema,
});

export const adminGalleryRecordSchema = z.object({
  title: z.string().trim().min(1, "기록 제목을 입력해 주세요.").max(160),
  category: z.enum(["seminar", "study", "dinner"], {
    message: "갤러리 분류를 선택해 주세요.",
  }),
  date: dateSchema,
  alt: z.string().trim().min(1, "사진 대체 텍스트를 입력해 주세요.").max(240),
});

export const adminSeminarRecordSchema = z.object({
  title: z.string().trim().min(1, "세미나 제목을 입력해 주세요.").max(160),
  term: z
    .string()
    .trim()
    .regex(/^\d{2}-(?:[12SW])$/, "학기는 YY-1·YY-2·YY-S·YY-W 형식이어야 합니다."),
  kind: z.enum(["regular", "irregular"]),
  description: z
    .string()
    .trim()
    .min(10, "세미나 설명을 10자 이상 입력해 주세요.")
    .max(2400),
  prerequisites: z.string().trim().min(1, "선수지식을 입력해 주세요.").max(500),
  durationMinutes: z.coerce
    .number()
    .int()
    .min(10, "소요 시간은 10분 이상이어야 합니다.")
    .max(600),
});

export const adminStudyRecordSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "스터디 제목을 2자 이상 입력해 주세요.")
    .max(160),
  term: z
    .string()
    .trim()
    .regex(/^\d{2}-(?:[12SW])$/, "학기는 YY-1·YY-2·YY-S·YY-W 형식이어야 합니다."),
  description: z
    .string()
    .trim()
    .min(10, "스터디 설명을 10자 이상 입력해 주세요.")
    .max(2400),
  material: z
    .string()
    .trim()
    .min(1, "교재 또는 자료를 입력해 주세요.")
    .max(500),
});

export function zodFieldIssues(error: z.ZodError) {
  const issues: Record<string, string> = {};
  for (const issue of error.issues) {
    issues[String(issue.path[0] ?? "_form")] ??= issue.message;
  }
  return issues;
}
