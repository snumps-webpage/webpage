import type {
  AdminMemberDetail,
  AdminMemberListItem,
  MemberPrivateInfo,
  MemberProject,
  MemberRoleAssignment,
  MemberStatus,
  MemberWithdrawal,
  PublicContactState,
  PublicExecutive,
  PublicExecutiveRoster,
  PublicExecutiveHistoryTerm,
  PublicMemberRecord,
} from "$lib/domain/members";
import {
  projectPublicExecutiveHistory,
  projectPublicMembers,
} from "$lib/domain/members";
import {
  withdrawalGraceEndsAt,
  type AccountSettingsData,
} from "$lib/domain/account";
import type { DashboardProfile } from "$lib/domain/dashboard";
import type { AdminWithdrawalQueueItem } from "$lib/domain/admin-dashboard";
import { getSemesterInfo } from "$lib/utils";

const currentTerm = getSemesterInfo().key;

const members: AdminMemberDetail[] = [
  {
    id: "member-former-president",
    name: "정전회장",
    department: "수리과학부",
    joinedAt: "2022-03-02",
    status: "regular",
    statusChangedAt: "2023-03-01T10:00:00+09:00",
    isAlumni: true,
    alumniRevoked: false,
    withdrawal: null,
    roles: [
      { term: "25-1", title: "부회장" },
      { term: "25-2", title: "회장" },
    ],
    isAdmin: false,
    project: null,
    publicContactStatus: "revoked",
    publicContact: {
      status: "revoked",
      phone: null,
      email: null,
      changedAt: "2026-03-01T10:00:00+09:00",
      changedBy: "dev-admin",
    },
    privateInfo: {
      email: "former-president@snu.ac.kr",
      phone: "010-9999-0000",
      background: "대수기하학",
      mailPrefs: { announcements: true },
    },
  },
  {
    id: "member-president",
    name: "김회장",
    department: "수리과학부",
    joinedAt: "2023-03-02",
    status: "regular",
    statusChangedAt: "2024-09-01T09:00:00+09:00",
    isAlumni: true,
    alumniRevoked: false,
    withdrawal: null,
    roles: [
      { term: "25-2", title: "부회장" },
      { term: currentTerm, title: "회장" },
    ],
    isAdmin: true,
    project: {
      title: "SNUMPS 강의 노트",
      url: "https://example.com/snumps-notes",
    },
    publicContactStatus: "granted",
    publicContact: {
      status: "granted",
      phone: "010-2468-1357",
      email: "president@snumps.org",
      changedAt: "2026-08-20T13:00:00+09:00",
      changedBy: "dev-admin",
    },
    privateInfo: {
      email: "president@snu.ac.kr",
      phone: "010-2468-1357",
      background: "대수학, 수론",
      mailPrefs: { announcements: true },
    },
  },
  {
    id: "member-vice-president",
    name: "박부회장",
    department: "통계학과",
    joinedAt: "2024-03-04",
    status: "regular",
    statusChangedAt: "2025-03-02T12:00:00+09:00",
    isAlumni: true,
    alumniRevoked: false,
    withdrawal: null,
    roles: [{ term: currentTerm, title: "부회장" }],
    isAdmin: false,
    project: null,
    publicContactStatus: "granted",
    publicContact: {
      status: "granted",
      phone: "010-9753-8642",
      email: "vice-president@snumps.org",
      changedAt: "2026-08-21T10:30:00+09:00",
      changedBy: "dev-admin",
    },
    privateInfo: {
      email: "vice-president@snu.ac.kr",
      phone: "010-9753-8642",
      background: "확률론, 조합론",
      mailPrefs: { announcements: true },
    },
  },
  {
    id: "member-editor",
    name: "이편집",
    department: "수리과학부",
    joinedAt: "2025-03-05",
    status: "associate",
    statusChangedAt: "2025-03-05T10:00:00+09:00",
    isAlumni: false,
    alumniRevoked: false,
    withdrawal: null,
    roles: [{ term: "26-2", title: "학술부장" }],
    isAdmin: false,
    project: null,
    publicContactStatus: "unset",
    publicContact: null,
    privateInfo: {
      email: "editor@snu.ac.kr",
      phone: "010-1111-2222",
      background: "해석학",
      mailPrefs: { announcements: false },
    },
  },
  {
    id: "dev-member",
    name: "Dev Member",
    department: "수리과학부",
    joinedAt: "2025-09-01",
    status: "associate",
    statusChangedAt: "2025-09-01T09:00:00+09:00",
    isAlumni: false,
    alumniRevoked: false,
    withdrawal: null,
    roles: [],
    isAdmin: false,
    project: null,
    publicContactStatus: "unset",
    publicContact: null,
    privateInfo: {
      email: "dev-member@snu.ac.kr",
      phone: "010-1234-5678",
      background: "대수학, 해석학, 조합론",
      mailPrefs: { announcements: true },
    },
  },
  {
    id: "dev-admin",
    name: "Dev Admin",
    department: "수리과학부",
    joinedAt: "2024-09-02",
    status: "regular",
    statusChangedAt: "2025-09-01T09:00:00+09:00",
    isAlumni: true,
    alumniRevoked: false,
    withdrawal: null,
    roles: [],
    isAdmin: true,
    project: null,
    publicContactStatus: "revoked",
    publicContact: {
      status: "revoked",
      phone: null,
      email: null,
      changedAt: "2026-08-22T17:40:00+09:00",
      changedBy: "dev-admin",
    },
    privateInfo: {
      email: "dev-admin@snu.ac.kr",
      phone: "010-3333-4444",
      background: "웹 운영",
      mailPrefs: { announcements: true },
    },
  },
  {
    id: "member-withdrawing",
    name: "최탈퇴",
    department: "수리과학부",
    joinedAt: "2023-09-01",
    status: "withdrawn",
    statusChangedAt: "2026-08-25T14:20:00+09:00",
    isAlumni: true,
    alumniRevoked: false,
    withdrawal: {
      requestedAt: "2026-08-25T14:20:00+09:00",
      previousStatus: "regular",
      holdBy: null,
      holdAt: null,
    },
    roles: [{ term: "24-1", title: "총무" }],
    isAdmin: false,
    project: null,
    publicContactStatus: "revoked",
    publicContact: {
      status: "revoked",
      phone: null,
      email: null,
      changedAt: "2026-08-25T14:20:00+09:00",
      changedBy: "dev-admin",
    },
    privateInfo: {
      email: "withdrawing@snu.ac.kr",
      phone: "010-7777-8888",
      background: "위상수학",
      mailPrefs: { announcements: false },
    },
  },
];

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function getDevAdminMembers(): AdminMemberListItem[] {
  return clone(
    members.map((member) => ({
      id: member.id,
      name: member.name,
      department: member.department,
      joinedAt: member.joinedAt,
      status: member.status,
      statusChangedAt: member.statusChangedAt,
      isAlumni: member.isAlumni,
      alumniRevoked: member.alumniRevoked,
      roles: member.roles,
      isAdmin: member.isAdmin,
      publicContactStatus: member.publicContactStatus,
    })),
  );
}

