import { z } from "zod/v4";
import { ACTIVITY_TYPES, type ActivityType } from "$lib/constants";
import type { AdminSeminarRequestItem } from "$lib/domain/admin-seminars";
import type { AdminStudyRequestItem } from "$lib/domain/studies";

export type AdminEventStatus = "draft" | "active" | "expired" | "cancelled";
export type AdminAttendanceStatus = "pending" | "approved" | "rejected";

export interface AdminMembershipApplicationItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
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

export interface AdminConnectableActivity {
  id: string;
  title: string;
  type: ActivityType;
  date: string;
  attendeeCount: number;
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

export type AdminDashboardOperationResult =
  | {
      success: true;
      operation: "applicationApproved" | "applicationRejected";
      applicationId: string;
      mailFailed: boolean;
    }
  | {
      success: true;
      operation: "eventActivated" | "eventExpired" | "eventUpdated";
      event: AdminEventItem;
    }
  | {
      success: true;
      operation: "eventDeleted";
      eventId: string;
    }
  | {
      success: true;
      operation:
        "attendanceApproved" | "attendanceRejected" | "attendanceUpdated";
      attendance: AdminAttendanceQueueItem;
    }
  | {
      success: true;
      operation: "attendanceDeleted";
      attendanceId: string;
    };

export const adminDashboardIdSchema = z.string().trim().min(1);

const localDateTime = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "날짜와 시간을 확인해 주세요.");

export const adminEventInputSchema = z
  .object({
    title: z.string().trim().min(1, "이벤트 제목을 입력해 주세요.").max(160),
    type: z.enum(ACTIVITY_TYPES, { message: "활동 종류를 선택해 주세요." }),
    startsAtLocal: localDateTime,
    endsAtLocal: z.union([z.literal(""), localDateTime]),
  })
  .superRefine((value, context) => {
    if (value.endsAtLocal && value.endsAtLocal <= value.startsAtLocal) {
      context.addIssue({
        code: "custom",
        path: ["endsAtLocal"],
        message: "종료 시간은 시작 시간보다 뒤여야 합니다.",
      });
    }
  });

export const adminAttendanceTimeInputSchema = z
  .object({
    startTimeLocal: localDateTime,
    endTimeLocal: localDateTime,
  })
  .refine((value) => value.endTimeLocal >= value.startTimeLocal, {
    path: ["endTimeLocal"],
    message: "종료 시간은 시작 시간보다 빠를 수 없습니다.",
  });

export function adminEventCapabilities(
  status: AdminEventStatus,
  pendingAttendanceCount: number,
) {
  return {
    canActivate: status === "draft" || status === "expired",
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

export function localAdminDateTimeToIso(value: string) {
  return `${value}:00+09:00`;
}

export function adminFormIssues(error: z.ZodError) {
  const issues: Record<string, string> = {};
  for (const issue of error.issues) {
    issues[String(issue.path[0] ?? "_form")] ??= issue.message;
  }
  return issues;
}
