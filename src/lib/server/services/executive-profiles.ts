import {
  cohortFromStudentId,
  HIDDEN_PROFILE,
  HIDDEN_WITHDRAWN_PROFILE,
  PROFILE_FIELDS,
  PUBLIC_EXECUTIVE_TITLES,
  WITHDRAWN_FIELDS,
  WITHDRAWN_NAME,
  type ExecutiveProfileSettings,
  type PublicExecutiveProfile,
  type WithdrawnFieldKey,
  type WithdrawnProfile,
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
 * 공개 해석기 — 회장단 명단을 만드는 로드가 명부 행마다 부른다.
 *
 * - `name`: 자리에 적을 이름. 탈퇴 회원은 탈퇴하면서 이름을 남기기로 했을
 *   때만 그 이름이고, 아니면 WITHDRAWN_NAME이다 — 자리 자체는 언제나 남는다.
 *   고른 기록이 없는 탈퇴(이 기능 전)는 종전처럼 이름을 적는다.
 * - `profile`: 운영 회원은 공개 설정대로(연동은 지금 읽는다), 탈퇴 회원은
 *   탈퇴 때 고른 스냅숏대로. 공개할 값이 하나도 없으면 null.
 */
export async function publicExecutiveResolver(): Promise<{
  name: (member: Member) => string;
  profile: (member: Member) => PublicExecutiveProfile | null;
}> {
  const s = await loadSources();
  const linked = linkedResolver(s);
  const withdrawnView = (member: Member) =>
    member.status === "withdrawn"
      ? (profileRowFor(member, s.profiles)?.afterWithdrawal ?? null)
      : undefined;
  const custom = (setting: { source: string; value?: string }) =>
    setting.source === "custom" ? (setting.value ?? null) : null;
  const orNull = (profile: PublicExecutiveProfile) =>
    Object.values(profile).some((v) => v !== null) ? profile : null;

  return {
    name(member) {
      const kept = withdrawnView(member);
      if (!kept) return member.name; // 운영 회원, 또는 고른 적 없는 탈퇴
      return custom(kept.name) ?? WITHDRAWN_NAME;
    },
    profile(member) {
      const kept = withdrawnView(member);
      if (kept === null) return null;
      if (kept) {
        return orNull({
          department: custom(kept.department),
          cohort: custom(kept.cohort),
          publicEmail: custom(kept.email),
          bio: custom(kept.bio),
        });
      }
      const row = profileRowFor(member, s.profiles);
      if (!row) return null;
      const source = linked(member);
      const pick = (field: "department" | "cohort" | "email") => {
        const setting = row[field];
        if (setting.source === "custom") return setting.value;
        return setting.source === "member" ? source[field] : null;
      };
      return orNull({
        department: pick("department"),
        cohort: pick("cohort"),
        publicEmail: pick("email"),
        bio: custom(row.bio),
      });
    },
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
  /** 탈퇴 상태 — 공개되는 것은 settings가 아니라 afterWithdrawal이다. */
  withdrawn: boolean;
  settings: ExecutiveProfileSettings;
  afterWithdrawal: WithdrawnProfile;
  linked: LinkedValues;
}

/** 편집기 한 화면 — 자격 확인, 현재 설정, 연동 미리보기. */
export async function getProfileEditor(id: string): Promise<ProfileEditor> {
  const s = await loadSources();
  const person = requireEligible(id, s);
  const row = profileRowFor(person.member, s.profiles);
  return {
    memberId: person.member.id,
    name: person.member.name,
    roles: executiveRoles(person),
    legacyOnly: person.legacyOnly,
    withdrawn: person.member.status === "withdrawn",
    settings: settingsOf(row),
    afterWithdrawal: structuredClone(
      row?.afterWithdrawal ?? HIDDEN_WITHDRAWN_PROFILE,
    ) as WithdrawnProfile,
    linked: linkedResolver(s)(person.member),
  };
}

/**
 * 사람당 한 행으로 고쳐 쓴다. legacy id로 적힌 행이 있으면 그 행을 운영 id로
 * 옮겨 적는다. `change`는 지금 행(없으면 undefined)을 받아 바꿀 부분을 준다.
 */
async function upsertProfile(
  member: Member,
  actorId: string,
  change: (
    existing: ExecutiveProfile | undefined,
  ) => Partial<
    Pick<
      ExecutiveProfile,
      "department" | "cohort" | "email" | "bio" | "afterWithdrawal"
    >
  >,
): Promise<void> {
  const ids = new Set(
    [member.id, member.legacyMemberId].filter((v): v is string => !!v),
  );
  await mutate("executive-profiles", (rows) => {
    const existing = profileRowFor(member, rows);
    const next: ExecutiveProfile = {
      id: existing?.id ?? newId(),
      memberId: member.id,
      ...structuredClone(settingsOf(existing)),
      afterWithdrawal: structuredClone(existing?.afterWithdrawal ?? null),
      ...structuredClone(change(existing)),
      updatedAt: nowKstIso(),
      updatedBy: actorId,
    };
    return [...rows.filter((r) => !ids.has(r.memberId)), next];
  });
}

/**
 * 공개 설정 저장. 감사 기록에는 필드별 출처만 남기고 값은 남기지 않는다
 * (audit.ts). 탈퇴한 뒤에는 본인이 고칠 수 없다 — 자리에 무엇이 남는지는
 * 탈퇴하면서 정했고, 그 뒤의 변경은 관리자가 한다(saveWithdrawnProfile).
 */
export async function saveExecutiveProfile(
  id: string,
  settings: ExecutiveProfileSettings,
  actor: { actorId: string; byAdmin: boolean },
): Promise<void> {
  const { member } = requireEligible(id, await loadSources());
  if (member.status === "withdrawn" && !actor.byAdmin) {
    throw new AppError("CONFLICT", {
      userMessage:
        "탈퇴 처리 중에는 공개 프로필을 고칠 수 없습니다. 변경이 필요하면 관리자에게 요청해 주세요.",
    });
  }
  await upsertProfile(member, actor.actorId, () => settings);
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

export interface WithdrawalChoice {
  field: WithdrawnFieldKey;
  /** 남기면 적힐 값 — 학번은 입학년도 두 자리. */
  value: string;
  /** 기본값: 지금 공개 중인가. 이름은 지금 언제나 공개 중이다. */
  checked: boolean;
}

/**
 * 탈퇴 폼이 보여 줄 항목 — 값이 있는 것만. 값은 지금 공개 중인 모습 그대로
 * (직접 입력이면 그 값, 아니면 회원 기록의 값)이고, 체크 기본값은 지금 공개
 * 중인지다.
 */
function withdrawalChoices(person: Person, s: Sources): WithdrawalChoice[] {
  const settings = settingsOf(profileRowFor(person.member, s.profiles));
  const linked = linkedResolver(s)(person.member);
  const choices: WithdrawalChoice[] = [
    { field: "name", value: person.member.name, checked: true },
  ];
  for (const field of ["department", "cohort", "email"] as const) {
    const setting = settings[field];
    const value = setting.source === "custom" ? setting.value : linked[field];
    if (value) {
      choices.push({ field, value, checked: setting.source !== "hidden" });
    }
  }
  if (settings.bio.source === "custom") {
    choices.push({ field: "bio", value: settings.bio.value, checked: true });
  }
  return choices;
}

/** 탈퇴 폼용. 회장·부회장 이력이 없으면 null — 폼에 이 단계가 없다. */
export async function getWithdrawalChoices(
  id: string,
): Promise<WithdrawalChoice[] | null> {
  const s = await loadSources();
  const person = resolvePerson(id, s);
  if (!person || executiveRoles(person).length === 0) return null;
  return withdrawalChoices(person, s);
}

/**
 * 탈퇴 신청과 함께 — 체크한 항목을 **지금 값으로** 적어 둔다. 값은 폼이 아니라
 * 서버가 다시 읽는다. 회장·부회장 이력이 없으면 아무것도 하지 않는다. 탈퇴
 * 상태가 되기 전에는 공개에 쓰이지 않으므로, 신청이 실패해도 해가 없다.
 */
export async function recordWithdrawalChoice(
  id: string,
  keep: readonly WithdrawnFieldKey[],
): Promise<void> {
  const s = await loadSources();
  const person = resolvePerson(id, s);
  if (!person || executiveRoles(person).length === 0) return;
  const kept = withdrawalChoices(person, s).filter((c) =>
    keep.includes(c.field),
  );
  const afterWithdrawal = structuredClone(
    HIDDEN_WITHDRAWN_PROFILE,
  ) as WithdrawnProfile;
  for (const c of kept) {
    afterWithdrawal[c.field] = { source: "custom", value: c.value };
  }
  await upsertProfile(person.member, person.member.id, () => ({
    afterWithdrawal,
  }));
  await audit({
    actorMemberId: person.member.id,
    action: "executive-profile.update",
    targetTable: "executive-profiles",
    targetId: person.member.id,
    detail: { withdrawal: true, kept: kept.map((c) => c.field) },
  });
}

/** 관리자: 탈퇴한 회장단의 자리에 무엇을 적을지 고친다. */
export async function saveWithdrawnProfile(
  id: string,
  profile: WithdrawnProfile,
  actorId: string,
): Promise<void> {
  const { member } = requireEligible(id, await loadSources());
  if (member.status !== "withdrawn") {
    throw new AppError("CONFLICT", {
      userMessage: "탈퇴하지 않은 회원입니다 — 공개 설정을 고쳐 주세요.",
    });
  }
  await upsertProfile(member, actorId, () => ({ afterWithdrawal: profile }));
  await audit({
    actorMemberId: actorId,
    action: "executive-profile.update",
    targetTable: "executive-profiles",
    targetId: member.id,
    detail: {
      byAdmin: true,
      withdrawn: true,
      sources: Object.fromEntries(
        WITHDRAWN_FIELDS.map((f) => [f, profile[f].source]),
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
  withdrawn: boolean;
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
      withdrawn: p.member.status === "withdrawn",
    }))
    .filter((c) => c.roles.length > 0)
    .sort(
      (a, b) =>
        compareSemesters(b.roles[0].term, a.roles[0].term) ||
        a.name.localeCompare(b.name, "ko"),
    );
}
