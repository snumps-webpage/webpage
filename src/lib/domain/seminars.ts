import { z } from "zod/v4";

export const SEMINAR_KINDS = ["regular", "irregular"] as const;

export type SeminarKind = (typeof SEMINAR_KINDS)[number];

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
