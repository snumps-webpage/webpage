import { z } from "zod/v4";

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
    ...monthsForTerm(term).flatMap((m) => TIMING_SEGMENTS.map((s) => `${m}월 ${s}`)),
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

export type SeminarRequestStatus =
  "pending" | "approved" | "rejected" | "withdrawn";

export interface MemberPickerItem {
  id: string;
  name: string;
  department: string;
}

export interface SeminarRequestItem extends SeminarRequestInput {
  id: string;
  requesterId: string;
  status: SeminarRequestStatus;
  submittedAt: string;
  canEdit: boolean;
  canWithdraw: boolean;
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

const httpsUrl = z.url({
  protocol: /^https$/,
  error: "올바른 HTTPS 주소를 입력해 주세요.",
});

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
      (v) => v === "" || (SEMINAR_TIMING_OPTIONS as readonly string[]).includes(v),
      "선택지에 없는 시점입니다.",
    ),
  attachmentUrl: z.union([z.literal(""), httpsUrl]),
  presenterIds: z
    .array(z.string().trim().min(1))
    .min(1, "발표자를 한 명 이상 선택해 주세요."),
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

function parsePresenterIds(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || value.trim() === "") return [];

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function seminarRequestValuesFromFormData(
  formData: FormData,
): SeminarRequestFormValues {
  const value = (name: string) => {
    const entry = formData.get(name);
    return typeof entry === "string" ? entry : "";
  };

  return {
    kind: value("kind") as SeminarRequestFormValues["kind"],
    title: value("title"),
    description: value("description"),
    prerequisites: value("prerequisites"),
    duration: value("duration"),
    preferredTiming: value("preferredTiming"),
    attachmentUrl: value("attachmentUrl"),
    presenterIds: parsePresenterIds(formData.get("presenterIds")),
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
