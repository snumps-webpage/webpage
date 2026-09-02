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
  phone: string;
  email: string;
}

export interface PublicExecutiveRoster {
  term: string;
  president: PublicExecutive | null;
  vicePresident: PublicExecutive | null;
}

export interface PublicMemberRecord {
  id: string;
  name: string;
  department: string;
  joinedAt: string | null;
  roles: MemberRoleAssignment[];
}

export interface PublicExecutiveHistoryEntry {
  id: string;
  name: string;
  department: string;
  term: string;
  title: "회장" | "부회장";
  contact: Pick<PublicExecutive, "phone" | "email"> | null;
}

export interface PublicExecutiveHistoryTerm {
  term: string;
  executives: PublicExecutiveHistoryEntry[];
}

export function projectPublicMembers(
  members: AdminMemberDetail[],
): PublicMemberRecord[] {
  return members
    .filter((member) => member.status !== "withdrawn")
    .map(({ id, name, department, joinedAt, roles }) => ({
      id,
      name,
      department,
      joinedAt,
      roles: [...roles].sort((a, b) => b.term.localeCompare(a.term, "ko-KR")),
    }))
    .sort((a, b) => {
      const joinedOrder = (a.joinedAt ?? "").localeCompare(b.joinedAt ?? "");
      return joinedOrder || a.name.localeCompare(b.name, "ko-KR");
    });
}

export function projectPublicExecutiveHistory(
  members: AdminMemberDetail[],
  currentTerm: string,
): PublicExecutiveHistoryTerm[] {
  const byTerm = new Map<string, PublicExecutiveHistoryEntry[]>();
  for (const member of members) {
    for (const role of member.roles) {
      if (role.title !== "회장" && role.title !== "부회장") continue;
      const contact =
        role.term === currentTerm && member.publicContact?.status === "granted"
          ? {
              phone: member.publicContact.phone,
              email: member.publicContact.email,
            }
          : null;
      const entries = byTerm.get(role.term) ?? [];
      entries.push({
        id: member.id,
        name: member.name,
        department: member.department,
        term: role.term,
        title: role.title,
        contact,
      });
      byTerm.set(role.term, entries);
    }
  }

  return [...byTerm.entries()]
    .sort(([termA], [termB]) => termB.localeCompare(termA, "ko-KR"))
    .map(([term, executives]) => ({
      term,
      executives: executives.sort((a, b) => {
        const titleOrder =
          a.title === b.title ? 0 : a.title === "회장" ? -1 : 1;
        return titleOrder || a.name.localeCompare(b.name, "ko-KR");
      }),
    }));
}

export type MemberAdminOperationResult =
  | {
      success: true;
      operation: "memberUpdated";
      member: Pick<
        AdminMemberDetail,
        "name" | "department" | "joinedAt" | "project"
      >;
    }
  | {
      success: true;
      operation: "statusUpdated";
      status: Exclude<MemberStatus, "withdrawn">;
      statusChangedAt: string;
      isAlumni: boolean;
    }
  | {
      success: true;
      operation: "alumniRevoked";
      isAlumni: false;
      alumniRevoked: true;
    }
  | {
      success: true;
      operation: "rolesUpdated";
      roles: MemberRoleAssignment[];
    }
  | {
      success: true;
      operation: "adminUpdated";
      isAdmin: boolean;
    }
  | {
      success: true;
      operation: "publicContactUpdated";
      publicContact: PublicContactState;
    }
  | {
      success: true;
      operation: "privateInfoUpdated";
      privateInfo: MemberPrivateInfo;
    }
  | {
      success: true;
      operation: "withdrawalHoldUpdated";
      withdrawal: MemberWithdrawal;
    };

const memberProjectSchema = z
  .object({
    title: z
      .string()
      .trim()
      .max(100, "프로젝트 제목은 100자 이하로 입력해 주세요."),
    url: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || URL.canParse(value),
        "프로젝트 URL을 확인해 주세요.",
      ),
  })
  .superRefine((project, context) => {
    if (!project.title && project.url) {
      context.addIssue({
        code: "custom",
        path: ["title"],
        message: "URL을 저장하려면 프로젝트 제목을 입력해 주세요.",
      });
    }
  });

export const memberRecordInputSchema = z
  .object({
    name: z.string().trim().min(1, "이름을 입력해 주세요.").max(60),
    department: z.string().trim().min(1, "학과를 입력해 주세요.").max(100),
    joinedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "가입일을 확인해 주세요.")
      .refine(
        (value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
        "가입일을 확인해 주세요.",
      ),
    projectTitle: z.string(),
    projectUrl: z.string(),
  })
  .transform((value, context) => {
    const parsedProject = memberProjectSchema.safeParse({
      title: value.projectTitle,
      url: value.projectUrl,
    });
    if (!parsedProject.success) {
      for (const issue of parsedProject.error.issues) {
        context.addIssue({
          ...issue,
          path: [issue.path[0] === "url" ? "projectUrl" : "projectTitle"],
        });
      }
      return z.NEVER;
    }
    const project = parsedProject.data.title
      ? {
          title: parsedProject.data.title,
          ...(parsedProject.data.url ? { url: parsedProject.data.url } : {}),
        }
      : null;
    return {
      name: value.name,
      department: value.department,
      joinedAt: value.joinedAt,
      project,
    };
  });

export const memberStatusInputSchema = z.object({
  status: z.enum(["associate", "regular"]),
});

export const alumniRevocationInputSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(4, "박탈 사유를 4자 이상 입력해 주세요.")
    .max(500, "박탈 사유는 500자 이하로 입력해 주세요."),
});

export const privateInfoInputSchema = z.object({
  email: z
    .email("올바른 이메일 주소를 입력해 주세요.")
    .refine(
      (email) => email.toLowerCase().endsWith("@snu.ac.kr"),
      "서울대학교 이메일(@snu.ac.kr)을 입력해 주세요.",
    ),
  phone: z
    .string()
    .trim()
    .regex(/^010-\d{4}-\d{4}$/, "전화번호는 010-XXXX-XXXX 형식이어야 합니다."),
  background: z
    .string()
    .trim()
    .max(2000, "배경지식은 2,000자 이하로 입력해 주세요."),
});

export const memberRoleSchema = z.object({
  term: z
    .string()
    .trim()
    .regex(
      /^\d{2}-(?:[12]|W|S)$/,
      "학기는 YY-1, YY-2, YY-W, YY-S 형식이어야 합니다.",
    ),
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
  phone: z
    .string()
    .trim()
    .regex(/^010-\d{4}-\d{4}$/, "전화번호는 010-XXXX-XXXX 형식이어야 합니다."),
  email: z.email("올바른 이메일 주소를 입력해 주세요."),
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

export function parseRolesJson(value: string) {
  try {
    return memberRolesSchema.safeParse(JSON.parse(value));
  } catch {
    return memberRolesSchema.safeParse(null);
  }
}
