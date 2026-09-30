import { z } from "zod/v4";
import { formText } from "$lib/domain/form-data";

/**
 * 역대 회장단 공개 프로필 — 회장·부회장을 지낸 사람이 역대 회장단 페이지에
 * 무엇을 내보일지 필드마다 고른다. 필드의 출처는 셋이다: 비공개, 회원 정보
 * 사용(연동 — 공개 시점에 회원 DB를 읽는다), 직접 입력. 근황은 회원 DB에
 * 원천이 없으므로 비공개와 직접 입력뿐이다.
 */

/** 공개 회장단 직위 — 역대 회장단 페이지와 프로필 자격이 같은 목록을 본다. 순서가 곧 노출 순서다. */
export const PUBLIC_EXECUTIVE_TITLES = ["회장", "부회장"] as const;

export const PROFILE_FIELDS = ["department", "cohort", "email", "bio"] as const;
export type ProfileFieldKey = (typeof PROFILE_FIELDS)[number];

export const PROFILE_SOURCES = ["hidden", "member", "custom"] as const;
export type ProfileSource = (typeof PROFILE_SOURCES)[number];

export type ProfileFieldSetting =
  | { source: "hidden" }
  | { source: "member" }
  | { source: "custom"; value: string };
export type BioSetting =
  { source: "hidden" } | { source: "custom"; value: string };

export interface ExecutiveProfileSettings {
  department: ProfileFieldSetting;
  cohort: ProfileFieldSetting;
  email: ProfileFieldSetting;
  bio: BioSetting;
}

/** 행이 없는 사람의 설정 — 아무것도 공개하지 않는다(opt-in). */
export const HIDDEN_PROFILE: Readonly<ExecutiveProfileSettings> =
  Object.freeze<ExecutiveProfileSettings>({
    department: { source: "hidden" },
    cohort: { source: "hidden" },
    email: { source: "hidden" },
    bio: { source: "hidden" },
  });

export const PROFILE_FIELD_LABELS: Record<ProfileFieldKey, string> = {
  department: "학과",
  cohort: "학번",
  email: "이메일",
  bio: "근황",
};

/** 회원 DB에 원천이 있는 필드 — "회원 정보 사용"을 고를 수 있다. */
export const LINKABLE_FIELDS: Readonly<Record<ProfileFieldKey, boolean>> = {
  department: true,
  cohort: true,
  email: true,
  bio: false,
};

/**
 * 공개 페이로드의 프로필. 이메일 키가 `publicEmail`인 것은 의도다 — 공개
 * 응답 감사(BE-64)는 `"email"` 키를 금지 키로 본다. 학번은 입학년도 두
 * 자리만 싣는다; 원본 학번은 어떤 공개 응답에도 나가지 않는다.
 */
export interface PublicExecutiveProfile {
  department: string | null;
  cohort: string | null;
  publicEmail: string | null;
  bio: string | null;
}

/** "2018-12345" → "18". 연도를 읽을 수 없으면 null — 그 필드는 공개하지 않는다. */
export function cohortFromStudentId(studentId: string): string | null {
  const match = /^\s*(?:19|20)(\d{2})/.exec(studentId);
  return match ? match[1] : null;
}

export const cohortLabel = (cohort: string) => `${cohort}학번`;

const INVISIBLES = /[\u00AD\u200B-\u200D\uFEFF\u2060]/g;
const clean = (text: string) => text.replace(INVISIBLES, "").trim();

const CUSTOM_VALUE: Record<ProfileFieldKey, z.ZodType<string>> = {
  department: z
    .string()
    .min(1, "학과를 입력해 주세요.")
    .max(40, "학과는 40자 이내로 입력해 주세요."),
  cohort: z
    .string()
    .regex(/^\d{2}$/, "입학년도 두 자리(예: 18)를 입력해 주세요."),
  email: z
    .string()
    .min(1, "이메일을 입력해 주세요.")
    .max(100, "이메일은 100자 이내로 입력해 주세요.")
    .pipe(z.email("이메일 형식이 아닙니다.")),
  bio: z
    .string()
    .min(1, "근황을 입력해 주세요.")
    .max(200, "근황은 200자 이내로 입력해 주세요."),
};

type SubmittedValues = Record<
  ProfileFieldKey,
  { source: string; value: string }
>;

// A type, not an interface: `fail()` data must be assignable to
// Record<string, unknown>, which an interface (no index signature) is not.
export type ExecutiveProfileFormFailure = {
  error: "VALIDATION_FAILED";
  issues: Partial<Record<ProfileFieldKey, string>>;
  values: SubmittedValues;
};

/**
 * 폼 규칙의 단일 원천 — 본인 설정과 관리자 대리 편집이 같이 쓴다. 필드는
 * `<field>.source`와 `<field>.value`로 온다. 직접 입력이 비면 거부한다:
 * 숨기려면 비공개를 고르면 되고, 빈 칸을 공개할 이유는 없다.
 */
export function parseExecutiveProfileForm(
  formData: FormData,
):
  | { success: true; data: ExecutiveProfileSettings }
  | { success: false; failure: ExecutiveProfileFormFailure } {
  const values = Object.fromEntries(
    PROFILE_FIELDS.map((field) => [
      field,
      {
        source: formText(formData, `${field}.source`),
        value: clean(formText(formData, `${field}.value`)),
      },
    ]),
  ) as SubmittedValues;

  const issues: ExecutiveProfileFormFailure["issues"] = {};
  const data: Partial<Record<ProfileFieldKey, ProfileFieldSetting>> = {};
  for (const field of PROFILE_FIELDS) {
    const { source, value } = values[field];
    const allowed =
      source === "hidden" ||
      source === "custom" ||
      (source === "member" && LINKABLE_FIELDS[field]);
    if (!allowed) {
      issues[field] = "공개 방식을 골라 주세요.";
      continue;
    }
    if (source !== "custom") {
      data[field] = { source };
      continue;
    }
    const parsed = CUSTOM_VALUE[field].safeParse(value);
    if (parsed.success) data[field] = { source, value: parsed.data };
    else issues[field] = parsed.error.issues[0].message;
  }

  if (Object.keys(issues).length > 0) {
    return {
      success: false,
      failure: { error: "VALIDATION_FAILED", issues, values },
    };
  }
  return { success: true, data: data as ExecutiveProfileSettings };
}
