import { z } from "zod/v4";
import {
  formText,
  fieldIssues,
  localDateTimeInput,
} from "$lib/domain/form-data";
import { mergeManagedAttendance } from "$lib/domain/attendance";

/** "cancelled": ended while still recruiting — a study that never ran (#4/#20). */
export const STUDY_STATUSES = [
  "recruiting",
  "ongoing",
  "finished",
  "cancelled",
] as const;
export type StudyStatus = (typeof STUDY_STATUSES)[number];

/** The one label per status every screen shows. */
export const STUDY_STATUS_LABELS: Record<StudyStatus, string> = {
  recruiting: "모집 중",
  ongoing: "진행 중",
  finished: "종료",
  cancelled: "취소됨",
};

/**
 * Finished and cancelled are terminal, and a closed study is immutable:
 * only attendance on its existing sessions and the admin record editor may
 * still change it (#4/#20, audit LB31-2).
 */
export function isStudyClosed(status: StudyStatus): boolean {
  return status === "finished" || status === "cancelled";
}

export const STUDY_REQUEST_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "withdrawn",
] as const;
export type StudyRequestStatus = (typeof STUDY_REQUEST_STATUSES)[number];

export interface StudyMemberSummary {
  id: string;
  name: string;
  department: string;
}

export type StudyRelationship =
  "organizer" | "participant" | "pending" | "none";

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

export const operationIdSchema = z.uuidv7("올바른 작업 식별자가 아닙니다.");
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

/** A session's start: a KST `datetime-local` value naming a real time (audit LA09-3, LC04-4). */
const startedAtLocalSchema = localDateTimeInput(
  "날짜와 시작 시간을 입력해 주세요.",
);

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

/**
 * API-SPEC §6-4: recruiting ↔ ongoing → finished, and recruiting → cancelled
 * for a study that never started (#4/#20). The server enforces exactly this
 * (setStudyStatus) and the manage screen builds its buttons from it.
 */
export function nextStudyStatuses(status: StudyStatus): StudyStatus[] {
  switch (status) {
    case "recruiting":
      return ["ongoing", "cancelled"];
    case "ongoing":
      return ["recruiting", "finished"];
    case "finished":
    case "cancelled":
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
  return fieldIssues(error, [
    "title",
    "textbook",
    "description",
    "semester",
  ] as const);
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
