import { z } from "zod/v4";
import { formText } from "$lib/domain/form-data";
import { mergeManagedAttendance } from "$lib/domain/attendance";
import type { AdminStudyRecord } from "$lib/domain/admin-records";

export const STUDY_STATUSES = ["recruiting", "ongoing", "finished"] as const;
export type StudyStatus = (typeof STUDY_STATUSES)[number];

export const STUDY_REQUEST_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "withdrawn",
] as const;
export type StudyRequestStatus = (typeof STUDY_REQUEST_STATUSES)[number];

export const STUDY_SESSION_STATUSES = [
  "active",
  "expired",
  "cancelled",
] as const;
export type StudySessionStatus = (typeof STUDY_SESSION_STATUSES)[number];

export interface StudyMemberSummary {
  id: string;
  name: string;
  department: string;
}

export interface StudySessionItem {
  id: string;
  sessionNo: number;
  title: string;
  startedAt: string;
  status: StudySessionStatus;
  activityId: string;
  eventId: string;
  attendancePath: string;
  attendanceCount: number;
  canEdit: boolean;
  canCancel: boolean;
}

export interface StudyManagementCapabilities {
  canCreateSession: boolean;
  canManageParticipants: boolean;
  canChangeStatus: boolean;
  canTransferOrganizer: boolean;
}

export interface StudyManagementData {
  id: string;
  title: string;
  semester: string;
  textbook: string;
  description: string;
  note: string;
  status: StudyStatus;
  organizers: StudyMemberSummary[];
  participants: StudyMemberSummary[];
  pendingParticipants: StudyMemberSummary[];
  sessions: StudySessionItem[];
  pendingTransfer: {
    toMember: StudyMemberSummary;
    requestedAt: string;
  } | null;
  capabilities: StudyManagementCapabilities;
  generatedAt: string;
}

export interface StudyListItem {
  id: string;
  title: string;
  semester: string;
  textbook: string;
  description: string;
  status: StudyStatus;
  participantCount: number;
  organizerNames: string[];
  relationship: StudyRelationship;
  canManage: boolean;
}

export type StudyRelationship =
  "organizer" | "participant" | "pending" | "none";

export interface StudyDetailData {
  id: string;
  title: string;
  semester: string;
  textbook: string;
  description: string;
  note: string;
  status: StudyStatus;
  organizers: StudyMemberSummary[];
  participantCount: number;
  relationship: StudyRelationship;
  canJoin: boolean;
  canLeave: boolean;
  canManage: boolean;
}

export interface StudyTransferOffer {
  studyId: string;
  studyTitle: string;
  fromMember: StudyMemberSummary;
  requestedAt: string;
}

export interface StudyRequestItem {
  id: string;
  title: string;
  textbook: string;
  description: string;
  semester: string;
  requester: StudyMemberSummary;
  status: StudyRequestStatus;
  createdAt: string;
  canWithdraw: boolean;
}

export interface AdminStudyRequestItem extends StudyRequestItem {
  canApprove: boolean;
  canReject: boolean;
}

export interface StudyRequestFormValues {
  title: string;
  textbook: string;
  description: string;
  semester: string;
}

export type StudyRequestFormField = keyof StudyRequestFormValues | "_form";
export type StudyRequestFormIssues = Partial<
  Record<StudyRequestFormField, string>
>;

export interface StudyAttendanceRow extends StudyMemberSummary {
  attended: boolean;
  checkedInAt: string | null;
}

export interface StudyAttendancePageData {
  study: Pick<StudyManagementData, "id" | "title" | "semester">;
  sessions: StudySessionItem[];
  selectedSession: StudySessionItem;
  attendees: StudyAttendanceRow[];
  canSave: boolean;
}

export type StudyOperationResult =
  | {
      success: true;
      operation: "requestSubmitted";
      request: StudyRequestItem;
    }
  | {
      success: true;
      operation: "requestWithdrawn";
      requestId: string;
    }
  | {
      success: true;
      operation: "studyJoined";
      studyId: string;
      relationship: "pending";
    }
  | {
      success: true;
      operation: "studyLeft";
      studyId: string;
      relationship: "none";
    }
  | {
      success: true;
      operation: "studyApproved";
      requestId: string;
      study: StudyListItem;
      record: AdminStudyRecord;
      mailSent: true;
    }
  | {
      success: true;
      operation: "studyRejected";
      requestId: string;
      mailSent: true;
    }
  | {
      success: true;
      operation: "transferProposed";
      toMember: StudyMemberSummary;
      requestedAt: string;
    }
  | {
      success: true;
      operation: "transferCancelled";
    }
  | {
      success: true;
      operation: "transferAccepted";
      studyId: string;
      study: StudyListItem;
    }
  | {
      success: true;
      operation: "transferDeclined";
      studyId: string;
    }
  | {
      success: true;
      operation: "participantAccepted";
      member: StudyMemberSummary;
    }
  | {
      success: true;
      operation: "participantRemoved";
      memberId: string;
    }
  | {
      success: true;
      operation: "statusChanged";
      status: StudyStatus;
    }
  | {
      success: true;
      operation: "sessionCreated";
      operationId: string;
      session: StudySessionItem;
    }
  | {
      success: true;
      operation: "sessionUpdated";
      sessionId: string;
      title: string;
      startedAt: string;
    }
  | {
      success: true;
      operation: "sessionCancelled";
      sessionId: string;
    }
  | {
      success: true;
      operation: "attendanceSaved";
      eventId: string;
      attendeeIds: string[];
    };

