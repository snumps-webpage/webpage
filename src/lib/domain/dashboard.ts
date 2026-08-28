import { z } from "zod";
import type { ActivityType } from "$lib/constants";
import type { StudyListItem, StudyTransferOffer } from "$lib/domain/studies";

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
  "pending" | "approved" | "rejected" | "withdrawn";

export interface DashboardRequestItem {
  id: string;
  type: "seminar" | "study";
  title: string;
  status: DashboardRequestStatus;
  submittedAt: string;
  actionPath: string | null;
}

export interface MemberDashboardData {
  profile: DashboardProfile;
  selectedSemester: string;
  semesters: string[];
  activities: DashboardActivityItem[];
  myRequests: DashboardRequestItem[];
  myStudies: StudyListItem[];
  pendingTransfer: StudyTransferOffer | null;
  generatedAt: string;
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

export const dashboardEventIdSchema = z.string().trim().min(1);

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

export function dashboardProfileIssues(error: z.ZodError) {
  const issues: Partial<Record<"phone" | "background" | "_form", string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (field === "phone" || field === "background") {
      issues[field] ??= issue.message;
    } else {
      issues._form ??= issue.message;
    }
  }
  return issues;
}