export function getDevAdminMember(memberId: string) {
  const member = members.find((item) => item.id === memberId);
  return member ? clone(member) : null;
}

export function getDevAdminWithdrawalQueue(): AdminWithdrawalQueueItem[] {
  return clone(
    members
      .filter(
        (
          member,
        ): member is AdminMemberDetail & { withdrawal: MemberWithdrawal } =>
          member.status === "withdrawn" && member.withdrawal !== null,
      )
      .map((member) => ({
        memberId: member.id,
        name: member.name,
        requestedAt: member.withdrawal.requestedAt,
        graceEndsAt: withdrawalGraceEndsAt(member.withdrawal.requestedAt),
        holdBy: member.withdrawal.holdBy,
      }))
      .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)),
  );
}

function getDevSelfMember(role: "member" | "admin") {
  return members.find((member) =>
    role === "admin" ? member.id === "dev-admin" : member.id === "dev-member",
  );
}

export function getDevAccountSettings(
  role: "member" | "admin",
): AccountSettingsData | null {
  const member = getDevSelfMember(role);
  if (!member?.privateInfo) return null;
  return clone({
    memberId: member.id,
    name: member.name,
    email: member.privateInfo.email,
    status: member.status,
    announcementsEnabled: member.privateInfo.mailPrefs.announcements,
    withdrawal: member.withdrawal
      ? {
          requestedAt: member.withdrawal.requestedAt,
          graceEndsAt: withdrawalGraceEndsAt(member.withdrawal.requestedAt),
          holdBy: member.withdrawal.holdBy,
        }
      : null,
  });
}

export function getDevDashboardProfile(
  role: "member" | "admin",
): DashboardProfile | null {
  const member = getDevSelfMember(role);
  if (!member?.privateInfo) return null;
  return clone({
    name: member.name,
    department: member.department,
    email: member.privateInfo.email,
    phone: member.privateInfo.phone,
    background: member.privateInfo.background,
  });
}

export function updateDevDashboardProfile(
  role: "member" | "admin",
  input: Pick<DashboardProfile, "phone" | "background">,
) {
  const member = getDevSelfMember(role);
  if (!member?.privateInfo || member.status === "withdrawn") return null;
  member.privateInfo.phone = input.phone;
  member.privateInfo.background = input.background;
  return clone(input);
}

export function setDevAnnouncementPreference(
  role: "member" | "admin",
  enabled: boolean,
) {
  const member = getDevSelfMember(role);
  if (!member?.privateInfo || member.status === "withdrawn") return null;
  member.privateInfo.mailPrefs.announcements = enabled;
  return enabled;
}

export function requestDevMemberWithdrawal(role: "member" | "admin") {
  const member = getDevSelfMember(role);
  if (!member || member.status === "withdrawn") return null;
  const requestedAt = new Date().toISOString();
  member.withdrawal = {
    requestedAt,
    previousStatus: member.status,
    holdBy: null,
    holdAt: null,
  };
  member.status = "withdrawn";
  member.statusChangedAt = requestedAt;
  return getDevAccountSettings(role);
}

