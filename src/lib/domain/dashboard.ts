import { z } from "zod/v4";
import { fieldIssues } from "$lib/domain/form-data";
import { backgroundInput, phoneInput } from "$lib/domain/members";
import { ACTIVITY_TYPES, type ActivityType } from "$lib/constants";

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

export type DashboardActivityAction = "applyActivity" | "cancelActivity";

export interface DashboardActivityNotice {
  tone: "success" | "error";
  message: string;
}

const activityOperations = {
  applyActivity: "activityApplied",
  cancelActivity: "activityCancelled",
} as const;

// An enhanced response is untrusted input until the complete existing row
// contract has been checked. No guessed participation state is written locally.
const dashboardActivityResultSchema = z.object({
  success: z.literal(true),
  operation: z.enum(["activityApplied", "activityCancelled"]),
  activity: z.object({
    id: z.string().min(1),
    title: z.string(),
    type: z.enum(ACTIVITY_TYPES),
    startsAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
    semester: z.string(),
    detailUrl: z.string().nullable(),
    eventId: z.string().nullable(),
    isApplied: z.boolean(),
    canApply: z.boolean(),
    pendingAttendance: z.boolean(),
    attended: z.boolean(),
  }),
});

/** Replace only the submitted row, for the expected action and semester. */
export function mergeDashboardActivityResult(
  activities: DashboardActivityItem[],
  value: unknown,
  target: {
    eventId: string;
    semester: string;
    action: DashboardActivityAction;
  },
): DashboardActivityItem[] | null {
  const result = dashboardActivityResultSchema.safeParse(value);
  if (!result.success) return null;
  const { activity, operation } = result.data;
  if (
    operation !== activityOperations[target.action] ||
    activity.eventId !== target.eventId ||
    activity.semester !== target.semester
  ) {
    return null;
  }
  const current = activities.find(
    (item) =>
      item.eventId === target.eventId && item.semester === target.semester,
  );
  if (!current || current.id !== activity.id) return null;
  return activities.map((item) => (item.id === current.id ? activity : item));
}

export function dashboardActivityActionPath(
  action: DashboardActivityAction,
  semester: string,
) {
  return `?semester=${encodeURIComponent(semester)}&/${action}`;
}

export function dashboardActivitySuccessMessage(
  action: DashboardActivityAction,
) {
  return action === "applyActivity"
    ? "활동 참여를 신청했습니다."
    : "활동 참여 신청을 취소했습니다.";
}

/** Native POST feedback belongs only to the named ledger action in the URL. */
export function dashboardActivityNativeNotice(
  form: unknown,
  action: DashboardActivityAction | null,
  semester: string,
): DashboardActivityNotice | null {
  if (!action || !form || typeof form !== "object") return null;
  const result = dashboardActivityResultSchema.safeParse(form);
  if (result.success) {
    if (
      result.data.operation !== activityOperations[action] ||
      result.data.activity.semester !== semester
    ) {
      return null;
    }
    return {
      tone: "success",
      message: dashboardActivitySuccessMessage(action),
    };
  }
  // A profile/transfer result must not appear as an activity acknowledgement.
  if ("operation" in form || "success" in form) return null;
  if (!("error" in form) || typeof form.error !== "string") return null;
  return { tone: "error", message: dashboardActivityErrorMessage(form.error) };
}

export const dashboardEventIdSchema = z
  .string()
  .trim()
  .min(1, "활동을 선택해 주세요.")
  .max(200, "활동 id를 확인해 주세요.");

/** The member's own edit of the two private-info fields (audit LC11-4). */
export const dashboardProfileInputSchema = z.object({
  phone: phoneInput,
  background: backgroundInput,
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

export function dashboardActivityStateLabel(activity: DashboardActivityItem) {
  return {
    available: "신청 가능",
    applied: "신청됨",
    // pendingAttendance is computed from an application and elapsed start time,
    // not read from the attendance approval queue.
    pending: "출석 기록 확인",
    attended: "출석 기록 있음",
    absent: "출석 기록 없음",
    scheduled: "예정",
  }[dashboardActivityState(activity)];
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
    case "UNAUTHORIZED":
      return "로그인이 만료되었습니다. 다시 로그인해 주세요.";
    case "SERVICE_UNAVAILABLE":
      return "잠시 상태를 확인할 수 없습니다. 조금 뒤 다시 확인해 주세요.";
    case "VALIDATION_FAILED":
      return "활동 정보를 확인하지 못했습니다. 새로고침해 주세요.";
    default:
      return "참여 상태를 변경하지 못했습니다.";
  }
}

export function dashboardProfileIssues(error: z.ZodError) {
  return fieldIssues(error, ["phone", "background"] as const);
}
