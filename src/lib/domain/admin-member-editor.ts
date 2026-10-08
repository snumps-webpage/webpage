import type { AdminMemberDetail } from "./members";
import { adminActionErrorMessage } from "./admin-dashboard";

export type AdminMemberOperation =
  | "memberUpdated"
  | "statusUpdated"
  | "alumniRevoked"
  | "privateInfoUpdated"
  | "withdrawalHoldUpdated"
  | "rolesUpdated"
  | "adminUpdated";

export interface AdminMemberActionState {
  operation?: AdminMemberOperation;
  memberId?: string;
  success?: boolean;
  error?: string;
  message?: string;
  issues?: Record<string, string>;
  values?: Record<string, string>;
}

export function scopedMemberAction(
  state: AdminMemberActionState | null | undefined,
  memberId: string,
) {
  return state?.memberId === memberId ? state : null;
}

export function memberRolesText(member: AdminMemberDetail) {
  return member.roles.map((role) => `${role.term} ${role.title}`).join("\n");
}

export function memberRecordDraft(member: AdminMemberDetail) {
  return {
    name: member.name,
    department: member.department,
    joinedAt: member.joinedAt ?? "",
    projectTitle: member.project?.title ?? "",
    projectUrl: member.project?.url ?? "",
    status: member.status === "regular" ? "regular" : "associate",
    reason: "",
    email: member.privateInfo?.email ?? "",
    phone: member.privateInfo?.phone ?? "",
    background: member.privateInfo?.background ?? "",
  };
}

const SECTION_FIELDS = {
  memberUpdated: [
    "name",
    "department",
    "joinedAt",
    "projectTitle",
    "projectUrl",
  ],
  statusUpdated: ["status"],
  alumniRevoked: ["reason"],
  privateInfoUpdated: ["email", "phone", "background"],
} as const;

/** Only the submitted section changes. Other open drafts survive reloads. */
export function applyMemberSectionResult(
  draft: ReturnType<typeof memberRecordDraft>,
  member: AdminMemberDetail,
  state: AdminMemberActionState | null | undefined,
) {
  const scoped = scopedMemberAction(state, member.id);
  if (!scoped?.operation || !(scoped.operation in SECTION_FIELDS)) return draft;
  const fields =
    SECTION_FIELDS[scoped.operation as keyof typeof SECTION_FIELDS];
  const saved = memberRecordDraft(member);
  const next = { ...draft };
  for (const field of fields) {
    if (scoped.success) next[field] = saved[field];
    else if (scoped.values && typeof scoped.values[field] === "string") {
      next[field] = scoped.values[field];
    }
  }
  return next;
}

export function memberAdminNotice(
  state: AdminMemberActionState | null | undefined,
  member: AdminMemberDetail,
) {
  const scoped = scopedMemberAction(state, member.id);
  if (!scoped?.operation) return null;
  if (scoped.error) {
    return {
      tone: "error" as const,
      message:
        scoped.error === "SERVICE_UNAVAILABLE"
          ? "저장 결과를 확인하지 못했습니다. 상태가 바뀌었을 수 있으니 새로고침해 확인한 뒤 다시 시도해 주세요."
          : adminActionErrorMessage(
              scoped,
              "변경 사항을 저장하지 못했습니다. 현재 상태를 확인해 주세요.",
            ),
    };
  }
  if (!scoped.success) return null;
  const messages: Record<AdminMemberOperation, string> = {
    memberUpdated: "회원 기본정보를 저장했습니다.",
    statusUpdated: `회원 지위를 ${member.status === "regular" ? "정회원" : "준회원"}으로 변경했습니다.`,
    alumniRevoked: "동문 지위를 박탈하고 감사 기록을 남겼습니다.",
    privateInfoUpdated: "비공개 회원 정보를 저장하고 감사 기록을 남겼습니다.",
    withdrawalHoldUpdated: member.withdrawal?.holdBy
      ? "탈퇴 정보를 보존 필요 상태로 표시했습니다."
      : "보존 필요 표시를 해제했습니다. 오늘부터 1개월 유예를 다시 계산합니다.",
    rolesUpdated: "학기별 직책을 저장하고 감사 기록을 남겼습니다.",
    adminUpdated: `관리자 권한을 ${member.isAdmin ? "부여" : "회수"}했습니다.`,
  };
  return { tone: "success" as const, message: messages[scoped.operation] };
}