export function cancelDevMemberWithdrawal(role: "member" | "admin") {
  const member = getDevSelfMember(role);
  if (!member?.withdrawal || member.status !== "withdrawn") return null;
  member.status = member.withdrawal.previousStatus;
  member.statusChangedAt = new Date().toISOString();
  member.withdrawal = null;
  return getDevAccountSettings(role);
}

export function updateDevMemberRecord(
  memberId: string,
  input: {
    name: string;
    department: string;
    joinedAt: string;
    project: MemberProject | null;
  },
) {
  const member = members.find((item) => item.id === memberId);
  if (!member) return null;
  Object.assign(member, clone(input));
  return clone({
    name: member.name,
    department: member.department,
    joinedAt: member.joinedAt,
    project: member.project,
  });
}

export function setDevMemberStatus(
  memberId: string,
  status: Exclude<MemberStatus, "withdrawn">,
) {
  const member = members.find((item) => item.id === memberId);
  if (!member || member.status === "withdrawn") return null;
  member.status = status;
  member.statusChangedAt = new Date().toISOString();
  if (status === "regular" && !member.alumniRevoked) member.isAlumni = true;
  return clone({
    status,
    statusChangedAt: member.statusChangedAt,
    isAlumni: member.isAlumni,
  });
}

export function revokeDevMemberAlumni(memberId: string) {
  const member = members.find((item) => item.id === memberId);
  if (!member || !member.isAlumni) return false;
  member.isAlumni = false;
  member.alumniRevoked = true;
  return true;
}

export function setDevMemberRoles(
  memberId: string,
  roles: MemberRoleAssignment[],
) {
  const member = members.find((item) => item.id === memberId);
  if (!member) return null;
  member.roles = clone(roles);
  return clone(member.roles);
}

export function setDevMemberAdmin(memberId: string, isAdmin: boolean) {
  const member = members.find((item) => item.id === memberId);
  if (!member || memberId === "dev-admin") return false;
  member.isAdmin = isAdmin;
  return true;
}

export function setDevMemberPublicContact(
  memberId: string,
  contact: Pick<PublicContactState, "status" | "phone" | "email">,
) {
  const member = members.find((item) => item.id === memberId);
  if (!member) return null;
  const publicContact: PublicContactState = {
    ...contact,
    changedAt: new Date().toISOString(),
    changedBy: "dev-admin",
  } as PublicContactState;
  member.publicContact = publicContact;
  member.publicContactStatus = publicContact.status;
  return clone(publicContact);
}

export function updateDevMemberPrivateInfo(
  memberId: string,
  privateInfo: Omit<MemberPrivateInfo, "mailPrefs">,
) {
  const member = members.find((item) => item.id === memberId);
  if (!member || !member.privateInfo) return { status: "not_found" as const };
  const duplicate = members.some(
    (item) =>
      item.id !== memberId &&
      item.privateInfo?.email.toLowerCase() === privateInfo.email.toLowerCase(),
  );
  if (duplicate) return { status: "conflict" as const };
  member.privateInfo = {
    ...clone(privateInfo),
    mailPrefs: member.privateInfo.mailPrefs,
  };
  return { status: "updated" as const, privateInfo: clone(member.privateInfo) };
}

export function setDevWithdrawalHold(memberId: string, hold: boolean) {
  const member = members.find((item) => item.id === memberId);
  if (!member?.withdrawal || member.status !== "withdrawn") return null;
  const now = new Date().toISOString();
  const withdrawal: MemberWithdrawal = hold
    ? { ...member.withdrawal, holdBy: "dev-admin", holdAt: now }
    : {
        ...member.withdrawal,
        requestedAt: now,
        holdBy: null,
        holdAt: null,
      };
  member.withdrawal = withdrawal;
  return clone(withdrawal);
}

function publicExecutive(
  member: AdminMemberDetail | undefined,
  title: PublicExecutive["title"],
): PublicExecutive | null {
  if (!member || member.publicContact?.status !== "granted") return null;
  return {
    id: member.id,
    name: member.name,
    title,
    phone: member.publicContact.phone,
    email: member.publicContact.email,
  };
}

export function getDevPublicExecutives(
  term = currentTerm,
): PublicExecutiveRoster {
  const president = members.find((member) =>
    member.roles.some((role) => role.term === term && role.title === "회장"),
  );
  const vicePresident = members.find((member) =>
    member.roles.some((role) => role.term === term && role.title === "부회장"),
  );
  return {
    term,
    president: publicExecutive(president, "회장"),
    vicePresident: publicExecutive(vicePresident, "부회장"),
  };
}

export function getDevPublicMembers(): PublicMemberRecord[] {
  return clone(projectPublicMembers(members));
}

export function getDevPublicExecutiveHistory(): PublicExecutiveHistoryTerm[] {
  return clone(projectPublicExecutiveHistory(members, currentTerm));
}
