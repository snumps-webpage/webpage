import { z } from "zod/v4";
import { fieldIssues } from "$lib/domain/form-data";
import type { ActivityType } from "$lib/constants";

export type DashboardActivityState =
  "available" | "applied" | "pending" | "attended" | "absent" | "scheduled";

export interface DashboardActivityItem {
  id: string;
  title: string;
  type: ActivityType;
  startsAt: string;
  semester: string;
  detailUrl: string | null;
  eventId: string | null;
  isApplied: boolean;
  canApply: boolean;
  pendingAttendance: boolean;
  attended: boolean;
}

export interface DashboardProfile {
  name: string;
  department: string;
  email: string;
  phone: string;
  background: string;
}

export type DashboardRequestStatus =
  "pending" | "approved" | "rejected" | "withdrawn" | "cancelled";

export interface DashboardRequestItem {
  id: string;
  type: "seminar" | "study";
  title: string;
  status: DashboardRequestStatus;
  submittedAt: string;
  actionPath: string | null;
}

export type DashboardOperationResult =
  | {
      success: true;
      operation: "profileUpdated";
      profile: Pick<DashboardProfile, "phone" | "background">;
    }
  | {
      success: true;
      operation: "activityApplied" | "activityCancelled";
      activity: DashboardActivityItem;
    };

export const dashboardEventIdSchema = z
  .string()
  .trim()
  .min(1, "활동을 선택해 주세요.")
  .max(200, "활동 id를 확인해 주세요.");

export const dashboardProfileInputSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^010-\d{4}-\d{4}$/, "전화번호는 010-XXXX-XXXX 형식이어야 합니다."),
  background: z
    .string()
    .trim()
    .max(2000, "배경지식은 2,000자 이하로 입력해 주세요."),
});

export function dashboardActivityState(
  activity: DashboardActivityItem,
): DashboardActivityState {
  if (activity.attended) return "attended";
  if (activity.pendingAttendance) return "pending";
  if (activity.isApplied) return "applied";
  if (activity.canApply) return "available";
  if (new Date(activity.startsAt).getTime() < Date.now()) return "absent";
  return "scheduled";
}

/**
 * What the ledger says when apply/cancel is refused. A cancelled event is 404
 * on purpose — for members it no longer exists (services/visibility.ts).
 */
export function dashboardActivityErrorMessage(code: string | undefined) {
  switch (code) {
    case "EVENT_NOT_OPEN":
      return "신청 가능한 시간이 지났습니다.";
    case "NOT_FOUND":
      return "더 이상 신청할 수 없는 활동입니다. 새로고침해 주세요.";
    case "FORBIDDEN":
      return "이번 학기 등록 회원만 참여할 수 있습니다.";
    default:
      return "참여 상태를 변경하지 못했습니다.";
  }
}

export function dashboardProfileIssues(error: z.ZodError) {
  return fieldIssues(error, ["phone", "background"] as const);
}
