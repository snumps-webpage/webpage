import { z } from "zod/v4";
import type { MemberPickerItem, SeminarKind } from "./seminars";
import type { AdminSeminarRecord } from "./admin-records";

export const SEMINAR_PUBLICATION_STATUSES = [
  "unscheduled",
  "scheduled",
  "published",
  "completed",
  "cancelled",
] as const;

export type SeminarPublicationStatus =
  (typeof SEMINAR_PUBLICATION_STATUSES)[number];

export interface SeminarRequesterSummary {
  id: string;
  name: string;
  department: string;
}

export interface AdminSeminarRequestItem {
  id: string;
  kind: SeminarKind;
  title: string;
  description: string;
  prerequisites: string;
  duration: string;
  attachmentUrl: string | null;
  /** 직접 업로드한 포스터 공개 URL (없으면 null — 자동 생성 포스터 사용) */
  posterUrl: string | null;
  presenters: MemberPickerItem[];
  requester: SeminarRequesterSummary;
  createdAt: string;
  canApprove: boolean;
  canReject: boolean;
}

export interface SeminarSchedule {
  startsAt: string;
  endsAt: string | null;
  location: string;
}

export function seminarSchedulesEqual(
  left: SeminarSchedule | null,
  right: SeminarSchedule,
) {
  return (
    left !== null &&
    left.startsAt === right.startsAt &&
    left.endsAt === right.endsAt &&
    left.location === right.location
  );
}

export interface AdminSeminarItem {
  id: string;
  sourceRequestId: string;
  kind: SeminarKind;
  title: string;
  description: string;
  prerequisites: string;
  duration: string;
  attachmentUrl: string | null;
  presenters: MemberPickerItem[];
  publicationStatus: SeminarPublicationStatus;
  schedule: SeminarSchedule | null;
  activityId: string | null;
  eventId: string | null;
  canSchedule: boolean;
  canPublish: boolean;
}

export interface AdminSeminarDashboardData {
  requests: AdminSeminarRequestItem[];
  seminars: AdminSeminarItem[];
  generatedAt: string;
}

export type SeminarMailEvent =
  "approval" | "schedule-confirmed" | "schedule-changed" | "none";

export type AdminSeminarOperationResult =
  | {
      success: true;
      operation: "approved";
      requestId: string;
      seminar: AdminSeminarItem;
      record: AdminSeminarRecord;
      mailEvent: "approval";
      mailFailed: boolean;
    }
  | {
      success: true;
      operation: "rejected";
      requestId: string;
    }
  | {
      success: true;
      operation: "scheduled";
      seminarId: string;
      schedule: SeminarSchedule;
      mailEvent: "none" | "schedule-changed";
      mailFailed: boolean;
    }
  | {
      success: true;
      operation: "published";
      seminarId: string;
      activityId: string;
      eventId: string;
      mailEvent: "schedule-confirmed";
      mailFailed: boolean;
    };

export type SeminarScheduleField =
  "startsAtLocal" | "endsAtLocal" | "location" | "_form";

export type SeminarScheduleIssues = Partial<
  Record<SeminarScheduleField, string>
>;

export interface SeminarScheduleFormValues {
  startsAtLocal: string;
  endsAtLocal: string;
  location: string;
}

const localDateTime = z
  .string()
  .trim()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    "날짜와 시작 시간을 입력해 주세요.",
  );

export const seminarScheduleInputSchema = z
  .object({
    startsAtLocal: localDateTime,
    endsAtLocal: z.union([
      z.literal(""),
      localDateTime.regex(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
        "올바른 종료 시간을 입력해 주세요.",
      ),
    ]),
    location: z
      .string()
      .trim()
      .min(1, "장소를 입력해 주세요.")
      .max(160, "장소는 160자 이하로 입력해 주세요."),
  })
  .superRefine((values, context) => {
    if (values.endsAtLocal && values.endsAtLocal <= values.startsAtLocal) {
      context.addIssue({
        code: "custom",
        path: ["endsAtLocal"],
        message: "종료 시간은 시작 시간보다 늦어야 합니다.",
      });
    }
  });

function value(formData: FormData, name: string) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : "";
}

export function seminarScheduleValuesFromFormData(
  formData: FormData,
): SeminarScheduleFormValues {
  return {
    startsAtLocal: value(formData, "startsAtLocal"),
    endsAtLocal: value(formData, "endsAtLocal"),
    location: value(formData, "location"),
  };
}

export function seminarScheduleIssues(
  error: z.ZodError<SeminarScheduleFormValues>,
): SeminarScheduleIssues {
  const issues: SeminarScheduleIssues = {};

  for (const issue of error.issues) {
    const path = issue.path[0];
    const field =
      path === "startsAtLocal" || path === "endsAtLocal" || path === "location"
        ? path
        : "_form";

    issues[field] ??= issue.message;
  }

  return issues;
}

export function validateSeminarScheduleForm(formData: FormData) {
  const values = seminarScheduleValuesFromFormData(formData);
  const result = seminarScheduleInputSchema.safeParse(values);

  if (result.success) return result;

  return {
    ...result,
    failure: {
      error: "VALIDATION_FAILED" as const,
      issues: seminarScheduleIssues(result.error),
      values,
    },
  };
}
