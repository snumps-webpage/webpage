import {
  cohortFromStudentId,
  HIDDEN_PROFILE,
  PROFILE_FIELDS,
  PUBLIC_EXECUTIVE_TITLES,
  type ExecutiveProfileSettings,
  type PublicExecutiveProfile,
} from "$lib/domain/executive-profile";
import { compareSemesters } from "$lib/domain/semester-order";
import { AppError } from "$lib/server/core/errors";
import { newId } from "$lib/server/core/id";
import { nowKstIso } from "$lib/server/core/time";
import { audit } from "$lib/server/data/audit";
import type {
  ExecutiveProfile,
  Member,
  MemberRole,
  PrivateInfo,
} from "$lib/server/data/schemas";
import { getTable, mutate } from "$lib/server/data/tables";

/**
 * 역대 회장단 공개 프로필 — 누가 편집할 수 있는지, 무엇이 공개되는지.
 *
 * 사람은 명부 id로 부른다: 운영 회원은 운영 id(재가입자는 legacy id로 불러도
 * 운영 행으로 풀린다), 재가입하지 않은 옛 회원은 legacy id. 자격은 회장·부회장
 * 이력이다. 연동(`member`) 필드는 공개 시점에 회원 DB를 읽는다 — 저장된 값이
 * 없으므로 회원 정보가 바뀌면 공개 프로필도 바로 바뀐다.
 */

interface Sources {
  members: readonly Member[];
  legacyMembers: readonly Member[];
  infos: readonly PrivateInfo[];
  legacyInfos: readonly PrivateInfo[];
  profiles: readonly ExecutiveProfile[];
}

async function loadSources(): Promise<Sources> {
  const [members, legacyMembers, infos, legacyInfos, profiles] =
    await Promise.all([
      getTable("members"),
      getTable("legacy-members"),
      getTable("private-info"),
      getTable("legacy-private-info"),
      getTable("executive-profiles"),
    ]);
  return { members, legacyMembers, infos, legacyInfos, profiles };
}

interface Person {
  member: Member;
  /** 재가입자의 옛 행 — 역할 이력을 합쳐 본다. */
  legacyRow: Member | null;
  legacyOnly: boolean;
}

function resolvePerson(id: string, s: Sources): Person | null {
  const current = s.members.find((m) => m.id === id || m.legacyMemberId === id);
  if (current) {
    const legacyRow =
      s.legacyMembers.find((l) => l.id === current.legacyMemberId) ?? null;
    return { member: current, legacyRow, legacyOnly: false };
  }
  const legacy = s.legacyMembers.find((l) => l.id === id);
  return legacy ? { member: legacy, legacyRow: null, legacyOnly: true } : null;
}

const isPublicExecutive = (r: MemberRole) =>
  (PUBLIC_EXECUTIVE_TITLES as readonly string[]).includes(r.title);

