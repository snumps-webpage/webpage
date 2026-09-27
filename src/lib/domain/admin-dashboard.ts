import { z } from "zod/v4";
import { RECORD_ACTIVITY_TYPES, type ActivityType } from "$lib/constants";
import type { AdminSeminarRequestItem } from "$lib/domain/admin-seminars";
import type { AdminStudyRequestItem } from "$lib/domain/studies";
import { localDateTimeMs, localDateTimeSchema } from "$lib/domain/form-data";

export type AdminEventStatus = "draft" | "active" | "expired" | "cancelled";
export type AdminAttendanceStatus = "pending" | "approved" | "rejected";

export interface AdminMembershipApplicationItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  /** S9: 가입/재가입 신청부터 필수 수집 (구 신청 행은 빈 문자열) */
  studentId: string;
  background: string;
  consentAt: string;
  submittedAt: string;
  canApprove: boolean;
  canReject: boolean;
}

export interface AdminEventItem {
  id: string;
  activityId: string;
  title: string;
  type: ActivityType;
  startsAt: string;
  endsAt: string | null;
  status: AdminEventStatus;
  attendancePath: string;
  pendingAttendanceCount: number;
  canActivate: boolean;
  canExpire: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface AdminAttendanceQueueItem {
  id: string;
  eventId: string;
  eventTitle: string;
  activityId: string;
  member: {
    id: string;
    name: string;
    department: string;
    email: string;
  };
  startTime: string;
  endTime: string;
  status: AdminAttendanceStatus;
  createdAt: string;
  canApprove: boolean;
  canReject: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface AdminWithdrawalQueueItem {
  memberId: string;
  name: string;
  requestedAt: string;
  graceEndsAt: string;
  holdBy: string | null;
}

export interface AdminDashboardData {
  applications: AdminMembershipApplicationItem[];
  seminarRequests: AdminSeminarRequestItem[];
  studyRequests: AdminStudyRequestItem[];
  events: AdminEventItem[];
  attendanceQueue: AdminAttendanceQueueItem[];
  withdrawals: AdminWithdrawalQueueItem[];
  generatedAt: string;
}

export const adminDashboardIdSchema = z
  .string()
  .trim()
  .min(1, "대상을 선택해 주세요.")
  .max(200, "대상 id를 확인해 주세요.");

/** The ids one dashboard action names (e.g. `eventId` + `id`), all required. */
export function adminDashboardIdsSchema<K extends string>(...keys: K[]) {
  return z.object(
    Object.fromEntries(keys.map((key) => [key, adminDashboardIdSchema])) as {
      [P in K]: typeof adminDashboardIdSchema;
    },
  );
}

export const adminEventInputSchema = z
  .object({
    title: z.string().trim().min(1, "이벤트 제목을 입력해 주세요.").max(160),
    type: z.enum(RECORD_ACTIVITY_TYPES, {
      message: "활동 종류를 선택해 주세요.",
    }),
    startsAtLocal: localDateTimeSchema,
    endsAtLocal: z.union([z.literal(""), localDateTimeSchema]),
  })
  .superRefine((value, context) => {
    // NaN (no end, or an impossible time already reported) compares false
    if (
      localDateTimeMs(value.endsAtLocal) <= localDateTimeMs(value.startsAtLocal)
    ) {
      context.addIssue({
        code: "custom",
        path: ["endsAtLocal"],
        message: "종료 시간은 시작 시간보다 뒤여야 합니다.",
      });
    }
  });

export const adminAttendanceTimeInputSchema = z
  .object({
    startTimeLocal: localDateTimeSchema,
    endTimeLocal: localDateTimeSchema,
  })
  .superRefine((value, context) => {
    if (
      localDateTimeMs(value.endTimeLocal) <
      localDateTimeMs(value.startTimeLocal)
    ) {
      context.addIssue({
        code: "custom",
        path: ["endTimeLocal"],
        message: "종료 시간은 시작 시간보다 빠를 수 없습니다.",
      });
    }
  });

/**
 * `status` is the effective one. For an active event "expired" also covers
 * "its end has passed", but a draft whose end has passed stays "draft" — so
 * `endPassed` is passed separately. Opening cannot undo a passed end (the
 * server refuses it), so the button only shows while the end is ahead.
 */
export function adminEventCapabilities(
  status: AdminEventStatus,
  pendingAttendanceCount: number,
  endPassed: boolean,
) {
  return {
    canActivate: (status === "draft" || status === "expired") && !endPassed,
    canExpire: status === "active",
    canEdit: true,
    canDelete: pendingAttendanceCount === 0,
  };
}

export function adminAttendanceCapabilities(status: AdminAttendanceStatus) {
  return {
    canApprove: status !== "approved",
    canReject: status !== "rejected",
    canEdit: true,
    canDelete: true,
  };
}

/**
 * The notice for a refused dashboard action. The failure carries a code
 * (`error`) and sometimes a Korean `message` (AppError.userMessage); the
 * code is the contract, never the text — field-level messages already sit
 * next to their fields, so VALIDATION_FAILED only needs a pointer to them.
 */
export function adminActionErrorMessage(
  data: { error?: string; message?: string } | null | undefined,
  fallback: string,
): string {
  if (data?.message) return data.message;
  switch (data?.error) {
    case "VALIDATION_FAILED":
      return "입력값을 확인해 주세요.";
    case "NOT_FOUND":
      return "대상을 찾을 수 없습니다. 새로고침해 주세요.";
    case "CONFLICT":
      return "지금 상태에서는 처리할 수 없습니다. 새로고침 후 확인해 주세요.";
    case "WRITE_CONFLICT":
      return "동시에 다른 변경이 있었습니다. 다시 시도해 주세요.";
    case "SERVICE_UNAVAILABLE":
      return "잠시 후 다시 시도해 주세요.";
    default:
      return fallback;
  }
}
