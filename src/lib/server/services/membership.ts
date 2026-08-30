import { AppError, definedOnly } from "$lib/server/core/errors";
import { newId } from "$lib/server/core/id";
import { currentTerm } from "$lib/server/core/semester";
import { nowKstIso } from "$lib/server/core/time";
import { getTable, mutate } from "$lib/server/data/tables";
import { ensureCreated } from "$lib/server/data/idempotency";
import type { Application } from "$lib/server/data/schemas";

/**
 * Membership lifecycle (API-SPEC §4-1~4-3, §7-2).
 * The applications table holds only unprocessed rows: approval CONVERTS the
 * row into private-info + members and removes it; rejection and
 * self-withdrawal remove it outright.
 */

const norm = (email: string) => email.trim().toLowerCase();

export async function getApplicationForEmail(email: string): Promise<Application | null> {
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
    ...input,
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
  patch: Partial<Pick<Application, "name" | "department" | "phone" | "studentId" | "background">>,
): Promise<void> {
  await mutate("applications", (rows) => {
    const idx = rows.findIndex((a) => norm(a.email) === norm(email));
    if (idx === -1) throw new AppError("NOT_FOUND");
    rows[idx] = { ...rows[idx], ...definedOnly(patch) };
    return rows;
  });
}

/** MEM-03: the applicant's own withdrawal button on /wait — the row (and its PII) goes away now. */
export async function withdrawOwnApplication(email: string): Promise<void> {
  await mutate("applications", (rows) => {
    if (!rows.some((a) => norm(a.email) === norm(email))) throw new AppError("NOT_FOUND");
    return rows.filter((a) => norm(a.email) !== norm(email));
  });
}

/**
 * §7-2 ?/approve — the conversion (S9: 학기별 등록제).
 * 신규 지원자: private-info + members 생성. 재가입 회원(이메일이 이미 새 DB에
 * 존재): 기존 행 유지, 연락 정보만 신청 내용으로 갱신.
 * 공통: 승인 학기의 registrations 행 생성 → 신청 행 제거 (실패 시 재실행이
 * ensureCreated의 sourceRequestId 중복 제거로 누락 단계만 채운다).
 */
export async function approveApplication(
  id: string,
): Promise<{ name: string; email: string }> {
  const app = (await getTable("applications")).find((a) => a.id === id);
  if (!app) {
    // Row already gone: either fully converted (registration exists) or never existed.
    const converted = (await getTable("registrations")).some(
      (r) => r.sourceRequestId === id,
    );
    throw new AppError(converted ? "CONFLICT" : "NOT_FOUND");
  }

  const email = norm(app.email);
  const existingInfo = (await getTable("private-info")).find(
    (i) => norm(i.email) === email,
  );

  let memberId: string;
  if (existingInfo) {
    // 재가입 — 신청서의 최신 연락 정보로 갱신
    memberId = existingInfo.memberId;
    await mutate("private-info", (rows) => {
      const idx = rows.findIndex((i) => i.id === existingInfo.id);
      if (idx === -1) throw new AppError("NOT_FOUND");
      rows[idx] = {
        ...rows[idx],
        phone: app.phone,
        studentId: app.studentId || rows[idx].studentId,
        background: app.background,
      };
      return rows;
    });
  } else {
    // 신규 — legacy 아카이브에 같은 이메일 이력이 있으면 기록 연결만 남긴다
    const legacyInfo = (await getTable("legacy-private-info")).find(
      (i) => norm(i.email) === email,
    );
    const member = await ensureCreated("members", id, () => ({
      id: newId(),
      name: app.name,
      department: app.department,
      joinedAt: nowKstIso().slice(0, 10),
      status: "associate" as const,
      statusChangedAt: nowKstIso(),
      withdrawal: null,
      isAlumni: false,
      alumniRevoked: false,
      roles: [],
      isAdmin: false,
      publicContact: null,
      project: null,
      legacyMemberId: legacyInfo?.memberId ?? null,
      sourceRequestId: id,
    }));
    memberId = member.id;

    await ensureCreated("private-info", id, () => ({
      id: newId(),
      memberId,
      email: app.email,
      phone: app.phone,
      studentId: app.studentId,
      background: app.background,
      mailPrefs: { announcements: true },
      sourceRequestId: id,
    }));
  }

  // S9: 이번 학기 등록 — 자격 행사 권한의 원천
  await ensureCreated("registrations", id, () => ({
    id: newId(),
    memberId,
    term: currentTerm(),
    registeredAt: nowKstIso(),
    sourceRequestId: id,
  }));

  // CAS: the row must still exist when THIS call removes it — a concurrent
  // duplicate approval loses here instead of double-sending the welcome mail.
  await mutate("applications", (rows) => {
    if (!rows.some((a) => a.id === id)) throw new AppError("CONFLICT");
    return rows.filter((a) => a.id !== id);
  });
  return { name: app.name, email: app.email };
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
