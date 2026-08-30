import { env } from "$env/dynamic/private";
import { capabilitiesFor } from "$lib/server/core/capabilities";
import { currentTerm } from "$lib/server/core/semester";
import { getTable } from "$lib/server/data/tables";
import type { MemberContext } from "./zone";

/**
 * S9 부트스트랩 권위: ADMINS_EMAILS에 오른 이메일은 운영 members 행이
 * 없어도(빈 새 DB) 관리자다 — 없으면 첫 재가입 신청을 승인할 사람이 없는
 * 순환이 생긴다. 회원 행이 생긴 뒤에는 member.isAdmin과 OR로 합쳐진다.
 */
function isAdminEmail(normalizedEmail: string): boolean {
  return (env.ADMINS_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalizedEmail);
}

/**
 * Session-hook member matching (IMPLEMENTATION-SPEC BE-21):
 * email → private-info row → members row, all through the cached table layer.
 * Explicitly exempt from audit logging (API-SPEC §1-5) — it runs on every request.
 *
 * S9: members/private-info는 학기별 등록제의 "새 DB"다 — 노션 이주분은
 * legacy-members/legacy-private-info(기록 전용)에 있고 로그인 매칭에 쓰지 않는다.
 * 이번 학기 등록 여부(registrations)에서 capability 집합이 파생된다.
 */

export async function resolveMember(email: string): Promise<MemberContext | null> {
  const normalized = email.trim().toLowerCase();

  const infos = await getTable("private-info");
  const info = infos.find((i) => i.email.toLowerCase() === normalized);
  if (!info) {
    // 관리자 부트스트랩: 회원 행 없이 관리자 존 접근 + 가입 신청이 가능해야
    // 한다. 회원 존 capability는 없음(등록 전) — 승인 후 정식 행으로 대체된다.
    if (isAdminEmail(normalized)) {
      return {
        memberId: `env-admin:${normalized}`,
        privateInfoId: null,
        name: "관리자",
        status: "regular",
        isAdmin: true,
        isAlumni: false,
        registered: false,
        capabilities: [],
      };
    }
    return null;
  }
  const member = (await getTable("members")).find((m) => m.id === info.memberId);
  if (!member) return null;

  const term = currentTerm();
  const registered = (await getTable("registrations")).some(
    (r) => r.memberId === member.id && r.term === term,
  );

  return {
    memberId: member.id,
    privateInfoId: info.id,
    name: member.name,
    status: member.status,
    // env 명단은 부트스트랩 권위 — 회원 행의 isAdmin과 OR (D4 보완, S9)
    isAdmin: member.isAdmin || isAdminEmail(normalized),
    isAlumni: member.isAlumni,
    registered,
    capabilities: capabilitiesFor({ isAlumni: member.isAlumni, registered }),
  };
}

export async function hasApplication(email: string): Promise<boolean> {
  // S3-only on purpose: all outstanding applications live in the new table
  // (the legacy store held no pending rows at migration time).
  const normalized = email.trim().toLowerCase();
  try {
    const apps = await getTable("applications");
    return apps.some((a) => a.email.toLowerCase() === normalized);
  } catch {
    return false;
  }
}
