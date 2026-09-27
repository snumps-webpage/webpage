import { z } from "zod/v4";

export const MEMBER_STATUSES = ["associate", "regular", "withdrawn"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export interface MemberRoleAssignment {
  term: string;
  title: string;
}

export interface MemberProject {
  title: string;
  url?: string;
}

export interface MemberWithdrawal {
  requestedAt: string;
  previousStatus: Exclude<MemberStatus, "withdrawn">;
  holdBy: string | null;
  holdAt: string | null;
}

export interface MemberPrivateInfo {
  email: string;
  phone: string;
  background: string;
  mailPrefs: {
    announcements: boolean;
  };
}

export type PublicContactState =
  | {
      status: "granted";
      phone: string;
      email: string;
      changedAt: string;
      changedBy: string;
    }
  | {
      status: "revoked";
      phone: null;
      email: null;
      changedAt: string;
      changedBy: string;
    };

export interface AdminMemberListItem {
  id: string;
  name: string;
  department: string;
  joinedAt: string | null;
  status: MemberStatus;
  statusChangedAt: string;
  isAlumni: boolean;
  alumniRevoked: boolean;
  roles: MemberRoleAssignment[];
  isAdmin: boolean;
  publicContactStatus: PublicContactState["status"] | "unset";
}

export interface AdminMemberDetail extends AdminMemberListItem {
  withdrawal: MemberWithdrawal | null;
  project: MemberProject | null;
  publicContact: PublicContactState | null;
  privateInfo: MemberPrivateInfo | null;
}

export interface PublicExecutive {
  id: string;
  name: string;
  title: "회장" | "부회장";
  /** null when not public */
  phone: string | null;
  email: string | null;
}

export interface PublicExecutiveRoster {
  term: string;
  president: PublicExecutive | null;
  vicePresident: PublicExecutive | null;
}

/*
 * Member administration input — the single source of the rules. The
 * /admin/members/[id] actions validate with these and answer
 * {error: VALIDATION_FAILED, issues: fieldIssues(…), values}.
 */

const PHONE_MESSAGE = "전화번호는 010-XXXX-XXXX 형식이어야 합니다.";

const phoneSchema = z
  .string()
  .trim()
  .regex(/^010-\d{4}-\d{4}$/, PHONE_MESSAGE);

/** Trimmed before the format check, so a pasted trailing space is not "invalid". */
const emailSchema = z
  .string()
  .trim()
  .max(200, "이메일은 200자 이하로 입력해 주세요.")
  .pipe(z.email("올바른 이메일 주소를 입력해 주세요."));

export const memberRecordInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "이름을 입력해 주세요.")
      .max(60, "이름은 60자 이하로 입력해 주세요."),
    department: z
      .string()
      .trim()
      .min(1, "학과를 입력해 주세요.")
      .max(100, "학과는 100자 이하로 입력해 주세요."),
    joinedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "가입일을 확인해 주세요.")
      .refine(
        (value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
        "가입일을 확인해 주세요.",
      ),
    projectTitle: z
      .string()
      .trim()
      .max(100, "프로젝트 제목은 100자 이하로 입력해 주세요."),
    // Rendered as a public link: http(s) only, never javascript: and friends.
    projectUrl: z
      .string()
      .trim()
      .max(200, "프로젝트 URL은 200자 이하로 입력해 주세요.")
      .refine(
        (value) =>
          value === "" || (/^https?:\/\//i.test(value) && URL.canParse(value)),
        "프로젝트 URL을 확인해 주세요.",
      ),
  })
  .superRefine((value, context) => {
    if (!value.projectTitle && value.projectUrl) {
      context.addIssue({
        code: "custom",
        path: ["projectTitle"],
        message: "URL을 저장하려면 프로젝트 제목을 입력해 주세요.",
      });
    }
  })
  .transform(({ projectTitle, projectUrl, ...record }) => ({
    ...record,
    project: projectTitle
      ? { title: projectTitle, ...(projectUrl ? { url: projectUrl } : {}) }
      : null,
  }));

export const memberStatusInputSchema = z.object({
  status: z.enum(["associate", "regular"], {
    message: "회원 지위를 확인해 주세요.",
  }),
});

/** The ?/setAdmin toggle posts "true" or "false"; anything else is refused, not read as a revocation. */
export const memberAdminInputSchema = z.object({
  isAdmin: z
    .enum(["true", "false"], { message: "관리자 권한 값을 확인해 주세요." })
    .transform((value) => value === "true"),
});