export const operationIdSchema = z.uuidv7("올바른 작업 식별자가 아닙니다.");
export const studyIdSchema = z.string().trim().min(1);
export const studyStatusSchema = z.enum(STUDY_STATUSES, {
  error: "지원하지 않는 스터디 상태입니다.",
});

/** Study request rules — the single source; study/apply validates with this. */
export const studyRequestInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "스터디 이름을 2자 이상 입력해 주세요.")
    .max(120, "스터디 이름은 120자 이하로 입력해 주세요."),
  textbook: z
    .string()
    .trim()
    .min(1, "교재 또는 자료를 입력해 주세요.")
    .max(240, "교재 또는 자료는 240자 이하로 입력해 주세요."),
  description: z
    .string()
    .trim()
    .min(10, "스터디 설명을 10자 이상 입력해 주세요.")
    .max(2400, "스터디 설명은 2400자 이하로 입력해 주세요."),
  semester: z
    .string()
    .trim()
    .regex(
      /^\d{2}-(?:[12SW])$/,
      "학기는 YY-1·YY-2·YY-S·YY-W 형식이어야 합니다.",
    ),
});

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** A datetime-local value that names a real instant — no 02-30, no 25:00. */
function isCalendarDateTime(value: string) {
  const m = LOCAL_DATE_TIME.exec(value);
  if (!m) return true; // the shape issue already reports it
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d &&
    date.getUTCHours() === h &&
    date.getUTCMinutes() === mi
  );
}

/** "YYYY-MM-DDTHH:mm" in KST, as a datetime-local input posts it. */
const startedAtLocalSchema = z
  .string()
  .trim()
  .regex(LOCAL_DATE_TIME, "날짜와 시작 시간을 입력해 주세요.")
  .refine(isCalendarDateTime, "존재하지 않는 날짜나 시각입니다.");

const sessionTitleSchema = z
  .string()
  .trim()
  .max(120, "회차 제목은 120자 이하로 입력해 주세요.");

export const studySessionCorrectionSchema = z.object({
  title: sessionTitleSchema.min(1, "회차 제목을 입력해 주세요."),
  startedAtLocal: startedAtLocalSchema,
});

/** An id a manage form posts back from a hidden field (event, member). */
export const studyTargetIdSchema = z
  .string()
  .trim()
  .min(1, "대상을 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.")
  .max(200, "올바른 식별자가 아닙니다.");

/*
 * The organizer actions of /study/[id]/manage — the single source of their
 * input rules. Field names are the domain's; the action maps the form's
 * `date` to `startedAtLocal`, which the correction dialog renders.
 */
export const studyStatusInputSchema = z.object({ status: studyStatusSchema });
export const studySessionCreateInputSchema = z.object({
  startedAtLocal: startedAtLocalSchema,
  /** Empty means the server numbers it: "<study> N회차". */
  title: sessionTitleSchema,
});
export const studySessionUpdateInputSchema =
  studySessionCorrectionSchema.extend({ eventId: studyTargetIdSchema });
export const studySessionTargetInputSchema = z.object({
  eventId: studyTargetIdSchema,
});
export const studyParticipantInputSchema = z.object({
  memberId: studyTargetIdSchema,
});
export const studyTransferInputSchema = z.object({
  toMemberId: studyTargetIdSchema,
});

/** First message per field; an issue off any field goes to `_form`. */
export function studyFormIssues(error: z.ZodError): Record<string, string> {
  const issues: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    issues[typeof field === "string" ? field : "_form"] ??= issue.message;
  }
  return issues;
}

export function nextStudyStatuses(status: StudyStatus): StudyStatus[] {
  switch (status) {
    case "recruiting":
      return ["ongoing"];
    case "ongoing":
      return ["recruiting", "finished"];
    case "finished":
      return [];
  }
}

export function mergeStudyAttendance(
  existingAttendeeIds: string[],
  submittedAttendeeIds: string[],
  managedParticipantIds: string[],
) {
  const merged = mergeManagedAttendance(
    existingAttendeeIds,
    submittedAttendeeIds,
    managedParticipantIds,
  );
  if (!merged.success) {
    return {
      success: false as const,
      error: "VALIDATION_FAILED" as const,
      issues: {
        attendeeIds: "현재 스터디 참여자만 출석 처리할 수 있습니다.",
      },
    };
  }
  return merged;
}

export function localKstDateTimeToIso(value: string) {
  return `${value}:00+09:00`;
}

export function studyRequestValuesFromFormData(
  formData: FormData,
): StudyRequestFormValues {
  return {
    title: formText(formData, "title"),
    textbook: formText(formData, "textbook"),
    description: formText(formData, "description"),
    semester: formText(formData, "semester"),
  };
}

/** One message per field, the first one zod reports. */
export function studyRequestIssues(error: z.ZodError): StudyRequestFormIssues {
  const issues: StudyRequestFormIssues = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (
      field === "title" ||
      field === "textbook" ||
      field === "description" ||
      field === "semester"
    ) {
      issues[field] ??= issue.message;
    } else {
      issues._form ??= issue.message;
    }
  }
  return issues;
}

export function validateStudyRequestForm(formData: FormData) {
  const values = studyRequestValuesFromFormData(formData);
  const result = studyRequestInputSchema.safeParse(values);
  if (result.success) return result;

  return {
    ...result,
    failure: {
      error: "VALIDATION_FAILED" as const,
      issues: studyRequestIssues(result.error),
      values,
    },
  };
}
