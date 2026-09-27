import { z } from "zod/v4";
import { formText } from "$lib/domain/form-data";

export const SEMINAR_KINDS = ["regular", "irregular"] as const;

export type SeminarKind = (typeof SEMINAR_KINDS)[number];

/**
 * 선호 세미나 시점 — 학기 중 활동 월을 초·중반·말로 쪼갠 텍스트 선택지 (날짜 아님).
 * 방학(1·2월 겨울, 7·8월 여름)은 세미나를 진행하지 않으므로 제외한다.
 *   - 1학기(YY-1) 활동월: 3·4·5·6월
 *   - 2학기(YY-2) 활동월: 9·10·11·12월
 * 폼은 현재 학기의 월만 노출하고(seminarTimingOptions), 서버 검증은 두 학기
 * 전체 활동월을 닫힌 집합(SEMINAR_TIMING_OPTIONS)으로 받아 학기 경계에서도 안전.
 */
const SPRING_MONTHS = [3, 4, 5, 6] as const;
const FALL_MONTHS = [9, 10, 11, 12] as const;
const TIMING_SEGMENTS = ["초", "중반", "말"] as const;
const NEGOTIATE = "협의 후 결정";

function monthsForTerm(term: string): readonly number[] {
  return term.endsWith("-1") ? SPRING_MONTHS : FALL_MONTHS;
}

/** 현재 학기의 활동월 선택지 (폼 노출용). */
export function seminarTimingOptions(term: string): string[] {
  return [
    ...monthsForTerm(term).flatMap((m) =>
      TIMING_SEGMENTS.map((s) => `${m}월 ${s}`),
    ),
    NEGOTIATE,
  ];
}

/** 두 학기 전체 활동월 — 서버 검증용 닫힌 집합 (학기 무관). */
export const SEMINAR_TIMING_OPTIONS = [
  ...[...SPRING_MONTHS, ...FALL_MONTHS].flatMap((m) =>
    TIMING_SEGMENTS.map((s) => `${m}월 ${s}`),
  ),
  NEGOTIATE,
] as const;

/**
 * 승인된 세미나의 공개 수명주기 (FRONTEND-DECISIONS §3-1).
 * 저장 스키마와 관리자 화면이 같은 목록을 쓴다 — 여기가 단일 원천이다.
 * (관리자 화면 계약인 admin-seminars.ts가 아니라 이 중립 모듈에 두는 이유:
 *  칼럼 재배치 같은 화면 사정이 저장 값의 정의를 바꾸면 안 된다.)
 */
export const SEMINAR_PUBLICATION_STATUSES = [
  "unscheduled",
  "scheduled",
  "published",
  "cancelled",
] as const;

export type SeminarPublicationStatus =
  (typeof SEMINAR_PUBLICATION_STATUSES)[number];

export interface MemberPickerItem {
  id: string;
  name: string;
  department: string;
}

export type SeminarRequestField =
  | "kind"
  | "title"
  | "description"
  | "prerequisites"
  | "duration"
  | "attachmentUrl"
  | "presenterIds"
  | "_form";

export type SeminarFormIssues = Partial<Record<SeminarRequestField, string>>;

const httpsUrl = z.url({ protocol: /^https$/ });

/** Most presenters one request may name — a bound on the submitted list. */
export const SEMINAR_MAX_PRESENTERS = 20;

/**
 * Seminar request rules — the single source; the apply and edit actions
 * validate with this. The stored request keeps `kind` too (null on rows
 * written before the form asked it).
 */
export const seminarRequestInputSchema = z.object({
  kind: z.enum(SEMINAR_KINDS, {
    message: "정기 또는 비정기 세미나를 선택해 주세요.",
  }),
  title: z
    .string()
    .trim()
    .min(1, "세미나 주제를 입력해 주세요.")
    .max(120, "세미나 주제는 120자 이하로 입력해 주세요."),
  description: z
    .string()
    .trim()
    .min(1, "세미나 설명을 입력해 주세요.")
    .max(4_000, "세미나 설명은 4,000자 이하로 입력해 주세요."),
  prerequisites: z
    .string()
    .trim()
    .max(2_000, "선수 지식은 2,000자 이하로 입력해 주세요."),
  duration: z
    .string()
    .trim()
    .min(1, "예상 소요 시간을 입력해 주세요.")
    .max(80, "예상 소요 시간은 80자 이하로 입력해 주세요."),
  preferredTiming: z
    .string()
    .refine(
      (v) =>
        v === "" || (SEMINAR_TIMING_OPTIONS as readonly string[]).includes(v),
      "선택지에 없는 시점입니다.",
    ),
  // A refine, not a union with the URL schema: a union swallows the length
  // issue and answers a generic "Invalid input".
  attachmentUrl: z
    .string()
    .trim()
    .max(2_048, "외부 첨부 URL은 2,048자 이하로 입력해 주세요.")
    .refine(
      (v) => v === "" || httpsUrl.safeParse(v).success,
      "올바른 HTTPS 주소를 입력해 주세요.",
    ),
  presenterIds: z
    .array(z.string().trim().min(1).max(64))
    .min(1, "발표자를 한 명 이상 선택해 주세요.")
    .max(
      SEMINAR_MAX_PRESENTERS,
      `발표자는 ${SEMINAR_MAX_PRESENTERS}명까지 선택할 수 있습니다.`,
    ),
});

export type SeminarRequestInput = z.infer<typeof seminarRequestInputSchema>;

export interface SeminarRequestFormValues {
  kind: SeminarKind | "";
  title: string;
  description: string;
  prerequisites: string;
  duration: string;
  preferredTiming: string;
  attachmentUrl: string;
  presenterIds: string[];
}

export interface SeminarRequestFormFailure {
  error: "VALIDATION_FAILED";
  issues: SeminarFormIssues;
  values: SeminarRequestFormValues;
}

/** The form posts the picked presenters as one comma-separated field. */
function parsePresenterIds(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * Reads SeminarRequestForm's fields. The wire names are the form's own:
 * `attachment` (→ attachmentUrl) and `speakerIds` (→ presenterIds).
 */
export function seminarRequestValuesFromFormData(
  formData: FormData,
): SeminarRequestFormValues {
  return {
    kind: formText(formData, "kind") as SeminarRequestFormValues["kind"],
    title: formText(formData, "title"),
    description: formText(formData, "description"),
    prerequisites: formText(formData, "prerequisites"),
    duration: formText(formData, "duration"),
    preferredTiming: formText(formData, "preferredTiming"),
    attachmentUrl: formText(formData, "attachment"),
    presenterIds: parsePresenterIds(formText(formData, "speakerIds")),
  };
}

export function seminarFormIssues(
  error: z.ZodError<SeminarRequestInput>,
): SeminarFormIssues {
  const issues: SeminarFormIssues = {};

  for (const issue of error.issues) {
    const path = issue.path[0];
    const field =
      typeof path === "string" &&
      [
        "kind",
        "title",
        "description",
        "prerequisites",
        "duration",
        "attachmentUrl",
        "presenterIds",
      ].includes(path)
        ? (path as SeminarRequestField)
        : "_form";

    issues[field] ??= issue.message;
  }

  return issues;
}

export function validateSeminarRequestForm(formData: FormData) {
  const values = seminarRequestValuesFromFormData(formData);
  const result = seminarRequestInputSchema.safeParse(values);

  if (result.success) return result;

  return {
    ...result,
    failure: {
      error: "VALIDATION_FAILED",
      issues: seminarFormIssues(result.error),
      values,
    } satisfies SeminarRequestFormFailure,
  };
}