export const alumniRevocationInputSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(4, "박탈 사유를 4자 이상 입력해 주세요.")
    .max(500, "박탈 사유는 500자 이하로 입력해 주세요."),
});

export const privateInfoInputSchema = z.object({
  // The login key: only SNU Workspace addresses can sign in.
  email: emailSchema.refine(
    (email) => email.toLowerCase().endsWith("@snu.ac.kr"),
    "서울대학교 이메일(@snu.ac.kr)을 입력해 주세요.",
  ),
  phone: phoneSchema,
  background: z
    .string()
    .trim()
    .max(2000, "배경지식은 2,000자 이하로 입력해 주세요."),
});

/** A blank field reads as "not given" (undefined) instead of failing. */
function blankAsMissing<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    schema.optional(),
  );
}

/**
 * The admin edit of a private-info row. Legacy rows may hold no email or
 * phone, so a blank email/phone keeps the stored value; anything typed must
 * pass the full rule.
 */
export const privateInfoUpdateSchema = z.object({
  email: blankAsMissing(privateInfoInputSchema.shape.email),
  phone: blankAsMissing(privateInfoInputSchema.shape.phone),
  background: privateInfoInputSchema.shape.background,
});

export const memberRoleSchema = z.object({
  // Mirrors TERM_PATTERN ($lib/server/core/semester), the stored Term: roles
  // belong to regular terms only, never the YY-W/YY-S vacation terms.
  term: z
    .string()
    .trim()
    .regex(/^\d{2}-[12]$/, "학기는 YY-1 또는 YY-2 형식이어야 합니다."),
  title: z
    .string()
    .trim()
    .min(1, "직책을 입력해 주세요.")
    .max(40, "직책은 40자 이하로 입력해 주세요."),
});

export const memberRolesSchema = z
  .array(memberRoleSchema)
  .max(30, "직책은 최대 30개까지 저장할 수 있습니다.")
  .superRefine((roles, context) => {
    const seen = new Set<string>();
    for (const [index, role] of roles.entries()) {
      const key = `${role.term}:${role.title}`;
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: "같은 학기와 직책을 중복해서 저장할 수 없습니다.",
        });
      }
      seen.add(key);
    }
  });

const grantedPublicContactSchema = z.object({
  status: z.literal("granted"),
  phone: phoneSchema,
  email: emailSchema,
});

const revokedPublicContactSchema = z.object({
  status: z.literal("revoked"),
  phone: z.null(),
  email: z.null(),
});

export const publicContactInputSchema = z.discriminatedUnion("status", [
  grantedPublicContactSchema,
  revokedPublicContactSchema,
]);

export type PublicContactInput = z.input<typeof publicContactInputSchema>;

/**
 * The stored members.publicContact is ONE nullable string joined as
 * "phone · email" (executive-roster.ts), and that is what the forms post.
 * Empty means revoked; anything else is a grant to validate as such.
 */
export function splitPublicContact(value: string): PublicContactInput {
  if (!value.trim()) return { status: "revoked", phone: null, email: null };
  const separator = value.indexOf("·");
  const phone = separator === -1 ? value : value.slice(0, separator);
  const email = separator === -1 ? "" : value.slice(separator + 1);
  return { status: "granted", phone: phone.trim(), email: email.trim() };
}

/** The stored form of a validated contact: "phone · email", or null. */
export function joinPublicContact(
  contact: z.output<typeof publicContactInputSchema>,
): string | null {
  return contact.status === "granted"
    ? `${contact.phone} · ${contact.email}`
    : null;
}

export function parseRolesJson(value: string) {
  try {
    return memberRolesSchema.safeParse(JSON.parse(value));
  } catch {
    return memberRolesSchema.safeParse(null);
  }
}

/** The ?/setRoles wire format: one "26-2 회장" role per line, blank lines ignored. */
export function parseRoleLines(value: string) {
  const roles = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const space = line.indexOf(" ");
      return space === -1
        ? { term: line, title: "" }
        : { term: line.slice(0, space), title: line.slice(space + 1) };
    });
  return memberRolesSchema.safeParse(roles);
}

/** The roles form has one field: its issue names the offending line. */
export function memberRolesIssues(error: z.ZodError) {
  const [issue] = error.issues;
  const line = issue?.path[0];
  return {
    roles:
      typeof line === "number"
        ? `${line + 1}번째 직책: ${issue.message}`
        : (issue?.message ?? "직책을 확인해 주세요."),
  };
}