/** 회장·부회장 이력, 최근 학기 먼저. 재가입 때 옮겨 온 역할은 한 번만 센다. */
function executiveRoles(p: Person): MemberRole[] {
  const seen = new Set<string>();
  return [...p.member.roles, ...(p.legacyRow?.roles ?? [])]
    .filter(isPublicExecutive)
    .filter((r) => {
      const key = `${r.term}|${r.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => compareSemesters(b.term, a.term));
}

function requireEligible(id: string, s: Sources): Person {
  const person = resolvePerson(id, s);
  if (!person) {
    throw new AppError("NOT_FOUND", {
      userMessage: "회원을 찾을 수 없습니다.",
    });
  }
  if (executiveRoles(person).length === 0) {
    throw new AppError("FORBIDDEN", {
      userMessage:
        "회장·부회장 이력이 있는 회원만 공개 프로필을 둘 수 있습니다.",
    });
  }
  return person;
}

/** 운영 id의 행이 우선, 없으면 재가입 전 legacy id로 적어 둔 행. */
function profileRowFor(
  member: Member,
  profiles: readonly ExecutiveProfile[],
): ExecutiveProfile | undefined {
  return (
    profiles.find((r) => r.memberId === member.id) ??
    (member.legacyMemberId
      ? profiles.find((r) => r.memberId === member.legacyMemberId)
      : undefined)
  );
}

function settingsOf(
  row: ExecutiveProfile | undefined,
): ExecutiveProfileSettings {
  if (!row) return structuredClone(HIDDEN_PROFILE) as ExecutiveProfileSettings;
  const { department, cohort, email, bio } = row;
  return structuredClone({ department, cohort, email, bio });
}

export interface LinkedValues {
  department: string | null;
  /** 입학년도 두 자리 ("18") — 원본 학번은 여기서 끝난다. */
  cohort: string | null;
  email: string | null;
}

/**
 * 연동 원천 — 전화번호 공개와 같은 순서로 읽는다: 운영 private-info, 없으면
 * legacy(재가입 전 아카이브, 또는 legacy 전용 사람의 행).
 */
function linkedResolver(s: Sources): (member: Member) => LinkedValues {
  const infoBy = new Map(s.infos.map((i) => [i.memberId, i]));
  const legacyInfoBy = new Map(s.legacyInfos.map((i) => [i.memberId, i]));
  return (member) => {
    const own = infoBy.get(member.id) ?? legacyInfoBy.get(member.id);
    const archived = member.legacyMemberId
      ? legacyInfoBy.get(member.legacyMemberId)
      : undefined;
    return {
      department: member.department.trim() || null,
      cohort: cohortFromStudentId(own?.studentId || archived?.studentId || ""),
      email: own?.email || archived?.email || null,
    };
  };
}

/**
 * 공개 프로필 해석기 — 역대 회장단 페이지 로드가 명부 행마다 부른다.
 * 행이 없거나, 탈퇴했거나, 공개할 값이 하나도 없으면 null.
 */
export async function publicProfileResolver(): Promise<
  (member: Member) => PublicExecutiveProfile | null
> {
  const s = await loadSources();
  const linked = linkedResolver(s);
  return (member) => {
    if (member.status === "withdrawn") return null;
    const row = profileRowFor(member, s.profiles);
    if (!row) return null;
    const source = linked(member);
    const pick = (field: "department" | "cohort" | "email") => {
      const setting = row[field];
      if (setting.source === "custom") return setting.value;
      return setting.source === "member" ? source[field] : null;
    };
    const profile: PublicExecutiveProfile = {
      department: pick("department"),
      cohort: pick("cohort"),
      publicEmail: pick("email"),
      bio: row.bio.source === "custom" ? row.bio.value : null,
    };
    return Object.values(profile).some((v) => v !== null) ? profile : null;
  };
}

/** 회원 설정에 "공개 프로필" 탭을 보일지 — 편집 자격과 같은 규칙. */
export async function hasExecutiveHistory(id: string): Promise<boolean> {
  const person = resolvePerson(id, await loadSources());
  return !!person && executiveRoles(person).length > 0;
}

export interface ProfileEditor {
  memberId: string;
  name: string;
  roles: MemberRole[];
  legacyOnly: boolean;
  settings: ExecutiveProfileSettings;
  linked: LinkedValues;
}

/** 편집기 한 화면 — 자격 확인, 현재 설정, 연동 미리보기. */
export async function getProfileEditor(id: string): Promise<ProfileEditor> {
  const s = await loadSources();
  const person = requireEligible(id, s);
  return {
    memberId: person.member.id,
    name: person.member.name,
    roles: executiveRoles(person),
    legacyOnly: person.legacyOnly,
    settings: settingsOf(profileRowFor(person.member, s.profiles)),
    linked: linkedResolver(s)(person.member),
  };
}

/**
 * 저장 — 사람당 한 행. legacy id로 적힌 행이 있으면 그 행을 운영 id로 옮겨
 * 적는다. 감사 기록에는 필드별 출처만 남기고 값은 남기지 않는다(audit.ts).
 */
export async function saveExecutiveProfile(
  id: string,
  settings: ExecutiveProfileSettings,
  actor: { actorId: string; byAdmin: boolean },
): Promise<void> {
  const person = requireEligible(id, await loadSources());
  const member = person.member;
  const ids = new Set(
    [member.id, member.legacyMemberId].filter((v): v is string => !!v),
  );
  await mutate("executive-profiles", (rows) => {
    const existing = profileRowFor(member, rows);
    const next: ExecutiveProfile = {
      id: existing?.id ?? newId(),
      memberId: member.id,
      ...structuredClone(settings),
      updatedAt: nowKstIso(),
      updatedBy: actor.actorId,
    };
    return [...rows.filter((r) => !ids.has(r.memberId)), next];
  });
  await audit({
    actorMemberId: actor.actorId,
    action: "executive-profile.update",
    targetTable: "executive-profiles",
    targetId: member.id,
    detail: {
      byAdmin: actor.byAdmin,
      sources: Object.fromEntries(
        PROFILE_FIELDS.map((f) => [f, settings[f].source]),
      ),
    },
  });
}

export interface ProfileCandidate {
  id: string;
  name: string;
  roles: MemberRole[];
  hasProfile: boolean;
  legacyOnly: boolean;
}

/** 관리자 목록 — 역대 회장·부회장 전원, 최근 학기 먼저. */
export async function listExecutiveProfileCandidates(): Promise<
  ProfileCandidate[]
> {
  const s = await loadSources();
  const shadowed = new Set(s.members.map((m) => m.legacyMemberId));
  const people = [
    ...s.members.map((m) => resolvePerson(m.id, s)!),
    ...s.legacyMembers
      .filter((l) => !shadowed.has(l.id))
      .map((l) => ({ member: l, legacyRow: null, legacyOnly: true })),
  ];
  return people
    .map((p) => ({
      id: p.member.id,
      name: p.member.name,
      roles: executiveRoles(p),
      hasProfile: !!profileRowFor(p.member, s.profiles),
      legacyOnly: p.legacyOnly,
    }))
    .filter((c) => c.roles.length > 0)
    .sort(
      (a, b) =>
        compareSemesters(b.roles[0].term, a.roles[0].term) ||
        a.name.localeCompare(b.name, "ko"),
    );
}
