import { AppError, definedOnly } from "$lib/server/core/errors";
import { stripInvisibles } from "$lib/server/core/strings";
import { bootstrapAdminEmailHashes } from "$lib/server/core/admin-bootstrap";
import { newId } from "$lib/server/core/id";
import { currentTerm } from "$lib/server/core/semester";
import { nowKstIso } from "$lib/server/core/time";
import { getTable, mutate } from "$lib/server/data/tables";
import { callFlow, type FlowResult } from "$lib/server/data/flows";
import type { Application } from "$lib/server/data/schemas";

/**
 * Membership lifecycle (API-SPEC §4-1~4-3, §7-2).
 * The applications table holds only unprocessed rows: approval CONVERTS the
 * row into private-info + members and removes it; rejection and
 * self-withdrawal remove it outright.
 */

const norm = (email: string) => email.trim().toLowerCase();

export async function getApplicationForEmail(
  email: string,
): Promise<Application | null> {
  const apps = await getTable("applications");
  return apps.find((a) => norm(a.email) === norm(email)) ?? null;
}

export async function submitApplication(input: {
  email: string;
  name: string;
  department: string;
  phone: string;
  studentId: string;
  background: string;
}): Promise<Application> {
  const row: Application = {
    id: newId(),
    // 구글 프로필 이름 등으로 비가시 문자가 유입된다 (실측) — 입구에서 제거
    name: stripInvisibles(input.name),
    department: stripInvisibles(input.department),
    phone: stripInvisibles(input.phone),
    studentId: stripInvisibles(input.studentId),
    background: stripInvisibles(input.background),
    email: norm(input.email),
    createdAt: nowKstIso(),
  };
  await mutate("applications", (rows) => {
    if (rows.some((a) => norm(a.email) === row.email)) {
      throw new AppError("CONFLICT");
    }
    return [...rows, row];
  });
  return row;
}

export async function updateOwnApplication(
  email: string,
  patch: Partial<
    Pick<
      Application,
      "name" | "department" | "phone" | "studentId" | "background"
    >
  >,
): Promise<void> {
  await mutate("applications", (rows) => {
    const idx = rows.findIndex((a) => norm(a.email) === norm(email));
    if (idx === -1) throw new AppError("NOT_FOUND");
    const clean = Object.fromEntries(
      Object.entries(definedOnly(patch)).map(([k, v]) => [
        k,
        typeof v === "string" ? stripInvisibles(v) : v,
      ]),
    );
    rows[idx] = { ...rows[idx], ...clean };
    return rows;
  });
}

/** MEM-03: the applicant's own withdrawal button on /wait — the row (and its PII) goes away now. */
export async function withdrawOwnApplication(email: string): Promise<void> {
  await mutate("applications", (rows) => {
    if (!rows.some((a) => norm(a.email) === norm(email)))
      throw new AppError("NOT_FOUND");
    return rows.filter((a) => norm(a.email) !== norm(email));
  });
}

/**
 * §7-2 ?/approve — the conversion (S9: 학기별 등록제).
 * 신규 지원자: private-info + members 생성(legacy 아카이브에 같은 이메일이
 * 있으면 가입일·임원 이력·프로젝트를 상속). 재가입 회원(이메일이 이미 새 DB에
 * 존재): 기존 행 유지, 연락 정보만 신청 내용으로 갱신. 공통: 승인 학기의
 * registrations 행 생성 → 신청 행 제거.
 *
 * 전부 한 트랜잭션(flow_approve_application)이다. 예전에는 단계마다 따로 써서
 * 승인이 낡은 캐시로 출발하면, 그 사이 반려된 신청자에게 회원 행을 만든 뒤
 * 마지막 단계에서야 CONFLICT로 멈췄다 — 반려된 사람이 회원으로 남았다.
 *
 * 부트스트랩 관리자 스탬프: env 명단은 승인 전환 시 회원 레코드에 새겨지고
 * 그 후로는 레코드가 유일 진실이다 (해제는 회원 관리에서 — 하향은 안 한다).
 *
 * DEFER(signup-target-term): 대상 학기를 currentTerm()으로 고정한다. 관리자가
 * 가입 대상 학기를 명시 선택하는 기능은 보류 (FUNCTIONAL-SPEC "보류" 절).
 */
export async function approveApplication(
  id: string,
): Promise<{ name: string; email: string }> {
  const now = nowKstIso();
  const { name, email } = await callFlow<
    FlowResult & { name: string; email: string }
  >("flow_approve_application", {
    id,
    now,
    today: now.slice(0, 10),
    term: currentTerm(),
    adminEmailHashes: bootstrapAdminEmailHashes(),
    memberId: newId(),
    privateInfoId: newId(),
    registrationId: newId(),
  });
  return { name, email };
}

export async function rejectApplication(
  id: string,
): Promise<{ email: string; name: string }> {
  let removed: Application | undefined;
  await mutate("applications", (rows) => {
    removed = rows.find((a) => a.id === id);
    if (!removed) throw new AppError("NOT_FOUND");
    return rows.filter((a) => a.id !== id);
  });
  return { email: removed!.email, name: removed!.name };
}
