import { AppError } from "$lib/server/core/errors";
import { newId } from "$lib/server/core/id";
import { TERM_PATTERN } from "$lib/server/core/semester";
import { stripInvisibles } from "$lib/server/core/strings";
import { nowKstIso } from "$lib/server/core/time";
import { getTable, mutate } from "$lib/server/data/tables";
import { setRoles } from "./members-admin";

/**
 * /admin/executives — 학기별 임원진 배정 (관리자 전용).
 *
 * 배정의 저장처는 기존 그대로 member.roles[{term,title}] — 이 서비스는
 * 학기 단위로 보기 좋게 자르고, 배정/해제를 setRoles(감사 기록 포함 —
 * §1-5 ?/setRoles 대상)로 위임한다. 직위 옵션은 기본(코드) + 커스텀
 * (role-titles 테이블) 합집합이다.
 */

/** 기본 직위 — 역사적으로 쓰인 것들. 옵션 추가는 role-titles 테이블로. */
export const DEFAULT_ROLE_TITLES = ["회장", "부회장", "기획부장", "자료관리부장"] as const;

export async function listRoleTitles(): Promise<{ title: string; isCustom: boolean }[]> {
  const custom = await getTable("role-titles");
  const defaults = DEFAULT_ROLE_TITLES.map((title) => ({ title, isCustom: false }));
  const extras = custom
    .filter((r) => !(DEFAULT_ROLE_TITLES as readonly string[]).includes(r.title))
    .map((r) => ({ title: r.title, isCustom: true }));
  return [...defaults, ...extras];
}

export async function addRoleTitle(rawTitle: string): Promise<void> {
  const title = stripInvisibles(rawTitle).trim();
  if (!title || title.length > 20) {
    throw new AppError("VALIDATION_FAILED", {
      userMessage: "직위 이름을 1~20자로 입력해 주세요.",
    });
  }
  if ((DEFAULT_ROLE_TITLES as readonly string[]).includes(title)) {
    throw new AppError("CONFLICT", { userMessage: "이미 있는 기본 직위입니다." });
  }
  await mutate("role-titles", (rows) => {
    if (rows.some((r) => r.title === title)) {
      throw new AppError("CONFLICT", { userMessage: "이미 있는 직위입니다." });
    }
    rows.push({ id: newId(), title, updatedAt: nowKstIso() });
    return rows;
  });
}

/** 커스텀 직위 옵션 제거 — 과거 배정 기록(member.roles)은 건드리지 않는다. */
export async function removeRoleTitle(title: string): Promise<void> {
  if ((DEFAULT_ROLE_TITLES as readonly string[]).includes(title)) {
    throw new AppError("VALIDATION_FAILED", {
      userMessage: "기본 직위는 제거할 수 없습니다.",
    });
  }
  await mutate("role-titles", (rows) => {
    if (!rows.some((r) => r.title === title)) throw new AppError("NOT_FOUND");
    return rows.filter((r) => r.title !== title);
  });
}

function requireTerm(term: string): string {
  if (!TERM_PATTERN.test(term)) {
    throw new AppError("VALIDATION_FAILED", {
      userMessage: "학기는 YY-1 또는 YY-2 형식이어야 합니다 (임원 축은 정규 학기 단위).",
    });
  }
  return term;
}

export interface TermAssignment {
  memberId: string;
  memberName: string;
  department: string;
  title: string;
}

/** 해당 학기의 배정 현황 + 배정 후보(운영 회원 전원). */
export async function getTermBoard(rawTerm: string): Promise<{
  term: string;
  assignments: TermAssignment[];
  candidates: { id: string; name: string; department: string; registered: boolean }[];
}> {
  const term = requireTerm(rawTerm);
  const [members, registrations] = await Promise.all([
    getTable("members"),
    getTable("registrations"),
  ]);
  const registered = new Set(
    registrations.filter((r) => r.term === term).map((r) => r.memberId),
  );
  const assignments = members
    .flatMap((m) =>
      m.roles
        .filter((r) => r.term === term)
        .map((r) => ({
          memberId: m.id,
          memberName: m.name,
          department: m.department,
          title: r.title,
        })),
    )
    .sort((a, b) => a.title.localeCompare(b.title, "ko"));
  const candidates = members
    .filter((m) => m.status !== "withdrawn")
    .map((m) => ({
      id: m.id,
      name: m.name,
      department: m.department,
      registered: registered.has(m.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return { term, assignments, candidates };
}

/** 배정 — 같은 (학기, 직위, 회원) 중복은 거부. 감사 기록은 setRoles가 남긴다. */
export async function assignRole(input: {
  memberId: string;
  term: string;
  title: string;
  actorId: string;
}): Promise<void> {
  const term = requireTerm(input.term);
  const title = stripInvisibles(input.title).trim();
  const options = (await listRoleTitles()).map((o) => o.title);
  if (!options.includes(title)) {
    throw new AppError("VALIDATION_FAILED", { userMessage: "목록에 없는 직위입니다." });
  }
  const member = (await getTable("members")).find((m) => m.id === input.memberId);
  if (!member) throw new AppError("NOT_FOUND", { userMessage: "회원을 찾을 수 없습니다." });
  if (member.roles.some((r) => r.term === term && r.title === title)) {
    throw new AppError("CONFLICT", { userMessage: "이미 같은 학기에 같은 직위가 배정돼 있습니다." });
  }
  await setRoles(member.id, [...member.roles, { term, title }], input.actorId);
}

export async function unassignRole(input: {
  memberId: string;
  term: string;
  title: string;
  actorId: string;
}): Promise<void> {
  const term = requireTerm(input.term);
  const member = (await getTable("members")).find((m) => m.id === input.memberId);
  if (!member) throw new AppError("NOT_FOUND");
  const next = member.roles.filter((r) => !(r.term === term && r.title === input.title));
  if (next.length === member.roles.length) {
    throw new AppError("NOT_FOUND", { userMessage: "해당 배정이 없습니다." });
  }
  await setRoles(member.id, next, input.actorId);
}
