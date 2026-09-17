import { z } from "zod/v4";
import type {
  MemberPickerItem,
  SeminarKind,
  SeminarPublicationStatus,
} from "./seminars";

// 정의는 domain/seminars.ts — 관리자 화면 계약이 저장 값의 원천이 되지 않게 한다.
export {
  SEMINAR_PUBLICATION_STATUSES,
  type SeminarPublicationStatus,
} from "./seminars";

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
  /** 신청자 선호 세미나 시점 (빈 문자열이면 미선택) */
  preferredTiming: string;
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
  /** 시작 시각 "HH:mm" (KST). `null`은 **모른다**는 뜻 — 화면은 날짜만 보여 준다. */
  startTime: string | null;
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
    left.startTime === right.startTime &&
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
  canCancel: boolean;
  /**
   * 이미 취소된 세미나에 취소를 **다시** 걸 수 있는가. 정리(이벤트 덮기)가
   * 쓰기 경합으로 중간에 끊기면 취소된 세미나에 살아 있는 출석 이벤트가 남는데,
   * 그때 같은 호출을 다시 하는 것이 유일한 복구다.
   */
  canReapplyCancel: boolean;
}

export interface AdminSeminarDashboardData {
  requests: AdminSeminarRequestItem[];
  seminars: AdminSeminarItem[];
  generatedAt: string;
}

/**
 * 공개 보드의 액션이 **실제로** 돌려주는 것. 예전에는 승인·반려 변형과
 * mailEvent 필드까지 선언돼 있었지만 어느 액션도 그것을 보내지 않았고,
 * 호출부의 `as` 캐스트가 그 불일치를 가려 왔다 — 화면이 있지도 않은 값을
 * 읽고 조용히 undefined를 받는 길이다.
 */
export type AdminSeminarOperationResult =
  | {
      success: true;
      operation: "scheduled";
      seminarId: string;
      schedule: SeminarSchedule;
      /** 공개된 세미나의 일정을 바꾼 경우의 변경 공지 발송 실패 여부. */
      mailFailed: boolean;
    }
  | {
      success: true;
      operation: "cancelled";
      seminarId: string;
      mailFailed: boolean;
    }
  | {
      success: true;
      operation: "published";
      seminarId: string;
      activityId: string;
      eventId: string;
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
